const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function harness(){
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'helpers/journey-ui.json'),'utf8'));
  const nodes=new Map(),controls=[{disabled:false},{disabled:false}],calls=[],listeners={};let release=null,delay=false,delayRead=false,failRead=false,fail=false;
  const node=id=>{
    if(!nodes.has(id)){
      let html='',children=[];
      nodes.set(id,{value:id==='journey-realm'?'water':id==='journey-map'?'hollow':'',textContent:'',disabled:false,
        get innerHTML(){return html;},set innerHTML(value){html=value;children=[];
          for(const m of value.matchAll(/<select data-(node|slot)="([^"]+)">([\s\S]*?)<\/select>/g)){
            const selected=m[3].match(/<option value="([^"]*)" selected>/);
            children.push({dataset:{[m[1]]:m[2]},value:selected?.[1]||'',disabled:false});
          }
          for(const m of value.matchAll(/data-palace="([^"]+)"/g))children.push({dataset:{palace:m[1]}});
        },querySelectorAll:()=>children});
    }return nodes.get(id);
  };
  let saved=JSON.parse(JSON.stringify(fixture));saved.state.progress.spirit=24;
  function payload(){return JSON.parse(JSON.stringify(saved));}
  const context=vm.createContext({document:{getElementById:node,querySelectorAll:()=>[...controls,...node('journey-nodes').querySelectorAll(),...node('journey-loadout').querySelectorAll()]},console,
    addEventListener:(name,callback)=>listeners[name]=callback,
    DaoBladeStartJourney:(trial,compiled)=>calls.push({launch:trial,compiled}),
    fetch:async(url,options)=>{
      if(url==='/api/auth/me')return{ok:true,json:async()=>({user:null,csrf_token:'unit'})};
      if(!options){if(delayRead){delayRead=false;await new Promise(r=>release=r);}const ok=!failRead;failRead=false;return{ok,json:async()=>payload()};}
      const body=JSON.parse(options.body);calls.push(body);
      if(delay){delay=false;await new Promise(r=>release=r);}
      if(fail){fail=false;return{ok:false,json:async()=>({error:'版本冲突'})};}
      if(body.action==='build'&&body.nodes){saved.state.nodes=body.nodes;saved.state.loadout=body.loadout;}
      if(body.action==='start')saved.state.active_trial={id:'unit-'+(saved.revision+1),realm_id:body.realm_id,map_id:body.map_id,breakthrough:body.breakthrough,checkpoint:null,claimed_altars:[],compiled:saved.compiled};
      if(['settle','abandon'].includes(body.action))saved.state.active_trial=null;
      saved.revision++;saved.trial_compiled=saved.state.active_trial?.compiled||null;
      return{ok:true,json:async()=>payload()};
    }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/journey-ui.js'),'utf8'),context);
  return{api:context.DaoBladeJourneyUI,node,controls,calls,state:saved.state,listeners,failRead:()=>failRead=true,fail:()=>fail=true,delayRead:()=>delayRead=true,delay:()=>delay=true,release:()=>release()};
}
test('032 保存期间锁住下拉框，ACK后恢复；旧账号延迟回复不能重建已清空界面',async()=>{
  const h=harness();await h.api.load();h.delay();const saving=h.api.trialAction('build',{});
  assert.ok(h.controls.every(c=>c.disabled));h.release();await saving;assert.ok(h.controls.every(c=>!c.disabled));
  h.delay();const stale=h.api.trialAction('build',{});h.api.reset();h.release();await assert.rejects(stale,/账号已变化/);
  assert.match(h.node('journey-status').textContent,/账号已变化/);assert.equal(h.node('journey-owned').textContent,'');
});

test('033 重读开始立即锁定操作，防止返回阵盘后快速点击被静默忽略',async()=>{
  const h=harness();await h.api.load();h.delayRead();const reading=h.api.load();
  assert.ok(h.node('journey-start').disabled);assert.ok(h.node('journey-next').disabled);assert.ok(h.controls.every(c=>c.disabled));
  await Promise.resolve();h.release();await reading;
  assert.equal(h.node('journey-start').disabled,false);assert.ok(h.controls.every(c=>!c.disabled));
});

test('033 下一步按真实首通与进行中状态推荐，选择不自动开战，换号清空旧目标',async()=>{
  const h=harness();await h.api.load();
  assert.match(h.node('journey-goal').textContent,/五境首通0\/5.*筑基心劫/);
  h.node('journey-next').onclick();assert.equal(h.node('journey-realm').value,'fire');assert.equal(h.node('journey-map').value,'ridge');assert.equal(h.calls.length,0);
  h.state.progress.spirit=0;h.state.progress.clears.fire=1;await h.api.load();
  assert.match(h.node('journey-goal').textContent,/挑战木境/);h.node('journey-next').onclick();assert.equal(h.node('journey-realm').value,'wood');
  await h.node('journey-start').onclick();assert.ok(h.node('journey-next').disabled);assert.match(h.node('journey-goal').textContent,/恢复当前挑战/);
  h.api.reset();assert.equal(h.node('journey-goal').textContent,'');assert.ok(h.node('journey-next').disabled);
});
test('032 突破失败关闭试炼后，重新挑战保持原境/地图/突破类型',async()=>{
  const h=harness();await h.api.load();await h.node('journey-break').onclick();
  const first=h.calls.find(c=>c.action==='start');assert.equal(first.breakthrough,true);assert.equal(first.realm_id,'fire');
  await h.api.trialAction('settle',{trial_id:'unit-1',win:false,defeated_ids:[]});
  await h.api.restartTrial('unit-1',{realm_id:'fire',map_id:'hollow',breakthrough:true});
  const starts=h.calls.filter(c=>c.action==='start');assert.equal(starts.length,2);assert.equal(starts[1].breakthrough,true);assert.equal(starts[1].realm_id,'fire');assert.equal(starts[1].map_id,'hollow');
  assert.equal(h.calls.filter(c=>c.launch).length,2);
});

test('034 草稿切宫保留且阻止误开战，节点与出战栏一次提交',async()=>{
 const h=harness();await h.api.load();
 const select=(id,key,value)=>{const el=h.node(id).querySelectorAll().find(e=>(e.dataset.node||e.dataset.slot)===key);el.value=value;el.onchange();};
 select('journey-nodes','li.edge','');select('journey-loadout','active:1','gen');
 h.node('journey-palaces').querySelectorAll().find(e=>e.dataset.palace==='kan').onclick();
 h.node('journey-palaces').querySelectorAll().find(e=>e.dataset.palace==='li').onclick();
 assert.equal(h.node('journey-nodes').querySelectorAll().find(e=>e.dataset.node==='li.edge').value,'');
 assert.equal(h.node('journey-loadout').querySelectorAll().find(e=>e.dataset.slot==='active:1').value,'gen');
 assert.match(h.node('journey-status').textContent,/未保存草稿/);assert.ok(h.node('journey-start').disabled);
 await h.api.load();assert.match(h.node('journey-error').textContent,/草稿已保留/);assert.equal(h.calls.length,0);
 await assert.rejects(h.api.trialAction('start',{}),/未保存改动/);
 await h.node('journey-save').onclick();const request=h.calls.at(-1);
 assert.equal(request.action,'build');assert.equal(request.nodes['li.edge'],null);assert.deepEqual(request.loadout.active,['li','gen']);
 assert.match(h.node('journey-status').textContent,/已保存/);assert.equal(h.node('journey-start').disabled,false);
});

test('034 拆全盘仅草稿，放弃可还原；失败保存保留编辑并要求重读',async()=>{
 const h=harness();await h.api.load();h.node('journey-clear').onclick();assert.equal(h.calls.length,0);
 assert.equal(h.state.nodes['li.core'],'li.core');assert.ok(h.node('journey-start').disabled);
 let prevented=false;const event={preventDefault(){prevented=true;}};h.listeners.beforeunload(event);assert.ok(prevented);
 h.node('journey-discard').onclick();assert.match(h.node('journey-status').textContent,/已保存/);assert.equal(h.node('journey-start').disabled,false);
 prevented=false;h.listeners.beforeunload(event);assert.equal(prevented,false);
 const edge=h.node('journey-nodes').querySelectorAll().find(e=>e.dataset.node==='li.edge');edge.value='';edge.onchange();
 h.fail();await h.node('journey-equip').onclick();assert.match(h.node('journey-error').textContent,/版本冲突/);
 assert.equal(h.node('journey-nodes').querySelectorAll().find(e=>e.dataset.node==='li.edge').value,'');assert.ok(h.node('journey-start').disabled);
 h.node('journey-discard').onclick();assert.ok(h.node('journey-start').disabled);await h.api.load();assert.equal(h.node('journey-start').disabled,false);
 assert.equal(h.node('journey-nodes').querySelectorAll().find(e=>e.dataset.node==='li.edge').value,'li.edge');
});

test('034 换号后旧保存按钮的延迟错误不能污染新账号界面',async()=>{
 const h=harness();await h.api.load();h.delay();const saving=h.node('journey-save').onclick();
 await Promise.resolve();await Promise.resolve();h.api.reset();await h.api.load();
 h.release();await saving;assert.equal(h.node('journey-error').textContent,'');assert.match(h.node('journey-status').textContent,/已保存/);
});

test('034 恢复试炼读档期间换号，旧恢复操作不能启动新账号试炼',async()=>{
 const h=harness();await h.api.load();h.delayRead();const pending=h.api.resumeTrial();await Promise.resolve();
 h.api.reset();h.state.active_trial={id:'new-owner-trial',realm_id:'water',map_id:'ridge',checkpoint:null,claimed_altars:[],compiled:{campaign:true}};
 await h.api.load();h.release();await assert.rejects(pending,/账号已变化/);assert.equal(h.calls.filter(c=>c.launch).length,0);
});

test('034 首次读档失败仍能重新读取恢复，不能无档开战',async()=>{
 const h=harness();h.api.reset();h.failRead();await h.api.load();
 assert.match(h.node('journey-error').textContent,/读取失败/);assert.equal(h.node('journey-reload').disabled,false);assert.ok(h.node('journey-start').disabled);
 await h.node('journey-reload').onclick();assert.equal(h.node('journey-error').textContent,'');assert.equal(h.node('journey-start').disabled,false);assert.match(h.node('journey-status').textContent,/已保存/);
});
