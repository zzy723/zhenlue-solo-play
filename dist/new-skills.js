(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{defs,isSlash,isRed}=C;
    const init=P.initExtra,begin=P.beginTurnSkills,handChanged=P.handChanged,hpChanged=P.hpChanged;
    const flush=P.flushSkillEvents,slashAvailable=P.slashAvailable,canUse=P.canUse,targets=P.targets;
    const active=P.activeSkills,aiPlay=P.aiPlay,prepare=P.prepareActive,damage=P.damage;
    const handLimit=P.handLimit,dying=P.dying,slash=P.slash,damageFinished=P.damageFinished,cardTags=P.cardTags;
    const preparationSkills=P.preparationSkills,finishPhaseSkills=P.finishPhaseSkills;
    const openingSkills=P.openingSkills,heal=P.heal,death=P.death,showJudgment=P.showJudgment,drop=P.drop;
    const responseOptions=P.responseSkillOptions,prepareResponse=P.prepareResponseSkill;
    const mark=P.markCardUse,value=P.value;
    const colors={red:c=>isRed(c),black:c=>!isRed(c)};
    const dragonKeys={H:'peach',D:'fireSlash',C:'jink',S:'nullify'};
    P.initExtra=function(p){init.call(this,p);Object.assign(p,{zhihengUsed:0,zhajiangBonus:0,zhajiangRed:false,zhajiangLostCount:0,jianmieUsed:false,kangliIds:[],xianyingRound:-1,xianyingActivations:0,xianyingDiscardIds:[],xianfuTargetId:null});};
    P.selectXianfu=async function(p){
      const candidates=this.alive().filter(t=>t.id!==p.id);
      if(!candidates.length)return;
      const preferred=[...candidates].sort((a,b)=>this.hostility(p,a)-this.hostility(p,b)||b.hp-a.hp)[0];
      const id=await this.option(p,'先辅：选择一名其他角色',candidates.map(t=>({key:String(t.id),label:`${t.name} · ${this.general(t).name} · ${t.hp}血`})),String(preferred.id),'电脑优先选择队友。目标受伤或回复时你同步变化；目标阵亡时你减1点体力上限、回满血并重新选择。');
      const target=this.get(Number(id));p.xianfuTargetId=target.id;
      this.log(`${p.name}【先辅】选择了${target.name}。`,'system');
    };
    P.openingSkills=async function(){
      for(const p of this.actionOrder(this.alive().filter(t=>this.isGeneralLocked(t,'xizhicai'))))await this.selectXianfu(p);
      await openingSkills.call(this);
    };
    P.heal=function(p,n=1){
      const stack=this._xianfuHealStack||(this._xianfuHealStack=new Set());
      if(stack.has(p.id))return;
      stack.add(p.id);
      try{
        const before=p.hp;heal.call(this,p,n);
        const amount=p.hp-before;
        if(amount>0)for(const watcher of this.actionOrder(this.alive().filter(t=>this.isGeneralLocked(t,'xizhicai')&&t.xianfuTargetId===p.id)))if(!stack.has(watcher.id)){
          this.log(`${watcher.name}因【先辅】随${p.name}回复${amount}点体力。`,'heal');this.heal(watcher,amount);
        }
      }finally{stack.delete(p.id);}
    };
    P.afterDamageEvent=async function(source,target,amount,context){
      const visited=context.xianfuVisited||[target.id];
      for(const watcher of this.actionOrder(this.alive().filter(t=>this.isGeneralLocked(t,'xizhicai')&&t.xianfuTargetId===target.id))){
        if(this.over||!watcher.alive||visited.includes(watcher.id))continue;
        this.log(`${watcher.name}因【先辅】随${target.name}受到${amount}点伤害。`,'damage');
        await this.damage(null,watcher,amount,'normal',{skill:'xianfu',xianfuVisited:[...visited,watcher.id]});
      }
    };
    P.death=async function(p,source){
      const watchers=this.actionOrder(this.alive().filter(t=>this.isGeneralLocked(t,'xizhicai')&&t.id!==p.id&&t.xianfuTargetId===p.id));
      await death.call(this,p,source);
      for(const watcher of watchers){
        if(!watcher.alive||!this.isGeneralLocked(watcher,'xizhicai'))continue;
        watcher.xianfuTargetId=null;watcher.maxHp=Math.max(1,watcher.maxHp-1);if(watcher.hp>watcher.maxHp){const old=watcher.hp;watcher.hp=watcher.maxHp;this.hpChanged(watcher,old);}
        this.log(`${p.name}阵亡，${watcher.name}因【先辅】减1点体力上限并回复至满体力。`,'heal');
        this.heal(watcher,watcher.maxHp-watcher.hp);
        if(!this.over)await this.selectXianfu(watcher);
      }
    };
    P.showJudgment=async function(p,reason,card,harmful,outcome,rule){
      await showJudgment.call(this,p,reason,card,harmful,outcome,rule);
      if((this.isGeneral(p,'xizhicai')||this.isGeneral(p,'jieguojia'))&&p.alive){
        const key=await this.option(p,'天妒：获得这张判定牌？',[{key:'yes',label:`获得${card.name} · ${C.suitMark[card.suit]}${C.rankMark(card.rank)}`},{key:'no',label:'不获得'}],'yes');
        if(key==='yes')card.tianduOwner=p.id;
      }
    };
    P.drop=function(card){
      if(card?.tianduOwner!=null){
        const owner=this.get(card.tianduOwner);delete card.tianduOwner;
        if(owner?.alive&&(this.isGeneral(owner,'xizhicai')||this.isGeneral(owner,'jieguojia'))){
          const index=this.table.findIndex(c=>c.id===card.id);
          if(index>=0)this.table.splice(index,1);
          this.gain(owner,[card]);this.log(`${owner.name}发动【天妒】，获得判定牌【${card.name}】。`,'draw');return;
        }
      }
      return drop.call(this,card);
    };
    P.cardTags=function(p,c){const tags=cardTags.call(this,p,c);if(p.kangliIds?.includes(c.id))tags.push('伉厉待弃');return tags;};
    P.beginTurnSkills=function(){begin.call(this);for(const p of this.players){p.zhihengUsed=0;p.zhajiangBonus=0;p.zhajiangRed=false;p.zhajiangLostCount=0;p.jianmieUsed=false;p.xianyingDiscardIds=[];}};
    P.xianying=async function(p,reason){
      if(!p.alive||!this.isGeneral(p,'qinlang')||this.over)return;
      if(p.xianyingRound!==this.round){p.xianyingRound=this.round;p.xianyingActivations=0;}
      const first=p.xianyingActivations===0;
      const yes=await this.option(p,`贤膺：${reason}后摸两张牌？`,[{key:'yes',label:first?'发动贤膺，首次可弃一张':'发动贤膺，摸二弃一'},{key:'no',label:'不发动'}],'yes',first?'本轮首次发动，摸牌后可弃一张，也可不弃。':'摸牌后选择弃置一张牌；结束阶段可使用本回合弃的牌，或摸等量的牌。');
      if(yes!=='yes')return;
      p.xianyingActivations++;this.draw(p,2);
      const cheapest=[...p.hand].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const discard=!first||(cheapest&&await this.option(p,'贤膺：本轮首次可弃一张牌',[{key:'discard',label:'弃置一张牌，计入结束阶段收益'},{key:'keep',label:'不弃牌'}],this.value(cheapest,p)<=5?'discard':'keep')==='discard');
      let discarded=false;
      if(discard&&p.hand.length){
        const ids=await this.selectCards(p,'贤膺：弃置一张牌',p.hand,1,1,[cheapest.id],'结束阶段可使用以此法弃的牌，或摸等量的牌。');
        this.discardOwned(p,ids);p.xianyingDiscardIds.push(ids[0]);discarded=true;
      }
      this.log(`${p.name}发动【贤膺】摸两张牌${discarded?'，弃置一张牌':'，未弃牌'}。`,'draw');
    };
    P.preparationSkills=async function(p){await preparationSkills.call(this,p);await this.xianying(p,'准备阶段');};
    P.finishPhaseSkills=async function(p){await finishPhaseSkills.call(this,p);
      for(const q of this.actionOrder(this.alive().filter(t=>this.isGeneral(t,'qinlang')&&t.xianyingDiscardIds.length))){
        if(this.over)break;
        const ids=q.xianyingDiscardIds.splice(0),available=ids.filter(id=>this.discard.some(c=>c.id===id));
        const options=[{key:'draw',label:`摸${ids.length}张牌`}];if(available.length)options.unshift({key:'use',label:`依次使用${available.length}张弃牌`});options.push({key:'pass',label:'放弃'});
        const key=await this.option(q,'贤膺：结束阶段选择收益',options,available.some(id=>{const c=this.discard.find(x=>x.id===id);return c&&this.cardPlan(q,c);})?'use':'draw',`本回合因贤膺弃置${ids.length}张，其中${available.length}张仍在弃牌堆。`);
        if(key==='draw'){this.draw(q,ids.length);this.log(`${q.name}【贤膺】摸${ids.length}张牌。`,'draw');continue;}
        if(key!=='use')continue;
        for(const id of available){
          if(!q.alive||this.over)break;
          const i=this.discard.findIndex(c=>c.id===id);if(i<0)continue;
          const card=this.discard.splice(i,1)[0];this.gain(q,[card]);
          const before=q.slashUsed;if(isSlash(card))q.slashUsed=0;
          try{
            const actions=this.skillActionsFor(q,card),plan=this.cardPlan(q,card);
            if(actions.length){
              const opts=actions.map((a,i)=>({key:String(i),label:`使用${card.name}${a.targets.length?' → '+a.targets.map(t=>this.get(t).name).join('、'):''}`}));opts.push({key:'skip',label:`跳过${card.name}`});
              const suggested=plan?String(actions.findIndex(a=>JSON.stringify(a)===JSON.stringify(plan))):'skip';
              const choice=card.key==='chain'?await this.chooseChainTargets(q,`贤膺：使用弃置的${card.name}？`,actions,suggested,[{key:'skip',label:`跳过${card.name}`} ]):await this.option(q,`贤膺：使用弃置的${card.name}？`,opts,suggested);
              if(choice!=='skip'){await this.useAction(q,actions[Number(choice)]);continue;}
            }
            const {card:unused}=this.removeOwned(q,id);this.putDiscard(unused);
          }finally{q.slashUsed=before;}
        }
        this.log(`${q.name}【贤膺】结束阶段依次处理了弃置的牌。`,'use');
      }
    };
    P.handChanged=function(p,before){handChanged.call(this,p,before);if(before!==p.hand.length)this.queueShangshi(p);};
    P.hpChanged=function(p,old){hpChanged.call(this,p,old);if(p.hp!==old)this.queueShangshi(p);};
    P.queueShangshi=function(p){if(p.alive&&this.isGeneral(p,'jiezhangchunhua')&&p.hand.length<Math.max(0,p.maxHp-p.hp)){
      (this._shangshiEvents||(this._shangshiEvents=[])).push({id:p.id,generation:p.generation});
    }};
    P.flushSkillEvents=async function(){await flush.call(this);if(this._flushingShangshi||this.over)return;
      this._flushingShangshi=true;try{while(this._shangshiEvents?.length&&!this.over){
        const e=this._shangshiEvents.shift(),p=this.get(e.id),x=Math.max(0,p.maxHp-p.hp);
        if(!p.alive||p.generation!==e.generation||!this.isGeneral(p,'jiezhangchunhua')||p.hand.length>=x)continue;
        const yes=await this.option(p,`伤逝：将手牌摸至${x}张？`,[{key:'yes',label:'发动伤逝'},{key:'no',label:'不发动'}],'yes',`已损失${x}点体力，当前${p.hand.length}张手牌。`);
        if(yes==='yes'){this.log(`${p.name}发动【伤逝】，将手牌摸至${x}张。`,'draw');this.draw(p,x-p.hand.length);}
      }}finally{this._flushingShangshi=false;}
    };
    P.afterLoseHp=async function(p,n,reason){if(!this.isGeneral(p,'jiehuanggai'))return;
      let count=0;for(let i=0;i<n;i++){p.zhajiangLostCount++;count+=Math.min(5,3+p.zhajiangLostCount);}this.draw(p,count);if(this.isPlayPhaseOwner(p)){p.zhajiangBonus+=n;p.zhajiangRed=true;}
      this.log(`${p.name}【诈降】本回合累计失去${p.zhajiangLostCount}点体力，摸${count}张牌${this.isPlayPhaseOwner(p)?`，本回合可额外使用${p.zhajiangBonus}张杀`:''}。`,'draw');
    };
    P.slashAvailable=function(p){
      if(slashAvailable.call(this,p))return true;
      const extra=(!this.options.legacyRules&&this.isGeneral(p,'wuyi')?1:0)
        +(this.isGeneral(p,'jiehuanggai')?p.zhajiangBonus:0)
        +(this.options.mode==='landlord'&&p.role==='地主'?1:0);
      return p.slashUsed<1+extra;
    };
    P.dragonCards=function(p,type=null,played=false){if(!this.isGeneral(p,'shenzhaoyun'))return [];
      const pool=this.owned(p).filter(c=>dragonKeys[c.suit]&&(!type||dragonKeys[c.suit]===type));
      const out=[];for(const c of pool){out.push(this.dragonCard([c]));for(const d of pool)if(d.id>c.id&&d.suit===c.suit)out.push(this.dragonCard([c,d]));}
      return out.filter(c=>this.allowedUse(p,c,played));
    };
    P.dragonCard=function(costs){const suit=costs[0].suit,key=dragonKeys[suit];return {...defs[key],id:'longhun-'+costs.map(c=>c.id).join('-'),virtual:true,costs,suit,rank:costs[0].rank,originSkill:'longhun',dragonDouble:costs.length===2};};
    P.dragonCostLabel=function(p,c){const zone=p.hand.some(x=>x.id===c.id)?'手牌':'装备',tags=this.cardTags(p,c);return `${zone}${C.suitMark[c.suit]}${C.rankMark(c.rank)}【${c.name}】${tags.length?'（'+tags.join('、')+'）':''}`;};
    P.prepareDragon=async function(p,c){if(!c||!this.isGeneral(p,'shenzhaoyun')||!c.costs.every(x=>this.owned(p).some(y=>y.id===x.id)))return null;
      const costs=this.withLoss('use',()=>this.moveBatch(p,()=>c.costs.map(x=>this.removeOwned(p,x.id).card)));
      this.table.push(...costs);
      const card=this.dragonCard(costs);
      this.log(`${p.name}发动【龙魂】，以${costs.length}张${C.suitMark[card.suit]}牌视为【${card.name}】。`,'use');
      if(card.dragonDouble&&!isRed(card)){const current=this.get(this.turn);if(current?.alive&&this.owned(current,true).length){
        if(current.id===p.id){const pool=this.owned(current,true),id=await this.option(p,'龙魂：弃置自己的一张牌',pool.map(x=>({key:x.id,label:x.name,card:x})),[...pool].sort((a,b)=>this.value(a,p)-this.value(b,p))[0].id);this.discardOwned(p,[id]);}
        else await this.takeOtherCard(p,current,'discard',true);
        this.log(`【龙魂】两张黑色牌：弃置当前回合角色一张牌。`,'system');
      }}
      return card;
    };
    P.canUse=function(p,c){if(c.originSkill==='longhun'&&isSlash(c))return this.slashAvailable(p)&&this.alive().some(t=>this.canSlash(p,t));
      if(this.isGeneral(p,'jiehuanggai')&&isSlash(c)&&isRed(c)&&this.isPlayPhaseOwner(p)&&p.zhajiangRed)return this.slashAvailable(p)&&this.alive().some(t=>t.alive&&t.id!==p.id);
      return canUse.call(this,p,c);
    };
    P.targets=function(p,c){if(this.isGeneral(p,'jiehuanggai')&&isSlash(c)&&isRed(c)&&this.isPlayPhaseOwner(p)&&p.zhajiangRed)return this.alive().filter(t=>t.id!==p.id);
      return targets.call(this,p,c);
    };
    P.markCardUse=async function(p,c,ts){if(this.isGeneral(p,'jiehuanggai')&&isSlash(c)&&isRed(c)&&p.zhajiangRed&&this.isPlayPhaseOwner(p))c.noCancel=true;return mark.call(this,p,c,ts);};
    P.zhihengLimit=function(){return Math.max(0,this.alive().length-1);};
    P.value=function(c,p){const base=value.call(this,c,p);return base+(this.isGeneral(p,'shenzhaoyun')&&['H','S'].includes(c?.suit)?4:0);};
    P.activeSkills=function(p){const list=active.call(this,p);
      if(this.isGeneral(p,'jiesunquan'))list.push({key:'zhiheng',name:'制衡',detail:`本阶段${p.zhihengUsed}/${this.zhihengLimit()}次`,ready:p.zhihengUsed<this.zhihengLimit()&&this.owned(p).length>0});
      if(this.isGeneral(p,'jiehuanggai'))list.push({key:'kurou',name:'苦肉',detail:'弃一张牌并失去1体力 · 不限次',ready:this.owned(p).length>0});
      if(this.isGeneral(p,'jiezhangchunhua'))list.push({key:'jianmie',name:'翦灭',detail:'双方暗选颜色 · 每阶段一次',ready:!p.jianmieUsed&&this.alive().length>1});
      if(this.isGeneral(p,'shenzhaoyun'))list.push({key:'longhun',name:'龙魂',detail:'红桃→桃 / 方片→火杀；梅花、黑桃可响应',ready:this.dragonCards(p).some(c=>['peach','fireSlash'].includes(c.key)&&this.skillActionsFor(p,c).length>0)});
      return list;
    };
    P.aiPlay=function(p,actions){let ordinary=actions.filter(a=>!['zhiheng','kurou','jianmie','longhun'].includes(a.skill));
      if(this.isGeneral(p,'shenzhaoyun')&&p.hand.length<=this.handLimit(p))ordinary=ordinary.filter(a=>!(a.type==='use'&&p.hand.find(c=>c.id===a.cardId)?.key==='peach'));
      const rest=aiPlay.call(this,p,ordinary);
      const skills=actions.filter(a=>a.type==='skill');
      if(skills.some(a=>a.skill==='kurou')&&p.hp>1&&(p.zhajiangLostCount||0)<3&&
        this.owned(p).some(c=>this.value(c,p)<7))return skills.find(a=>a.skill==='kurou');
      if(skills.some(a=>a.skill==='jianmie')&&this.alive().some(t=>this.hostility(p,t)>0))return skills.find(a=>a.skill==='jianmie');
      if(rest.type==='end'&&skills.some(a=>a.skill==='longhun')&&((p.hp<p.maxHp&&p.hand.length>this.handLimit(p)&&this.dragonCards(p,'peach').length)||this.dragonCards(p,'fireSlash').some(c=>this.skillActionsFor(p,c).some(a=>this.hostility(p,this.get(a.targets[0]))>0))))return skills.find(a=>a.skill==='longhun');
      if(rest.type==='end'&&skills.some(a=>a.skill==='zhiheng')&&this.zhihengPlan(p).length)return skills.find(a=>a.skill==='zhiheng');
      return rest;
    };
    P.prepareActive=async function(p,a){if(!['zhiheng','kurou','jianmie','longhun'].includes(a.skill))return prepare.call(this,p,a);
      if(!this.activeSkills(p).some(s=>s.key===a.skill&&s.ready))return null;
      if(a.skill==='zhiheng'){await this.zhiheng(p);return null;}
      if(a.skill==='kurou'){await this.kurou(p);return null;}
      if(a.skill==='jianmie'){await this.jianmie(p);return null;}
      const cards=this.dragonCards(p).filter(c=>['peach','fireSlash'].includes(c.key)&&this.skillActionsFor(p,c).length),preferred=cards.find(c=>c.key==='peach'&&p.hp<p.maxHp)||cards.find(c=>c.key==='fireSlash'&&this.cardPlan(p,c))||cards[0];
      let c;
      if(cards.some(card=>card.id===this.replay[this.replayIndex])){
        const id=await this.option(p,'龙魂：选择转化牌',[...cards.map(card=>({key:card.id,label:`${C.suitMark[card.suit]}${card.costs.length}张 → ${card.name}${card.dragonDouble?'（强化）':''}`})),{key:'cancel',label:'取消'}],preferred.id);
        if(id==='cancel')return null;
        c=cards.find(card=>card.id===id);
      }else{
        const sources=[...new Map(cards.flatMap(card=>card.costs).map(source=>[source.id,source])).values()];
        const firstId=await this.option(p,'龙魂：选择第一张牌',[...sources.map(source=>({key:source.id,label:`${this.dragonCostLabel(p,source)} → ${this.dragonCard([source]).name}`,card:source,dragonChoice:true})),{key:'cancel',label:'取消'}],preferred.costs[0].id,'点击下方选项或直接点击手牌；红桃当桃，方片当火杀。');
        if(firstId==='cancel')return null;
        const single=cards.find(card=>card.costs.length===1&&card.costs[0].id===firstId),pairs=cards.filter(card=>card.costs.length===2&&card.costs.some(source=>source.id===firstId));
        c=single;
        if(pairs.length){
          const options=[...(single?[{key:'single',label:'只用这一张',dragonChoice:true}]:[]),...pairs.map(pair=>{const next=pair.costs.find(source=>source.id!==firstId);return {key:next.id,label:`再加${this.dragonCostLabel(p,next)} → 强化${pair.name}`,card:next,dragonChoice:true};}),{key:'cancel',label:'取消龙魂'}];
          const secondId=await this.option(p,'龙魂：是否再选一张同花色牌强化？',options,preferred.costs.length===2&&preferred.costs.some(source=>source.id===firstId)?preferred.costs.find(source=>source.id!==firstId).id:single?'single':options[0].key,'可点击另一张同花色手牌，或选择只用第一张。');
          if(secondId==='cancel')return null;
          if(secondId!=='single')c=pairs.find(pair=>pair.costs.some(source=>source.id===secondId));
        }
      }
      if(!c)return null;
      const actions=this.skillActionsFor(p,c),best=this.cardPlan(p,c)||actions[0];let action=best;
      if(actions.length>1){const i=await this.option(p,'龙魂：选择目标',actions.map((a,i)=>({key:String(i),label:a.targets.map(id=>this.get(id).name).join('、')||'自己'})),String(Math.max(0,actions.findIndex(a=>JSON.stringify(a)===JSON.stringify(best)))));action=actions[Number(i)];}
      const card=await this.prepareDragon(p,c);return card?{card,action}:null;
    };
    P.zhihengPlan=function(p){
      // 此处只在常规出牌已经结束后调用，遵守界孙权「用不出牌就全制衡」。
      return this.owned(p).map(c=>c.id);
    };
    P.zhiheng=async function(p){const pool=this.owned(p),limit=this.zhihengLimit();if(p.zhihengUsed>=limit||!pool.length)return;
      const suggested=this.zhihengPlan(p);
      const ids=await this.selectCards(p,`制衡：选择弃置的牌（${p.zhihengUsed+1}/${limit}次）`,pool,1,pool.length,suggested,'弃多少摸多少；若弃置了当前所有手牌，额外摸一张。');
      const allHand=p.hand.length>0&&p.hand.every(c=>ids.includes(c.id));p.zhihengUsed++;this.discardOwned(p,ids);this.draw(p,ids.length+(allHand?1:0));this.log(`${p.name}发动【制衡】，弃${ids.length}摸${ids.length+(allHand?1:0)}。`,'draw');await this.flushSkillEvents();
    };
    P.kurou=async function(p){const pool=this.owned(p);if(!pool.length)return;
      const best=[...pool].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const id=await this.option(p,'苦肉：弃置一张牌',pool.map(c=>({key:c.id,label:c.name,card:c})),best.id,'本阶段不限次数；随后失去1体力，诈降摸三张。');
      this.discardOwned(p,[id]);await this.loseHp(p,1,'苦肉');await this.flushSkillEvents();
    };
    P.jianmie=async function(p){const targets=this.alive().filter(t=>t.id!==p.id);if(p.jianmieUsed||!targets.length)return;
      const t=await this.pickRole(p,'翦灭：选择一名其他角色',targets);
      const chooseColor=async x=>this.option(x,'翦灭：暗选要弃置的颜色',[{key:'red',label:'红色'},{key:'black',label:'黑色'}],['red','black'].sort((a,b)=>x.hand.filter(colors[a]).reduce((n,c)=>n+this.value(c,x),0)-x.hand.filter(colors[b]).reduce((n,c)=>n+this.value(c,x),0))[0],'双方选定后同时公开并弃置。');
      const own=await chooseColor(p),other=await chooseColor(t);
      p.jianmieUsed=true;
      const ownIds=p.hand.filter(colors[own]).map(c=>c.id),otherIds=t.hand.filter(colors[other]).map(c=>c.id);
      this.discardOwned(p,ownIds);this.discardOwned(t,otherIds);
      this.log(`${p.name}发动【翦灭】：双方分别弃置${ownIds.length}张、${otherIds.length}张所选颜色手牌。`,'system');
      const source=ownIds.length>otherIds.length?p:otherIds.length>ownIds.length?t:null,target=source===p?t:p;
      if(source&&source.alive&&target.alive&&!this.over){const card={...defs.duel,id:'jianmie',virtual:true,costs:[],rank:0,suit:'N',originSkill:'jianmie'},ts=[target];
        this.log(`${source.name}因【翦灭】视为对${target.name}使用【决斗】。`,'use');
        const valid=await this.markCardUse(source,card,ts);if(valid&&await this.trickAllowed(source,target,card))await this.singleTrick(source,target,card);await this.afterCardUse(source,card,ts);
      }await this.flushSkillEvents();
    };
    P.resolvePeach=async function(p,card){const lord=this.players.find(t=>t.alive&&t.role==='主公'&&this.isGeneral(t,'jiesunquan'));
      if(lord&&lord.id!==p.id&&this.general(p).faction==='吴'&&p.hp>lord.hp&&lord.hp<lord.maxHp){
        const key=await this.option(p,'救援：将这张桃改为救孙权？',[{key:'lord',label:'令孙权回复1体力，自己摸1张'},{key:'self',label:'自己使用桃'}],this.hostility(p,lord)<0?'lord':'self');
        if(key==='lord'){this.heal(lord);this.draw(p,1);this.evidence(p,lord,true);this.log(`${p.name}发动【救援】，令${lord.name}回复1点体力并摸一张牌。`,'heal');return;}
      }this.heal(p,card.dragonDouble&&card.suit==='H'?2:1);
    };
    P.damage=async function(source,target,amount=1,nature='normal',context={}){if(source?.alive&&this.isGeneralLocked(source,'jiezhangchunhua')&&target?.alive&&!this.over){
      this.log(`${source.name}【绝情】将对${target.name}的${amount}点伤害改为失去体力。`,'system');await this.loseHp(target,amount,'绝情');return amount;
    }return damage.call(this,source,target,amount,nature,context);};
    P.damageFinished=async function(source,target,amount,context,generation){
      if(source?.alive&&source.kangliIds?.length){
        const ids=source.kangliIds,owned=this.owned(source).filter(c=>ids.includes(c.id)).map(c=>c.id);
        source.kangliIds=[];
        if(owned.length)this.discardOwned(source,owned);
        this.log(`${source.name}【伉厉】下次造成伤害，弃置${owned.length}张仍持有的待弃牌。`,'system');
      }
      await damageFinished.call(this,source,target,amount,context,generation);
      if(this.over)return;
      const triggers=[source,target].filter((p,i,list)=>p?.alive&&p.generation===(p===target?generation:p.generation)&&this.isGeneral(p,'sunli')&&list.indexOf(p)===i);
      for(const p of triggers){
        const yes=await this.option(p,'伉厉：造成或受到伤害后摸两张牌？',[{key:'yes',label:'发动伉厉，摸两张牌'},{key:'no',label:'不发动'}],'yes','这些牌若仍由你持有，会在你下次造成伤害时弃置。');
        if(yes!=='yes')continue;
        const before=new Set(p.hand.map(c=>c.id));this.draw(p,2);
        const gained=p.hand.filter(c=>!before.has(c.id));p.kangliIds.push(...gained.map(c=>c.id));
        this.log(`${p.name}发动【伉厉】，摸${gained.length}张牌；当前共有${p.kangliIds.length}张待弃牌。`,'draw');
      }
      if(target.alive&&target.generation===generation)await this.xianying(target,'受到伤害');
      if(target.alive&&target.generation===generation&&this.isGeneral(target,'xizhicai'))for(let i=0;i<amount&&target.alive&&!this.over;i++){
        const yes=await this.option(target,`筹策：受到伤害第${i+1}/${amount}点，是否判定？`,[{key:'yes',label:'发动筹策，进行判定'},{key:'no',label:'不发动'}],'yes');
        if(yes!=='yes')continue;
        let card=this.takeTop();if(!card)continue;
        this.table.push(card);card=await this.reviseJudgment(target,'筹策',card);
        const red=isRed(card);
        await this.showJudgment(target,'筹策',card,false,red?'红色：令一名角色摸牌':'黑色：弃置一名角色区域内一张牌','红色摸牌，先辅目标改摸两张；黑色弃置牌');
        this.drop(card);
        if(red){
          const candidates=this.alive(),preferred=[...candidates].sort((a,b)=>this.hostility(target,a)-this.hostility(target,b)||a.hand.length-b.hand.length)[0];
          const recipient=await this.pickRole(target,'筹策：选择摸牌角色',candidates,true,preferred);
          const count=recipient.id===target.xianfuTargetId?2:1;
          this.draw(recipient,count);this.log(`${target.name}【筹策】红色判定，令${recipient.name}摸${count}张牌。`,'draw');
        }else{
          const candidates=this.alive().filter(t=>this.owned(t,true).length);
          if(!candidates.length)continue;
          const preferred=[...candidates].sort((a,b)=>this.hostility(target,b)-this.hostility(target,a))[0];
          const victim=await this.pickRole(target,'筹策：选择弃牌角色',candidates,false,preferred);
          if(victim.id===target.id){
            const cards=this.owned(victim,true),cheapest=[...cards].sort((a,b)=>this.value(a,victim)-this.value(b,victim))[0];
            const id=await this.option(target,'筹策：选择自己的一张牌',cards.map(c=>({key:c.id,label:c.name,card:c})),cheapest.id);
            this.discardOwned(victim,[id]);
          }else await this.takeOtherCard(target,victim,'discard',true);
          this.log(`${target.name}【筹策】黑色判定，弃置了${victim.name}区域内一张牌。`,'discard');
        }
      }
    };
    P.handLimit=function(p){return handLimit.call(this,p)+(this.isGeneralLocked(p,'shenzhaoyun')?this.round+2:0);};
    P.dying=async function(p,source){const trigger=this.isGeneralLocked(p,'shenzhaoyun')&&p.hp<=0;
      if(trigger){this.draw(p,1);this.log(`${p.name}【绝境】进入濒死，摸一张牌。`,'draw');}
      await dying.call(this,p,source);
      if(trigger&&p.alive&&p.hp>0){this.draw(p,1);this.log(`${p.name}【绝境】脱离濒死，摸一张牌。`,'draw');}
    };
    P.slash=async function(source,target,card,nature='normal',amount=1){return slash.call(this,source,target,card,nature,amount+(card.dragonDouble&&card.suit==='D'?1:0));};
    P.responseSkillOptions=function(p,type,played=false){const out=responseOptions.call(this,p,type,played),key=type==='slash'?'fireSlash':type;
      if(!['peach','fireSlash','jink','nullify'].includes(key))return out;
      for(const c of this.dragonCards(p,key,played))out.push({key:'longhun:'+key+':'+c.costs.map(x=>x.id).join(','),label:`龙魂：${c.costs.map(x=>this.dragonCostLabel(p,x)).join('＋')} → ${c.name}${c.dragonDouble?'（强化）':''}`,dragonChoice:true});
      return out;
    };
    P.prepareResponseSkill=async function(p,key){if(!key.startsWith('longhun:'))return prepareResponse.call(this,p,key);
      const [,name,ids]=key.split(':'),wanted=ids.split(',');const card=this.dragonCards(p,name,true).find(c=>c.costs.length===wanted.length&&c.costs.every(x=>wanted.includes(x.id)));
      return card?this.prepareDragon(p,card):null;
    };
  }
  const api={install};root.ZhenNewSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
