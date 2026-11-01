(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,init=P.initExtra,drawPhase=P.drawPhaseCards,handChanged=P.handChanged,flush=P.flushSkillEvents,states=P.dynastyStates;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'zhangliao');
    const label=t=>`${t.name} · ${t.id+1}号位 · 手牌${t.hand.length}`;
    P.initExtra=function(p){init.call(this,p);p.zhangliaoZhitiRound=-1;p.zhangliaoZhitiCount=0;};
    P.zhangliaoZhitiUsed=function(p){return p.zhangliaoZhitiRound===this.round?p.zhangliaoZhitiCount||0:0;};
    P.zhangliaoSteal=async function(p,t,skill){
      if(!owner(this,p)||!t?.alive||!t.hand.length||this.over)return;
      const card=t.hand[Math.floor(this.random()*t.hand.length)];
      const cards=this.moveBatch(t,()=>[this.removeOwned(t,card.id).card]);
      this.gain(p,cards);this.log(`${p.name}【${skill}】随机获得${t.name}的一张手牌。`,'system');this.change();
    };
    P.drawPhaseCards=async function(p,n){
      if(!owner(this,p)||n<1)return drawPhase.call(this,p,n);
      const candidates=this.alive().filter(t=>t.id!==p.id&&t.hand.length),max=Math.min(Math.floor(n),candidates.length);
      if(!max)return drawPhase.call(this,p,n);
      const enemies=candidates.filter(t=>this.hostility(p,t)>0).sort((a,b)=>b.hand.length-a.hand.length);
      const count=Number(await this.option(p,'突袭：少摸几张牌？',Array.from({length:max+1},(_,i)=>({key:String(i),label:i?`少摸${i}张，选择${i}名不同角色`:'不发动，正常摸牌'})),String(Math.min(max,enemies.length)),`本次应摸${n}张；每少摸一张，随机获得一名其他角色的一张手牌。`));
      if(!Number.isInteger(count)||count<1||count>max)return drawPhase.call(this,p,n);
      const chosen=[];
      for(let i=0;i<count;i++){
        const remaining=candidates.filter(t=>t.alive&&t.hand.length&&!chosen.includes(t.id));
        if(!remaining.length)break;
        const preferred=remaining.find(t=>enemies.includes(t))||remaining[0];
        const id=await this.option(p,`突袭：选择第${i+1}/${count}名角色`,remaining.map(t=>({key:String(t.id),label:label(t)})),String(preferred.id),'每名角色只能选择一次，每名角色只获得一张手牌。');
        const target=remaining.find(t=>String(t.id)===id);if(!target)return;
        chosen.push(target.id);
      }
      this.log(`${p.name}发动【突袭】，少摸${chosen.length}张牌。`,'system');
      await drawPhase.call(this,p,n-chosen.length);
      for(const id of chosen){await this.zhangliaoSteal(p,this.get(id),'突袭');await this.flushSkillEvents();}
    };
    P.handChanged=function(p,before){
      handChanged.call(this,p,before);
      // Capture the recipient's phase and eligible owners at the time of the gain.
      // Opening hands/mulligans are setup, before the first character turn.
      if(this.totalTurns<1||!p.alive||p.hand.length<=before||this._batchHands||this.turn===p.id&&this.phase==='摸牌')return;
      const owners=this.actionOrder(this.alive().filter(t=>t.id!==p.id&&owner(this,t)&&this.zhangliaoZhitiUsed(t)<3)).map(t=>({id:t.id,generation:t.generation}));
      if(owners.length)(this._zhangliaoEvents||(this._zhangliaoEvents=[])).push({id:p.id,generation:p.generation,turn:this.totalTurns,round:this.round,owners});
    };
    P.flushSkillEvents=async function(){
      if(this._flushingZhangliao)return flush.call(this);
      this._flushingZhangliao=true;
      try{
        await flush.call(this);
        while(this._zhangliaoEvents?.length&&!this.over){
          const e=this._zhangliaoEvents.shift(),t=this.get(e.id);
          if(!t?.alive||t.generation!==e.generation||e.turn!==this.totalTurns||e.round!==this.round)continue;
          for(const o of e.owners){
            const p=this.get(o.id);
            if(!owner(this,p)||p.generation!==o.generation||this.zhangliaoZhitiUsed(p)>=3||!t.alive||!t.hand.length||this.over)continue;
            const used=this.zhangliaoZhitiUsed(p);
            const yes=await this.option(p,`止啼：随机获得${label(t)}的一张手牌？`,[{key:'yes',label:'发动止啼'},{key:'no',label:'不发动'}],this.hostility(p,t)>0?'yes':'no',`每轮限3次，本轮已用${used}/3次；随机获得该角色的一张现有手牌，不限于其刚获得的牌。`);
            if(yes!=='yes')continue;
            p.zhangliaoZhitiRound=this.round;p.zhangliaoZhitiCount=used+1;
            await this.zhangliaoSteal(p,t,'止啼');
            await flush.call(this);
          }
        }
        if(this.over)this._zhangliaoEvents=[];
      }finally{this._flushingZhangliao=false;}
    };
    // Resolve queued gains before these methods build response/selection menus.
    // Otherwise 止啼 can remove a card after an older menu already offered it.
    for(const name of ['trickAllowed','response','dying','discardPhase']){
      const previous=P[name];
      P[name]=async function(...args){await this.flushSkillEvents();return previous.apply(this,args);};
    }
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(p.general==='zhangliao')out.push(`止啼 · 本轮${this.zhangliaoZhitiUsed(p)}/3`);return out;};
  }
  const api={install};root.ZhenZhangliaoSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
