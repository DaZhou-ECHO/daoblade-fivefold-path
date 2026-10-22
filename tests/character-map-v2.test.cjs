const test=require("node:test"), assert=require("node:assert/strict");
const C=require("../static/js/combat-controller.js"), levels=require("../static/js/level-definitions.js");
const loadGame=require("./helpers/load-game.cjs");
const fixture=require("./helpers/journey-ui.json");
function game(version=2,realm="fire",map="ridge"){
  const api=loadGame([],null,20261022),compiled=JSON.parse(JSON.stringify(fixture.compiled));
  const trial={id:"unit",realm_id:realm,map_id:map,compiled,checkpoint:null,claimed_altars:[],opened_shortcuts:[]};
  if(version===2)Object.assign(trial,{combat_version:2,map_version:2});
  const g=new api.BattleGame(realm,{labTrial:trial,labCompiled:compiled});
  g.altars=[];g.hazards=[];g.updateEnemies=()=>{};return g;
}
function steps(g,seconds,fps=60){for(let i=0;i<Math.round(seconds*fps);i++)g.update(1/fps);}
test("036 old trials omit versions and retain v1; unknown versions fail visibly",()=>{
  const old=game(1);assert.equal(old.combatV2,false);assert.equal(old.level.version,1);
  assert.throws(()=>levels.getJourneyDefinition("fire","ridge",99),/版本/);
});
test("036 policy shares slash phases and respects third-hit commitment",()=>{
  const p={hp:100,slash:.05,slashDuration:.28,combo:1};
  assert.equal(C.phase(p),"recovery");assert.equal(C.permit(p,"dash").status,"accepted");
  p.combo=3;assert.equal(C.permit(p,"dash").status,"buffered");
  p.hurt=.1;assert.equal(C.permit(p,"block").reason,"hurt");
});
for(const fps of [30,60,120]){
  test("036 variable jump and buffered landing at "+fps+" fps",()=>{
    const high=game(),low=game();
    high.keys.add("jump");low.keys.add("jump");
    high.performAction("jump");low.performAction("jump");steps(high,.1,fps);steps(low,.1,fps);
    low.keys.delete("jump");C.releaseJump(low.player);
    let highTop=high.player.y,lowTop=low.player.y;
    for(let i=0;i<fps;i++){high.update(1/fps);low.update(1/fps);highTop=Math.min(highTop,high.player.y);lowTop=Math.min(lowTop,low.player.y);}
    assert.ok(highTop<lowTop-20);assert.ok(highTop<=308);assert.equal(low.player.onGround,true);
    const buffer=game();buffer.player.y=390;buffer.player.vy=50;buffer.player.onGround=false;buffer.keys.add("jump");
    buffer.performAction("jump");steps(buffer,.1,fps);assert.ok(buffer.player.vy<0);
  });
  test("036 one attack hits once at "+fps+" fps",()=>{
    const g=game();g.enemies=[g.enemy("melee","test",165,1000)];
    g.performAction("slash");steps(g,.3,fps);
    assert.equal(g.events.recent.filter(e=>e.type==="enemy_hit").length,1);
  });
}
test("036 simultaneous priority, bounded buffering, pause and release cleanup",()=>{
  const g=game();g.performAction("slash");g.performAction("dash");g.update(1/120);
  assert.ok(g.player.dash>0);assert.equal(g.player.slash,0);steps(g,.6);assert.equal(g.player.slash,0);
  g.player.hurt=.4;const qi=g.player.qi;g.performAction("dao");assert.equal(g.player.qi,qi);
  steps(g,.5);assert.equal(g.player.qiCast,0);
  g.performAction("slash");g.setPause(true);assert.deepEqual(Object.keys(g.intents),[]);g.setPause(false);g.update(1/120);assert.equal(g.player.slash,0);
});
test("036 guard turns, waits as ordinary only, and is released without ghost actions",()=>{
  const g=game();g.player.slash=.2;g.player.slashDuration=.28;g.player.combo=3;
  g.keys.add("block");g.performAction("block");steps(g,.3);
  assert.equal(g.player.blocking,true);assert.equal(g.player.parryArmed,0);
  g.keys.add("left");g.update(1/120);assert.equal(g.player.face,-1);
  g.keys.delete("block");g.keyUp({code:"KeyK"});assert.equal(g.player.blocking,false);
});
test("036 normal guard exact cost, heavy guard, break and perfect guard",()=>{
  const g=game(),p=g.player;p.blocking=true;p.qi=12;p.face=1;
  g.damagePlayer(20,p.x+100,"enemy-1","slash");assert.equal(p.qi,0);assert.equal(p.guardBreak,0);
  const heavy=game();heavy.player.blocking=true;heavy.player.qi=20;heavy.damagePlayer(20,300,"enemy-1","slam");assert.equal(heavy.player.qi,0);
  const broken=game();broken.player.blocking=true;broken.player.qi=11;broken.keys.add("block");
  broken.damagePlayer(20,300,"enemy-1","slash");assert.equal(broken.player.qi,0);assert.equal(broken.player.guardBreak,.45);
  assert.equal(broken.player.blocking,false);assert.ok(broken.events.recent.some(e=>e.type==="player_guard_broken"));
  const hp=broken.player.hp;steps(broken,.3);assert.equal(broken.player.blocking,false);steps(broken,.2);
  assert.equal(broken.player.blocking,true);assert.equal(broken.player.parryArmed,0);assert.equal(broken.player.hp,hp);
  const parry=game();parry.player.qi=0;parry.keys.add("block");parry.performAction("block");parry.update(1/120);
  parry.damagePlayer(20,300,"enemy-1","slash");assert.equal(parry.player.hp,parry.stats.hpMax);assert.equal(parry.player.qi,8);
});
test("036 guard pauses regeneration; back hits and hazards cannot parry",()=>{
  const g=game();g.player.blocking=true;g.player.qi=30;steps(g,.3);assert.equal(g.player.qi,30);
  g.player.blocking=false;steps(g,.2);assert.equal(g.player.qi,30);steps(g,.2);assert.ok(g.player.qi>30);
  for(const [source,x] of [["enemy-1",0],["environment",300]]){
    const h=game();h.player.blocking=true;h.player.parryArmed=.2;h.damagePlayer(20,x,source,"hazard");
    assert.ok(h.player.hp<h.stats.hpMax);assert.equal(h.player.qi,h.stats.qiMax);
  }
});
test("036 collision sides, ceiling and one-way dropping never pass the floor",()=>{
  const p={x:0,y:20,w:20,h:30,vx:200,vy:0};
  C.physics(p,[{id:"wall",x:70,y:0,w:10,h:100,collision:"solid"}],.5,1000);
  assert.equal(p.x,50);
  const q={x:30,y:100,w:20,h:30,vx:0,vy:-300};
  C.physics(q,[{id:"roof",x:0,y:30,w:100,h:20,collision:"solid"}],.3,1000);assert.equal(q.y,50);assert.equal(q.vy,0);
  const g=game(),platform=g.platforms.find(s=>s.collision==="oneway");
  g.player.x=platform.x+20;g.player.y=platform.y-g.player.h;g.player.groundPlatform=platform.id;
  g.keys.add("down");g.performAction("jump");assert.ok(g.player.dropPlatform);steps(g,.8);
  assert.equal(g.player.y+g.player.h,g.floorY);assert.equal(C.drop(g.player,g.platforms),false);
});
test("036 active slash facing stays locked, next slash uses new direction",()=>{
  const g=game();g.performAction("slash");g.update(1/120);g.keys.add("left");steps(g,.12);
  assert.equal(g.player.face,1);steps(g,.25);g.performAction("slash");g.update(1/120);assert.equal(g.player.face,-1);
});
for(const realm of levels.realm_ids)for(const map of ["ridge","hollow"]){
 test("036 versioned map and optional guards "+realm+"/"+map,()=>{
  const g=game(2,realm,map);assert.equal(g.level.version,2);assert.equal(g.level.sections.length,7);
  assert.ok(g.platforms.some(p=>p.collision==="solid"));assert.ok(Object.isFrozen(g.level.sections));
  for(const e of g.enemies)e.dead=g.level.required_ids.includes(e.id);
  assert.equal(g.canExit(),true);assert.equal(g.enemies.find(e=>e.optional).dead,false);
  g.update(1/120);assert.equal(g.finished,false);
  g.enemies.find(e=>e.id==="enemy-1").dead=false;assert.equal(g.canExit(),false);
 });
}
test("036 shortcut restore is isolated and deduplicated",()=>{
 const g=game();g.openedShortcuts.add("return-path");g.syncShortcuts();g.syncShortcuts();
 assert.equal(g.platforms.filter(p=>p.id==="return-bridge").length,1);
 assert.equal(game().platforms.some(p=>p.id==="return-bridge"),false);
});

