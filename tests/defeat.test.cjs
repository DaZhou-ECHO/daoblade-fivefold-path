const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function harness({ practice = false, deferredSave = false, labTrial=null, labCompiled=null, labService=null, realm="fire", seed=null, bossPractice=false } = {}) {
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
  if(seed!==null)vm.runInContext(`let pilotSeed=${seed}; Math.random=()=>((pilotSeed=(Math.imul(pilotSeed,1664525)+1013904223)>>>0)/4294967296);`,context);
  if(labService){if(labCompiled?.campaign)context.DaoBladeJourneyUI=labService;else context.DaoBladeArrayLabUI=labService;}
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
  const game = new context.api.BattleGame(realm, { practice,labTrial,labCompiled,bossPractice });
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


function arrayFixture(checkpoint=null){
  const cfg=require("../static/data/rules/array-lab-v1.json"),rules=require("../static/js/array-lab-rules.js").createRuntime(cfg);
  const build={stage:1,beads:structuredClone(cfg.beads),nodes:Object.fromEntries(cfg.nodes.map(n=>[n.id,["core","mark","burst"].includes(n.role)?"lab-"+n.role:null]))};
  const state={...build,ruleset_id:cfg.ruleset_id,rules_version:2,schema_version:2,progress:{runs:1,victories:0,spirit:0},active_trial:null};
  return {labTrial:{id:"test-array",realm_id:"fire",checkpoint,claimed_altars:["altar-1"],build},labCompiled:rules.compile(state)};
}
test("018 新阵盘正式战六敌、剑碑恢复与冻结技能，不写旧永久档",async()=>{
  const f=arrayFixture("swordstone"),h=harness({...f,labService:{trialAction:async()=>({state:{active_trial:null},receipt:{spirit:12,xp_awards:[{id:"lab-core",amount:20,level:2}]}})}});
  const before=JSON.stringify(h.api.state());h.game.start();
  assert.equal(h.game.practice,false);assert.equal(h.game.enemies.length,6);assert.equal(h.game.enemies.filter(e=>e.dead).length,3);
  assert.equal(h.game.player.x,1640);assert.equal(h.game.altars[0].taken,true);assert.equal(h.game.trial,null);
  assert.equal(h.game.snapshot.skill.burst,true);assert.equal(h.game.stats.primary,null);
  h.game.enemies.forEach(e=>{e.dead=true;});await h.game.finish(true);await h.game.finish(true);
  assert.equal(h.calls.modals,1);assert.equal(h.calls.saves.length,0);assert.deepEqual(h.calls.awards,[]);assert.equal(JSON.stringify(h.api.state()),before);
  assert.match(h.nodes.get("#result-message").textContent,/胜利已保存/);
});
test("018 剑碑必须实际清场到地面，等待保存时冻结且ACK后只回血一次",async()=>{
  const f=arrayFixture();let resolve,calls=0;
  const h=harness({...f,labService:{trialAction:async()=>{calls++;return new Promise(r=>{resolve=r;});}}});
  const g=h.game;g.player.x=1640;g.player.hp=10;g.updateCheckpoint();assert.equal(calls,0);
  g.enemies.slice(0,3).forEach(e=>{e.dead=true;});g.player.onGround=false;g.updateCheckpoint();assert.equal(calls,0);
  g.player.onGround=true;g.updateCheckpoint();assert.equal(calls,1);assert.equal(g.labPending,true);assert.equal(g.player.hp,10);
  const snapshot=JSON.stringify(g.player);g.update(.03);g.performAction("slash");assert.equal(JSON.stringify(g.player),snapshot);
  resolve({state:{active_trial:{...f.labTrial,checkpoint:"swordstone"}}});await new Promise(setImmediate);
  assert.equal(g.player.hp,g.stats.hpMax);g.player.hp=11;g.updateCheckpoint();assert.equal(g.player.hp,11);assert.equal(calls,1);
});
test("018 网络错误不发奖，重读重试同ID；销毁后迟到ACK不弹结算",async()=>{
  const f=arrayFixture();let fail=true,reads=0;const ids=[];
  const h=harness({...f,labService:{load:async()=>{reads++;},trialAction:async(action,payload)=>{ids.push(payload.trial_id);if(fail)throw new Error("offline");return {state:{active_trial:null},receipt:{spirit:12,xp_awards:[]}};}}});
  h.game.enemies.forEach(e=>{e.dead=true;});await h.game.finish(true);
  assert.equal(h.game.labError,true);assert.equal(h.calls.awards.length,0);assert.match(h.nodes.get("#result-title").textContent,/未确认/);
  fail=false;await h.game.restartLab();assert.equal(reads,1);assert.deepEqual(ids,["test-array","test-array"]);assert.equal(h.game.labError,false);
  let release;const other=harness({...arrayFixture(),labService:{trialAction:()=>new Promise(r=>{release=r;})}});
  const pending=other.game.finish(true);other.game.destroy();release({state:{active_trial:null},receipt:{spirit:12,xp_awards:[]}});await pending;assert.equal(other.calls.modals,0);
});


test("018 检查点失败保留同ID，无检查点失败关闭；都不发旧档经验",async()=>{
  for(const checkpoint of [null,"swordstone"]){
    const f=arrayFixture(checkpoint),h=harness({...f,labService:{trialAction:async()=>({state:{active_trial:checkpoint?f.labTrial:null},receipt:checkpoint?null:{outcome:"defeat",xp_awards:[]}})}});
    const pending=h.game.finish(false);h.complete();await pending;
    assert.equal(h.game.canContinueCheckpoint(),Boolean(checkpoint));assert.equal(h.calls.saves.length,0);assert.deepEqual(h.calls.awards,[]);
  }
});


test("021 木境使用木敌人与专属检查点，结果不串火且不写旧档",async()=>{
  const f=arrayFixture("swordstone");f.labTrial.realm_id="wood";
  const h=harness({...f,realm:"wood",labService:{trialAction:async()=>({state:{active_trial:null},receipt:{spirit:12,xp_awards:[]}})}});
  assert.equal(h.game.realmKey,"wood");assert.equal(h.game.trial,null);assert.equal(h.game.enemies.filter(e=>e.dead).length,3);
  assert.equal(h.game.enemies.at(-1).name,"青木药王");assert.equal(h.game.enemies.at(-1).maxHp,240);
  h.game.start();h.game.enemies.forEach(e=>{e.dead=true;});await h.game.finish(true);
  assert.match(h.nodes.get("#result-title").textContent,/古林药谷/);assert.equal(h.calls.saves.length,0);
  assert.equal(new h.api.BattleGame("wood").trial,null);
  assert.throws(()=>new h.api.BattleGame("fire",f),/不匹配/);
});


test("022 土金水新阵盘恢复原构筑与各自地图，胜利仅独立回执，旧档无检查点",async()=>{
  for(const [realm,name] of [["earth","荒山遗迹"],["metal","矿山剑冢"],["water","寒潭水府"]]){
    const f=arrayFixture("swordstone");f.labTrial.realm_id=realm;f.labTrial.claimed_altars=["altar-2"];
    const h=harness({...f,realm,labService:{trialAction:async()=>({state:{active_trial:null},receipt:{spirit:12,xp_awards:[]}})}});
    h.game.start();assert.equal(h.game.enemies.filter(e=>e.dead).length,3);assert.equal(h.game.player.x,1640);
    assert.equal(h.game.altars[1].taken,true);assert.equal(h.game.trial,null);assert.equal(h.game.stats.primary,null);
    h.game.enemies.forEach(e=>{e.dead=true;});await h.game.finish(true);assert.ok(h.nodes.get("#result-title").textContent.includes(name));
    assert.equal(h.calls.saves.length,0);assert.equal(h.calls.awards.length,0);assert.equal(new h.api.BattleGame(realm).checkpoint,undefined);
  }
});


function driveFrame(g){
  const p=g.player,enemy=g.nearestEnemy();if(!enemy||g.finished||g.labPending)return;
  const key=(code,held)=>{const has=g.keyboardKeys.has(({KeyA:'left',KeyD:'right',KeyK:'block'})[code]);if(held&&!has)g.keyDown({code,preventDefault(){}});if(!held&&has)g.keyUp({code,preventDefault(){}});};
  const tap=code=>{g.keyUp({code,preventDefault(){}});g.keyDown({code,preventDefault(){}});g.keyUp({code,preventDefault(){}});};
  const dx=enemy.x+enemy.w/2-p.x-p.w/2,dist=Math.abs(dx),dir=Math.sign(dx)||p.face;
  const needStone=g.labRun&&!g.labTrial.checkpoint&&g.enemies.slice(0,3).every(e=>e.dead);
  const target=needStone?1640:enemy.x+enemy.w/2-dir*72;
  let move=Math.abs(target-p.x-p.w/2)>12?Math.sign(target-p.x-p.w/2):0;
  // 高台上与地面敌人错层时，走向最近边缘落下，不悬空修改位置。
  if(p.onGround&&p.y+p.h<g.floorY-20&&Math.abs(enemy.y-p.y)>70){
    const ledge=g.platforms.find(v=>v.y<g.floorY&&Math.abs(p.y+p.h-v.y)<2&&p.x+p.w>v.x&&p.x<v.x+v.w);
    if(ledge)move=p.x+ p.w/2<ledge.x+ledge.w/2?-1:1;
  }
  const zone=g.enemyZones.some(z=>z.warning<.3&&p.x+p.w>z.x&&p.x<z.x+z.w);
  const jumpAttack=['dash','thrust'].includes(enemy.attackType)&&enemy.attackState==='windup'&&enemy.attackTimer<.22&&dist<300;
  const hazard=p.onGround&&p.y+p.h>g.floorY-2&&g.hazards.some(v=>p.x+p.w+move*55>v.x&&p.x+move*55<v.x+v.w);
  if((zone||jumpAttack||hazard)&&p.onGround)tap('Space');
  const imminent=enemy.attackState==='windup'&&enemy.attackTimer<.2&&dist<180&&!['vines','thrust','dash'].includes(enemy.attackType);
  const shot=g.projectiles.some(s=>s.owner==='enemy'&&Math.abs(s.y-p.y-25)<80&&(s.x-p.x)*s.vx<0&&Math.abs(s.x-p.x)<Math.abs(s.vx)*.18+40);
  const guard=imminent||shot||enemy.attackState==='strike'&&dist<160;
  if(guard){key('KeyA',false);key('KeyD',false);if(p.face!==dir){key(dir<0?'KeyA':'KeyD',true);key('KeyK',false);}else key('KeyK',true);return;}
  key('KeyK',false);
  if(p.face!==dir&&!needStone)move=dir;
  key('KeyA',move<0);key('KeyD',move>0);
  if(needStone||p.hurt>0||p.dash>0||p.qiCast>0||p.slash>0)return;
  if(dist<180&&p.face===dir&&Math.abs(enemy.y-p.y)<100){
    if(enemy.labMarks>=2&&p.skillCooldowns[1]===0&&p.qi>=24)tap('KeyE');
    else if(dist<=180&&p.skillCooldowns[0]===0&&p.qi>=12)tap('KeyQ');
    else if(dist<125&&p.slashCooldown===0)tap('KeyJ');
  }else if(dist<550&&p.face===dir&&p.qi>55&&p.qiCooldown===0)tap('KeyL');
}

test("029 全五境真实引擎输入驱动从入口至结算，不改血量位置或敌人死亡",async(t)=>{
  for(const [fps,seed] of [[30,2901],[60,2902],[120,2903]])for(const realm of ['wood','fire','earth','metal','water']){
    const f=arrayFixture();f.labTrial.realm_id=realm;f.labTrial.claimed_altars=[];const actions=[];
    const h=harness({...f,realm,seed,labService:{trialAction:async(action,payload)=>{
      actions.push({action,...payload});if(action==='checkpoint')f.labTrial.checkpoint='swordstone';
      if(action==='altar')f.labTrial.claimed_altars.push(payload.altar_id);
      return {state:{active_trial:action==='settle'?null:f.labTrial,beads:f.labTrial.build.beads},receipt:action==='settle'?{spirit:payload.win?12:0,xp_awards:[]}:null};
    }}});h.game.start();let frames=0;
    while(!h.game.finished&&frames<300*fps){driveFrame(h.game);h.game.update(1/fps);await Promise.resolve();frames++;}
    await new Promise(setImmediate);
    const result={realm,fps,seed,seconds:Math.round(frames/fps),outcome:h.game.lastOutcome||'timeout',hp:Math.round(h.game.player.hp),checkpoint:!!f.labTrial.checkpoint,living:h.game.enemies.filter(e=>!e.dead).map(e=>[e.id,Math.round(e.hp),Math.round(e.x)]),x:Math.round(h.game.player.x),actions};
    t.diagnostic(JSON.stringify(result));
    assert.equal(h.game.lastOutcome,'victory',JSON.stringify(result));assert.equal(h.calls.saves.length,0);
    assert.equal(actions.filter(a=>a.action==='settle'&&a.win).length,1);assert.equal(actions.filter(a=>a.action==='checkpoint').length,1);
  }
});


test("029 五境首领演练实际输入击败首领，无保存奖励，结果/暂停重试不转正式战",async()=>{
  for(const realm of ['wood','fire','earth','metal','water']){
    const f=arrayFixture(),h=harness({realm,bossPractice:true,labCompiled:f.labCompiled,seed:2908});const before=JSON.stringify(h.api.state());h.game.start();
    assert.equal(h.game.enemies.length,1);assert.equal(h.game.enemies[0].kind,'boss');assert.equal(h.game.altars.length,0);assert.equal(h.game.hazards.length,0);assert.equal(h.game.labRun,false);
    for(let i=0;i<6000&&!h.game.finished;i++){driveFrame(h.game);h.game.update(1/60);}
    await new Promise(setImmediate);assert.equal(h.game.lastOutcome,'victory',realm);assert.equal(h.calls.modals,1);assert.match(h.nodes.get('#result-title').textContent,/演练通过/);
    assert.equal(JSON.stringify(h.api.state()),before);assert.equal(h.calls.saves.length,0);assert.equal(h.calls.awards.length,0);
    h.api.bindUi();h.nodes.get('#retry-result').handlers.click({preventDefault(){}});let next=h.api.active();assert.equal(next.bossPractice,true);assert.equal(next.practice,true);assert.equal(next.labRun,false);assert.equal(next.realmKey,realm);
    h.nodes.get('#retry-run').handlers.click();next=h.api.active();assert.equal(next.bossPractice,true);assert.equal(next.enemies.length,1);
    next.quit();assert.equal(h.calls.panels.at(-1),'arraylab');assert.equal(JSON.stringify(h.api.state()),before);assert.equal(h.calls.saves.length,0);
  }
});


test("032 突破成功不再邀请重复突破，结算未确认时仍可重试确认",async()=>{
  const compiled=require('./helpers/journey-builds.json')[1];
  const trial={id:'result-032',realm_id:'fire',map_id:'ridge',breakthrough:true,checkpoint:null,claimed_altars:[]};
  const service={trialAction:async()=>({state:{active_trial:null,beads:[]},receipt:{spirit:-24,xp_awards:[],drops:[]}})};
  const h=harness({labTrial:trial,labCompiled:compiled,labService:service});
  await h.game.finish(true);assert.match(h.nodes.get('#result-title').textContent,/突破成功/);assert.equal(h.nodes.get('#retry-result').hidden,true);
  const bad=harness({labTrial:trial,labCompiled:compiled,labService:{trialAction:async()=>{throw Error('断线');}}});
  await bad.game.finish(true);assert.equal(bad.nodes.get('#retry-result').hidden,false);assert.match(bad.nodes.get('#result-title').textContent,/未确认/);
  const normal=new h.api.BattleGame('fire',{practice:true});normal.start();assert.equal(h.nodes.get('#retry-result').hidden,false);
});
