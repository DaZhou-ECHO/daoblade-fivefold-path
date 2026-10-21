const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
const config=require("../static/data/rules/array-lab-v1.json");
const initial=()=>({ruleset_id:config.ruleset_id,schema_version:2,rules_version:2,progress:{runs:0,victories:0,spirit:0},active_trial:null,stage:1,beads:structuredClone(config.beads),nodes:Object.fromEntries(config.nodes.map(n=>[n.id,null]))});
function harness({deferred=false}={}) {
  const nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:"",innerHTML:"",disabled:false,value:"",handlers:{},addEventListener(t,fn){this.handlers[t]=fn;},querySelectorAll(){return [];}});return nodes.get(id);};
  let stored=initial(),revision=0,fail=false,release;
  const waiting=deferred?new Promise(resolve=>{release=resolve;}):Promise.resolve();
  const context=vm.createContext({document:{getElementById:node},DaoBladeArrayLabRules:require("../static/js/array-lab-rules.js"),
    fetch:async(url,options)=>{
      if(url==="/api/auth/me")return {ok:true,json:async()=>({user:null,csrf_token:"test"})};
      if(!options){await waiting;return {ok:true,json:async()=>structuredClone({state:stored,revision,config,owner_id:null})};}
      if(fail)return {ok:false,json:async()=>({error:"试验档已被其他窗口更新"})};
      stored=JSON.parse(options.body).state;revision++;return {ok:true,json:async()=>({revision})};
    }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../static/js/array-lab-ui.js"),"utf8"),context);
  return {ui:context.DaoBladeArrayLabUI,node,stored:()=>stored,fail:()=>{fail=true;},release:()=>release?.()};
}
test("016 真实UI状态机：保存成功才可试招，冲突保留草稿并禁止覆盖",async()=>{
  const h=harness();await h.ui.load();assert.equal(h.node("lab-practice").disabled,true);
  h.node("lab-focus-preset").handlers.click();assert.equal(h.node("lab-practice").disabled,true);
  await h.node("lab-save").handlers.click();assert.equal(h.node("lab-practice").disabled,false);
  h.node("lab-focus-preset").handlers.click();assert.equal(h.node("lab-practice").disabled,false);assert.match(h.node("lab-save-status").textContent,/已保存/);
  h.node("lab-burst-preset").handlers.click();h.fail();await h.node("lab-save").handlers.click();
  assert.equal(h.node("lab-practice").disabled,true);assert.equal(h.node("lab-save").disabled,true);
  assert.match(h.node("lab-save-status").textContent,/草稿保留/);
  assert.match(h.node("lab-compiled").innerHTML,/蓄势引爆/);
  assert.equal(h.stored().nodes["li.focus"],"lab-focus");
});
test("016 换账号后忽略迟到读取，不把旧草稿带进新作用域",async()=>{
  const h=harness({deferred:true}),loading=h.ui.load();h.ui.reset();h.release();await loading;
  assert.equal(h.node("lab-practice").disabled,true);
  assert.equal(h.node("lab-nodes").textContent,"");
  assert.match(h.node("lab-save-status").textContent,/账号状态已更新/);
});
