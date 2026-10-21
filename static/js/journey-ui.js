"use strict";
(function(root){
  const $=id=>document.getElementById(id), escape=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let data=null,config=null,csrf="",owner=null,selected="li",busy=false,blocked=false,epoch=0;
  const palace=p=>config.palaces.find(x=>x.id===p);
  function render(){
    if(!data){return;}
    const s=data.state,c=data.compiled,active=s.active_trial;
    $("journey-status").textContent=`${config.ranks[s.rank].name} · 已装${c.used}/${c.capacity} · 修为${s.progress.spirit} · 通关${s.progress.victories} · 版本${data.revision}${busy?" · 保存中":blocked?" · 未同步，请重读":" · 已保存"}`;
    const palaces=config.palaces.slice();palaces.splice(4,0,{id:'heart'});
    const elements={wood:'木',fire:'火',earth:'土',metal:'金',water:'水'};
    $("journey-palaces").innerHTML=palaces.map(p=>p.id==='heart'?'<div class="lab-heart">剑<small>本命剑心</small></div>':`<button class="lab-palace ${p.id===selected?'active':''}" data-palace="${p.id}" aria-pressed="${p.id===selected}"><b>${p.symbol}</b><span>${p.name} · ${p.direction}</span><small>${elements[p.element]}行 · 已开放</small></button>`).join("");
    $("journey-palaces").querySelectorAll('[data-palace]').forEach(b=>b.onclick=()=>{selected=b.dataset.palace;render();});
    const p=palace(selected);$("journey-palace-title").textContent=p.name+"宫 · "+p.skill;
    const descriptions={qian:"前方远距直线剑击",dui:"击中前敌时回复8剑意，每次施法一次",zhen:"近距震荡，打断杂兵蓄势；首领不硬控",xun:"沿当前高度向前贯风180距离，经过敌人受击",li:"前方直击并灼烧3秒，每秒4伤",kan:"前方寒流，杂兵减速2秒/首领0.8秒",gen:"获得12护盾3秒并近身反击",kun:"周身范围击退，首领小幅位移"};
    $("journey-effect").textContent=descriptions[selected]+"；心法："+p.mind+"。纹路+4伤，锐式+6伤/耗16，流式−3伤/耗8（互斥）；基础耗12。心法仅选入才生效。";
    $("journey-nodes").innerHTML=config.nodes.filter(n=>n.palace===selected).map(n=>`<label>${escape(n.label)}<select data-node="${n.id}"><option value="">空位</option>${s.beads.filter(b=>b.id===n.id).map(b=>`<option value="${b.id}" ${s.nodes[n.id]===b.id?"selected":""}>${escape(b.name)} Lv${b.level}/XP${b.xp}</option>`).join("")}</select><small>${c.inactive[n.id]|| (c.connected.includes(n.id)?"连通":"未装")} · ${n.parent?"连接 "+n.parent:"根节点"}</small></label>`).join("");
    $("journey-loadout").innerHTML=['active','passive'].flatMap(kind=>[0,1].map(i=>`<label>${kind==='active'?(i?'E':'Q'):('心法'+(i+1))}<select data-slot="${kind}:${i}"><option value="">无</option>${config.palaces.map(p=>`<option value="${p.id}" ${s.loadout[kind][i]===p.id?'selected':''}>${p.name} · ${kind==='active'?p.skill:p.mind}${(kind==='active'?c.skills[i]?.id===p.id:c.minds.includes(p.id))?' · 有效':''}</option>`).join('')}</select></label>`)).join('');
    $("journey-compiled").textContent=`实际主动：${c.skills.map((k,i)=>k?`${i?'E':'Q'} ${k.name}(${k.element}) 伤${k.damage}/耗${k.cost}/${k.variant}`:`${i?'E':'Q'}停用`).join('；')}。实际心法：${c.minds.map(p=>palace(p).name).join('、')||'无'}。有效成长珠${c.effective_bead_ids.length}颗。`;
    $("journey-owned").textContent='珠匣 '+s.beads.length+'/40：'+s.beads.map(b=>b.name+' Lv'+b.level).join('、');
    $("journey-route").textContent=active?`未完成${active.breakthrough?'筑基突破':active.realm_id+'境 '+active.map_id} · ${active.checkpoint?'剑碑已保存':'入口恢复'} · 已领支路${active.claimed_altars.length}/2 · 构筑冻结`:'主路可用基础移动单跳通过，支路祭坛可返回；领取回复12血18气，胜利额外修为。';
    for(const id of ['journey-equip','journey-clear','journey-save','journey-start','journey-break'])$(id).disabled=busy||blocked||!!active;
    $("journey-start").disabled ||= !c.skills.some(Boolean);
    $("journey-break").disabled ||= s.rank!==0||s.progress.spirit<24||!c.skills.some(Boolean);
    $("journey-break").textContent=s.rank===1?"筑基已达 · 首版境界终点":"筑基突破 · 24修为";
    $("journey-resume").disabled=busy||blocked||!active;$("journey-abandon").disabled=busy||blocked||!active;
    $("journey-reload").disabled=busy;
    document.querySelectorAll('#journey-nodes select, #journey-loadout select').forEach(control=>control.disabled=busy||blocked||!!active);
    for(const id of ['journey-realm','journey-map'])$(id).disabled=busy||!!active;
    if(active){$("journey-realm").value=active.realm_id;$("journey-map").value=active.map_id;}

  }
  function reset(){epoch++;data=null;config=null;owner=null;csrf='';busy=false;blocked=false;$("journey-status").textContent='账号已变化，请重新进入读取';for(const id of ['journey-palaces','journey-nodes','journey-loadout','journey-compiled','journey-owned'])$(id).textContent='';}
  async function load(){
    if(busy)return;const generation=epoch;busy=true;
    try{
      const [auth,res]=await Promise.all([fetch('/api/auth/me'),fetch('/api/journey')]);const [me,payload]=await Promise.all([auth.json(),res.json()]);
      if(generation!==epoch)return;
      if(!auth.ok||!res.ok|| (me.user?.id??null)!==payload.owner_id)throw Error('读取失败或账号已变化');
      data=payload;config=payload.config;csrf=me.csrf_token;owner=payload.owner_id;blocked=false;$("journey-error").textContent='';
    }catch(e){if(generation===epoch){blocked=true;$("journey-error").textContent=e.message;}}
    finally{if(generation===epoch){busy=false;render();}}
  }
  async function action(action,extra={}){
    if(busy||blocked||!data)throw Error('征程未同步，请重新读取');
    const generation=epoch;busy=true;render();
    try{
      const res=await fetch('/api/journey',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action,...extra,revision:data.revision,owner_id:owner})});
      const payload=await res.json();if(generation!==epoch)throw Error('账号已变化');
      if(!res.ok)throw Error(payload.error||'保存失败');data=payload;$("journey-error").textContent='';return payload;
    }catch(e){if(generation===epoch){blocked=true;$("journey-error").textContent=e.message+'；重读后核对，不自动覆盖';}throw e;}
    finally{if(generation===epoch){busy=false;render();}}
  }
  function launch(){const t=data.state.active_trial;if(!t)throw Error('没有未完成挑战');root.DaoBladeStartJourney(t,data.trial_compiled||t.compiled);}
  async function startTrial(breakthrough=false){await action('start',{realm_id:breakthrough?'fire':$("journey-realm").value,map_id:$("journey-map").value,breakthrough});launch();}
  async function resumeTrial(){await load();if(blocked)throw Error('重读失败');launch();}
  async function abandonTrial(){if(data?.state.active_trial)await action('abandon',{trial_id:data.state.active_trial.id});}
  async function restartTrial(expected,previous={}){const t=data?.state.active_trial;if(t&&t.id!==expected)throw Error('已有另一试炼，先核对');const breakthrough=!!(t?.breakthrough??previous.breakthrough);const realm=t?.realm_id??previous.realm_id,map=t?.map_id??previous.map_id;await abandonTrial();if(realm){$("journey-realm").value=realm;$("journey-map").value=map;}await startTrial(breakthrough);}
  const run=fn=>()=>Promise.resolve().then(fn).catch(e=>{$("journey-error").textContent=e.message;});
  $("journey-equip").onclick=run(()=>{const nodes={...data.state.nodes};$("journey-nodes").querySelectorAll('[data-node]').forEach(s=>nodes[s.dataset.node]=s.value||null);return action('build',{nodes,loadout:data.state.loadout});});
  $("journey-save").onclick=run(()=>{const loadout=JSON.parse(JSON.stringify(data.state.loadout));$("journey-loadout").querySelectorAll('[data-slot]').forEach(s=>{const[k,i]=s.dataset.slot.split(':');loadout[k][Number(i)]=s.value||null;});return action('build',{nodes:data.state.nodes,loadout});});
  $("journey-clear").onclick=run(()=>action('build',{nodes:Object.fromEntries(Object.keys(data.state.nodes).map(k=>[k,null])),loadout:data.state.loadout}));
  $("journey-reload").onclick=run(load);$("journey-start").onclick=run(()=>startTrial());$("journey-break").onclick=run(()=>startTrial(true));
  $("journey-resume").onclick=run(resumeTrial);$("journey-abandon").onclick=run(abandonTrial);
  root.DaoBladeJourneyUI={load,reset,trialAction:action,resumeTrial,restartTrial};
})(globalThis);
