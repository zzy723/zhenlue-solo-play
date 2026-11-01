(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,init=P.initExtra,active=P.activeSkills,prepare=P.prepareActive,ai=P.aiPlay;
    const health=P.applyDamageHealth,states=P.dynastyStates;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'chengong');
    const label=p=>`${p.name} · ${p.id+1}号位 · ${p.hp}体力 · 手牌${p.hand.length}`;
    const slash=cost=>({...C.defs.slash,id:`mingce-${cost.id}`,virtual:true,costs:[cost],suit:cost.suit,rank:cost.rank,originSkill:'mingce',noQuota:true});
    P.initExtra=function(p){init.call(this,p);p.chengongMingceTurn=-1;p.chengongZhichiTurn=-1;p.chengongJijiao={};};
    P.chengongMingceReady=function(p){return owner(this,p)&&!this.over&&this.isPlayPhaseOwner(p)&&p.chengongMingceTurn!==this.totalTurns&&p.hand.length>0&&this.alive().some(t=>t.id!==p.id);};
    P.chengongVictimScore=function(p,receiver,t){
      if(this.chengongProtected(t))return -20;
      const h=this.hostility(p,t),boost=this.distance(receiver,p)===1&&t.id!==p.id&&this.distance(p,t)<=this.range(p)&&p.chengongJijiao[receiver.id]!==this.round;
      return h*4+(h>.5?(t.hp<=1?3:0)+(boost?2:0)-Math.min(3,this.damageBenefitRisk(t)):0);
    };
    P.chengongReceiverScore=function(p,t){
      const victims=this.alive().filter(v=>v.id!==t.id);
      return (this.hostility(p,t)<-.5?4:-2)+Math.max(...victims.map(v=>this.chengongVictimScore(p,t,v)));
    };
    P.chengongMingce=async function(p){
      if(!this.chengongMingceReady(p))return false;
      const generation=p.generation,targets=this.alive().filter(t=>t.id!==p.id);
      const best=[...targets].sort((a,b)=>this.chengongReceiverScore(p,b)-this.chengongReceiverScore(p,a))[0];
      const id=await this.option(p,'明策：选择一名其他角色接受手牌',[
        ...targets.map(t=>({key:String(t.id),label:label(t)})),{key:'cancel',label:'取消明策'}
      ],String(best.id),'你与受赠者各摸一张；赠装备你额外摸一张。随后由你指定目标，受赠者必须将一张牌当杀使用，无视距离。');
      const receiver=targets.find(t=>String(t.id)===id),receiverGeneration=receiver?.generation;
      if(!this.chengongMingceReady(p)||p.generation!==generation||!receiver?.alive)return false;
      const ranked=[...p.hand].sort((a,b)=>(this.value(a,p)-(a.kind==='equip'?4:0))-(this.value(b,p)-(b.kind==='equip'?4:0)));
      const [costId]=await this.selectCards(p,'明策：交给受赠者一张手牌',p.hand,1,1,[ranked[0].id],'只能交出手牌；装备牌额外摸一张。');
      if(!this.chengongMingceReady(p)||p.generation!==generation||!receiver.alive||receiver.generation!==receiverGeneration||!p.hand.some(c=>c.id===costId))return false;
      p.chengongMingceTurn=this.totalTurns;
      const gift=this.removeOwned(p,costId).card;
      this.gain(receiver,[gift]);this.evidence(p,receiver,true);
      this.log(`${p.name}发动【明策】，将一张手牌交给${receiver.name}。`,'use');
      await this.flushSkillEvents();
      if(this.over)return true;
      if(p.alive&&p.generation===generation)this.draw(p,1);
      if(receiver.alive&&receiver.generation===receiverGeneration)this.draw(receiver,1);
      if(gift.kind==='equip'&&p.alive&&p.generation===generation){this.draw(p,1);this.log('【明策】交出装备牌，陈宫额外摸一张牌。','draw');}
      await this.flushSkillEvents();
      if(this.over||!p.alive||p.generation!==generation||!receiver.alive||receiver.generation!==receiverGeneration)return true;
      const victims=this.alive().filter(t=>t.id!==receiver.id);
      if(!victims.length)return true;
      const preferred=[...victims].sort((a,b)=>this.chengongVictimScore(p,receiver,b)-this.chengongVictimScore(p,receiver,a))[0];
      const victimId=await this.option(p,'明策：指定受赠者使用杀的目标',victims.map(t=>({key:String(t.id),label:label(t)})),String(preferred.id),'由陈宫指定目标；无视受赠者的攻击距离。');
      const victim=victims.find(t=>String(t.id)===victimId)||preferred,victimGeneration=victim.generation;
      if(this.over||!receiver.alive||receiver.generation!==receiverGeneration||!victim.alive)return true;
      const usable=()=>this.owned(receiver).filter(c=>this.allowedUse(receiver,slash(c))).sort((a,b)=>this.value(a,receiver)-this.value(b,receiver));
      let cards=usable();
      if(!cards.length||this.isGeneral(receiver,'shensunce')&&receiver.sunceNoSlashTurn===this.totalTurns){
        this.log(`${receiver.name}因没有可用的牌或不能使用杀，无法执行【明策】的强制出杀。`,'system');this.change();return true;
      }
      const chosen=await this.option(receiver,`明策：必须将一张牌当杀对${victim.name}使用`,cards.map(c=>({key:c.id,label:`【${c.name}】当杀`,card:c})),cards[0].id,'必须执行，没有放弃选项。可用手牌或装备区的牌，无视距离且不计入出杀次数。');
      if(this.over||!receiver.alive||receiver.generation!==receiverGeneration||!victim.alive||victim.generation!==victimGeneration)return true;
      cards=usable();const cost=cards.find(c=>c.id===chosen)||cards[0];
      if(!cost){this.log(`${receiver.name}已没有可用的牌，无法执行【明策】的强制出杀。`,'system');return true;}
      const raw=this.removeOwned(receiver,cost.id).card;
      this.log(`${receiver.name}执行【明策】，将【${raw.name}】当【杀】对${victim.name}使用（无视距离）。`,'use');
      await this.declaredSlash(receiver,victim,slash(raw));
      await this.flushSkillEvents();this.change();return true;
    };
    // Called inside the final damage resolver, after redirection and damage-to-HP-loss conversions.
    P.chengongProtected=function(target){return target?.alive&&target.chengongZhichiTurn===this.totalTurns;};
    P.chengongJijiaoOwners=function(source,target){return this.actionOrder(this.alive().filter(p=>owner(this,p)&&p.id!==target.id&&this.distance(source,p)===1&&this.distance(p,target)<=this.range(p)&&p.chengongJijiao[source.id]!==this.round));};
    P.chengongBoostDamage=function(source,target,amount,context){
      context.chengongJijiaoOwners=[];
      if(amount<=0||!source?.alive||context.chain||!context.card||!C.isSlash(context.card))return amount;
      const owners=this.chengongJijiaoOwners(source,target);
      context.chengongJijiaoOwners=owners.map(p=>({id:p.id,generation:p.generation,round:this.round,sourceId:source.id}));
      return amount+owners.length;
    };
    P.applyDamageHealth=function(source,target,amount,context){
      health.call(this,source,target,amount,context);
      if(amount<=0)return;
      for(const e of context.chengongJijiaoOwners||[]){
        const p=this.get(e.id);
        if(p?.generation!==e.generation)continue;
        p.chengongJijiao[e.sourceId]=e.round;
        this.log(`${p.name}【犄角】：${source.name}本轮首次对其攻击范围内的角色造成杀伤害，此伤害+1。`,'damage');
      }
      if(owner(this,target)&&this.turn!==target.id){
        target.chengongZhichiTurn=this.totalTurns;
        this.log(`${target.name}触发【智迟】，直到本回合结束防止所有伤害。`,'system');
      }
    };
    P.activeSkills=function(p){const list=active.call(this,p);if(owner(this,p))list.push({key:'chengong_mingce',name:'明策',ready:this.chengongMingceReady(p),detail:'交一张手牌 · 双方摸牌 · 指定强制出杀',reason:p.chengongMingceTurn===this.totalTurns?'本回合已使用':'须在自己的出牌阶段，有手牌及其他角色'});return list;};
    P.prepareActive=async function(p,a){if(a.skill!=='chengong_mingce')return prepare.call(this,p,a);await this.chengongMingce(p);return null;};
    P.aiPlay=function(p,actions){const skill=actions.find(a=>a.skill==='chengong_mingce');if(skill&&this.alive().some(t=>t.id!==p.id&&this.chengongReceiverScore(p,t)>0))return skill;return ai.call(this,p,actions.filter(a=>a.skill!=='chengong_mingce'));};
    P.dynastyStates=function(p,compact=false){
      const out=states.call(this,p,compact);
      if(p.general==='chengong'){
        out.push(`明策 · 本回合${p.chengongMingceTurn===this.totalTurns?'已用':'可用'}`);
        const nearby=this.alive().filter(t=>t.id!==p.id&&this.distance(t,p)===1);
        for(const t of nearby)out.push(`犄角 · ${t.id+1}号位${t.name}本轮${p.chengongJijiao[t.id]===this.round?'已用':'可增伤'}`);
        if(this.chengongProtected(p))out.push('智迟 · 本回合防止所有伤害');
      }
      return out;
    };
  }
  const api={install};root.ZhenChengongSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
