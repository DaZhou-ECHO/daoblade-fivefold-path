const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { createActionState, selectAction } = require("../static/js/action-state.js");

const player = values => ({ x: 120, y: 404, w: 38, h: 70, face: 1, hp: 97,
  onGround: true, vx: 0, vy: 0, animTime: 0, ...values });

test("动作视图只包含独立冻结数据，不泄漏实体/冷却/HP且后续实体变化不污染旧视图", () => {
  const source = player({ slash: .14, slashDuration: .28, combo: 2, inventory: [] });
  const before = structuredClone(source), state = createActionState(source);
  assert.deepEqual(source, before);
  assert.equal(state.action_id, "slash");
  assert.equal(state.phase, "active");
  assert.equal(state.progress, .5);
  assert.deepEqual(state.anchor.foot, [139, 474]);
  for (const key of ["player", "hp", "slash", "slashDuration", "inventory", "x", "y"])
    assert.equal(key in state, false);
  for (const value of [state, state.anchor, state.anchor.foot, state.motion, state.feedback])
    assert.equal(Object.isFrozen(value), true);
  source.x = 999; source.slash = 0; source.hp = 0;
  assert.equal(state.action_id, "slash");
  assert.equal(state.progress, .5);
  assert.deepEqual(state.anchor.foot, [139, 474]);
});

test("动作优先级和三段剑有效窗口沿用现有判定，不创建第二个战斗时钟", () => {
  const states = [
    [{ hp: 0, hurt: .1, slash: .2 }, "death"], [{ hurt: .1, dash: .1 }, "hurt"],
    [{ dash: .1, slash: .1 }, "dash"], [{ slash: .1, blocking: true }, "slash"],
    [{ blocking: true, qiCast: .1 }, "block"], [{ qiCast: .1, onGround: false }, "qi"],
    [{ onGround: false, vy: -1 }, "jump"], [{ onGround: false, vy: 0 }, "fall"],
    [{ vx: 36 }, "run"], [{ vx: 35 }, "idle"],
  ];
  for (const [fields, id] of states) assert.equal(selectAction(player(fields)), id);
  for (const [progress, phase] of [[.1,"windup"],[.5,"active"],[.9,"recovery"]])
    assert.equal(createActionState(player({slash: .28*(1-progress), slashDuration:.28})).phase, phase);
  assert.equal(createActionState(player({hp:0,deathTime:5})).phase, "complete");
});

test("动作模块缺失时人物安全返回false，不能重新猜测战斗计时", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../static/js/character-art.js"),"utf8"),context);
  const art = context.DaoBladeCharacterArt.renderer;
  assert.equal(art.draw({}, player()), false);
  assert.equal(art.frame(player()), null);
});

test("游戏/预览脚本先加载动作适配器，实际绘制使用显式只读视图", () => {
  for (const file of ["templates/index.html","static/character-preview.html"]) {
    const html = fs.readFileSync(path.join(__dirname,"..",file),"utf8");
    assert.ok(html.indexOf("js/action-state.js") < html.indexOf("js/character-art.js"));
  }
  const source = fs.readFileSync(path.join(__dirname,"../static/js/character-art.js"),"utf8");
  assert.doesNotMatch(source, /player\.(?:slash|hurt|dash|qiCast|deathTime|invuln)/);
});
