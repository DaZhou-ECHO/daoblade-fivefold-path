const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');

function harness(){
  const listeners={},panels=[],targets=['atlas','journey','shop'].map(panel=>({dataset:{village:panel},classList:{toggle(){}},onclick:null}));
  const touch=['left','right'].map(name=>({dataset:{villageMove:name},addEventListener(type,handler){this[type]=handler;},setPointerCapture(){},releasePointerCapture(){}}));
  const draw=new Proxy({createLinearGradient(){return{addColorStop(){}};}},{get(object,key){return key in object?object[key]:()=>{};}});
  const canvas={getContext:()=>draw,focus(){}};
  const prompt={textContent:''};
  let frame=null,dialog=false;
  const document={getElementById:id=>id==='village-canvas'?canvas:id==='village-prompt'?prompt:id==='panel-sanctuary'?{classList:{contains:()=>true}}:{onclick:null},
    querySelector:selector=>selector==='dialog[open]'?(dialog?{}:null):{click(){panels.push(selector.match(/data-panel="([^"]+)/)?.[1]);}},
    querySelectorAll:selector=>selector==='[data-village-move]'?touch:selector==='[data-village]'?targets:[]};
  const context=vm.createContext({document,localStorage:{getItem:()=>null},Image:class{set src(_){}},
    requestAnimationFrame:fn=>frame=fn,addEventListener:(type,fn)=>listeners[type]=fn,console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/village.js'),'utf8'),context);
  return {api:context.DaoBladeVillage,listeners,panels,targets,prompt,step:now=>frame(now),dialog:value=>dialog=value};
}

test('040 新手村左右行走后按交互键进入附近目标，弹窗时不触发',()=>{
  const h=harness();h.step(0);
  h.listeners.keydown({code:'KeyF',target:{closest:()=>null},preventDefault(){}});
  assert.deepEqual(h.panels,['atlas']);
  h.listeners.keydown({code:'KeyD',target:{closest:()=>null},preventDefault(){}});
  for(let i=1;i<=27;i++)h.step(i*50);
  h.listeners.keyup({code:'KeyD'});
  assert.equal(h.api.nearest(),'journey');
  assert.match(h.prompt.textContent,/师父/);
  h.listeners.keydown({code:'KeyF',target:{closest:()=>null},preventDefault(){}});
  assert.deepEqual(h.panels,['atlas','journey']);
  h.dialog(true);
  h.listeners.keydown({code:'KeyF',target:{closest:()=>null},preventDefault(){}});
  assert.equal(h.panels.length,2);
});

test('040 村落目标可直接点击，方便窄屏快捷操作',()=>{
  const h=harness();h.targets.find(x=>x.dataset.village==='shop').onclick();
  assert.deepEqual(h.panels,['shop']);
});
