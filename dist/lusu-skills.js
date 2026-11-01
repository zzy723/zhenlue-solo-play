(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype;
    const init=P.initExtra,begin=P.beginTurnSkills,active=P.activeSkills,ai=P.aiPlay,prepare=P.prepareActive;
    const finish=P.finishPhaseSkills,turnEnd=P.turnEndSkills,handLimit=P.handLimit,discardPhase=P.discardPhase;
    const death=P.death,states=P.dynastyStates;
    const present=(g,p)=>p?.alive&&g.isGeneral(p,'lusu');
    const label=(g,p)=>`${p.name} · ${p.hp}血 · 手牌${p.hand.length}`;

    P.initExtra=function(p){init.call(this,p);Object.assign(p,{lusuZhumengUsed:false,lusuYinglueUsed:{hp:false,draw:false},lusuNextDraw:0,lusuNextDiscard:0,lusuOathUsed:false,lusuOathTargets:[],lusuOathActive:false});};
    P.beginTurnSkills=function(){begin.call(this);const p=this.get(this.turn);if(p){p.lusuZhumengUsed=false;p.lusuYinglueUsed={hp:false,draw:false};}};
    P.consumeDrawPhaseBonus=function(p){const count=p.lusuNextDraw||0;if(count){p.lusuNextDraw=0;this.log(`${p.name}【英略】的下个摸牌阶段摸牌数+${count}${p.skipDraw?'，但本阶段被跳过':''}。`,'system');this.change();}return count;};
    P.handLimit=function(p){const normal=handLimit.call(this,p);return Math.max(0,normal-(this.turn===p.id&&this.phase==='弃牌'?(p.lusuNextDiscard||0):0));};
    P.discardPhase=async function(p){try{return await discardPhase.call(this,p);}finally{if(p.lusuNextDiscard){p.lusuNextDiscard=0;this.change();}}};

    P.lusuPairPlan=function(p){
      const pool=this.alive().filter(t=>t.hand.length),allies=pool.filter(t=>t.id===p.id||this.hostility(p,t)<-.5);
      if(allies.length<2)return null;
      let best=null;
      for(const a of allies)for(const b of allies)if(a.id!==b.id){
        const score=(b.hand.length-a.hand.length)*2+(a.hp<a.maxHp?2:0)+(a.hand.length<=2?2:0);
        if(!best||score>best.score)best={a,b,score};
      }
      return best?.score>=2?best:null;
    };
    P.lusuYingluePlan=function(p){
      const used=p.lusuYinglueUsed||{},others=this.alive();
      if(!used.hp){
        const lethal=others.filter(t=>this.hostility(p,t)>0&&t.hp===1).sort((a,b)=>a.hand.length-b.hand.length)[0];
        if(lethal)return {mode:'hp',target:lethal,score:12};
      }
      if(!used.draw){
        const friends=others.filter(t=>t.id===p.id||this.hostility(p,t)<-.5);
        const target=[...friends].sort((a,b)=>a.hand.length-b.hand.length||a.hp-b.hp)[0];
        if(target)return {mode:'draw',target,score:5};
      }
      if(!used.hp){
        const friends=others.filter(t=>(t.id===p.id||this.hostility(p,t)<-.5)&&t.hp>=3);
        const target=[...friends].sort((a,b)=>a.hand.length-b.hand.length)[0];
        if(target)return {mode:'hp',target,score:2};
      }
      return null;
    };
    P.activeSkills=function(p){const list=active.call(this,p);if(present(this,p)){
      list.push({key:'zhumeng',name:'铸盟',detail:'两人暗选手牌并交换 · 本阶段一次',ready:!p.lusuZhumengUsed&&this.alive().filter(t=>t.hand.length).length>=2,reason:'本阶段已发动，或不足两名角色持有手牌'});
      const used=p.lusuYinglueUsed||{};list.push({key:'yinglue',name:'英略',detail:`失血蓄势 ${used.hp?'已用':'可用'} / 摸牌限手 ${used.draw?'已用':'可用'}`,ready:(!used.hp||!used.draw)&&this.alive().length>0,reason:'两项均已使用'});
    }return list;};
    P.aiPlay=function(p,actions){const own=actions.filter(a=>!['zhumeng','yinglue'].includes(a.skill));const result=ai.call(this,p,own);
      if(!present(this,p))return result;
      const plan=this.lusuYingluePlan(p),yinglue=actions.find(a=>a.skill==='yinglue'),zhumeng=actions.find(a=>a.skill==='zhumeng');
      if(yinglue&&plan?.score>=10)return yinglue;
      if(result.type==='end'){if(yinglue&&plan?.score>0)return yinglue;if(zhumeng&&this.lusuPairPlan(p))return zhumeng;}
      return result;
    };
    P.prepareActive=async function(p,a){
      if(!['zhumeng','yinglue'].includes(a.skill))return prepare.call(this,p,a);
      if(!this.activeSkills(p).some(s=>s.key===a.skill&&s.ready))return null;
      if(a.skill==='zhumeng')await this.lusuZhumeng(p);else await this.lusuYinglue(p);
      return null;
    };
    P.lusuZhumeng=async function(p){
      const candidates=this.alive().filter(t=>t.hand.length),plan=this.lusuPairPlan(p);
      if(candidates.length<2||p.lusuZhumengUsed)return;
      const aId=await this.option(p,'铸盟：选择第一名有手牌的角色',[...candidates.map(t=>({key:String(t.id),label:label(this,t)})),{key:'cancel',label:'取消'}],String(plan?.a.id??(candidates.some(t=>t.id===p.id)?p.id:candidates[0].id)),'两人分别暗选至少一张手牌，全部选定后才同时展示并交换。');
      if(aId==='cancel')return;
      const a=this.get(Number(aId)),remaining=candidates.filter(t=>t.id!==a.id&&t.alive&&t.hand.length);
      if(!remaining.length)return;
      const bId=await this.option(p,'铸盟：选择第二名有手牌的角色',[...remaining.map(t=>({key:String(t.id),label:label(this,t)})),{key:'cancel',label:'取消'}],String(plan?.a.id===a.id?plan.b.id:remaining[0].id));
      if(bId==='cancel')return;
      const b=this.get(Number(bId));if(!a.alive||!b.alive||!a.hand.length||!b.hand.length)return;
      const first=this.lusuShownSuggestion(p,a,b);
      const aIds=await this.selectCards(a,'铸盟：暗选将展示的手牌',a.hand,1,a.hand.length,first,'两人都选完后才公开；所选手牌将与另一人所选手牌交换。');
      const second=this.lusuShownSuggestion(p,b,a);
      const bIds=await this.selectCards(b,'铸盟：暗选将展示的手牌',b.hand,1,b.hand.length,second,'两人都选完后才公开；所选手牌将与另一人所选手牌交换。');
      if(!a.alive||!b.alive||!aIds.length||!bIds.length||!aIds.every(id=>a.hand.some(c=>c.id===id))||!bIds.every(id=>b.hand.some(c=>c.id===id)))return;
      p.lusuZhumengUsed=true;
      const aCards=aIds.map(id=>a.hand.find(c=>c.id===id)),bCards=bIds.map(id=>b.hand.find(c=>c.id===id));
      this.noteCardRevealed?.(a,aCards);this.noteCardRevealed?.(b,bCards);
      const shown=cards=>cards.map(c=>`${C.suitMark[c.suit]}${C.rankMark(c.rank)}【${c.name}】`).join('、');
      this.log(`${p.name}发动【铸盟】：${a.name}展示${shown(aCards)}；${b.name}展示${shown(bCards)}。`,'reveal');
      const movedA=this.withLoss('move',()=>this.moveBatch(a,()=>aIds.map(id=>this.removeOwned(a,id).card)));
      const movedB=this.withLoss('move',()=>this.moveBatch(b,()=>bIds.map(id=>this.removeOwned(b,id).card)));
      this.gain(a,movedB);this.gain(b,movedA);this.log(`${a.name}获得${movedB.length}张，${b.name}获得${movedA.length}张。`,'system');
      if(movedB.length!==movedA.length){
        const more=movedB.length>movedA.length?a:b,less=more===a?b:a;
        if(less.alive){const pool=this.owned(less),suggestion=[...pool].sort((x,y)=>this.value(x,less)-this.value(y,less)).filter(c=>this.value(c,less)<5).slice(0,2).map(c=>c.id);
          const ids=await this.selectCards(less,'铸盟：获得牌较少，弃置任意张牌再摸等量牌',pool,0,pool.length,suggestion,'可以弃置零张；可从手牌或装备区弃置。');
          const stillOwned=ids.filter(id=>this.owned(less).some(c=>c.id===id));
          if(stillOwned.length&&less.alive){this.discardOwned(less,stillOwned);this.draw(less,stillOwned.length);this.log(`${less.name}因【铸盟】弃${stillOwned.length}张并摸${stillOwned.length}张。`,'draw');}
        }
        if(more.alive){this.draw(more,2);this.heal(more,1);this.log(`${more.name}因【铸盟】摸两张牌并回复1点体力。`,'heal');}
      }
      this.change();await this.flushSkillEvents();
    };
    P.lusuShownSuggestion=function(owner,actor,other){
      const cheap=[...actor.hand].sort((a,b)=>this.value(a,actor)-this.value(b,actor));
      const bothFriendly=(actor.id===owner.id||this.hostility(owner,actor)<-.5)&&(other.id===owner.id||this.hostility(owner,other)<-.5);
      const count=bothFriendly&&actor.hand.length>other.hand.length?Math.min(2,actor.hand.length):1;
      return cheap.slice(0,count).map(c=>c.id);
    };
    P.lusuYinglue=async function(p){
      const used=p.lusuYinglueUsed||{},modes=[...(!used.hp?[{key:'hp',label:'令一人失去1点体力，下个摸牌阶段+2张'}]:[]),...(!used.draw?[{key:'draw',label:'令一人摸两张牌，下个弃牌阶段上限-2'}]:[])];
      if(!modes.length)return;
      const plan=this.lusuYingluePlan(p),choice=await this.option(p,'英略：选择本阶段尚未使用的一项',[...modes,{key:'cancel',label:'取消'}],plan?.mode||modes[0].key);
      if(choice==='cancel')return;
      const targets=this.alive(),preferred=plan?.mode===choice?plan.target:choice==='hp'?targets.find(t=>this.hostility(p,t)>0&&t.hp===1)||p:p;
      const id=await this.option(p,'英略：选择目标',[...targets.map(t=>({key:String(t.id),label:label(this,t)})),{key:'cancel',label:'取消'}],String(preferred.id));
      if(id==='cancel')return;
      const target=this.get(Number(id));if(!target?.alive)return;
      used[choice]=true;
      if(choice==='hp'){
        this.log(`${p.name}对${target.name}发动【英略】，令其失去1点体力，下个摸牌阶段摸牌数+2。`,'system');
        await this.loseHp(target,1,'英略');if(target.alive)target.lusuNextDraw=(target.lusuNextDraw||0)+2;
      }else{
        target.lusuNextDiscard=(target.lusuNextDiscard||0)+2;
        this.draw(target,2);
        this.log(`${p.name}对${target.name}发动【英略】，令其摸两张牌，下个弃牌阶段手牌上限-2。`,'draw');
      }
      this.change();await this.flushSkillEvents();
    };

    P.finishPhaseSkills=async function(p){await finish.call(this,p);
      if(!present(this,p)||p.lusuOathUsed||this.over)return;
      const targets=this.alive().filter(t=>t.id!==p.id);if(targets.length<2)return;
      let pair=null;
      for(const a of targets)for(const b of targets)if(a.id!==b.id&&this.hostility(p,a)<-.5&&this.hostility(p,b)>0&&b.hp>a.hp){const score=b.hp-a.hp+(a.hp<=2?2:0);if(!pair||score>pair.score)pair={a,b,score};}
      const safe=p.hp>1&&p.hand.some(c=>c.key==='jink'||c.key==='peach')||p.hp<=1;
      const use=await this.option(p,'盟誓：将体力调整为1并交换两名其他角色的体力？',[{key:'yes',label:'发动盟誓'},{key:'no',label:'暂不发动'}],pair&&safe?'yes':'no','限定技；两名交换体力的角色中任意一人死亡，回合末摸牌回血效果结束。');
      if(use!=='yes')return;
      const aId=await this.option(p,'盟誓：选择第一名其他角色',targets.map(t=>({key:String(t.id),label:label(this,t)})),String(pair?.a.id??targets[0].id));
      const a=this.get(Number(aId)),rest=targets.filter(t=>t.id!==a.id&&t.alive);
      if(!rest.length)return;
      const bId=await this.option(p,'盟誓：选择第二名其他角色',rest.map(t=>({key:String(t.id),label:label(this,t)})),String(pair?.a.id===a.id?pair.b.id:rest[0].id));
      const b=this.get(Number(bId));if(!a.alive||!b.alive)return;
      p.lusuOathUsed=true;p.lusuOathActive=true;p.lusuOathTargets=[a.id,b.id];
      const oldP=p.hp,oldA=a.hp,oldB=b.hp;
      p.hp=1;a.hp=Math.min(a.maxHp,oldB);b.hp=Math.min(b.maxHp,oldA);
      this.hpChanged?.(p,oldP);this.hpChanged?.(a,oldA);this.hpChanged?.(b,oldB);
      this.log(`${p.name}发动限定技【盟誓】，体力调整为1；${a.name}与${b.name}交换体力（超出上限的部分不保留）。`,'system');this.change();await this.flushSkillEvents();
    };
    P.turnEndSkills=async function(){await turnEnd.call(this);
      if(this.over)return;
      for(const p of this.actionOrder(this.alive().filter(t=>t.lusuOathActive))){
        if(!p.lusuOathTargets.every(id=>this.get(id)?.alive)){p.lusuOathActive=false;continue;}
        this.draw(p,1);this.heal(p,1);this.log(`${p.name}【盟誓】持续生效，回合结束摸一张牌并回复1点体力。`,'heal');
      }
    };
    P.death=async function(p,source){
      for(const owner of this.players)if(owner.lusuOathActive&&(owner.id===p.id||owner.lusuOathTargets.includes(p.id))){owner.lusuOathActive=false;this.log(`${owner.name}的【盟誓】因${p.name}阵亡而结束。`,'system');}
      return death.call(this,p,source);
    };
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);
      if(p.lusuOathActive)out.push('盟誓 '+p.lusuOathTargets.map(id=>this.get(id)?.name).join(' ↔ '));
      if(p.lusuNextDraw)out.push('英略下次摸牌 +'+p.lusuNextDraw);
      if(p.lusuNextDiscard)out.push('英略下次弃牌上限 -'+p.lusuNextDiscard);
      if(!compact&&p.general==='lusu'&&p.lusuOathUsed&&!p.lusuOathActive)out.push('盟誓已结束');
      return out;
    };
  }
  const api={install};root.ZhenLusuSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
