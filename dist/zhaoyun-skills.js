(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{defs,isSlash}=C;
    const active=P.activeSkills,aiPlay=P.aiPlay,prepare=P.prepareActive;
    const responses=P.responseSkillOptions,prepareResponse=P.prepareResponseSkill,mark=P.markCardUse,value=P.value;
    const sourceKey={jink:'slash',slash:'jink',peach:'wine',wine:'peach'};
    const cardKey={jink:'jink',slash:'slash',peach:'peach',wine:'wine'};
    const category=c=>c.kind==='delay'?'trick':c.kind;
    const isZhao=(g,p)=>g.isGeneral(p,'jiezhaoyun');
    P.longdanCard=function(raw,key){return {...defs[cardKey[key]],id:'longdan-'+raw.id+'-'+key,virtual:true,costs:[raw],suit:raw.suit,rank:raw.rank,originSkill:'longdan'};};
    P.longdanOptions=function(p,key,played=false){if(!isZhao(this,p))return [];
      return p.hand.filter(c=>key==='jink'?isSlash(c):c.key===sourceKey[key]).map(c=>this.longdanCard(c,key)).filter(c=>this.allowedUse(p,c,played));
    };
    P.longdanPlayOptions=function(p){return [...this.longdanOptions(p,'slash'),...this.longdanOptions(p,'peach'),...this.longdanOptions(p,'wine')].filter(c=>this.skillActionsFor(p,c).length);};
    P.activeSkills=function(p){const out=active.call(this,p);if(isZhao(this,p))out.push({key:'longdan',name:'龙胆',detail:'闪→杀、酒→桃、桃→酒；响应时杀→闪',ready:this.longdanPlayOptions(p).length>0,reason:'没有可转化的手牌或合法目标'});return out;};
    P.longdanPreferred=function(p){const cards=this.longdanPlayOptions(p),spareJink=p.hand.filter(c=>c.key==='jink').length>1;
      const attacks=cards.filter(c=>c.key==='slash').map(c=>({card:c,plan:this.cardPlan(p,c)})).filter(x=>x.plan&&this.hostility(p,this.get(x.plan.targets[0]))>0)
        .sort((a,b)=>{const x=this.get(a.plan.targets[0]),y=this.get(b.plan.targets[0]);return Number(y.hp<=1)-Number(x.hp<=1)||y.hand.length-x.hand.length||x.hp-y.hp;});
      const safeAttack=attacks.find(({plan})=>{const t=this.get(plan.targets[0]);return spareJink||p.hp>=3||t.hp<=1&&t.hand.length<=1;});
      const heal=cards.find(c=>c.key==='peach'&&p.hp<p.maxHp);
      if(heal&&p.hp<=2)return heal;
      if(safeAttack)return safeAttack.card;
      if(heal)return heal;
      return cards.find(c=>c.key==='wine'&&!p.wineUsed&&p.hand.some(isSlash)&&this.alive().some(t=>this.hostility(p,t)>0&&this.canSlash(p,t)))||null;
    };
    P.aiPlay=function(p,actions){const ordinary=aiPlay.call(this,p,actions.filter(a=>a.skill!=='longdan'));
      if(!isZhao(this,p)||!actions.some(a=>a.skill==='longdan'))return ordinary;
      const preferred=this.longdanPreferred(p);if(!preferred)return ordinary;
      if(ordinary.type==='end')return {type:'skill',skill:'longdan'};
      if(preferred.key==='slash'&&ordinary.type==='use'&&p.hand.filter(c=>c.key==='jink').length>1){
        const normal=p.hand.find(c=>c.id===ordinary.cardId),target=this.get(ordinary.targets[0]);
        if(isSlash(normal)&&target?.hand.length&&this.hostility(p,target)>0)return {type:'skill',skill:'longdan'};
      }
      return ordinary;
    };
    P.prepareActive=async function(p,a){if(a.skill!=='longdan')return prepare.call(this,p,a);
      const cards=this.longdanPlayOptions(p);if(!cards.length)return null;
      const preferred=this.longdanPreferred(p)||cards[0];
      const id=await this.option(p,'龙胆：选择转化的手牌',[...cards.map(c=>({key:c.id,label:`${C.suitMark[c.suit]}${C.rankMark(c.rank)}【${c.costs[0].name}】→【${c.name}】`,card:c.costs[0]})),{key:'cancel',label:'取消'}],preferred.id);
      if(id==='cancel')return null;
      const selected=cards.find(c=>c.id===id),actions=this.skillActionsFor(p,selected);if(!actions.length)return null;
      const best=this.cardPlan(p,selected)||actions[0];let action=best;
      if(actions.length>1){const n=await this.option(p,'龙胆：选择目标',actions.map((x,i)=>({key:String(i),label:x.targets.map(id=>this.get(id).name).join('、')||'自己'})),String(Math.max(0,actions.findIndex(x=>JSON.stringify(x)===JSON.stringify(best)))));action=actions[Number(n)];}
      if(!action)return null;
      const raw=this.removeHand(p,selected.costs[0].id);this.log(`${p.name}发动【龙胆】，将【${raw.name}】当作【${selected.name}】。`,'use');
      return {card:this.longdanCard(raw,selected.key),action};
    };
    P.responseSkillOptions=function(p,type,played=false){const out=responses.call(this,p,type,played);if(!sourceKey[type])return out;
      for(const c of this.longdanOptions(p,type,played))out.push({key:`longdan:${type}:${c.costs[0].id}`,label:`龙胆：${c.costs[0].name}当${c.name}`,card:c.costs[0]});return out;
    };
    P.prepareResponseSkill=async function(p,key){if(!key.startsWith('longdan:'))return prepareResponse.call(this,p,key);
      const [,type,id]=key.split(':'),raw=p.hand.find(c=>c.id===id);if(!raw||!isZhao(this,p)||!(type==='jink'?isSlash(raw):raw.key===sourceKey[type]))return null;
      this.removeHand(p,id);this.log(`${p.name}发动【龙胆】，将【${raw.name}】当作【${defs[type].name}】响应。`,'response');return this.longdanCard(raw,type);
    };
    P.chongzhen=async function(p,c,opponents){if(!isZhao(this,p)||c.originSkill!=='longdan'||c.key==='peach')return;
      const candidates=[...new Map(opponents.filter(t=>t?.alive&&t.id!==p.id&&t.hand.length).map(t=>[t.id,t])).values()];if(!candidates.length)return;
      const preferred=[...candidates].sort((a,b)=>this.hostility(p,b)-this.hostility(p,a))[0];
      const id=await this.option(p,'冲阵：获得对方一张手牌？',[...candidates.map(t=>({key:String(t.id),label:`获得${t.name}一张随机手牌（${t.hand.length}张）`})),{key:'pass',label:'不发动'}],this.hostility(p,preferred)>0?String(preferred.id):'pass');
      if(id==='pass')return;const target=this.get(Number(id));if(!target?.alive||!target.hand.length)return;
      const selected=target.hand[Math.floor(this.random()*target.hand.length)];const card=this.withLoss('move',()=>this.removeOwned(target,selected.id).card);this.gain(p,[card]);this.evidence(p,target,false);
      this.log(`${p.name}发动【冲阵】，获得${target.name}一张手牌。`,'draw');
    };
    P.yajiao=async function(p,c){if(!isZhao(this,p)||this.turn===p.id||!c.virtual&&!c.id||!this.deck.length&&!this.discard.length)return;
      const physical=c.virtual?c.costs||[]:[c];if(!physical.some(x=>this.table.some(y=>y.id===x.id)))return;
      const yes=await this.option(p,'涯角：回合外使用或打出手牌，展示牌堆顶一张？',[{key:'yes',label:'发动涯角'},{key:'no',label:'不发动'}],'yes');if(yes==='no')return;
      const shown=this.takeTop();if(!shown)return;this.table.push(shown);
      const same=category(shown)===category(c);
      this.lastJudgment={playerId:p.id,reason:'涯角展示',card:{...shown},harmful:false,outcome:same?'类别相同':'类别不同',rule:'相同：可交给一名角色；不同：可弃置攻击范围包含你的一名角色区域内一张牌'};
      this.judging=true;this.log(`${p.name}【涯角】展示${C.suitMark[shown.suit]}${C.rankMark(shown.rank)}【${shown.name}】，类别${same?'相同':'不同'}。`,'system');await this.pause(1300);this.judging=false;this.change();
      try{
        if(same){const candidates=this.alive(),friend=[...candidates].sort((a,b)=>this.hostility(p,a)-this.hostility(p,b))[0];
          const id=await this.option(p,'涯角：谁获得展示牌？',[...candidates.map(t=>({key:String(t.id),label:`交给${t.name}`})),{key:'top',label:'留在牌堆顶'}],String(friend.id));
          if(id!=='top'){const t=this.get(Number(id));if(t?.alive){this.table=this.table.filter(x=>x.id!==shown.id);this.gain(t,[shown]);this.log(`${p.name}【涯角】将【${shown.name}】交给${t.name}。`,'draw');return;}}
        }else{const candidates=this.alive().filter(t=>t.id!==p.id&&this.distance(t,p)<=this.range(t)&&this.owned(t,true).length);if(candidates.length){const enemy=[...candidates].sort((a,b)=>this.hostility(p,b)-this.hostility(p,a))[0];
          const id=await this.option(p,'涯角：弃置谁区域里的一张牌？',[...candidates.map(t=>({key:String(t.id),label:`弃置${t.name}一张牌`})),{key:'pass',label:'不弃置'}],this.hostility(p,enemy)>0?String(enemy.id):'pass');
          if(id!=='pass'){const t=this.get(Number(id));if(t?.alive&&this.owned(t,true).length){await this.takeOtherCard(p,t,'discard',true);this.log(`${p.name}发动【涯角】，弃置${t.name}区域里的一张牌。`,'system');}}}}
      }finally{if(this.table.some(x=>x.id===shown.id)){this.table=this.table.filter(x=>x.id!==shown.id);this.deck.push(shown);}}
    };
    P.markCardUse=async function(p,c,ts){const valid=await mark.call(this,p,c,ts);
      if(isZhao(this,p)){if(c.originSkill==='longdan')await this.chongzhen(p,c,ts);await this.yajiao(p,c);}return valid;
    };
    P.afterResponseCard=async function(p,c,context){if(c.originSkill==='longdan'&&c.key==='jink')await this.chongzhen(p,c,[context.source]);};
    P.afterPlayedCard=async function(p,c,context){if(c.originSkill==='longdan'&&c.key==='slash')await this.chongzhen(p,c,[context.source]);await this.yajiao(p,c);};
    P.value=function(c,p){return value.call(this,c,p)+(isZhao(this,p)&&['slash','fireSlash','thunderSlash','jink','wine','peach'].includes(c?.key)?1:0);};
  }
  const api={install};root.ZhenZhaoyunSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
