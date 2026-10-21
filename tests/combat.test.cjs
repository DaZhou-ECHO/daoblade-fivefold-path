const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function gameContext(touchButtons = [], savedFeedback = null) {
  const canvas = { width: 960, height: 540, getContext: () => ({ imageSmoothingEnabled: false }) };
  const element = () => ({ textContent: "", innerHTML: "", style: {}, classList: { add() {}, remove() {}, toggle() {} } });
  const document = { querySelector: selector => selector === "#game-canvas" ? canvas : element(), querySelectorAll: selector => selector === '[data-touch]' ? touchButtons : [], addEventListener() {}, removeEventListener() {} };
  const listeners = new Map();
  const storage = new Map();
  if (savedFeedback) storage.set("daoblade-feedback",JSON.stringify(savedFeedback));
  const context = vm.createContext({
    document, window: { addEventListener(name, fn) { listeners.set(name,fn); }, removeEventListener(name, fn) { if(listeners.get(name)===fn) listeners.delete(name); }, scrollTo() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    performance: { now: () => 0 }, requestAnimationFrame() {},
    setTimeout, clearTimeout, console,
  });
  require("./helpers/load-rules.cjs")(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "static", "js", "game.js"), "utf8").replace(/\nbindUi\(\);\s*initializeSession\(\);\s*$/, "");
  vm.runInContext(`${source}\nthis.api = { BattleGame, defaultState: DEFAULT_STATE, primarySecondary, previewSocketState, setState: value => { saveData = value; }, setSocket: value => { pendingSocket = value; }, setAudioPlayer: value => { battleAudio = value; }, getFeedback: () => feedback, startRealm, setSyncBlocked: value => { saveBlocked = value; }, getActiveGame: () => activeGame, setActiveGame: value => { activeGame = value; }, getProgress: () => saveData.progress, mockSave: value => { saveState = value; } };`, context);
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

test("012 五境实际构造与已提交a0ee0b1的物理/敌人布局基线一致",()=>{
  const baseline=require("./fixtures/level-layout-baseline.json"),api=gameContext();
  const pick=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value[key]]));
  assert.equal(baseline.source_commit,"a0ee0b1");
  for(const expected of baseline.cases){
    const game=new api.BattleGame(expected.realm);
    const actual={realm:game.realmKey,worldWidth:game.worldWidth,floorY:game.floorY,
      player:pick(game.player,["x","y","w","h"]),
      platforms:Array.from(game.platforms,p=>pick(p,["x","y","w","h"])),
      altars:Array.from(game.altars,a=>pick(a,["x","y","taken"])),
      hazards:Array.from(game.hazards,h=>pick(h,["x","w"])),
      enemies:Array.from(game.enemies,e=>pick(e,["kind","variant","name","x","y","w","h","hp","maxHp"]))};
    assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected,expected.realm);
  }
});

test("012 当局地图/敌人与冻结定义隔离，重试和另一局不继承旧局修改",()=>{
  const api=gameContext(),first=new api.BattleGame("fire");
  const x=first.platforms[1].x,hp=first.enemies[0].hp;
  first.platforms[1].x+=100;first.altars[0].taken=true;first.enemies[0].hp=1;
  const next=new api.BattleGame("fire");
  assert.equal(next.platforms[1].x,x);assert.equal(next.altars[0].taken,false);assert.equal(next.enemies[0].hp,hp);
  assert.equal(first.level,next.level);
  assert.equal(next.enemies.find(e=>e.kind==="boss").spawn_anchor,"boss");
  assert.equal(next.enemies[0].id,next.level.encounters[0].id);
});

test("010 失同步拒绝正式开战且保留原局与计数，练功允许，恢复后正式入场",()=>{
  const api=gameContext();let destroyed=0,saves=0;
  const original={destroy(){destroyed++;}};
  api.setActiveGame(original);api.setSyncBlocked(true);api.mockSave(()=>{saves++;return Promise.resolve();});
  api.startRealm("fire");
  assert.equal(destroyed,0);assert.equal(api.getActiveGame(),original);
  assert.equal(api.getProgress().runs,0);assert.equal(saves,0);
  api.startRealm("fire",{practice:true});
  assert.equal(destroyed,1);assert.equal(api.getActiveGame().practice,true);
  assert.equal(api.getProgress().runs,0);assert.equal(saves,0);
  api.setSyncBlocked(false);api.startRealm("fire");
  assert.equal(api.getActiveGame().practice,false);assert.equal(api.getProgress().runs,1);assert.equal(saves,1);
  api.getActiveGame().destroy();
});

test("009 五境敌人燃烧致死后不再完成同帧攻击",()=>{
  for(const realm of ["fire","wood","metal","water","earth"]){
    const api=gameContext(),game=new api.BattleGame(realm),enemy=game.enemies[0];
    game.enemies=[enemy];
    enemy.x=game.player.x+35;enemy.hp=1;enemy.burn=1;enemy.burnTick=0;
    enemy.attackState=realm==="fire"?"strike":"windup";
    enemy.attackType="slash";enemy.attackDirection=-1;enemy.attackTimer=.005;
    const hp=game.player.hp,x=enemy.x;
    game.updateEnemies(.01);
    assert.equal(enemy.dead,true,realm);
    assert.equal(game.player.hp,hp,`${realm}尸体不能继续造成伤害`);
    assert.equal(enemy.x,x,`${realm}尸体不能继续移动`);
  }
});

test("009 非致死燃烧不冻结活敌人，继续正常攻击并标记燃烧事件",()=>{
  for(const realm of ["fire","wood"]){
    const api=gameContext(),game=new api.BattleGame(realm),enemy=game.enemies[0];
    game.enemies=[enemy];enemy.x=game.player.x+35;enemy.hp=20;enemy.burn=1;enemy.burnTick=0;
    enemy.attackState=realm==="fire"?"strike":"windup";
    enemy.attackType="slash";enemy.attackDirection=-1;enemy.attackTimer=.005;
    const hp=game.player.hp;game.updateEnemies(.01);
    assert.equal(enemy.dead,false);assert.ok(enemy.hp<20);assert.ok(game.player.hp<hp);
    const burn=game.events.recent.find(e=>e.periodic);
    assert.equal(burn.action_id,"burn");
  }
});

