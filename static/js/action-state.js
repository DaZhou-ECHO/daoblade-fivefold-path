"use strict";

// 将现有战斗实体适配为一次绘制所需的只读视图；不拥有输入、伤害或时钟。
(function (root) {
  const DEFEAT_DURATION = 1.05;
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const number = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  function selectAction(player) {
    if (player.hp <= 0) return "death";
    if (player.hurt > 0) return "hurt";
    if (player.dash > 0) return "dash";
    if (player.slash > 0) return "slash";
    if (player.blocking) return "block";
    if (player.qiCast > 0) return "qi";
    if (!player.onGround) return player.vy < 0 ? "jump" : "fall";
    return Math.abs(player.vx) > 35 ? "run" : "idle";
  }
  function createActionState(player) {
    const action = selectAction(player);
    let progress = 0, phase = "visual";
    if (action === "slash") {
      progress = clamp01(1 - number(player.slash) / (number(player.slashDuration) || .28));
      phase = progress <= .18 ? "windup" : progress < .78 ? "active" : "recovery";
    } else if (action === "death") {
      progress = clamp01(number(player.deathTime) / DEFEAT_DURATION);
      phase = progress >= 1 ? "complete" : "visual";
    } else if (["qi", "dash", "hurt"].includes(action)) {
      const remaining = { qi: player.qiCast, dash: player.dash, hurt: player.hurt }[action];
      progress = clamp01(1 - number(remaining) / (action === "qi" ? .25 : .2));
    } else if (action === "jump" || action === "fall") {
      progress = clamp01(action === "jump" ? 1 + number(player.vy) / 500 : number(player.vy) / 500);
      phase = "airborne";
    } else phase = action === "block" ? "hold" : "loop";
    return Object.freeze({
      version: 1, action_id: action, phase, progress,
      facing: player.face < 0 ? -1 : 1,
      anchor: Object.freeze({ foot: Object.freeze([
        number(player.x) + number(player.w, 38) / 2,
        number(player.y) + number(player.h, 70),
      ]) }),
      motion: Object.freeze({ vx: number(player.vx), vy: number(player.vy), on_ground: Boolean(player.onGround) }),
      animation_time: Math.max(0, number(player.animTime)),
      combo: number(player.combo), skill_id: typeof player.skillPose === "string" ? player.skillPose : null,
      feedback: Object.freeze({ alive: player.hp > 0,
        flicker: player.hp > 0 && player.invuln > 0 && Boolean(Math.floor(player.invuln * 20) % 2),
        block_flash: player.blockFlash > 0, death_drop: number(player.deathDrop) }),
    });
  }
  const api = Object.freeze({ DEFEAT_DURATION, selectAction, createActionState });
  root.DaoBladeActions = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
