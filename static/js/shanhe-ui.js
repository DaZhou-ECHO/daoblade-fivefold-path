"use strict";
(function(root){
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data=null,tab='main',returnFocus=null,pendingVisit=null,visiting=false;
  const dialog=document.createElement('dialog');dialog.id='shanhe-journal';dialog.className='pixel-dialog';
  dialog.innerHTML='<header><h2>山河行旅簿</h2><button type="button" data-close>返回村落 · Esc</button></header><nav aria-label="行旅簿分类"></nav><p id="quest-status" role="status"></p><div id="quest-content"></div><p id="quest-error" role="alert"></p>';
  document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();});
  for(const [id,label] of [['main','山河调查'],['people','村民委托'],['bounty','悬赏栏']]){const b=document.createElement('button');b.textContent=label;b.type='button';b.dataset.questTab=id;b.onclick=()=>{tab=id;render();dialog.querySelector(`[data-quest-tab=${id}]`).focus();};dialog.querySelector('nav').append(b);}
  async function act(action,extra){try{await root.DaoBladeJourneyUI.trialAction(action,extra);$('quest-error').textContent='';}catch(e){$('quest-error').textContent=e.message;}}
  function open(which='main'){if(!data)return;tab=which;returnFocus=document.activeElement;render();if(!dialog.open)dialog.showModal();dialog.querySelector('[data-close]').focus();root.DaoBladeVillage?.clearInput();}
  function render(){
    if(!data)return;const s=data.state,story=s.story,w=data.config.world;
    if(!story||!w)return;
    const locked=data.busy||data.blocked||data.migrationRequired||!!s.active_trial||data.dirty;
    dialog.querySelectorAll('[data-quest-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.questTab===tab)));
    $('quest-status').textContent=s.active_trial?'挑战中只读；回村后处理任务。':data.dirty?'请先保存或放弃八宫草稿。':data.blocked?'档案未同步，请重新读取。':`${w.chapter} · 调查 ${Object.values(s.progress.clears).filter(n=>n>0).length}/5`;
    const btn=(label,action,extra={},disabled=false)=>`<button type="button" data-action="${action}" data-extra="${esc(JSON.stringify(extra))}" ${locked||disabled?'disabled':''}>${label}</button>`;
    if(tab==='main'){
      $('quest-content').innerHTML=`<article><h3>村井无水，药队未归</h3><p>${esc(w.intro)}</p>${story.intro_read?'<small>已阅读 · 五地自由调查</small>':btn('开始调查','story_read',{key:'intro'})}</article>`+
      Object.entries(w.regions).map(([realm,r])=>{const found=s.progress.clears[realm]>0,read=story.read_clues.includes(realm);return `<article><h3>${esc(r.name)} · ${found?'已平定':'待调查'} · ${read?'记述已读':found?'新线索':'线索未发现'}</h3><p>${esc(r.purpose)}</p>${found?`<p>${esc(r.clue)}</p>${read?'':btn('记入调查簿','story_read',{key:realm})}`:'<p>任选该地区一条路线胜利后带回记录。</p>'}<button type="button" data-map="${realm}">在山河图查看</button></article>`;}).join('')+
      (story.completed?`<article><h3>逆脉妖潮 · 已结案</h3><p>${esc(w.ending)}</p></article>`:story.intro_read&&story.read_clues.length===5?`<article><h3>回村复核五地记录</h3><p>${esc(w.ending)}</p>${btn('与师父修复镇脉，完成本章','story_read',{key:'ending'})}</article>`:'<p>五地调查完毕，读完记录后，可回村与师父复核旧阵。</p>');
    }else if(tab==='people'){
      $('quest-content').innerHTML=w.commissions.map(q=>`<article><h3>${esc(q.title)} · ${story.commissions.includes(q.id)?'已完成':'待拜访'}</h3><p>${esc(q.text)}</p><button type="button" data-visit="${q.id}">前往${{mentor:'演武坪',sword:'本命剑台',merchant:'剑坊'}[q.id]}</button></article>`).join('');
    }else{
      const b=story.bounty;
      $('quest-content').innerHTML='<p>每次接取一项，无每日限制。接取后出发；完成后回村领取2修为。支路调查须同一局取得祭坛奖励并胜利。</p>'+(b?`<article><h3>${esc(w.regions[b.realm].name)} · ${b.kind==='clear'?'道路清剿':'支路调查'}</h3><p>${b.ready?'目标已完成，等待领取':'已接取；失败后可再次出发'}</p>${b.ready?btn('领取2修为','bounty_claim',{bounty_id:b.id}):btn('取消当前悬赏','bounty_cancel')}</article>`:Object.entries(w.regions).map(([realm,r])=>`<article><h3>${esc(r.name)}</h3><p>${esc(r.purpose)}</p>${btn('接取道路清剿 · 2修为','bounty_accept',{realm,kind:'clear'})}${btn('接取支路调查 · 2修为','bounty_accept',{realm,kind:'branch'})}</article>`).join(''));
    }
    $('quest-content').querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>act(b.dataset.action,JSON.parse(b.dataset.extra)));
    $('quest-content').querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{dialog.close();document.querySelector('[data-panel=atlas]').click();root.DaoBladeJourneyUI.selectMap(b.dataset.map,'ridge');});
    $('quest-content').querySelectorAll('[data-visit]').forEach(b=>b.onclick=()=>{dialog.close();visitPlace(b.dataset.visit);});
    if(dialog.open&&!dialog.contains(document.activeElement))dialog.querySelector(`[data-quest-tab=${tab}]`).focus();
  }
  function visitPlace(key){
    const panel=key==='merchant'?'shop':'journey';document.querySelector(`[data-panel=${panel}]`).click();
    if(key==='mentor')root.DaoBladeBagua.openTab('training');visit(key);
  }
  function visit(key){pendingVisit=key;maybeVisit();}
  function maybeVisit(){if(!data||visiting||!pendingVisit||data.busy||data.blocked||data.dirty||data.migrationRequired||data.state.active_trial)return;const key=pendingVisit;pendingVisit=null;if(data.state.story.commissions.includes(key))return;visiting=true;root.DaoBladeJourneyUI.trialAction('commission',{key}).catch(e=>{$('quest-error').textContent=e.message;}).finally(()=>visiting=false);}
  function update(next){data=next;if(!data){pendingVisit=null;if(dialog.open)dialog.close();return;}if(!data.config.world||!data.state.story)return;
    const s=data.state,w=data.config.world;
    if(!data.blocked&&!data.dirty&&!s.active_trial&&!data.migrationRequired)$('home-next-step').textContent=!s.story.intro_read?'村井失水，药队未归。前往悬赏栏查看山河调查。':s.story.completed?'村井已复流。可重访支路、修行，准备下一段行旅。':`调查山河 ${Object.values(s.progress.clears).filter(n=>n>0).length}/5 · 悬赏栏与任务日志可查看线索。`;
    const map=$('atlas-realms');
    if(map){map.querySelectorAll('[data-realm]').forEach(b=>{const r=w.regions[b.dataset.realm];b.style.setProperty('--realm-x',r.x+'%');b.style.setProperty('--realm-y',r.y+'%');b.querySelector('b').textContent=r.name;b.querySelector('.atlas-realm-symbol').textContent=r.mark;b.querySelector('em').textContent=s.progress.clears[b.dataset.realm]>0?'路线已通关 · 线索已发现':'前往调查';});
      const region=map.querySelector('[aria-pressed=true]')?.dataset.realm||data.realm;
      $('atlas-region-title').textContent=w.regions[region].name;$('atlas-region-intro').textContent=w.regions[region].purpose;
      $('atlas-routes').querySelectorAll('.atlas-route-body').forEach((body,i)=>{const route=i?'hollow':'ridge',p=document.createElement('p');p.className='route-story';p.textContent=w.regions[region][route]+(s.story.read_clues.includes(region)?' · 调查记述已读':'');body.append(p);});
    }
    if(dialog.open)render();queueMicrotask(maybeVisit);
  }
  const hud=document.querySelector('.village-hud'),questButton=document.createElement('button');questButton.id='village-journal';questButton.type='button';questButton.textContent='任务';questButton.onclick=()=>open();hud.insertBefore(questButton,hud.lastElementChild);
  const reselect=document.createElement('button');reselect.type='button';reselect.textContent='返回选档';reselect.onclick=()=>root.DaoBladeSaves.reselect().catch(e=>alert(e.message));$('scene-account-page').append(reselect);
  const fullscreen=document.createElement('button');fullscreen.type='button';fullscreen.textContent='切换全屏';fullscreen.onclick=()=>{const p=document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();p.catch(e=>alert(e.message));};$('scene-control-page').append(fullscreen);
  root.DaoBladeShanhe={update,open,visit,visitPlace};
  hud.querySelector('[data-go=journey]').addEventListener('click',()=>visit('sword'));
})(globalThis);