test("008 旧设置默认开启视觉提示，显式关闭可保留且不改声音默认值",()=>{
  const old=gameContext([],{shake:false,sound:false});
  assert.equal(old.getFeedback().combatText,true);assert.equal(old.getFeedback().sound,false);
  const off=gameContext([],{shake:true,sound:false,combatText:false});
  const game=new off.BattleGame("fire",{practice:true});game.hitEnemy(game.enemies[0],10);
  assert.equal(game.feedbackLayer.items.length,0);
});

test("008 实际命中生成视觉，暂停冻结、倒地阶段消退、销毁清空",async()=>{
  const api=gameContext(),game=new api.BattleGame("fire",{practice:true});
  game.hitEnemy(game.enemies[0],10);assert.equal(game.feedbackLayer.items[0].text,"10");
  const before=game.feedbackLayer.items[0].life;
  game.draw=()=>{};game.setPause(true);game.loop(100);
  assert.equal(game.feedbackLayer.items[0].life,before);
  game.setPause(false);const finish=game.finish(false);game.advanceDefeat(.3);
  assert.ok(game.feedbackLayer.items[0].life<before);
  game.destroy();await finish;
  assert.equal(game.feedbackLayer.items.length,0);
});

test("008 视觉反馈故障独立隔离，仍能播放事件声音且不改变伤害",()=>{
  const api=gameContext(),played=[];
  api.setAudioPlayer({play:event=>played.push(event.type),stop(){}});
  const game=new api.BattleGame("fire",{practice:true});
  game.feedbackLayer={push(){throw new Error("visual feedback failed");}};
  const before=game.enemies[0].hp;
  game.slash();game.hitEnemy(game.enemies[0],10);
  assert.equal(game.enemies[0].hp,before-10);
  assert.deepEqual(played,["slash_started","enemy_hit"]);
  assert.equal(game.events.failure_count,2);
});

test("007 实际事件音效消费者在暂停和结束时停止，销毁后的输入不补播", () => {
  const api=gameContext(),played=[];let stops=0;
  api.setAudioPlayer({play:event=>played.push(event.type),stop:()=>stops++});
  const game=new api.BattleGame("fire",{practice:true});
  game.performAction("slash");assert.deepEqual(played,["slash_started"]);
  game.setPause(true);assert.equal(stops,1);
  game.performAction("slash");assert.equal(played.length,1);
  game.setPause(false);game.destroy();assert.equal(stops,2);
  game.performAction("slash");assert.equal(played.length,1);
});

test("006 挥空只有起手，命中按真实判定发一次事件，持续伤害独立标记", () => {
  const api=gameContext(), game=new api.BattleGame("fire",{practice:true}), seen=[];
  game.events.subscribe(event=>seen.push(event));
  game.slash();
  assert.deepEqual(seen.map(e=>e.type),["slash_started"]);
  const enemy=game.enemies[0]; enemy.x=game.player.x+50;
  game.update(.1); game.update(.01);
  assert.equal(seen.filter(e=>e.type==="enemy_hit").length,1);
  const hit=seen.find(e=>e.type==="enemy_hit");
  assert.equal(hit.target_id,enemy.id); assert.equal(hit.attack_id,game.player.attackId);
  game.hitEnemy(enemy,2,false,true,"burn");
  assert.equal(seen.at(-1).periodic,true);
  assert.equal(seen.at(-1).amount,2);
});

test("006 普通格挡、完美格挡和真实受伤分类，不把无敌闪避当命中", () => {
  const api=gameContext(), game=new api.BattleGame("fire",{practice:true}), seen=[];
  game.events.subscribe(event=>seen.push(event));
  game.beginBlock(); game.damagePlayer(12,game.player.x+100,"enemy-test","slash");
  assert.deepEqual(seen.map(e=>e.type),["player_parried"]);
  assert.equal(seen[0].source_id,"enemy-test"); assert.equal(seen[0].element,"fire");
  game.player.invuln=0; game.player.parryArmed=0;
  game.damagePlayer(12,game.player.x+100,"enemy-test","slash");
  assert.deepEqual(seen.slice(-2).map(e=>e.type),["player_blocked","player_hurt"]);
  const count=seen.length;
  game.player.invuln=0; game.player.dash=.15;
  game.damagePlayer(12,game.player.x+100);
  assert.equal(seen.length,count);
});

test("006 监听故障不改伤害，暂停不发攻击，销毁/结算只结束一次且新局隔离", async () => {
  const api=gameContext(), game=new api.BattleGame("fire",{practice:true});
  game.events.subscribe(()=>{throw new Error("坏反馈");});
  game.setPause(true); game.performAction("slash"); assert.equal(game.events.recent.length,0);
  game.setPause(false);
  const before=game.enemies[0].hp; game.hitEnemy(game.enemies[0],10);
  assert.equal(game.enemies[0].hp,before-10); assert.equal(game.events.failure_count,1);
  game.events.subscribe(e=>{if(e.type==="battle_ended")game.destroy();});
  await game.finish(true); game.destroy();
  assert.equal(game.events.recent.filter(e=>e.type==="battle_ended").length,1);
  assert.equal(game.events.closed,true);
  const count=game.events.recent.length; game.hitEnemy(game.enemies[0],10);
  assert.equal(game.events.recent.length,count);
  const next=new api.BattleGame("fire",{practice:true});
  assert.notEqual(next.events.id,game.events.id); assert.equal(next.events.recent.length,0);
});

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

