"use strict";
(function(root) {
  const $=id=>document.getElementById(id);
  const text=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let state=null,rules=null,revision=0,owner=null,csrf="",saved="",selected="li.core",busy=false,blocked=false,epoch=0;
  const fingerprint=()=>JSON.stringify(state);
  function status(message) { $("lab-save-status").textContent=message; }
  function buttons() {
    const dirty=state&&fingerprint()!==saved;
    $("lab-save").disabled=!state||busy||blocked;
    $("lab-practice").disabled=!state||busy||blocked||dirty||revision===0;
    for(const id of ["lab-equip","lab-detach","lab-focus-preset","lab-burst-preset"]) $(id).disabled=!state||busy||blocked;
    $("lab-reload").disabled=busy;
  }
  function render() {
    if(!state) {buttons();return;}
    const compiled=rules.compile(state),cfg=rules.config,node=cfg.nodes.find(n=>n.id===selected);
    const palaces=cfg.palaces.slice();palaces.splice(4,0,{id:"heart",name:"剑心",symbol:"剑",direction:"本命"});
    $("lab-palaces").innerHTML=palaces.map(p=>p.id==="heart"?'<div class="lab-heart">剑<small>本命剑心</small></div>':
      `<button type="button" class="lab-palace ${p.id==="li"?"active":""}" ${p.id!=="li"?"disabled":""} aria-label="${text(p.name)}宫 ${text(p.direction)} ${p.id==="li"?"当前开放":"尚未开放"}"><b>${p.symbol}</b><span>${p.name} · ${p.direction}</span><small>${p.id==="li"?"火行 · 当前开放":"尚未开放"}</small></button>`).join("");
    $("lab-capacity").textContent=`已装 ${compiled.used} / ${compiled.capacity} 珠`;
    $("lab-nodes").innerHTML=cfg.nodes.map(n=>{
      const bead=state.beads.find(b=>b.id===state.nodes[n.id]);
      return `<button type="button" data-lab-node="${n.id}" aria-pressed="${n.id===selected}" class="lab-node node-${n.role} ${compiled.effective.includes(n.id)?"connected":""} ${n.id===selected?"selected":""}"><small>${n.parent?"← "+cfg.nodes.find(p=>p.id===n.parent).label:"起点"}</small><b>${n.label}</b><span>${n.min_stage>state.stage?"阶段二开放":bead?text(bead.name):"空节点"}</span></button>`;
    }).join("");
    $("lab-nodes").querySelectorAll("[data-lab-node]").forEach(button=>button.addEventListener("click",()=>{selected=button.dataset.labNode;$("lab-error").textContent="";render();}));
    $("lab-node-title").textContent=node.label;
    $("lab-node-description").textContent=node.min_stage>state.stage?"尚未开放。此节点需要阶段二；本轮仅验证阶段一。":
      `${node.parent?"需连接"+cfg.nodes.find(n=>n.id===node.parent).label:"决定本宫技能火行属性"}。${compiled.inactive[node.id]||"只接受对应功能的火行珠。"}`;
    $("lab-bead").innerHTML=state.beads.map(b=>`<option value="${b.id}">${text(b.name)} · Lv${b.level} / XP${b.xp}${Object.values(state.nodes).includes(b.id)?" · 已装配":" · 珠匣"}</option>`).join("");
    if(state.nodes[selected]) $("lab-bead").value=state.nodes[selected];
    const skill=compiled.skill;
    $("lab-compiled").innerHTML=`<h3>${skill.enabled?(skill.focus?"聚焰 · 持续压制":skill.burst?"留痕 · 蓄势引爆":"离火 · 基础剑式"):"技能已停用"}</h3><p>${!skill.enabled?"核心未连接。装回离火核心可恢复技能，无需重新学习。":
      skill.focus?`Q：短距${skill.focus_range}，直伤${skill.focus_damage}并持续灼烧。放弃远距与引爆。`:skill.burst?`Q：火行剑式留下火痕，上限${skill.max_marks}层。E：消耗火痕，每层${skill.burst_per_mark}额外伤害；冷却${skill.burst_cooldown}秒。`:`Q：火行剑式，范围${skill.range}、直伤${skill.damage}。连接留痕后可积累火痕。`}</p><small>基础面板保持中性；只编译当前有效连线。${Object.keys(compiled.inactive).length?"存在未连接节点，不提供效果。":""}</small>`;
    $("lab-growth").textContent=`试验成长 · 闯关${state.progress.runs} / 胜利${state.progress.victories} / 修为${state.progress.spirit}；珠子等级上限${cfg.growth.max_level}`;
    buttons();
  }
  function edit(change) {
    try {state=change();$("lab-error").textContent="";status(revision&&fingerprint()===saved?`已保存 · 版本 ${revision}`:"草稿未保存 · 保存成功后才能试招");render();}
    catch(error) {$("lab-error").textContent=error.message;}
  }
  async function load(force=false) {
    if(state&&!force) {render();return;}
    const generation=++epoch;busy=true;blocked=false;buttons();status("读取独立试验档…");
    try {
      const [identity,response]=await Promise.all([fetch("/api/auth/me"),fetch("/api/lab/state")]);
      const [me,payload]=await Promise.all([identity.json(),response.json()]);
      if(generation!==epoch)return;
      if(!identity.ok||!response.ok)throw new Error(payload.error||"读取试验档失败");
      if((me.user?.id||null)!==payload.owner_id)throw new Error("账号变化，请重新读取");
      rules=root.DaoBladeArrayLabRules.createRuntime(payload.config);rules.validate(payload.state);
      state=payload.state;revision=payload.revision;owner=payload.owner_id;csrf=me.csrf_token;saved=fingerprint();
      status(revision?`已保存 · 版本 ${revision}`:"独立试验档已就绪 · 首次装配后请保存");
    } catch(error) {if(generation===epoch){blocked=true;status(error.message+"；旧草稿保留，禁止试招");}}
    finally {if(generation===epoch){busy=false;render();}}
  }
  async function save() {
    if(busy||blocked||!state)return;
    const generation=epoch,submitted=JSON.stringify(state);busy=true;buttons();status("正在保存…");
    try {
      const response=await fetch("/api/lab/state",{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},body:JSON.stringify({state,revision,owner_id:owner})});
      const payload=await response.json();if(generation!==epoch)return;
      if(!response.ok)throw new Error(payload.error||"保存失败");
      revision=payload.revision;saved=submitted;status(`已保存 · 版本 ${revision}`);
    } catch(error) {if(generation===epoch){blocked=true;status(error.message+"；草稿保留，请重新读取后核对");}}
    finally {if(generation===epoch){busy=false;render();}}
  }
  function reset() {epoch++;state=null;rules=null;saved="";revision=0;busy=false;blocked=false;buttons();for(const id of ["lab-palaces","lab-nodes","lab-compiled"]) $(id).textContent="";selected="li.core";status("账号状态已更新，请进入阵盘试验读取");}
  $("lab-equip").addEventListener("click",()=>edit(()=>rules.equip(state,selected,$("lab-bead").value)));
  $("lab-detach").addEventListener("click",()=>edit(()=>rules.equip(state,selected,null)));
  for(const variant of ["focus","burst"]) $("lab-"+variant+"-preset").addEventListener("click",()=>edit(()=>{
    const next=JSON.parse(JSON.stringify(state));for(const id of Object.keys(next.nodes))next.nodes[id]=null;
    for(const role of ["core","mark",variant])next.nodes["li."+role]="lab-"+role;rules.validate(next);return next;
  }));
  $("lab-save").addEventListener("click",save);$("lab-reload").addEventListener("click",()=>load(true));
  $("lab-practice").addEventListener("click",()=>{if(!busy&&!blocked&&revision&&saved===fingerprint())root.DaoBladeStartArrayLab(rules.compile(state));});
  root.DaoBladeArrayLabUI=Object.freeze({load,reset});buttons();
})(globalThis);
