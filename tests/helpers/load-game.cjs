const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function gameContext(touchButtons = [], savedFeedback = null, randomSeed = null, worldArt = false) {
  const canvas = { width: 960, height: 540, getContext: () => ({ imageSmoothingEnabled: false }) };
  const element = () => ({ textContent: "", innerHTML: "", style: {}, classList: { add() {}, remove() {}, toggle() {} } });
  const document = { querySelector: selector => selector === "#game-canvas" ? canvas : element(), querySelectorAll: selector => selector === '[data-touch]' ? touchButtons : [], addEventListener() {}, removeEventListener() {} };
  const listeners = new Map();
  const storage = new Map();
  if (savedFeedback) storage.set("daoblade-feedback",JSON.stringify(savedFeedback));
  const context = vm.createContext({
    document, window: { addEventListener(name, fn) { listeners.set(name,fn); }, removeEventListener(name, fn) { if(listeners.get(name)===fn) listeners.delete(name); }, scrollTo() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    performance: { now: () => 0 }, requestAnimationFrame() {},
    setTimeout, clearTimeout, console,
  });
  if(randomSeed!==null)vm.runInContext("(function(){let seed="+Number(randomSeed)+";Math.random=function(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};})();",context);
  require("./load-rules.cjs")(context);
  if (worldArt) for (const file of ["world-art-assets.js","enemy-art.js","scene-art.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname,"..","..","static","js",file),"utf8"),context);
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "static", "js", "game.js"), "utf8").replace(/\nbindUi\(\);\s*initializeSession\(\);\s*$/, "");
  vm.runInContext(`${source}\nthis.api = { BattleGame, defaultState: DEFAULT_STATE, primarySecondary, previewSocketState, setState: value => { saveData = value; }, setSocket: value => { pendingSocket = value; }, setAudioPlayer: value => { battleAudio = value; }, getFeedback: () => feedback, startRealm, setSyncBlocked: value => { saveBlocked = value; }, getActiveGame: () => activeGame, setActiveGame: value => { activeGame = value; }, getProgress: () => saveData.progress, mockSave: value => { saveState = value; } };`, context);
  return { ...context.api, dispatchWindow: (name, event) => listeners.get(name)?.(event), listeners };
}

module.exports=gameContext;
