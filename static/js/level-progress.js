"use strict";

// 只读目标投影：位置用于提示，胜利仍由实际敌人状态决定。
(function (root) {
  const levels=root.DaoBladeLevels||(typeof module!=="undefined"&&module.exports?require("./level-definitions.js"):null);
  const tips=Object.freeze({fire:["火境","留意地面火焰"],wood:["木境","借高台分开近敌与远程攻击"],earth:["土境","观察重击前摇后换位"],metal:["金境","铁甲敌人减伤，留意直线剑气"],water:["水境","避开水弹减速，留意延迟出手"]});
  function objective(realm, x, enemies) {
    if(!Object.hasOwn(tips,realm))return null;
    const [title,tip]=tips[realm];
    const living = enemies.filter(enemy => !enemy.dead);
    if (!living.length) return `${title}已肃清 · 等待结算`;
    // 越过敌人不会略过清场目标；不以会移动的敌人坐标划分阶段。
    const early = living.filter(enemy => ["enemy-1", "enemy-2", "enemy-3"].includes(enemy.id));
    if (x < 480 && early.length === 3) return "入境 · A/D移动，J挥剑，K防守，空格跳跃";
    if (early.length) return `学习与变化 · 清除前段守卫 ${3 - early.length}/3；高台祭坛为可选补给`;
    const guards = living.filter(enemy => enemy.kind !== "boss");
    if (guards.length) return `综合段 · 清除剩余守卫 ${2 - guards.length}/2；${tip}`;
    return `首领 · 击败${levels.realms[realm].boss}；观察预警，防守或换位后寻找出手空当`;
  }
  const api = Object.freeze({ objective });
  root.DaoBladeLevelProgress = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
