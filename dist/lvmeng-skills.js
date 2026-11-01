(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{isSlash,suitMark,rankMark}=C;
    const init=P.initExtra,begin=P.beginTurnSkills,mark=P.markCardUse,response=P.response,phaseEnd=P.phaseEndSkills;
    const discardPhase=P.discardPhase,preparation=P.preparationSkills,active=P.activeSkills;
    const prepare=P.prepareActive,ai=P.aiPlay;
    const putDiscard=P.putDiscard,turnEnd=P.turnEndSkills,states=P.dynastyStates;
    const owner=(g,p)=>g.isGeneralLocked(p,'lvmeng');
    const label=t=>`${t.name} · ${t.hp}血 · 手牌${t.hand.length}`;

    P.initExtra=function(p){init.call(this,p);Object.assign(p,{lvmengAwakened:false,lvmengTanhuUsed:false,lvmengTanhuTargetId:null,lvmengGongxinUsed:0,lvmengUsedSlash:false,lvmengSkipDiscard:false,lvmengDiscardSuits:[],lvmengBotuRound:0,lvmengBotuUsed:0,lvmengBotuExtraTurn:false});};
    P.beginTurnSkills=function(){begin.call(this);const p=this.get(this.turn);if(!p)return;p.lvmengTanhuUsed=false;p.lvmengTanhuTargetId=null;p.lvmengGongxinUsed=0;p.lvmengUsedSlash=false;p.lvmengSkipDiscard=false;p.lvmengDiscardSuits=[];};
    P.markCardUse=async function(p,c,targets){if(owner(this,p)&&(this.turn===p.id||this.isPlayPhaseOwner(p))&&isSlash(c))p.lvmengUsedSlash=true;return mark.call(this,p,c,targets);};
    P.response=async function(p,type,...args){const used=await response.call(this,p,type,...args);if(used&&type==='slash'&&owner(this,p)&&(this.turn===p.id||this.isPlayPhaseOwner(p)))p.lvmengUsedSlash=true;return used;};
    P.phaseEndSkills=async function(p){if(phaseEnd)await phaseEnd.call(this,p);if(this.phase!=='出牌'||!p||!owner(this,p)||p.lvmengUsedSlash||p.lvmengBotuExtraTurn||!this.isPlayPhaseOwner(p)||this.over)return;
      p.lvmengSkipDiscard=true;this.log(`${p.name}【克己】未使用【杀】，跳过本回合弃牌阶段。`,'system');
      const choice=await this.option(p,'克己：选择一项',[{key:'armor',label:'获得1点护甲'},{key:'draw',label:'摸两张牌'}],p.hp<=2&&(p.armor||0)===0?'armor':'draw');
      if(choice==='armor'){p.armor=(p.armor||0)+1;this.log(`${p.name}【克己】获得1点护甲。`,'system');}
      else{this.draw(p,2);this.log(`${p.name}【克己】摸两张牌。`,'draw');}
      this.change();
    };
    P.discardPhase=async function(p){if(owner(this,p)&&p.lvmengSkipDiscard){p.lvmengSkipDiscard=false;this.log(`${p.name}跳过弃牌阶段。`,'system');return;}return discardPhase.call(this,p);};
    P.preparationSkills=async function(p){if(preparation)await preparation.call(this,p);if(!owner(this,p)||p.lvmengAwakened||p.hand.length<=p.hp||this.over)return;
      const count=p.armor||0,oldHp=p.hp;p.lvmengAwakened=true;
      p.maxHp=Math.max(1,p.maxHp-1);p.hp=Math.min(p.hp,p.maxHp);this.hpChanged?.(p,oldHp);
      this.draw(p,count);this.log(`${p.name}觉醒【勤学】：体力上限-1，摸${count}张牌，获得【攻心】和【博图】。`,'draw');this.change();
    };
    P.activeSkills=function(p){const list=active.call(this,p);if(!this.isGeneral(p,'lvmeng'))return list;
      list.push({key:'tanhu',name:'探虎',detail:'拼点夺势 · 本阶段一次',ready:!p.lvmengTanhuUsed&&p.hand.length>0&&this.alive().some(t=>t.id!==p.id&&t.hand.length>0),reason:'已发动或没有可拼点的对手'});
      if(p.lvmengAwakened)list.push({key:'gongxin',name:'攻心',detail:`观看手牌 · ${p.lvmengGongxinUsed||0}/1`,ready:(p.lvmengGongxinUsed||0)<1&&this.alive().some(t=>t.id!==p.id&&t.hand.length>0),reason:'已发动或没有目标手牌'});
      return list;
    };
    P.aiPlay=function(p,actions){if(!owner(this,p))return ai.call(this,p,actions);
      const tanhu=actions.find(a=>a.skill==='tanhu'),gongxin=actions.find(a=>a.skill==='gongxin');
      const enemies=this.alive().filter(t=>t.id!==p.id&&this.hostility(p,t)>0&&t.hand.length);
      const studyReady=!p.lvmengBotuExtraTurn&&!p.lvmengAwakened&&!p.lvmengUsedSlash&&p.hand.length>=p.hp-1;
      const lethalSlash=actions.some(a=>a.type==='use'&&a.targets?.some(id=>{const t=this.get(id);return t&&this.hostility(p,t)>0&&t.hp<=1;}));
      if(studyReady&&!lethalSlash){
        const safe=actions.filter(a=>a.type==='end'||a.type==='use'&&(
          a.recast||p.hand.find(c=>c.id===a.cardId)?.key==='draw2'||
          p.hand.length>=p.hp&&!isSlash(p.hand.find(c=>c.id===a.cardId))&&p.hand.find(c=>c.id===a.cardId)?.key!=='wine'
        ));
        return ai.call(this,p,safe);
      }
      const canWin=enemies.some(t=>p.hand.some(c=>c.rank>=10)&&t.hand.length>=2);
      if(tanhu&&canWin&&p.hand.length>1&&p.hand.some(c=>isSlash(c)||c.kind==='trick'))return tanhu;
      if(gongxin&&enemies.length)return gongxin;
      const filtered=actions.filter(a=>!['tanhu','gongxin'].includes(a.skill));
      const choice=ai.call(this,p,filtered);
      if(choice.type==='end'&&tanhu&&canWin)return tanhu;
      return choice;
    };
    P.prepareActive=async function(p,a){if(!['tanhu','gongxin'].includes(a.skill))return prepare.call(this,p,a);
      if(!this.activeSkills(p).some(s=>s.key===a.skill&&s.ready))return null;
      if(a.skill==='tanhu')await this.lvmengTanhu(p);else await this.lvmengGongxin(p);return null;
    };
    P.lvmengTanhu=async function(p){const targets=this.alive().filter(t=>t.id!==p.id&&t.hand.length),enemy=targets.filter(t=>this.hostility(p,t)>0).sort((a,b)=>b.hand.length-a.hand.length)[0];if(!targets.length)return;
      const id=await this.option(p,'探虎：选择拼点目标',[...targets.map(t=>({key:String(t.id),label:label(t)})),{key:'cancel',label:'取消'}],String(enemy?.id??targets[0].id));if(id==='cancel')return;
      const t=this.get(Number(id));if(!t?.alive||!t.hand.length||!p.hand.length)return;
      p.lvmengTanhuUsed=true;const won=await this.pindian(p,t,'探虎');if(!p.alive||!t.alive||this.over)return;
      const winner=won?p:t,loser=won?t:p;
      if(this.owned(loser,true).length)await this.takeOtherCard(winner,loser,'obtain');
      else this.log(`${winner.name}【探虎】拼赢，但${loser.name}已无区域内的牌可获得。`,'system');
      await this.flushSkillEvents();this.change();
    };
    P.lvmengGongxin=async function(p){if(!this.activeSkills(p).some(s=>s.key==='gongxin'&&s.ready))return;
      const targets=this.alive().filter(t=>t.id!==p.id&&t.hand.length),enemy=targets.filter(t=>this.hostility(p,t)>0).sort((a,b)=>b.hand.length-a.hand.length)[0];if(!targets.length)return;
      const id=await this.option(p,'攻心：选择观看手牌的角色',[...targets.map(t=>({key:String(t.id),label:label(t)})),{key:'cancel',label:'取消'}],String(enemy?.id??targets[0].id));if(id==='cancel')return;
      const t=this.get(Number(id));if(!t?.alive||!t.hand.length)return;
      const preferred=[...t.hand].sort((a,b)=>(b.suit==='H')-(a.suit==='H')||this.value(b,t)-this.value(a,t))[0];
      const chosen=await this.choose(p,{kind:'options',title:`攻心：观看${t.name}的手牌并选择一张展示`,detail:'只有你能看到这些手牌；取消不消耗次数。',options:[...t.hand.map(c=>({key:c.id,label:`${suitMark[c.suit]}${rankMark(c.rank)}【${c.name}】`,card:c})),{key:'cancel',label:'取消'}],revealedCards:[...t.hand]},()=>preferred.id);
      if(chosen==='cancel')return;const card=t.hand.find(c=>c.id===chosen);if(!card)return;
      p.lvmengGongxinUsed++;
      this.noteCardRevealed?.(t,card);this.log(`${p.name}【攻心】展示${t.name}的${suitMark[card.suit]}${rankMark(card.rank)}【${card.name}】。`,'reveal');
      const choice=await this.option(p,'攻心：如何处理展示牌？',[{key:'gain',label:'置于牌堆顶'},{key:'discard',label:'弃置此牌'}],'gain');
      if(!t.hand.some(c=>c.id===card.id))return;
      if(choice==='gain'){const moved=this.withLoss('move',()=>this.removeOwned(t,card.id).card);this.deck.push(moved);this.log(`${p.name}将【${card.name}】置于牌堆顶。`,'system');}
      else{this.discardOwned(t,[card.id]);}
      if(card.suit==='H'&&p.alive){this.draw(p,1);this.log(`${p.name}【攻心】展示红桃，摸一张牌。`,'draw');}
      await this.flushSkillEvents();this.change();
    };
    P.putDiscard=function(...cards){const result=putDiscard.call(this,...cards),p=this.get(this.turn);let changed=false;
      if(owner(this,p)&&this.phase==='出牌')for(const raw of cards){const c=this.physicalCard(raw);if(c&&this.discard.some(x=>x.id===c.id)&&['S','H','C','D'].includes(c.suit)&&!p.lvmengDiscardSuits.includes(c.suit)){p.lvmengDiscardSuits.push(c.suit);changed=true;}}
      if(changed)this.change();return result;
    };
    P.turnEndSkills=async function(){await turnEnd.call(this);const p=this.get(this.turn);if(!owner(this,p)||!p.lvmengAwakened||this.over||p.lvmengDiscardSuits.length<4)return;
      if(p.lvmengBotuRound!==this.round){p.lvmengBotuRound=this.round;p.lvmengBotuUsed=0;}
      const limit=2;if(p.lvmengBotuUsed>=limit)return;
      const choice=await this.option(p,`博图：四种花色进入弃牌堆，执行额外回合？（本轮${p.lvmengBotuUsed}/${limit}）`,[{key:'yes',label:'发动博图'},{key:'no',label:'暂不发动'}],'yes');if(choice!=='yes'||!p.alive||this.over)return;
      p.lvmengBotuUsed++;this.log(`${p.name}【博图】执行本轮第${p.lvmengBotuUsed}个额外回合。`,'turn');this.change();
      const previous=p.lvmengBotuExtraTurn;p.lvmengBotuExtraTurn=true;
      try{await this.takeTurn(p);if(p.alive&&!this.over)await this.turnEndSkills();}
      finally{p.lvmengBotuExtraTurn=previous;}
    };
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(p.general!=='lvmeng')return out;if(p.lvmengAwakened)out.push('勤学已觉醒');if(p.lvmengTanhuTargetId!=null&&this.turn===p.id)out.push('探虎 '+this.get(p.lvmengTanhuTargetId)?.name);
      if(!compact&&this.turn===p.id){const suits=p.lvmengDiscardSuits||[];out.push(`本回合入弃牌堆花色 ${suits.length?suits.map(s=>suitMark[s]).join('、'):'无'}（${suits.length}/4）`);}
      return out;
    };
  }
  const api={install};root.ZhenLvmengSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
