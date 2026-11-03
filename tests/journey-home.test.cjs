const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');

function harness(){
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'helpers/journey-ui.json'),'utf8'));
  const maps=JSON.parse(fs.readFileSync(path.join(__dirname,'../static/data/journey-maps-v2.json'),'utf8'));
  const nodes=new Map(),calls=[];
  function node(id){
    if(!nodes.has(id)){
      let html='',images=[],buttons=[];
      nodes.set(id,{textContent:'',disabled:false,
        get innerHTML(){return html;},set innerHTML(value){html=value;images=[];buttons=[];
          for(const m of value.matchAll(/<img src="([^"]+)"[^>]*data-scene="([^"]+)"/g))images.push({src:m[1],dataset:{scene:m[2]},hidden:false});
          for(const m of value.matchAll(/<button[^>]*data-(realm|route)="([^"]+)"/g))buttons.push({dataset:{[m[1]]:m[2]}});
        },querySelectorAll(selector){return selector==='img[data-scene]'?images:buttons;}});
    }return nodes.get(id);
  }
  const context=vm.createContext({document:{getElementById:node,querySelector:()=>({click:()=>calls.push('atlas')})},
    DaoBladeJourneyMaps:maps,DaoBladeJourneyUI:{selectMap:(realm,route)=>{calls.push([realm,route]);return true;},
      startSelected:async()=>calls.push('start'),resumeTrial:async()=>calls.push('resume')}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/journey-home.js'),'utf8'),context);
  const mapScenes=Object.fromEntries(fixture.config.realms.map(r=>[r,{ridge:[r+' 高径','向上'],hollow:[r+' 回廊','折返']}]))
  const data={state:fixture.state,compiled:fixture.compiled,config:fixture.config,
    realm:'fire',route:'ridge',busy:false,blocked:false,dirty:false,mapScenes};
  return {api:context.DaoBladeJourneyHome,node,calls,data};
}

test('039 山河图展示五境双路线，十图缩图有不同路径并在坏图时回退',()=>{
  const h=harness();h.api.update(h.data);
  assert.equal((h.node('atlas-realms').innerHTML.match(/class="atlas-realm"/g)||[]).length,5);
  assert.equal((h.node('atlas-routes').innerHTML.match(/class="atlas-route"/g)||[]).length,2);
  const paths=new Set(h.data.config.realms.flatMap(r=>['ridge','hollow'].map(route=>h.api.imagePath(r,route))));
  assert.equal(paths.size,10);
  const images=h.node('atlas-routes').querySelectorAll('img[data-scene]');
  assert.match(images[1].src,/fire-hollow-far\.png$/);
  images[1].onerror();assert.match(images[1].src,/fire-far\.png$/);
  images[1].onerror();assert.equal(images[1].hidden,true);
  assert.match(h.node('atlas-current').textContent,/赤霞炉台|fire 高径/);
});

test('039 首页展示正式档和未完成挑战，锁住新局但保留恢复入口',()=>{
  const h=harness();h.data.state.active_trial={realm_id:'water',map_id:'hollow',checkpoint:{id:'swordstone'}};
  h.api.update(h.data);
  assert.match(h.node('home-trial').textContent,/水境回廊/);
  assert.equal(h.node('atlas-start').disabled,true);
  assert.equal(h.node('atlas-resume').disabled,false);
  assert.match(h.node('home-primary').textContent,/恢复/);
  h.node('home-primary').onclick();assert.equal(h.calls.at(-1),'resume');
  h.data.state.active_trial=null;h.data.dirty=true;h.api.update(h.data);
  assert.equal(h.node('atlas-start').disabled,true);
  assert.match(h.node('home-sync').textContent,/未保存/);
});

test('042 背包只读正式珠匣，并区分有效装配、待连通及未装灵珠',()=>{
  const h=harness();
  h.data.compiled.effective_bead_ids=['li.core'];
  h.data.state.nodes['li.edge']=null;
  h.api.update(h.data);
  const bag=h.node('bag-groups').innerHTML;
  assert.match(h.node('bag-summary').textContent,/正式珠 5\/40/);
  assert.match(bag,/离·核心珠[\s\S]*?已装有效/);
  assert.match(bag,/离·纹路珠[\s\S]*?已装待连通/);
  assert.match(bag,/离·锐式珠[\s\S]*?珠匣/);
  assert.equal((bag.match(/class="bag-group"/g)||[]).length,5);
  h.data.state.active_trial={realm_id:'fire',map_id:'ridge'};
  h.api.update(h.data);
  assert.match(h.node('bag-summary').textContent,/挑战中仅可查看/);
});
