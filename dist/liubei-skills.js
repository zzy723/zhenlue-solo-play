(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{defs,isSlash}=C;
    const init=P.initExtra,active=P.activeSkills,ai=P.aiPlay,prepare=P.prepareActive;
    const response=P.response,responseOptions=P.responseSkillOptions,prepareResponse=P.prepareResponseSkill;
    const mark=P.markCardUse,after=P.afterCardUse,played=P.afterPlayedCard,states=P.dynastyStates;
    const isLiu=(game,p)=>p?.alive&&game.isGeneral(p,'liubei');
    const basics=['slash','fireSlash','thunderSlash','peach','wine'];
    const helper=(game,p)=>game.alive().filter(q=>q.id!==p.id&&game.general(q).faction==='蜀');
    P.initExtra=function(p){init.call(this,p);p.liubeiRende=0;p.liubeiRendeGiftTurn=-1;p.liubeiRendeGiftCount=0;p.liubeiDezhuTurn=-1;p.liubeiJijiangTurn=-1;};
    P.liubeiRendeCards=function(p){if(!isLiu(this,p)||!this.isPlayPhaseOwner(p)||!p.hand.length||this.alive().length<2)return [];return basics.map(key=>({...defs[key],id:'liubei-'+key,virtual:true,originSkill:'rende',costs:[],suit:'N',rank:0})).filter(c=>this.skillActionsFor(p,c).length);};
    P.activeSkills=function(p){const list=active.call(this,p);if(!isLiu(this,p))return list;
      list.push({key:'rende',name:'仁德',detail:'交牌得标记；交至少2张可使用基本牌；每回合内每累计交3张摸1张；交空可选失血令受赠者回血',ready:this.isPlayPhaseOwner(p)&&p.hand.length>0&&this.alive().length>1,reason:'仅自己的出牌阶段可发动，且须有手牌和其他角色'});
      if(this.options.mode==='identity'&&p.role==='主公')list.push({key:'jijiang',name:'激将',detail:'请其他蜀将使用杀',ready:helper(this,p).length>0&&this.targets(p,defs.slash).length>0&&p.liubeiJijiangTurn!==this.totalTurns,reason:'没有可应援的蜀将或合法目标'});
      return list;};
    P.aiPlay=function(p,actions){const ordinary=actions.filter(a=>!['rende','jijiang'].includes(a.skill));let result=ai.call(this,p,ordinary);if(!isLiu(this,p))return result;
      if(result.type==='end'&&actions.some(a=>a.skill==='rende')&&this.alive().some(t=>t.id!==p.id&&this.hostility(p,t)<0)&&p.hand.length>=2)return {type:'skill',skill:'rende'};
      if(result.type==='end'&&actions.some(a=>a.skill==='jijiang')&&helper(this,p).some(t=>this.hostility(p,t)<0&&t.hand.some(isSlash))&&this.targets(p,defs.slash).some(t=>this.hostility(p,t)>0))return {type:'skill',skill:'jijiang'};
      return result;};
    P.liubeiGive=async function(p,virtual,min=1,max=p.hand.length){
      const others=this.alive().filter(t=>t.id!==p.id);if(p.hand.length<min||!others.length)return null;
      const friend=[...others].sort((a,b)=>this.hostility(p,a)-this.hostility(p,b))[0];
      const targetId=await this.option(p,'仁德：选择获得手牌的角色',[...others.map(t=>({key:String(t.id),label:`${t.name} · ${t.hp}血`})),{key:'cancel',label:'取消'}],String(friend.id));
      if(targetId==='cancel')return null;const target=this.get(Number(targetId));
      const sorted=[...p.hand].sort((a,b)=>this.value(a,p)-this.value(b,p));
      const count=target.hp<target.maxHp&&p.hp>1&&p.hand.length<=2?p.hand.length:Math.min(p.hand.length,p.hp<=2?1:2);
      const ids=await this.selectCards(p,'仁德：选择交出的手牌',p.hand,min,Math.min(max,p.hand.length),sorted.slice(0,Math.max(min,Math.min(max,count))).map(c=>c.id),'交至少两张才视为使用或打出基本牌；交出全部手牌时，你可以失去1点体力，令受赠者回复1点体力，也可放弃整项交换。每个角色回合内，通过仁德每累计交出三张手牌，摸一张牌；可多次获得，余数继续累计。');
      if(!ids?.length)return null;const all=ids.length===p.hand.length;
      const gifts=this.moveBatch(p,()=>ids.map(id=>this.removeHand(p,id)));
      for(const card of gifts)this.table=this.table.filter(c=>c.id!==card.id);
      this.gain(target,gifts);this.evidence(p,target,true);
      this.log(`${p.name}发动【仁德】，交给${target.name}${gifts.length}张手牌。`,'system');
      if(p.liubeiRendeGiftTurn!==this.totalTurns){p.liubeiRendeGiftTurn=this.totalTurns;p.liubeiRendeGiftCount=0;}
      const rewarded=Math.floor(p.liubeiRendeGiftCount/3);
      p.liubeiRendeGiftCount+=gifts.length;
      const reward=Math.floor(p.liubeiRendeGiftCount/3)-rewarded;
      if(reward>0){
        this.draw(p,reward);
        this.log(`${p.name}本回合通过【仁德】累计交出${p.liubeiRendeGiftCount}张手牌，每三张奖励一张，本次摸${reward}张牌。`,'draw');
      }
      return {...virtual,originSkill:'rende',rendeCount:gifts.length,rendeTargetId:target.id,rendeAllHand:all};
    };
    P.prepareActive=async function(p,a){if(a.skill==='jijiang'){
        const targets=this.targets(p,defs.slash);if(!targets.length)return null;
        const preferred=[...targets].sort((x,y)=>this.hostility(p,y)-this.hostility(p,x))[0];
        const targetId=await this.option(p,'激将：选择杀的目标',[...targets.map(t=>({key:String(t.id),label:`${t.name} · ${t.hp}血`})),{key:'cancel',label:'取消'}],String(preferred.id));
        if(targetId!=='cancel'){p.liubeiJijiangTurn=this.totalTurns;await this.liubeiAskSlash(p,this.get(Number(targetId)));}
        return null;
      }
      if(a.skill!=='rende')return prepare.call(this,p,a);
      if(!this.isPlayPhaseOwner(p)||!p.hand.length)return null;
      const available=this.liubeiRendeCards(p),given=await this.liubeiGive(p,null,1,available.length?p.hand.length:1);
      if(!given)return null;
      if(given.rendeCount<2){await this.liubeiFinishRende(p,given);return null;}
      const cards=available.filter(c=>this.skillActionsFor(p,c).length);if(!cards.length){await this.liubeiFinishRende(p,given);return null;}
      const preferred=cards.find(c=>c.key==='peach'&&p.hp<p.maxHp)||cards.find(c=>isSlash(c)&&this.targets(p,c).some(t=>this.hostility(p,t)>0))||cards[0];
      const key=await this.option(p,'仁德：选择视为使用的基本牌',cards.map(c=>({key:c.key,label:c.name})),preferred.key);
      const card=cards.find(c=>c.key===key),actions=this.skillActionsFor(p,card);if(!card||!actions.length){await this.liubeiFinishRende(p,given);return null;}
      const best=this.cardPlan(p,card)||actions[0];let action=best;
      if(actions.length>1){const id=await this.option(p,'仁德：选择基本牌目标',actions.map((x,i)=>({key:String(i),label:x.targets.map(t=>this.get(t).name).join('、')||'自己'})),String(Math.max(0,actions.indexOf(best))));action=actions[Number(id)];}
      return {card:{...card,...given},action};
    };
    P.responseSkillOptions=function(p,type,wasPlayed=false){const list=responseOptions.call(this,p,type,wasPlayed);const controlled=this.controlledSeats?.has(p.id),friend=this.alive().some(t=>t.id!==p.id&&this.hostility(p,t)<0);
      if(isLiu(this,p)&&this.turn===p.id&&p.hand.length>=2&&this.alive().length>1&&(controlled||friend||p.hp<=1)&&['slash','jink','peach','wine'].includes(type))list.push({key:'rende:'+type,label:'仁德：交至少两张手牌视为'+defs[type].name});return list;};
    P.prepareResponseSkill=async function(p,key){if(!key.startsWith('rende:'))return prepareResponse.call(this,p,key);const type=key.slice(6);if(!isLiu(this,p)||this.turn!==p.id||p.hand.length<2||!defs[type])return null;return this.liubeiGive(p,{...defs[type],id:'liubei-'+type,virtual:true,costs:[],suit:'N',rank:0,originSkill:'rende'},2);};
    P.liubeiAskSlash=async function(p,target){for(const q of helper(this,p)){
      if(!q.alive||!target.alive||this.over)break;
      const physical=q.hand.filter(isSlash),skills=this.responseSkillOptions(q,'slash',true);
      if(!physical.length&&!skills.length)continue;
      const opts=[...physical.map(c=>({key:c.id,label:'应激将：'+c.name,card:c})),...skills,{key:'pass',label:'不响应激将'}];
      const key=await this.option(q,`${p.name}激将：是否对${target.name}使用杀？`,opts,this.hostility(q,p)<0&&this.hostility(q,target)>0?(physical[0]?.id||skills[0]?.key):'pass');
      if(key==='pass')continue;const raw=key.includes(':')?await this.prepareResponseSkill(q,key):this.removeHand(q,key);
      if(!raw)continue;this.log(`${q.name}响应${p.name}【激将】，亲自使用【杀】。`,'use');await this.declaredSlash(q,target,raw);return true;
    }return false;};
    P.response=async function(p,type,title,ignoreArmor=false,context={}){if(type==='slash'&&isLiu(this,p)&&this.options.mode==='identity'&&p.role==='主公'&&helper(this,p).length){
      const yes=await this.option(p,'激将：请其他蜀势力角色出杀？',[{key:'yes',label:'发动激将'},{key:'no',label:'自己响应或不出杀'}],p.hand.some(isSlash)?'no':'yes');
      if(yes==='yes')for(const q of helper(this,p)){
        if(this.hostility(q,p)>=0&&!this.controlledSeats?.has(q.id))continue;
        const success=await response.call(this,q,'slash',`激将：是否为${p.name}打出杀？`,ignoreArmor,{...context,played:true});
        if(success){this.log(`${q.name}响应${p.name}【激将】，由${q.name}打出【杀】。`,'response');return true;}
      }
    }return response.call(this,p,type,title,ignoreArmor,context);};
    P.markCardUse=async function(p,c,ts){const valid=await mark.call(this,p,c,ts);if(!valid)return valid;
      if(isSlash(c)||c.kind==='trick'||c.kind==='delay')for(const target of ts){if(!isLiu(this,target)||!target.liubeiRende||target.liubeiDezhuTurn===this.totalTurns)continue;
        const opts=Array.from({length:target.liubeiRende},(_,i)=>({key:String(i+1),label:`移除${i+1}枚仁德，摸${i+2}张牌`}));opts.push({key:'pass',label:'不发动得助'});
        const hostile=this.hostility(target,p)>0;const key=await this.option(target,`得助：成为【${c.name}】目标，移除仁德标记摸牌？`,opts,hostile?String(target.hp<=2?target.liubeiRende:1):'pass');
        if(key!=='pass'){const n=Number(key);target.liubeiRende-=n;target.liubeiDezhuTurn=this.totalTurns;this.draw(target,n+1);this.log(`${target.name}发动【得助】，移去${n}枚仁德，摸${n+1}张牌。`,'draw');}
      }return valid;};
    P.liubeiFinishRende=async function(p,c){if(c.originSkill!=='rende'||!c.rendeCount)return;
      p.liubeiRende+=c.rendeCount;this.log(`${p.name}获得${c.rendeCount}枚“仁德”标记，现有${p.liubeiRende}枚。`,'system');
      const target=this.get(c.rendeTargetId);
      if(c.rendeAllHand&&p.alive&&target?.alive){
        const preferred=p.hp>1&&target.hp<target.maxHp&&this.hostility(p,target)<0?'yes':'pass';
        const choice=await this.option(p,`仁德：是否失去1点体力，令${target.name}回复1点体力？`,[{key:'yes',label:'失去1点体力，令受赠者回复1点体力'},{key:'pass',label:'放弃整项交换'}],preferred,'可以放弃整项交换；放弃时，你不失去体力，受赠者也不回复体力。');
        if(choice==='yes'){await this.loseHp(p,1,'仁德');if(target.alive)this.heal(target,1);}
      }
      this.change();};
    P.afterCardUse=async function(p,c,ts){await after.call(this,p,c,ts);await this.liubeiFinishRende(p,c);};
    P.afterPlayedCard=async function(p,c,context){if(played)await played.call(this,p,c,context);await this.liubeiFinishRende(p,c);};
    P.dynastyStates=function(p,compact=false){const list=states.call(this,p,compact);if(isLiu(this,p))list.push(`仁德 ${p.liubeiRende}`);return list;};
  }
  const api={install};root.ZhenLiubeiSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
