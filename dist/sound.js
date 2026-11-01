/* Original, offline sound design. The same PCM synthesis runs in browsers and Node. */
(function(root){
  'use strict';
  const cues={
    click:{label:'点选',duration:.12},select:{label:'选牌',duration:.18},target:{label:'指定目标',duration:.22},
    draw:{label:'摸牌',duration:.30},discard:{label:'弃牌',duration:.32},slash:{label:'挥刀',duration:.46},
    fireSlash:{label:'火杀',duration:.62},thunderSlash:{label:'雷杀',duration:.62},jink:{label:'闪避',duration:.44},
    trick:{label:'锦囊',duration:.56},duel:{label:'决斗',duration:.64},nullify:{label:'无懈可击',duration:.68},
    equip:{label:'装备',duration:.58},chain:{label:'铁索连环',duration:.56},wine:{label:'饮酒',duration:.48},
    heal:{label:'回复体力',duration:.82},damage:{label:'受到伤害',duration:.42},fireDamage:{label:'火焰伤害',duration:.72},
    thunderDamage:{label:'雷电伤害',duration:.92},judge:{label:'翻开判定牌',duration:.42},
    judgeGood:{label:'判定通过',duration:.48},judgeBad:{label:'判定生效',duration:.56},
    dying:{label:'濒死',duration:.86},death:{label:'阵亡',duration:1.04},turn:{label:'轮到你',duration:.48},
    prompt:{label:'等待你响应',duration:.28},start:{label:'开局',duration:1.10},win:{label:'胜利',duration:2.16},lose:{label:'落败',duration:1.65}
  };
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function synthesize(key,rate=24000,variant=0){
    if(!cues[key])throw new Error('Unknown sound cue: '+key);
    const out=new Float32Array(Math.ceil(cues[key].duration*rate));
    let seed=2166136261;
    for(const char of key)seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
    seed^=variant*7919;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
    const env=(t,d,attack=.006)=>Math.min(1,t/attack)*Math.exp(-5.5*t/d)*Math.min(1,Math.max(0,(d-t)/.015));
    const tone=(start,duration,from,to,amp,shape='sine',attack=.006)=>{
      let phase=0;
      const offset=Math.floor(start*rate),length=Math.min(Math.ceil(duration*rate),out.length-offset);
      for(let i=0;i<length;i++){
        const t=i/rate,f=from*Math.pow(to/from,t/duration);phase+=2*Math.PI*f/rate;
        const s=Math.sin(phase);
        const sample=shape==='triangle'?Math.asin(s)*2/Math.PI:shape==='soft'?Math.tanh(2.5*s)/Math.tanh(2.5):s;
        out[offset+i]+=sample*amp*env(t,duration,attack);
      }
    };
    const noise=(start,duration,amp,cutFrom,cutTo,high=false,attack=.008)=>{
      const offset=Math.floor(start*rate),length=Math.min(Math.ceil(duration*rate),out.length-offset);
      let low=0;
      for(let i=0;i<length;i++){
        const t=i/rate,white=random()*2-1,cut=cutFrom*Math.pow(cutTo/cutFrom,t/duration);
        const a=1-Math.exp(-2*Math.PI*cut/rate);low+=a*(white-low);
        out[offset+i]+=(high?white-low:low)*amp*env(t,duration,attack);
      }
    };
    const bell=(start,duration,f,amp)=>{for(const [ratio,gain,decay]of[[1,1,1],[2.76,.34,.72],[4.12,.14,.42]])tone(start,duration*decay,f*ratio,f*ratio,amp*gain);};
    const drum=(start,duration,f,amp)=>{tone(start,duration,f*1.8,f*.5,amp,'sine',.002);noise(start,duration*.55,amp*.40,1400,180);};
    const paper=(start=.0,amp=.18)=>{noise(start,.14,amp,3800,700,true,.013);noise(start+.05,.13,amp*.55,1200,400,false,.009);};
    const swipe=(start=0,amp=.24)=>{noise(start,.26,amp,2100,500,true,.032);tone(start+.035,.30,430,90,amp*.26,'triangle',.015);};
    const chime=(start,f,d=.38,a=.10)=>{tone(start,d,f,f,a,'sine',.009);tone(start,d*.7,f*2,f*2,a*.16,'sine',.01);};
    switch(key){
      case'click':drum(0,.10,420,.10);break;
      case'select':paper(0,.10);tone(.02,.13,720,980,.055,'triangle');break;
      case'target':drum(0,.15,240,.10);chime(.025,740,.17,.04);break;
      case'draw':paper(0,.16);paper(.12,.12);break;
      case'discard':paper(0,.17);drum(.08,.20,260,.09);break;
      case'slash':swipe();noise(.12,.15,.20,2300,340);bell(.13,.29,720,.12);break;
      case'fireSlash':swipe(0,.20);noise(.09,.50,.40,1800,190,false,.023);tone(.10,.40,130,63,.12,'soft');break;
      case'thunderSlash':swipe(0,.16);noise(.09,.32,.34,4000,800,true,.002);drum(.12,.43,92,.19);bell(.08,.30,1100,.04);break;
      case'jink':swipe(0,.12);bell(.015,.40,1200,.12);bell(.09,.26,1620,.05);break;
      case'trick':paper(0,.10);chime(.08,587,.40,.12);chime(.16,880,.37,.06);break;
      case'duel':drum(0,.38,145,.22);drum(.18,.42,190,.19);bell(.10,.35,440,.045);break;
      case'nullify':chime(0,1174,.40,.10);chime(.11,880,.44,.11);chime(.23,587,.40,.09);noise(0,.28,.06,2100,900,true,.05);break;
      case'equip':bell(0,.48,960,.12);bell(.09,.45,510,.10);drum(.04,.19,260,.09);break;
      case'chain':for(let i=0;i<4;i++){bell(i*.09,.23,820+i*190,.075);noise(i*.09,.08,.10,2300,650,true);}break;
      case'wine':tone(0,.18,360,210,.08,'triangle',.035);tone(.12,.22,300,160,.07,'triangle',.025);chime(.25,660,.20,.055);break;
      case'heal':chime(0,587,.53,.10);chime(.13,740,.53,.10);chime(.26,988,.52,.08);tone(.05,.62,294,294,.05,'sine',.05);break;
      case'damage':drum(0,.37,85,.27);noise(.015,.21,.23,1900,180);break;
      case'fireDamage':drum(0,.48,78,.21);noise(.01,.66,.46,2100,180,false,.004);noise(.09,.26,.10,3400,900,true);break;
      case'thunderDamage':noise(0,.16,.46,5500,700,true,.001);drum(.025,.78,61,.33);noise(.07,.80,.35,420,80);noise(.16,.55,.08,1200,160);break;
      case'judge':paper(0,.21);drum(.08,.23,410,.13);bell(.13,.22,1050,.045);break;
      case'judgeGood':chime(0,740,.37,.10);chime(.105,988,.34,.11);break;
      case'judgeBad':bell(0,.49,310,.16);drum(.08,.40,100,.14);break;
      case'dying':drum(0,.25,58,.24);drum(.18,.25,64,.18);drum(.53,.26,58,.20);break;
      case'death':bell(0,.86,190,.17);tone(.04,.96,110,48,.13);noise(.06,.55,.15,420,80);break;
      case'turn':drum(0,.20,250,.09);chime(.07,740,.32,.09);chime(.18,988,.27,.075);break;
      case'prompt':chime(0,880,.20,.055);chime(.09,1174,.18,.047);break;
      case'start':drum(0,.42,105,.16);drum(.23,.39,160,.14);chime(.30,587,.55,.10);chime(.50,880,.55,.10);break;
      case'win':{
        const notes=[587,740,880,988,1174,1480];
        notes.forEach((f,i)=>chime(.08+i*.18,f,.86,i===5?.14:.10));
        drum(0,.62,120,.14);tone(.8,1.25,294,294,.045,'sine',.08);break;
      }
      case'lose':chime(0,440,.85,.10);chime(.20,370,.86,.09);chime(.43,294,1.08,.10);bell(.09,1.35,147,.09);break;
    }
    // Small early reflections soften the generated sounds without fetching an impulse file.
    if(!['click','select','draw','discard'].includes(key)){
      const shift=Math.round(rate*.053);
      for(let i=out.length-1;i>=shift;i--)out[i]+=out[i-shift]*.12;
    }
    let peak=0;
    for(const sample of out)peak=Math.max(peak,Math.abs(sample));
    const scale=peak>.72?.72/peak:1,fade=Math.min(120,Math.floor(out.length/4));
    for(let i=0;i<out.length;i++)out[i]*=scale*Math.min(1,i/fade,(out.length-1-i)/fade);
    return out;
  }
  function cueForEvent(event){
    switch(event.type){
      case'card':
        if(event.recast)return'discard';
        return({slash:'slash',fireSlash:'fireSlash',thunderSlash:'thunderSlash',jink:'jink',peach:'select',duel:'duel',nullify:'nullify',chain:'chain',wine:'wine',fireAttack:'fireSlash',borrow:'trick'}[event.cardKey])||(event.kind==='equip'?'equip':'trick');
      case'response':return event.cardKey==='nullify'?'nullify':event.cardKey==='jink'?'jink':'slash';
      case'damage':return event.nature==='fire'?'fireDamage':event.nature==='thunder'?'thunderDamage':'damage';
      case'judgmentResult':return event.harmful?'judgeBad':'judgeGood';
      case'result':return event.won?'win':'lose';
      case'turn':return event.personal?'turn':null;
      case'prompt':return event.promptKind==='play'?null:'prompt';
      default:return cues[event.type]?event.type:null;
    }
  }
  class AudioBank{
    constructor(options={}){
      this.enabled=true;this.volume=.35;this.context=null;this.master=null;this.buffers=new Map();this.sources=new Set();this.played=0;this.lastCue=null;this.state='waiting';this.onchange=options.onchange||(()=>{});
      try{this.storage=options.storage===undefined?root.localStorage:options.storage;}catch{this.storage=null;}
      this.factory=options.contextFactory||(()=>{const Factory=root.AudioContext||root.webkitAudioContext;return Factory?new Factory({latencyHint:'interactive'}):null;});
      this.storageKey='zhenlue.sound.v1';
      try{const data=JSON.parse(this.storage?.getItem(this.storageKey));if(data?.version===1){if(typeof data.enabled==='boolean')this.enabled=data.enabled;if(Number.isFinite(data.volume))this.volume=clamp(data.volume,0,1);}}catch{}
    }
    notify(){this.onchange({enabled:this.enabled,volume:this.volume,state:this.state,lastCue:this.lastCue,played:this.played});}
    save(){try{this.storage?.setItem(this.storageKey,JSON.stringify({version:1,enabled:this.enabled,volume:this.volume}));}catch{}}
    setEnabled(enabled){this.enabled=!!enabled;this.applyVolume();if(!enabled)this.stopAll();this.save();this.notify();}
    setVolume(value){if(Number.isFinite(value))this.volume=clamp(value,0,1);this.applyVolume();this.save();this.notify();}
    applyVolume(){if(this.master&&this.context){const t=this.context.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setTargetAtTime(this.enabled?this.volume:0,t,.018);}}
    async unlock(){
      if(this.unlocking)return this.unlocking;
      this.unlocking=(async()=>{
        try{
          if(!this.context){
            this.context=this.factory();
            if(!this.context){this.state='unavailable';this.notify();return false;}
            this.master=this.context.createGain();
            const limiter=this.context.createDynamicsCompressor();
            limiter.threshold.value=-12;limiter.knee.value=10;limiter.ratio.value=5;limiter.attack.value=.004;limiter.release.value=.16;
            this.master.connect(limiter);limiter.connect(this.context.destination);this.limiter=limiter;
            this.master.gain.value=this.enabled?this.volume:0;
            this.context.onstatechange=()=>{this.state=this.context.state==='running'?'ready':'waiting';this.notify();};
          }
          if(this.context.state==='suspended')await this.context.resume();
          this.state=this.context.state==='running'?'ready':'waiting';this.notify();return this.state==='ready';
        }catch{this.state='unavailable';this.notify();return false;}
      })();
      try{return await this.unlocking;}finally{this.unlocking=null;}
    }
    play(key,options={}){
      if(!cues[key]||!this.enabled||this.volume<=0)return false;
      if(this.context?.state!=='running'){
        if(this.unlocking)this.unlocking.then(ok=>{if(ok)this.play(key,options);});
        return false;
      }
      try{
        // Bound simultaneous voices, including rapid AI and group-card responses.
        if(this.sources.size>=16){const oldest=this.sources.values().next().value;try{oldest.stop();}catch{}this.sources.delete(oldest);}
        let buffer=this.buffers.get(key);
        if(!buffer){const pcm=synthesize(key);buffer=this.context.createBuffer(1,pcm.length,24000);buffer.getChannelData(0).set(pcm);this.buffers.set(key,buffer);}
        const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;gain.gain.value=clamp(options.level??1,.1,1.3);source.connect(gain);
        let pan=null;
        if(this.context.createStereoPanner){pan=this.context.createStereoPanner();pan.pan.value=clamp(options.pan||0,-.5,.5);gain.connect(pan);pan.connect(this.master);}else gain.connect(this.master);
        this.sources.add(source);
        source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();pan?.disconnect();};
        source.start(this.context.currentTime+.006);
        this.lastCue=key;this.played++;this.notify();return true;
      }catch{this.state='unavailable';this.notify();return false;}
    }
    stopAll(){for(const source of this.sources){try{source.stop();}catch{}}this.sources.clear();}
  }
  const api={cues,synthesize,cueForEvent,AudioBank};root.ZhenSound=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
