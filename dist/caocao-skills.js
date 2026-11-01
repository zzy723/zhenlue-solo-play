(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{isSlash}=C;
    const init=P.initExtra,opening=P.openingSkills;
    const distance=P.distance,canSlash=P.canSlash,slashAvailable=P.slashAvailable,targets=P.targets;
    const mark=P.markCardUse,response=P.response,damage=P.damage;
    const active=P.activeSkills,aiPlay=P.aiPlay,prepareActive=P.prepareActive,states=P.dynastyStates;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'caocao');
    const lord=(g,p)=>owner(g,p)&&g.options.mode==='identity'&&p.role==='主公';
    const cardType=c=>c.kind==='delay'?'trick':c.kind;
    const typeCount=p=>new Set(p.hand.map(cardType)).size;
    const damaging=c=>isSlash(c)||['duel','barbarian','arrows','fireAttack'].includes(c?.key);
    const guessByCount=n=>n<=1?1:n>=6?3:2;
    P.initExtra=function(p){init.call(this,p);p.caocaoNi=0;p.caocaoGuessTurn=-1;p.caocaoInviteTurn=-1;p.caocaoDuoyiUsedTurn=-1;p.caocaoBlockedTurn=-1;};
    P.openingSkills=async function(){
      for(const cao of this.actionOrder(this.alive().filter(p=>lord(this,p)))){
        if(!cao.alive||this.over)break;
        const use=await this.option(cao,'挟天：令所有其他角色交一张牌，否则获得“逆”标记？',[{key:'yes',label:'发动挟天'},{key:'no',label:'不发动'}],'yes');
        if(use!=='yes')continue;
        this.log(`${cao.name}发动【挟天】：其他角色依次交牌或获得“逆”标记。`,'system');
        for(const t of this.actionOrder(this.alive().filter(t=>t.id!==cao.id))){
          if(!cao.alive||!t.alive||this.over)break;
          const cheap=[...t.hand].sort((a,b)=>this.value(a,t)-this.value(b,t))[0];
          const choice=await this.option(t,`挟天：交给${cao.name}一张手牌，否则获得“逆”标记`,[
            ...t.hand.map(c=>({key:c.id,label:`交出【${c.name}】`,card:c})),{key:'ni',label:'不交牌，获得“逆”标记'}
          ],cheap&&this.value(cheap,t)<=8?cheap.id:'ni');
          if(choice==='ni'||!t.hand.some(c=>c.id===choice)){
            t.caocaoNi=(t.caocaoNi||0)+1;this.log(`${t.name}没有交牌，获得1枚“逆”标记。`,'system');
          }else{
            const card=this.moveBatch(t,()=>this.removeOwned(t,choice).card);this.gain(cao,[card]);
            this.evidence(t,cao,true);this.log(`${t.name}交给${cao.name}一张牌。`,'draw');
          }
          this.change();
        }
      }
      await opening.call(this);
    };
    P.distance=function(from,to){return lord(this,from)&&to?.alive&&to.id!==from.id&&to.caocaoNi>0?1:distance.call(this,from,to);};
    P.canSlash=function(p,t){return lord(this,p)&&t?.alive&&t.id!==p.id&&t.caocaoNi>0||canSlash.call(this,p,t);};
    P.slashAvailable=function(p){return slashAvailable.call(this,p)||lord(this,p)&&this.alive().some(t=>t.id!==p.id&&t.caocaoNi>0);};
    P.targets=function(p,c){const list=targets.call(this,p,c);
      if(lord(this,p)&&isSlash(c)&&!slashAvailable.call(this,p))return list.filter(t=>t.caocaoNi>0);
      return list;
    };
    P.markCardUse=async function(p,c,ts){
      if(lord(this,p)&&ts?.length&&(isSlash(c)||['duel','fireAttack'].includes(c.key))){
        const available=this.targets(p,c);
        for(const t of this.actionOrder(available.filter(t=>t.id!==p.id&&t.caocaoNi>0&&!ts.some(x=>x.id===t.id)))){
          const choice=await this.option(p,`挟天：额外指定${t.name}为【${c.name}】目标？`,[{key:'yes',label:'增加此目标'},{key:'no',label:'不增加'}],this.hostility(p,t)>0.5?'yes':'no');
          if(choice==='yes'){ts.push(t);this.showCardAction(p,c,[t],'挟天追加目标');this.log(`${p.name}【挟天】额外指定${t.name}为【${c.name}】目标。`,'use');}
        }
      }
      const valid=await mark.call(this,p,c,ts);
      if(valid&&lord(this,p)&&c.kind==='delay'){
        const physical=c.virtual?(c.costs||[]):this.table.filter(raw=>raw.id===c.id);
        for(const raw of physical)raw.ownerId=p.id;
      }
      return valid;
    };
    P.caocaoNoResponse=function(p,source,card){
      const actor=card?.ownerId!=null?this.get(card.ownerId):source;
      return owner(this,actor)&&p?.alive&&(p.caocaoBlockedTurn===this.totalTurns||lord(this,actor)&&!p.caocaoNi);
    };
    P.response=async function(p,type,title,ignoreArmor=false,context={}){
      if(this.caocaoNoResponse(p,context.source,context.card)){
        this.log(`${p.name}因【挟天】或【多疑】不能响应曹操的【${context.card?.name||type}】。`,'system');return false;
      }
      return response.call(this,p,type,title,ignoreArmor,context);
    };
    P.damage=async function(source,target,amount,nature='normal',context={}){
      const card=context.card;
      if(source?.alive&&this.isGeneralLocked(source,'jiezhangchunhua'))return damage.call(this,source,target,amount,nature,context);
      const dealt=await damage.call(this,source,target,amount,nature,context);
      if(dealt>0&&owner(this,target)&&!this.over){
        const choice=await this.option(target,`奸雄：受到${dealt}点伤害，摸一张并获得伤害牌？`,[{key:'yes',label:'发动奸雄'},{key:'no',label:'不发动'}],'yes');
        if(choice==='yes'){
          this.draw(target,1);
          const ids=card?(card.virtual?(card.costs||[]).map(c=>c.id):[card.id]):[];
          const gained=[];
          for(const id of ids){
            const tableIndex=this.table.findIndex(c=>c.id===id),discardIndex=this.discard.findIndex(c=>c.id===id);
            if(tableIndex>=0)gained.push(this.table.splice(tableIndex,1)[0]);
            else if(discardIndex>=0)gained.push(this.discard.splice(discardIndex,1)[0]);
          }
          if(gained.length)this.gain(target,gained);
          this.log(`${target.name}发动【奸雄】：摸一张${gained.length?`，获得伤害牌${gained.length}张`:''}。`,'draw');this.change();
        }
      }
      return dealt;
    };
    P.caocaoGuess=async function(p){
      if(!owner(this,p)||!this.isPlayPhaseOwner(p)||p.turns%2!==1||p.caocaoDuoyiUsedTurn===this.totalTurns)return;
      const targets=this.alive().filter(t=>t.id!==p.id&&t.hand.length>0);if(!targets.length)return;
      const best=[...targets].filter(t=>this.hostility(p,t)>0.5).sort((a,b)=>b.hand.length-a.hand.length||a.hp-b.hp)[0]||targets[0];
      const id=await this.option(p,'多疑：选择你要猜手牌种类数的角色',[...targets.map(t=>({key:String(t.id),label:`${t.name} · 手牌${t.hand.length}`})),{key:'cancel',label:'取消'}],String(best.id));
      if(id==='cancel')return;const target=this.get(Number(id));if(!target?.alive||!target.hand.length)return;
      const guess=Number(await this.option(p,`多疑：猜${target.name}手牌有几种类别？`,[1,2,3].map(n=>({key:String(n),label:`${n}种`})),String(guessByCount(target.hand.length)),'基本牌、锦囊牌、装备牌共三类；延时锦囊计入锦囊牌。'));
      p.caocaoGuessTurn=p.caocaoDuoyiUsedTurn=this.totalTurns;
      const actual=typeCount(target);this.log(`${p.name}【多疑】猜${target.name}有${guess}种手牌；实际为${actual}种。`,'reveal');
      if(guess===actual){
        const picked=target.hand[Math.floor(this.random()*target.hand.length)];
        const card=this.moveBatch(target,()=>this.removeOwned(target,picked.id).card);
        this.gain(p,[card]);this.evidence(p,target,false);this.log(`${p.name}猜对，随机获得${target.name}的一张手牌。`,'draw');
      }else{await this.damage(p,target,1,'normal',{skill:'duoyi'});this.log(`${p.name}猜错，对${target.name}造成1点伤害。`,'damage');}
      this.change();
    };
    P.caocaoInvite=async function(p){
      if(!owner(this,p)||!this.isPlayPhaseOwner(p)||p.turns%2!==0||p.caocaoDuoyiUsedTurn===this.totalTurns||!p.hand.length)return;
      const targets=this.alive().filter(t=>t.id!==p.id);if(!targets.length)return;
      const best=[...targets].filter(t=>this.hostility(p,t)>0.5).sort((a,b)=>a.hp-b.hp)[0]||targets[0];
      const id=await this.option(p,'多疑：选择一名角色猜你的手牌种类数',[...targets.map(t=>({key:String(t.id),label:`${t.name} · ${t.hp}血`})),{key:'cancel',label:'取消'}],String(best.id));
      if(id==='cancel')return;const target=this.get(Number(id));if(!target?.alive)return;
      p.caocaoInviteTurn=p.caocaoDuoyiUsedTurn=this.totalTurns;
      const guessed=Number(await this.option(target,`多疑：猜${p.name}手牌有几种类别？`,[1,2,3].map(n=>({key:String(n),label:`${n}种`})),String(guessByCount(p.hand.length)),'基本牌、锦囊牌、装备牌共三类；延时锦囊计入锦囊牌。'));
      const actual=typeCount(p);this.log(`${target.name}【多疑】猜${p.name}有${guessed}种手牌；实际为${actual}种。`,'reveal');
      if(guessed===actual){await this.loseHp(target,1,'多疑');this.log(`${target.name}猜对，失去1点体力。`,'damage');}
      else{target.caocaoBlockedTurn=this.totalTurns;this.log(`${target.name}猜错，本回合不能响应${p.name}使用的牌。`,'system');}
      this.change();
    };
    P.activeSkills=function(p){const list=active.call(this,p);if(!owner(this,p))return list;
      const ownTurn=this.isPlayPhaseOwner(p);
      list.push({key:'duoyiGuess',name:'多疑·阳',detail:'猜对随机获得一张手牌 · 奇数回合',ready:ownTurn&&p.turns%2===1&&p.caocaoDuoyiUsedTurn!==this.totalTurns&&this.alive().some(t=>t.id!==p.id&&t.hand.length)});
      list.push({key:'duoyiInvite',name:'多疑·阴',detail:'令对方猜你的手牌 · 偶数回合',ready:ownTurn&&p.turns%2===0&&p.caocaoDuoyiUsedTurn!==this.totalTurns&&p.hand.length>0&&this.alive().length>1});
      return list;
    };
    P.aiPlay=function(p,actions){const rest=aiPlay.call(this,p,actions.filter(a=>!['duoyiGuess','duoyiInvite'].includes(a.skill)));
      if(!owner(this,p)||!this.isPlayPhaseOwner(p)||rest.type!=='end')return rest;
      const enemy=this.alive().some(t=>t.id!==p.id&&this.hostility(p,t)>0.5);
      if(!enemy)return rest;
      return actions.find(a=>a.skill==='duoyiGuess')||actions.find(a=>a.skill==='duoyiInvite')||rest;
    };
    P.prepareActive=async function(p,a){if(a.skill==='duoyiGuess'){if(this.activeSkills(p).some(s=>s.key===a.skill&&s.ready))await this.caocaoGuess(p);return null;}
      if(a.skill==='duoyiInvite'){if(this.activeSkills(p).some(s=>s.key===a.skill&&s.ready))await this.caocaoInvite(p);return null;}
      return prepareActive.call(this,p,a);
    };
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);
      if(p.general==='caocao')out.push(`多疑 ${p.turns%2===1?'阳·猜人':'阴·被猜'}${p.caocaoDuoyiUsedTurn===this.totalTurns?'（已用）':''}`);
      if(p.caocaoNi>0)out.push(`逆 ${p.caocaoNi}`);
      if(p.caocaoBlockedTurn===this.totalTurns)out.push('本回合不能响应曹操的牌');
      return out;
    };
  }
  const api={install};root.ZhenCaocaoSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