test("014 剑碑仅前段清场且在附近地面激活一次", () => {
  const api=gameContext(), game=new api.BattleGame("fire");api.mockSave(()=>Promise.resolve(true));
  game.player.x=1640;game.player.hp=1;game.updateCheckpoint();assert.equal(game.trial.activated,false);
  game.enemies.slice(0,3).forEach(e=>e.dead=true);
  game.player.onGround=false;game.updateCheckpoint();assert.equal(game.trial.activated,false);
  game.player.onGround=true;game.player.x=2000;game.updateCheckpoint();assert.equal(game.trial.activated,false);
  game.player.x=1640;game.updateCheckpoint();assert.equal(game.trial.activated,true);assert.equal(game.player.hp,game.stats.hpMax);
  game.player.hp=2;game.updateCheckpoint();assert.equal(game.player.hp,2);
});

test("014 续关保持构筑和祭坛，前三敌不复活，后段敌人重置；完整重开独立", () => {
  const api=gameContext(), original=new api.BattleGame("fire");
  original.trial.activated=true;original.trial.claimedAltars.add("altar-2");
  original.enemies[4].hp=1;
  const changed=api.defaultState();changed.player.spirit=999;api.setState(changed);
  const resumed=new api.BattleGame("fire",{trial:original.trial});
  assert.equal(resumed.snapshot,original.snapshot);assert.equal(resumed.player.x,1640);
  assert.ok(resumed.enemies.slice(0,3).every(e=>e.dead&&e.hp===0));
  assert.equal(resumed.enemies[4].hp,resumed.enemies[4].maxHp);
  assert.equal(resumed.altars[1].taken,true);assert.equal(resumed.altars[0].taken,false);
  api.mockSave(()=>Promise.resolve());resumed.start();assert.equal(api.getProgress().runs,0);
  const fresh=new api.BattleGame("fire");fresh.start();assert.equal(api.getProgress().runs,1);
  assert.equal(fresh.trial.activated,false);assert.equal(fresh.altars[1].taken,false);
  assert.notEqual(fresh.snapshot,original.snapshot);
  assert.equal(new api.BattleGame("fire",{practice:true}).trial,null);
  assert.equal(new api.BattleGame("wood").trial,null);
});

function labConfiguration(roles,stage=1) {
  const config=require("../static/data/rules/array-lab-v1.json");
  const rules=require("../static/js/array-lab-rules.js").createRuntime(config);
  const state={ruleset_id:config.ruleset_id,schema_version:2,rules_version:2,progress:{runs:0,victories:0,spirit:0},active_trial:null,stage,beads:structuredClone(config.beads),nodes:Object.fromEntries(config.nodes.map(n=>[n.id,null]))};
  for(const role of roles)state.nodes["li."+role]="lab-"+role;
  return rules.compile(state);
}

test("016 聚焰与引爆真实伤害链不同，不把试验珠叠到基础面板", () => {
  const api=gameContext(),focus=new api.BattleGame("fire",{practice:true,labCompiled:labConfiguration(["core","mark","focus"])});
  const target=focus.enemies[0],hp=target.hp;
  assert.equal(focus.stats.primary,null);assert.equal(focus.stats.attack,new api.BattleGame("fire",{practice:true}).stats.attack);
  focus.daoSkill(0);assert.equal(target.hp,hp-16);
  for(let i=0;i<3;i++)focus.updateEnemies(1);
  assert.equal(focus.labMetrics.direct,16);assert.equal(focus.labMetrics.burn,12);assert.equal(target.labMarks,1);
  const burst=new api.BattleGame("fire",{practice:true,labCompiled:labConfiguration(["core","mark","burst"])}),other=burst.enemies[0],before=other.hp;
  for(let i=0;i<4;i++){burst.player.skillCooldowns[0]=0;burst.player.qiCast=0;burst.daoSkill(0);}
  assert.equal(other.labMarks,3);assert.equal(other.hp,before-48);
  burst.player.qiCast=0;burst.daoSkill(1);assert.equal(other.hp,before-90);assert.equal(other.labMarks,0);
  const qi=burst.player.qi;burst.player.qiCast=0;burst.player.skillCooldowns[1]=0;burst.daoSkill(1);assert.equal(burst.player.qi,qi);
  assert.ok(burst.events.recent.some(event=>event.action_id==="lab_burst"&&event.element==="fire"));
});

test("016 拆核心停技、远距/背后不命中，试验不改旧档与奖励", () => {
  const api=gameContext(),progress=JSON.stringify(api.getProgress());
  const disabled=new api.BattleGame("fire",{practice:true,labCompiled:labConfiguration(["mark","burst"])});
  const qi=disabled.player.qi,hp=disabled.enemies[0].hp;disabled.daoSkill(0);disabled.daoSkill(1);
  assert.equal(disabled.player.qi,qi);assert.equal(disabled.enemies[0].hp,hp);
  const focus=new api.BattleGame("fire",{practice:true,labCompiled:labConfiguration(["core","mark","focus"])});
  focus.player.face=-1;focus.daoSkill(0);assert.equal(focus.enemies[0].hp,hp);
  focus.player.face=1;focus.player.qiCast=0;focus.player.skillCooldowns[0]=0;focus.player.x=120;focus.daoSkill(0);assert.equal(focus.enemies[0].hp,hp);
  focus.start();focus.quit();assert.equal(JSON.stringify(api.getProgress()),progress);
});


