"use strict";
(function(root){
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lines={qian:'111',dui:'011',li:'101',zhen:'001',xun:'110',kan:'010',gen:'100',kun:'000'};
  const trigram=id=>`<span class="sword-trigram" aria-hidden="true">${[...(lines[id]||'000')].map(n=>`<i class="${n==='1'?'solid':'broken'}"></i>`).join('')}</span>`;
  function vignette(stage,c){
    const swords=['M42 49L78 25','M42 49L48 16','M42 49L85 53'];
    return `<svg class="sword-vignette" viewBox="0 0 120 85" aria-hidden="true"><path d="M5 77H115" stroke="#6d9585"/><path d="M33 45L28 72M33 45L47 72M32 36L42 49" stroke="#c1d6bf" stroke-width="5"/><circle cx="32" cy="25" r="8" fill="#e3d8aa"/><path d="${swords[stage]}" stroke="#f2d58e" stroke-width="4"/><rect x="88" y="42" width="16" height="31" fill="#8a9c78"/>${stage===1?'<circle cx="93" cy="46" r="19" fill="none" stroke="#e6bd73" stroke-dasharray="4 3"/>':''}${stage===2?`<path d="M60 65Q85 ${c.sub==='gen'?15:35} 108 60" fill="none" stroke="#88c6c5" stroke-width="3"/>`:''}</svg>`;
  }
  let snapshot=null,selected='li-gen',role=0,game=null,frame=0,serial=0,signature='',practiceKey='',returnFocus=null;
  const workspace=document.querySelector('.bagua-workspace');
  const panel=document.createElement('section');panel.id='sword-config';panel.setAttribute('aria-label','合剑谱与演武');
  panel.innerHTML=`<div class="sword-config-head"><h3>合剑谱</h3><span id="sword-save-state"></span></div><div id="sword-pair-controls"><button type="button" data-sword-role="0">选主宫</button><button type="button" data-sword-role="1">选副宫</button><button type="button" id="sword-swap">交换主副</button></div><div id="sword-current"></div><div class="sword-config-actions"><button type="button" id="sword-equip">将此式配入草稿</button><button type="button" id="sword-try">试此式</button><button type="button" id="sword-try-draft">试当前草稿</button><button type="button" id="sword-beads">调珠与心法说明</button></div><p id="sword-error" role="status"></p><div id="sword-catalog" aria-label="八式剑谱"></div>`;
  workspace.append(panel);
  const arena=document.createElement('section');arena.id='sword-arena';arena.hidden=true;
  arena.innerHTML=`<header><strong id="sword-arena-title">演武</strong><button type="button" id="sword-arena-close">收剑 · Esc</button></header><div class="sword-arena-controls"><label>对手 <select id="sword-target"><option value="pounce">近身扑击</option><option value="surround">前后夹击</option><option value="boss">首领抗性</option></select></label><button type="button" id="sword-reset">复位</button><button type="button" id="sword-pause">暂停／继续</button></div><canvas id="sword-canvas" tabindex="0" width="960" height="540" aria-label="演武场，使用当前绑定按键操作"></canvas><p id="sword-arena-status" role="status"></p><p>点击场景后使用已绑定按键。下＋普攻挑剑／坠剑，长按剑气蓄力，松开出剑。</p>`;
  workspace.append(arena);
  const name=id=>snapshot?.config.palaces.find(p=>p.id===id)?.name||'空位';
  const recipe=()=>snapshot?.config.combos?.find(c=>c.id===selected);
  const editable=()=>snapshot&&!snapshot.busy&&!snapshot.blocked&&!snapshot.migrationRequired&&!snapshot.state.active_trial;
  function stop(){
    serial++;root.cancelAnimationFrame(frame);if(game){game.clearInput();game.disposed=true;game.endBattleEvents('practice_closed');game.feedbackLayer?.clear();game.enemyArt?.clear();game=null;}
    arena.hidden=true;panel.hidden=false;document.body.classList.remove('sword-practicing');returnFocus?.focus?.({preventScroll:true});
  }
  function render(){
    if(!snapshot)return;
    const c=recipe();if(!c)return;
    const active=snapshot.draft.loadout.active;
    const activeRecipe=snapshot.config.combos.find(c=>c.main===active[0]&&c.sub===active[1]);
    $('sword-save-state').textContent=snapshot.state.active_trial?'挑战中 · 冻结构筑':snapshot.dirty?'草稿未保存':'服务端已保存';
    panel.querySelectorAll('[data-sword-role]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.swordRole)===role)));
    const missing=[c.main,c.sub].filter(id=>!snapshot.state.beads.some(b=>b.id===id+'.core'));
    $('sword-current').innerHTML=`<div class="sword-hex">${trigram(c.sub)}${trigram(c.main)}<small>上${name(c.sub)} · 下${name(c.main)}</small></div><div><h4>${esc(c.hexagram)} · ${esc(c.name)}</h4><small>所选剑谱预览</small><p>当前草稿 ${esc(name(active[0]))} → ${esc(name(active[1]))} · ${esc(activeRecipe?.name||"双独立主动")}</p><ol class="sword-frames"><li>${vignette(0,c)}<b>起式</b>${esc(c.trigger)}</li><li>${vignette(1,c)}<b>接招</b>符牌亮起后，新按一次${esc(root.DaoBladeKeyLabel?.(1)||'E')}</li><li>${vignette(2,c)}<b>收势</b>${esc(c.finish)}</li></ol><p>${esc(c.stance)}</p></div>`;
    if(missing.length){
      const places=[...new Set(missing.map(id=>snapshot.config.world.regions[snapshot.config.palaces.find(p=>p.id===id).element].name))];
      $('sword-current').insertAdjacentHTML('beforeend',`<p class="sword-acquire">缺少${missing.map(name).join('、')}宫核心，可前往${places.map(esc).join('、')}任一路线胜利取得。</p>`);
    }
    $('sword-equip').disabled=!editable()||missing.length>0;
    $('sword-equip').textContent=missing.length?'缺少'+missing.map(name).join('、')+'宫核心':'将此式配入草稿';
    $('sword-try').disabled=$('sword-try-draft').disabled=!editable();
    $('sword-swap').disabled=!editable();
    $('sword-catalog').innerHTML=snapshot.config.combos.map(c=>{
      const missing=[c.main,c.sub].filter(id=>!snapshot.state.beads.some(b=>b.id===id+'.core'));
      const ready=active[0]===c.main&&active[1]===c.sub;
      return `<button type="button" data-sword-recipe="${c.id}" aria-pressed="${c.id===selected}">${trigram(c.main)}<b>${esc(c.name)}</b><small>${name(c.main)}→${name(c.sub)} · ${esc(c.use)}</small><em>${missing.length?'缺'+missing.map(name).join('、')+'核心':ready?'当前草稿':'可配'}</em></button>`;
    }).join('');
    $('sword-catalog').querySelectorAll('[data-sword-recipe]').forEach(b=>b.onclick=()=>{stop();selected=b.dataset.swordRecipe;render();$('sword-catalog').querySelector(`[data-sword-recipe="${selected}"]`).focus();});
    document.querySelectorAll('[data-bagua-palace]').forEach(b=>b.classList.toggle('sword-partner',snapshot.config.combos.some(c=>c.main===active[0]&&c.sub===b.dataset.baguaPalace)));
  }
  function equip(){
    const c=recipe();if(!editable()||!c)return;
    try{
      const needed=[c.main,c.sub].filter(id=>!snapshot.draft.nodes[id+'.core']);
      if(Object.values(snapshot.draft.nodes).filter(Boolean).length+needed.length>snapshot.config.ranks[snapshot.state.rank].capacity)throw Error('容量不足，请在调珠中取下灵珠后再配入。');
      if(needed.some(id=>!snapshot.state.beads.some(b=>b.id===id+'.core')))throw Error('请先取得对应宫核心。');
      for(const id of needed)root.DaoBladeJourneyUI.editNode(id+'.core',true);
      root.DaoBladeJourneyUI.assignSlot('active',0,c.main);root.DaoBladeJourneyUI.assignSlot('active',1,c.sub);
      $('sword-error').textContent='已配入草稿，确认后点击下方保存。';render();
    }catch(e){$('sword-error').textContent=e.message;}
  }
  let practiceCompiled=null,borrowed=false;
  function resetArena(){
    if(game){game.clearInput();game.disposed=true;game.endBattleEvents('practice_reset');game.feedbackLayer?.clear();game.enemyArt?.clear();}
    game=root.DaoBladeCreateSwordPractice(practiceCompiled,$('sword-canvas'),$('sword-target').value);
    root.DaoBladeSwordUI.game=game;
    $('sword-canvas').focus();
  }
  async function practice(useDraft){
    if(!editable())return;
    returnFocus=document.activeElement;const ticket=++serial;
    try{
      const result=await root.DaoBladeJourneyUI.previewBuild(snapshot.draft,true,useDraft?null:selected);
      if(ticket!==serial)return;
      practiceCompiled=result.compiled;borrowed=result.borrowed;
      panel.hidden=false;arena.hidden=false;document.body.classList.add('sword-practicing');
      $('sword-arena-title').textContent=(borrowed?'一级借用 · ':'草稿实装 · ')+(practiceCompiled.combo?.name||'双主动试剑');
      resetArena();let previous=performance.now();
      const loop=now=>{
        if(ticket!==serial||!game)return;
        if(!document.body.classList.contains('board-screen')||document.hidden){stop();return;}
        const dt=Math.max(0,Math.min(.05,(now-previous)/1000));previous=now;
        if(!game.pause)game.update(dt);
        game.draw();
        $('sword-arena-status').textContent=`${game.pause?'已暂停 · ':''}气血 ${Math.ceil(game.player.hp)} · 剑意 ${Math.floor(game.player.qi)} · ${game.swordWindow?'接招！'+practiceCompiled.combo.name+' '+game.swordWindow.remaining.toFixed(1)+'秒':game.swordCharge?'蓄势 '+Math.min(100,Math.floor(game.swordCharge.elapsed/.45*100))+'%':game.swordNotice||'观察敌人，按第一主动起式'}${game.player.hp<=0?' · 倒下了，点击复位再试':''}`;
        frame=root.requestAnimationFrame(loop);
      };
      frame=root.requestAnimationFrame(loop);
    }catch(e){$('sword-error').textContent=e.message;}
  }
  $('sword-canvas').addEventListener('keydown',e=>{e.stopPropagation();if(e.code==='Escape'){e.preventDefault();stop();return;}game?.keyDown(e);});
  $('sword-canvas').addEventListener('keyup',e=>{e.stopPropagation();game?.keyUp(e);});
  $('sword-canvas').addEventListener('blur',()=>{if(game){game.pause=true;game.clearInput();}});
  root.addEventListener('blur',()=>{if(game){game.pause=true;game.clearInput();}});
  $('sword-pause').onclick=()=>{if(game){game.pause=!game.pause;game.clearInput();if(!game.pause)$('sword-canvas').focus();}};
  $('sword-pause').onpointerdown=e=>e.preventDefault();
  $('sword-arena-close').onclick=stop;$('sword-target').onchange=resetArena;$('sword-reset').onclick=resetArena;
  $('sword-equip').onclick=equip;$('sword-try').onclick=()=>practice(false);$('sword-try-draft').onclick=()=>practice(true);
  $('sword-beads').onclick=()=>{const editor=document.querySelector('.scene-node-editor');editor.classList.toggle('sword-drawer-open');$('sword-beads').setAttribute('aria-expanded',String(editor.classList.contains('sword-drawer-open')));};
  $('sword-swap').onclick=()=>{if(!editable())return;const [a,b]=snapshot.draft.loadout.active;root.DaoBladeJourneyUI.assignSlot('active',0,b);root.DaoBladeJourneyUI.assignSlot('active',1,a);};
  panel.querySelectorAll('[data-sword-role]').forEach(b=>b.onclick=()=>{role=Number(b.dataset.swordRole);render();});
  $('bagua-palaces').addEventListener('click',e=>{
    const b=e.target.closest('[data-bagua-palace]');if(!b||!editable())return;
    try{root.DaoBladeJourneyUI.assignSlot('active',role,b.dataset.baguaPalace);const pair=snapshot.draft.loadout.active.join('-');if(snapshot.config.combos.some(c=>c.id===pair))selected=pair;render();}catch(error){$('sword-error').textContent=error.message;}
  });
  root.addEventListener('keydown',e=>{
    if(e.code!=='Escape'||!document.body.classList.contains('board-screen'))return;
    if(!arena.hidden){e.preventDefault();e.stopImmediatePropagation();stop();return;}
    const guide=document.querySelector('.bagua-inspector.scene-guide-open');
    const drawer=document.querySelector('.scene-node-editor.sword-drawer-open');
    if(guide||drawer){e.preventDefault();e.stopImmediatePropagation();if(guide)guide.classList.remove('scene-guide-open');else{drawer.classList.remove('sword-drawer-open');$('sword-beads').focus();}}
  },true);
  root.DaoBladeSwordUI={stop,game:null,update(next){
    const key=next?JSON.stringify([next.revision,next.draft,next.busy,next.state.active_trial?.id]):'';
    const nextPracticeKey=next?JSON.stringify([next.draft,next.compiled,next.state.active_trial?.id,next.blocked,next.migrationRequired]):'';
    if(nextPracticeKey!==practiceKey){serial++;if(game)stop();practiceKey=nextPracticeKey;}
    snapshot=next;if(!next){signature='';return;}if(signature===key)return;signature=key;render();
  }};
})(globalThis);
