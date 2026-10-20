const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// 与页面一致，在同一JS realm中先加载共享规则，再运行游戏。
module.exports = function loadRules(context) {
  const config = require("../../static/data/rules/legacy-v1.json");
  vm.runInContext(`globalThis.DaoBladeRuleset = ${JSON.stringify(config)};`, context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../static/js/rules.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../static/js/action-state.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../static/js/battle-events.js"), "utf8"), context);
};
