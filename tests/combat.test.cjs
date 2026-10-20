const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function gameContext(touchButtons = []) {
  const canvas = { width: 960, height: 540, getContext: () => ({ imageSmoothingEnabled: false }) };
  const element = () => ({ textContent: "", innerHTML: "", style: {}, classList: { add() {}, remove() {}, toggle() {} } });
  const document = { querySelector: selector => selector === "#game-canvas" ? canvas : element(), querySelectorAll: selector => selector === '[data-touch]' ? touchButtons : [], addEventListener() {}, removeEventListener() {} };
  const listeners = new Map();
  const storage = new Map();
  const context = vm.createContext({
    document, window: { addEventListener(name, fn) { listeners.set(name,fn); }, removeEventListener(name, fn) { if(listeners.get(name)===fn) listeners.delete(name); }, scrollTo() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    performance: { now: () => 0 }, requestAnimationFrame() {},
    setTimeout, clearTimeout, console,
  });
  require("./helpers/load-rules.cjs")(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "static", "js", "game.js"), "utf8").replace(/\nbindUi\(\);\s*initializeSession\(\);\s*$/, "");
  vm.runInContext(`${source}\nthis.api = { BattleGame, defaultState: DEFAULT_STATE, primarySecondary, previewSocketState, setState: value => { saveData = value; }, setSocket: value => { pendingSocket = value; } };`, context);
  return { ...context.api, dispatchWindow: (name, event) => listeners.get(name)?.(event), listeners };
}

function touchButton(action, captureFails = false) {
  const captured = new Set();
  return { dataset: { touch: action }, captured,
    setPointerCapture(id) { if(captureFails) throw new Error("capture unavailable"); captured.add(id); },
    hasPointerCapture(id) { return captured.has(id); },
    releasePointerCapture(id) { captured.delete(id); this.onlostpointercapture?.({pointerId:id}); },
  };
}
const pointer = id => ({pointerId:id, button:0, preventDefault() {}});

test("005 滑出按钮后窗口松手清方向，指针捕获失败时也不遗留", () => {
  for (const captureFails of [false,true]) {
    const button = touchButton("right",captureFails), api=gameContext([button]);
    const game = new api.BattleGame("fire",{practice:true}); game.start();
    button.onpointerdown(pointer(1));
    assert.equal(game.keys.has("right"),true);
    api.dispatchWindow("pointerup",pointer(1));
    assert.equal(game.keys.has("right"),false);
    assert.equal(button.captured.size,0);
    game.destroy();
  }
});

test("005 同动作的多指和键盘独立释放，不误清仍按住的方向和格挡", () => {
  for(const [action,code] of [["right","KeyD"],["block","KeyK"]]) {
    const button=touchButton(action), api=gameContext([button]);
    const game=new api.BattleGame("fire",{practice:true}); game.bindTouch();
    game.keyDown({code,preventDefault(){}});
    button.onpointerdown(pointer(1)); button.onpointerdown(pointer(2));
    button.onpointerup(pointer(1));
    assert.equal(game.keys.has(action),true);
    game.keyUp({code});
    assert.equal(game.keys.has(action),true);
    if(action==="block") assert.equal(game.player.blocking,true);
    button.onpointercancel(pointer(2));
    assert.equal(game.keys.has(action),false);
    if(action==="block") assert.equal(game.player.blocking,false);
    // 反向顺序：触屏先松开，键盘仍按住时也不能清掉同一动作。
    game.keyDown({code,preventDefault(){}});
    button.onpointerdown(pointer(7));
    button.onpointerup(pointer(7));
    assert.equal(game.keys.has(action),true);
    if(action==="block") assert.equal(game.player.blocking,true);
    game.keyUp({code});
    assert.equal(game.keys.has(action),false);
  }
});

test("005 捕获丢失、暂停、销毁清理指针和输入，旧按钮不会唤醒已销毁局", () => {
  const button=touchButton("left"), api=gameContext([button]);
  const game=new api.BattleGame("fire",{practice:true}); game.start();
  button.onpointerdown(pointer(3));
  button.releasePointerCapture(3);
  assert.equal(game.keys.size,0);
  button.onpointerdown(pointer(4)); game.setPause(true);
  assert.equal(button.captured.size,0); assert.equal(game.keys.size,0);
  game.setPause(false); button.onpointerdown(pointer(5)); game.destroy();
  assert.equal(button.captured.size,0); assert.equal(game.keys.size,0);
  button.onpointerdown(pointer(6));
  assert.equal(game.keys.size,0); assert.equal(button.captured.size,0);
  assert.equal(api.listeners.has("pointerup"),false);
});