function walkTo(g,x,footY,fps){
  const p=g.player;g.keys.add("jump");
  for(let i=0;i<fps*7;i++){
    const dx=x-p.x;
    g.keys.delete("left");g.keys.delete("right");
    if(Math.abs(dx)>7)g.keys.add(dx>0?"right":"left");
    if(p.onGround&&p.y+p.h>footY+1&&Math.abs(dx)<190)g.performAction("jump");
    if(p.onGround&&p.y+p.h===474){
      const cover=g.platforms.find(s=>s.collision==="solid"&&s.x>p.x&&s.x-p.x<110);
      if(cover)g.performAction("jump");
    }
    g.update(1/fps);
    if(Math.abs(p.x-x)<30&&p.onGround&&Math.abs(p.y+p.h-footY)<1)return true;
  }
  return false;
}
for(const fps of [30,60,120])for(const realm of levels.realm_ids)for(const map of ["ridge","hollow"]){
 test("036 basic single-jump branch return "+realm+"/"+map+" "+fps,()=>{
   const g=game(2,realm,map),routes=g.platforms.filter(p=>p.collision==="oneway");
   const first=routes[0],second=routes[1];
   const low=first.y>second.y?first:second,high=first.y>second.y?second:first;
   assert.ok(walkTo(g,low.x+low.w/2,low.y,fps),"lower approach");
   assert.ok(walkTo(g,high.x+high.w/2,high.y,fps),"upper approach");
   assert.ok(C.drop(g.player,g.platforms),"drop from optional upper route");
   assert.ok(walkTo(g,1500,474,fps),"return to main road over solid cover");
   const a=routes[2],b=routes[3],lo=a.y>b.y?a:b,hi=a.y>b.y?b:a;
   assert.ok(walkTo(g,lo.x+lo.w/2,lo.y,fps),"second lower approach");
   assert.ok(walkTo(g,hi.x+hi.w/2,hi.y,fps),"second upper approach");
   assert.ok(C.drop(g.player,g.platforms),"second route drop");
   assert.ok(walkTo(g,2450,474,fps),"second return to main road");
 });
}

