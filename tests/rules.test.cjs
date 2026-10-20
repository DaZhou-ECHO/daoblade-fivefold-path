"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRuntime } = require("../static/js/rules.js");
const config = require("../static/data/rules/legacy-v1.json");
const cases = require("./fixtures/legacy-rule-cases.json");

for (const fixture of cases.valid_cases) {
  test(`共享基线样例 ${fixture.id}：五行/配装/完整数值与提取前相同`, () => {
    const rules = createRuntime(config);
    const before = structuredClone(fixture.state);
    assert.deepEqual(rules.elementTotals(fixture.state), fixture.expected.totals);
    assert.deepEqual(rules.primarySecondary(fixture.state), fixture.expected.primary_secondary);
    assert.deepEqual(rules.calculateStats(fixture.state), fixture.expected.stats);
    assert.deepEqual(fixture.state, before);
  });
}
for (const fixture of cases.invalid_cases) {
  test(`共享非法配装 ${fixture.id}：拒绝创建战斗快照`, () => {
    assert.throws(() => createRuntime(config).createCombatSnapshot(fixture.state), new RegExp(fixture.error));
  });
}
test("配置/默认存档/战斗快照均不引用调用方可变数据", () => {
  const input = structuredClone(config);
  const rules = createRuntime(input);
  input.elements.fire.color = "changed";
  assert.equal(rules.config.elements.fire.color, config.elements.fire.color);
  const state = structuredClone(cases.valid_cases.find(item => item.id === "equipped").state);
  const snapshot = rules.createCombatSnapshot(state);
  state.loadout.active[0] = null;
  state.cultivation.qian[0].level = 99;
  state.cultivation.qian[0].affixes.push({ key: "attack", label: "test", value: 50 });
  assert.equal(snapshot.stats.loadout.active[0], "qian");
  assert.equal(snapshot.progression.nodes["legacy:qian:1"].bead.level, 3);
  assert.equal(snapshot.stats.affixes.attack, undefined);
  assert.throws(() => { snapshot.stats.loadout.active[0] = "li"; }, TypeError);
  assert.throws(() => { snapshot.progression.nodes["legacy:qian:1"].bead.level = 7; }, TypeError);
  const fresh = rules.defaultState(); fresh.loadout.active[0] = "li";
  assert.equal(rules.defaultState().loadout.active[0], null);
});
test("快照明确标记旧适配器，未把全局旧元素伪装成新阵盘独立元素", () => {
  const snapshot = createRuntime(config).createCombatSnapshot(cases.valid_cases[1].state);
  assert.equal(snapshot.ruleset_id, "legacy-v1");
  assert.equal(snapshot.skills[0].element_source, "legacy-global-primary");
  assert.equal(snapshot.skills[0].element, snapshot.stats.primary);
  assert.equal(snapshot.appearance.mode, "legacy-global-primary");
  assert.equal(Object.keys(snapshot.progression.nodes).length, 24);
});
test("错误规则集/结构/规则版本失败，不自动降级旧规则", () => {
  const rules = createRuntime(config);
  for (const [key, value] of [["version", true], ["version", 2], ["ruleset_id", "bagua-test-v1"],
    ["ruleset_id", null], ["schema_version", true], ["schema_version", 2], ["rules_version", 2], ["rules_version", true]]) {
    assert.throws(() => rules.createCombatSnapshot({ ...rules.defaultState(), [key]: value }), /版本|规则集/);
  }
  assert.throws(() => createRuntime({ ...config, ruleset_id: "unknown" }), /版本/);
});

test("服务端JSON按字母重排键后，元素/卦路展示和默认状态顺序不变", () => {
  const sortKeys = value => Array.isArray(value) ? value.map(sortKeys)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])])) : value;
  const rules = createRuntime(sortKeys(config));
  assert.deepEqual(Object.keys(rules.config.elements), config.element_order);
  assert.deepEqual(Object.keys(rules.config.trigrams), config.trigram_order);
  assert.deepEqual(Object.keys(rules.defaultState().cultivation), config.trigram_order);
  assert.deepEqual(rules.defaultState(), config.default_state);
});