function trainedState(api, element) {
  const state = api.defaultState();
  state.cultivation.qian[0] = { id: `test-${element}`, name: "试炼珠", element, level: 3, quality: 1, xp: 0, affixes: [] };
  return state;
}

test("未镶珠时主副五行都未定，战斗仍可创建", () => {
  const api = gameContext();
  assert.deepEqual(Array.from(api.primarySecondary()), [null, null]);
  assert.equal(new api.BattleGame("fire", { practice: true }).stats.primary, null);
});

test("实际战斗读取开战快照，关外对象修改不会改变本局或另一局", () => {
  const api = gameContext();
  const state = api.defaultState();
  state.cultivation.qian[0] = { id: "snapshot-1", name: "珠", element: "metal", quality: 1, level: 3, xp: 0, affixes: [] };
  state.cultivation.qian[1] = { id: "snapshot-2", name: "珠", element: "metal", quality: 1, level: 3, xp: 0, affixes: [] };
  state.loadout.active[0] = "qian";
  const first = new api.BattleGame("fire", { practice: true, state });
  const attack = first.stats.attack;
  state.loadout.active[0] = null;
  state.cultivation.qian[0].level = 20;
  const next = new api.BattleGame("water", { practice: true, state });
  assert.equal(first.stats.attack, attack);
  assert.equal(first.stats.loadout.active[0], "qian");
  assert.equal(next.stats.loadout.active[0], null);
  assert.ok(next.stats.attack > attack);
  assert.equal(first.snapshot.progression.nodes["legacy:qian:1"].bead.level, 3);
  assert.ok(Object.isFrozen(first.stats.loadout.active));
  first.daoSkill(0);
  assert.ok(first.player.skillCooldowns[0] > 0);
});

test("短输入缓冲只接下一剑，不堆积多次攻击", () => {
  const api = gameContext();
  const game = new api.BattleGame("fire", { practice: true });
  game.slash();
  assert.equal(game.player.combo, 1);
  game.update(.18);
  game.slash();
  game.slash();
  game.update(.15);
  assert.equal(game.player.combo, 2);
  assert.equal(game.player.queuedSlash, 0);
});

test("完美格挡仅开启由玩家按 J 发动的反击", () => {
  const api = gameContext();
  const game = new api.BattleGame("fire", { practice: true });
  const initialHp = game.player.hp;
  game.beginBlock();
  game.damagePlayer(12, game.player.x + 90);
  assert.equal(game.player.hp, initialHp);
  assert.ok(game.player.counterWindow > 0);
  assert.equal(game.player.slash, 0);
  game.slash();
  assert.equal(game.player.counterAttack, true);
});

test("短闪避不消耗剑意，离开平台后短时间仍可起跳", () => {
  const api = gameContext();
  const game = new api.BattleGame("fire", { practice: true });
  const qi = game.player.qi;
  game.dash();
  game.damagePlayer(30, game.player.x + 80);
  assert.equal(game.player.qi, qi);
  assert.equal(game.player.hp, game.stats.hpMax);
  game.player.dash = 0;
  game.player.onGround = false;
  game.player.coyote = .05;
  game.jump();
  assert.equal(game.player.vy, -500);
});

test("穿透剑气同一投射物只命中同一敌人一次", () => {
  const api = gameContext();
  const game = new api.BattleGame("fire", { practice: true });
  const target = game.enemies[0];
  game.projectiles.push({ owner: "player", x: target.x, y: target.y, vx: 0, vy: 0, w: 30, h: 30, damage: 10, life: 1, pierce: 2, hitIds: new Set() });
  game.updateProjectiles(.01);
  const afterFirst = target.hp;
  game.updateProjectiles(.01);
  assert.equal(target.hp, afterFirst);
});