test("019 真实远距剑气命中后首领追击，警戒外未受击敌人不跟随且不隔空出招",()=>{
  for(const realm of ["metal","wood","water","fire","earth"]){
    const api=gameContext(),g=new api.BattleGame(realm),boss=g.enemies.at(-1),other=g.enemies[0];
    g.enemies=[boss,other];g.player.x=1200;boss.x=2200;other.x=3000;boss.attackCd=0;other.attackCd=0;
    g.updateEnemies(.1);assert.equal(boss.x,2200);assert.equal(other.x,3000);
    g.swordQi();const hp=boss.hp;g.updateProjectiles(1.5);assert.ok(boss.hp<hp,realm+" actual qi impact");
    g.updateEnemies(.1);assert.ok(boss.x<2200,realm+" hit boss must pursue outside old range");
    assert.equal(other.x,3000);assert.equal(boss.attackState,"idle");assert.equal(g.projectiles.filter(p=>p.owner==="enemy").length,0);
    const fresh=new api.BattleGame(realm);fresh.player.x=1200;const next=fresh.enemies.at(-1);next.x=2200;fresh.updateEnemies(.1);assert.equal(next.x,2200);
    boss.dead=true;const at=boss.x;g.updateEnemies(.5);assert.equal(boss.x,at);
  }
});

test("019 实际受击的远程与近战也追近原射程，空挥与零伤害不拉怪",()=>{
  const api=gameContext();
  for(const realm of ["fire","metal"]){
    const g=new api.BattleGame(realm);g.player.x=1200;
    const ranged=g.enemies.find(e=>e.kind==="ranged"),melee=g.enemies[0];g.enemies=[ranged,melee];ranged.x=2200;melee.x=2600;
    g.hitEnemy(ranged,0);g.updateEnemies(.1);assert.equal(ranged.x,2200);
    g.hitEnemy(ranged,1);g.hitEnemy(melee,1);g.updateEnemies(.1);assert.ok(ranged.x<2200);assert.ok(melee.x<2600);
    assert.equal(ranged.attackState,"idle");assert.equal(melee.attackState,"idle");
  }
});


test("019 交战敌人进入原范围仍先前摇，剑碑续关不继承上次仇恨",()=>{
  const api=gameContext(),g=new api.BattleGame("fire"),boss=g.enemies.at(-1);g.enemies=[boss];
  boss.engaged=true;g.player.x=1200;boss.x=1400;boss.attackCd=0;
  const hp=g.player.hp;g.updateEnemies(.01);assert.equal(boss.attackState,"windup");assert.equal(g.player.hp,hp);assert.equal(g.projectiles.length,0);
  g.updateEnemies(.1);assert.equal(boss.attackState,"windup");assert.equal(g.player.hp,hp);assert.equal(g.projectiles.length,0);
  g.trial.activated=true;const resumed=new api.BattleGame("fire",{trial:g.trial});
  assert.equal(resumed.resuming,true);assert.equal(resumed.enemies.filter(e=>e.dead).length,3);
  assert.equal(resumed.enemies.some(e=>e.engaged),false);
});


test("020 回火低伤害留痕，E单次有界回气护体且不伤敌、不叠护盾",()=>{
  const api=gameContext(),g=new api.BattleGame("fire",{practice:true,labCompiled:labConfiguration(["core","mark","cycle"],2)}),target=g.enemies[0];
  const hp=target.hp;g.daoSkill(0);assert.equal(target.hp,hp-8);assert.equal(target.labMarks,1);
  const extra=g.enemy("dummy","extra",340,99999,"dummy");g.enemies.push(extra);extra.labMarks=3;target.labMarks=3;
  g.player.qiCast=0;g.player.qi=1;const before=target.hp;g.daoSkill(1);
  assert.equal(g.player.qi,25);assert.equal(g.player.shield,9);assert.equal(g.player.shieldTime,3);
  assert.equal(target.hp,before);assert.equal(target.labMarks,0);assert.equal(extra.labMarks,0);
  g.player.qiCast=0;g.player.skillCooldowns[1]=0;const qi=g.player.qi;g.daoSkill(1);assert.equal(g.player.qi,qi);assert.equal(g.player.skillCooldowns[1],0);
  target.labMarks=1;g.player.shield=9;g.daoSkill(1);assert.equal(g.player.shield,9);
  g.player.qiCast=0;g.player.skillCooldowns[1]=0;g.player.face=-1;target.labMarks=3;g.daoSkill(1);assert.equal(target.labMarks,3);
});


test("020 回火珠成长只改本分支护盾，时间到失效且停用连线",()=>{
  const cfg=structuredClone(require("../static/data/rules/array-lab-v1.json")),rules=require("../static/js/array-lab-rules.js").createRuntime(cfg);
  const state={ruleset_id:cfg.ruleset_id,schema_version:2,rules_version:2,stage:2,beads:structuredClone(cfg.beads),nodes:Object.fromEntries(cfg.nodes.map(n=>[n.id,["core","mark","cycle"].includes(n.role)?"lab-"+n.role:null])),progress:{runs:1,victories:1,spirit:0},active_trial:null};
  state.beads.find(b=>b.role==="cycle").level=3;
  const compiled=rules.compile(state);assert.equal(compiled.skill.cycle_max_shield,11);assert.equal(compiled.skill.cycle_shield_per_mark,5);
  const api=gameContext(),g=new api.BattleGame("fire",{practice:true,labCompiled:compiled});g.enemies[0].labMarks=3;g.daoSkill(1);assert.equal(g.player.shield,11);
  for(let i=0;i<100;i++)g.update(.034);assert.equal(g.player.shield,0);
  state.nodes["li.core"]=null;assert.equal(rules.compile(state).skill.cycle,false);
});


test("023 挥剑收招前短按Q在窗口内施放一次，不提前扣费",()=>{
  const api=gameContext(),g=new api.BattleGame("fire",{practice:true,labCompiled:labConfiguration(["core","mark","burst"])});
  g.player.slash=.09;const qi=g.player.qi;g.performAction("dao");assert.equal(g.player.qi,qi);assert.equal(g.labMetrics.direct,0);
  for(let i=0;i<4;i++)g.update(.034);
  assert.equal(g.labMetrics.direct,12);assert.equal(g.enemies[0].labMarks,1);assert.ok(g.player.skillCooldowns[0]>0);
  for(let i=0;i<50;i++)g.update(.034);assert.equal(g.labMetrics.direct,12);
});


