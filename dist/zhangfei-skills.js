(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,{isSlash}=C;
    const canSlash=P.canSlash,slashAvailable=P.slashAvailable,mark=P.markCardUse,slash=P.slash,drop=P.drop,turnEnd=P.turnEndSkills;
    const isZhang=p=>p?.alive&&p.general==='zhangfei';
    const lost=p=>Math.max(0,p.maxHp-p.hp);
    P.canSlash=function(p,t){return isZhang(p)&&lost(p)>=1&&t?.alive&&p.id!==t.id||canSlash.call(this,p,t);};
    P.slashAvailable=function(p){return isZhang(p)||slashAvailable.call(this,p);};
    P.zhangfeiSlashUse=async function(source,card,targets){
      if(card.zhangfeiChecked)return;
      card.zhangfeiChecked=true;
      if(isZhang(source)){
        const n=lost(source);
        if(n>=2)card.unrespondable=true;
        if(n>=3&&targets.length){
          const candidates=targets.filter(t=>t.alive&&this.owned(t,true).length);
          const choice=await this.option(source,'喝断：选择获得目标牌或回复1点体力',[
            ...(candidates.length?[{key:'take',label:'获得一名目标角色的一张牌'}]:[]),
            {key:'heal',label:'回复1点体力'}
          ],source.hp<=2||!candidates.length?'heal':'take');
          if(choice==='take'&&candidates.length){
            const preferred=[...candidates].sort((a,b)=>this.hostility(source,b)-this.hostility(source,a)||this.owned(b,true).length-this.owned(a,true).length)[0];
            const id=candidates.length===1?String(preferred.id):await this.option(source,'喝断：选择目标',candidates.map(t=>({key:String(t.id),label:t.name+' · '+this.owned(t,true).length+'张牌'})),String(preferred.id));
            const target=this.get(Number(id));if(target?.alive&&this.owned(target,true).length)await this.takeOtherCard(source,target,'obtain',true);
          }else this.heal(source,1);
          this.log(`${source.name}触发【喝断】，${choice==='take'?'获得目标一张牌':'回复1点体力'}。`,'system');
        }
      }
      for(const target of this.actionOrder(targets)){
        if(!target?.alive||card.dujuNullified)break;
        for(const owner of this.actionOrder(this.alive().filter(p=>p.general==='zhangfei'&&!p.silenced&&this.distance(p,target)<=1))){
          const protect=this.hostility(owner,target)<0||owner.id===target.id;
          const hostile=this.hostility(owner,source)>0;
          const worthwhile=owner.hp>1&&protect&&hostile&&(!target.hand.some(c=>c.key==='jink')||target.hp<=1||card.unrespondable);
          const choice=await this.option(owner,`独据：替${target.name}拦下${source.name}的【杀】？`,[{key:'yes',label:'获得此杀，失去1点体力并令杀无效'},{key:'no',label:'不发动'}],worthwhile?'yes':'no','发动后，你与杀的使用者的非锁定技失效直到本回合结束。');
          if(choice!=='yes'||!owner.alive)continue;
          const physical=card.virtual?(card.costs||[]):[card];
          const taken=physical.filter(c=>this.table.some(x=>x.id===c.id));
          for(const c of taken){const i=this.table.findIndex(x=>x.id===c.id),raw=this.table.splice(i,1)[0];raw.dujuTaken=true;c.dujuTaken=true;this.gain(owner,[raw]);}
          if(taken.length)this.log(`${owner.name}发动【独据】，获得【${card.name}】。`,'response');
          await this.loseHp(owner,1,'独据');
          card.dujuNullified=true;
          this.showCardAction(owner,card,[source],'独据');
          for(const p of [owner,source])if(p?.alive){
            if(!p.dujuSilence)p.dujuSilence={turn:this.totalTurns,wasSilenced:!!p.silenced};
            p.silenced=true;
          }
          this.log(`${owner.name}【独据】令此【${card.name}】无效；${owner.name}与${source.name}的非锁定技本回合失效。`,'response');
          break;
        }
      }
    };
    P.markCardUse=async function(p,c,ts){
      const valid=await mark.call(this,p,c,ts);
      if(valid&&isSlash(c)&&ts.length)await this.zhangfeiSlashUse(p,c,ts);
      return valid;
    };
    P.slash=async function(source,target,card,nature='normal',amount=1){
      if(!card.zhangfeiChecked)await this.zhangfeiSlashUse(source,card,[target]);
      if(card.dujuNullified||this.over||!source.alive||!target.alive)return;
      return slash.call(this,source,target,card,nature,amount);
    };
    P.drop=function(c){if(c&&!c.virtual&&this.players.some(p=>this.owned(p,true).some(x=>x.id===c.id)))return;return drop.call(this,c);};
    P.turnEndSkills=async function(){
      await turnEnd.call(this);
      for(const p of this.players)if(p.dujuSilence?.turn===this.totalTurns){
        p.silenced=!!p.restrictionUntil||p.dujuSilence.wasSilenced&&p.restrictionUntil==null;
        p.dujuSilence=null;
      }
    };
  }
  const api={install};root.ZhenZhangfeiSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
