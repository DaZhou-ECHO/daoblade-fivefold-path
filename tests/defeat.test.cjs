const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function harness({ practice = false, deferredSave = false } = {}) {
  const calls = { awards: [], saves: [], modals: 0, frames: [], queued: [], close: 0, panels: [] };
  const nodes = new Map();
  const element = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      textContent: "", innerHTML: "", style: {}, handlers: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(name, handler) { this.handlers[name] = handler; },
      showModal() { calls.modals += 1; }, close() { calls.close += 1; },
    });
    return nodes.get(selector);
  };
  const canvas = { width: 960, height: 540, getContext: () => ({}) };
  const document = { hidden: false, querySelector: selector => selector === "#game-canvas" ? canvas : element(selector),
    querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
  let clock = 0, releaseSave;
  const waitSave = deferredSave ? new Promise(resolve => { releaseSave = resolve; }) : Promise.resolve();
  const context = vm.createContext({ document, window: { addEventListener() {}, removeEventListener() {}, scrollTo() {} },
    localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => clock },
    requestAnimationFrame: callback => calls.queued.push(callback), setTimeout, clearTimeout, console,
    recordAward: amount => calls.awards.push(amount),
    recordPanel: name => calls.panels.push(name),
    recordSave: state => { calls.saves.push(JSON.parse(JSON.stringify(state))); return waitSave; },
  });
  require("./helpers/load-rules.cjs")(context);
  const source = fs.readFileSync(path.join(__dirname, "../static/js/game.js"), "utf8")
    .replace(/\nbindUi\(\);\s*initializeSession\(\);\s*$/, "");
  vm.runInContext(`${source}
    const originalGrant = grantBeadExperience;
    grantBeadExperience = amount => { recordAward(amount); return originalGrant(amount); };
    renderAll = () => {};
    const actualShowPanel = showPanel;
    showPanel = name => recordPanel(name);
    saveState = () => recordSave(saveData);
    this.api = { BattleGame, state: () => saveData, active: () => activeGame,
      setActive: game => { activeGame = game; }, setSyncBlocked: value => { saveBlocked = value; }, restoreCheckpoint, replaceState: value => { saveData = value; }, bindUi, showRealPanel: actualShowPanel };
  `, context);
  const game = new context.api.BattleGame("fire", { practice });
  context.api.setActive(game);
  game.draw = () => calls.frames.push({ deathTime: game.player.deathTime, deathDrop: game.player.deathDrop });
  const step = (milliseconds = 34) => {
    clock += milliseconds; calls.queued.length = 0; game.loop(clock);
  };
  const complete = () => { for (let index = 0; index < 34; index += 1) step(); };
  return { game, calls, document, api: context.api, nodes, step, complete, releaseSave };
}

test("U01 致命伤立即结束判定，完整倒地后才打开一次结果窗口", async () => {
  const { game, calls, step, complete } = harness();
  game.player.hp = 1;
  game.damagePlayer(1000, game.player.x + 100);
  assert.equal(game.finished, true);
  assert.ok(game.defeat);
  assert.equal(game.player.deathTime, 0);
  assert.deepEqual(calls.awards, [5]);
  assert.equal(calls.saves.length, 1);
  assert.equal(calls.modals, 0);
  const frozen = JSON.stringify({ player: game.player, enemies: game.enemies });
  game.damagePlayer(1000, 0); game.performAction("slash"); game.update(.5);
  game.hitEnemy(game.enemies[0], 1000);
  assert.equal(JSON.stringify({ player: game.player, enemies: game.enemies }), frozen);
  step();
  assert.ok(game.player.deathTime > 0);
  assert.equal(calls.modals, 0);
  complete();
  await new Promise(setImmediate);
  assert.equal(game.defeat, null);
  assert.equal(calls.frames.at(-1).deathTime, 1.05);
  assert.equal(calls.modals, 1);
  await game.finish(false); await game.finish(true);
  assert.deepEqual(calls.awards, [5]);
  assert.equal(calls.saves.length, 1);
  assert.equal(calls.modals, 1);
  assert.equal(calls.queued.length, 0);
});

test("U01 隐藏页面冻结视觉，大掉帧被截断，暂停标记不会卡住战败结算", async () => {
  const { game, calls, document, step, complete } = harness();
  game.player.hp = 0; game.pause = true;
  const ending = game.finish(false);
  document.hidden = true;
  complete();
  assert.equal(game.player.deathTime, 0);
  assert.equal(calls.modals, 0);
  document.hidden = false;
  step(10000);
  assert.equal(game.player.deathTime, .034);
  assert.equal(calls.modals, 0);
  complete(); await ending;
  assert.equal(calls.modals, 1);
});

