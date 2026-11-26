"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const woodInk = require(path.join(__dirname, "..", "static", "js", "wood-ink.js"));

function recordingContext() {
  const calls = [];
  const gradient = { addColorStop() {} };
  const ctx = {
    calls,
    globalAlpha: 1,
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    save() { calls.push(["save"]); },
    restore() { calls.push(["restore"]); },
    beginPath() { calls.push(["beginPath"]); },
    moveTo(...a) { calls.push(["moveTo", ...a]); },
    lineTo(...a) { calls.push(["lineTo", ...a]); },
    quadraticCurveTo(...a) { calls.push(["quadraticCurveTo", ...a]); },
    arc(...a) { calls.push(["arc", ...a]); },
    ellipse(...a) { calls.push(["ellipse", ...a]); },
    stroke() { calls.push(["stroke"]); },
    fill() { calls.push(["fill"]); },
    fillRect(...a) { calls.push(["fillRect", ...a]); },
    createLinearGradient(...a) { calls.push(["gradient", ...a]); return gradient; },
  };
  return ctx;
}

function baseRenderer(log) {
  return class Base {
    drawBackground(ctx, t, realm, camera, width, height, elapsed) {
      log.push(["background", realm, camera, width, height, elapsed]);
      return true;
    }
    draw(ctx, realm, state) {
      log.push(["draw", realm, state.family, state.phase]);
      return true;
    }
  };
}

test.beforeEach(() => woodInk.reset());

test("墨点位置可复现，且随时间移动", () => {
  const first = woodInk.inkSpecks(12.5, 400, 960);
  const same = woodInk.inkSpecks(12.5, 400, 960);
  const later = woodInk.inkSpecks(13.5, 400, 960);
  assert.deepEqual(first, same);
  assert.notDeepEqual(first, later);
  assert.ok(first.every(s => Number.isInteger(s.x) && Number.isInteger(s.y)));
  assert.ok(first.every(s => s.x >= -20 && s.x <= 940));
});

test("Boss 水墨形体只覆盖起手、攻击与受击", () => {
  const boss = { family: "boss", phase: "windup", progress: 0.5, face: 1, x: 0, y: 0, w: 100, h: 120 };
  assert.equal(woodInk.bossInkShape(boss).kind, "charge");
  assert.equal(woodInk.bossInkShape({ ...boss, phase: "strike" }).kind, "slash");
  assert.equal(woodInk.bossInkShape({ ...boss, phase: "recover" }), null);
  assert.equal(woodInk.bossInkShape({ ...boss, family: "guard" }), null);
  assert.equal(woodInk.bossInkShape({ ...boss, dead: true }), null);
});

test("场景包装器只在木境追加水墨环境层", () => {
  const log = [];
  const Wrapped = woodInk.wrapScene(baseRenderer(log));
  const renderer = new Wrapped();
  const ctx = recordingContext();
  renderer.drawBackground(ctx, {}, "wood", 0, 960, 540, 3);
  const woodCalls = ctx.calls.length;
  renderer.drawBackground(ctx, {}, "fire", 0, 960, 540, 3);
  assert.equal(ctx.calls.length, woodCalls, "其他五行不得追加绘制");
  assert.ok(woodCalls > 0);
  assert.deepEqual(log[0].slice(0, 2), ["background", "wood"]);
  assert.equal(woodInk.state.atmosphere, 1);
});

test("Boss 只在木境起手/攻击/受击时得到水墨笔触", () => {
  const log = [];
  const Wrapped = woodInk.wrapEnemy(baseRenderer(log));
  const renderer = new Wrapped();
  const boss = { family: "boss", phase: "windup", progress: 0.4, face: -1, x: 100, y: 200, w: 80, h: 120 };
  const ctx = recordingContext();

  renderer.draw(ctx, "fire", boss);
  assert.equal(ctx.calls.length, 0, "非木境不该有笔触");

  renderer.draw(ctx, "wood", boss);
  assert.ok(ctx.calls.length > 0);
  assert.equal(woodInk.state.telegraphs, 1);

  const idle = recordingContext();
  renderer.draw(idle, "wood", { ...boss, phase: "idle" });
  assert.equal(idle.calls.length, 0, "待机不画预警");

  const guard = recordingContext();
  renderer.draw(guard, "wood", { ...boss, family: "guard" });
  assert.equal(guard.calls.length, 0, "普通怪不加 Boss 笔触");
});

test("绘制异常只让水墨层失效，不影响原渲染", () => {
  const log = [];
  const Wrapped = woodInk.wrapScene(baseRenderer(log));
  const renderer = new Wrapped();
  const broken = { save() { throw new Error("ctx broken"); } };
  assert.equal(renderer.drawBackground(broken, {}, "wood", 0, 960, 540, 1), true);
  assert.equal(woodInk.state.disabled, true);
  const ctx = recordingContext();
  renderer.drawBackground(ctx, {}, "wood", 0, 960, 540, 2);
  assert.equal(ctx.calls.length, 0, "失效后不再重试");
});

test("install() 包装现有 Renderer 且保留原类行为", () => {
  const log = [];
  const target = {
    DaoBladeSceneArt: { Renderer: baseRenderer(log) },
    DaoBladeEnemyArt: { Renderer: baseRenderer(log) },
  };
  woodInk.install(target);
  const scene = new target.DaoBladeSceneArt.Renderer();
  const enemy = new target.DaoBladeEnemyArt.Renderer();
  assert.equal(scene.drawBackground(recordingContext(), {}, "wood", 0, 960, 540, 1), true);
  assert.equal(enemy.draw(recordingContext(), "wood", { family: "boss", phase: "hurt", x: 0, y: 0, w: 10, h: 10, progress: 1 }), true);
  assert.equal(log.length, 2);
});
