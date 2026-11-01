(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,init=P.initExtra,active=P.activeSkills,prepare=P.prepareActive,ai=P.aiPlay;
    const playStart=P.playStartSkills,mark=P.markCardUse,health=P.applyDamageHealth,finish=P.finishPhaseSkills;
    const effective=P.effectiveTargets,group=P.groupTrickResolved,death=P.death,takePhysical=P.takePhysical,states=P.dynastyStates;
    const owner=(g,p)=>!!p?.alive&&g.isGeneral(p,'yuanshao');
    const same=(p,generation)=>!!p?.alive&&p.generation===generation;
    const token=p=>`${p.id}:${p.generation}`;
    const label=p=>`${p.name} · ${p.id+1}号位 · ${p.hp}体力 · 手牌${p.hand.length}`;
    const arrows=cost=>({...C.defs.arrows,id:`hemeng-${cost.id}`,virtual:true,costs:[cost],suit:cost.suit,rank:cost.rank,originSkill:'hemeng'});
    P.initExtra=function(p){
      init.call(this,p);
      Object.assign(p,{yuanshaoMeng:[],yuanshaoHemengTurn:-1,yuanshaoPlaySerial:0,yuanshaoMingmenTurn:-1,yuanshaoFinishTurn:-1,yuanshaoFailedPlan:''});
    };
    P.playStartSkills=async function(p){
      if(p.general==='yuanshao'){p.yuanshaoHemengTurn=-1;p.yuanshaoPlaySerial++;p.yuanshaoFailedPlan='';}
      return playStart.call(this,p);
    };
    P.yuanshaoInviteLimit=function(p){return Math.floor(this.alive().filter(t=>t.id!==p.id).length/2);};
    P.yuanshaoCosts=function(p){return p.hand.filter(c=>this.canUse(p,arrows(c))&&this.allowedUse(p,arrows(c)));};
    P.yuanshaoHemengReady=function(p,inFlight=false){
      return owner(this,p)&&!this.over&&!this.turnInterrupted&&this.isPlayPhaseOwner(p)&&
        (inFlight||p.yuanshaoHemengTurn!==this.totalTurns)&&this.yuanshaoInviteLimit(p)>0&&this.yuanshaoCosts(p).length>0&&
        this.alive().some(t=>t.id!==p.id&&t.hand.length>0);
    };
    P.yuanshaoPlanSignature=function(p){
      return `${this.totalTurns}:${p.yuanshaoPlaySerial}:${p.hand.map(c=>c.id).join(',')}:${this.alive().map(t=>`${token(t)}=${t.hand.length}/${t.hp}`).join(',')}`;
    };
    P.yuanshaoInviteScore=function(p,t){
      // Invitation choices use public information, never another player's card faces.
      const h=this.hostility(p,t);
      return (h<-.5?8:h>.5?-3:1)+(t.equip.armor?.key==='vine'?-4:0)+(t.hp<=2?2:0)-Math.max(0,3-t.hand.length);
    };
    P.yuanshaoBoostScore=function(p,t,extra=0){
      if(t.equip.armor?.key==='vine'||this.chengongProtected?.(t))return -20;
      return this.hostility(p,t)*5+(t.hp<=1?3:0)-this.damageBenefitRisk(t)-extra*1.5;
    };
    P.yuanshaoWantsAlliance=function(t,p){
      if(!t.hand.length||t.equip.armor?.key==='vine'||this.chengongProtected?.(t))return false;
      const cheap=[...t.hand].sort((a,b)=>this.value(a,t)-this.value(b,t))[0];
      if(this.hostility(t,p)<-.5)return this.value(cheap,t)<=8||t.hand.length>t.hp;
      // A threatened enemy may pay for safety, but does not donate valuable rescue cards freely.
      return t.hp<=2&&!t.hand.some(c=>c.key==='jink')&&this.value(cheap,t)<=5;
    };
    P.yuanshaoHemeng=async function(p){
      if(!this.yuanshaoHemengReady(p))return false;
      const generation=p.generation,serial=p.yuanshaoPlaySerial,invited=[];
      const available=this.alive().filter(t=>t.id!==p.id&&t.hand.length),limit=Math.min(this.yuanshaoInviteLimit(p),available.length);
      for(let i=0;i<limit;i++){
        const pool=available.filter(t=>!invited.includes(t)&&t.alive&&t.hand.length);
        if(!pool.length)break;
        const best=[...pool].sort((a,b)=>this.yuanshaoInviteScore(p,b)-this.yuanshaoInviteScore(p,a))[0];
        const key=await this.option(p,`合盟：邀请角色（${invited.length}/${limit}）`,[
          ...pool.map(t=>({key:String(t.id),label:label(t)})),
          ...(invited.length?[{key:'done',label:'完成邀请'}]:[]),{key:'cancel',label:'取消合盟'}
        ],this.yuanshaoInviteScore(p,best)>0?String(best.id):(invited.length?'done':'cancel'),'邀请名额按所有其他存活角色数的一半向下取整；受邀者可以拒绝。');
        if(key==='cancel')return false;
        if(key==='done')break;
        const t=pool.find(t=>String(t.id)===key);if(!t)return false;invited.push(t);
      }
      if(!invited.length||!same(p,generation)||!this.yuanshaoHemengReady(p))return false;
      const costs=this.yuanshaoCosts(p),cheapest=[...costs].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const [costId]=await this.selectCards(p,'合盟：选择当万箭齐发使用的手牌',costs,0,1,[cheapest.id],'不选牌并确认可取消。确认后发出邀请并消耗本阶段次数；无人参与不消耗转化手牌，但仍扣次数。');
      if(!costId||!same(p,generation)||!this.yuanshaoHemengReady(p)||!this.yuanshaoCosts(p).some(c=>c.id===costId))return false;
      p.yuanshaoHemengTurn=this.totalTurns;
      const pledges=[];
      for(const t of this.actionOrder(invited)){
        if(!same(p,generation)||this.over||this.turnInterrupted)return false;
        if(!t.alive||!t.hand.length)continue;
        const tg=t.generation,cheap=[...t.hand].sort((a,b)=>this.value(a,t)-this.value(b,t))[0];
        const ids=await this.selectCards(t,`合盟：${p.name}邀请你参与`,t.hand,0,1,this.yuanshaoWantsAlliance(t,p)?[cheap.id]:[],
          '自愿参与：选一张手牌置为“盟”，免受这次万箭齐发影响。空选并确认即拒绝；盟在结算后交给袁绍。');
        if(Array.isArray(ids)&&ids.length===1&&same(t,tg)&&t.hand.some(c=>c.id===ids[0]))pledges.push({player:t,generation:tg,id:ids[0]});
      }
      if(!same(p,generation)||!this.yuanshaoHemengReady(p,true)||!this.yuanshaoCosts(p).some(c=>c.id===costId))return false;
      const validPledges=pledges.filter(e=>same(e.player,e.generation)&&e.player.hand.some(c=>c.id===e.id));
      if(!validPledges.length){
        p.yuanshaoFailedPlan=this.yuanshaoPlanSignature(p);
        this.log(`${p.name}的【合盟】无人参与，本阶段次数已消耗；不消耗转化手牌，不使用万箭齐发。`,'system');this.change();return true;
      }
      const participantIds=validPledges.map(e=>e.player.id),required=this.alive().filter(t=>t.id!==p.id&&!participantIds.includes(t.id)).map(token);
      const count=validPledges.length,escrowIds=validPledges.map(e=>e.id);
      p.yuanshaoHemengTurn=this.totalTurns;
      let raw=null,card=null,targets=[];
      try{
        for(const e of validPledges){p.yuanshaoMeng.push(this.removeOwned(e.player,e.id).card);this.evidence(e.player,p,true);}
        this.log(`${p.name}发动【合盟】，${validPledges.map(e=>e.player.name+'（'+(e.player.id+1)+'号位）').join('、')}各置一张手牌为“盟”。`,'use');
        this.change();await this.flushSkillEvents();
        if(!same(p,generation)||this.over||this.turnInterrupted||!p.hand.some(c=>c.id===costId))return true;
        const preview=arrows(p.hand.find(c=>c.id===costId));
        preview.yuanshaoParticipants=participantIds;preview.yuanshaoExtraJinks={};
        targets=this.effectiveTargets(p,preview,[]);
        for(let i=0;i<count&&targets.length;i++){
          const pool=targets.filter(t=>t.alive);if(!pool.length)break;
          const best=[...pool].sort((a,b)=>this.yuanshaoBoostScore(p,b,preview.yuanshaoExtraJinks[b.id]||0)-this.yuanshaoBoostScore(p,a,preview.yuanshaoExtraJinks[a.id]||0))[0];
          const key=await this.option(p,`合盟：分配额外闪（${i+1}/${count}）`,[
            ...pool.map(t=>({key:String(t.id),label:`${label(t)} · 选后须${2+(preview.yuanshaoExtraJinks[t.id]||0)}张闪`})),{key:'skip',label:'放弃剩余追加'}
          ],this.yuanshaoBoostScore(p,best,preview.yuanshaoExtraJinks[best.id]||0)>0?String(best.id):'skip','每张盟可让一个目标多出一张闪；可重复选择同一目标。');
          if(key==='skip')break;
          const t=pool.find(t=>String(t.id)===key);if(!t)break;
          preview.yuanshaoExtraJinks[t.id]=(preview.yuanshaoExtraJinks[t.id]||0)+1;
        }
        if(!same(p,generation)||this.over||this.turnInterrupted||!this.yuanshaoCosts(p).some(c=>c.id===costId))return true;
        raw=this.removeHand(p,costId);card={...preview,costs:[raw],wasUsedAsAction:true,originalTargets:targets.map(t=>t.id)};
        this.showCardAction(p,card,targets,'合盟');this.sound('card',{playerId:p.id,cardKey:'arrows',kind:'trick'});
        this.log(`${p.name}将一张手牌当【万箭齐发】使用；参与合盟的角色不成为目标。`,'use');
        const usable=await this.markCardUse(p,card,targets);
        if(usable)for(let i=0;i<(card.resolutions||1)&&!this.over&&!this.turnInterrupted;i++){
          const allowed=[];
          for(const t of this.actionOrder(targets))if(t.alive&&!this.over&&await this.trickAllowed(p,t,card))allowed.push(t);
          await this.groupTrickResolved(p,card,allowed);
        }
      }finally{
        try{if(raw&&this.table.some(c=>c.id===raw.id))this.drop(raw);if(card)await this.afterCardUse(p,card,targets);}
        finally{
          const held=(p.yuanshaoMeng||[]).filter(c=>escrowIds.includes(c.id));
          p.yuanshaoMeng=(p.yuanshaoMeng||[]).filter(c=>!escrowIds.includes(c.id));
          if(same(p,generation)){
            this.gain(p,held);
            this.log(`${p.name}获得${held.length}张“盟”，然后弃置${count}张手牌（不足则全弃）。`,'draw');
            await this.flushSkillEvents();
            if(same(p,generation)){
              const n=Math.min(count,p.hand.length),suggested=[...p.hand].sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,n).map(c=>c.id);
              const ids=n&&!this.over?await this.selectCards(p,`合盟：弃置${n}张手牌`,p.hand,n,n,suggested,'弃牌数量等于本次盟数；只弃手牌，不足则全部弃置。'):suggested;
              if(same(p,generation)){
                const selected=[...new Set(ids||[])].filter(id=>p.hand.some(c=>c.id===id)).slice(0,n);
                for(const c of [...p.hand].sort((a,b)=>this.value(a,p)-this.value(b,p)))if(selected.length<Math.min(count,p.hand.length)&&!selected.includes(c.id))selected.push(c.id);
                this.discardOwned(p,selected);
              }
            }
            if(same(p,generation)&&card&&required.length&&required.every(id=>card.yuanshaoVictims?.includes(id))&&p.yuanshaoPlaySerial===serial&&this.isPlayPhaseOwner(p)){
              p.yuanshaoHemengTurn=-1;p.yuanshaoFailedPlan='';
              this.log(`${p.name}的【合盟】对所有未参与的其他角色均造成伤害，重置本出牌阶段的合盟次数。`,'system');
            }
          }else this.putDiscard(...held);
          await this.flushSkillEvents();this.change();
        }
      }
      return true;
    };
    P.effectiveTargets=function(p,c,ts){
      const out=effective.call(this,p,c,ts);
      return c.originSkill==='hemeng'?out.filter(t=>!c.yuanshaoParticipants?.includes(t.id)):out;
    };
    P.groupTrickResolved=async function(p,c,players){
      if(c.originSkill!=='hemeng'||c.key!=='arrows')return group.call(this,p,c,players);
      for(const t of this.actionOrder(players)){
        if(!t.alive||this.over||this.turnInterrupted)continue;
        if(!c.ignoreArmor&&t.equip.armor?.key==='vine'){this.log(`${t.name}的藤甲抵消【万箭齐发】。`,'response');continue;}
        const generation=t.generation,need=this.dongzhuoJinkNeed(t,1+(c.yuanshaoExtraJinks?.[t.id]||0));
        this.evidence(p,t,false);let answered=true;
        for(let i=1;i<=need;i++){
          if(!same(t,generation)||this.over||this.turnInterrupted){answered=false;break;}
          if(!(await this.response(t,'jink',`【合盟·万箭齐发】：请打出第${i}/${need}张闪，否则受到1点伤害`,!!c.ignoreArmor,{played:true,amount:1,source:p,card:c,dongzhuoJinkBatch:true,unavoidable:!!c.noCancel}))){answered=false;break;}
        }
        if(same(t,generation)&&!this.over&&!this.turnInterrupted&&(!answered||c.noCancel))await this.damage(p,t,1,'normal',{card:c});
        await this.pause();
      }
    };
    P.markCardUse=async function(p,c,ts){
      // Reset per declaration, even if the same physical card is obtained and used again.
      c.yuanshaoVictims=[];c.yuanshaoUseTurn=this.totalTurns;
      return mark.call(this,p,c,ts);
    };
    P.applyDamageHealth=function(source,target,amount,context){
      const victim=token(target);health.call(this,source,target,amount,context);
      const c=context.card;
      if(amount<=0||!c||!source||c.ownerId!==source.id||c.sourceGeneration!==source.generation||c.yuanshaoUseTurn!==this.totalTurns)return;
      if(source.id===target.id)return;
      c.yuanshaoVictims=c.yuanshaoVictims||[];
      if(!c.yuanshaoVictims.includes(victim))c.yuanshaoVictims.push(victim);
      if(source.general==='yuanshao'&&this.turn===source.id&&new Set(c.yuanshaoVictims.map(x=>x.split(':')[0])).size>=2)source.yuanshaoMingmenTurn=this.totalTurns;
    };
    P.finishPhaseSkills=async function(p){
      await finish.call(this,p);
      if(!owner(this,p)||this.over||this.turn!==p.id||this.phase!=='结束'||p.yuanshaoFinishTurn===this.totalTurns)return;
      p.yuanshaoFinishTurn=this.totalTurns;
      const n=p.yuanshaoMingmenTurn===this.totalTurns?5:3;
      this.draw(p,n);this.log(`${p.name}发动【名门】，${n===5?'本回合同一张牌已对至少两名其他角色造成伤害，':''}摸${n===5?'五':'三'}张牌。`,'draw');
      await this.flushSkillEvents();this.change();
    };
    P.takePhysical=function(id){
      for(const p of this.players){const i=(p.yuanshaoMeng||[]).findIndex(c=>c.id===id);if(i>=0)return p.yuanshaoMeng.splice(i,1)[0];}
      return takePhysical.call(this,id);
    };
    P.death=async function(p,s){this.putDiscard(...(p.yuanshaoMeng||[]).splice(0));return death.call(this,p,s);};
    P.activeSkills=function(p){
      const list=active.call(this,p);
      if(owner(this,p))list.push({key:'yuanshao_hemeng',name:'合盟',ready:this.yuanshaoHemengReady(p),detail:`自愿入盟 · 至多${this.yuanshaoInviteLimit(p)}人 · 手牌当万箭`,reason:p.yuanshaoHemengTurn===this.totalTurns?'本出牌阶段已使用；伤及全部未参与者可重置':'须在自己的出牌阶段，有可用手牌、邀请名额和可参与者'});
      return list;
    };
    P.prepareActive=async function(p,a){if(a.skill!=='yuanshao_hemeng')return prepare.call(this,p,a);await this.yuanshaoHemeng(p);return null;};
    P.aiPlay=function(p,actions){
      const action=actions.find(a=>a.skill==='yuanshao_hemeng');
      if(action&&p.yuanshaoFailedPlan!==this.yuanshaoPlanSignature(p)){
        const friends=this.alive().filter(t=>t.id!==p.id&&t.hand.length&&this.yuanshaoInviteScore(p,t)>0);
        const shielded=[...friends].sort((a,b)=>this.yuanshaoInviteScore(p,b)-this.yuanshaoInviteScore(p,a)).slice(0,this.yuanshaoInviteLimit(p));
        const score=this.alive().filter(t=>t.id!==p.id&&!shielded.includes(t)).reduce((n,t)=>n+Math.max(-10,this.yuanshaoBoostScore(p,t)),0);
        if(shielded.length&&score>0)return action;
      }
      return ai.call(this,p,actions.filter(a=>a.skill!=='yuanshao_hemeng'));
    };
    P.dynastyStates=function(p,compact=false){
      const out=states.call(this,p,compact);
      if(p.general==='yuanshao'){
        out.push(`合盟 · 本阶段${p.yuanshaoHemengTurn===this.totalTurns?'已用':'可用'} · 邀请上限${this.yuanshaoInviteLimit(p)}`);
        if(p.yuanshaoMeng?.length)out.push(`盟 · ${p.yuanshaoMeng.length}张（结算后获得）`);
        out.push(`名门 · 结束阶段摸${p.yuanshaoMingmenTurn===this.totalTurns?'五':'三'}张`);
      }
      return out;
    };
  }
  const api={install};root.ZhenYuanshaoSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
