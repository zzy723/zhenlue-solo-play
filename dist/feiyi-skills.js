(function(root){
  'use strict';
  function install(Game){
    const P=Game.prototype,yanru=P.yanru;
    P.yanru=async function(p){
      const used=p.yanruUsed.length,generation=p.generation;
      await yanru.call(this,p);
      if(p.yanruUsed.length===used)return;
      await this.flushSkillEvents();
      if(this.over||!p.alive||p.generation!==generation||!this.isGeneral(p,'feiyi'))return;
      const targets=this.alive().filter(t=>t.id!==p.id);
      if(!targets.length)return;
      const friend=targets.filter(t=>this.hostility(p,t)<-.5).sort((a,b)=>a.hand.length-b.hand.length)[0];
      const key=await this.option(p,'晏如：可令一名其他角色摸一张牌',[
        ...targets.map(t=>({key:String(t.id),label:`${t.name} · ${t.id+1}号位 · 手牌${t.hand.length}`})),
        {key:'pass',label:'不发动额外摸牌'}
      ],friend?String(friend.id):'pass','本次晏如的换牌结算已完成。每次发动结算后均可选择，奇数、偶数各一次，出牌阶段最多两次。');
      const target=targets.find(t=>String(t.id)===key);
      if(!target?.alive||!p.alive||p.generation!==generation||this.over)return;
      this.log(`${p.name}【晏如】结算后，令${target.name}摸一张牌。`,'system');
      this.draw(target,1);
      await this.flushSkillEvents();
    };
  }
  const api={install};root.ZhenFeiyiSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
