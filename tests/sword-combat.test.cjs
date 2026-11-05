const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const gameContext=require('./helpers/load-game.cjs');
const recipes=require('../static/data/sword-combos.json');
const fixtures=require('./helpers/journey-builds.json');
function make(recipe=recipes[0]){
  const api=gameContext();
  const skills=[recipe.main,recipe.sub].map(id=>structuredClone(fixtures.find(c=>c.skills[0].id===id).skills[0]));
  const compiled={...structuredClone(fixtures[0]),combo:recipe,skills,minds:[],mind_levels:{},training:{sword:0,step:0,guard:0}};
  const g=new api.BattleGame('fire',{swordPractice:true,practice:true,labCompiled:compiled});
  g.level={...g.level,version:1,shortcuts:[]};g.floorY=480;g.worldWidth=960;
  g.platforms=[{id:'floor',x:0,y:480,w:960,h:100,collision:'floor'}];
  g.player.x=350;g.player.y=410;g.player.qi=100;g.stats.qiRegen=0;g.stats.qiMax=100;
  g.enemies=[g.enemy('melee','target',430,10000,'melee')];g.enemies[0].attackCd=100;g.altars=[];g.hazards=[];
  return g;
}
function step(g,seconds,fps=60){for(let i=0;i<Math.ceil(seconds*fps);i++)g.update(Math.min(1/fps,seconds-i/fps));}
function press(g,a){g.performAction(a);step(g,.02);}
for(const recipe of recipes)test(recipe.id+' executes conditional follow-up once',()=>{
  const g=make(recipe),e=g.enemies[0];
  press(g,'dao');step(g,.35);
  if(recipe.main==='gen')g.damagePlayer(3,e.x,e.id,'slash',{guardable:true});
  assert.ok(g.swordWindow,'real hit/shield opens window');
  const qi=g.player.qi;
  press(g,'dao2');step(g,.9);
  assert.equal(g.swordWindow,null);
  assert.equal(g.player.qi,qi-g.lab.skills[1].cost+(recipe.id==='kan-dui'?8:0));
  assert.ok(e.hp<10000||recipe.main==='gen');
  if(recipe.id==='li-gen'){
    const before=e.hp;g.player.invuln=0;g.damagePlayer(3,e.x,e.id,'slash',{guardable:true});
    assert.ok(e.hp<before);const after=e.hp;
    g.player.invuln=0;g.damagePlayer(3,e.x,e.id,'slash',{guardable:true});assert.equal(e.hp,after);
  }
});
test('miss, backward movement, cooldown and pause do not fabricate combo',()=>{
  const g=make();g.enemies[0].x=800;press(g,'dao');step(g,.4);assert.equal(g.swordWindow,null);
  const qi=g.player.qi;press(g,'dao');assert.equal(g.player.qi,qi);
  g.setPause(true);assert.equal(g.swordWindow,null);assert.equal(g.swordCast,null);
});
test('shield environment damage never opens follow-up',()=>{
  const g=make(recipes[1]);press(g,'dao');step(g,.4);
  g.damagePlayer(3,0,'environment','hazard',{guardable:false});assert.equal(g.swordWindow,null);
});
test('lift and dive each hit a target at most once',()=>{
  const g=make(),e=g.enemies[0];e.x=395;
  g.keys.add('down');press(g,'slash');step(g,.4);
  assert.ok(e.hp<10000);assert.equal(g.player.combo,1);
  const after=e.hp;step(g,.2);assert.equal(e.hp,after);
  g.player.y=250;g.player.onGround=false;g.player.slashCooldown=0;
  press(g,'slash');step(g,.8);assert.equal(g.swordStrike,null);
  assert.ok(g.player.onGround);
});
test('tap/charged release deduct once; blur cancels held charge',()=>{
  const g=make();press(g,'qi');step(g,.5);
  assert.ok(g.swordCharge);const before=g.player.qi;
  g.keyUp({code:'KeyL'});step(g,.02);
  assert.equal(g.player.qi,before-28);assert.equal(g.projectiles.filter(p=>p.owner==='player').length,1);
  step(g,.7);press(g,'qi');g.clearInput();g.keyUp({code:'KeyL'});step(g,.03);assert.equal(g.player.qi,before-28);
});
test('window duration uses simulation time at 30, 60 and 120 fps',()=>{
  for(const fps of [30,60,120]){
    const g=make();press(g,'dao');step(g,.3,fps);assert.ok(g.swordWindow);
    step(g,1.1,fps);assert.equal(g.swordWindow,null);
  }
});
test('new E at hit time buffers through recovery, early E stays ordinary',()=>{
  const g=make();press(g,'dao');step(g,.12);
  assert.ok(g.swordWindow);press(g,'dao2');step(g,.4);
  assert.equal(g.swordShield.kind,'lamp');
  const early=make();press(early,'dao');press(early,'dao2');step(early,.6);
  assert.notEqual(early.swordShield?.kind,'lamp');
});
test('cancelled dive never becomes a second normal slash after resume',()=>{
  const g=make();g.player.y=230;g.player.onGround=false;g.keys.add('down');press(g,'slash');
  assert.equal(g.swordStrike.kind,'dive');g.setPause(true);
  assert.equal(g.player.slash,0);assert.equal(g.swordStrike,null);
});
test('wall blocks crossing and cliff-safe retreat preserves support',()=>{
  const g=make(recipes[4]);g.platforms.push({x:405,y:300,w:40,h:180,collision:'solid'});
  press(g,'dao');step(g,.4);assert.ok(g.player.x+g.player.w<=405);assert.equal(g.swordWindow,null);
  const retreat=make(recipes[3]);retreat.player.x=20;retreat.enemies[0].x=85;
  press(retreat,'dao');step(retreat,.36);press(retreat,'dao2');step(retreat,.4);
  assert.ok(retreat.player.x>=0);assert.ok(retreat.player.onGround);
});
test('resource failure and paused direct cast cannot spend or arm',()=>{
  const g=make();g.player.qi=0;press(g,'dao');step(g,.3);
  assert.equal(g.swordCast,null);assert.equal(g.swordWindow,null);
  g.player.qi=100;g.setPause(true);g.journeySkill(0);
  assert.equal(g.player.qi,100);assert.equal(g.swordCast,null);
});
test('nonpositive first-frame delta cannot create a phantom attack',()=>{
  const g=make();g.update(-.005);g.update(0);
  assert.equal(g.player.slash,0);assert.equal(g.player.qiCast,0);assert.equal(g.player.combo,0);
  step(g,.02);assert.equal(g.player.slash,0);
});
test('cancelled pointer releases held charge without firing',()=>{
  const g=make();g.keys.add('qi');press(g,'qi');step(g,.5);
  g.touchPointers.set(1,{action:'qi',button:{hasPointerCapture:()=>false}});
  g.endTouchPointer(1,true);step(g,.03);
  assert.equal(g.swordCharge,null);assert.equal(g.projectiles.length,0);assert.equal(g.player.qi,100);
});
test('tide settles once and boss slow retains resistance',()=>{
  const g=make(recipes[5]);const e=g.enemies[0];e.kind='boss';
  press(g,'dao');step(g,.35);const before=e.hp;press(g,'dao2');step(g,.65);
  assert.ok(e.hp<before);assert.ok(e.slow<=.8&&e.slow>0);
  const after=e.hp;step(g,.15);assert.equal(e.hp,after);
});
test('lift survives version-two terrain resolution and boss stays grounded',()=>{
  const g=make(),e=g.enemies[0];e.x=395;e.leash={min:380,max:600};e.homeY=480;e.homeX=430;
  g.level={...g.level,version:2,sections:[],required_ids:[],exit:{x:950,y:480}};
  g.keys.add('down');press(g,'slash');step(g,.12);
  assert.ok(e.swordLift);assert.ok(e.y<480-e.h);
  step(g,.75);assert.equal(e.y,480-e.h);assert.equal(e.swordLift,undefined);
  const boss=make();boss.enemies[0].kind='boss';boss.enemies[0].x=395;boss.keys.add('down');press(boss,'slash');step(boss,.2);
  assert.equal(boss.enemies[0].swordLift,undefined);
});
