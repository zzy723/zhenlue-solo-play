(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{defs,isSlash}=C;
    const init=P.initExtra,opening=P.openingSkills,preparation=P.preparationSkills,death=P.death;
    const active=P.activeSkills,aiPlay=P.aiPlay,prepareActive=P.prepareActive,states=P.dynastyStates;
    const mark=P.markCardUse,slash=P.slash,trickAllowed=P.trickAllowed,damage=P.damage,afterDamage=P.afterDamageEvent;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'liuxie');
    const damaging=c=>!!c&&(isSlash(c)||['duel','fireAttack','barbarian','arrows','lightning'].includes(c.key));
    P.initExtra=function(p){init.call(this,p);p.liuxieXiangId=null;p.liuxieMizhaoTurn=-1;p.liuxieTianmingRound=-1;};
    P.liuxieXiangOwners=function(t){return this.alive().filter(p=>owner(this,p)&&p.liuxieXiangId===t?.id);};
    P.liuxieChooseXiang=async function(p){
      if(!owner(this,p)||this.over)return;
      const candidates=this.alive().filter(t=>t.id!==p.id);if(!candidates.length)return;
      const preferred=[...candidates].sort((a,b)=>this.hostility(p,b)-this.hostility(p,a)||a.hand.length-b.hand.length||a.hp-b.hp)[0];
      const id=await this.option(p,'受挟：指定一名角色成为“相”',candidates.map(t=>({key:String(t.id),label:`${t.name} · ${t.id+1}号位 · 手牌${t.hand.length}`})),String(preferred.id),'你的摸牌阶段改为相摸两张，再由相从其手牌中交给你两张；相死亡后在你的下个准备阶段重选。');
      const xiang=candidates.find(t=>String(t.id)===id);if(!xiang?.alive)return;
      p.liuxieXiangId=xiang.id;this.log(`${p.name}【受挟】指定${xiang.name}为“相”。`,'system');this.change();
    };
    P.openingSkills=async function(){
      for(const p of this.actionOrder(this.alive().filter(t=>owner(this,t))))await this.liuxieChooseXiang(p);
      await opening.call(this);
    };
    P.preparationSkills=async function(p){
      if(owner(this,p)&&!this.get(p.liuxieXiangId)?.alive)await this.liuxieChooseXiang(p);
      await preparation.call(this,p);
    };
    // Only a draw phase that has not been skipped calls this hook.
    // Other draws and the chancellor's own draw phase keep their usual rules.
    P.drawPhaseCards=async function(p,n){
      const xiang=this.get(p.liuxieXiangId);
      if(!owner(this,p)||!xiang?.alive){this.draw(p,n);return;}
      this.draw(xiang,2);
      this.log(`${p.name}【受挟】改为“相”${xiang.name}摸两张牌，再交给其两张手牌。`,'draw');
      await this.flushSkillEvents();
      if(!p.alive||!xiang.alive||this.over)return;
      const count=Math.min(2,xiang.hand.length);if(!count)return;
      const friendly=this.hostility(xiang,p)<0;
      const suggested=[...xiang.hand].sort((a,b)=>friendly?this.value(b,p)-this.value(a,p):this.value(a,xiang)-this.value(b,xiang)).slice(0,count).map(c=>c.id);
      const selected=await this.selectCards(xiang,`受挟：从手牌中交给${p.name}${count}张牌`,xiang.hand,count,count,suggested,'由“相”选择，手牌暗置交付。');
      if(!p.alive||!xiang.alive||this.over)return;
      const ids=[...new Set(selected)].filter(id=>xiang.hand.some(c=>c.id===id)).slice(0,count);
      for(const c of xiang.hand)if(ids.length<Math.min(count,xiang.hand.length)&&!ids.includes(c.id))ids.push(c.id);
      const cards=this.moveBatch(xiang,()=>ids.map(id=>this.removeOwned(xiang,id).card));
      this.gain(p,cards);this.log(`${xiang.name}【受挟】交给${p.name}${cards.length}张手牌。`,'system');this.change();
    };
    P.death=async function(p,source){
      const owners=this.liuxieXiangOwners(p);
      const result=await death.call(this,p,source);
      if(!p.alive)for(const liu of owners){liu.liuxieXiangId=null;this.log(`${p.name}阵亡，${liu.name}将在下个准备阶段重新选择“相”。`,'system');}
      return result;
    };
    P.liuxieMizhaoReady=function(p){
      const xiang=this.get(p?.liuxieXiangId);
      return owner(this,p)&&this.isPlayPhaseOwner(p)&&p.liuxieMizhaoTurn!==this.totalTurns&&p.hand.length>=2&&!!xiang?.alive&&xiang.id!==p.id&&this.alive().some(t=>t.id!==p.id&&t.id!==xiang.id);
    };
    P.liuxieMizhaoPlan=function(p){
      if(!this.liuxieMizhaoReady(p))return null;
      const xiang=this.get(p.liuxieXiangId);if(this.hostility(p,xiang)<=.5)return null;
      const actor=this.alive().filter(t=>t.id!==p.id&&t.id!==xiang.id&&this.hostility(p,t)<-.5&&t.hp>1)
        .sort((a,b)=>b.hand.filter(isSlash).length-a.hand.filter(isSlash).length||b.hp-a.hp)[0];
      return actor?{actor,rival:xiang}:null;
    };
    P.liuxieMizhao=async function(p){
      if(!this.liuxieMizhaoReady(p))return;
      const xiang=this.get(p.liuxieXiangId),recipients=this.alive().filter(t=>t.id!==p.id&&t.id!==xiang.id);
      const preferred=this.liuxieMizhaoPlan(p)?.actor||[...recipients].sort((a,b)=>this.hostility(p,a)-this.hostility(p,b)||b.hp-a.hp)[0];
      const id=await this.option(p,'密诏：将所有手牌扣置交给一名既非你也非“相”的角色',[...recipients.map(t=>({key:String(t.id),label:`${t.name} · ${t.hp}体力 · 手牌${t.hand.length}`})),{key:'cancel',label:'取消密诏'}],String(preferred.id),'收牌者视为对相使用决斗，伤害+1；伤到相则你摸两张，未伤到相不再失去体力。');
      const actor=recipients.find(t=>String(t.id)===id);
      if(!actor?.alive||!this.liuxieMizhaoReady(p))return;
      p.liuxieMizhaoTurn=this.totalTurns;
      const cards=this.moveBatch(p,()=>[...p.hand].map(c=>this.removeOwned(p,c.id).card));
      this.gain(actor,cards);this.log(`${p.name}发动【密诏】，将全部${cards.length}张手牌扣置交给${actor.name}。`,'system');
      const card={...defs.duel,id:`mizhao-${this.totalTurns}-${p.id}`,virtual:true,costs:[],suit:'N',rank:0,originSkill:'mizhao',mizhaoBoost:true,mizhaoXiangId:xiang.id,mizhaoHit:false};
      await this.flushSkillEvents();
      if(actor.alive&&xiang.alive&&!this.over){
        const targets=[xiang];
        this.showCardAction(actor,card,targets,'密诏');this.sound('card',{playerId:actor.id,cardKey:'duel',kind:'trick'});
        this.log(`${actor.name}【密诏】视为对${xiang.name}使用【决斗】，此决斗伤害+1。`,'use');
        try{
          const valid=await this.markCardUse(actor,card,targets);
          if(valid)for(let i=0;i<(card.resolutions||1)&&actor.alive&&!this.over;i++){
            card.resolutionIndex=i+1;
            for(const target of this.actionOrder(targets))if(target.alive&&!this.over&&await this.trickAllowed(actor,target,card))await this.singleTrick(actor,target,card);
          }
        }finally{await this.afterCardUse(actor,card,targets);}
      }
      if(p.alive&&!this.over){
        if(card.mizhaoHit){this.draw(p,2);this.log(`${p.name}【密诏】决斗对“相”造成过伤害，摸两张牌。`,'draw');}
      }
      this.change();
    };
    P.damage=async function(source,target,amount,nature='normal',context={}){
      if(context.card?.mizhaoBoost&&!context.chain&&!context.xuchuTransferred){amount++;this.log('【密诏】令此决斗的伤害+1。','system');}
      return damage.call(this,source,target,amount,nature,context);
    };
    P.afterDamageEvent=async function(source,target,amount,context,generation){
      if(amount>0&&context?.card?.mizhaoBoost&&!context.chain&&context.card.mizhaoXiangId===target.id)context.card.mizhaoHit=true;
      if(afterDamage)await afterDamage.call(this,source,target,amount,context,generation);
    };
    P.markCardUse=async function(p,c,targets){
      const valid=await mark.call(this,p,c,targets);if(!valid||!damaging(c))return valid;
      c.liuxieNullified=[];
      const actual=this.effectiveTargets(p,c,targets||[]);
      for(const liu of this.actionOrder(actual.filter(t=>owner(this,t)))){
        if(liu.liuxieTianmingRound===this.round||this.over)continue;
        const fromXiang=p.id===liu.liuxieXiangId;
        const options=[{key:'draw',label:'摸两张牌'},...(fromXiang?[{key:'nullify',label:'令此牌对你无效'}]:[]),{key:'pass',label:'不发动天命'}];
        const choice=await this.option(liu,`天命：成为${p.name}使用的【${c.name}】的目标`,options,fromXiang?'nullify':'draw','每轮限一次；选择无效只影响你，其他目标照常结算。');
        if(choice!=='draw'&&!(choice==='nullify'&&fromXiang))continue;
        liu.liuxieTianmingRound=this.round;
        if(choice==='draw'){this.draw(liu,2);this.log(`${liu.name}发动【天命】，摸两张牌。`,'draw');}
        else{c.liuxieNullified.push(liu.id);this.log(`${liu.name}发动【天命】，令“相”的【${c.name}】对自己无效。`,'system');}
      }
      return valid;
    };
    P.slash=async function(source,target,card,...args){if(card?.liuxieNullified?.includes(target.id))return;return slash.call(this,source,target,card,...args);};
    P.trickAllowed=async function(source,target,card){if(card?.liuxieNullified?.includes(target.id))return false;return trickAllowed.call(this,source,target,card);};
    P.activeSkills=function(p){const list=active.call(this,p);if(owner(this,p))list.push({key:'mizhao',name:'密诏',detail:'出牌阶段限一次 · 全手牌交付 · 对相决斗伤害+1',ready:this.liuxieMizhaoReady(p),reason:p.liuxieMizhaoTurn===this.totalTurns?'本阶段已发动':'须至少两张手牌、有相及另一名存活角色'});return list;};
    P.aiPlay=function(p,actions){const rest=aiPlay.call(this,p,actions.filter(a=>a.skill!=='mizhao'));const mizhao=actions.find(a=>a.skill==='mizhao');return rest.type==='end'&&mizhao&&this.liuxieMizhaoPlan(p)?mizhao:rest;};
    P.prepareActive=async function(p,a){if(a.skill==='mizhao'){await this.liuxieMizhao(p);return null;}return prepareActive.call(this,p,a);};
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);
      if(p.general==='liuxie')out.push(`受挟 · 相 ${this.get(p.liuxieXiangId)?.alive?this.get(p.liuxieXiangId).name:'无'}`,`天命 · 本轮${p.liuxieTianmingRound===this.round?'已用':'可用'}`);
      if(this.liuxieXiangOwners(p).length)out.push('相 · 刘协摸牌阶段摸2并交2');
      return out;
    };
  }
  const api={install};root.ZhenLiuxieSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
