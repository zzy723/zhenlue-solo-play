/* Card data and descriptions. No artwork or game code from the official client. */
(function (root) {
  'use strict';
  const defs = {};
  const define = (key, name, kind, text, extra = {}) => defs[key] = { key, name, kind, text, ...extra };
  define('slash', '杀', 'basic', '出牌阶段，对攻击范围内的一名其他角色使用，令其使用一张闪，否则受到1点普通伤害。每个出牌阶段通常限用一次。', { nature: 'normal' });
  define('fireSlash', '火杀', 'basic', '与杀相同，造成火焰伤害。火焰伤害会沿铁索传导，藤甲受到的火焰伤害+1。', { nature: 'fire' });
  define('thunderSlash', '雷杀', 'basic', '与杀相同，造成雷电伤害。雷电伤害会沿铁索传导。', { nature: 'thunder' });
  define('jink', '闪', 'basic', '响应杀时使用，响应万箭齐发时打出，抵消其效果。不能在出牌阶段主动使用。');
  define('peach', '桃', 'basic', '出牌阶段对自己使用，回复1点体力；有角色濒死时，可以使用桃救援。');
  define('wine', '酒', 'basic', '出牌阶段对自己使用，本回合下一张杀的伤害+1，每回合限一次；自己濒死时可以使用酒回复1点体力，救命不占用出牌次数。');
  define('duel', '决斗', 'trick', '对一名其他角色使用，从对方开始轮流打出杀，首先不出杀的一方受到另一方造成的1点普通伤害。');
  define('draw2', '无中生有', 'trick', '对自己使用，摸两张牌。');
  define('steal', '顺手牵羊', 'trick', '对距离1以内、有牌的一名其他角色使用，获得其手牌、装备区或判定区的一张牌。手牌不能预先查看。');
  define('dismantle', '过河拆桥', 'trick', '对有牌的一名其他角色使用，弃置其手牌、装备区或判定区的一张牌。手牌不能预先查看。');
  define('barbarian', '南蛮入侵', 'trick', '依次对所有其他角色结算。各角色须打出一张杀，否则受到使用者造成的1点普通伤害。');
  define('arrows', '万箭齐发', 'trick', '依次对所有其他角色结算。各角色须打出一张闪，否则受到使用者造成的1点普通伤害。');
  define('harvest', '五谷丰登', 'trick', '亮出等同于存活角色数的牌，从当前回合角色开始，各角色依次选择并获得一张。');
  define('healAll', '桃园结义', 'trick', '依次令所有受伤的存活角色回复1点体力。');
  define('borrow', '借刀杀人', 'trick', '指定一名持有武器的其他角色及其攻击范围内的另一名角色。前者须对后者使用杀，否则你获得前者的武器。');
  define('nullify', '无懈可击', 'trick', '一张锦囊对一个目标生效前，抵消该效果；也可以抵消另一张无懈可击。群体锦囊逐个目标结算。');
  define('fireAttack', '火攻', 'trick', '对有手牌的一名角色使用。其展示一张手牌，你可以弃置一张同花色手牌，对其造成1点火焰伤害。可以选择自己。');
  define('chain', '铁索连环', 'trick', '选择一至两名角色，分别横置或重置。横置角色受到属性伤害后，其他横置角色依次受到同源、同数值、同属性的伤害并重置。也可以不选目标，重铸摸一张牌。');
  define('indulgence', '乐不思蜀', 'delay', '置于其他角色判定区。其判定阶段：若结果不为红桃，跳过本回合出牌阶段。');
  define('shortage', '兵粮寸断', 'delay', '置于距离1以内的其他角色判定区。其判定阶段：若结果不为梅花，跳过本回合摸牌阶段。');
  define('lightning', '闪电', 'delay', '置于自己判定区。判定结果为黑桃2—9时，受到3点雷电伤害，否则移至下一个没有闪电的存活角色判定区。');
  const weapon = (key, name, range, text) => define(key, name, 'equip', text, { slot: 'weapon', range });
  weapon('crossbow', '诸葛连弩', 1, '攻击范围1。出牌阶段使用杀没有次数限制。');
  weapon('doubleSword', '雌雄双股剑', 2, '攻击范围2。杀指定异性目标后，可以令其选择弃置一张手牌，或让你摸一张牌。');
  weapon('qinggang', '青釭剑', 2, '攻击范围2。你使用杀时，无视目标的防具。');
  weapon('blade', '青龙偃月刀', 3, '攻击范围3。杀被闪抵消后，可以继续对该目标使用杀，不计出牌阶段杀的次数。');
  weapon('spear', '丈八蛇矛', 3, '攻击范围3。可以将两张手牌当普通杀使用或打出。两张均红视为红杀，均黑视为黑杀，否则无色。');
  weapon('axe', '贯石斧', 3, '攻击范围3。杀被闪抵消时，可以弃置除贯石斧外的两张牌，令该杀仍然造成伤害。');
  weapon('halberd', '方天画戟', 4, '攻击范围4。使用的杀是最后一张手牌时，可以指定至多三名目标。');
  weapon('bow', '麒麟弓', 5, '攻击范围5。杀造成伤害时，可以弃置目标的一张坐骑。');
  weapon('iceSword', '寒冰剑', 2, '攻击范围2。杀将造成伤害时，若目标有手牌或装备，可以防止伤害，改为依次弃置其至多两张手牌或装备。');
  weapon('guding', '古锭刀', 2, '攻击范围2。杀对没有手牌的目标造成的伤害+1。');
  weapon('fan', '朱雀羽扇', 4, '攻击范围4。使用普通杀时，可以将其改为火杀。');
  define('eightDiagram', '八卦阵', 'equip', '需要使用或打出闪时，可以判定：若为红色，视为闪；否则仍可从手牌响应。', { slot: 'armor' });
  define('renwang', '仁王盾', 'equip', '黑色杀对你无效。青釭剑可以无视此防具。', { slot: 'armor' });
  define('vine', '藤甲', 'equip', '普通杀、南蛮入侵和万箭齐发对你无效；受到的火焰伤害+1。青釭剑的杀无视此防具。', { slot: 'armor' });
  define('lion', '白银狮子', 'equip', '每次受到的伤害最多为1；此装备离开装备区时，若你受伤则回复1点体力。青釭剑的杀无视此防具。', { slot: 'armor' });
  for (const [key, name, slot] of [['jueying','绝影','plusHorse'],['dilu','的卢','plusHorse'],['feidian','爪黄飞电','plusHorse'],['hualiu','骅骝','plusHorse'],['chitu','赤兔','minusHorse'],['dayuan','大宛','minusHorse'],['zixing','紫骍','minusHorse']]) {
    define(key, name, 'equip', slot === 'plusHorse' ? '防御坐骑。其他角色计算与你的距离时+1。' : '进攻坐骑。你计算与其他角色的距离时−1，最小为1。', { slot });
  }
  const rows = [
    ['slash','S','7 8 8 9 9 10 10'], ['slash','C','2 3 4 5 6 7 8 8 9 9 10 10 11 11'], ['slash','H','10 10 11'], ['slash','D','6 7 8 9 10 13'],
    ['jink','H','2 2 13'], ['jink','D','2 2 3 4 5 6 7 8 9 10 11 11'], ['peach','H','3 4 6 7 8 9 12'], ['peach','D','12'],
    ['crossbow','C','1'],['crossbow','D','1'],['doubleSword','S','2'],['qinggang','S','6'],['blade','S','5'],['spear','S','12'],['axe','D','5'],['halberd','D','12'],['bow','H','5'],
    ['eightDiagram','S','2'],['eightDiagram','C','2'],['jueying','S','5'],['dilu','C','5'],['feidian','H','13'],['chitu','H','5'],['dayuan','S','13'],['zixing','D','13'],
    ['harvest','H','3 4'],['healAll','H','1'],['barbarian','S','7 13'],['barbarian','C','7'],['arrows','H','1'],['duel','S','1'],['duel','C','1'],['duel','D','1'],
    ['draw2','H','7 8 9 11'],['steal','S','3 4 11'],['steal','D','3 4'],['dismantle','S','3 4 12'],['dismantle','C','3 4'],['dismantle','H','12'],['borrow','C','12 13'],
    ['nullify','S','11'],['nullify','C','12 13'],['indulgence','S','6'],['indulgence','C','6'],['indulgence','H','6'],['lightning','S','1'],
    ['iceSword','S','2'],['renwang','C','2'],['lightning','H','12'],['nullify','D','12']
  ];
  const extra = [
    ['guding','S','1'],['vine','S','2'],['wine','S','3 9'],['thunderSlash','S','4 5 6 7 8'],['shortage','S','10'],['chain','S','11 12'],['nullify','S','13'],
    ['lion','C','1'],['vine','C','2'],['wine','C','3 9'],['shortage','C','4'],['thunderSlash','C','5 6 7 8'],['chain','C','10 11 12 13'],
    ['nullify','H','1 13'],['fireAttack','H','2 3'],['fireSlash','H','4 7 10'],['peach','H','5 6'],['jink','H','8 9 11 12'],
    ['fan','D','1'],['peach','D','2 3'],['fireSlash','D','4 5'],['jink','D','6 7 8 10 11'],['wine','D','9'],['fireAttack','D','12'],['hualiu','D','13']
  ];
  function makeDeck(military = true, noLightning = false) {
    const cards = [];
    for (const [pack, list] of [['standard',rows], ...(military ? [['military',extra]] : [])]) {
      for (const [key, suit, ranks] of list) for (const rank of ranks.split(' ').map(Number)) {
        if (noLightning && key === 'lightning') continue;
        cards.push({ ...defs[key], id: 'c' + cards.length, suit, rank, pack });
      }
    }
    return cards;
  }
  const isSlash = c => c && ['slash','fireSlash','thunderSlash'].includes(c.key);
  const isRed = c => c && ['H','D'].includes(c.suit);
  const suitMark = { S:'♠', H:'♥', C:'♣', D:'♦', N:'·' };
  const rankMark = n => ({ 1:'A', 11:'J', 12:'Q', 13:'K' }[n] || n);
  const api = { defs, makeDeck, isSlash, isRed, suitMark, rankMark };
  root.ZhenCards = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
