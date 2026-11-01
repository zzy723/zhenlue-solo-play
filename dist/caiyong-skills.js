(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,init=P.initExtra,after=P.afterCardUse,finish=P.finishPhaseSkills;
    const hurt=P.afterDamageEvent,death=P.death,states=P.dynastyStates;
    const responseOptions=P.responseSkillOptions,prepareResponse=P.prepareResponseSkill,option=P.option;
    const active=P.activeSkills,prepare=P.prepareActive,aiPlay=P.aiPlay,use=P.useAction;
    const settled=P.afterPlayedCardSettled;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'caiyong');
    const sameName=(a,b)=>a.name===b.name;
    const label=c=>`【${c.name}】 ${C.suitMark[c.suit]}${C.rankMark(c.rank)}`;
    const token=(p,c)=>`caiyong:${p.id}:${c.id}`;
    P.initExtra=function(p){init.call(this,p);p.caiyongBooks=[];p.caiyongZhushiTurn=-1;p.caiyongXiaojingTurn=-1;p.caiyongRefused={};};
    P.caiyongRefuse=function(s,p){
      if(s.id===p.id||!owner(this,s)||s.caiyongRefused?.[p.id]===this.totalTurns)return;
      (s.caiyongRefused||(s.caiyongRefused={}))[p.id]=this.totalTurns;
      this.log(`${s.name}拒绝了${p.name}的【校经】请求，本回合不再接受该角色的请求。`,'system');this.change();
    };
    P.caiyongCosts=function(p,scribe,book){
      if(!p?.alive||!owner(this,scribe)||scribe.caiyongXiaojingTurn===this.totalTurns||this.over||!scribe.caiyongBooks.includes(book))return [];
      if(scribe.id!==p.id&&scribe.caiyongRefused?.[p.id]===this.totalTurns)return [];
      return p.hand.filter(c=>C.isRed(c)===C.isRed(book)&&!scribe.caiyongBooks.some(b=>b.id!==book.id&&sameName(b,c)));
    };
    P.caiyongOffers=function(p,type=null,played=false){
      if(!p?.alive||this.over)return [];
      const out=[];
      for(const s of this.actionOrder(this.alive().filter(t=>owner(this,t))))for(const b of s.caiyongBooks){
        if(!this.caiyongCosts(p,s,b).length||!this.allowedUse(p,b,played))continue;
        if(type?(type==='slash'?!C.isSlash(b):b.key!==type):!this.skillActionsFor(p,b).length)continue;
        out.push({scribe:s,book:b,key:token(s,b),played});
      }
      return out;
    };
    P.caiyongSelect=async function(p,offers,title){
      for(const s of this.actionOrder([...new Set(offers.map(o=>o.scribe))])){
        const current=offers.filter(o=>o.scribe===s&&this.caiyongCosts(p,s,o.book).length);
        if(!current.length)continue;
        const friendly=s.id===p.id||this.hostility(s,p)<-.5;
        const preferred=current.find(o=>friendly&&(o.response?o.helpful!==false:this.cardPlan(p,o.book)));
        const id=await option.call(this,s,`校经：令${p.name}换取并立即${current[0].played?'打出':'使用'}一本书？`,[
          ...current.map(o=>({key:o.book.id,label:label(o.book),card:o.book})),{key:'pass',label:s.id===p.id?'不发动校经':'拒绝本回合的请求'}
        ],preferred?.book.id||'pass',title+'；对方须交出同颜色手牌，换入后书的牌名仍须各不相同。拒绝其他角色后，其本回合不会再请求校经。');
        const selected=current.find(o=>o.book.id===id);
        if(selected&&this.caiyongCosts(p,s,selected.book).length)return selected;
        this.caiyongRefuse(s,p);
      }
      return null;
    };
    P.caiyongExchange=async function(p,offer){
      const {scribe:s,book:b}=offer,generation=s.generation,recipientGeneration=p.generation;
      const costs=this.caiyongCosts(p,s,b);if(!costs.length)return null;
      const cheapest=[...costs].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const id=await option.call(this,p,`校经：用一张同颜色手牌交换${s.name}的${label(b)}`,costs.map(c=>({key:c.id,label:label(c),card:c})),cheapest.id,'交换后必须立即使用或打出所得牌。');
      if(s.generation!==generation||p.generation!==recipientGeneration)return null;
      const cost=this.caiyongCosts(p,s,b).find(c=>c.id===id);if(!cost){this.caiyongRefuse(s,p);return null;}
      // Commit both zone changes before hand-loss skills can observe the exchange.
      s.caiyongXiaojingTurn=this.totalTurns;
      const raw=this.removeHand(p,cost.id);
      s.caiyongBooks.splice(s.caiyongBooks.indexOf(b),1,raw);
      this.table=this.table.filter(c=>c.id!==raw.id);this.table.push(b);
      this.log(`${s.name}发动【校经】，${p.name}以${label(raw)}交换“书”${label(b)}并立即${offer.played?'打出':'使用'}。`,'use');
      this.change();
      return {...b,caiyongReward:{id:s.id,generation}};
    };
    P.caiyongReward=async function(card){
      const reward=card?.caiyongReward;if(!reward||reward.done)return;reward.done=true;
      const s=this.get(reward.id);
      if(s?.alive&&s.generation===reward.generation&&!this.over){this.draw(s,1);this.log(`${s.name}【校经】结算后摸一张牌。`,'draw');await this.flushSkillEvents();}
    };
    P.caiyongRecord=async function(user,card){
      if(this.over||!card||card.virtual||card.kind==='equip'||card.damageTotal>0)return;
      for(const s of this.actionOrder(this.alive().filter(p=>owner(this,p)&&p.id!==user?.id))){
        if(s.caiyongZhushiTurn===this.totalTurns||s.caiyongBooks.some(b=>sameName(b,card)))continue;
        const raw=this.discard.find(c=>c.id===card.id);if(!raw)break;
        const generation=s.generation;
        const key=await this.option(s,`著史：将${user.name}使用的${label(raw)}置为“书”？`,[{key:'yes',label:'发动著史'},{key:'no',label:'不发动'}],'yes');
        if(key!=='yes'||!owner(this,s)||s.generation!==generation||s.caiyongZhushiTurn===this.totalTurns||s.caiyongBooks.some(b=>sameName(b,raw))||!this.discard.includes(raw))continue;
        s.caiyongZhushiTurn=this.totalTurns;this.discard.splice(this.discard.indexOf(raw),1);s.caiyongBooks.push(raw);
        this.log(`${s.name}发动【著史】，将${label(raw)}置为“书”。`,'system');this.change();
      }
    };
    P.afterCardUse=async function(p,c,ts){await after.call(this,p,c,ts);await this.caiyongReward(c);await this.caiyongRecord(p,c);};
    P.afterPlayedCardSettled=async function(p,c,context){if(settled)await settled.call(this,p,c,context);await this.caiyongReward(c);};
    P.caiyongPrune=async function(p,reason){
      if(!owner(this,p)||p.caiyongBooks.length<3||this.over)return;
      const generation=p.generation,books=[...p.caiyongBooks],cheapest=[...books].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const id=await this.option(p,`著史：${reason}，选择弃置一本书并摸一张牌`,books.map(c=>({key:c.id,label:label(c),card:c})),cheapest.id,'至少三本书时必须结算；由你选择弃置哪一本。');
      if(!owner(this,p)||p.generation!==generation||p.caiyongBooks.length<3)return;
      const c=p.caiyongBooks.find(c=>c.id===id)||p.caiyongBooks[0];p.caiyongBooks.splice(p.caiyongBooks.indexOf(c),1);this.putDiscard(c);this.draw(p,1);
      this.log(`${p.name}【著史】弃置“书”${label(c)}并摸一张牌。`,'draw');this.change();
    };
    P.finishPhaseSkills=async function(p){await finish.call(this,p);await this.caiyongPrune(p,'结束阶段');};
    P.afterDamageEvent=async function(s,t,n,ctx,generation){if(hurt)await hurt.call(this,s,t,n,ctx,generation);if(n>0&&t.generation===generation)await this.caiyongPrune(t,'受到伤害');};
    P.death=async function(p,s){if(p.caiyongBooks?.length)this.putDiscard(...p.caiyongBooks.splice(0));return death.call(this,p,s);};
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(p.general==='caiyong'){
      if(!compact)out.push(`书 ${p.caiyongBooks.length}`,`著史 · 本回合${p.caiyongZhushiTurn===this.totalTurns?'已用':'可用'}`,`校经 · 本回合${p.caiyongXiaojingTurn===this.totalTurns?'已用':'可用'}`);
    }return out;};
    P.responseSkillOptions=function(p,type,played=false){return [...responseOptions.call(this,p,type,played),...this.caiyongOffers(p,type,played).map(o=>({key:o.key+(played?':played':''),label:`校经：${o.scribe.name}的${label(o.book)}`,card:o.book,caiyongOffer:{...o,key:o.key+(played?':played':''),response:true}}))];};
    // The owner decides whether to invoke the skill; the recipient then selects
    // the payment. This also reaches nullification, rescue and borrowed slashes.
    P.option=async function(p,title,options,aiKey,detail=''){
      const candidates=options.filter(o=>o.caiyongOffer);
      if(!candidates.length)return option.call(this,p,title,options,aiKey,detail);
      const suggested=typeof aiKey==='function'?aiKey():aiKey;
      const offers=candidates.map(o=>({...o.caiyongOffer,helpful:suggested!=='pass'}));
      const selected=await this.caiyongSelect(p,offers,title);if(selected)return selected.key;
      const ordinary=options.filter(o=>!o.caiyongOffer);
      return option.call(this,p,title,ordinary,()=>{
        return ordinary.some(o=>o.key===suggested)?suggested:(ordinary.find(o=>o.key==='pass')||ordinary[0]).key;
      },detail);
    };
    P.prepareResponseSkill=async function(p,key){
      if(!key.startsWith('caiyong:'))return prepareResponse.call(this,p,key);
      const [,id,cardId,played]=key.split(':'),s=this.get(Number(id)),b=s?.caiyongBooks.find(c=>c.id===cardId);
      return b?this.caiyongExchange(p,{scribe:s,book:b,played:played==='played'}):null;
    };
    P.activeSkills=function(p){const list=active.call(this,p),offers=this.isPlayPhaseOwner(p)?this.caiyongOffers(p):[];if(offers.length)list.push({key:'caiyong_xiaojing',name:'校经',detail:'同色手牌换书，立即使用',ready:true});return list;};
    P.prepareActive=async function(p,a){
      if(a.skill!=='caiyong_xiaojing')return prepare.call(this,p,a);
      if(!this.isPlayPhaseOwner(p))return null;
      const selected=await this.caiyongSelect(p,this.caiyongOffers(p),'出牌阶段');if(!selected)return null;
      const b=selected.book,actions=this.skillActionsFor(p,b),best=this.cardPlan(p,b)||actions[0];if(!actions.length){this.caiyongRefuse(selected.scribe,p);return null;}
      const preferred=String(Math.max(0,actions.findIndex(a=>JSON.stringify(a)===JSON.stringify(best))));
      const index=actions.length===1?'0':b.key==='chain'?await this.chooseChainTargets(p,'校经：选择所得牌的目标',actions,preferred):await this.option(p,'校经：选择所得牌的目标',actions.map((a,i)=>({key:String(i),label:a.targets.map(id=>this.get(id).name).join('、')||'自己'})),preferred);
      const action=actions[Number(index)];if(!action){this.caiyongRefuse(selected.scribe,p);return null;}
      const raw=await this.caiyongExchange(p,selected);return raw?{card:raw,action}:null;
    };
    P.aiPlay=function(p,actions){
      const ordinary=aiPlay.call(this,p,actions.filter(a=>a.skill!=='caiyong_xiaojing'));
      if(this._caiyongDeclined===this.caiyongOfferStamp(p))return ordinary;
      const offers=this.caiyongOffers(p);
      if(offers.some(o=>(this.controlledSeats||new Set([this.humanId])).has(o.scribe.id)&&!this.auto||((o.scribe.id===p.id||this.hostility(o.scribe,p)<-.5)&&this.cardPlan(p,o.book))))return {type:'skill',skill:'caiyong_xiaojing'};
      return ordinary;
    };
    P.caiyongOfferStamp=function(p){return `${this.totalTurns}:${p.id}:${p.hand.map(c=>c.id).join(',')}:${this.caiyongOffers(p).map(o=>o.key).join(',')}`;};
    P.useAction=async function(p,a){
      if(a.skill!=='caiyong_xiaojing')return use.call(this,p,a);
      // A declined offer must not make an AI repeat the same action forever.
      const before=this.alive().map(s=>s.caiyongXiaojingTurn).join(',');
      await use.call(this,p,a);
      if(before===this.alive().map(s=>s.caiyongXiaojingTurn).join(','))this._caiyongDeclined=this.caiyongOfferStamp(p);
    };
  }
  const api={install};root.ZhenCaiyongSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
