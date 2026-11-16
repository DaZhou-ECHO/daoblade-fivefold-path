const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {Assets,validManifest}=require("../static/js/world-art-assets.js");
const {Renderer,visualState,frameIndex,family,motion}=require("../static/js/enemy-art.js");
const Scene=require("../static/js/scene-art.js").Renderer;
const data=JSON.parse(fs.readFileSync("static/sprites/world-v1/manifest.json","utf8"));
function enemy(extra={}){return {id:"e",kind:"melee",variant:"swordsman",x:100,y:412,w:42,h:62,face:1,attackDirection:-1,attackState:"idle",attackTimer:0,hp:64,maxHp:64,...extra};}
function mockImage(bad=null){
 const sizes={};
 for(const f of Object.values(data.families))sizes[f.src]=[f.frameSize[0]*4,f.frameSize[1]*(Math.max(...Object.values(f.animations).map(a=>a.row))+1)];
 for(const s of Object.values(data.realms)){sizes[s.far]=[768,144];sizes[s.mid]=[768,96];sizes[s.tiles]=[128,32];sizes[s.props]=[256,96];}
 for(const s of Object.values(data.maps||{})){sizes[s.far]=[768,144];sizes[s.mid]=[768,96];}
 return class{set src(src){this._src=src;this.naturalWidth=sizes[src][0];this.naturalHeight=sizes[src][1];queueMicrotask(()=>src===bad?this.onerror():this.onload());}};
}
async function assets(bad=null){const a=new Assets();await a.load(async()=>({ok:true,json:async()=>data}),mockImage(bad));return a;}
function ctx(fail=false){return {depth:0,images:[],moves:[],scales:[],save(){this.depth++;},restore(){this.depth--;},translate(x,y){this.moves.push([x,y]);},scale(x,y){this.scales.push([x,y]);},drawImage(...v){if(fail)throw Error("draw");this.images.push(v);},fillRect(){},strokeRect(){},beginPath(){},rect(){},clip(){}};}

