const test=require("node:test"),assert=require("node:assert/strict");
const cfg=require("../static/data/rules/array-lab-v1.json"),cases=require("./fixtures/array-lab-cases.json");
const rules=require("../static/js/array-lab-rules.js").createRuntime(cfg);
const initial=()=>({ruleset_id:cfg.ruleset_id,schema_version:1,rules_version:1,stage:1,beads:structuredClone(cfg.beads),nodes:Object.fromEntries(cfg.nodes.map(n=>[n.id,null]))});
for(const fixture of cases)test("016 共享编译样例 "+fixture.id,()=>{
  const state=initial();for(const role of fixture.roles)state.nodes["li."+role]="lab-"+role;
  const result=rules.compile(state);
  assert.deepEqual(result.effective,fixture.effective);assert.deepEqual(result.inactive,fixture.inactive);
  for(const key of ["enabled","focus","burst","mark"])assert.equal(result.skill[key],fixture[key]);
  assert.equal(result.used,fixture.roles.length);assert.equal(Object.isFrozen(result.skill),true);
});
test("016 可拆换不复制资源，错误元素/功能/锁定/互斥/容量严格拒绝",()=>{
  const state=initial(),before=structuredClone(state);
  const equipped=rules.equip(state,"li.core","lab-core"),detached=rules.equip(equipped,"li.core",null);
  assert.deepEqual(detached,state);assert.deepEqual(state,before);
  assert.throws(()=>rules.equip(state,"li.core","lab-water"),/火行/);
  assert.throws(()=>rules.equip(state,"li.core","lab-mark"),/功能/);
  assert.throws(()=>rules.equip(state,"li.cycle","lab-cycle"),/阶段/);
  const invalid=initial();invalid.nodes["li.focus"]="lab-focus";invalid.nodes["li.burst"]="lab-burst";
  assert.throws(()=>rules.validate(invalid),/互斥/);
  invalid.nodes["li.core"]="lab-core";invalid.nodes["li.mark"]="lab-mark";
  assert.throws(()=>rules.validate(invalid),/容量/);
});
