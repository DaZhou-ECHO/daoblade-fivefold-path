"use strict";
/* 047: presentation adapters read the existing journey and battle state. */
(function(root){
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let homeData=null,returnFocus=null;
  const go=name=>document.querySelector(`[data-panel="${name}"]`)?.click();
  function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;return b;}
  const stage=document.querySelector('.village-stage');
  const card=button('角色读取中',()=>go('bag'));card.id='scene-character';card.className='scene-character';stage.append(card);
  const villageSkills=document.createElement('div');villageSkills.id='scene-village-skills';villageSkills.className='scene-skills';stage.append(villageSkills);
  const hud=document.querySelector('.village-hud');
  hud.querySelector('[data-go=journey]').lastElementChild.textContent='八宫';
  hud.append(button('师门',()=>{go('journey');root.DaoBladeBagua.openTab('training');}),button('设置',()=>openSettings()));
  const settings=$('settings-dialog');
  const settingsBody=settings.querySelector('.dialog-body');
  const oldControls=[...settingsBody.children];
  const controlsPage=document.createElement('section');controlsPage.id='scene-control-page';oldControls.forEach(n=>controlsPage.append(n));
  const title=document.createElement('h2');title.textContent='行旅设置';settingsBody.append(title);
  const tabs=document.createElement('nav');tabs.className='scene-settings-tabs';settingsBody.append(tabs);
  const pages={};
  function page(id,label,element){pages[id]=element;settingsBody.append(element);tabs.append(button(label,()=>selectSettings(id)));}
  page('controls','操作与显示',controlsPage);
  const size=document.createElement('label');size.innerHTML='界面大小 <select id="scene-hud-size"><option value="standard">标准</option><option value="large">大号</option></select>';controlsPage.prepend(size);
  const account=document.createElement('section');account.id='scene-account-page';
  account.append(document.querySelector('.account-actions'));
  const accountNotice=document.createElement('p');accountNotice.textContent='账号与游客档各自独立。挑战期间先返回村落，再切换身份或导入。';account.append(accountNotice);page('account','账号与存档',account);
  const info=document.createElement('section');info.id='scene-about-page';info.innerHTML='<h3>本命剑：八荒五行</h3><p>一剑入八荒，五行照归途。</p>';page('about','关于',info);
  const help=document.createElement('section');help.innerHTML='<h3>剑诀与操作</h3><p>移动、格挡、闪避与技能按键可在“操作与显示”中查看和修改。</p>';
  help.append(button('阅读剑诀',()=>{settings.close();if(document.querySelector('#panel-game.active')){const d=$('scene-build-dialog');d.querySelector('h2').textContent='剑诀说明';d.querySelector('div').innerHTML=$('panel-manual').innerHTML;d.showModal();}else go('manual');}));page('help','剑诀说明',help);
  settingsBody.append(button('返回',()=>settings.close()));
  function selectSettings(id){Object.entries(pages).forEach(([key,p])=>p.hidden=key!==id);[...tabs.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(Object.keys(pages)[i]===id)));}
  function openSettings(){returnFocus=document.activeElement;$('settings-run').click();selectSettings('controls');const battle=!!document.querySelector('#panel-game.active');account.querySelectorAll('button').forEach(b=>b.disabled=battle);}
  settings.addEventListener('close',()=>returnFocus?.isConnected&&returnFocus.focus());
  const sizeSelect=$('scene-hud-size');try{sizeSelect.value=localStorage.getItem('daoblade-hud-size')||'standard';}catch(_){}
  function applySize(){document.body.classList.toggle('large-hud',sizeSelect.value==='large');}
  applySize();sizeSelect.onchange=()=>{applySize();try{localStorage.setItem('daoblade-hud-size',sizeSelect.value);}catch(_){}};
  $('settings-run').addEventListener('click',()=>{selectSettings('controls');account.querySelectorAll('button').forEach(b=>b.disabled=!!document.querySelector('#panel-game.active'));});
  // The board retains its existing draft controller, in a dedicated full-screen shell.
  const pane=$('bagua-board-pane'),chart=pane.querySelector('.bagua-chart-wrap'),inspector=pane.querySelector('.bagua-inspector');
  const editor=document.createElement('section');editor.className='scene-node-editor';editor.setAttribute('aria-label','灵珠装配');
  editor.append($('bagua-palace-title'),$('bagua-palace-copy'),$('bagua-nodes'),$('bagua-node-detail'));
  pane.querySelector('.bagua-workspace').insertBefore(editor,inspector);
  chart.append(pane.querySelector('.bagua-talismans'));
  const guideToggle=button('说明与招式演示',()=>{inspector.classList.toggle('scene-guide-open');$('skill-guide').scrollIntoView({block:'start'});});guideToggle.className='scene-guide-toggle';editor.prepend(guideToggle);
  const closeGuide=button('返回装配',()=>inspector.classList.remove('scene-guide-open'));closeGuide.className='scene-mobile-open';inspector.prepend(closeGuide);
  const mobileOpen=button('装配与说明',()=>document.body.classList.add('board-detail-open'));mobileOpen.className='scene-mobile-open';chart.append(mobileOpen);
  const mobileClose=button('收起详情',()=>document.body.classList.remove('board-detail-open'));mobileClose.className='scene-mobile-open';editor.prepend(mobileClose);
  const record=$('bagua-saved').parentElement,fold=document.createElement('details'),summary=document.createElement('summary');summary.textContent='已保存效果与改动对照';record.before(fold);fold.append(summary,record);
  const actions=$('bagua-actions'),more=document.createElement('details'),moreTitle=document.createElement('summary');moreTitle.textContent='更多操作';more.append(moreTitle,$('journey-clear'),$('journey-reload'));actions.append(more);
  const build=document.createElement('dialog');build.id='scene-build-dialog';build.className='pixel-dialog';build.innerHTML='<h2>本局构筑</h2><div></div>';build.append(button('返回暂停',()=>build.close()));document.body.append(build);
  $('pause-overlay').querySelector('div').append(button('当前构筑',()=>{build.querySelector('h2').textContent='本局冻结构筑';build.querySelector('div').innerHTML=$('skill-hud').innerHTML;build.showModal();}));
  $('pause-overlay').querySelector('div').append(button('放弃挑战',async()=>{if(!confirm('放弃本次挑战并返回村落？未结算奖励不会发放。'))return;try{await root.DaoBladeJourneyUI.abandonTrial();$('quit-run').click();}catch(e){alert(e.message);}}));
  $('quit-run').textContent='返回村落';$('settings-run').textContent='设置';
  const battleHud=document.createElement('aside');battleHud.className='scene-battle-stats';battleHud.innerHTML='<span>生命 <b id="scene-hp"></b><meter id="scene-hp-meter" min="0"></meter></span><span>剑意 <b id="scene-qi"></b><meter id="scene-qi-meter" min="0"></meter></span><small id="scene-shield"></small>';battleHud.append(button('暂停／设置',()=>$('pause-run').click()));
  const canvas=document.querySelector('.canvas-wrap');canvas.append(battleHud);canvas.append($('skill-hud'));
  function home(data){homeData=data;if(!data){card.textContent='角色读取中';villageSkills.textContent='';return;}const s=data.state,c=data.compiled;card.innerHTML=`<span>本命剑修</span><strong>${esc(data.config.ranks[s.rank].name)}</strong><small>修为 ${s.progress.spirit} · 查看角色</small>`;villageSkills.innerHTML='';c.skills.forEach((skill,i)=>villageSkills.append(button(`${root.DaoBladeKeyLabel(i)} · ${skill?.name||'未配置'}`,()=>{go('journey');document.querySelector(`[data-bagua-slot="active:${i}"]`)?.click();})));const minds=document.createElement('small');minds.textContent='心法 '+(c.minds.map(id=>data.config.palaces.find(p=>p.id===id)?.name||id).join('／')||'未配置');villageSkills.append(minds);}
  function battle(game){if(!game.journey)return;const p=game.player;for(const [key,value,max] of [['hp',p.hp,game.stats.hpMax],['qi',p.qi,game.stats.qiMax]]){$('scene-'+key).textContent=Math.ceil(Math.max(0,value))+' / '+max;const m=$('scene-'+key+'-meter');m.max=max;m.value=Math.max(0,value);} $('scene-shield').textContent=p.shield>0?'护盾 '+Math.ceil(p.shield):p.guardBreak>0?'破防中':'';
    const skills=game.lab.skills;
    // updateHUD writes the legacy text afterwards; this microtask presents the same live values.
    queueMicrotask(()=>{if(!document.querySelector('#panel-game.active'))return;$('skill-hud').innerHTML=skills.map((s,i)=>{const cd=p.skillCooldowns[i],status=!s?'停用':cd>0?cd.toFixed(1)+'s':p.qi<s.cost?'剑意不足':'可用';return `<span class="scene-skill ${status==='可用'?'ready':'unready'}" style="--cool:${s?Math.min(100,cd/s.cooldown*100):0}%"><b>${esc(root.DaoBladeKeyLabel(i))}</b><strong>${esc(s?.name||'未配置')}</strong><small>${status}</small></span>`;}).join('')+`<small>心法 ${esc(game.lab.minds.map(id=>homeData?.config.palaces.find(p=>p.id===id)?.name||id).join('／')||'无')}</small>`;skills.forEach((s,i)=>{const b=document.querySelector(`[data-touch="${i?'dao2':'dao'}"]`);if(b)b.textContent=(s?.name||'停用')+(p.skillCooldowns[i]>0?' '+p.skillCooldowns[i].toFixed(1):'');});});}
  root.DaoBladeScene={home,battle,palaceSelected(){document.body.classList.add('board-detail-open');},boardMode(value){document.body.classList.toggle('board-screen',value&&!!$('panel-journey').classList.contains('active'));if(value){$('village-window-title').textContent='八宫构筑';$('village-window-close').textContent='返回村落 · Esc';}},controlsChanged(){home(homeData);root.DaoBladeBagua?.openTab(document.body.classList.contains('board-screen')?'board':'training');}};
  document.addEventListener('keydown',event=>{if(event.code!=='Escape'||document.querySelector('dialog[open]')||document.body.classList.contains('village-window-open')||!$('panel-sanctuary').classList.contains('active'))return;event.preventDefault();openSettings();});
  document.addEventListener('keydown',event=>{if(event.code!=='Escape'||document.querySelector('dialog[open]')||!document.body.classList.contains('board-screen')||innerWidth>700)return;if(inspector.classList.contains('scene-guide-open'))inspector.classList.remove('scene-guide-open');else if(document.body.classList.contains('board-detail-open')&&!document.querySelector('.bagua-confirm')&&!document.querySelector('#bagua-slot-chooser'))document.body.classList.remove('board-detail-open');else return;event.preventDefault();event.stopImmediatePropagation();},true);
})(globalThis);
