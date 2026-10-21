const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness(){
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'helpers/journey-ui.json'),'utf8'));
  const nodes=new Map(),controls=[{disabled:false},{disabled:false}],calls=[];let release=null,delay=false;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='journey-realm'?'water':id==='journey-map'?'hollow':'',textContent:'',innerHTML:'',disabled:false,querySelectorAll:()=>[]});return nodes.get(id);};
  let saved=JSON.parse(JSON.stringify(fixture));saved.state.progress.spirit=24;
  function payload(){return JSON.parse(JSON.stringify(saved));}
  const context=vm.createContext({document:{getElementById:node,querySelectorAll:()=>controls},console,
    DaoBladeStartJourney:(trial,compiled)=>calls.push({launch:trial,compiled}),
    fetch:async(url,options)=>{
      if(url==='/api/auth/me')return{ok:true,json:async()=>({user:null,csrf_token:'unit'})};
      if(!options)return{ok:true,json:async()=>payload()};
      const body=JSON.parse(options.body);calls.push(body);
      if(delay){delay=false;await new Promise(r=>release=r);}
      if(body.action==='start')saved.state.active_trial={id:'unit-'+(saved.revision+1),realm_id:body.realm_id,map_id:body.map_id,breakthrough:body.breakthrough,checkpoint:null,claimed_altars:[],compiled:saved.compiled};
      if(['settle','abandon'].includes(body.action))saved.state.active_trial=null;
      saved.revision++;saved.trial_compiled=saved.state.active_trial?.compiled||null;
      return{ok:true,json:async()=>payload()};
    }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/journey-ui.js'),'utf8'),context);
  return{api:context.DaoBladeJourneyUI,node,controls,calls,delay:()=>delay=true,release:()=>release()};
}
test('032 保存期间锁住下拉框，ACK后恢复；旧账号延迟回复不能重建已清空界面',async()=>{
  const h=harness();await h.api.load();h.delay();const saving=h.api.trialAction('build',{});
  assert.ok(h.controls.every(c=>c.disabled));h.release();await saving;assert.ok(h.controls.every(c=>!c.disabled));
  h.delay();const stale=h.api.trialAction('build',{});h.api.reset();h.release();await assert.rejects(stale,/账号已变化/);
  assert.match(h.node('journey-status').textContent,/账号已变化/);assert.equal(h.node('journey-owned').textContent,'');
});
test('032 突破失败关闭试炼后，重新挑战保持原境/地图/突破类型',async()=>{
  const h=harness();await h.api.load();await h.node('journey-break').onclick();
  const first=h.calls.find(c=>c.action==='start');assert.equal(first.breakthrough,true);assert.equal(first.realm_id,'fire');
  await h.api.trialAction('settle',{trial_id:'unit-1',win:false,defeated_ids:[]});
  await h.api.restartTrial('unit-1',{realm_id:'fire',map_id:'hollow',breakthrough:true});
  const starts=h.calls.filter(c=>c.action==='start');assert.equal(starts.length,2);assert.equal(starts[1].breakthrough,true);assert.equal(starts[1].realm_id,'fire');assert.equal(starts[1].map_id,'hollow');
  assert.equal(h.calls.filter(c=>c.launch).length,2);
});
