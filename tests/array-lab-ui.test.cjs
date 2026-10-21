const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
const config=require("../static/data/rules/array-lab-v1.json");
const initial=()=>({ruleset_id:config.ruleset_id,schema_version:2,rules_version:2,progress:{runs:0,victories:0,spirit:0},active_trial:null,stage:1,beads:structuredClone(config.beads),nodes:Object.fromEntries(config.nodes.map(n=>[n.id,null]))});
function harness({deferred=false}={}) {
  const nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:"",innerHTML:"",disabled:false,value:"",handlers:{},addEventListener(t,fn){this.handlers[t]=fn;},querySelectorAll(){return [];}});return nodes.get(id);};
  let stored=initial(),revision=0,fail=false,release;
  const trialRequests=[];
  const waiting=deferred?new Promise(resolve=>{release=resolve;}):Promise.resolve();
  const context=vm.createContext({document:{getElementById:node},DaoBladeArrayLabRules:require("../static/js/array-lab-rules.js"),
    fetch:async(url,options)=>{
      if(url==="/api/auth/me")return {ok:true,json:async()=>({user:null,csrf_token:"test"})};
      if(!options){await waiting;return {ok:true,json:async()=>structuredClone({state:stored,revision,config,owner_id:null})};}
      if(fail)return {ok:false,json:async()=>({error:"试验档已被其他窗口更新"})};
      if(url==="/api/lab/trial"){
        const body=JSON.parse(options.body);trialRequests.push(body);
        if(body.revision!==revision)throw new Error("stale revision");
        if(body.action==="start")stored.active_trial={id:"test-trial",realm_id:body.realm_id||"fire",checkpoint:null,claimed_altars:[],build:{stage:stored.stage,beads:structuredClone(stored.beads),nodes:structuredClone(stored.nodes)}};
        if(body.action==="checkpoint")stored.active_trial.checkpoint="swordstone";
        if(body.action==="abandon")stored.active_trial=null;
        revision++;return {ok:true,json:async()=>structuredClone({state:stored,revision,trial_compiled:require("../static/js/array-lab-rules.js").createRuntime(config).compile(stored)})};
      }
      stored=JSON.parse(options.body).state;revision++;return {ok:true,json:async()=>({revision})};
    }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../static/js/array-lab-ui.js"),"utf8"),context);
  return {ui:context.DaoBladeArrayLabUI,node,trialRequests,context,stored:()=>stored,fail:()=>{fail=true;},release:()=>release?.()};
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


test("018 真实UI动作队列逐次使用ACK版本，冻结配珠并在放弃后解锁",async()=>{
  const h=harness();await h.ui.load();h.node("lab-burst-preset").handlers.click();await h.node("lab-save").handlers.click();
  let launched;h.context.DaoBladeStartArrayTrial=(trial,compiled)=>{launched={trial,compiled};};
  await h.ui.startTrial();assert.equal(launched.trial.id,"test-trial");assert.equal(launched.compiled.skill.burst,true);
  assert.equal(h.node("lab-save").disabled,true);assert.equal(h.node("lab-challenge").disabled,true);
  h.node("lab-focus-preset").handlers.click();assert.equal(h.stored().nodes["li.focus"],null);
  await Promise.all([h.ui.trialAction("altar",{trial_id:"test-trial",altar_id:"altar-1"}),h.ui.trialAction("checkpoint",{trial_id:"test-trial",defeated_ids:["enemy-1","enemy-2","enemy-3"]})]);
  assert.deepEqual(h.trialRequests.map(r=>r.revision),[1,2,3]);assert.match(h.node("lab-trial-status").textContent,/剑碑已保存/);
  await h.ui.resumeTrial();assert.equal(launched.trial.checkpoint,"swordstone");
  await assert.rejects(h.ui.restartTrial("another-trial"),/不能覆盖/);
  await h.ui.abandonTrial();assert.equal(h.node("lab-save").disabled,false);assert.equal(h.node("lab-resume").disabled,true);
});

test("018 冲突阻止队列后续写入，保留服务试炼供重读恢复",async()=>{
  const h=harness();await h.ui.load();h.node("lab-focus-preset").handlers.click();await h.node("lab-save").handlers.click();
  h.context.DaoBladeStartArrayTrial=()=>{};await h.ui.startTrial();h.fail();
  const results=await Promise.allSettled([h.ui.trialAction("checkpoint",{trial_id:"test-trial"}),h.ui.trialAction("altar",{trial_id:"test-trial"})]);
  assert.equal(results.every(r=>r.status==="rejected"),true);assert.equal(h.node("lab-resume").disabled,true);assert.equal(h.stored().active_trial.id,"test-trial");
});


test("021 真实选关UI发送木境，恢复继续使用服务realm，活动中不能换境",async()=>{
  const h=harness();await h.ui.load();h.node("lab-burst-preset").handlers.click();await h.node("lab-save").handlers.click();
  h.node("lab-realm").value="wood";h.node("lab-realm").handlers.change();let launched;
  h.context.DaoBladeStartArrayTrial=(trial)=>{launched=trial;};await h.ui.startTrial();
  assert.equal(h.trialRequests[0].realm_id,"wood");assert.equal(launched.realm_id,"wood");assert.equal(h.node("lab-realm").disabled,true);
  h.node("lab-realm").value="fire";h.node("lab-realm").handlers.change();await h.ui.resumeTrial();assert.equal(launched.realm_id,"wood");
  assert.match(h.node("lab-trial-status").textContent,/青木境/);
});
