const test = require("node:test"), assert = require("node:assert/strict");
const { objective } = require("../static/js/level-progress.js");
const roster = () => Array.from({ length: 6 }, (_, i) => ({ id: `enemy-${i + 1}`, kind: i === 5 ? "boss" : "melee", dead: false }));
test("火境目标依据稳定敌人ID，绕过守卫不跳过教学清场", () => {
  const enemies = roster();
  assert.match(objective("fire", 120, enemies), /入境/);
  assert.match(objective("fire", 2900, enemies), /0\/3/);
  enemies[0].dead = true;
  assert.match(objective("fire", 120, enemies), /1\/3/);
  enemies[1].dead = enemies[2].dead = true;
  assert.match(objective("fire", 1600, enemies), /综合段.*0\/2/);
  enemies[3].dead = enemies[4].dead = true;
  assert.match(objective("fire", 2800, enemies), /首领/);
  enemies[5].dead = true;
  assert.match(objective("fire", 2800, enemies), /等待结算/);
});
test("目标投影不修改敌人且其他秘境保持原提示", () => {
  const enemies = roster(); const before = JSON.stringify(enemies);
  objective("fire", 120, enemies);
  assert.equal(JSON.stringify(enemies), before);
  assert.equal(objective("water", 120, enemies), null);
});

test("021 木境目标从入境到药王，不继承火焰提示",()=>{
  const enemies=Array.from({length:6},(_,i)=>({id:`enemy-${i+1}`,kind:i===5?"boss":"melee",dead:false}));
  assert.match(objective("wood",120,enemies),/入境/);enemies.slice(0,3).forEach(e=>{e.dead=true;});
  assert.match(objective("wood",1640,enemies),/高台/);enemies.slice(3,5).forEach(e=>{e.dead=true;});
  assert.match(objective("wood",2700,enemies),/青木药王/);enemies[5].dead=true;assert.match(objective("wood",2700,enemies),/木境已肃清/);
});
