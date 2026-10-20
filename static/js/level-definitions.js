"use strict";

// 原五境的冻结配置；行为、当局进度与保存不在此模块。
(function (root) {
  const REALMS = {
    metal: { bg: ["#111b29", "#526273"], enemies: ["铁甲傀儡", "飞刃机关"], boss: "白帝剑卫" },
    wood: { bg: ["#071d1a", "#2f7552"], enemies: ["藤甲妖", "毒蕈灵"], boss: "青木药王" },
    water: { bg: ["#07182a", "#246d91"], enemies: ["寒潭水鬼", "冰晶鱼妖"], boss: "玄水蛟影" },
    fire: { bg: ["#241018", "#9b3028"], enemies: ["熔岩剑卒", "赤焰刀客", "火羽术士"], boss: "离火剑魁" },
    earth: { bg: ["#201a14", "#765638"], enemies: ["石甲俑", "沙暴灵"], boss: "镇岳山君" },
  };

  // 主路保持贯通；高台构成可选支路，祭坛提供额外结算奖励。
  const REALM_LAYOUTS = {
    metal: { ledges: [[410, 414, 195], [645, 354, 165], [1210, 405, 230], [1800, 392, 205], [2460, 414, 180]], altars: [[715, 354], [1860, 392]], hazards: [[925, 92], [2150, 96]] },
    wood: { ledges: [[510, 408, 220], [760, 347, 160], [1410, 402, 190], [1760, 347, 160], [2470, 407, 210]], altars: [[820, 347], [1820, 347]], hazards: [[1100, 85], [2240, 88]] },
    water: { ledges: [[500, 412, 185], [735, 356, 180], [1340, 405, 180], [1680, 351, 175], [2380, 408, 220]], altars: [[790, 356], [1740, 351]], hazards: [[1010, 105], [2070, 105]] },
    fire: { ledges: [[470, 406, 220], [755, 349, 170], [1310, 411, 230], [1700, 354, 185], [2400, 405, 210]], altars: [[810, 349], [1750, 354]], hazards: [[1180, 90], [2170, 90]] },
    earth: { ledges: [[470, 421, 215], [735, 361, 160], [1190, 412, 245], [1800, 404, 220], [2350, 356, 170]], altars: [[790, 361], [2410, 356]], hazards: [[1010, 80], [2130, 100]] },
  };


  const ENCOUNTERS = {
      "metal": [["melee",0,670,60,"guard"],["melee",0,1070,58,"melee"],["ranged",1,1500,52,"caster"],["melee",0,1930,70,"guard"],["melee",0,2390,76,"melee"],["boss",-1,2860,240,"boss"]],
      "wood": [["melee",0,670,60,"stalker"],["melee",0,1070,58,"melee"],["ranged",1,1500,52,"caster"],["melee",0,1930,70,"stalker"],["melee",0,2390,76,"melee"],["boss",-1,2860,240,"boss"]],
      "water": [["melee",0,670,60,"skirmisher"],["melee",0,1070,58,"melee"],["ranged",1,1500,52,"binder"],["melee",0,1930,70,"skirmisher"],["melee",0,2390,76,"melee"],["boss",-1,2860,240,"boss"]],
      "fire": [["melee",0,610,64,"swordsman"],["charger",1,1010,72,"charger"],["melee",0,1460,70,"swordsman"],["ranged",2,1900,58,"caster"],["charger",1,2350,82,"charger"],["boss",-1,2860,280,"boss"]],
      "earth": [["melee",0,670,60,"crusher"],["melee",0,1070,58,"melee"],["ranged",1,1500,52,"caster"],["melee",0,1930,70,"crusher"],["melee",0,2390,76,"melee"],["boss",-1,2860,240,"boss"]],
  };

  function freeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  }
  const definitions = {};
  for (const realm of Object.keys(REALMS)) {
    const layout = REALM_LAYOUTS[realm];
    const anchors = { spawn: { x: 120, y: 474 } };
    const encounters = ENCOUNTERS[realm].map(([kind, name_index, x, hp, variant], index) => {
      const id = `enemy-${index + 1}`, anchor_id = kind === "boss" ? "boss" : id;
      anchors[anchor_id] = { x, y: 474 };
      return { id, anchor_id, kind, name_index, hp, variant };
    });
    const altars = layout.altars.map(([x, y], index) => {
      const id = `altar-${index + 1}`; anchors[id] = { x, y };
      return { id, anchor_id: id };
    });
    definitions[realm] = {
      version: 1, id: `legacy-v1:${realm}`, realm_id: realm,
      world: { width: 3200, floor_y: 474 }, anchors,
      platforms: [{ id: "floor", x: 0, y: 474, w: 3200, h: 80 },
        ...layout.ledges.map(([x, y, w], index) => ({ id: `ledge-${index + 1}`, x, y, w, h: 22 }))],
      altars, hazards: layout.hazards.map(([x, w], index) => ({ id: `hazard-${index + 1}`, x, w })),
      encounters,
    };
  }
  freeze(definitions);
  const api = freeze({
    realms: REALMS, realm_ids: Object.keys(REALMS),
    getDefinition(realm) {
      if (!Object.hasOwn(definitions, realm)) throw new Error("未知秘境配置");
      return definitions[realm];
    },
  });
  root.DaoBladeLevels = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
