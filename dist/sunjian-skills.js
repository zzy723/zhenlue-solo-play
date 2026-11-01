(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,old={};
    for(const key of ['canSlash','discardPhase','preparationSkills','afterDamageEvent','damageFinished'])old[key]=P[key];
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'sunjian');
    const same=(p,generation)=>p?.alive&&p.generation===generation;
    const cheap=(g,p,cards)=>[...cards].sort((a,b)=>g.value(a,p)-g.value(b,p));
    P.canSlash=function(p,t){
      return !!(owner(this,p)&&t?.alive&&p.id!==t.id&&t.hp>=p.hp)||old.canSlash.call(this,p,t);
    };
    P.sunjianYinghun=async function(p,trigger='preparation'){
      if(!owner(this,p)||p.hp>=p.maxHp||this.over)return;
      const generation=p.generation,x=p.maxHp-p.hp,targets=this.alive().filter(t=>trigger!=='damage'||t.id!==p.id);
      if(!targets.length)return;
      const friends=targets.filter(t=>t.id===p.id||this.hostility(p,t)<-.5).sort((a,b)=>a.hand.length-b.hand.length);
      const enemies=targets.filter(t=>t.id!==p.id&&this.hostility(p,t)>.5).sort((a,b)=>this.owned(b).length-this.owned(a).length);
      const preferred=(x>=2?friends[0]:enemies[0])||targets.find(t=>t.id===p.id)||targets[0];
      const id=await this.option(p,'英魂：选择一名角色',targets.map(t=>({key:String(t.id),label:`${t.name} · 手牌${t.hand.length}${t.id===p.id?'（自己）':''}`})).concat({key:'pass',label:'不发动英魂'}),String(preferred.id));
      if(id==='pass'||!owner(this,p)||!same(p,generation)||this.over)return;
      const target=this.get(Number(id));if(!targets.includes(target)||!target.alive)return;
      const targetGeneration=target.generation,support=target.id===p.id||this.hostility(p,target)<0;
      const mode=await this.option(p,'英魂：选择摸牌与弃牌方式',[{key:'support',label:`摸${x}张牌，然后弃一张牌`},{key:'pressure',label:`摸一张牌，然后弃${x}张牌`}],support?'support':'pressure');
      if(!['support','pressure'].includes(mode)||!owner(this,p)||!same(p,generation)||!same(target,targetGeneration)||this.over)return;
      const draw=mode==='support'?x:1,discard=mode==='support'?1:x;
      this.log(`${p.name}发动【英魂】，令${target.name}摸${draw}张牌后弃${discard}张牌（X=${x}）。`,'system');
      this.draw(target,draw);await this.flushSkillEvents();
      if(!same(target,targetGeneration)||this.over)return;
      const pool=this.owned(target),n=Math.min(discard,pool.length);
      if(n){
        const ids=await this.selectCards(target,`英魂：弃置${n}张牌`,pool,n,n,cheap(this,target,pool).slice(0,n).map(c=>c.id),'可弃置手牌或装备区的牌，不包括判定区。');
        if(same(target,targetGeneration)&&!this.over)this.discardOwned(target,ids.filter(id=>this.owned(target).some(c=>c.id===id)));
        await this.flushSkillEvents();
      }
      this.change();
    };
    P.preparationSkills=async function(p){
      await old.preparationSkills.call(this,p);if(!this.turnInterrupted)await this.sunjianYinghun(p);
    };
    P.afterDamageEvent=async function(source,target,amount,context,generation){
      const attack=this._sunjianPolu;
      // Match the particular card, so a counterattack or a blade follow-up cannot end this phase.
      if(amount>0&&attack&&source?.id===attack.id&&source.generation===attack.generation&&context?.card?.sunjianPoluToken===attack.token)attack.hit=true;
      await old.afterDamageEvent?.call(this,source,target,amount,context,generation);
    };
    P.damageFinished=async function(source,target,amount,context,generation){
      await old.damageFinished.call(this,source,target,amount,context,generation);
      // Resolve dying/rescue first, as with the other skills triggered after taking damage.
      if(amount>0&&same(target,generation))await this.sunjianYinghun(target,'damage');
    };
    P.sunjianPolu=async function(p){
      if(!owner(this,p)||this.over||this.turnInterrupted)return false;
      const generation=p.generation,targets=this.alive().filter(t=>this.canSlash(p,t));
      if(!targets.length)return false;
      const cards=cheap(this,p,p.hand.filter(c=>C.isSlash(c)&&this.allowedUse(p,c)));
      const spear=p.equip.weapon?.key==='spear'?this.spearCards(p):[];
      if(!cards.length&&spear.length<2)return false;
      const enemy=targets.filter(t=>this.hostility(p,t)>.5).sort((a,b)=>Number(!!this.chengongProtected?.(a))-Number(!!this.chengongProtected?.(b))||a.hp-b.hp||a.hand.length-b.hand.length)[0];
      const options=cards.map(c=>({key:c.id,label:`使用【${c.name}】`,card:c}));
      if(spear.length>=2)options.push({key:'spear',label:'丈八蛇矛：两张手牌当杀'});
      options.push({key:'pass',label:'不发动破虏'});
      const id=await this.option(p,'破虏：弃牌阶段开始，使用一张杀？',options,enemy&&!this.chengongProtected?.(enemy)?cards[0]?.id||'spear':'pass','此杀遵循正常距离规则；造成伤害后结束本次弃牌阶段。');
      if(id==='pass'||!owner(this,p)||!same(p,generation)||this.over||this.turnInterrupted)return false;
      const available=this.alive().filter(t=>this.canSlash(p,t));if(!available.length)return false;
      const targetId=await this.option(p,'破虏：选择杀的目标',available.map(t=>({key:String(t.id),label:`${t.name} · ${t.hp}体力`})).concat({key:'cancel',label:'取消'}),String((available.includes(enemy)?enemy:available[0]).id));
      if(targetId==='cancel')return false;
      const target=this.get(Number(targetId)),targetGeneration=target?.generation;
      if(!available.includes(target))return false;
      let costs;
      if(id==='spear'){
        const pool=p.equip.weapon?.key==='spear'?this.spearCards(p):[];if(pool.length<2)return false;
        costs=await this.selectCards(p,'破虏·丈八蛇矛：选择两张手牌',pool,2,2,cheap(this,p,pool).slice(0,2).map(c=>c.id));
      }
      if(!owner(this,p)||!same(p,generation)||!same(target,targetGeneration)||!this.canSlash(p,target)||this.over||this.turnInterrupted)return false;
      let raw;
      if(id==='spear'){
        if(p.equip.weapon?.key!=='spear'||costs.length!==2||new Set(costs).size!==2||!costs.every(cid=>this.spearCards(p).some(c=>c.id===cid)))return false;
        const physical=costs.map(cid=>p.hand.find(c=>c.id===cid));
        const card={...C.defs.slash,id:`polu-spear-${physical[0].id}`,virtual:true,costs:physical,suit:physical.every(C.isRed)?'H':physical.every(c=>['S','C'].includes(c.suit))?'S':'N',rank:0};
        if(!this.allowedUse(p,card))return false;
        costs.forEach(cid=>this.removeHand(p,cid));raw=card;
      }else{
        const card=p.hand.find(c=>c.id===id);if(!card||!C.isSlash(card)||!this.allowedUse(p,card))return false;
        raw=this.removeHand(p,id);
      }
      this._sunjianPoluSerial=(this._sunjianPoluSerial||0)+1;
      const attack={id:p.id,generation,token:`${this.totalTurns}:${p.id}:${this._sunjianPoluSerial}`,hit:false},previous=this._sunjianPolu;
      this._sunjianPolu=attack;
      this.log(`${p.name}发动【破虏】，对${target.name}使用【${raw.name}】。`,'use');
      this.sound('card',{playerId:p.id,cardKey:raw.key,kind:raw.kind});
      try{await this.declaredSlash(p,target,{...raw,noQuota:true,sunjianPoluToken:attack.token});await this.flushSkillEvents();}
      finally{this._sunjianPolu=previous;}
      if(attack.hit&&same(p,generation)){
        this.log(`${p.name}【破虏】的杀造成伤害，结束本次弃牌阶段。`,'system');this.change();return true;
      }
      return false;
    };
    // Installed before 乱政: its wrapper still records completion and runs phase-end effects.
    P.discardPhase=async function(p){
      const generation=p.generation;
      if(await this.sunjianPolu(p)||!same(p,generation)||this.over||this.turnInterrupted)return;
      return old.discardPhase.call(this,p);
    };
  }
  const api={install};root.ZhenSunjianSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
