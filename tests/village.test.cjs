const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');

function harness(viewport=960){
  const listeners={},panels=[],targets=['atlas','journey','shop'].map(panel=>({dataset:{village:panel},classList:{toggle(){}},onclick:null}));
  const touch=['left','right'].map(name=>({dataset:{villageMove:name},addEventListener(type,handler){this[type]=handler;},setPointerCapture(){},releasePointerCapture(){}}));
  const draw=new Proxy({createLinearGradient(){return{addColorStop(){}};}},{get(object,key){return key in object?object[key]:()=>{};}});
  const choiceBox={children:[],set textContent(_){this.children=[];},appendChild(button){this.children.push(button);},querySelector(){return this.children[0]||null;}};
  const nodes={
    'village-canvas':{getContext:()=>draw,focus(){}},'village-world':{style:{}},'village-prompt':{textContent:''},
    'village-dialogue':{hidden:true},'village-dialogue-close':{},'village-speaker':{textContent:''},
    'village-line':{textContent:''},'village-choices':choiceBox,'village-interact':{},
    'panel-sanctuary':{classList:{contains:()=>true}}
  };
  const stage={clientWidth:viewport,clientHeight:370};
  const document={body:{classList:{contains:()=>false}},getElementById:id=>nodes[id],createElement:()=>({focus(){},click(){this.onclick?.();}}),
    querySelector:selector=>selector==='.village-stage'?stage:selector==='dialog[open]'?null:{click(){panels.push(selector.match(/data-panel="([^"]+)/)?.[1]);}},
    querySelectorAll:selector=>selector==='[data-village-move]'?touch:selector==='[data-village]'?targets:[]};
  let frame=null;
  const context=vm.createContext({document,localStorage:{getItem:()=>null},Image:class{set src(_){}},
    requestAnimationFrame:fn=>frame=fn,addEventListener:(type,fn)=>listeners[type]=fn,console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/village.js'),'utf8'),context);
  const key=code=>listeners.keydown({code,target:{closest:()=>null},preventDefault(){}});
  return {api:context.DaoBladeVillage,listeners,panels,targets,touch,nodes,stage,key,step:now=>frame(now)};
}

test('041 村中行走、对话选择与 Esc 返回保留原位置',()=>{
  const h=harness();h.step(0);h.key('KeyF');
  assert.equal(h.nodes['village-dialogue'].hidden,false);
  assert.match(h.nodes['village-line'].textContent,/五境/);
  assert.deepEqual(h.panels,[]);
  h.nodes['village-choices'].children[0].click();
  assert.deepEqual(h.panels,['atlas']);
  h.key('KeyD');for(let i=1;i<=27;i++)h.step(i*50);h.listeners.keyup({code:'KeyD'});
  assert.equal(h.api.nearest(),'journey');
  h.key('KeyF');assert.match(h.nodes['village-speaker'].textContent,/师父/);
  h.key('Escape');assert.equal(h.nodes['village-dialogue'].hidden,true);
  h.key('KeyF');assert.equal(h.nodes['village-choices'].children.length,2);
});

test('041 点击 NPC 打开对话，手机取景跟随玩家',()=>{
  const h=harness(390);h.step(0);
  h.targets.find(x=>x.dataset.village==='shop').onclick();
  assert.equal(h.nodes['village-dialogue'].hidden,false);
  assert.match(h.nodes['village-speaker'].textContent,/商人/);
  h.nodes['village-choices'].children[0].click();
  assert.deepEqual(h.panels,['shop']);
  h.key('KeyD');for(let i=1;i<=30;i++)h.step(i*50);
  assert.match(h.nodes['village-world'].style.transform,/translateX\(-/);
});

test('042 窄屏村落按画布比例取景，角色与建筑不横向压缩',()=>{
  const h=harness(390);h.step(0);
  const worldWidth=parseFloat(h.nodes['village-world'].style.width);
  assert.ok(Math.abs(worldWidth/h.stage.clientHeight-960/540)<.01);
  assert.ok(worldWidth>h.stage.clientWidth);
});

test('042 触控移动到师父并交互，松开后停止移动',()=>{
  const h=harness(390);h.step(0);
  const before=h.nodes['village-world'].style.transform;
  h.touch[1].pointerdown({pointerId:1,preventDefault(){}});
  for(let i=1;i<=24;i++)h.step(i*50);
  h.touch[1].pointerup({pointerId:1});
  assert.notEqual(h.nodes['village-world'].style.transform,before);
  assert.equal(h.api.nearest(),'journey');
  const stopped=h.nodes['village-world'].style.transform;
  h.step(1300);assert.equal(h.nodes['village-world'].style.transform,stopped);
  h.nodes['village-interact'].onclick();
  assert.match(h.nodes['village-speaker'].textContent,/师父/);
});
