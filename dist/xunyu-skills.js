(function(root){
  'use strict';
  function install(Game,C){
    const P=Game.prototype,active=P.activeSkills,prepare=P.prepareActive,ai=P.aiPlay,plan=P.quhuPlan;
    P.xunyuDraftReady=function(p){
      return this.isGeneral(p,'jiexunyu')&&p.alive&&!this.over&&this.isPlayPhaseOwner(p)&&
        p.hand.length>0&&p.xunyuDraftTurn!==this.totalTurns&&this.alive().some(t=>t.id!==p.id);
    };
    P.xunyuDraft=async function(p){
      if(!this.xunyuDraftReady(p))return false;
      const generation=p.generation;
      const low=[...p.hand].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const [cost]=await this.selectCards(p,'荐贤：弃置一张手牌',p.hand,1,1,[low.id],'弃置后展示牌堆顶三张牌，令其他角色先选一张，然后你可以直接获得余下的一张。');
      if(!this.xunyuDraftReady(p)||!p.hand.some(c=>c.id===cost))return false;
      p.xunyuDraftTurn=this.totalTurns;
      this.discardOwned(p,[cost]);
      const pool=[];
      try{
        for(let i=0;i<3;i++){const c=this.takeTop();if(c){pool.push(c);this.table.push(c);}}
        this.log(`${p.name}发动【荐贤】，展示${pool.map(c=>`【${c.name}】${C.suitMark[c.suit]}${C.rankMark(c.rank)}`).join('、')||'零张牌'}。`,'reveal');
        this.change();
        if(!pool.length)return true;
        const targets=this.alive().filter(t=>t.id!==p.id);
        if(!p.alive||p.generation!==generation||this.over||!targets.length)return true;
        const friend=targets.filter(t=>this.hostility(p,t)<-.5).sort((a,b)=>a.hand.length-b.hand.length)[0];
        const suggested=friend||[...targets].sort((a,b)=>this.hostility(p,a)-this.hostility(p,b)||b.hand.length-a.hand.length)[0];
        const id=await this.choose(p,{kind:'options',title:'荐贤：令一名其他角色选择获得一张牌',detail:'展示牌面公开；被选择的角色自行选一张，然后你可以获得余下的一张。',revealedCards:[...pool],options:targets.map(t=>({key:String(t.id),label:`${t.name} · ${t.id+1}号位 · 手牌${t.hand.length}`}))},()=>String(suggested.id));
        const target=targets.find(t=>String(t.id)===id);
        if(!target?.alive||!p.alive||p.generation!==generation||this.over)return true;
        const take=(who,card)=>{pool.splice(pool.indexOf(card),1);this.table=this.table.filter(c=>c.id!==card.id);this.gain(who,[card]);this.log(`${who.name}获得【荐贤】展示的【${card.name}】。`,'draw');this.change();};
        const ranked=(who,cards)=>[...cards].sort((a,b)=>this.value(b,who)-this.value(a,who)||b.rank-a.rank);
        const [first]=await this.choose(target,{kind:'cards',title:'荐贤：选择一张展示牌获得',detail:'你先获得一张，荀彧随后可以获得余下的一张。',cards:[...pool],min:1,max:1,publicReveal:true},()=>[ranked(target,pool)[0].id]);
        const card=pool.find(c=>c.id===first);
        if(card&&target.alive)take(target,card);
        if(pool.length&&p.alive&&p.generation===generation&&!this.over){
          const [second]=await this.choose(p,{kind:'cards',title:'荐贤：可以获得余下的一张牌',detail:'直接获得，无需另交手牌；也可放弃。未被获得的牌置于牌堆底。',cards:[...pool],min:0,max:1,publicReveal:true},()=>[ranked(p,pool)[0].id]);
          const own=pool.find(c=>c.id===second);
          if(own&&p.alive&&p.generation===generation)take(p,own);
        }
        this.evidence(p,target,true);
        return true;
      }finally{
        // Deck top is the end of the array. Preserve reveal order at the bottom.
        for(const c of pool)this.table=this.table.filter(x=>x.id!==c.id);
        this.deck.unshift(...[...pool].reverse());
        if(pool.length)this.log(`【荐贤】剩余${pool.length}张牌置于牌堆底。`,'system');
        this.change();
        await this.flushSkillEvents();
      }
    };
    P.activeSkills=function(p){
      const list=active.call(this,p);
      if(this.isGeneral(p,'jiexunyu'))list.push({key:'jianxian',name:'荐贤',ready:this.xunyuDraftReady(p),
        detail:'弃一亮三 · 他人先取一张 · 自己可取一张 · 每回合一次',
        reason:p.xunyuDraftTurn===this.totalTurns?'本回合已使用':!p.hand.length?'需要一张手牌':!this.isPlayPhaseOwner(p)?'自己的出牌阶段发动':'条件不足'});
      return list;
    };
    P.prepareActive=async function(p,a){if(a.skill!=='jianxian')return prepare.call(this,p,a);await this.xunyuDraft(p);return null;};
    P.aiPlay=function(p,actions){
      const draft=actions.find(a=>a.type==='skill'&&a.skill==='jianxian');
      if(draft&&this.alive().some(t=>t.id!==p.id&&this.hostility(p,t)<-.5))return draft;
      return ai.call(this,p,actions.filter(a=>a.skill!=='jianxian'));
    };
    P.quhuPlan=function(p,skill){
      if(skill!=='jiequhu'||!this.isGeneral(p,'jiexunyu'))return plan.call(this,p,skill);
      const own=[...p.hand].sort((a,b)=>b.rank-a.rank||this.value(a,p)-this.value(b,p))[0];if(!own)return null;
      let best=null;
      for(const t of this.alive()){
        if(t.id===p.id||!t.hand.length||t.hp<p.hp)continue;
        const victim=this.alive().filter(v=>v.id!==t.id&&this.distance(t,v)<=this.range(t)&&this.hostility(p,v)>.5).sort((a,b)=>a.hp-b.hp)[0];
        if(!victim)continue;
        const bonus=t.general==='lvmeng'&&t.lvmengAwakened?1:0;
        const chance=Math.pow(Math.max(0,(own.rank-1-bonus)/13),t.hand.length);
        const loss=p.hp<=1?12:p.hp<=2?7:4.5,gain=4+(victim.hp<=1?3:0);
        const score=chance*gain-(1-chance)*loss-this.value(own,p)*.13;
        if(!best||score>best.score)best={target:t,victim,score};
      }
      return best;
    };
  }
  const api={install};root.ZhenXunyuSkills=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