test("U01 空中死亡仅移动美术落点，不更改实体坐标或38×70碰撞箱", async () => {
  const { game, complete } = harness();
  Object.assign(game.player, { hp: 0, x: 800, y: 150, onGround: false });
  const original = [game.player.x, game.player.y, game.player.w, game.player.h];
  const ending = game.finish(false);
  complete(); await ending;
  assert.deepEqual([game.player.x, game.player.y, game.player.w, game.player.h], original);
  assert.equal(game.player.y + game.player.h + game.player.deathDrop, 349,
    "美术落到最近的平台而不是穿过高台直落地面");
});

test("U01 动画中退出会取消旧结果窗口且不会重复经验和存档", async () => {
  const { game, calls, step } = harness();
  game.player.hp = 0;
  const ending = game.finish(false);
  step(); game.quit(); await ending;
  const count = calls.frames.length;
  step();
  assert.equal(game.disposed, true);
  assert.equal(game.defeat, null);
  assert.equal(calls.frames.length, count);
  assert.equal(calls.modals, 0);
  assert.equal(calls.saves.length, 1);
  assert.deepEqual(calls.awards, [5]);
});

test("U01 动画中通过导航离开关卡也会取消旧弹窗", async () => {
  const { game, calls, api } = harness();
  game.player.hp = 0;
  const ending = game.finish(false);
  api.showRealPanel("manual");
  await ending;
  assert.equal(game.disposed, true);
  assert.equal(api.active(), null);
  assert.equal(calls.modals, 0);
  assert.deepEqual(calls.awards, [5]);
});

test("U01 保存较慢时等待保存；重试销毁旧局后不出现迟到弹窗", async () => {
  const { game, calls, api, complete, releaseSave } = harness({ deferredSave: true });
  game.player.hp = 0;
  const ending = game.finish(false);
  complete();
  await new Promise(setImmediate);
  assert.equal(calls.modals, 0);
  game.destroy();
  const next = new api.BattleGame("water"); api.setActive(next);
  releaseSave(); await ending;
  assert.equal(calls.modals, 0);
  assert.equal(api.active(), next);
  assert.equal(next.finished, false);
  assert.equal(next.defeat, null);
  assert.equal(next.player.hp, next.stats.hpMax);
});

test("U01 练功场死亡不奖励不保存，胜利仍即时结算一次", async () => {
  const practice = harness({ practice: true });
  practice.game.player.hp = 0;
  const ending = practice.game.finish(false);
  practice.complete(); await ending;
  assert.equal(practice.calls.saves.length, 0);
  assert.deepEqual(practice.calls.awards, []);
  assert.equal(practice.calls.modals, 0);
  assert.equal(practice.api.active(), null);
  assert.equal(practice.calls.panels.at(-1), "cultivation");

  const won = harness();
  await won.game.finish(true); await won.game.finish(true);
  assert.equal(won.game.defeat, null);
  assert.equal(won.calls.modals, 1);
  assert.equal(won.calls.saves.length, 1);
  assert.equal(won.api.state().progress.victories, 1);
  assert.equal(won.api.state().progress.clears.fire, 1);
});

test("U01 结算页重新挑战启动干净的新局，返回洞府正常清理", async () => {
  const { game, calls, api, nodes, complete } = harness();
  api.bindUi();
  game.player.hp = 0;
  const ending = game.finish(false); complete(); await ending;
  nodes.get("#retry-result").handlers.click({ preventDefault() {} });
  const next = api.active();
  assert.notEqual(next, game);
  assert.equal(game.disposed, true);
  assert.equal(next.realmKey, "fire");
  assert.equal(next.finished, false);
  assert.equal(next.player.hp, next.stats.hpMax);
  assert.equal(next.defeat, null);
  assert.equal(calls.close, 1);
  nodes.get("#return-sanctuary").handlers.click({ preventDefault() {} });
  assert.equal(api.active(), null);
  assert.equal(next.disposed, true);
  assert.equal(calls.panels.at(-1), "sanctuary");
  assert.equal(calls.close, 2);
});

test("014 仅检查点失败可续，胜利或已销毁不可续且同试炼不重复结算", async () => {
  const h=harness(); h.game.trial.activated=true;
  const failed=h.game.finish(false);h.complete();await failed;
  assert.equal(h.game.canContinueCheckpoint(),true);
  assert.equal(h.nodes.get("#continue-checkpoint").hidden,false);
  const resumed=new h.api.BattleGame("fire",{trial:h.game.trial});
  await resumed.finish(true);
  assert.equal(resumed.canContinueCheckpoint(),false);
  assert.equal(h.game.canContinueCheckpoint(),false);
  assert.equal(h.api.state().progress.victories,1);
  await resumed.finish(true);
  const stale=new h.api.BattleGame("fire");stale.trial=resumed.trial;
  await stale.finish(true);
  assert.equal(h.api.state().progress.victories,1);
  h.game.destroy();assert.equal(h.game.canContinueCheckpoint(),false);
});

