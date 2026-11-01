(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{defs,isSlash,suitMark,rankMark}=C;
    const init=P.initExtra,drawCount=P.phaseDrawCount,handLimit=P.handLimit;
    const damage=P.damage,active=P.activeSkills,prepare=P.prepareActive,aiPlay=P.aiPlay,afterCard=P.afterCardUse;
    const owner=(g,p)=>p?.alive&&g.isGeneral(p,'shizhouyu');
    const locked=(g,p)=>p?.alive&&g.isGeneralLocked(p,'shizhouyu');
    const next=s=>s==='yang'?'yin':'yang';
    P.initExtra=function(p){init.call(this,p);p.fenjiangMode='yang';p.fenjiangUsed={yang:-1,yin:-1};p.guquUsedTurn=-1;};
    P.phaseDrawCount=function(p,normal){const n=drawCount?drawCount.call(this,p,normal):normal;return locked(this,p)?n+1:n;};
    P.handLimit=function(p){return locked(this,p)?p.maxHp:handLimit.call(this,p);};
    P.damage=async function(source,target,amount,nature='normal',context={}){
      if(!context.xuchuTransferred&&nature==='fire'&&amount>0&&target?.alive&&!this.over){
        for(const zhouyu of this.actionOrder(this.alive().filter(p=>owner(this,p)))){
          if(!target.alive||this.over)break;
          const hostile=this.hostility(zhouyu,target)>0.5;
          const useful=hostile&&zhouyu.hp>=3&&(target.hp===amount+1||target.hp>amount&&this.damageBenefitRisk(target)<1.5);
          const choice=await this.option(zhouyu,`焚江：失去1点体力，令${target.name}即将受到的${amount}点火焰伤害+1？`,[
            {key:'yes',label:'失去1点体力，伤害+1'},{key:'no',label:'不发动'}
          ],useful?'yes':'no');
          if(choice!=='yes')continue;
          await this.loseHp(zhouyu,1,'焚江');
          amount++;
          this.log(`${zhouyu.name}发动【焚江】，令${target.name}此次火焰伤害+1。`,'damage');
        }
      }
      return damage.call(this,source,target,amount,nature,context);
    };
    P.fenjiangCards=function(p){
      if(!owner(this,p)||!this.isPlayPhaseOwner(p)||!p.hand.length)return [];
      const mode=p.fenjiangMode||'yang';if(p.fenjiangUsed?.[mode]===this.totalTurns)return [];
      const base=mode==='yang'?defs.chain:defs.fireAttack;
      return p.hand.map(raw=>({...base,id:`fenjiang-${raw.id}`,virtual:true,costs:[raw],suit:raw.suit,rank:raw.rank,originSkill:'fenjiang'}))
        .filter(card=>this.skillActionsFor(p,card).length);
    };
    P.activeSkills=function(p){const list=active.call(this,p);if(owner(this,p)){
      const mode=p.fenjiangMode||'yang',used=p.fenjiangUsed?.[mode]===this.totalTurns;
      list.push({key:'fenjiang',name:'焚江',detail:`${mode==='yang'?'阳 · 铁索连环':'阴 · 火攻'} · 本回合阳${p.fenjiangUsed?.yang===this.totalTurns?'已用':'未用'}/阴${p.fenjiangUsed?.yin===this.totalTurns?'已用':'未用'}`,ready:!used&&this.fenjiangCards(p).length>0,reason:used?'此面本回合已使用':'没有手牌或合法目标'});
    }return list;};
    P.aiPlay=function(p,actions){const ordinary=aiPlay.call(this,p,actions.filter(a=>a.skill!=='fenjiang'));
      if(!owner(this,p)||!actions.some(a=>a.skill==='fenjiang'))return ordinary;
      const cards=this.fenjiangCards(p),low=cards.filter(c=>this.value(c.costs[0],p)<=5);
      const useful=low.some(c=>this.cardPlan(p,c));
      const ordinaryCard=ordinary.type==='use'?p.hand.find(c=>c.id===ordinary.cardId):null;
      return useful&&(ordinary.type==='end'||ordinaryCard&&this.value(ordinaryCard,p)<=4)?{type:'skill',skill:'fenjiang'}:ordinary;
    };
    P.prepareActive=async function(p,a){if(a.skill!=='fenjiang')return prepare.call(this,p,a);
      const mode=p.fenjiangMode||'yang',cards=this.fenjiangCards(p);if(!cards.length)return null;
      const preferred=[...cards].sort((a,b)=>this.value(a.costs[0],p)-this.value(b.costs[0],p))[0];
      const id=await this.option(p,`焚江·${mode==='yang'?'阳':'阴'}：选择要转化的手牌`,[
        ...cards.map(c=>({key:c.id,label:`${c.costs[0].name} ${suitMark[c.suit]}${rankMark(c.rank)}`,card:c.costs[0]})),
        {key:'cancel',label:'取消'}
      ],preferred.id);
      if(id==='cancel')return null;
      const card=cards.find(c=>c.id===id);if(!card)return null;
      const actions=this.skillActionsFor(p,card);if(!actions.length)return null;
      const best=this.cardPlan(p,card)||actions[0];
      const preferredIndex=String(Math.max(0,actions.findIndex(x=>JSON.stringify(x)===JSON.stringify(best))));
      const index=actions.length===1?0:Number(card.key==='chain'?await this.chooseChainTargets(p,`焚江·阳：选择目标`,actions,preferredIndex):await this.option(p,`焚江·阴：选择目标`,actions.map((x,i)=>({key:String(i),label:x.targets.map(t=>this.get(t).name).join('、')||'自己'})),preferredIndex));
      const action=actions[index];if(!action)return null;
      const raw=this.removeHand(p,card.costs[0].id);
      p.fenjiangUsed[mode]=this.totalTurns;p.fenjiangMode=next(mode);
      this.log(`${p.name}发动【焚江·${mode==='yang'?'阳':'阴'}】，将【${raw.name}】当作【${card.name}】使用。`,'use');
      return {card:{...card,costs:[raw]},action};
    };
    P.guquUse=async function(zhouyu,card){
      if(!zhouyu.alive||this.over||!defs[card.key])return;
      const copy={...defs[card.key],id:`guqu-${this.totalTurns}-${this.cardActionSerial}`,virtual:true,costs:[],suit:'N',rank:0,originSkill:'guqu',guquRepeated:true};
      const actions=this.skillActionsFor(zhouyu,copy);
      if(!actions.length){this.log(`${zhouyu.name}【顾曲】没有可使用【${copy.name}】的合法目标。`,'system');return;}
      const preferred=this.cardPlan(zhouyu,copy),suggested=preferred?Math.max(0,actions.findIndex(a=>JSON.stringify(a)===JSON.stringify(preferred))):-1;
      const key=copy.key==='chain'?await this.chooseChainTargets(zhouyu,`顾曲：重新选择【${copy.name}】目标`,actions,suggested<0?'pass':String(suggested),[{key:'pass',label:'只摸牌，不使用'}]):await this.option(zhouyu,`顾曲：是否视为使用【${copy.name}】？重新选择目标`,[
        ...actions.map((a,i)=>({key:String(i),label:`使用【${copy.name}】${a.targets.length?' → '+a.targets.map(id=>`${this.get(id).name}（${id+1}号位）`).join('、'):''}`})),
        {key:'pass',label:'只摸牌，不使用'}
      ],suggested<0?'pass':String(suggested));
      if(key==='pass')return;
      const action=actions[Number(key)];if(!action)return;
      const original=action.targets.map(id=>this.get(id)),targets=this.effectiveTargets(zhouyu,copy,original);
      this.showCardAction(zhouyu,copy,targets,'顾曲');
      this.sound('card',{playerId:zhouyu.id,cardKey:copy.key,kind:copy.kind});
      this.log(`${zhouyu.name}【顾曲】视为使用【${copy.name}】${original.length?' → '+original.map(t=>t.name).join('、'):''}。`,'use');
      try{
        const valid=await this.markCardUse(zhouyu,copy,targets);
        if(isSlash(copy)&&!copy.noQuota)zhouyu.slashUsed++;
        if(!valid)return;
        if(isSlash(copy)){
          for(const t of this.actionOrder(targets))if(t.alive&&!this.over)await this.slash(zhouyu,t,copy,copy.nature,1);
        }else if(copy.key==='peach')await this.resolvePeach(zhouyu,copy);
        else if(copy.key==='wine'){zhouyu.wineUsed++;zhouyu.drunk=1;}
        else if(copy.key==='draw2'){if(await this.trickAllowed(zhouyu,zhouyu,copy))this.draw(zhouyu,2);}
        else if(['barbarian','arrows','healAll','harvest'].includes(copy.key)){
          const allowed=[];for(const t of this.actionOrder(targets))if(t.alive&&!this.over&&await this.trickAllowed(zhouyu,t,copy))allowed.push(t);
          await this.groupTrickResolved(zhouyu,copy,allowed);
        }else if(copy.key==='borrow'){
          const t=original[0];if(t?.alive&&await this.trickAllowed(zhouyu,t,copy))await this.borrow(zhouyu,t,original[1]);
        }else for(const t of this.actionOrder(targets))if(t.alive&&!this.over&&await this.trickAllowed(zhouyu,t,copy))await this.singleTrick(zhouyu,t,copy);
      }finally{await this.afterCardUse(zhouyu,copy,targets);this.change();}
    };
    P.afterCardUse=async function(user,card,targets){
      await afterCard.call(this,user,card,targets);
      if(this.over||!user?.alive||!card?.virtual||!card.originSkill||!defs[card.key]||card.guquRepeated||card.guquTriggered||card.damageTotal>0||!['basic','trick'].includes(card.kind)||['jink','nullify'].includes(card.key))return;
      for(const zhouyu of this.actionOrder(this.alive().filter(p=>owner(this,p)))){
        if(!zhouyu.alive||this.over)break;
        if(zhouyu.guquUsedTurn===this.totalTurns)continue;
        const friendly=this.hostility(zhouyu,user)<0;
        const useful=friendly||this.skillActionsFor(zhouyu,{...defs[card.key],id:'guqu-preview',virtual:true,costs:[],suit:'N',rank:0,originSkill:'guqu'}).some(a=>a.targets.some(id=>this.hostility(zhouyu,this.get(id))>0));
        const choice=await this.option(zhouyu,`顾曲：${user.name}的【${card.name}】未造成伤害，双方各摸一张？`,[{key:'yes',label:'发动顾曲'},{key:'no',label:'不发动'}],useful?'yes':'no');
        if(choice!=='yes')continue;
        zhouyu.guquUsedTurn=this.totalTurns;
        card.guquTriggered=true;
        this.draw(zhouyu,1);if(user.alive)this.draw(user,1);
        this.log(`${zhouyu.name}发动【顾曲】，与${user.name}各摸一张。`,'draw');
        await this.guquUse(zhouyu,card);
        break;
      }
    };
  }
  const api={install};root.ZhenZhouyuSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
