(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,init=P.initExtra,setup=P.setup,flip=P.turnOver,flush=P.flushSkillEvents;
    const finished=P.damageFinished,active=P.activeSkills,prepare=P.prepareActive,ai=P.aiPlay,states=P.dynastyStates,risk=P.damageBenefitRisk;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'caopi');
    const label=t=>`${t.name} · ${t.id+1}号位 · ${t.turnedOver?'背面':'正面'}朝上 · 手牌${t.hand.length}`;
    P.initExtra=function(p){init.call(this,p);p.caopiGuweiRound=-1;p.caopiShouchanUsed=false;};
    P.setup=function(){setup.call(this);for(const p of this.players)if(p.general==='caopi'&&this.options.mode==='landlord'&&p.role==='地主')p.hp++;};
    // turnOver is synchronous throughout the engine. Capture eligible owners at
    // the actual flip, then resolve their optional choices at the next flush.
    P.turnOver=function(t){
      const before=t.turnedOver;flip.call(this,t);
      if(!t.alive||before===t.turnedOver||this.over)return;
      const owners=this.actionOrder(this.alive().filter(p=>p.id!==t.id&&owner(this,p)&&p.caopiGuweiRound!==this.round)).map(p=>({id:p.id,generation:p.generation}));
      if(owners.length)(this._caopiFlipEvents||(this._caopiFlipEvents=[])).push({round:this.round,target:t.id,generation:t.generation,owners});
    };
    P.flushSkillEvents=async function(){
      if(this._flushingCaopi)return flush.call(this);
      this._flushingCaopi=true;
      try{
        await flush.call(this);
        while(this._caopiFlipEvents?.length&&!this.over){
          const e=this._caopiFlipEvents.shift(),target=this.get(e.target);
          if(e.round!==this.round||!target||target.generation!==e.generation)continue;
          for(const o of e.owners){
            const p=this.get(o.id);
            if(!owner(this,p)||p.generation!==o.generation||p.caopiGuweiRound===e.round||this.over)continue;
            const opts=[{key:'draw',label:'摸两张牌'},...(p.hp<p.maxHp?[{key:'heal',label:'回复1点体力'}]:[]),{key:'pass',label:'不发动固位'}];
            const k=await this.option(p,`固位：${target.name}翻面后，选择一项`,opts,p.hp<p.maxHp&&p.hp<=2?'heal':'draw','每轮限一次。翻至背面、翻回正面均可触发；自己的翻面不触发。');
            if(!owner(this,p)||p.generation!==o.generation||p.caopiGuweiRound===e.round||this.over)continue;
            if(k!=='draw'&&!(k==='heal'&&p.hp<p.maxHp))continue;
            p.caopiGuweiRound=e.round;
            if(k==='heal'){this.heal(p,1);this.log(`${p.name}发动【固位】，回复1点体力。`,'heal');}
            else{this.draw(p,2);this.log(`${p.name}发动【固位】，摸两张牌。`,'draw');}
            this.change();await flush.call(this);
          }
        }
        if(this.over)this._caopiFlipEvents=[];
      }finally{this._flushingCaopi=false;}
    };
    P.caopiFangzhuScore=function(p,t){
      const h=this.hostility(p,t),x=Math.max(0,p.maxHp-p.hp);
      if(h<-.5)return t.turnedOver?8+x*2:-5;
      if(h>.5)return t.turnedOver?-8-x:6-x*1.5+(t.hand.length>=3?1:0);
      return -1;
    };
    P.caopiFangzhu=async function(p){
      if(!owner(this,p)||this.over)return;
      const candidates=this.alive().filter(t=>t.id!==p.id);if(!candidates.length)return;
      const best=[...candidates].sort((a,b)=>this.caopiFangzhuScore(p,b)-this.caopiFangzhuScore(p,a))[0];
      const id=await this.option(p,'放逐：选择一名其他角色，或不发动',[...candidates.map(t=>({key:String(t.id),label:label(t)})),{key:'pass',label:'不发动放逐'}],this.caopiFangzhuScore(p,best)>0?String(best.id):'pass',`目标摸X张牌，然后翻面；当前X=${Math.max(0,p.maxHp-p.hp)}。一次伤害事件只发动一次。`);
      const t=candidates.find(t=>String(t.id)===id);
      if(!owner(this,p)||!t?.alive||this.over)return;
      const x=Math.max(0,p.maxHp-p.hp);
      this.log(`${p.name}发动【放逐】，令${t.name}摸${x}张牌，然后翻面。`,'system');
      this.draw(t,x);await this.flushSkillEvents();
      if(t.alive&&!this.over){this.turnOver(t);await this.flushSkillEvents();}
      this.change();
    };
    // This hook runs after dying/rescue, so a dead Cao Pi cannot use Fangzhu.
    P.damageFinished=async function(source,target,amount,context,generation){
      await finished.call(this,source,target,amount,context,generation);
      if(amount>0&&owner(this,target)&&target.generation===generation&&!this.over)await this.caopiFangzhu(target);
    };
    P.caopiShouchanReady=function(p){return owner(this,p)&&!this.over&&!p.caopiShouchanUsed&&this.isPlayPhaseOwner(p)&&this.alive().some(t=>t.id!==p.id&&t.turnedOver);};
    P.caopiShouchanScore=function(p,t){
      const h=this.hostility(p,t);
      return h<-.5?5+(t.hand.length?1:0):h>.5?t.hand.length*2-4:-2;
    };
    P.caopiShouchan=async function(p){
      if(!this.caopiShouchanReady(p))return;
      const targets=this.alive().filter(t=>t.id!==p.id&&t.turnedOver),best=[...targets].sort((a,b)=>this.caopiShouchanScore(p,b)-this.caopiShouchanScore(p,a))[0];
      const id=await this.option(p,'受禅：选择一名背面朝上的其他角色',[...targets.map(t=>({key:String(t.id),label:label(t)})),{key:'cancel',label:'取消受禅'}],String(best.id),'限定技：获得其全部手牌，然后令其翻回正面；空手牌角色也可以选择。');
      const t=targets.find(t=>String(t.id)===id);
      if(!this.caopiShouchanReady(p)||!t?.alive||!t.turnedOver)return;
      p.caopiShouchanUsed=true;
      const cards=this.moveBatch(t,()=>[...t.hand].map(c=>this.removeOwned(t,c.id).card));
      this.gain(p,cards);this.log(`${p.name}发动限定技【受禅】，${t.name}将全部${cards.length}张手牌交给其，然后翻面。`,'system');
      await this.flushSkillEvents();
      if(t.alive&&!this.over){this.turnOver(t);await this.flushSkillEvents();}
      this.change();
    };
    P.activeSkills=function(p){const list=active.call(this,p);if(owner(this,p))list.push({key:'caopi_shouchan',name:'受禅',detail:p.caopiShouchanUsed?'限定技已使用':'限定技 · 收取全部手牌，再翻回正面',ready:this.caopiShouchanReady(p),reason:p.caopiShouchanUsed?'限定技已使用':'须在自己的出牌阶段，且有背面朝上的其他角色'});return list;};
    P.prepareActive=async function(p,a){if(a.skill==='caopi_shouchan'){await this.caopiShouchan(p);return null;}return prepare.call(this,p,a);};
    P.aiPlay=function(p,actions){const skill=actions.find(a=>a.skill==='caopi_shouchan');if(skill&&this.alive().some(t=>t.id!==p.id&&t.turnedOver&&this.caopiShouchanScore(p,t)>0))return skill;return ai.call(this,p,actions.filter(a=>a.skill!=='caopi_shouchan'));};
    P.damageBenefitRisk=function(t){const n=risk.call(this,t);return owner(this,t)&&t.hp>1?Math.max(n,3):n;};
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(p.general==='caopi')out.push(`放逐 · X=${Math.max(0,p.maxHp-p.hp)}`,`固位 · 本轮${p.caopiGuweiRound===this.round?'已用':'可用'}`,`受禅 · ${p.caopiShouchanUsed?'已使用':'未使用'}`);return out;};
  }
  const api={install};root.ZhenCaopiSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
