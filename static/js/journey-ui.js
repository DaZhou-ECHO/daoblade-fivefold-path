"use strict";
(function(root){
  const $=id=>document.getElementById(id), escape=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let draft=null;
  const buildOf=s=>JSON.parse(JSON.stringify({nodes:s.nodes,loadout:s.loadout}));
  const dirty=()=>!!(data&&draft&&JSON.stringify(draft)!==JSON.stringify(buildOf(data.state)));
  let data=null,config=null,csrf="",owner=null,selected="li",busy=false,blocked=false,migrationRequired=false,epoch=0,importPreview=null;
  const palace=p=>config.palaces.find(x=>x.id===p);
  const realmNames={fire:'火',wood:'木',earth:'土',metal:'金',water:'水'};
  const mapScenes={
    fire:{ridge:["赤霞炉台","沿山脊登炉台，远望丹阙"],hollow:["炉后石廊","循壁炉光进入石廊，右侧登台后折返"]},
    wood:{ridge:["云杉根桥","穿过树冠根桥，远望山中仙门"],hollow:["古木洞府","沿盘根与透光廊窗，右侧登台后折返"]},
    earth:{ridge:["叠岩山门","拾级登山，通向镇岳殿"],hollow:["地脉遗院","穿过断墙石窟，右侧登台后折返"]},
    metal:{ridge:["云上剑冢","循断剑林登向主峰"],hollow:["矿脉剑廊","穿过铸剑遗迹，右侧登台后折返"]},
    water:{ridge:["寒潭天桥","沿临水栈桥前往楼阁"],hollow:["水下石廊","循冰窗与暗流，右侧登台后折返"]},
  };
  function describeMap(){
    const realm=$("journey-realm").value,route=$("journey-map").value;
    const scene=mapScenes[realm]?.[route];
    $("journey-map-description").textContent=scene?`${realmNames[realm]}境 · ${scene[0]}：${scene[1]}。` : "";
    for(const key of ["ridge","hollow"]){
      const option=$("journey-map").querySelector?.(`option[value="${key}"]`);
      if(option)option.textContent=(mapScenes[realm]?.[key]?.[0]||key)+(key==="ridge"?" · 高径":" · 回廊");
    }
    notifyHome();
  }
  function notifyHome(){
    const snapshot=data?{state:data.state,compiled:data.trial_compiled||data.compiled,guide:data.guide,revision:data.revision,config,
      realm:$("journey-realm").value,route:$("journey-map").value,
      busy,blocked,migrationRequired,dirty:dirty(),mapScenes}:null;
    root.DaoBladeJourneyHome?.update(snapshot);
    root.DaoBladeVillage?.update(snapshot);
    root.DaoBladeVillageProgress?.update(snapshot);
    root.DaoBladeBagua?.update(snapshot?{...snapshot,draft}:null);
  }
  function entrySummary(){
    if(!data||!config)return null;
    const state=data.state,trial=state.active_trial;
    return {rank:config.ranks[state.rank].name,clears:config.realms.filter(realm=>state.progress.clears[realm]>0).length,
      trial:trial?{realm:trial.realm_id,route:trial.map_id,checkpoint:!!trial.checkpoint}:null,
      cosmetic:state.cosmetics?.equipped||'plain',color:config.cosmetics?.[state.cosmetics?.equipped]?.color||'#b6dbe6',blocked,dirty:dirty()};
  }
  function recommendation(){return config.realms.find(r=>!data.state.progress.clears[r])||config.realms.reduce((a,b)=>data.state.progress.clears[a]<=data.state.progress.clears[b]?a:b);}
  function mindDescription(id,level=1){
    return ({qian:`基础攻击+${1+level}`,dui:`回气+${.5+.5*level}/秒`,xun:`速度+${8+4*level}`,li:`技能直击+${1+level}`,kan:`技能冷却×${(.95-.05*level).toFixed(2)}`,gen:`防御+${1+level}`,kun:`生命+${10+5*level}`,zhen:`基础劈砍击退${6+4*level}，首领${1+level}`})[id];
  }
  function render(){
    if(!data){
      for(const id of ['journey-equip','journey-clear','journey-save','journey-start','journey-break','journey-resume','journey-abandon','journey-discard','journey-next'])$(id).disabled=true;
      $("journey-reload").disabled=busy;notifyHome();return;
    }
    const s=data.state,c=data.compiled,active=s.active_trial,edit=draft||s;
    $("journey-status").textContent=`${config.ranks[s.rank].name} · 已装${c.used}/${c.capacity} · 修为${s.progress.spirit} · 通关${s.progress.victories} · 版本${data.revision}${busy?" · 保存中":blocked?" · 未同步，请重读":dirty()?" · 未保存草稿":" · 已保存"}`;
    $("journey-draft").textContent=dirty()?"有未保存改动：切宫时保留。保存将一次提交所有宫位与出战栏；下方实际效果仍为已保存构筑。":"装配与出战栏已同步，可编辑后一次保存全部改动。";
    const cleared=config.realms.filter(r=>s.progress.clears[r]>0).length;
    $("journey-goal").textContent=`征程进度：五境首通${cleared}/5 · 八宫藏珠${s.beads.length}/40 · ${s.rank?'筑基容量已解锁':'练气突破修为'+Math.min(s.progress.spirit,24)+'/24'}。下一步：`+(active?'恢复当前挑战，或明确放弃后再改装。':!c.skills.some(Boolean)?'先为Q/E选择已连接核心的宫位并保存出战栏。':s.rank===0&&s.progress.spirit>=24?'可挑战筑基心劫；也可以继续五境收集。':cleared<5?`挑战${realmNames[recommendation()]}境，首通获得该元素各宫核心、纹路与心法。`:'已完成五境首通，可换地图找支路、收集变式，尝试不同两主动两心法构筑。');
    $("journey-next").textContent=`选择推荐：${realmNames[recommendation()]}境高径（不立即开战）`;
    $("journey-next").disabled=busy||blocked||migrationRequired||!!active;
    const palaces=config.palaces.slice();palaces.splice(4,0,{id:'heart'});
    const elements={wood:'木',fire:'火',earth:'土',metal:'金',water:'水'};
    $("journey-palaces").innerHTML=palaces.map(p=>p.id==='heart'?'<div class="lab-heart">剑<small>本命剑心</small></div>':`<button class="lab-palace ${p.id===selected?'active':''}" data-palace="${p.id}" aria-pressed="${p.id===selected}"><b>${p.symbol}</b><span>${p.name} · ${p.direction}</span><small>${elements[p.element]}行 · 已开放</small></button>`).join("");
    $("journey-palaces").querySelectorAll('[data-palace]').forEach(b=>b.onclick=()=>{selected=b.dataset.palace;render();});
    const p=palace(selected);$("journey-palace-title").textContent=p.name+"宫 · "+p.skill;
    const descriptions={qian:"前方远距直线剑击",dui:"击中前敌时回复8剑意，每次施法一次",zhen:"近距震荡，打断杂兵蓄势；首领不硬控",xun:"沿当前高度向前贯风180距离，经过敌人受击",li:"前方直击并灼烧3秒，每秒4伤",kan:"前方寒流，杂兵减速2秒/首领0.8秒",gen:"获得12护盾3秒并近身反击",kun:"周身范围击退，首领小幅位移"};
    const mindLevel=s.beads.find(b=>b.id===selected+'.mind')?.level||1;
    $("journey-effect").textContent=descriptions[selected]+`；心法Lv${mindLevel}：${mindDescription(selected,mindLevel)}。纹路Lv1/2/3加4/5/6伤；锐式加6/8/10伤、耗16；流式减伤3/2/1、耗8/7/6（互斥）。核心每级加2伤；心法仅选入才生效。`;
    $("journey-nodes").innerHTML=config.nodes.filter(n=>n.palace===selected).map(n=>`<label>${escape(n.label)}<select data-node="${n.id}"><option value="">空位</option>${s.beads.filter(b=>b.id===n.id).map(b=>`<option value="${b.id}" ${edit.nodes[n.id]===b.id?"selected":""}>${escape(b.name)} Lv${b.level}/XP${b.xp}</option>`).join("")}</select><small>${"已保存："+(c.inactive[n.id]|| (c.connected.includes(n.id)?"连通":"未装"))} · ${n.parent?"连接 "+n.parent:"根节点"}</small></label>`).join("");
    $("journey-loadout").innerHTML=['active','passive'].flatMap(kind=>[0,1].map(i=>`<label>${kind==='active'?(i?'E':'Q'):('心法'+(i+1))}<select data-slot="${kind}:${i}"><option value="">无</option>${config.palaces.map(p=>`<option value="${p.id}" ${edit.loadout[kind][i]===p.id?'selected':''}>${p.name} · ${kind==='active'?p.skill:mindDescription(p.id,s.beads.find(b=>b.id===p.id+'.mind')?.level||1)}${(kind==='active'?c.skills[i]?.id===p.id:c.minds.includes(p.id))?' · 已保存有效':''}</option>`).join('')}</select></label>`)).join('');
    $("journey-compiled").textContent=`实际主动：${c.skills.map((k,i)=>k?`${i?'E':'Q'} ${k.name}(${k.element}) 伤${k.damage}/耗${k.cost}/${k.variant}`:`${i?'E':'Q'}停用`).join('；')}。实际心法：${c.minds.map(p=>palace(p).name+' '+mindDescription(p,c.mind_levels?.[p]||1)).join('、')||'无'}。有效成长珠${c.effective_bead_ids.length}颗。`;
    $("journey-owned").textContent='珠匣 '+s.beads.length+'/40：'+s.beads.map(b=>b.name+' Lv'+b.level).join('、');
    $("journey-route").textContent=active?`未完成${active.breakthrough?'筑基突破':active.realm_id+'境 '+active.map_id} · ${active.checkpoint?'剑碑已保存':'入口恢复'} · 已领支路${active.claimed_altars.length}/2 · 构筑冻结`:'新局v2：主路单跳通行，普通挡耗剑意；可选支路祭坛回复12血18气、捷径可保存；关键遭遇与首领后按F确认离境。';
    for(const id of ['journey-equip','journey-clear','journey-save','journey-start','journey-break'])$(id).disabled=busy||blocked||migrationRequired||!!active;
    $("journey-start").disabled ||= dirty()||!c.skills.some(Boolean);
    $("journey-break").disabled ||= dirty()||s.rank!==0||s.progress.spirit<24||!c.skills.some(Boolean);
    $("journey-break").textContent=s.rank===1?"筑基已达 · 首版境界终点":"筑基突破 · 24修为";
    $("journey-resume").disabled=busy||blocked||migrationRequired||!active;$("journey-abandon").disabled=busy||blocked||migrationRequired||!active;
    $("journey-reload").disabled=busy||dirty();
    $("journey-discard").disabled=busy||!!active||!dirty();
    $("journey-nodes").querySelectorAll("[data-node]").forEach(control=>control.onchange=()=>{draft.nodes[control.dataset.node]=control.value||null;render();});
    $("journey-loadout").querySelectorAll("[data-slot]").forEach(control=>control.onchange=()=>{const[k,i]=control.dataset.slot.split(":");draft.loadout[k][Number(i)]=control.value||null;render();});
    document.querySelectorAll('#journey-nodes select, #journey-loadout select').forEach(control=>control.disabled=busy||blocked||migrationRequired||!!active);
    for(const id of ['journey-realm','journey-map'])$(id).disabled=busy||!!active;
    if(active){$("journey-realm").value=active.realm_id;$("journey-map").value=active.map_id;}
    describeMap();
    $("journey-import-preview").disabled=busy||blocked||!migrationRequired||dirty();
    $("journey-import-status").textContent=migrationRequired?"进入唯一征程前，请预览并确认合档；当前挑战会清除。":"单一征程已就绪。";

  }
  function reset(){epoch++;data=null;draft=null;config=null;owner=null;csrf='';busy=false;blocked=false;migrationRequired=false;selected='li';importPreview=null;if($("journey-import-dialog").open)$("journey-import-dialog").close();for(const id of ['journey-equip','journey-clear','journey-save','journey-start','journey-break','journey-resume','journey-abandon','journey-discard','journey-reload','journey-import-preview'])$(id).disabled=true;$("journey-error").textContent='';$("journey-route").textContent='';$("journey-map-description").textContent='';$("journey-import-status").textContent='';$("journey-status").textContent='账号已变化，请重新进入读取';$("journey-next").disabled=true;for(const id of ['journey-palaces','journey-nodes','journey-loadout','journey-compiled','journey-owned','journey-goal','journey-draft'])$(id).textContent='';notifyHome();}
  async function load(){
    if(busy)return;if(dirty()){$("journey-error").textContent="未保存草稿已保留，请先保存全部改动，或放弃草稿后再重读服务存档";render();return;}const generation=epoch;busy=true;render();
    try{
      const [auth,res]=await Promise.all([fetch('/api/auth/me'),fetch('/api/journey')]);const [me,payload]=await Promise.all([auth.json(),res.json()]);
      if(generation!==epoch)return;
      if(!auth.ok||!res.ok|| (me.user?.id??null)!==payload.owner_id)throw Error('读取失败或账号已变化');
      data=payload;draft=buildOf(payload.state);config=payload.config;csrf=me.csrf_token;owner=payload.owner_id;blocked=false;migrationRequired=!!payload.migration_required;$("journey-error").textContent='';
    }catch(e){if(generation===epoch){blocked=true;$("journey-error").textContent=e.message;}}
    finally{if(generation===epoch){busy=false;render();}}
  }
  async function action(action,extra={}){
    if(busy||blocked||!data||migrationRequired)throw Error(migrationRequired?'请先确认单档合并':'征程未同步，请重新读取');
    if(dirty()&&action!=='build')throw Error('请先保存或放弃未保存改动，再进行挑战操作');
    const generation=epoch;busy=true;render();
    try{
      const res=await fetch('/api/journey',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action,...extra,revision:data.revision,owner_id:owner})});
      const payload=await res.json();if(generation!==epoch)throw Error('账号已变化');
      if(!res.ok)throw Error(payload.error||'保存失败');if(action==='build')root.DaoBladeSkillGuide?.saved(data,payload);data=payload;draft=buildOf(payload.state);$("journey-error").textContent='';return payload;
    }catch(e){if(generation===epoch){blocked=true;$("journey-error").textContent=e.message+'；重读后核对，不自动覆盖';}throw e;}
    finally{if(generation===epoch){busy=false;render();}}
  }
  function launch(){const t=data.state.active_trial;if(!t)throw Error('没有未完成挑战');root.DaoBladeStartJourney(t,data.trial_compiled||t.compiled);}
  async function previewBuild(build){
    if(!data||busy||blocked||migrationRequired||data.state.active_trial)throw Error('当前无法预览改装');
    const generation=epoch,revision=data.revision;
    const res=await fetch('/api/journey/build-preview',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({...build,revision,owner_id:owner})});
    const payload=await res.json();if(generation!==epoch||revision!==data?.revision)throw Error('账号或档案已变化，预览已失效');
    if(!res.ok)throw Error(payload.error||'暂时无法预览');return payload;
  }
  async function startTrial(breakthrough=false){await action('start',{realm_id:breakthrough?'fire':$("journey-realm").value,map_id:$("journey-map").value,breakthrough});launch();}
  async function startMap(realm,route){
    if(!data||!config?.realms.includes(realm)||!config.maps.some(map=>map.id===route))throw Error('路线无效，请重新打开山河图');
    if(data.state.active_trial)throw Error('当前挑战尚未结束，请先恢复或放弃');
    if(dirty())throw Error('八宫构筑尚未保存，请到师父处保存或放弃草稿');
    if(!data.compiled.skills.some(Boolean))throw Error('尚未设置有效的主动技能，请先调整八宫');
    await action('start',{realm_id:realm,map_id:route,breakthrough:false});launch();
  }
  async function resumeTrial(){const generation=epoch;await load();if(generation!==epoch)throw Error('账号已变化');if(blocked)throw Error('重读失败');launch();}
  async function abandonTrial(){if(data?.state.active_trial)await action('abandon',{trial_id:data.state.active_trial.id});}
  async function restartTrial(expected,previous={}){const t=data?.state.active_trial;if(t&&t.id!==expected)throw Error('已有另一试炼，先核对');const breakthrough=!!(t?.breakthrough??previous.breakthrough);const realm=t?.realm_id??previous.realm_id,map=t?.map_id??previous.map_id;await abandonTrial();if(realm){$("journey-realm").value=realm;$("journey-map").value=map;}await startTrial(breakthrough);}
  function selectMap(realm,route){if(!data||busy||blocked||data.state.active_trial)return false;if(!config.realms.includes(realm)||!config.maps.some(m=>m.id===route))return false;$("journey-realm").value=realm;$("journey-map").value=route;describeMap();return true;}
  function editNode(id,install,replaceVariant=false){
    if(!data||busy||blocked||migrationRequired||data.state.active_trial)throw Error('当前不能调整八宫，请核对征程状态');
    const node=config.nodes.find(n=>n.id===id);
    if(!node)throw Error('八宫节点无效');
    if(install&&!data.state.beads.some(bead=>bead.id===id))throw Error('尚未获得此灵珠');
    const next=buildOf(draft);
    if(install&&['edge','flow'].includes(node.role)){
      const other=node.palace+'.'+(node.role==='edge'?'flow':'edge');
      if(next.nodes[other]){if(!replaceVariant)throw Error('锐式与流式互斥，请先确认替换');next.nodes[other]=null;}
    }
    next.nodes[id]=install?id:null;
    if(Object.values(next.nodes).filter(Boolean).length>config.ranks[data.state.rank].capacity)throw Error('已达当前境界的八宫容量上限');
    draft=next;render();return true;
  }
  function assignSlot(kind,index,id){
    if(!data||busy||blocked||migrationRequired||data.state.active_trial)throw Error('当前不能调整出战，请核对征程状态');
    if(!['active','passive'].includes(kind)||![0,1].includes(index)||id!==null&&!config.palaces.some(p=>p.id===id))throw Error('出战栏选择无效');
    const next=buildOf(draft);
    if(id)next.loadout[kind]=next.loadout[kind].map((value,i)=>value===id&&i!==index?null:value);
    next.loadout[kind][index]=id;draft=next;render();return true;
  }
  function focusPalace(id){
    if(!config?.palaces?.some(p=>p.id===id))return false;
    selected=id;render();
    root.DaoBladeBagua?.openTab('board');root.DaoBladeBagua?.selectPalace(id);
    if(!root.DaoBladeBagua){const target=$("journey-palaces"),details=target?.closest?.('details');if(details)details.open=true;root.requestAnimationFrame?.(()=>{target?.scrollIntoView?.({block:'start'});target?.querySelector?.(`[data-palace="${id}"]`)?.focus?.({preventScroll:true});});}
    return true;
  }
  async function previewImport(){
    if(!data||busy||blocked||dirty()||!migrationRequired)throw Error('请先同步构筑并确认当前需要合档');
    const generation=epoch;
    const res=await fetch('/api/journey/unify-preview');const payload=await res.json();
    if(generation!==epoch)throw Error('账号已变化');
    if(!res.ok)throw Error(payload.error||'迁移预览失败');
    if(!payload.available){$("journey-import-status").textContent=payload.migrated?'单档合并已完成。':payload.reason||'当前无需合档';return;}
    importPreview=payload;
    const receipt=payload.receipt;
    const pairs=receipt.legacy.converted.map(item=>`<li>${escape(item.source_name)}（${escape(item.source_element)}·旧Lv${item.source_level}·品阶${item.source_quality}·词条${escape(item.source_affixes.map(affix=>`${affix.label}+${affix.value}`).join('、')||'无')}）→ ${escape(item.target_id)} Lv${item.target_level}${item.changed?'':'（现有等级更高）'}</li>`).join('');
    const lab=receipt.lab.map(item=>`<li>${item.source.map(escape).join('／')} Lv${item.source_level} → ${escape(item.target_id)} Lv${item.target_level}</li>`).join('');
    const unused=receipt.legacy.unused.map(item=>`<li>${escape(item.name)}（${escape(item.element)}）</li>`).join('');
    const discarded=receipt.discarded.lab;
    $("journey-import-detail").innerHTML=`<p>正式珠 ${receipt.before.beads} → ${receipt.after.beads} / 40；修为 ${receipt.before.spirit} → ${receipt.after.spirit}。</p><p>承认旧首通：${receipt.legacy.imported_clears.map(escape).join('、')||'无'}；补发 ${receipt.legacy.spirit_awarded} 修为。</p><h3>旧五行珠</h3><ul>${pairs||'<li>无</li>'}</ul><h3>阵盘试验珠等级</h3><ul>${lab||'<li>无</li>'}</ul><h3>不转换的旧珠（${receipt.legacy.unused.length} 颗）</h3><ul>${unused||'<li>无</li>'}</ul><p>${discarded?`阵盘试验场次 ${discarded.runs}、胜利 ${discarded.victories}、修为 ${discarded.spirit} 与${escape(discarded.water_sample.name)} Lv${discarded.water_sample.level} 均不迁入。`:'无阵盘试验档。'}</p><p>将清除进行中挑战：${receipt.cleared_trials.map(escape).join('、')||'无'}。确认后旧档记录删除。</p>`;
    $("journey-import-error").textContent='';$("journey-import-dialog").showModal();
  }
  async function confirmImport(){
    const preview=importPreview;
    if(!preview||!data||dirty()||busy||blocked||!migrationRequired)throw Error('预览已失效，请重新读取');
    const generation=epoch;busy=true;render();
    try{
      const res=await fetch('/api/journey/unify-confirm',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({owner_id:owner,revisions:preview.revisions})});
      const payload=await res.json();if(generation!==epoch)throw Error('账号已变化');if(!res.ok)throw Error(payload.error||'迁移失败');
      importPreview=null;$("journey-import-dialog").close();$("journey-import-status").textContent='迁移已完成，正在重读正式征程。';
    }catch(e){if(generation===epoch)$("journey-import-error").textContent=e.message;throw e;}
    finally{if(generation===epoch){busy=false;render();}}
    if(generation===epoch)await load();
  }
  const run=fn=>()=>{const generation=epoch;return Promise.resolve().then(fn).catch(e=>{if(generation===epoch)$("journey-error").textContent=e.message;});};
  $("journey-realm").onchange=describeMap;$("journey-map").onchange=describeMap;
  $("journey-next").onclick=()=>{if(!data||busy||blocked||data.state.active_trial)return;$("journey-realm").value=recommendation();$("journey-map").value='ridge';describeMap();};
  const saveDraft=run(()=>action('build',buildOf(draft)));
  $("journey-equip").onclick=saveDraft;$("journey-save").onclick=saveDraft;
  $("journey-clear").onclick=()=>{if(!data||busy||blocked||data.state.active_trial)return;draft={nodes:Object.fromEntries(Object.keys(data.state.nodes).map(k=>[k,null])),loadout:{active:[null,null],passive:[null,null]}};render();};
  $("journey-discard").onclick=()=>{if(!data||busy||data.state.active_trial)return;draft=buildOf(data.state);if(!blocked)$("journey-error").textContent='';render();};
  root.addEventListener?.('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
  $("journey-reload").onclick=run(load);$("journey-start").onclick=run(()=>startTrial());$("journey-break").onclick=run(()=>startTrial(true));
  $("journey-resume").onclick=run(resumeTrial);$("journey-abandon").onclick=run(abandonTrial);
  $("journey-import-preview").onclick=run(previewImport);
  $("journey-import-confirm").onclick=run(confirmImport);
  $("journey-import-cancel").onclick=()=>$("journey-import-dialog").close();
  $("journey-import-dialog").onclose=()=>{importPreview=null;$("journey-import-error").textContent='';};
  root.DaoBladeJourneyUI={load,reset,entrySummary,previewBuild,trialAction:action,previewUnify:previewImport,resumeTrial,restartTrial,selectMap,focusPalace,editNode,assignSlot,startMap,startSelected:()=>startTrial(false),mapScenes};
})(globalThis);
