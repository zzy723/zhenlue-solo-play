(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{defs}=C;
    const init=P.initExtra,handLimit=P.handLimit,distance=P.distance,roundEnd=P.roundEndSkills;
    const playStart=P.playStartSkills,dying=P.dying,begin=P.beginTurnSkills,mark=P.markCardUse;
    const preparation=P.preparationSkills,finish=P.finishPhaseSkills,canUse=P.canUse,damage=P.damage;
    const responseOptions=P.responseSkillOptions,prepareResponse=P.prepareResponseSkill;
    const active=P.activeSkills,aiPlay=P.aiPlay,prepare=P.prepareActive,states=P.dynastyStates;
    const suits=['S','H','C','D'];
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'old_dongzhuo');
    const lord=(g,p)=>owner(g,p)&&g.options.mode==='identity'&&p.role==='主公';
    const suitName=s=>C.suitMark[s]||s;
    P.initExtra=function(p){init.call(this,p);Object.assign(p,{dongzhuoGuanbian:p.general==='old_dongzhuo',dongzhuoJiuchi:false,dongzhuoBenghuaiSuppressedTurn:-1,dongzhuoBlackCount:0,dongzhuoMilestones:[],dongzhuoFengshangSuits:[],dongzhuoFengshangPlayTurn:-1,dongzhuoFenchengUsed:false,dongzhuoFencheng:false,dongzhuoBenghuai:false});};
    P.handLimit=function(p){return handLimit.call(this,p)+(owner(this,p)&&p.dongzhuoGuanbian?this.players.length:0);};
    P.distance=function(from,to){const n=distance.call(this,from,to);if(from?.id===to?.id)return n;
      return n+(owner(this,from)&&from.dongzhuoGuanbian?this.players.length:0)+(owner(this,to)&&to.dongzhuoGuanbian?this.players.length:0);
    };
    P.dongzhuoLoseGuanbian=function(p,reason){if(!owner(this,p)||!p.dongzhuoGuanbian)return;
      p.dongzhuoGuanbian=false;p.dongzhuoJiuchi=true;this.log(`${p.name}因${reason}失去【观变】，获得【酒池】：黑桃手牌可当【酒】，使用【酒】无次数限制。`,'system');this.change();
    };
    const hasJiuchi=(g,p)=>owner(g,p)&&p.dongzhuoJiuchi&&!p.silenced;
    P.canUse=function(p,c){return c?.key==='wine'&&hasJiuchi(this,p)&&this.allowedUse(p,c)||canUse.call(this,p,c);};
    P.responseSkillOptions=function(p,type,played=false){const out=responseOptions.call(this,p,type,played);
      if(type==='wine'&&!played&&hasJiuchi(this,p))for(const c of p.hand.filter(c=>c.suit==='S'))out.push({key:'jiuchi:'+c.id,label:`酒池：${c.name}当酒`,card:c});
      return out;
    };
    P.prepareResponseSkill=async function(p,key){if(!key.startsWith('jiuchi:'))return prepareResponse.call(this,p,key);
      const id=key.slice(7),raw=p.hand.find(c=>c.id===id&&c.suit==='S');if(!hasJiuchi(this,p)||!raw)return null;
      const cost=this.removeHand(p,id);return {...defs.wine,virtual:true,costs:[cost],suit:cost.suit,rank:cost.rank,originSkill:'jiuchi',noQuota:true};
    };
    P.roundEndSkills=async function(){await roundEnd.call(this);if(this.round!==1)return;
      for(const p of this.players)if(owner(this,p))this.dongzhuoLoseGuanbian(p,'首轮结束');
    };
    P.beginTurnSkills=function(){begin.call(this);for(const p of this.players)p.dongzhuoFengshangSuits=[];};
    P.playStartSkills=async function(p){await playStart.call(this,p);if(!owner(this,p)||p.silenced||this.over||!this.owned(p).length||this.alive().length<2)return;
      const pool=this.owned(p),enemies=this.alive().filter(t=>t.id!==p.id&&this.hostility(p,t)>.5);
      const responseChance=(t,suit)=>Math.min(.85,t.hand.length*.22+(Object.values(t.equip||{}).some(c=>c?.suit===suit)?.45:0));
      const scored=[...pool].map(c=>({card:c,score:enemies.reduce((n,t)=>n+4-responseChance(t,c.suit)*2,0)-this.value(c,p)/3-this.alive().filter(t=>t.id!==p.id&&this.hostility(p,t)<-.5).reduce((n,t)=>n+3-responseChance(t,c.suit),0)})).sort((a,b)=>b.score-a.score);
      const use=await this.option(p,'凶逆：弃一张牌，令其他角色弃同花色牌或受1点伤害？',[{key:'yes',label:'发动凶逆'},{key:'no',label:'不发动'}],scored[0]?.score>0?'yes':'no');
      if(use!=='yes')return;
      const id=await this.option(p,'凶逆：选择弃置的牌',pool.map(c=>({key:c.id,label:`${c.name} ${suitName(c.suit)}${c.rank}`,card:c})),scored[0].card.id);
      const card=pool.find(c=>c.id===id);if(!card)return;
      const suit=card.suit;this.discardOwned(p,[id]);this.dongzhuoLoseGuanbian(p,'发动凶逆');
      this.log(`${p.name}发动【凶逆】，弃置${suitName(suit)}牌；其他角色需弃同花色牌或受到1点伤害。`,'system');
      for(const t of this.actionOrder(this.alive().filter(t=>t.id!==p.id))){
        if(!p.alive||this.over)break;if(!t.alive)continue;
        const matching=this.owned(t).filter(c=>c.suit===suit);
        if(matching.length){const cheap=[...matching].sort((a,b)=>this.value(a,t)-this.value(b,t))[0];
          const choice=await this.option(t,`凶逆：弃置一张${suitName(suit)}牌`,matching.map(c=>({key:c.id,label:`弃置${c.name}`,card:c})),cheap.id);
          if(matching.some(c=>c.id===choice))this.discardOwned(t,[choice]);
        }else{this.log(`${t.name}没有${suitName(suit)}牌，受到${p.name}造成的1点伤害。`,'damage');await this.damage(p,t,1,'normal',{skill:'xiongni'});}
      }
      this.change();
    };
    P.dongzhuoFengshangPairs=function(p){
      if(p.silenced)return [];
      const current=new Set(this._discardedTurn||[]),available=this.discard.filter(c=>current.has(c.id));
      return suits.filter(s=>!p.dongzhuoFengshangSuits.includes(s)&&available.filter(c=>c.suit===s).length>=2);
    };
    P.dongzhuoFengshang=async function(p,dyingTarget=null){
      if(!owner(this,p)||this.alive().length<2||!this.dongzhuoFengshangPairs(p).length)return false;
      const available=this.dongzhuoFengshangPairs(p),candidate=available.map(s=>({s,cards:this.discard.filter(c=>(this._discardedTurn||[]).includes(c.id)&&c.suit===s)}));
      const preferred=[...candidate].sort((a,b)=>a.cards.slice(0,2).reduce((n,c)=>n+this.value(c,p),0)-b.cards.slice(0,2).reduce((n,c)=>n+this.value(c,p),0))[0];
      const suit=await this.option(p,'封赏：选择本回合尚未使用的花色',available.map(s=>({key:s,label:`${suitName(s)} · ${candidate.find(x=>x.s===s).cards.length}张可选`})),preferred.s);
      if(!available.includes(suit))return false;
      const cards=this.discard.filter(c=>(this._discardedTurn||[]).includes(c.id)&&c.suit===suit);
      const suggested=[...cards].sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,2).map(c=>c.id);
      const ids=await this.selectCards(p,'封赏：选择弃牌堆中两张同花色牌',cards,2,2,suggested,'两张牌将分别交给两名不同角色，每人一张。');
      const chosen=ids.map(id=>this.discard.find(c=>c.id===id)).filter(Boolean);if(chosen.length!==2)return false;
      p.dongzhuoFengshangSuits.push(suit);
      if(!dyingTarget)p.dongzhuoFengshangPlayTurn=this.totalTurns;
      this.dongzhuoLoseGuanbian(p,'发动封赏');
      const chosenIds=new Set(chosen.map(c=>c.id));this.discard=this.discard.filter(c=>!chosenIds.has(c.id));
      const selected=[];let obtained=false;
      for(const card of chosen){
        const recipients=this.alive().filter(t=>!selected.includes(t.id));
        if(!recipients.length){this.putDiscard(card);continue;}
        const preferredRecipient=[...recipients].sort((a,b)=>{
          const score=t=>(t.id===dyingTarget?.id&&this.hostility(p,t)<0?6:0)+(t.id===p.id?3:0)-this.hostility(p,t)*2;
          return score(b)-score(a);
        })[0];
        const id=await this.option(p,`封赏：把${suitName(card.suit)}${card.rank}【${card.name}】交给谁？`,recipients.map(t=>({key:String(t.id),label:`${t.name} · 手牌${t.hand.length}`})),String(preferredRecipient.id));
        const recipient=this.get(Number(id));if(!recipient?.alive||selected.includes(recipient.id)){this.putDiscard(card);continue;}
        selected.push(recipient.id);obtained ||= recipient.id===p.id;this.gain(recipient,[card]);
        this.log(`${p.name}【封赏】令${recipient.name}获得【${card.name}】。`,'draw');
      }
      if(!obtained&&p.alive&&!this.over){
        const wine={...defs.wine,id:`fengshang-${this.totalTurns}-${p.id}-${suit}`,virtual:true,costs:[],rank:0,suit:'N',noQuota:true,originSkill:'fengshang'};
        await this.markCardUse(p,wine,[]);this.showCardAction(p,wine,[],'封赏饮酒');
        if(dyingTarget?.id===p.id&&p.hp<=0)this.heal(p,1);
        else p.drunk=1;
        this.log(`${p.name}【封赏】未获得牌，视为使用一张不计次数的【酒】。`,'system');
        await this.afterCardUse(p,wine,[]);
      }
      this.change();return true;
    };
    P.dying=async function(target,source){
      for(const p of this.actionOrder(this.alive().filter(t=>owner(this,t)))){
        if(target.hp>0||this.over)break;
        if(!this.dongzhuoFengshangPairs(p).length)continue;
        const useful=this.hostility(p,target)<0||target.id===p.id;
        const answer=await this.option(p,`封赏：${target.name}进入濒死，是否分配两张同花色弃牌？`,[{key:'yes',label:'发动封赏'},{key:'no',label:'暂不发动'}],useful?'yes':'no');
        if(answer==='yes')await this.dongzhuoFengshang(p,target);
      }
      if(target.hp>0)return;
      return dying.call(this,target,source);
    };
    P.markCardUse=async function(p,c,targets){const valid=await mark.call(this,p,c,targets);
      if(valid&&hasJiuchi(this,p)&&C.isSlash(c)&&p.drunk>0)c.dongzhuoWineSlash=true;
      if(valid&&p?.alive&&p.general!=='old_dongzhuo'&&this.general(p).faction==='群'&&['S','C'].includes(c.suit)&&c.key!=='jink'&&(!['slash','fireSlash','thunderSlash'].includes(c.key)||targets?.length)){
        for(const dong of this.players.filter(t=>lord(this,t)))dong.dongzhuoBlackCount++;
      }
      return valid;
    };
    P.damage=async function(source,target,amount,nature='normal',context={}){const dealt=await damage.call(this,source,target,amount,nature,context);
      if(dealt>0&&hasJiuchi(this,source)&&context.card?.dongzhuoWineSlash)source.dongzhuoBenghuaiSuppressedTurn=this.totalTurns;
      return dealt;
    };
    P.preparationSkills=async function(p){await preparation.call(this,p);if(!lord(this,p)||this.over)return;
      const milestones=[3,6,9];
      for(const threshold of milestones){
        if(p.dongzhuoBlackCount<threshold||p.dongzhuoMilestones.includes(threshold))continue;
        p.dongzhuoMilestones.push(threshold);
        if(threshold===3){p.maxHp++;this.heal(p,1);this.log(`${p.name}【执柄】达到3张黑色牌：体力上限+1并回复1点体力。`,'system');}
        else if(threshold===6){p.dongzhuoFencheng=true;this.log(`${p.name}【执柄】达到6张黑色牌：获得【焚城】。`,'system');}
        else{p.dongzhuoBenghuai=true;this.log(`${p.name}【执柄】达到9张黑色牌：获得【崩坏】。`,'system');}
      }
      this.change();
    };
    P.dongzhuoFenchengUse=async function(p){if(!lord(this,p)||p.silenced||!p.dongzhuoFencheng||p.dongzhuoFenchengUsed)return;
      const others=this.alive().filter(t=>t.id!==p.id);if(!others.length)return;
      const preferred=[...others].sort((a,b)=>this.hostility(p,b)-this.hostility(p,a)||a.hand.length-b.hand.length)[0];
      const id=await this.option(p,'焚城：选择首名结算角色',others.map(t=>({key:String(t.id),label:t.name+' · 手牌'+t.hand.length})),String(preferred.id));
      const first=this.get(Number(id));if(!first?.alive)return;
      p.dongzhuoFenchengUsed=true;this.log(`${p.name}发动限定技【焚城】。`,'system');
      const order=[...others].sort((a,b)=>(a.id-first.id+this.players.length)%this.players.length-(b.id-first.id+this.players.length)%this.players.length);
      let previous=0;
      for(const t of order){
        if(!p.alive||this.over)break;if(!t.alive)continue;
        const pool=this.owned(t),min=previous+1;
        const canDiscard=pool.length>=min;
        const cheap=[...pool].sort((a,b)=>this.value(a,t)-this.value(b,t)).slice(0,min);
        const choice=await this.option(t,`焚城：弃至少${min}张牌或受到2点火焰伤害`,[
          ...(canDiscard?[{key:'discard',label:`弃置至少${min}张牌`}]:[]),{key:'fire',label:'受到2点火焰伤害'}
        ],canDiscard&&(t.hp<=2||cheap.reduce((n,c)=>n+this.value(c,t),0)<14)?'discard':'fire');
        if(choice==='discard'&&canDiscard){
          const ids=await this.selectCards(t,`焚城：弃置至少${min}张牌`,pool,min,pool.length,cheap.map(c=>c.id),'弃置越多，下家必须弃置的牌也越多。');
          this.discardOwned(t,ids);previous=ids.length;
        }else{previous=0;await this.damage(p,t,2,'fire',{skill:'fencheng'});}
      }
      this.change();
    };
    P.finishPhaseSkills=async function(p){await finish.call(this,p);if(!lord(this,p)||!p.dongzhuoBenghuai||!p.alive||this.over||p.dongzhuoBenghuaiSuppressedTurn===this.totalTurns)return;
      if(!this.alive().some(t=>t.id!==p.id&&t.hp<p.hp))return;
      const choice=await this.option(p,'崩坏：失去1点体力或减少1点体力上限',[{key:'hp',label:'失去1点体力'},{key:'max',label:'减少1点体力上限'}],p.hp<=1&&p.maxHp>1?'max':'hp');
      if(choice==='max'&&p.maxHp>1){const old=p.hp;p.maxHp--;p.hp=Math.min(p.hp,p.maxHp);this.hpChanged?.(p,old);this.log(`${p.name}【崩坏】体力上限-1。`,'system');}
      else await this.loseHp(p,1,'崩坏');
      this.change();
    };
    P.activeSkills=function(p){const list=active.call(this,p);if(!owner(this,p))return list;
      const ownTurn=this.isPlayPhaseOwner(p);
      list.push({key:'fengshang',name:'封赏',detail:`本回合已用花色 ${p.dongzhuoFengshangSuits.map(suitName).join('、')||'无'}`,ready:ownTurn&&p.dongzhuoFengshangPlayTurn!==this.totalTurns&&this.alive().length>=2&&this.dongzhuoFengshangPairs(p).length>0,reason:'需要本回合弃牌堆中两张同花色牌，且出牌阶段尚未发动'});
      if(p.dongzhuoJiuchi)list.push({key:'jiuchi',name:'酒池',detail:'黑桃手牌当酒 · 酒无次数限制',ready:ownTurn&&hasJiuchi(this,p)&&p.hand.some(c=>c.suit==='S')});
      if(lord(this,p)&&p.dongzhuoFencheng)list.push({key:'fencheng',name:'焚城',detail:'限定技 · 全场弃牌或受2点火焰伤害',ready:ownTurn&&!p.silenced&&!p.dongzhuoFenchengUsed&&this.alive().length>1});
      return list;
    };
    P.aiPlay=function(p,actions){const rest=aiPlay.call(this,p,actions.filter(a=>!['fengshang','fencheng','jiuchi'].includes(a.skill)));
      if(!owner(this,p)||rest.type!=='end')return rest;
      const feng=actions.find(a=>a.skill==='fengshang');
      if(feng&&(this.alive().some(t=>t.id!==p.id&&this.hostility(p,t)<-.5)||p.hand.some(c=>['slash','fireSlash','thunderSlash'].includes(c.key))))return feng;
      const fire=actions.find(a=>a.skill==='fencheng');
      if(fire&&this.alive().filter(t=>t.id!==p.id&&this.hostility(p,t)>0).length>=this.alive().length-2)return fire;
      const wine=actions.find(a=>a.skill==='jiuchi');
      if(wine&&!p.drunk&&p.hand.some(c=>C.isSlash(c))&&this.alive().some(t=>this.hostility(p,t)>0&&this.canSlash(p,t)))return wine;
      return rest;
    };
    P.prepareActive=async function(p,a){
      if(a.skill==='jiuchi'){
        if(!this.activeSkills(p).some(s=>s.key==='jiuchi'&&s.ready))return null;
        const cards=p.hand.filter(c=>c.suit==='S'),cheap=[...cards].sort((x,y)=>this.value(x,p)-this.value(y,p))[0];
        const id=await this.option(p,'酒池：选择一张黑桃手牌当【酒】',[...cards.map(c=>({key:c.id,label:`${c.name} ${suitName(c.suit)}${c.rank}`,card:c})),{key:'cancel',label:'取消'}],cheap.id);
        if(id==='cancel'||!cards.some(c=>c.id===id))return null;
        const cost=this.removeHand(p,id);return {card:{...defs.wine,virtual:true,costs:[cost],suit:cost.suit,rank:cost.rank,originSkill:'jiuchi',noQuota:true},action:{targets:[]}};
      }
      if(a.skill==='fengshang'){if(this.activeSkills(p).some(s=>s.key===a.skill&&s.ready))await this.dongzhuoFengshang(p);return null;}
      if(a.skill==='fencheng'){if(this.activeSkills(p).some(s=>s.key===a.skill&&s.ready))await this.dongzhuoFenchengUse(p);return null;}
      return prepare.call(this,p,a);
    };
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(!owner(this,p))return out;
      if(p.dongzhuoGuanbian)out.push(`观变 · 距离与手牌上限 +${this.players.length}`);
      if(p.dongzhuoJiuchi)out.push('酒池 · 黑桃手牌可当酒');
      if(lord(this,p))out.push(`执柄 ${p.dongzhuoBlackCount}张黑牌${p.dongzhuoFencheng?' · 焚城':''}${p.dongzhuoBenghuai?' · 崩坏':''}`);
      return out;
    };
  }
  const api={install};root.ZhenDongzhuoSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
