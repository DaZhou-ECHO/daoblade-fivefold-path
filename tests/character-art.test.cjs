const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { Renderer, validManifest, selectAction } = require("../static/js/character-art.js");

function manifest() {
  const action = (name, count, fps) => ({
    src: `/static/sprites/player/${name}.png`, frameCount: count, fps,
    frames: Array.from({ length: count }, (_, index) => ({
      hand: [44 + index % 3, 45 + index % 2], weaponAngle: -.4 + index * .05,
    })),
  });
  return {
    schemaVersion: 1, frameSize: [64, 96], foot: [32, 90],
    animations: { idle: action("idle", 4, 6), run: action("run", 8, 12) },
    weapon: { src: "/static/sprites/weapons/base/sword.png", size: [20, 64], grip: [10, 54] },
  };
}

function player(values = {}) {
  return {
    x: 120, y: 404, w: 38, h: 70, vx: 0, vy: 0, face: 1, animTime: 0,
    onGround: true, invuln: 0, slash: 0, blocking: false, qiCast: 0,
    dash: 0, hurt: 0, hp: 100, qi: 73, shield: 0, ...values,
  };
}

function imageType(data, override = () => ({})) {
  const sizes = Object.fromEntries([
    ...Object.values(data.animations).map(action => [action.src, [action.frameCount * 64, 96]]),
    [data.weapon.src, data.weapon.size],
  ]);
  return class ImageMock {
    set src(value) {
      this.source = value;
      const [width, height] = sizes[value];
      const changes = override(value);
      this.naturalWidth = changes.width ?? width;
      this.naturalHeight = changes.height ?? height;
      queueMicrotask(() => changes.fail ? this.onerror() : this.onload());
    }
  };
}

async function readyRenderer(data = manifest()) {
  const renderer = new Renderer();
  const loaded = await renderer.load(async url => {
    assert.equal(url, "/static/sprites/player/manifest.json");
    return { ok: true, json: async () => data };
  }, imageType(data));
  assert.equal(loaded, true);
  return renderer;
}

// 记录真实 Canvas 仿射变换，验证脚底和旋转后的剑柄是否在同一世界坐标。
function recordingContext() {
  const stack = [];
  let transform = [1, 0, 0, 1, 0, 0];
  const ctx = {
    images: [], rectangles: [], imageSmoothingEnabled: true, globalAlpha: 1,
    save() {
      stack.push({ transform: [...transform], alpha: this.globalAlpha, smooth: this.imageSmoothingEnabled });
    },
    restore() {
      const saved = stack.pop();
      assert.ok(saved, "Canvas restore 必须有对应的 save");
      transform = saved.transform; this.globalAlpha = saved.alpha; this.imageSmoothingEnabled = saved.smooth;
    },
    translate(x, y) {
      const [a, b, c, d, e, f] = transform;
      transform = [a, b, c, d, a * x + c * y + e, b * x + d * y + f];
    },
    scale(x, y) {
      const [a, b, c, d, e, f] = transform;
      transform = [a * x, b * x, c * y, d * y, e, f];
    },
    rotate(angle) {
      const [a, b, c, d, e, f] = transform;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      transform = [a * cos + c * sin, b * cos + d * sin,
        -a * sin + c * cos, -b * sin + d * cos, e, f];
    },
    drawImage(image, ...args) {
      this.images.push({ image, args, transform: [...transform], alpha: this.globalAlpha, smooth: this.imageSmoothingEnabled });
    },
    fillRect(...args) { this.rectangles.push(args); },
    strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {}, fill() {}, arc() {},
    get saveDepth() { return stack.length; },
  };
  return ctx;
}

function worldPoint(command, x, y) {
  const [a, b, c, d, e, f] = command.transform;
  return [a * x + c * y + e, b * x + d * y + f];
}

function closePoint(actual, expected) {
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9,
    `${actual} 应当与 ${expected} 重合`));
}

function gameContext(art, realm = "fire", state) {
  const ctx = recordingContext();
  const canvas = { width: 960, height: 540, getContext: () => ctx };
  const element = () => ({ textContent: "", innerHTML: "", style: {}, classList: { add() {}, remove() {}, toggle() {} } });
  const document = { querySelector: selector => selector === "#game-canvas" ? canvas : element(), querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
  const context = vm.createContext({
    document, window: { addEventListener() {}, removeEventListener() {}, scrollTo() {} },
    localStorage: { getItem: () => null, setItem() {} },
    performance: { now: () => 0 }, requestAnimationFrame() {}, setTimeout, clearTimeout, console,
    ...(art ? { DaoBladeCharacterArt: { renderer: art } } : {}),
  });
  require("./helpers/load-rules.cjs")(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "static", "js", "game.js"), "utf8")
    .replace(/\nbindUi\(\);\s*initializeSession\(\);\s*$/, "");
  vm.runInContext(`${source}\nthis.BattleGame = BattleGame; this.defaultState = DEFAULT_STATE;`, context);
  return { game: new context.BattleGame(realm, { practice: true, state }), ctx, defaultState: context.defaultState };
}