function bufferGame(){const api=gameContext();return new api.BattleGame("fire",{practice:true,labCompiled:labConfiguration(["core","mark","burst"])});}
function bufferSteps(g,count=8){for(let i=0;i<count;i++)g.update(.034);}
test("023 缓冲有时限，短冷却可接上、长动作不会延迟自动施放",()=>{
  const short=bufferGame();short.player.skillCooldowns[0]=.09;short.performAction("dao");bufferSteps(short,4);assert.equal(short.labMetrics.direct,12);
  for(const field of ["slash","hurt","dash","qiCast"]){const g=bufferGame();g.player[field]=.3;g.performAction("dao");bufferSteps(g,14);assert.equal(g.events.recent.some(e=>e.action_id==="lab_fire"),false,field);assert.equal(g.skillInput,null);}
  const long=bufferGame();long.player.skillCooldowns[0]=.5;long.performAction("dao");bufferSteps(long,20);assert.equal(long.labMetrics.direct,0);
});
test("023 单槽最新Q/E覆盖，后按J/L/防守/闪避取消旧技能",()=>{
  const g=bufferGame();g.enemies[0].labMarks=2;g.player.slash=.08;g.performAction("dao");g.performAction("dao2");bufferSteps(g,4);
  assert.equal(g.labMetrics.direct,0);assert.equal(g.labMetrics.burst,28);assert.equal(g.enemies[0].labMarks,0);
  for(const action of ["slash","qi","block","dash"]){const h=bufferGame();h.player.slash=.09;h.performAction("dao");h.performAction(action);assert.equal(h.skillInput,null);}
  const blocked=bufferGame();blocked.player.blocking=true;blocked.performAction("dao");assert.equal(blocked.skillInput,null);
});
test("023 真正施放时重验剑意、前方火痕和当前朝向，不预付费不追踪离场目标",()=>{
  for(const invalid of ["qi","target","face"]){const g=bufferGame();g.enemies[0].labMarks=2;g.player.slash=.08;g.performAction("dao2");
    if(invalid==="qi")g.player.qi=0;if(invalid==="target")g.enemies[0].x=900;if(invalid==="face")g.player.face=-1;
    bufferSteps(g,4);assert.equal(g.labMetrics.burst,0);assert.equal(g.enemies[0].labMarks,2);assert.equal(g.player.skillCooldowns[1],0);assert.equal(g.skillInput,null);
  }
});
test("023 暂停、清理、销毁、致命/非致命伤与服务等待不遗留幽灵施法",()=>{
  for(const stop of [g=>g.setPause(true),g=>g.clearInput(),g=>g.destroy(),g=>g.damagePlayer(5,0),g=>g.damagePlayer(999,0)]){
    const g=bufferGame();g.player.slash=.09;g.performAction("dao");assert.ok(g.skillInput);stop(g);assert.equal(g.skillInput,null);
  }
  const g=bufferGame();g.labPending=true;g.performAction("dao");assert.equal(g.skillInput,null);g.labPending=false;g.labError=true;g.performAction("dao");assert.equal(g.skillInput,null);
});
test("023 键盘短按和触屏松手共用同一缓冲，松手不取消一次技能意图",()=>{
  const button=touchButton("dao"),api=gameContext([button]),g=new api.BattleGame("fire",{practice:true,labCompiled:labConfiguration(["core","mark","burst"])});g.bindTouch();g.player.slash=.09;
  button.onpointerdown(pointer(7));button.onpointerup(pointer(7));assert.ok(g.skillInput);bufferSteps(g,4);assert.equal(g.labMetrics.direct,12);
  const h=bufferGame();h.player.slash=.09;h.keyDown({code:"KeyQ",preventDefault(){}});h.keyUp({code:"KeyQ",preventDefault(){}});bufferSteps(h,4);assert.equal(h.labMetrics.direct,12);
});


test("023 旧永久档主动技能同样经过缓冲，不提前扣30剑意",()=>{
  const api=gameContext(),state=api.defaultState();
  state.cultivation.qian[0]={id:"q1",name:"test",element:"metal",level:3,quality:1,xp:0,affixes:[]};
  state.cultivation.qian[1]={id:"q2",name:"test",element:"metal",level:1,quality:1,xp:0,affixes:[]};state.loadout.active[0]="qian";
  const g=new api.BattleGame("fire",{practice:true,state});g.player.slash=.09;const qi=g.player.qi;g.performAction("dao");assert.equal(g.player.qi,qi);
  bufferSteps(g,4);assert.ok(g.player.skillCooldowns[0]>0);assert.ok(g.player.qi<qi-25);assert.equal(g.skillInput,null);
});


test("024 近敌战况只读真实方位/气血/预警，转身后取消身后提示",()=>{
  const g=bufferGame(),enemy=g.enemies[0];enemy.name="训练敌人";enemy.hp=37.2;enemy.maxHp=100;enemy.attackState="windup";enemy.attackType="dash";
  const before=JSON.stringify({player:g.player,enemies:g.enemies});assert.match(g.enemyReadout(),/训练敌人.*右侧.*38\/100.*蓄力突进/);assert.equal(JSON.stringify({player:g.player,enemies:g.enemies}),before);
  g.player.face=-1;assert.match(g.enemyReadout(),/身后，请转身/);enemy.attackState="recover";assert.match(g.enemyReadout(),/收招中/);
  g.player.face=1;assert.doesNotMatch(g.enemyReadout(),/身后/);enemy.attackState="strike";assert.match(g.enemyReadout(),/正在出招/);
});
test("024 死敌不抢信息，远处只提示方向，清场与贴身无虚构左右",()=>{
  const g=bufferGame(),enemy=g.enemies[0];enemy.x=1200;assert.match(g.enemyReadout(),/右侧远处/);assert.doesNotMatch(g.enemyReadout(),/气血/);
  enemy.dead=true;assert.equal(g.enemyReadout(),"敌人已肃清");const next=g.enemy("melee","后方敌人",180,70);g.enemies.push(next);assert.match(g.enemyReadout(),/后方敌人.*左侧.*身后/);
  next.x=g.player.x+(g.player.w-next.w)/2;assert.match(g.enemyReadout(),/贴身/);assert.doesNotMatch(g.enemyReadout(),/左侧|右侧|身后/);
});


