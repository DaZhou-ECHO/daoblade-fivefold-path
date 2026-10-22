"use strict";

// 角色美术只读取动作状态，绝不修改玩家位置、碰撞箱或战斗数值。
(function (root) {
  const actions = root.DaoBladeActions || (typeof module !== "undefined" && module.exports ? require("./action-state.js") : null);
  const localAsset = value => typeof value === "string"
    && /^\/static\/sprites\/[A-Za-z0-9_./-]+\.png$/.test(value)
    && !value.includes("..");
  const point = (value, width, height) => Array.isArray(value) && value.length === 2
    && value.every(Number.isInteger) && value[0] >= 0 && value[0] < width
    && value[1] >= 0 && value[1] < height;

  function validManifest(data) {
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.frameSize)
        || data.frameSize[0] !== 64 || data.frameSize[1] !== 96
        || !point(data.foot, 64, 96) || !data.animations || !data.weapon) return false;
    if (!Array.isArray(data.weapon.size) || data.weapon.size.length !== 2
        || !data.weapon.size.every(size => Number.isInteger(size) && size > 0 && size <= 128)
        || !point(data.weapon.grip, ...data.weapon.size) || !localAsset(data.weapon.src)) return false;
    return ["idle", "run"].every(key => {
      const action = data.animations[key];
      return action && localAsset(action.src) && Number.isInteger(action.frameCount)
        && action.frameCount > 1 && action.frameCount <= 32
        && Number.isFinite(action.fps) && action.fps > 0 && action.fps <= 30
        && Array.isArray(action.frames) && action.frames.length === action.frameCount
        && action.frames.every(frame => frame && point(frame.hand, 64, 96)
          && Number.isFinite(frame.weaponAngle));
    });
  }

  const selectAction = player => actions?.selectAction(player) || null;

  // 只消费已有计时器。腰部以上与腿部分层，脚底不随上身摆动。
  // 动作起落均回到基础握点/剑角；不向战斗对象写入渲染状态。
  const clamp01 = value => Math.max(0, Math.min(1, value));
  // 以现有竖直速度驱动腿部，跨越最高点时连续恢复；不添加物理计时器。
  function airborneLegs(state) {
    if (state.motion.on_ground || !state.feedback.alive) return null;
    const rise = clamp01(-state.motion.vy / 500);
    const fall = clamp01(state.motion.vy / 500);
    return [
      { x: 26, sourceX: 0, thigh: -.75 * rise + .08 * fall, knee: 1.25 * rise + .06 * fall },
      { x: 39, sourceX: 32, thigh: .45 * rise - .12 * fall, knee: .8 * rise + .12 * fall },
    ];
  }

  function drawLegs(ctx, image, legs, footX, footY) {
    for (const leg of legs) {
      ctx.save();
      try {
        ctx.translate(leg.x - footX, 66 - footY);
        ctx.rotate(leg.thigh);
        ctx.drawImage(image, leg.sourceX, 66, 32, 11, leg.sourceX - leg.x, 0, 32, 11);
        ctx.translate(0, 11);
        ctx.rotate(leg.knee);
        ctx.drawImage(image, leg.sourceX, 77, 32, 19, leg.sourceX - leg.x, 0, 32, 19);
      } finally { ctx.restore(); }
    }
  }
  const DEFEAT_DURATION = actions?.DEFEAT_DURATION || 1.05;
  function keyframe(progress, keys) {
    for (let i = 1; i < keys.length; i += 1) {
      if (progress <= keys[i][0]) {
        const a = keys[i - 1], b = keys[i];
        const t = clamp01((progress - a[0]) / (b[0] - a[0]));
        return a[1] + (b[1] - a[1]) * t * t * (3 - 2 * t);
      }
    }
    return keys.at(-1)[1];
  }

  function combatPose(state, action, base) {
    let lean = 0, angle = base.weaponAngle;
    if (action === "slash") {
      const progress = state.progress;
      const reverse = state.combo === 2;
      const heavy = state.combo === 3;
      angle = keyframe(progress, [[0, angle], [.16, reverse ? 2.8 : -.65],
        [.3, reverse ? 3.2 : .1], [.7, reverse ? .05 : heavy ? 4.25 : 2.8],
        [1, angle]]);
      lean = keyframe(progress, [[0, 0], [.16, -.1], [.64, heavy ? .2 : .12], [1, 0]]);
    } else if (action === "block") {
      angle = .1; lean = -.07;
    } else if (action === "qi") {
      const pulse = Math.sin(Math.PI * (1 - state.progress));
      angle += (Math.PI / 2 - angle) * pulse; lean = .1 * pulse;
    } else if (action === "dash") {
      const pulse = Math.sin(Math.PI * (1 - state.progress));
      lean = .28 * pulse; angle += .45 * pulse;
    } else if (action === "hurt") {
      lean = -.19 * Math.sin(Math.PI * (1 - state.progress));
      angle -= .3 * Math.sin(Math.PI * (1 - state.progress));
    } else if (action === "jump" || action === "fall") {
      lean = action === "jump" ? -.08 : .08;
      angle += action === "jump" ? -.2 : .2;
    } else if (action === "death") {
      const progress = state.progress;
      const rootAngle = keyframe(progress, [[0, 0], [.18, -.12], [.42, .52],
        [.78, Math.PI / 2], [.9, 1.48], [1, Math.PI / 2]]);
      return { ...base, action, imageKey: "idle", index: 0, lean: 0, rig: true,
        weaponAngle: keyframe(progress, [[0, angle], [.35, .8], [.78, .08], [1, 0]]),
        rootAngle, rootX: 8 * progress,
        rootY: state.feedback.death_drop - 20 * Math.abs(Math.sin(rootAngle)) };
    }
    return { ...base, action, imageKey: "idle", index: 0, lean, weaponAngle: angle, rig: true };
  }

  function drawEffects(ctx, state, frame, color) {
    const hx = frame.hand[0] - 32, hy = frame.hand[1] - 90;
    ctx.strokeStyle = color;
    if (frame.action === "slash") {
      const progress = state.progress;
      if (progress > .18 && progress < .9) {
        const direction = state.combo === 2 ? -1 : 1;
        const end = frame.weaponAngle - Math.PI / 2;
        ctx.globalAlpha *= Math.sin(progress * Math.PI) * .7;
        ctx.lineWidth = state.combo === 3 ? 8 : 5;
        ctx.beginPath(); ctx.arc(hx, hy, 49, end - direction * .8, end, direction < 0); ctx.stroke();
      }
    } else if (frame.action === "block") {
      ctx.strokeStyle = state.feedback.block_flash ? "#fff0a5" : color;
      ctx.lineWidth = state.feedback.block_flash ? 5 : 2;
      ctx.beginPath(); ctx.arc(hx, hy, 32, -1.3, 1.3); ctx.stroke();
    } else if (frame.action === "qi") {
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx + 16, hy, 16 + (1 - state.progress) * .25 * 25, 0, Math.PI * 2); ctx.stroke();
      if (state.skill_id) {
        ctx.fillStyle = color;
        for (let i = 0; i < 3; i += 1) ctx.fillRect(hx + 12 + i * 3, hy - 27 + i * 7, 18 - i * 3, 2);
      }
    }
  }

  class Renderer {
    constructor() {
      this.status = "unloaded";
      this.manifest = null;
      this.images = {};
      this.pending = null;
      this.error = "";
    }

    load(fetcher = root.fetch?.bind(root), ImageType = root.Image) {
      if (this.pending) return this.pending;
      if (!fetcher || !ImageType) return Promise.resolve(false);
      this.status = "loading";
      this.pending = this.loadAssets(fetcher, ImageType).catch(() => {
        this.status = "failed";
        this.error = "角色素材未就绪，使用程序绘制回退";
        this.images = {};
        return false;
      });
      return this.pending;
    }

    async loadAssets(fetcher, ImageType) {
      const response = await fetcher("/static/sprites/player/manifest.json");
      if (!response.ok) throw new Error("manifest unavailable");
      const manifest = await response.json();
      if (!validManifest(manifest)) throw new Error("invalid manifest");
      const specs = [
        ...["idle", "run"].map(key => [key, manifest.animations[key].src,
          manifest.animations[key].frameCount * 64, 96]),
        ["weapon", manifest.weapon.src, ...manifest.weapon.size],
      ];
      const images = await Promise.all(specs.map(([key, src, width, height]) =>
        new Promise((resolve, reject) => {
          const image = new ImageType();
          image.onload = () => image.naturalWidth === width && image.naturalHeight === height
            ? resolve([key, image]) : reject(new Error("invalid image dimensions"));
          image.onerror = () => reject(new Error("image unavailable"));
          image.src = src;
        })));
      this.manifest = manifest;
      this.images = Object.fromEntries(images);
      this.status = "ready";
      return true;
    }

    frame(player) {
      return this.frameFromState(actions?.createActionState(player));
    }

    frameFromState(state) {
      if (this.status !== "ready" || state?.version !== 1) return null;
      const action = state.action_id;
      if (!["idle", "run"].includes(action)) {
        return { ...combatPose(state, action, this.manifest.animations.idle.frames[0]), legs: airborneLegs(state) };
      }
      const animation = this.manifest.animations[action];
      const time = state.animation_time;
      const index = Math.floor(time * animation.fps) % animation.frameCount;
      return { action, index, ...animation.frames[index] };
    }

    draw(ctx, player, color = "#b6dbe6") {
      return this.drawState(ctx, actions?.createActionState(player), color);
    }

    drawState(ctx, state, color = "#b6dbe6") {
      const frame = this.frameFromState(state);
      if (!frame || typeof ctx.drawImage !== "function") return false;
      const [footX, footY] = this.manifest.foot;
      // 固定脚底中心翻转；不叠加旧程序绘制的整身 bob。
      ctx.save();
      try {
        ctx.imageSmoothingEnabled = false;
        if (state.feedback.flicker) ctx.globalAlpha = .38;
        ctx.translate(Math.round(state.anchor.foot[0]), Math.round(state.anchor.foot[1]));
        ctx.scale(state.facing, 1);
        ctx.fillStyle = "rgba(0,0,0,.3)";
        ctx.fillRect(-19, state.feedback.death_drop - 2, 38, 4);
        if (frame.action === "death") {
          ctx.translate(frame.rootX, frame.rootY);
          ctx.rotate(frame.rootAngle);
        }
        const image = this.images[frame.imageKey || frame.action];
        if (frame.rig) {
          if (frame.legs) drawLegs(ctx, image, frame.legs, footX, footY);
          else ctx.drawImage(image, 0, 66, 64, 30, -footX, 66 - footY, 64, 30);
        } else {
          ctx.drawImage(image, frame.index * 64, 0, 64, 96, -footX, -footY, 64, 96);
        }
        ctx.save();
        try {
          if (frame.rig) {
            ctx.translate(0, 66 - footY); ctx.rotate(frame.lean); ctx.translate(0, footY - 66);
            ctx.drawImage(image, 0, 0, 64, 66, -footX, -footY, 64, 66);
          }
          ctx.save();
          try {
            ctx.translate(frame.hand[0] - footX, frame.hand[1] - footY);
            ctx.rotate(frame.weaponAngle);
            const weapon = this.manifest.weapon;
            ctx.drawImage(this.images.weapon, -weapon.grip[0], -weapon.grip[1]);
          } finally { ctx.restore(); }
          // 手指置于剑柄上方，握点与旋转中心始终重合。
          const hx = frame.hand[0] - 2, hy = frame.hand[1] - 2;
          ctx.drawImage(image, frame.index * 64 + hx, hy, 4, 4,
            hx - footX, hy - footY, 4, 4);
          drawEffects(ctx, state, frame, color);
        } finally { ctx.restore(); }
      } catch (_) {
        this.status = "failed";
        this.error = "角色图片绘制失败，使用程序绘制回退";
        return false;
      } finally {
        ctx.restore();
      }
      return true;
    }
  }

  const api = { Renderer, validManifest, selectAction, DEFEAT_DURATION, renderer: new Renderer() };
  root.DaoBladeCharacterArt = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
