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
