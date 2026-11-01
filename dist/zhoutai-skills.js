(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype;
    const init=P.initExtra,handLimit=P.handLimit,allowedUse=P.allowedUse;
    const cardsLost=P.cardsLost,flush=P.flushSkillEvents,dying=P.dying;
    const applyDamageHealth=P.applyDamageHealth,afterDamage=P.afterDamageEvent;
    const death=P.death,states=P.dynastyStates;
    const isZhoutai=p=>p?.general==='jiezhoutai';

    P.initExtra=function(p){init.call(this,p);p.zhoutaiChuang=[];};

    P.handLimit=function(p){return isZhoutai(p)&&p.zhoutaiChuang.length?p.zhoutaiChuang.length:handLimit.call(this,p);};
    P.allowedUse=function(p,c,played=false){
      if(isZhoutai(p)&&c?.key==='peach'&&!this._zhoutaiDyingDepth)return false;
      return allowedUse.call(this,p,c,played);
    };

    P.zhoutaiBuqu=async function(p){
      if(!isZhoutai(p)||!p.alive||p.hp>0)return false;
      if(p.zhoutaiChuang.length>=13){this.log(`${p.name}已有十三张“创”，【不屈】本次不能再发动。`,'danger');return false;}
      const card=this.takeTop();if(!card)return false;
      this.table.push(card);
      const repeated=p.zhoutaiChuang.some(c=>c.rank===card.rank);
      await this.showJudgment(p,'不屈',card,repeated,repeated?'点数重复，弃置并继续求救':'成为“创”，回复至1点体力','点数不能与已有“创”相同');
      this.table.splice(this.table.findIndex(c=>c.id===card.id),1);
      if(repeated){this.putDiscard(card);this.log(`${p.name}【不屈】展示的牌点数重复，未能阻止濒死。`,'danger');return false;}
      p.zhoutaiChuang.push(card);
      this.heal(p,1-p.hp);
      this.log(`${p.name}【不屈】将${C.suitMark[card.suit]}${C.rankMark(card.rank)}置为“创”，回复至1点体力。`,'heal');
      this.change();return true;
    };
    P.dying=async function(target,source){
      this._zhoutaiDyingDepth=(this._zhoutaiDyingDepth||0)+1;
      try{return await dying.call(this,target,source);}finally{this._zhoutaiDyingDepth--;}
    };

    P.cardsLost=function(p,before,reason){
      cardsLost.call(this,p,before,reason);
      if(!['discard','move'].includes(reason)||this._dynBatch||!before.some(c=>!p.hand.includes(c)))return;
      (this._zhoutaiFenjiEvents||(this._zhoutaiFenjiEvents=[])).push({id:p.id,generation:p.generation});
    };
    P.flushSkillEvents=async function(){
      await flush.call(this);
      if(this._flushingZhoutai||this.over)return;
      this._flushingZhoutai=true;
      try{while(this._zhoutaiFenjiEvents?.length&&!this.over){
        const event=this._zhoutaiFenjiEvents.shift(),target=this.get(event.id);
        if(!target?.alive||target.generation!==event.generation)continue;
        for(const owner of this.actionOrder(this.alive().filter(isZhoutai))){
          if(!owner.alive||owner.silenced||!target.alive||this.over)continue;
          const ally=this.hostility(owner,target)<-.5||owner.id===target.id;
          const useful=ally&&owner.hp>1&&(target.hand.length<5||owner.hp>2);
          const choice=await this.option(owner,`奋激：失去1点体力，令${target.name}摸两张牌？`,[
            {key:'yes',label:'发动奋激'},{key:'no',label:'不发动'}
          ],useful?'yes':'no');
          if(choice!=='yes')continue;
          await this.loseHp(owner,1,'奋激');
          if(owner.alive&&target.alive){this.draw(target,2);this.log(`${owner.name}发动【奋激】，令${target.name}摸两张牌。`,'draw');}
        }
      }}finally{this._flushingZhoutai=false;}
    };

    P.applyDamageHealth=function(source,target,amount,context){
      const old=target.hp;
      applyDamageHealth.call(this,source,target,amount,context);
      if(isZhoutai(source))context.zhoutaiDealt=Math.max(0,old-target.hp);
    };
    P.afterDamageEvent=async function(source,target,amount,context,generation){
      if(afterDamage)await afterDamage.call(this,source,target,amount,context,generation);
      if(!source?.alive||!isZhoutai(source)||!context?.zhoutaiDealt||!source.zhoutaiChuang.length)return;
      const lowest=source.zhoutaiChuang.reduce((a,b)=>b.rank<a.rank?b:a);
      source.zhoutaiChuang.splice(source.zhoutaiChuang.indexOf(lowest),1);
      this.gain(source,[lowest]);
      this.draw(source,2);
      this.log(`${source.name}【战意】造成伤害，获得点数最小的“创”${C.suitMark[lowest.suit]}${C.rankMark(lowest.rank)}，因减少一张“创”额外摸两张牌。`,'draw');
      this.change();
    };
    P.death=async function(p,source){
      if(p.zhoutaiChuang?.length)this.putDiscard(...p.zhoutaiChuang.splice(0));
      return death.call(this,p,source);
    };
    P.dynastyStates=function(p,compact=false){
      const result=states.call(this,p,compact);
      if(isZhoutai(p)){result.push(`创 ${p.zhoutaiChuang.length}`);if(!compact&&p.zhoutaiChuang.length)result.push('创点数 '+p.zhoutaiChuang.map(c=>C.rankMark(c.rank)).join('、'));}
      return result;
    };
  }
  const api={install};root.ZhenZhoutaiSkills=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
