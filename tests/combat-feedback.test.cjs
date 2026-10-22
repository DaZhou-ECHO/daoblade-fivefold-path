const assert=require("node:assert/strict"),test=require("node:test");
const {createLayer}=require("../static/js/combat-feedback.js");
const event=(type,sequence,fields={})=>({type,sequence,battle_id:"battle-test",time:1,position:[100,150],target_id:"enemy-1",amount:12,...fields});

test("只有真实命中/防守有反馈，挥空与持续伤害不刷屏，同一事件不重复",()=>{
  const layer=createLayer();
  layer.push(event("slash_started",1));layer.push(event("enemy_hit",2,{periodic:true}));
  assert.equal(layer.items.length,0);
  layer.push(event("enemy_hit",3));layer.push(event("enemy_hit",3));
  layer.push(event("enemy_hit",4,{critical:true,amount:23.4}));
  assert.deepEqual(layer.items.map(item=>item.text),["12","暴击 23"]);
  assert.ok(layer.items[1].strong);assert.ok(Object.isFrozen(layer.items[0]));
});

test("格挡穿透伤害合并显示，完美格挡独立可辨，不混入下一次攻击",()=>{
  const layer=createLayer();
  layer.push(event("player_blocked",1,{target_id:"player"}));
  layer.push(event("player_hurt",2,{target_id:"player",amount:3}));
  assert.deepEqual(layer.items.map(item=>item.text),["格挡 -3"]);
  layer.push(event("player_hurt",3,{target_id:"player",amount:8,time:2}));
  layer.push(event("player_parried",4,{target_id:"player",time:3}));
  assert.deepEqual(layer.items.map(item=>item.text),["格挡 -3","-8","完美格挡"]);
});

test("数量与寿命有界，绘制不推进时间或制造新反馈，恢复Canvas状态",()=>{
  const layer=createLayer();
  for(let i=1;i<=40;i++)layer.push(event("enemy_hit",i));
  assert.equal(layer.items.length,24);
  const before=layer.items,ctx={depth:0,texts:[],save(){this.depth++;},restore(){this.depth--;},fillText(text){this.texts.push(text);},strokeText(){}};
  layer.draw(ctx);layer.draw(ctx);
  assert.deepEqual(layer.items,before);assert.equal(ctx.depth,0);assert.equal(ctx.texts.length,48);
  layer.update(-1);assert.deepEqual(layer.items,before);
  layer.update(.81);assert.equal(layer.items.length,0);
});

test("关闭不补播，清空后旧事件也不会重新出现",()=>{
  let enabled=false;const layer=createLayer({enabled:()=>enabled});
  layer.push(event("enemy_hit",1));enabled=true;layer.push(event("enemy_hit",1));
  assert.equal(layer.items.length,0);
  layer.push(event("enemy_hit",2));assert.equal(layer.items.length,1);
  layer.clear();layer.push(event("enemy_hit",2));assert.equal(layer.items.length,0);
});
