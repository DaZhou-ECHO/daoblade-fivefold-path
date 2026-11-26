"use strict";
/**
 * 木境专属水墨表现层（052）。
 *
 * 设计边界：
 * - 只在 realm === "wood" 时介入；其他四境、玩家、UI、碰撞、伤害和 AI 一律不碰；
 * - 通过包装现有 scene-art / enemy-art 的 Renderer 类接入，不修改它们的源码；
 * - 不消耗游戏的 Math.random，粒子和笔触位置由 elapsed 与固定种子推导；
 * - 所有绘制都是装饰性的：真正的攻击预警仍是敌方原有的黄色标记与攻击时序，
 *   水墨笔触不宣称、也不改变任何攻击范围；
 * - 任何异常都只让本层失效一次，不影响战斗与既有画面的回退。
 */
(function(root) {
  const WOOD = "wood";
  const INK = "#141c1a";
  const MIST = "rgba(226,224,206,";
  const SEAL = "rgba(164,58,45,";
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function hash32(value) {
    let h = value | 0;
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function rand(seed, index) {
    return hash32(seed + Math.imul(index + 1, 2654435761)) / 4294967296;
  }

  /** 飘浮墨点/孢子：位置只由时间与相机决定，可复现、可测试。 */
  function inkSpecks(elapsed, camera, width, count = 9) {
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const speed = 6 + rand(7, i) * 10;
      const span = width + 40;
      const drift = (rand(11, i) * span - camera * (0.12 + rand(13, i) * 0.1) - elapsed * speed) % span;
      out.push(Object.freeze({
        x: Math.round(((drift % span) + span) % span - 20),
        y: Math.round(120 + rand(17, i) * 210 + Math.sin(elapsed * 0.6 + i) * 7),
        size: rand(19, i) > 0.72 ? 3 : 2,
        alpha: 0.08 + rand(23, i) * 0.1,
      }));
    }
    return out;
  }

  /** Boss 水墨预警的形体：只跟姿态进度走，不读取也不改变攻击数值。 */
  function bossInkShape(state) {
    if (!state || state.family !== "boss" || state.dead) return null;
    const direction = state.face < 0 ? -1 : 1;
    const progress = clamp(state.progress || 0, 0, 1);
    if (state.phase === "windup") {
      return Object.freeze({ kind: "charge", direction, progress,
        radius: 10 + Math.round(progress * 26), alpha: 0.12 + progress * 0.22 });
    }
    if (state.phase === "strike") {
      return Object.freeze({ kind: "slash", direction, progress,
        length: 26 + Math.round(progress * 34), alpha: 0.3 - progress * 0.12 });
    }
    if (state.hurt) {
      return Object.freeze({ kind: "splash", direction, progress: 1,
        radius: 5 + Math.round((state.hurtTime || 0) * 8), alpha: 0.26 });
    }
    return null;
  }

  function drawAtmosphere(ctx, options) {
    const { camera = 0, width = 960, height = 540, elapsed = 0 } = options || {};
    ctx.save();
    try {
      // 地平线附近一道极淡的墨气，压住背景与地面之间的硬边。
      const wash = ctx.createLinearGradient(0, 330, 0, 430);
      wash.addColorStop(0, MIST + "0)");
      wash.addColorStop(0.45, MIST + "0.05)");
      wash.addColorStop(1, MIST + "0)");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 330, width, 100);
      // 两侧轻暗角，只压环境，不覆盖 HUD 与角色。
      const left = ctx.createLinearGradient(0, 0, 90, 0);
      left.addColorStop(0, "rgba(10,16,14,0.16)");
      left.addColorStop(1, "rgba(10,16,14,0)");
      ctx.fillStyle = left;
      ctx.fillRect(0, 0, 90, Math.min(height, 430));
      const right = ctx.createLinearGradient(width - 90, 0, width, 0);
      right.addColorStop(0, "rgba(10,16,14,0)");
      right.addColorStop(1, "rgba(10,16,14,0.16)");
      ctx.fillStyle = right;
      ctx.fillRect(width - 90, 0, 90, Math.min(height, 430));
      for (const speck of inkSpecks(elapsed, camera, width)) {
        ctx.globalAlpha = speck.alpha;
        ctx.fillStyle = INK;
        ctx.fillRect(speck.x, speck.y, speck.size, speck.size);
      }
    } finally {
      ctx.restore();
    }
  }

  function drawBossInk(ctx, state) {
    const shape = bossInkShape(state);
    if (!shape) return false;
    const bx = Math.round(state.x + state.w / 2);
    const by = Math.round(state.y + state.h);
    ctx.save();
    try {
      ctx.globalAlpha = shape.alpha;
      ctx.strokeStyle = INK;
      ctx.fillStyle = INK;
      if (shape.kind === "charge") {
        // 脚下墨池逐渐晕开 + 面朝方向的短笔触：方向提示，不是范围标尺。
        ctx.beginPath();
        ctx.ellipse(bx, by - 2, shape.radius, Math.max(3, Math.round(shape.radius * 0.32)), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i += 1) {
          const offset = i * 6 - 6;
          ctx.beginPath();
          ctx.moveTo(bx + shape.direction * 8, Math.round(by - 24 + offset));
          ctx.lineTo(bx + shape.direction * (8 + 10 + shape.progress * 10), Math.round(by - 24 + offset * 0.6));
          ctx.stroke();
        }
      } else if (shape.kind === "slash") {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx + shape.direction * 6, Math.round(by - state.h * 0.62));
        ctx.quadraticCurveTo(bx + shape.direction * (14 + shape.length * 0.5),
          Math.round(by - state.h * 0.5),
          bx + shape.direction * (10 + shape.length), Math.round(by - state.h * 0.24));
        ctx.stroke();
        ctx.globalAlpha = shape.alpha * 0.5;
        ctx.fillRect(Math.round(bx + shape.direction * (10 + shape.length)), Math.round(by - state.h * 0.3), 3, 3);
      } else {
        // 受击溅墨：固定角度分布，读数稳定。
        for (let i = 0; i < 5; i += 1) {
          const angle = (Math.PI * 2 * i) / 5 + 0.6;
          const px = Math.round(bx + Math.cos(angle) * (6 + shape.radius));
          const py = Math.round(by - state.h * 0.5 + Math.sin(angle) * (4 + shape.radius));
          ctx.beginPath();
          ctx.ellipse(px, py, 2 + (i % 2), 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } finally {
      ctx.restore();
    }
    return true;
  }

  const state = { disabled: false, atmosphere: 0, telegraphs: 0 };

  function wrapScene(Base) {
    if (typeof Base !== "function") return Base;
    return class WoodScene extends Base {
      drawBackground(ctx, t, realm, camera, width, height, elapsed, journey, worldWidth) {
        const drawn = super.drawBackground(ctx, t, realm, camera, width, height, elapsed, journey, worldWidth);
        if (!drawn || realm !== WOOD || state.disabled) return drawn;
        try {
          drawAtmosphere(ctx, { camera, width, height, elapsed });
          state.atmosphere += 1;
        } catch (_) {
          state.disabled = true;
        }
        return drawn;
      }
    };
  }

  function wrapEnemy(Base) {
    if (typeof Base !== "function") return Base;
    return class WoodEnemy extends Base {
      draw(ctx, realm, enemyState, options) {
        const drawn = super.draw(ctx, realm, enemyState, options);
        if (!drawn || realm !== WOOD || state.disabled) return drawn;
        if (enemyState && enemyState.family === "boss" && (enemyState.phase === "windup" || enemyState.phase === "strike" || enemyState.hurt)) {
          try {
            if (drawBossInk(ctx, enemyState)) state.telegraphs += 1;
          } catch (_) {
            state.disabled = true;
          }
        }
        return drawn;
      }
    };
  }

  function install(target = root) {
    if (target.DaoBladeSceneArt && target.DaoBladeSceneArt.Renderer) {
      target.DaoBladeSceneArt.Renderer = wrapScene(target.DaoBladeSceneArt.Renderer);
    }
    if (target.DaoBladeEnemyArt && target.DaoBladeEnemyArt.Renderer) {
      target.DaoBladeEnemyArt.Renderer = wrapEnemy(target.DaoBladeEnemyArt.Renderer);
    }
    return target;
  }

  const api = { WOOD, inkSpecks, bossInkShape, drawAtmosphere, drawBossInk,
    wrapScene, wrapEnemy, install, state, reset() { state.disabled = false; state.atmosphere = 0; state.telegraphs = 0; } };
  root.DaoBladeWoodInk = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  // 浏览器里脚本在 enemy-art/scene-art 之后、game.js 之前加载，直接接管两个 Renderer。
  if (root.DaoBladeSceneArt || root.DaoBladeEnemyArt) install(root);
})(globalThis);
