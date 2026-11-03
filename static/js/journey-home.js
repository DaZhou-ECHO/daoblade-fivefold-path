"use strict";
(function(root){
  const $=id=>document.getElementById(id);
  const names={wood:"青木",fire:"离火",earth:"镇岳",metal:"庚金",water:"玄水"};
  const symbols={wood:"木",fire:"火",earth:"土",metal:"金",water:"水"};
  const colors={wood:"#52be7b",fire:"#ef5c45",earth:"#cf9849",metal:"#e7e4d6",water:"#4eb2e0"};
  const shape={ridge:"高径 · 开阔上行",hollow:"回廊 · 收束折返"};
  const positions={wood:[20,41],fire:[53,29],earth:[76,55],metal:[68,79],water:[19,79]};
  const roles={core:"核心",trace:"纹路",edge:"锐式",flow:"流式",mind:"心法"};
  const regionCopy={wood:"沿根桥或古木廊窗，追寻山中仙门。",fire:"从赤霞山脊或炉后石廊，走向悬空丹阙。",earth:"在叠岩石阶与地脉遗院间，接近镇岳殿。",metal:"循断剑林或矿脉剑廊，登向铸剑主峰。",water:"越寒潭天桥或水下石廊，望向倒影中的楼阁。"};
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let snapshot=null;
  function imagePath(realm,route){return `/static/sprites/world-v1/${realm}${route==='hollow'?'-hollow':''}-far.png`;}
  function imageFallback(img,realm,route){
    if(route==='hollow'&&!img.dataset.fallback){img.dataset.fallback='1';img.src=imagePath(realm,'ridge');}
    else img.hidden=true;
  }
  function renderBag(data){
    const summary=$("bag-summary"),groups=$("bag-groups");
    if(!summary||!groups)return;
    if(!data){summary.textContent="正在读取正式珠匣";groups.textContent="";return;}
    const {state,compiled,config}=data,owned=new Set(Object.values(state.nodes||{}).filter(Boolean));
    const effective=new Set(compiled.effective_bead_ids||[]);
    summary.textContent=`正式珠 ${state.beads.length}/40 · 已装 ${compiled.used}/${compiled.capacity} · ${state.active_trial?'挑战中仅可查看':'装配请前往师门八宫'}`;
    groups.innerHTML=config.realms.map(realm=>{
      const beads=state.beads.filter(bead=>bead.element===realm);
      return `<section class="bag-group" style="--realm-color:${colors[realm]}"><h3>${symbols[realm]} · ${names[realm]}境 <small>${beads.length} 颗</small></h3><div class="bag-beads">${beads.map(bead=>`<article class="bag-bead"><span class="bag-bead-mark" aria-hidden="true">${symbols[realm]}</span><span><b>${esc(bead.name)}</b><small>${roles[bead.role]||esc(bead.role)} · Lv${bead.level} · XP${bead.xp}</small></span><em>${owned.has(bead.id)?effective.has(bead.id)?'已装有效':'已装待连通':'珠匣'}</em></article>`).join('')||'<p class="bag-empty">尚未寻得本境灵珠</p>'}</div></section>`;
    }).join('');
  }
  function update(data){
    snapshot=data;
    renderBag(data);
    if(!data){
      $("home-top-rank").textContent='征程读取中';$("home-top-clears").textContent='五境首通 0/5';
      $("home-rank").textContent='读取中';$("home-clears").textContent='0 / 5';$("home-beads").textContent='0 / 40';$("home-trial").textContent='无';
      $("home-next-step").textContent='正在读取你的正式征程。';$("home-sync").textContent='';
      $("atlas-realms").textContent='';$("atlas-routes").textContent='';$("atlas-region-title").textContent='正在读取';
      $("home-primary").disabled=true;$("atlas-start").disabled=true;$("atlas-resume").disabled=true;if($("migration-panel"))$("migration-panel").hidden=true;return;
    }
    const {state:s,config,compiled,busy,blocked,dirty,migrationRequired}=data;
    const active=s.active_trial,cleared=config.realms.filter(r=>s.progress.clears[r]>0).length;
    const selectedRealm=active?.realm_id||data.realm,selectedRoute=active?.map_id||data.route;
    $("home-top-rank").textContent=config.ranks[s.rank].name+` · 修为 ${s.progress.spirit}`;
    $("home-top-clears").textContent=`五境首通 ${cleared}/5`;
    $("home-rank").textContent=config.ranks[s.rank].name;
    $("home-clears").textContent=`${cleared} / 5`;
    $("home-beads").textContent=`${s.beads.length} / 40`;
    $("home-trial").textContent=active?`${symbols[active.realm_id]}境${active.map_id==='hollow'?'回廊':'高径'}`:'暂无';
    $("home-next-step").textContent=active?`当前有未完成的${names[active.realm_id]}境${active.map_id==='hollow'?'回廊':'高径'}挑战；可从剑碑或入口恢复。`:
      !compiled.skills.some(Boolean)?'先在修行页保存一项 Q/E 主动技能，再选择地图。':
      cleared<5?`已首通 ${cleared} 境。山河图可自由选路，也可参考推荐前往未首通五境。`:'五境均已首通；可以换路线寻找支路、调整八宫构筑，或尝试筑基心劫。';
    if($("migration-panel"))$("migration-panel").hidden=!migrationRequired;
    $("home-sync").textContent=migrationRequired?'请先预览并确认单档合并。':blocked?'正式档未同步，请在师门页重新读取。':dirty?'有未保存构筑；开战前请先保存或放弃草稿。':active?'恢复将沿用本局冻结的出战构筑。':'正式档已同步。';
    $("home-primary").textContent=active?'恢复当前挑战':'打开十境山河图';
    $("home-primary").disabled=busy||blocked||dirty||migrationRequired;
    $("atlas-realms").innerHTML=config.realms.map(realm=>`<button class="atlas-realm" type="button" data-realm="${realm}" aria-pressed="${realm===selectedRealm}" aria-label="${names[realm]}境，${s.progress.clears[realm]>0?'已首通':'未首通'}，查看高径与回廊" style="--realm-color:${colors[realm]};--realm-x:${positions[realm][0]}%;--realm-y:${positions[realm][1]}%"><span class="atlas-realm-symbol">${symbols[realm]}</span><span><b>${names[realm]}境</b><small>${regionCopy[realm]}</small></span><em>${s.progress.clears[realm]>0?'已首通':'未首通'}</em></button>`).join('');
    $("atlas-realms").querySelectorAll('[data-realm]').forEach(button=>button.onclick=()=>{
      if(root.DaoBladeJourneyUI.selectMap(button.dataset.realm,selectedRoute)){
        $("atlas-error").textContent='';
        if(root.matchMedia?.('(max-width:700px)')?.matches)root.requestAnimationFrame?.(()=>document.querySelector('.atlas-detail')?.scrollIntoView?.({block:'start',behavior:'smooth'}));
      }
      else $("atlas-error").textContent=active?'当前挑战进行中，请先恢复或放弃。':'无法切换地图，请检查征程存档。';
    });
    $("atlas-region-label").textContent=`${symbols[selectedRealm]}行 · 两条可选路线`;
    $("atlas-region-title").textContent=`${names[selectedRealm]}境`;
    $("atlas-region-intro").textContent=regionCopy[selectedRealm];
    const recommendation=config.realms.find(r=>!s.progress.clears[r])||config.realms[0];
    $("atlas-routes").innerHTML=config.maps.map(map=>{
      const route=map.id,scene=data.mapScenes[selectedRealm]?.[route]||[route,''];
      const layout=root.DaoBladeJourneyMaps?.[selectedRealm+':'+route];
      const destination=layout?.sections?.at(-1)?.label||'首领场';
      const recommended=!active&&selectedRealm===recommendation&&route==='ridge';
      const routeClears=s.progress.route_clears?.[selectedRealm+':'+route]||0;
      return `<button class="atlas-route" type="button" data-route="${route}" aria-pressed="${route===selectedRoute}"><span class="atlas-route-image"><img src="${imagePath(selectedRealm,route)}" alt="" data-scene="${selectedRealm}:${route}"></span><span class="atlas-route-body"><b>${esc(scene[0])}</b><small>${shape[route]}${recommended?' · 推荐':''} · ${routeClears?'已通关 '+routeClears+' 次':'未通关'}</small><span>${esc(scene[1])}</span><em>中段剑碑 · 2 条可返支路 · ${esc(destination)}</em></span></button>`;
    }).join('');
    $("atlas-routes").querySelectorAll('img[data-scene]').forEach(img=>img.onerror=()=>imageFallback(img,selectedRealm,img.dataset.scene.split(':')[1]));
    $("atlas-routes").querySelectorAll('[data-route]').forEach(button=>button.onclick=()=>{
      if(root.DaoBladeJourneyUI.selectMap(selectedRealm,button.dataset.route))$("atlas-error").textContent='';
      else $("atlas-error").textContent=active?'当前挑战进行中，请先恢复或放弃。':'无法切换路线，请检查征程存档。';
    });
    $("atlas-current").textContent=active?`进行中：${names[active.realm_id]}境 · ${active.map_id==='hollow'?'回廊':'高径'}，${active.checkpoint?'剑碑已保存':'从入口恢复'}。`:
      `已选：${names[selectedRealm]}境 · ${data.mapScenes[selectedRealm]?.[selectedRoute]?.[0]||selectedRoute}。`;
    $("atlas-start").disabled=busy||blocked||migrationRequired||dirty||!!active||!compiled.skills.some(Boolean);
    $("atlas-resume").disabled=busy||blocked||migrationRequired||!active;
  }
  function reset(){update(null);$("atlas-error").textContent='';}
  function showAtlas(){document.querySelector('[data-panel="atlas"]').click();}
  $("home-primary").onclick=()=>{
    if(snapshot?.state.active_trial)void root.DaoBladeJourneyUI.resumeTrial().catch(e=>{$("home-sync").textContent=e.message;});
    else showAtlas();
  };
  $("atlas-start").onclick=()=>void root.DaoBladeJourneyUI.startSelected().catch(e=>{$("atlas-error").textContent=e.message;});
  $("atlas-resume").onclick=()=>void root.DaoBladeJourneyUI.resumeTrial().catch(e=>{$("atlas-error").textContent=e.message;});
  if($("bag-to-journey"))$("bag-to-journey").onclick=()=>{
    document.querySelector('[data-panel="journey"]').click();
    const target=$("journey-palaces");if(target?.closest?.("details"))target.closest("details").open=true;
    target?.scrollIntoView?.({block:"start"});
  };
  root.DaoBladeJourneyHome={update,reset,imagePath};
  update(null);
  root.addEventListener?.('DOMContentLoaded',()=>void root.DaoBladeJourneyUI?.load());
})(globalThis);
