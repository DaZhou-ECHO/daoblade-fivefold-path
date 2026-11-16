const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");

function harness(fetcher, storage = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: "", style: {}, handlers: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, fn) { this.handlers[type] = fn; } });
    return nodes.get(id);
  };
  const classes = new Set();
  const body = { classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name), toggle(name, force) { if (force) classes.add(name); else classes.delete(name); } } };
  const context = vm.createContext({ document: { querySelector: node, querySelectorAll: () => [], body },
    window: { scrollTo() {}, addEventListener() {} }, localStorage: { getItem: () => null, setItem() {}, ...storage },
    setTimeout: () => 0, clearTimeout() {}, console, fetch: fetcher });
  require("./helpers/load-rules.cjs")(context);
  const source = fs.readFileSync(path.join(__dirname, "../static/js/game.js"), "utf8")
    .replace(/\nbindUi\(\);\s*initializeSession\(\);\s*$/, "");
  vm.runInContext(`${source}
    renderAll=()=>{};renderAccount=()=>{};
    this.api={saveState,startRealm,bindUi,initializeSession,enterGuest,submitAccount,showEntry,state:()=>saveData,blocked:()=>saveBlocked,active:()=>activeGame,user:()=>currentUser,
      configure:(state,user=null,game=null)=>{saveData=state;currentUser=user;activeGame=game;},
      setJourney:ui=>globalThis.DaoBladeJourneyUI=ui};
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

test("045 退出已结束试炼回到登录入口，不暗中读取游客征程", async () => {
  let destroyed = 0, journeyLoads=0, legacyReads=0;
  const state = require("../static/data/rules/legacy-v1.json").default_state;
  const h = harness(async url => {if(url==="/api/state")legacyReads++;return { ok: true, json: async () => ({ user: null, csrf_token: "test" }) };});
  h.setJourney({load:async()=>{journeyLoads++;}});
  h.configure({ ...structuredClone(state), active_trial: { id: "old-account-trial" } }, { id: 1 },
    { finished: true, destroy() { destroyed++; } });
  h.bindUi(); h.node("#account-logout").handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(destroyed, 1); assert.equal(h.active(), null);
  assert.equal(journeyLoads,0);
  assert.equal(legacyReads,0);
  assert.equal(h.node("#entry-screen").hidden,false);
  assert.equal(h.node("#entry-auth-form").hidden,false);
});

test("045 未登录只显示入口，明确游客继续后才读正式征程", async () => {
  let journeyLoads=0;
  const h=harness(async url => ({ok:true,json:async()=>url==="/api/auth/me"?{user:null,csrf_token:"csrf"}:{}}));
  h.setJourney({load:async()=>{journeyLoads++;},entrySummary:()=>({blocked:false})});
  h.bindUi(); await h.initializeSession();
  assert.equal(journeyLoads,0);
  assert.equal(h.node("#entry-auth-form").hidden,false);
  h.node("#entry-guest").handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(journeyLoads,2); // 进入村落前读取一次，村落刷新再读取一次。
  assert.equal(h.node("#entry-screen").hidden,true);
});

test("045 身份读取失败停在入口，重试前不进入游客档", async () => {
  let reads=0;
  const h=harness(async () => {reads++;return {ok:false,json:async()=>({})};});
  h.setJourney({load:async()=>{throw Error("不应读取征程");}});
  await h.initializeSession();
  assert.equal(reads,1);
  assert.equal(h.node("#entry-screen").hidden,false);
  assert.equal(h.node("#entry-guest").hidden,true);
  assert.equal(h.node("#entry-retry").hidden,false);
});

test("045 已登录角色先展示征程摘要，点击继续才进入村落", async () => {
  let journeyLoads=0;
  const h=harness(async url => ({ok:true,json:async()=>url==="/api/auth/me"?{user:{id:7,username:"剑客"},csrf_token:"csrf"}:{}}));
  h.setJourney({load:async()=>{journeyLoads++;},entrySummary:()=>({rank:"练气",clears:2,trial:null,blocked:false})});
  h.bindUi(); await h.initializeSession();
  assert.equal(journeyLoads,1);
  assert.equal(h.node("#entry-return").hidden,false);
  assert.equal(h.node("#entry-rank").textContent,"练气");
  assert.equal(h.node("#entry-screen").hidden,false);
  h.node("#entry-continue").handlers.click();
  assert.equal(h.node("#entry-screen").hidden,true);
});

test("045 注册从入口进入对应账号，失败留在入口可重试", async () => {
  let failed=true,loads=0;
  const h=harness(async url => url==="/api/auth/register" && failed
    ? {ok:false,json:async()=>({error:"用户名已存在"})}
    : {ok:true,json:async()=>url==="/api/auth/register"?{user:{id:9,username:"新剑客"},csrf_token:"csrf"}:{}});
  h.setJourney({load:async()=>{loads++;},entrySummary:()=>({blocked:false})});
  h.node("#entry-username").value="新剑客"; h.node("#entry-password").value="secret";
  h.showEntry("register");
  await h.submitAccount("register",true);
  assert.equal(h.node("#entry-screen").hidden,false);
  assert.equal(h.node("#entry-error").textContent,"用户名已存在");
  failed=false;
  await h.submitAccount("register",true);
  assert.equal(h.user().id,9);
  assert.equal(h.node("#entry-screen").hidden,true);
  assert.equal(loads,2);
});

test("015 浏览器备份空间耗尽仍能保存SQLite主存档", async () => {
  let writes=0;
  const h=harness(async ()=>{writes++;return {ok:true,json:async()=>({revision:1})};},
    {setItem(){throw new Error("quota exceeded");}});
  assert.equal(await h.saveState(""),true);assert.equal(writes,1);
  assert.equal(h.blocked(),false);assert.equal(h.node("#save-status").textContent,"进度已保存");
});
