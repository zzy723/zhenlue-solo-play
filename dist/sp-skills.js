(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{defs,isRed,isSlash}=C;
    const black=c=>c&&['S','C'].includes(c.suit),color=c=>isRed(c)?'red':black(c)?'black':'none';
    const init=P.initExtra,begin=P.beginTurnSkills,canUse=P.canUse,targets=P.targets,mark=P.markCardUse;
    const active=P.activeSkills,aiPlay=P.aiPlay,prepare=P.prepareActive,prepareResponse=P.prepareResponseSkill;
    const responseOptions=P.responseSkillOptions,after=P.afterCardUse,damage=P.damage,damageFinished=P.damageFinished;
    const response=P.response,dying=P.dying,preparation=P.preparationSkills,death=P.death;
    const useAction=P.useAction,takePhysical=P.takePhysical,dynastyStates=P.dynastyStates;
    P.initExtra=function(p){init.call(this,p);Object.assign(p,{spGrantedSkills:[],spXudaiUsed:false,spZhujiuBlocked:false,spWineCount:0,spZhujiuPrintCount:0,spJingleiUsed:false,spAwakened:false,spUsedAttacks:{slash:[],duel:[]},spWoodPile:[],spActivated:[],spJisiUsed:false});};
    P.beginTurnSkills=function(){begin.call(this);this.spBasicCount=0;this.spDyingCount=0;for(const p of this.players){p.spZhujiuBlocked=false;p.spWineCount=0;p.spZhujiuPrintCount=0;p.spJingleiUsed=false;p.spUsedAttacks={slash:[],duel:[]};}};
    P.hasSp=function(p,key){const locked=key==='qianmeng'&&p?.dujuSilence&&!p.dujuSilence.wasSilenced&&!p.restrictionUntil;return !!p?.alive&&(!p.silenced||locked)&&(key==='zhujiu'&&p.general==='spliubei'||key!=='zhujiu'&&p.general==='caoxiancaohua'&&['huamu','qianmeng','liangyuan','jisi'].includes(key)||(p.spGrantedSkills||[]).includes(key));};
    P.spWoods=function(kind){return this.players.flatMap(p=>(p.spWoodPile||[]).filter(c=>kind==='black'?black(c):isRed(c)));};
    P.spCostPool=function(p,key){return this.owned(p).filter(c=>this.allowedUse(p,{...defs[key],virtual:true,costs:[c]}));};
    P.dynastyStates=function(p,compact=false){const states=dynastyStates.call(this,p,compact);if(compact){
      if(p.spWoodPile?.length)states.push(`灵杉${p.spWoodPile.filter(black).length} / 玉树${p.spWoodPile.filter(isRed).length}`);
      if(p.spGrantedSkills?.length)states.push('获赠 '+p.spGrantedSkills.map(k=>({zhujiu:'煮酒',huamu:'化木',qianmeng:'前盟',liangyuan:'良缘'}[k]||k)).join('、'));
    }return states;};
    P.spWoodChanged=function(p){
      const pile=p.spWoodPile||[],a=pile.filter(black).length,b=pile.filter(isRed).length;
      if(a===b||a===0||b===0)for(const owner of this.actionOrder(this.alive()))if(this.hasSp(owner,'qianmeng')){
        this.draw(owner,1);if(owner.general==='caoxiancaohua'&&!owner.spActivated.includes('qianmeng'))owner.spActivated.push('qianmeng');
        this.log(`${owner.name}【前盟】因${p.name}灵杉/玉树变化摸一张牌。`,'draw');
      }
    };
    P.takePhysical=function(id){for(const p of this.players){const pile=p.spWoodPile||[],i=pile.findIndex(c=>c.id===id);if(i>=0){const c=pile.splice(i,1)[0];this.spWoodChanged(p);return c;}}return takePhysical.call(this,id);};
    P.invariant=function(){const cards=this.players.flatMap(p=>p.spWoodPile||[]),base=[...this.deck,...this.discard,...this.table,...(this.exiled||[]),...this.players.flatMap(p=>[...this.owned(p,true),...p.sealedPile,...p.luPile,...(p.zhoutaiChuang||[]),...(p.caiyongBooks||[]),...(p.jiaxuWei||[]),...(p.yuanshaoMeng||[]),...(p.liruZhen?[p.liruZhen.card]:[])])];const ids=[...base,...cards].map(c=>c.id);if(ids.length!==this.allCards.length||new Set(ids).size!==ids.length)throw Error('卡牌区域或总数异常');for(const p of this.players){if(p.hp>p.maxHp)throw Error('体力超过上限');if(p.alive&&p.hp<=0&&!this.pending)throw Error('濒死角色未结算');}return true;};
    P.canUse=function(p,c){
      if(c.originSkill==='xixiang'&&isSlash(c))return p.alive&&this.allowedUse(p,c)&&this.alive().some(t=>t.id!==p.id);
      if(c.key==='wine'&&c.originSkill==='zhujiu')return p.alive&&(p.hp<=0||!p.wineUsed)&&this.allowedUse(p,c);
      if(c.key==='wine'&&c.originSkill==='liangyuan')return p.alive&&this.allowedUse(p,c);
      return canUse.call(this,p,c);
    };
    P.targets=function(p,c){if(c.originSkill==='xixiang'&&isSlash(c))return this.alive().filter(t=>t.id!==p.id);return targets.call(this,p,c);};
    P.markCardUse=async function(p,c,ts){
      c.spPrevColor=this.spLastColor;c.spFromHand=!!this.spUsingHandCardId&&this.spUsingHandCardId===c.id;
      if(c.key==='wine'){p.spWineCount=(p.spWineCount||0)+1;if(c.originSkill==='zhujiu'){c.spFirstPrint=(p.spZhujiuPrintCount||0)===0;p.spZhujiuPrintCount=(p.spZhujiuPrintCount||0)+1;}}
      if(c.kind==='basic')this.spBasicCount=(this.spBasicCount||0)+1;
      this.spLastColor=color(c);
      return mark.call(this,p,c,ts);
    };
    P.useAction=async function(p,a){const previous=this.spUsingHandCardId;this.spUsingHandCardId=a.type==='use'&&p.hand.some(c=>c.id===a.cardId)?a.cardId:null;try{return await useAction.call(this,p,a);}finally{this.spUsingHandCardId=previous;}};
    P.spAttackChoices=function(p,skill){
      if(!p.alive)return [];
      const x=(this.spBasicCount||0)+1,out=[];
      for(const key of ['slash','duel']){if(skill==='xixiang'&&this.spCostPool(p,key).length<x)continue;
        for(const t of this.alive())if(t.id!==p.id&&!p.spUsedAttacks[key].includes(t.id))out.push({key:key+':'+t.id,label:`${defs[key].name} → ${t.name}（需${x}张）`,type:key,target:t});}
      return out;
    };
    P.spAttackPlan=function(p,skill){
      const x=(this.spBasicCount||0)+1,bestCost={};
      if(skill==='xixiang')for(const key of ['slash','duel'])bestCost[key]=[...this.spCostPool(p,key)]
        .sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,x);
      let best=null;
      for(const choice of this.spAttackChoices(p,skill)){
        const t=choice.target;if(this.hostility(p,t)<=0)continue;
        if(skill==='xixiang'){
          const cards=bestCost[choice.type];if(cards.length<x)continue;
          const cost=cards.reduce((sum,c)=>sum+this.value(c,p),0);
          const damage=choice.type==='slash'?(t.hand.length===0?5.5:3.6):
            (p.hand.filter(isSlash).length>=t.hand.length?4:1.5);
          const reward=(t.hp>p.hand.length-x?2:0)+(t.hp>p.hp?3:0);
          const score=damage+reward+(t.hp<=1?2:0)-cost*.75-(p.hp<=2&&choice.type==='duel'?3:0);
          if(!best||score>best.score)best={choice,score};
        }else{
          const canForce=this.owned(t).length>=x;
          const guarded=choice.type==='slash'?p.hand.some(c=>c.key==='jink')||p.equip.armor?.key==='eightDiagram':p.hand.some(isSlash);
          const score=canForce?(p.hp>2?5:guarded?2:-4)+Math.min(2,t.hand.length):
            (p.hp<p.maxHp?6:0);
          if(!best||score>best.score)best={choice,score};
        }
      }
      return best;
    };
    P.activeSkills=function(p){const list=active.call(this,p),x=(this.spBasicCount||0)+1;
      if(this.hasSp(p,'zhujiu'))list.push({key:'zhujiu',name:'煮酒',detail:`至少${p.spWineCount+1}张牌当酒 · 首次摸1张`,ready:!p.spZhujiuBlocked&&this.spCostPool(p,'wine').length>=p.spWineCount+1&&this.canUse(p,{...defs.wine,originSkill:'zhujiu'}),reason:p.spZhujiuBlocked?'本回合曾以非全黑牌煮酒':p.wineUsed&&p.hp>0?'本回合非濒死状态已用酒':'牌数不足'});
      if(this.isGeneral(p,'spcaocao'))list.push({key:p.spAwakened?'zhubei':'xixiang',name:p.spAwakened?'逐北':'西向',detail:`每名角色每种牌各一次 · 需${x}张`,ready:this.spAttackChoices(p,p.spAwakened?'zhubei':'xixiang').length>0});
      if(this.hasSp(p,'liangyuan'))list.push({key:'liangyuan',name:'良缘',detail:`灵杉${this.spWoods('black').length} / 玉树${this.spWoods('red').length} · 不限次`,ready:this.spWoods('black').length>0||this.spWoods('red').length>0&&p.hp<p.maxHp});
      if(this.hasSp(p,'jisi'))list.push({key:'jisi',name:'羁肆',detail:p.spJisiUsed?'限定技已用':'准备阶段弃一张牌赠技能',ready:false,reason:p.spJisiUsed?'限定技已使用':'准备阶段发动'});
      return list;
    };
    P.aiPlay=function(p,actions){const own=['zhujiu','xixiang','zhubei','liangyuan'],rest=aiPlay.call(this,p,actions.filter(a=>!own.includes(a.skill))),skills=actions.filter(a=>own.includes(a.skill));
      const liangyuan=skills.find(a=>a.skill==='liangyuan');if(liangyuan&&p.hp<p.maxHp&&this.spWoods('red').length)return liangyuan;
      const xixiang=skills.find(a=>a.skill==='xixiang'),attack=this.spAttackPlan(p,'xixiang');
      const next=rest.type==='use'?p.hand.find(c=>c.id===rest.cardId):null;
      if(xixiang&&attack?.score>0&&(rest.type==='end'||next?.kind==='basic'&&attack.score>2))return xixiang;
      const zhubei=skills.find(a=>a.skill==='zhubei');if(zhubei&&rest.type==='end'&&this.spAttackPlan(p,'zhubei')?.score>0)return zhubei;
      const zhujiu=skills.find(a=>a.skill==='zhujiu');if(zhujiu&&rest.type==='end'&&!p.drunk&&this.slashAvailable(p)&&p.hand.some(isSlash)&&this.alive().some(t=>this.canSlash(p,t)&&this.hostility(p,t)>0))return zhujiu;
      if(liangyuan&&rest.type==='end'&&!p.drunk&&this.slashAvailable(p)&&this.spWoods('black').length&&p.hand.some(isSlash))return liangyuan;
      return rest;
    };
    P.spPrepareCosts=function(p,ids){const costs=this.withLoss('use',()=>this.moveBatch(p,()=>ids.map(id=>this.removeOwned(p,id).card)));this.table.push(...costs);return costs;};
    P.prepareActive=async function(p,a){if(!['zhujiu','xixiang','zhubei','liangyuan'].includes(a.skill))return prepare.call(this,p,a);
      if(!this.activeSkills(p).some(s=>s.key===a.skill&&s.ready))return null;
      if(a.skill==='zhujiu'){
        const x=p.spWineCount+1,pool=this.spCostPool(p,'wine'),blacks=pool.filter(black),suggested=[...(blacks.length>=x?blacks:pool)].sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,x).map(c=>c.id);
        const ids=await this.selectCards(p,`煮酒：至少${x}张牌当酒`,pool,x,pool.length,suggested,'所选牌全为黑色，本回合仍可继续煮酒；第一次煮酒结算后摸一张牌。');
        const costs=this.spPrepareCosts(p,ids);if(!costs.every(black))p.spZhujiuBlocked=true;
        return {card:{...defs.wine,id:'sp-zhujiu',virtual:true,costs,originSkill:'zhujiu',suit:costs.every(black)?'S':'N',rank:0},action:{targets:[]}};
      }
      if(a.skill==='liangyuan'){
        const choices=[...(this.spWoods('red').length&&p.hp<p.maxHp?[{key:'peach',label:'玉树当桃'}]:[]),...(this.spWoods('black').length?[{key:'wine',label:'灵杉当酒'}]:[]),{key:'cancel',label:'取消'}];
        const key=await this.option(p,'良缘：选择印桃或酒',choices,choices[0].key);if(key==='cancel')return null;
        const card=this.spPrepareLiangyuan(p,key);return card?{card,action:{targets:[]}}:null;
      }
      const choices=this.spAttackChoices(p,a.skill),preferred=this.spAttackPlan(p,a.skill)?.choice||choices[0];
      const key=await this.option(p,`${a.skill==='xixiang'?'西向':'逐北'}：选择牌与目标`,[...choices,{key:'cancel',label:'取消'}],preferred.key);
      if(key==='cancel')return null;const choice=choices.find(c=>c.key===key);if(!choice)return null;
      p.spUsedAttacks[choice.type].push(choice.target.id);
      if(a.skill==='zhubei'){await this.spZhuBei(p,choice.target,choice.type);return null;}
      const x=(this.spBasicCount||0)+1,pool=this.spCostPool(p,choice.type),suggested=[...pool].sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,x).map(c=>c.id);
      const ids=await this.selectCards(p,`西向：选至少${x}张牌当${defs[choice.type].name}`,pool,x,pool.length,suggested);
      const costs=this.spPrepareCosts(p,ids),card={...defs[choice.type],id:'sp-xixiang',virtual:true,costs,originSkill:'xixiang',noQuota:true,suit:'N',rank:0};
      return {card,action:{targets:[choice.target.id]}};
    };
    P.spPrepareLiangyuan=function(p,key){const cards=this.spWoods(key==='wine'?'black':'red');if(!cards.length)return null;
      const costs=[];for(const owner of this.players){const chosen=(owner.spWoodPile||[]).filter(c=>cards.some(x=>x.id===c.id));if(!chosen.length)continue;owner.spWoodPile=owner.spWoodPile.filter(c=>!chosen.includes(c));costs.push(...chosen);this.spWoodChanged(owner);}
      this.table.push(...costs);if(p.general==='caoxiancaohua'&&!p.spActivated.includes('liangyuan'))p.spActivated.push('liangyuan');
      this.log(`${p.name}发动【良缘】，将全场${costs.length}张${key==='wine'?'灵杉':'玉树'}当【${defs[key].name}】。`,'use');
      return {...defs[key],id:'sp-liangyuan',virtual:true,costs,originSkill:'liangyuan',suit:key==='wine'?'S':'H',rank:0};
    };
    P.responseSkillOptions=function(p,type,played=false){const out=responseOptions.call(this,p,type,played);if(played)return out;
      if(type==='wine'&&this.hasSp(p,'zhujiu')&&!p.spZhujiuBlocked&&this.spCostPool(p,'wine').length>=p.spWineCount+1)out.push({key:'zhujiu:wine',label:`煮酒：至少${p.spWineCount+1}张牌当酒`});
      if(['wine','peach'].includes(type)&&this.hasSp(p,'liangyuan')&&this.spWoods(type==='wine'?'black':'red').length)out.push({key:'liangyuan:'+type,label:`良缘：全场${type==='wine'?'灵杉':'玉树'}当${defs[type].name}`});
      return out;
    };
    P.prepareResponseSkill=async function(p,key){if(key==='zhujiu:wine'){const result=await this.prepareActive(p,{skill:'zhujiu'});return result?.card||null;}
      if(key.startsWith('liangyuan:'))return this.spPrepareLiangyuan(p,key.split(':')[1]);return prepareResponse.call(this,p,key);};
    P.spZhuBei=async function(p,t,key){const x=(this.spBasicCount||0)+1,pool=this.owned(t);let damaged=false,costs=[];
      if(pool.length>=x){const suggested=[...pool].sort((a,b)=>this.value(a,t)-this.value(b,t)).slice(0,x).map(c=>c.id);
        const ids=await this.selectCards(t,`逐北：至少${x}张牌当${defs[key].name}对${p.name}使用`,pool,x,pool.length,suggested,'必须使用；若造成伤害，曹操可获得这些牌。');
        costs=this.spPrepareCosts(t,ids);const card={...defs[key],id:'sp-zhubei',virtual:true,costs,originSkill:'zhubei',spCaocaoId:p.id,noQuota:true,suit:'N',rank:0};
        this.log(`${t.name}因【逐北】对${p.name}使用【${card.name}】。`,'use');
        try{const valid=await this.markCardUse(t,card,[p]);if(valid&&p.alive){if(key==='slash')await this.slash(t,p,card,'normal',1);else if(await this.trickAllowed(t,p,card))await this.singleTrick(t,p,card);}}
        finally{for(const c of costs)this.drop(c);await this.afterCardUse(t,card,[p]);}damaged=!!card.spZhuBeiDamaged;
      }
      if(damaged&&p.alive){const gained=[];for(const c of costs){const found=this.discard.find(v=>v.id===c.id);if(found)gained.push(this.takePhysical(c.id));}if(gained.length){this.gain(p,gained);this.log(`${p.name}【逐北】获得${gained.length}张伤害牌。`,'draw');}}
      else if(p.alive){this.heal(p,1);if(t.alive){const suggested=this.hostility(p,t)<0&&t.hand.length>p.hand.length||this.hostility(p,t)>0&&p.hand.length>t.hand.length?'yes':'no';
        const answer=await this.option(p,'逐北：是否与'+t.name+'交换手牌？',[{key:'yes',label:'交换全部手牌'},{key:'no',label:'不交换'}],suggested);
        if(answer==='yes'){const own=p.hand.splice(0),other=t.hand.splice(0);this.gain(p,other);this.gain(t,own);this.log(`${p.name}【逐北】与${t.name}交换手牌。`,'system');}}
      }
    };
    P.damage=async function(source,target,amount,nature='normal',context={}){const n=await damage.call(this,source,target,amount,nature,context);if(n&&context.card?.originSkill==='zhubei'&&target.id===context.card.spCaocaoId)context.card.spZhuBeiDamaged=true;return n;};
    P.afterCardUse=async function(p,c,ts){await after.call(this,p,c,ts);if(p.generation!==c.sourceGeneration)return;
      if(c.originSkill==='zhujiu'&&c.spFirstPrint&&p.alive){this.draw(p,1);this.log(`${p.name}本回合首次【煮酒】，摸一张牌。`,'draw');}
      if(c.originSkill==='xixiang'&&p.alive){const t=ts[0];if(t?.alive&&t.hp>p.hand.length){this.draw(p,1);this.log(`${p.name}【西向】摸一张牌。`,'draw');}
        if(t?.alive&&t.hp>p.hp){this.heal(p,1);if(this.owned(t,true).length)await this.takeOtherCard(p,t,'obtain',true);}}
      const canPlant=this.discard.some(x=>x.id===c.id)||this.players.some(t=>Object.values(t.equip).some(x=>x.id===c.id)||t.judge.some(x=>x.id===c.id));
      if(this.hasSp(p,'huamu')&&c.spFromHand&&['red','black'].includes(c.spPrevColor)&&c.spPrevColor!==color(c)&&color(c)!=='none'&&canPlant){
        const answer=await this.option(p,'化木：将【'+c.name+'】置于武将牌上？',[{key:'yes',label:'化木：'+(black(c)?'灵杉':'玉树')},{key:'no',label:'不发动'}],p.spWoodPile.length<5?'yes':'no');
        if(answer==='yes'){const physical=this.takePhysical(c.id);p.spWoodPile.push(physical);if(p.general==='caoxiancaohua'&&!p.spActivated.includes('huamu'))p.spActivated.push('huamu');this.spWoodChanged(p);this.log(`${p.name}【化木】将【${c.name}】置为${black(c)?'灵杉':'玉树'}。`,'system');}
      }
      if(c.key==='nullify')await this.spXudai(p);
      if(c.key==='wine'&&!this.alive().some(t=>t.hp<=0))await this.spJinglei();
    };
    P.spJinglei=async function(){for(const p of this.actionOrder(this.alive()))if(this.isGeneral(p,'spliubei')&&!p.spJingleiUsed&&!this.over){
      const holders=this.alive().filter(t=>this.hasSp(t,'zhujiu'));if(!holders.length)continue;
      const best=[...holders].sort((a,b)=>this.hostility(p,a)-this.hostility(p,b)||Math.min(5,b.maxHp)-b.hand.length-(Math.min(5,a.maxHp)-a.hand.length))[0];
      const benefit=best&&this.hostility(p,best)<0&&Math.min(5,best.maxHp)>best.hand.length&&p.hp>1;
      const answer=await this.option(p,'惊雷：受到1点雷电伤害并调整手牌？',[{key:'yes',label:'发动惊雷'},{key:'no',label:'不发动'}],benefit?'yes':'no');if(answer==='no')continue;
      p.spJingleiUsed=true;await this.damage(null,p,1,'thunder',{skill:'jinglei'});if(!p.alive||this.over)continue;
      const remaining=holders.filter(t=>t.alive);if(!remaining.length)continue;
      const chosen=await this.option(p,'惊雷：选择拥有煮酒的角色',remaining.map(t=>({key:String(t.id),label:`${t.name} · ${t.hand.length}张手牌`})),String(remaining.includes(best)?best.id:remaining[0].id));
      const t=this.get(Number(chosen));if(!t?.alive)continue;
      if(t.hand.length<Math.min(5,t.maxHp))this.draw(t,Math.min(5,t.maxHp)-t.hand.length);
      else if(t.hand.length>t.maxHp){const n=t.hand.length-t.maxHp,ids=await this.selectCards(t,`惊雷：弃置${n}张手牌`,t.hand,n,n,[...t.hand].sort((a,b)=>this.value(a,t)-this.value(b,t)).slice(0,n).map(c=>c.id));
        const cards=this.moveBatch(t,()=>ids.map(id=>this.removeOwned(t,id).card));if(t.id===p.id)this.putDiscard(...cards);else this.gain(p,cards);}
      this.log(`${p.name}发动【惊雷】，令${t.name}调整手牌。`,'system');
    }};
    P.spXudai=async function(p){if(!this.isGeneral(p,'spliubei')||p.spXudaiUsed||!p.alive)return;const targets=this.alive().filter(t=>t.id!==p.id);if(!targets.length)return;
      const preferred=[...targets].sort((a,b)=>this.hostility(p,a)-this.hostility(p,b))[0],suggested=this.hostility(p,preferred)<0?'yes':'no';
      const answer=await this.option(p,'虚待：是否让一名其他角色获得煮酒？',[{key:'yes',label:'发动限定技'},{key:'no',label:'保留虚待'}],suggested);if(answer==='no')return;
      const id=await this.option(p,'虚待：选择获得煮酒的角色',targets.map(t=>({key:String(t.id),label:t.name+' · '+this.general(t).name})),String(preferred.id));
      const t=this.get(Number(id));p.spXudaiUsed=true;if(!t.spGrantedSkills.includes('zhujiu'))t.spGrantedSkills.push('zhujiu');this.evidence(p,t,true);this.log(`${p.name}发动【虚待】，令${t.name}获得【煮酒】。`,'system');
    };
    P.response=async function(p,...args){const used=await response.call(this,p,...args);if(used)await this.spXudai(p);return used;};
    P.damageFinished=async function(source,target,amount,context,generation){await damageFinished.call(this,source,target,amount,context,generation);if(target.alive&&target.generation===generation)await this.spXudai(target);};
    P.dying=async function(target,source){this.spDyingCount=(this.spDyingCount||0)+1;const count=this.spDyingCount;
      if(count>=2&&!this.over)for(const p of this.alive())if(this.isGeneral(p,'spcaocao')&&!p.spAwakened){p.spAwakened=true;p.spUsedAttacks={slash:[],duel:[]};const n=target.maxHp;this.draw(p,Math.max(0,n-p.hand.length));this.heal(p,Math.max(0,n-p.hp));this.log(`${p.name}在濒死求救前发动【哀歌】，失去西向，获得逐北。`,'system');}
      if(target.hp>0){this.log(`${target.name}因【哀歌】脱离濒死。`,'system');return;}await dying.call(this,target,source);
    };
    P.preparationSkills=async function(p){await preparation.call(this,p);if(!this.hasSp(p,'jisi')||p.spJisiUsed||!this.owned(p).length)return;
      const skills=p.spActivated.filter(k=>['huamu','qianmeng','liangyuan'].includes(k)),targets=this.alive().filter(t=>t.id!==p.id);if(!skills.length||!targets.length)return;
      const friends=targets.filter(t=>this.hostility(p,t)<0).sort((a,b)=>a.hand.length-b.hand.length||a.hp-b.hp);
      const answer=await this.option(p,'羁肆：弃一张牌赠送一个已发动技能？',[{key:'yes',label:'发动限定技'},{key:'no',label:'保留羁肆'}],friends.length&&skills.includes('qianmeng')?'yes':'no');if(answer==='no')return;
      const card=this.owned(p).sort((a,b)=>this.value(a,p)-this.value(b,p))[0],id=await this.option(p,'羁肆：弃置一张牌',this.owned(p).map(c=>({key:c.id,label:c.name,card:c})),card.id);this.discardOwned(p,[id]);
      const skill=await this.option(p,'羁肆：选择赠送的技能',skills.map(k=>({key:k,label:{huamu:'化木',qianmeng:'前盟',liangyuan:'良缘'}[k]})),skills.includes('qianmeng')?'qianmeng':skills[0]);
      const preferred=friends[0]||targets[0],recipient=await this.option(p,'羁肆：选择获赠角色',targets.map(t=>({key:String(t.id),label:t.name+' · '+this.general(t).name})),String(preferred.id));
      const t=this.get(Number(recipient));p.spJisiUsed=true;if(!t.spGrantedSkills.includes(skill))t.spGrantedSkills.push(skill);this.evidence(p,t,true);this.log(`${p.name}发动【羁肆】，弃一张牌令${t.name}获得【${{huamu:'化木',qianmeng:'前盟',liangyuan:'良缘'}[skill]}】。`,'system');
    };
    P.death=async function(p,source){if(p.spWoodPile?.length){this.putDiscard(...p.spWoodPile.splice(0));this.spWoodChanged(p);}return death.call(this,p,source);};
  }
  const api={install};root.ZhenSpSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
