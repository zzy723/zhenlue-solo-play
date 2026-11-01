(function(root){
  'use strict';
  // The solo roster is intentionally fixed here. Hidden generals keep their existing AI.
  const visible=new Set(['guanyu','zhangfei','machao','shiweiyan','feiyi','wolongfengchu','jiezhaoyun','liubei','caomao','jiexunyu','jieguojia','caocao','shensunce','shizhouyu','jiesunquan','lusu','lvmeng','jiezhoutai','jiehuanggai','mouzhangrang','molvbu','liuxie','dongzhuo','simayi','zhangliao','caopi','caoren','chengong','liru']);
  visible.add('caiyong');
  visible.add('diaochan');
  visible.add('jiaxu');
  visible.add('yuanshao');
  visible.add('zhangjiao');
  visible.add('liushan');
  visible.add('zhangjiao');
  visible.add('liushan');
  visible.add('ganning');
  visible.add('luxun');
  visible.add('sunjian');
  visible.add('xuchu');
  const slashKeys=new Set(['slash','fireSlash','thunderSlash']);
  const damageKeys=new Set(['slash','fireSlash','thunderSlash','duel','fireAttack','barbarian','arrows']);
  const hostile=(g,p,t)=>t?g.hostility(p,t):0;
  const missing=p=>Math.max(0,p.maxHp-p.hp);
  function defensiveValue(g,p,c){
    let v=g.value(c,p);
    if(p.hp<=2){if(c.key==='peach')v+=8;if(c.key==='jink')v+=p.hand.filter(x=>x.key==='jink').length===1?6:3;if(c.key==='nullify')v+=3;}
    if(p.hp===1&&c.key==='wine')v+=4;
    if(p.general==='jiezhaoyun'&&['jink','slash','fireSlash','thunderSlash'].includes(c.key))v+=2;
    if(p.general==='shizhouyu'&&c.key==='fireAttack')v+=2;
    return v;
  }
  function attackValue(g,p,t,c){
    if(!t||!t.alive)return -20;
    if(g.chengongProtected?.(t)&&!g.isGeneralLocked(p,'jiezhangchunhua'))return -20;
    const h=hostile(g,p,t);
    if(h<=0)return h<-.5?-12:-4;
    let v=4+h*1.3+(t.hp<=1?5:t.hp===2?2:0)+(t.hand.length===0?2:0);
    if(slashKeys.has(c.key))v+=(g.chengongJijiaoOwners?.(p,t).length||0)*2;
    if(t.hp>1)v-=g.damageBenefitRisk(t);
    if(t.general==='jiezhoutai'&&t.hp<=1&&t.zhoutaiChuang?.length<13)v-=2;
    if(p.general==='guanyu'&&t.yiOwners?.includes(p.id)&&t.hp<=1)v-=11;
    if(p.general==='zhangfei'){if(missing(p)>=2)v+=3;if(missing(p)>=3&&t.hand.length)v+=2;}
    if(p.general==='shiweiyan'){v+=1.5;if(p.hp<=t.hp&&slashKeys.has(c.key))v+=2;}
    if(p.general==='caocao'&&g.options.mode==='identity'&&p.role==='主公'){if(t.caocaoNi>0)v+=2;else v+=1.5;}
    if(p.general==='shensunce'&&(c.key==='duel'||slashKeys.has(c.key)&&['H','D'].includes(c.suit)))v+=2;
    if(p.general==='molvbu'&&t.hand.length)v+=1;
    return v;
  }
  function install(Game,C){
    const P=Game.prototype,oldAI=P.aiPlay,oldRisk=P.damageBenefitRisk,oldOption=P.option,oldSelect=P.selectCards,oldUse=P.useAction;
    P.useAction=async function(p,a){
      if((visible.has(p?.general)||p?.general==='old_dongzhuo')&&a.type==='use'){
        if(p.soloAiUsageTurn!==this.totalTurns){p.soloAiUsageTurn=this.totalTurns;p.soloAiUsage={};}
        p.soloAiUsage[a.cardId]=(p.soloAiUsage[a.cardId]||0)+1;
      }
      return oldUse.call(this,p,a);
    };
    P.damageBenefitRisk=function(t){
      const base=oldRisk.call(this,t);
      if(!t?.alive||!(visible.has(t.general)||t.general==='old_dongzhuo'))return base;
      if(t.general==='jieguojia')return t.hp<=1?2:Math.max(base,4);
      if(t.general==='jiexunyu')return Math.max(base,t.hp<=1?1:2.5);
      if(t.general==='shensunce'&&!t.sunceAwakened&&t.hp<=2)return Math.max(base,3);
      if(t.general==='jiezhoutai'&&t.hp<=1)return Math.max(base,3);
      if(t.general==='jiehuanggai')return Math.max(base,2);
      if(t.general==='shiweiyan'&&t.weiyanMission==='success')return Math.max(base,1.5);
      return base;
    };
    P.aiStrategyScore=function(p,a){
      if(a.type!=='use')return -Infinity;
      const c=a.cardId==='spear'?C.defs.slash:p.hand.find(x=>x.id===a.cardId);
      if(!c)return -Infinity;
      if(['draw2','harvest'].includes(c.key)||c.key==='chain'&&a.recast){
        if(p.hand.length>=this.handLimit(p)+8)return -8;
        if(p.soloAiUsageTurn===this.totalTurns&&(p.soloAiUsage?.[a.cardId]||0)>=3)return -8;
      }
      const ts=(a.targets||[]).map(id=>this.get(id)).filter(Boolean);
      const first=ts[0],h=hostile(this,p,first);
      let s=-10;
      if(c.kind==='equip'){
        const old=p.equip[c.slot];
        s=old?-2:7;
        if(c.slot==='weapon'&&old&&c.range>old.range)s=3;
        if(c.key==='crossbow'&&p.hand.filter(x=>slashKeys.has(x.key)).length>=2)s+=3;
        if(c.slot==='armor'&&p.hp<=2&&!old)s+=4;
        if(p.general==='machao'&&p.machaoRangeBonus>=2&&c.slot==='weapon')s-=1;
      }else if(c.key==='peach')s=p.hp<=2?18:missing(p)>0?12:-8;
      else if(c.key==='draw2')s=p.hand.length>=this.handLimit(p)+4&&this.deck.length+this.discard.length<6?-5:16;
      else if(slashKeys.has(c.key)){
        s=ts.reduce((n,t)=>n+attackValue(this,p,t,c),0)-2;
        if(p.general==='machao'&&p.hp<=2)s-=2.5;
        if(p.general==='machao'&&p.machaoRangeBonus<3&&p.hand.some(x=>x.id!==c.id&&['draw2','steal','dismantle','harvest'].includes(x.key)))s-=3;
        if(p.general==='lvmeng'&&!p.lvmengBotuExtraTurn&&!p.lvmengUsedSlash&&!p.lvmengAwakened&&first?.hp>1)s-=5;
        if(first?.equip?.armor?.key==='renwang'&&['S','C'].includes(c.suit)&&p.equip.weapon?.key!=='qinggang')s-=12;
        if(first?.equip?.armor?.key==='vine'&&c.nature==='normal'&&!['qinggang','fan'].includes(p.equip.weapon?.key))s-=12;
        if(a.cardId==='spear')s-=p.hp<=2?7:3;
      }else if(c.key==='wine')s=p.hp>1&&p.hand.some(x=>slashKeys.has(x.key))&&this.alive().some(t=>hostile(this,p,t)>.5&&this.canSlash(p,t))?9:-5;
      else if(c.key==='duel')s=attackValue(this,p,first,c)-2+Math.min(3,p.hand.filter(x=>slashKeys.has(x.key)).length)*1.5-Math.min(4,first?.hand.length||0)*.7-(p.hp<=2&&p.hand.every(x=>!slashKeys.has(x.key))?5:0);
      else if(['steal','dismantle'].includes(c.key)){
        const badJudge=first?.judge?.some(x=>['shortage','indulgence'].includes(x.key));
        s=h<-.5?(badJudge?11:-9):h>.5?5+h+(first.hand.length===0?1:0)+(first.equip?.armor?1:0):-6;
      }else if(['indulgence','shortage'].includes(c.key))s=h>.5?5+h+(first.hp<=2?1:0):-8;
      else if(c.key==='fireAttack')s=attackValue(this,p,first,c)-3+(first?.equip?.armor?.key==='vine'?4:0)-(p.hand.length<=1?7:0)+(p.general==='shizhouyu'?2:0);
      else if(c.key==='borrow')s=h+hostile(this,p,ts[1])+3;
      else if(c.key==='chain')s=a.recast?4:ts.reduce((n,t)=>n+(t.chained?-hostile(this,p,t):hostile(this,p,t))*1.8,0)+(p.hand.some(x=>['fireSlash','thunderSlash','fireAttack'].includes(x.key))?2:-2);
      else if(['barbarian','arrows'].includes(c.key))s=this.alive().filter(t=>t.id!==p.id).reduce((n,t)=>n+(hostile(this,p,t)>.5?attackValue(this,p,t,c)*.55:-8),0);
      else if(c.key==='healAll')s=this.alive().filter(t=>missing(t)>0).reduce((n,t)=>n-hostile(this,p,t)*3+(t.hp<=1?-hostile(this,p,t)*2:0),0);
      else if(c.key==='harvest')s=2+this.alive().reduce((n,t)=>n-hostile(this,p,t)*.8,0)+(p.hand.length<=p.hp?2:0);
      else if(c.key==='lightning')s=-3;
      if(a.recast&&c.key!=='chain')s=2;
      if(damageKeys.has(c.key)&&p.hp<=1&&p.hand.some(x=>x.key==='peach'))s-=1;
      if(p.general==='simayi'&&damageKeys.has(c.key)&&!p.simayiAwakened&&p.simayiDamageTurn!==this.totalTurns&&first?.hp>1)s-=1.5;
      if(p.general==='jiesunquan'&&c.kind==='equip'&&s>0)s+=1;
      if(p.general==='mouzhangrang'&&c.key==='draw2')s+=2;
      if(p.general==='luxun'&&this.luxunAIScore)return this.luxunAIScore(p,a,c,s);
      return p.general==='jiehuanggai'&&this.huanggaiAIScore?this.huanggaiAIScore(p,a,c,s):s;
    };
    P.aiPlay=function(p,actions){
      const chosen=oldAI.call(this,p,actions);
      if(!(visible.has(p?.general)||p?.general==='old_dongzhuo')||!chosen||chosen.type==='skill')return chosen;
      // Lü Meng's old AI deliberately saves Slash for 克己/勤学.
      if(p.general==='lvmeng'&&chosen.type==='end')return chosen;
      const uses=actions.filter(a=>a.type==='use');
      if(!uses.length)return chosen;
      const ranked=uses.map(a=>({a,score:this.aiStrategyScore(p,a)})).sort((x,y)=>y.score-x.score);
      const best=ranked[0];
      if(best.score<=0)return {type:'end'};
      return best.a;
    };
    P.option=function(p,title,options,aiKey,detail=''){
      if(!(visible.has(p?.general)||p?.general==='old_dongzhuo'))return oldOption.call(this,p,title,options,aiKey,detail);
      let suggested=aiKey;
      if(p.general==='shensunce'&&title.startsWith('连讨：选择一名角色')){
        const red=p.hand.filter(c=>['H','D'].includes(c.suit)).length,black=p.hand.length-red;
        const enemies=this.alive().filter(t=>t.id!==p.id&&hostile(this,p,t)>.5);
        const target=enemies.sort((a,b)=>a.hp-b.hp||a.hand.length-b.hand.length)[0];
        suggested=target&&p.hp>=2&&Math.min(red,black)>=1&&p.hand.length>=3&&target.hp<=2?String(target.id):'pass';
      }else if(p.general==='guanyu'&&title.startsWith('武圣：指定此出牌阶段')){
        const enemies=this.alive().filter(t=>t.id!==p.id&&hostile(this,p,t)>.5);
        const target=enemies.sort((a,b)=>Number(a.yiOwners?.includes(p.id))-Number(b.yiOwners?.includes(p.id))||a.hp-b.hp||a.hand.length-b.hand.length)[0];
        suggested=target?String(target.id):'pass';
      }else if(p.general==='machao'&&title.startsWith('铁骑：令')){
        const target=this.alive().find(t=>title.includes(t.name));
        suggested=p.hp>=3&&hostile(this,p,target)>.5||p.hp===2&&target?.hp<=1&&p.hand.some(c=>c.key==='peach')?'yes':'no';
      }else if(p.general==='old_dongzhuo'&&title.startsWith('凶逆：弃一张牌')){
        if(p.dongzhuoGuanbian&&this.round===1&&p.hp<=3&&this.alive().some(t=>hostile(this,p,t)>.5))suggested='no';
      }
      return oldOption.call(this,p,title,options,suggested,detail);
    };
    P.selectCards=function(p,title,cards,min,max,suggested,detail=''){
      if(!(visible.has(p?.general)||p?.general==='old_dongzhuo')||!/^弃置\d+张手牌$/.test(title))return oldSelect.call(this,p,title,cards,min,max,suggested,detail);
      const reserve=[...cards].sort((a,b)=>defensiveValue(this,p,a)-defensiveValue(this,p,b)).slice(0,min).map(c=>c.id);
      return oldSelect.call(this,p,title,cards,min,max,reserve,detail);
    };
  }
  const api={install,visible};root.ZhenSoloAIStrategy=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
