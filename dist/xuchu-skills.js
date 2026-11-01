(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,old={};
    for(const key of ['initExtra','handChanged','physicalCard','legalActions','removeHand','response','preparationSkills','drawPhaseCards','slashAvailable','markCardUse','cardTags','dynastyStates'])old[key]=P[key];
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'xuchu');
    const same=(p,generation)=>p?.alive&&p.generation===generation;
    const face=new Set(['key','name','kind','text','nature','slot','range','xuchuArmor']);
    P.initExtra=function(p){old.initExtra.call(this,p);p.xuchuLuoyi=false;p.xuchuHuchiTurn=-1;p.xuchuSlashTurn=-1;};
    // Keep the printed card in allCards; the hand contains its compulsory Slash face.
    // This also makes all existing hand filters, response menus and AI see a basic Slash.
    P.physicalCard=function(c){
      if(!c?.xuchuArmor)return old.physicalCard.call(this,c);
      const raw=this.allCards.find(x=>x.id===c.id);
      if(!raw)return c;
      for(const [key,value] of Object.entries(c))if(!face.has(key))raw[key]=value;
      return raw;
    };
    P.xuchuSyncHand=function(p){
      for(let i=0;i<p.hand.length;i++){
        const c=p.hand[i];
        if(p.general!=='xuchu'){if(c.xuchuArmor)p.hand[i]=this.physicalCard(c);continue;}
        if(c.xuchuArmor||c.kind!=='equip'||c.slot!=='armor')continue;
        const slash={...c,...C.defs.slash,xuchuArmor:true};delete slash.slot;delete slash.range;
        p.hand[i]=slash;
      }
    };
    P.handChanged=function(p,before){this.xuchuSyncHand(p);return old.handChanged.call(this,p,before);};
    P.legalActions=function(p){this.xuchuSyncHand(p);return old.legalActions.call(this,p);};
    P.removeHand=function(p,id){this.xuchuSyncHand(p);return old.removeHand.call(this,p,id);};
    P.response=async function(p,...args){this.xuchuSyncHand(p);return old.response.call(this,p,...args);};
    P.xuchuLuoyiActive=function(p){return !!p?.alive&&p.general==='xuchu'&&p.xuchuLuoyi;};
    P.preparationSkills=async function(p){
      // A face-down skipped turn never reaches this method: the buff lasts until
      // the next actual preparation phase, including any intervening extra turns.
      if(p.xuchuLuoyi){p.xuchuLuoyi=false;this.log(`${p.name}的【裸衣】效果于准备阶段开始时结束。`,'system');}
      return old.preparationSkills.call(this,p);
    };
    P.drawPhaseCards=async function(p,n){
      if(!owner(this,p)||this.over)return old.drawPhaseCards.call(this,p,n);
      const generation=p.generation;
      const yes=await this.option(p,'裸衣：放弃摸牌，观看牌堆顶三张牌？',[
        {key:'yes',label:'发动裸衣'},{key:'no',label:'正常摸牌'}
      ],'yes','获得其中所有非锦囊牌，其余弃置；直到下个准备阶段，杀次数+1，每回合首次使用的杀不可响应，自己使用杀或决斗造成的伤害+1。');
      if(yes!=='yes')return old.drawPhaseCards.call(this,p,n);
      if(!owner(this,p)||!same(p,generation)||this.over)return;
      p.xuchuLuoyi=true;
      const top=[];
      for(let i=0;i<3;i++){const c=this.takeTop();if(c){top.push(c);this.table.push(c);}}
      const obtained=top.filter(c=>!['trick','delay'].includes(c.kind));
      try{
        if(top.length)await this.choose(p,{kind:'options',title:'裸衣：观看牌堆顶三张牌',
          detail:'获得基本牌及装备牌，普通锦囊和延时锦囊置入弃牌堆。',revealedCards:top,
          options:[{key:'ok',label:'确认获得非锦囊牌'}]},()=> 'ok');
        if(same(p,generation)&&!this.over){
          this.table=this.table.filter(c=>!obtained.some(x=>x.id===c.id));this.gain(p,obtained);
          this.log(`${p.name}发动【裸衣】，观看${top.length}张牌，获得${obtained.length}张非锦囊牌，其余弃置。`,'draw');
        }
      }finally{for(const c of top)if(this.table.some(x=>x.id===c.id))this.drop(c);}
      await this.flushSkillEvents();this.change();
    };
    P.slashAvailable=function(p){
      return old.slashAvailable.call(this,p)||this.xuchuLuoyiActive(p)&&p.slashUsed<2+(this.options.mode==='landlord'&&p.role==='地主'?1:0);
    };
    P.markCardUse=async function(p,c,targets){
      // Count uses, including out-of-turn and no-quota Slashes. Playing a Slash
      // in response does not reach this hook; all targets share the same card.
      const first=p.general==='xuchu'&&C.isSlash(c)&&p.xuchuSlashTurn!==this.totalTurns;
      if(p.general==='xuchu'&&C.isSlash(c))p.xuchuSlashTurn=this.totalTurns;
      if(first&&this.xuchuLuoyiActive(p)){
        c.unrespondable=true;
        this.log(`${p.name}【裸衣】令本回合首次使用的【${c.name}】不可响应。`,'system');
      }
      return old.markCardUse.call(this,p,c,targets);
    };
    P.xuchuBoostDamage=function(source,amount,context){
      const c=context.card;
      if(amount>0&&!context.chain&&!context.xuchuTransferred&&this.xuchuLuoyiActive(source)&&c&&
        (C.isSlash(c)||c.key==='duel')&&(c.ownerId==null||c.ownerId===source.id)&&
        (c.sourceGeneration==null||c.sourceGeneration===source.generation)){
        this.log(`${source.name}【裸衣】令${c.name}造成的伤害+1。`,'damage');return amount+1;
      }
      return amount;
    };
    P.xuchuProtectWorth=function(p,target,amount){
      if(this.hostility(p,target)>=-.5)return false;
      if(this.chengongProtected?.(p)||p.armor>0)return true;
      const rescue=p.hand.some(c=>c.key==='peach'||c.key==='wine');
      if(p.hp<=1&&!rescue)return target.role==='主公'&&target.hp<=amount;
      return target.hp<=amount||p.hp>=target.hp&&p.hp>=2;
    };
    P.xuchuProtectDamage=async function(source,target,amount,nature,context){
      const targetGeneration=target.generation;
      const guards=this.actionOrder(this.alive().filter(p=>p.id!==target.id&&owner(this,p)&&p.xuchuHuchiTurn!==this.totalTurns));
      for(const p of guards){
        if(amount<=0||!same(target,targetGeneration)||this.over)break;
        if(!owner(this,p)||p.xuchuHuchiTurn===this.totalTurns)continue;
        const generation=p.generation;
        const yes=await this.option(p,`虎痴：替${target.name}承受其中1点伤害？`,[
          {key:'yes',label:'替其承受1点伤害，然后摸一张牌'},{key:'no',label:'不发动'}
        ],()=>this.xuchuProtectWorth(p,target,amount)?'yes':'no',`每回合限一次；伤害来源：${source?.name||'无'}。`);
        if(yes!=='yes'||!owner(this,p)||!same(p,generation)||p.xuchuHuchiTurn===this.totalTurns||!same(target,targetGeneration)||this.over)continue;
        p.xuchuHuchiTurn=this.totalTurns;amount--;
        this.log(`${p.name}发动【虎痴】，将${target.name}受到的1点伤害转移给自己。`,'damage');this.evidence(p,target,true);
        // The source, card and nature are preserved. Source damage bonuses have
        // already been applied; recipient effects and normal dying still resolve.
        await this.damage(source,p,1,nature,{...context,xuchuTransferred:true});
        // If this point consumed a pending 犄角 charge, the remainder must not
        // consume/log it again. A prevented point leaves the charge pending.
        context.chengongJijiaoOwners=(context.chengongJijiaoOwners||[]).filter(e=>this.get(e.id)?.chengongJijiao[e.sourceId]!==e.round);
        if(same(p,generation)&&!this.over){this.draw(p,1);await this.flushSkillEvents();}
      }
      return same(target,targetGeneration)&&!this.over?amount:0;
    };
    P.cardTags=function(p,c){const out=old.cardTags.call(this,p,c);if(c.xuchuArmor)out.push('防具视为杀');return out;};
    P.dynastyStates=function(p,compact=false){
      const out=old.dynastyStates.call(this,p,compact);
      if(p.general==='xuchu'){
        if(this.xuchuLuoyiActive(p))out.push(`裸衣 · 杀次数+1 · 首杀不可响应${p.xuchuSlashTurn===this.totalTurns?'已用':'可用'} · 杀/决斗伤害+1 · 至下个准备阶段`);
        out.push(`虎痴 · 本回合${p.xuchuHuchiTurn===this.totalTurns?'已用':'可用'}`);
      }
      return out;
    };
  }
  const api={install};root.ZhenXuchuSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
