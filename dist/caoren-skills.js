(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,init=P.initExtra,finish=P.finishPhaseSkills,response=P.response,states=P.dynastyStates;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'caoren');
    const jink=cost=>({...C.defs.jink,id:`jiewei-${cost.id}`,virtual:true,costs:[cost],suit:cost.suit,rank:cost.rank,originSkill:'jiewei'});
    P.initExtra=function(p){init.call(this,p);p.caorenJieweiRound=-1;};
    P.finishPhaseSkills=async function(p){
      await finish.call(this,p);if(!owner(this,p)||this.over)return;
      const generation=p.generation,ally=this.alive().some(t=>t.id!==p.id&&this.hostility(p,t)<-.5);
      const want=p.turnedOver||ally||p.hp<=2||p.hand.length<=1;
      const choice=await this.option(p,'据守：摸三张牌、获得1点护甲，然后翻面？',[
        {key:'yes',label:'发动据守'},{key:'no',label:'不发动据守'}
      ],want?'yes':'no','背面朝上时将跳过下个回合并翻正；解围可以提前翻回正面。');
      if(choice!=='yes'||!owner(this,p)||p.generation!==generation||this.over)return;
      this.draw(p,3);p.armor=(p.armor||0)+1;
      this.log(`${p.name}发动【据守】，摸三张牌并获得1点护甲（现有${p.armor}点），然后翻面。`,'draw');
      await this.flushSkillEvents();
      if(p.alive&&p.generation===generation&&!this.over){this.turnOver(p);await this.flushSkillEvents();}
      this.change();
    };
    P.caorenCanHelp=function(p,target,context){
      return owner(this,p)&&target?.alive&&p.id!==target.id&&p.caorenJieweiRound!==this.round&&!this.over&&
        !context.unavoidable&&!context.card?.noCancel&&!context.card?.unrespondable&&
        !this.caocaoNoResponse?.(target,context.source,context.card)&&!this.caocaoNoResponse?.(p,context.source,context.card);
    };
    P.caorenCounter=async function(p,source,generation,sourceGeneration){
      if(!p.alive||p.generation!==generation||!source?.alive||source.generation!==sourceGeneration||p.id===source.id||this.over)return;
      // Declared physical slashes run the normal use/target/damage hooks without
      // consulting distance or consuming the play-phase slash allowance.
      const cards=p.hand.filter(c=>C.isSlash(c)&&this.allowedUse(p,c)).sort((a,b)=>this.value(a,p)-this.value(b,p));
      if(!cards.length)return;
      const want=this.hostility(p,source)>.5&&(this.damageBenefitRisk(source)<3||source.hp<=1||p.hand.length>p.hp);
      const id=await this.option(p,`解围：对${source.name}使用一张杀反击？`,[
        ...cards.map(c=>({key:c.id,label:`使用【${c.name}】反击`,card:c})),{key:'pass',label:'不反击'}
      ],want?cards[0].id:'pass','无距离限制，且不计入使用次数。需消耗手中的一张杀。');
      if(!p.alive||p.generation!==generation||!source.alive||source.generation!==sourceGeneration||this.over)return;
      const c=cards.find(c=>c.id===id&&p.hand.some(x=>x.id===id));
      if(!c||!this.allowedUse(p,c))return;
      const raw=this.removeHand(p,c.id);
      this.log(`${p.name}发动【解围】，对${source.name}使用不计次数、无距离限制的【${raw.name}】。`,'use');
      await this.declaredSlash(p,source,{...raw,noQuota:true});
      await this.flushSkillEvents();this.change();
    };
    P.response=async function(target,type,title,ignoreArmor=false,context={}){
      if(type==='jink'&&context.source&&target.alive&&!this.over){
        const targetGeneration=target.generation,sourceGeneration=context.source.generation;
        const owners=this.actionOrder(this.alive().filter(p=>this.caorenCanHelp(p,target,context)&&p.hand.length));
        for(const p of owners){
          if(target.generation!==targetGeneration||!this.caorenCanHelp(p,target,context))continue;
          const generation=p.generation,cards=p.hand.filter(c=>this.allowedUse(p,jink(c),true)).sort((a,b)=>this.value(a,p)-this.value(b,p));
          if(!cards.length)continue;
          const want=()=>this.hostility(p,target)<-.5&&(p.turnedOver||target.hand.length<2||target.hp<=(context.amount||1));
          const id=await this.option(p,`解围：将一张手牌当闪替${target.name}打出？`,[
            ...cards.map(c=>({key:c.id,label:`【${c.name}】当闪`,card:c})),{key:'pass',label:'不发动解围'}
          ],()=>want()?cards[0].id:'pass','每轮限一次。背面朝上时翻回正面，随后可对本次伤害牌的使用者出杀。');
          if(p.generation!==generation||target.generation!==targetGeneration||!this.caorenCanHelp(p,target,context))continue;
          const cost=cards.find(c=>c.id===id&&p.hand.some(x=>x.id===id));
          if(!cost||!this.allowedUse(p,jink(cost),true))continue;
          p.caorenJieweiRound=this.round;
          const raw=this.removeHand(p,cost.id),card=jink(raw);
          this.showCardAction(p,card,[],'解围');this.sound('response',{playerId:p.id,cardKey:'jink'});
          this.log(`${p.name}发动【解围】，将一张手牌当【闪】替${target.name}打出。`,'response');
          try{await this.afterPlayedCard?.(p,card,{...context,played:true,protectedId:target.id});}
          finally{this.drop(raw);}
          await this.flushSkillEvents();
          if(p.alive&&p.generation===generation&&!this.over){
            if(p.turnedOver){this.turnOver(p);await this.flushSkillEvents();}
            await this.caorenCounter(p,context.source,generation,sourceGeneration);
          }
          this.change();return true;
        }
      }
      return response.call(this,target,type,title,ignoreArmor,context);
    };
    P.dynastyStates=function(p,compact=false){const out=states.call(this,p,compact);if(p.general==='caoren')out.push(`解围 · 本轮${p.caorenJieweiRound===this.round?'已用':'可用'}`);return out;};
  }
  const api={install};root.ZhenCaorenSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
