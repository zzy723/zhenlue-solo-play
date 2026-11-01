(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{defs,isSlash,isRed}=C,baseUseAction=P.useAction;
    const slots={weapon:'武器栏',armor:'防具栏',minusHorse:'进攻坐骑栏',plusHorse:'防御坐骑栏',treasure:'宝物栏'};
    const ordinary=c=>c.kind==='trick'&&c.key!=='nullify';
    const damaging=c=>isSlash(c)||['duel','barbarian','arrows','fireAttack'].includes(c.key);
    const category=c=>c.kind==='delay'?'trick':c.kind;
    const luName=c=>isSlash(c)?'slash':c.key;
    P.initExtra=function(p){
      Object.assign(p,{turnTypes:[],letterBuff:false,distanceReduction:0,yanruUsed:[],hezUsed:[],hezMods:[],disabledSlots:[],youlongState:'trick',youlongNames:[],youlongRound:{},lucunNames:[],lucunRound:{},lucunDrawRound:-1,luPile:[],tuishengUsed:false,luanfengUsed:false,sealedPile:[]});
    };
    P.beginTurnSkills=function(){for(const p of this.players){p.turnTypes=[];p.distanceReduction=0;p.yanruUsed=[];p.hezUsed=[];p.hezMods=[];}};
    P.handChanged=function(p,before){
      if(p.alive&&this.isGeneral(p,'feiyi')&&before!==1&&p.hand.length===1&&!this._batchHands){
        (this._handEvents||(this._handEvents=[])).push({id:p.id,generation:p.generation,cardId:p.hand[0].id});
      }
    };
    P.gain=function(p,cards){const n=p.hand.length;p.hand.push(...cards.filter(Boolean));this.handChanged(p,n);};
    P.moveBatch=function(p,fn){const n=p.hand.length;this._batchHands=(this._batchHands||0)+1;try{return fn();}finally{this._batchHands--;this.handChanged(p,n);}};
    P.flushSkillEvents=async function(){
      if(this.over){this._handEvents=[];return;}
      if(this._flushingHands)return;
      this._flushingHands=true;
      try{while(this._handEvents?.length){
        const e=this._handEvents.shift(),p=this.get(e.id);
        if(!p.alive||p.generation!==e.generation||!this.isGeneral(p,'feiyi')||p.hand.length!==1||p.hand[0].id!==e.cardId||p.hezUsed.length===2)continue;
        const shown=p.hand[0],dirs=['greater','less'].filter(x=>!p.hezUsed.includes(x));
        const next=p.hand.find(ordinary);
        const good=next?dirs.find(d=>d==='greater'?next.rank>shown.rank:next.rank<shown.rank):null;
        const suggested=good||dirs.find(d=>d===(shown.rank<=7?'greater':'less'))||dirs[0];
        const opts=dirs.map(d=>({key:d,label:'和衷：展示并选择'+(d==='greater'?'大于':'小于')+C.rankMark(shown.rank)}));opts.push({key:'pass',label:'不发动和衷'});
        const k=await this.option(p,'和衷：手牌变为一张，是否发动？',opts,suggested,'展示这张牌并摸一张，下一张普通锦囊符合点数条件时额外结算一次。');
        if(k==='pass')continue;
        p.hezUsed.push(k);p.hezMods.push({direction:k,rank:shown.rank});
        this.noteCardRevealed?.(p,shown);this.log(`${p.name}发动【和衷】，展示【${shown.name}】${C.rankMark(shown.rank)}，选择${k==='greater'?'大于':'小于'}此点数。`,'reveal');this.draw(p,1);
      }}finally{this._flushingHands=false;}
    };
    const pause=P.pause,choose=P.choose,discardOwned=P.discardOwned;
    P.pause=async function(ms=0){await this.flushSkillEvents();return pause.call(this,ms);};
    P.choose=async function(p,prompt,ai){await this.flushSkillEvents();return choose.call(this,p,prompt,ai);};
    P.discardOwned=function(p,ids){return this.moveBatch(p,()=>discardOwned.call(this,p,ids));};
    P.takeBottom=function(){if(!this.deck.length){const c=this.takeTop();if(c)this.deck.push(c);}return this.deck.shift()||null;};
    const canUse=P.canUse,canSlash=P.canSlash,slashAvailable=P.slashAvailable,targets=P.targets;
    P.unlimitedFor=function(p,t){return this.isGeneralLocked(p,'pengyang')&&p.letterBuff&&t.id!==p.id&&t.hand.length<p.hand.length;};
    P.canSlash=function(p,t){return p.alive&&t.alive&&p.id!==t.id&&(this.unlimitedFor(p,t)||canSlash.call(this,p,t));};
    P.slashAvailable=function(p){return slashAvailable.call(this,p)||(this.isGeneralLocked(p,'pengyang')&&p.letterBuff&&this.alive().some(t=>this.unlimitedFor(p,t)));};
    P.canUse=function(p,c){if(this.isGeneralLocked(p,'pengyang')&&c.key==='nullify')return false;if(c.kind==='equip'&&p.disabledSlots.includes(c.slot))return false;return canUse.call(this,p,c);};
    P.targets=function(p,c){
      const ts=targets.call(this,p,c);
      if(this.isGeneralLocked(p,'pengyang')&&p.letterBuff){for(const t of this.alive())if(this.unlimitedFor(p,t)&&!ts.includes(t)&&((c.key==='steal'&&this.owned(t,true).length)||(c.key==='shortage'&&!t.judge.some(x=>x.key==='shortage'))))ts.push(t);}
      if(isSlash(c)&&this.isGeneralLocked(p,'pengyang')&&!slashAvailable.call(this,p))return ts.filter(t=>this.unlimitedFor(p,t));
      if(isSlash(c)&&!this.slashAvailable(p))return [];
      return ts;
    };
    P.skillActionsFor=function(p,c){
      if(!this.canUse(p,c))return [];
      const base={type:'use',cardId:c.id,targets:[]};
      if(isSlash(c)||['chain','duel','steal','dismantle','fireAttack','borrow','indulgence','shortage'].includes(c.key)){
        const ts=this.targets(p,c);const out=[];
        if(c.key==='borrow'){for(const t of ts)for(const v of this.alive())if(canSlash.call(this,t,v))out.push({...base,targets:[t.id,v.id]});}
        else {for(const t of ts)out.push({...base,targets:[t.id]});if(c.key==='chain')for(let i=0;i<ts.length;i++)for(let j=i+1;j<ts.length;j++)out.push({...base,targets:[ts[i].id,ts[j].id]});}
        return out;
      }
      return [base];
    };
    P.imprintKeys=function(p,skill){
      if(!p.alive)return [];
      if(skill==='youlong'){
        if(!this.isGeneral(p,'wolongfengchu')||p.disabledSlots.length>=5||p.youlongRound[p.youlongState]===this.round)return [];
        return Object.keys(defs).filter(k=>defs[k].kind===p.youlongState&&!p.youlongNames.includes(k));
      }
      if(skill==='lucun'){
        if(!this.isGeneral(p,'mouzhangrang'))return [];
        return Object.keys(defs).filter(k=>['basic','trick'].includes(defs[k].kind)&&!['jink','nullify'].includes(k)&&!p.lucunNames.includes(luName(defs[k]))&&p.lucunRound[defs[k].kind]!==this.round);
      }
      return [];
    };
    P.bottomView=function(p){return this.isGeneral(p,'pengyang')?this.deck.slice(0,p.turnTypes.length+1):[];};
    P.bottomUseReason=function(p,c){
      if(this.skillActionsFor(p,c).length)return [1,11,12,13].includes(c.rank)?'可以选择，但侻失会令此字母牌无效并摸一张':'可以使用';
      if(c.key==='nullify')return '侻失：不能使用无懈可击';
      if(c.key==='jink')return '闪只能在需要使用闪时响应';
      if(isSlash(c))return !this.slashAvailable(p)?'本阶段杀的次数已用完，且没有符合侻失条件的目标':'没有可指定的杀目标（距离或次数不符）';
      if(c.key==='peach')return '当前体力已满，不能使用桃';
      if(c.key==='wine')return '本回合已经使用过酒';
      if(c.kind==='equip'&&p.disabledSlots.includes(c.slot))return '对应装备栏已废除';
      if(c.key==='lightning')return '自己的判定区已有闪电';
      return '当前没有合法目标或不满足使用条件';
    };
    P.activeSkills=function(p){
      const list=[];
      if(this.isGeneral(p,'liuzhang'))list.push({key:'zonghu',name:'宗护',detail:'给'+this.zonghuCost()+'张牌 → 使用杀',ready:this.canZonghu(p)&&this.slashAvailable(p)&&this.targets(p,defs.slash).length>0});
      if(this.isGeneral(p,'pengyang'))list.push({key:'xiaofan',name:'嚣翻',detail:'观看牌堆底'+(p.turnTypes.length+1)+'张牌',ready:this.bottomView(p).length>0,reason:'牌堆中没有可观看的牌'});
      if(this.isGeneral(p,'feiyi'))list.push({key:'yanru',name:'晏如',detail:'奇数 / 偶数各一次 · 已用'+p.yanruUsed.length+'/2',ready:p.hand.length>0&&!p.yanruUsed.includes(p.hand.length%2)});
      if(this.isGeneral(p,'mouzhangrang'))list.push({key:'lucun',name:'赂存',detail:'基本 / 锦囊各一次 · 本轮',ready:this.imprintKeys(p,'lucun').some(k=>this.skillActionsFor(p,{...defs[k],id:'skill',suit:'N',rank:0}).length)});
      if(this.isGeneral(p,'wolongfengchu'))list.push({key:'youlong',name:'游龙',detail:(p.youlongState==='trick'?'阳 · 普通锦囊':'阴 · 基本牌')+' · 废除一栏',ready:this.imprintKeys(p,'youlong').some(k=>this.skillActionsFor(p,{...defs[k],id:'skill',suit:'N',rank:0}).length)});
      return list;
    };
    const legalActions=P.legalActions,aiPlay=P.aiPlay;
    P.legalActions=function(p){const actions=legalActions.call(this,p);for(const s of this.activeSkills(p))if(s.ready&&!actions.some(a=>a.skill===s.key))actions.push({type:'skill',skill:s.key});return actions;};
    P.cardPlan=function(p,c){
      const actions=this.skillActionsFor(p,c);if(!actions.length)return null;
      // Evaluate a legal virtual/viewed card with the same public-information policy as a hand card.
      const original=p.hand;try{p.hand=[...original,c];const a=aiPlay.call(this,p,[{type:'end'},...actions]);return a.type==='end'?null:a;}finally{p.hand=original;}
    };
    P.zonghuWorth=function(p,amount=1){
      const friend=this.alive().some(t=>t.id!==p.id&&this.hostility(p,t)<-.5);
      const ids=this.zonghuSuggested(p),sum=ids.reduce((n,id)=>n+this.value(this.owned(p).find(c=>c.id===id),p),0);
      const effective=Math.max(0,amount-(this.fengweiReductionWorth(p,amount)?1:0));
      if(effective===0)return false;
      if(friend)return true;
      if(p.hp<=effective)return true;
      return effective>=2&&sum<=7&&this.zonghuCost()===1;
    };
    P.aiDamageTrade=function(p,type,context={}){
      if(!['jink','slash'].includes(type)||!context.source||context.unavoidable)return false;
      const source=context.source,nature=context.nature||'normal';
      if(this.isGeneralLocked(source,'jiezhangchunhua'))return false; // 绝情改为失去体力，不触发受伤收益。
      let amount=context.amount||1;
      if(source.equip.weapon?.key==='guding'&&!p.hand.length)amount++;
      if(source.crazyTarget===p.id&&!source.crazyHits?.includes(p.id))amount++;
      const armor=context.ignoreArmor?null:p.equip.armor?.key;
      if(armor==='vine'&&nature==='fire')amount++;
      if(armor==='lion')amount=Math.min(amount,1);
      if(this.fengweiReductionWorth(p,amount))amount=Math.max(0,amount-1);
      const lost=Math.max(0,amount-(p.armor||0));
      if(!amount||p.hp-lost<=1)return false;
      if(nature!=='normal'&&p.chained&&this.alive().some(t=>t.id!==p.id&&t.chained&&this.hostility(p,t)<-.5))return false;
      const friends=this.alive().filter(t=>t.id!==p.id&&this.hostility(p,t)<-.5);
      let benefit=0;
      if(this.isGeneral(p,'jiecaocong'))benefit+=2.5*amount;
      if(this.hasSkill(p,'jieming')){
        const recipients=friends.length?friends:[p];
        const room=Math.max(0,...recipients.map(t=>Math.min(5,t.maxHp)-t.hand.length));
        benefit+=Math.min(4,room)*1.2*amount;
      }
      if(this.hasSkill(p,'funing')&&p.funingRound!==this.round){
        const need=Math.max(1,p.maxHp-p.hp+lost),cards=this.owned(p);
        if(cards.length>=need&&[true,false].some(red=>cards.filter(c=>isRed(c)===red).length>=need))
          benefit+=2.2+(friends.length?0.6:0)+(cards.length>this.hurtIds.length?0.6:0);
      }
      if(this.hasSkill(p,'anran'))benefit+=Math.min(4,(p.anranCount||0)+1)*1.15;
      if(this.isGeneral(p,'sunli'))benefit+=1.2;
      if(this.hasSkill(p,'guifu')&&this.deck.some(c=>c.key==='jink'))benefit+=0.9;
      if(this.isGeneral(p,'xizhicai'))benefit+=0.8;
      const risk=lost*(p.hp-lost===2?2:1.5)+(p.hand.length<=1?0.35:0);
      return benefit>risk;
    };
    P.aiPlay=function(p,actions){
      let result=aiPlay.call(this,p,actions.filter(a=>a.type!=='skill'));
      for(const a of actions.filter(a=>a.type==='skill')){
        if(a.skill==='zonghu'){
          const friend=this.alive().some(t=>t.id!==p.id&&this.hostility(p,t)<-.5),ids=this.zonghuSuggested(p),cost=ids.reduce((n,id)=>n+this.value(this.owned(p).find(c=>c.id===id),p),0);
          const lethal=this.targets(p,defs.slash).some(t=>this.hostility(p,t)>1&&t.hp<=1);
          if((friend||lethal&&cost<=8)&&this.targets(p,defs.slash).some(t=>this.hostility(p,t)>0)&&result.type==='end')result=a;
        }else if(a.skill==='yanru'){
          if(result.type==='end'&&(p.hand.length<=3||p.hand.filter(c=>this.value(c,p)<5).length>=Math.ceil(p.hand.length/2)))result=a;
        }else{
          const cs=a.skill==='xiaofan'?this.bottomView(p):this.imprintKeys(p,a.skill).map(k=>({...defs[k],id:'skill',suit:'N',rank:0}));
          const worthwhile=cs.some(c=>!this.isGeneral(p,'pengyang')||![1,11,12,13].includes(c.rank)?!!this.cardPlan(p,c):false);
          if(worthwhile&&result.type==='end')result=a;
        }
      }
      if(this.isGeneral(p,'pengyang')){
        const usefulSlashes=actions.filter(a=>a.type==='use'&&isSlash(p.hand.find(c=>c.id===a.cardId))&&![1,11,12,13].includes(p.hand.find(c=>c.id===a.cardId).rank)&&a.targets.some(id=>this.hostility(p,this.get(id))>0));
        if(usefulSlashes.length){
          const firstSlash=aiPlay.call(this,p,[{type:'end'},...usefulSlashes]);
          const chosen=result.type==='use'?p.hand.find(c=>c.id===result.cardId):null;
          if(firstSlash.type==='use'&&(chosen&&[1,11,12,13].includes(chosen.rank)||result.skill==='xiaofan'))return firstSlash;
        }
        const selected=result.type==='use'?p.hand.find(c=>c.id===result.cardId):null;
        if(selected&&[1,11,12,13].includes(selected.rank)&&actions.some(a=>a.skill==='xiaofan')&&this.bottomView(p).some(c=>![1,11,12,13].includes(c.rank)&&this.cardPlan(p,c)))return actions.find(a=>a.skill==='xiaofan');
      }
      return result;
    };
    P.prepareImprint=async function(p,skill,key){
      if(!this.imprintKeys(p,skill).includes(key))return null;
      if(skill==='youlong'){
        const available=Object.keys(slots).filter(s=>!p.disabledSlots.includes(s));
        const cheap=[...available].sort((a,b)=>(p.equip[a]?this.value(p.equip[a],p):0)-(p.equip[b]?this.value(p.equip[b],p):0)||(['treasure','plusHorse','minusHorse','armor','weapon'].indexOf(a)-['treasure','plusHorse','minusHorse','armor','weapon'].indexOf(b)))[0];
        const slot=await this.option(p,'游龙：选择废除的装备栏',available.map(s=>({key:s,label:slots[s]+(p.equip[s]?' · 弃置'+p.equip[s].name:' · 空栏')})),cheap);
        if(p.equip[slot])this.discardOwned(p,[p.equip[slot].id]);p.disabledSlots.push(slot);
        p.youlongRound[p.youlongState]=this.round;p.youlongState=p.youlongState==='trick'?'basic':'trick';p.youlongNames.push(key);
      }else{p.lucunRound[defs[key].kind]=this.round;p.lucunNames.push(luName(defs[key]));}
      this.log(`${p.name}发动【${skill==='youlong'?'游龙':'赂存'}】，视为使用【${defs[key].name}】。`,'use');
      return {...defs[key],id:'imprint',virtual:true,suit:'N',rank:0,costs:[],originSkill:skill};
    };
    P.prepareBottom=async function(p,c){
      if(!this.bottomView(p).some(x=>x.id===c.id))return null;
      const x=this.deck.splice(this.deck.findIndex(x=>x.id===c.id),1)[0];this.table.push(x);
      return {...x,originSkill:'xiaofan',cleanupZones:Math.min(2,p.turnTypes.length)};
    };
    P.prepareActive=async function(p,a){
      const skill=a.skill;
      if(skill==='yanru'){await this.yanru(p);return null;}
      const cards=skill==='xiaofan'?this.bottomView(p):this.imprintKeys(p,skill).map(k=>({...defs[k],id:k,suit:'N',rank:0}));
      const playable=cards.filter(c=>this.skillActionsFor(p,c).length);
      if(!playable.length&&skill!=='xiaofan')return null;
      const recommended=(skill==='xiaofan'?playable.find(c=>![1,11,12,13].includes(c.rank)&&this.cardPlan(p,c)):null)||playable.find(c=>this.cardPlan(p,c))||playable[0];
      const opts=playable.map(c=>({key:c.id,label:c.name+(c.rank?' · '+C.rankMark(c.rank):''),card:c}));opts.push({key:'cancel',label:playable.length?'取消发动':'返回牌桌'});
      const id=await this.choose(p,{kind:'options',title:skill==='xiaofan'?'嚣翻：观看牌堆底并选择牌':'选择'+(skill==='youlong'?'游龙':'赂存')+'要使用的牌',options:opts,detail:skill==='xiaofan'?(playable.length?'从牌堆底向上排列；结算后按已用类别弃判定区、装备区，最多两区，不弃手牌。仅查看或取消不弃牌。':'这几张牌目前都不能使用，原因显示在牌下。仅查看不弃牌；牌堆或局面变化后可再次查看。'):'选择牌后选择目标。取消不会消耗技能。',revealedCards:skill==='xiaofan'?cards:null,revealedReasons:skill==='xiaofan'?Object.fromEntries(cards.map(c=>[c.id,this.bottomUseReason(p,c)])):null},()=>recommended?.id||'cancel');
      if(id==='cancel')return null;const c=playable.find(c=>c.id===id),actions=this.skillActionsFor(p,c);
      const suggested=this.cardPlan(p,c)||actions[0];
      let action=suggested;
      if(actions.length>1){const index=Math.max(0,actions.findIndex(x=>JSON.stringify(x)===JSON.stringify(suggested)));const k=c.key==='chain'?await this.chooseChainTargets(p,'选择'+c.name+'的目标',actions,String(index)):await this.option(p,'选择'+c.name+'的目标',actions.map((x,i)=>({key:String(i),label:x.targets.map(t=>this.get(t).name+' · '+this.get(t).hp+'血').join('、')||'自己'})),String(index));action=actions[Number(k)];}
      const card=skill==='xiaofan'?await this.prepareBottom(p,c):await this.prepareImprint(p,skill,c.key);
      return card?{card,action}:null;
    };
    P.yanru=async function(p){
      const parity=p.hand.length%2;if(!p.hand.length||p.yanruUsed.includes(parity))return;
      p.yanruUsed.push(parity);this.log(`${p.name}发动【晏如】（${parity?'奇数':'偶数'}手牌）。`,'system');
      if(parity){this.draw(p,3);await this.flushSkillEvents();}
      const min=Math.ceil(p.hand.length/2),suggested=[...p.hand].sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,min).map(c=>c.id);
      const ids=await this.selectCards(p,'晏如：弃置至少'+min+'张手牌',p.hand,min,p.hand.length,suggested,'可多选；奇数先摸三张，偶数弃牌后摸三张。');this.discardOwned(p,ids);await this.flushSkillEvents();
      if(!parity)this.draw(p,3);
    };
    P.effectiveTargets=function(p,c,ts){
      if(['barbarian','arrows'].includes(c.key))return this.alive().filter(t=>t.id!==p.id);
      if(['harvest','healAll'].includes(c.key))return this.alive();
      if(['draw2','peach','wine','lightning'].includes(c.key)||c.kind==='equip')return [p];
      return c.key==='borrow'?ts.slice(0,1):ts;
    };
    P.markCardUse=async function(p,c,ts){
      await this.flushSkillEvents();
      c.sourceGeneration=p.generation;c.ownerId=p.id;c.damageTotal=0;
      if(!p.turnTypes.includes(category(c)))p.turnTypes.push(category(c));
      if(this.isGeneral(p,'wuyi')&&p.id===this.turn)p.distanceReduction++;
      c.invalid=this.isGeneralLocked(p,'pengyang')&&[1,11,12,13].includes(c.rank);
      if(this.isGeneralLocked(p,'pengyang')&&p.letterBuff&&ts.some(t=>t.id!==p.id&&t.hand.length<p.hand.length))p.letterBuff=false;
      if(c.invalid){this.log(`${p.name}的【侻失】令字母点数【${c.name}】无效，摸一张牌。`,'system');this.draw(p,1);p.letterBuff=true;}
      if(ordinary(c)&&this.isGeneral(p,'feiyi')){
        c.resolutions=1+p.hezMods.filter(m=>c.rank>0&&(m.direction==='greater'?c.rank>m.rank:c.rank<m.rank)).length;p.hezMods=[];
        if(c.resolutions>1)this.log(`【和衷】使【${c.name}】共结算${c.resolutions}次。`,'system');
      }
      if(!c.invalid&&this.isGeneral(p,'wuyi')&&p.id===this.turn&&(isSlash(c)||ordinary(c))&&ts.length===1&&this.alive().filter(t=>t.id!==p.id).every(t=>this.distance(p,t)===1))await this.bensixi(p,c,ts);
      return !c.invalid;
    };
    P.bensixi=async function(p,c,ts){
      let candidates=c.key==='draw2'?this.alive().filter(t=>t.id!==p.id):this.targets(p,c).filter(t=>!ts.includes(t));
      // A borrowed sword adds a legal weapon holder, keeping the originally specified victim.
      if(c.key==='borrow'){const victim=this.get(c.originalTargets?.[1]);candidates=candidates.filter(t=>victim&&canSlash.call(this,t,victim));}
      const pool=[...(candidates.length?[{key:'target',label:'增加一个目标'}]:[]),{key:'armor',label:'无视防具'},{key:'cancel',label:'不能被抵消'},{key:'draw',label:'每次造成伤害后摸一张'}];
      const selected=[];
      for(let i=0;i<2;i++){
        const opts=[...pool.filter(x=>!selected.includes(x.key)),{key:'pass',label:'完成选择'}];
        let suggested='pass';
        if(!selected.includes('cancel')&&damaging(c))suggested='cancel';
        else if(!selected.includes('target')&&candidates.some(t=>this.beneficial(c,t)?this.hostility(p,t)<0:this.hostility(p,t)>0))suggested='target';
        else if(!selected.includes('draw')&&damaging(c))suggested='draw';
        else if(!selected.includes('armor')&&isSlash(c)&&ts.some(t=>t.equip.armor))suggested='armor';
        const k=await this.option(p,'奔袭：选择至多两项（已选'+selected.length+'）',opts,suggested);if(k==='pass')break;selected.push(k);
        if(k==='target'){
          const best=[...candidates].sort((a,b)=>this.beneficial(c,a)?this.hostility(p,a)-this.hostility(p,b):this.hostility(p,b)-this.hostility(p,a))[0];
          const id=await this.option(p,'奔袭：增加一个目标',candidates.map(t=>({key:String(t.id),label:t.name+' · '+t.hp+'血'})),String(best.id));ts.push(this.get(Number(id)));
        }else if(k==='armor')c.ignoreArmor=true;else if(k==='cancel')c.noCancel=true;else c.drawOnDamage=true;
      }
      c.effectTargets=ts.map(t=>t.id);this.log(`${p.name}发动【奔袭】：${pool.filter(x=>selected.includes(x.key)).map(x=>x.label).join('、')||'不选择额外效果'}。`,'system');
    };
    P.afterCardUse=async function(p,c,ts){
      if(p.generation!==c.sourceGeneration)return;
      if(c.originSkill==='xiaofan'&&p.alive){
        const groups=[p.judge,Object.values(p.equip)],count=Math.min(groups.length,c.cleanupZones||0);
        for(let i=0;i<count;i++)this.discardOwned(p,[...groups[i]].map(x=>x.id));
        this.log(`【嚣翻】弃置${count}个区域的牌。`,'discard');
      }
      if(c.originSkill==='lucun'&&p.alive){
        const targets=ts.filter(t=>t.alive&&t.hand.length);if(!targets.length)return;
        const max=Math.max(...targets.map(t=>t.hand.length)),ties=targets.filter(t=>t.hand.length===max),t=ties[Math.floor(this.random()*ties.length)];
        const cheapest=[...t.hand].sort((a,b)=>this.value(a,t)-this.value(b,t))[0];
        const id=await this.option(t,'赂存：交给'+p.name+'一张手牌作为赂',t.hand.map(c=>({key:c.id,label:c.name,card:c})),cheapest.id,'你是此牌目标中手牌最多的角色。');
        if(!p.alive||!t.alive)return;
        const current=t.hand.some(c=>c.id===id)?id:[...t.hand].sort((a,b)=>this.value(a,t)-this.value(b,t))[0]?.id;
        if(current==null)return; // 选择期间其他技能可能移动了目标的手牌。
        p.luPile.push(this.removeOwned(t,current).card);this.log(`${t.name}将一张手牌置于${p.name}武将牌上作为“赂”。`,'system');
      }
      await this.flushSkillEvents();
    };
    P.turnEndSkills=async function(){
      for(const p of this.actionOrder(this.alive()))if(p.luPile.length){
        const c=p.luPile.splice(Math.floor(this.random()*p.luPile.length),1)[0];this.putDiscard(c);
        if(p.lucunDrawRound!==this.round){p.lucunDrawRound=this.round;this.draw(p,1);this.log(`${p.name}随机弃置一张“赂”，本轮首次因此摸一张牌。`,'system');}
        else this.log(`${p.name}随机弃置一张“赂”；本轮已经因此摸过牌。`,'system');
      }
      await this.flushSkillEvents();
    };
    P.tuisheng=async function(p){
      if(!this.isGeneral(p,'mouzhangrang')||p.tuishengUsed||!p.alive)return;
      const candidates=this.discard.filter(c=>p.lucunNames.includes(luName(c))),count=Math.min(this.round,candidates.length);
      const opts=[{key:'pile',label:'所有手牌置为赂，再回复1点体力'},{key:'discard',label:'获得弃牌堆至多'+count+'张对应牌，再回复1点体力'},{key:'pass',label:'保留蜕生'}];
      const urgent=p.hp<=0,worth=count>=2||urgent;
      const k=await this.option(p,'蜕生：是否发动限定技？',opts,worth?'discard':'pass');if(k==='pass')return;
      p.tuishengUsed=true;p.lucunNames=[];
      if(k==='pile')this.moveBatch(p,()=>{for(const c of [...p.hand])p.luPile.push(this.removeOwned(p,c.id).card);});
      else {const cards=this.shuffle(candidates).slice(0,count);this.discard=this.discard.filter(c=>!cards.includes(c));this.gain(p,cards);}
      this.heal(p,1);this.log(`${p.name}发动【蜕生】，重置赂存牌名并回复1点体力。`,'heal');
    };
    P.luanfeng=async function(target){
      for(const p of this.actionOrder(this.alive().filter(p=>this.isGeneral(p,'wolongfengchu')&&!p.luanfengUsed&&target.maxHp>=p.maxHp))){
        if(target.hp>0)return;
        const k=await this.option(p,'鸾凤：救援'+target.name+'？',[{key:'yes',label:'发动鸾凤 · 回复至3血'},{key:'pass',label:'保留鸾凤'}],this.hostility(p,target)<-.5?'yes':'pass','限定技，恢复其废除装备栏，摸至6减恢复栏数；救自己时重置游龙牌名。');if(k==='pass')continue;
        p.luanfengUsed=true;const x=target.disabledSlots.length;target.disabledSlots=[];this.heal(target,3-target.hp);this.draw(target,Math.max(0,6-x-target.hand.length));
        if(p.id===target.id)p.youlongNames=[];this.evidence(p,target,true);this.log(`${p.name}发动【鸾凤】，救援${target.name}并恢复${x}个装备栏。`,'heal');
      }
    };
    P.responseSkillOptions=function(p,type,played=false){
      if(played)return [];
      const keys=type==='slash'?Object.keys(defs).filter(k=>isSlash(defs[k])):[type],out=[];
      for(const skill of ['youlong','lucun'])for(const k of keys)if(this.imprintKeys(p,skill).includes(k))out.push({key:skill+':'+k,label:(skill==='youlong'?'游龙':'赂存')+'：使用'+defs[k].name});
      for(const c of this.bottomView(p))if(type==='slash'?isSlash(c):c.key===type)out.push({key:'xiaofan:'+c.id,label:'嚣翻：'+c.name+' · '+C.rankMark(c.rank),card:c});
      return out;
    };
    P.prepareResponseSkill=async function(p,key){const [skill,k]=key.split(':');return skill==='xiaofan'?this.prepareBottom(p,this.bottomView(p).find(c=>c.id===k)):this.prepareImprint(p,skill,k);};
    const damage=P.damage,death=P.death,dying=P.dying;
    P.damage=async function(source,target,amount,nature='normal',context={}){
      const n=await damage.call(this,source,target,amount,nature,{...context,ignoreArmor:context.ignoreArmor||context.card?.ignoreArmor});
      if(n&&context.card){context.card.damageTotal=(context.card.damageTotal||0)+n;if(context.card.drawOnDamage&&source?.alive&&source.id===context.card.ownerId&&source.generation===context.card.sourceGeneration)this.draw(source,1);}
      return n;
    };
    P.death=async function(p,source){this.putDiscard(...p.sealedPile.splice(0),...p.luPile.splice(0));p.disabledSlots=[];return death.call(this,p,source);};
    P.dying=async function(target,source){
      const alone=false;
      await this.tuisheng(target);if(target.hp<=0&&!alone)await this.luanfeng(target);if(target.hp>0)return;return dying.call(this,target,source);
    };
    // Shared resolver for physical cards and skill-created cards; all costs and zones remain physical.
    P.useAction=async function(p,a){
      if(this.players.every(t=>t.general==='blank'))return baseUseAction.call(this,p,a);
      let raw;
      if(a.type==='skill'&&a.skill!=='zonghu'){const result=await this.prepareActive(p,a);if(!result)return;raw=result.card;a=result.action;}
      else if(a.skill==='zonghu'){
        if(!this.canZonghu(p)||!this.slashAvailable(p))return;
        const ts=this.targets(p,defs.slash);if(!ts.length)return;
        const best=[...ts].sort((x,y)=>this.hostility(p,y)-this.hostility(p,x))[0];
        const id=await this.option(p,'宗护：选择杀的目标',ts.map(t=>({key:String(t.id),label:t.name+' · '+t.hp+'血'})),String(best.id));
        raw=await this.zonghuCard(p,'slash',true);if(!raw)return;a={...a,targets:[Number(id)]};
      }else if(a.cardId==='spear'){
        const costs=this.moveBatch(p,()=>a.cost.map(id=>this.removeHand(p,id)));
        raw={...defs.slash,id:'virtual',virtual:true,costs,suit:costs.every(isRed)?'H':costs.every(c=>['S','C'].includes(c.suit))?'S':'N',rank:0};
      }else raw=this.removeHand(p,a.cardId);
      const card={...raw,originalTargets:a.targets,wasUsedAsAction:true},originalTargets=a.targets.map(id=>this.get(id));
      let ts=this.effectiveTargets(p,card,originalTargets);
      this.showCardAction(p,raw,a.targets,a.recast?'重铸':'出牌');this.sound('card',{playerId:p.id,cardKey:card.key,kind:card.kind,recast:!!a.recast});
      this.log(`${p.name}${a.recast?'重铸':'使用'}【${card.name}】${originalTargets.length?' → '+originalTargets.map(t=>t.name).join('、'):''}。`,'use');
      try{
        if(a.recast){this.drop(raw);this.draw(p,1);return;}
        const valid=await this.markCardUse(p,card,ts);
        if(isSlash(card)&&!card.noQuota)p.slashUsed++;
        if(!valid)return;
        if(card.kind==='equip'){if(p.disabledSlots.includes(card.slot))return;if(p.equip[card.slot])this.discardOwned(p,[p.equip[card.slot].id]);this.table=this.table.filter(x=>x.id!==raw.id);p.equip[card.slot]=this.allCards.find(c=>c.id===raw.id)||raw;return;}
        if(card.kind==='delay'){
          const t=card.key==='lightning'?p:ts[0],cost=raw.virtual?raw.costs?.[0]:null;
          if(cost){
            this.table=this.table.filter(x=>x.id!==cost.id);
            t.judge.push({...cost,key:card.key,name:card.name,kind:'delay',text:card.text,convertedDelay:true});
            raw.costs=[];
          }else{this.table=this.table.filter(x=>x.id!==raw.id);t.judge.push(this.allCards.find(c=>c.id===raw.id)||raw);}
          this.evidence(p,t,false);return;
        }
        if(isSlash(card)){
          let nature=card.nature;if(card.key==='slash'&&p.equip.weapon?.key==='fan'){const k=await this.option(p,'发动朱雀羽扇？',[{key:'fire',label:'转为火杀'},{key:'normal',label:'保持普通杀'}],ts.some(t=>t.equip.armor?.key==='vine'||t.chained)?'fire':'normal');if(k==='fire')nature='fire';}
          const bonus=p.drunk;p.drunk=0;for(const t of this.actionOrder(ts))if(t.alive&&!this.over)await this.slash(p,t,card,nature,1+bonus);
        }else if(card.key==='peach')await this.resolvePeach(p,card);
        else if(card.key==='wine'){if(!card.noQuota)p.wineUsed++;p.drunk=1;this.log(`${p.name}饮酒，本回合下一张杀伤害+1。`,'system');}
        else {
          for(let i=0;i<(card.resolutions||1)&&p.alive&&!this.over&&!this.turnInterrupted;i++){
            card.resolutionIndex=i+1;
            const allowed=[];for(const t of this.actionOrder(ts))if(t.alive&&!this.over&&await this.trickAllowed(p,t,card))allowed.push(t);
            if(['barbarian','arrows','healAll','harvest'].includes(card.key))await this.groupTrickResolved(p,card,allowed);
            else if(card.key==='draw2'){for(const t of allowed)if(t.alive)this.draw(t,2);}
            else if(card.key==='borrow'){for(const t of allowed)if(t.alive&&t.equip.weapon)await this.borrow(p,t,originalTargets[1]);}
            else for(const t of this.actionOrder(allowed))if(t.alive&&!this.over)await this.singleTrick(p,t,card);
          }
        }
      }finally{
        if(raw.virtual)(raw.costs||[]).forEach(c=>this.drop(c));else if(this.table.some(c=>c.id===raw.id))this.drop(raw);
        if(!a.recast)await this.afterCardUse(p,card,ts);this.change();
      }
    };
    P.trickAllowed=async function(source,target,card){
      let active=true,start=this.turn;
      const benefit=this.beneficial(card,target);
      for(let depth=0;depth<50;depth++){
        let countered=false;
        const order=this.alive().sort((a,b)=>((a.id-start+this.players.length)%this.players.length)-((b.id-start+this.players.length)%this.players.length));
        for(const p of order){
          if(this.caocaoNoResponse?.(p,source,card))continue;
          if(this.isGeneralLocked(p,'pengyang'))continue;
          const ns=p.hand.filter(c=>c.key==='nullify'&&this.allowedUse(p,c)),skills=this.responseSkillOptions(p,'nullify');if(!ns.length&&!skills.length)continue;
          const h=this.hostility(p,target),want=active?(benefit?h>1:h<-.5):(benefit?h<-.5:h>1);
          const worthwhile=target.hp<=2||!damaging(card)||target.hand.length===0||card.key==='lightning';
          const opts=[...ns.map(c=>({key:c.id,label:'使用无懈可击',card:c})),...skills,{key:'pass',label:'不使用'}];
          const key=await this.option(p,
            `${active?'抵消':'恢复'}【${card.name}】${card.resolutions>1?`第${card.resolutionIndex}/${card.resolutions}次结算`:''}对${target.name}的效果？`,opts,
            !card.noCancel&&want&&worthwhile?(ns[0]?.id||skills[0]?.key):'pass',card.noCancel?'奔袭：此牌不能被抵消。':'无懈可击仅影响当前这个目标。');
          if(key==='pass')continue;
          const raw=key.includes(':')?await this.prepareResponseSkill(p,key):this.removeHand(p,key);if(!raw)continue;
          const c={...raw};await this.markCardUse(p,c,[]);this.showCardAction(p,c,[target],'响应');this.drop(raw);
          this.sound('response',{playerId:p.id,cardKey:'nullify'});this.log(`${p.name}使用【无懈可击】。`,'response');await this.afterCardUse(p,c,[]);
          if(card.noCancel){this.log('【奔袭】使无懈可击无法抵消此牌。','system');continue;}
          this.evidence(p,target,active?!benefit:benefit);active=!active;start=(p.id+1)%this.players.length;countered=true;await this.pause();break;
        }
        if(!countered)break;
      }
      return active;
    };
    P.response=async function(p,type,title,ignoreArmor=false,context={}){
      const played=context.played??type==='slash';
      if(type==='jink'&&!ignoreArmor&&p.equip.armor?.key==='eightDiagram'){
        const k=await this.option(p,'发动八卦阵？',[{key:'judge',label:'判定：红色视为闪'},{key:'skip',label:'不发动'}],context.unavoidable?'skip':'judge',title);
        if(k==='judge'){
          let c=this.takeTop();if(c){this.table.push(c);c=await this.reviseJudgment(p,'八卦阵',c);await this.showJudgment(p,'八卦阵',c,!isRed(c),isRed(c)?'成功，视为闪':'失败，仍可从手牌出闪','红色判定牌视为闪');this.drop(c);
            if(isRed(c)){const v={...defs.jink,id:'eightDiagram',virtual:true,rank:0,suit:'N',originSkill:'eightDiagram'};if(!played){await this.markCardUse(p,v,[]);await this.afterCardUse(p,v,[]);}this.showCardAction(p,v,[],'八卦响应');this.sound('response',{playerId:p.id,cardKey:'jink'});return true;}
          }
        }
      }
      const matching=p.hand.filter(c=>(type==='slash'?isSlash(c):c.key===type)&&this.allowedUse(p,c,played)),skills=this.responseSkillOptions(p,type,played);
      const opts=[...matching.map(c=>({key:c.id,label:(played?'打出':'使用')+c.name,card:c})),...skills];
      if(type==='jink'&&!played&&this.canZonghu(p))opts.push({key:'zonghu',label:'宗护：交'+this.zonghuCost()+'张牌视为闪'});
      if(type==='slash'&&p.equip.weapon?.key==='spear'&&this.spearCards(p,played).length>=2)opts.push({key:'spear',label:'丈八蛇矛：两张手牌当杀'});
      opts.push({key:'pass',label:type==='slash'?'不出杀':'不出闪'});
      const normal=matching.find(c=>played||!this.isGeneralLocked(p,'pengyang')||![1,11,12,13].includes(c.rank));
      const beneficialSkill=skills.find(o=>!o.card||!this.isGeneralLocked(p,'pengyang')||![1,11,12,13].includes(o.card.rank));
      const zonghu=opts.some(o=>o.key==='zonghu')&&this.zonghuWorth(p,context.amount||1);
      const preferSkill=zonghu&&this.fengweiCards(p).length&&this.alive().some(t=>t.id!==p.id&&this.hostility(p,t)<-.5);
      let suggested=preferSkill?'zonghu':normal?.id||beneficialSkill?.key||(opts.some(o=>o.key==='spear')?'spear':zonghu?'zonghu':'pass');
      const longdan=skills.find(o=>o.key.startsWith('longdan:'));
      if(this.isGeneral(p,'jiezhaoyun')&&longdan&&context.source?.hand.length&&this.hostility(p,context.source)>0)suggested=longdan.key;
      if(context.unavoidable)suggested='pass';
      else if(suggested!=='pass'&&this.aiDamageTrade(p,type,{...context,ignoreArmor}))suggested='pass';
      const key=await this.option(p,title,opts,suggested);if(key==='pass')return false;
      let raw;
      if(key==='zonghu')raw=await this.zonghuCard(p,'jink');
      else if(key.includes(':'))raw=await this.prepareResponseSkill(p,key);
      else if(key==='spear'){
        const suggested=this.spearCards(p,played).sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,2).map(c=>c.id);
        const ids=await this.selectCards(p,'丈八蛇矛：选择两张手牌',this.spearCards(p,played),2,2,suggested),costs=this.moveBatch(p,()=>ids.map(id=>this.removeHand(p,id)));
        raw={...defs.slash,virtual:true,costs,rank:0,suit:costs.every(isRed)?'H':costs.every(c=>['S','C'].includes(c.suit))?'S':'N'};
      }else raw=this.removeHand(p,key);
      if(!raw)return false;const c={...raw};let valid=true;if(!played)valid=await this.markCardUse(p,c,[]);
      if(played)await this.afterPlayedCard?.(p,c,context);else await this.afterResponseCard?.(p,c,context);
      this.showCardAction(p,c,[],'响应');
      this.log(`${p.name}${played?'打出':'使用'}【${c.name}】。`,'response');this.sound('response',{playerId:p.id,cardKey:c.key});
      if(raw.virtual)(raw.costs||[]).forEach(c=>this.drop(c));else this.drop(raw);
      if(!played)await this.afterCardUse(p,c,[]);else await this.afterPlayedCardSettled?.(p,c,context);await this.pause();return valid;
    };
    P.dying=async function(target,source){
      const alone=false;
      this.sound('dying',{playerId:target.id});this.log(alone?`${target.name}进入濒死，只能自行使用桃或酒自救。`:`${target.name}进入濒死，需要${1-target.hp}张桃或自救酒。`,'danger');
      if(target.hp<=0&&await this.zhoutaiBuqu?.(target))return;
      await this.tuisheng(target);if(target.hp<=0&&!alone)await this.luanfeng(target);if(target.hp<=0&&!alone)await this.renxin(target);
      if(target.hp>0){this.log(`${target.name}脱离濒死。`,'system');return;}
      for(const p of this.actionOrder()){
        if(alone&&p.id!==target.id)continue;
        while(target.hp<=0&&p.alive){
          await this.flushSkillEvents();
          if(target.hp>0||!p.alive||this.over)break;
          const rescue=p.hand.filter(c=>(c.key==='peach'||p.id===target.id&&c.key==='wine')&&this.allowedUse(p,c));
          const skills=[...this.responseSkillOptions(p,'peach'),...(p.id===target.id?this.responseSkillOptions(p,'wine'):[])];
          if(!rescue.length&&!skills.length)break;
          const opts=[...rescue.map(c=>({key:c.id,label:'使用'+c.name+'救援',card:c})),...skills,{key:'pass',label:'不救援'}];
          const will=p.id===target.id||this.hostility(p,target)<-.5;
          const good=rescue.find(c=>!this.isGeneralLocked(p,'pengyang')||![1,11,12,13].includes(c.rank));
          const skill=skills.find(c=>!c.card||![1,11,12,13].includes(c.card.rank));
          const key=await this.option(p,`${target.name}濒死（体力${target.hp}），是否救援？`,opts,will?(good?.id||skill?.key||'pass'):'pass','桃可以救任何角色，酒只能自救。');if(key==='pass')break;
          const raw=key.includes(':')?await this.prepareResponseSkill(p,key):this.removeHand(p,key);if(!raw)break;
          const c={...raw},valid=await this.markCardUse(p,c,[target]);this.showCardAction(p,c,[target],'救援');
          if(raw.virtual)(raw.costs||[]).forEach(card=>this.drop(card));else this.drop(raw);
          if(valid){this.heal(target,c.dragonDouble&&c.suit==='H'?2:1);this.evidence(p,target,true);this.log(`${p.name}使用【${c.name}】救援${target.name}。`,'heal');}
          await this.afterCardUse(p,c,[target]);await this.pause();
        }
        if(target.hp>0){this.log(`${target.name}脱离濒死。`,'system');return;}
      }
      await this.death(target,source);
    };
    P.declaredSlash=async function(p,target,raw){
      const c={...raw},ts=[target],valid=await this.markCardUse(p,c,ts),bonus=p.drunk;p.drunk=0;
      this.showCardAction(p,c,ts,'出牌');
      try{if(valid)for(const t of ts)if(t.alive&&!this.over)await this.slash(p,t,c,c.nature,1+bonus);}
      finally{if(raw.virtual)(raw.costs||[]).forEach(x=>this.drop(x));else this.drop(raw);await this.afterCardUse(p,c,ts);}
    };
    P.followSlash=async function(p,target){
      const cs=p.hand.filter(c=>isSlash(c)&&this.allowedUse(p,c)),skills=this.responseSkillOptions(p,'slash');
      const opts=[...cs.map(c=>({key:c.id,label:'追杀：'+c.name,card:c})),...skills];if(this.canZonghu(p))opts.push({key:'zonghu',label:'宗护：给牌当杀'});opts.push({key:'pass',label:'不追杀'});
      const good=cs.find(c=>!this.isGeneralLocked(p,'pengyang')||![1,11,12,13].includes(c.rank)),skill=skills.find(o=>!o.card||![1,11,12,13].includes(o.card.rank));
      const suggested=this.hostility(p,target)>0?(good?.id||skill?.key||(this.zonghuWorth(p)&&opts.some(o=>o.key==='zonghu')?'zonghu':'pass')):'pass';
      const k=await this.option(p,'青龙偃月刀：继续追杀'+target.name+'？',opts,suggested);if(k==='pass')return;
      const raw=k==='zonghu'?await this.zonghuCard(p,'slash'):k.includes(':')?await this.prepareResponseSkill(p,k):this.removeHand(p,k);if(raw)await this.declaredSlash(p,target,raw);
    };
    P.borrow=async function(actor,killer,victim){
      if(!victim?.alive||!killer.alive||!killer.equip.weapon)return;
      const cs=killer.hand.filter(c=>isSlash(c)&&this.allowedUse(killer,c)),skills=this.responseSkillOptions(killer,'slash');
      const opts=[...cs.map(c=>({key:c.id,label:'对'+victim.name+'使用'+c.name,card:c})),...skills];
      if(this.canZonghu(killer))opts.push({key:'zonghu',label:'宗护：给牌当杀'});
      if(killer.equip.weapon?.key==='spear'&&this.spearCards(killer).length>=2)opts.push({key:'spear',label:'丈八蛇矛：两张手牌当杀'});
      opts.push({key:'pass',label:'交出武器给'+actor.name});
      const good=cs.find(c=>killer.general!=='pengyang'||![1,11,12,13].includes(c.rank));
      const suggested=this.hostility(killer,victim)>0?(good?.id||skills[0]?.key||(opts.some(o=>o.key==='spear')?'spear':this.zonghuWorth(killer)&&opts.some(o=>o.key==='zonghu')?'zonghu':'pass')):'pass';
      const key=await this.option(killer,'借刀杀人：对'+victim.name+'出杀，或交出武器',opts,suggested);
      if(key==='pass'){if(killer.equip.weapon&&actor.alive){const c=this.removeOwned(killer,killer.equip.weapon.id).card;this.gain(actor,[c]);this.log(`${actor.name}获得${killer.name}的【${c.name}】。`,'draw');}return;}
      let raw;
      if(key==='zonghu')raw=await this.zonghuCard(killer,'slash');else if(key.includes(':'))raw=await this.prepareResponseSkill(killer,key);
      else if(key==='spear'){const ids=await this.selectCards(killer,'丈八蛇矛：选择两张手牌',this.spearCards(killer),2,2,this.spearCards(killer).sort((a,b)=>this.value(a,killer)-this.value(b,killer)).slice(0,2).map(c=>c.id));const costs=this.moveBatch(killer,()=>ids.map(id=>this.removeHand(killer,id)));raw={...defs.slash,virtual:true,costs,rank:0,suit:costs.every(isRed)?'H':costs.every(c=>['S','C'].includes(c.suit))?'S':'N'};}
      else raw=this.removeHand(killer,key);if(raw)await this.declaredSlash(killer,victim,raw);
    };
    P.groupTrickResolved=async function(p,card,players){
      const pool=[];
      if(card.key==='harvest')for(let i=0;i<players.length;i++){const c=this.takeTop();if(c){pool.push(c);this.table.push(c);}}
      try{for(const t of this.actionOrder(players)){
        if(!t.alive||this.over||this.turnInterrupted)continue;
        if(card.key==='healAll'){this.heal(t);this.evidence(p,t,true);}
        else if(card.key==='harvest'){
          if(!pool.length)continue;const best=[...pool].sort((a,b)=>this.value(b,t)-this.value(a,t))[0];
          const id=await this.option(t,'五谷丰登：选择一张牌',pool.map(c=>({key:c.id,label:c.name,card:c})),best.id,'亮出的牌公开可见，每名角色获得一张。');
          const c=pool.splice(pool.findIndex(c=>c.id===id),1)[0];this.table=this.table.filter(x=>x.id!==c.id);this.gain(t,[c]);this.log(`${t.name}从五谷丰登中获得【${c.name}】。`,'draw');
        }else{
          if(!card.ignoreArmor&&t.equip.armor?.key==='vine'){this.log(`${t.name}的藤甲抵消【${card.name}】。`,'response');continue;}
          this.evidence(p,t,false);const ok=await this.response(t,card.key==='barbarian'?'slash':'jink',`【${card.name}】：请打出${card.key==='barbarian'?'杀':'闪'}，否则受到1点伤害`,!!card.ignoreArmor,{played:true,amount:1,source:p,card});
          if(!ok||card.noCancel)await this.damage(p,t,1,'normal',{card});
        }
        await this.pause();
      }}finally{pool.forEach(c=>this.drop(c));}
    };
  }
  root.ZhenExtraSkills={install};if(typeof module!=='undefined')module.exports={install};
})(typeof globalThis!=='undefined'?globalThis:this);
