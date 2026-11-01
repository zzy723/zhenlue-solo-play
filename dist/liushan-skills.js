(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,init=P.initExtra,phaseEnd=P.phaseEndSkills,finish=P.finishPhaseSkills;
    const health=P.applyDamageHealth,slash=P.slash,states=P.dynastyStates;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'liushan');
    const same=(p,n)=>!!p?.alive&&p.generation===n;
    P.initExtra=function(p){init.call(this,p);p.liushanFangquanTurn=-1;p.liushanRewardTurn=-1;p.liushanRewardUsed=-1;};
    // The active phase may belong to someone other than the owner of the turn.
    P.isPlayPhaseOwner=function(p){return !!p&&this.phase==='出牌'&&(this._liushanExtraPlay?.actorId??this.turn)===p.id;};
    P.liushanReceiverScore=function(p,t){
      if(this.hostility(p,t)>=0)return -100;
      return 5+(t.hp<t.maxHp?2:0)+Math.min(4,t.hand.length)*.4+
        t.hand.filter(c=>C.isSlash(c)||['duel','fireAttack','arrows','barbarian'].includes(c.key)).length;
    };
    P.liushanFangquan=async function(p){
      if(!owner(this,p)||this.over||this.turnInterrupted||this.turn!==p.id||this.phase!=='摸牌'||p.skipDraw||!p.hand.length||p.liushanFangquanTurn===this.totalTurns)return false;
      const generation=p.generation,targets=this.alive().filter(t=>t.id!==p.id);
      if(!targets.length)return false;
      p.liushanFangquanTurn=this.totalTurns;
      const best=[...targets].sort((a,b)=>this.liushanReceiverScore(p,b)-this.liushanReceiverScore(p,a))[0];
      const id=await this.option(p,'放权：选择一名其他角色',[
        ...targets.map(t=>({key:String(t.id),label:`${t.id+1}号位 · ${t.name} · ${t.hp}/${t.maxHp}体力 · 摸${t.hp<t.maxHp?2:1}张牌`})),
        {key:'cancel',label:'不发动放权'}
      ],this.liushanReceiverScore(p,best)>0?String(best.id):'cancel','交给其一张手牌，跳过自己的出牌阶段；其立即执行额外出牌阶段。');
      const target=targets.find(t=>String(t.id)===id),targetGeneration=target?.generation;
      if(!same(p,generation)||!same(target,targetGeneration)||this.over||this.turnInterrupted||!p.hand.length||!owner(this,p))return false;
      const suggested=[...p.hand].sort((a,b)=>(this.value(a,p)-this.value(a,target)*.5)-(this.value(b,p)-this.value(b,target)*.5))[0];
      const ids=await this.selectCards(p,'放权：交出一张手牌',p.hand,0,1,[suggested.id],'选择一张手牌确认；空选确认可取消，不跳过出牌阶段。');
      if(!same(p,generation)||!same(target,targetGeneration)||this.over||this.turnInterrupted||!owner(this,p)||ids.length!==1||!p.hand.some(c=>c.id===ids[0]))return false;
      const gift=this.removeOwned(p,ids[0]).card;
      p.skipPlay=true;this.gain(target,[gift]);this.evidence(p,target,true);
      this.log(`${p.name}发动【放权】，交给${target.name}一张手牌并跳过出牌阶段。`,'use');
      await this.flushSkillEvents();
      if(!same(target,targetGeneration)||this.over||this.turnInterrupted)return true;
      const count=target.hp<target.maxHp?2:1;this.draw(target,count);
      this.log(`${target.name}因【放权】摸${count}张牌，立即执行一个额外出牌阶段。`,'draw');
      await this.flushSkillEvents();
      if(same(target,targetGeneration)&&!this.over&&!this.turnInterrupted)await this.liushanExtraPlay(p,target,generation);
      return true;
    };
    P.liushanExtraPlay=async function(p,target,generation=p.generation){
      const oldPhase=this.phase,previous=this._liushanExtraPlay;
      const saved={slashUsed:target.slashUsed,wineUsed:target.wineUsed};
      const targetGeneration=target.generation;
      const frame={actorId:target.id,actorGeneration:targetGeneration,ownerId:p.id,ownerGeneration:generation,turn:this.totalTurns,damaged:false};
      this._liushanExtraPlay=frame;this.phase='出牌';
      // Phase quotas start afresh; turn/round quotas and the real turn owner stay intact.
      target.slashUsed=0;target.wineUsed=0;target.zhihengUsed=0;target.jianmieUsed=false;target.activeUsed=[];
      target.lvmengTanhuUsed=false;target.lvmengGongxinUsed=0;target.lvmengUsedSlash=false;
      target.simayiShanzhengTurn=-1;
      try{
        this.change();await this.playStartSkills(target);
        let moves=0;
        while(same(target,targetGeneration)&&!this.over&&!this.turnInterrupted){
          await this.flushSkillEvents();
          if(!same(target,targetGeneration)||this.over||this.turnInterrupted)break;
          const actions=this.legalActions(target);
          const action=await this.choose(target,{kind:'play',title:'放权：额外出牌阶段',detail:`${p.name}的回合中，由${target.name}出牌。此阶段结束后回到${p.name}，不执行摸牌、弃牌或结束阶段。`,actions},()=>this.aiPlay(target,actions));
          if(action.type==='end')break;
          await this.useAction(target,action);await this.pause();
          if(++moves>150)throw Error('放权额外出牌阶段操作数异常');
        }
        if(same(target,targetGeneration)&&!this.over&&!this.turnInterrupted)await this.phaseEndSkills?.(target);
      }finally{
        if(same(p,generation)&&frame.damaged)p.liushanRewardTurn=frame.turn;
        if(target.generation===targetGeneration){Object.assign(target,saved);target.drunk=0;target.jiannanActive=false;}
        this._liushanExtraPlay=previous;this.phase=oldPhase;this.change();
      }
    };
    P.phaseEndSkills=async function(p){
      if(phaseEnd)await phaseEnd.call(this,p);
      if(this.phase==='摸牌'&&this.turn===p?.id&&!this._liushanExtraPlay)await this.liushanFangquan(p);
    };
    P.applyDamageHealth=function(source,target,amount,context){
      health.call(this,source,target,amount,context);
      const frame=this._liushanExtraPlay;
      if(amount>0&&frame&&this.phase==='出牌'&&source?.id===frame.actorId&&source.generation===frame.actorGeneration)frame.damaged=true;
    };
    P.finishPhaseSkills=async function(p){
      await finish.call(this,p);
      if(!owner(this,p)||this.over||this.turn!==p.id||this.phase!=='结束'||p.liushanRewardTurn!==this.totalTurns||p.liushanRewardUsed===this.totalTurns)return;
      p.liushanRewardUsed=this.totalTurns;
      const key=await this.option(p,'放权：选择结束阶段奖励',[
        {key:'draw',label:'摸一张牌'},{key:'heal',label:'回复1点体力'},{key:'pass',label:'放弃奖励'}
      ],p.hp<p.maxHp?'heal':'draw','受赠者在额外出牌阶段实际造成过伤害，可获得一次奖励。');
      if(!owner(this,p)||this.over)return;
      if(key==='draw'){this.draw(p,1);this.log(`${p.name}【放权】在结束阶段摸一张牌。`,'draw');}
      if(key==='heal'){this.heal(p,1);this.log(`${p.name}【放权】在结束阶段回复1点体力。`,'heal');}
      await this.flushSkillEvents();this.change();
    };
    P.slash=async function(source,target,card,...args){
      if(owner(this,target)&&source?.alive&&source.id!==target.id&&!this.over&&!card.dujuNullified){
        const basics=source.hand.filter(c=>c.kind==='basic');
        const cheapest=[...basics].sort((a,b)=>this.value(a,source)-this.value(b,source))[0];
        const key=basics.length?await this.option(source,`享乐：额外弃一张基本牌，否则杀对${target.name}无效`,[
          ...basics.map(c=>({key:c.id,label:`弃置【${c.name}】`,card:c})),{key:'pass',label:'不弃牌，此杀对刘禅无效'}
        ],this.hostility(source,target)>0?cheapest.id:'pass','须额外弃置手牌中的一张基本牌；本次使用杀的牌不能作为额外代价。即使杀不可响应，也必须支付。'):'pass';
        const cost=source.hand.find(c=>c.id===key&&c.kind==='basic');
        if(!cost){this.log(`${source.name}未支付【享乐】的基本牌，此【${card.name}】对${target.name}无效。`,'response');return;}
        this.discardOwned(source,[cost.id]);this.log(`${source.name}因【享乐】额外弃置【${cost.name}】。`,'response');
        await this.flushSkillEvents();
        if(!source.alive||!target.alive||this.over)return;
      }
      return slash.call(this,source,target,card,...args);
    };
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(p.general==='liushan'&&p.liushanRewardTurn===this.totalTurns&&p.liushanRewardUsed!==this.totalTurns)out.push('放权 · 结束阶段可摸牌或回复体力');if(this._liushanExtraPlay?.actorId===p.id)out.push('正在执行放权额外出牌阶段');return out;};
  }
  const api={install};root.ZhenLiushanSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