function closeAttack(realm,kind,mode){
  const api=gameContext(),g=new api.BattleGame(realm),enemy=kind==="boss"?g.enemies.at(-1):g.enemies[0];
  g.enemies=[enemy];g.player.x=600;g.player.face=1;g.player.blocking=mode!=="hurt";g.player.parryArmed=mode==="parry"?.22:0;
  enemy.x=g.player.x+(kind==="boss"?-4:5);enemy.attackDirection=-1;enemy.attackType="slash";enemy.attackHit=false;
  enemy.attackState=realm==="fire"?"strike":"windup";enemy.attackTimer=realm==="fire"?.2:.001;
  return {g,enemy};
}
test("025 实际贴身近战中心在前，五境普通挡与弹反有效，不按敌人左边缘错判",()=>{
  for(const realm of ["fire","wood","metal","water","earth"])for(const kind of ["boss","melee"])for(const mode of ["block","parry"]){
    const {g}=closeAttack(realm,kind,mode),hp=g.player.hp;g.updateEnemies(.01);
    assert.ok(g.events.recent.some(e=>e.type===(mode==="parry"?"player_parried":"player_blocked")),`${realm}/${kind}/${mode}`);
    if(mode==="parry")assert.equal(g.player.hp,hp);else {const raw=kind==="boss"?(realm==="fire"?24:23):(realm==="earth"?17:12);assert.ok(Math.abs(g.player.hp-(hp-Math.max(1,raw*(1-g.stats.block)-g.stats.defense)))<.00001); }
  }
});
test("025 中心在后不能格挡，受伤后向远离攻击来源的方向击退",()=>{
  for(const realm of ["fire","wood"]){
    const front=closeAttack(realm,"boss","hurt");front.g.updateEnemies(.01);assert.ok(front.g.player.vx<0,realm+" front recoil");
    const {g,enemy}=closeAttack(realm,"boss","block");enemy.x=g.player.x+g.player.w/2-enemy.w/2-10;enemy.attackDirection=1;
    g.updateEnemies(.01);assert.equal(g.events.recent.some(e=>e.type==="player_blocked"),false);assert.ok(g.player.vx>0,realm+" back recoil");
  }
});
test("025 敌方投射物中心在前可挡，中心在后不可挡且击退一致",()=>{
  for(const side of [1,-1]){
    const g=bufferGame();g.player.blocking=true;g.player.parryArmed=0;
    g.projectiles=[{type:"bolt",owner:"enemy",source_id:"test-source",x:g.player.x+g.player.w/2+side*5-10,y:g.player.y+20,w:20,h:18,vx:0,vy:0,life:1,damage:12}];
    g.updateProjectiles(.01);assert.equal(g.events.recent.some(e=>e.type==="player_blocked"),side===1);assert.equal(Math.sign(g.player.vx),-side);
  }
});


test("025 旧金行弹反反击也按中心识别贴身前敌",()=>{
  const api=gameContext(),g=new api.BattleGame("wood",{state:trainedState(api,"metal")}),enemy=g.enemies.at(-1);g.enemies=[enemy];g.player.x=600;enemy.x=596;
  const hp=enemy.hp;g.beginBlock();g.damagePlayer(23,enemy.x+enemy.w/2,enemy.id,"slash");
  assert.equal(g.events.recent.some(e=>e.type==="player_parried"),true);assert.ok(enemy.hp<hp);
});


test("026 按住K格挡受击后恢复普通挡，不自动重开弹反",()=>{
  const g=bufferGame();g.keyDown({code:"KeyK",preventDefault(){}});bufferSteps(g,8);
  assert.equal(g.player.parryArmed,0);const hp=g.player.hp;
  g.damagePlayer(12,g.player.x+100);const chip=hp-g.player.hp;
  assert.equal(g.player.blocking,false);assert.ok(g.player.hurt>0);bufferSteps(g,7);
  assert.equal(g.player.blocking,true);assert.equal(g.player.parryArmed,0);
  bufferSteps(g,16);g.damagePlayer(12,g.player.x+100);
  assert.ok(Math.abs(hp-g.player.hp-chip*2)<.00001);
  assert.equal(g.events.recent.filter(e=>e.type==="player_blocked").length,2);
  assert.equal(g.events.recent.some(e=>e.type==="player_parried"),false);
});


function interruptedGuard(g){
  g.keyDown({code:"KeyK",preventDefault(){}});g.player.parryArmed=0;
  g.damagePlayer(12,g.player.x+100);assert.equal(g.player.guardRecovery,true);
}
test("026 松手、暂停、销毁与新攻击意图取消受击后的防守恢复",()=>{
  for(const cancel of [g=>g.keyUp({code:"KeyK"}),g=>g.setPause(true),g=>g.destroy(),...['slash','qi','dao','dao2','dash'].map(a=>g=>g.performAction(a))]){
    const g=bufferGame();interruptedGuard(g);cancel(g);assert.equal(g.player.guardRecovery,false);
    if(!g.disposed){bufferSteps(g,8);assert.equal(g.player.blocking,false);}
  }
});
test("026 混合持有来源独立释放，最后一个松开才取消恢复",()=>{
  for(const releaseKeyboardFirst of [true,false]){
    const button=touchButton("block"),api=gameContext([button]),g=new api.BattleGame("fire",{practice:true});g.bindTouch();
    g.keyDown({code:"KeyK",preventDefault(){}});button.onpointerdown(pointer(9));g.player.parryArmed=0;g.damagePlayer(12,g.player.x+100);
    if(releaseKeyboardFirst)g.keyUp({code:"KeyK"});else button.onpointercancel(pointer(9));
    assert.equal(g.player.guardRecovery,true);bufferSteps(g,8);assert.equal(g.player.blocking,true);assert.equal(g.player.parryArmed,0);
    if(releaseKeyboardFirst)button.onpointercancel(pointer(9));else g.keyUp({code:"KeyK"});
    assert.equal(g.player.blocking,false);assert.equal(g.player.guardRecovery,false);
  }
});
test("026 未持有输入的技能格挡不延续，背击只恢复普通挡且死亡不残留",()=>{
  const skill=bufferGame();skill.beginBlock();skill.player.parryArmed=0;skill.damagePlayer(12,skill.player.x+100);bufferSteps(skill,8);assert.equal(skill.player.blocking,false);
  const back=bufferGame();back.keyDown({code:"KeyK",preventDefault(){}});back.damagePlayer(12,back.player.x-100);assert.equal(back.player.parryArmed,0);bufferSteps(back,8);assert.equal(back.player.blocking,true);assert.equal(back.player.parryArmed,0);
  const dead=bufferGame();dead.keyDown({code:"KeyK",preventDefault(){}});dead.damagePlayer(999,dead.player.x-100);assert.equal(dead.finished,true);assert.equal(dead.player.guardRecovery,false);
});


