(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,init=P.initExtra,playStart=P.playStartSkills,health=P.applyDamageHealth;
    const finish=P.finishPhaseSkills,active=P.activeSkills,prepare=P.prepareActive,ai=P.aiPlay,states=P.dynastyStates;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'ganning');
    const same=(p,generation)=>!!p?.alive&&p.generation===generation;
    const slash=()=>({...C.defs.slash,id:'ganning-jieying',virtual:true,costs:[],suit:'N',rank:0,originSkill:'jieying',noQuota:true});
    P.initExtra=function(p){init.call(this,p);p.ganningLuejiangUsed=0;p.ganningDamageTurn=-1;p.ganningJieyingTurn=-1;};
    P.playStartSkills=async function(p){p.ganningLuejiangUsed=0;return playStart.call(this,p);};
    // Only actual damage reaches this hook; armor absorption still counts.
    P.applyDamageHealth=function(source,target,amount,context){
      if(source&&amount>0)source.ganningDamageTurn=this.totalTurns;
      return health.call(this,source,target,amount,context);
    };
    P.ganningTargetScore=function(p,t){
      if(!this.owned(t,true).length)return -9;
      const h=this.hostility(p,t);
      if(h<-.5)return t.judge.some(c=>['indulgence','shortage'].includes(c.key))?6:-5;
      if(h<=.5)return -3;
      return 5+Object.values(t.equip).length*3+(t.hand.length?1:0);
    };
    P.ganningLuejiangReady=function(p){return owner(this,p)&&!this.over&&!this.turnInterrupted&&this.isPlayPhaseOwner(p)&&(p.ganningLuejiangUsed||0)<3&&this.alive().some(t=>t.id!==p.id&&this.owned(t,true).length);};
    P.ganningLuejiang=async function(p){
      if(!this.ganningLuejiangReady(p))return false;
      const generation=p.generation,targets=this.alive().filter(t=>t.id!==p.id&&this.owned(t,true).length);
      const generations=new Map(targets.map(t=>[t.id,t.generation]));
      const best=[...targets].sort((a,b)=>this.ganningTargetScore(p,b)-this.ganningTargetScore(p,a))[0];
      const id=await this.option(p,'掠江：选择一名其他角色',[
        ...targets.map(t=>({key:String(t.id),label:`${t.id+1}号位 · ${t.name} · 手牌${t.hand.length} · 装备${Object.values(t.equip).length} · 判定${t.judge.length}`})),
        {key:'cancel',label:'取消掠江'}
      ],String(best.id),'弃置目标手牌、装备区或判定区的一张牌；若为装备牌，你获得之。无需弃置自己的牌。');
      const target=targets.find(t=>String(t.id)===id),targetGeneration=generations.get(target?.id);
      const valid=()=>same(p,generation)&&same(target,targetGeneration)&&this.ganningLuejiangReady(p)&&this.owned(target,true).length>0;
      if(!valid())return false;
      const publicCards=[...Object.values(target.equip),...target.judge];
      const options=publicCards.map(c=>({key:c.id,label:`${target.judge.includes(c)?'判定':'装备'}：${c.name}${c.kind==='equip'?'（弃置后获得）':''}`,card:c}));
      if(target.hand.length)options.unshift({key:'hand',label:`随机手牌（${target.hand.length}张）`,hidden:true});
      const bad=target.judge.find(c=>['indulgence','shortage'].includes(c.key));
      const suggested=this.hostility(p,target)<0&&bad?bad.id:target.equip.armor?.id||target.equip.weapon?.id||options[0].key;
      options.push({key:'cancel',label:'取消掠江'});
      const key=await this.option(p,`掠江：弃置${target.name}的一张牌`,options,suggested,'手牌保持隐藏，选择手牌时随机弃置一张；取消不消耗次数。');
      if(key==='cancel'||!valid()||!options.some(o=>o.key===key))return false;
      const card=key==='hand'?target.hand[Math.floor(this.random()*target.hand.length)]:publicCards.find(c=>c.id===key);
      if(!card||!this.owned(target,true).some(c=>c.id===card.id))return false;
      const zone=target.judge.includes(card)?'judge':target.hand.includes(card)?'hand':'equip';
      p.ganningLuejiangUsed++;
      this.log(`${p.name}发动【掠江】（本阶段${p.ganningLuejiangUsed}/3），弃置${target.name}的一张牌。`,'use');
      this.discardOwned(target,[card.id]);
      this.evidence(p,target,zone==='judge'&&['indulgence','shortage'].includes(card.key));
      await this.flushSkillEvents();
      if(card.kind==='equip'&&same(p,generation)&&!this.over){
        const index=this.discard.findIndex(c=>c.id===card.id);
        if(index>=0){this.gain(p,this.discard.splice(index,1));this.log(`${p.name}因【掠江】获得弃置的装备牌【${card.name}】。`,'draw');}
      }
      await this.flushSkillEvents();this.change();return true;
    };
    P.ganningJieyingReady=function(p,target){return owner(this,p)&&!!target?.alive&&p.id!==target.id&&!this.over&&!this.turnInterrupted&&this.phase==='结束'&&this.turn===target.id&&target.ganningDamageTurn!==this.totalTurns&&this.distance(p,target)<=this.range(p)&&this.owned(p).length>0&&this.allowedUse(p,slash());};
    P.ganningJieying=async function(p,target){
      if(!this.ganningJieyingReady(p,target)||p.ganningJieyingTurn===this.totalTurns)return false;
      const generation=p.generation,targetGeneration=target.generation;
      p.ganningJieyingTurn=this.totalTurns;
      const pool=this.owned(p),cost=[...pool].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const ignore=p.equip.weapon?.key==='qinggang';
      const want=this.hostility(p,target)>.5&&!this.jiaxuProtected?.(target,slash())&&!this.chengongProtected?.(target)&&(ignore||target.equip.armor?.key!=='vine'||p.equip.weapon?.key==='fan');
      const ids=await this.selectCards(p,`劫营：弃置一张牌，对${target.name}使用杀`,pool,0,1,want?[cost.id]:[],'其本回合未造成伤害，且在你的攻击范围内。可弃手牌或装备牌；空选确认可放弃。此杀可正常响应，不计入使用次数。');
      if(ids.length!==1||!same(p,generation)||!same(target,targetGeneration)||!this.ganningJieyingReady(p,target)||!this.owned(p).some(c=>c.id===ids[0]))return false;
      this.discardOwned(p,ids);await this.flushSkillEvents();
      // The ending-phase condition is checked when activating, before paying.
      if(same(p,generation)&&same(target,targetGeneration)&&!this.over&&!this.turnInterrupted&&this.allowedUse(p,slash())){
        this.log(`${p.name}发动【劫营】，视为对${target.name}使用一张不计入次数的【杀】。`,'use');
        await this.declaredSlash(p,target,slash());
      }
      await this.flushSkillEvents();this.change();return true;
    };
    P.finishPhaseSkills=async function(target){
      await finish.call(this,target);
      if(!target?.alive||this.over||this.turnInterrupted||this.phase!=='结束'||this.turn!==target.id)return;
      for(const p of this.actionOrder(this.alive().filter(t=>owner(this,t)&&t.id!==target.id))){
        if(!target.alive||this.over||this.turnInterrupted)break;
        await this.ganningJieying(p,target);
      }
    };
    P.activeSkills=function(p){
      const out=active.call(this,p);
      if(p?.general==='ganning')out.push({key:'ganning_luejiang',name:'掠江',ready:this.ganningLuejiangReady(p),detail:`本阶段已用${p.ganningLuejiangUsed||0}/3 · 弃置区域牌，装备归你`,reason:(p.ganningLuejiangUsed||0)>=3?'本出牌阶段已发动三次':'须在自己的出牌阶段，且其他角色区域内有牌'});
      return out;
    };
    P.prepareActive=async function(p,a){if(a.skill!=='ganning_luejiang')return prepare.call(this,p,a);await this.ganningLuejiang(p);return null;};
    P.aiPlay=function(p,actions){
      const skill=actions.find(a=>a.skill==='ganning_luejiang');
      if(skill&&this.alive().some(t=>t.id!==p.id&&this.ganningTargetScore(p,t)>0))return skill;
      return ai.call(this,p,actions.filter(a=>a.skill!=='ganning_luejiang'));
    };
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(p?.general==='ganning')out.push(`掠江 · 本阶段${p.ganningLuejiangUsed||0}/3`);return out;};
  }
  const api={install};root.ZhenGanningSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
