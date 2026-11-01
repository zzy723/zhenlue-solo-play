(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype;
    const suits=['S','H','C','D'];
    const bonusNames={draw:'摸牌数',slash:'杀次数',hand:'手牌上限'};
    const init=P.initExtra,begin=P.beginTurnSkills,takeTurn=P.takeTurn,draw=P.draw;
    const handLimit=P.handLimit,slashAvailable=P.slashAvailable,active=P.activeSkills;
    const aiPlay=P.aiPlay,prepare=P.prepareActive,finish=P.finishPhaseSkills;
    const turnEnd=P.turnEndSkills,death=P.death,states=P.dynastyStates;
    P.initExtra=function(p){init.call(this,p);const oldRules=[2,3].includes(this.options.rulesVersion);Object.assign(p,{poxiUsed:false,poxiPeeked:false,poxiActivatedOnce:false,poxiTwoTriggered:false,shenExtraTurnQueued:false,shenExtraTurnUsed:false,shenCampDrawApplied:false,shenCampBonuses:{draw:oldRules?0:1,slash:1,hand:1}});};
    P.beginTurnSkills=function(){begin.call(this);for(const p of this.players){p.poxiUsed=false;p.poxiPeeked=false;p.shenCampDrawApplied=false;}};
    P.shenCampBonus=function(p,key){const camp=this.shenCamp;if(!camp||camp.holderId!==p.id)return 0;const owner=this.get(camp.ownerId);return owner?.alive&&this.isGeneral(owner,'shenganning')?owner.shenCampBonuses[key]:0;};
    P.takeTurn=async function(p){
      if(this.isGeneral(p,'shenganning')&&!this.shenCamp){this.shenCamp={ownerId:p.id,holderId:p.id};this.log(`${p.name}【劫营】获得“营”。`,'system');}
      return takeTurn.call(this,p);
    };
    P.draw=function(p,n,announce=true){
      const extra=this.phase==='摸牌'&&this.turn===p.id&&!p.shenCampDrawApplied?this.shenCampBonus(p,'draw'):0;
      if(extra){p.shenCampDrawApplied=true;this.log(`${p.name}因“营”在摸牌阶段额外摸${extra}张牌。`,'draw');}
      return draw.call(this,p,n+extra,announce);
    };
    P.handLimit=function(p){return handLimit.call(this,p)+this.shenCampBonus(p,'hand');};
    P.slashAvailable=function(p){
      if(slashAvailable.call(this,p))return true;
      const camp=this.shenCampBonus(p,'slash');if(!camp)return false;
      const other=(!this.options.legacyRules&&this.isGeneral(p,'wuyi')?1:0)
        +(this.isGeneral(p,'jiehuanggai')?(p.zhajiangBonus||0):0)
        +(this.options.mode==='landlord'&&p.role==='地主'?1:0);
      return p.slashUsed<1+other+camp;
    };
    P.activeSkills=function(p){const list=active.call(this,p);
      if(this.isGeneral(p,'shenganning')){
        const firstReady=p.poxiActivatedOnce||suits.every(s=>p.hand.some(c=>c.suit===s));
        list.push({key:'poxi',name:'魄袭',detail:p.poxiActivatedOnce?'观看手牌 · 弃四张不同花色':'首次需弃自己的四种花色手牌',ready:p.alive&&!p.poxiUsed&&!p.poxiPeeked&&firstReady&&this.alive().some(t=>t.id!==p.id),reason:p.poxiUsed?'本阶段已用':!firstReady?'首次发动需自己持有四种花色手牌':'没有其他存活角色'});
      }
      return list;
    };
    P.poxiPlan=function(p,target){
      const hostile=this.hostility(p,target)>0,buckets=suits.map(s=>{
        const own=p.hand.filter(c=>c.suit===s).sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
        const other=target.hand.filter(c=>c.suit===s).sort((a,b)=>hostile?this.value(b,target)-this.value(a,target):this.value(a,target)-this.value(b,target))[0];
        return {own,other};
      });
      if(buckets.some(b=>!b.own&&!b.other))return null;
      let best=null;
      for(let mask=0;mask<16;mask++){
        if(!p.poxiActivatedOnce&&mask!==15)continue;
        const cards=buckets.map((b,i)=>mask&(1<<i)?b.own:b.other);if(cards.some(c=>!c))continue;
        const ownCount=cards.filter((c,i)=>mask&(1<<i)).length,otherCount=4-ownCount;
        let score=0;for(let i=0;i<4;i++)score+=(mask&(1<<i))?-this.value(cards[i],p)*1.05:(hostile?this.value(cards[i],target)*1.15:-this.value(cards[i],target)*0.9);
        if(otherCount===3&&this.owned(target,true).length>3)score+=4;
        if(otherCount===2)score+=this.options.rulesVersion>=14||this.options.rulesVersion>=12&&p.poxiTwoTriggered
          ?(p.hp<p.maxHp?3:0)
          :9+(p.hp<p.maxHp?2:0)+(Object.values(p.shenCampBonuses).some(n=>n<2)?2:0)-
            (hostile&&target.hp<target.maxHp?(target.hp<=1?7:3):0);
        if(otherCount===1)score+=p.hand.length>=5?4:1;
        if(otherCount===0)score+=this.shenExtraTurnActive||this.options.rulesVersion<14&&p.shenExtraTurnUsed?-100:18;
        if(!best||score>best.score)best={cards,ownCount,otherCount,score,targetId:target.id};
      }
      return best;
    };
    P.aiPlay=function(p,actions){
      if(!p.poxiActivatedOnce&&actions.some(a=>a.skill==='poxi')){
        const target=this.alive().filter(t=>t.id!==p.id).sort((a,b)=>this.hostility(p,b)-this.hostility(p,a)||b.hand.length-a.hand.length)[0];
        if(target&&this.poxiPlan(p,target)?.score>0)return {type:'skill',skill:'poxi'};
      }
      const rest=aiPlay.call(this,p,actions.filter(a=>a.skill!=='poxi'));
      if(rest.type!=='end'||!actions.some(a=>a.skill==='poxi'))return rest;
      const others=this.alive().filter(t=>t.id!==p.id&&p.hand.length+t.hand.length>=4);
      return others.length?{type:'skill',skill:'poxi'}:rest;
    };
    P.shenCampPlan=function(p){
      let best=null;
      for(const t of this.alive()){
        if(t.id===p.id||this.hostility(p,t)<=0)continue;
        let next=this.nextAlive(p.id),distance=1;
        while(next.id!==t.id&&distance<this.alive().length){next=this.nextAlive(next.id);distance++;}
        // 对手会先得到营的摸牌与额外出杀；只有预计能收走足够手牌才交营。
        const stealCount=this.options.rulesVersion===2?Math.min(3,t.hand.length):t.hand.length;
        const score=stealCount*1.15-1.5-(distance-1)*.6-
          (t.hp<=1?2:0)-(p.hp<=3&&this.canSlash(t,p)?5:0);
        if(!best||score>best.score)best={target:t,score};
      }
      return best?.score>1?best:null;
    };
    P.prepareActive=async function(p,a){if(a.skill!=='poxi')return prepare.call(this,p,a);await this.poxi(p);return null;};
    P.poxi=async function(p){
      if(!this.isGeneral(p,'shenganning')||p.poxiUsed||p.poxiPeeked||!this.isPlayPhaseOwner(p))return;
      if(!p.poxiActivatedOnce&&!suits.every(s=>p.hand.some(c=>c.suit===s)))return;
      const targets=this.alive().filter(t=>t.id!==p.id);if(!targets.length)return;
      const preferred=[...targets].sort((a,b)=>(this.hostility(p,b)>0?1:0)-(this.hostility(p,a)>0?1:0)||b.hand.length-a.hand.length)[0];
      const options=targets.map(t=>({key:String(t.id),label:`${t.name} · ${t.hand.length}张手牌`}));options.push({key:'cancel',label:'取消发动'});
      const chosen=await this.option(p,'魄袭：选择查看手牌的角色',options,String(preferred.id),'观看目标手牌后，可弃你与其手牌中四张不同花色的牌。');
      if(chosen==='cancel')return;
      const target=this.get(Number(chosen)),pool=[...p.hand,...target.hand],plan=this.poxiPlan(p,target);
      if(suits.some(s=>!pool.some(c=>c.suit===s))){
        await this.choose(p,{kind:'options',title:'魄袭：目前无法弃齐四种花色',detail:'已观看目标手牌。本次未弃牌，不消耗发动次数。',revealedCards:[...target.hand],options:[{key:'back',label:'返回牌桌'}]},()=> 'back');p.poxiPeeked=true;return;
      }
      if(!plan||plan.score<=0){const answer=await this.choose(p,{kind:'options',title:'魄袭：仍要弃牌？',detail:'你已看过目标手牌；当前弃牌的收益可能较低。取消不会弃牌。',revealedCards:[...target.hand],options:[{key:'continue',label:'继续选择四张牌'},{key:'cancel',label:'取消发动'}]},()=> 'cancel');if(answer==='cancel'){p.poxiPeeked=true;return;}}
      const selected=[];
      for(let i=0;i<suits.length;i++){
        const suit=suits[i],own=p.hand.filter(c=>c.suit===suit),other=p.poxiActivatedOnce?target.hand.filter(c=>c.suit===suit):[];
        const choices=[...own.map(c=>({key:'own:'+c.id,label:'弃自己：'+c.name+' '+C.rankMark(c.rank),card:c})),...other.map(c=>({key:'other:'+c.id,label:'弃'+target.name+'：'+c.name+' '+C.rankMark(c.rank),card:c})),{key:'cancel',label:'取消发动'}];
        const suggested=plan?.cards[i]?(own.some(c=>c.id===plan.cards[i].id)?'own:':'other:')+plan.cards[i].id:choices[0].key;
        const answer=await this.choose(p,{kind:'options',title:`魄袭：选择${C.suitMark[suit]}牌（${i+1}/4）`,detail:'先选满四种花色，再同时弃置；中途取消不消耗次数。',revealedCards:[...target.hand],options:choices},()=>suggested);
        if(answer==='cancel')return;const [side,id]=answer.split(':');selected.push({side,cardId:id});
      }
      const ownIds=selected.filter(x=>x.side==='own').map(x=>x.cardId),otherIds=selected.filter(x=>x.side==='other').map(x=>x.cardId);
      if(this.options.rulesVersion>=13&&!otherIds.length&&(this.shenExtraTurnActive||this.options.rulesVersion<14&&p.shenExtraTurnUsed)){
        const repeatable=this.options.rulesVersion>=14;
        await this.choose(p,{kind:'options',title:repeatable?'魄袭：额外回合内不可再得':'魄袭：额外回合已用',detail:repeatable?'额外回合里不能再次产生额外回合；本次不弃牌。可在下个普通回合再弃自己的四张。':'自己弃四张获得额外回合每局限一次；本次不弃牌。可改选对方的手牌重新发动。',revealedCards:[...target.hand],options:[{key:'back',label:'返回牌桌（不弃牌）'}]},()=> 'back');
        return;
      }
      this.discardOwned(p,ownIds);this.discardOwned(target,otherIds);p.poxiUsed=true;p.poxiActivatedOnce=true;
      this.log(`${p.name}发动【魄袭】，弃置自己${ownIds.length}张、${target.name}${otherIds.length}张不同花色的手牌。`,'system');
      if(otherIds.length===3&&this.owned(target,true).length){
        const answer=await this.option(p,'魄袭：再顺'+target.name+'一张牌？',[{key:'yes',label:'获得其区域内一张牌'},{key:'no',label:'不获得'}],this.hostility(p,target)>0?'yes':'no');
        if(answer==='yes')await this.takeOtherCard(p,target,'obtain',true);
      }else if(otherIds.length===2){
        if(this.options.rulesVersion>=14){
          this.heal(p,1);this.log(`${p.name}【魄袭】双方各弃两张，自己回复1点体力。`,'system');
        }else if(this.options.rulesVersion>=12&&p.poxiTwoTriggered){
          this.heal(p,1);this.log(`${p.name}【魄袭】再次弃置目标两张牌，仅回复自己1点体力。`,'system');
        }else if(this.options.rulesVersion>=12){
          p.poxiTwoTriggered=true;p.maxHp++;this.heal(p,1);if(target.alive)this.heal(target,1);
          const upgradable=Object.keys(bonusNames).filter(k=>p.shenCampBonuses[k]<2);
          if(upgradable.length){const key=await this.option(p,'魄袭：首次强化营的哪项数值？',upgradable.map(k=>({key:k,label:bonusNames[k]+' +1（当前+'+p.shenCampBonuses[k]+'）'})),upgradable[0]);
            p.shenCampBonuses[key]++;this.log(`${p.name}【魄袭】首次弃置目标两张牌，体力上限+1，强化营的${bonusNames[key]}至+${p.shenCampBonuses[key]}。`,'system');}
          else this.log(`${p.name}【魄袭】首次弃置目标两张牌，体力上限+1，营的三项加成均已达到+2。`,'system');
        }else{
        const upgradable=Object.keys(bonusNames).filter(k=>p.shenCampBonuses[k]<2);
        const beneficial=target.hp>=target.maxHp||this.hostility(p,target)<=0||p.hp<p.maxHp||upgradable.length>0;
        const answer=await this.option(p,'魄袭：增加体力上限并强化营？',[{key:'yes',label:'体力上限+1 · 双方各回复1'+(upgradable.length?' · 营一项+1':' · 营已满级')},{key:'no',label:'不执行'}],beneficial?'yes':'no');
        if(answer==='yes'){
          p.maxHp++;this.heal(p,1);if(target.alive)this.heal(target,1);
          if(upgradable.length){const key=await this.option(p,'魄袭：强化营的哪项数值？',upgradable.map(k=>({key:k,label:bonusNames[k]+' +1（当前+'+p.shenCampBonuses[k]+'）'})),upgradable[0]);
            p.shenCampBonuses[key]++;this.log(`${p.name}【魄袭】体力上限+1，强化营的${bonusNames[key]}至+${p.shenCampBonuses[key]}。`,'system');}
          else this.log(`${p.name}【魄袭】体力上限+1，营的三项加成均已达到+2。`,'system');
        }
        }
      }else if(otherIds.length===1){
        const drawAnswer=await this.option(p,'魄袭：额外摸一张牌？',[{key:'yes',label:'摸一张牌'},{key:'no',label:'不摸'}],'yes');
        if(drawAnswer==='yes'){this.draw(p,1);this.log(`${p.name}【魄袭】额外摸一张牌。`,'draw');}
        const answer=await this.option(p,'魄袭：重置本阶段魄袭次数？',[{key:'yes',label:'可以再次发动魄袭'},{key:'no',label:'不重置'}],p.hand.length+target.hand.length>=4?'yes':'no');
        if(answer==='yes'){p.poxiUsed=false;this.log(`${p.name}【魄袭】重置发动次数。`,'system');}
      }else if(otherIds.length===0){
        if(!this.shenExtraTurnActive&&(this.options.rulesVersion>=14||!p.shenExtraTurnUsed)){p.shenExtraTurnQueued=true;p.shenExtraTurnUsed=true;this.log(`${p.name}【魄袭】将在本回合结束后执行额外回合。`,'system');}
        else this.log(this.options.rulesVersion>=14?'【魄袭】额外回合内不能再获得额外回合。':'【魄袭】每局只能获得一次额外回合，且额外回合不能继续产生额外回合。','system');
      }else this.log(`${p.name}【魄袭】弃置目标四张牌，本次不减少体力上限。`,'system');
      this.change();
    };
    P.finishPhaseSkills=async function(p){await finish.call(this,p);
      const camp=this.shenCamp;if(!p.alive||this.over||!camp||camp.ownerId!==p.id)return;
      const targets=this.alive().filter(t=>t.id!==p.id);if(!targets.length)return;
      const opts=[{key:'keep',label:'保留营在当前角色'},...targets.map(t=>({key:String(t.id),label:`交给${t.name} · 手牌${t.hand.length}`}))];
      const answer=await this.option(p,'劫营：结束阶段将营交给谁？',opts,()=>{
        const plan=this.shenCampPlan(p);return plan?String(plan.target.id):'keep';
      },this.options.rulesVersion===2?'有营的其他角色回合结束后，你随机获得其至多三张手牌与营。':'有营的其他角色回合结束后，你获得其全部手牌与营。');
      if(answer!=='keep'){camp.holderId=Number(answer);this.log(`${p.name}【劫营】将营交给${this.get(camp.holderId).name}。`,'system');this.change();}
    };
    P.turnEndSkills=async function(){await turnEnd.call(this);
      const camp=this.shenCamp,current=this.get(this.turn);
      if(camp&&current?.alive&&current.id===camp.holderId&&camp.ownerId!==current.id){
        const owner=this.get(camp.ownerId);if(owner?.alive&&this.isGeneral(owner,'shenganning')){
          const ids=(this.options.rulesVersion===2?this.shuffle([...current.hand]).slice(0,3):[...current.hand]).map(c=>c.id);
          const cards=this.moveBatch(current,()=>ids.map(id=>this.removeOwned(current,id).card));
          if(cards.length)this.gain(owner,cards);
          camp.holderId=owner.id;this.log(`${owner.name}【劫营】收回营并获得${current.name}${cards.length}张手牌。`,'draw');
        }
      }
      if(current?.alive&&current.shenExtraTurnQueued&&!this.shenExtraTurnActive&&!this.over){
        current.shenExtraTurnQueued=false;this.shenExtraTurnActive=true;
        this.log(`${current.name}开始执行【魄袭】额外回合。`,'turn');
        try{await this.takeTurn(current);await this.turnEndSkills();}finally{this.shenExtraTurnActive=false;}
      }
    };
    P.death=async function(p,source){await death.call(this,p,source);
      const camp=this.shenCamp;if(!camp||camp.ownerId!==p.id&&camp.holderId!==p.id)return;
      if(camp.ownerId===p.id){this.shenCamp=null;this.log(`${p.name}阵亡，“营”消失。`,'system');}
      else{const owner=this.get(camp.ownerId);if(owner?.alive){camp.holderId=owner.id;this.log(`“营”回到${owner.name}处。`,'system');}else this.shenCamp=null;}
    };
    P.dynastyStates=function(p,compact=false){const result=states.call(this,p,compact),camp=this.shenCamp;
      if(camp?.holderId===p.id){const owner=this.get(camp.ownerId),b=owner?.shenCampBonuses;if(b)result.push(`营 · 摸+${b.draw} 杀+${b.slash} 上限+${b.hand}`);}
      if(!compact&&this.isGeneral(p,'shenganning'))result.push(`魄袭 ${p.poxiUsed?'已用':'可用'}${p.shenExtraTurnQueued?' · 待额外回合':''} · ${p.poxiActivatedOnce?'可选双方牌':'首次仅弃自己牌'} · 额外回合${this.options.rulesVersion>=14?(this.shenExtraTurnActive?'当前不能连得':'普通回合可再得'):(p.shenExtraTurnUsed?'已获得':'可获得')}`);
      return result;
    };
  }
  const api={install};root.ZhenShenSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
