"use strict";
(function(root){
  const $=id=>document.getElementById(id);
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const order=['xun','li','kun','zhen',null,'dui','gen','kan','qian'];
  const lines={qian:'111',dui:'011',li:'101',zhen:'001',xun:'110',kan:'010',gen:'100',kun:'000'};
  const elements={wood:['木','#64c894'],fire:['火','#fa8665'],earth:['土','#dec083'],metal:['金','#ddd9b2'],water:['水','#80c8e8']};
  const roles={core:'核心',trace:'纹路',edge:'锐式',flow:'流式',mind:'心法'};
  const icons={core:'◆',trace:'▤',edge:'✦',flow:'〰',mind:'◎'};
  let snapshot=null,tab='board',selectedPalace='li',selectedNode='li.core',selectedSlot=null,pending=null;
  const palace=id=>snapshot?.config?.palaces?.find(p=>p.id===id);
  const node=id=>snapshot?.config?.nodes?.find(n=>n.id===id);
  const owned=id=>snapshot?.state?.beads?.find(b=>b.id===id);
  const installed=id=>snapshot?.draft?.nodes?.[id]===id;
  function connected(id){const n=node(id);return !!n&&installed(id)&&(!n.parent||connected(n.parent));}
  function editable(){return !!snapshot&&!snapshot.busy&&!snapshot.blocked&&!snapshot.migrationRequired&&!snapshot.state.active_trial;}
  function marks(id){
    const edit=snapshot.draft.loadout,items=[];
    for(const [kind,labels] of [['active',['Q','E']],['passive',['心一','心二']]])edit[kind].forEach((value,i)=>{if(value===id)items.push(labels[i]);});
    return items.join(' · ');
  }
  function trigram(id){return `<span class="bagua-trigram" aria-hidden="true">${[...lines[id]].map(bit=>`<i class="${bit==='1'?'solid':'broken'}"></i>`).join('')}</span>`;}
  function nodeState(id){
    if(!owned(id))return ['missing','未获得'];
    if(!installed(id))return ['available','持有未装'];
    if(!connected(id))return ['unlinked','草稿未连通'];
    if(!snapshot.dirty&&snapshot.compiled.effective_bead_ids.includes(id))return ['effective','出战生效'];
    return ['linked','草稿已连通'];
  }
  function focus(selector){root.requestAnimationFrame?.(()=>document.querySelector(selector)?.focus?.({preventScroll:true}));}
  function renderSlots(){
    const edit=snapshot.draft.loadout;
    $('bagua-slots').innerHTML=[['active',0,'Q · 主动'],['active',1,'E · 主动'],['passive',0,'心法一'],['passive',1,'心法二']].map(([kind,index,label])=>{
      const id=edit[kind][index],p=palace(id),ready=id&&connected(id+(kind==='active'?'.core':'.mind'));
      return `<button type="button" class="bagua-slot ${ready?'ready':id?'inactive':''}" data-bagua-slot="${kind}:${index}" aria-expanded="${selectedSlot?.kind===kind&&selectedSlot.index===index}"><small>${label}</small><b>${p?`${trigram(id)}${esc(p.name)} · ${esc(kind==='active'?p.skill:'心法')}`:'未指定'}</b><em>${!id?'点击选宫':ready?'草稿可生效':'缺少连通珠，保存后仍无效'}</em></button>`;
    }).join('');
    $('bagua-slots').querySelectorAll('[data-bagua-slot]').forEach(button=>button.onclick=()=>{
      const [kind,value]=button.dataset.baguaSlot.split(':');selectedSlot={kind,index:Number(value)};pending=null;render();focus(`[data-bagua-choice="${snapshot.draft.loadout[kind][Number(value)]||'empty'}"]`);
    });
    $('bagua-slots').querySelectorAll('[data-bagua-slot]').forEach((button,index)=>{
      button.disabled=!editable();
      button.onkeydown=event=>{const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-2,ArrowDown:2}[event.key];if(!step)return;event.preventDefault();const next=(index+step+4)%4;$('bagua-slots').querySelectorAll('[data-bagua-slot]')[next]?.focus();};
    });
    const prior=$('bagua-slot-chooser');prior?.remove();
    if(selectedSlot){
      const chooser=document.createElement('div');chooser.id='bagua-slot-chooser';chooser.className='bagua-slot-chooser';chooser.setAttribute('aria-label','选择出战宫位');
      const kind=selectedSlot.kind;
      chooser.innerHTML=`<p>${kind==='active'?'选择主动技宫位':'选择心法宫位'}；未连通的选择会保存但暂不生效。</p><div>${snapshot.config.palaces.map(p=>`<button type="button" data-bagua-choice="${p.id}">${trigram(p.id)}${esc(p.name)}<small>${connected(p.id+(kind==='active'?'.core':'.mind'))?'可生效':'未连通'}</small></button>`).join('')}<button type="button" data-bagua-choice="empty">清空此栏</button></div><button type="button" data-bagua-cancel>取消</button>`;
      $('bagua-slots').after(chooser);
      chooser.querySelectorAll('[data-bagua-choice]').forEach(button=>button.onclick=()=>{
        try{root.DaoBladeJourneyUI.assignSlot(kind,selectedSlot.index,button.dataset.baguaChoice==='empty'?null:button.dataset.baguaChoice);selectedSlot=null;render();}
        catch(error){$('journey-error').textContent=error.message;}
      });
      chooser.querySelector('[data-bagua-cancel]').onclick=()=>{selectedSlot=null;render();};
    }
  }
  function renderPalaces(){
    $('bagua-palaces').innerHTML=order.map(id=>{
      if(!id)return '<div class="bagua-heart" aria-label="本命剑心"><span>剑</span><small>本命剑心</small></div>';
      const p=palace(id),count=snapshot.config.nodes.filter(n=>n.palace===id&&installed(n.id)).length,[element,color]=elements[p.element];
      return `<button class="bagua-palace" type="button" data-bagua-palace="${id}" data-element="${p.element}" aria-pressed="${id===selectedPalace}" aria-label="${p.name}宫，${p.direction}，${element}行，草稿已装${count}颗，${marks(id)||'未出战'}" style="--bagua-color:${color}">${trigram(id)}<b>${esc(p.name)}宫</b><span class="bagua-element">${element}行 · ${esc(p.direction)}</span><small>${count}/5 珠</small><em>${marks(id)||'未出战'}</em></button>`;
    }).join('');
    $('bagua-palaces').querySelectorAll('[data-bagua-palace]').forEach(button=>{
      button.onclick=()=>selectPalace(button.dataset.baguaPalace);
      button.onkeydown=event=>{
        const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta)return;
        event.preventDefault();let x=order.indexOf(button.dataset.baguaPalace)%3,y=Math.floor(order.indexOf(button.dataset.baguaPalace)/3);
        while(x+delta[0]>=0&&x+delta[0]<3&&y+delta[1]>=0&&y+delta[1]<3){x+=delta[0];y+=delta[1];const next=order[y*3+x];if(next){selectPalace(next);break;}}
      };
    });
  }
  function renderNodes(){
    const p=palace(selectedPalace);if(!p)return;
    $('bagua-palace-title').textContent=`${p.name}宫 · ${p.skill}`;
    $('bagua-palace-copy').textContent=`${elements[p.element][0]}行 · ${p.direction}。核心连接纹路与心法，纹路再分出锐式和流式。`;
    const links=[['core','trace','M17 50 L50 50'],['core','mind','M17 50 L50 17'],['trace','edge','M50 50 L83 17'],['trace','flow','M50 50 L83 83']];
    $('bagua-nodes').innerHTML=`<div class="bagua-node-map"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${links.map(([,target,path])=>`<path d="${path}" class="${connected(selectedPalace+'.'+target)?'linked':installed(selectedPalace+'.'+target)?'unlinked':'empty'}"/>`).join('')}</svg>${['core','trace','mind','edge','flow'].map(role=>{
      const id=selectedPalace+'.'+role,bead=owned(id),[status,label]=nodeState(id);
      return `<button type="button" class="bagua-node bagua-node-${role}" data-bagua-node="${id}" data-state="${status}" aria-pressed="${selectedNode===id}" aria-label="${p.name}宫${roles[role]}，${label}"><span><i class="bagua-bead-mark" aria-hidden="true">${icons[role]}</i>${roles[role]}</span><b>${bead?'Lv'+bead.level:'未得'}</b><small>${label}</small></button>`;
    }).join('')}</div>`;
    const nextNode={core:{ArrowUp:'mind',ArrowRight:'trace'},mind:{ArrowDown:'core',ArrowRight:'edge'},trace:{ArrowLeft:'core',ArrowUp:'edge',ArrowDown:'flow'},edge:{ArrowLeft:'mind',ArrowDown:'trace'},flow:{ArrowLeft:'trace',ArrowUp:'trace'}};
    $('bagua-nodes').querySelectorAll('[data-bagua-node]').forEach(button=>{
      button.onclick=()=>{selectedNode=button.dataset.baguaNode;pending=null;renderNodes();focus(`[data-bagua-node="${selectedNode}"]`);};
      button.onkeydown=event=>{const role=button.dataset.baguaNode.split('.')[1],next=nextNode[role]?.[event.key];if(next){event.preventDefault();selectedNode=selectedPalace+'.'+next;pending=null;renderNodes();focus(`[data-bagua-node="${selectedNode}"]`);}};
    });
    if(node(selectedNode)?.palace!==selectedPalace)selectedNode=selectedPalace+'.core';
    const detailNode=node(selectedNode);
    const id=selectedNode,bead=owned(id),[status,label]=nodeState(id),saved=snapshot.state.nodes[id]===id;
    const other=selectedPalace+'.'+(detailNode.role==='edge'?'flow':'edge');
    const replacement=bead&&!installed(id)&&['edge','flow'].includes(detailNode.role)&&installed(other);
    const full=bead&&!installed(id)&&!replacement&&Object.values(snapshot.draft.nodes).filter(Boolean).length>=snapshot.config.ranks[snapshot.state.rank].capacity;
    const children=detailNode.role==='core'&&snapshot.config.nodes.some(n=>n.parent===id&&installed(n.id));
    $('bagua-node-detail').innerHTML=`<h4><i class="bagua-bead-mark" aria-hidden="true">${icons[detailNode.role]}</i>${esc(detailNode.label)}</h4><p>${bead?`${esc(bead.name)} · Lv${bead.level} / XP${bead.xp}`:'尚未获得对应灵珠'}</p><p>草稿：${label}；已保存：${saved?(snapshot.compiled.inactive[id]?'未连通':snapshot.compiled.effective_bead_ids.includes(id)?'出战生效':'已装'):'未装'}。</p>${full?'<p>容量已满，请先取下一颗灵珠。</p>':''}${children&&installed(id)?'<p>取下核心后，已装子珠将保留但暂时失去连通。</p>':''}<button type="button" data-bagua-node-action ${!bead||!editable()||full?'disabled':''}>${installed(id)?'取下灵珠':replacement?'替换当前变式':'装入灵珠'}</button>${pending===id?`<div class="bagua-confirm"><p>${replacement?'锐式与流式互斥，确认取下另一变式并装入此珠？':'确认取下核心？子珠将保留为未连通。'}</p><button type="button" data-bagua-confirm>确认</button><button type="button" data-bagua-cancel>取消</button></div>`:''}`;
    $('bagua-node-detail').querySelector('[data-bagua-node-action]').onclick=()=>{
      if(replacement||children&&installed(id)){pending=id;renderNodes();return;}
      changeNode(id,!installed(id),false);
    };
    $('bagua-node-detail').querySelector('[data-bagua-confirm]')?.addEventListener('click',()=>changeNode(id,!installed(id),replacement));
    $('bagua-node-detail').querySelector('[data-bagua-cancel]')?.addEventListener('click',()=>{pending=null;renderNodes();});
  }
  function changeNode(id,install,replace){
    try{root.DaoBladeJourneyUI.editNode(id,install,replace);pending=null;render();focus(`[data-bagua-node="${id}"]`);}
    catch(error){$('journey-error').textContent=error.message;}
  }
  function render(){
    if(!snapshot){$('bagua-palaces').textContent='读取八宫中';$('bagua-slots').textContent='';$('bagua-nodes').textContent='';$('bagua-node-detail').textContent='';return;}
    if(!palace(selectedPalace))selectedPalace=snapshot.config.palaces[0].id;
    const used=Object.values(snapshot.draft.nodes).filter(Boolean).length;
    $('bagua-capacity').textContent=`草稿已装 ${used}/${snapshot.config.ranks[snapshot.state.rank].capacity}`;
    $('bagua-freeze').textContent=snapshot.state.active_trial?'挑战进行中：本局构筑冻结，只可查看。':snapshot.dirty?'草稿尚未保存；地图进入将受阻。':'已保存构筑可用于下一局。';
    renderSlots();renderPalaces();renderNodes();
  }
  function update(next){snapshot=next;if(!next){selectedSlot=null;pending=null;}render();}
  function openTab(name='board'){
    if(!['board','training','breakthrough'].includes(name))name='board';tab=name;selectedSlot=null;pending=null;
    for(const key of ['board','training','breakthrough']){$(`bagua-${key}-pane`).hidden=key!==name;const button=document.querySelector(`[data-bagua-tab="${key}"]`);button?.setAttribute('aria-current',key===name?'page':'false');}
    if(snapshot)render();
  }
  function selectPalace(id){if(!palace(id))return;selectedPalace=id;selectedNode=id+'.core';pending=null;openTab('board');focus(`[data-bagua-palace="${id}"]`);}
  $('bagua-summary').insertAdjacentHTML('afterbegin','<div class="bagua-pills"><strong id="bagua-capacity">草稿已装 0/6</strong><span id="bagua-freeze">正在读取</span></div>');
  $('bagua-training-pane').append($('panel-journey').querySelector('.training-section'));
  $('bagua-summary').append($('journey-status'),$('journey-draft'),$('journey-error'));
  $('bagua-saved').append($('journey-compiled'));
  $('bagua-actions').append($('journey-save'),$('journey-discard'),$('journey-clear'),$('journey-reload'));
  $('bagua-break-status').append($('journey-goal'),$('journey-route'));
  $('bagua-break-actions').append($('journey-break'),$('journey-resume'),$('journey-abandon'));
  document.querySelectorAll('[data-bagua-tab]').forEach(button=>button.onclick=()=>openTab(button.dataset.baguaTab));
  $('bagua-tutorial-close').onclick=()=>{try{localStorage.setItem('daoblade-bagua-tip-v1','1');}catch(_){}$('bagua-tutorial').hidden=true;};
  try{$('bagua-tutorial').hidden=localStorage.getItem('daoblade-bagua-tip-v1')==='1';}catch(_) {$('bagua-tutorial').hidden=false;}
  root.addEventListener?.('keydown',event=>{if(event.key!=='Escape'||!document.body.classList.contains('village-window-open')||!$('panel-journey').classList.contains('active'))return;if(selectedSlot||pending){event.preventDefault();event.stopImmediatePropagation();selectedSlot=null;pending=null;render();}},true);
  root.DaoBladeBagua={update,openTab,selectPalace};
  openTab('board');update(null);
})(globalThis);
