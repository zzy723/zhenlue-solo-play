(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,init=P.initExtra,opening=P.openingSkills,preparation=P.preparationSkills;
    const discard=P.discardPhase,active=P.activeSkills,prepare=P.prepareActive,ai=P.aiPlay,states=P.dynastyStates;
    const targets=P.targets,effective=P.effectiveTargets,canUse=P.canUse,mark=P.markCardUse;
    const trick=P.trickAllowed,slash=P.slash,death=P.death,take=P.takePhysical;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'jiaxu');
    const label=c=>`${C.suitMark[c.suit]}${C.rankMark(c.rank)}【${c.name}】`;
    const role=t=>`${t.id+1}号位 ${t.name} · ${t.hp}体力`;
    P.initExtra=function(p){init.call(this,p);Object.assign(p,{jiaxuWei:[],jiaxuWeiUseRound:-1,jiaxuWeiPrepTurn:-1,jiaxuLuanwuRound:-1,jiaxuWeiOpening:false});};
    P.jiaxuProtected=function(t,c){return owner(this,t)&&t.jiaxuWei.length>0&&!!c&&
      ((['trick','delay'].includes(c.kind)&&['S','C'].includes(c.suit))||(C.isSlash(c)&&!!c.virtual));};
    P.targets=function(p,c){return targets.call(this,p,c).filter(t=>!this.jiaxuProtected(t,c));};
    P.effectiveTargets=function(p,c,ts){return effective.call(this,p,c,ts).filter(t=>!this.jiaxuProtected(t,c));};
    P.canUse=function(p,c){
      if(['draw2','lightning'].includes(c.key)&&this.jiaxuProtected(p,c))return false;
      if(!canUse.call(this,p,c))return false;
      if(C.isSlash(c))return this.targets(p,c).length>0;
      return true;
    };
    P.markCardUse=async function(p,c,ts){
      // Remove prohibited targets before target-triggered skills see the declaration.
      for(let i=ts.length-1;i>=0;i--)if(this.jiaxuProtected(ts[i],c))ts.splice(i,1);
      return mark.call(this,p,c,ts);
    };
    // These guards also cover slashes/tricks declared directly by another skill.
    P.trickAllowed=async function(s,t,c){if(this.jiaxuProtected(t,c))return false;return trick.call(this,s,t,c);};
    P.slash=async function(s,t,c,...args){if(this.jiaxuProtected(t,c))return;return slash.call(this,s,t,c,...args);};
    P.jiaxuStoreWei=async function(p,atOpening=false){
      const eligible=()=>owner(this,p)&&!this.over&&!this.turnInterrupted&&p.jiaxuWei.length<3&&p.hand.length>0;
      if(!eligible())return false;
      const generation=p.generation,max=Math.min(2,3-p.jiaxuWei.length,p.hand.length);
      const when=atOpening?'游戏开始时':'弃牌阶段开始前';
      const use=await this.option(p,`帷算：${when}，扣置手牌并摸一张？`,[{key:'yes',label:`扣置1至${max}张手牌为帷`},{key:'no',label:'不发动帷算'}],'yes','帷最多三张；扣置后不计入手牌，仅准备阶段可使用，或作为乱武的代价。');
      if(use!=='yes'||!eligible()||p.generation!==generation)return false;
      const pool=[...p.hand],limit=Math.min(max,3-p.jiaxuWei.length,pool.length);
      const ranked=[...pool].sort((a,b)=>this.jiaxuStoreScore(p,b)-this.jiaxuStoreScore(p,a));
      const n=p.jiaxuWei.length===0&&pool.length>3?limit:1;
      const ids=await this.selectCards(p,'帷算：选择扣置为帷的手牌',pool,1,limit,ranked.slice(0,n).map(c=>c.id),'扣置为暗置的帷，随后摸一张牌；帷不属于手牌或装备区。');
      if(!eligible()||p.generation!==generation||!Array.isArray(ids)||ids.length<1||ids.length>limit||new Set(ids).size!==ids.length||ids.length+p.jiaxuWei.length>3||ids.some(id=>!p.hand.some(c=>c.id===id)))return false;
      this.withLoss('move',()=>this.moveBatch(p,()=>{for(const id of ids){const c=this.removeHand(p,id);this.table=this.table.filter(x=>x.id!==id);p.jiaxuWei.push(c);}}));
      this.log(`${p.name}发动【帷算】，将${ids.length}张手牌暗置为“帷”（现有${p.jiaxuWei.length}张）。`,'system');
      await this.flushSkillEvents();
      if(owner(this,p)&&p.generation===generation&&!this.over)this.draw(p,1);
      await this.flushSkillEvents();this.change();return true;
    };
    P.jiaxuStoreScore=function(p,c){
      // Reserve active cards for next preparation, or low-value cards for 乱武.
      return (this.skillActionsFor(p,c).length?5:0)+(p.hand.length>this.handLimit(p)?2:0)-this.value(c,p)*.3-(['jink','nullify','peach'].includes(c.key)?5:0);
    };
    P.openingSkills=async function(){
      // Opening protection must exist before any opening extra play phase.
      for(const p of this.actionOrder(this.alive().filter(t=>owner(this,t)&&!t.jiaxuWeiOpening))){p.jiaxuWeiOpening=true;await this.jiaxuStoreWei(p,true);}
      return opening.call(this);
    };
    P.discardPhase=async function(p){await this.jiaxuStoreWei(p);if(p.alive&&!this.over&&!this.turnInterrupted)return discard.call(this,p);};
    P.jiaxuWeiActions=function(p,c){
      if(!owner(this,p)||!p.jiaxuWei.includes(c))return [];
      // Using the last 帷 removes its protection before targets are designated.
      const pile=p.jiaxuWei;
      try{p.jiaxuWei=pile.filter(x=>x!==c);return this.skillActionsFor(p,c);}finally{p.jiaxuWei=pile;}
    };
    P.jiaxuWeiPlan=function(p,c){
      const pile=p.jiaxuWei;
      try{p.jiaxuWei=pile.filter(x=>x!==c);return this.cardPlan(p,c);}finally{p.jiaxuWei=pile;}
    };
    P.jiaxuPrepareWei=async function(p){
      if(!owner(this,p)||this.over||this.turnInterrupted||this.turn!==p.id||this.phase!=='准备'||p.jiaxuWeiPrepTurn===this.totalTurns)return null;
      const generation=p.generation,cards=p.jiaxuWei.filter(c=>this.jiaxuWeiActions(p,c).length);
      if(!cards.length)return null;
      const best=cards.find(c=>this.jiaxuWeiPlan(p,c));
      const id=await this.option(p,'帷算：准备阶段使用一张帷？',[...cards.map(c=>({key:c.id,label:label(c),card:c})),{key:'pass',label:'保留帷，不使用'}],best?.id||'pass','只可主动使用一张，仍须满足目标与距离条件；不能主动打出闪或无懈可击，也不能重铸。');
      const c=cards.find(c=>c.id===id);if(!c||!owner(this,p)||p.generation!==generation||this.over||this.turnInterrupted||!p.jiaxuWei.includes(c))return null;
      const actions=this.jiaxuWeiActions(p,c),plan=this.jiaxuWeiPlan(p,c)||actions[0];if(!plan)return null;
      const preferred=String(Math.max(0,actions.findIndex(a=>JSON.stringify(a)===JSON.stringify(plan))));
      const key=actions.length===1?'0':c.key==='chain'?await this.chooseChainTargets(p,'帷算：选择帷的目标',actions,preferred):await this.option(p,'帷算：选择帷的目标',actions.map((a,i)=>({key:String(i),label:a.targets.map(id=>role(this.get(id))).join('、')||'自己'})),preferred);
      const action=actions[Number(key)];
      if(!action||!owner(this,p)||p.generation!==generation||this.over||this.turnInterrupted||p.jiaxuWeiPrepTurn===this.totalTurns||!this.jiaxuWeiActions(p,c).some(a=>JSON.stringify(a)===JSON.stringify(action)))return null;
      p.jiaxuWeiPrepTurn=this.totalTurns;p.jiaxuWei.splice(p.jiaxuWei.indexOf(c),1);this.table.push(c);
      const reward=p.jiaxuWeiUseRound!==this.round;if(reward)p.jiaxuWeiUseRound=this.round;
      // It remains a physical card; a preparation slash uses no play-phase quota.
      return {card:{...c,...(C.isSlash(c)?{noQuota:true}:{}),jiaxuWeiReward:reward,jiaxuWeiGeneration:generation},action};
    };
    const after=P.afterCardUse;
    P.afterCardUse=async function(p,c,ts){
      await after.call(this,p,c,ts);
      if(c.jiaxuWeiReward&&owner(this,p)&&p.generation===c.jiaxuWeiGeneration&&!this.over){c.jiaxuWeiReward=false;this.draw(p,1);this.log(`${p.name}【帷算】本轮首次使用帷，摸一张牌。`,'draw');await this.flushSkillEvents();}
    };
    P.preparationSkills=async function(p){await preparation.call(this,p);if(owner(this,p)&&!this.over&&!this.turnInterrupted)await this.useAction(p,{type:'skill',skill:'jiaxu_weiuse'});};
    P.jiaxuLuanwuReady=function(p){return owner(this,p)&&!this.over&&!this.turnInterrupted&&this.isPlayPhaseOwner(p)&&p.jiaxuLuanwuRound!==this.round&&p.jiaxuWei.length>0&&this.alive().length>1;};
    P.jiaxuNearest=function(p){const others=this.alive().filter(t=>t.id!==p.id);const d=Math.min(...others.map(t=>this.distance(p,t)));return others.filter(t=>this.distance(p,t)===d);};
    P.jiaxuLuanwuTargets=function(p,c){return this.jiaxuNearest(p).filter(t=>!this.jiaxuProtected(t,c));};
    P.jiaxuLuanwuOptions=function(p){
      if(!p.alive||this.over||this.isGeneral(p,'shensunce')&&p.sunceNoSlashTurn===this.totalTurns)return [];
      const virtual={...C.defs.slash,virtual:true,costs:[],suit:'N',rank:0};
      const out=p.hand.filter(c=>C.isSlash(c)&&this.allowedUse(p,c)).map(c=>({key:c.id,label:'使用'+label(c),card:c}));
      // Response menus often attach the physical COST as `card` (e.g. 武圣).
      // Target legality must use the resulting virtual slash, not that cost.
      out.push(...this.responseSkillOptions(p,'slash',false).map(o=>({...o,jiaxuSlash:o.key.startsWith('caiyong:')?o.card:virtual})));
      if(p.equip.weapon?.key==='spear'&&this.spearCards(p).length>=2)out.push({key:'spear',label:'丈八蛇矛：两张手牌当杀',card:virtual});
      if(this.canZonghu(p))out.push({key:'zonghu',label:'宗护：交牌视为使用杀',card:virtual});
      return out.filter(o=>this.jiaxuLuanwuTargets(p,o.jiaxuSlash||o.card||virtual).length>0);
    };
    P.jiaxuLuanwuOne=async function(p){
      if(!p.alive||this.over)return;
      const generation=p.generation,options=this.jiaxuLuanwuOptions(p);
      const preferred=options.find(o=>this.jiaxuLuanwuTargets(p,o.jiaxuSlash||o.card||{...C.defs.slash,virtual:true}).some(t=>this.hostility(p,t)>0));
      const choice=await this.option(p,'乱武：向最近的角色使用杀，或失去1点体力',[...options,{key:'losehp',label:'失去1点体力'}],preferred?.key||(p.hp<=1?options[0]?.key:null)||'losehp','从所有其他存活角色中计算最近距离；不能改选更远者。此杀无距离限制、不计使用次数。');
      if(!p.alive||p.generation!==generation||this.over)return;
      const selected=this.jiaxuLuanwuOptions(p).find(o=>o.key===choice);
      if(!selected){await this.loseHp(p,1,'乱武');return;}
      const candidates=this.jiaxuLuanwuTargets(p,selected.jiaxuSlash||selected.card||{...C.defs.slash,virtual:true});
      const best=[...candidates].sort((a,b)=>this.hostility(p,b)-this.hostility(p,a)||a.hp-b.hp)[0];
      const targetId=await this.option(p,'乱武：选择一名距离最近的角色',candidates.map(t=>({key:String(t.id),label:role(t)})),String(best.id));
      let target=candidates.find(t=>String(t.id)===targetId),raw;
      if(!p.alive||p.generation!==generation||this.over)return;
      if(!target?.alive||!this.jiaxuLuanwuOptions(p).some(o=>o.key===choice)){await this.loseHp(p,1,'乱武');return;}
      if(choice==='spear'){
        const pool=this.spearCards(p),ids=await this.selectCards(p,'乱武·丈八蛇矛：选择两张手牌',pool,2,2,[...pool].sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,2).map(c=>c.id));
        if(ids.length===2&&new Set(ids).size===2&&ids.every(id=>this.spearCards(p).some(c=>c.id===id))){const costs=this.moveBatch(p,()=>ids.map(id=>this.removeHand(p,id)));raw={...C.defs.slash,virtual:true,costs,rank:0,suit:costs.every(C.isRed)?'H':costs.every(c=>['S','C'].includes(c.suit))?'S':'N'};}
      }else if(choice==='zonghu')raw=await this.zonghuCard(p,'slash');
      else if(choice.includes(':'))raw=await this.prepareResponseSkill(p,choice);
      else if(p.hand.some(c=>c.id===choice))raw=this.removeHand(p,choice);
      if(!raw){if(p.alive&&p.generation===generation&&!this.over)await this.loseHp(p,1,'乱武');return;}
      if(!p.alive||p.generation!==generation||this.over||!this.jiaxuLuanwuTargets(p,raw).includes(target)){
        if(raw.virtual)(raw.costs||[]).forEach(c=>this.drop(c));else this.drop(raw);
        if(p.alive&&p.generation===generation&&!this.over)await this.loseHp(p,1,'乱武');return;
      }
      this.log(`${p.name}执行【乱武】，对${target.name}使用【${raw.name}】。`,'use');
      await this.declaredSlash(p,target,{...raw,noQuota:true});await this.flushSkillEvents();
    };
    P.jiaxuLuanwu=async function(p){
      if(!this.jiaxuLuanwuReady(p))return false;
      const generation=p.generation,cards=[...p.jiaxuWei],cheap=[...cards].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const id=await this.option(p,'乱武：弃置一张帷',[...cards.map(c=>({key:c.id,label:'弃置'+label(c),card:c})),{key:'cancel',label:'取消乱武'}],cheap.id,'每轮限一次；从你的下家起，其他角色按座次依次结算。');
      if(!this.jiaxuLuanwuReady(p)||p.generation!==generation)return false;
      const c=p.jiaxuWei.find(c=>c.id===id);if(!c)return false;
      p.jiaxuLuanwuRound=this.round;p.jiaxuWei.splice(p.jiaxuWei.indexOf(c),1);this.putDiscard(c);
      const order=this.actionOrder(this.alive().filter(t=>t.id!==p.id)).map(t=>({id:t.id,generation:t.generation}));
      this.log(`${p.name}发动【乱武】，弃置一张帷。`,'use');this.change();
      for(const entry of order){await this.flushSkillEvents();if(this.over||this.turnInterrupted)break;const t=this.get(entry.id);if(t.alive&&t.generation===entry.generation)await this.jiaxuLuanwuOne(t);}
      await this.flushSkillEvents();this.change();return true;
    };
    P.activeSkills=function(p){const list=active.call(this,p);if(owner(this,p))list.push({key:'jiaxu_luanwu',name:'乱武',ready:this.jiaxuLuanwuReady(p),detail:'弃一张帷 · 全场出杀或失去体力',reason:p.jiaxuLuanwuRound===this.round?'本轮已发动':'须在自己的出牌阶段，且有帷'});return list;};
    P.prepareActive=async function(p,a){if(a.skill==='jiaxu_luanwu'){await this.jiaxuLuanwu(p);return null;}if(a.skill==='jiaxu_weiuse')return this.jiaxuPrepareWei(p);return prepare.call(this,p,a);};
    P.aiPlay=function(p,actions){
      const rest=ai.call(this,p,actions.filter(a=>a.skill!=='jiaxu_luanwu')),a=actions.find(a=>a.skill==='jiaxu_luanwu');
      if(a&&rest.type==='end'){
        const score=this.alive().filter(t=>t.id!==p.id).reduce((n,t)=>n+Math.sign(this.hostility(p,t))*(t.hp<=1?2:1),0);
        if(score>0&&(p.jiaxuWei.length>1||p.hp>1))return a;
      }return rest;
    };
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(p.general==='jiaxu'){
      out.push(`帷 ${p.jiaxuWei.length}/3`);if(p.jiaxuWei.length)out.push('帷算 · 不能成为黑色锦囊或虚拟杀的目标');
      if(!compact)out.push(`帷算摸牌 · 本轮${p.jiaxuWeiUseRound===this.round?'已用':'未用'}`,`乱武 · 本轮${p.jiaxuLuanwuRound===this.round?'已用':'可用'}`);
    }return out;};
    P.takePhysical=function(id){for(const p of this.players){const i=p.jiaxuWei?.findIndex(c=>c.id===id)??-1;if(i>=0)return p.jiaxuWei.splice(i,1)[0];}return take.call(this,id);};
    P.death=async function(p,s){if(p.jiaxuWei?.length)this.putDiscard(...p.jiaxuWei.splice(0));return death.call(this,p,s);};
  }
  const api={install};root.ZhenJiaxuSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
