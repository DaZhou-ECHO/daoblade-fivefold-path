const assert=require("node:assert/strict"),test=require("node:test");
const levels=require("../static/js/level-definitions.js");

test("五境定义冻结且位置引用完整，平台/危险区在原世界范围内",()=>{
  assert.equal(levels.realm_ids.length,5);
  for(const id of levels.realm_ids){
    const level=levels.getDefinition(id);
    assert.equal(level.realm_id,id);assert.equal(level.version,1);
    for(const value of [level,level.world,level.anchors,level.anchors.spawn,level.platforms,level.platforms[0],level.encounters[0]])
      assert.equal(Object.isFrozen(value),true);
    assert.equal(level.encounters.length,6);
    assert.equal(new Set(level.encounters.map(e=>e.id)).size,6);
    for(const entry of [...level.encounters,...level.altars]) assert.ok(level.anchors[entry.anchor_id]);
    assert.equal(level.encounters.find(e=>e.kind==="boss").anchor_id,"boss");
    for(const platform of level.platforms){
      assert.ok(platform.x>=0&&platform.x+platform.w<=level.world.width);
      assert.ok(platform.y<=level.world.floor_y&&platform.h>0);
    }
    for(const hazard of level.hazards)assert.ok(hazard.x>=0&&hazard.x+hazard.w<=level.world.width);
    if(id === "fire") {
      assert.equal(level.checkpoint.id,"swordstone");
      assert.deepEqual(level.checkpoint.cleared_ids,["enemy-1","enemy-2","enemy-3"]);
      assert.equal(level.anchors[level.checkpoint.anchor_id].x,1640);
      assert.equal(Object.isFrozen(level.checkpoint.cleared_ids),true);
    } else assert.equal(level.checkpoint,undefined);
    assert.equal(level.exit,undefined);
  }
});

test("未知秘境明确拒绝，不返回对象原型或另一张地图",()=>{
  for(const id of ["missing","toString","__proto__"])assert.throws(()=>levels.getDefinition(id),/未知秘境/);
  assert.equal(Object.isFrozen(levels.realms.fire.enemies),true);
});


test("029 四境首领配置各两招且深冻结，火境沿用既有行为",()=>{
  for(const realm of levels.realm_ids){
    const moves=levels.getDefinition(realm).boss_moves;assert.equal(Object.isFrozen(moves),true);
    assert.equal(moves.length,realm==="fire"?0:2);
    for(const move of moves){assert.equal(Object.isFrozen(move),true);assert.ok(move.windup>=.5);assert.ok(move.recovery>=.7);assert.ok(move.label&&move.hint);}
  }
});


test("031 五境机关安全/预警/生效边界及错峰循环一致",()=>{
  const rhythms=new Set();
  for(const realm of levels.realm_ids){
    const hazards=levels.getDefinition(realm).hazards;
    for(const h of hazards){
      assert.equal(Object.isFrozen(h),true);
      const cycle=h.safe+h.warning+h.active;
      const at=t=>levels.hazardState(h,t-h.offset);
      assert.equal(at(0).phase,"safe");
      assert.equal(at(h.safe-.001).phase,"safe");
      assert.equal(at(h.safe+.001).phase,"warning");
      assert.equal(at(h.safe+h.warning-.001).phase,"warning");
      assert.equal(at(h.safe+h.warning+.001).phase,"active");
      assert.equal(at(cycle-.001).phase,"active");
      assert.equal(at(cycle+.001).phase,"safe");
      for(const t of [0,.1,1,100]){const state=levels.hazardState(h,t);assert.ok(state.remaining>0&&state.remaining<=cycle);}
      assert.ok(h.warning>=.7&&h.safe>=1.4);
    }
    assert.notEqual(hazards[0].offset,hazards[1].offset);
    rhythms.add([hazards[0].safe,hazards[0].warning,hazards[0].active].join('/'));
  }
  assert.equal(rhythms.size,5);
});
