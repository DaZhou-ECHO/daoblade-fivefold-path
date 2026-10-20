"use strict";

// 只读目标投影：位置用于提示，胜利仍由实际敌人状态决定。
(function (root) {
  function objective(realm, x, enemies) {
    if (realm !== "fire") return null;
    const living = enemies.filter(enemy => !enemy.dead);
    if (!living.length) return "火境已肃清 · 等待结算";
    // 越过敌人不会略过清场目标；不以会移动的敌人坐标划分阶段。
    const early = living.filter(enemy => ["enemy-1", "enemy-2", "enemy-3"].includes(enemy.id));
    if (x < 480 && early.length === 3) return "入境 · A/D移动，J挥剑，K防守，空格跳跃";
    if (early.length) return `学习与变化 · 清除前段守卫 ${3 - early.length}/3；高台祭坛为可选补给`;
    const guards = living.filter(enemy => enemy.kind !== "boss");
    if (guards.length) return `综合段 · 清除剩余守卫 ${2 - guards.length}/2；留意地面火焰`;
    return "首领 · 击败离火剑魁；观察预警后防守或闪避";
  }
  const api = Object.freeze({ objective });
  root.DaoBladeLevelProgress = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
