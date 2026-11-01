(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{isSlash,isRed}=C;
    const init=P.initExtra,begin=P.beginTurnSkills,health=P.applyDamageHealth,afterDamage=P.afterDamageEvent;
    const preparation=P.preparationSkills,finish=P.finishPhaseSkills,distance=P.distance;
    const active=P.activeSkills,prepare=P.prepareActive,ai=P.aiPlay,mark=P.markCardUse,response=P.response;
    const noResponse=P.caocaoNoResponse,states=P.dynastyStates,risk=P.damageBenefitRisk,turnEnd=P.turnEndSkills;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'simayi');
    const damaging=c=>!!c&&(isSlash(c)||['duel','fireAttack','barbarian','arrows'].includes(c.key));
    const affected=(g,p,t)=>owner(g,p)&&p.simayiControlTurn===g.totalTurns&&p.simayiControl?.some(x=>x.id===t?.id);
    P.initExtra=function(p){init.call(this,p);Object.assign(p,{simayiRen:0,simayiAwakened:false,simayiDamageTurn:-1,simayiShanzhengTurn:-1,simayiControlTurn:-1,simayiControl:[]});};
    P.beginTurnSkills=function(){begin.call(this);for(const p of this.players){p.simayiControl=[];p.simayiControlTurn=-1;}};
    P.turnEndSkills=async function(){try{return await turnEnd.call(this);}finally{for(const p of this.players){p.simayiControl=[];p.simayiControlTurn=-1;}}};
    P.simayiGainRen=function(p,n=1){p.simayiRen=Math.min(5,(p.simayiRen||0)+n);this.change();};
    P.applyDamageHealth=function(source,target,amount,context){
      if(amount>0&&source?.general==='simayi')source.simayiDamageTurn=this.totalTurns;
      return health.call(this,source,target,amount,context);
    };
    P.afterDamageEvent=async function(source,target,amount,context,generation){
      if(owner(this,target)&&target.generation===generation){
        for(let i=0;i<amount&&owner(this,target)&&!this.over;i++){
          const use=await this.option(target,`韬晦：受到伤害第${i+1}/${amount}点，摸一张牌并获得一枚“忍”？`,[{key:'yes',label:'发动韬晦'},{key:'no',label:'不发动'}],'yes');
          if(use==='yes'){this.draw(target,1);this.simayiGainRen(target);this.log(`${target.name}【韬晦】摸一张牌，获得一枚“忍”（${target.simayiRen}/5）。`,'draw');}
        }
      }
      if(afterDamage)await afterDamage.call(this,source,target,amount,context,generation);
    };
    P.finishPhaseSkills=async function(p){await finish.call(this,p);
      if(owner(this,p)&&!this.over&&p.simayiDamageTurn!==this.totalTurns){this.simayiGainRen(p);this.log(`${p.name}【韬晦】本回合未造成伤害，获得一枚“忍”（${p.simayiRen}/5）。`,'system');}
    };
    P.simayiRecover=function(p){
      if(!owner(this,p)||p.simayiRen<2||p.hp>=p.maxHp)return;
      p.simayiRen-=2;this.heal(p,1);this.log(`${p.name}【韬晦】移去两枚“忍”，回复1点体力。`,'heal');this.change();
    };
    P.simayiAwaken=async function(p){
      if(!p?.alive||p.general!=='simayi'||p.simayiAwakened||p.simayiRen!==5)return;
      p.simayiAwakened=true;p.maxHp++;this.heal(p,1);this.draw(p,2);
      this.log(`${p.name}【狼顾】觉醒：体力上限+1、回复1点体力、摸两张牌，保留五枚“忍”并获得【擅政】。`,'system');this.change();
      await this.simayiShanzheng(p,true);
    };
    P.preparationSkills=async function(p){await preparation.call(this,p);
      if(!p?.alive||p.general!=='simayi'||this.over)return;
      const recover=owner(this,p)&&p.simayiRen>=2&&p.hp<p.maxHp;
      const awaken=!p.simayiAwakened&&p.simayiRen===5;
      if(recover&&awaken){
        const choice=await this.option(p,'准备阶段：先结算韬晦还是狼顾？',[{key:'awaken',label:'先狼顾：觉醒并回复1点体力'},{key:'recover',label:'先韬晦：移去两忍回复，推迟觉醒'}],'awaken','两项各结算一次；先回血会使“忍”不足五枚，本阶段无法觉醒。');
        if(choice==='recover'){this.simayiRecover(p);return;}
      }
      if(awaken)await this.simayiAwaken(p);
      if(owner(this,p)&&!this.over&&p.simayiRen>=2&&p.hp<p.maxHp){
        const use=await this.option(p,'韬晦：移去两枚“忍”，回复1点体力？',[{key:'yes',label:'两忍回复1点体力'},{key:'no',label:'保留“忍”'}],p.hp<=2||p.simayiAwakened&&p.hp<=3?'yes':'no');
        if(use==='yes')this.simayiRecover(p);
      }
    };
    // This hook runs before the result is calculated. Exhibitions such as 不屈 are not judgments.
    P.reviseJudgment=async function(target,reason,card){
      let current=card;
      for(const p of this.actionOrder(this.alive().filter(t=>owner(this,t)&&t.hand.length||this.zhangjiaoCanGuidao?.(t)))){
        if(!target.alive||this.over)break;
        if(this.zhangjiaoCanGuidao?.(p)){current=await this.zhangjiaoGuidao(p,target,reason,current);continue;}
        if(!owner(this,p))continue;
        const good=c=>reason==='乐不思蜀'?c.suit==='H':reason==='兵粮寸断'?c.suit==='C':reason==='闪电'?!(c.suit==='S'&&c.rank>=2&&c.rank<=9):reason==='八卦阵'?isRed(c):reason==='铁骑'?!isRed(c):reason==='筹策'?isRed(c):null;
        const friend=this.hostility(p,target)<0,known=good(current);
        const candidates=known===null?[]:p.hand.filter(c=>good(c)!==known&&(friend?good(c):!good(c)));
        const best=candidates.sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
        const key=await this.option(p,`鬼才：替换${target.name}的【${reason}】判定牌？`,[...p.hand.map(c=>({key:c.id,label:`改判：${c.name} ${C.suitMark[c.suit]}${C.rankMark(c.rank)}`,card:c})),{key:'pass',label:'不改判'}],best&&this.value(best,p)<(reason==='闪电'?15:10)?best.id:'pass',`当前判定：${C.suitMark[current.suit]}${C.rankMark(current.rank)}【${current.name}】。`);
        if(key==='pass'||!p.hand.some(c=>c.id===key))continue;
        const replacement=this.withLoss('play',()=>this.moveBatch(p,()=>this.removeOwned(p,key).card));
        this.drop(current);current=replacement;this.table.push(current);
        this.log(`${p.name}【鬼才】用${C.suitMark[current.suit]}${C.rankMark(current.rank)}【${current.name}】替换判定牌。`,'judge');this.noteCardRevealed?.(p,current);
        if(owner(this,p)&&p.simayiRen>0){
          const use=await this.option(p,'鬼才：移去一枚“忍”，摸一张牌？',[{key:'yes',label:'一忍摸一张'},{key:'no',label:'保留“忍”'}],p.simayiAwakened||p.hp<=2&&p.hand.length<=1?'yes':'no');
          if(use==='yes'){p.simayiRen--;this.draw(p,1);this.log(`${p.name}【鬼才】移去一枚“忍”，摸一张牌。`,'draw');}
        }
        this.change();
      }
      return current;
    };
    P.simayiShanzheng=async function(p,immediate=false){
      if(!owner(this,p)||!p.simayiAwakened||p.simayiRen<1||this.turn!==p.id||this.over)return;
      if(!immediate&&(this.phase!=='出牌'||p.simayiShanzhengTurn===this.totalTurns))return;
      if(immediate&&this.phase!=='准备')return;
      const targets=this.alive().filter(t=>t.id!==p.id),enemies=targets.filter(t=>this.hostility(p,t)>.5).sort((a,b)=>a.hp-b.hp||this.owned(b,true).length-this.owned(a,true).length);
      if(!targets.length)return;
      const best=enemies.find(t=>this.owned(t,true).length)||enemies[0];
      const id=await this.option(p,`擅政${immediate?'（狼顾附送）':''}：选择一名其他角色`,[...targets.map(t=>({key:String(t.id),label:`${t.name} · ${t.hp}体力 · ${this.owned(t,true).length}张牌`})),{key:'cancel',label:'不发动'}],best?String(best.id):'cancel','空牌角色仍可成为目标；同一目标的两次压制不叠加次数。');
      if(id==='cancel')return;const target=this.get(Number(id));if(!target?.alive||target.id===p.id)return;
      p.simayiRen--;if(!immediate)p.simayiShanzhengTurn=this.totalTurns;
      if(p.simayiControlTurn!==this.totalTurns){p.simayiControlTurn=this.totalTurns;p.simayiControl=[];}
      const previous=p.simayiControl.find(x=>x.id===target.id);
      if(previous)previous.pending=true;else p.simayiControl.push({id:target.id,pending:true});
      const hasCard=this.owned(target,true).length>0;
      if(hasCard)await this.takeOtherCard(p,target,'obtain',true);
      this.log(`${p.name}【擅政】移去一枚“忍”，${hasCard?'夺取'+target.name+'一张牌':target.name+'无牌可取'}；本回合对其用牌无距离限制，其不能响应下一张对其使用的伤害牌。`,'system');this.change();
    };
    P.distance=function(p,t){return affected(this,p,t)?1:distance.call(this,p,t);};
    P.markCardUse=async function(p,c,targets){
      const valid=await mark.call(this,p,c,targets);
      if(valid&&owner(this,p)&&damaging(c)&&p.simayiControlTurn===this.totalTurns){
        const actual=this.effectiveTargets(p,c,targets||[]);
        const blocked=p.simayiControl.filter(x=>x.pending&&actual.some(t=>t.id===x.id));
        c.simayiBlockedTargets=blocked.map(x=>x.id);c.simayiBlockedTurn=this.totalTurns;c.simayiBlockedOwner=p.id;
        for(const record of blocked)record.pending=false;
      }return valid;
    };
    P.simayiNoResponse=function(p,source,card){return !!p&&card?.simayiBlockedOwner===(source?.id??card?.ownerId)&&this.get(card.simayiBlockedOwner)?.simayiControlTurn===this.totalTurns&&card.simayiBlockedTurn===this.totalTurns&&card.simayiBlockedTargets?.includes(p.id);};
    P.caocaoNoResponse=function(p,source,card){return this.simayiNoResponse(p,source,card)||noResponse?.call(this,p,source,card)||false;};
    P.response=async function(p,type,title,ignoreArmor=false,context={}){
      if(this.simayiNoResponse(p,context.source,context.card)){this.log(`${p.name}因【擅政】不能响应此【${context.card.name}】。`,'system');return false;}
      return response.call(this,p,type,title,ignoreArmor,context);
    };
    P.activeSkills=function(p){const list=active.call(this,p);if(p?.general==='simayi')list.push({key:'shanzheng',name:'擅政',detail:p.simayiAwakened?'一忍夺牌 · 本阶段限一次':'狼顾觉醒后获得',ready:owner(this,p)&&p.simayiAwakened&&p.simayiRen>0&&this.isPlayPhaseOwner(p)&&p.simayiShanzhengTurn!==this.totalTurns&&this.alive().length>1});return list;};
    P.prepareActive=async function(p,a){if(a.skill==='shanzheng'){await this.simayiShanzheng(p);return null;}return prepare.call(this,p,a);};
    P.aiPlay=function(p,actions){
      if(owner(this,p)){
        const skill=actions.find(a=>a.skill==='shanzheng');
        if(skill&&this.alive().some(t=>t.id!==p.id&&this.hostility(p,t)>.5&&(this.owned(t,true).length||p.hand.some(damaging))))return skill;
      }
      return ai.call(this,p,actions.filter(a=>a.skill!=='shanzheng'));
    };
    P.damageBenefitRisk=function(p){const base=risk.call(this,p);return owner(this,p)?Math.max(base,p.hp<=1?1:p.simayiRen<5?3:1.5):base;};
    P.dynastyStates=function(p,compact=false){const list=states.call(this,p,compact);if(p?.general==='simayi'){
      list.push(`忍 ${p.simayiRen||0}/5`,p.simayiAwakened?'狼顾已觉醒':'狼顾未觉醒');
      if(p.simayiControlTurn===this.totalTurns)for(const r of p.simayiControl||[])list.push(`擅政·${this.get(r.id).name}${r.pending?'（待压制）':'（无距离限制）'}`);
    }return list;};
  }
  const api={install};root.ZhenSimayiSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
