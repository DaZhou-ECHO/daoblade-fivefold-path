const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');

function harness(){
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'helpers/journey-ui.json'),'utf8'));
  const maps=JSON.parse(fs.readFileSync(path.join(__dirname,'../static/data/journey-maps-v2.json'),'utf8'));
  const nodes=new Map(),calls=[];
  function node(id){
    if(!nodes.has(id)){
      let html='',images=[],buttons=[];
      nodes.set(id,{textContent:'',disabled:false,hidden:false,attributes:{},setAttribute(key,value){this.attributes[key]=value;},
        get innerHTML(){return html;},set innerHTML(value){html=value;images=[];buttons=[];
          for(const m of value.matchAll(/<img src="([^"]+)"[^>]*data-scene="([^"]+)"/g))images.push({src:m[1],dataset:{scene:m[2]},hidden:false});
          for(const m of value.matchAll(/<button[^>]*data-([a-z-]+)="([^"]+)"/g))buttons.push({dataset:{[m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:m[2]}});
        },querySelectorAll(selector){return selector==='img[data-scene]'?images:buttons;},querySelector(selector){return this.querySelectorAll(selector)[0];}});
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

test('043 背包从正式档展示四类灵珠状态、真实出战及持有剑饰',()=>{
  const h=harness();
  h.data.compiled.effective_bead_ids=['li.core'];
  h.data.compiled.connected=['li.core','li.trace','gen.core','gen.mind'];
  h.data.state.nodes['li.edge']=null;
  h.data.compiled.inactive['li.edge']='缺少纹路连接';
  h.data.state.cosmetics.owned.push('azure');
  h.data.state.cosmetics.equipped='azure';
  h.api.update(h.data);
  const bag=h.node('bag-groups').innerHTML;
  assert.match(h.node('bag-summary').textContent,/正式珠 5\/40/);
  assert.match(bag,/离·核心珠[\s\S]*?出战生效/);
  assert.match(bag,/离·纹路珠[\s\S]*?已连通未出战/);
  assert.match(bag,/离·锐式珠[\s\S]*?未装/);
  assert.match(h.node('bag-loadout').innerHTML,/Q · 主动[\s\S]*?离火/);
  assert.match(h.node('bag-loadout').innerHTML,/心法 1[\s\S]*?艮宫心法/);
  assert.match(h.node('bag-capacity').textContent,/5\/6/);
  assert.match(h.node('bag-equipped-sword').textContent,/青岚剑/);
  h.data.state.loadout.passive=[null,'gen'];h.api.update(h.data);
  assert.match(h.node('bag-loadout').innerHTML,/心法 1[\s\S]*?未出战[\s\S]*?心法 2[\s\S]*?艮宫心法/);
  h.data.state.nodes['li.edge']='li.edge';h.api.update(h.data);
  assert.match(h.node('bag-groups').innerHTML,/离·锐式珠[\s\S]*?已装未连通/);
  h.node('bag-tab-swords').onclick();
  assert.match(h.node('bag-swords').innerHTML,/青岚剑/);
  assert.doesNotMatch(h.node('bag-swords').innerHTML,/赤霞剑/);
  assert.match(h.node('bag-detail-action').textContent,/剑坊/);
  assert.equal(h.node('bag-bead-panel').hidden,true);
  h.data.state.active_trial={realm_id:'fire',map_id:'ridge'};
  h.api.update(h.data);
  assert.match(h.node('bag-summary').textContent,/挑战中仅可查看/);
});

test('043 灵珠筛选只改变视图，账号重置清除上一个角色物品',()=>{
  const h=harness();h.api.update(h.data);
  h.node('bag-element-filters').querySelectorAll('[data-bag-element]').find(b=>b.dataset.bagElement==='fire').onclick();
  assert.match(h.node('bag-groups').innerHTML,/离·核心珠/);
  assert.doesNotMatch(h.node('bag-groups').innerHTML,/艮·核心珠/);
  h.node('bag-equip-filters').querySelectorAll('[data-bag-equip]').find(b=>b.dataset.bagEquip==='loose').onclick();
  assert.match(h.node('bag-groups').textContent+h.node('bag-groups').innerHTML,/没有灵珠/);
  assert.equal(h.data.state.beads.length,5);
  h.api.reset();
  assert.equal(h.node('bag-groups').textContent,'');
  assert.equal(h.node('bag-equipped-sword').textContent,'');
});

test('043 空珠匣仍可查看基础剑，未同步档案不会伪造物品',()=>{
  const h=harness();h.data.state.beads=[];h.data.state.nodes={};h.data.blocked=true;
  h.api.update(h.data);
  assert.match(h.node('bag-groups').innerHTML,/没有灵珠/);
  assert.match(h.node('bag-swords').innerHTML,/本命素剑/);
  assert.match(h.node('bag-status').textContent,/未同步/);
  assert.doesNotMatch(h.node('bag-swords').innerHTML,/青岚剑/);
});
