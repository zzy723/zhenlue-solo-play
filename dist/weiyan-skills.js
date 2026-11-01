(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{isSlash}=C;
    const init=P.initExtra,begin=P.beginTurnSkills,playStart=P.playStartSkills,mark=P.markCardUse;
    const distance=P.distance,slashAvailable=P.slashAvailable,active=P.activeSkills;
    const aiPlay=P.aiPlay,prepare=P.prepareActive,damage=P.damage;
    const afterDamage=P.afterDamageEvent,afterCard=P.afterCardUse;
    const dying=P.dying,death=P.death,finish=P.finishPhaseSkills,turnEnd=P.turnEndSkills,states=P.dynastyStates;
    const available=(g,p)=>g.isGeneral(p,'shiweiyan');
    P.initExtra=function(p){init.call(this,p);Object.assign(p,{weiyanMission:'ongoing',weiyanDistance:0,weiyanNoQuota:0,weiyanDiscarded:0,weiyanLost:0,weiyanUsed:0,weiyanSlashBonus:0,weiyanTurnDamage:0,weiyanTurnRewarded:false});};
    P.beginTurnSkills=function(){begin.call(this);for(const p of this.players){p.weiyanTurnDamage=0;p.weiyanTurnRewarded=false;}};
    P.weiyanBurst=function(p){return available(this,p)&&this.isPlayPhaseOwner(p)&&p.weiyanMission!=='failed';};
    P.distance=function(from,to){return this.weiyanBurst(from)&&from.weiyanDistance>0&&from.id!==to.id?1:distance.call(this,from,to);};
    P.slashAvailable=function(p){return slashAvailable.call(this,p)||this.weiyanBurst(p)&&p.slashUsed<1+(this.options.mode==='landlord'&&p.role==='地主'?1:0)+(this.shenCampBonus?.(p,'slash')||0)+p.weiyanSlashBonus;};
    P.playStartSkills=async function(p){
      await playStart.call(this,p);
      if(!this.weiyanBurst(p)||!p.alive||this.over)return;
      p.weiyanDistance=0;p.weiyanNoQuota=0;p.weiyanDiscarded=0;p.weiyanLost=0;p.weiyanUsed=0;p.weiyanSlashBonus=0;
      const offense=c=>isSlash(c)||['duel','steal','dismantle','fireAttack','barbarian','arrows'].includes(c.key);
      const cheap=p.hand.filter(c=>!offense(c)).sort((a,b)=>this.value(a,p)-this.value(b,p));
      const enemies=this.alive().filter(t=>t.id!==p.id&&this.hostility(p,t)>0);
      const useful=p.hand.filter(offense).length;
      const wantDiscard=cheap.length>0&&(useful>0||p.hand.length>this.handLimit(p));
      const wantHp=p.hp>=3&&useful>0&&enemies.some(t=>this.canSlash(p,t)||p.hand.some(c=>c.key==='duel'||c.key==='fireAttack'));
      const answer=await this.option(p,'壮誓：执行弃牌和/或失去体力？',[{key:'yes',label:'执行壮誓'},{key:'no',label:'两项均不执行（忠傲失败）'}],wantDiscard||wantHp?'yes':'no','可只执行其中一项；两项均不执行将失去壮誓并获得困奋。');
      if(answer==='no'){this.weiyanFail(p,'未执行壮誓');return;}
      const suggested=wantDiscard?cheap.slice(0,Math.min(Math.max(1,useful),2)).map(c=>c.id):[];
      const ids=p.hand.length?await this.selectCards(p,'壮誓：弃置任意张手牌',p.hand,0,p.hand.length,suggested,'此阶段前等量张使用牌无距离限制且不可响应；可选零张。'):[];
      if(ids.length){this.discardOwned(p,ids);p.weiyanDiscarded=p.weiyanDistance=ids.length;}
      const max=Math.max(0,p.hp),hpChoices=Array.from({length:max+1},(_,n)=>({key:String(n),label:n?`失去${n}点体力，前${n}张牌不计次数`:'不失去体力'}));
      const hp=Number(await this.option(p,'壮誓：选择失去的体力点数',hpChoices,wantHp&&p.hp>=3?'1':'0','失去体力可能进入濒死，导致忠傲失败。'));
      if(hp>0){p.weiyanLost=p.weiyanNoQuota=hp;await this.loseHp(p,hp,'壮誓');}
      if(!ids.length&&!hp)this.weiyanFail(p,'未执行壮誓');
      else if(p.alive&&p.weiyanMission!=='failed')this.log(`${p.name}发动【壮誓】：弃${ids.length}张、失去${hp}点体力。`,'system');
    };
    P.weiyanFail=function(p,reason){if(p.weiyanMission!=='ongoing')return;p.weiyanMission='failed';p.weiyanDistance=0;p.weiyanNoQuota=0;this.log(`${p.name}【忠傲】失败（${reason}），失去【壮誓】并获得【困奋】。`,'system');this.change();};
    P.markCardUse=async function(p,c,ts){
      const burst=this.weiyanBurst(p),range=burst&&p.weiyanDistance>0,quota=burst&&p.weiyanNoQuota>0;
      if(burst){p.weiyanUsed++;if(range){p.weiyanDistance--;c.unrespondable=true;c.weiyanUnrespondable=true;}if(quota){p.weiyanNoQuota--;c.noQuota=true;c.weiyanNoQuota=true;}}
      return mark.call(this,p,c,ts);
    };
    const trick=P.trickAllowed,response=P.response;
    P.trickAllowed=async function(source,target,c){if(c?.weiyanUnrespondable){this.log(`【壮誓】令【${c.name}】不可响应。`,'system');return true;}return trick.call(this,source,target,c);};
    P.response=async function(p,type,title,ignoreArmor,context={}){if(context.card?.weiyanUnrespondable)return false;return response.call(this,p,type,title,ignoreArmor,context);};
    P.weiyanBeishuiReady=function(p){return this.weiyanBurst(p)&&p.weiyanMission==='success'&&this.owned(p).length>0;};
    P.activeSkills=function(p){const list=active.call(this,p);if(available(this,p)&&p.weiyanMission==='success')list.push({key:'weiyanBeishui',name:'背水',detail:'弃一张牌 · 本阶段杀次数+1',ready:this.weiyanBeishuiReady(p),reason:'没有可弃置的牌'});return list;};
    P.aiPlay=function(p,actions){
      const normal=aiPlay.call(this,p,actions.filter(a=>a.skill!=='weiyanBeishui'));
      if(!actions.some(a=>a.skill==='weiyanBeishui'))return normal;
      const slashes=p.hand.filter(isSlash),targets=this.alive().filter(t=>t.id!==p.id&&this.canSlash(p,t)&&this.hostility(p,t)>0);
      const cost=this.owned(p).filter(c=>!isSlash(c)).sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const baseline=1+(this.options.mode==='landlord'&&p.role==='地主'?1:0)+(this.shenCampBonus?.(p,'slash')||0);
      return normal.type==='end'&&slashes.length&&targets.length&&cost&&p.slashUsed>=baseline+p.weiyanSlashBonus?{type:'skill',skill:'weiyanBeishui'}:normal;
    };
    P.prepareActive=async function(p,a){
      if(a.skill!=='weiyanBeishui')return prepare.call(this,p,a);
      if(!this.weiyanBeishuiReady(p))return null;
      const cards=this.owned(p),suggested=[...cards].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const id=await this.option(p,'背水：弃置一张牌',cards.map(c=>({key:c.id,label:c.name,card:c})),suggested.id);
      if(!this.owned(p).some(c=>c.id===id))return null;
      this.discardOwned(p,[id]);p.weiyanSlashBonus++;this.log(`${p.name}发动【背水】，本阶段可额外使用一张杀。`,'system');this.change();return null;
    };
    P.damage=async function(source,target,amount=1,nature='normal',context={}){
      const c=context.card,slash=!context.xuchuTransferred&&source?.alive&&target?.alive&&this.isGeneralLocked(source,'shiweiyan')&&c&&isSlash(c)&&!context.chain;
      const hpCondition=slash&&source.hp<=target.hp,handCondition=slash&&source.hand.length<=target.hand.length;
      if(hpCondition){amount++;this.log(`${source.name}【饮战】令杀的伤害+1。`,'damage');}
      const done=await damage.call(this,source,target,amount,nature,context);
      if(done>0&&this.options.rulesVersion>=9&&source?.general==='shiweiyan')source.weiyanTurnDamage+=done;
      if(done>0&&handCondition&&(c.sourceGeneration==null||c.sourceGeneration===source.generation)){(c.weiyanDiscardTargets||(c.weiyanDiscardTargets=[])).push({id:target.id,generation:target.generation,chengshi:!!hpCondition});}
      return done;
    };
    P.afterDamageEvent=async function(source,target,amount,context,generation){
      if(afterDamage)await afterDamage.call(this,source,target,amount,context,generation);
      if(!source?.alive||!target?.alive||this.over||!available(this,source)||distance.call(this,source,target)>1)return;
      const choice=await this.option(source,'狂骨：造成伤害后回复体力或摸牌？',[...(source.hp<source.maxHp?[{key:'heal',label:'回复1点体力'}]:[]),{key:'draw',label:'摸一张牌'},{key:'pass',label:'不发动'}],source.hp<source.maxHp&&source.hp<=2?'heal':'draw');
      if(choice==='heal'){this.heal(source,1);this.log(`${source.name}发动【狂骨】，回复1点体力。`,'heal');}
      else if(choice==='draw'){this.draw(source,1);this.log(`${source.name}发动【狂骨】，摸一张牌。`,'draw');}
    };
    P.afterCardUse=async function(p,c,ts){
      await afterCard.call(this,p,c,ts);
      if(!this.isGeneralLocked(p,'shiweiyan')||!isSlash(c)||!p.alive)return;
      for(const hit of c.weiyanDiscardTargets||[]){
        const t=this.get(hit.id);if(!t?.alive||t.generation!==hit.generation||!this.owned(t,true).length)continue;
        const publicCards=[...Object.values(t.equip),...t.judge],options=[...publicCards.map(card=>({key:card.id,label:card.name,card})),...(t.hand.length?[{key:'hand',label:`随机手牌（${t.hand.length}张）`,hidden:true}]:[])];
        const picked=await this.option(p,`饮战：弃置${t.name}的一张牌`,options,options[0].key,'目标手牌只能随机弃置。');
        const id=picked==='hand'?t.hand[Math.floor(this.random()*t.hand.length)]?.id:picked;
        if(!id||!this.owned(t,true).some(card=>card.id===id))continue;
        const {card}=this.withLoss('discard',()=>this.removeOwned(t,id));this.putDiscard(card);
        this.log(`${p.name}【饮战】弃置${t.name}的【${card.name}】。`,'discard');
        if(hit.chengshi){
          const claimed=this.discard.some(x=>x.id===card.id)?this.takePhysical(card.id):null;
          if(claimed)this.gain(p,[claimed]);
          this.heal(p,1);this.log(`${p.name}【乘势】${claimed?'获得弃牌并':''}回复1点体力。`,'heal');
        }
        this.change();
      }
    };
    P.dying=async function(p,source){if(p?.alive&&p.hp<=0&&available(this,p))this.weiyanFail(p,'进入濒死');return dying.call(this,p,source);};
    P.death=async function(p,source){
      if(source?.alive&&source.id!==p.id&&available(this,source)&&source.weiyanMission==='ongoing'){
        source.weiyanMission='success';this.log(`${source.name}杀死${p.name}，【忠傲】成功，【狂骨】升级并获得【背水】。`,'system');
        if(this.isPlayPhaseOwner(source)){
          if(source.weiyanUsed<source.weiyanDiscarded){this.draw(source,1);this.log(`${source.name}【忠傲】摸一张牌。`,'draw');}
          if(source.weiyanUsed<source.weiyanLost){if(source.hp<source.maxHp)this.heal(source,1);else this.draw(source,1);this.log(`${source.name}【忠傲】获得额外收益。`,'heal');}
        }
      }
      return death.call(this,p,source);
    };
    P.finishPhaseSkills=async function(p){await finish.call(this,p);if(!p.alive||this.over||!this.isGeneralLocked(p,'shiweiyan')||p.weiyanMission!=='failed')return;await this.loseHp(p,1,'困奋');if(p.alive&&!this.over){this.draw(p,2);this.log(`${p.name}【困奋】摸两张牌。`,'draw');}};
    P.turnEndSkills=async function(){
      if(this.options.rulesVersion>=9&&!this.over)for(const p of this.actionOrder(this.alive().filter(t=>available(this,t)&&t.weiyanTurnDamage>0&&!t.weiyanTurnRewarded))){
        const count=p.weiyanTurnDamage;p.weiyanTurnRewarded=true;
        this.draw(p,count);
        if(this.options.rulesVersion>=10)this.heal(p,count);
        this.log(`${p.name}【余勇】本回合造成${count}点伤害，摸${count}张牌${this.options.rulesVersion>=10?`并回复至多${count}点体力`:''}。`,'draw');
      }
      return turnEnd.call(this);
    };
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(p.general==='shiweiyan'){out.push(p.weiyanMission==='success'?'忠傲成功 · 背水':p.weiyanMission==='failed'?'忠傲失败 · 困奋':'忠傲进行中');if(!compact&&this.options.rulesVersion>=9)out.push(`余勇：本回合已造成 ${p.weiyanTurnDamage} 点伤害`);if(!compact&&p.weiyanMission!=='failed'&&this.isPlayPhaseOwner(p))out.push(`壮誓：无距不可响应 ${p.weiyanDistance}，不计次数 ${p.weiyanNoQuota}`);}return out;};
  }
  const api={install};root.ZhenWeiyanSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