test("临时试镶不修改正式灵珠与修行图", () => {
  const api = gameContext();
  const state = api.defaultState();
  state.inventory.push({ id: "one", name: "试炼灵珠", element: "fire", level: 3, quality: 2, xp: 0, affixes: [] });
  api.setState(state);
  api.setSocket({ trigramKey: "li", layer: 0, beadId: "one" });
  const preview = api.previewSocketState();
  assert.equal(preview.inventory.length, 0);
  assert.equal(preview.cultivation.li[0].id, "one");
  assert.equal(state.inventory.length, 1);
  assert.equal(state.cultivation.li[0], null);
  assert.equal(new api.BattleGame("fire", { practice: true, state: preview }).stats.primary, "fire");
});

test("五种主修分别影响穿透、续航、控制、爆发与守御", () => {
  const api = gameContext();
  const metal = new api.BattleGame("fire", { practice: true, state: trainedState(api, "metal") });
  metal.swordQi();
  assert.equal(metal.projectiles[0].pierce, 2);

  const wood = new api.BattleGame("fire", { practice: true, state: trainedState(api, "wood") });
  wood.player.hp = 50; wood.player.combo = 3; wood.enemies[0].seeds = 1;
  wood.hitEnemy(wood.enemies[0], 10, false, false, "slash");
  assert.ok(wood.player.hp > 50);
  assert.equal(wood.enemies[0].seeds, 0);

  const water = new api.BattleGame("fire", { practice: true, state: trainedState(api, "water") });
  const boss = water.enemy("boss", "首领", 700, 280);
  water.hitEnemy(boss, 10, false, false, "qi");
  assert.equal(boss.slow, .8);
  const normal = water.enemy("melee", "水试炼", 620, 100);
  water.hitEnemy(normal, 5, false, false, "slash");
  const firstSlow = normal.slow;
  water.hitEnemy(normal, 5, false, false, "slash");
  assert.ok(normal.slow > firstSlow);
  assert.equal(normal.chill, 2);

  const fire = new api.BattleGame("fire", { practice: true, state: trainedState(api, "fire") });
  const first = fire.enemy("melee", "甲", 600, 100);
  const second = fire.enemy("melee", "乙", 640, 100);
  fire.enemies = [first, second];
  fire.projectiles.push({ owner: "player", x: 600, y: first.y, vx: 0, vy: 0, w: 25, h: 25, damage: 10, life: 1, pierce: 0, hitIds: new Set() });
  fire.updateProjectiles(.01);
  assert.ok(second.hp < second.maxHp);

  const earth = new api.BattleGame("fire", { practice: true, state: trainedState(api, "earth") });
  earth.beginBlock(); earth.damagePlayer(12, earth.player.x + 80);
  assert.ok(earth.player.shield > 0);
  earth.swordQi();
  assert.equal(earth.projectiles.length, 0); // 格挡期间动作互斥。
  earth.player.blocking = false; earth.swordQi();
  assert.equal(Math.abs(earth.projectiles[0].vx), 430);
  const near = earth.enemy("melee", "乙", 640, 100);
  earth.enemies.push(near);
  earth.player.combo = 3; earth.player.attackId = 1;
  const oldX = near.x;
  earth.hitEnemy(earth.enemies[0], 5, false, false, "slash");
  assert.ok(near.x > oldX);
});

test("暂停清除按键，火关突进锁定起手方向", () => {
  const api = gameContext();
  const game = new api.BattleGame("fire", { practice: true });
  game.keys.add("right"); game.player.blocking = true;
  game.setPause(true);
  assert.equal(game.keys.size, 0);
  assert.equal(game.player.blocking, false);
  const enemy = game.enemy("charger", "刀客", 300, 80, "charger");
  enemy.face = -1;
  game.beginEnemyAttack(enemy, "dash", .4);
  enemy.face = 1;
  game.updateFireEnemy(enemy, .5, 80, 1, 100);
  const before = enemy.x;
  game.updateFireEnemy(enemy, .05, 80, 1, 100);
  assert.ok(enemy.x < before);
});

