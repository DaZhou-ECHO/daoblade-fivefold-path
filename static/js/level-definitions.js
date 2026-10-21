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


  // 原创灰盒机关：安全期→预警→生效；两段错峰，均可单跳通过。
  const HAZARD_RHYTHMS = {
    fire: { label: "地火", safe: 1.8, warning: .8, active: 1.0, stagger: 1.8 },
    wood: { label: "毒蕈地带", safe: 2.4, warning: 1.0, active: .8, stagger: 2.1 },
    earth: { label: "地脉震击", safe: 2.8, warning: 1.2, active: .4, stagger: 2.2 },
    metal: { label: "地刃", safe: 1.4, warning: .7, active: .45, stagger: 1.3 },
    water: { label: "寒潮", safe: 2.6, warning: 1.4, active: .7, stagger: 2.35 },
  };
  function hazardState(hazard, elapsed) {
    const cycle = hazard.safe + hazard.warning + hazard.active;
    const time = ((elapsed + hazard.offset) % cycle + cycle) % cycle;
    if (time < hazard.safe) return { phase: "safe", remaining: hazard.safe - time };
    if (time < hazard.safe + hazard.warning) return { phase: "warning", remaining: hazard.safe + hazard.warning - time };
    return { phase: "active", remaining: cycle - time };
  }

  const ENCOUNTERS = {
      "metal": [["melee",0,670,60,"guard"],["melee",0,1070,58,"melee"],["ranged",1,1500,52,"caster"],["melee",0,1930,70,"guard"],["melee",0,2390,76,"melee"],["boss",-1,2860,240,"boss"]],
      "wood": [["melee",0,670,60,"stalker"],["melee",0,1070,58,"melee"],["ranged",1,1500,52,"caster"],["melee",0,1930,70,"stalker"],["melee",0,2390,76,"melee"],["boss",-1,2860,240,"boss"]],
      "water": [["melee",0,670,60,"skirmisher"],["melee",0,1070,58,"melee"],["ranged",1,1500,52,"binder"],["melee",0,1930,70,"skirmisher"],["melee",0,2390,76,"melee"],["boss",-1,2860,240,"boss"]],
      "fire": [["melee",0,610,64,"swordsman"],["charger",1,1010,72,"charger"],["melee",0,1460,70,"swordsman"],["ranged",2,1900,58,"caster"],["charger",1,2350,82,"charger"],["boss",-1,2860,280,"boss"]],
      "earth": [["melee",0,670,60,"crusher"],["melee",0,1070,58,"melee"],["ranged",1,1500,52,"caster"],["melee",0,1930,70,"crusher"],["melee",0,2390,76,"melee"],["boss",-1,2860,240,"boss"]],
  };

  // 四境共用前摇/有效/恢复骨架；落点与方向在起手时锁定。
  const BOSS_MOVES = {
    wood: [
      { id: "slash", label: "藤刃横扫", hint: "正面防守，收招后反击", windup: .55, active: .18, recovery: .7, cooldown: .5, reach: 105 },
      { id: "vines", label: "缠根阵", hint: "离开地面标记或跳起", windup: .65, active: .12, recovery: .85, cooldown: .5, warning: .75, radius: 75 },
    ],
    earth: [
      { id: "slam", label: "镇岳重击", hint: "慢起手，格挡或绕背后反击", windup: .9, active: .2, recovery: .95, cooldown: .45, reach: 135 },
      { id: "rock", label: "飞岩", hint: "落点起手锁定，跳跃或换位", windup: .8, active: .15, recovery: .85, cooldown: .5, projectile: true, speed: 230 },
    ],
    metal: [
      { id: "thrust", label: "贯金突刺", hint: "避开正前方直线，收招后追近", windup: .65, active: .28, recovery: .75, cooldown: .5, reach: 85, speed: 400 },
      { id: "pierce", label: "穿云剑", hint: "锁定直线后换位或正面格挡", windup: .6, active: .15, recovery: .7, cooldown: .5, projectile: true, speed: 420 },
    ],
    water: [
      { id: "delayed_slash", label: "回潮斩", hint: "延迟出手，勿见预警就急按弹反", windup: 1.05, active: .18, recovery: .85, cooldown: .5, reach: 115 },
      { id: "frost", label: "寒流", hint: "慢弹命中减速，换位或格挡", windup: .8, active: .15, recovery: .8, cooldown: .5, projectile: true, speed: 180, slow: .8 },
    ],
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
      altars, hazards: layout.hazards.map(([x, w], index) => ({ id: `hazard-${index + 1}`, x, w, ...HAZARD_RHYTHMS[realm], offset: index * HAZARD_RHYTHMS[realm].stagger })),
      encounters,
      boss_moves: BOSS_MOVES[realm] || [],
    };
  }
  definitions.fire.anchors.swordstone = { x: 1640, y: 474 };
  definitions.fire.checkpoint = { id: "swordstone", anchor_id: "swordstone", cleared_ids: ["enemy-1", "enemy-2", "enemy-3"] };
  // 木境的新阵盘检查点独立于旧永久档试炼格式。
  definitions.wood.anchors.swordstone = { x: 1640, y: 474 };
  definitions.wood.lab_checkpoint = { id: "swordstone", anchor_id: "swordstone", cleared_ids: ["enemy-1", "enemy-2", "enemy-3"] };
  for(const realm of ["earth","metal","water"]){
    definitions[realm].anchors.swordstone={x:1640,y:474};
    definitions[realm].lab_checkpoint={id:"swordstone",anchor_id:"swordstone",cleared_ids:["enemy-1","enemy-2","enemy-3"]};
  }
  // 正式征程双地图灰盒：主地面贯通，支路由基础单跳阶台组成。
  const JOURNEY_TERRAIN = {
    wood: { steps: [[470,410,240],[700,350,260],[1740,410,240],[1970,350,260]], altars: [[790,350],[2040,350]], label: "林根高径 · 连续登台" },
    fire: { steps: [[450,414,270],[710,358,250],[1700,414,270],[1960,358,250]], altars: [[800,358],[2050,358]], label: "炉台高径 · 观察地火窗口" },
    earth: { steps: [[420,424,330],[730,374,300],[1720,424,330],[2030,374,300]], altars: [[830,374],[2150,374]], label: "石庭高径 · 宽台折层" },
    metal: { steps: [[490,430,200],[680,386,180],[850,342,180],[1740,430,200],[1930,386,180],[2100,342,180]], altars: [[910,342],[2160,342]], label: "剑廊高径 · 三阶侧移" },
    water: { steps: [[460,418,290],[730,362,260],[1710,418,290],[1980,362,260]], altars: [[820,362],[2070,362]], label: "寒潭高径 · 栈桥避潮" },
  };
  const journeyDefinitions = {};
  for(const realm of Object.keys(REALMS))for(const map of ["ridge","hollow"]){
    const base=JSON.parse(JSON.stringify(definitions[realm])),terrain=JOURNEY_TERRAIN[realm];
    base.id=`journey-v1:${realm}:${map}`;base.map_id=map;
    let steps=terrain.steps,altars=terrain.altars;
    if(map==="hollow"){
      // 先从右侧矮台登高，再向左折返上层祭坛；可从两端落回贯通主路。
      const low=realm==="earth"?424:realm==="metal"?420:412,high=low-58;
      steps=[[470,high,290],[740,low,230],[1770,high,290],[2040,low,230]];
      altars=[[510,high],[1810,high]];
    }
    base.route_label=map==="ridge"?terrain.label:({wood:"根桥回廊",fire:"炉后回廊",earth:"遗迹回廊",metal:"剑冢回廊",water:"折水栈道"})[realm]+" · 右侧登台后折返";
    base.platforms=[base.platforms[0],...steps.map(([x,y,w],i)=>({id:`branch-step-${i+1}`,x,y,w,h:22}))];
    base.altars=altars.map(([x,y],i)=>{const id=`altar-${i+1}`;base.anchors[id]={x,y};return{id,anchor_id:id};});
    journeyDefinitions[realm+":"+map]=base;
  }
  freeze(journeyDefinitions);
  freeze(definitions);
  const api = freeze({
    getJourneyDefinition(realm,map="ridge"){
      const value=journeyDefinitions[realm+":"+map];
      if(!value)throw new Error("未知正式秘境地图");
      return value;
    },
    hazardState, realms: REALMS, realm_ids: Object.keys(REALMS),
    getDefinition(realm) {
      if (!Object.hasOwn(definitions, realm)) throw new Error("未知秘境配置");
      return definitions[realm];
    },
  });
  root.DaoBladeLevels = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