test("037 strict local manifest rejects traversal, invalid frame and anchor",()=>{
 assert.equal(validManifest(data),true);
 for(const edit of [
  d=>d.families["fire-guard"].src="/static/sprites/world-v1/../bad.png",
  d=>d.families["fire-guard"].foot=[-1,90],
  d=>d.families["fire-guard"].animations.strike.count=999,
  d=>delete d.realms.water,
  d=>delete d.maps['water:hollow'],
  d=>d.maps['fire:hollow'].far='/static/sprites/world-v1/../bad.png']){const d=structuredClone(data);edit(d);assert.equal(validManifest(d),false);}
});
test("037 resources load once, partial failure remains isolated and is never retried",async()=>{
 const bad=data.families["fire-guard"].src,a=await assets(bad);
 assert.equal(a.status,"ready");assert.equal(a.images.size,49);assert.equal(a.get(bad),null);
 await a.load(()=>{throw Error("must not refetch");});assert.equal(a.failed.size,1);
});
test("037 malformed or missing manifest safely returns false",async()=>{
 for(const fetcher of [async()=>({ok:false}),async()=>({ok:true,json:async()=>null}),async()=>{throw Error("offline");}]){
  const a=new Assets();assert.equal(await a.load(fetcher,mockImage()),false);assert.equal(a.status,"failed");
 }
});
test("037 wrong PNG dimensions are rejected without breaking other resources",async()=>{
 const Mock=mockImage(),a=new Assets();
 class Wrong extends Mock{set src(s){super.src=s;this.naturalWidth=0;}}
 await a.load(async()=>({ok:true,json:async()=>data}),Wrong);
 assert.equal(a.images.size,0);assert.equal(a.failed.size,50);
});
test("037 state snapshot is immutable, reads real timer and locks attacking facing",()=>{
 const e=Object.freeze(enemy({attackState:"windup",attackTimer:.15}));
 const s=visualState(e,2,.3);
 assert.equal(s.progress,.5);assert.equal(s.face,-1);assert.equal(s.phase,"windup");assert.ok(Object.isFrozen(s));
 assert.equal(e.attackTimer,.15);
});
test("037 observed phase tracks remaining timer; paused frame and foot do not drift",()=>{
 const r=new Renderer(new Assets()),e=enemy({attackState:"windup",attackTimer:.5});
 r.sync([e],1);e.attackTimer=.25;r.sync([e],1.25);const before=r.states.get("e");r.sync([e],1.25);
 assert.deepEqual(r.states.get("e"),before);assert.equal(before.progress,.5);
 e.attackState="strike";e.attackTimer=.22;r.sync([e],1.26);assert.equal(r.states.get("e").progress,0);
});
test("037 dead entities are visual remnants only; source fields and hp stay unchanged",()=>{
 const r=new Renderer(new Assets()),e=enemy({dead:true,hp:0}),original=JSON.stringify(e);
 r.sync([e],1);r.sync([e],1.4);assert.ok(r.states.get("e").progress>.5);
 assert.equal(JSON.stringify(e),original);r.clear();assert.equal(r.states.size,0);
});
test("037 flipping preserves identical world anchor and balances Canvas stack",async()=>{
 const a=await assets(),r=new Renderer(a),c=ctx(),s=visualState(enemy(),1);
 assert.ok(r.draw(c,"fire",s,{anchor:true}));r.draw(c,"fire",{...s,face:-1},{anchor:true});
 assert.deepEqual(c.moves,[[121,474],[121,474]]);assert.deepEqual(c.scales,[[1,1],[-1,1]]);
 assert.equal(c.depth,0);assert.equal(c.images[0][5],c.images[1][5]);
});
test("037 draw exception restores Canvas and marks broken resource once",async()=>{
 const a=await assets(),r=new Renderer(a),c=ctx(true);
 assert.equal(r.draw(c,"fire",visualState(enemy(),0)),false);assert.equal(c.depth,0);
 assert.equal(a.get(data.families["fire-guard"].src),null);
});
test("037 scene missing resources falls back; clipping and integer parallax are read only",async()=>{
 assert.equal(new Scene(new Assets()).background(ctx(),"fire",0,960,540),false);
 const a=await assets(),r=new Scene(a),c=ctx(),p=Object.freeze({x:60,y:400,w:200,h:32,collision:"oneway"});
 assert.equal(r.platform(c,"fire",p),true);assert.equal(c.depth,0);
 assert.ok(c.images.every(v=>v[1]===32));
 assert.ok(r.background(c,"fire",13.4,960,540,2,"hollow"));
 assert.equal(p.x,60);assert.equal(c.depth,0);
});
test("038 ten maps select their own far/mid scenes and a missing pair falls back to the realm",async()=>{
 const a=await assets(),r=new Scene(a);
 for(const [key,s] of Object.entries(data.maps)){
  const [realm,route]=key.split(':'),c=ctx();
  assert.ok(r.background(c,realm,1600,960,540,2,`journey-v1:${realm}:${route}:v2`));
  assert.equal(c.images[0][0]._src,s.far,key);
  assert.equal(c.images[1][0]._src,s.mid,key);
 }
 const missing=data.maps['fire:hollow'].far,b=await assets(missing),c=ctx();
 assert.ok(new Scene(b).background(c,'fire',1600,960,540,2,'journey-v1:fire:hollow:v2'));
 assert.equal(c.images[0][0]._src,data.realms.fire.far);
 const legacy=ctx();assert.ok(r.background(legacy,'fire',0,960,540,0,'legacy-v1:fire'));
 assert.equal(legacy.images[0][0]._src,data.realms.fire.far);
});
test("037 all visual families and attack styles select distinct animation routes",()=>{
 assert.equal(family(enemy()),"guard");assert.equal(family(enemy({variant:"crusher"})),"special");
 assert.equal(family(enemy({kind:"ranged"})),"ranged");assert.equal(family(enemy({kind:"boss"})),"boss");
 assert.equal(motion(enemy({attackType:"dash"})),"dash");assert.equal(motion(enemy({attackType:"wave"})),"cast");
 assert.equal(motion(enemy({attackType:"slam"})),"heavy");
 for(const f of Object.values(data.families)){
  for(const [action,a] of Object.entries(f.animations)) {
   assert.equal(frameIndex(a,{action,progress:1,elapsed:0}),["idle","walk"].includes(action)?0:a.count-1);
  }
 }
});
for(const fps of [30,60,120])test("037 visual observation leaves simulation unchanged at "+fps+" fps",()=>{
 const load=require("./helpers/load-game.cjs");
 const make=art=>{const api=load([],null,20261022,art);return new api.BattleGame("fire",{});};
 const a=make(false),b=make(true);
 for(let i=0;i<fps*4;i++){
  if(i===20){a.performAction("slash");b.performAction("slash");}
  a.update(1/fps);b.update(1/fps);b.enemyArt.sync(b.enemies,b.elapsed);
 }
 assert.equal(JSON.stringify(a.player),JSON.stringify(b.player));
 assert.equal(JSON.stringify(a.enemies),JSON.stringify(b.enemies));
 assert.equal(JSON.stringify(a.projectiles),JSON.stringify(b.projectiles));
 assert.equal(a.elapsed,b.elapsed);assert.equal(a.finished,b.finished);
 a.destroy();b.destroy();
});

test("037 legacy instant impact uses recovery timer without inventing an active window",()=>{
 const r=new Renderer(new Assets()),e=enemy({attackState:"windup",attackTimer:.38});
 r.sync([e],0);e.attackState="recover";e.attackTimer=.24;r.sync([e],.38);
 assert.equal(r.states.get("e").action,"strike");
 e.attackTimer=.1;r.sync([e],.52);assert.equal(r.states.get("e").action,"recover");
 assert.equal(e.attackState,"recover");assert.equal(e.attackTimer,.1);
});
test("037 hit flash cannot hide a real windup or strike pose",()=>{
 const s=visualState(enemy({attackState:"strike",attackTimer:.1,hurt:.15}),1,.2);
 assert.equal(s.action,"strike");assert.equal(s.hurt,true);
});

test("037 missing shared resource script keeps both renderers in safe fallback",()=>{
 const r=new Renderer(null),scene=new Scene(null),e=enemy();
 r.sync([e],0);assert.equal(r.draw(ctx(),"fire",r.states.get(e.id)),false);
 assert.equal(scene.background(ctx(),"fire",0,960,540),false);
 assert.equal(scene.platform(ctx(),"fire",{x:0,y:474,w:100,h:80}),false);
 assert.equal(scene.prop(ctx(),"fire","altar",0,474),false);
});
