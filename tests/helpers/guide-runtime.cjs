// Compare explanatory parameters to the real journeySkill execution, not a copy of it.
const assert=require('node:assert/strict'),fs=require('node:fs');
const api=require('./load-game.cjs')();
for(const {compiled,expected} of JSON.parse(fs.readFileSync(0,'utf8'))){
  for(const boss of [false,true]){
    let damage=0;
    const enemy={x:100,y:0,w:30,h:70,dead:false,kind:boss?'boss':'guard',attackCd:0,slow:0};
    const player={x:0,y:0,w:38,h:70,face:1,qi:100,skillCooldowns:[0,0],invuln:0,shield:0};
    const game={lab:compiled,player,enemies:[enemy],stats:{qiMax:100},worldWidth:1000,
      skillInputBlocked:()=>false,journeyMindLevel:api.BattleGame.prototype.journeyMindLevel,
      hitEnemy:(e,value)=>{damage=value;}};
    api.BattleGame.prototype.journeySkill.call(game,0);
    assert.equal(damage,expected.damage);
    assert.ok(Math.abs(player.skillCooldowns[0]-expected.cooldown)<1e-9);
    assert.equal(player.qi,Math.min(100,100-expected.cost+(expected.id==='dui'?8:0)));
    if(expected.id==='li')assert.equal(enemy.labBurn,3);
    if(expected.id==='kan')assert.equal(enemy.slow,boss?.8:2);
    if(expected.id==='gen'){assert.equal(player.shield,12);assert.equal(player.shieldTime,3);}
    if(expected.id==='xun')assert.equal(player.x,180);
  }
}
