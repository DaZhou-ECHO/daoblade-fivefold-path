"use strict";

// 真实事件的有限视觉投影。绘制不改变战斗，不生成命中。
(function (root) {
  function createLayer({ enabled = () => true } = {}) {
    const sequences = new Map();
    let items = [];
    return Object.freeze({
      get items() { return Object.freeze(items.map(item => Object.freeze({ ...item }))); },
      push(event) {
        if (!event || typeof event.battle_id !== "string" || !Number.isInteger(event.sequence)) return;
        if (event.sequence <= (sequences.get(event.battle_id) || 0)) return;
        sequences.set(event.battle_id, event.sequence);
        if (sequences.size > 16) sequences.delete(sequences.keys().next().value);
        if (!enabled() || event.periodic) return;
        let text, color, strong = false;
        const amount = Math.max(1, Math.round(event.amount || 0));
        if (event.type === "enemy_hit" && event.amount > 0) {
          text = event.critical ? `暴击 ${amount}` : String(amount);
          color = event.critical ? "#fff0a5" : "#f1eadb"; strong = event.critical;
        } else if (event.type === "player_hurt" && event.amount > 0) {
          const block = [...items].reverse().find(item => item.type === "player_blocked"
            && item.target === event.target_id && item.time === event.time);
          if (block) { block.text = `格挡 -${amount}`; return; }
          text = `-${amount}`; color = "#ff9a8b";
        } else if (event.type === "player_blocked") { text = "格挡"; color = "#b4dff5"; }
        else if (event.type === "player_parried") { text = "完美格挡"; color = "#fff0a5"; strong = true; }
        else return;
        const row = items.filter(item => item.target === event.target_id && item.life > .45).length % 3;
        items.push({ text, color, strong, type: event.type, target: event.target_id, time: event.time,
          x: event.position[0], y: Math.max(24, event.position[1] - 40 - row * 16), life: .8 });
        if (items.length > 24) items.shift();
      },
      update(dt) {
        const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        items.forEach(item => { item.life -= step; });
        items = items.filter(item => item.life > 0);
      },
      clear() { items = []; },
      draw(ctx) {
        if (!enabled() || typeof ctx.fillText !== "function") return;
        ctx.save();
        try {
          ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 3;
          for (const item of items) {
            const y = item.y - 24 * (1 - item.life / .8);
            ctx.globalAlpha = Math.min(1, item.life / .2);
            ctx.font = `${item.strong ? "bold 17" : "bold 14"}px sans-serif`;
            ctx.strokeStyle = "#07101d"; ctx.fillStyle = item.color;
            ctx.strokeText?.(item.text, Math.round(item.x), Math.round(y));
            ctx.fillText(item.text, Math.round(item.x), Math.round(y));
          }
        } finally { ctx.restore(); }
      },
    });
  }
  const api = Object.freeze({ createLayer });
  root.DaoBladeCombatFeedback = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
