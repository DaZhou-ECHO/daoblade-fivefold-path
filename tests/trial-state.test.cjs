const test = require("node:test"), assert = require("node:assert/strict");
const trials = require("../static/js/trial-state.js");
const rules = require("../static/js/rules.js").createRuntime(require("../static/data/rules/legacy-v1.json"));

test("015 序列化只保存检查点与原构筑，JSON重载后战斗属性不漂移", () => {
  const state = rules.defaultState();
  state.cultivation.li[0] = { id: "fixed", name: "试炼珠", element: "fire", quality: 1, level: 2, xp: 0, affixes: [] };
  const trial = trials.create(state, rules);
  assert.equal(trials.encode(trial), null);
  trial.activated = true; trial.claimedAltars.add("altar-2");
  const raw = JSON.parse(JSON.stringify(trials.encode(trial)));
  assert.equal(raw.stats, undefined); assert.equal(raw.build.active_trial, undefined);
  state.cultivation.li[0].level = 8;
  const restored = trials.restore(raw, rules);
  assert.equal(restored.id, trial.id);
  assert.deepEqual(restored.snapshot.stats, trial.snapshot.stats);
  assert.deepEqual([...restored.claimedAltars], ["altar-2"]);
  assert.equal(Object.isFrozen(restored.build.cultivation.li[0]), true);
  raw.build.cultivation.li[0].level = 7;
  assert.equal(restored.build.cultivation.li[0].level, 2);
  restored.settled = true; assert.equal(trials.encode(restored), null);
});

test("015 不支持或损坏记录拒绝，禁止重解释成新试炼", () => {
  const trial = trials.create(rules.defaultState(), rules); trial.activated = true;
  for (const patch of [{ version: 2 }, { ruleset_id: "next" }, { realm_id: "wood" },
    { checkpoint_id: "missing" }, { claimed_altars: ["altar-1", "altar-1"] }, { build: { active_trial: {} } }]) {
    assert.throws(() => trials.restore({ ...trials.encode(trial), ...patch }, rules));
  }
});
