(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{defs,isSlash,isRed,suitMark,rankMark}=C;
    const init=P.initExtra,begin=P.beginTurnSkills,range=P.range,mark=P.markCardUse,slash=P.slash,after=P.afterCardUse,turnEnd=P.turnEndSkills,states=P.dynastyStates;
    const isMa=(g,p)=>g.isGeneralLocked(p,'machao');
    P.initExtra=function(p){init.call(this,p);p.machaoRangeBonus=0;p.machaoJijinCount=0;p.machaoSilence=null;p.machaoTieqiRound=0;p.machaoTieqiUsed=[];};
    P.beginTurnSkills=function(){begin.call(this);for(const p of this.players)p.machaoJijinCount=0;};
    P.range=function(p){return range.call(this,p)+(isMa(this,p)&&this.turn===p.id?p.machaoRangeBonus||0:0);};
    P.machaoTieqi=async function(p,c,targets){
      c.machaoRedTargets=[];
      if(p.machaoTieqiRound!==this.round){p.machaoTieqiRound=this.round;p.machaoTieqiUsed=[];}
      for(const target of this.actionOrder(targets)){
        if(!p.alive||!target?.alive||this.over)break;
        if(p.machaoTieqiUsed.includes(target.id))continue;
        p.machaoTieqiUsed.push(target.id);
        if(!target.machaoSilence)target.machaoSilence={turn:this.totalTurns,wasSilenced:!!target.silenced};
        target.silenced=true;
        this.log(`${p.name}【铁骑】令${target.name}的非锁定技本回合失效。`,'system');
        const choice=await this.option(p,`铁骑：令${target.name}判定？`,[{key:'yes',label:'进行判定'},{key:'no',label:'不判定'}],this.hostility(p,target)>0&&p.hp>1?'yes':'no');
        if(choice!=='yes')continue;
        let judged=this.takeTop();if(!judged)continue;
        this.table.push(judged);judged=await this.reviseJudgment(target,'铁骑',judged);
        const red=isRed(judged),outcome=red?'红色：此杀不可响应':'黑色：获得判定牌，失去1点体力';
        await this.showJudgment(target,'铁骑',judged,red,outcome,'红色不可响应；黑色获得判定牌，失去1点体力');
        if(red){this.drop(judged);c.machaoRedTargets.push(target.id);this.log(`${p.name}【铁骑】判定为红色，${target.name}不能响应此【杀】。`,'system');continue;}
        const index=this.table.findIndex(x=>x.id===judged.id);
        if(index>=0)this.table.splice(index,1);
        delete judged.tianduOwner;
        if(p.alive)this.gain(p,[judged]);else this.putDiscard(judged);
        this.log(`${p.name}【铁骑】判定为黑色，获得${suitMark[judged.suit]}${rankMark(judged.rank)}【${judged.name}】。`,'draw');
        p.machaoTieqiUsed=p.machaoTieqiUsed.filter(id=>id!==target.id);
        this.log(`${p.name}【铁骑】黑色判定重置了本轮对${target.name}的发动次数。`,'system');
        await this.loseHp(p,1,'铁骑');
      }
    };
    P.markCardUse=async function(p,c,targets){
      if(isMa(this,p)&&isSlash(c)&&targets.length)await this.machaoTieqi(p,c,targets);
      if(!p.alive||this.over)return false;
      return mark.call(this,p,c,targets);
    };
    P.slash=async function(p,target,c,nature='normal',amount=1){
      const red=c.machaoRedTargets?.includes(target.id),old=c.unrespondable;
      if(red)c.unrespondable=true;
      try{return await slash.call(this,p,target,c,nature,amount);}
      finally{if(red)c.unrespondable=old;}
    };
    P.machaoFollow=async function(p){
      if(!isMa(this,p)||!p.alive||this.over||this.turn!==p.id)return;
      const count=(p.machaoJijinCount||0)+1;
      const cards=p.hand.filter(c=>this.allowedUse(p,{...defs.slash,virtual:true,costs:[c]}));
      const targets=this.alive().filter(t=>t.id!==p.id&&this.canSlash(p,t));
      if(cards.length<count||!targets.length)return;
      const enemy=targets.filter(t=>this.hostility(p,t)>0).sort((a,b)=>a.hp-b.hp||a.hand.length-b.hand.length)[0];
      const cheapest=[...cards].sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,count);
      const value=cheapest.reduce((sum,c)=>sum+this.value(c,p),0);
      const worthwhile=enemy&&(value<=6.5||enemy.hp<=1&&value<=9);
      const choice=await this.option(p,`急进：将${count}张手牌当杀追击？`,[{key:'yes',label:`选择${count}张手牌当杀`},{key:'no',label:'不追击'}],worthwhile?'yes':'no');
      if(choice!=='yes'||!p.alive||this.over)return;
      const ids=await this.selectCards(p,`急进：选择当杀的${count}张手牌`,cards,count,count,cheapest.map(c=>c.id),`本回合已追击${count-1}次；本次需${count}张，下次需${count+1}张。`);
      if(!Array.isArray(ids)||ids.length!==count||new Set(ids).size!==count)return;
      const chosen=ids.map(id=>p.hand.find(c=>c.id===id));
      if(chosen.some(c=>!c)||!this.allowedUse(p,{...defs.slash,virtual:true,costs:chosen}))return;
      const available=this.alive().filter(t=>t.id!==p.id&&this.canSlash(p,t));if(!available.length)return;
      const preferred=available.includes(enemy)?enemy:[...available].sort((a,b)=>this.hostility(p,b)-this.hostility(p,a)||a.hp-b.hp)[0];
      const id=await this.option(p,'急进：选择杀的目标',available.map(t=>({key:String(t.id),label:`${t.name} · ${t.hp}血`})),String(preferred.id));
      const target=this.get(Number(id));if(!available.includes(target)||!target.alive||!this.canSlash(p,target))return;
      const costs=this.moveBatch(p,()=>ids.map(id=>this.removeHand(p,id)));
      const suit=costs.length===1?costs[0].suit:costs.every(isRed)?'H':costs.every(c=>['S','C'].includes(c.suit))?'S':'N';
      const raw={...defs.slash,id:`jijin-${costs.map(c=>c.id).join('-')}`,virtual:true,costs,suit,rank:costs.length===1?costs[0].rank:0,noQuota:true,machaoFollow:true,originSkill:'jijin'};
      p.machaoJijinCount=count;
      this.log(`${p.name}发动【急进】（本回合第${count}次），将${costs.map(c=>`【${c.name}】`).join('、')}共${count}张手牌当作不计次数的【杀】对${target.name}使用。`,'use');
      await this.declaredSlash(p,target,raw);
    };
    P.afterCardUse=async function(p,c,targets){
      await after.call(this,p,c,targets);
      if(!isMa(this,p)||this.over||this.turn!==p.id||c.machaoFollow)return;
      p.machaoRangeBonus=(p.machaoRangeBonus||0)+1;
      this.log(`${p.name}【急进】令额外攻击范围增加至+${p.machaoRangeBonus}。`,'system');
      await this.machaoFollow(p);
    };
    P.turnEndSkills=async function(){
      await turnEnd.call(this);
      for(const p of this.players){
        if(p.machaoSilence?.turn===this.totalTurns){
          p.silenced=!!p.restrictionUntil||!!p.machaoSilence.wasSilenced;
          p.machaoSilence=null;
        }
      }
      const owner=this.get(this.turn),bonus=owner?.machaoRangeBonus||0;
      if(owner)owner.machaoJijinCount=0;
      if(!bonus)return;
      owner.machaoRangeBonus=0;
      if(!isMa(this,owner)||this.over)return;
      this.draw(owner,bonus);
      this.log(`${owner.name}发动【精备】，额外攻击范围归零并摸${bonus}张牌。`,'draw');
    };
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(p.general==='machao'&&p.machaoRangeBonus)out.push('急进范围 +'+p.machaoRangeBonus);return out;};
  }
  const api={install};root.ZhenMachaoSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
