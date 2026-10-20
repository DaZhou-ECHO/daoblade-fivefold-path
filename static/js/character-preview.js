"use strict";

(async function () {
  const renderer = DaoBladeCharacterArt.renderer;
  const status = document.querySelector("#art-status");
  if (!await renderer.load()) {
    status.textContent = "角色素材加载失败。游戏仍可使用程序绘制回退，请检查本地素材。";
    return;
  }
  const canvas = document.querySelector("#art-canvas");
  const ctx = canvas.getContext("2d");
  const action = document.querySelector("#art-action");
  const facing = document.querySelector("#art-facing");
  const background = document.querySelector("#art-background");
  const anchors = document.querySelector("#art-anchors");
  const colors = { metal: "#182335", wood: "#102c24", water: "#10283f", fire: "#3c1e24", earth: "#382e25" };
  let paused = false, elapsed = 0, previous = performance.now();
  document.querySelector("#art-pause").addEventListener("click", event => {
    paused = !paused;
    event.target.textContent = paused ? "播放动画" : "暂停动画";
  });
  document.querySelector("#art-step").addEventListener("click", () => {
    paused = true;
    document.querySelector("#art-pause").textContent = "播放动画";
    const fps = renderer.manifest.animations[action.value]?.fps || 30;
    elapsed = (Math.floor(elapsed * fps + 1e-6) + 1) / fps + 1e-6;
  });
  action.addEventListener("change", () => { elapsed = 0; });

  function tick(now) {
    if (!paused && !document.hidden) elapsed += Math.min((now - previous) / 1000, .1);
    previous = now;
    ctx.fillStyle = colors[background.value];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#d8c69c";
    ctx.font = "14px monospace";
    ctx.fillText("1x / 64 x 96", 125, 55);
    ctx.fillText("3x / NEAREST", 550, 35);
    for (const [x, floor, scale] of [[170, 250, 1], [620, 320, 3]]) {
      ctx.fillStyle = "#867450";
      ctx.fillRect(x - 110, floor, 220, 2);
      const phase = elapsed % 1;
      const remaining = Math.max(.001, 1 - phase);
      const player = { x: -19, y: -70, w: 38, h: 70, face: Number(facing.value), hp: 100,
        onGround: true, vx: action.value === "run" ? 200 : 0, animTime: elapsed };
      if (action.value.startsWith("slash")) Object.assign(player, {
        slash: remaining * .28, slashDuration: .28, combo: Number(action.value.at(-1)),
      });
      if (["block", "parry"].includes(action.value)) Object.assign(player, { blocking: true, blockFlash: action.value === "parry" ? .2 : 0 });
      if (["jump", "fall"].includes(action.value)) Object.assign(player, { onGround: false, vy: action.value === "jump" ? -100 : 100 });
      if (action.value === "dash") player.dash = remaining * .2;
      if (action.value === "qi") player.qiCast = remaining * .25;
      if (action.value === "hurt") player.hurt = remaining * .2;
      if (action.value === "death") player.hp = 0;
      ctx.save();
      ctx.translate(x, floor);
      ctx.scale(scale, scale);
      renderer.draw(ctx, player);
      if (anchors.checked) {
        const frame = renderer.frame(player);
        ctx.fillStyle = "#7cffe0"; ctx.fillRect(-1, -1, 3, 3);
        ctx.fillStyle = "#ffce69";
        const dx = frame.hand[0] - 32, dy = frame.hand[1] - 66;
        const lean = frame.lean || 0;
        ctx.fillRect(player.face * (dx * Math.cos(lean) - dy * Math.sin(lean)) - 1,
          -24 + dx * Math.sin(lean) + dy * Math.cos(lean) - 1, 3, 3);
      }
      ctx.restore();
    }
    const animation = renderer.manifest.animations[action.value];
    const position = animation ? `第 ${Math.floor(elapsed * animation.fps) % animation.frameCount + 1}/${animation.frameCount} 帧` : `动作进度 ${Math.floor(elapsed % 1 * 100)}%`;
    status.textContent = `本地 PNG 已就绪 · ${action.selectedOptions[0].textContent} · ${position} · 独立本命剑 · ${paused ? "已暂停" : "播放中"}`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
