(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype;
    const setup=P.setup,init=P.initExtra,preparation=P.preparationSkills;
    const judgment=P.showJudgment,response=P.response,showCard=P.showCardAction,states=P.dynastyStates,value=P.value;
    const black=c=>c&&['S','C'].includes(c.suit);
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'zhangjiao');
    P.initExtra=function(p){init.call(this,p);p.zhangjiaoFactions=0;};
    P.setup=function(){
      setup.call(this);
      this._zhangjiaoResponses=[];
      const count=new Set(this.alive().map(p=>this.general(p).faction).filter(Boolean)).size;
      for(const p of this.alive().filter(p=>p.general==='zhangjiao')){
        p.zhangjiaoFactions=count;p.maxHp+=count;p.hp+=count;
        this.log(`${p.name}【黄天】按开局${count}种势力增加${count}点体力上限和体力（${p.hp}/${p.maxHp}）。`,'system');
      }
    };
    P.zhangjiaoCanGuidao=function(p){return owner(this,p)&&p.hand.some(black);};
    P.zhangjiaoJudgmentValue=function(actor,target,reason,c){
      const friend=this.hostility(actor,target)<0?1:-1;
      let score=0;
      if(reason==='乐不思蜀')score=friend*(c.suit==='H'?5:-5);
      else if(reason==='兵粮寸断')score=friend*(c.suit==='C'?4:-4);
      else if(reason==='闪电')score=friend*(c.suit==='S'&&c.rank>=2&&c.rank<=9?-12:3);
      else if(reason==='八卦阵')score=friend*(C.isRed(c)?4:-3);
      else if(reason==='铁骑')score=friend*(C.isRed(c)?-5:1);
      else if(reason==='筹策')score=friend*(C.isRed(c)?3:0);
      if(owner(this,target)){
        const enemies=this.alive().filter(t=>this.hostility(target,t)>0);
        const damage=c.suit==='S'?2:c.suit==='C'?1:0;
        score+=friend*((enemies.length?damage*5:0)+(c.suit==='C'&&target.hp<target.maxHp?4:0));
      }
      return score;
    };
    P.zhangjiaoGuidao=async function(p,target,reason,current){
      if(!this.zhangjiaoCanGuidao(p)||!target?.alive||this.over)return current;
      const cards=p.hand.filter(black),base=this.zhangjiaoJudgmentValue(p,target,reason,current);
      const score=c=>this.zhangjiaoJudgmentValue(p,target,reason,c)-base+(this.value(current,p)-this.value(c,p))*.3;
      const best=[...cards].sort((a,b)=>score(b)-score(a))[0];
      const id=await this.option(p,`鬼道：替换${target.name}的【${reason}】判定牌？`,[
        ...cards.map(c=>({key:c.id,label:`黑色手牌改判：${C.suitMark[c.suit]}${C.rankMark(c.rank)}【${c.name}】`,card:c})),
        {key:'pass',label:'不发动鬼道'}
      ],best&&score(best)>.2?best.id:'pass',`当前判定牌：${C.suitMark[current.suit]}${C.rankMark(current.rank)}【${current.name}】。换出的原判定牌归你；只能用黑色手牌。`);
      const replacement=p.hand.find(c=>c.id===id&&black(c));
      if(!replacement||!this.zhangjiaoCanGuidao(p)||!target.alive||this.over)return current;
      const raw=this.withLoss('replace',()=>this.removeOwned(p,replacement.id).card);
      const original=this.takePhysical(current.id);
      if(!original)throw Error('鬼道的原判定牌不在牌桌上');
      this.table.push(raw);this.gain(p,[original]);this.noteCardRevealed?.(p,raw);
      this.log(`${p.name}【鬼道】以${C.suitMark[raw.suit]}${C.rankMark(raw.rank)}【${raw.name}】替换判定牌，获得原判定牌【${original.name}】。`,'judge');
      this.change();return raw;
    };
    P.zhangjiaoTianfaResult=async function(p,c){
      if(!owner(this,p)||this.over||!black(c))return;
      const candidates=this.alive(),amount=c.suit==='S'?2:1;
      const preferred=[...candidates].sort((a,b)=>this.hostility(p,b)-this.hostility(p,a)||a.hp-b.hp)[0];
      const id=await this.option(p,`天罚：选择承受${amount}点雷电伤害的角色`,candidates.map(t=>({key:String(t.id),label:`${t.name} · ${t.hp}体力${t.id===p.id?' · 自己':''}`})),String(preferred.id),c.suit==='C'?'梅花：造成1点雷电伤害，然后你回复1点体力。':'黑桃：造成2点雷电伤害。');
      const target=this.get(Number(id));if(!target?.alive||!owner(this,p)||this.over)return;
      this.evidence(p,target,false);
      this.log(`${p.name}【天罚】判定为${c.suit==='S'?'黑桃':'梅花'}，对${target.name}造成${amount}点雷电伤害。`,'damage');
      await this.damage(p,target,amount,'thunder',{skill:'zhangjiao_tianfa'});
      if(c.suit==='C'&&p.alive)this.heal(p,1);
    };
    P.showJudgment=async function(p,reason,c,...args){
      await judgment.call(this,p,reason,c,...args);
      // 不屈 shares the reveal animation but is not a judgment.
      if(reason!=='不屈')await this.zhangjiaoTianfaResult(p,c);
    };
    P.zhangjiaoTianfa=async function(p){
      if(!owner(this,p)||this.over)return;
      const enemy=this.alive().some(t=>this.hostility(p,t)>0);
      if(await this.option(p,'天罚：打出闪后，是否判定？',[{key:'yes',label:'发动天罚，进行判定'},{key:'no',label:'不发动天罚'}],enemy?'yes':'no','你的所有判定均可触发天罚；黑桃造成2点雷伤，梅花造成1点雷伤并令你回复1点体力。')!=='yes')return;
      let c=this.takeTop();if(!c)return;
      this.table.push(c);
      try{
        c=await this.reviseJudgment(p,'天罚',c);
        const outcome=c.suit==='S'?'黑桃：造成2点雷电伤害':c.suit==='C'?'梅花：造成1点雷电伤害，然后自己回复1点体力':'红色：无效果';
        await this.showJudgment(p,'天罚',c,false,outcome,'黑桃2雷伤；梅花1雷伤并回复1体力；红色无效果');
      }finally{this.drop(c);}
      await this.flushSkillEvents();this.change();
    };
    P.showCardAction=function(p,c,targets,action){
      const frame=this._zhangjiaoResponses?.at(-1);
      if(frame&&frame.id===p?.id&&frame.generation===p.generation&&c?.key==='jink')frame.ownJink=true;
      return showCard.call(this,p,c,targets,action);
    };
    P.response=async function(p,type,...args){
      if(type!=='jink'||!owner(this,p))return response.call(this,p,type,...args);
      const frame={id:p.id,generation:p.generation,ownJink:false};
      (this._zhangjiaoResponses||(this._zhangjiaoResponses=[])).push(frame);
      let used;
      try{used=await response.call(this,p,type,...args);}finally{this._zhangjiaoResponses.pop();}
      // One actual Jink response, including a virtual Jink, gives one optional judgment.
      // A Jink played by a helper belongs to that helper, not to the protected character.
      if(used&&frame.ownJink&&p.generation===frame.generation)await this.zhangjiaoTianfa(p);
      return used;
    };
    P.zhangjiaoHuangtian=async function(p){
      if(!owner(this,p)||this.over)return;
      const others=this.alive().filter(t=>t.id!==p.id);if(!others.length)return;
      const friend=[...others].filter(t=>this.hostility(p,t)<0&&t.hand.length).sort((a,b)=>b.hand.length-a.hand.length)[0];
      const id=await this.option(p,'黄天：选择一名其他角色',[
        ...others.map(t=>({key:String(t.id),label:`${t.name} · 手牌${t.hand.length}`})),{key:'cancel',label:'不发动黄天'}
      ],friend?String(friend.id):'cancel','对方可自愿交给你一张黑色手牌或闪；交黑色非闪摸一张，交闪摸两张。');
      if(id==='cancel')return;
      const target=this.get(Number(id));if(!target?.alive||target.id===p.id||!owner(this,p)||this.over)return;
      const cards=target.hand.filter(c=>black(c)||c.key==='jink');
      if(!cards.length){this.log(`${target.name}未向${p.name}交出【黄天】所需的牌。`,'system');return;}
      const best=[...cards].sort((a,b)=>(this.value(a,target)-(a.key==='jink'?6:3))-(this.value(b,target)-(b.key==='jink'?6:3)))[0];
      const key=await this.option(target,`黄天：是否交给${p.name}一张牌？`,[
        ...cards.map(c=>({key:c.id,label:`交出【${c.name}】，摸${c.key==='jink'?2:1}张`,card:c})),{key:'pass',label:'不交牌'}
      ],this.hostility(target,p)<0?best.id:'pass','只能选择黑色手牌或闪。交牌自愿；黑色闪也只交一张、摸两张。');
      const c=target.hand.find(c=>c.id===key&&(black(c)||c.key==='jink'));
      if(!c||!target.alive||!owner(this,p)||this.over)return;
      const raw=this.withLoss('give',()=>this.removeOwned(target,c.id).card);this.gain(p,[raw]);
      this.draw(target,raw.key==='jink'?2:1);
      this.log(`${target.name}响应${p.name}的【黄天】，交出一张${raw.key==='jink'?'【闪】':'黑色手牌'}并摸${raw.key==='jink'?2:1}张牌。`,'draw');
      await this.flushSkillEvents();this.change();
    };
    P.preparationSkills=async function(p){await preparation.call(this,p);await this.zhangjiaoHuangtian(p);};
    P.dynastyStates=function(p,compact=false){const list=states.call(this,p,compact);if(p.general==='zhangjiao')list.push('黄天 +'+p.zhangjiaoFactions);return list;};
    P.value=function(c,p){let n=value.call(this,c,p);if(owner(this,p)){if(c.key==='jink')n+=2;if(c.suit==='S')n+=1.5;else if(c.suit==='C')n+=.5;}return n;};
  }
  const api={install};root.ZhenZhangjiaoSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
