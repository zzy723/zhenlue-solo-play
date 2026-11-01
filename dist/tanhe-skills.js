(function(root){
  'use strict';
  function install(Game){
    const P=Game.prototype,init=P.initExtra,active=P.activeSkills,ai=P.aiPlay,prepare=P.prepareActive,states=P.dynastyStates;
    const eligible=(g,p)=>p?.alive&&g.options.mode==='identity'&&['忠臣','内奸'].includes(p.role);
    P.initExtra=function(p){init.call(this,p);p.tanheUsed=false;};
    P.activeSkills=function(p){const list=active.call(this,p);
      if(eligible(this,p))list.push({key:'tanhe',name:'弹劾',detail:'限定技 · 对一名角色造成1点伤害',ready:!p.tanheUsed&&this.isPlayPhaseOwner(p)&&this.alive().some(t=>t.id!==p.id),reason:p.tanheUsed?'本局已发动':null});
      return list;
    };
    P.prepareActive=async function(p,a){if(a.skill!=='tanhe')return prepare.call(this,p,a);
      if(!eligible(this,p)||p.tanheUsed||!this.isPlayPhaseOwner(p))return null;
      const targets=this.alive().filter(t=>t.id!==p.id);if(!targets.length)return null;
      const best=[...targets].sort((a,b)=>this.hostility(p,b)-this.hostility(p,a)||a.hp-b.hp)[0];
      const id=await this.option(p,'弹劾：选择受到1点伤害的角色',[...targets.map(t=>({key:String(t.id),label:`${t.name} · ${t.hp}血`})),{key:'cancel',label:'取消'}],String(best.id));
      if(id==='cancel')return null;const target=this.get(Number(id));if(!target?.alive||target.id===p.id)return null;
      p.tanheUsed=true;this.log(`${p.name}发动限定技【弹劾】，对${target.name}造成1点伤害。`,'use');await this.damage(p,target,1,'normal',{skill:'tanhe'});this.change();return null;
    };
    P.aiPlay=function(p,actions){const rest=ai.call(this,p,actions.filter(a=>a.skill!=='tanhe'));
      const tanhe=actions.find(a=>a.skill==='tanhe');if(!tanhe||!eligible(this,p))return rest;
      const enemy=this.alive().filter(t=>t.id!==p.id&&this.hostility(p,t)>0.5).sort((a,b)=>a.hp-b.hp)[0];
      return enemy&&(enemy.hp<=1||rest.type==='end'&&enemy.hp<=2)?tanhe:rest;
    };
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(eligible(this,p))out.push(`弹劾 · ${p.tanheUsed?'已用':'未用'}`);return out;};
  }
  const api={install};root.ZhenTanheSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
