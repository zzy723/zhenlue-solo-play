(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,init=P.initExtra,setup=P.setup,active=P.activeSkills,prepare=P.prepareActive,ai=P.aiPlay;
    const health=P.applyDamageHealth,hurt=P.afterDamageEvent,finish=P.finishPhaseSkills,end=P.turnEndSkills,playStart=P.playStartSkills,states=P.dynastyStates;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'diaochan');
    const same=(p,generation)=>!!p?.alive&&p.generation===generation;
    const label=p=>`${p.name} · ${p.id+1}号位 · ${p.hp}体力 · 手牌${p.hand.length}`;
    P.initExtra=function(p){
      init.call(this,p);
      Object.assign(p,{diaochanLijianTurn:-1,diaochanBiyueRound:-1,diaochanBiyueCount:0,diaochanBiyueAskedTurn:-1,diaochanFinishTurn:-1,diaochanHurtTurn:-1});
    };
    P.setup=function(){setup.call(this);for(const p of this.players)if(p.general==='diaochan')p.gender='female';};
    P.playStartSkills=async function(p){if(p.general==='diaochan')p.diaochanLijianTurn=-1;return playStart.call(this,p);};
    P.diaochanPairs=function(p){
      const others=this.alive().filter(t=>t.id!==p.id),pairs=[];
      const card={...C.defs.duel,virtual:true,costs:[],suit:'N',rank:0,originSkill:'lijian'};
      for(const actor of others)if(this.allowedUse(actor,card)){
        const legal=this.targets(actor,card);
        for(const target of others)if(target.id!==actor.id&&legal.includes(target))pairs.push({actor,target});
      }
      return pairs;
    };
    P.diaochanLijianReady=function(p){
      return owner(this,p)&&!this.over&&this.isPlayPhaseOwner(p)&&p.diaochanLijianTurn!==this.totalTurns&&p.hand.length>0&&this.diaochanPairs(p).length>0;
    };
    P.diaochanPairScore=function(p,actor,target){
      // Estimate from public hand counts; do not inspect another player's hand.
      const a=actor.hand.length/(target.molWushuang?2:1),t=target.hand.length/(actor.molWushuang?2:1);
      const likelyLoser=t<=a?target:actor,likelyWinner=likelyLoser===target?actor:target;
      let score=this.hostility(p,likelyLoser)*5+this.hostility(p,likelyWinner)*Math.min(2,Math.min(a,t));
      if(this.hostility(p,likelyLoser)>0){score+=likelyLoser.hp<=1?4:0;score-=this.damageBenefitRisk(likelyLoser);}
      if(this.chengongProtected?.(likelyLoser))score-=8;
      return score;
    };
    P.diaochanLijian=async function(p){
      if(!this.diaochanLijianReady(p))return false;
      const generation=p.generation,pairs=this.diaochanPairs(p);
      const best=[...pairs].sort((a,b)=>this.diaochanPairScore(p,b.actor,b.target)-this.diaochanPairScore(p,a.actor,a.target))[0];
      const actors=[...new Set(pairs.map(x=>x.actor))];
      const actorId=await this.option(p,'离间：选择决斗的发起者',[
        ...actors.map(t=>({key:String(t.id),label:label(t)})),{key:'cancel',label:'取消离间'}
      ],String(best.actor.id),'两名角色均须是你以外的其他角色，不限性别；此角色视为使用决斗，由另一方先打出杀。');
      const actor=actors.find(t=>String(t.id)===actorId),actorGeneration=actor?.generation;
      if(!same(p,generation)||!this.diaochanLijianReady(p)||!same(actor,actorGeneration))return false;
      const targets=this.diaochanPairs(p).filter(x=>x.actor===actor).map(x=>x.target);
      if(!targets.length)return false;
      const preferred=[...targets].sort((a,b)=>this.diaochanPairScore(p,actor,b)-this.diaochanPairScore(p,actor,a))[0];
      const targetId=await this.option(p,'离间：选择决斗的目标',[
        ...targets.map(t=>({key:String(t.id),label:label(t)})),{key:'cancel',label:'取消离间'}
      ],String(preferred.id),`${actor.name}视为对所选角色使用决斗。此决斗每次实际造成伤害后，你摸一张牌。`);
      const target=targets.find(t=>String(t.id)===targetId),targetGeneration=target?.generation;
      if(!same(p,generation)||!this.diaochanLijianReady(p)||!same(actor,actorGeneration)||!same(target,targetGeneration))return false;
      const cheapest=[...p.hand].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const ids=await this.selectCards(p,'离间：弃置一张手牌',p.hand,0,1,[cheapest.id],'只可弃置手牌；不选牌并确认可取消，取消不消耗次数。');
      if(ids.length!==1||!same(p,generation)||!this.diaochanLijianReady(p)||!same(actor,actorGeneration)||!same(target,targetGeneration)||!p.hand.some(c=>c.id===ids[0]))return false;
      if(!this.diaochanPairs(p).some(x=>x.actor===actor&&x.target===target))return false;
      p.diaochanLijianTurn=this.totalTurns;
      this.discardOwned(p,ids);
      this.log(`${p.name}发动【离间】，令${actor.name}视为对${target.name}使用【决斗】。`,'use');
      await this.flushSkillEvents();
      // The cost is already paid. The duel can finish even if its skill owner dies.
      if(this.over||!same(actor,actorGeneration)||!same(target,targetGeneration))return true;
      const card={...C.defs.duel,id:`lijian-${this.totalTurns}-${p.id}-${this.cardActionSerial}`,virtual:true,costs:[],suit:'N',rank:0,
        originSkill:'lijian',diaochanOwnerId:p.id,diaochanOwnerGeneration:generation,originalTargets:[target.id]};
      const targetsInUse=[target];
      this.showCardAction(actor,card,targetsInUse,'离间');this.sound('card',{playerId:actor.id,cardKey:'duel',kind:'trick'});
      try{
        const valid=await this.markCardUse(actor,card,targetsInUse);
        if(valid)for(let i=0;i<(card.resolutions||1)&&same(actor,actorGeneration)&&!this.over;i++){
          card.resolutionIndex=i+1;
          for(const t of this.actionOrder(targetsInUse))if(t.alive&&!this.over&&await this.trickAllowed(actor,t,card))await this.singleTrick(actor,t,card);
        }
      }finally{await this.afterCardUse(actor,card,targetsInUse);this.change();}
      return true;
    };
    // This is reached only by actual damage, after prevention/conversion. HP loss
    // does not call it; a subsequent heal does not erase the damage history.
    P.applyDamageHealth=function(source,target,amount,context){
      const result=health.call(this,source,target,amount,context);
      if(amount>0)target.diaochanHurtTurn=this.totalTurns;
      return result;
    };
    P.afterDamageEvent=async function(source,target,amount,context,generation){
      if(hurt)await hurt.call(this,source,target,amount,context,generation);
      const card=context?.card,p=this.get(card?.diaochanOwnerId);
      if(amount>0&&card?.key==='duel'&&card.originSkill==='lijian'&&owner(this,p)&&p.generation===card.diaochanOwnerGeneration&&!this.over){
        this.draw(p,1);this.log(`${p.name}【离间】产生的决斗造成伤害，摸一张牌。`,'draw');await this.flushSkillEvents();
      }
    };
    P.diaochanBiyueUsed=function(p){return p.diaochanBiyueRound===this.round?p.diaochanBiyueCount:0;};
    P.diaochanBiyueTargets=function(p){return this.alive().filter(t=>t.id!==p.id&&t.diaochanHurtTurn===this.totalTurns);};
    P.finishPhaseSkills=async function(p){
      await finish.call(this,p);
      if(owner(this,p)&&!this.over&&p.diaochanFinishTurn!==this.totalTurns){
        p.diaochanFinishTurn=this.totalTurns;this.draw(p,2);this.log(`${p.name}发动【闭月】，结束阶段摸两张牌。`,'draw');await this.flushSkillEvents();
      }
    };
    P.turnEndSkills=async function(){
      // Resolve this turn's support before older end hooks can synchronously
      // execute an extra turn (e.g. 博图), which changes totalTurns and history.
      await this.diaochanTurnEnd();
      return end.call(this);
    };
    P.diaochanTurnEnd=async function(){
      for(const p of this.actionOrder(this.alive().filter(t=>owner(this,t)))){
        if(this.over)break;
        if(p.diaochanBiyueAskedTurn===this.totalTurns||this.diaochanBiyueUsed(p)>=2)continue;
        const candidates=this.diaochanBiyueTargets(p);if(!candidates.length)continue;
        p.diaochanBiyueAskedTurn=this.totalTurns;
        const generation=p.generation,round=this.round,turn=this.totalTurns;
        const generations=new Map(candidates.map(t=>[t.id,t.generation]));
        const friend=candidates.filter(t=>this.hostility(p,t)<-.5).sort((a,b)=>a.hand.length-b.hand.length||a.hp-b.hp)[0];
        const id=await this.option(p,'闭月：令本回合受过伤害的一名其他角色摸一张牌',[
          ...candidates.map(t=>({key:String(t.id),label:label(t)})),{key:'pass',label:'不发动闭月支援'}
        ],friend?String(friend.id):'pass',`每轮限两次，本轮已发动${this.diaochanBiyueUsed(p)}次。可选择本回合受伤后已回复体力的角色；失去体力不计入。`);
        const t=candidates.find(t=>String(t.id)===id);
        if(!owner(this,p)||!same(p,generation)||this.over||this.round!==round||this.totalTurns!==turn||this.diaochanBiyueUsed(p)>=2||!same(t,generations.get(t?.id))||!this.diaochanBiyueTargets(p).includes(t))continue;
        p.diaochanBiyueCount=this.diaochanBiyueUsed(p)+1;p.diaochanBiyueRound=round;
        this.draw(t,1);this.evidence(p,t,true);
        this.log(`${p.name}发动【闭月】，令本回合受过伤害的${t.name}摸一张牌（本轮${p.diaochanBiyueCount}/2次）。`,'draw');
        this.change();await this.flushSkillEvents();
      }
    };
    P.activeSkills=function(p){const list=active.call(this,p);if(owner(this,p))list.push({key:'diaochan_lijian',name:'离间',ready:this.diaochanLijianReady(p),detail:'弃一张手牌 · 指定两名其他角色及决斗方向',reason:p.diaochanLijianTurn===this.totalTurns?'本出牌阶段已发动':'须在自己的出牌阶段，有手牌和两名可决斗的其他角色'});return list;};
    P.prepareActive=async function(p,a){if(a.skill!=='diaochan_lijian')return prepare.call(this,p,a);await this.diaochanLijian(p);return null;};
    P.aiPlay=function(p,actions){
      const skill=actions.find(a=>a.skill==='diaochan_lijian');
      if(skill&&this.diaochanLijianReady(p)&&this.diaochanPairs(p).some(x=>this.diaochanPairScore(p,x.actor,x.target)>0))return skill;
      return ai.call(this,p,actions.filter(a=>a.skill!=='diaochan_lijian'));
    };
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(p.general==='diaochan')out.push(`离间 · 本回合${p.diaochanLijianTurn===this.totalTurns?'已用':'未用'}`,`闭月 · 本轮支援${this.diaochanBiyueUsed(p)}/2次`);return out;};
  }
  const api={install};root.ZhenDiaochanSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