test("014 结果按钮续关只消费一次入口且不新增闯关次数", async () => {
  const h=harness();h.api.bindUi();h.game.trial.activated=true;
  h.game.trial.claimedAltars.add("altar-1");
  const failed=h.game.finish(false);h.complete();await failed;
  h.nodes.get("#continue-checkpoint").handlers.click();
  const next=h.api.active();
  assert.notEqual(next,h.game);assert.equal(h.game.disposed,true);
  assert.equal(next.player.x,1640);assert.equal(next.snapshot,h.game.snapshot);
  assert.equal(next.altars[0].taken,true);assert.equal(h.api.state().progress.runs,0);
  h.nodes.get("#continue-checkpoint").handlers.click();
  assert.equal(h.api.active(),next);assert.equal(h.calls.close,1);
});

test("014 保存失同步时续关入口保留结果和原试炼，不假装开战", async () => {
  const h=harness();h.api.bindUi();h.game.trial.activated=true;
  const failed=h.game.finish(false);h.complete();await failed;
  h.api.setSyncBlocked(true);h.nodes.get("#continue-checkpoint").handlers.click();
  assert.equal(h.api.active(),h.game);assert.equal(h.game.disposed,false);assert.equal(h.calls.close,0);
  h.api.setSyncBlocked(false);h.nodes.get("#continue-checkpoint").handlers.click();
  assert.notEqual(h.api.active(),h.game);assert.equal(h.calls.close,1);
});

test("015 刷新式JSON重载由洞府按钮恢复原试炼，放弃删除记录", () => {
  const h=harness();h.api.bindUi();h.game.trial.activated=true;
  h.game.trial.claimedAltars.add("altar-2");h.game.persistCheckpoint();
  const raw=JSON.parse(JSON.stringify(h.api.state()));
  h.game.destroy();h.api.setActive(null);h.api.replaceState(raw);
  h.nodes.get("#restore-checkpoint").handlers.click();
  const restored=h.api.active();
  assert.equal(restored.player.x,1640);assert.equal(restored.player.hp,restored.stats.hpMax);
  assert.equal(restored.altars[1].taken,true);assert.equal(restored.enemies.filter(e=>!e.dead).length,3);
  assert.equal(h.api.state().progress.runs,0);
  restored.quit();assert.equal(h.api.state().active_trial,null);
  assert.equal(h.calls.saves.at(-1).active_trial,null);
});

test("015 胜利奖励和试炼清除一起保存，失同步时不恢复旧局", async () => {
  const h=harness();h.game.trial.activated=true;h.game.persistCheckpoint();
  await h.game.finish(true);
  const saved=h.calls.saves.at(-1);
  assert.equal(saved.active_trial,null);assert.equal(saved.progress.victories,1);
  h.api.setActive(null);h.api.setSyncBlocked(true);h.api.restoreCheckpoint();
  assert.equal(h.api.active(),null);
});

test("015 Esc不能静默关掉结果并把玩家困在死亡画面", () => {
  const h=harness();h.api.bindUi();let prevented=false;
  h.nodes.get("#result-dialog").handlers.cancel({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
});

test("015 失败后返回洞府保留剑碑，明确放弃或重开才清除", async () => {
  const h=harness();h.api.bindUi();h.game.trial.activated=true;h.game.persistCheckpoint();
  const failed=h.game.finish(false);h.complete();await failed;
  h.nodes.get("#return-sanctuary").handlers.click({preventDefault(){}});
  assert.equal(h.api.active(),null);assert.equal(h.api.state().active_trial.id,h.game.trial.id);
  h.api.restoreCheckpoint();assert.equal(h.api.active().trial.id,h.game.trial.id);
  h.api.active().quit();assert.equal(h.api.state().active_trial,null);
});

test("016 暂停重新挑战保持试验快照，退出返回阵盘且不增加旧档runs", () => {
  const h=harness();h.api.bindUi();
  const compiled={skill:Object.freeze({enabled:false,burst:false})};
  const game=new h.api.BattleGame("fire",{practice:true,labCompiled:compiled});h.api.setActive(game);
  h.nodes.get("#retry-run").handlers.click();
  const restarted=h.api.active();assert.equal(restarted.lab,compiled);assert.equal(restarted.snapshot.ruleset_id,"array-lab-v1");
  assert.equal(game.disposed,true);assert.equal(h.api.state().progress.runs,0);
  restarted.quit();assert.equal(h.calls.panels.at(-1),"arraylab");
});