test("三段剑双向逐相位握点对齐、脚底固定、收招回位且渲染不写入战斗数据", async () => {
  const renderer = await readyRenderer();
  for (const face of [-1, 1]) for (const combo of [1, 2, 3]) {
    const duration = combo === 3 ? .36 : .28;
    const angles = [];
    for (const progress of [0, .16, .3, .5, .7, .99, 1 - 1e-8]) {
      const current = player({ face, combo, slashDuration: duration, slash: duration * (1 - progress) });
      const before = structuredClone(current), ctx = recordingContext();
      renderer.draw(ctx, current);
      const frame = renderer.frame(current);
      const [legs, body, sword, hand] = ctx.images;
      angles.push(frame.weaponAngle);
      closePoint(worldPoint(legs, 0, 0), [139, 474]);
      const expectedHand = worldPoint(body, frame.hand[0] - 32, frame.hand[1] - 90);
      closePoint(worldPoint(sword, sword.args[0] + 10, sword.args[1] + 54), expectedHand);
      closePoint(worldPoint(hand, frame.hand[0] - 32, frame.hand[1] - 90), expectedHand);
      assert.deepEqual(current, before);
      assert.equal(ctx.saveDepth, 0);
      assert.equal(frame.index, 0, "攻击姿势不能随无关 animTime 切换");
    }
    assert.ok(Math.max(...angles) - Math.min(...angles) > 2);
    assert.ok(Math.abs(angles[0] - angles.at(-1)) < 1e-6);
    assert.ok(Math.abs(renderer.frame(player({ slash: 1e-10, slashDuration: duration, combo })).lean) < 1e-6);
  }
});

test("真实三连击、格挡反击、跳跃、闪避、剑气与受击结束后恢复新人物", async () => {
  const renderer = await readyRenderer();
  const { game, ctx } = gameContext(renderer);
  const assertAction = action => {
    assert.equal(renderer.frame(game.player).action, action);
    assert.equal(game.characterArt.draw(ctx, game.player), true);
    assert.equal(ctx.saveDepth, 0);
  };
  game.slash(); assertAction("slash");
  game.update(.18); game.slash(); game.update(.15);
  assert.equal(game.player.combo, 2); assertAction("slash");
  game.update(.18); game.slash(); game.update(.15);
  assert.equal(game.player.combo, 3); assertAction("slash");
  for (let i = 0; i < 35; i += 1) game.update(.02);
  assertAction("idle");
  game.beginBlock(); assertAction("block");
  game.damagePlayer(12, game.player.x + 90);
  assert.ok(game.player.blockFlash > 0); assertAction("block");
  game.slash(); assert.ok(game.player.counterAttack); assertAction("slash");
  for (let i = 0; i < 35; i += 1) game.update(.02);
  game.dash(); assertAction("dash");
  for (let i = 0; i < 15; i += 1) game.update(.02);
  game.swordQi(); assertAction("qi");
  for (let i = 0; i < 20; i += 1) game.update(.02);
  game.player.jumpBuffer = .1; game.tryJump(); assertAction("jump");
  for (let i = 0; i < 25; i += 1) game.update(.02);
  assertAction("fall");
  for (let i = 0; i < 35; i += 1) game.update(.02);
  game.damagePlayer(10, game.player.x - 80); assertAction("hurt");
  for (let i = 0; i < 40; i += 1) game.update(.02);
  assertAction("idle");
});

test("五境重建与序列化存档恢复保留五行快照，复用同一美术与38×70碰撞箱", async () => {
  const renderer = await readyRenderer();
  const { defaultState } = gameContext(renderer);
  for (const realm of ["metal", "wood", "water", "fire", "earth"]) {
    const state = defaultState();
    state.cultivation.qian[0] = { id: "saved-bead", name: "试炼珠", element: realm, quality: 1, level: 3, xp: 0, affixes: [] };
    const restored = JSON.parse(JSON.stringify(state));
    const before = JSON.stringify(restored);
    const { game, ctx } = gameContext(renderer, realm, restored);
    assert.equal(game.stats.primary, realm);
    assert.equal(game.characterArt, renderer);
    assert.equal(game.player.w, 38); assert.equal(game.player.h, 70);
    game.slash();
    const combat = JSON.stringify(game.player);
    game.drawPlayer(ctx, game.player);
    assert.equal(ctx.images[2].image, renderer.images.weapon);
    assert.equal(JSON.stringify(game.player), combat);
    assert.equal(JSON.stringify(restored), before);
  }
});