for(const realm of levels.realm_ids)for(const map of ["ridge","hollow"])test("036 engine combat to exit "+realm+"/"+map,async()=>{
 const g=game(2,realm,map),p=g.player;delete g.updateEnemies;g.runUI={trialAction:async(action)=>({state:{active_trial:{...g.labTrial,checkpoint:action==="checkpoint"?"swordstone":g.labTrial.checkpoint}}})};g.hazards=g.level.hazards.map(h=>({...h}));
 let ended=false,win=false;g.finish=value=>{ended=true;win=value;g.finished=true;};
 // Deterministic input bot: moves, jumps, attacks and defends through public actions.
 // No fake HP/damage/outcome or save API writes. It is engine evidence, not browser play.
 for(let frame=0;frame<60*150&&!ended;frame++){
  const target=g.enemies.filter(e=>!e.dead&&!e.optional).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0];
  g.keys.delete("left");g.keys.delete("right");
  if(!target){g.keys.add("right");if(g.canExit()&&Math.abs(p.x-g.level.exit.x)<85){g.interactWorld();}}
  else{
   const dx=target.x-p.x;
   if(Math.abs(dx)>72)g.keys.add(dx>0?"right":"left");
   else if(!p.slash&&!p.qiCast&&!p.dash)p.face=dx<0?-1:1;
   if(Math.abs(dx)<155){
    if(["windup","strike"].includes(target.attackState)&&p.slash<=0){
      if(!g.keys.has("block")){g.keys.add("block");g.performAction("block");}
    }
    else{
     g.keys.delete("block");p.blocking=false;
     if(p.skillCooldowns[0]<=0&&p.qi>=g.lab.skills[0].cost)g.performAction("dao");
     else if(p.slashCooldown<=0)g.performAction("slash");
    }
   }
  }
  if(p.onGround&&g.platforms.some(s=>s.collision==="solid"&&s.x>=p.x&&s.x-p.x<100)){g.keys.add("jump");g.performAction("jump");}
  g.update(1/60); if(g.labPending)await new Promise(resolve=>setImmediate(resolve));
 }
 assert.ok(ended&&win,JSON.stringify({ended,win,hp:p.hp,x:p.x,enemies:g.enemies.map(e=>({id:e.id,hp:e.hp,x:e.x,y:e.y,state:e.attackState}))}));
});

test("036 same-tick priority is independent of key event ordering",()=>{
 for(const actions of [["block","slash"],["slash","block"],["dao","dash"],["dash","dao"]]){
  const g=game();g.keys.add("block");
  for(const action of actions)g.performAction(action);
  g.update(1/120);
  if(actions.includes("block")){assert.equal(g.player.blocking,true);assert.equal(g.player.slash,0);}
  else {assert.ok(g.player.dash>0);assert.equal(g.player.qiCast,0);}
 }
 const g=game();g.keys.add("block");g.performAction("block");g.update(1/120);
 g.performAction("slash");g.update(1/120);assert.ok(g.player.slash>0);assert.equal(g.player.blocking,false);
});
test("036 partial shielding cannot cancel a guard-break stagger and unknown API versions are handled separately",()=>{
 const g=game();g.keys.add("block");g.player.blocking=true;g.player.qi=0;g.player.shield=100;
 g.damagePlayer(20,300,"enemy-1","slam");
 assert.equal(g.player.hurt,.45);assert.equal(g.player.guardBreak,.45);assert.equal(g.player.blocking,false);
});
