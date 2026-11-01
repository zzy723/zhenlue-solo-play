(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { Game, MODE_NAMES } = ZhenGame;
  const C = ZhenCards;
  const SAVE_KEY = 'zhenlue.game.v1';
  const skillGeneralCount=()=>Object.values(ZhenGenerals).filter(h=>!h.removed&&h.skills.length).length;
  let mode='team', game=null, selectedCards=[], selectedTargets=[], spearMode=false, oldPrompt=null, sorted=false;
  let speed='normal', saved=null, resultShown=false, returnFocus=null, reviewingJudgment=false;
  let harvestPromptFocus=null,lastRenderedCardAction=-1,cardActionAnimationUntil=0,cardFlightEpoch=0;
  let toastTimer=null;
  let libraryOrigin='lobby',librarySelected='shensunce',libraryWaiters=[];
  const soundBank=new ZhenSound.AudioBank({onchange:updateSoundControls});
  const kindLabel = {basic:'基本',trick:'锦囊',delay:'延时',equip:'装备'};
  const modeText = {
    duel:{title:'对决 · 正面交锋',setup:'一席对决',summary:'先手首次摸牌少一张。单将对决使用标准108张牌；经典三将接力使用去除闪电的106张标准牌。'},
    team:{title:'同袍 · 并肩破阵',setup:'同袍共进',summary:'1、4号位为青方，2、3号位为赤方。首位首次摸1张，末位起手5张；队友阵亡可摸3张。'},
    identity:{title:'军争 · 暗流交锋',setup:'八席谋局',summary:'1主公、2忠臣、4反贼、1内奸。使用标准＋军争160张牌，体力按所选武将设置，主公不额外加血。'},
    landlord:{title:'斗地主 · 三人交锋',setup:'一主二农',summary:'1号位地主，2、3号位农民。地主体力上限+1，拥有飞扬和跋扈；农民队友阵亡后可发动共苦。'}
  };
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const suit = c => `${C.suitMark[c.suit]||'·'} ${C.rankMark(c.rank)||''}`;
  function updateSoundControls(state){
    if(!$('sound-btn'))return;
    $('sound-btn').textContent=`音效：${state.enabled?'开':'关'}`;
    $('sound-btn').setAttribute('aria-pressed',String(state.enabled));
    const percent=Math.round(state.volume*100);
    $('sound-volume').value=percent;
    $('sound-volume-label').textContent=percent+'%';
    $('sound-status').textContent=!state.enabled?'已静音':state.state==='unavailable'?'当前浏览器未能播放音效':state.state==='ready'?`音效已就绪${state.lastCue?' · 最近：'+ZhenSound.cues[state.lastCue].label:''}`:'点击操作后即可播放声音';
    $('sound-status').dataset.playCount=state.played;
    $('sound-status').dataset.audioState=state.state;
  }
  function playGameSound(event,g){
    const key=ZhenSound.cueForEvent(event);
    if(!key)return;
    const hasPlayer=Number.isInteger(event.playerId),personal=hasPlayer&&event.playerId===g.humanId;
    const pan=hasPlayer?Math.sin(2*Math.PI*(event.playerId-g.humanId)/g.players.length)*.28:0;
    soundBank.play(key,{pan,level:personal ? 1 : hasPlayer ? .72 : 1});
  }
  function closeSoundPanel(){
    $('sound-panel').hidden=true;$('sound-settings-btn').setAttribute('aria-expanded','false');
  }
  function loadSaved() {
    try { const data=JSON.parse(localStorage.getItem(SAVE_KEY));saved=data?.version===1?data:null;if(saved&&!saved.options.generalPool&&saved.options.aiGeneral==='random')saved.options.generalPool=['pengyang','wuyi','feiyi','mouzhangrang','wolongfengchu','jiecaocong'];if(saved&&saved.options.rulesVersion==null)saved.options.legacyRules=true; }
    catch {saved=null;}
    $('resume-btn').hidden=!saved;
    $('export-save-btn').hidden=!saved;
  }
  function save(g) {
    if(g.stopped)return;
    try {
      const data={version:1,options:g.options,actions:g.history,finished:!!g.over};
      localStorage.setItem(SAVE_KEY,JSON.stringify(data));saved=data;
      $('save-status').textContent='已自动保存';
    } catch { $('save-status').textContent='浏览器未允许存档';$('save-status').classList.add('autosave-warning'); }
  }
  function toast(text) {$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3000);}
  function chooseMode(next) {
    mode=next;
    document.querySelectorAll('.mode-card').forEach(b=>{const on=b.dataset.mode===mode;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
    $('setup-title').textContent=modeText[mode].setup;$('setup-summary').textContent=modeText[mode].summary;
    $('seat-field').hidden=mode==='identity';$('role-field').hidden=mode!=='identity';$('duel-field').hidden=mode!=='duel';
    $('seat-select').innerHTML=mode==='duel'?'<option value="0">先手</option><option value="1">后手</option><option value="random">随机先后手</option>':mode==='landlord'?'<option value="0">1号位 · 地主</option><option value="1">2号位 · 农民</option><option value="2">3号位 · 农民</option><option value="random">随机身份与座位</option>':'<option value="0">1号位 · 青方先手</option><option value="1">2号位 · 赤方</option><option value="2">3号位 · 赤方</option><option value="3">4号位 · 青方</option><option value="random">随机座位</option>';
  }
  function resetSelection() {selectedCards=[];selectedTargets=[];spearMode=false;}
  function clearCardFlights(){cardFlightEpoch++;$('card-flight-layer')?.replaceChildren();}
  function flyingCard(c){
    const el=document.createElement('span');
    el.className=`flying-action-card type-${c.kind} ${C.isRed(c)?'red-card':''} ${!['出牌','重铸'].includes(c.action||'出牌')?'response-flight':''}`;
    el.innerHTML=`<span class="flight-card-corner">${C.rankMark(c.rank)||'·'}<b>${C.suitMark[c.suit]||'·'}</b></span><strong>${escape(c.name)}</strong>`;
    return el;
  }
  function flightPoint(el,boardRect){const r=el.getBoundingClientRect();return {x:r.left-boardRect.left+r.width/2,y:r.top-boardRect.top+r.height/2};}
  function animateCardFlight(action){
    if(!action||!Number.isInteger(action.source)||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const epoch=cardFlightEpoch,snapshot={...action,targets:[...(action.targets||[])]};
    requestAnimationFrame(async()=>{
      if(epoch!==cardFlightEpoch||!game||$('arena').hidden)return;
      const stage=document.querySelector('.play-area'),layer=$('card-flight-layer'),source=document.querySelector(`[data-player="${snapshot.source}"]`),center=$('last-card').querySelector('.mini-played');
      if(!stage||!layer||!source||!center)return;
      const br=stage.getBoundingClientRect(),from=flightPoint(source,br),middle=flightPoint(center,br);
      if(!['出牌','重铸'].includes(snapshot.action||'出牌')&&snapshot.source!==game.humanId&&typeof source.animate==='function'){
        const distance=Math.hypot(middle.x-from.x,middle.y-from.y)||1;
        const step=Math.min(16,distance*.12),dx=(middle.x-from.x)/distance*step,dy=(middle.y-from.y)/distance*step;
        source.animate([
          {transform:'translate3d(0,0,0)',offset:0},
          {transform:`translate3d(${dx}px,${dy}px,0)`,offset:.35},
          {transform:'translate3d(0,0,0)',offset:1}
        ],{duration:420,easing:'cubic-bezier(.2,.75,.2,1)'});
      }
      const place=p=>`translate3d(${p.x-23}px,${p.y-32}px,0)`;
      const first=flyingCard(snapshot);layer.append(first);
      if(typeof first.animate!=='function'){first.remove();return;}
      const arrive=first.animate([
        {transform:place(from)+' scale(.64) rotate(-10deg)',opacity:.15,offset:0},
        {transform:place(from)+' scale(.82) rotate(-6deg)',opacity:1,offset:.14},
        {transform:place(middle)+' scale(1.12) rotate(2deg)',opacity:1,offset:.88},
        {transform:place(middle)+' scale(1) rotate(0)',opacity:1,offset:1}
      ],{duration:420,easing:'cubic-bezier(.2,.75,.2,1)',fill:'forwards'});
      try{await arrive.finished;}catch{return;}finally{first.remove();}
      if(epoch!==cardFlightEpoch)return;
      const targetEls=snapshot.targets.map(id=>document.querySelector(`[data-player="${id}"]`)).filter(Boolean);
      if(!targetEls.length){
        const rest=flyingCard(snapshot);layer.append(rest);
        const fade=rest.animate([{transform:place(middle)+' scale(1)',opacity:1},{transform:place(middle)+' scale(1.13)',opacity:.92,offset:.55},{transform:place(middle)+' scale(.92)',opacity:0}],{duration:360,easing:'ease-out',fill:'forwards'});
        fade.finished.then(()=>rest.remove(),()=>rest.remove());return;
      }
      targetEls.forEach((target,i)=>{
        const end=flightPoint(target,br),card=flyingCard(snapshot);layer.append(card);
        const depart=card.animate([
          {transform:place(middle)+' scale(1)',opacity:1,offset:0},
          {transform:place(middle)+' scale(1.08)',opacity:1,offset:.12},
          {transform:place(end)+' scale(.72) rotate(8deg)',opacity:.94,offset:.84},
          {transform:place(end)+' scale(.48) rotate(12deg)',opacity:0,offset:1}
        ],{duration:420,delay:i*45,easing:'cubic-bezier(.35,.05,.25,1)',fill:'forwards'});
        depart.finished.then(()=>card.remove(),()=>card.remove());
        setTimeout(()=>{if(epoch!==cardFlightEpoch||!target.isConnected)return;target.classList.remove('card-flight-hit');void target.offsetWidth;target.classList.add('card-flight-hit');setTimeout(()=>target.classList.remove('card-flight-hit'),430);},300+i*45);
      });
    });
  }
  function showGenerals() {
    if(!$('general-library').hidden)return;
    libraryOrigin=game?'arena':'lobby';
    closeModal();closeSoundPanel();reviewingJudgment=false;$('judgment-overlay').hidden=true;$('harvest-overlay').hidden=true;
    $('lobby').hidden=true;$('arena').hidden=true;$('lobby-btn').hidden=true;
    $('general-library').hidden=false;$('generals-btn').setAttribute('aria-current','page');
    $('general-library-back').textContent=game?'返回对局':'返回大厅';
    $('general-library-live-note').hidden=!game;
    const heroes=Object.values(ZhenGenerals).filter(h=>!h.removed);
    $('general-library-count').textContent=`已有${heroes.filter(h=>h.id!=='blank').length}名武将 · ${heroes.filter(h=>h.id==='blank').length}种测试角色`;
    $('general-faction-filter').innerHTML='<option value="all">全部势力</option>'+[...new Set(heroes.map(h=>h.faction||'测试'))].map(f=>`<option value="${escape(f)}">${escape(f==='测试'?'测试角色':f+'势力')}</option>`).join('');
    $('general-search').value='';$('general-faction-filter').value='all';renderGeneralCatalog();
    $('general-library-title').focus();window.scrollTo(0,0);
  }
  function hideGenerals() {
    if($('general-library').hidden)return;
    $('general-library').hidden=true;$('generals-btn').removeAttribute('aria-current');
    $('lobby').hidden=libraryOrigin!=='lobby';$('arena').hidden=libraryOrigin!=='arena';$('lobby-btn').hidden=libraryOrigin!=='arena';
    const waiters=libraryWaiters;libraryWaiters=[];waiters.forEach(resolve=>resolve());
    if(game)render();$('generals-btn').focus();
  }
  function heroInitialHp(h){return h.initialHp??(h.id==='shenganning'?5:h.hp);}
  function heroHp(h){const initial=heroInitialHp(h);return initial<h.hp||h.initialArmor?`${initial}/${h.hp}`:h.hp;}
  function renderGeneralCatalog() {
    const q=$('general-search').value.trim().toLowerCase(),faction=$('general-faction-filter').value;
    const heroes=Object.values(ZhenGenerals).filter(h=>!h.removed&&(faction==='all'||(h.faction||'测试')===faction)&&(h.name+' '+h.skills.map(s=>s.name+' '+s.text).join(' ')).toLowerCase().includes(q));
    if(!heroes.some(h=>h.id===librarySelected))librarySelected=heroes[0]?.id||null;
    $('general-filter-count').textContent=`显示${heroes.length}项`;
    $('general-catalog-list').innerHTML=heroes.length?heroes.map(h=>`<button class="general-catalog-card faction-${({魏:'wei',群:'qun',蜀:'shu',吴:'wu',神:'shen'}[h.faction]||'test')} ${h.id===librarySelected?'selected':''}" data-general-entry="${escape(h.id)}" aria-pressed="${h.id===librarySelected}" aria-label="${escape(h.name)}，${heroHp(h)}血${h.initialArmor?'＋'+h.initialArmor+'护盾':''}，${escape(h.faction||'测试角色')}"><span class="catalog-character ${ZhenGeneralArt.url(h.id)?'has-general-art':''}" ${ZhenGeneralArt.style(h.id)}>${h.id==='blank'?'兵':escape(h.name.slice(-1))}</span><span class="catalog-copy"><strong>${escape(h.name)}</strong><span>${escape(h.faction?h.faction+'势力 · '+(h.version||'OL'):'基础测试角色')}</span><small>${h.skills.length?h.skills.map(s=>escape(s.name)).join(' / '):'无武将技能'}</small></span><span class="catalog-health">${heroHp(h)}<small>血${h.initialArmor?'＋'+h.initialArmor+'盾':''}</small></span></button>`).join(''):'<div class="general-empty"><strong>没有找到匹配的武将</strong><p>试试武将名、技能名，或切换势力筛选。</p><button id="reset-general-search" class="secondary-button">显示全部</button></div>';
    $('general-catalog-list').querySelectorAll('[data-general-entry]').forEach(b=>b.onclick=()=>{librarySelected=b.dataset.generalEntry;renderGeneralCatalog();$('general-catalog-list').querySelector('[aria-pressed="true"]')?.focus();});
    if($('reset-general-search'))$('reset-general-search').onclick=()=>{$('general-search').value='';$('general-faction-filter').value='all';renderGeneralCatalog();$('general-search').focus();};
    renderGeneralDetail();
  }
  function renderGeneralDetail() {
    const h=ZhenGenerals[librarySelected];
    if(!h){$('general-detail').innerHTML='<div class="general-detail-empty">选择一名武将，查看技能与资料。</div>';return;}
    const tips={
      liru:['李儒为群势力4/4。鸩毒每个出牌阶段限一次：选一张黑色手牌，明置于一名没有鸩的其他角色武将牌上，然后摸一张。鸩不属于手牌、装备或判定牌。','持鸩者使用黑色牌结算后，或弃置黑色手牌后，弃去鸩并失去1点体力；打出、重铸、交牌和弃置黑色装备均不触发。其结束阶段开始仍有鸩，则弃去，放置此鸩的李儒摸两张牌。','绝策仅在李儒自己的回合内限一次。其他角色失去最后一张手牌后可摸两张，再自行决定是否弃一张手牌，造成1点火焰伤害；先摸牌再选弃牌，交牌、使用、打出或弃置均可能触发。','焚城整局限一次，选起点后按座次依次结算所有其他角色。首人至少弃一张手牌或装备；可多弃，下家至少弃上家实际弃牌数加一。有人承受2点火焰伤害后，下家门槛重置为1。'],
      shiweiyan:['出牌阶段开始时，“壮誓”可同时选择弃手牌和失去体力。前者强化前几张牌为不限距离、不可响应，后者让前几张牌不计入次数；两项都不选会使忠傲失败。','饮战在杀造成伤害时自动检查你的体力和手牌数；两项均满足时，结算后可弃对方一张牌、获得它并回复体力。','忠傲成功后点击“背水”弃一张牌，增加本阶段杀的使用次数；失败后结束阶段会自动失去1点体力并摸两张。','本地新增“余勇”：每个角色的回合结束时，按你在该回合实际造成的伤害点数摸等量牌并回复等量体力；回复不超过上限，壮誓、困奋造成的失去体力不计入。'],
      shizhouyu:['英姿每次摸牌阶段额外摸一张，手牌上限等于体力上限。','顾曲每回合限一次，可在技能印出的牌没有造成伤害后发动：周瑜与出牌者各摸一张，随后周瑜可视为使用一张同名牌并重新选择目标；新牌不会再次触发顾曲。','任意角色即将受到火焰伤害时，焚江可失去1点体力令此伤害+1；阳将一张手牌当铁索连环，阴将一张手牌当火攻，每回合每面各限一次，发动后转换。'],
      caomao:['每次翻面仍随机获得一张锦囊；从背面翻回正面时，再额外随机获得一张基本牌。'],
      feiyi:['点击金色“晏如”发动，奇偶两种手牌数量各一次；弃牌提示允许超过最低数量。每次换牌结算后，可令一名其他存活角色摸一张牌，也可放弃；每个出牌阶段最多两次，可重复选择同一角色。','手牌变为一张时，和衷会展示该牌并让你选择点数方向，两个方向每回合各一次。','和衷条件用于下一张普通锦囊；每次结算分别询问无懈。双结算须两次分别抵消。无懈、延时锦囊和虚拟无点数牌不会获得额外结算。'],
      mouzhangrang:['点击“赂存”选择基本牌或普通锦囊，再选择目标；闪与无懈没有适用目标，不能印。','基本牌和锦囊每轮各一次，所有属性杀共用“杀”牌名；用过的牌名在面板显示。','蜕生仅在准备阶段或自己濒死时出现可发动按钮，发动会重置牌名，不重置本轮次数。'],
      wolongfengchu:['游龙按钮显示当前阳 / 阴状态，先选牌和目标，再选废除的装备栏。','有五种可废除的栏，包括宝物栏；当前牌库没有宝物牌，但该栏仍可支付游龙代价。','需要使用闪、无懈、救援桃时，也可在适用状态发动游龙；不能代替决斗或南蛮要求的打出杀。','鸾凤在符合体力上限的角色濒死时发动；救自己会重置游龙牌名，保留转换状态和本轮次数。'],
      jiexunyu:['驱虎：每个出牌阶段限一次，选择体力不低于你且有手牌的其他角色，双方各自选择一张手牌拼点。同点由应战方获胜，拼点牌正常弃置。','驱虎拼赢后，由你选择其攻击范围内另一名角色，令其造成1点伤害；没赢则其对你造成1点伤害。','荐贤：每回合限一次，出牌阶段弃置一张手牌，公开展示牌堆顶三张，指定一名其他角色自行选取一张；随后你可以直接获得余下的一张，也可放弃，其余牌置底。','节命、王佐保留：每受到1点伤害后或死亡时可发动节命；弃牌阶段可以把本应弃置的全部超额手牌交给其他角色。'],
      caocao:['挟天仅军8曹操为主公时生效：开局依次让其他角色交一张手牌或获得“逆”；有逆的角色可以被追加为伤害牌目标，曹操对他们无距离、次数限制；无逆的角色不能响应曹操的牌。','奸雄受伤后可摸一张并获得造成伤害的实体牌。','多疑为转换技，自己的奇数回合只能猜别人、偶数回合只能请别人猜，每回合限一次：猜别人手牌类别数，猜错造成1伤害、猜对随机获得目标一张手牌；请别人猜自己的类别数，猜对对方失去1体力、猜错本回合不能响应曹操的牌。'],
      liuxie:['受挟在游戏开始选相：你的摸牌阶段由相摸两张，再由相从其全部手牌中选两张暗置交给你；相自己的摸牌和出杀次数不变。','相死亡后，在刘协下个准备阶段重选；无相时正常摸牌。','密诏出牌阶段限一次，至少两张手牌时，将全部手牌暗置交给非自己、非相的角色，令其对相视为使用决斗；无论哪方受伤，此决斗伤害均+1。','密诏决斗伤到相，刘协摸两张；未伤到相不再失去体力。相没有手牌时也可以发动。','天命从开局拥有，每轮一次：成为伤害牌目标后摸两张；若使用者是相，可以改为只令此牌对你无效。'],
      dongzhuo:['董卓为群势力5/5，技能为乱政、崩坏；旧版完整保留在隐藏分类中的董卓·旧。','乱政提前弃牌需要支付一张真实手牌，不限每轮次数；同一回合的原弃牌阶段仅执行一次。跳过出牌阶段不触发，只有额外出牌阶段而没有该角色回合的场合不移动弃牌阶段。','分牌每轮限一次，基本、锦囊、装备中选择两种不同类型；延时锦囊属于锦囊。可以选择空类型，但受赠者必须是除董卓和弃牌者以外的存活角色；没有此类角色时无法发动。只获得该阶段实际弃置且结算时仍在弃牌堆中的牌。','每轮开始按当前体力值调整手牌：不足则摸牌，超过则自行选择多余手牌弃置；不是调整至体力上限。','乱政使你每次需要使用或打出闪时额外出一张：普通杀、万箭齐发需两张；无双或合盟原需两张时增加至三张。八卦阵、技能闪和他人代出每次只抵一张需求。','崩坏在结束阶段检查，并列最低体力不触发。弃牌选项必须至少弃置一张，包含手牌区、装备区和判定区内所选类型的全部牌。'],
      simayi:['开局4/4，魏。每受到1点伤害可摸一张并积一忍；无伤害的结束阶段再积一忍，最多五枚。失去体力不触发韬晦。','准备阶段可两忍回一血。满五忍时可选择先觉醒或先回血；先回血会推迟觉醒。狼顾只觉醒一次，增加上限、回复1血并摸两张，不移去忍。','鬼才可用手牌替换延时锦囊、八卦阵、铁骑与筹策的判定牌，改判后可一忍摸一张；不屈展示的创不是判定牌。','擅政每个出牌阶段一次；觉醒附送一次另计。可取得手牌、装备或判定区牌；空牌目标也可压制。同一目标连续两次压制不叠加为两张牌。','擅政只限制目标响应下一张对其使用的伤害牌；其他人仍可响应，之后的伤害牌可正常响应。无距离限制持续至本回合结束，不增加杀的使用次数。','2V2平衡目标48%～52%，尚未验证；目标区间不是实测胜率。'],
      zhangliao:['张辽为魏势力4/4。突袭可以少摸x张牌，选择x名不同的其他角色，随机获得其各一张手牌，也可不发动。x为1至本次应摸牌数，且不能超过有手牌的其他角色人数。每名角色无论有几张手牌，均只取一张。','止啼每轮共限3次，同一回合可多次发动，跨回合不重置；进入下一轮后恢复3次。其他角色在其自身摸牌阶段之外获得手牌后，可随机获得其一张现有手牌；不限于刚获得的牌。','两个技能均不观看手牌，玩家与电脑均随机取牌，不按牌面价值挑选。不公开取走牌的牌名。开局发牌与换牌不触发止啼。'],
      caopi:['曹丕为魏势力，初始体力3，体力上限4。','放逐在每次受到伤害并完成濒死结算后可选目标；一次多点伤害只发动一次，目标先摸等于你当前已损失体力值的牌，再翻面。','固位每轮限一次，其他角色翻至背面或翻回正面均能触发，包括因背面朝上跳过回合时的翻面；自己翻面不触发。可以不发动，保留本轮次数。','受禅整局限一次，只能在自己的出牌阶段对背面朝上的其他角色发动，先取得全部手牌，再令其翻回正面；目标没有手牌也可以发动。受禅后的翻面也可触发尚未使用的固位。'],
      caoren:['曹仁为魏势力4/4。据守可选发动：摸三张牌并获得1点护甲，然后翻面；此技能没有两点护甲的限制。','解围每轮限一次，只能替其他角色出闪。选择一张真实手牌当闪打出；放弃不消耗次数。可用于杀或万箭齐发，一次只提供一张闪。','解围后若背面朝上便翻正，随后无论原来正面还是背面，均可选择手中的一张杀对本次伤害牌的使用者反击，无距离限制且不计入次数。没有杀也能救援并翻正。','解围不能绕过不可响应或不能被闪抵消的限制。翻面和翻正均能触发曹丕尚未使用的固位。'],
      chengong:['陈宫为群势力4/4。明策每个出牌阶段限一次：交出一张手牌，你和受赠者各摸一张；交出装备牌时你再摸一张。','明策摸牌后由陈宫指定杀的目标。受赠者必须将一张手牌或装备区的牌当普通杀使用，没有放弃选项，无视距离且不计入出杀次数；闪、防具和其他正常技能仍然生效。确无可用牌或不能使用杀时跳过出杀。','犄角按每名角色分别计算每轮首次符合条件的杀伤害：该角色到陈宫的距离为1，受伤角色在陈宫当前攻击范围内。被闪或防具完全防止的伤害不消耗次数，距离与范围在伤害结算时判断。陈宫自己不属于自己的攻击范围。','智迟在回合外首次实际受到伤害后生效，防止该回合余下所有伤害，包括技能、火焰、雷电和无来源伤害。首伤照常结算；失去体力不受保护，也不会触发智迟。'],
      caiyong:['蔡邕为群势力3/3。书公开可见，点击武将旁“书”按钮可随时查看。','著史与校经各在每名角色的回合内限一次，进入下个角色的回合后刷新。著史只收其他角色使用后未造成伤害、仍在弃牌堆中的非装备实体牌，收书不摸牌；不收虚拟转化牌、重铸或仅打出的牌。','书按牌名去重。结束阶段或每次受到伤害时，若至少三本，必须自行选择弃置其中一本，再摸一张。一次多点伤害结算一次。','校经可用于自己或其他角色。由蔡邕决定是否发动，换书者选择同颜色手牌并立即使用或打出所得牌，随后蔡邕摸一张。交换后所有书的牌名仍不能重复；所得牌仍受正常用牌时机、次数、距离及响应限制。','拒绝一名其他角色的校经请求后，该角色本回合不再向你请求，手牌或书发生变化也不会重复弹窗；下一回合恢复。拒绝不消耗成功发动次数，不影响为其他角色或自己发动校经。'],
      diaochan:['貂蝉为群势力3/3。离间每个出牌阶段限一次，只弃手牌，决斗双方均不能是貂蝉，不限性别。先选发起者，再选目标，最后确认弃牌；取消不消耗次数。','离间视为由所选发起者使用决斗，另一方先打出杀。正常结算无懈、无双、伤害与濒死；伤害来源是决斗中实际造成伤害的角色。由此决斗每次实际造成伤害后，貂蝉摸一张；普通决斗、被防止的伤害和失去体力不触发。','闭月在自己的结束阶段固定摸两张。在任意角色回合结束时，可让本回合受过伤害的一名其他存活角色摸一张，支援每轮最多两次，每个回合结束时最多一次，可放弃；固定摸二不占支援次数。','支援不要求伤害来自离间。受伤后已回复体力仍可被选中，仅失去体力或往回合受伤不符合条件。支援额度在全局新一轮开始时刷新，状态栏显示本轮已使用次数。'],
      jiaxu:['贾诩为群势力4/4。游戏开始时，可将1至2张手牌暗置为帷，再摸一张。弃牌阶段开始前同样可存帷摸一张，但帷最多三张；满帷或没有手牌时不能发动，也不能只摸牌。帷不属于手牌，不计入弃牌上限。','准备阶段可主动使用一张帷，仍受目标、距离和其他用牌限制；不能主动使用闪、无懈可击或重铸。帷中的杀保持实体牌身份，准备阶段使用不占出牌阶段杀的次数；每轮首次这样用牌结算后摸一张。没有自由取回帷或回合外打出帷的功能。','只要还有一张帷，就不能成为黑色普通锦囊、黑色延时锦囊或任何虚拟杀的目标；红色锦囊和实体杀仍能指定你。使用或弃置最后一张帷后立即失去此保护。点击武将旁帷按钮查看，其他角色只能看到数量。','乱武每个全局轮次限一次，弃一张帷后从下家起按座次结算所有其他存活角色。每人行动时重新计算其到所有其他存活角色的距离，只能在最近者中选择合法杀目标；不能因最近者受保护而改杀更远者。实体杀、合法转化杀和丈八蛇矛均可使用，但虚拟杀不能指定有帷的贾诩。','乱武的杀无距离限制、不计次数，闪、防具及其他正常结算仍然生效。角色可主动选择失去1点体力；不能合法出杀时也失去1点体力，不消耗护甲，不视为伤害。取消乱武不消耗帷或本轮次数。'],
      yuanshao:['袁绍为群势力4/4。点击合盟，邀请至多其他存活角色数的一半（向下取整）的角色；例如2V2最多邀请1人、军8最多邀请3人、1V1无法发动。','先选自己的转化手牌，再由受邀者自愿选择是否交出一张手牌为盟。受邀者空选确认即拒绝；无人参与仍扣本出牌阶段的次数，但不消耗转化手牌、不使用万箭。确认邀请前取消不扣次数。受邀却未参与的角色仍会成为万箭目标。','每张盟可以给一个目标追加一张闪的要求，可多次选择同一目标，也可放弃追加。参与者不成为此牌目标，其他角色仍可正常出闪、发动八卦阵或获得曹仁解围，藤甲、无懈可击和伤害防止照常生效。','结算结束后，获得所有盟，再按最初盟数弃置等量手牌，不足全弃。仅当这一张万箭确实伤及全部未参与的其他角色，才重置本出牌阶段的合盟次数；可以连续重置。','名门在自己的结束阶段自动摸三张；本回合由你使用的同一张牌实际对至少两名不同的其他角色造成伤害时改摸五张。两张牌各伤一人不算，纯技能伤害和失去体力不算；护甲吸收的伤害仍计入。'],
      zhangjiao:['张角为群势力2/2。游戏开始按场上已有势力种类增加等量体力上限和体力；同势力只计一次，未标势力的无技能角色不计入，之后阵亡或势力变化不重新计算。','鬼道只能用黑色手牌替换任意角色的真实判定牌，并获得被替换的原判定牌；装备牌不能直接改判。与司马懿鬼才按当前行动顺序依次选择，后发动者看到前一次改判结果。不屈亮创不属于判定。','天罚：响应杀、万箭等打出闪后，可进行一次判定；同一张黑色闪只触发一次。八卦阵视为闪成功时也能发动，失败时仅结算八卦阵这一次判定对应的天罚，之后另打出闪可再发动。曹仁代打闪不算张角自己打出。黑色普通牌不会触发天罚判定。','天罚适用于张角自己的所有真实判定，包括延时锦囊、八卦阵和铁骑。按最终改判结果结算：黑桃对一名角色造成2点雷电伤害；梅花对一名角色造成1点雷电伤害，然后张角自己回复1点体力；红色无效果。可以指定自己，正常处理防伤、防具、濒死及铁索传导。','黄天准备阶段可选择一名其他角色。对方可以拒绝，也可交一张黑色手牌或任意颜色的闪；交非闪摸一张，交闪摸两张。交黑色闪同样只摸两张，交牌不属于打出闪。'],
      liushan:['刘禅为蜀势力4/4。摸牌阶段结束时可选择一名其他角色，再选一张手牌交给其；不发动或空选取消可正常出牌。跳过整个摸牌阶段时不能发动放权。','放权：受赠者满体力摸一张，已受伤摸两张，随后立即执行额外出牌阶段。仅增加出牌阶段，正常处理出牌阶段开始及结束技能；没有额外摸牌、弃牌或结束阶段。刘禅跳过自己的出牌阶段，随后正常弃牌。','额外出牌阶段仍属于刘禅本回合，不增加回合数或轮数，不提前清除封技或每回合次数。受赠者可以使用手牌及出牌阶段技能。','受赠者在该额外阶段实际造成过伤害后，刘禅在自己本回合的结束阶段可摸一张牌、回复1点体力或放弃；多次伤害只获得一次奖励。伤害被防止或仅失去体力不算。','享乐：每张指定刘禅的杀，都须由使用者另弃一张基本手牌，否则仅对刘禅无效；杀本身不算额外代价。支付后仍可正常出闪，火杀、雷杀及不可响应的杀也要支付。'],
      ganning:["甘宁为吴势力4/4，默认可选。","掠江每个出牌阶段至多三次，可重复选择同一目标，无需弃置自己的牌。由你选择弃置其他角色的一张手牌、装备区牌或判定区牌；取消不消耗次数。","手牌保持隐藏，选择手牌时随机弃置一张。若弃置的牌为装备牌，你获得之，包括手牌中的装备牌；其他牌留在弃牌堆。","劫营在每名其他角色的结束阶段分别判断：该角色本回合未实际造成伤害，且在你的攻击范围内，可弃一张手牌或装备牌，视为对其使用一张不计入使用次数的普通杀。此杀可正常响应，防具及其他技能照常结算。","劫营可空选确认放弃，不限每轮次数。护甲吸收仍算造成伤害；被完全防止的伤害以及失去体力不算。刘禅放权的额外出牌阶段重新计算掠江三次额度，但造成的伤害仍计入其所在回合。"],
      luxun:['陆逊为吴势力3/3，默认开放，可在四种模式中选用。','待变每个角色的回合至多发动一次。其他角色在自己的出牌阶段使用的第2张非装备牌全部结算后，可以摸一张牌，再横置使用者并增加一个劳。装备不计数，重铸不算使用；技能生成并实际使用的非装备牌也计数。额外出牌阶段单独计数，但待变仍受每回合一次限制。','待变牌显示不计上限标签，直到陆逊的下个回合结束，包含该回合的弃牌阶段。牌离开其手牌后标签消失，重新获得不会恢复。每张待变牌单独记录到期时间。','劳可以叠加，没有数量上限；重复待变增加一个劳，不会将已经横置的角色重置。仅解除横置不会清除劳。','焚营每个出牌阶段一次：选择一名有劳的其他角色，再弃置一张红色手牌，移去目标全部劳，按移除数量造成等量火焰伤害。可取消而不扣次数；装备区牌不能支付。目标即使已经解除横置也可选择。藤甲、白银狮子、护甲及伤害防止等仍正常结算。','任何角色受到火焰或雷电等属性伤害时，清空其全部劳，不限伤害来源，也不要求其横置。普通伤害、失去体力、被完全防止的属性伤害不清除劳；护甲吸收仍算受到伤害。铁索传导中的每名受伤角色分别清空。','陆逊对横置角色造成伤害后摸一张，不限次数，普通、火焰、雷电伤害均适用。一次多点伤害只摸一张；铁索传导对每名横置角色分别摸一张，被防止的伤害不摸。护甲吸收仍算伤害。'],
      sunjian:['孙坚为吴势力4/5，默认开放，技能为破虏、英魂。普通出牌阶段的出杀次数没有额外增加。','破虏按使用杀时双方的当前体力比较：目标体力不少于孙坚时无距离限制；体力较低的目标仍需在攻击范围内。','自然弃牌阶段和董卓乱政提前的弃牌阶段都可发动破虏，即使没有超额手牌也可发动。需实际使用一张杀，也可用丈八蛇矛转化；可取消，不会凭空生成免费杀。弃牌阶段的杀不占用出牌阶段次数。','只有这张杀实际造成伤害才结束本次弃牌阶段；被闪避、被防具抵消或伤害被完全防止时继续正常弃牌。护甲吸收仍算伤害。结束阶段后续流程照常；被乱政提前的阶段结束后仍正常进入出牌阶段，本回合原时点不会再次弃牌。','破虏使用的杀属于使用牌，不属于弃置牌，不会被乱政当作阶段弃牌收走；期间由其他效果实际弃置的牌仍遵循乱政规则。','英魂在准备阶段和每次受到伤害后分别可选发动，没有每回合一次限制；一次多点伤害触发一次，单纯失去体力不触发。准备阶段可以选择自己、队友或敌人；由受到伤害触发时不能选择自己。满体力时不能发动。','英魂的X在发动时按已损失体力确定；目标先摸牌，再自行选择弃置手牌或装备区牌，不含判定区牌。不足规定数量时弃尽可弃的牌。'],
      xuchu:['许褚为魏势力4/4，技能为裸衣、虎痴，可在四种模式中选用。','裸衣替换整个摸牌阶段的摸牌，观看牌堆顶三张，获得所有基本牌与装备牌，普通锦囊及延时锦囊弃置。即使没有获得牌，发动后仍获得增益；跳过摸牌阶段不能发动。','裸衣增益持续到下个实际准备阶段开始，包括回合外；杀次数上限+1，每个角色回合内首次使用的杀不可响应，自己使用的杀和决斗伤害+1。响应时打出的杀不消耗首次使用，决斗中仅打出杀不重复加伤。翻面跳过整回合时，增益继续保留。','防具牌在许褚手中始终视为普通杀，可以出牌或响应，不能正常装备。离开许褚后恢复原牌，保留原花色、点数与牌的归属标记。','虎痴每个角色的回合至多一次，可保护任意其他角色，包括回合外。多点伤害只转移其中1点，保留来源及属性，正常处理护甲、濒死和救援，然后摸一张牌。失去体力不能转移；自己挨打不触发。'],
      jieguojia:['郭嘉为魏势力3/3，开局1点护盾。护盾沿用游戏护甲规则：吸收伤害仍触发遗计，也算造成伤害。','天妒可获得自己的判定牌；遗计每受到1点伤害分别可选发动，先摸两张，再将共计至多两张现有手牌交给至多两名其他角色。','遗计分牌结束后，可令一名受赠者立即使用其此次获得且仍在手中的一张牌；由受赠者选择牌和合法目标，无距离限制、不计入杀或酒的次数。闪与无懈可击不能凭此主动使用，其他使用限制照常生效。','先识不观看手牌。每回合在第一名符合条件的其他角色出牌阶段开始时选择会或不会造成伤害，阶段结束后结算。正确可令包括自己在内的一名存活角色摸两张牌；错误只弃手牌，无手牌不弃。额外出牌阶段也会触发，同回合只预言一次。','只统计被预言角色在该出牌阶段实际造成的伤害：铁索传导、技能伤害和护盾吸收计入；失去体力、被闪避或被完全防止的伤害不计入。旧技能藏器、酬知已移除，郭嘉濒死时可接受正常救援。'],
      jiesunquan:['制衡每个出牌阶段可发动至多“当前存活角色数-1”次；场上角色减少后，尚可使用次数也会减少。','一次制衡中若弃置全部手牌，额外摸一张。主公技只在军8且孙权为主公时生效；场上每有一名其他存活的吴势力角色，其他角色到孙权的距离+1。'],
      jiezhoutai:['“创”是公开置于周泰武将旁的牌，点数相同的牌不能成为新的“创”，最多保留十三张。','战意造成伤害时获得点数最小的一张“创”，并因少一张“创”额外摸两张牌；濒死求救时周泰仍可使用桃。'],
      lusu:['铸盟先让两名有手牌的角色各自暗选手牌，待双方选定后同时展示并交换；获得牌数相同则没有后续摸牌、回血或换牌效果。','盟誓仅能发动一次。交换体力时不超过各自体力上限；被交换体力的两人任意一人死亡，回合末摸牌回血停止。','英略两项在自己的每个出牌阶段各可发动一次；延迟效果分别在目标的下个摸牌阶段和下个弃牌阶段结算。'],
      lvmeng:['本回合未使用或打出杀，结束出牌阶段会自动触发克己：跳过弃牌阶段，然后选择获得1点护甲或摸两张牌；受伤时也生效。博图的额外回合不触发克己，须正常弃牌。','点击探虎选择有手牌的角色拼点；拼赢获得对方区域内一张牌，没赢则对方获得你区域内一张牌。同点由应战方获胜；觉醒后吕蒙拼点点数+1，最高13。','手牌数大于体力值时，准备阶段自动觉醒勤学，体力上限-1，按护甲数摸牌。此后攻心每阶段可用一次，红桃只额外摸一张；攻心可将展示牌置于牌堆顶或弃置；博图按自己出牌阶段进入弃牌堆的花色判断，每轮最多触发2次，不额外获得护甲。'],
      shensunce:['开局4/4。进入濒死时立即发动魂姿：获得1护甲、摸三张，并获得英姿※与英魂※；新摸的桃可用于本次求救。','连讨结算中摸到的同色手牌也能继续当决斗使用；造成伤害不再额外摸牌。若未伤害目标，则摸一张、本回合手牌上限+1且不能使用杀。','制霸仅军8孙策为主公时可发动一次；进入濒死时按其他吴将人数回复体力，然后令其他吴将依次受到1点无来源伤害。'],
      jiehuanggai:['每回合限一次。出牌阶段，你可以将任意张手牌或装备区的牌交给一名角色，然后受到其造成的1点火焰伤害。结算后，你可以令你和另一名角色进入横置状态。当一名角色进入或解除横置状态后，你摸一张牌。','每回合限一次。当你即将受到火焰伤害时，你可以摸X张牌，并将这些牌交给X名不同角色，每人一张（1≤X≤存活角色数，可以包括你）。其他角色手中每有一张以此法获得的牌，其受到的火焰伤害+1，直到该牌离开其手牌。每次此加伤结算后，你回复1点体力，并摸等同于该次实际造成伤害点数的牌。你的回合内，若你已受伤，你使用的红色【杀】不能被响应。'],
      jiezhaoyun:['龙胆可将杀和闪、酒和桃互换；在出牌阶段点击龙胆选择实体手牌，响应和救援时会出现对应的转化选项。','回合外使用或打出手牌可发动涯角展示牌堆顶；发动龙胆时若有对应角色，可在牌生效前用冲阵获得其一张随机手牌；使用桃救人时不触发冲阵。'],
      zhangfei:['喝断始终允许继续出杀；已损失1点体力后杀无距离限制，2点后目标不能出闪，3点后使用杀时可获得其中一名目标的一张牌并回复1点体力。','当距离1以内的角色成为杀的目标时，独据会在响应前弹出。发动后张飞拿走此杀、失去1点体力并令整张杀无效；张飞与使用者的非锁定技本回合失效。'],
      machao:['在自己的回合内正常使用牌后，急进令攻击范围额外+1，再可将X张手牌当杀追击；X为本回合此前转牌追击次数+1，依次耗1、2、3……张。放弃追击不增加次数，每回合重置。追击杀不计出杀次数，也不会再触发急进或增加范围。','铁骑每轮对每名角色限一次：先封住非锁定技，随后可判定。红色使其不能响应；黑色由马超获得判定牌并失去1点体力，重置对该角色的本轮次数。黑判不再提供出杀次数豁免；急进追击自身的不计次数仍保留。','你的回合结束时，精备移去急进增加的范围并摸等量牌；武器自身的范围不受影响。'],
      blank:['体力上限4，没有武将技能。','性别在大厅设置，仅影响雌雄双股剑。'],
      molvbu:['无双在自己的回合开始前发动：对自己造成1点普通伤害；存活后，本回合杀需双闪、决斗需双杀。若本回合伤及其他角色，回合结束回复1点体力。','骁勇指定一名对手，每个角色的回合内，你首次对其造成伤害+1；该对手反击你时不会因此加伤。下一回合重新计算首次伤害。','夺势保留炁牌标记、开局额外出牌阶段、伤后夺炁和炁杀炁酒不计次数；武威按上一张使用的牌为基本牌或装备牌，将炁牌转为决斗或火杀。']
    };
    $('general-detail').innerHTML=`<div class="general-detail-hero faction-${({魏:'wei',群:'qun',蜀:'shu',吴:'wu',神:'shen'}[h.faction]||'test')}"><span class="detail-character ${ZhenGeneralArt.url(h.id)?'has-general-art':''}" ${ZhenGeneralArt.style(h.id)} aria-hidden="true">${h.id==='blank'?'兵':escape(h.name.slice(-1))}</span><div><span class="eyebrow">${h.id==='blank'?'基础测试角色':(h.version||'三国杀OL')+' · 已加入'}</span><h2>${escape(h.name)}</h2><div class="detail-health" aria-label="${heroInitialHp(h)<h.hp?'初始'+heroInitialHp(h)+'点体力，体力上限'+h.hp+'点':h.hp+'点体力'}">${Array.from({length:h.hp},(_,i)=>'<span class="hp-pip'+(i>=heroInitialHp(h)?' empty':'')+'"></span>').join('')}<span>${heroHp(h)}血${h.initialArmor?'＋'+h.initialArmor+'护盾':''}</span></div></div></div><dl class="general-facts"><div><dt>势力</dt><dd>${escape(h.faction||'未指定')}</dd></div><div><dt>性别</dt><dd>${h.gender==='male'?'男':h.gender==='female'?'女':'大厅设置'}</dd></div><div><dt>技能数</dt><dd>${h.skills.length}项</dd></div><div><dt>可玩模式</dt><dd>1V1 / 2V2 / 军8 / 斗地主</dd></div></dl><div class="general-detail-section"><h3>技能</h3>${h.skills.length?h.skills.map(s=>`<article class="general-detail-skill"><h4>${escape(s.name)}</h4><p>${escape(s.text)}</p></article>`).join(''):'<p class="general-no-skills">没有武将技能，使用基础卡牌与装备进行对战。</p>'}</div>${tips[h.id]?`<div class="general-detail-section general-playing-notes"><h3>操作说明</h3><ul>${tips[h.id].map(t=>`<li>${escape(t)}</li>`).join('')}</ul></div>`:''}${h.source?`<div class="general-source"><span>技能版本 · ${h.version||'三国杀OL'}</span><a href="${escape(h.source)}" target="_blank" rel="noopener">查看官方技能文本 ↗</a></div>`:''}`;
  }
  function launch(options,replay=[]) {
    hideGenerals();
    game?.stop();closeModal();resetSelection();oldPrompt=null;resultShown=false;soundBank.stopAll();reviewingJudgment=false;$('judgment-overlay').hidden=true;$('harvest-overlay').hidden=true;harvestPromptFocus=null;lastRenderedCardAction=-1;cardActionAnimationUntil=0;clearCardFlights();
    $('card-description').textContent='悬停或选中一张牌，查看效果。';
    $('lobby').hidden=true;$('arena').hidden=false;$('lobby-btn').hidden=false;
    speed=$('lobby-speed').value;$('game-speed').value=speed;
    const g=new Game(options,{
      replay,
      sound:event=>{if(game===g)playGameSound(event,g);},
      change:()=>{if(game===g)render();},
      save:g=>save(g),
      delay:async(g,minMs=0)=>{await new Promise(resolve=>setTimeout(resolve,Math.max(minMs,{fast:100,normal:440,slow:850}[speed])));if(!$('general-library').hidden&&game===g)await new Promise(resolve=>libraryWaiters.push(resolve));},
      error:e=>{if(game===g){$('prompt-title').textContent='对局暂时中断';$('prompt-detail').textContent=e.message;toast(e.message);}}
    });
    game=g;window.zhenlue={get game(){return game;}};
    g.start().catch(e=>console.error(e));
  }
  function newGame() {
    const options={rulesVersion:16,startingRerolls:3,generalPool:Object.keys(ZhenGenerals).filter(k=>k!=='blank'&&!ZhenGenerals[k].removed),mode,seat:$('seat-select').value,role:$('role-select').value,relay:mode==='duel'&&$('duel-select').value==='relay',gender:$('gender-select').value,general:$('general-select').value,aiGeneral:$('ai-general-select').value,seed:crypto.getRandomValues(new Uint32Array(1))[0]};
    launch(options);
  }
  function toLobby() {
    hideGenerals();
    game?.stop();soundBank.stopAll();game=null;oldPrompt=null;resetSelection();closeModal();reviewingJudgment=false;$('judgment-overlay').hidden=true;$('harvest-overlay').hidden=true;harvestPromptFocus=null;clearCardFlights();
    $('arena').hidden=true;$('lobby').hidden=false;$('lobby-btn').hidden=true;loadSaved();
    $('save-status').textContent='无需登录 · 离线可玩';
  }
  function askLeave() {
    if(!game||game.over){toLobby();return;}
    showModal('返回大厅','<p class="rules-intro">当前进度已自动保存。回到大厅后，可以点击“继续上次对局”接着玩。</p><div class="modal-buttons"><button class="secondary-button" id="keep-playing">继续对局</button><button class="primary-button" id="leave-game">返回大厅</button></div>');
    $('keep-playing').onclick=closeModal;$('leave-game').onclick=toLobby;
  }
  function showModal(title,content) {
    returnFocus=document.activeElement;
    $('modal').classList.remove('choice-picker-modal');$('modal-title').textContent=title;$('modal-content').innerHTML=content;$('modal-backdrop').hidden=false;
    $('modal-close').focus();
  }
  function closeModal() {
    const wasOpen=!$('modal-backdrop').hidden;
    $('modal-backdrop').hidden=true;
    if(wasOpen&&returnFocus?.isConnected)returnFocus.focus();
  }
  function showBattleLog() {
    if(!game)return;
    showModal('战局记录',`<section class="log-panel log-dialog-panel"><div class="log-heading"><span>最近 ${Math.min(game.logItems.length,150)} 条记录</span><button id="export-log" class="text-button">导出</button></div><div id="battle-log" class="battle-log" aria-live="off"></div></section>`);
    renderLog();
    $('export-log').onclick=exportBattleLog;
  }
  function showChuangPile(playerId) {
    if(!game)return;
    const owner=game.get(playerId),cards=owner?.zhoutaiChuang||[];
    if(!cards.length)return;
    showModal(`${owner.name}的“创” · ${cards.length}张`,`<p class="chuang-pile-note">这些牌公开置于武将牌旁。点击关闭后继续牌局。</p><div class="chuang-card-list">${cards.map(c=>`<div class="chuang-card-entry">${cardMarkup(c)}<p>${escape(c.text||'')}</p></div>`).join('')}</div>`);
    $('modal-content').querySelectorAll('.chuang-card-entry .card').forEach(card=>{card.disabled=true;card.setAttribute('aria-pressed','false');});
  }
  function showBookPile(playerId) {
    if(!game)return;
    const owner=game.get(playerId),cards=owner?.caiyongBooks||[];
    showModal(owner.name+'的“书” · '+cards.length+'张','<p class="chuang-pile-note">书公开置于武将牌旁，牌名各不相同。校经须用同颜色手牌交换；著史要求弃书时，可自行选择任意一本。</p><div class="chuang-card-list">'+cards.map(c=>'<div class="chuang-card-entry">'+cardMarkup(c)+'<p>'+escape(c.text||'')+'</p></div>').join('')+'</div>');
    $('modal-content').querySelectorAll('.chuang-card-entry .card').forEach(card=>{card.disabled=true;card.setAttribute('aria-pressed','false');});
  }
  function showWeiPile(playerId) {
    if(!game)return;
    const owner=game.get(playerId),cards=owner?.jiaxuWei||[];
    const own=game.controlledSeats?.has(playerId);
    const content=own?'<div class="chuang-card-list">'+cards.map(c=>'<div class="chuang-card-entry">'+cardMarkup(c)+'<p>'+escape(c.text||'')+'</p></div>').join('')+'</div>':'<p>这些帷暗置，仅持有者可查看牌面。</p>';
    showModal(owner.name+'的“帷” · '+cards.length+'/3','<p class="chuang-pile-note">准备阶段可以使用一张帷；乱武可以弃置一张帷。有帷时不能成为黑色锦囊或虚拟杀的目标。</p>'+content);
    $('modal-content').querySelectorAll('.chuang-card-entry .card').forEach(card=>{card.disabled=true;card.setAttribute('aria-pressed','false');});
  }
  function showHelp() {
    showModal('规则与牌库',`<div class="rules-intro">本地人机平台。默认角色4血、无技能；可选${skillGeneralCount()}名技能武将（部分技能按本地强化规则），详见武将库。主动技能显示于手牌上方，在合法时机可直接点击发动。主公不额外加体力。每回合依次进行准备、判定、摸牌、出牌、弃牌和结束阶段。通常摸2张牌，使用杀的次数和弃牌后的手牌上限以武将技能为准。<br>操作：点选手牌，再点目标角色，按“确认使用”。闪、无懈可击和救援在提示时响应。其他玩家的手牌不显示牌面，电脑依据自己的牌和公开行动判断局势。</div><div class="rules-grid"><div class="rule-box"><h3>1V1 · 对决</h3><p>单将：击败对方即获胜，标准108张牌。经典接力：双方各3名角色（技能武将仅首将，后续为4血无技能），去掉闪电，标准106张；阵亡后清空所有区域，新角色摸4张，当前回合结束。先手第一次摸牌仅摸1张。</p></div><div class="rule-box"><h3>2V2 · 同袍</h3><p>1、4号位为一队，2、3号位为另一队，顺序1→2→3→4。起手4张，4号位5张；1号位首次摸1张。队友阵亡可选择摸3张。消灭对方所有角色获胜。标准＋军争160张牌。</p></div><div class="rule-box"><h3>军8 · 身份</h3><p>1主、2忠、4反、1内。主忠消灭反贼和内奸获胜；反贼击败主公获胜；内奸须清除其余角色，最后单挑击败主公。击杀反贼摸3张；主公误杀忠臣弃所有手牌与装备。</p></div><div class="rule-box"><h3>斗地主 · 三人</h3><p>1号地主对抗2、3号农民，身份公开。地主体力上限+1，准备阶段摸1张且本回合可额外使用1张杀；判定前可弃2张牌移去1张判定区牌。农民队友阵亡后可回复1点体力或摸2张。使用标准＋军争160张牌；本地选座，不设叫分和欢乐豆。</p></div></div><div class="rules-intro">距离按存活角色的环形座次计算，坐骑修正攻击距离，武器提供攻击范围。濒死体力≤0时逐个角色求桃；酒只能自救。装备能力、铁索传导、锦囊逐目标无懈与反无懈均参与结算。未加入木牛流马及后续扩展牌。角色性别只影响雌雄双股剑。<br>规则参考：<a href="https://www.sanguosha.com/news/20240531_3096_4916" target="_blank" rel="noopener">官方赛事模式说明</a> · <a href="https://guozhan.sanguosha.com/game_rule/game.html" target="_blank" rel="noopener">基础回合流程</a>。1V1提供上述两个明确变体，未实现新1V1专属牌堆和选将流程。</div><div class="library-header"><h3>游戏牌效果 <small style="color:var(--muted);font-weight:400">${Object.keys(C.defs).length}种</small></h3><input id="library-search" placeholder="查找牌名或效果" aria-label="搜索牌库"></div><div id="card-library" class="card-library"></div>`);
    const renderLibrary=()=>{
      const q=$('library-search').value.trim();
      $('card-library').innerHTML=Object.values(C.defs).filter(c=>(c.name+c.text).includes(q)).map(c=>`<article class="library-item"><h4>${c.name} <small style="color:var(--muted);font-weight:400">${kindLabel[c.kind]}${c.range?' / 范围'+c.range:''}</small></h4><p>${c.text}</p></article>`).join('');
    };
    $('library-search').oninput=renderLibrary;renderLibrary();
  }
  function roleDisplay(p) {
    const visible=game.options.mode!=='identity'||p.id===game.humanId||p.role==='主公'||!p.alive||game.over;
    const name=visible?p.role:'身份未知';
    const cls=!visible?'':name==='青方'||name==='忠臣'||name==='农民'?'blue':name==='赤方'||name==='反贼'?'red':name==='主公'||name==='地主'?'gold':name==='内奸'?'purple':'';
    return {name,cls};
  }
  function activeActions() {
    const prompt=game?.pending;
    if(prompt?.kind!=='play')return [];
    return prompt.actions.filter(a=>a.type==='use'&&(spearMode?a.cardId==='spear'&&a.cost.length===selectedCards.length&&a.cost.every(id=>selectedCards.includes(id)):a.cardId===selectedCards[0]));
  }
  function targetIsAvailable(id) {
    const choices=game?.pending?.targetChoices;
    if(choices){
      if(selectedTargets.includes(id))return true;
      return choices.some(choice=>[...selectedTargets,id].every(x=>choice.targets.includes(x)));
    }
    if(game?.pending?.kind!=='play'||!selectedCards.length)return false;
    if(selectedTargets.includes(id))return true;
    const actions=activeActions();
    const borrowing=actions.some(a=>!a.cost&&game.human().hand.find(c=>c.id===a.cardId)?.key==='borrow');
    return actions.some(a=>{
      if(!a.targets.includes(id))return false;
      if(borrowing)return a.targets[selectedTargets.length]===id&&selectedTargets.every((x,i)=>a.targets[i]===x);
      return [...selectedTargets,id].every(x=>a.targets.includes(x));
    });
  }
  function matchingAction() {
    return activeActions().find(a=>!a.recast&&a.targets.length===selectedTargets.length&&(game.human().hand.find(c=>c.id===a.cardId)?.key==='borrow'?a.targets.every((x,i)=>x===selectedTargets[i]):a.targets.every(id=>selectedTargets.includes(id))));
  }
  function matchingTargetChoice(){
    return game?.pending?.targetChoices?.find(choice=>choice.targets.length===selectedTargets.length&&choice.targets.every(id=>selectedTargets.includes(id)));
  }
  function seatMarkup(p,self=false) {
    const role=roleDisplay(p), active=game.turn===p.id&&!game.over&&p.alive;
    const faction=({魏:'wei',蜀:'shu',吴:'wu',群:'qun',神:'shen'})[game.general(p).faction]||'test';
    const targetable=targetIsAvailable(p.id),sel=selectedTargets.includes(p.id),recentActor=game.lastCard?.source===p.id;
    const hp=Array.from({length:p.maxHp},(_,i)=>`<span class="hp-pip${i>=p.hp?' empty':p.hp<=1?' danger':''}"></span>`).join('');
    const artwork=ZhenGeneralArt.style(p.general);
    const equipment=Object.values(p.equip).filter(Boolean).map(c=>'<span class="seat-equip-line" title="'+escape(c.name+'：'+c.text)+'">'+escape(c.name)+' <b class="'+(C.isRed(c)?'red-suit':'')+'">'+suit(c)+'</b></span>').join('');
    const judgeLetter={indulgence:'乐',shortage:'兵',lightning:'电'};
    const judges=p.judge.map(c=>'<span class="judge-badge'+(game.judging&&game.lastJudgment?.playerId===p.id?' judgment-active':'')+'" title="'+escape(c.name+'：'+c.text)+'">'+(judgeLetter[c.key]||escape(c.name.slice(0,1)))+'</span>').join('');
    const portrait='<button type="button" class="seat faction-'+faction+(role.cls?' faction-'+role.cls:'')+(active?' active':'')+(targetable?' targetable':'')+(sel?' target-selected':'')+(recentActor?' card-actor':'')+(p.chained?' chained-seat':'')+(!p.alive?' dead':'')+'" data-player="'+p.id+'" aria-disabled="'+(!targetable)+'" aria-label="'+escape(p.name+'，'+role.name+'，'+p.hp+'点体力，'+p.hand.length+'张手牌'+(p.chained?'，铁索连环状态':'')+(targetable?'，可选择为目标':''))+'"><span class="seat-art" '+artwork+' aria-hidden="true"></span><div class="seat-top"><span class="seat-name">'+escape(p.name)+'<small class="seat-number">'+(p.id+1)+'号</small></span><span class="identity-tag '+role.cls+'">'+role.name+'</span></div><div class="seat-main"><div><div class="hp-line" aria-label="'+p.hp+'/'+p.maxHp+'体力">'+hp+'</div><div class="seat-info"><span>'+(p.alive?'手牌 '+p.hand.length:'已阵亡')+'</span><span>'+((p.remaining>1||p.generation>1)?'接力 '+p.generation+'/3':game.general(p).faction?game.general(p).faction+'势力':'测试角色')+'</span>'+(p.turnedOver?'<span class="turned-indicator">背面</span>':'')+(p.drunk?'<span class="drunk-indicator">酒</span>':'')+(p.chained?'<span class="chain-indicator">连环</span>':'')+'</div></div></div>'+(p.chained?'<span class="seat-chain-visual" aria-hidden="true"><i>⛓ ⛓ ⛓ ⛓ ⛓ ⛓</i></span>':'')+'<div class="seat-special-piles">'+game.dynastyStates(p,true).map(s=>'<span class="pile-badge dynasty-badge">'+escape(s)+'</span>').join('')+(p.luPile.length?'<span class="pile-badge">赂 '+p.luPile.length+'张</span>':'')+'</div>'+(!self&&p.alive&&game.human().alive?'<span class="distance-badge">距你 '+game.distance(game.human(),p)+'</span>':'')+(sel?'<span class="target-check">'+(selectedTargets.indexOf(p.id)+1)+'</span>':'')+'</button>';
    const visiblePortrait=portrait.replace(/<span class="pile-badge dynasty-badge">创 \d+<\/span>/,'');
    const chuangButton=p.zhoutaiChuang?.length?'<button type="button" class="chuang-trigger" data-chuang-player="'+p.id+'" aria-label="查看'+escape(p.name)+'的'+p.zhoutaiChuang.length+'张创牌">创 '+p.zhoutaiChuang.length+'</button>':'';
    const bookButton=p.general==='caiyong'?'<button type="button" class="chuang-trigger book-trigger" data-book-player="'+p.id+'" aria-label="查看'+escape(p.name)+'的'+(p.caiyongBooks?.length||0)+'本书">书 '+(p.caiyongBooks?.length||0)+'</button>':'';
    const weiButton=p.general==='jiaxu'?'<button type="button" class="chuang-trigger wei-trigger" data-wei-player="'+p.id+'" aria-label="查看'+escape(p.name)+'的'+(p.jiaxuWei?.length||0)+'张帷">帷 '+(p.jiaxuWei?.length||0)+'/3</button>':'';
    const discardSuits=p.lvmengDiscardSuits||[],suitOrder=['S','H','C','D'];
    const lvmengProgress=p.general==='lvmeng'&&game.turn===p.id&&!game.over?'<div class="lvmeng-suit-progress" aria-label="吕蒙本回合已有'+discardSuits.length+'种花色进入弃牌堆：'+(discardSuits.map(s=>C.suitMark[s]).join('、')||'无')+'"><small>'+(p.lvmengAwakened?'博图 ':'花色 ')+discardSuits.length+'/4</small><span>'+suitOrder.map(s=>'<b class="'+(discardSuits.includes(s)?'collected ':'')+(['H','D'].includes(s)?'red-suit':'')+'">'+C.suitMark[s]+'</b>').join('')+'</span></div>':'';
    return '<div class="seat-station'+(self?' own-station':'')+'"><div class="judge-column" aria-label="判定区">'+judges+'</div><div class="seat-rail" aria-label="'+escape(p.name)+'，'+p.hp+'/'+p.maxHp+'体力"><span class="rail-name">'+escape(p.name)+'</span><div class="rail-hp">'+hp+'</div></div>'+visiblePortrait+chuangButton+bookButton+weiButton+lvmengProgress+(self?'':'<div class="seat-equip-strips" aria-label="装备区">'+equipment+'</div>')+'</div>';
  }
  let seatClickTimer=null;
  function hideOpponentSkills(){const panel=$('opponent-skills');if(panel)panel.hidden=true;}
  function showOpponentSkills(id){
    const p=game.get(id),general=game.general(p),panel=$('opponent-skills');if(!p||!panel)return;
    $('opponent-skills-title').textContent=p.name+' · 武将技能';
    $('opponent-skills-content').innerHTML=general.skills.length?general.skills.map(s=>'<div class="opponent-skill-entry"><strong>'+escape(s.name)+'</strong><p>'+escape(s.text)+'</p></div>').join(''):'<p>此武将没有技能。</p>';
    panel.hidden=false;$('opponent-skills-close').focus();
  }
  function renderSeats() {
    const human=game.human();
    const others=Array.from({length:game.players.length-1},(_,i)=>game.get((human.id+i+1)%game.players.length));
    const edge={
      topLeft:'left:12px;top:10px;transform:none',topRight:'right:12px;top:10px;transform:none',
      topMiddle:'left:50%;top:10px;transform:translateX(-50%)',
      top30:'left:30%;top:10px;transform:translateX(-50%)',top70:'left:70%;top:10px;transform:translateX(-50%)',
      top35:'left:35%;top:10px;transform:translateX(-50%)',top65:'left:65%;top:10px;transform:translateX(-50%)',
      top40:'left:40%;top:10px;transform:translateX(-50%)',top60:'left:60%;top:10px;transform:translateX(-50%)',
      rightUpper:'right:12px;top:43%;transform:translateY(-50%)',rightMiddle:'right:12px;top:50%;transform:translateY(-50%)',rightLower:'right:12px;bottom:10px;transform:none',
      leftUpper:'left:12px;top:43%;transform:translateY(-50%)',leftMiddle:'left:12px;top:50%;transform:translateY(-50%)',leftLower:'left:12px;bottom:10px;transform:none'
    };
    const layouts={
      2:['topLeft'],
      3:['topRight','topLeft'],
      4:['rightMiddle','topMiddle','leftMiddle'],
      5:['rightLower','top65','top35','leftLower'],
      6:['rightLower','rightUpper','topMiddle','leftUpper','leftLower'],
      7:['rightLower','rightUpper','top60','top40','leftUpper','leftLower'],
      8:['rightLower','rightUpper','top70','topMiddle','top30','leftUpper','leftLower']
    };
    const places=layouts[game.players.length];
    $('seats').innerHTML=others.map((p,i)=>seatMarkup(p).replace('class="seat-station"',`class="seat-station" style="${edge[places[i]]}"`)).join('');
    $('self-portrait').innerHTML=seatMarkup(human,true);
    document.querySelectorAll('[data-player]').forEach(b=>{b.onclick=()=>{
      const id=Number(b.dataset.player);if(!targetIsAvailable(id))return;
      clearTimeout(seatClickTimer);
      seatClickTimer=setTimeout(()=>{if(selectedTargets.includes(id))selectedTargets=selectedTargets.filter(x=>x!==id);else selectedTargets.push(id);render();},300);
    };if(Number(b.dataset.player)!==human.id)b.ondblclick=e=>{e.preventDefault();clearTimeout(seatClickTimer);showOpponentSkills(Number(b.dataset.player));};});
    document.querySelectorAll('[data-book-player]').forEach(b=>{b.onclick=e=>{e.stopPropagation();clearTimeout(seatClickTimer);showBookPile(Number(b.dataset.bookPlayer));};});
    document.querySelectorAll('[data-wei-player]').forEach(b=>{b.onclick=e=>{e.stopPropagation();clearTimeout(seatClickTimer);showWeiPile(Number(b.dataset.weiPlayer));};});
    document.querySelectorAll('[data-chuang-player]').forEach(b=>{b.onclick=e=>{e.stopPropagation();clearTimeout(seatClickTimer);showChuangPile(Number(b.dataset.chuangPlayer));};});
  }
  function renderPindian(){
    var box=$('pindian-overlay');if(!box)return;box.hidden=!game?.pindianShowing||!$('general-library').hidden;if(box.hidden)return;var d=game.lastPindian;box.innerHTML='<section class="pindian-display"><span class="eyebrow">'+escape(d.title)+' · 双方亮牌</span><h2>'+escape(d.winner+'拼点获胜')+'</h2><div class="pindian-pair">'+d.cards.map((c,i)=>'<div><h3>'+escape(d.players[i])+'</h3>'+cardMarkup(c,true)+(d.points&&d.points[i]!==c.rank?'<p>觉醒加点：'+escape(d.points[i])+'</p>':'')+'</div>').join('')+'</div></section>';box.querySelectorAll('button').forEach(b=>b.disabled=true);
  }
  function cardMarkup(c,unavailable=false) {
    const index=selectedCards.indexOf(c.id);
    return `<button class="card type-${c.kind} tone-${C.isSlash(c)?'attack':c.key==='jink'?'defense':c.key==='peach'?'heal':c.key==='wine'?'buff':'other'} ${C.isRed(c)?'red-card ':''}${index>=0?'selected ':''}${unavailable?'unavailable':''}" data-card="${c.id}" aria-pressed="${index>=0}" aria-label="${escape(c.name+' '+suit(c)+' '+c.text)}" title="${escape(c.name+'：'+c.text)}"><span class="card-suit">${C.rankMark(c.rank)}<span>${C.suitMark[c.suit]}</span></span><span class="card-name ${c.name.length>=4?'long-name':''}">${c.name}</span><span class="card-type">${c.range?'范围 '+c.range:kindLabel[c.kind]}</span>${index>=0?`<span class="selection-number">${index+1}</span>`:''}${game?'<span class="dynasty-card-tags">'+game.cardTags(game.human(),c).map(s=>'<small>'+escape(s)+'</small>').join('')+'</span>':''}${game?.fengweiCards(game.human()).some(x=>x.id===c.id)?'<span class="fengwei-badge">丰蔚</span>':''}</button>`;
  }
  function renderPlayerZones() {
    const p=game.human();
    const equipment=Object.values(p.equip).filter(Boolean).map(c=>`<button class="own-equip-line" data-zone-card="${c.id}" title="${escape(c.name+'：'+c.text)}">${escape(c.name)} <b class="${C.isRed(c)?'red-suit':''}">${suit(c)}</b></button>`).join('');
    $('player-zones').innerHTML='<span class="equip-caption">装备</span><div class="own-equip-lines">'+(equipment||'<span class="equip-empty">暂无装备</span>')+'</div>'+(p.luPile.length?'<span class="own-special-summary">'+(p.luPile.length?'赂 '+p.luPile.length:'')+'</span>':'');
    $('player-zones').querySelectorAll('[data-zone-card]').forEach(b=>b.onclick=()=>{
      const c=[...Object.values(p.equip),...p.judge].find(c=>c.id===b.dataset.zoneCard);
      if(!c)return;
      if(game.pending?.kind==='options'&&game.pending.options.some(o=>o.key===c.id)){submit(c.id);return;}
      const inJudge=p.judge.includes(c);
      showModal(`${inJudge?'判定区':'装备区'} · ${c.name}`,`<div class="zone-card-details"><div class="zone-detail-card ${C.isRed(c)?'red-suit':''}"><span>${suit(c)}</span><strong>${c.name}</strong><small>${kindLabel[c.kind]}${c.range?' · 范围'+c.range:''}</small></div><div><p>${escape(c.text)}</p><p class="rules-intro">${inJudge?'此牌将在你的判定阶段处理。':'此装备已生效。可以在牌库中查看其他牌的效果。'}</p></div></div>`);
    });
  }
  function renderJudgmentOverlay() {
    if(!$('general-library').hidden){$('judgment-overlay').hidden=true;return;}
    const j=game?.lastJudgment;
    const visible=!!j&&(game.judging||reviewingJudgment);
    $('judgment-overlay').hidden=!visible;
    if(!visible)return;
    const c=j.card;
    $('judgment-heading').textContent=`${game.get(j.playerId).name} · ${j.reason}判定`;
    $('judgment-card-face').className=`judgment-card-face ${C.isRed(c)?'red-suit':''}`;
    $('judgment-card-face').innerHTML=`<span class="judgment-corner top-corner">${C.rankMark(c.rank)}<span>${C.suitMark[c.suit]}</span></span><span class="judgment-watermark">${C.suitMark[c.suit]}</span><strong class="judgment-face-name">${c.name}</strong><span class="judgment-face-type">${kindLabel[c.kind]}牌</span><span class="judgment-corner bottom-corner">${C.rankMark(c.rank)}<span>${C.suitMark[c.suit]}</span></span>`;
    $('judgment-verdict').textContent=j.outcome;
    $('judgment-verdict').className=`judgment-verdict ${j.harmful?'hit':'safe'}`;
    $('judgment-rule').textContent=`判定牌：${suit(c)} · ${j.rule}`;
    $('judgment-auto-hint').hidden=!game.judging;
    $('judgment-close').hidden=game.judging;
  }
  function renderHarvestOverlay() {
    const reveal=game?.harvestReveal,overlay=$('harvest-overlay');
    const visible=!!reveal&&$('general-library').hidden&&!game.judging;
    overlay.hidden=!visible;
    if(!visible){harvestPromptFocus=null;return;}
    const prompt=game.pending;
    const picking=reveal.phase==='pick'&&prompt?.title==='五谷丰登：选择一张牌';
    const nullifying=reveal.phase==='nullify'&&prompt?.title?.includes('【五谷丰登】');
    const target=reveal.targetId==null?null:game.get(reveal.targetId);
    $('harvest-heading').textContent=reveal.phase==='reveal'?'先看牌，再决定是否无懈':reveal.phase==='resolved'?`${target?.name||'当前角色'}已选牌`:`${target?.name||'当前角色'} · ${reveal.phase==='pick'?'选择一张牌':'询问无懈可击'}`;
    $('harvest-status').textContent=reveal.phase==='reveal'?'牌已全部亮出。随后逐名询问无懈可击，再选择牌。':reveal.phase==='resolved'?`已获得【${reveal.lastTaken}】，轮到下一位。`:picking?'牌面公开，点击下方一张牌获得。':nullifying?'先查看亮出的牌，再决定是否使用无懈可击。':`${target?.name||'角色'}正在${reveal.phase==='pick'?'选牌':'决定是否使用无懈可击'}。`;
    const options=new Set(picking?prompt.options.map(o=>o.key):[]);
    $('harvest-cards').innerHTML=reveal.cards.map(c=>`<button class="harvest-card ${C.isRed(c)?'red-card':''}" data-harvest-card="${escape(c.id)}" aria-label="${escape(c.name+' '+suit(c))}" ${options.has(c.id)?'':'disabled'}><span class="harvest-card-corner">${C.rankMark(c.rank)}<small>${C.suitMark[c.suit]}</small></span><strong>${escape(c.name)}</strong><span class="harvest-card-type">${kindLabel[c.kind]}牌</span><span class="harvest-card-corner harvest-card-corner-bottom">${C.rankMark(c.rank)}<small>${C.suitMark[c.suit]}</small></span></button>`).join('');
    $('harvest-cards').querySelectorAll('button:not(:disabled)').forEach(b=>b.onclick=()=>submit(b.dataset.harvestCard));
    const actions=$('harvest-actions');actions.innerHTML='';
    if(nullifying)prompt.options.forEach(o=>{const b=document.createElement('button');b.className=o.key==='pass'?'secondary-button':'primary-button';b.textContent=o.label+(o.card?' · '+suit(o.card):'');b.onclick=()=>submit(o.key);actions.append(b);});
    if(prompt&&(picking||nullifying)&&harvestPromptFocus!==prompt){harvestPromptFocus=prompt;(picking?$('harvest-cards'):actions).querySelector('button:not(:disabled)')?.focus();}
  }
  function describe(c) {if(c)$('card-description').innerHTML=`<strong>${c.name} · ${suit(c)}</strong>　${escape(c.text)}`;}
  function responseOptionForCard(prompt,c){return prompt?.kind==='options'?prompt.options.find(o=>o.key===c.id||o.key.startsWith('longdan:')&&o.card?.id===c.id):null;}
  function renderHand() {
    const p=game.human(),prompt=game.pending;
    $('hand-count').textContent=p.hand.length;
    let cards=[...p.hand];
    if(sorted)cards.sort((a,b)=>['basic','trick','delay','equip'].indexOf(a.kind)-['basic','trick','delay','equip'].indexOf(b.kind)||a.key.localeCompare(b.key)||a.rank-b.rank);
    $('hand').innerHTML=cards.length?cards.map(c=>{
      let usable=false;
      if(prompt?.kind==='play')usable=spearMode?true:prompt.actions.some(a=>a.cardId===c.id);
      else if(prompt?.kind==='cards')usable=prompt.cards.some(x=>x.id===c.id);
      else if(prompt?.kind==='options')usable=!!responseOptionForCard(prompt,c);
      return cardMarkup(c,!usable);
    }).join(''):'<p class="empty-hand">'+(p.alive?'暂时没有手牌':'你已阵亡，可以继续观战')+'</p>';
    const spearAvailable=prompt?.kind==='play'&&prompt.actions.some(a=>a.cardId==='spear');
    $('spear-btn').hidden=!spearAvailable;$('spear-btn').textContent=spearMode?'取消丈八蛇矛':'丈八蛇矛：两牌当杀';
    $('hand').querySelectorAll('[data-card]').forEach(b=>{
      const c=p.hand.find(c=>c.id===b.dataset.card);
      b.onmouseenter=()=>describe(c);b.onfocus=()=>describe(c);
      b.onclick=()=>clickCard(c);
    });
    const last=p.hand.find(c=>c.id===selectedCards.at(-1));if(last)describe(last);
  }
  function clickCard(c) {
    describe(c);
    const prompt=game.pending;if(!prompt)return;
    if(prompt.kind==='options') {
      const option=responseOptionForCard(prompt,c);
      if(option)submit(option.key);
      else toast('这张牌不能响应当前效果。');
      return;
    }
    if(prompt.kind==='cards') {
      if(!prompt.cards.some(x=>x.id===c.id)){toast('请选择提示中允许的牌。');return;}
      toggleCost(c.id,prompt.max);render();return;
    }
    if(prompt.kind==='play') {
      if(spearMode)toggleCost(c.id,2);
      else {
        if(!prompt.actions.some(a=>a.cardId===c.id)) {
          const why=c.key==='jink'?'闪只能在响应时打出。':c.key==='nullify'?'无懈可击只能在锦囊结算时使用。':C.isSlash(c)&&!game.slashAvailable(game.human())?'本出牌阶段已用过杀，需要额外次数或诸葛连弩才能继续。':c.key==='peach'?'体力已满，当前不能使用桃。':c.key==='wine'?'本回合已使用过酒。':'当前没有符合条件的目标。';
          toast(why);return;
        }
        selectedCards=selectedCards[0]===c.id?[]:[c.id];
      }
      selectedTargets=[];render();
    }
  }
  function toggleCost(id,max) {
    if(selectedCards.includes(id))selectedCards=selectedCards.filter(x=>x!==id);
    else if(selectedCards.length<max)selectedCards.push(id);
    else toast(`最多选择${max}张牌，先取消一张再选。`);
  }
  function submit(value) {
    if(game.answer(value)) {resetSelection();oldPrompt=null;render();}
  }
  function addButton(label,cls,fn,disabled=false,id=null) {
    const b=document.createElement('button');b.className=cls;b.textContent=label;b.disabled=disabled;if(id)b.id=id;b.onclick=fn;$('command-actions').append(b);return b;
  }
  function showChoicePicker(prompt) {
    showModal(prompt.title, '<div class="choice-picker"><p class="choice-picker-detail"></p><input class="choice-picker-search" type="search" placeholder="搜索选项" aria-label="搜索选项"><div class="choice-picker-count"></div><div class="choice-picker-list" role="group" aria-label="可选操作"></div></div>');
    const modal=$('modal'),box=modal.querySelector('.choice-picker'),list=box.querySelector('.choice-picker-list'),search=box.querySelector('.choice-picker-search'),count=box.querySelector('.choice-picker-count');
    modal.classList.add('choice-picker-modal');
    box.querySelector('.choice-picker-detail').textContent=prompt.detail||'请选择一项。';
    for(const option of prompt.options){
      const button=document.createElement('button');
      button.type='button';
      button.className=(['pass','skip','no','normal','damage','draw'].includes(option.key)?'secondary-button':'response-card')+(option.card&&C.isRed(option.card)?' red-card':'')+(option.dragonChoice?' dragon-choice':'');
      button.textContent=option.label;
      if(option.card){
        button.title=option.card.text;
        if(!option.dragonChoice){const mark=document.createElement('small');mark.textContent=suit(option.card);button.append(mark);}
      }
      button.onclick=()=>{
        if(game.pending!==prompt){closeModal();toast('选项已更新，请重新选择。');return;}
        closeModal();submit(option.key);
      };
      list.append(button);
    }
    const update=()=>{
      const query=search.value.trim().toLowerCase();
      let visible=0;
      for(const button of list.children){const match=!query||button.textContent.toLowerCase().includes(query);button.hidden=!match;if(match)visible++;}
      count.textContent=query?`找到${visible} / ${prompt.options.length} 项`:`共 ${prompt.options.length} 项，可滚动查看`;
    };
    search.oninput=update;
    if(prompt.options.length<=12)search.hidden=true;
    update();
    (search.hidden?list.querySelector('button'):search)?.focus();
  }
  function renderCommands() {
    const prompt=game.pending;$('command-actions').innerHTML='';
    $('phase-label').textContent=game.over?'对局结束':`${game.phase}阶段`;
    if(game.over) {
      $('prompt-title').textContent=game.over.won?'本局获胜':'本局结束';$('prompt-detail').textContent=`${game.over.label} · ${game.over.rounds}轮 / ${game.over.turns}个回合`;
      addButton('查看结果','primary-button',showResult);addButton('再来一局','secondary-button',()=>launch({...game.options,seed:crypto.getRandomValues(new Uint32Array(1))[0]}));return;
    }
    if(!prompt) {
      if(game.judging&&game.lastJudgment) {
        const j=game.lastJudgment;
        $('prompt-title').textContent=`${game.get(j.playerId).name}的${j.reason}判定`;
        $('prompt-detail').textContent=`判定牌 ${suit(j.card)} · ${j.outcome}。${j.rule}。`;
        return;
      }
      const who=game.get(game.turn);
      $('prompt-title').innerHTML=`${game.auto&&who.id===game.humanId?'电脑替你行动':who.name+'正在行动'}<span class="thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>`;
      $('prompt-detail').textContent=!game.human().alive?'你已阵亡，正在观战。':game.auto?'托管已开启，随时可以关闭。':'留意牌桌与战局记录，响应时会显示操作按钮。';return;
    }
    $('prompt-title').textContent=prompt.title;$('prompt-detail').textContent=prompt.detail||'选择下方操作，或点击对应手牌。';
    if(prompt.kind==='play') {
      const actions=activeActions(),match=matchingAction();
      if(spearMode) {$('prompt-title').textContent='丈八蛇矛：选择两张手牌';$('prompt-detail').textContent=`已选${selectedCards.length}/2张手牌，然后选择攻击目标。`;}
      else if(selectedCards.length) {
        const c=game.human().hand.find(c=>c.id===selectedCards[0]);
        $('prompt-title').textContent=`准备使用【${c.name}】`;
        const max=Math.max(0,...actions.map(a=>a.targets.length));
        $('prompt-detail').textContent=c.key==='borrow'?'先选择持有武器的角色，再选择其攻击范围内的目标。':max>0?`选择${c.key==='chain'?'1—2':max>1?'1—'+max:'1'}名目标，已选${selectedTargets.length}名。可点击目标取消。`:'这张牌对自己或全场生效，点击确认使用。';
      }
      addButton('确认使用','primary-button',()=>{const a=matchingAction();if(a)submit(a);},!match,'confirm-play');
      const recast=actions.find(a=>a.recast);
      if(recast)addButton('重铸：摸1张','secondary-button',()=>submit(recast));
      if(selectedCards.length)addButton('取消选择','secondary-button',()=>{resetSelection();render();});
      const visibleSkills=new Set(game.activeSkills(game.human()).map(s=>s.key));
      prompt.actions.filter(a=>a.type==='skill'&&!visibleSkills.has(a.skill)).forEach(a=>addButton('发动'+({...ZhenDynastySkills.names,zonghu:'宗护',xiaofan:'嚣翻',yanru:'晏如',lucun:'赂存',youlong:'游龙',zhujiu:'煮酒',xixiang:'西向',zhubei:'逐北',liangyuan:'良缘'}[a.skill]||a.skill),'primary-button skill-button',()=>submit(a)));
      addButton('结束出牌','secondary-button',()=>submit(prompt.actions[0]),false,'end-turn');
    } else if(prompt.kind==='options') {
      if(prompt.targetChoices){
        const match=matchingTargetChoice();
        $('prompt-detail').textContent=`在牌桌上点击一到两名目标，已选${selectedTargets.length}名；再次点击可取消。`;
        addButton('确认使用','primary-button',()=>{const choice=matchingTargetChoice();if(choice)submit(choice.key);},!match,'confirm-play');
        const cancel=prompt.options.find(o=>['pass','skip','cancel'].includes(o.key));
        if(cancel)addButton(cancel.label,'secondary-button',()=>submit(cancel.key));
      } else {
      if(prompt.revealedCards){const reveal=document.createElement('div');reveal.className='skill-reveal-cards';reveal.setAttribute('aria-label',prompt.title+'：展示的牌');reveal.innerHTML=prompt.revealedCards.map(c=>prompt.revealedReasons?'<div class="revealed-card-explanation">'+cardMarkup(c,true)+'<p>'+escape(prompt.revealedReasons[c.id]||'')+'</p></div>':cardMarkup(c,true)).join('');reveal.querySelectorAll('button').forEach(b=>{b.disabled=true;});$('command-actions').append(reveal);}
      const manyChoices=prompt.options.length>5||prompt.options.reduce((n,o)=>n+o.label.length,0)>100;
      if(manyChoices){
        addButton(`查看全部选项（${prompt.options.length}）`,'primary-button choice-picker-open',()=>showChoicePicker(prompt));
        const skip=prompt.options.find(o=>['pass','skip','cancel','no'].includes(o.key));
        if(skip)addButton(skip.label,'secondary-button',()=>submit(skip.key));
      }else{
        prompt.options.forEach(o=>{
          const b=addButton(o.label,['pass','skip','no','normal','damage','draw'].includes(o.key)?'secondary-button':'response-card'+(o.card&&C.isRed(o.card)?' red-card':'')+(o.dragonChoice?' dragon-choice':''),()=>submit(o.key));
          if(o.card){b.title=o.card.text;if(!o.dragonChoice){const s=document.createElement('small');s.textContent=suit(o.card);b.append(s);}}
        });
      }
      }
    } else if(prompt.kind==='cards') {
      if(prompt.publicReveal) {
        const reveal=document.createElement('div');reveal.className='skill-reveal-cards';reveal.setAttribute('aria-label',prompt.revealLabel||'技能亮出的牌');reveal.innerHTML=prompt.cards.map(c=>cardMarkup(c)).join('');$('command-actions').append(reveal);reveal.querySelectorAll('[data-card]').forEach(b=>{const c=prompt.cards.find(c=>c.id===b.dataset.card);b.onclick=()=>clickCard(c);b.onmouseenter=()=>describe(c);});
      }
      const equips=prompt.publicReveal?[]:prompt.cards.filter(c=>!game.human().hand.some(h=>h.id===c.id));
      equips.forEach(c=>addButton(`${selectedCards.includes(c.id)?'✓ ':''}${c.name}`,'response-card',()=>{toggleCost(c.id,prompt.max);render();}));
      const sum=selectedCards.reduce((n,id)=>n+(prompt.cards.find(c=>c.id===id)?.rank||0),0);
      const valid=selectedCards.length>=prompt.min&&selectedCards.length<=prompt.max&&(prompt.maxRankSum==null||sum<=prompt.maxRankSum);
      if(prompt.maxRankSum!=null){$('prompt-detail').textContent=prompt.detail+' 当前已选'+selectedCards.length+'张，点数总和 '+sum+'/'+prompt.maxRankSum+(sum>prompt.maxRankSum?'，超过上限，请取消部分选择。':sum===13?'，恰好13！':'。');}

      addButton(`确认${prompt.title.includes('弃')?'弃置':'选择'}（${selectedCards.length}/${prompt.max}）`,'primary-button',()=>submit([...selectedCards]),!valid,'confirm-cards');
      if(prompt.min===0)addButton('放弃','secondary-button',()=>submit([]));
    }
  }
  function renderObjective() {
    const p=game.human();let title,detail;
    if(game.options.mode==='team'){title=`${p.team} · 两人一队`;detail='消灭敌方两名角色。你的同伴与敌人身份公开，可以用桃救援同伴。';}
    else if(game.options.mode==='landlord'){title=`斗地主 · ${p.role}`;detail=p.role==='地主'?'击败两名农民。准备阶段摸1张、本回合多用1张杀；判定前可发动飞扬。':'与队友合力击败地主。队友阵亡后可发动共苦。';}
    else if(game.options.mode==='duel'){title=game.options.relay?'三将接力':'一对一对决';detail=game.options.relay?'击败对方连续三名角色。所选武将只用于首将，接力后续角色为4血无技能。':'击败唯一的对手。先手第一回合仅摸一张牌。';}
    else {
      title=`身份 · ${p.role}`;
      detail={主公:'存活并消灭全部反贼与内奸。误杀忠臣会失去所有手牌与装备。',忠臣:'保护主公，消灭全部反贼与内奸。即使你阵亡，主忠获胜仍算胜利。',反贼:'击败主公，反贼阵营获胜。注意隐藏身份，观察其他角色的行动。',内奸:'清除其他角色，最后与主公单挑并击败主公。过早击败主公会让反贼获胜。'}[p.role];
    }
    $('objective-title').textContent=title;$('objective-detail').textContent=detail;
    const allied=['team','landlord'].includes(game.options.mode)?game.players.filter(x=>x.team===p.team):[p];
    $('team-summary').innerHTML=`<div class="team-summary">${allied.map(x=>`<span>${x.name} ${x.alive?x.hp+'血':'阵亡'}</span>`).join('')}<span>${game.allCards.length}张牌</span></div>`;
  }
  function renderSkills() {
    const p=game.human(),hero=game.general(p),panel=$('skill-panel');
    panel.hidden=!hero.skills.length&&game.options.mode!=='landlord';
    if(panel.hidden)return;
    const marked=game.fengweiCards(p).length,n=game.zonghuCost();
    panel.innerHTML='<div class="general-heading"><span class="general-seal">'+escape(hero.name.slice(-1))+'</span><div><span class="eyebrow">'+hero.faction+' · '+(hero.version||'OL')+'武将</span><h2>'+hero.name+' <small>'+p.maxHp+'血</small></h2></div></div>'+hero.skills.map(s=>'<div class="general-skill"><strong>'+s.name+'</strong><p>'+s.text+'</p></div>').join('');
    if(game.options.mode==='landlord')panel.innerHTML+='<div class="general-skill"><strong>模式技能 · '+(p.role==='地主'?'飞扬、跋扈':'共苦')+'</strong><p>'+(p.role==='地主'?'准备阶段摸1张，本回合多用1张杀；判定前可弃2张牌移去1张判定区牌。':'队友阵亡后，可选择回复1点体力或摸2张牌。'+(p.gongkuUsed?'本局已发动。':''))+'</p></div>';
    if(p.general==='liuzhang')panel.innerHTML+='<div class="skill-state"><span>丰蔚牌 '+marked+'张</span><span>本轮至多摸 '+game.alive().length+' 张</span><span>宗护交牌 '+n+'张</span><span>'+(p.zonghuTurn===game.totalTurns?'本回合已用宗护':'本回合宗护未用')+'</span></div>'+(marked?'<p class="skill-warning">仍有丰蔚牌：跳过摸牌 · 受伤时可交出一张令伤害-1</p>':'<p class="skill-safe">无本轮丰蔚牌，按正常规则摸牌与受伤</p>');
    if(p.general==='jiecaocong')panel.innerHTML+='<div class="skill-state"><span>下次称象 '+(4+(p.chengxiangBonus||0))+'张</span><span>'+(p.turnedOver?'背面朝上':'正面朝上')+'</span></div><p class="'+(p.turnedOver?'skill-warning':'skill-safe')+'">'+(p.turnedOver?'下个回合翻回正面并跳过；背面仍可响应和发动仁心。':'仁心可使用手牌或装备区中的装备牌。')+'</p>';
    const states=game.dynastyStates(p);
    if(p.general==='pengyang')states.push('寸目：当前空区域 '+game.emptyAreaCount(p)+' 个','本回合已用类别 '+p.turnTypes.length+'/3',p.letterBuff?'侻失：下次符合目标条件的牌不限距离 / 次数':'侻失：无额外使用机会');
    if(p.general==='wuyi')states.push('本回合距离 −'+p.distanceReduction);
    if(p.general==='jiesunquan')states.push('制衡 '+p.zhihengUsed+'/'+game.zhihengLimit());
    if(p.general==='shenzhaoyun')states.push('绝境手牌上限 '+game.handLimit(p));
    if(p.general==='sunli')states.push('伉厉待弃 '+p.kangliIds.length+'张');
    if(p.general==='qinlang')states.push('贤膺本轮发动 '+(p.xianyingRound===game.round?p.xianyingActivations:0)+'次','本回合贤膺弃牌 '+p.xianyingDiscardIds.length+'张');
    if(p.general==='xizhicai')states.push('先辅目标 '+(p.xianfuTargetId==null?'待选择':game.get(p.xianfuTargetId).name));
    
    if(p.general==='spliubei')states.push('虚待 '+(p.spXudaiUsed?'已用':'可用'),'煮酒本回合 '+p.spZhujiuPrintCount+'次','惊雷 '+(p.spJingleiUsed?'已用':'未用'));
    if(p.general==='spcaocao')states.push(p.spAwakened?'哀歌已觉醒 · 逐北':'西向 · 尚未觉醒','本回合基本牌 '+(game.spBasicCount||0)+'张');
    if(p.general==='caoxiancaohua')states.push('灵杉 '+p.spWoodPile.filter(c=>['S','C'].includes(c.suit)).length+'张','玉树 '+p.spWoodPile.filter(c=>['H','D'].includes(c.suit)).length+'张','羁肆 '+(p.spJisiUsed?'已用':'可用'));
    if(p.general==='feiyi')states.push('晏如奇数 '+(p.yanruUsed.includes(1)?'已用':'未用'),'晏如偶数 '+(p.yanruUsed.includes(0)?'已用':'未用'),'和衷 '+(p.hezMods.map(m=>(m.direction==='greater'?'大于':'小于')+C.rankMark(m.rank)).join('、')||'暂无条件'));
    if(p.general==='mouzhangrang')states.push('赂 '+p.luPile.length+'张','蜕生 '+(p.tuishengUsed?'已用':'可用'),'已印牌名 '+(p.lucunNames.map(k=>C.defs[k].name).join('、')||'无'));
    if(p.general==='wolongfengchu')states.push('游龙 '+(p.youlongState==='trick'?'阳 · 锦囊':'阴 · 基本'),'废除栏 '+p.disabledSlots.length+'/5','鸾凤 '+(p.luanfengUsed?'已用':'可用'),'已印牌名 '+(p.youlongNames.map(k=>C.defs[k].name).join('、')||'无'));
    if(p.general==='caomao')panel.innerHTML='<div class="daoxin-track"><strong>道心 '+p.daoxin+' / 99</strong><progress max="99" value="'+p.daoxin+'"></progress><span>25 清正 · 50 酒诗 · 75 放逐 · 99 决进</span></div>'+panel.innerHTML;if(states.length)panel.innerHTML+='<div class="skill-state">'+states.map(s=>'<span>'+escape(s)+'</span>').join('')+'</div>';
  }
  function skillEntries(){
    const p=game.human(),prompt=game.pending;
    const names={...ZhenDynastySkills.names,zonghu:'宗护',xiaofan:'嚣翻',yanru:'晏如',lucun:'赂存',youlong:'游龙',zhiheng:'制衡',kurou:'苦肉',jianmie:'翦灭',longhun:'龙魂',zhujiu:'煮酒',xixiang:'西向',zhubei:'逐北',liangyuan:'良缘',jisi:'羁肆',poxi:'魄袭',weiyanBeishui:'背水'};
    const entries=game.activeSkills(p).map(s=>{
      const action=prompt?.kind==='play'?prompt.actions.find(a=>a.skill===s.key):null;
      const response=prompt?.kind==='options'?prompt.options.filter(o=>o.key===s.key||o.key.startsWith(s.key+':')):[];
      let status=action?'可发动':response.length?'可响应':!p.alive?'已阵亡':game.over?'对局结束':!s.ready?(s.reason||'本轮已用或条件不足'):'等待发动时机';
      return {...s,status,enabled:!!action||response.length>0,run:()=>{
        if(action)submit(action);
        else if(response.length===1)submit(response[0].key);
        else if(response.length){$('command-actions').querySelector('button')?.focus();toast('请选择下方'+names[s.key]+'要使用的牌。');$('command-actions').scrollIntoView({block:'nearest',behavior:'smooth'});}
      }};
    });
    for(const [id,name,used,detail] of [['mouzhangrang','蜕生',p.tuishengUsed,'准备阶段 / 自己濒死时'],['wolongfengchu','鸾凤',p.luanfengUsed,'符合体力上限条件的角色濒死时']]){
      if(p.general===id&&!(prompt?.kind==='options'&&prompt.title.startsWith(name)))entries.push({key:name==='蜕生'?'tuisheng':'luanfeng',name,detail:'限定技 · '+detail,status:used?'限定技已使用':'等待发动时机',enabled:false});
    }
    if(prompt?.kind==='options')for(const key of ['qingzheng','moubian','zhouxi','funing','dingan','anran','jiannan','yichi','quhuo','tuisheng','luanfeng','renxin','chengxiang','bensixi','hez','shangshi','jiuyuan','kangli','xianying','tiandu','yiji','cangqi','chouzhi','xianfu','chouce','feiyang','gongku','zhuangshi','kuanggu','yinzhan']){
      const name={qingzheng:'清正',moubian:'谋变',zhouxi:'骤袭',funing:'抚宁',dingan:'定安',anran:'岸然',jiannan:'间难',yichi:'义叱',quhuo:'去惑',tuisheng:'蜕生',luanfeng:'鸾凤',renxin:'仁心',chengxiang:'称象',bensixi:'奔袭',hez:'和衷',shangshi:'伤逝',jiuyuan:'救援',kangli:'伉厉',xianying:'贤膺',tiandu:'天妒',yiji:'遗计',cangqi:'藏器',chouzhi:'酬知',xianfu:'先辅',chouce:'筹策',feiyang:'飞扬',gongku:'共苦',zhuangshi:'壮誓',kuanggu:'狂骨',yinzhan:'饮战'}[key];
      if(prompt.title.startsWith(name)&&!entries.some(s=>s.name===name)){
        const options=prompt.options.filter(o=>!['pass','no','skip'].includes(o.key));
        entries.push({key,name,detail:'当前结算可选择发动',status:'可响应',enabled:true,run:()=>{
          if(options.length===1)submit(options[0].key);else{$('command-actions').querySelector('button')?.focus();$('command-actions').scrollIntoView({block:'nearest',behavior:'smooth'});toast('请选择下方'+name+'的发动方式。');}
        }});
      }
    }
    return entries;
  }
  function skillButtonsMarkup(entries){return entries.map(s=>`<button class="active-skill ${s.enabled?'ready':''}" data-active-skill="${s.key}" ${s.enabled?'':'disabled'} title="${escape(s.detail+' · '+s.status)}"><span class="active-skill-name">${escape(s.name)}</span><span class="active-skill-status">${s.enabled?'点击发动':escape(s.status)}</span><small>${escape(s.detail)}</small></button>`).join('');}
  function bindSkillButtons(container,entries){container.querySelectorAll('[data-active-skill]').forEach(b=>b.onclick=()=>entries.find(s=>s.key===b.dataset.activeSkill)?.run());}
  function renderActiveSkillBar(){
    const entries=skillEntries(),bar=$('active-skill-bar');bar.hidden=!entries.length;
    bar.innerHTML='<div class="active-skill-heading"><strong>武将技能</strong><span>亮起即可点击发动</span></div><div class="active-skill-buttons">'+skillButtonsMarkup(entries)+'</div>';
    bindSkillButtons(bar,entries);
    if(entries.length){const panel=$('skill-panel');panel.insertAdjacentHTML('afterbegin','<div class="sidebar-active-skills">'+skillButtonsMarkup(entries)+'</div>');bindSkillButtons(panel,entries);}
  }
  function renderLog() {
    const count=$('log-count');if(count)count.textContent=game?game.logItems.length:0;
    const box=$('battle-log');if(!box)return;
    const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<70;
    box.innerHTML=game.logItems.slice(-150).map(x=>`<div class="log-item ${x.tone}">${escape(x.text)}</div>`).join('');
    if(nearBottom)box.scrollTop=box.scrollHeight;
  }
  function exportBattleLog() {
    if(!game)return;
    const blob=new Blob([`阵略 · ${MODE_NAMES[game.options.mode]}\n\n`+game.logItems.map(x=>x.text).join('\n')],{type:'text/plain;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='阵略-战局记录.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function render() {
    if(!game||!game.players.length)return;
    if(oldPrompt!==game.pending){resetSelection();oldPrompt=game.pending;}
    $('game-mode').textContent=MODE_NAMES[game.options.mode];$('game-title').textContent=modeText[game.options.mode].title;
    $('round-label').textContent=`第${game.round}轮`;$('turn-label').textContent=game.over?'对局结束':`${game.get(game.turn).name} · ${game.phase}`;
    $('deck-count').textContent=game.deck.length;$('discard-count').textContent=game.discard.length;
    $('board').dataset.mode=game.options.mode;
    $('auto-btn').textContent=`托管：${game.auto?'开':'关'}`;$('auto-btn').setAttribute('aria-pressed',String(game.auto));
    $('table-event').textContent=game.lastEvent||'准备入局';
    const lc=game.lastCard;
    const cardAction=lc?.action||'出牌',freshAction=!!lc&&lc.serial!==lastRenderedCardAction,responseAction=!!lc&&!['出牌','重铸'].includes(cardAction);
    if(freshAction){lastRenderedCardAction=lc.serial;cardActionAnimationUntil=performance.now()+500;}
    $('last-card').className='last-card'+(responseAction?' response-action':'')+(lc&&performance.now()<cardActionAnimationUntil?' card-action-enter':'');
    const actionTarget=lc?.targets?.length?'→ '+lc.targets.map(id=>game.get(id).name).join('、'):responseAction?'响应当前结算':'对自己 / 全场';
    $('last-card').innerHTML=lc?`<span class="mini-played type-${lc.kind} ${C.isRed(lc)?'red-card':''}"><span class="mini-card-corner">${C.rankMark(lc.rank)||'·'}<b>${C.suitMark[lc.suit]||'·'}</b></span><strong>${escape(lc.name)}</strong></span><small><b>${escape(game.get(lc.source).name)}</b>${escape(cardAction)}<br>${escape(actionTarget)}</small>`:'<span style="color:var(--gold);font-family:var(--serif);letter-spacing:5px;font-size:16px">静候开局</span>';
    const judgment=game.lastJudgment;
    $('judgment-result').hidden=!judgment;
    if(judgment) {
      $('judgment-result').className=`judgment-result ${judgment.harmful?'hit':'safe'}`;
      $('judgment-result').innerHTML=`最近判定 · ${game.get(judgment.playerId).name} · ${judgment.reason} <b class="${C.isRed(judgment.card)?'red-suit':''}">${suit(judgment.card)}</b><span class="judgment-outcome">${judgment.outcome} · ${judgment.rule}</span><button class="review-judgment-btn" id="review-judgment-btn">查看判定牌</button>`;
      $('review-judgment-btn').onclick=()=>{reviewingJudgment=true;renderJudgmentOverlay();renderPindian();if(!game.judging)$('judgment-close').focus();};
      if(game.judging) {
        $('last-card').className='last-card judgment-action';
        $('last-card').innerHTML=`<span class="judging-card ${C.isRed(judgment.card)?'red-card':''}">${C.rankMark(judgment.card.rank)}<span>${C.suitMark[judgment.card.suit]}</span></span><small>${judgment.reason}<br>翻开判定牌</small>`;
        $('table-event').textContent=judgment.outcome;
      }
    }
    renderSeats();renderPlayerZones();renderHand();renderCommands();renderObjective();renderSkills();renderActiveSkillBar();renderLog();renderJudgmentOverlay();renderHarvestOverlay();
    if(freshAction&&!game.judging)animateCardFlight(lc);
    if(game.over&&!resultShown){resultShown=true;setTimeout(()=>{if(game?.over)showResult();},500);}
  }
  function showResult() {
    if(!$('general-library').hidden){resultShown=false;return;}
    if(!game?.over)return;
    const g=game;
    showModal('对局结果',`<div class="result-hero"><span class="result-seal">${g.over.won?'胜':'败'}</span><h3>${g.over.label}</h3><p>${g.over.won?'你所在的阵营赢得了本局。':'复盘局势，再战一局。'}　${g.over.rounds}轮 · ${g.over.turns}个回合</p></div><div class="result-roster">${g.players.map(p=>`<span>${p.name} · ${p.role} · ${p.alive?p.hp+'血存活':'阵亡'}</span>`).join('')}</div><div class="modal-buttons"><button class="secondary-button" id="result-lobby">返回大厅</button><button class="primary-button" id="result-again">再来一局 →</button></div>`);
    $('result-lobby').onclick=toLobby;$('result-again').onclick=()=>launch({...g.options,seed:crypto.getRandomValues(new Uint32Array(1))[0]});
  }
  $('start-btn').onclick=()=>{if(saved&&!saved.finished){showModal('开始新对局','<p class="rules-intro">开始新对局会替换上次的自动存档。</p><div class="modal-buttons"><button class="secondary-button" id="cancel-new">取消</button><button class="primary-button" id="confirm-new">开始新对局</button></div>');$('cancel-new').onclick=closeModal;$('confirm-new').onclick=newGame;}else newGame();};
  $('resume-btn').onclick=()=>{if(saved){chooseMode(saved.options.mode);launch(saved.options,saved.actions);}};
  $('export-save-btn').onclick=()=>{
    if(!saved)return;
    const blob=new Blob([JSON.stringify(saved)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='阵略-存档.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('import-save-btn').onclick=()=>$('import-save-file').click();
  $('import-save-file').onchange=async()=>{
    const file=$('import-save-file').files?.[0];$('import-save-file').value='';
    if(!file)return;
    try{
      if(file.size>5_000_000)throw Error('文件太大');
      const data=JSON.parse(await file.text());
      if(data?.version!==1||!data.options||!['duel','team','identity','landlord'].includes(data.options.mode)||!ZhenGenerals[data.options.general]||!Array.isArray(data.actions)||data.actions.length>100_000||typeof data.finished!=='boolean')throw Error('格式不符合当前存档');
      localStorage.setItem(SAVE_KEY,JSON.stringify(data));loadSaved();toast('存档已导入，可点击“继续上次对局”');
    }catch(error){toast('导入失败：'+error.message);}
  };
  document.querySelectorAll('.mode-card').forEach(b=>b.onclick=()=>chooseMode(b.dataset.mode));
  $('help-btn').onclick=showHelp;$('modal-close').onclick=closeModal;
  $('generals-btn').onclick=showGenerals;$('general-library-back').onclick=hideGenerals;
  $('general-search').oninput=renderGeneralCatalog;$('general-faction-filter').onchange=renderGeneralCatalog;
  $('judgment-close').onclick=()=>{reviewingJudgment=false;renderJudgmentOverlay();$('review-judgment-btn')?.focus();};
  $('modal-backdrop').onclick=e=>{if(e.target===$('modal-backdrop'))closeModal();};
  $('brand').onclick=e=>{e.preventDefault();if(!$('general-library').hidden){hideGenerals();return;}if(game)askLeave();};$('lobby-btn').onclick=askLeave;

  $('sound-btn').onclick=async()=>{
    soundBank.setEnabled(!soundBank.enabled);
    if(soundBank.enabled){await soundBank.unlock();soundBank.play('click',{level:.6});}
  };
  $('sound-settings-btn').onclick=()=>{
    $('sound-panel').hidden=!$('sound-panel').hidden;
    $('sound-settings-btn').setAttribute('aria-expanded',String(!$('sound-panel').hidden));
  };
  $('sound-volume').oninput=()=>soundBank.setVolume(Number($('sound-volume').value)/100);
  $('sound-volume').onchange=()=>{soundBank.unlock().then(()=>soundBank.play('select',{level:.6}));};
  document.querySelectorAll('[data-preview-cue]').forEach(b=>b.onclick=async()=>{
    if(!soundBank.enabled)soundBank.setEnabled(true);
    if(!soundBank.volume)soundBank.setVolume(.35);
    await soundBank.unlock();soundBank.play(b.dataset.previewCue);
  });
  document.addEventListener('pointerdown',()=>{if(soundBank.enabled)soundBank.unlock();},{capture:true});
  document.addEventListener('keydown',()=>{if(soundBank.enabled)soundBank.unlock();},{capture:true});
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if(b&&!b.disabled&&!b.matches('#sound-btn,[data-preview-cue]')){
      soundBank.play(b.closest('#hand')?'select':b.closest('[data-player]')?'target':'click',{level:.4});
    }
    if(!e.target.closest('.sound-controls'))closeSoundPanel();
  },{capture:true});

  $('game-speed').onchange=()=>speed=$('game-speed').value;
  $('sort-btn').onclick=()=>{sorted=!sorted;$('sort-btn').textContent=sorted?'恢复摸牌顺序':'整理手牌';renderHand();};
  $('spear-btn').onclick=()=>{spearMode=!spearMode;selectedCards=[];selectedTargets=[];render();};
  $('auto-btn').onclick=()=>{
    if(!game||game.over)return;
    game.auto=!game.auto;
    if(game.auto&&game.pending&&game._pendingAI)submit(game._pendingAI());
    render();
  };
  $('log-open-btn').onclick=showBattleLog;
  $('opponent-skills-close').onclick=hideOpponentSkills;
  document.addEventListener('contextmenu',e=>{if(!$('opponent-skills').hidden){e.preventDefault();hideOpponentSkills();}});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!$('opponent-skills').hidden){hideOpponentSkills();return;}
    if(!$('general-library').hidden&&$('modal-backdrop').hidden){if(e.key==='Escape')hideGenerals();return;}
    if(e.key==='Escape'&&!$('sound-panel').hidden){closeSoundPanel();$('sound-settings-btn').focus();return;}
    if(!$('judgment-overlay').hidden) {
      if(e.key==='Escape'&&!game.judging){reviewingJudgment=false;renderJudgmentOverlay();$('review-judgment-btn')?.focus();}
      if(e.key==='Tab'){e.preventDefault();if(!game.judging)$('judgment-close').focus();}
      return;
    }
    if(!$('harvest-overlay').hidden&&game?.pending){
      if(e.key==='Tab'){
        const buttons=[...$('harvest-overlay').querySelectorAll('button:not(:disabled)')];
        if(buttons.length){const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
      }
      return;
    }
    if(!$('modal-backdrop').hidden) {
      if(e.key==='Escape')closeModal();
      if(e.key==='Tab') {
        const focusables=[...$('modal').querySelectorAll('button,input,select,a[href]')].filter(el=>!el.disabled);
        if(focusables.length){const first=focusables[0],last=focusables.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
      }
      return;
    }
    if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
    if(e.key==='Escape'&&game?.pending){resetSelection();render();}
    if(e.code==='Space'&&game?.pending&&document.activeElement?.tagName!=='BUTTON') {
      e.preventDefault();const b=$('confirm-play')&&!$('confirm-play').disabled?$('confirm-play'):$('confirm-cards')&&!$('confirm-cards').disabled?$('confirm-cards'):game.pending.kind==='play'&&!selectedCards.length?$('end-turn'):null;b?.click();
    }
  });
  function filterSetupGenerals(){
    const query=$('setup-general-search').value.trim().toLowerCase();
    const matches=h=>!query||(h.name+' '+h.skills.map(s=>s.name+' '+s.text).join(' ')).toLowerCase().includes(query);
    for(const [id,ai] of [['general-select',false],['ai-general-select',true]]){
      const select=$(id),selected=select.value||(ai?'blank':'blank');
      const entries=Object.values(ZhenGenerals).filter(h=>!h.removed&&(matches(h)||h.id===selected||h.id==='blank'));
      const options=ai?[new Option('随机已有武将（不重复）','random')]:[];
      for(const h of entries)options.push(new Option(ai?(h.id==='blank'?'无技能角色':'全部使用'+h.name):h.name+' · '+heroHp(h)+'血'+(h.initialArmor?'＋'+h.initialArmor+'护盾':'')+(h.skills.length?' · '+h.skills.map(s=>s.name).join(' / '):''),h.id));
      if(ai&&selected==='random'&&!options.some(o=>o.value==='random'))options.unshift(new Option('随机已有武将','random'));
      select.replaceChildren(...options);select.value=options.some(o=>o.value===selected)?selected:'blank';
    }
  }
  $('setup-general-search').oninput=filterSetupGenerals;
  filterSetupGenerals();
  const linkedGeneral=new URLSearchParams(location.search).get('general');
  if(linkedGeneral&&ZhenGenerals[linkedGeneral]&&!ZhenGenerals[linkedGeneral].removed)$('general-select').value=linkedGeneral;
  $('skill-general-count').textContent=skillGeneralCount()+'名技能武将';
  loadSaved();chooseMode('team');soundBank.notify();
  if('serviceWorker' in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname)))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