test("无 Image 或 fetch 时保留可用的未加载回退状态", async () => {
  const renderer = new Renderer();
  assert.equal(await renderer.load(async () => { throw new Error("不应发请求"); }, null), false);
  assert.equal(await renderer.load(null, class {}), false);
  assert.equal(renderer.status, "unloaded");
  assert.equal(renderer.draw(recordingContext(), player()), false);
});

test("素材加载只请求一次，校验精灵表与独立剑的尺寸", async () => {
  const data = manifest();
  const renderer = new Renderer();
  let calls = 0;
  const fetcher = async () => { calls += 1; return { ok: true, json: async () => data }; };
  const first = renderer.load(fetcher, imageType(data));
  assert.equal(renderer.load(fetcher, imageType(data)), first);
  assert.equal(await first, true);
  assert.equal(calls, 1);
  assert.equal(renderer.status, "ready");
  assert.equal(renderer.images.idle.naturalWidth, 256);
  assert.equal(renderer.images.run.naturalWidth, 512);
  assert.equal(renderer.images.weapon.naturalHeight, 64);
});

test("清单拒绝外部路径、越界锚点及不合法帧数据", () => {
  assert.equal(validManifest(manifest()), true);
  const mutations = [
    data => { data.animations.idle.src = "https://example.com/idle.png"; },
    data => { data.weapon.src = "/static/sprites/../private.png"; },
    data => { data.foot = [32, 96]; },
    data => { data.weapon.grip = [20, 54]; },
    data => { data.animations.run.frames.pop(); },
    data => { data.animations.idle.frames[0].hand = [-1, 30]; },
    data => { data.animations.run.fps = Infinity; },
  ];
  for (const mutate of mutations) {
    const data = manifest(); mutate(data); assert.equal(validManifest(data), false);
  }
});

test("网络、JSON、图像下载和图像尺寸失败不会使加载 Promise 抛错", async t => {
  const data = manifest();
  const cases = [
    ["网络错误", async () => { throw new Error("offline"); }, imageType(data)],
    ["HTTP错误", async () => ({ ok: false }), imageType(data)],
    ["非法JSON", async () => ({ ok: true, json: async () => { throw new SyntaxError("bad json"); } }), imageType(data)],
    ["非法字段", async () => ({ ok: true, json: async () => ({}) }), imageType(data)],
    ["图像错误", async () => ({ ok: true, json: async () => data }), imageType(data, src => ({ fail: src === data.weapon.src }))],
    ["精灵表尺寸不符", async () => ({ ok: true, json: async () => data }), imageType(data, src => src === data.animations.run.src ? { width: 511 } : {})],
    ["剑素材尺寸不符", async () => ({ ok: true, json: async () => data }), imageType(data, src => src === data.weapon.src ? { height: 63 } : {})],
  ];
  for (const [name, fetcher, ImageType] of cases) {
    await t.test(name, async () => {
      const renderer = new Renderer();
      assert.equal(await renderer.load(fetcher, ImageType), false);
      assert.equal(renderer.status, "failed");
      assert.deepEqual(renderer.images, {});
      assert.equal(renderer.draw(recordingContext(), player()), false);
    });
  }
});

test("待机跑动按动画时间选帧，帧循环和异常时间均不越界", async () => {
  const renderer = await readyRenderer();
  assert.equal(renderer.frame(player({ animTime: .5 })).index, 3);
  assert.equal(renderer.frame(player({ animTime: 4 / 6 })).index, 0);
  assert.equal(renderer.frame(player({ vx: 100, animTime: .5 })).index, 6);
  assert.equal(renderer.frame(player({ vx: -100, animTime: 8 / 12 })).index, 0);
  assert.equal(renderer.frame(player({ animTime: NaN })).index, 0);
  assert.equal(renderer.frame(player({ animTime: -5 })).index, 0);
  assert.equal(selectAction(player({ vx: 35 })), "idle");
  assert.equal(selectAction(player({ vx: -36 })), "run");
});

