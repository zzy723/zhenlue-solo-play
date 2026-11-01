(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{defs,isSlash,isRed}=C;
    const init=P.initExtra,prepare=P.preparationSkills,playStart=P.playStartSkills;
    const mark=P.markCardUse,afterDamage=P.afterDamageEvent,dying=P.dying;
    const phaseDraw=P.phaseDrawCount,handLimit=P.handLimit,canUse=P.canUse,declaredSlash=P.declaredSlash;
    const owner=(g,p)=>p?.alive&&g.isGeneral(p,'shensunce');
    P.initExtra=function(p){init.call(this,p);p.sunceAwakened=false;p.sunceZhibaUsed=false;p.sunceLiantao=null;p.sunceNoSlashTurn=-1;p.sunceHandLimitTurn=-1;};
    P.phaseDrawCount=function(p,normal){const count=phaseDraw?phaseDraw.call(this,p,normal):normal;return owner(this,p)&&p.sunceAwakened?count+1:count;};
    P.handLimit=function(p){const base=owner(this,p)&&p.sunceAwakened?p.maxHp:handLimit.call(this,p);return base+(owner(this,p)&&p.sunceHandLimitTurn===this.totalTurns?1:0);};
    P.canUse=function(p,c){if(owner(this,p)&&p.sunceNoSlashTurn===this.totalTurns&&isSlash(c))return false;return canUse.call(this,p,c);};
    P.declaredSlash=async function(p,target,raw){if(owner(this,p)&&p.sunceNoSlashTurn===this.totalTurns){this.log(`${p.name}因【连讨】本回合不能使用【杀】。`,'system');if(raw.virtual)(raw.costs||[]).forEach(c=>this.drop(c));else this.drop(raw);return;}return declaredSlash.call(this,p,target,raw);};
    P.preparationSkills=async function(p){await prepare.call(this,p);if(!owner(this,p)||!p.sunceAwakened||p.hp>=p.maxHp||this.over)return;
      const x=p.maxHp-p.hp,targets=this.alive().filter(t=>t.id!==p.id);if(!targets.length)return;
      const friend=targets.filter(t=>this.hostility(p,t)<0).sort((a,b)=>a.hand.length-b.hand.length)[0];
      const enemy=targets.filter(t=>this.hostility(p,t)>0).sort((a,b)=>b.hand.length-a.hand.length)[0];
      const suggested=friend&&x>=2?friend:enemy||friend;
      const id=await this.option(p,'英魂※：选择一名其他角色',[...targets.map(t=>({key:String(t.id),label:`${t.name} · 手牌${t.hand.length}`})),{key:'pass',label:'不发动英魂※'}],suggested?String(suggested.id):'pass');
      if(id==='pass')return;const target=this.get(Number(id));if(!target?.alive)return;
      const support=this.hostility(p,target)<0;
      const mode=await this.option(p,'英魂※：选择摸牌与弃牌方式',[{key:'support',label:`摸${x}张，弃1张`},{key:'pressure',label:`摸1张，弃${x}张`}],support?'support':'pressure');
      const draw=mode==='support'?x:1,discard=mode==='support'?1:x;
      this.draw(target,draw);await this.flushSkillEvents();if(target.alive&&this.owned(target).length){const pool=this.owned(target),n=Math.min(discard,pool.length),cheap=[...pool].sort((a,b)=>this.value(a,target)-this.value(b,target)).slice(0,n).map(c=>c.id);const ids=await this.selectCards(target,`英魂※：弃置${n}张牌`,pool,n,n,cheap);this.discardOwned(target,ids);}
      this.log(`${p.name}发动【英魂※】，令${target.name}摸${draw}张、弃${discard}张。`,'system');
    };
    P.markCardUse=async function(p,c,targets){const valid=await mark.call(this,p,c,targets);if(!valid||!targets?.length)return valid;
      if(c.key==='duel'||isSlash(c)&&isRed(c))for(const t of targets){
        if(owner(this,p)&&t?.id!==p.id){this.draw(p,1);this.log(`${p.name}【激昂】使用【${c.name}】指定${t.name}，摸一张牌。`,'draw');}
        if(owner(this,t)&&p?.id!==t.id){this.draw(t,1);this.log(`${t.name}【激昂】成为【${c.name}】的目标，摸一张牌。`,'draw');}
      }return valid;};
    P.afterDamageEvent=async function(source,target,amount,context,generation){if(afterDamage)await afterDamage.call(this,source,target,amount,context,generation);
      const card=context?.card,liantao=source?.sunceLiantao;
      if(liantao&&card?.originSkill==='liantao'&&target?.id===liantao.targetId&&source.id===liantao.ownerId)liantao.damage+=amount;
    };
    P.playStartSkills=async function(p){await playStart.call(this,p);if(!owner(this,p)||!p.alive||this.over||this.alive().length<2)return;
      const targets=this.alive().filter(t=>t.id!==p.id),enemy=targets.filter(t=>this.hostility(p,t)>0).sort((a,b)=>a.hp-b.hp)[0];
      const id=await this.option(p,'连讨：选择一名角色，或不发动',[...targets.map(t=>({key:String(t.id),label:`${t.name} · ${t.hp}血`})),{key:'pass',label:'不发动连讨'}],enemy&&p.hp>1?String(enemy.id):'pass','结算中摸到的同色手牌也可以继续当决斗使用。');
      if(id==='pass')return;const target=this.get(Number(id));if(!target?.alive)return;
      // Consume the suggestion's random draw in both live play and replay.
      const suggestedColor=this.random()<.5?'red':'black';
      const color=await this.option(target,'连讨：选择红色或黑色',[{key:'red',label:'红色'},{key:'black',label:'黑色'}],suggestedColor,'孙策随后展示手牌，所选颜色的牌将依次当决斗对你使用。');
      const snapshot=[...p.hand];
      for(const card of snapshot)this.noteCardRevealed?.(p,card);
      this.log(`${p.name}发动【连讨】，展示${snapshot.length}张手牌；${target.name}选择${color==='red'?'红':'黑'}色。`,'reveal');
      p.sunceLiantao={ownerId:p.id,targetId:target.id,stopped:false,damage:0};
      try{while(p.alive&&target.alive&&!this.over&&!p.sunceLiantao.stopped){
        const available=p.hand.filter(c=>isRed(c)===(color==='red'));if(!available.length)break;
        const selected=[...available].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
        const cardId=available.length===1?selected.id:await this.option(p,'连讨：选择下一张当决斗的手牌',available.map(c=>({key:c.id,label:`${c.name} ${C.suitMark[c.suit]}${C.rankMark(c.rank)}`,card:c})),selected.id);
        const raw=this.removeHand(p,cardId),card={...defs.duel,id:`liantao-${raw.id}`,virtual:true,costs:[raw],suit:raw.suit,rank:raw.rank,originSkill:'liantao'};
        this.showCardAction(p,card,[target],'连讨');this.sound('card',{playerId:p.id,cardKey:'duel',kind:'trick'});
        this.log(`${p.name}【连讨】将【${raw.name}】当【决斗】对${target.name}使用。`,'use');
        try{const valid=await this.markCardUse(p,card,[target]);if(valid&&await this.trickAllowed(p,target,card)&&target.alive&&!this.over)await this.singleTrick(p,target,card);}
        finally{this.drop(raw);await this.afterCardUse(p,card,[target]);}
      }}finally{const damage=p.sunceLiantao?.damage||0;p.sunceLiantao=null;
        if(p.alive&&!this.over&&!damage){this.draw(p,1);p.sunceNoSlashTurn=this.totalTurns;p.sunceHandLimitTurn=this.totalTurns;this.log(`${p.name}【连讨】未对目标造成伤害，摸一张牌；本回合手牌上限+1且不能使用【杀】。`,'system');}
      }
    };
    P.dying=async function(p,source){const entering=p.hp<=0;
      for(const actor of this.players)if(actor.sunceLiantao&&[actor.id,actor.sunceLiantao.targetId].includes(p.id))actor.sunceLiantao.stopped=true;
      if(entering&&owner(this,p)&&!p.sunceAwakened){
        p.sunceAwakened=true;p.armor=(p.armor||0)+1;this.draw(p,3);
        this.log(`${p.name}【魂姿】觉醒：获得1点护甲、摸三张牌，获得【英姿※】与【英魂※】。`,'system');this.change();await this.flushSkillEvents();
      }
      if(owner(this,p)&&p.hp<=0&&!p.sunceZhibaUsed&&this.options.mode==='identity'&&p.role==='主公'){
        const others=this.alive().filter(t=>t.id!==p.id&&this.general(t).faction==='吴'),x=others.length;
        const choice=await this.option(p,`制霸：回复${x}点体力，然后其他吴将各受1点伤害？`,[{key:'yes',label:'发动限定技制霸'},{key:'no',label:'暂不发动'}],x>0?'yes':'no');
        if(choice==='yes'){
          p.sunceZhibaUsed=true;if(x)this.heal(p,x);this.log(`${p.name}发动【制霸】，回复${x}点体力；其他吴将依次受1点无来源伤害。`,'system');
          for(const ally of this.actionOrder(others)){
            if(!ally.alive||this.over)continue;
            await this.damage(null,ally,1,'normal',{skill:'zhiba'});
            if(!ally.alive&&p.alive&&!this.over){this.draw(p,3);this.log(`${p.name}【制霸】因${ally.name}死亡摸三张牌。`,'draw');}
          }
        }
      }
      if(p.hp<=0&&!this.over)await dying.call(this,p,source);
    };
  }
  const api={install};root.ZhenSunceSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
