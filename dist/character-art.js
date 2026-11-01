(function(root){
  'use strict';
  const art={
  "shensunce": "art/shensunce.jpg",
  "guanyu": "art/guanyu.jpg",
  "zhangfei": "art/zhangfei.jpg",
  "machao": "art/machao.jpg",
  "shiweiyan": "art/shiweiyan.jpg",
  "shizhouyu": "art/shizhouyu.jpg",
  "feiyi": "art/feiyi.jpg",
  "mouzhangrang": "art/mouzhangrang.jpg",
  "wolongfengchu": "art/wolongfengchu.jpg",
  "caomao": "art/caomao.jpg",
  "molvbu": "art/molvbu.jpg",
  "jiexunyu": "art/jiexunyu.jpg",
  "jiesunquan": "art/jiesunquan.jpg",
  "lusu": "art/lusu.jpg",
  "lvmeng": "art/lvmeng.jpg",
  "jiezhoutai": "art/jiezhoutai.jpg",
  "jiehuanggai": "art/jiehuanggai.jpg",
  "jieguojia": "art/jieguojia.jpg",
  "jiezhaoyun": "art/jiezhaoyun.jpg",
  "liubei": "art/liubei.jpg",
  "chengong": "art/chengong.jpg",
  "caoren": "art/caoren.jpg",
  "caopi": "art/caopi.jpg",
  "zhangliao": "art/zhangliao.jpg",
  "simayi": "art/simayi.jpg",
  "caocao": "art/caocao.jpg",
  "liuxie": "art/liuxie.jpg",
  "liru": "art/liru.jpg",
  "dongzhuo": "art/dongzhuo.jpg",
  "caiyong": "art/caiyong.jpg",
  "diaochan": "art/diaochan.jpg",
  "jiaxu": "art/jiaxu.jpg",
  "yuanshao": "art/yuanshao.jpg",
  "zhangjiao": "art/zhangjiao.jpg",
  "liushan": "art/liushan.jpg",
  "ganning": "art/ganning.jpg",
  "luxun": "art/luxun.jpg",
  "sunjian": "art/sunjian.jpg",
  "xuchu": "art/xuchu.jpg"
};
  root.ZhenGeneralArt={
    url(id){return art[id]||'';},
    style(id){const src=art[id];return src?`style="--general-art:url('${src}')"`:'';},
    attribution:'本项目独立绘制的武将立绘'
  };
})(typeof window!=='undefined'?window:globalThis);
