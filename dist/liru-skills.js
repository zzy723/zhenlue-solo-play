(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype;
    const init=P.initExtra,lost=P.cardsLost,flush=P.flushSkillEvents;
    const mark=P.markCardUse,after=P.afterCardUse,finish=P.finishPhaseSkills;
    const active=P.activeSkills,prepare=P.prepareActive,ai=P.aiPlay,states=P.dynastyStates;
    const death=P.death,take=P.takePhysical,playStart=P.playStartSkills;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'liru');
    const black=c=>!!c&&['S','C'].includes(c.suit);
    const label=t=>`${t.name} · ${t.id+1}号位 · 手牌${t.hand.length}`;
    const cardLabel=c=>`${C.suitMark[c.suit]}${C.rankMark(c.rank)}【${c.name}】`;
    P.initExtra=function(p){init.call(this,p);Object.assign(p,{liruZhen:null,liruZhenUsed:false,liruJueceTurn:-1,liruFenchengUsed:false});};
    P.playStartSkills=async function(p){p.liruZhenUsed=false;return playStart.call(this,p);};
    P.liruRemoveZhen=function(t){const z=t.liruZhen;if(!z)return null;t.liruZhen=null;this.putDiscard(z.card);this.change();return z;};
    P.liruPoison=async function(t,z){
      if(!t?.alive||t.liruZhen!==z||this.over)return;
      this.liruRemoveZhen(t);await this.loseHp(t,1,'鸩毒');
    };
    P.cardsLost=function(t,before,reason){
      lost.call(this,t,before,reason);
      if(this._dynBatch||!t.alive||this.over)return;
      const removed=before.filter(c=>!t.hand.includes(c));if(!removed.length)return;
      const queue=e=>(this._liruEvents||(this._liruEvents=[])).push({...e,target:t.id,generation:t.generation,turn:this.totalTurns});
      if(reason==='discard'&&t.liruZhen&&removed.some(black))queue({type:'poison',zhen:t.liruZhen});
      const p=this.get(this.turn);
      // Capture the empty-hand transition, even if another skill subsequently gives cards back.
      if(!t.hand.length&&t.id!==p?.id&&this.totalTurns>0&&owner(this,p)&&p.liruJueceTurn!==this.totalTurns)
        queue({type:'juece',owner:p.id,ownerGeneration:p.generation});
    };
    P.liruJuece=async function(p,t,e){
      const eligible=()=>owner(this,p)&&p.generation===e.ownerGeneration&&t.alive&&t.generation===e.generation&&this.turn===p.id&&this.totalTurns===e.turn&&p.liruJueceTurn!==e.turn&&!this.over;
      if(!eligible())return;
      const use=await this.option(p,`绝策：${label(t)}失去最后一张手牌，摸两张牌？`,[{key:'yes',label:'发动绝策，摸两张牌'},{key:'no',label:'不发动'}],'yes','仅你的回合内限一次；摸牌后可另弃一张手牌，造成1点火焰伤害。');
      if(use!=='yes'||!eligible())return;
      p.liruJueceTurn=e.turn;this.draw(p,2);this.log(`${p.name}发动【绝策】，摸两张牌。`,'draw');
      await this.flushSkillEvents();
      if(!owner(this,p)||!t.alive||t.generation!==e.generation||this.over||!p.hand.length)return;
      const cards=[...p.hand],cheap=[...cards].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const id=await this.option(p,`绝策：弃一张手牌，对${t.name}造成1点火焰伤害？`,[...cards.map(c=>({key:c.id,label:'弃置'+cardLabel(c),card:c})),{key:'pass',label:'仅摸牌，不造成伤害'}],this.hostility(p,t)>0?cheap.id:'pass');
      if(id==='pass'||!owner(this,p)||!t.alive||t.generation!==e.generation||this.over||!p.hand.some(c=>c.id===id))return;
      this.discardOwned(p,[id]);await this.flushSkillEvents();
      if(p.alive&&p.generation===e.ownerGeneration&&t.alive&&t.generation===e.generation&&!this.over)await this.damage(p,t,1,'fire',{skill:'juece'});
    };
    P.flushSkillEvents=async function(){
      if(this._flushingLiru){
        await flush.call(this);
        // A black discard paid during 绝策 can itself trigger poison. Settle that
        // mandatory HP loss before continuing the pending fire damage or choices.
        if(this._liruPoisonDrain)return;
        this._liruPoisonDrain=true;
        try{
          let i;
          while(!this.over&&(i=(this._liruEvents||[]).findIndex(e=>e.type==='poison'))>=0){
            const e=this._liruEvents.splice(i,1)[0],t=this.get(e.target);
            if(t?.alive&&t.generation===e.generation&&e.turn===this.totalTurns)await this.liruPoison(t,e.zhen);
          }
        }finally{this._liruPoisonDrain=false;}
        return;
      }
      this._flushingLiru=true;
      try{
        await flush.call(this);
        while(this._liruEvents?.length&&!this.over){
          const e=this._liruEvents.shift(),t=this.get(e.target);
          if(!t?.alive||t.generation!==e.generation||e.turn!==this.totalTurns)continue;
          if(e.type==='poison')await this.liruPoison(t,e.zhen);
          else await this.liruJuece(this.get(e.owner),t,e);
          await flush.call(this);
        }
        if(this.over)this._liruEvents=[];
      }finally{this._flushingLiru=false;}
    };
    P.markCardUse=async function(p,c,ts){
      const z=black(c)?p.liruZhen:null,generation=p.generation;
      const valid=await mark.call(this,p,c,ts);
      // A response played as a card (打出) never calls markCardUse; recasting also bypasses it.
      if(z&&p.liruZhen===z&&p.generation===generation)c.liruUsedZhen=z;
      return valid;
    };
    P.afterCardUse=async function(p,c,ts){
      await after.call(this,p,c,ts);
      if(c.liruUsedZhen&&p.generation===c.sourceGeneration)await this.liruPoison(p,c.liruUsedZhen);
    };
    P.finishPhaseSkills=async function(t){
      await this.flushSkillEvents();
      if(t.alive&&t.liruZhen&&!this.over){
        const z=this.liruRemoveZhen(t),p=this.get(z.owner);
        this.log(`${t.name}结束阶段弃去“鸩”。`,'system');
        if(p?.alive&&p.generation===z.ownerGeneration){this.draw(p,2);this.log(`${p.name}【鸩毒】摸两张牌。`,'draw');}
        await this.flushSkillEvents();
      }
      if(t.alive&&!this.over)return finish.call(this,t);
    };
    // Resolve synchronous card-loss events before the next response or damage is offered.
    for(const name of ['response','trickAllowed','damage','dying','discardPhase']){
      const previous=P[name];
      P[name]=async function(...args){await this.flushSkillEvents();return previous.apply(this,args);};
    }
    P.death=async function(p,source){this.liruRemoveZhen(p);return death.call(this,p,source);};
    P.takePhysical=function(id){
      for(const p of this.players)if(p.liruZhen?.card.id===id){const c=p.liruZhen.card;p.liruZhen=null;return c;}
      return take.call(this,id);
    };
    P.liruZhendu=async function(p){
      if(!this.activeSkills(p).some(s=>s.key==='zhendu'&&s.ready))return false;
      const cards=p.hand.filter(black),cheap=[...cards].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const id=await this.option(p,'鸩毒：选择一张黑色手牌',[...cards.map(c=>({key:c.id,label:cardLabel(c),card:c})),{key:'cancel',label:'取消'}],cheap.id);
      if(id==='cancel'||!p.hand.some(c=>c.id===id&&black(c)))return false;
      const targets=this.alive().filter(t=>t.id!==p.id&&!t.liruZhen);
      if(!targets.length)return false;
      const best=[...targets].sort((a,b)=>this.hostility(p,b)-this.hostility(p,a)||a.hp-b.hp)[0];
      const targetId=await this.option(p,'鸩毒：选择一名没有“鸩”的其他角色',[...targets.map(t=>({key:String(t.id),label:label(t)})),{key:'cancel',label:'取消'}],String(best.id));
      const t=targets.find(t=>String(t.id)===targetId);
      if(!t?.alive||t.liruZhen||!this.activeSkills(p).some(s=>s.key==='zhendu'&&s.ready)||!p.hand.some(c=>c.id===id&&black(c)))return false;
      p.liruZhenUsed=true;
      const card=this.withLoss('move',()=>this.removeOwned(p,id).card);
      t.liruZhen={card,owner:p.id,ownerGeneration:p.generation};this.noteCardRevealed?.(t,card);
      this.log(`${p.name}发动【鸩毒】，将${cardLabel(card)}置于${t.name}武将牌上作为“鸩”。`,'reveal');
      this.draw(p,1);await this.flushSkillEvents();this.change();return true;
    };
    P.liruFencheng=async function(p){
      if(!this.activeSkills(p).some(s=>s.key==='liru_fencheng'&&s.ready))return false;
      const others=this.alive().filter(t=>t.id!==p.id),best=[...others].sort((a,b)=>this.hostility(p,b)-this.hostility(p,a)||this.owned(a).length-this.owned(b).length)[0];
      const id=await this.option(p,'焚城：选择首名结算角色',[...others.map(t=>({key:String(t.id),label:label(t)})),{key:'cancel',label:'取消'}],String(best.id));
      const first=others.find(t=>String(t.id)===id);
      if(!first?.alive||!this.activeSkills(p).some(s=>s.key==='liru_fencheng'&&s.ready))return false;
      p.liruFenchengUsed=true;this.log(`${p.name}发动限定技【焚城】。`,'system');
      const order=[...others].sort((a,b)=>(a.id-first.id+this.players.length)%this.players.length-(b.id-first.id+this.players.length)%this.players.length);
      let min=1;
      for(const t of order){
        await this.flushSkillEvents();if(!p.alive||this.over||this.turnInterrupted)break;if(!t.alive)continue;
        const pool=this.owned(t),cheap=[...pool].sort((a,b)=>this.value(a,t)-this.value(b,t)).slice(0,min),canDiscard=pool.length>=min;
        const choice=await this.option(t,`焚城：弃至少${min}张牌或受到2点火焰伤害`,[...(canDiscard?[{key:'discard',label:`弃置至少${min}张手牌或装备牌`}]:[]),{key:'fire',label:'受到2点火焰伤害，下家门槛重置为1'}],canDiscard&&(t.hp<=2||cheap.reduce((n,c)=>n+this.value(c,t),0)<14)?'discard':'fire');
        if(choice==='discard'&&canDiscard){
          const ids=await this.selectCards(t,`焚城：弃置至少${min}张牌`,pool,min,pool.length,cheap.map(c=>c.id),'可以多弃；下家的最低弃牌数为本次实际弃牌数加一。');
          const valid=[...new Set(ids)].filter(id=>this.owned(t).some(c=>c.id===id));
          if(valid.length>=min){this.discardOwned(t,valid);min=valid.length+1;await this.flushSkillEvents();continue;}
        }
        min=1;await this.damage(p,t,2,'fire',{skill:'fencheng'});
      }
      await this.flushSkillEvents();this.change();return true;
    };
    P.activeSkills=function(p){
      const list=active.call(this,p);if(!owner(this,p))return list;
      const own=this.isPlayPhaseOwner(p)&&!this.over;
      list.push({key:'zhendu',name:'鸩毒',detail:'黑色手牌置为鸩，然后摸一张',ready:own&&!p.liruZhenUsed&&p.hand.some(black)&&this.alive().some(t=>t.id!==p.id&&!t.liruZhen),reason:'需要黑色手牌、无鸩的其他角色，且本阶段尚未发动'});
      list.push({key:'liru_fencheng',name:'焚城',detail:p.liruFenchengUsed?'限定技 · 已使用':'限定技 · 全场弃牌或受2点火焰伤害',ready:own&&!p.liruFenchengUsed&&this.alive().length>1,reason:'整局限一次，仅自己的出牌阶段可发动'});
      return list;
    };
    P.prepareActive=async function(p,a){
      if(a.skill==='zhendu'){await this.liruZhendu(p);return null;}
      if(a.skill==='liru_fencheng'){await this.liruFencheng(p);return null;}
      return prepare.call(this,p,a);
    };
    P.aiPlay=function(p,actions){
      const rest=ai.call(this,p,actions.filter(a=>!['zhendu','liru_fencheng'].includes(a.skill)));
      if(!owner(this,p))return rest;
      const poison=actions.find(a=>a.skill==='zhendu');
      if(poison&&this.alive().some(t=>t.id!==p.id&&!t.liruZhen&&this.hostility(p,t)>0))return poison;
      const fire=actions.find(a=>a.skill==='liru_fencheng');
      if(fire&&rest.type==='end'){
        const score=this.alive().filter(t=>t.id!==p.id).reduce((n,t)=>n+Math.sign(this.hostility(p,t))*(this.owned(t).length<2?3:1),0);
        if(score>0)return fire;
      }
      return rest;
    };
    P.dynastyStates=function(p,compact=false){
      const out=states.call(this,p,compact);
      if(p.liruZhen)out.push(`鸩 · ${cardLabel(p.liruZhen.card)} · ${this.get(p.liruZhen.owner)?.name||'李儒'}`);
      if(p.general==='liru'){out.push(`绝策 · 本回合${p.liruJueceTurn===this.totalTurns?'已发动':'未发动'}`);out.push(`焚城 · ${p.liruFenchengUsed?'已使用':'可用'}`);}
      return out;
    };
  }
  const api={install};root.ZhenLiruSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
