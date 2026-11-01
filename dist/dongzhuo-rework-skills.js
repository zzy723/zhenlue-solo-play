(function(root){
  'use strict';
  const types=['basic','trick','equip'],names={basic:'基本牌',trick:'锦囊牌',equip:'装备牌'};
  const type=c=>c.kind==='delay'?'trick':c.kind;
  function install(Game,C){
    const P=Game.prototype,old={};
    for(const k of ['roundStart','playStartSkills','discardPhase','discardOwned','phaseEndSkills','finishPhaseSkills','dynastyStates','response'])old[k]=P[k];
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'dongzhuo');
    const same=(p,generation)=>p?.alive&&p.generation===generation;
    const cheap=(g,p,cards)=>[...cards].sort((a,b)=>g.value(a,p)-g.value(b,p));
    const moved=(g,p)=>p.dzMovedTurn===g.totalTurns&&p.dzMovedGeneration===p.generation;
    const completed=(g,p)=>p.dzDiscardDoneTurn===g.totalTurns&&p.dzDiscardDoneGeneration===p.generation;
    // Increase each response requirement once, including requirements already enlarged by another skill.
    P.dongzhuoJinkNeed=function(p,base=1){return base+(owner(this,p)?1:0);};
    P.response=async function(p,type,title,ignoreArmor=false,context={}){
      if(type!=='jink'||context.dongzhuoJinkBatch||!owner(this,p))return old.response.call(this,p,type,title,ignoreArmor,context);
      await this.flushSkillEvents();
      const generation=p.generation,need=this.dongzhuoJinkNeed(p);
      for(let i=1;i<=need;i++){
        if(!same(p,generation)||this.over||this.turnInterrupted)return false;
        const prompt=need>1?`${title}（乱政：共需${need}张闪，当前第${i}张）`:title;
        if(!(await old.response.call(this,p,type,prompt,ignoreArmor,{...context,dongzhuoJinkBatch:true})))return false;
      }
      return true;
    };
    P.roundStart=async function(){
      const fresh=this.startedRound!==this.round;await old.roundStart.call(this);
      if(!fresh||this.over)return;
      for(const p of this.actionOrder(this.alive().filter(p=>owner(this,p)))){
        const target=Math.max(0,p.hp),excess=p.hand.length-target;
        if(excess>0){const ids=await this.selectCards(p,'乱政：将手牌数调整至体力值',p.hand,excess,excess,cheap(this,p,p.hand).slice(0,excess).map(c=>c.id));this.discardOwned(p,ids);}
        else if(excess<0)this.draw(p,-excess);
        this.log(`${p.name}【乱政】将手牌数调整至当前体力值${target}。`,'system');await this.flushSkillEvents();
        if(this.over)break;
      }
    };
    P.dzMoveDiscard=async function(d,p){
      if(!owner(this,d)||!p?.alive||d.id===p.id||!d.hand.length||this.over||this.turn!==p.id||this._liushanExtraPlay||moved(this,p)||completed(this,p))return false;
      const generation=p.generation;
      const ids=await this.selectCards(d,'乱政：弃置一张手牌，提前其弃牌阶段',d.hand,0,1,[cheap(this,d,d.hand)[0].id],'可空选放弃；只能弃置手牌。');
      if(ids.length!==1||!d.hand.some(c=>c.id===ids[0]))return false;
      this.discardOwned(d,ids);await this.flushSkillEvents();
      if(!same(p,generation)||!owner(this,d)||this.over)return false;
      p.dzMovedTurn=this.totalTurns;p.dzMovedGeneration=generation;
      this.log(`${d.name}发动【乱政】，${p.name}提前执行本回合的弃牌阶段。`,'system');
      const phase=this.phase,early=this._dzEarly;
      this.phase='弃牌';this._dzEarly={id:p.id,generation};
      try{await this.discardPhase(p);if(same(p,generation)&&!this.over)await this.phaseEndSkills(p);}
      finally{this.phase=phase;this._dzEarly=early;this.change();}
      return true;
    };
    P.playStartSkills=async function(p){
      if(this.turn===p.id&&!this._liushanExtraPlay&&!p.skipPlay&&!completed(this,p))for(const d of this.actionOrder(this.alive().filter(d=>d.id!==p.id&&owner(this,d)&&d.hand.length))){
        if(moved(this,p)||!p.alive||this.over)break;
        const suggested=this.hostility(d,p)>.5&&p.hand.length>this.handLimit(p)?'yes':'no';
        if(await this.option(d,`乱政：令${p.name}先弃牌再出牌？`,[{key:'yes',label:'发动乱政'},{key:'no',label:'不发动'}],suggested)==='yes')await this.dzMoveDiscard(d,p);
      }
      if(p.alive&&!this.over&&!this.turnInterrupted)await old.playStartSkills.call(this,p);
    };
    P.discardOwned=function(p,ids){
      const context=this._dzCapture,cards=context?.id===p.id&&context.generation===p.generation?this.owned(p,true).filter(c=>ids.includes(c.id)):[];
      const result=old.discardOwned.call(this,p,ids);if(cards.length)context.cards.push(...cards);return result;
    };
    P.discardPhase=async function(p){
      if(moved(this,p)&&!this._dzEarly)return;
      const context={id:p.id,generation:p.generation,cards:[]},previous=this._dzCapture;
      this._dzCapture=context;
      try{await old.discardPhase.call(this,p);await this.flushSkillEvents();}
      finally{this._dzCapture=previous;}
      if(same(p,context.generation)){p.dzPendingDiscard=context;p.dzDiscardDoneTurn=this.totalTurns;p.dzDiscardDoneGeneration=p.generation;}
    };
    P.dzAward=async function(d,p,discarded){
      if(!owner(this,d)||d.id===p.id||d.dzLootRound===this.round||this.over)return false;
      const available=()=>[...new Map(discarded.map(c=>[c.id,c])).values()].filter(c=>this.discard.some(x=>x.id===c.id));
      const recipients=this.alive().filter(t=>t.id!==d.id&&t.id!==p.id);
      if(!available().length||!recipients.length)return false;
      const counts=t=>available().filter(c=>type(c)===t).length;
      const best=types.slice().sort((a,b)=>available().filter(c=>type(c)===b).reduce((n,c)=>n+this.value(c,d),0)-available().filter(c=>type(c)===a).reduce((n,c)=>n+this.value(c,d),0))[0];
      const first=await this.option(d,'乱政：选择自己获得的类型',types.map(t=>({key:t,label:`${names[t]}（${counts(t)}张）`})).concat({key:'cancel',label:'不发动'}),best,'每轮限一次；可以选择没有牌的类型。');
      if(!types.includes(first))return false;
      const target=recipients.slice().sort((a,b)=>this.hostility(d,a)-this.hostility(d,b)||a.hand.length-b.hand.length)[0];
      const id=await this.option(d,'乱政：选择另一名受赠角色',recipients.map(t=>({key:String(t.id),label:t.name})),String(target.id));
      const recipient=this.get(Number(id)),rest=types.filter(t=>t!==first);
      const second=await this.option(d,'乱政：选择交给其的另一种类型',rest.map(t=>({key:t,label:`${names[t]}（${counts(t)}张）`})),rest.slice().sort((a,b)=>(this.hostility(d,recipient)<0?1:-1)*(counts(b)-counts(a)))[0]);
      if(!owner(this,d)||!recipients.includes(recipient)||!recipient.alive||!rest.includes(second)||d.dzLootRound===this.round)return false;
      d.dzLootRound=this.round;
      const cards=available(),mine=cards.filter(c=>type(c)===first),gift=cards.filter(c=>type(c)===second),ids=new Set([...mine,...gift].map(c=>c.id));
      this.discard=this.discard.filter(c=>!ids.has(c.id));
      if(mine.length)this.gain(d,mine);if(gift.length)this.gain(recipient,gift);
      this.log(`${d.name}【乱政】获得${mine.length}张${names[first]}，${recipient.name}获得${gift.length}张${names[second]}。`,'system');
      await this.flushSkillEvents();return true;
    };
    P.phaseEndSkills=async function(p){
      if(this.phase==='弃牌'&&moved(this,p)&&!this._dzEarly)return;
      const pending=this.phase==='弃牌'?p.dzPendingDiscard:null,previous=this._dzCapture;
      if(pending)this._dzCapture=pending;
      try{await old.phaseEndSkills?.call(this,p);if(pending)await this.flushSkillEvents();}
      finally{this._dzCapture=previous;}
      if(pending){delete p.dzPendingDiscard;if(!this.over)for(const d of this.actionOrder(this.alive().filter(d=>owner(this,d)&&d.id!==p.id)))await this.dzAward(d,p,pending.cards);}
    };
    P.finishPhaseSkills=async function(p){
      await old.finishPhaseSkills.call(this,p);
      if(this.over||!p.alive||!this.isGeneralLocked(p,'dongzhuo')||p.hp===Math.min(...this.alive().map(t=>t.hp)))return;
      const available=types.filter(t=>this.owned(p,true).some(c=>type(c)===t));
      const cost=t=>this.owned(p,true).filter(c=>type(c)===t).reduce((n,c)=>n+(p.judge.some(x=>x.id===c.id)?-3:this.value(c,p)),0);
      const least=available.slice().sort((a,b)=>cost(a)-cost(b))[0];
      const answer=await this.option(p,'崩坏：选择代价',available.map(t=>({key:t,label:`弃置所有${names[t]}（${this.owned(p,true).filter(c=>type(c)===t).length}张，含三个区域）`})).concat({key:'hp',label:'失去1点体力'}),least&&(p.hp<=2||cost(least)<=6)?least:'hp');
      if(available.includes(answer))this.discardOwned(p,this.owned(p,true).filter(c=>type(c)===answer).map(c=>c.id));else await this.loseHp(p,1,'崩坏');
      await this.flushSkillEvents();
    };
    P.dynastyStates=function(p,compact=false){const states=old.dynastyStates.call(this,p,compact);if(p.general==='dongzhuo')states.push(`乱政分牌 · 本轮${p.dzLootRound===this.round?'已用':'可用'}`);return states;};
  }
  const api={install};root.ZhenDongzhuoReworkSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
