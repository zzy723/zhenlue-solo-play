(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{defs,isSlash}=C;
    const init=P.initExtra,opening=P.openingSkills,roundStart=P.roundStart,begin=P.beginTurnSkills;
    const playStart=P.playStartSkills,canSlash=P.canSlash,slashAvailable=P.slashAvailable;
    const targets=P.targets,effectiveTargets=P.effectiveTargets,active=P.activeSkills;
    const aiPlay=P.aiPlay,prepare=P.prepareActive,responseOptions=P.responseSkillOptions;
    const prepareResponse=P.prepareResponseSkill,mark=P.markCardUse,states=P.dynastyStates,slash=P.slash,death=P.death;
    const isGuan=(g,p)=>p?.alive&&g.isGeneral(p,'guanyu');
    const isGuanLocked=(g,p)=>g.isGeneralLocked(p,'guanyu');
    const isMarked=(p,owner)=>!!p?.yiOwners?.includes(owner.id);
    const blocked=(p,t)=>!!p?.guanyuBlocked?.includes(t?.id);
    P.initExtra=function(p){init.call(this,p);Object.assign(p,{yiOwners:[],guanyuFocusId:null,guanyuFreeLimit:0,guanyuFocusUses:0,guanyuBlocked:[]});};
    P.guanyuMarkedCount=function(){return this.alive().filter(t=>t.yiOwners?.length).length;};
    P.guanyuUnmarkedCount=function(owner){return this.alive().filter(t=>t.id!==owner.id&&!isMarked(t,owner)).length;};
    P.openingSkills=async function(){
      for(const owner of this.actionOrder(this.alive().filter(p=>isGuanLocked(this,p)))){
        for(const p of this.actionOrder(this.alive().filter(t=>t.id!==owner.id))){
          const ally=this.hostility(p,owner)<0;
          const answer=await this.option(p,`义绝：是否获得${owner.name}的“义”标记？`,[
            {key:'yes',label:'获得“义”标记'},{key:'no',label:'不获得'}
          ],ally?'yes':'no','有“义”者每轮开始交给关羽一张牌；关羽对其造成濒死伤害时，防止此伤害、移去标记，本回合不能再指定其为目标。');
          if(answer==='yes'){p.yiOwners.push(owner.id);this.log(`${p.name}获得${owner.name}的“义”标记。`,'system');}
        }
      }
      this.change();await opening.call(this);
    };
    P.roundStart=async function(){
      const newRound=this.startedRound!==this.round;
      await roundStart.call(this);
      if(!newRound||this.over)return;
      for(const owner of this.actionOrder(this.alive().filter(p=>isGuanLocked(this,p)))){
        for(const p of this.actionOrder(this.alive().filter(t=>t.id!==owner.id&&isMarked(t,owner)))){
          const pool=this.owned(p);if(!pool.length)continue;
          const cheap=[...pool].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
          const id=await this.option(p,`义绝：交给${owner.name}一张牌`,pool.map(c=>({key:c.id,label:`${c.name} ${C.suitMark[c.suit]}${C.rankMark(c.rank)}`,card:c})),cheap.id,'可从手牌或装备区交出一张牌。');
          const card=this.moveBatch(p,()=>this.removeOwned(p,id).card);
          this.gain(owner,[card]);this.log(`${p.name}因【义绝】交给${owner.name}一张牌。`,'system');
        }
      }
    };
    P.beginTurnSkills=function(){begin.call(this);for(const p of this.players)p.guanyuBlocked=[];};
    P.playStartSkills=async function(p){
      await playStart.call(this,p);
      if(!isGuan(this,p)||this.over||!p.alive)return;
      p.guanyuFocusId=null;p.guanyuFreeLimit=0;p.guanyuFocusUses=0;
      const others=this.alive().filter(t=>t.id!==p.id&&!blocked(p,t));
      if(!others.length)return;
      const good=[...others].sort((a,b)=>this.hostility(p,b)-this.hostility(p,a)||Number(isMarked(a,p))-Number(isMarked(b,p))||a.hp-b.hp)[0];
      const id=await this.option(p,'武圣：指定此出牌阶段的追击目标',[...others.map(t=>({key:String(t.id),label:`${t.name} · ${t.hp}血${isMarked(t,p)?' · 义':''}`})),{key:'pass',label:'不指定'}],this.hostility(p,good)>0?String(good.id):'pass','前X张对其使用的杀无距离限制且不计次数，X为场上有“义”的角色数。每次指定其为杀的目标后，摸Y张牌，Y为其他没有“义”的存活角色数。');
      if(id==='pass')return;
      p.guanyuFocusId=Number(id);p.guanyuFreeLimit=this.alive().filter(t=>isMarked(t,p)).length;
      this.log(`${p.name}发动【武圣】，指定${this.get(p.guanyuFocusId).name}；本阶段前${p.guanyuFreeLimit}张对其使用的杀无距离且不计次数。`,'system');this.change();
    };
    P.guanyuFreeSlash=function(p,t){return isGuan(this,p)&&this.isPlayPhaseOwner(p)&&p.guanyuFocusId===t?.id&&p.guanyuFocusUses<p.guanyuFreeLimit&&!blocked(p,t);};
    P.canSlash=function(p,t){if(isGuanLocked(this,p)&&blocked(p,t))return false;return this.guanyuFreeSlash(p,t)||canSlash.call(this,p,t);};
    P.slashAvailable=function(p){return slashAvailable.call(this,p)||isGuan(this,p)&&this.guanyuFreeSlash(p,this.get(p.guanyuFocusId));};
    P.targets=function(p,c){
      let out=targets.call(this,p,c);
      if(isGuanLocked(this,p)){
        out=out.filter(t=>!blocked(p,t));
      }
      if(isGuan(this,p)){
        if(isSlash(c)&&!slashAvailable.call(this,p))out=out.filter(t=>this.guanyuFreeSlash(p,t));
      }
      return out;
    };
    P.effectiveTargets=function(p,c,ts){const out=effectiveTargets.call(this,p,c,ts);return isGuanLocked(this,p)?out.filter(t=>!blocked(p,t)):out;};
    P.activeSkills=function(p){const out=active.call(this,p);if(isGuan(this,p)){
      const usable=p.hand.some(c=>this.skillActionsFor(p,{...defs.slash,id:`wusheng-${c.id}`,virtual:true,costs:[c],rank:c.rank,suit:c.suit,originSkill:'wusheng'}).length);
      out.push({key:'wusheng',name:'武圣',detail:'一张手牌 → 杀'+(p.guanyuFocusId!=null?` · 追击${this.get(p.guanyuFocusId).name} ${p.guanyuFocusUses}/${p.guanyuFreeLimit}`:''),ready:usable,reason:'没有可转化的手牌或合法目标'});
    }return out;};
    P.guanyuConversions=function(p){return isGuan(this,p)?p.hand.map(c=>({...defs.slash,id:`wusheng-${c.id}`,virtual:true,rank:c.rank,suit:c.suit,originSkill:'wusheng',costs:[c]})).filter(c=>this.skillActionsFor(p,c).length):[];};
    P.aiPlay=function(p,actions){const result=aiPlay.call(this,p,actions.filter(a=>a.skill!=='wusheng'));if(!isGuan(this,p)||!actions.some(a=>a.skill==='wusheng'))return result;
      const worthwhile=this.guanyuConversions(p).some(c=>{
        const targets=this.targets(p,c).filter(t=>this.hostility(p,t)>0);
        return targets.length&&this.value(c.costs[0],p)<=8.5&&(this.guanyuFreeSlash(p,targets.find(t=>t.id===p.guanyuFocusId))||result.type==='end');
      });
      return worthwhile&&(result.type==='end'||result.type==='use'&&isSlash(p.hand.find(c=>c.id===result.cardId))&&this.guanyuFreeSlash(p,this.get(p.guanyuFocusId)))?{type:'skill',skill:'wusheng'}:result;
    };
    P.prepareActive=async function(p,a){
      if(a.skill!=='wusheng')return prepare.call(this,p,a);
      const cards=this.guanyuConversions(p);if(!cards.length)return null;
      const recommended=[...cards].sort((a,b)=>this.value(a.costs[0],p)-this.value(b.costs[0],p))[0];
      const id=await this.option(p,'武圣：选择当作杀的手牌',[...cards.map(c=>({key:c.id,label:`${c.costs[0].name} ${C.suitMark[c.suit]}${C.rankMark(c.rank)}`,card:c.costs[0]})),{key:'cancel',label:'取消'}],recommended.id,'转化任意一张手牌。');
      if(id==='cancel')return null;
      const c=cards.find(x=>x.id===id),actions=this.skillActionsFor(p,c);if(!c||!actions.length)return null;
      const enemies=actions.filter(a=>this.hostility(p,this.get(a.targets[0]))>0);
      const preferred=[...(enemies.length?enemies:actions)].sort((a,b)=>{
        const x=this.get(a.targets[0]),y=this.get(b.targets[0]);
        return Number(y.id===p.guanyuFocusId)-Number(x.id===p.guanyuFocusId)||this.hostility(p,y)-this.hostility(p,x)||x.hp-y.hp;
      })[0];
      const targetId=await this.option(p,'武圣：选择杀的目标',actions.map((a,i)=>({key:String(i),label:a.targets.map(k=>this.get(k).name).join('、')})),String(actions.indexOf(preferred)));
      const action=actions[Number(targetId)];if(!action)return null;
      const raw=this.removeHand(p,c.costs[0].id);this.log(`${p.name}发动【武圣】，将【${raw.name}】当作【杀】。`,'use');
      return {card:{...c,costs:[raw]},action};
    };
    P.responseSkillOptions=function(p,type,played=false){const out=responseOptions.call(this,p,type,played);if(type==='slash'&&isGuan(this,p))for(const c of [...p.hand].sort((a,b)=>this.value(a,p)-this.value(b,p)))if(!isSlash(c)&&this.allowedUse(p,{...defs.slash,virtual:true,costs:[c]},played))out.push({key:`wusheng:${c.id}`,label:`武圣：${c.name}当杀`,card:c});return out;};
    P.prepareResponseSkill=async function(p,key){if(!key.startsWith('wusheng:'))return prepareResponse.call(this,p,key);const id=key.slice(8),c=p.hand.find(x=>x.id===id);if(!isGuan(this,p)||!c)return null;const raw=this.removeHand(p,id);this.log(`${p.name}发动【武圣】，将【${raw.name}】当作【杀】响应。`,'response');return {...defs.slash,id:`wusheng-${raw.id}`,virtual:true,costs:[raw],suit:raw.suit,rank:raw.rank,originSkill:'wusheng'};};
    P.markCardUse=async function(p,c,ts){
      const focus=isGuan(this,p)&&isSlash(c)&&ts.some(t=>t.id===p.guanyuFocusId)&&this.isPlayPhaseOwner(p);
      const free=focus&&this.guanyuFreeSlash(p,this.get(p.guanyuFocusId));if(free)c.noQuota=true;
      const valid=await mark.call(this,p,c,ts);if(!valid||!focus)return valid;
      if(free)p.guanyuFocusUses++;
      const y=this.guanyuUnmarkedCount(p);if(y){this.draw(p,y);this.log(`${p.name}【武圣】追击${this.get(p.guanyuFocusId).name}，摸${y}张牌（其他无“义”者${y}人）。`,'draw');}
      return valid;
    };
    P.preventYiLethal=async function(source,target,amount){
      if(!isGuanLocked(this,source)||!isMarked(target,source)||target.hp>amount-Math.min(target.armor||0,amount))return false;
      target.yiOwners=target.yiOwners.filter(id=>id!==source.id);source.guanyuBlocked.push(target.id);
      this.log(`${source.name}【义绝】防止对${target.name}造成的${amount}点濒死伤害；移去“义”，本回合不能再指定其为目标。`,'system');this.change();
      return true;
    };
    P.slash=async function(source,target,c,nature='normal',amount=1){if(isGuanLocked(this,source)&&blocked(source,target))return;return slash.call(this,source,target,c,nature,amount);};
    P.death=async function(p,source){const wasGuan=isGuan(this,p);await death.call(this,p,source);p.yiOwners=[];if(wasGuan)for(const t of this.players)t.yiOwners=t.yiOwners.filter(id=>id!==p.id);};
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(p.yiOwners?.length)out.push('义');if(isGuan(this,p)&&!compact){out.push(`武圣：无义者 ${this.guanyuUnmarkedCount(p)} 人`);if(p.guanyuFocusId!=null&&this.isPlayPhaseOwner(p))out.push(`追击 ${this.get(p.guanyuFocusId).name} · 前 ${p.guanyuFreeLimit} 杀免次数，已用 ${p.guanyuFocusUses}`);}return out;};
  }
  const api={install};root.ZhenGuanyuSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
