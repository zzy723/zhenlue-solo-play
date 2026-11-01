(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,init=P.initExtra,play=P.playStartSkills,mark=P.markCardUse,after=P.afterCardUse;
    const handChanged=P.handChanged,limit=P.handLimit,end=P.turnEndSkills,tags=P.cardTags,states=P.dynastyStates;
    const health=P.applyDamageHealth,damaged=P.afterDamageEvent,active=P.activeSkills,prepare=P.prepareActive,ai=P.aiPlay;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'luxun');
    const same=(p,n)=>!!p?.alive&&p.generation===n;
    const uses=new WeakMap();
    P.luxunLaoCount=function(p){return Math.max(0,Math.floor(Number(p?.luxunLao)||0));};
    P.initExtra=function(p){init.call(this,p);Object.assign(p,{luxunLao:0,luxunDaibianTurn:-1,luxunFreeCards:[],luxunNonEquipCount:0,luxunPlaySerial:0,luxunFenyingUsed:false});};
    P.playStartSkills=async function(p){p.luxunNonEquipCount=0;p.luxunPlaySerial++;p.luxunFenyingUsed=false;return play.call(this,p);};
    P.markCardUse=async function(p,c,ts){
      // Reserve the ordinal before nested card uses can start resolving.
      const frame={turn:this.totalTurns,generation:p.generation,second:this.isPlayPhaseOwner(p)&&c.kind!=='equip'&&++p.luxunNonEquipCount===2};
      const stack=uses.get(c)||[];stack.push(frame);uses.set(c,stack);
      return mark.call(this,p,c,ts);
    };
    P.afterCardUse=async function(p,c,ts){
      const stack=uses.get(c),frame=stack?.pop();if(!stack?.length)uses.delete(c);
      await after.call(this,p,c,ts);
      if(!frame?.second||frame.turn!==this.totalTurns||!same(p,frame.generation)||this.over||this.turnInterrupted)return;
      for(const watcher of this.actionOrder(this.alive().filter(t=>t.id!==p.id&&owner(this,t)&&t.luxunDaibianTurn!==this.totalTurns))){
        const generation=watcher.generation;
        const key=await this.option(watcher,`待变：${p.name}的第2张非装备牌已结算，是否发动？`,[{key:'yes',label:'摸一张牌，横置使用者并增加一个劳'},{key:'no',label:'不发动'}],this.luxunAIDaibianWorth(watcher,p)?'yes':'no','此牌直到你的下个回合结束不计入手牌上限；劳可以叠加，受到属性伤害时清空。');
        if(key!=='yes'||!same(watcher,generation)||!owner(this,watcher)||!same(p,frame.generation)||this.over)continue;
        watcher.luxunDaibianTurn=this.totalTurns;
        const before=new Set(watcher.hand.map(x=>x.id));this.draw(watcher,1);
        for(const card of watcher.hand)if(!before.has(card.id))watcher.luxunFreeCards.push({id:card.id,until:watcher.turns+1});
        if(!p.chained){p.chained=true;this.huanggaiChainChanged?.(p,true);}p.luxunLao=this.luxunLaoCount(p)+1;
        this.log(`${watcher.name}发动【待变】，摸一张暂不计入手牌上限的牌，横置${p.name}并增加一个“劳”（现有${p.luxunLao}个）。`,'draw');
        await this.flushSkillEvents();this.change();
      }
    };
    P.handChanged=function(p,before){handChanged.call(this,p,before);if(p.luxunFreeCards)p.luxunFreeCards=p.luxunFreeCards.filter(m=>p.hand.some(c=>c.id===m.id));};
    P.luxunExemptCards=function(p){return p.hand.filter(c=>p.luxunFreeCards?.some(m=>m.id===c.id&&p.turns<=m.until));};
    P.handLimit=function(p){return limit.call(this,p)+this.luxunExemptCards(p).length;};
    P.discardPhaseCards=function(p){const free=new Set(this.luxunExemptCards(p).map(c=>c.id));return p.hand.filter(c=>!free.has(c.id));};
    P.turnEndSkills=async function(){
      await end.call(this);
      const p=this.get(this.turn);if(p?.luxunFreeCards?.length){p.luxunFreeCards=p.luxunFreeCards.filter(m=>p.turns<m.until);this.change();}
    };
    P.cardTags=function(p,c){const out=tags.call(this,p,c);if(this.luxunExemptCards(p).some(x=>x.id===c.id))out.push('待变·不计上限');return out;};
    P.applyDamageHealth=function(s,t,n,context){
      context.luxunDamageSourceGeneration=s?.generation;
      if(n>0&&context.luxunDamageNature&&context.luxunDamageNature!=='normal'&&this.luxunLaoCount(t)>0){
        const count=this.luxunLaoCount(t);t.luxunLao=0;
        this.log(`${t.name}受到属性伤害，移去全部${count}个“劳”。`,'system');
      }
      return health.call(this,s,t,n,context);
    };
    P.afterDamageEvent=async function(s,t,n,context,generation){
      // The engine records chaining before elemental damage removes the chain.
      if(n>0&&context.luxunChainedAtDamage&&owner(this,s)&&s.generation===context.luxunDamageSourceGeneration){
        this.draw(s,1);this.log(`${s.name}【焚营】对横置角色造成伤害后摸一张牌。`,'draw');this.change();
      }
      return damaged?.call(this,s,t,n,context,generation);
    };
    P.luxunFenyingReady=function(p){return owner(this,p)&&!this.over&&!this.turnInterrupted&&this.isPlayPhaseOwner(p)&&!p.luxunFenyingUsed&&p.hand.some(C.isRed)&&this.alive().some(t=>t.id!==p.id&&t.luxunLao);};
    // Evaluate public chains, equipment, armor and marks, never opposing card faces.
    P.luxunAIFireForecast=function(p,target,nature='fire',baseAmount=1){
      const hit=(t,base)=>{
        if(this.chengongProtected?.(t))return {raw:0,hp:0,armor:0};
        let raw=base+(nature==='fire'?(t.huanggaiFireMarks||[]).length:0);
        if(nature==='fire'&&t.equip.armor?.key==='vine')raw++;
        if(t.equip.armor?.key==='lion')raw=Math.min(raw,1);
        const armor=Math.min(t.armor||0,raw);return {raw,hp:Math.max(0,raw-armor),armor};
      };
      const first=hit(target,baseAmount);if(!first.raw)return {score:-30,unsafe:true,kill:false,hits:[]};
      const terminal=['team','duel'].includes(this.options.mode)&&first.hp>=target.hp&&this.hostility(p,target)>.5&&this.alive().filter(t=>this.hostility(p,t)>.5).length===1;
      const victims=[target,...(target.chained&&!terminal?this.alive().filter(t=>t.id!==target.id&&t.chained):[])],hits=[];
      let score=0,unsafe=false;
      for(const t of victims){
        const amount=t.id===target.id?first:hit(t,first.raw);if(!amount.raw)continue;
        const enemy=this.hostility(p,t)>.5,friend=this.hostility(p,t)<-.5;
        const sign=enemy?1:friend?-1:0,lethal=amount.hp>=t.hp;
        score+=sign*(amount.hp*2.5+amount.armor*1.3+(lethal?5:0));
        if(enemy&&t.hp>amount.hp)score-=this.damageBenefitRisk(t)*.45;
        if(friend&&lethal){score-=16;unsafe=true;}
        if(t.chained)score+=1.7;
        if(nature==='fire')for(const id of new Set((t.huanggaiFireMarks||[]).map(m=>m.donorId))){const donor=this.get(id);if(donor?.alive)score+=this.hostility(p,donor)<-.5?1.5:this.hostility(p,donor)>.5?-1.5:0;}
        hits.push({id:t.id,...amount,lethal,enemy,friend});
      }
      return {score,unsafe,kill:first.hp>=target.hp&&this.hostility(p,target)>.5,hits};
    };
    P.luxunAICost=function(p,c){
      let score=this.value(c,p);
      if(c.key==='peach')score+=p.hp<p.maxHp?12:4;
      if(c.key==='jink'&&p.hand.filter(x=>x.key==='jink').length===1)score+=p.hp<=2?10:4;
      if(c.key==='wine'&&p.hp===1)score+=10;
      if(c.key==='draw2')score+=5;
      if(c.key==='slash'&&this.slashAvailable(p)&&this.alive().some(t=>this.hostility(p,t)>.5&&t.chained&&this.canSlash(p,t)))score+=4;
      if(this.luxunExemptCards(p).some(x=>x.id===c.id))score+=1;
      return score;
    };
    P.luxunAIFenyingPlan=function(p){
      if(!this.luxunFenyingReady(p))return null;
      const cost=[...p.hand.filter(C.isRed)].sort((a,b)=>this.luxunAICost(p,a)-this.luxunAICost(p,b))[0];
      const plans=this.alive().filter(t=>t.id!==p.id&&t.luxunLao).map(t=>{const forecast=this.luxunAIFireForecast(p,t,'fire',this.luxunLaoCount(t));return {target:t,cost,...forecast,score:forecast.score-this.luxunAICost(p,cost)*.35};}).filter(x=>!x.unsafe&&x.score>0).sort((a,b)=>b.score-a.score);
      return plans[0]||null;
    };
    P.luxunAIDaibianWorth=function(p,t){
      if(t.chained)return true;
      const friendly=this.hostility(p,t)<-.5;
      const exposed=this.alive().filter(x=>x.id!==t.id&&x.chained&&this.hostility(p,x)<-.5);
      if(friendly&&t.hp<=2&&(t.equip.armor?.key==='vine'||exposed.some(x=>x.hp<=2)))return false;
      if(!friendly&&exposed.some(x=>x.hp===1)&&t.equip.armor?.key==='vine')return false;
      return true;
    };
    P.luxunAIScore=function(p,a,c,score){
      if(!owner(this,p))return score;
      const targets=(a.targets||[]).map(id=>this.get(id)).filter(Boolean);
      if(['slash','duel','barbarian','arrows'].includes(c.key)){
        const affected=['barbarian','arrows'].includes(c.key)?this.alive().filter(t=>t.id!==p.id):targets;
        score+=affected.filter(t=>t.chained&&this.hostility(p,t)>.5&&!this.chengongProtected?.(t)).length*2;
      }
      if(['fireSlash','thunderSlash','fireAttack'].includes(c.key)&&targets.length&&targets[0].chained){
        const forecast=this.luxunAIFireForecast(p,targets[0],c.key==='thunderSlash'?'thunder':'fire');
        if(forecast.unsafe||forecast.score<=0)return Math.min(score,-8);
        score+=forecast.hits.filter(h=>this.get(h.id).chained).length*1.5;
      }
      if(c.key==='chain'&&!a.recast){
        const after=new Map(this.alive().map(t=>[t.id,t.chained]));for(const t of targets)after.set(t.id,!t.chained);
        const markedEnemies=this.alive().filter(t=>this.hostility(p,t)>.5&&t.luxunLao&&after.get(t.id));
        for(const t of targets){const enemy=this.hostility(p,t)>.5;
          if(enemy&&t.chained)score-=2;
          if(enemy&&!t.chained&&t.luxunLao)score+=3;
          if(!enemy&&after.get(t.id)&&t.hp<=2)score-=8;
        }
        if(markedEnemies.length&&p.hand.some(C.isRed)&&!p.luxunFenyingUsed)score+=2;
      }
      return score;
    };

    P.luxunFireScore=function(p,t){
      const f=this.luxunAIFireForecast(p,t,'fire',this.luxunLaoCount(t));return f.unsafe?-30:f.score;
    };
    P.luxunFenying=async function(p){
      if(!this.luxunFenyingReady(p))return false;
      const generation=p.generation,targets=this.alive().filter(t=>t.id!==p.id&&t.luxunLao);
      const best=[...targets].sort((a,b)=>this.luxunFireScore(p,b)-this.luxunFireScore(p,a))[0];
      const id=await this.option(p,'焚营：选择一名有劳的其他角色',[...targets.map(t=>({key:String(t.id),label:`${t.id+1}号位 · ${t.name} · ${t.hp}体力 · 劳${this.luxunLaoCount(t)} · ${this.luxunLaoCount(t)}点火伤 · ${t.chained?'横置':'未横置'}`})),{key:'cancel',label:'取消焚营'}],String(best.id));
      const target=targets.find(t=>String(t.id)===id),tg=target?.generation;if(!target)return false;
      const pool=p.hand.filter(C.isRed),cheap=[...pool].sort((a,b)=>this.luxunAICost(p,a)-this.luxunAICost(p,b))[0];
      const ids=await this.selectCards(p,'焚营：弃置一张红色手牌',pool,0,1,[cheap.id],'空选并确认可取消；装备区的牌不能作为费用。');
      if(!ids?.length||!same(p,generation)||!same(target,tg)||!target.luxunLao||!this.luxunFenyingReady(p)||!p.hand.some(c=>c.id===ids[0]&&C.isRed(c)))return false;
      const count=this.luxunLaoCount(target);
      p.luxunFenyingUsed=true;target.luxunLao=0;this.discardOwned(p,[ids[0]]);
      this.log(`${p.name}发动【焚营】，弃置红色手牌，移去${target.name}全部${count}个“劳”，将造成${count}点火焰伤害。`,'use');
      await this.flushSkillEvents();
      if(same(p,generation)&&same(target,tg)&&!this.over)await this.damage(p,target,count,'fire',{skill:'fenying'});
      await this.flushSkillEvents();this.change();return true;
    };
    P.activeSkills=function(p){const out=active.call(this,p);if(owner(this,p))out.push({key:'luxun_fenying',name:'焚营',ready:this.luxunFenyingReady(p),detail:'弃红色手牌 · 移去全部劳 · 每个劳造成1点火伤',reason:p.luxunFenyingUsed?'本出牌阶段已发动':'须在自己的出牌阶段，有红色手牌及带劳的其他角色'});return out;};
    P.prepareActive=async function(p,a){if(a.skill!=='luxun_fenying')return prepare.call(this,p,a);await this.luxunFenying(p);return null;};
    P.aiPlay=function(p,actions){
      const rest=ai.call(this,p,actions.filter(a=>a.skill!=='luxun_fenying'));
      if(!owner(this,p))return rest;
      const action=actions.find(a=>a.skill==='luxun_fenying'),plan=action&&this.luxunAIFenyingPlan(p);
      if(!plan)return rest;
      const c=rest?.type==='use'?p.hand.find(c=>c.id===rest.cardId):null;
      if(c&&['peach','draw2'].includes(c.key))return rest;
      if(plan.kill)return action;
      if(c&&['slash','duel','barbarian','arrows'].includes(c.key)){const ts=['barbarian','arrows'].includes(c.key)?this.alive().filter(t=>t.id!==p.id):(rest.targets||[]).map(id=>this.get(id));if(ts.some(t=>t?.chained&&this.hostility(p,t)>.5))return rest;}
      return action;
    };
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(p.luxunLao)out.push(`劳 · ${this.luxunLaoCount(p)}`);if(p.general==='luxun'){out.push(`待变 · 本回合${p.luxunDaibianTurn===this.totalTurns?'已用':'可用'}`);out.push(`焚营 · 本阶段${p.luxunFenyingUsed?'已用':'可用'}`);const n=this.luxunExemptCards(p).length;if(n)out.push(`待变牌 · ${n}张不计上限，至下个回合结束`);}return out;};
  }
  const api={install};root.ZhenLuxunSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
