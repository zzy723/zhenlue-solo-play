(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,old={};
    for(const k of ['initExtra','setup','distance','slashAvailable','prepareActive','afterDamageEvent','playStartSkills','phaseEndSkills','applyDamageHealth','turnEndSkills','dynastyStates'])old[k]=P[k];
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'jieguojia');
    const same=(p,n)=>!!p?.alive&&p.generation===n;
    const label=p=>`${p.name} · ${p.id+1}号位 · 手牌${p.hand.length}`;
    P.initExtra=function(p){old.initExtra.call(this,p);p.guojiaXianshiTurn=-1;};
    P.setup=function(){old.setup.call(this);this._guojiaPhases=[];for(const p of this.players)if(p.general==='jieguojia')p.armor=1;};
    // Scope distance/quota exceptions to synchronous action enumeration. Responses
    // and any nested skill/card resolution keep their own normal restrictions.
    P.guojiaFreeQuery=function(p,fn){
      const previous=this._guojiaFreeQuery,wine=p.wineUsed;
      this._guojiaFreeQuery={id:p.id,generation:p.generation};p.wineUsed=0;
      try{return fn();}finally{this._guojiaFreeQuery=previous;p.wineUsed=wine;}
    };
    const free=(g,p)=>g._guojiaFreeQuery?.id===p?.id&&g._guojiaFreeQuery.generation===p.generation;
    P.distance=function(p,t){return free(this,p)&&p.id!==t.id?1:old.distance.call(this,p,t);};
    P.slashAvailable=function(p){return free(this,p)||old.slashAvailable.call(this,p);};
    P.guojiaGiftActions=function(p,c){return p?.alive&&p.hand.some(x=>x.id===c.id)?this.guojiaFreeQuery(p,()=>this.skillActionsFor(p,c)):[];};
    P.guojiaGiftPlan=function(p,c){return this.guojiaFreeQuery(p,()=>this.cardPlan(p,c));};
    P.prepareActive=async function(p,a){
      if(a.skill!=='guojia_yiji_use')return old.prepareActive.call(this,p,a);
      const permit=this._guojiaGiftPermit,c=p.hand.find(c=>c.id===a.cardId);
      if(!permit||permit.id!==p.id||permit.generation!==p.generation||!permit.cards.includes(a.cardId)||!c||this.over)return null;
      const actions=this.guojiaGiftActions(p,c);
      const action=actions.find(x=>JSON.stringify(x.targets)===JSON.stringify(a.targets)&&!x.recast);
      if(!action)return null;
      this._guojiaGiftPermit=null;
      const raw=this.removeHand(p,c.id);
      return {card:{...raw,noQuota:true},action};
    };
    P.guojiaUseGift=async function(p,records,generation){
      const candidates=()=>records.map(r=>({...r,p:this.get(r.id)})).filter(r=>same(r.p,r.generation)&&r.p.hand.some(c=>r.cards.includes(c.id)&&this.guojiaGiftActions(r.p,c).length));
      let eligible=candidates();if(!eligible.length||!same(p,generation)||this.over)return;
      const best=eligible.find(r=>this.hostility(p,r.p)<-.5&&r.p.hand.some(c=>r.cards.includes(c.id)&&this.guojiaGiftPlan(r.p,c)));
      const id=await this.option(p,'遗计：令一名受赠者立即使用所得牌？',eligible.map(r=>({key:String(r.id),label:label(r.p)})).concat({key:'pass',label:'不令其用牌'}),best?String(best.id):'pass','只能使用此次交给该角色且仍在其手中的一张牌；无距离限制，不计入使用次数。');
      if(id==='pass'||!same(p,generation)||this.over)return;
      eligible=candidates();const r=eligible.find(r=>String(r.id)===id);if(!r)return;
      const receiver=r.p,cards=receiver.hand.filter(c=>r.cards.includes(c.id)&&this.guojiaGiftActions(receiver,c).length);
      const preferred=cards.find(c=>this.guojiaGiftPlan(receiver,c))||cards[0];
      const key=await this.option(receiver,'遗计：选择此次获得的一张牌立即使用',cards.map(c=>({key:c.id,label:`使用【${c.name}】`,card:c})),preferred.id,'由你选择牌和合法目标；郭嘉已发动此效果，须使用一张可用牌。');
      if(!same(receiver,r.generation)||this.over)return;
      const c=receiver.hand.find(c=>c.id===key&&r.cards.includes(c.id));if(!c)return;
      const actions=this.guojiaGiftActions(receiver,c);if(!actions.length)return;
      const plan=this.guojiaGiftPlan(receiver,c)||actions[0],suggested=String(Math.max(0,actions.findIndex(a=>JSON.stringify(a)===JSON.stringify(plan))));
      const choice=actions.length===1?'0':c.key==='chain'?await this.chooseChainTargets(receiver,'遗计：选择立即用牌的目标',actions,suggested):await this.option(receiver,'遗计：选择立即用牌的目标',actions.map((a,i)=>({key:String(i),label:a.targets.map(id=>label(this.get(id))).join('、')||'自己'})),suggested);
      const action=actions[Number(choice)];if(!action||!same(receiver,r.generation)||this.over)return;
      const previous=this._guojiaGiftPermit;
      this._guojiaGiftPermit={id:receiver.id,generation:r.generation,cards:[...r.cards]};
      try{await this.useAction(receiver,{...action,type:'skill',skill:'guojia_yiji_use'});await this.flushSkillEvents();}
      finally{this._guojiaGiftPermit=previous;}
    };
    P.guojiaYiji=async function(p){
      if(!owner(this,p)||this.over)return;
      const generation=p.generation;
      if(await this.option(p,'遗计：摸两张牌？',[{key:'yes',label:'发动遗计，摸两张牌'},{key:'no',label:'不发动'}],'yes')!=='yes'||!same(p,generation)||this.over)return;
      this.draw(p,2);this.log(`${p.name}发动【遗计】，摸两张牌。`,'draw');await this.flushSkillEvents();
      const records=[],visited=[];let remaining=2;
      while(remaining>0&&same(p,generation)&&p.hand.length&&!this.over){
        const targets=this.alive().filter(t=>t.id!==p.id&&!visited.includes(t.id));if(!targets.length)break;
        const friend=targets.filter(t=>this.hostility(p,t)<-.5).sort((a,b)=>a.hand.length-b.hand.length||a.hp-b.hp)[0];
        const id=await this.option(p,'遗计：选择获得手牌的角色',targets.map(t=>({key:String(t.id),label:label(t)})).concat({key:'keep',label:'保留剩余手牌'}),friend?String(friend.id):'keep',`还可交出${remaining}张手牌，至多两名其他角色；不限于刚摸到的牌。`);
        const target=targets.find(t=>String(t.id)===id);if(!target||!same(p,generation)||this.over)break;
        const targetGeneration=target.generation;visited.push(target.id);
        const max=Math.min(remaining,p.hand.length),suggested=[...p.hand].sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,max).map(c=>c.id);
        const ids=await this.selectCards(p,`遗计：交给${target.name}的手牌`,p.hand,0,max,suggested,'可空选；共计至多交出两张手牌。');
        if(!same(p,generation)||!same(target,targetGeneration)||this.over)break;
        const gifts=this.moveBatch(p,()=>ids.filter(id=>p.hand.some(c=>c.id===id)).slice(0,max).map(id=>this.removeOwned(p,id).card));
        if(gifts.length){
          this.gain(target,gifts);remaining-=gifts.length;records.push({id:target.id,generation:targetGeneration,cards:gifts.map(c=>c.id)});
          this.log(`${p.name}【遗计】交给${target.name}${gifts.length}张手牌。`,'draw');this.evidence(p,target,true);await this.flushSkillEvents();
        }
        if(visited.length>=2)break;
      }
      await this.guojiaUseGift(p,records,generation);this.change();
    };
    P.afterDamageEvent=async function(source,target,amount,context,generation){
      await old.afterDamageEvent?.call(this,source,target,amount,context,generation);
      if(owner(this,target)&&target.generation===generation&&target.hp<=0)await this.dying(target,source);
      for(let i=0;i<amount&&owner(this,target)&&target.generation===generation&&!this.over;i++)await this.guojiaYiji(target);
    };
    P.playStartSkills=async function(actor){
      const frame={actor:actor.id,generation:actor.generation,turn:this.totalTurns,damaged:false,predictions:[]};
      (this._guojiaPhases||(this._guojiaPhases=[])).push(frame);
      for(const p of this.actionOrder(this.alive().filter(p=>p.id!==actor.id&&owner(this,p)&&p.guojiaXianshiTurn!==this.totalTurns))){
        if(this.over||!same(actor,frame.generation))break;
        const generation=p.generation;
        // Predict from public information only; no hand inspection is performed.
        const likely=actor.hand.length>=3&&this.alive().some(t=>t.id!==actor.id&&this.hostility(actor,t)>.5&&this.canSlash(actor,t));
        const answer=await this.option(p,`先识：预言${actor.name}本出牌阶段是否会造成伤害`,[{key:'damage',label:'会造成伤害'},{key:'peace',label:'不会造成伤害'}],likely?'damage':'peace','不观看其手牌。此阶段结束时结算；正确令一名角色摸两张，错误弃一张手牌。');
        if(!owner(this,p)||!same(p,generation)||this.over||!['damage','peace'].includes(answer))continue;
        p.guojiaXianshiTurn=this.totalTurns;frame.predictions.push({id:p.id,generation,answer});
        this.log(`${p.name}发动【先识】，预言${actor.name}本阶段“${answer==='damage'?'会':'不会'}造成伤害”。`,'system');
      }
      if(same(actor,frame.generation)&&!this.over&&!this.turnInterrupted)await old.playStartSkills.call(this,actor);
    };
    P.applyDamageHealth=function(source,target,amount,context){
      old.applyDamageHealth.call(this,source,target,amount,context);
      const frame=this._guojiaPhases?.at(-1);
      if(amount>0&&this.phase==='出牌'&&frame&&frame.actor===source?.id&&frame.generation===source.generation)frame.damaged=true;
    };
    P.guojiaSettlePrediction=async function(frame){
      for(const record of frame.predictions){
        const p=this.get(record.id);if(!same(p,record.generation)||p.general!=='jieguojia'||this.over)continue;
        const correct=(record.answer==='damage')===frame.damaged;
        this.log(`${p.name}【先识】预言${correct?'正确':'错误'}。`,'system');
        if(correct){
          const targets=this.alive(),best=[...targets].filter(t=>t.id===p.id||this.hostility(p,t)<-.5).sort((a,b)=>a.hand.length-b.hand.length)[0]||p;
          const id=await this.option(p,'先识：预言正确，令一名角色摸两张牌',targets.map(t=>({key:String(t.id),label:label(t)})),String(best.id));
          const target=targets.find(t=>String(t.id)===id);if(target?.alive&&!this.over){this.draw(target,2);this.log(`${p.name}【先识】令${target.name}摸两张牌。`,'draw');}
        }else if(p.hand.length){
          const cheap=[...p.hand].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
          const ids=await this.selectCards(p,'先识：预言错误，弃置一张手牌',p.hand,1,1,[cheap.id],'只能弃置手牌；没有手牌时不弃牌。');
          if(same(p,record.generation))this.discardOwned(p,ids.filter(id=>p.hand.some(c=>c.id===id)));
        }
        await this.flushSkillEvents();this.change();
      }
    };
    P.phaseEndSkills=async function(actor){
      const frame=this._guojiaPhases?.at(-1);
      if(this.phase==='出牌'&&frame?.actor===actor?.id){this._guojiaPhases.pop();await this.guojiaSettlePrediction(frame);}
      return old.phaseEndSkills?.call(this,actor);
    };
    P.turnEndSkills=async function(){
      // Death/interruption and opening extra phases can bypass phaseEndSkills.
      while(this._guojiaPhases?.length){const frame=this._guojiaPhases.pop();if(frame.turn===this.totalTurns)await this.guojiaSettlePrediction(frame);}
      return old.turnEndSkills.call(this);
    };
    P.dynastyStates=function(p,compact=false){
      const out=old.dynastyStates.call(this,p,compact);
      if(p.general==='jieguojia'){
        out.push(`先识 · 本回合${p.guojiaXianshiTurn===this.totalTurns?'已用':'未用'}`);
        for(const f of this._guojiaPhases||[])for(const r of f.predictions)if(r.id===p.id&&r.generation===p.generation)out.push(`预言${this.get(f.actor).name}：${r.answer==='damage'?'会':'不会'}造成伤害`);
      }
      return out;
    };
  }
  const api={install};root.ZhenGuojiaSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
