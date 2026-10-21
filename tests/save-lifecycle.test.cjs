const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");

function harness(fetcher, storage = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: "", style: {}, handlers: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, fn) { this.handlers[type] = fn; } });
    return nodes.get(id);
  };
  const context = vm.createContext({ document: { querySelector: node, querySelectorAll: () => [] },
    window: { scrollTo() {} }, localStorage: { getItem: () => null, setItem() {}, ...storage },
    setTimeout: () => 0, clearTimeout() {}, console, fetch: fetcher });
  require("./helpers/load-rules.cjs")(context);
  const source = fs.readFileSync(path.join(__dirname, "../static/js/game.js"), "utf8")
    .replace(/\nbindUi\(\);\s*initializeSession\(\);\s*$/, "");
  vm.runInContext(`${source}
    renderAll=()=>{};renderAccount=()=>{};
    this.api={saveState,startRealm,bindUi,state:()=>saveData,blocked:()=>saveBlocked,active:()=>activeGame,
      configure:(state,user=null,game=null)=>{saveData=state;currentUser=user;activeGame=game;}};
  `, context);
  return { ...context.api, node };
}

test("015 实际保存队列失败返回false，游客也阻止继续正式开战", async () => {
  const h = harness(async () => ({ ok: false, json: async () => ({ error: "测试断网" }) }));
  assert.equal(await h.saveState(""), false);
  assert.equal(h.blocked(), true);
  assert.equal(h.node("#save-status").textContent, "存档未同步");
  h.startRealm("fire"); assert.equal(h.active(), null);
  assert.equal(await h.saveState(""), false);
});

test("015 退出已结束试炼销毁旧实例，再载入新账号作用域", async () => {
  let destroyed = 0;
  const state = require("../static/data/rules/legacy-v1.json").default_state;
  const h = harness(async url => ({ ok: true, json: async () => url === "/api/state"
    ? { state: structuredClone(state), revision: 0 } : { user: null, csrf_token: "test" } }));
  h.configure({ ...structuredClone(state), active_trial: { id: "old-account-trial" } }, { id: 1 },
    { finished: true, destroy() { destroyed++; } });
  h.bindUi(); await h.node("#account-logout").handlers.click();
  assert.equal(destroyed, 1); assert.equal(h.active(), null);
  assert.equal(h.state().active_trial, undefined);
});

test("015 浏览器备份空间耗尽仍能保存SQLite主存档", async () => {
  let writes=0;
  const h=harness(async ()=>{writes++;return {ok:true,json:async()=>({revision:1})};},
    {setItem(){throw new Error("quota exceeded");}});
  assert.equal(await h.saveState(""),true);assert.equal(writes,1);
  assert.equal(h.blocked(),false);assert.equal(h.node("#save-status").textContent,"进度已保存");
});
