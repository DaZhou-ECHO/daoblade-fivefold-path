"use strict";

// 局内事实通知：不拥有战斗判定、帧循环或持久化。
(function (root) {
  let battleSequence = 0;
  const types = new Set(["slash_started", "enemy_hit", "player_blocked", "player_parried", "player_hurt", "battle_ended"]);
  const number = value => Number.isFinite(value) ? value : 0;
  const text = value => typeof value === "string" ? value : null;
  function createChannel() {
    const id = `battle-${Date.now().toString(36)}-${++battleSequence}`;
    const listeners = new Set(), history = [];
    let sequence = 0, closed = false, failures = 0;
    return Object.freeze({
      get id() { return id; }, get closed() { return closed; },
      get failure_count() { return failures; },
      get recent() { return Object.freeze(history.slice()); },
      subscribe(listener) {
        if (typeof listener !== "function") throw new TypeError("战斗事件监听必须为函数");
        if (!closed) listeners.add(listener);
        return () => listeners.delete(listener);
      },
      emit(data) {
        if (closed) return null;
        if (!types.has(data.type)) throw new TypeError("未知战斗事件");
        const event = Object.freeze({
          version: 1, id: `${id}:${++sequence}`, battle_id: id, sequence,
          type: data.type, time: number(data.time), source_id: text(data.source_id),
          target_id: text(data.target_id), action_id: text(data.action_id),
          attack_id: number(data.attack_id), phase: text(data.phase), element: text(data.element),
          position: Object.freeze([number(data.position?.[0]), number(data.position?.[1])]),
          amount: number(data.amount), critical: Boolean(data.critical), periodic: Boolean(data.periodic),
          combo: number(data.combo), outcome: text(data.outcome),
        });
        history.push(event); if (history.length > 64) history.shift();
        for (const listener of [...listeners]) {
          if (!listeners.has(listener)) continue;
          try { listener(event); } catch (_) { failures += 1; }
        }
        return event;
      },
      close() { closed = true; listeners.clear(); },
    });
  }
  const api = Object.freeze({ createChannel });
  root.DaoBladeBattleEvents = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
