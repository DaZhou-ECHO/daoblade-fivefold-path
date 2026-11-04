"use strict";
(function(root){
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let snapshot=null,selected='li',mode='active',key='',viewKey='',serial=0,timer=0,frame=0,preview=null,error='',playing=false;
  const name=id=>snapshot.config.palaces.find(p=>p.id===id)?.name||id;
  function stop(){if(frame)root.cancelAnimationFrame(frame);frame=0;playing=false;}
  function keyLabel(slot){let controls={};try{controls=JSON.parse(localStorage.getItem('daoblade-controls')||'{}');}catch(_){}return (controls[slot?'dao2':'dao']||(slot?'KeyE':'KeyQ')).replace(/^Key/,'').replace('Space','空格');}
  function skillText(s){return s?`${s.name} · 直击参数 ${s.damage} / 剑意 ${s.cost} / 冷却 ${s.cooldown}秒 / ${s.id==='xun'?'移动见说明':'范围 '+s.range} · ${s.variant}`:'停用';}
  function comparison(before,after){
    return `<p>容量 ${before.used}/${before.capacity} → ${after.used}/${after.capacity}</p>`+before.skills.map((s,i)=>`<p><b>${keyLabel(i)}：</b>${esc(skillText(s))}<br>→ ${!s&&after.skills[i]?'新增 · ':s&&!after.skills[i]?'停用 · ':''}${esc(skillText(after.skills[i]))}</p>`).join('')+`<p>心法：${esc(before.minds.map(m=>name(m.id)+' '+m.text).join('；')||'空位')}<br>→ ${esc(after.minds.map(m=>name(m.id)+' '+m.text).join('；')||'空位')}</p>`;
  }
  function renderCompare(){
    const el=$('skill-comparison');if(!snapshot?.guide){el.textContent='';return;}
    el.innerHTML=snapshot.state.active_trial?'<p>当前挑战使用已冻结构筑，仅可查看。</p>':!snapshot.dirty?'<p>当前装配与服务端已保存效果一致。</p>':error?`<p>${esc(error)}；草稿已保留。</p><button type="button" id="skill-preview-retry">重新预览</button>`:!preview?'<p>效果计算中…</p>':`<h4>已保存 → 草稿（尚未生效）</h4>${comparison(snapshot.guide.saved,preview.guide.saved)}<p>直击参数已计入出战心法；实际命中还受敌人防御影响。</p>`;
    $('skill-preview-retry')?.addEventListener('click',()=>{key='';update(snapshot,selected);});
  }
  function renderGuide(){
    if(!snapshot?.config.skill_guide){$('skill-guide').textContent='';return;}
    const active=document.activeElement,focusRef=$('skill-guide').contains?.(active)?{id:active.id,mode:active.dataset?.guideMode}:null;
    const g=snapshot.config.skill_guide[selected],catalog=(preview?.guide||snapshot.guide)?.catalog?.[selected];
    const loadout=snapshot.draft.loadout.active,index=loadout.indexOf(selected),bead=snapshot.state.beads.find(b=>b.id===selected+'.core');
    const skill=catalog?.skill||catalog?.base_skill,ownsMind=snapshot.state.beads.some(b=>b.id===selected+'.mind');
    const how=index<0?'配置到主动栏后使用':`按 ${keyLabel(index)} 施放${snapshot.dirty?'（草稿待保存）':''}`;
    $('skill-guide').innerHTML=`<div class="skill-mode"><button type="button" data-guide-mode="active" aria-pressed="${mode==='active'}">主动招式</button><button type="button" data-guide-mode="mind" aria-pressed="${mode==='mind'}">心法</button></div><h4>${esc(g.purpose)}</h4><p class="skill-operation">${mode==='active'?esc(how):'连接核心与心法珠，再放入心法栏；无需按键。'}</p><p>${esc(mode==='active'?g.timing:g.mind)}</p><p>${mode==='active'&&!catalog?.skill?'Lv1核心基础示意（非当前生效）：':snapshot.dirty?(preview?'草稿参考：':'已保存参考（草稿计算中）：'):'已保存参考：'}${mode==='active'?esc(skill?skillText(skill):'基础招式示意；当前尚未连通核心。'):esc(catalog?.mind||g.mind)}${mode==='mind'?(ownsMind?' · 等级对应效果，出战后生效':' · 尚未获得心法珠'):''}</p>${mode==='active'?`<p>${esc(skill?.extra||g.effect)}</p><div class="skill-demo"><canvas id="skill-demo-canvas" width="480" height="200" aria-label="${name(selected)}宫招式范围示意"></canvas><div class="skill-storyboard"><span>① 对准站位</span><span>② ${esc(how)}</span><span>③ ${esc(g.effect)}</span><span>④ ${esc(g.limit)}</span></div></div><div class="skill-demo-actions"><button type="button" id="skill-demo-play">播放一次</button><button type="button" id="skill-demo-enemy" aria-pressed="false">目标：普通敌人</button></div><p id="skill-demo-caption" role="status">招式示意${bead?'':' · 尚未获得'}；非实际战斗，不产生奖励。</p>`:''}<p class="skill-limit">限制：${esc(mode==='active'?g.limit:'未连接或未放入心法栏不生效；占用一个心法栏。')}${mode==='active'?' 需足够剑意、冷却结束；格挡及互斥动作期间不能施放。':''}</p><p>搭配参考：${name(selected)}＋${name(g.pair)}，${esc(snapshot.config.skill_guide[g.pair].purpose)}。仍需持有、连通并满足容量；不自动装配。</p><p>获得：${{wood:'木',fire:'火',earth:'土',metal:'金',water:'水'}[snapshot.config.palaces.find(p=>p.id===selected).element]}境路线胜利。首通补该元素核心、纹路、心法；后续补未持有珠。有效出战珠随胜利成长，最高3级、每级20经验。</p><details><summary>卦意与取象</summary><p>${esc(g.image)}。取材《说卦》，战斗用途为本项目原创改编；五行和宫位按本作现有规则固定对应。</p></details>`;
    $('skill-guide').querySelectorAll('[data-guide-mode]').forEach(b=>b.onclick=()=>{stop();mode=b.dataset.guideMode;renderGuide();$('skill-guide').querySelector(`[data-guide-mode="${mode}"]`).focus();});
    if(mode==='active'){
      let boss=false;
      $('skill-demo-play').onclick=()=>play(boss);
      $('skill-demo-enemy').onclick=()=>{stop();boss=!boss;$('skill-demo-enemy').textContent='目标：'+(boss?'首领':'普通敌人');$('skill-demo-enemy').setAttribute('aria-pressed',String(boss));draw(0,boss);};
      draw(0,boss);
    }
    if(focusRef){const target=focusRef.id?$(focusRef.id):$('skill-guide').querySelector(`[data-guide-mode="${focusRef.mode}"]`);target?.focus?.({preventScroll:true});}
  }
  function draw(t,boss){
    try{drawFrame(t,boss);}catch(_){const canvas=$('skill-demo-canvas');if(canvas)canvas.hidden=true;const caption=$('skill-demo-caption');if(caption)caption.textContent='图形暂时不可用，请按四步静态分镜查看招式。';stop();}
  }
  function drawFrame(t,boss){
    const canvas=$('skill-demo-canvas'),ctx=canvas?.getContext?.('2d');if(!ctx)return;
    const phase=Math.min(3,Math.floor(t/1.25)),progress=Math.max(0,Math.min(1,(t-1.25)/1.25));
    ctx.clearRect(0,0,480,200);ctx.fillStyle='#12343c';ctx.fillRect(0,0,480,200);ctx.fillStyle='#607b66';ctx.fillRect(0,164,480,5);
    const x=selected==='xun'?92+progress*150:92;ctx.imageSmoothingEnabled=false;
    const renderer=root.DaoBladeCharacterArt?.renderer;
    const drawn=renderer?.draw(ctx,{x:x-19,y:94,w:38,h:70,face:1,hp:1,onGround:true,vx:0,vy:0,animTime:t},'#b6dbe6','plain');
    if(!drawn){ctx.fillStyle='#e6d3a1';ctx.fillRect(x-9,102,18,22);ctx.fillStyle='#537e83';ctx.fillRect(x-13,124,26,40);}
    const baseEnemyX=selected==='qian'?330:selected==='kan'?280:220;
    const enemyX=selected==='kun'&&phase>=2?baseEnemyX+(boss?9:45):baseEnemyX;ctx.fillStyle=boss?'#c3926c':'#9daf89';ctx.fillRect(enemyX, boss?82:108,boss?40:25,boss?82:56);
    ctx.strokeStyle='#dbcb8c';ctx.setLineDash([5,4]);ctx.strokeRect(110,65,selected==='qian'?300:selected==='kan'?220:170,98);ctx.setLineDash([]);
    if(phase>=2){ctx.strokeStyle='#f0d98d';ctx.lineWidth=3;
      if(selected==='gen'){ctx.strokeRect(x-25,90,50,75);ctx.fillStyle='#ffe6ac';ctx.fillText('护盾',x-20,80);}
      else if(selected==='kun'){ctx.beginPath();ctx.ellipse(x,130,155,40,0,0,Math.PI*2);ctx.stroke();}
      else {ctx.beginPath();ctx.moveTo(x+12,125);ctx.lineTo(selected==='qian'?410:selected==='xun'?x+30:baseEnemyX,125);ctx.stroke();}
      ctx.fillStyle=selected==='li'?'#ff9c63':selected==='kan'?'#86dbed':'#f4d786';
      const labels={li:'灼烧',kan:boss?'减速0.8秒':'减速2秒',zhen:boss?'首领不硬控':'蓄势打断',dui:'命中回气一次',xun:'沿路径攻击',qian:'前方直击',kun:boss?'小幅推开':'推开',gen:'护盾不累加'};
      ctx.fillText(labels[selected],255,55);
    }
    ctx.fillStyle='#e9e0ba';ctx.font='14px sans-serif';ctx.fillText(['① 站位 · 对准前方','② 按键 · 施放招式','③ 生效 · 观察范围','④ 结果 · 留意限制'][phase],12,24);
  }
  function play(boss){
    stop();if(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches){$('skill-demo-caption').textContent='减少动态效果已开启：请看四步静态分镜。';return;}
    playing=true;let start=null;
    const tick=now=>{if(!playing||!document.body.classList.contains('village-window-open')||!$('panel-journey').classList.contains('active')||$('bagua-board-pane').hidden){stop();return;}start??=now;const t=(now-start)/1000;draw(t,boss);if(t<4.99)frame=root.requestAnimationFrame(tick);else stop();};
    frame=root.requestAnimationFrame(tick);
  }
  function update(next,palace){
    snapshot=next;selected=palace||selected;
    if(!next){serial++;root.clearTimeout(timer);key='';viewKey='';preview=null;error='';stop();$('skill-guide').textContent='';$('skill-save-recap').hidden=true;renderCompare();return;}
    const nextKey=JSON.stringify([next.revision,next.draft]);
    if(key!==nextKey){key=nextKey;preview=null;error='';const ticket=++serial;root.clearTimeout(timer);
      if(next.dirty&&!next.busy&&!next.blocked&&!next.state.active_trial&&!next.migrationRequired){timer=root.setTimeout(async()=>{try{const result=await root.DaoBladeJourneyUI.previewBuild(next.draft);if(ticket!==serial)return;preview=result;error='';}catch(e){if(ticket!==serial)return;error=e.message;}viewKey='';renderGuide();renderCompare();},150);}
    }
    const signature=key+selected+next.busy+mode;
    if(viewKey!==signature){stop();viewKey=signature;renderGuide();}
    renderCompare();
  }
  async function candidate(id,target){
    if(!snapshot)return;const source=snapshot,ticket=serial,build=JSON.parse(JSON.stringify(source.draft)),role=id.split('.')[1];
    if(build.nodes[id])build.nodes[id]=null;else{build.nodes[id]=id;if(['edge','flow'].includes(role))build.nodes[id.split('.')[0]+'.'+(role==='edge'?'flow':'edge')]=null;}
    target.textContent='装换效果计算中…';
    try{const result=await root.DaoBladeJourneyUI.previewBuild(build);if(ticket!==serial||!target.isConnected)return;target.innerHTML=comparison(source.guide.saved,result.guide.saved);}catch(e){if(target.isConnected)target.textContent='暂时无法预览：'+e.message;}
  }
  function saved(before,after){
    const el=$('skill-save-recap');if(!before.guide||!after.guide)return;
    el.hidden=false;el.innerHTML=`<h4>已保存 · 本次改变</h4>${comparison(before.guide.saved,after.guide.saved)}<button type="button" id="skill-recap-how">查看用法</button><button type="button" id="skill-recap-board">返回阵盘</button><button type="button" id="skill-recap-map">前往山河图</button>`;
    $('skill-recap-how').onclick=()=>$('skill-guide').scrollIntoView({block:'start'});
    $('skill-recap-board').onclick=()=>$('bagua-palaces').scrollIntoView({block:'start'});
    $('skill-recap-map').onclick=()=>document.querySelector('[data-panel="atlas"]').click();
  }
  $('skill-mobile-detail').onclick=()=>$('skill-guide').scrollIntoView({block:'start',behavior:'smooth'});
  root.DaoBladeSkillGuide={update,stop,saved,candidate,comparison,skillText};
})(globalThis);
