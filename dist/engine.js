(function (root) {
  'use strict';
  const C = root.ZhenCards || (typeof require !== 'undefined' ? require('./cards.js') : null);
  const { isSlash, isRed, defs } = C;
  const generals=root.ZhenGenerals||(typeof require!=='undefined'?require('./generals.js'):null);
  const MODE_NAMES = { duel:'1V1 · 对决', team:'2V2 · 同袍', identity:'军8 · 身份', landlord:'斗地主 · 三人对战' };
  const combinations = (arr, n) => n === 0 ? [[]] : arr.flatMap((x, i) => combinations(arr.slice(i + 1), n - 1).map(y => [x, ...y]));
  class Cancelled extends Error {}
  class Game {
    constructor(options = {}, hooks = {}) {
      this.options = { mode:'team', seat:0, role:'random', relay:false, seed:Date.now() >>> 0, gender:'male', ...options };
      this.hooks = hooks;
      this.rng = this.options.seed >>> 0 || 1;
      this.history = [];
      this.replay = [...(hooks.replay || [])];
      this.replaying = this.replay.length > 0;
      this.restoring = this.replay.length > 0;
      this.replayIndex = 0;
      this.players = [];
      this.deck = [];
      this.discard = [];
      this.table = [];
      this.logItems = [];
      this.turn = 0;
      this.round = 1;
      this.phase = '准备';
      this.totalTurns = 0;
      this.pending = null;
      this.over = null;
      this.stopped = false;
      this.auto = !!hooks.auto;
      this.lastCard = null;
      this.cardActionSerial = 0;
      this.cardActions = [];
      this.lastJudgment = null;
      this.judging = false;
      this.harvestReveal = null;
      this.lastEvent = null;
      this.humanId = 0;
      this.controlledSeats = null;
      this.autoSeats = new Set();
    }
    random() {
      let x = this.rng;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this.rng = x >>> 0;
      return this.rng / 4294967296;
    }
    shuffle(array) {
      const a = [...array];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [a[i],a[j]] = [a[j],a[i]]; }
      return a;
    }
    alive() { return this.players.filter(p => p.alive); }
    human() { return this.players[this.humanId]; }
    general(p) { return generals[p.general]||generals.blank; }
    fengweiCards(p) { return p.hand.filter(c=>(p.fengweiIds||[]).includes(c.id)); }
    fengweiReductionWorth(p,amount) {
      const recipients=this.alive().filter(t=>t.id!==p.id);
      return this.fengweiCards(p).length>0&&recipients.length>0&&(recipients.some(t=>this.hostility(p,t)<-.5)||p.hp<=amount||amount>=2);
    }
    emptyAreaCount(p) { return [p.hand.length===0,Object.keys(p.equip).length===0,p.judge.length===0].filter(Boolean).length; }
    forgetFengwei(p,id) { p.fengweiIds=(p.fengweiIds||[]).filter(x=>x!==id); }
    zonghuCost() { return Math.min(3,this.round); }
    canZonghu(p) { return p.alive&&this.isGeneral(p,'liuzhang')&&p.zonghuTurn!==this.totalTurns&&this.owned(p).length>=this.zonghuCost()&&this.alive().some(t=>t.id!==p.id); }
    async roundStart() {
      if(this.startedRound===this.round)return;
      this.startedRound=this.round;
      for(const p of this.players)p.fengweiIds=[];
      for(const p of this.actionOrder(this.alive().filter(p=>this.isGeneral(p,'liuzhang')))) {
        const max=this.alive().length;
        const count=Number(await this.option(p,'丰蔚：本轮摸几张牌？',Array.from({length:max+1},(_,i)=>({key:String(i),label:i?'摸'+i+'张':'不摸牌'})),String(max),`至多摸当前存活角色数（${max}）张；持有本轮丰蔚牌时跳过摸牌阶段，受到伤害时可交出一张令伤害-1。`));
        const before=new Set(p.hand.map(c=>c.id));
        this.draw(p,count);
        p.fengweiIds=p.hand.filter(c=>!before.has(c.id)).map(c=>c.id);
        this.log(`${p.name}发动【丰蔚】，获得${p.fengweiIds.length}张本轮丰蔚牌。`,'system');
      }
    }
    zonghuSuggested(p) {
      const marked=new Set(this.fengweiCards(p).map(c=>c.id));
      return [...this.owned(p)].sort((a,b)=>(marked.has(b.id)-marked.has(a.id))*20+this.value(a,p)-this.value(b,p)).slice(0,this.zonghuCost()).map(c=>c.id);
    }
    async zonghuCard(p,key,allowCancel=false) {
      if(!this.canZonghu(p))return null;
      if(allowCancel&&await this.option(p,'发动宗护？',[{key:'yes',label:'发动宗护'},{key:'no',label:'取消'}],'yes')==='no')return null;
      const n=this.zonghuCost(),pool=this.owned(p);
      const ids=await this.selectCards(p,`宗护：选择交出的${n}张牌`,pool,n,n,this.zonghuSuggested(p),'选择手牌或装备牌，再选择收牌角色。必须交出恰好'+n+'张；可优先交出丰蔚牌。');
      if(ids.length!==n)return null;
      const recipients=this.alive().filter(t=>t.id!==p.id);
      const preferred=[...recipients].sort((a,b)=>this.hostility(p,a)-this.hostility(p,b)||a.hand.length-b.hand.length)[0];
      const id=Number(await this.option(p,'宗护：把牌交给谁？',recipients.map(t=>({key:String(t.id),label:t.name+' · '+this.general(t).name+' · 手牌'+t.hand.length})),String(preferred.id),'交出牌后，视为使用一张'+(key==='slash'?'杀':'闪')+'。'));
      const target=this.get(id);
      p.zonghuTurn=this.totalTurns;
      this.gain(target,this.moveBatch(p,()=>ids.map(id=>this.removeOwned(p,id).card)));
      // Giving cards is the skill cost, not evidence of an alliance.
      this.log(`${p.name}发动【宗护】，交给${target.name}${n}张牌，视为使用【${key==='slash'?'杀':'闪'}】。`,'response');
      this.sound('response',{playerId:p.id,cardKey:key});
      return {...defs[key],id:'zonghu',virtual:true,costs:[],suit:'N',rank:0};
    }
    get(id) { return this.players[id]; }
    change() { if (!this.replaying) this.hooks.change?.(this); }
    showCardAction(p,card,targets=[],action='出牌') {
      if(!p||!card)return;
      const ids=targets.map(t=>typeof t==='number'?t:t?.id).filter(Number.isInteger);
      this.lastCard={...card,source:p.id,targets:ids,action,serial:++this.cardActionSerial};
      this.cardActions.push({source:p.id,targets:ids,action,serial:this.cardActionSerial,key:card.key,name:card.name,suit:card.suit,rank:card.rank});
      if(this.cardActions.length>80)this.cardActions.shift();
      this.change();
    }
    sound(type,data={}) {
      if(this.replaying||this.restoring||this.stopped)return;
      // Optional audio must never interrupt a rule resolution.
      try{this.hooks.sound?.({type,...data});}catch{}
    }
    log(text, tone = 'normal') {
      this.logItems.push({ text, tone, turn:this.totalTurns, id:this.logItems.length });
      this.lastEvent = text;
      this.change();
    }
    async pause(minMs = 0) {
      if (this.stopped) throw new Cancelled();
      if (this.replaying || !this.hooks.delay) return;
      await this.hooks.delay(this, minMs);
      if (this.stopped) throw new Cancelled();
    }
    stop() {
      this.stopped = true;
      if (this._reject) this._reject(new Cancelled());
      this._resolve = this._reject = null;
    }
    validateAnswer(prompt, value) {
      if (prompt.kind === 'play') return prompt.actions.some(a => JSON.stringify(a) === JSON.stringify(value));
      if (prompt.kind === 'cards') {
        return Array.isArray(value) && value.length >= prompt.min && value.length <= prompt.max && new Set(value).size === value.length && value.every(id => prompt.cards.some(c => c.id === id)) && (prompt.maxRankSum==null||value.reduce((n,id)=>n+prompt.cards.find(c=>c.id===id).rank,0)<=prompt.maxRankSum);
      }
      return prompt.options.some(o => o.key === value);
    }
    answer(value, seatId = this.humanId) {
      if (!this.pending || !this._resolve || this.pending.playerId !== seatId || !this.validateAnswer(this.pending, value)) return false;
      const resolve = this._resolve;
      this._resolve = this._reject = null;
      this.history.push(structuredClone(value));
      this.pending = null;
      this.hooks.save?.(this);
      this.change();
      resolve(value);
      return true;
    }
    async choose(p, prompt, ai) {
      if (this.stopped) throw new Cancelled();
      if (!(this.controlledSeats || new Set([this.humanId])).has(p.id) || !p.alive) return ai();
      prompt = { ...prompt, playerId:p.id };
      if (this.replayIndex < this.replay.length) {
        const answer = this.replay[this.replayIndex++];
        if (!this.validateAnswer(prompt, answer)) throw new Error('存档与当前规则版本不匹配，请重新开局。');
        this.history.push(structuredClone(answer));
        if (this.replayIndex === this.replay.length) this.replaying = false;
        return answer;
      }
      this.replaying = false;
      if ((this.auto && p.id === this.humanId) || this.autoSeats.has(p.id)) {
        const value = ai();
        this.history.push(structuredClone(value));
        this.hooks.save?.(this);
        return value;
      }
      this.pending = prompt;
      this.restoring = false;
      this._pendingAI = ai;
      this.sound('prompt',{playerId:p.id,promptKind:prompt.kind});
      this.hooks.save?.(this);
      const result = new Promise((resolve, reject) => { this._resolve = resolve; this._reject = reject; });
      this.change();
      return result;
    }
    async option(p, title, options, aiKey, detail = '') {
      return this.choose(p, { kind:'options', title, detail, options }, () => typeof aiKey === 'function' ? aiKey() : aiKey);
    }
    async chooseChainTargets(p,title,actions,aiKey,extraOptions=[]){
      const options=actions.map((a,i)=>({key:String(i),label:a.targets.map(id=>this.get(id).name).join('、')}));
      options.push(...extraOptions);
      return this.choose(p,{kind:'options',title,detail:'在牌桌上点击一到两名角色，再确认使用。',options,
        targetChoices:actions.map((a,i)=>({key:String(i),targets:[...a.targets]}))},()=>aiKey);
    }
    async selectCards(p, title, cards, min, max, suggested, detail = '') {
      return this.choose(p, { kind:'cards', title, detail, cards, min, max }, () => typeof suggested === 'function' ? suggested() : suggested);
    }
    setup() {
      const mode = this.options.mode;
      const n = mode === 'duel' ? 2 : mode === 'landlord' ? 3 : mode === 'team' ? 4 : 8;
      const roles = mode === 'identity' ? ['主公', ...this.shuffle(['忠臣','忠臣','反贼','反贼','反贼','反贼','内奸'])] : Array.from({length:n}, (_,i) => mode === 'team' ? ([0,3].includes(i) ? '青方' : '赤方') : mode === 'landlord' ? (i===0?'地主':'农民') : (i === 0 ? '先手' : '后手'));
      this.humanId = this.options.seat === 'random' ? Math.floor(this.random() * n) : Number(this.options.seat) % n;
      if (mode === 'identity') {
        if (this.options.role === 'random') this.humanId = Math.floor(this.random() * n);
        else this.humanId = roles.indexOf(this.options.role);
      }
      if (this.humanId < 0) this.humanId = 0;
      this.controlledSeats = new Set(Array.isArray(this.options.controlledSeats) ? this.options.controlledSeats.filter(id => Number.isInteger(id) && id >= 0 && id < n) : [this.humanId]);
      const seatConfigs = this.options.seatConfigs || {};
      this.players = roles.map((role,id) => ({
        id, name:'无技能角色', role, team:mode === 'team'||mode==='landlord' ? role : id,
        gender:seatConfigs[id]?.gender || (id === this.humanId ? this.options.gender : (id % 3 === 1 ? 'female' : 'male')),
        hp:4, maxHp:4, alive:true, hand:[], equip:{}, judge:[], chained:false, loyalty:0,
        generation:1, remaining:mode === 'duel' && this.options.relay ? 3 : 1,
        turns:0, slashUsed:0, wineUsed:0, drunk:0, skipDraw:false, skipPlay:false,gongkuUsed:false
      }));
      const randomPool=[...new Set((this.options.generalPool||Object.keys(generals).filter(k=>k!=='blank'&&!generals[k].removed)).filter(k=>k!=='blank'&&generals[k]))];
      const randomUsed=new Set();
      for(const config of Object.values(seatConfigs))if(config?.general&&config.general!=='random'&&config.general!=='blank'&&generals[config.general])randomUsed.add(config.general);
      const humanChoice=this.options.general||'blank';if(!seatConfigs[this.humanId]&&humanChoice!=='random'&&humanChoice!=='blank'&&generals[humanChoice])randomUsed.add(humanChoice);
      for(const p of this.players) {
        p.general=(seatConfigs[p.id]?.general ?? (p.id===this.humanId?this.options.general:this.options.aiGeneral))||'blank';
        if(!generals[p.general]&&p.general!=='random')p.general='blank';
        if(p.general==='random'){const pool=randomPool.filter(k=>!randomUsed.has(k));p.general=pool.length?pool[Math.floor(this.random()*pool.length)]:'blank';if(p.general!=='blank')randomUsed.add(p.general);}
        this.initExtra(p);p.fengweiIds=[];p.zonghuTurn=-1;p.turnedOver=false;p.chengxiangBonus=0;p.caocongEquipRound=-1;
        if(p.general!=='blank') {p.gender=this.general(p).gender;p.hp=p.maxHp=this.general(p).hp;}
        p.name=this.general(p).name;
        if(mode==='landlord'&&p.role==='地主')p.hp=p.maxHp+=1;
        if(p.general==='shenganning'&&this.options.rulesVersion>=12)p.hp-=2;
        if(this.general(p).initialHp!=null)p.hp=this.general(p).initialHp;
      }
      this.allCards = C.makeDeck(mode !== 'duel', mode === 'duel' && this.options.relay);
      this.deck = this.shuffle(this.allCards);
      const selected=[...new Set(this.players.filter(p=>p.general!=='blank').map(p=>p.general))];
      this.log(`进入${MODE_NAMES[mode]}。${selected.length?selected.map(id=>generals[id].name+'：'+generals[id].skills.map(s=>s.name).join('、')).join('；')+'。':'所有角色体力上限4，无武将技能。'}`, 'system');
      for (const p of this.players) this.draw(p, (mode === 'team' && p.id === 3 ? 5 : 4)+(this.isGeneral(p,'shenzhaoyun')?2:0), false);
      this.log(this.options.controlledSeats ? `联机牌局已开始，共${this.controlledSeats.size}名真人。` : mode === 'identity' ? `你的身份是${this.human().role}。其他身份在阵亡前保持隐藏。` : mode === 'team' ? `你在${this.humanId + 1}号位，属于${this.human().team}。1、4号位同队，2、3号位同队。` : mode==='landlord' ? `你是${this.human().role}。地主加1点体力上限，拥有飞扬和跋扈；农民队友阵亡后可发动共苦。` : `你是${this.human().role}，${this.options.relay ? '双方各有三名角色依次接力，后续角色为4血无技能' : '击败对手即获胜'}。`, 'system');
      this.sound('start');
    }
    async start() {
      try {
        this.setup();
        await this.openingMulligan();
        await this.openingSkills();
        while (!this.over && !this.stopped) {
          const p = this.get(this.turn);
          if (p.alive) {await this.takeTurn(p);await this.turnEndSkills();}
          if (this.over) break;
          const next = this.nextAlive(this.turn);
          if (!next) break;
          if (next.id <= this.turn) {await this.roundEndSkills();this.round++;}
          this.turn = next.id;
        }
        if (this.over) { this.pending = null; this.hooks.save?.(this); this.change(); }
      } catch (error) {
        if (!(error instanceof Cancelled)) { this.error = error.message; this.hooks.error?.(error); throw error; }
      }
      return this.over;
    }
    openingHandNeedsReroll(p, used) {
      const hand=p.hand;
      const attacks=hand.filter(c=>isSlash(c)||c.key==='duel'||c.key==='fireAttack').length;
      const defenses=hand.filter(c=>['jink','peach','wine','nullify'].includes(c.key)||c.slot==='armor').length;
      const score=hand.reduce((sum,c)=>sum+this.value(c,p),0)
        +(attacks?2:-2)+(defenses?2:-2)-Math.max(0,attacks-2)*2;
      return score<hand.length*5.5+3-used*2;
    }
    rerollOpeningHand(p) {
      const old=p.hand.splice(0);
      const replacement=[];
      // Draw first so none of the returned cards can immediately reappear.
      while(replacement.length<old.length&&this.deck.length)replacement.push(this.deck.pop());
      for(const card of old)delete card.qiOwner;
      this.deck=this.shuffle([...this.deck,...old]);
      while(replacement.length<old.length&&this.deck.length)replacement.push(this.deck.pop());
      if(this.players.some(player=>player.general==='molvbu'))for(const card of replacement)card.qiOwner=p.id;
      p.hand.push(...replacement);
      this.change();
    }
    async openingMulligan() {
      const limit=Math.max(0,Math.min(3,Number(this.options.startingRerolls)||0));
      if(!limit)return;
      this.phase='刷牌';this.change();
      for(const p of this.players)for(let used=0;used<limit;used++){
        const choice=await this.option(p,`开局刷牌：还可换${limit-used}次`,[
          {key:'reroll',label:`换掉全部${p.hand.length}张手牌`},
          {key:'keep',label:'保留当前手牌'}
        ],()=>this.openingHandNeedsReroll(p,used)?'reroll':'keep',
        '查看自己的起始牌后决定；每次换牌张数不变，选择保留即结束。');
        if(choice==='keep')break;
        this.rerollOpeningHand(p);
        this.log(`${p.name}更换了起始手牌（${used+1}/${limit}）。`,'system');
      }
      this.phase='准备';this.change();
    }
    nextAlive(id) {
      for (let k = 1; k <= this.players.length; k++) { const p = this.get((id + k) % this.players.length); if (p.alive) return p; }
      return null;
    }
    actionOrder(players = this.alive()) {
      const n = this.players.length;
      return [...players].sort((a,b) => ((a.id - this.turn + n) % n) - ((b.id - this.turn + n) % n));
    }
    takeTop() {
      if (!this.deck.length) {
        if (!this.discard.length) return null;
        this.deck = this.shuffle(this.discard);
        this.discard = [];
        this.log('牌堆耗尽，洗混弃牌堆继续游戏。', 'system');
      }
      return this.deck.pop();
    }
    draw(p, n, announce = true) {
      if (!p.alive) return;
      let got = 0;const before=p.hand.length;
      for (let i = 0; i < n; i++) { const c = this.isGeneralLocked(p,'pengyang')?this.takeBottom():this.takeTop(); if (c) { p.hand.push(c); got++; } }
      this.handChanged(p,before);
      if (announce) {this.log(`${p.name}摸了${got}张牌。`, 'draw');if(got)this.sound('draw',{playerId:p.id,count:got});}
    }
    heal(p, n = 1) {
      if (!p.alive) return;
      const old = p.hp; p.hp = Math.min(p.maxHp, p.hp + n);
      if (p.hp !== old) {this.log(`${p.name}回复${p.hp - old}点体力（${p.hp}/${p.maxHp}）。`, 'heal');this.sound('heal',{playerId:p.id,amount:p.hp-old});}
    }
    removeHand(p, id) {
      const i = p.hand.findIndex(c => c.id === id);
      if (i < 0) throw new Error('无法使用不在手中的牌');
      const before=p.hand.length,c = p.hand.splice(i,1)[0]; this.forgetFengwei(p,id); this.table.push(c);this.handChanged(p,before); return c;
    }
    drop(c) {
      if (!c || c.virtual) return;
      const i = this.table.findIndex(x => x.id === c.id);
      const physical=i>=0?this.table.splice(i,1)[0]:this.allCards.find(x=>x.id===c.id)||c;
      if (!this.discard.some(x => x.id === c.id)) this.putDiscard(physical);
    }
    owned(p, withJudge = false) { return [...p.hand, ...Object.values(p.equip), ...(withJudge ? p.judge : [])]; }
    removeOwned(p, id) {
      const hi = p.hand.findIndex(c => c.id === id);
      if (hi >= 0) {const before=p.hand.length;this.forgetFengwei(p,id);const card=p.hand.splice(hi,1)[0];this.handChanged(p,before);return { card, zone:'hand' };}
      const slot = Object.keys(p.equip).find(s => p.equip[s].id === id);
      if (slot) {
        const card = p.equip[slot]; delete p.equip[slot];
        if (card.key === 'lion' && p.alive && p.hp < p.maxHp) this.heal(p);
        return { card, zone:'equip' };
      }
      const ji = p.judge.findIndex(c => c.id === id);
      if (ji >= 0) return { card:p.judge.splice(ji,1)[0], zone:'judge' };
      throw new Error('指定的牌已不在该角色区域');
    }
    discardOwned(p, ids) {
      if(ids.length)this.sound('discard',{playerId:p.id,count:ids.length});
      for (const id of ids) {
        const { card, zone } = this.removeOwned(p,id);
        this.putDiscard(card);
        this.log(`${p.name}弃置${zone === 'hand' ? '' : '装备/判定牌'}【${card.name}】。`, 'discard');
      }
    }
    distance(from, to) {
      if (from.id === to.id) return 0;
      const alive = this.alive();
      const a = alive.findIndex(p => p.id === from.id), b = alive.findIndex(p => p.id === to.id);
      const d = Math.abs(a-b);
      return Math.max(1, Math.min(d, alive.length-d) - (from.equip.minusHorse ? 1 : 0) + (to.equip.plusHorse ? 1 : 0) - (from.id===this.turn?from.distanceReduction||0:0));
    }
    range(p) { return p.equip.weapon?.range || 1; }
    canSlash(p,t) { return p.alive && t.alive && p.id !== t.id && this.distance(p,t) <= this.range(p); }
    slashAvailable(p) { return p.slashUsed < 1 || p.equip.weapon?.key === 'crossbow'; }
    canUse(p, c) {
      if (isSlash(c)) return this.slashAvailable(p) && this.alive().some(t => this.canSlash(p,t));
      if (['jink','nullify'].includes(c.key)) return false;
      if (c.key === 'peach') return p.hp < p.maxHp;
      if (c.key === 'wine') return !p.wineUsed;
      if (c.key === 'lightning') return !p.judge.some(x => x.key === c.key);
      if (['duel','steal','dismantle','fireAttack','borrow','indulgence','shortage'].includes(c.key)) return this.targets(p,c).length > 0;
      return true;
    }
    targets(p,c) {
      return this.alive().filter(t => {
        if (isSlash(c)) return this.canSlash(p,t);
        if (c.key === 'chain') return true;
        if (c.key === 'fireAttack') return t.hand.length > 0;
        if (t.id === p.id) return false;
        if (c.key === 'steal') return this.distance(p,t) <= 1 && this.owned(t,true).length > 0;
        if (c.key === 'dismantle') return this.owned(t,true).length > 0;
        if (c.key === 'borrow') return !!t.equip.weapon && this.alive().some(v => this.canSlash(t,v));
        if (['indulgence','shortage'].includes(c.key)) return !t.judge.some(x => x.key === c.key) && (c.key !== 'shortage' || this.distance(p,t) <= 1);
        return c.key === 'duel';
      });
    }
    legalActions(p) {
      const actions = [{ type:'end' }];
      const add = (c, cost = null) => {
        if (!this.canUse(p,c)) return;
        const base = { type:'use', cardId:c.id, targets:[] };
        if (cost) { base.cardId = 'spear'; base.cost = cost; }
        const targeted = isSlash(c) || ['chain','duel','steal','dismantle','fireAttack','borrow','indulgence','shortage'].includes(c.key);
        if (!targeted) { actions.push(base); return; }
        const ts = this.targets(p,c).map(t => t.id);
        if (c.key === 'borrow') {
          for (const tid of ts) for (const v of this.alive()) if (this.canSlash(this.get(tid),v)) actions.push({ ...base, targets:[tid,v.id] });
        } else {
          if (c.key === 'chain') actions.push({ ...base, recast:true });
          const max = c.key === 'chain' ? 2 : isSlash(c) && p.equip.weapon?.key === 'halberd' && p.hand.length === (cost ? 2 : 1) ? 3 : 1;
          for (let n=1; n <= Math.min(max,ts.length); n++) for (const ids of combinations(ts,n)) actions.push({ ...base, targets:ids });
        }
      };
      p.hand.forEach(c => add(c));
      if (p.equip.weapon?.key === 'spear' && p.hand.length >= 2 && this.slashAvailable(p)) {
        const v = { ...defs.slash, id:'spear', virtual:true };
        for (const pair of combinations(p.hand.map(c => c.id),2)) add(v,pair);
      }
      if(this.canZonghu(p)&&this.slashAvailable(p)&&this.targets(p,defs.slash).length)actions.push({type:'skill',skill:'zonghu'});
      return actions;
    }
    value(c,p) {
      if (c.key === 'peach') return p.hp <= 2 ? 12 : 8;
      if (c.key === 'jink') return 7 - p.hand.filter(x => x.key === 'jink').length * 0.7;
      if (c.key === 'nullify') return 7;
      if (c.key === 'draw2') return 10;
      if (c.key === 'wine') return p.hp <= 1 ? 8 : 5;
      if (isSlash(c)) return 5 - Math.max(0,p.hand.filter(isSlash).length - 1) * 0.5;
      if (c.kind === 'equip') return p.equip[c.slot] ? 2 : 5;
      return ['steal','dismantle','duel'].includes(c.key) ? 6 : 4;
    }
    // Uses only public behavior, public zones and the observer's own identity/hand.
    hostility(observer, target) {
      if (observer.id === target.id) return -2;
      if (this.options.mode !== 'identity') return observer.team === target.team ? -2 : 2;
      const l = target.loyalty;
      if (observer.role === '主公' || observer.role === '忠臣') {
        if (target.role === '主公') return -3;
        return l <= -1 ? 2 + Math.min(2,-l/3) : l >= 1.5 ? -1.5 : 0.3;
      }
      if (observer.role === '反贼') {
        if (target.role === '主公') return 4;
        return l >= 1 ? 2 : l <= -1.5 ? -1.5 : 0.1;
      }
      if (this.alive().length === 2) return 3;
      const lord = this.players.find(x => x.role === '主公');
      if (target.id === lord.id) return lord.hp <= 2 ? -3 : -0.8;
      const rebelStrength = this.alive().filter(x => x.loyalty < -1).reduce((s,x) => s + x.hp,0);
      const loyalStrength = this.alive().filter(x => x.loyalty > 1 || x.role === '主公').reduce((s,x) => s + x.hp,0);
      return (rebelStrength >= loyalStrength ? l < -1 : l > 1) ? 2.5 : 0.7;
    }
    evidence(source,target,benefit) {
      if (this.options.mode !== 'identity' || source.id === target.id || source.role === '主公') return;
      let relation = target.role === '主公' ? 3 : target.loyalty >= 1 ? 1 : target.loyalty <= -1 ? -1 : 0;
      source.loyalty = Math.max(-8, Math.min(8, source.loyalty + relation * (benefit ? 1 : -1)));
    }
    damageBenefitRisk(target) {
      if(!target?.alive)return 0;
      const general=target.general;
      if(general==='jieguojia')return target.hp<=1?2:4;
      if(general==='jiezhoutai')return target.hp<=1&&target.zhoutaiChuang?.length<3?3:1;
      if(['jiecaocong','qinlang','zuwangshen','xizhicai'].includes(general))return 2;
      if(['jiehuanggai','jiezhangchunhua','caomao'].includes(general))return 1.5;
      if(['zuxunyu','zuyangbiao'].includes(general))return 1;
      return 0;
    }
    aiPlay(p, actions) {
      let best = actions[0], bestScore = 0;
      for (const a of actions.slice(1)) {
        if(a.type==='skill') {
          const enemies=this.targets(p,defs.slash).filter(t=>this.hostility(p,t)>0);
          const friendly=this.alive().some(t=>t.id!==p.id&&this.hostility(p,t)<0);
          const cost=this.zonghuSuggested(p).reduce((v,id)=>v+this.value(this.owned(p).find(c=>c.id===id),p),0);
          const s=enemies.length?5+(friendly?3:0)+this.fengweiCards(p).length*2-cost*.5:-1;
          if(s>bestScore){bestScore=s;best=a;}continue;
        }
        const c = a.cardId === 'spear' ? defs.slash : p.hand.find(x => x.id === a.cardId);
        const t = this.get(a.targets[0]);
        const h = t ? this.hostility(p,t) : 0;
        let s = -1;
        if (c.kind === 'equip') {
          const old = p.equip[c.slot];
          s = !old ? 7 : c.key === 'crossbow' && p.hand.filter(isSlash).length > 1 ? 8 : c.slot === 'weapon' && (c.range > old.range) ? 2 : old.key === 'lion' && p.hp < p.maxHp ? 5 : -1;
        } else if (c.key === 'peach') s = 12;
        else if (c.key === 'draw2') s = 15;
        else if (isSlash(c)) s = a.targets.reduce((v,id) => { const x=this.get(id),enemy=this.hostility(p,x)>0;
          return v + this.hostility(p,x)*2 + (enemy ? (x.hp<=1?3:x.hp===2?1.5:0)+(x.hand.length===0?1.5:0) : 0)
            - (enemy&&x.hp>1?this.damageBenefitRisk(x):0)
            - (x.equip.armor?.key==='renwang' && !isRed(c) && p.equip.weapon?.key!=='qinggang' ? 5 : 0)
            - (x.equip.armor?.key==='vine' && c.nature==='normal' && !['qinggang','fan'].includes(p.equip.weapon?.key) ? 5 : 0);
        },0) - (a.cost ? 3 : 0);
        else if (c.key === 'wine') s = this.slashAvailable(p) && p.hand.some(isSlash) && this.alive().some(x => this.canSlash(p,x) && this.hostility(p,x)>0) && (p.hp>1||p.hand.some(x=>x.key==='peach')) ? 9 : -1;
        else if (c.key === 'duel') s = h*2 + Math.min(2,p.hand.filter(isSlash).length)
          + (h>0&&t.hp<=1?2:0) - (t.hand.length>p.hand.length ? 3 : 0)
          - (p.hp<=2&&p.hand.filter(isSlash).length===0&&t.hand.length>0?5:0)
          - (h>0&&t.hp>1?this.damageBenefitRisk(t):0);
        else if (['steal','dismantle'].includes(c.key)) {
          if (h < 0) s = t.judge.some(x => ['shortage','indulgence'].includes(x.key)) ? 8 : -1;
          else s = h*2 + (c.key === 'steal' ? 3 : 1) + (t.equip.armor ? 1 : 0);
        } else if (['indulgence','shortage'].includes(c.key)) s = h*2+1;
        else if (c.key === 'fireAttack') s = h*2-1 + (t.equip.armor?.key==='vine' ? 2 : 0) - (p.hand.length<3 ? 3 : 0) - (h>0&&t.hp>1?this.damageBenefitRisk(t):0);
        else if (c.key === 'borrow') s = h + this.hostility(p,this.get(a.targets[1])) + 1;
        else if (c.key === 'chain') {
          if (a.recast) s=2;
          else s = a.targets.reduce((v,id) => { const x=this.get(id); return v + (x.chained ? -this.hostility(p,x) : this.hostility(p,x)); },0) + (p.hand.some(x=>['fireSlash','thunderSlash','fireAttack'].includes(x.key)) ? 1 : -1);
        } else if (['barbarian','arrows'].includes(c.key)) s = this.alive().filter(x => x.id!==p.id).reduce((v,x) => v + this.hostility(p,x) * (x.equip.armor?.key==='vine' ? 0 : 1) - (this.hostility(p,x)>0&&x.hp>1?this.damageBenefitRisk(x)*.5:0),0);
        else if (c.key === 'healAll') s = this.alive().filter(x => x.hp<x.maxHp).reduce((v,x) => v - this.hostility(p,x),0);
        else if (c.key === 'harvest') s = 2+this.alive().reduce((v,x)=>v-this.hostility(p,x)*.45,0)
          + (p.hand.length<=p.hp?1:0);
        else if (c.key === 'lightning') s = p.equip.armor?.key==='lion' ? 1 : -1;
        if (s > bestScore) { bestScore=s; best=a; }
      }
      return best;
    }
    async takeTurn(p) {
      await this.roundStart();
      this.totalTurns++;this.beginTurnSkills();
      if (this.hooks.turnLimit && this.totalTurns > this.hooks.turnLimit) throw new Error('测试回合数超限');
      this.turnInterrupted = false;
      p.turns++; p.slashUsed=0; p.wineUsed=0; p.drunk=0; p.skipDraw=false; p.skipPlay=false;
      this.phase='准备';
      this.log(`第${this.round}轮 · ${p.name}的回合（${p.id+1}号位）。`, 'turn');
      this.sound('turn',{playerId:p.id,personal:p.id===this.humanId});
      if(p.turnedOver) {
        this.turnOver(p);this.phase='跳过';
        this.log(`${p.name}背面朝上，翻回正面并跳过整个回合。`,'system');
        await this.pause();return;
      }
      await this.caocongEquipStart(p);
      if(this.options.mode==='landlord'&&p.role==='地主'){
        this.draw(p,1);this.log(`${p.name}【跋扈】在准备阶段摸一张牌，本回合可额外使用一张杀。`,'draw');
      }
      await this.preparationSkills(p);await this.tuisheng(p);await this.pause();await this.phaseEndSkills?.(p);
      if (!p.alive || this.over || this.turnInterrupted) return;
      this.phase='判定';
      if(this.options.mode==='landlord'&&p.role==='地主'&&p.judge.length&&this.owned(p).length>=2){
        const yes=await this.option(p,'飞扬：弃两张牌移去一张判定区牌？',[{key:'yes',label:'发动飞扬'},{key:'no',label:'不发动'}],'yes');
        if(yes==='yes'){
          const pool=this.owned(p),cost=[...pool].sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,2).map(c=>c.id);
          const ids=await this.selectCards(p,'飞扬：弃置两张牌',pool,2,2,cost);
          this.discardOwned(p,ids);
          const remaining=[...p.judge];
          if(remaining.length){
            const chosen=await this.option(p,'飞扬：移去一张判定区牌',remaining.map(c=>({key:c.id,label:c.name,card:c})),remaining.find(c=>c.key==='lightning')?.id||remaining[0].id);
            this.discardOwned(p,[chosen]);this.log(`${p.name}发动【飞扬】，移去一张判定区牌。`,'system');
          }
        }
      }
      await this.judgments(p);await this.phaseEndSkills?.(p);
      if (!p.alive || this.over || this.turnInterrupted) return;
      this.phase='摸牌';
      if(this.fengweiCards(p).length) {p.skipDraw=true;this.log(`${p.name}仍持有本轮丰蔚牌，【丰蔚】使其跳过摸牌阶段。`,'system');}
      const extraDraw=this.consumeDrawPhaseBonus?.(p)||0;
      if (!p.skipDraw) {
        const base=(['duel','team'].includes(this.options.mode) && p.id === 0 && p.turns === 1) ? 1 : 2;
        const empty=this.isGeneralLocked(p,'pengyang')?this.emptyAreaCount(p):0;
        if(empty)this.log(`${p.name}的【寸目】因${empty}个区域没有牌，摸牌阶段额外摸${empty}张。`,'draw');
        await this.drawPhaseCards(p,(this.phaseDrawCount?.(p,base+empty)??base+empty)+extraDraw);
      }
      else this.log(`${p.name}跳过摸牌阶段。`, 'system');
      await this.pause();await this.phaseEndSkills?.(p);
      if (!p.alive || this.over || this.turnInterrupted) return;
      this.phase='出牌';
      if (!p.skipPlay) {
        await this.playStartSkills(p);
        let moves = 0;
        while (p.alive && !this.over && !this.turnInterrupted) {
          await this.flushSkillEvents();const actions = this.legalActions(p);
          const action = await this.choose(p, { kind:'play', title:'轮到你出牌', detail:'选择手牌，再选择目标。完成后结束出牌。', actions }, () => this.aiPlay(p,actions));
          if (action.type === 'end') break;
          await this.useAction(p,action);
          await this.pause();
          if (++moves > 150) throw new Error('单回合操作数异常');
        }
      } else this.log(`${p.name}跳过出牌阶段。`, 'system');
      await this.phaseEndSkills?.(p);
      if (!p.alive || this.over || this.turnInterrupted) return;
      this.phase='弃牌';
      await this.discardPhase(p);
      await this.phaseEndSkills?.(p);
      if (!p.alive || this.over || this.turnInterrupted) return;
      p.drunk=0; this.phase='结束'; this.change();await this.finishPhaseSkills(p);
      await this.pause();await this.phaseEndSkills?.(p);
    }
    async discardPhase(p) {
      const excess = p.hand.length - this.handLimit(p);
      if (excess <= 0) return;
      const pool=this.discardPhaseCards?.(p)||p.hand;
      const suggested = [...pool].sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,excess).map(c=>c.id);
      const ids = await this.selectCards(p, `弃置${excess}张手牌`, pool, excess, excess, suggested, `当前体力${p.hp}，手牌上限${this.handLimit(p)}。点击要弃置的手牌，再确认。`);
      const others=this.alive().filter(t=>t.id!==p.id);
      if (this.hasSkill(p,'qizeng')&&others.length) {
        const friend=[...others].filter(t=>this.hostility(p,t)<-.5).sort((a,b)=>a.hand.length-b.hand.length)[0];
        const options=[...others.map(t=>({key:String(t.id),label:`交给${t.name} · 手牌${t.hand.length}`})),{key:'pass',label:'正常弃置'}];
        const targetId=await this.option(p,'王佐：把本次应弃的全部牌交给谁？',options,friend?String(friend.id):'pass','所选超额手牌会一次性交给同一名其他角色；也可正常弃置。');
        if(targetId!=='pass') {
          const target=this.get(Number(targetId));
          const cards=this.moveBatch(p,()=>ids.filter(id=>p.hand.some(c=>c.id===id)).map(id=>this.removeOwned(p,id).card));
          if(target?.alive&&cards.length){this.gain(target,cards);this.evidence(p,target,true);this.log(`${p.name}发动【王佐】，将本次应弃的${cards.length}张牌全部交给${target.name}。`,'draw');return;}
          this.putDiscard(...cards);
        }
      }
      this.discardOwned(p,ids.filter(id=>p.hand.some(c=>c.id===id)));
    }
    async useAction(p,a) {
      let card;
      if(a.type==='skill'&&a.skill==='zonghu') {
        if(!this.canZonghu(p)||!this.slashAvailable(p))return;
        const ts=this.targets(p,defs.slash);
        if(!ts.length)return;
        card=await this.zonghuCard(p,'slash',true);
        if(!card)return;
        const preferred=[...ts].sort((x,y)=>this.hostility(p,y)-this.hostility(p,x))[0];
        const key=await this.option(p,'宗护：选择杀的目标',ts.map(t=>({key:String(t.id),label:t.name+' · '+t.hp+'血'})),String(preferred.id));
        a={...a,targets:[Number(key)]};
      } else if (a.cardId === 'spear') {
        const costs = a.cost.map(id=>this.removeHand(p,id));
        const allRed=costs.every(isRed), allBlack=costs.every(x=>['S','C'].includes(x.suit));
        card={...defs.slash,id:'virtual',virtual:true,suit:allRed?'H':allBlack?'S':'N',rank:0,costs};
      } else card=this.removeHand(p,a.cardId);
      this.showCardAction(p,card,a.targets,a.recast?'重铸':'出牌');
      this.sound('card',{playerId:p.id,cardKey:card.key,kind:card.kind,recast:!!a.recast});
      const ts=a.targets.map(id=>this.get(id));
      this.log(`${p.name}${a.recast?'重铸':'使用'}【${card.name}】${ts.length?' → '+ts.map(t=>t.name).join('、'):''}。`, 'use');
      try {
        if (a.recast) { this.drop(card); this.draw(p,1); return; }
        if (card.kind === 'equip') {
          const old=p.equip[card.slot];
          if (old) this.discardOwned(p,[old.id]);
          this.table=this.table.filter(x=>x.id!==card.id);
          p.equip[card.slot]=card; this.change(); return;
        }
        if (card.kind === 'delay') {
          const t=card.key==='lightning'?p:ts[0];
          // Delayed tricks are countered at the judgment effect, not on placement.
          this.table=this.table.filter(x=>x.id!==card.id);
          t.judge.push(card); this.evidence(p,t,false); this.change(); return;
        }
        if (isSlash(card)) {
          p.slashUsed++;
          let nature=card.nature;
          if (card.key==='slash' && p.equip.weapon?.key==='fan') {
            const fire=await this.option(p,'发动朱雀羽扇？',[{key:'fire',label:'转为火杀'},{key:'normal',label:'保持普通杀'}], ts.some(t=>t.equip.armor?.key==='vine'||t.chained)?'fire':'normal');
            if (fire==='fire') nature='fire';
          }
          const bonus=p.drunk; p.drunk=0;
          for (const t of this.actionOrder(ts)) { if (!t.alive||this.over) continue; await this.slash(p,t,card,nature,1+bonus); }
        } else if (card.key==='peach') this.heal(p);
        else if (card.key==='wine') { p.wineUsed++; p.drunk=1; this.log(`${p.name}饮酒，本回合下一张杀伤害+1。`,'system'); }
        else if (['barbarian','arrows','healAll','harvest'].includes(card.key)) await this.groupTrick(p,card);
        else if (card.key==='draw2') { if (await this.trickAllowed(p,p,card)) this.draw(p,2); }
        else if (card.key==='borrow') { if (await this.trickAllowed(p,ts[0],card)) await this.borrow(p,ts[0],ts[1]); }
        else for (const t of this.actionOrder(ts)) {
          if (!t.alive || this.over || !(await this.trickAllowed(p,t,card))) continue;
          await this.singleTrick(p,t,card);
        }
      } finally {
        if (card.virtual) card.costs.forEach(c=>this.drop(c));
        else if (this.table.some(x=>x.id===card.id)) this.drop(card);
        this.change();
      }
    }
    beneficial(card,target) {
      if (['draw2','healAll','harvest'].includes(card.key)) return true;
      if (card.key==='chain') return target.chained;
      return false;
    }
    async trickAllowed(source,target,card) {
      let active=true, lastResponder=null;
      const benefit=this.beneficial(card,target);
      let start=this.turn;
      for (let depth=0; depth<50; depth++) {
        let countered=false;
        const order=this.alive().sort((a,b)=>((a.id-start+this.players.length)%this.players.length)-((b.id-start+this.players.length)%this.players.length));
        for (const p of order) {
          const ns=p.hand.filter(c=>c.key==='nullify');
          if (!ns.length) continue;
          const h=this.hostility(p,target);
          const want = active ? (benefit ? h>1 : h<-0.5) : (benefit ? h<-0.5 : h>1);
          const damaging=['duel','barbarian','arrows','fireAttack','lightning'].includes(card.key);
          const worthwhile=target.hp<=2 || !damaging || target.hand.length===0 || card.key==='lightning';
          const options=[...ns.map(c=>({key:c.id,label:'使用无懈可击',card:c})),{key:'pass',label:'不使用'}];
          const key=await this.option(p,`${active?'抵消':'恢复'}【${card.name}】对${target.name}的效果？`,options,want&&worthwhile?ns[0].id:'pass',lastResponder?`${lastResponder.name}刚使用了无懈可击。你可以继续反无懈。`:'无懈可击仅影响当前这个目标。');
          if (key==='pass') continue;
          const c=this.removeHand(p,key); this.drop(c);
          this.sound('response',{playerId:p.id,cardKey:'nullify'});
          this.log(`${p.name}使用【无懈可击】，${active?'抵消':'恢复'}【${card.name}】对${target.name}的效果。`,'response');
          this.evidence(p,target, active ? !benefit : benefit);
          active=!active; lastResponder=p; start=(p.id+1)%this.players.length; countered=true;
          await this.pause();
          break;
        }
        if (!countered) break;
      }
      return active;
    }
    async response(p, type, title, ignoreArmor=false) {
      if (type==='jink' && !ignoreArmor && p.equip.armor?.key==='eightDiagram') {
        const k=await this.option(p,'发动八卦阵？',[{key:'judge',label:'判定：红色视为闪'},{key:'skip',label:'不发动'}],'judge',title);
        if (k==='judge') {
          const c=this.takeTop();
          if (c) {
            this.table.push(c);
            await this.showJudgment(p,'八卦阵',c,!isRed(c),isRed(c)?'成功，视为打出闪':'失败，仍可从手牌出闪','红色判定牌视为闪');
            this.drop(c); if (isRed(c)) {this.sound('response',{playerId:p.id,cardKey:'jink'});return true;}
          }
        }
      }
      const matching=p.hand.filter(c=>type==='slash'?isSlash(c):c.key===type);
      const options=matching.map(c=>({key:c.id,label:`打出${c.name}`,card:c}));
      // 宗护视为使用牌；决斗、南蛮要求打出杀，不能以宗护响应。
      if(type==='jink'&&this.canZonghu(p))options.push({key:'zonghu',label:`宗护：交${this.zonghuCost()}张牌视为闪`});
      if (type==='slash'&&p.equip.weapon?.key==='spear'&&p.hand.length>=2) options.push({key:'spear',label:'丈八蛇矛：两张手牌当杀'});
      options.push({key:'pass',label:type==='slash'?'不出杀':'不出闪'});
      const preferSkill=options.some(x=>x.key==='zonghu')&&this.fengweiCards(p).length&&this.alive().some(t=>t.id!==p.id&&this.hostility(p,t)<0);
      const key=await this.option(p,title,options,preferSkill?'zonghu':matching[0]?.id || (options.some(x=>x.key==='spear')?'spear':options.some(x=>x.key==='zonghu')?'zonghu':'pass'));
      if (key==='pass') return false;
      if(key==='zonghu') {await this.zonghuCard(p,'jink');await this.pause();return true;}
      if (key==='spear') {
        const suggested=[...p.hand].sort((a,b)=>this.value(a,p)-this.value(b,p)).slice(0,2).map(c=>c.id);
        const ids=await this.selectCards(p,'丈八蛇矛：选择两张手牌',p.hand,2,2,suggested);
        ids.forEach(id=>this.drop(this.removeHand(p,id)));
        this.log(`${p.name}发动丈八蛇矛，打出一张杀。`,'response');
        this.sound('response',{playerId:p.id,cardKey:'slash'});
      } else { const c=this.removeHand(p,key); this.drop(c); this.log(`${p.name}打出【${c.name}】。`,'response');this.sound('response',{playerId:p.id,cardKey:c.key}); }
      await this.pause(); return true;
    }
    async slash(source,target,card,nature='normal',amount=1) {
      this.evidence(source,target,false);
      const weapon=source.equip.weapon?.key;
      const ignoreArmor=weapon==='qinggang'||!!card.ignoreArmor;
      if (weapon==='doubleSword' && source.gender!==target.gender) {
        const yes=await this.option(source,`对${target.name}发动雌雄双股剑？`,[{key:'yes',label:'发动'},{key:'no',label:'不发动'}],'yes');
        if (yes==='yes') {
          const options=[...target.hand.map(c=>({key:c.id,label:`弃置${c.name}`,card:c})),{key:'draw',label:`让${source.name}摸一张牌`}];
          const cheap=[...target.hand].sort((a,b)=>this.value(a,target)-this.value(b,target))[0];
          const k=await this.option(target,'雌雄双股剑：弃牌或让对方摸牌',options,cheap&&this.value(cheap,target)<5?cheap.id:'draw');
          if(k==='draw') this.draw(source,1); else this.discardOwned(target,[k]);
        }
      }
      const armor=ignoreArmor?null:target.equip.armor?.key;
      if (!card.noCancel&&((armor==='renwang' && ['S','C'].includes(card.suit)) || (armor==='vine' && nature==='normal'))) { this.log(`${target.name}的${target.equip.armor.name}抵消了杀。`,'response'); return; }
      if(card.unrespondable){this.log(`【${card.name}】不可响应，${target.name}不能使用闪。`,'system');await this.slashDamage(source,target,card,nature,amount,ignoreArmor);return;}
      const jinkNeed=this.dongzhuoJinkNeed(target,source.molWushuang?2:1);let dodged=true;
      for(let i=1;i<=jinkNeed;i++)if(!(await this.response(target,'jink',`${source.name}对你使用${nature==='fire'?'火杀':nature==='thunder'?'雷杀':'杀'}，请出${jinkNeed>1?'第'+i+'/'+jinkNeed+'张':''}闪`,ignoreArmor,{played:false,amount,source,nature,card,dongzhuoJinkBatch:true,unavoidable:!!card.noCancel}))){dodged=false;break;}
      if (dodged&&!card.noCancel) {
        if (weapon==='axe') {
          const pool=this.owned(source).filter(c=>c.key!=='axe');
          if(pool.length>=2) {
            const k=await this.option(source,'发动贯石斧？',[{key:'yes',label:'弃两张牌，强制命中'},{key:'no',label:'不发动'}],this.hostility(source,target)>0&&(target.hp<=amount||pool.length>4)?'yes':'no');
            if(k==='yes') {
              const ids=await this.selectCards(source,'贯石斧：弃置两张牌',pool,2,2,[...pool].sort((a,b)=>this.value(a,source)-this.value(b,source)).slice(0,2).map(c=>c.id));
              this.discardOwned(source,ids); await this.slashDamage(source,target,card,nature,amount,ignoreArmor); return;
            }
          }
        }
        if(weapon==='blade'&&target.alive) await this.followSlash(source,target);
        return;
      }
      await this.slashDamage(source,target,card,nature,amount,ignoreArmor);
    }
    async followSlash(p,target) {
      const slashes=p.hand.filter(isSlash);
      const opts=slashes.map(c=>({key:c.id,label:`追杀：${c.name}`,card:c}));
      if(this.canZonghu(p))opts.push({key:'zonghu',label:`宗护：交${this.zonghuCost()}张牌视为杀`});
      opts.push({key:'pass',label:'不追杀'});
      if(opts.length===1) return;
      const key=await this.option(p,`青龙偃月刀：继续追杀${target.name}？`,opts,this.hostility(p,target)>0?(slashes[0]?.id||'zonghu'):'pass');
      if(key==='pass') return;
      const c=key==='zonghu'?await this.zonghuCard(p,'slash'):this.removeHand(p,key);
      this.log(`${p.name}发动青龙偃月刀，继续对${target.name}使用【${c.name}】。`,'use');
      this.sound('card',{playerId:p.id,cardKey:c.key,kind:c.kind});
      try { await this.slash(p,target,c,c.nature,1); } finally {this.drop(c);}
    }
    async slashDamage(source,target,card,nature,amount,ignoreArmor) {
      const weapon=source.equip.weapon?.key;
      if(weapon==='iceSword'&&this.owned(target).length) {
        const k=await this.option(source,`寒冰剑：防止伤害，改为弃置${target.name}的两张牌？`,[{key:'ice',label:'弃置两张牌'},{key:'damage',label:'造成伤害'}],target.hp>2&&this.owned(target).length>=2?'ice':'damage');
        if(k==='ice') { for(let i=0;i<2&&this.owned(target).length;i++) await this.takeOtherCard(source,target,'discard',false); return; }
      }
      if(weapon==='guding'&&!target.hand.length) {amount++;this.log('古锭刀：目标没有手牌，伤害+1。','system');}
      const afterDamage=async()=>{
      if(source.alive&&source.equip.weapon?.key==='bow') {
        const horses=[target.equip.plusHorse,target.equip.minusHorse].filter(Boolean);
        if(horses.length) {
          const opts=[...horses.map(c=>({key:c.id,label:`弃置${c.name}`,card:c})),{key:'pass',label:'不发动'}];
          const id=await this.option(source,`麒麟弓：弃置${target.name}的一张坐骑`,opts,horses[0].id);
          if(id!=='pass') this.discardOwned(target,[id]);
        }
      }
      };
      await this.damage(source,target,amount,nature,{ignoreArmor,afterDamage,card});
    }
    turnOver(p) {
      p.turnedOver=!p.turnedOver;
      this.log(`${p.name}翻面，当前${p.turnedOver?'背面':'正面'}朝上。`,'system');this.change();
    }
    async caocongEquipStart(p) {
      if(!p.alive||!this.isGeneral(p,'jiecaocong')||p.caocongEquipRound===this.round)return;
      const targets=this.alive().filter(t=>t.id!==p.id&&t.hp>p.hp&&Object.keys(t.equip).length);
      if(!targets.length)return;
      const equipScore=t=>Object.values(t.equip).reduce((sum,c)=>sum+this.value(c,p),0);
      const enemies=targets.filter(t=>this.hostility(p,t)>.5);
      const preferred=[...(enemies.length?enemies:targets)].sort((a,b)=>equipScore(b)-equipScore(a)||b.hp-a.hp)[0];
      const use=await this.option(p,'承誉：获得一名体力更高角色的所有装备牌？',[{key:'yes',label:'发动承誉'},{key:'no',label:'不发动'}],enemies.length?'yes':'no','每轮限一次；发动后获得目标装备区里的全部牌。');
      if(use!=='yes')return;
      const id=Number(await this.option(p,'承誉：选择目标',targets.map(t=>({key:String(t.id),label:`${t.name} · ${t.hp}血 · ${Object.keys(t.equip).length}张装备`})),String(preferred.id)));
      const target=this.get(id),cards=Object.values(target.equip);
      if(!cards.length||target.hp<=p.hp)return;
      p.caocongEquipRound=this.round;
      const gained=this.moveBatch(target,()=>cards.map(c=>this.removeOwned(target,c.id).card));
      this.gain(p,gained);this.evidence(p,target,false);
      this.log(`${p.name}发动【承誉】，获得${target.name}装备区里的${gained.length}张牌。`,'draw');
      this.change();
    }
    chengxiangChoice(p,cards) {
      let best=[],score=0;
      for(let n=1;n<=cards.length;n++)for(const xs of combinations(cards,n)) {
        const sum=xs.reduce((v,c)=>v+c.rank,0);if(sum>13)continue;
        const value=xs.reduce((v,c)=>v+this.value(c,p),0)+(sum===13?2:0);
        if(value>score){score=value;best=xs.map(c=>c.id);}
      }
      return best;
    }
    async chengxiang(p,index=1,total=1) {
      const yes=await this.option(p,'称象：是否发动？',[{key:'yes',label:'发动称象'},{key:'no',label:'不发动'}],'yes',`本次伤害第${index}/${total}点。亮牌后选择点数总和不超过13的牌。`);
      if(yes==='no')return;
      const count=4+(p.chengxiangBonus||0);p.chengxiangBonus=0;
      const cards=[];
      for(let i=0;i<count;i++){const c=this.takeTop();if(c){this.table.push(c);cards.push(c);}}
      this.log(`${p.name}发动【称象】，亮出${cards.length}张牌：${cards.map(c=>c.name+'('+C.rankMark(c.rank)+')').join('、')}。`,'system');
      this.sound('draw',{playerId:p.id,count:cards.length});
      try {
        const ids=await this.choose(p,{kind:'cards',title:'称象：选择要获得的牌',detail:'点数总和不得超过13（A=1，J=11，Q=12，K=13）。恰好13，下次称象多亮一张。',cards,min:0,max:cards.length,maxRankSum:13,publicReveal:true},()=>this.chengxiangChoice(p,cards));
        const sum=ids.reduce((n,id)=>n+cards.find(c=>c.id===id).rank,0);
        for(const c of cards.filter(c=>ids.includes(c.id))) {
          this.table=this.table.filter(x=>x.id!==c.id);this.gain(p,[c]);
        }
        p.chengxiangBonus=sum===13?1:0;
        this.log(`${p.name}通过【称象】获得${ids.length}张牌，点数和${sum}${sum===13?'；下次称象多亮1张':''}。`,'draw');
      } finally {
        for(const c of cards)if(this.table.some(x=>x.id===c.id))this.drop(c);
        this.change();
      }
      await this.pause();
    }
    async renxin(target) {
      for(const p of this.actionOrder(this.alive().filter(p=>this.isGeneral(p,'jiecaocong')&&p.id!==target.id))) {
        if(target.hp>0||!target.alive)return;
        const equips=this.owned(p).filter(c=>c.kind==='equip');if(!equips.length)continue;
        const opts=equips.map(c=>({key:c.id,label:'仁心：弃置'+c.name,card:c}));opts.push({key:'pass',label:'不发动仁心'});
        const cheapest=[...equips].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
        const will=this.hostility(p,target)<-.5;
        const key=await this.option(p,`仁心：救援${target.name}？`,opts,will?cheapest.id:'pass',`其体力${target.hp}，发动后回复至1。弃置一张装备牌并翻面；你当前${p.turnedOver?'背面':'正面'}朝上。`);
        if(key==='pass')continue;
        this.discardOwned(p,[key]);this.turnOver(p);this.heal(target,1-target.hp);this.evidence(p,target,true);
        this.log(`${p.name}发动【仁心】，令${target.name}的体力回复至1。`,'heal');
        await this.pause();
      }
    }
    async damage(source,target,amount,nature='normal',context={}) {
      if(!target.alive||this.over) return 0;
      if(this.chengongProtected?.(target)){this.log(`${target.name}的【智迟】防止本次伤害。`,'system');return 0;}
      if(!context.xuchuTransferred)amount=this.chengongBoostDamage?.(source,target,amount,context)??amount;
      amount=this.xuchuBoostDamage?.(source,amount,context)??amount;
      const armor=context.ignoreArmor?null:target.equip.armor?.key;
      if(armor==='vine'&&nature==='fire') {amount++;this.log(`${target.name}的藤甲使火焰伤害+1。`,'system');}
      if(armor==='lion'&&amount>1) {amount=1;this.log(`${target.name}的白银狮子将伤害减至1。`,'system');}
      if(await this.fengweiGift(target,amount)){amount=Math.max(0,amount-1);this.log(`【丰蔚】使${target.name}受到的伤害-1${amount===0?'，本次伤害被防止':''}。`,'system');}
      if(amount<=0)return 0;
      if(this.preventYiLethal&&await this.preventYiLethal(source,target,amount,context))return 0;
      amount=await this.xuchuProtectDamage?.(source,target,amount,nature,context)??amount;
      if(amount<=0||!target.alive||this.over)return 0;
      const propagates=!context.chain&&nature!=='normal'&&target.chained;
      const chained=propagates?this.actionOrder(this.alive().filter(p=>p.id!==target.id&&p.chained)):[];
      context={...context,luxunChainedAtDamage:!!target.chained,luxunDamageNature:nature};
      if(nature!=='normal'&&target.chained) {target.chained=false;this.huanggaiChainChanged?.(target,false);}
      const generation=target.generation;
      this.applyDamageHealth(source,target,amount,context);
      this.sound('damage',{playerId:target.id,nature,amount});
      this.log(`${target.name}受到${source?source.name:'闪电'}造成的${amount}点${nature==='fire'?'火焰':nature==='thunder'?'雷电':'普通'}伤害（体力${target.hp}）。`,'damage');
      if(source) this.evidence(source,target,false);
      await this.pause();
      if(context.afterDamage) await context.afterDamage();
      if(this.afterDamageEvent)await this.afterDamageEvent(source,target,amount,context,generation);
      if(target.hp<=0) await this.dying(target,source);
      if(target.alive&&!this.over&&this.isGeneral(target,'jiecaocong')&&target.generation===generation) {
        for(let i=0;i<amount&&target.alive&&!this.over;i++)await this.chengxiang(target,i+1,amount);
      }
      await this.damageFinished(source,target,amount,context,generation);
      for(const p of chained) {
        if(!p.alive||!p.chained||this.over) continue;
        this.log(`铁索传导 → ${p.name}。`,'system');
        await this.damage(source,p,amount,nature,{chain:true,card:context.card});
      }
      return amount;
    }
    async fengweiGift(p,amount=1) {
      const cards=this.fengweiCards(p),recipients=this.alive().filter(t=>t.id!==p.id);
      if(amount<=0||!cards.length||!recipients.length)return false;
      const use=await this.option(p,'丰蔚：交出一张牌令本次伤害-1？',[{key:'yes',label:'发动丰蔚，交出一张牌'},{key:'no',label:'不发动'}],this.fengweiReductionWorth(p,amount)?'yes':'no',`当前将受到${amount}点伤害；每次受到伤害均可选择发动。`);
      if(use==='no')return false;
      const cheapest=[...cards].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
      const cardId=await this.option(p,'丰蔚：选择交出的丰蔚牌',cards.map(c=>({key:c.id,label:c.name,card:c})),cheapest.id,'交出一张仍在手中的本轮丰蔚牌，使本次伤害-1。');
      const preferred=[...recipients].sort((a,b)=>this.hostility(p,a)-this.hostility(p,b)||a.hand.length-b.hand.length)[0];
      const recipientId=await this.option(p,'丰蔚：选择收牌角色',recipients.map(t=>({key:String(t.id),label:`${t.name} · ${this.general(t).name} · 手牌${t.hand.length}`})),String(preferred.id),'可交给任意一名其他存活角色。');
      const recipient=this.get(Number(recipientId));
      this.gain(recipient,this.moveBatch(p,()=>[this.removeOwned(p,cardId).card]));
      this.log(`${p.name}发动【丰蔚】，交给${recipient.name}一张丰蔚牌。`,'system');
      return true;
    }
    async dying(target,source) {
      this.sound('dying',{playerId:target.id});
      this.log(`${target.name}进入濒死，需要${1-target.hp}张桃（本人也可用酒自救）。`,'danger');
      await this.renxin(target);
      if(target.hp>0) {this.log(`${target.name}脱离濒死。`,'system');return;}
      for(const p of this.actionOrder()) {
        while(target.hp<=0&&p.alive) {
          const rescue=p.hand.filter(c=>c.key==='peach'||(p.id===target.id&&c.key==='wine'));
          if(!rescue.length) break;
          const opts=[...rescue.map(c=>({key:c.id,label:`使用${c.name}救援`,card:c})),{key:'pass',label:'不救援'}];
          const will=p.id===target.id||this.hostility(p,target)<-0.5;
          const key=await this.option(p,`${target.name}濒死（体力${target.hp}），是否救援？`,opts,will?rescue[0].id:'pass','桃可以救任何角色；酒只能在自己濒死时救自己。');
          if(key==='pass') break;
          const c=this.removeHand(p,key);this.drop(c);this.heal(target);this.evidence(p,target,true);
          this.log(`${p.name}使用【${c.name}】救援${target.name}。`,'heal');
          await this.pause();
        }
        if(target.hp>0) {this.log(`${target.name}脱离濒死。`,'system');return;}
      }
      await this.death(target,source);
    }
    async death(p,source) {
      p.alive=false;
      this.sound('death',{playerId:p.id});
      this.log(`${p.name}阵亡${this.options.mode==='identity'?`，身份为${p.role}`:''}。`,'death');
      for(const c of this.owned(p,true)) { const {card}=this.removeOwned(p,c.id);this.putDiscard(card); }
      p.chained=false;p.drunk=0;p.turnedOver=false;p.chengxiangBonus=0;
      if(this.options.mode==='duel'&&this.options.relay&&p.remaining>1) {
        p.remaining--;p.generation++;p.general='blank';p.name=this.general(p).name;p.fengweiIds=[];p.maxHp=p.hp=4;p.alive=true;p.slashUsed=0;p.wineUsed=0;
        this.draw(p,4);this.turnInterrupted=true;
        this.log(`${p.name}的第${p.generation}名无技能角色登场，4血，重新摸4张起手牌。当前回合结束。`,'system');
        return;
      }
      p.remaining=0;
      if(this.checkWin()) return;
      if(this.options.mode==='landlord'&&p.role==='农民'){
        const teammate=this.alive().find(t=>t.role==='农民');
        if(teammate&&!teammate.gongkuUsed){
          const choice=await this.option(teammate,'共苦：队友阵亡，选择一项',[{key:'heal',label:'回复1点体力'},{key:'draw',label:'摸两张牌'},{key:'pass',label:'不发动'}],teammate.hp<teammate.maxHp&&teammate.hp<=2?'heal':'draw');
          if(choice!=='pass'){teammate.gongkuUsed=true;if(choice==='heal')this.heal(teammate);else this.draw(teammate,2);this.log(`${teammate.name}发动【共苦】。`,'system');}
        }
      } else if(this.options.mode==='team') {
        const teammate=this.alive().find(t=>t.team===p.team);
        if(teammate) {
          const k=await this.option(teammate,'队友阵亡：是否摸三张牌？',[{key:'draw',label:'摸三张牌'},{key:'pass',label:'放弃'}],'draw');
          if(k==='draw') this.draw(teammate,3);
        }
      } else if(this.options.mode==='identity'&&source?.alive) {
        if(p.role==='反贼') {this.draw(source,3);this.log(`${source.name}击杀反贼，获得三张牌奖励。`,'system');}
        else if(p.role==='忠臣'&&source.role==='主公') {this.discardOwned(source,this.owned(source).map(c=>c.id));this.log('主公误杀忠臣，弃置所有手牌和装备。','system');}
      }
    }
    checkWin() {
      const living=this.alive();let winner=null;
      if(this.options.mode==='duel') {if(living.length===1) winner={team:living[0].team,label:`${living[0].name}获胜`};}
      else if(['team','landlord'].includes(this.options.mode)) {const teams=[...new Set(living.map(p=>p.team))];if(teams.length===1) winner={team:teams[0],label:`${teams[0]}获胜`};}
      else {
        const lord=this.players.find(p=>p.role==='主公');
        if(!lord.alive) winner=living.length===1&&living[0].role==='内奸'?{team:'内奸',label:'内奸获胜'}:{team:'反贼',label:'反贼获胜'};
        else if(!living.some(p=>['反贼','内奸'].includes(p.role))) winner={team:'主忠',label:'主公与忠臣获胜'};
      }
      if(!winner) return false;
      const h=this.human();
      const won=this.options.mode==='identity'?(winner.team==='主忠'?['主公','忠臣'].includes(h.role):h.role===winner.team):h.team===winner.team;
      this.over={...winner,won,turns:this.totalTurns,rounds:this.round};
      this.sound('result',{won});
      this.log(`对局结束：${winner.label}。${won?'你赢了！':'本局落败。'}`,'result');return true;
    }
    async groupTrick(p,card) {
      const players=this.actionOrder(this.alive().filter(t=>!['barbarian','arrows'].includes(card.key)||t.id!==p.id));
      const pool=[];
      if(card.key==='harvest') for(let i=0;i<players.length;i++) {const c=this.takeTop();if(c){pool.push(c);this.table.push(c);}}
      try {
        if(card.key==='harvest') {
          this.harvestReveal={cards:pool,phase:'reveal',targetId:null};
          this.log(`五谷丰登亮出${pool.length}张牌：${pool.map(c=>`【${c.name}】`).join('、')}。`,'draw');
          await this.pause(1600);
        }
        for(const t of players) {
          if(!t.alive||this.over||this.turnInterrupted) break;
          if(card.key==='healAll'&&t.hp>=t.maxHp) continue;
          if(['barbarian','arrows'].includes(card.key)&&t.equip.armor?.key==='vine') {this.log(`${t.name}的藤甲抵消【${card.name}】。`,'response');continue;}
          if(card.key==='harvest') {this.harvestReveal.phase='nullify';this.harvestReveal.targetId=t.id;this.change();}
          if(!(await this.trickAllowed(p,t,card))) continue;
          if(card.key==='healAll') {this.heal(t);this.evidence(p,t,true);}
          else if(card.key==='harvest') {
            if(!pool.length) continue;
            this.harvestReveal.phase='pick';this.change();
            const opts=pool.map(c=>({key:c.id,label:c.name,card:c}));
            const best=[...pool].sort((a,b)=>this.value(b,t)-this.value(a,t))[0];
            const id=await this.option(t,'五谷丰登：选择一张牌',opts,best.id,'亮出的牌公开可见，每名角色获得一张。');
            const i=pool.findIndex(c=>c.id===id);const c=pool.splice(i,1)[0];this.table=this.table.filter(x=>x.id!==c.id);t.hand.push(c);
            this.harvestReveal.phase='resolved';this.harvestReveal.lastTaken=c.name;
            this.log(`${t.name}从五谷丰登中获得【${c.name}】。`,'draw');
            if(!pool.length){this.harvestReveal=null;this.change();}
          } else {
            this.evidence(p,t,false);
            const responded=await this.response(t,card.key==='barbarian'?'slash':'jink',`【${card.name}】：请打出${card.key==='barbarian'?'杀':'闪'}，否则受到1点伤害`);
            if(!responded) await this.damage(p,t,1,'normal',{card});
          }
          await this.pause();
        }
      } finally {pool.forEach(c=>this.drop(c));if(card.key==='harvest'){this.harvestReveal=null;this.change();}}
    }
    async singleTrick(p,t,card) {
      if(card.key==='duel') {
        this.evidence(p,t,false);
        let responder=t,other=p;
        while(responder.alive&&other.alive&&!this.over) {
          const slashNeed=other.molWushuang?2:1;let answered=true;
          for(let i=1;i<=slashNeed;i++)if(!(await this.response(responder,'slash',`与${other.name}决斗，请打出${slashNeed>1?'第'+i+'张':'一张'}杀`,false,{played:true,amount:1,source:other,card}))){answered=false;break;}
          if(!answered) {await this.damage(other,responder,1,'normal',{card});break;}
          [responder,other]=[other,responder];
        }
      } else if(['steal','dismantle'].includes(card.key)) {
        await this.takeOtherCard(p,t,card.key==='steal'?'obtain':'discard',true);
      } else if(card.key==='chain') {
        this.evidence(p,t,t.chained);t.chained=!t.chained;this.huanggaiChainChanged?.(t,t.chained);this.log(`${t.name}${t.chained?'被铁索横置':'解除铁索'}。`,'system');
      } else if(card.key==='fireAttack') {
        if(!t.hand.length) {this.log(`${t.name}已没有手牌，【火攻】不再生效。`,'system');return;}
        this.evidence(p,t,false);
        const best=[...t.hand].sort((a,b)=>this.value(a,t)-this.value(b,t))[0];
        const id=await this.option(t,'火攻：展示一张手牌',t.hand.map(c=>({key:c.id,label:`展示${c.name}`,card:c})),best.id);
        const show=t.hand.find(c=>c.id===id);
        this.noteCardRevealed?.(t,show);
        this.log(`${t.name}展示【${show.name}】（${C.suitMark[show.suit]}${C.rankMark(show.rank)}）。`,'reveal');
        const matches=p.hand.filter(c=>c.suit===show.suit);
        const opts=[...matches.map(c=>({key:c.id,label:`弃置${c.name}，造成火焰伤害`,card:c})),{key:'pass',label:'放弃弃牌'}];
        const cheap=[...matches].sort((a,b)=>this.value(a,p)-this.value(b,p))[0];
        const cost=await this.option(p,`火攻：弃置一张${C.suitMark[show.suit]}手牌`,opts,cheap&&this.hostility(p,t)>0?cheap.id:'pass',`目标展示了${show.name}，花色${C.suitMark[show.suit]}。`);
        if(cost!=='pass') {this.discardOwned(p,[cost]);await this.damage(p,t,1,'fire',{card});}
      }
    }
    async takeOtherCard(actor,target,operation,includeJudge=true) {
      const publicCards=[...Object.values(target.equip),...(includeJudge?target.judge:[])];
      const options=publicCards.map(c=>({key:c.id,label:`${target.judge.includes(c)?'判定':'装备'}：${c.name}`,card:c}));
      if(target.hand.length) options.unshift({key:'hand',label:`随机手牌（${target.hand.length}张）`,hidden:true});
      if(!options.length) return;
      let suggested=options[0].key;
      if(this.hostility(actor,target)<0) {
        const bad=target.judge.find(c=>['shortage','indulgence'].includes(c.key));if(bad&&includeJudge)suggested=bad.id;
      } else {
        const armor=target.equip.armor;
        if(armor&&armor.key!=='lion')suggested=armor.id;
        else if(target.equip.weapon)suggested=target.equip.weapon.id;
      }
      const key=await this.option(actor,`${operation==='obtain'?'获得':'弃置'}${target.name}的一张牌`,options,suggested,'其他角色的手牌不显示牌面，选择手牌时随机取一张。');
      const id=key==='hand'?target.hand[Math.floor(this.random()*target.hand.length)].id:key;
      const {card,zone}=this.withLoss(operation==='obtain'?'move':'discard',()=>this.removeOwned(target,id));
      if(operation==='obtain') this.gain(actor,[card]);else this.putDiscard(card);
      this.evidence(actor,target,zone==='judge'&&['indulgence','shortage'].includes(card.key));
      this.log(`${actor.name}${operation==='obtain'?'获得':'弃置'}了${target.name}的${zone==='hand'?'一张手牌':`【${card.name}】`}。`,operation==='obtain'?'draw':'discard');
    }
    async borrow(actor,killer,victim) {
      const slashes=killer.hand.filter(isSlash);
      const opts=slashes.map(c=>({key:c.id,label:`对${victim.name}使用${c.name}`,card:c}));
      if(this.canZonghu(killer))opts.push({key:'zonghu',label:`宗护：交${this.zonghuCost()}张牌视为杀`});
      if(killer.equip.weapon?.key==='spear'&&killer.hand.length>=2) opts.push({key:'spear',label:'丈八蛇矛：两张手牌当杀'});
      opts.push({key:'pass',label:`交出武器给${actor.name}`});
      const want=this.hostility(killer,victim)>0;
      const key=await this.option(killer,`借刀杀人：对${victim.name}出杀，或交出武器`,opts,want?(slashes[0]?.id || (opts.some(x=>x.key==='spear')?'spear':opts.some(x=>x.key==='zonghu')?'zonghu':'pass')):'pass');
      if(key==='pass') {
        if(killer.equip.weapon&&actor.alive) {const {card}=this.removeOwned(killer,killer.equip.weapon.id);this.gain(actor,[card]);this.log(`${actor.name}获得${killer.name}的【${card.name}】。`,'draw');}
      } else {
        let c;
        if(key==='zonghu')c=await this.zonghuCard(killer,'slash');
        else if(key==='spear') {
          const ids=await this.selectCards(killer,'丈八蛇矛：选择两张手牌',killer.hand,2,2,[...killer.hand].sort((a,b)=>this.value(a,killer)-this.value(b,killer)).slice(0,2).map(x=>x.id));
          const costs=ids.map(id=>this.removeHand(killer,id));c={...defs.slash,virtual:true,costs,suit:costs.every(isRed)?'H':costs.every(x=>['S','C'].includes(x.suit))?'S':'N'};
        } else c=this.removeHand(killer,key);
        this.log(`${killer.name}因借刀杀人对${victim.name}使用【${c.name}】。`,'use');
        this.sound('card',{playerId:killer.id,cardKey:c.key,kind:c.kind});
        const bonus=killer.drunk;killer.drunk=0;
        try {await this.slash(killer,victim,c,c.nature,1+bonus);}finally{if(c.virtual)c.costs.forEach(x=>this.drop(x));else this.drop(c);}
      }
    }
    async showJudgment(p,reason,card,harmful,outcome,rule) {
      this.lastJudgment={playerId:p.id,reason,card:{...card},harmful,outcome,rule};
      this.judging=true;
      this.sound('judge',{playerId:p.id});
      this.log(`${p.name}的【${reason}】判定：${C.suitMark[card.suit]}${C.rankMark(card.rank)}（${outcome}）。`,'judge');
      await this.pause(2400);
      this.sound('judgmentResult',{playerId:p.id,harmful,reason});
      this.judging=false;
      this.change();
    }
    async judgments(p) {
      const list=[...p.judge].reverse();
      for(const card of list) {
        if(!p.alive||this.over||this.turnInterrupted) return;
        if(!p.judge.some(c=>c.id===card.id)) continue;
        const allowed=await this.trickAllowed(null,p,card);
        if(!p.alive||this.over||!p.judge.some(c=>c.id===card.id))return;
        if(!allowed) {
          if(card.key==='lightning')this.passLightning(p,card);
          else this.discardOwned(p,[card.id]);
          continue;
        }
        let j=this.takeTop();if(!j)continue;
        this.table.push(j);j=await this.reviseJudgment(p,card.name,j);
        const harmful=card.key==='indulgence'?j.suit!=='H':card.key==='shortage'?j.suit!=='C':j.suit==='S'&&j.rank>=2&&j.rank<=9;
        const outcome=card.key==='lightning'?(harmful?'命中，造成3点雷电伤害':'未命中，闪电传给下家'):card.key==='indulgence'?(harmful?'跳过出牌阶段':'通过，正常出牌'):(harmful?'跳过摸牌阶段':'通过，正常摸牌');
        const rule=card.key==='lightning'?'仅黑桃2～9命中':card.key==='indulgence'?'红桃通过':'梅花通过';
        await this.showJudgment(p,card.name,j,harmful,outcome,rule);
        this.drop(j);
        if(!p.alive||this.over||!p.judge.some(c=>c.id===card.id))return;
        if(card.key==='indulgence') {p.skipPlay=j.suit!=='H';this.discardOwned(p,[card.id]);}
        else if(card.key==='shortage') {p.skipDraw=j.suit!=='C';this.discardOwned(p,[card.id]);}
        else if(card.key==='lightning') {
          if(j.suit==='S'&&j.rank>=2&&j.rank<=9) {this.discardOwned(p,[card.id]);await this.damage(null,p,3,'thunder',{card});}
          else this.passLightning(p,card);
        }
        await this.pause();
      }
    }
    passLightning(p,card) {
      this.removeOwned(p,card.id);
      let next=this.nextAlive(p.id);
      for(let i=0;i<this.alive().length;i++) {
        if(!next.judge.some(c=>c.key==='lightning')) {next.judge.push(card);this.log(`闪电传递至${next.name}的判定区。`,'system');return;}
        next=this.nextAlive(next.id);
      }
      this.putDiscard(card);
    }
    invariant() {
      const zones=[...this.deck,...this.discard,...this.table,...(this.exiled||[]),...this.players.flatMap(p=>[...this.owned(p,true),...p.sealedPile,...p.luPile,...(p.zhoutaiChuang||[]),...(p.caiyongBooks||[]),...(p.jiaxuWei||[]),...(p.yuanshaoMeng||[]),...(p.liruZhen?[p.liruZhen.card]:[])])];
      const ids=zones.map(c=>c.id);
      if(new Set(ids).size!==ids.length) throw new Error('卡牌出现在多个区域');
      if(ids.length!==this.allCards.length) throw new Error(`卡牌总数异常：${ids.length}/${this.allCards.length}`);
      for(const p of this.players) {if(p.hp>p.maxHp)throw new Error('体力超过上限');if(p.alive&&p.hp<=0&&!this.pending)throw new Error('濒死角色未结算');}
      return true;
    }
  }
  const extra=root.ZhenExtraSkills||(typeof require!=='undefined'?require('./extra-skills.js'):null);extra.install(Game,C);
  const dynasty=root.ZhenDynastySkills||(typeof require!=='undefined'?require('./dynasty-skills.js'):null);dynasty.install(Game,C);
  const newer=root.ZhenNewSkills||(typeof require!=='undefined'?require('./new-skills.js'):null);newer.install(Game,C);
  const sp=root.ZhenSpSkills||(typeof require!=='undefined'?require('./sp-skills.js'):null);sp.install(Game,C);
  const shen=root.ZhenShenSkills||(typeof require!=='undefined'?require('./shen-skills.js'):null);shen.install(Game,C);
  const weiyan=root.ZhenWeiyanSkills||(typeof require!=='undefined'?require('./weiyan-skills.js'):null);weiyan.install(Game,C);

  const guanyu=root.ZhenGuanyuSkills||(typeof require!=='undefined'?require('./guanyu-skills.js'):null);guanyu.install(Game,C);
  const zhaoyun=root.ZhenZhaoyunSkills||(typeof require!=='undefined'?require('./zhaoyun-skills.js'):null);zhaoyun.install(Game,C);
  const zhangfei=root.ZhenZhangfeiSkills||(typeof require!=='undefined'?require('./zhangfei-skills.js'):null);zhangfei.install(Game,C);
  const machao=root.ZhenMachaoSkills||(typeof require!=='undefined'?require('./machao-skills.js'):null);machao.install(Game,C);
  const zhoutai=root.ZhenZhoutaiSkills||(typeof require!=='undefined'?require('./zhoutai-skills.js'):null);zhoutai.install(Game,C);
  const lusu=root.ZhenLusuSkills||(typeof require!=='undefined'?require('./lusu-skills.js'):null);lusu.install(Game,C);
  const lvmeng=root.ZhenLvmengSkills||(typeof require!=='undefined'?require('./lvmeng-skills.js'):null);lvmeng.install(Game,C);
  const sunce=root.ZhenSunceSkills||(typeof require!=='undefined'?require('./sunce-skills.js'):null);sunce.install(Game,C);
  const liubei=root.ZhenLiubeiSkills||(typeof require!=='undefined'?require('./liubei-skills.js'):null);liubei.install(Game,C);
  const sunquan=root.ZhenSunquanSkills||(typeof require!=='undefined'?require('./sunquan-skills.js'):null);sunquan.install(Game,C);
  const zhouyu=root.ZhenZhouyuSkills||(typeof require!=='undefined'?require('./zhouyu-skills.js'):null);zhouyu.install(Game,C);
  const huanggai=root.ZhenHuanggaiSkills||(typeof require!=='undefined'?require('./huanggai-skills.js'):null);huanggai.install(Game,C);
  const caocao=root.ZhenCaocaoSkills||(typeof require!=='undefined'?require('./caocao-skills.js'):null);caocao.install(Game,C);
  const liuxie=root.ZhenLiuxieSkills||(typeof require!=='undefined'?require('./liuxie-skills.js'):null);liuxie.install(Game,C);
  const dongzhuo=root.ZhenDongzhuoSkills||(typeof require!=='undefined'?require('./dongzhuo-skills.js'):null);dongzhuo.install(Game,C);
  const aiStrategy=root.ZhenSoloAIStrategy||(typeof require!=='undefined'?require('./ai-strategy.js'):null);aiStrategy.install(Game,C);
  const tanhe=root.ZhenTanheSkills||(typeof require!=='undefined'?require('./tanhe-skills.js'):null);tanhe.install(Game,C);
  const simayi=root.ZhenSimayiSkills||(typeof require!=='undefined'?require('./simayi-skills.js'):null);simayi.install(Game,C);
  const zhangliao=root.ZhenZhangliaoSkills||(typeof require!=='undefined'?require('./zhangliao-skills.js'):null);zhangliao.install(Game,C);
  const caopi=root.ZhenCaopiSkills||(typeof require!=='undefined'?require('./caopi-skills.js'):null);caopi.install(Game,C);
  const caoren=root.ZhenCaorenSkills||(typeof require!=='undefined'?require('./caoren-skills.js'):null);caoren.install(Game,C);
  const feiyi=root.ZhenFeiyiSkills||(typeof require!=='undefined'?require('./feiyi-skills.js'):null);feiyi.install(Game,C);
  const xunyu=root.ZhenXunyuSkills||(typeof require!=='undefined'?require('./xunyu-skills.js'):null);xunyu.install(Game,C);
  const chengong=root.ZhenChengongSkills||(typeof require!=='undefined'?require('./chengong-skills.js'):null);chengong.install(Game,C);
  const liru=root.ZhenLiruSkills||(typeof require!=='undefined'?require('./liru-skills.js'):null);liru.install(Game,C);
  const caiyong=root.ZhenCaiyongSkills||(typeof require!=='undefined'?require('./caiyong-skills.js'):null);caiyong.install(Game,C);
  const diaochan=root.ZhenDiaochanSkills||(typeof require!=='undefined'?require('./diaochan-skills.js'):null);diaochan.install(Game,C);
  const jiaxu=root.ZhenJiaxuSkills||(typeof require!=='undefined'?require('./jiaxu-skills.js'):null);jiaxu.install(Game,C);
  const yuanshao=root.ZhenYuanshaoSkills||(typeof require!=='undefined'?require('./yuanshao-skills.js'):null);yuanshao.install(Game,C);
  const zhangjiao=root.ZhenZhangjiaoSkills||(typeof require!=='undefined'?require('./zhangjiao-skills.js'):null);zhangjiao.install(Game,C);
  const liushan=root.ZhenLiushanSkills||(typeof require!=='undefined'?require('./liushan-skills.js'):null);liushan.install(Game,C);
  const ganning=root.ZhenGanningSkills||(typeof require!=='undefined'?require('./ganning-skills.js'):null);ganning.install(Game,C);
  const luxun=root.ZhenLuxunSkills||(typeof require!=='undefined'?require('./luxun-skills.js'):null);luxun.install(Game,C);
  const sunjian=root.ZhenSunjianSkills||(typeof require!=='undefined'?require('./sunjian-skills.js'):null);sunjian.install(Game,C);
  const dongzhuoRework=root.ZhenDongzhuoReworkSkills||(typeof require!=='undefined'?require('./dongzhuo-rework-skills.js'):null);dongzhuoRework.install(Game,C);
  const xuchu=root.ZhenXuchuSkills||(typeof require!=='undefined'?require('./xuchu-skills.js'):null);xuchu.install(Game,C);
  const guojia=root.ZhenGuojiaSkills||(typeof require!=='undefined'?require('./guojia-skills.js'):null);guojia.install(Game,C);
  const api={Game,MODE_NAMES,combinations};root.ZhenGame=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