test("全部战斗状态使用同一人物和独立剑，优先级覆盖空中攻击与受击打断", async () => {
  const renderer = await readyRenderer();
  for (const [action, values] of [
    ["jump", { onGround: false, vy: -100 }], ["fall", { onGround: false, vy: 100 }],
    ["slash", { onGround: false, slash: .2, slashDuration: .28, combo: 1 }],
    ["block", { blocking: true, blockFlash: .2 }], ["qi", { qiCast: .1 }],
    ["dash", { dash: .2 }], ["hurt", { hurt: .1, slash: .2 }], ["death", { hp: 0, hurt: .1 }],
  ]) {
    const current = player({ vx: 100, ...values });
    const ctx = recordingContext();
    assert.equal(selectAction(current), action);
    assert.equal(renderer.draw(ctx, current), true);
    assert.equal(ctx.images.length, 4);
    assert.equal(ctx.images[0].image, renderer.images.idle);
    assert.equal(ctx.images[2].image, renderer.images.weapon);
    assert.equal(ctx.saveDepth, 0);
  }
  assert.equal(renderer.draw({}, player()), false);
});

test("左右全部动画帧脚底固定，旋转后的剑柄与每帧握点重合", async () => {
  const data = manifest(), renderer = await readyRenderer(data);
  for (const face of [1, -1]) {
    for (const [action, animation] of Object.entries(data.animations)) {
      for (let index = 0; index < animation.frameCount; index += 1) {
        const current = player({ face, vx: action === "run" ? 100 : 0, animTime: (index + .1) / animation.fps });
        const ctx = recordingContext();
        assert.equal(renderer.draw(ctx, current), true);
        assert.equal(ctx.images.length, 3);
        const [body, sword] = ctx.images;
        const foot = [current.x + current.w / 2, current.y + current.h];
        closePoint(worldPoint(body, body.args[4] + data.foot[0], body.args[5] + data.foot[1]), foot);
        const hand = animation.frames[index].hand;
        const expectedHand = [foot[0] + face * (hand[0] - data.foot[0]), foot[1] + hand[1] - data.foot[1]];
        closePoint(worldPoint(sword, sword.args[0] + data.weapon.grip[0], sword.args[1] + data.weapon.grip[1]), expectedHand);
        assert.equal(body.args[0], index * 64);
        assert.equal(ctx.saveDepth, 0);
      }
    }
  }
});

test("渲染不改变玩家数据，并恢复透明度和图像平滑状态", async () => {
  const renderer = await readyRenderer();
  const current = player({ invuln: .16, face: -1, vx: 100, animTime: .2 });
  const before = structuredClone(current);
  const ctx = recordingContext();
  ctx.globalAlpha = .75;
  assert.equal(renderer.draw(ctx, current), true);
  assert.deepEqual(current, before);
  assert.ok(ctx.images.every(command => command.alpha === .38 && command.smooth === false));
  assert.equal(ctx.globalAlpha, .75);
  assert.equal(ctx.imageSmoothingEnabled, true);
  assert.equal(ctx.saveDepth, 0);
});

test("剑图绘制异常关闭 PNG 渲染并完整恢复嵌套 Canvas 状态", async () => {
  const renderer = await readyRenderer();
  const ctx = recordingContext();
  const originalDraw = ctx.drawImage.bind(ctx);
  ctx.drawImage = (...args) => {
    originalDraw(...args);
    if (ctx.images.length === 2) throw new Error("模拟剑素材绘制失败");
  };
  const current = player(), before = structuredClone(current);
  let result;
  assert.doesNotThrow(() => { result = renderer.draw(ctx, current); });
  assert.equal(result, false);
  assert.equal(renderer.status, "failed");
  assert.equal(ctx.saveDepth, 0);
  assert.deepEqual(current, before);
  assert.equal(renderer.draw(ctx, current), false);
  assert.equal(ctx.images.length, 2, "后续绘制不应重试损坏的图片路径");
});

test("真实游戏入口在模块缺省和资源未就绪时使用完整 Canvas 角色", () => {
  for (const art of [null, new Renderer()]) {
    const { game, ctx } = gameContext(art);
    const before = JSON.stringify(game.player);
    assert.doesNotThrow(() => game.drawPlayer(ctx, game.player));
    assert.ok(ctx.rectangles.length > 10);
    assert.equal(ctx.images.length, 0);
    assert.equal(JSON.stringify(game.player), before);
    assert.equal(game.player.w, 38);
    assert.equal(game.player.h, 70);
    assert.equal(game.player.y + game.player.h, game.floorY);
    assert.equal(ctx.saveDepth, 0);
  }
});