test("八条卦路均可装备并施展，第三层加强同一技能", () => {
  const api = gameContext();
  for (const key of ["qian", "xun", "kan", "gen", "kun", "zhen", "li", "dui"]) {
    const state = api.defaultState();
    state.cultivation[key][0] = { id: `${key}-1`, name: "珠", element: "metal", quality: 1, level: 3, xp: 0, affixes: [] };
    state.cultivation[key][1] = { id: `${key}-2`, name: "珠", element: "metal", quality: 1, level: 3, xp: 0, affixes: [] };
    state.loadout.active[0] = key;
    const first = new api.BattleGame("fire", { practice: true, state });
    const qi = first.player.qi;
    first.daoSkill(0);
    assert.equal(first.player.qi, qi - (key === "dui" ? 18 : 30), `${key} 应按自身效果结算剑意`);
    assert.ok(first.player.skillCooldowns[0] > 0);
    assert.ok(first.skillEffects.length > 0);
    state.cultivation[key][2] = { id: `${key}-3`, name: "珠", element: "metal", quality: 1, level: 3, xp: 0, affixes: [] };
    const upgraded = new api.BattleGame("fire", { practice: true, state });
    upgraded.daoSkill(0);
    if (key === "kun") assert.ok(upgraded.player.shield > first.player.shield);
    if (key === "qian") assert.ok(upgraded.skillEffects[0].radius > first.skillEffects[0].radius);
  }
});

test("两项技能独立冷却，受击期间不能施法", () => {
  const api = gameContext();
  const state = api.defaultState();
  for (const key of ["qian", "kun"]) {
    state.cultivation[key][0] = { id: `${key}-1`, name: "珠", element: "metal", quality: 1, level: 3, xp: 0, affixes: [] };
    state.cultivation[key][1] = { id: `${key}-2`, name: "珠", element: "metal", quality: 1, level: 3, xp: 0, affixes: [] };
  }
  state.loadout.active = ["qian", "kun"];
  const game = new api.BattleGame("fire", { practice: true, state });
  game.daoSkill(0);
  assert.equal(game.player.skillCooldowns[1], 0);
  game.player.qiCast = 0;
  game.daoSkill(1);
  assert.ok(game.player.skillCooldowns[1] > 0);
  game.player.hurt = .2;
  game.player.qiCast = 0;
  const qi = game.player.qi;
  game.player.skillCooldowns[0] = 0;
  game.daoSkill(0);
  assert.equal(game.player.qi, qi);
});

test("已学但未装备的心法不会暗中提供被动效果", () => {
  const api = gameContext();
  const state = api.defaultState();
  state.cultivation.zhen[0] = { id: "zhen-one", name: "珠", element: "metal", quality: 1, level: 3, xp: 0, affixes: [] };
  state.cultivation.zhen[1] = { id: "zhen-two", name: "珠", element: "metal", quality: 1, level: 3, xp: 0, affixes: [] };
  const unequipped = new api.BattleGame("fire", { practice: true, state });
  unequipped.enemies[0].attackCd = 0;
  unequipped.hitEnemy(unequipped.enemies[0], 4);
  assert.equal(unequipped.enemies[0].attackCd, 0);
  state.loadout.passive[0] = "zhen";
  const equipped = new api.BattleGame("fire", { practice: true, state });
  equipped.enemies[0].attackCd = 0;
  equipped.hitEnemy(equipped.enemies[0], 4);
  assert.ok(equipped.enemies[0].attackCd > 0);
});

test("五境布局各异且支路祭坛位置可达，非火关敌人有攻击前摇", () => {
  const api = gameContext();
  const games = ["metal", "wood", "water", "fire", "earth"].map(key => new api.BattleGame(key));
  assert.equal(new Set(games.map(game => JSON.stringify(game.platforms.slice(1)))).size, 5);
  for (const game of games) {
    assert.equal(game.altars.length, 2);
    for (const altar of game.altars) assert.ok(game.platforms.some(platform => altar.x >= platform.x && altar.x + 28 <= platform.x + platform.w && altar.y + 28 === platform.y));
    assert.ok(game.enemies.filter(enemy => ["melee", "charger"].includes(enemy.kind)).length >= 4);
  }
  const metal = games[0];
  const foe = metal.enemies[0];
  metal.enemies = [foe];
  foe.x = metal.player.x + 75; foe.attackCd = 0;
  metal.updateEnemies(.016);
  assert.equal(foe.attackState, "windup");
});
