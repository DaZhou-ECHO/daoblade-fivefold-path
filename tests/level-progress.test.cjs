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
  assert.equal(objective("wood", 120, enemies), null);
});
