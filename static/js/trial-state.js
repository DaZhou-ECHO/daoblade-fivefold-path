"use strict";

(function (root) {
  const copy = value => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function create(state, rules) {
    const build = freeze(copy({ player: state.player, cultivation: state.cultivation, loadout: state.loadout || rules.defaultState().loadout }));
    return { id: `trial-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
      build, snapshot: rules.createCombatSnapshot(state), activated: false, claimedAltars: new Set(), settled: false };
  }
  function encode(trial) {
    if (!trial?.activated || trial.settled) return null;
    return { version: 1, id: trial.id, ruleset_id: "legacy-v1", rules_version: 1,
      realm_id: "fire", checkpoint_id: "swordstone", build: copy(trial.build), claimed_altars: [...trial.claimedAltars].sort() };
  }
  function restore(raw, rules) {
    if (!raw || raw.version !== 1 || raw.rules_version !== 1 || raw.ruleset_id !== "legacy-v1"
        || raw.realm_id !== "fire" || raw.checkpoint_id !== "swordstone"
        || typeof raw.id !== "string" || !raw.id.length || raw.id.length > 80
        || !Array.isArray(raw.claimed_altars) || raw.claimed_altars.length > 2
        || raw.claimed_altars.some(id => !["altar-1", "altar-2"].includes(id))
        || new Set(raw.claimed_altars).size !== raw.claimed_altars.length
        || !raw.build || Object.keys(raw.build).sort().join(",") !== "cultivation,loadout,player") throw new Error("剑碑存档不受支持或已损坏");
    const state = { ...rules.defaultState(), ...copy(raw.build) };
    const trial = create(state, rules);
    trial.id = raw.id; trial.activated = true; trial.claimedAltars = new Set(raw.claimed_altars);
    return trial;
  }
  const api = Object.freeze({ create, encode, restore });
  root.DaoBladeTrialState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
