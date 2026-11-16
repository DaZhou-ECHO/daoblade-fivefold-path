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
  let bagTab='beads',bagElement='all',bagEquip='all',bagBead=null,bagSword=null,portraitRunning=false;
  let viewedRealm=null,viewedRoute=null;
  function imagePath(realm,route){return `/static/sprites/world-v1/${realm}${route==='hollow'?'-hollow':''}-far.png`;}
  function imageFallback(img,realm,route){
    if(route==='hollow'&&!img.dataset.fallback){img.dataset.fallback='1';img.src=imagePath(realm,'ridge');}
    else img.hidden=true;
  }
  function beadStatus(bead,state,compiled){
    if(state.nodes?.[bead.id]!==bead.id)return '未装';
    if(!compiled.connected?.includes(bead.id))return '已装未连通';
    return compiled.effective_bead_ids?.includes(bead.id)?'出战生效':'已连通未出战';
  }
  function openBagDestination(panel,palaceId){
    document.querySelector(`[data-panel="${panel}"]`)?.click();
    if(panel==='journey'&&palaceId)root.DaoBladeJourneyUI?.focusPalace?.(palaceId);
  }
  function drawPortrait(time=0){
    const canvas=$("bag-character-canvas"),ctx=canvas?.getContext?.('2d');
    if(!ctx)return;
    ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#153b40';ctx.fillRect(0,0,256,320);
    ctx.fillStyle='#31565a';ctx.fillRect(0,250,256,70);
    ctx.fillStyle='#79907c';ctx.fillRect(36,264,184,8);
    ctx.fillStyle='#5a695c';ctx.fillRect(47,272,162,16);
    const cosmetic=snapshot?.state?.cosmetics?.equipped||'plain';
    const color=snapshot?.config?.cosmetics?.[cosmetic]?.color||'#b6dbe6';
    const player={x:103,y:79,w:50,h:177,face:1,hp:1,onGround:true,vx:0,vy:0,animTime:time/1000};
    ctx.save();ctx.translate(128,256);ctx.scale(2.35,2.35);ctx.translate(-128,-256);
    const drawn=root.DaoBladeCharacterArt?.renderer?.draw(ctx,player,color,cosmetic);
    ctx.restore();
    if(!drawn){
      // 素材加载失败时仍展示持剑全身轮廓；绘制只影响此预览画布。
      ctx.fillStyle='#d7e4d4';ctx.fillRect(112,76,32,35);ctx.fillStyle='#204c50';ctx.fillRect(101,114,54,91);
      ctx.fillStyle='#e4d7b1';ctx.fillRect(90,121,12,71);ctx.fillRect(154,121,12,71);
      ctx.fillStyle='#182d37';ctx.fillRect(105,205,21,50);ctx.fillRect(134,205,21,50);
      ctx.fillStyle=color;ctx.fillRect(166,90,8,102);ctx.fillStyle='#dfbb73';ctx.fillRect(153,181,35,8);
    }
  }
  function animatePortrait(time){
    if(!$("panel-bag")?.classList?.contains('active')){portraitRunning=false;return;}
    drawPortrait(time);
    root.requestAnimationFrame?.(animatePortrait);
    if(!root.requestAnimationFrame)portraitRunning=false;
  }
  function showBag(){
    void root.DaoBladeCharacterArt?.renderer?.load?.();
    if(!portraitRunning){portraitRunning=true;root.requestAnimationFrame?.(animatePortrait);if(!root.requestAnimationFrame){drawPortrait();portraitRunning=false;}}
  }
  function renderBag(data){
    const summary=$("bag-summary"),groups=$("bag-groups");
    if(!summary||!groups)return;
    if(!data){
      viewedRealm=null;viewedRoute=null;
      bagTab='beads';bagElement='all';bagEquip='all';bagBead=null;bagSword=null;
      summary.textContent='正在读取正式征程';groups.textContent='';$("bag-swords").textContent='';$("bag-detail").textContent='';
      $("bag-rank").textContent='读取中';$("bag-loadout").textContent='';$("bag-capacity").textContent='';$("bag-equipped-sword").textContent='';return;
    }
    const {state,compiled,config}=data,beads=state.beads||[],cosmetics=state.cosmetics||{owned:['plain'],equipped:'plain',tickets:0};
    const palace=id=>config.palaces.find(p=>p.id===id);
    const sword=config.cosmetics[cosmetics.equipped]||config.cosmetics.plain;
    $("bag-rank").textContent=config.ranks[state.rank]?.name||'剑修';
    $("bag-equipped-sword").textContent=`当前剑饰 · ${sword.name}`;
    $("bag-loadout").innerHTML=[...['Q','E'].map((label,i)=>`<div class="bag-slot"><small>${label} · 主动</small><b>${compiled.skills[i]?esc(compiled.skills[i].name):'未出战'}</b></div>`),
      ...[0,1].map(i=>{const id=state.loadout?.passive?.[i];return `<div class="bag-slot"><small>心法 ${i+1}</small><b>${id?(esc(palace(id)?.name||id)+'宫心法'+(compiled.minds.includes(id)?'':' · 未生效')):'未出战'}</b></div>`;})].join('');
    $("bag-capacity").textContent=`八宫容量 ${compiled.used}/${compiled.capacity} · 外观券 ${cosmetics.tickets}`;
    summary.textContent=`正式珠 ${beads.length}/40 · 已装 ${compiled.used}/${compiled.capacity} · ${state.active_trial?'挑战中仅可查看':data.blocked?'档案未同步，请重读':'装配请前往师门八宫'}`;
    $("bag-status").textContent=data.migrationRequired?'请先确认单档合并。':data.blocked?'正式档未同步，请关闭窗口后重读。':data.dirty?'师门有未保存构筑；这里显示已保存出战。':'';
    $("bag-tab-beads").setAttribute?.('aria-selected',String(bagTab==='beads'));
    $("bag-tab-swords").setAttribute?.('aria-selected',String(bagTab==='swords'));
    $("bag-tab-beads").tabIndex=bagTab==='beads'?0:-1;$("bag-tab-swords").tabIndex=bagTab==='swords'?0:-1;
    $("bag-bead-panel").hidden=bagTab!=='beads';$("bag-sword-panel").hidden=bagTab!=='swords';
    $("bag-count").textContent=bagTab==='beads'?`${beads.length} / 40 灵珠`:`${cosmetics.owned.length} 款剑饰 · ${cosmetics.tickets} 外观券`;
    $("bag-element-filters").innerHTML=[['all','全部'],...config.realms.map(r=>[r,symbols[r]+'行'])].map(([id,label])=>`<button type="button" data-bag-element="${id}" aria-pressed="${bagElement===id}">${label}</button>`).join('');
    $("bag-equip-filters").innerHTML=[['all','全部'],['installed','已装'],['loose','未装']].map(([id,label])=>`<button type="button" data-bag-equip="${id}" aria-pressed="${bagEquip===id}">${label}</button>`).join('');
    $("bag-element-filters").querySelectorAll('[data-bag-element]').forEach(button=>button.onclick=()=>{bagElement=button.dataset.bagElement;renderBag(data);$("bag-element-filters").querySelector?.(`[data-bag-element="${bagElement}"]`)?.focus?.();});
    $("bag-equip-filters").querySelectorAll('[data-bag-equip]').forEach(button=>button.onclick=()=>{bagEquip=button.dataset.bagEquip;renderBag(data);$("bag-equip-filters").querySelector?.(`[data-bag-equip="${bagEquip}"]`)?.focus?.();});
    const visible=beads.filter(b=>(bagElement==='all'||b.element===bagElement)&&(bagEquip==='all'||(bagEquip==='installed')===(state.nodes?.[b.id]===b.id)));
    if(!visible.some(b=>b.id===bagBead))bagBead=visible[0]?.id||null;
    groups.innerHTML=visible.map(bead=>{
      const status=beadStatus(bead,state,compiled);
      return `<button type="button" class="bag-item" data-bag-bead="${esc(bead.id)}" aria-pressed="${bead.id===bagBead}" aria-label="${esc(bead.name)}，${roles[bead.role]||esc(bead.role)}，${status}"><span class="bag-item-mark" style="--realm-color:${colors[bead.element]}" aria-hidden="true">${symbols[bead.element]}</span><b>${esc(bead.name)}</b><small>Lv${bead.level} · ${status}</small></button>`;
    }).join('')||'<p class="bag-empty">此筛选下没有灵珠；可切换五行或装配状态。</p>';
    groups.querySelectorAll('[data-bag-bead]').forEach(button=>button.onclick=()=>{bagBead=button.dataset.bagBead;renderBag(data);groups.querySelector?.(`[data-bag-bead="${bagBead}"]`)?.focus?.();});
    const owned=cosmetics.owned.filter(id=>config.cosmetics[id]);
    if(!owned.includes(bagSword))bagSword=cosmetics.equipped;
    $("bag-swords").innerHTML=owned.map(id=>`<button type="button" class="bag-item" data-bag-sword="${id}" aria-pressed="${id===bagSword}" aria-label="${esc(config.cosmetics[id].name)}，${id===cosmetics.equipped?'当前装备':'已拥有'}"><span class="bag-sword-mark" style="--sword:${config.cosmetics[id].color}" aria-hidden="true">${root.DaoBladeVillageProgress?.swordIcon?.(config.cosmetics[id].color,id)||'†'}</span><b>${esc(config.cosmetics[id].name)}</b><small>${id===cosmetics.equipped?'装备中':'已拥有'} · 仅外观</small></button>`).join('');
    $("bag-swords").querySelectorAll('[data-bag-sword]').forEach(button=>button.onclick=()=>{bagSword=button.dataset.bagSword;renderBag(data);$("bag-swords").querySelector?.(`[data-bag-sword="${bagSword}"]`)?.focus?.();});
    const selected=visible.find(b=>b.id===bagBead);
    $("bag-detail").innerHTML=bagTab==='beads'?(selected?`<h4>${esc(selected.name)}</h4><p>${names[selected.element]} · ${roles[selected.role]||esc(selected.role)} · Lv${selected.level} / XP${selected.xp}</p><p>当前状态：${beadStatus(selected,state,compiled)}${compiled.inactive?.[selected.id]?` · ${esc(compiled.inactive[selected.id])}`:''}</p><p>所属宫位：${esc(palace(selected.palace||selected.id.split('.')[0])?.name||selected.id.split('.')[0])}宫。调整装配请前往师门。</p>`:'<p>没有符合筛选条件的灵珠。</p>'):
      `<h4>${esc(config.cosmetics[bagSword]?.name||sword.name)}</h4><p>${bagSword===cosmetics.equipped?'当前装备':'已拥有'} · 剑身与剑光外观</p><p>不改变伤害、碰撞或攻击范围。装备及购买请前往剑坊。</p>`;
    $("bag-detail-action").textContent=bagTab==='beads'?'前往师门调整八宫':'前往剑坊查看剑饰';
    $("bag-detail-action").onclick=()=>openBagDestination(bagTab==='beads'?'journey':'shop',selected?.id.split('.')[0]);
    drawPortrait();
  }
  function update(data){
    snapshot=data;
    root.DaoBladeScene?.home?.(data);
    renderBag(data);
    if(!data){
      $("home-top-rank").textContent='征程读取中';$("home-top-clears").textContent='五境首通 0/5';
      $("home-rank").textContent='读取中';$("home-clears").textContent='0 / 5';$("home-beads").textContent='0 / 40';$("home-trial").textContent='无';
      $("home-next-step").textContent='正在读取你的正式征程。';$("home-sync").textContent='';
      $("atlas-realms").textContent='';$("atlas-routes").textContent='';$("atlas-region-title").textContent='正在读取';
      $("home-primary").disabled=true;$("atlas-start").disabled=true;$("atlas-resume").disabled=true;$("atlas-resume").hidden=true;$("atlas-reload").hidden=true;$("atlas-unify").hidden=true;if($("migration-panel"))$("migration-panel").hidden=true;return;
    }
    const {state:s,config,compiled,busy,blocked,dirty,migrationRequired}=data;
    const active=s.active_trial,cleared=config.realms.filter(r=>s.progress.clears[r]>0).length;
    if(!active){viewedRealm=null;viewedRoute=null;}
    const selectedRealm=viewedRealm||active?.realm_id||data.realm,selectedRoute=viewedRoute||active?.map_id||data.route;
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
      if(active){viewedRealm=button.dataset.realm;viewedRoute='ridge';update(snapshot);return;}
      if(root.DaoBladeJourneyUI.selectMap(button.dataset.realm,selectedRoute)){
        $("atlas-error").textContent='';
        if(root.matchMedia?.('(max-width:700px)')?.matches)root.requestAnimationFrame?.(()=>document.querySelector('.atlas-detail')?.scrollIntoView?.({block:'start',behavior:'smooth'}));
      }
      else $("atlas-error").textContent=active?'当前挑战进行中，请先恢复或放弃。':'无法切换地图，请检查征程存档。';
    });
    $("atlas-realms").querySelectorAll('[data-realm]').forEach((button,index)=>button.onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();const step=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;
      const next=config.realms[(index+step+config.realms.length)%config.realms.length];
      $("atlas-realms").querySelector(`[data-realm="${next}"]`)?.click();
      root.requestAnimationFrame?.(()=>$("atlas-realms").querySelector(`[data-realm="${next}"]`)?.focus());
    });
    $("atlas-region-label").textContent=`${symbols[selectedRealm]}行 · 两条可选路线`;
    $("atlas-region-title").textContent=`${names[selectedRealm]}境`;
    $("atlas-region-intro").textContent=regionCopy[selectedRealm];
    const recommendation=config.realms.find(r=>!s.progress.clears[r])||config.realms[0];
    const blockReason=active?'当前挑战进行中，请先恢复。':migrationRequired?'请先完成单档合并。':blocked?'正式档未同步，请重新读取。':dirty?'八宫构筑未保存，请先到师父处保存或放弃草稿。':!compiled.skills.some(Boolean)?'尚无有效主动技能，请先到师父处设置 Q 或 E。':busy?'正在同步正式档，请稍候。':'';
    $("atlas-trial-copy").textContent=active?`进行中：${names[active.realm_id]}境${active.map_id==='hollow'?'回廊':'高径'} · ${active.checkpoint?'从剑碑恢复':'从入口恢复'}`:blockReason||'选择路线，点击卡片上的“进入路线”直接开战。';
    $("atlas-trial-banner").classList.toggle('has-trial',!!active);
    $("atlas-reload").hidden=!blocked;
    $("atlas-unify").hidden=!migrationRequired;
    $("atlas-routes").innerHTML=config.maps.map(map=>{
      const route=map.id,scene=data.mapScenes[selectedRealm]?.[route]||[route,''];
      const layout=root.DaoBladeJourneyMaps?.[selectedRealm+':'+route];
      const destination=layout?.sections?.at(-1)?.label||'首领场';
      const recommended=!active&&selectedRealm===recommendation&&route==='ridge';
      const routeClears=s.progress.route_clears?.[selectedRealm+':'+route]||0;
      return `<article class="atlas-route-card"><button class="atlas-route" type="button" data-route="${route}" aria-pressed="${route===selectedRoute}" aria-label="查看${names[selectedRealm]}境${esc(scene[0])}路线详情"><span class="atlas-route-image"><img src="${imagePath(selectedRealm,route)}" alt="" data-scene="${selectedRealm}:${route}"></span><span class="atlas-route-body"><b>${esc(scene[0])}</b><small>${shape[route]}${recommended?' · 推荐':''} · ${routeClears?'已通关 '+routeClears+' 次':'未通关'}</small><span>${esc(scene[1])}</span><em>中段剑碑 · 2 条可返支路 · ${esc(destination)}</em></span></button><div class="atlas-route-enter"><button class="pixel-button primary" type="button" data-enter-route="${route}" ${blockReason?'disabled':''}>进入${esc(scene[0])}</button>${blockReason?`<small>${esc(blockReason)}</small>`:''}</div></article>`;
    }).join('');
    $("atlas-routes").querySelectorAll('img[data-scene]').forEach(img=>img.onerror=()=>imageFallback(img,selectedRealm,img.dataset.scene.split(':')[1]));
    $("atlas-routes").querySelectorAll('[data-route]').forEach(button=>button.onclick=()=>{
      if(active){viewedRoute=button.dataset.route;update(snapshot);return;}
      if(root.DaoBladeJourneyUI.selectMap(selectedRealm,button.dataset.route))$("atlas-error").textContent='';
      else $("atlas-error").textContent=active?'当前挑战进行中，请先恢复或放弃。':'无法切换路线，请检查征程存档。';
    });
    $("atlas-routes").querySelectorAll('[data-enter-route]').forEach(button=>button.onclick=()=>void root.DaoBladeJourneyUI.startMap(selectedRealm,button.dataset.enterRoute).catch(e=>{$("atlas-error").textContent=e.message;}));
    for(const selector of ['[data-route]','[data-enter-route]'])$("atlas-routes").querySelectorAll(selector).forEach(button=>button.onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();const next=button.dataset.route==='ridge'||button.dataset.enterRoute==='ridge'?'hollow':'ridge';
      if(selector==='[data-route]')$("atlas-routes").querySelector(`[data-route="${next}"]`)?.click();
      root.requestAnimationFrame?.(()=>$("atlas-routes").querySelector(selector.slice(0,-1)+`="${next}"]`)?.focus());
    });
    $("atlas-current").textContent=active?`进行中：${names[active.realm_id]}境 · ${active.map_id==='hollow'?'回廊':'高径'}，${active.checkpoint?'剑碑已保存':'从入口恢复'}。`:
      `已选：${names[selectedRealm]}境 · ${data.mapScenes[selectedRealm]?.[selectedRoute]?.[0]||selectedRoute}。`;
    $("atlas-start").disabled=busy||blocked||migrationRequired||dirty||!!active||!compiled.skills.some(Boolean);
    $("atlas-resume").disabled=busy||blocked||migrationRequired||!active;
    $("atlas-resume").hidden=!active;
  }
  function reset(){update(null);$("atlas-error").textContent='';}
  function showAtlas(){document.querySelector('[data-panel="atlas"]').click();}
  $("home-primary").onclick=()=>{
    if(snapshot?.state.active_trial)void root.DaoBladeJourneyUI.resumeTrial().catch(e=>{$("home-sync").textContent=e.message;});
    else showAtlas();
  };
  $("atlas-start").hidden=true;
  $("atlas-trial-banner").appendChild?.($("atlas-resume"));
  $("atlas-resume").onclick=()=>void root.DaoBladeJourneyUI.resumeTrial().catch(e=>{$("atlas-error").textContent=e.message;});
  $("atlas-reload").onclick=()=>void root.DaoBladeJourneyUI.load().catch(e=>{$("atlas-error").textContent=e.message;});
  $("atlas-unify").onclick=()=>$("home-unify").click();
  $("bag-tab-beads").onclick=()=>{bagTab='beads';renderBag(snapshot);$("bag-tab-beads").focus?.();};
  $("bag-tab-swords").onclick=()=>{bagTab='swords';renderBag(snapshot);$("bag-tab-swords").focus?.();};
  for(const [id,tab] of [['bag-tab-beads','beads'],['bag-tab-swords','swords']])$(id).onkeydown=event=>{
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
      event.preventDefault();bagTab=tab==='beads'?'swords':'beads';renderBag(snapshot);$(bagTab==='beads'?'bag-tab-beads':'bag-tab-swords').focus?.();
    }
  };
  $("bag-to-journey").onclick=()=>openBagDestination('journey',bagBead?.split('.')[0]);
  root.DaoBladeJourneyHome={update,reset,imagePath,showBag};
  update(null);
})(globalThis);