test("真实游戏入口攻击保持新人物和独立剑，不回到旧角色且不改变战斗状态", async () => {
  const renderer = await readyRenderer();
  const { game, ctx } = gameContext(renderer);
  let fallbackCalls = 0;
  const fallback = game.drawPlayerCanvas;
  game.drawPlayerCanvas = function (...args) {
    fallbackCalls += 1;
    return fallback.apply(this, args);
  };
  const before = JSON.stringify(game.player);
  game.drawPlayer(ctx, game.player);
  assert.equal(ctx.images.length, 3);
  assert.equal(fallbackCalls, 0);
  assert.equal(JSON.stringify(game.player), before);
  ctx.images.length = 0;
  game.slash();
  const attacking = JSON.stringify(game.player);
  game.drawPlayer(ctx, game.player);
  assert.equal(ctx.images.length, 4);
  assert.equal(fallbackCalls, 0);
  assert.equal(ctx.images[2].image, renderer.images.weapon);
  assert.equal(JSON.stringify(game.player), attacking);
});

test("真实游戏入口遇到剑图绘制异常立即回退，下一次绘制仍能继续", async () => {
  const renderer = await readyRenderer();
  const { game, ctx } = gameContext(renderer);
  const originalDraw = ctx.drawImage.bind(ctx);
  ctx.drawImage = (...args) => {
    originalDraw(...args);
    if (ctx.images.length === 2) throw new Error("模拟浏览器 drawImage 异常");
  };
  let fallbackCalls = 0;
  const fallback = game.drawPlayerCanvas;
  game.drawPlayerCanvas = function (...args) {
    fallbackCalls += 1;
    return fallback.apply(this, args);
  };
  const before = JSON.stringify(game.player);
  assert.doesNotThrow(() => game.drawPlayer(ctx, game.player));
  assert.equal(fallbackCalls, 1);
  assert.equal(renderer.status, "failed");
  assert.equal(ctx.saveDepth, 0);
  assert.ok(ctx.rectangles.length > 10);
  assert.doesNotThrow(() => game.drawPlayer(ctx, game.player));
  assert.equal(fallbackCalls, 2);
  assert.equal(ctx.images.length, 2);
  assert.equal(ctx.saveDepth, 0);
  assert.equal(JSON.stringify(game.player), before);
});

test("倒地逐阶段双向旋转整个人与同一把剑，握点重合且不改实体状态", async () => {
  const renderer = await readyRenderer();
  for (const face of [-1, 1]) {
    const angles = [];
    for (const progress of [0, .18, .42, .6, .78, .9, 1]) {
      const current = player({ hp: 0, invuln: .16, face, deathTime: progress * 1.05, deathDrop: 0 });
      const before = structuredClone(current), ctx = recordingContext();
      assert.equal(renderer.draw(ctx, current), true);
      const frame = renderer.frame(current);
      const [legs, body, sword, hand] = ctx.images;
      assert.equal(legs.image, renderer.images.idle);
      assert.equal(sword.image, renderer.images.weapon);
      closePoint(worldPoint(sword, sword.args[0] + 10, sword.args[1] + 54),
        worldPoint(body, frame.hand[0] - 32, frame.hand[1] - 90));
      closePoint(worldPoint(hand, frame.hand[0] - 32, frame.hand[1] - 90),
        worldPoint(body, frame.hand[0] - 32, frame.hand[1] - 90));
      assert.ok(ctx.images.every(command => command.alpha === 1), "死亡不冻结在受击闪烁的半透明状态");
      assert.equal(ctx.saveDepth, 0);
      assert.deepEqual(current, before);
      angles.push(frame.rootAngle);
    }
    assert.equal(angles[0], 0);
    assert.ok(angles[1] < 0, "先有受击后仰");
    assert.ok(angles[2] > 0, "再失衡前倾");
    assert.ok(Math.abs(angles.at(-1) - Math.PI / 2) < 1e-9, "最终全身横卧");
  }
});

test("模块缺省时倒地也能安全绘制且不会改动碰撞箱", () => {
  for (const face of [-1, 1]) {
    const { game, ctx } = gameContext(null);
    Object.assign(game.player, { hp: 0, deathTime: 1.05, deathDrop: 12, face });
    const before = JSON.stringify(game.player);
    assert.doesNotThrow(() => game.drawPlayer(ctx, game.player));
    assert.ok(ctx.rectangles.length > 10);
    assert.equal(ctx.saveDepth, 0);
    assert.equal(JSON.stringify(game.player), before);
    assert.equal(game.player.w, 38); assert.equal(game.player.h, 70);
  }
});