test("028 收招末尾持有K在窗口内恢复普通挡，不提前打断且不弹反",()=>{
  for(const field of ["qiCast","hurt","dash","slash"]){
    const g=bufferGame();g.player[field]=.09;g.player.combo=3;
    g.keyDown({code:"KeyK",preventDefault(){}});assert.equal(g.player.blocking,false);assert.equal(g.player[field],.09);
    bufferSteps(g,4);assert.equal(g.player.blocking,true,field);assert.equal(g.player.parryArmed,0);
  }
});


test("030 持有普通挡不因等待过期而丢失，新攻击/暂停仍取消",()=>{
  const long=bufferGame();long.player.hurt=.3;long.keyDown({code:"KeyK",preventDefault(){}});bufferSteps(long,15);assert.equal(long.player.blocking,true);assert.equal(long.guardInput,0);
  for(const cancel of [g=>g.keyUp({code:"KeyK"}),g=>g.setPause(true),g=>g.destroy(),...['slash','qi','dao','dao2','dash'].map(a=>g=>g.performAction(a))]){
    const g=bufferGame();g.player.qiCast=.09;g.keyDown({code:"KeyK",preventDefault(){}});assert.ok(g.guardInput);cancel(g);assert.equal(g.guardInput,0);
    if(!g.disposed){bufferSteps(g,12);assert.equal(g.player.blocking,false);}
  }
});
test("028 触控与键盘持有共用缓冲，最后来源松开取消，短按不遗留",()=>{
  for(const first of ["keyboard","touch"]){
    const b=touchButton("block"),api=gameContext([b]),g=new api.BattleGame("fire",{practice:true});g.bindTouch();g.player.qiCast=.09;
    g.keyDown({code:"KeyK",preventDefault(){}});b.onpointerdown(pointer(28));
    if(first==="keyboard")g.keyUp({code:"KeyK"});else b.onpointerup(pointer(28));
    bufferSteps(g,4);assert.equal(g.player.blocking,true);assert.equal(g.player.parryArmed,0);
    if(first==="keyboard")b.onpointerup(pointer(28));else g.keyUp({code:"KeyK"});assert.equal(g.player.blocking,false);
  }
  const g=bufferGame();g.player.qiCast=.09;g.keyDown({code:"KeyK",preventDefault(){}});g.keyUp({code:"KeyK"});bufferSteps(g,4);assert.equal(g.player.blocking,false);
});
test("028 立即合法的K保留原弹反，第三段未结束不可提前取消，帧率不改普通挡语义",()=>{
  const ready=bufferGame();ready.keyDown({code:"KeyK",preventDefault(){}});assert.equal(ready.player.parryArmed,.22);assert.equal(ready.player.parryLock,.5);
  for(const dt of [1/30,1/60,1/120]){
    const g=bufferGame();g.player.slash=.15;g.player.combo=3;g.keyDown({code:"KeyK",preventDefault(){}});
    g.update(dt);assert.equal(g.player.blocking,false);assert.ok(g.player.slash>0);
    for(let i=1;i<Math.ceil(.17/dt);i++)g.update(dt);
    assert.equal(g.player.blocking,true);assert.equal(g.player.parryArmed,0);assert.equal(g.player.parryLock,0);
  }
});


