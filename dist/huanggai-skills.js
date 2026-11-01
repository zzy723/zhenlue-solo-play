(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype;
    const init=P.initExtra,handChanged=P.handChanged,afterLoseHp=P.afterLoseHp;
    const active=P.activeSkills,aiPlay=P.aiPlay,damage=P.damage,states=P.dynastyStates;
    const owner=(g,p)=>p?.alive&&g.isGeneral(p,'jiehuanggai');
    const cardLabel=(c)=>`${C.suitMark[c.suit]}${C.rankMark(c.rank)}【${c.name}】`;
    P.initExtra=function(p){init.call(this,p);p.huanggaiKurouTurn=-1;p.huanggaiZhajiangTurn=-1;p.huanggaiFireMarks=[];};
    P.handChanged=function(p,before){handChanged.call(this,p,before);
      if(p.huanggaiFireMarks?.length)p.huanggaiFireMarks=p.huanggaiFireMarks.filter(mark=>p.hand.some(c=>c.id===mark.cardId));
    };
    P.afterLoseHp=async function(p,n,reason){if(owner(this,p))return;return afterLoseHp?.call(this,p,n,reason);};
    P.huanggaiChainChanged=function(target,entered){
      if(!target?.alive||this.over)return;
      for(const p of this.actionOrder(this.alive().filter(watcher=>owner(this,watcher)))){
        this.draw(p,1);
        this.log(`${p.name}【苦肉】因${target.name}${entered?'进入':'解除'}横置状态摸一张牌。`,'draw');
      }
    };
    P.activeSkills=function(p){const list=active.call(this,p);if(!owner(this,p))return list;
      const skill=list.find(s=>s.key==='kurou');
      if(skill){skill.detail='交牌 · 受到收牌者1点火焰伤害 · 本回合一次';skill.ready=this.isPlayPhaseOwner(p)&&p.huanggaiKurouTurn!==this.totalTurns&&this.owned(p).length>0;skill.reason=skill.ready?'':'已发动或没有可交出的牌';}
      return list;
    };
    // Decisions use the owner's cards and public zones; opposing card faces stay hidden.
    P.huanggaiAISelfMark=false;
    P.huanggaiAICardCost=function(p,c){
      let v=this.value(c,p);
      if(c.key==='peach')v+=p.hp<p.maxHp?9:4;
      if(c.key==='jink'&&p.hand.filter(x=>x.key==='jink').length===1)v+=5;
      if(c.key==='nullify'&&p.hand.filter(x=>x.key==='nullify').length===1)v+=3;
      if(p.equip[c.slot]?.id===c.id)v+=c.slot==='armor'?7:c.slot==='weapon'?4:3;
      if(c.key==='lion'&&p.equip.armor?.id===c.id&&p.hp<p.maxHp)v-=10;
      if(C.isSlash(c)&&C.isRed(c)&&this.slashAvailable(p))v+=3;
      if(['fireSlash','fireAttack'].includes(c.key))v+=2;
      return v;
    };
    P.huanggaiAIFireLoss=function(p,base=1){
      let n=base+(p.huanggaiFireMarks||[]).length;
      if(p.equip.armor?.key==='vine')n++;
      if(p.equip.armor?.key==='lion')n=Math.min(n,1);
      return Math.max(0,n-(p.armor||0));
    };
    P.huanggaiAIChainPlan=function(p){
      const enemies=this.alive().filter(t=>t.id!==p.id&&this.hostility(p,t)>.5&&!t.chained);
      if(!enemies.length)return null;
      const danger=this.alive().some(t=>t.id!==p.id&&t.chained&&this.hostility(p,t)<-.5&&t.hp<=2);
      if(p.hp+(p.armor||0)<3||danger)return null;
      const target=enemies.sort((a,b)=>(b.equip.armor?.key==='vine')-(a.equip.armor?.key==='vine')||a.hp-b.hp||a.hand.length-b.hand.length)[0];
      return {target,draws:(p.chained?0:1)+1};
    };
    P.huanggaiAIKurouPlan=function(p){
      if(!owner(this,p)||p.huanggaiKurouTurn===this.totalTurns||!this.owned(p).length)return null;
      const loss=this.huanggaiAIFireLoss(p);
      if(p.hp-loss<2)return null;
      if(p.chained&&this.alive().some(t=>t.id!==p.id&&t.chained&&this.hostility(p,t)<-.5&&t.hp-this.huanggaiAIFireLoss(t,1)<=1))return null;
      const friends=this.alive().filter(t=>t.id!==p.id&&this.hostility(p,t)<-.5);
      const recipient=friends.sort((a,b)=>a.hand.length-b.hand.length||a.hp-b.hp)[0]||p;
      const pool=this.owned(p).filter(c=>this.huanggaiAICardCost(p,c)<=6).sort((a,b)=>this.huanggaiAICardCost(p,a)-this.huanggaiAICardCost(p,b));
      if(!pool.length)return null;
      const predictedHp=Math.max(1,p.hp-loss),overflow=Math.max(0,p.hand.length-predictedHp);
      const cards=[pool[0]],extra=pool.slice(1).filter(c=>p.hand.includes(c));
      if(recipient.id!==p.id)for(const c of extra){if(cards.filter(c=>p.hand.includes(c)).length>=Math.max(1,overflow))break;cards.push(c);}
      const chain=this.huanggaiAIChainPlan({...p,hp:predictedHp});
      const redAttack=p.hp===p.maxHp&&p.hand.some(c=>C.isSlash(c)&&C.isRed(c))&&this.slashAvailable(p)&&this.alive().some(t=>this.hostility(p,t)>.5&&this.canSlash(p,t));
      const hitsEnemies=p.chained&&this.alive().some(t=>t.id!==p.id&&t.chained&&this.hostility(p,t)>.5);
      if(!chain&&!hitsEnemies&&!redAttack&&overflow===0&&loss>0)return null;
      const fireCombo=!!chain&&p.hand.some(c=>['fireSlash','fireAttack'].includes(c.key));
      return {recipient,cards,beforeAttack:redAttack||fireCombo};
    };
    P.huanggaiAIScore=function(p,a,c,score){
      const targets=(a.targets||[]).map(id=>this.get(id)).filter(Boolean);
      if(C.isSlash(c)&&C.isRed(c)&&p.hp<p.maxHp&&score>0)score+=2;
      if(c.key==='chain'&&!a.recast){
        score+=targets.length*2;
        for(const t of targets)if(!t.chained&&this.hostility(p,t)<-.5&&t.hp<=2)score-=8;
      }
      if(['fireSlash','fireAttack'].includes(c.key)&&targets.length){
        const t=targets[0],victims=t.chained?this.alive().filter(x=>x.chained):[t];
        let net=0;
        for(const v of victims){const loss=this.huanggaiAIFireLoss(v);net+=(this.hostility(p,v)>.5?1:-1)*loss;if(this.hostility(p,v)<-.5&&v.hp-loss<=0)net-=6;}
        if(net<0)return Math.min(score,-5);
        score+=net*1.5;
      }
      return score;
    };

    P.aiPlay=function(p,actions){const rest=aiPlay.call(this,p,actions.filter(a=>a.skill!=='kurou'));
      if(!owner(this,p))return rest;
      const skill=actions.find(a=>a.skill==='kurou'),plan=this.huanggaiAIKurouPlan(p);
      const resource=rest?.type==='use'&&p.hand.some(c=>c.id===rest.cardId&&['peach','draw2'].includes(c.key));
      return skill&&plan&&!resource&&(rest.type==='end'||plan.beforeAttack)?skill:rest;
    };
    P.kurou=async function(p){
      if(!owner(this,p)||!this.isPlayPhaseOwner(p)||p.huanggaiKurouTurn===this.totalTurns)return;
      const pool=this.owned(p),recipients=this.alive();if(!pool.length||!recipients.length)return;
      const plan=this.huanggaiAIKurouPlan(p),friend=plan?.recipient||recipients.find(t=>t.id!==p.id&&this.hostility(p,t)<-.5);
      const id=await this.option(p,'苦肉：选择收牌并造成火焰伤害的角色',recipients.map(t=>({key:String(t.id),label:`${t.name} · ${t.id+1}号位 · ${t.hp}血`})),String(friend?.id??p.id));
      const recipient=this.get(Number(id));if(!recipient?.alive)return;
      const suggested=(plan?.cards||[...pool].sort((a,b)=>this.huanggaiAICardCost(p,a)-this.huanggaiAICardCost(p,b)).slice(0,1)).map(c=>c.id);
      const ids=await this.selectCards(p,'苦肉：选择要交出的任意张牌',pool,1,pool.length,suggested,'可交出手牌或装备牌；结算后可以选择两名角色横置。');
      const valid=ids.filter(cardId=>this.owned(p).some(c=>c.id===cardId));if(!valid.length)return;
      p.huanggaiKurouTurn=this.totalTurns;
      const cards=this.moveBatch(p,()=>valid.map(cardId=>this.removeOwned(p,cardId).card));
      this.gain(recipient,cards);
      this.log(`${p.name}发动【苦肉】，交给${recipient.name}${cards.length}张牌。`,'system');
      if(p.alive&&!this.over)await this.damage(recipient,p,1,'fire',{skill:'kurou'});
      if(!p.alive||this.over)return;
      const others=this.alive().filter(t=>t.id!==p.id);if(!others.length)return;
      const chain=this.huanggaiAIChainPlan(p),best=chain?.target||others[0];
      const worth=!!chain;
      const choice=await this.option(p,'苦肉：令你与另一名角色进入横置状态？',[{key:'yes',label:'横置两名角色'},{key:'no',label:'不横置'}],worth?'yes':'no');
      if(choice!=='yes')return;
      const targetId=await this.option(p,'苦肉：选择另一名横置角色',others.map(t=>({key:String(t.id),label:`${t.name} · ${t.id+1}号位 · ${t.chained?'已横置':'未横置'}`})),String(best.id));
      const target=this.get(Number(targetId));if(!target?.alive)return;
      for(const t of [p,target])if(!t.chained){t.chained=true;this.huanggaiChainChanged(t,true);}
      this.log(`${p.name}【苦肉】令自己与${target.name}进入横置状态。`,'system');this.change();
    };
    P.huanggaiZhajiang=async function(p,amount){
      if(!owner(this,p)||p.huanggaiZhajiangTurn===this.totalTurns||!p.alive||this.over)return;
      const useful=!this.huanggaiAISelfMark||p.hp>=amount+3;
      const choice=await this.option(p,`诈降：即将受到${amount}点火焰伤害，发动一次？`,[{key:'yes',label:'发动诈降'},{key:'no',label:'不发动'}],useful?'yes':'no','本回合限一次；选择X后摸X张，并给X名不同角色每人一张。');
      if(choice!=='yes')return;
      p.huanggaiZhajiangTurn=this.totalTurns;
      const count=this.alive().length;
      const x=Number(await this.option(p,`诈降：选择摸牌及收牌人数X（1～${count}）`,Array.from({length:count},(_,i)=>({key:String(i+1),label:`摸${i+1}张，交给${i+1}名角色`})),String(1+(p.chained?this.alive().filter(t=>t.id!==p.id&&t.chained&&this.hostility(p,t)>.5).length:0))));
      const before=new Set(p.hand.map(c=>c.id));this.draw(p,x);await this.flushSkillEvents();
      const drawn=p.hand.filter(c=>!before.has(c.id));
      const remaining=[...drawn];
      const recipients=this.alive();
      for(let i=0;i<drawn.length&&recipients.length;i++){
        const pool=remaining.filter(c=>p.hand.some(h=>h.id===c.id));if(!pool.length)break;
        const keeping=recipients.some(t=>t.id===p.id);
        const preferred=[...pool].sort((a,b)=>(keeping?-1:1)*(this.huanggaiAICardCost(p,a)-this.huanggaiAICardCost(p,b)))[0];
        const cardId=pool.length===1?pool[0].id:await this.option(p,`诈降：选择第${i+1}张交出的新牌`,pool.map(c=>({key:c.id,label:cardLabel(c),card:c})),preferred.id);
        const card=pool.find(c=>c.id===cardId);if(!card)break;
        remaining.splice(remaining.findIndex(c=>c.id===card.id),1);
        const rank=t=>t.id===p.id?0:this.hostility(p,t)>.5&&t.chained?1:this.hostility(p,t)>.5?2:3;
        const safe=[...recipients].sort((a,b)=>rank(a)-rank(b)||a.hand.length-b.hand.length)[0];
        const targetId=await this.option(p,`诈降：选择第${i+1}名收牌角色`,recipients.map(t=>({key:String(t.id),label:`${t.name} · ${t.id+1}号位`})),String(safe.id));
        const target=this.get(Number(targetId));if(!target?.alive)break;
        recipients.splice(recipients.indexOf(target),1);
        if(target.id!==p.id){const moved=this.moveBatch(p,()=>this.removeOwned(p,card.id).card);this.gain(target,[moved]);}
        target.huanggaiFireMarks ||= [];
        if(target.id!==p.id)target.huanggaiFireMarks.push({donorId:p.id,cardId:card.id});
        this.log(target.id===p.id?`${p.name}【诈降】令自己保留${cardLabel(card)}，不增加自己的火焰伤害。`:`${p.name}【诈降】令${target.name}获得${cardLabel(card)}；此牌在手中时，其受到的火焰伤害+1。`,'system');
      }
      this.change();
    };
    P.damage=async function(source,target,amount,nature='normal',context={}){
      if(nature!=='fire'||amount<=0||!target?.alive||this.over)return damage.call(this,source,target,amount,nature,context);
      await this.huanggaiZhajiang(target,amount);
      const marks=(target.huanggaiFireMarks||[]).filter(mark=>target.hand.some(c=>c.id===mark.cardId));
      const donors=[...new Set(marks.map(mark=>mark.donorId))];
      if(marks.length){amount+=marks.length;this.log(`${target.name}持有${marks.length}张【诈降】牌，此次火焰伤害+${marks.length}。`,'damage');}
      const dealt=await damage.call(this,source,target,amount,nature,context);
      if(marks.length&&!this.over)for(const id of donors){
        const donor=this.get(id);if(!donor?.alive)continue;
        this.heal(donor,1);if(dealt>0)this.draw(donor,dealt);
        this.log(`${donor.name}【诈降】结算后回复1点体力并摸${dealt}张牌。`,'draw');
      }
      return dealt;
    };
    const balanceSlash=P.slash;P.slash=async function(source,target,c,...args){const enabled=owner(this,source)&&this.turn===source.id&&source.hp<source.maxHp&&C.isRed(c),old=c.unrespondable;if(enabled)c.unrespondable=true;try{return await balanceSlash.call(this,source,target,c,...args);}finally{if(old===undefined)delete c.unrespondable;else c.unrespondable=old;}};
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);
      if(p.general==='jiehuanggai')out.push(`苦肉 ${p.huanggaiKurouTurn===this.totalTurns?'已用':'未用'} · 诈降 ${p.huanggaiZhajiangTurn===this.totalTurns?'已用':'未用'}`);
      if(p.huanggaiFireMarks?.length)out.push(`诈降火伤牌 ${p.huanggaiFireMarks.length}`);
      return out;
    };
  }
  const api={install};root.ZhenHuanggaiSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
