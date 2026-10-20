const assert=require("node:assert/strict");
const test=require("node:test");
const {createPlayer}=require("../static/js/battle-audio.js");

function audioContext() {
  const context={currentTime:0,state:"running",destination:{},oscillators:[],gains:[],resumes:0,
    resume(){this.resumes++;return Promise.resolve();},close(){this.state="closed";return Promise.resolve();}};
  const parameter=()=>({values:[],setValueAtTime(...args){this.values.push(args);},exponentialRampToValueAtTime(...args){this.values.push(args);}});
  context.createGain=()=>{const gain={gain:parameter(),connect(){},disconnect(){this.disconnected=true;}};context.gains.push(gain);return gain;};
  context.createOscillator=()=>{
    const osc={frequency:parameter(),stops:[],connect(){},disconnect(){this.disconnected=true;},start(time){this.started=time;},
      stop(time){this.stops.push(time);if(time===undefined)this.onended?.();}};
    context.oscillators.push(osc);return osc;
  };
  return context;
}
const event=(type,sequence=1,battle_id="test-battle")=>({type,sequence,battle_id,id:`${battle_id}:${sequence}`});

test("五类战斗音色短促有别，无声音资源和DOM依赖",()=>{
  const cases=[["slash_started","triangle",340],["enemy_hit","square",180],
    ["player_blocked","triangle",260],["player_parried","triangle",740],["player_hurt","sawtooth",115]];
  for(const [type,wave,frequency] of cases){
    const context=audioContext(),audio=createPlayer({createContext:()=>context});
    assert.equal(audio.play(event(type)),true);
    const osc=context.oscillators[0];
    assert.equal(osc.type,wave);assert.equal(osc.frequency.values[0][0],frequency);
    assert.ok(osc.stops[0]>.04&&osc.stops[0]<=.1);
    osc.onended();assert.equal(audio.status.active_voices,0);
    assert.equal(context.gains[0].disconnected,true);
  }
});

test("事件去重、同类限频、持续伤害和未知类型不制造重复声音",()=>{
  const context=audioContext(),audio=createPlayer({createContext:()=>context});
  assert.equal(audio.play(event("enemy_hit",1)),true);
  assert.equal(audio.play(event("enemy_hit",1)),false);
  context.currentTime=.01;assert.equal(audio.play(event("enemy_hit",2)),false);
  context.currentTime=.1;assert.equal(audio.play(event("enemy_hit",3)),true);
  assert.equal(audio.play({...event("enemy_hit",4),periodic:true}),false);
  assert.equal(audio.play(event("toString",5)),false);
  assert.equal(context.oscillators.length,2);
});

test("最多4声并发，完美格挡优先于挥空，停止会取消排程并断开节点",()=>{
  const context=audioContext(),audio=createPlayer({createContext:()=>context});
  ["slash_started","enemy_hit","player_blocked","player_hurt"].forEach((type,i)=>audio.play(event(type,i+1)));
  assert.equal(audio.status.active_voices,4);
  assert.equal(audio.play(event("player_parried",5)),true);
  assert.equal(audio.status.active_voices,4);
  assert.equal(context.oscillators[0].stops.at(-1),undefined);
  audio.stop();assert.equal(audio.status.active_voices,0);
  assert.ok(context.oscillators.every(osc=>osc.disconnected));
  assert.ok(context.gains.every(gain=>gain.disconnected));
});

test("静音不创建上下文且不补播旧事件；结束释放资源、历史有界",()=>{
  let enabled=false,created=0;const context=audioContext();
  const audio=createPlayer({createContext:()=>{created++;return context;},enabled:()=>enabled});
  assert.equal(audio.play(event("enemy_hit",1)),false);assert.equal(created,0);
  enabled=true;
  assert.equal(audio.play(event("enemy_hit",1)),false);
  assert.equal(audio.play(event("enemy_hit",2)),true);
  for(let i=0;i<40;i++)audio.play(event("enemy_hit",1,`battle-${i}`));
  assert.equal(audio.status.remembered_battles,16);
  audio.dispose();assert.equal(audio.status.active_voices,0);assert.equal(context.state,"closed");
  assert.equal(audio.play(event("player_parried",99)),false);
});

test("浏览器禁音、恢复拒绝或节点创建失败不会抛入战斗主链",async()=>{
  const unavailable=createPlayer({createContext:()=>{throw new Error("audio disabled");}});
  assert.equal(unavailable.play(event("enemy_hit")),false);
  const context=audioContext();context.state="suspended";
  context.resume=()=>Promise.reject(new Error("gesture required"));
  const audio=createPlayer({createContext:()=>context});
  assert.equal(audio.play(event("player_parried")),false);
  assert.equal(context.oscillators.length,0,"音频时钟暂停时不能排程旧声音");
  await Promise.resolve();
  context.state="running";
  assert.equal(audio.play(event("player_parried",1)),false,"恢复后不能补播已经消费的事件");
  assert.equal(audio.play(event("player_parried",2)),true);
  audio.stop();
  const broken=audioContext();broken.createGain=()=>{throw new Error("node failure");};
  const bad=createPlayer({createContext:()=>broken});
  assert.equal(bad.play(event("enemy_hit")),false);
  assert.equal(bad.status.active_voices,0);assert.equal(broken.oscillators[0].disconnected,true);
});
