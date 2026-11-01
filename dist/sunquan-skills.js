(function(root){
  'use strict';
  function install(Game){
    const P=Game.prototype,distance=P.distance;
    P.sunquanLordDistanceBonus=function(p){
      if(this.options.mode!=='identity'||p?.role!=='主公'||!this.isGeneral(p,'jiesunquan'))return 0;
      return this.alive().filter(t=>t.id!==p.id&&this.general(t).faction==='吴').length;
    };
    P.distance=function(from,to){
      const base=distance.call(this,from,to);
      return from.id===to.id?base:base+this.sunquanLordDistanceBonus(to);
    };
  }
  const api={install};root.ZhenSunquanSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
