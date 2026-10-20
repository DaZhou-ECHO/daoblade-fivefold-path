"use strict";

// 纯规则适配器：不读DOM、不播放特效、不写存档；浏览器与Node共用。
(function (root) {
  const copy = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function freeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function createRuntime(rawConfig) {
    if (!rawConfig || rawConfig.ruleset_id !== "legacy-v1"
        || ["contract_version", "schema_version", "rules_version"].some(key => rawConfig[key] !== 1)) {
      throw new Error("共享规则契约版本不受支持");
    }
    const config = copy(rawConfig);
    const elements = config.element_order;
    const trigrams = config.trigram_order;
    // JSON序列化可能重排对象键；玩法/UI顺序只能依据显式有序列表。
    config.elements = Object.fromEntries(elements.map(id => [id, config.elements[id]]));
    config.trigrams = Object.fromEntries(trigrams.map(id => [id, config.trigrams[id]]));
    config.default_state.cultivation = Object.fromEntries(trigrams.map(id => [id, config.default_state.cultivation[id]]));
    config.default_state.progress.clears = Object.fromEntries(elements.map(id => [id, config.default_state.progress.clears[id]]));
    freeze(config);
    const metadata = freeze(Object.fromEntries(["contract_version", "ruleset_id", "schema_version", "rules_version"]
      .map(key => [key, config[key]])));

    function validateHeader(state) {
      if (!state || state.version !== config.schema_version) throw new Error("存档版本不受支持");
      if ("ruleset_id" in state && state.ruleset_id !== config.ruleset_id) throw new Error("存档规则集不受支持");
      if ("schema_version" in state && state.schema_version !== config.schema_version) throw new Error("存档结构版本不受支持");
      if ("rules_version" in state && state.rules_version !== config.rules_version) throw new Error("存档规则版本不受支持");
    }

    const defaultState = () => copy(config.default_state);
    const socketedBeads = state => Object.values(state.cultivation).flat().filter(Boolean);
    function elementTotals(state) {
      const totals = Object.fromEntries(elements.map(key => [key, config.element_base]));
      socketedBeads(state).forEach(bead => { totals[bead.element] += bead.level; });
      return totals;
    }
    function primarySecondary(state) {
      const totals = elementTotals(state);
      const ranked = elements.slice().sort((a, b) => totals[b] - totals[a]);
      const primary = totals[ranked[0]] > totals[ranked[1]] ? ranked[0] : null;
      return [primary, primary && totals[ranked[1]] > totals[ranked[2]] ? ranked[1] : null];
    }
    function validateLoadout(state) {
      const loadout = state.loadout === undefined ? config.default_state.loadout : state.loadout;
      if (!loadout || typeof loadout !== "object" || Array.isArray(loadout)
          || Object.keys(loadout).sort().join(",") !== "active,passive") throw new Error("出战配置无效");
      for (const [kind, layer] of [["active", 1], ["passive", 0]]) {
        const equipped = loadout[kind];
        if (!Array.isArray(equipped) || equipped.length !== config.limits.loadout) throw new Error("出战栏位数量无效");
        const picked = equipped.filter(key => key !== null);
        if (picked.some(key => typeof key !== "string" || !trigrams.includes(key))) throw new Error("出战卦路无效");
        if (new Set(picked).size !== picked.length) throw new Error("同一卦路不能重复装备");
        if (picked.some(key => !state.cultivation[key]?.[layer])) throw new Error("尚未学会所装备的技能或心法");
      }
      return copy(loadout);
    }
    function getAffixTotals(state) {
      const result = {};
      socketedBeads(state).forEach(bead => bead.affixes.forEach(affix => {
        result[affix.key] = (result[affix.key] || 0) + affix.value;
      }));
      return result;
    }
    function calculateStats(state) {
      const totals = elementTotals(state);
      const affixes = getAffixTotals(state);
      const depth = Object.fromEntries(Object.entries(state.cultivation).map(([key, slots]) => [key, slots.filter(Boolean).length]));
      const loadout = validateLoadout(state);
      const mastery = Object.fromEntries(trigrams.map(key => [key, loadout.passive.includes(key) ? depth[key] : 0]));
      const [primary, secondary] = primarySecondary(state);
      // 本轮只提取现有公式，不改倍率和上限；新阵盘另设规则适配器。
      return {
        primary, secondary, totals, depth, mastery, loadout,
        hpMax: Math.round(94 + totals.wood * 3 + mastery.kun * 8 + (affixes.hp || 0)),
        qiMax: Math.round(70 + totals.water * 3 + mastery.kan * 8 + (affixes.qiMax || 0)),
        attack: 12 + totals.metal * .85 + mastery.qian * 2 + (affixes.attack || 0) * .45,
        defense: Math.min(35, totals.earth * .45 + mastery.kun * 1.4 + (affixes.defense || 0) * .4),
        speed: 205 + mastery.xun * 15,
        crit: clamp(.04 + totals.fire * .009 + mastery.li * .03 + (affixes.crit || 0) / 100, .04, .55),
        qiRegen: 7 + totals.water * .3 + (affixes.qiRegen || 0) * .2,
        block: clamp(.62 + mastery.gen * .06 + (affixes.block || 0) / 100, .62, .92),
        stagger: Math.min(2.5, 1 + totals.earth * .015 + mastery.zhen * .09 + (affixes.stagger || 0) / 100),
        cooldown: clamp(1 - (affixes.cooldown || 0) / 100, .65, 1), affixes,
        dao: loadout.active[0] || null,
      };
    }
    function createProgressionState(state) {
      validateHeader(state);
      const source = copy(state);
      const loadout = validateLoadout(source);
      const nodes = {};
      for (const trigram of trigrams) {
        source.cultivation[trigram].forEach((bead, index) => {
          const id = `legacy:${trigram}:${index + 1}`;
          nodes[id] = { id, trigram_id: trigram, legacy_layer: index + 1, bead };
        });
      }
      return freeze({ ...metadata, player: source.player, inventory: source.inventory,
        nodes, loadout, progress: source.progress });
    }
    function createCombatSnapshot(state) {
      validateHeader(state);
      const source = copy(state);
      const stats = calculateStats(source);
      return freeze({ ...metadata, progression: createProgressionState(source), stats,
        skills: stats.loadout.active.map(trigram => trigram ? {
          trigram_id: trigram, element: stats.primary, upgraded: stats.depth[trigram] === config.limits.layers,
          element_source: "legacy-global-primary",
        } : null),
        appearance: { mode: "legacy-global-primary", primary: stats.primary, secondary: stats.secondary },
      });
    }
    return freeze({ config, metadata, defaultState, elementTotals, primarySecondary,
      socketedBeads, getAffixTotals, validateLoadout, validateHeader, calculateStats,
      createProgressionState, createCombatSnapshot });
  }

  const api = { createRuntime };
  root.DaoBladeRules = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
