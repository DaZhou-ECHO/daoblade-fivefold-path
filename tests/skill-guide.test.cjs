const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness(){
  const elements=new Map(),timers=new Map(),requests=[];let serial=0;
  const node=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,addEventListener(){}});return elements.get(id);};
  const context=vm.createContext({document:{getElementById:node},console,
    setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),
    DaoBladeJourneyUI:{previewBuild:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/skill-guide.js'),'utf8'),context);
  const saved={used:1,capacity:6,skills:[null,null],minds:[]};
  const snapshot=id=>({revision:1,draft:{nodes:{core:id},loadout:{active:[null,null],passive:[null,null]}},state:{active_trial:null},dirty:true,config:{},guide:{saved}});
  const result=damage=>({guide:{saved:{...saved,skills:[{id:'li',name:'离火',damage,cost:12,cooldown:1.5,range:170,variant:'基础'},null]}}});
  return{api:context.DaoBladeSkillGuide,node,snapshot,result,requests,flush:()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());},timers};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('046 newer draft wins over a late preview; account reset ignores in-flight results',async()=>{
 const h=harness();h.api.update(h.snapshot('old'),'li');h.flush();
 h.api.update(h.snapshot('new'),'li');h.flush();
 h.requests[1].resolve(h.result(42));await tick();assert.match(h.node('skill-comparison').innerHTML,/42/);
 h.requests[0].resolve(h.result(99));await tick();assert.doesNotMatch(h.node('skill-comparison').innerHTML,/99/);
 h.api.update(h.snapshot('pending'),'li');h.flush();h.api.update(null);
 h.requests[2].resolve(h.result(77));await tick();assert.equal(h.node('skill-comparison').textContent,'');assert.doesNotMatch(h.node('skill-comparison').innerHTML,/77/);
 h.api.update(h.snapshot('queued'),'li');h.api.update(null);assert.equal(h.timers.size,0);
});
test('046 failed preview never presents a previous result as current',async()=>{
 const h=harness();h.api.update(h.snapshot('first'),'li');h.flush();h.requests[0].resolve(h.result(42));await tick();
 h.api.update(h.snapshot('second'),'li');h.flush();assert.match(h.node('skill-comparison').innerHTML,/计算中/);
 h.requests[1].reject(Error('其他窗口已更新'));await tick();assert.match(h.node('skill-comparison').innerHTML,/其他窗口已更新/);assert.doesNotMatch(h.node('skill-comparison').innerHTML,/42/);
});
