(function(root){
  'use strict';
  const names={guifu:'诡伏',molin:'无双',duoqi:'夺势',kuangmo:'骁勇',gangquan:'武威',jiushi:'酒诗',fangzhu:'放逐',juejin:'决进',qiangxi:'强袭',huoji:'火计',quhu:'驱虎',jiequhu:'驱虎',jieming:'节命',dingan:'定安',qingzheng:'清正'};
  const native={caomao:['qianlong','weitong'],mosimayi:['guifu','moubian'],molvbu:['duoqi','kuangmo','gangquan'],zuxunyu:['dingan','funing','daojie'],zuwangshen:['anran','zhongliu','gaobian'],zuyangbiao:['jiannan','yichi','quhuo'],jiexunyu:['jiequhu','jieming','qizeng']};
  const thresholds={qingzheng:25,jiushi:50,fangzhu:75,juejin:99};
  const damaging=c=>c&&(['slash','fireSlash','thunderSlash','duel','arrows','barbarian','fireAttack'].includes(c.key));
  const cardName=c=>['fireSlash','thunderSlash'].includes(c.key)?'slash':c.key;
  const forbidden=c=>['jink','peach','wine'].includes(c.key);
  function install(Game,C){
    const P=Game.prototype,{defs,isSlash,isRed}=C;
    const qiUse=c=>{const physical=c.virtual?c.costs||[]:[c];return physical.length>0&&physical.every(x=>x?.qiOwner!=null);};
    P.isGeneralLocked=function(p,id){return !!p?.alive&&p.general===id&&(!p.silenced||!p.restrictionUntil&&[p.dujuSilence,p.machaoSilence].some(s=>s&&!s.wasSilenced));};
    P.isGeneral=function(p,id){return p?.general===id&&(!p.silenced||id==='caomao'||id==='wuyi'&&this.isGeneralLocked(p,id));};
    P.hasSkill=function(p,key){
      if(!p?.alive||p.lostSkills?.includes(key))return false;
      if(p.general==='caomao'&&(native.caomao.includes(key)||thresholds[key]&&(p.daoxin||0)>=thresholds[key]))return true;
      if(p.silenced){
        const locked=['dingan','daojie','zhongliu','gaobian'];
        if(!(!p.restrictionUntil&&[p.dujuSilence,p.machaoSilence].some(s=>s&&!s.wasSilenced)&&locked.includes(key)))return false;
      }
      return (native[p.general]||[]).includes(key)||(p.copiedSkills||[]).includes(key)||p.temporarySkill===key||(key==='zhouxi'&&p.general==='mosimayi'&&p.demonic);
    };
    const init=P.initExtra,setup=P.setup,begin=P.beginTurnSkills,draw=P.draw,gain=P.gain,heal=P.heal,flip=P.turnOver,takeTurn=P.takeTurn;
    P.initExtra=function(p){init.call(this,p);Object.assign(p,{armor:0,daoxin:0,juejinUsed:false,fangzhuUsed:false,fangzhuLast:null,fangzhuCurrent:null,silenced:false,handBlocked:false,restrictionUntil:null,guifuIds:[],guifuRecords:[],guifuUsed:[],demonic:false,molWushuang:false,molinActive:false,molinHit:false,roundDamage:0,roundVictims:[],copiedSkills:[],temporarySkill:null,lostSkills:[],crazyTarget:null,crazyHits:[],duoqiHits:[],lastQi:false,anranCount:0,anranBlocked:[],dinganChosen:[],daojieTurn:-1,funingRound:-1,jiannanCount:0,jiannanOptions:[],jiannanActive:false,quhuoTurn:-1,activeUsed:[]});};
    P.setup=function(){this.exiled=[];this._dynEvents=[];this._origins={};this.usedNames={};this.hurtIds=[];this.dyingThisTurn=false;this._setupDyn=true;setup.call(this);this._setupDyn=false;
      for(const p of this.players){if(p.general==='caomao')p.daoxin=p.role==='主公'&&this.players.some(t=>t.id!==p.id&&this.general(t).faction==='魏')?60:20;}
      if(this.players.some(p=>p.general==='molvbu'))for(const p of this.players)for(const c of p.hand)c.qiOwner=p.id;
    };
    P.beginTurnSkills=function(){begin.call(this);this.usedNames={};this.hurtIds=[];this.dyingThisTurn=false;this._discardedTurn=[];
      for(const p of this.players){p.guifuUsed=[];p.dinganChosen=[];p.crazyHits=[];p.duoqiHits=[];p.anranBlocked=[];p.jiannanCount=0;p.jiannanOptions=[];p.jiannanActive=false;p.activeUsed=[];}
    };
    P.daoGain=function(p,n){if(this._setupDyn||!this.hasSkill(p,'qianlong')||!n)return;const old=p.daoxin;p.daoxin=Math.min(99,old+n);if(old!==p.daoxin)this.log(`${p.name}道心 ${old} → ${p.daoxin}。`,'system');};
    P.draw=function(p,n,announce=true){const before=p.hand.length;draw.call(this,p,n,announce);if(p.hand.length>before)this.daoGain(p,5);};
    P.physicalCard=function(c){return c?.convertedDelay?this.allCards.find(x=>x.id===c.id)||c:c;};
    P.gain=function(p,cards){const physical=cards.map(c=>this.physicalCard(c));gain.call(this,p,physical);if(physical.filter(Boolean).length)this.daoGain(p,5);};
    P.putDiscard=function(...cards){for(const raw of cards.filter(Boolean)){const c=this.physicalCard(raw);(this._discardedTurn||(this._discardedTurn=[])).push(c.id);if(this.xiangsi&&forbidden(c))this.exiled.push(c);else this.discard.push(c);}return this.discard.length;};
    P.queueDyn=function(type,p,data={}){(this._dynEvents||(this._dynEvents=[])).push({type,id:p.id,generation:p.generation,...data});};
    P.obtainDeck=function(p,predicate,random=false){const pool=this.deck.filter(predicate);if(!pool.length)return null;const c=pool[random?Math.floor(this.random()*pool.length):pool.length-1];this.deck.splice(this.deck.indexOf(c),1);this.gain(p,[c]);return c;};
    P.guifuGain=function(p){if(!this.hasSkill(p,'guifu'))return;const c=this.obtainDeck(p,c=>c.key==='jink');if(c){p.guifuIds.push(c.id);this.log(`${p.name}【诡伏】获得一张不占手牌上限的闪。`,'draw');}};
    P.hpChanged=function(p,old){if(p.hp===old||!p.alive)return;this.guifuGain(p);if(this.hasSkill(p,'funing')&&p.funingRound!==this.round){p.funingRound=this.round;this.queueDyn('funing',p);}};
    P.heal=function(p,n=1){const old=p.hp;heal.call(this,p,n);this.hpChanged(p,old);};
    P.turnOver=function(p){flip.call(this,p);if(this.hasSkill(p,'jiushi')){const c=this.obtainDeck(p,c=>['trick','delay'].includes(c.kind),true);if(c)this.log(`${p.name}【酒诗】获得【${c.name}】。`,'draw');if(!p.turnedOver){const basic=this.obtainDeck(p,c=>c.kind==='basic',true);if(basic)this.log(`${p.name}【酒诗】翻回正面，额外获得基本牌【${basic.name}】。`,'draw');}}};
    P.handLimit=function(p){return Math.max(0,p.hp)+(this.hasSkill(p,'guifu')?p.hand.filter(c=>p.guifuIds.includes(c.id)).length:0);};
    P.loseHp=async function(p,n=1,reason='技能'){if(!p.alive)return;const old=p.hp;p.hp-=n;this.log(`${p.name}因【${reason}】失去${n}点体力。`,'damage');this.hpChanged(p,old);if(this.afterLoseHp)await this.afterLoseHp(p,n,reason);if(p.hp<=0)await this.dying(p,null);await this.flushSkillEvents();};
    P.applyDamageHealth=function(source,target,amount,context){
      const old=target.hp,absorbed=Math.min(target.armor||0,amount);target.armor-=absorbed;target.hp-=amount-absorbed;if(target.hp<=0)this.dyingThisTurn=true;
      if(absorbed)this.log(`${target.name}的护甲抵挡${absorbed}点伤害，剩余${target.armor}。`,'system');
      if(source?.molinActive&&source.id!==target.id&&this.turn===source.id&&target.hp<old)source.molinHit=true;
      if(!this.hurtIds.includes(target.id))this.hurtIds.push(target.id);
      this.daoGain(target,10*amount);if(source&&!context.selfInflicted){this.daoGain(source,15*amount);source.roundDamage+=amount;if(!source.roundVictims.includes(target.id))source.roundVictims.push(target.id);}
      const recorded=context.skill||context.card&&cardName(context.card);
      if(recorded)for(const p of this.alive())if(this.hasSkill(p,'guifu')&&!p.guifuRecords.includes(recorded)){p.guifuRecords.push(recorded);this.log(`${p.name}【诡伏】记录${names[recorded]||defs[recorded]?.name||recorded}。`,'system');}
      this.hpChanged(target,old);
    };
    const damage=P.damage,dying=P.dying,death=P.death;
    P.damage=async function(source,target,amount=1,nature='normal',context={}){
      if(!context.xuchuTransferred&&source?.alive&&target.alive&&amount>0&&source.id!==target.id&&source.crazyTarget===target.id&&!source.crazyHits.includes(target.id)){
        source.crazyHits.push(target.id);amount++;this.log(`${source.name}【骁勇】本回合首次对指定对手${target.name}造成伤害，伤害+1。`,'system');
      }
      return damage.call(this,source,target,amount,nature,{...context,faceDownAtDamage:!!target.turnedOver});
    };
    P.damageFinished=async function(source,target,amount,context,generation){
      if(this.over)return;
      if(!context.selfInflicted&&source?.alive&&source.id!==target.id&&this.hasSkill(source,'duoqi'))await this.takeQi(source,target.id,1);
      if(target.alive&&target.generation===generation){
        if(this.hasSkill(target,'anran'))await this.anran(target);
        if(this.hasSkill(target,'jiushi')&&target.turnedOver&&context.faceDownAtDamage&&await this.yes(target,'酒诗：受到伤害后翻回正面？',true))this.turnOver(target);
        for(let i=0;i<amount&&target.alive&&!this.over&&this.hasSkill(target,'jieming');i++)await this.jieming(target,false,i+1,amount);
      }
      await this.flushSkillEvents();
    };
    P.dying=async function(p,source){this.dyingThisTurn=true;return dying.call(this,p,source);};
    P.death=async function(p,source){
      const generation=p.generation;
      if(this.hasSkill(p,'jieming'))await this.jieming(p,true);
      if(source?.alive&&this.alive().some(t=>(t.id===source.id&&t.crazyTarget===p.id)||(t.id===p.id&&t.crazyTarget===source.id)))await this.takeQi(source,p.id,Infinity);
      await death.call(this,p,source);
      if(p.generation!==generation)this.initExtra(p);
      for(const owner of this.alive())if(owner.crazyTarget===p.id&&!this.over){owner.crazyTarget=null;await this.setCrazy(owner);}
    };
    P.yes=async function(p,title,suggested=true){return await this.option(p,title,[{key:'yes',label:'发动'},{key:'no',label:'不发动'}],suggested?'yes':'no')==='yes';};
    P.pickRole=async function(p,title,targets,benefit=false,preferred=null){if(!targets.length)return null;const best=preferred||[...targets].sort((a,b)=>(benefit?1:-1)*(this.hostility(p,a)-this.hostility(p,b))||a.hp-b.hp)[0];const k=await this.option(p,title,targets.map(t=>({key:String(t.id),label:`${t.name} · ${this.general(t).name} · ${t.hp}血 · 手牌${t.hand.length}`})),String(best.id));return this.get(Number(k));};
    P.jieming=async function(p,onDeath=false,index=1,total=1){
      const targets=this.alive().filter(t=>!onDeath||t.id!==p.id);if(!targets.length)return;
      const score=t=>{const gap=Math.min(5,t.maxHp)-t.hand.length,hostility=this.hostility(p,t);
        if(hostility>.5)return gap<=-3?-gap-2:0;
        if(t.id===p.id)return Math.max(0,gap)*.9;
        return hostility<-.5?Math.max(0,gap):0;
      };
      const best=targets.map(t=>({target:t,score:score(t)})).filter(x=>x.score>0)
        .sort((a,b)=>b.score-a.score||this.hostility(p,a.target)-this.hostility(p,b.target))[0]?.target;
      const title=onDeath?'节命：死亡时发动？':`节命：本次伤害第${index}/${total}点，是否发动？`;
      if(!await this.yes(p,title,!!best))return;
      const id=await this.option(p,'节命：选择摸牌角色',targets.map(t=>({key:String(t.id),label:`${t.name} · 手牌${t.hand.length} · 体力上限${t.maxHp}`})),String((best||targets[0]).id),'目标摸X张牌，再把手牌弃至X张；X为体力上限且最多为5。');
      const target=this.get(Number(id)),limit=Math.min(5,target.maxHp);
      this.log(`${p.name}发动【节命】，令${target.name}摸${limit}张牌，再将手牌弃至${limit}张。`,'draw');
      this.draw(target,limit);this.evidence(p,target,this.hostility(p,target)<=0);
      if(this.options.rulesVersion>=11)await this.flushSkillEvents();
      const excess=Math.max(0,target.hand.length-limit);
      if(excess){const suggested=this.cheap(target,target.hand,excess);const ids=await this.selectCards(target,`节命：弃置${excess}张手牌`,target.hand,excess,excess,suggested,`摸牌后将手牌弃至${limit}张。`);this.discardOwned(target,ids);}
      await this.pause();
    };
    P.cheap=function(p,cards,n){return [...cards].sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,n).map(c=>c.id);};
    P.clanMembers=function(p){const clan=this.general(p).clan;return this.alive().filter(t=>t.id===p.id||clan&&this.general(t).clan===clan);};

    // Card movement keeps the physical card in exactly one zone. Loss reasons distinguish discard from giving/recasting/pindian.
    const removeHand=P.removeHand,removeOwned=P.removeOwned,batch=P.moveBatch,discard=P.discardOwned;
    P.cardsLost=function(p,before,reason){
      const lost=before.filter(c=>!p.hand.includes(c));if(!lost.length||this._dynBatch)return;
      for(const c of lost){p.guifuIds=p.guifuIds.filter(id=>id!==c.id);this._origins[c.id]={owner:p.id,clan:this.general(p).clan,reason};}
      if(this.hasSkill(p,'quhuo')&&!['use','play','discard'].includes(reason)&&lost.some(c=>c.key==='wine'||c.kind==='equip')&&p.quhuoTurn!==this.totalTurns){p.quhuoTurn=this.totalTurns;this.queueDyn('quhuo',p);}
      if(this.phase==='出牌'&&!this.alive().some(t=>t.hp<=0))for(const owner of this.alive())if(owner.jiannanActive&&this.hasSkill(owner,'jiannan')){
        const tag=`${this.totalTurns}:${owner.id}`,had=before.some(c=>c.jiannanTag===tag),now=p.hand.some(c=>c.jiannanTag===tag);
        if(!p.hand.length||had&&!now)this.queueDyn('jiannan',owner);
      }
    };
    P.removeHand=function(p,id){const before=[...p.hand],c=removeHand.call(this,p,id);if(this._dynBatch)this._batchLossReason=this._lossReason||'use';this.cardsLost(p,before,this._lossReason||'use');return c;};
    P.removeOwned=function(p,id){const before=[...p.hand],result=removeOwned.call(this,p,id);if(this._dynBatch)this._batchLossReason=this._lossReason||'move';this.cardsLost(p,before,this._lossReason||'move');return result;};
    P.moveBatch=function(p,fn){const before=[...p.hand];if(!this._dynBatch)this._batchLossReason=null;this._dynBatch=(this._dynBatch||0)+1;try{return batch.call(this,p,fn);}finally{this._dynBatch--;this.cardsLost(p,before,this._lossReason||this._batchLossReason||'move');}};
    P.withLoss=function(reason,fn){const old=this._lossReason;this._lossReason=reason;try{return fn();}finally{this._lossReason=old;}};
    P.discardOwned=function(p,ids){return this.withLoss('discard',()=>discard.call(this,p,ids));};
    const flush=P.flushSkillEvents;
    P.flushSkillEvents=async function(){await flush.call(this);if(this._flushingDyn||this.over)return;this._flushingDyn=true;
      try{while(this._dynEvents?.length&&!this.over){const e=this._dynEvents.shift(),p=this.get(e.id);if(!p?.alive||p.generation!==e.generation)continue;
        if(e.type==='funing'&&p.hp<=0){this._dynEvents.push(e);break;}if(e.type==='funing'&&this.hasSkill(p,'funing'))await this.funing(p);
        if(e.type==='quhuo'&&this.hasSkill(p,'quhuo')){const ts=this.clanMembers(p).filter(t=>t.hp<t.maxHp);if(ts.length&&await this.yes(p,'去惑：令同族角色回复体力？',true)){const t=await this.pickRole(p,'去惑：选择回复对象',ts,true);this.heal(t);}}
        if(e.type==='jiannan'&&p.jiannanActive&&this.hasSkill(p,'jiannan')&&this.phase==='出牌'&&!this.alive().some(t=>t.hp<=0))await this.jiannanTrigger(p);
      }}finally{this._flushingDyn=false;}
    };
    P.takePhysical=function(id){
      for(const zone of [this.deck,this.discard,this.table]){const i=zone.findIndex(c=>c.id===id);if(i>=0)return zone.splice(i,1)[0];}
      for(const t of this.players){if(this.owned(t,true).some(c=>c.id===id))return this.removeOwned(t,id).card;for(const zone of [t.sealedPile,t.luPile,t.zhoutaiChuang||[],t.caiyongBooks||[]]){const i=zone.findIndex(c=>c.id===id);if(i>=0)return zone.splice(i,1)[0];}}return null;
    };
    P.takeQi=async function(p,owner,count){
      const candidates=this.allCards.filter(c=>c.qiOwner===owner&&!this.owned(p,true).includes(c)&&!this.table.includes(c)&&!this.exiled.includes(c));
      let chosen=candidates;const cards=[];
      if(count!==Infinity&&candidates.length){const options=candidates.map((c,i)=>{const holder=this.players.find(t=>t.hand.includes(c)),publicCard=this.discard.includes(c)||this.players.some(t=>Object.values(t.equip).includes(c)||t.judge.includes(c));return {key:c.id,label:publicCard?'取得炁：'+c.name:holder?holder.name+'的手牌炁 · '+(i+1):'牌堆中的炁 · '+(i+1),...(publicCard?{card:c}:{})};});const id=await this.option(p,'夺势：取得一张属于'+this.get(owner).name+'的炁',options,candidates[Math.floor(this.random()*candidates.length)].id,'炁随实体牌保留；暗置的牌不展示牌面。');chosen=candidates.filter(c=>c.id===id);}
      for(const c of chosen){const physical=this.takePhysical(c.id);if(physical)cards.push(physical);}this.gain(p,cards);
      if(cards.length)this.log(`${p.name}获得${cards.length}张原属于${this.get(owner).name}的炁。`,'draw');
    };
    P.setCrazy=async function(p){const target=await this.pickRole(p,'骁勇：指定一名对手',this.alive().filter(t=>t.id!==p.id));if(target){p.crazyTarget=target.id;p.demonic=true;this.log(`${p.name}发动【骁勇】，指定${target.name}为对手。`,'system');}};

    P.takeTurn=async function(p){
      p.molWushuang=false;p.molinActive=false;p.molinHit=false;
      const offense=p.hand.some(c=>isSlash(c)||c.key==='duel')||
        this.owned(p).some(c=>c.kind==='trick'&&this.hasSkill(p,'gangquan'));
      const enemyInReach=this.alive().some(t=>this.hostility(p,t)>0&&
        (this.canSlash(p,t)||p.hand.some(c=>c.key==='duel')));
      if(this.isGeneral(p,'molvbu')&&await this.yes(p,'无双：对自己造成1点普通伤害，本回合令杀需双闪、决斗需双杀？',p.hp>2&&!p.turnedOver&&offense&&enemyInReach)){
        await this.damage(p,p,1,'normal',{skill:'molin',selfInflicted:true});
        if(p.alive&&!this.over&&this.isGeneral(p,'molvbu')){p.molWushuang=true;p.molinActive=true;this.log(`${p.name}发动【无双】，本回合杀需双闪、决斗需双杀。`,'system');}
      }
      if(!p.alive||this.over)return;
      try{return await takeTurn.call(this,p);}finally{
        if(p.alive&&p.molinActive&&p.molinHit&&p.hp<p.maxHp){this.heal(p,1);this.log(`${p.name}【无双】本回合伤及其他角色，回复1点体力。`,'heal');}
        p.molWushuang=false;p.molinActive=false;p.molinHit=false;
      }
    };

    const roundStart=P.roundStart;
    P.roundStart=async function(){const fresh=this.startedRound!==this.round;await roundStart.call(this);if(fresh)for(const p of this.alive())this.guifuGain(p);};
    P.roundEndSkills=async function(){
      for(const p of this.actionOrder())if(this.hasSkill(p,'zhouxi'))for(const id of [...p.roundVictims]){const t=this.get(id);if(t.alive&&p.alive&&!this.over)await this.declaredSlash(t,p,{...defs.slash,virtual:true,costs:[],rank:0,suit:'N'});}
      for(const p of this.actionOrder())if(p.demonic&&!p.roundDamage&&!this.over)await this.loseHp(p,1,p.crazyTarget!=null?'骁勇':'入魔');
      for(const p of this.players){p.roundDamage=0;p.roundVictims=[];}
    };
    P.openingSkills=async function(){
      const originalTurn=this.turn;
      for(const p of this.players.filter(t=>this.hasSkill(t,'duoqi'))){if(!p.alive||this.over)break;this.turn=p.id;this.totalTurns++;this.beginTurnSkills();this.phase='出牌';this._openingPlay=true;p.slashUsed=0;p.wineUsed=0;
        this.log(`${p.name}【夺势】执行开局额外出牌阶段。`,'turn');await this.playStartSkills(p);
        for(let i=0;i<150&&p.alive&&!this.over;i++){await this.flushSkillEvents();const actions=this.legalActions(p),a=await this.choose(p,{kind:'play',title:'夺势：开局额外出牌阶段',detail:'可以使用牌和主动技能，不能使用延时锦囊。没有弃牌阶段。',actions},()=>this.aiPlay(p,actions));if(a.type==='end')break;await this.useAction(p,a);await this.pause();}
        this._openingPlay=false;this.phase='结束';await this.turnEndSkills();p.drunk=0;
      }this.turn=originalTurn;
    };
    P.preparationSkills=async function(p){
      const previous=p.temporarySkill;
      if(this.hasSkill(p,'moubian')&&!p.demonic&&p.guifuRecords.length>=3&&await this.yes(p,'谋变：入魔并获得已记录的技能？',true)){p.demonic=true;p.copiedSkills=p.guifuRecords.filter(k=>names[k]&&!defs[k]);this.log(`${p.name}发动【谋变】入魔。`,'system');}
      if(this.hasSkill(p,'zhouxi')){
        let kept=false;
        if(previous){
          const cards=this.owned(p),cost=[...cards].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
          const useful=['dingan','qingzheng'].includes(previous)||previous==='qiangxi'&&p.hp>2;
          const answer=await this.option(p,`骤袭：保留【${names[previous]}】还是弃去摸一张牌？`,[
            ...(cards.length?[{key:'keep',label:'弃一张牌，保留'+names[previous]}]:[]),
            {key:'replace',label:'弃去'+names[previous]+'，摸一张牌并选新技能'}
          ],cost&&useful&&this.value(cost,p)<=5?'keep':'replace');
          if(answer==='keep'&&cards.length){
            const id=await this.option(p,'骤袭：弃一张牌保留技能',cards.map(c=>({key:c.id,label:c.name,card:c})),cost.id);
            this.discardOwned(p,[id]);kept=true;this.log(`${p.name}【骤袭】弃一张牌，保留【${names[previous]}】。`,'system');
          }else{p.temporarySkill=null;this.draw(p,1);this.log(`${p.name}【骤袭】弃去【${names[previous]}】，摸一张牌。`,'draw');}
        }
        if(!kept){
          const available=['qiangxi','huoji','quhu','dingan','qingzheng'].filter(k=>!p.copiedSkills.includes(k));
          const pool=this.shuffle(available.filter(k=>k!==previous));
          if(pool.length<3&&previous&&available.includes(previous))pool.push(previous);
          const options=pool.slice(0,3);
          if(options.length){p.temporarySkill=await this.option(p,'骤袭：选择本回合获得的技能',options.map(k=>({key:k,label:names[k]+' · '+this.acquiredText(k)})),options.includes('qiangxi')?'qiangxi':options[0]);this.log(`${p.name}【骤袭】获得【${names[p.temporarySkill]}】至下回合开始。`,'system');}
        }
      }else p.temporarySkill=null;
    };
    P.acquiredText=function(k){return {qiangxi:'出牌阶段一次，弃武器或失去1体力，对攻击范围内一人造成1伤害',huoji:'红色手牌当火攻使用',quhu:'出牌阶段一次，与体力比你高者拼点，赢则令其伤害范围内一人，没赢则其伤害你',dingan:'同名牌第二次使用后触发定安',qingzheng:'出牌阶段开始弃一种花色的牌，再查看并弃掉对方一种花色手牌'}[k]||k;};
    P.playStartSkills=async function(p){p.fangzhuUsed=false;
      if(this.hasSkill(p,'qingzheng'))await this.qingzheng(p);
      if(this.hasSkill(p,'anran'))await this.anran(p);
      if(this.hasSkill(p,'jiannan')&&await this.yes(p,'间难：摸两张牌并开启本阶段技能？',true)){p.jiannanActive=true;p.jiannanCount++;this.jiannanDraw(p,p);}
    };
    P.finishPhaseSkills=async function(p){p.jiannanActive=false;if(this.hasSkill(p,'yichi')&&p.hand.length&&this.alive().some(t=>t.id!==p.id&&t.hand.length)&&await this.yes(p,'义叱：与一名角色拼点？',p.jiannanCount>0&&Math.max(...p.hand.map(c=>c.rank))>=9)){
      const t=await this.pickRole(p,'义叱：选择拼点对手',this.alive().filter(t=>t.id!==p.id&&t.hand.length));if(await this.pindian(p,t,'义叱'))for(let i=1;i<=Math.min(4,p.jiannanCount)&&t.alive&&!this.over;i++){
        let recipient=t;
        if(i===2){
          const friends=this.alive().filter(v=>v.id===p.id||this.hostility(p,v)<-.5);
          recipient=await this.pickRole(p,'义叱：指定一名己方角色摸两张牌',friends,true);
        }
        await this.jiannanEffect(p,recipient,i,false);
      }
    }};
    const turnEnd=P.turnEndSkills;
    P.turnEndSkills=async function(){for(const p of this.players)p.jiannanActive=false;await turnEnd.call(this);
      for(const p of this.actionOrder())if(this.hasSkill(p,'gaobian')&&p.id!==this.turn&&this.hurtIds.length===1&&!this.over){const t=this.get(this.hurtIds[0]);if(t.alive)await this.gaobian(p,t);}
      for(const p of this.players){p.anranBlocked=[];if(p.id===this.turn&&p.restrictionUntil!=null&&p.turns>=p.restrictionUntil){p.handBlocked=false;p.silenced=false;p.restrictionUntil=null;}}
    };
    P.qingzheng=async function(p){
      const targets=this.alive().filter(t=>t.id!==p.id&&t.hand.length);if(!p.hand.length||!targets.length)return;
      const suits=[...new Set(p.hand.map(c=>c.suit))],cheap=[...suits].sort((a,b)=>p.hand.filter(c=>c.suit===a).reduce((n,c)=>n+this.value(c,p),0)-p.hand.filter(c=>c.suit===b).reduce((n,c)=>n+this.value(c,p),0))[0];
      if(!await this.yes(p,'清正：弃置一种花色的手牌？',p.hand.filter(c=>c.suit===cheap).reduce((n,c)=>n+this.value(c,p),0)<12))return;
      const suit=await this.option(p,'清正：选择自己的花色',suits.map(s=>({key:s,label:C.suitMark[s]+' · 弃置'+p.hand.filter(c=>c.suit===s).length+'张'})),cheap),cost=p.hand.filter(c=>c.suit===suit).map(c=>c.id);this.discardOwned(p,cost);
      const t=await this.pickRole(p,'清正：查看谁的手牌',targets),other=[...new Set(t.hand.map(c=>c.suit))];if(!other.length)return;
      const best=[...other].sort((a,b)=>t.hand.filter(c=>c.suit===b).length-t.hand.filter(c=>c.suit===a).length)[0];
      const selected=await this.choose(p,{kind:'options',title:'清正：选择对方要弃置的花色',detail:t.name+'的手牌已展示，仅发动者可查看。',revealedCards:[...t.hand],options:other.map(s=>({key:s,label:C.suitMark[s]+' · '+t.hand.filter(c=>c.suit===s).length+'张'}))},()=>best);
      const ids=t.hand.filter(c=>c.suit===selected).map(c=>c.id);this.discardOwned(t,ids);if(ids.length<cost.length&&t.alive)await this.damage(p,t,1,'normal',{skill:'qingzheng'});
    };
    P.funing=async function(p){
      const min=Math.max(1,p.maxHp-p.hp),cards=this.owned(p);if(cards.length<min)return;
      const friendly=this.alive().some(t=>t.id!==p.id&&this.hostility(p,t)<-.5);
      if(!await this.yes(p,'抚宁：交牌并尝试回复、调整手牌？',friendly||p.hp<p.maxHp))return;
      let suggestion=this.cheap(p,cards,min);for(const red of [true,false]){const cs=cards.filter(c=>isRed(c)===red);if(cs.length>=min){suggestion=this.cheap(p,cs,Math.min(cs.length,Math.max(min,this.hurtIds.length+1)));break;}}
      const ids=await this.selectCards(p,'抚宁：选择至少'+min+'张牌',cards,min,cards.length,suggestion),selected=cards.filter(c=>ids.includes(c.id));
      const friends=this.alive().filter(t=>t.id!==p.id&&this.hostility(p,t)<-.5);
      const preferred=[...friends].sort((a,b)=>a.hand.length-b.hand.length)[0]||p;
      const t=await this.pickRole(p,'抚宁：选择收牌角色',this.alive(),true,preferred);if(t.id!==p.id)this.gain(t,this.moveBatch(p,()=>ids.map(id=>this.removeOwned(p,id).card)));
      if(selected.every(c=>isRed(c)===isRed(selected[0])))this.heal(p);
      if(ids.length>this.hurtIds.length){if(p.hand.length<p.maxHp)this.draw(p,p.maxHp-p.hand.length);else if(p.hand.length>p.maxHp){const n=p.hand.length-p.maxHp,drop=await this.selectCards(p,'抚宁：将手牌调整到'+p.maxHp+'张',p.hand,n,n,this.cheap(p,p.hand,n));this.discardOwned(p,drop);}}
      this.log(`${p.name}发动【抚宁】，交出${ids.length}张牌。`,'system');
    };
    P.anran=async function(p){const x=Math.min(4,p.anranCount+1),ally=this.alive().find(t=>t.id!==p.id&&this.hostility(p,t)<-.5),share=x<=2&&ally&&ally.hand.length<=1&&p.hand.length>=4;
      const k=await this.option(p,'岸然：选择摸牌方式',[{key:'self',label:'自己摸'+x+'张'},{key:'group',label:'至多'+x+'名角色各摸一张'},{key:'pass',label:'不发动'}],share?'group':'self','这些牌不能作为获得者本回合下一张使用的牌。');if(k==='pass')return false;p.anranCount++;
      const drawBlocked=(t,n)=>{const before=new Set(t.hand.map(c=>c.id));this.draw(t,n);t.anranBlocked.push(...t.hand.filter(c=>!before.has(c.id)).map(c=>c.id));};
      if(k==='self')drawBlocked(p,x);else{const chosen=[];for(let i=0;i<x;i++){const ts=this.alive().filter(t=>!chosen.includes(t.id)),friends=ts.filter(t=>this.hostility(p,t)<-.5);const id=await this.option(p,'岸然：选择第'+(i+1)+'个摸牌角色',[...ts.map(t=>({key:String(t.id),label:t.name+' · 手牌'+t.hand.length})),{key:'pass',label:'完成分配'}],friends.length?String(friends.sort((a,b)=>a.hand.length-b.hand.length)[0].id):'pass');if(id==='pass')break;chosen.push(Number(id));drawBlocked(this.get(Number(id)),1);}}
      this.log(`${p.name}发动【岸然】，累计${p.anranCount}次。`,'draw');
      return true;
    };
    P.gaobian=async function(p,t){const cards=this.discard.filter(c=>isSlash(c)&&(this._discardedTurn||[]).includes(c.id)),ts=this.alive().filter(v=>this.canSlash(t,v));const options=[];for(const c of cards)for(const v of ts)options.push({key:c.id+':'+v.id,label:c.name+' → '+v.name,card:c});options.push({key:'lose',label:'失去1点体力'});
      const enemy=ts.find(v=>this.hostility(t,v)>0),best=enemy&&cards.length?cards[0].id+':'+enemy.id:'lose';const k=await this.option(t,'告变：使用弃牌堆的杀或失去体力',options,best,`${p.name}的告变：本回合只有你受到过伤害。`);
      if(k==='lose')await this.loseHp(t,1,'告变');else{const [id,target]=k.split(':'),c=this.takePhysical(id);if(c){delete this._origins[c.id];this.table.push(c);const unrespondable=t.id===p.id;if(unrespondable)this.log(`${p.name}是本回合唯一受伤角色，【告变】使此杀不可响应。`,'system');await this.declaredSlash(t,this.get(Number(target)),unrespondable?{...c,unrespondable:true}:c);}}
    };
    P.pindian=async function(p,t,title){if(!p.hand.length||!t.hand.length)return false;
      const choose=who=>this.selectCards(who,title+'：选择一张手牌拼点',who.hand,1,1,[[...who.hand].sort((a,b)=>b.rank-a.rank||this.value(a,who)-this.value(b,who))[0].id],'双方选定前不显示对方的牌；觉醒后的吕蒙点数+1，最高13；同点由应战方获胜。');
      const [a]=await choose(p),[b]=await choose(t),ca=this.withLoss('pindian',()=>this.removeHand(p,a)),cb=this.withLoss('pindian',()=>this.removeHand(t,b));
      const points=[Math.min(13,ca.rank+(p.general==='lvmeng'&&p.lvmengAwakened?1:0)),Math.min(13,cb.rank+(t.general==='lvmeng'&&t.lvmengAwakened?1:0))];
      const won=points[0]>points[1];
      this.lastPindian={title,players:[p.name,t.name],cards:[{...ca},{...cb}],points,winner:won?p.name:t.name};this.pindianShowing=true;
      this.log(`${title}拼点：${p.name}【${ca.name}】${C.rankMark(ca.rank)}${points[0]!==ca.rank?'→'+points[0]:''}，${t.name}【${cb.name}】${C.rankMark(cb.rank)}${points[1]!==cb.rank?'→'+points[1]:''}；${this.lastPindian.winner}获胜${points[0]===points[1]?'（同点由应战方获胜）':''}。`,'reveal');this.change();await this.pause(1800);this.pindianShowing=false;
      for(const c of [ca,cb])this.drop(c);await this.flushSkillEvents();this.change();return won;
    };
    P.jiannanDraw=function(owner,target){const before=new Set(target.hand.map(c=>c.id));this.draw(target,2);for(const c of target.hand)if(!before.has(c.id))c.jiannanTag=`${this.totalTurns}:${owner.id}`;};
    P.jiannanTrigger=async function(p){const available=[1,2,3,4].filter(k=>!p.jiannanOptions.includes(k));if(!available.length)return;
      const enemies=this.alive().filter(t=>this.hostility(p,t)>0),best=available.includes(2)?2:available.includes(1)&&enemies.some(t=>this.owned(t).length>=2)?1:available.includes(4)?4:available[0];
      const labels={1:'令一人弃置两张牌',2:'令一人摸两张间难牌',3:'令一人重铸所有装备牌',4:'令一人将锦囊置顶或失去体力'};
      const k=Number(await this.option(p,'间难：选择本回合尚未使用的一项',available.map(n=>({key:String(n),label:labels[n]})),String(best)));
      p.jiannanOptions.push(k);p.jiannanCount++;
      let candidates=this.alive();if(k===1&&candidates.some(t=>this.owned(t).length))candidates=candidates.filter(t=>this.owned(t).length);
      const t=await this.pickRole(p,'间难：选择执行角色',candidates,k===2||k===3);await this.jiannanEffect(p,t,k,true);
    };
    P.jiannanEffect=async function(p,t,k,mark){
      if(k===1){const cards=this.owned(t),n=Math.min(2,cards.length);if(n){const ids=await this.selectCards(t,'间难：弃置两张牌',cards,n,n,this.cheap(t,cards,n));this.discardOwned(t,ids);}}
      else if(k===2){if(mark)this.jiannanDraw(p,t);else this.draw(t,2);}
      else if(k===3){const cards=this.owned(t).filter(c=>c.kind==='equip');this.withLoss('recast',()=>this.moveBatch(t,()=>{for(const c of cards)this.putDiscard(this.removeOwned(t,c.id).card);}));const before=new Set(t.hand.map(c=>c.id));this.draw(t,cards.length);if(mark)for(const c of t.hand)if(!before.has(c.id))c.jiannanTag=`${this.totalTurns}:${p.id}`;}
      else {const cs=t.hand.filter(c=>['trick','delay'].includes(c.kind)),k=await this.option(t,'间难：锦囊置顶或失去1体力',[...cs.map(c=>({key:c.id,label:'置于牌堆顶：'+c.name,card:c})),{key:'lose',label:'失去1点体力'}],cs.length?this.cheap(t,cs,1)[0]:'lose');if(k==='lose')await this.loseHp(t,1,'间难');else this.deck.push(this.removeOwned(t,k).card);}
      this.log(`${p.name}令${t.name}执行【间难】第${k}项。`,'system');await this.flushSkillEvents();
    };
    const mark=P.markCardUse,after=P.afterCardUse;
    P.markCardUse=async function(p,c,ts){
      const key=cardName(c);this.usedNames[key]=(this.usedNames[key]||0)+1;c.secondNameUse=this.usedNames[key]===2;
      const physical=c.virtual?c.costs||[]:[c];c.isQi=qiUse(c);p.lastQi=c.isQi;
      if(this.options.rulesVersion>=15&&this.isGeneral(p,'molvbu')&&c.isQi)c.noQuota=true;
      if(this.hasSkill(p,'zhongliu')&&(!physical.length||physical.some(x=>this._origins[x.id]?.clan!==this.general(p).clan))){p.anranCount=0;this.log(`${p.name}【中流】重置岸然发动次数。`,'system');}
      p.anranBlocked=[];
      const valid=await mark.call(this,p,c,ts);if(valid&&c.wasUsedAsAction)p.lastUsedKind=c.kind;return valid;
    };
    P.afterCardUse=async function(p,c,ts){await after.call(this,p,c,ts);if(this.over)return;
      if(this.hasSkill(p,'daojie')&&p.daojieTurn!==this.totalTurns&&['trick','delay'].includes(c.kind)&&!damaging(c)){
        p.daojieTurn=this.totalTurns;const skills=['dingan','daojie'].filter(k=>this.hasSkill(p,k)),opts=[{key:'hp',label:'失去1点体力'},...skills.map(k=>({key:k,label:'失去技能：'+(names[k]||'蹈节')}))];
        const choice=await this.option(p,'蹈节：选择代价，再回收锦囊',opts,p.hp>1?'hp':skills.includes('daojie')?'daojie':skills[0]||'hp');
        if(choice==='hp')await this.loseHp(p,1,'蹈节');else{p.lostSkills.push(choice);this.log(`${p.name}失去【${names[choice]||'蹈节'}】。`,'system');}
        const cs=(c.virtual?c.costs||[]:[c]).filter(x=>this.discard.some(y=>y.id===x.id));if(p.alive&&cs.length){const t=await this.pickRole(p,'蹈节：选择获得锦囊的同族角色',this.clanMembers(p),true);this.gain(t,cs.map(x=>this.takePhysical(x.id)));}
      }
      if(c.secondNameUse&&!this.dyingThisTurn)for(const owner of this.actionOrder())if(this.hasSkill(owner,'dingan')&&!this.over&&!this.dyingThisTurn)await this.dingan(owner,ts);
      await this.flushSkillEvents();
    };
    P.dingan=async function(p,targets){const candidates=this.alive().filter(t=>!targets.some(v=>v.id===t.id)&&!p.dinganChosen.includes(t.id));if(!candidates.length)return;
      const t=await this.pickRole(p,'定安：选择非目标角色与你一起摸牌',candidates,true);p.dinganChosen.push(t.id);this.draw(p,1);this.draw(t,1);
      const others=this.alive().filter(t=>t.id!==p.id);if(!others.length)return;const max=Math.max(...others.map(t=>t.hand.length)),victim=await this.pickRole(p,'定安：选择手牌最多的其他角色',others.filter(t=>t.hand.length===max));
      const k=await this.option(p,'定安：伤害或弃置同名牌',[{key:'damage',label:'造成1点伤害'},{key:'discard',label:'弃置其最多的同名手牌'}],this.hostility(p,victim)>0?'damage':'discard');
      if(k==='damage')await this.damage(p,victim,1,'normal',{skill:'dingan'});else{const groups={};for(const c of victim.hand)(groups[cardName(c)]||(groups[cardName(c)]=[])).push(c);const n=Math.max(0,...Object.values(groups).map(a=>a.length)),keys=Object.keys(groups).filter(k=>groups[k].length===n);if(keys.length){const key=await this.option(victim,'定安：选择要弃置的同名手牌',keys.map(k=>({key:k,label:defs[k].name+' × '+n})),keys.sort((a,b)=>groups[a].reduce((n,c)=>n+this.value(c,victim),0)-groups[b].reduce((n,c)=>n+this.value(c,victim),0))[0]);this.discardOwned(victim,groups[key].map(c=>c.id));}}
    };
    P.spearCards=function(p,played=false){return p.hand.filter(c=>this.allowedUse(p,{...defs.slash,virtual:true,costs:[c]},played));};
    P.allowedUse=function(p,c,played=false){if(played)return true;const costs=c.virtual?c.costs||[]:[c];return !costs.some(x=>p.hand.some(h=>h.id===x.id)&&(p.anranBlocked.includes(x.id)||p.handBlocked&&!['trick','delay'].includes(c.kind)));};
    const fengwei=P.fengweiCards,legal=P.legalActions;
    P.fengweiCards=function(p){return p.silenced?[]:fengwei.call(this,p);};
    P.legalActions=function(p){const actions=legal.call(this,p).filter(a=>a.cardId!=='spear'||this.allowedUse(p,{...defs.slash,virtual:true,costs:a.cost.map(id=>p.hand.find(c=>c.id===id))}));
      if(this.options.rulesVersion>=15&&this.isGeneral(p,'molvbu')&&p.equip.weapon?.key==='spear'&&!this.slashAvailable(p)){
        const cards=p.hand.filter(c=>c.qiOwner!=null&&this.allowedUse(p,{...defs.slash,virtual:true,costs:[c]}));
        for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++)for(const t of this.alive())if(this.canSlash(p,t))actions.push({type:'use',cardId:'spear',cost:[cards[i].id,cards[j].id],targets:[t.id]});
      }
      return actions;
    };
    P.cardTags=function(p,c){const tags=[];if(c.qiOwner!=null)tags.push('炁');if(p.guifuIds.includes(c.id))tags.push('诡伏');if(c.jiannanTag===`${this.totalTurns}:${this.turn}`)tags.push('间难');if(p.anranBlocked.includes(c.id))tags.push('岸然锁定');return tags;};
    P.dynastyStates=function(p,compact=false){const states=[];if(p.armor)states.push('护甲 '+p.armor);if(p.silenced)states.push('技能失效');if(p.handBlocked)states.push('限锦囊手牌');if(p.demonic&&p.crazyTarget==null)states.push('入魔');if(p.crazyTarget!=null)states.push('骁勇 · 对手：'+this.get(p.crazyTarget).name);for(const owner of this.players.filter(t=>t.alive&&t.crazyTarget===p.id))states.push('被'+owner.name+'指定为对手');
      if(p.general==='caomao')states.push('道心 '+p.daoxin+'/99');if(p.general==='molvbu'&&p.molWushuang)states.push('无双 · 杀需双闪 / 决斗需双杀');if(!compact){if(this.xiangsi)states.push('向死存魏');if(p.general==='mosimayi')states.push('诡伏记录：'+(p.guifuRecords.map(k=>names[k]||defs[k]?.name||k).join('、')||'无'),'诡伏闪 '+p.hand.filter(c=>p.guifuIds.includes(c.id)).length+'张');if(p.temporarySkill)states.push('骤袭：'+names[p.temporarySkill]+'（至下回合开始）');if(p.copiedSkills.length)states.push('已获得：'+p.copiedSkills.map(k=>names[k]).join('、'));if(p.lostSkills.length)states.push('已失去：'+p.lostSkills.map(k=>names[k]||'蹈节').join('、'));if(p.general==='zuwangshen')states.push('岸然累计 '+p.anranCount+'次','下次摸 '+Math.min(4,p.anranCount+1)+'张');if(p.general==='zuyangbiao')states.push('间难 '+p.jiannanCount+'次','义叱获胜执行前 '+Math.min(4,p.jiannanCount)+'项');}return states;
    };
    const canUse=P.canUse,targets=P.targets,active=P.activeSkills,prepare=P.prepareActive,ai=P.aiPlay,responseOptions=P.responseSkillOptions,prepareResponse=P.prepareResponseSkill;
    P.canUse=function(p,c){if(!this.allowedUse(p,c)||this._openingPlay&&c.kind==='delay')return false;if(c.originSkill==='guifu'&&isSlash(c))return this.alive().some(t=>this.canSlash(p,t));
      if(this.options.rulesVersion>=15&&this.isGeneral(p,'molvbu')&&qiUse(c)){if(isSlash(c))return this.targets(p,c).length>0;if(c.key==='wine')return p.alive;}
      return canUse.call(this,p,c);
    };
    P.targets=function(p,c){if(c.originSkill==='guifu'&&isSlash(c))return this.alive().filter(t=>this.canSlash(p,t));
      if(this.options.rulesVersion>=15&&this.isGeneral(p,'molvbu')&&isSlash(c)&&qiUse(c))return this.alive().filter(t=>this.canSlash(p,t));
      return targets.call(this,p,c);
    };
    P.conversions=function(p,skill){let pairs=[];
      if(skill==='guifu'&&this.hasSkill(p,skill)){for(const c of p.hand.filter(c=>p.guifuIds.includes(c.id)))for(const key of p.guifuRecords.filter(k=>defs[k]&&!p.guifuUsed.includes(k)))pairs.push([c,key]);}
      if(skill==='gangquan'&&this.hasSkill(p,skill))pairs=p.hand.filter(c=>c.qiOwner!=null).map(c=>[c,p.lastUsedKind==='basic'?'duel':p.lastUsedKind==='equip'?'fireSlash':null]).filter(x=>x[1]);
      if(skill==='huoji'&&this.hasSkill(p,skill))pairs=p.hand.filter(isRed).map(c=>[c,'fireAttack']);
      return pairs.map(([cost,key])=>({...defs[key],id:'convert-'+cost.id+'-'+key,virtual:true,costs:[cost],rank:cost.rank,suit:cost.suit,originSkill:skill,noQuota:skill==='guifu'})).filter(c=>this.allowedUse(p,c));
    };
    P.activeSkills=function(p){const list=active.call(this,p);const add=(key,ready,detail,reason)=>list.push({key,name:names[key],ready,detail,reason});
      if(p.general==='caomao'){add('jiushi',this.hasSkill(p,'jiushi')&&!p.turnedOver&&!p.wineUsed,'50道心 · 翻面视为酒');add('fangzhu',this.hasSkill(p,'fangzhu')&&!p.fangzhuUsed&&this.alive().some(t=>t.id!==p.id&&t.id!==p.fangzhuLast),'75道心 · 控制对手');add('juejin',this.hasSkill(p,'juejin')&&!p.juejinUsed,p.juejinUsed?'限定技已使用':'99道心 · 全场决战');}
      for(const key of ['guifu','gangquan','huoji'])if(this.hasSkill(p,key))add(key,this.conversions(p,key).some(c=>this.skillActionsFor(p,c).length),key==='guifu'?'闪 → 已记录牌名':key==='gangquan'?(p.lastUsedKind==='basic'?'炁 → 决斗':p.lastUsedKind==='equip'?'炁 → 火杀':'需先使用基本牌或装备牌'):'红色手牌 → 火攻');
      if(this.hasSkill(p,'kuangmo'))add('kuangmo',!p.demonic&&this.alive().length>1,p.demonic?'已指定对手':'指定对手 · 首次伤害+1');
      if(this.hasSkill(p,'qiangxi'))add('qiangxi',!p.activeUsed.includes('qiangxi')&&this.alive().some(t=>this.canSlash(p,t)),'弃武器 / 失去1体力 → 1伤害');
      if(this.hasSkill(p,'jiequhu'))add('jiequhu',!p.activeUsed.includes('jiequhu')&&p.hand.length>0&&this.alive().some(t=>t.id!==p.id&&t.hp>=p.hp&&t.hand.length),'体力不低于你 · 每阶段一次');
      if(this.hasSkill(p,'quhu'))add('quhu',!p.activeUsed.includes('quhu')&&p.hand.length>0&&this.alive().some(t=>t.hp>p.hp&&t.hand.length),'与更高体力者拼点');for(const s of list)if(p.general==='caomao'){if(thresholds[s.key]>p.daoxin)s.reason='道心不足 · 尚未解锁';else if(s.key==='jiushi'&&p.turnedOver)s.reason='背面朝上';else if(s.key==='juejin'&&p.juejinUsed)s.reason='限定技已使用';else if(s.key==='fangzhu'&&p.fangzhuUsed)s.reason='本阶段已使用';}return list;
    };
    P.quhuPlan=function(p,skill){
      const own=[...p.hand].sort((a,b)=>b.rank-a.rank||this.value(a,p)-this.value(b,p))[0];
      if(!own)return null;
      const winChance=Math.max(0,(own.rank-1)/13);let best=null;
      for(const t of this.alive()){
        if(t.id===p.id||!t.hand.length||t.hp<(skill==='jiequhu'?p.hp:p.hp+1)||this.hostility(p,t)<=0)continue;
        const victim=this.alive().filter(v=>v.id!==p.id&&v.id!==t.id&&this.hostility(p,v)>0&&this.canSlash(t,v))
          .sort((a,b)=>a.hp-b.hp)[0];
        if(!victim)continue;
        const loss=p.hp<=2?7:4.5;
        const gain=4+(victim.hp<=1?3:0)+(skill==='jiequhu'?1.5:0);
        const recovered=['trick','delay'].includes(own.kind)&&skill==='jiequhu'?1.5:0;
        const score=winChance*gain-(1-winChance)*loss-this.value(own,p)*.13+recovered;
        if(!best||score>best.score)best={target:t,victim,score};
      }
      return best;
    };
    P.aiPlay=function(p,actions){let result=ai.call(this,p,actions.filter(a=>a.type!=='skill'||!names[a.skill]));
      for(const a of actions.filter(a=>a.type==='skill'&&names[a.skill])){
        if(a.skill==='kuangmo'&&p.hp>1&&p.hand.some(c=>isSlash(c)||c.key==='duel')&&this.alive().some(t=>this.canSlash(p,t)&&this.hostility(p,t)>0))return a;
        if(a.skill==='fangzhu'&&this.alive().some(t=>t.id!==p.fangzhuLast&&this.hostility(p,t)>0))return a;
        if(a.skill==='juejin'&&p.hp<=2&&this.alive().filter(t=>this.hostility(p,t)>0).some(t=>t.hand.length>=3))return a;
        if(a.skill==='jiushi'&&result.type==='use'&&isSlash(p.hand.find(c=>c.id===result.cardId))&&!p.drunk)return a;
        if(a.skill==='qiangxi'&&p.hp>1&&this.alive().some(t=>this.canSlash(p,t)&&this.hostility(p,t)>0))return a;
        if(a.skill==='jiequhu'&&this.quhuPlan(p,'jiequhu')?.score>0)return a;
        if(a.skill==='quhu'&&this.quhuPlan(p,'quhu')?.score>0)return a;
        if(['guifu','gangquan','huoji'].includes(a.skill)&&result.type==='end'&&this.conversions(p,a.skill).some(c=>this.cardPlan(p,c)&&this.value(c.costs[0],p)<10))return a;
      }return result;
    };
    P.prepareConversion=async function(p,c){const cost=c.costs[0],wasMarked=p.guifuIds.includes(cost.id);if(!this.owned(p).some(x=>x.id===cost.id))return null;
      const raw=this.withLoss('use',()=>this.removeOwned(p,cost.id).card);this.table.push(raw);if(c.originSkill==='guifu'){if(!wasMarked)return null;p.guifuUsed.push(cardName(c));}
      this.log(`${p.name}发动【${names[c.originSkill]}】，将【${raw.name}】作为【${c.name}】。`,'use');return {...c,costs:[raw]};
    };
    P.prepareActive=async function(p,a){const skill=a.skill;if(!names[skill])return prepare.call(this,p,a);
      if(!this.activeSkills(p).some(s=>s.key===skill&&s.ready))return null;
      if(['guifu','gangquan','huoji'].includes(skill)){
        const cards=this.conversions(p,skill).filter(c=>this.skillActionsFor(p,c).length),suggested=cards.find(c=>this.cardPlan(p,c)&&this.value(c.costs[0],p)<10)||cards[0];
        const id=await this.option(p,names[skill]+'：选择转化牌',[...cards.map(c=>({key:c.id,label:c.costs[0].name+' '+C.suitMark[c.suit]+C.rankMark(c.rank)+' → '+c.name,card:c.costs[0]})),{key:'cancel',label:'取消'}],suggested.id);if(id==='cancel')return null;
        const c=cards.find(c=>c.id===id),actions=this.skillActionsFor(p,c),plan=this.cardPlan(p,c)||actions[0];let action=plan;
        if(actions.length>1){const i=await this.option(p,names[skill]+'：选择目标',actions.map((a,i)=>({key:String(i),label:a.targets.map(id=>this.get(id).name).join('、')||'自己'})),String(actions.findIndex(a=>JSON.stringify(a)===JSON.stringify(plan))));action=actions[Number(i)];}
        const card=await this.prepareConversion(p,c);return {card,action};
      }
      if(skill==='jiushi'){this.turnOver(p);return {card:{...defs.wine,virtual:true,costs:[],rank:0,suit:'N',originSkill:'jiushi'},action:{targets:[]}};}
      if(skill==='kuangmo')await this.setCrazy(p);
      if(skill==='fangzhu'){const t=await this.pickRole(p,'放逐：选择其他角色',this.alive().filter(t=>t.id!==p.id&&t.id!==p.fangzhuLast));const k=await this.option(p,'放逐：选择限制',[{key:'skills',label:'武将技能失效至下回合结束'},{key:'hand',label:'只能使用锦囊类手牌至下回合结束'}],this.general(t).skills.length&&t.general!=='caomao'?'skills':'hand');p.fangzhuUsed=true;p.fangzhuCurrent=t.id;p.fangzhuLast=t.id;if(k==='skills')t.silenced=true;else t.handBlocked=true;t.restrictionUntil=t.turns+1;this.log(`${p.name}【放逐】${t.name}：${k==='skills'?'技能失效':'限制手牌'}。`,'system');}
      if(skill==='juejin')await this.juejin(p);
      if(skill==='qiangxi'){const t=await this.pickRole(p,'强袭：选择攻击范围内的角色',this.alive().filter(t=>this.canSlash(p,t))),weapons=this.owned(p).filter(c=>c.slot==='weapon'&&(p.equip.weapon?.id!==c.id||this.distance(p,t)<=1));const k=await this.option(p,'强袭：选择代价',[...weapons.map(c=>({key:c.id,label:'弃置'+c.name,card:c})),{key:'hp',label:'失去1点体力'}],weapons[0]?.id||'hp');p.activeUsed.push(skill);if(k==='hp')await this.loseHp(p,1,'强袭');else this.discardOwned(p,[k]);if(t.alive&&!this.over)await this.damage(p,t,1,'normal',{skill});}
      if(skill==='quhu'||skill==='jiequhu'){
        p.activeUsed.push(skill);
        const targets=this.alive().filter(t=>t.id!==p.id&&(skill==='jiequhu'?t.hp>=p.hp:t.hp>p.hp)&&t.hand.length);
        const preferred=this.quhuPlan(p,skill)?.target;
        const t=await this.pickRole(p,skill==='jiequhu'?'驱虎：选择体力不低于你的角色':'驱虎：选择体力比你高的角色',targets,false,preferred);
        if(await this.pindian(p,t,'驱虎')){const victims=this.alive().filter(v=>v.id!==t.id&&this.distance(t,v)<=this.range(t));if(victims.length){const v=await this.pickRole(p,'驱虎：令拼点对手伤害一名角色',victims);await this.damage(t,v,1,'normal',{skill});}}
        else {if(p.alive)await this.damage(t,p,1,'normal',{skill});}
      }
      await this.flushSkillEvents();return null;
    };
    P.juejin=async function(p){p.juejinUsed=true;for(const t of this.actionOrder()){const old=t.hp;t.hp=1;t.armor=Math.min(5,(t.armor||0)+Math.max(0,old-1)+(t.id===p.id?2:0));this.hpChanged(t,old);}
      this.xiangsi=true;for(const c of this.allCards.filter(forbidden)){if(this.exiled.includes(c))continue;const card=this.takePhysical(c.id);if(card)this.exiled.push(card);}
      this.log(`${p.name}发动【决进】！向死存魏：全员1血，桃、酒、闪移出游戏。`,'danger');this.sound('damage',{playerId:p.id,nature:'fire',amount:1});await this.flushSkillEvents();this.change();
    };
    P.responseSkillOptions=function(p,type,played=false){const out=responseOptions.call(this,p,type,played);if(!played){
      if(type==='wine'&&this.hasSkill(p,'jiushi')&&!p.turnedOver)out.push({key:'jiushi:wine',label:'酒诗：翻面视为酒'});
      for(const c of this.conversions(p,'guifu'))if(type==='slash'?isSlash(c):c.key===type)out.push({key:'guifu:'+c.costs[0].id+':'+c.key,label:'诡伏：闪当'+c.name});
    }return out;};
    P.prepareResponseSkill=async function(p,key){const [skill,id,name]=key.split(':');if(skill==='jiushi'){this.turnOver(p);return {...defs.wine,virtual:true,costs:[],rank:0,suit:'N'};}if(skill==='guifu'){const c=this.conversions(p,skill).find(c=>c.costs[0].id===id&&c.key===name);return c?this.prepareConversion(p,c):null;}return prepareResponse.call(this,p,key);};
  }
  const api={install,names};root.ZhenDynastySkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