function realmBoss(realm,index=0){
  const api=gameContext(),g=new api.BattleGame(realm),boss=g.enemies.at(-1);g.enemies=[boss];g.player.x=600;boss.x=690;boss.face=-1;
  boss.bossMove=g.level.boss_moves[index];g.beginEnemyAttack(boss,boss.bossMove.id,boss.bossMove.windup);
  boss.attackTarget={x:g.player.x+g.player.w/2,y:g.player.y+g.player.h/2,foot:g.player.y+g.player.h};return {g,boss};
}
test("029 四境各两招共享循环，预警期间不命中，收招有空当且有效段只打一次",()=>{
  for(const realm of ["wood","earth","metal","water"])for(const dt of [1/30,1/60,1/120]){
    const {g,boss}=realmBoss(realm),hp=g.player.hp;const label=boss.bossMove.label;
    assert.match(g.enemyReadout(),new RegExp(label));
    let time=0;while(time+dt<boss.bossMove.windup){g.updateEnemies(dt);time+=dt;assert.equal(g.player.hp,hp);}
    for(let i=0;i<Math.ceil((boss.bossMove.active+.05)/dt);i++)g.updateEnemies(dt);
    assert.equal(g.events.recent.filter(e=>e.type==="player_hurt").length,1,realm+dt);
    assert.equal(boss.attackState,"recover");assert.ok(boss.attackTimer>.4);
    const after=g.player.hp;g.player.invuln=0;g.updateEnemies(.1);assert.equal(g.player.hp,after);
  }
});
test("029 木境缠根阵起手锁落点、有预警，可跳起/离开，源敌死亡取消",()=>{
  for(const avoid of ["jump","move","kill","stay"]){
    const {g,boss}=realmBoss("wood",1),locked=boss.attackTarget.x,hp=g.player.hp;g.updateEnemies(.66);
    assert.equal(g.enemyZones.length,1);const zone=g.enemyZones[0];assert.equal(zone.x+zone.w/2,locked);assert.match(g.enemyReadout(),/缠根阵/);
    g.updateEnemyZones(.7);assert.equal(g.player.hp,hp);
    if(avoid==="jump")g.player.onGround=false;if(avoid==="move")g.player.x+=250;if(avoid==="kill")boss.dead=true;
    g.updateEnemyZones(.06);g.updateEnemyZones(.02);
    assert.equal(g.player.hp<hp,avoid==="stay");
    if(avoid==="stay"){assert.equal(g.player.slowTime,.7);const after=g.player.hp;g.player.invuln=0;g.updateEnemyZones(.1);assert.equal(g.player.hp,after);}
    if(avoid==="kill")assert.equal(g.enemyZones.length,0);
  }
});
test("029 土境正面守势仅闲置/蓄力减伤，背击/收招/持续燃烧不被减免",()=>{
  for(const phase of ["idle","windup","recover"])for(const back of [false,true]){
    const {g,boss}=realmBoss("earth");boss.attackState=phase;g.player.x=back?800:600;
    const hp=boss.hp;g.hitEnemy(boss,20,false,false,"slash");assert.equal(hp-boss.hp,!back&&phase!=="recover"?14:20);
    const after=boss.hp;g.hitEnemy(boss,5,false,true,"lab_burn");assert.equal(after-boss.hp,5);
  }
});
test("029 金境突刺锁方向，远程招式锁起手目标，死敌不再出招",()=>{
  const {g,boss}=realmBoss("metal");const x=boss.x;g.player.x=900;g.updateEnemies(.66);assert.equal(boss.attackDirection,-1);assert.ok(boss.x<x);
  for(const realm of ["earth","metal","water"]){
    const {g,boss}=realmBoss(realm,1),target=JSON.stringify(boss.attackTarget);g.player.x=900;g.player.y-=120;
    g.updateEnemies(boss.bossMove.windup+.01);assert.equal(g.projectiles.length,1);assert.ok(g.projectiles[0].vx<0);assert.equal(JSON.stringify(boss.attackTarget),target);
    const dead=realmBoss(realm,1);dead.boss.dead=true;dead.g.updateEnemies(2);assert.equal(dead.g.projectiles.length,0);
  }
});
test("029 水境实际受伤才减速，弹反/闪避/无敌不被慢弹附带命中",()=>{
  for(const mode of ["hit","block","parry","dash","invuln"]){
    const g=bufferGame();g.realmKey="water";g.player.blocking=["block","parry"].includes(mode);g.player.parryArmed=mode==="parry"?.22:0;
    if(mode==="dash")g.player.dash=.15;if(mode==="invuln")g.player.invuln=.2;
    g.projectiles=[{owner:"enemy",type:"frost",source_id:"water-boss",x:g.player.x+25,y:g.player.y+20,w:20,h:18,vx:0,vy:0,life:1,damage:18,slow:.8}];
    g.updateProjectiles(.01);assert.equal(g.player.slowTime||0,["hit","block"].includes(mode)?.8:0,mode);
  }
});
test("029 四境首领远距主动使用第二招并追击，高台目标记录高度且不追踪转向",()=>{
  for(const realm of ["wood","earth","metal","water"]){
    const api=gameContext(),g=new api.BattleGame(realm),boss=g.enemies.at(-1);g.enemies=[boss];g.player.x=boss.x-500;g.player.y-=100;boss.attackCd=0;
    g.updateEnemies(.01);assert.equal(boss.attackState,"windup");assert.equal(boss.attackType,g.level.boss_moves[1].id);assert.equal(boss.attackTarget.y,g.player.y+g.player.h/2);
    const type=boss.attackType;g.player.x=boss.x+400;g.updateEnemies(.1);assert.equal(boss.attackType,type);assert.equal(boss.attackDirection,-1);
  }
});


test("030 近敌水平距离为只读中心距离，帮助判断短射程与绕背",()=>{
  const g=bufferGame(),e=g.enemies[0];const before=JSON.stringify({player:g.player,enemies:g.enemies});
  const distance=Math.round(Math.abs(e.x+e.w/2-g.player.x-g.player.w/2));assert.match(g.enemyReadout(),new RegExp('相距'+distance));assert.equal(JSON.stringify({player:g.player,enemies:g.enemies}),before);
  e.x=g.player.x+(g.player.w-e.w)/2;assert.match(g.enemyReadout(),/贴身.*相距0/);
});


test("030 持续K跨长动作/新受击仍待普通防守，松开后绝不自动举盾",()=>{
  for(const field of ['hurt','qiCast','slash','dash']){
    const g=bufferGame();g.player[field]=.35;g.player.combo=3;g.keyDown({code:'KeyK',preventDefault(){}});bufferSteps(g,6);assert.equal(g.player.blocking,false);bufferSteps(g,8);assert.equal(g.player.blocking,true,field);assert.equal(g.player.parryArmed,0);
  }
  const h=bufferGame();h.player.qiCast=.3;h.keyDown({code:'KeyK',preventDefault(){}});h.damagePlayer(12,h.player.x+100);bufferSteps(h,8);assert.equal(h.player.blocking,true);assert.equal(h.player.parryArmed,0);
  const released=bufferGame();released.player.hurt=.4;released.keyDown({code:'KeyK',preventDefault(){}});bufferSteps(released,8);released.keyUp({code:'KeyK'});bufferSteps(released,10);assert.equal(released.player.blocking,false);
});
