"use strict";
(function(root){
  const $=id=>document.getElementById(id);
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const order=['xun','li','kun','zhen',null,'dui','gen','kan','qian'];
  const lines={qian:'111',dui:'011',li:'101',zhen:'001',xun:'110',kan:'010',gen:'100',kun:'000'};
  const elements={wood:['木','#64c894'],fire:['火','#fa8665'],earth:['土','#dec083'],metal:['金','#ddd9b2'],water:['水','#80c8e8']};
  const roles={core:'核心',trace:'纹路',edge:'锐式',flow:'流式',mind:'心法'};
  const icons={core:'◆',trace:'▤',edge:'✦',flow:'〰',mind:'◎'};
  const points={xun:[60,60],li:[150,30],kun:[240,60],zhen:[30,150],dui:[270,150],gen:[60,240],kan:[150,270],qian:[240,240]};
  let snapshot=null,tab='board',selectedPalace='li',selectedNode='li.core',selectedSlot=null,pending=null;
  const palace=id=>snapshot?.config?.palaces?.find(p=>p.id===id);
  const node=id=>snapshot?.config?.nodes?.find(n=>n.id===id);
  const owned=id=>snapshot?.state?.beads?.find(b=>b.id===id);
  const installed=id=>snapshot?.draft?.nodes?.[id]===id;
  function connected(id){const n=node(id);return !!n&&installed(id)&&(!n.parent||connected(n.parent));}
  function editable(){return !!snapshot&&!snapshot.busy&&!snapshot.blocked&&!snapshot.migrationRequired&&!snapshot.state.active_trial;}
  function marks(id){
    const edit=snapshot.draft.loadout,items=[];
    for(const [kind,labels] of [['active',[root.DaoBladeKeyLabel?.(0)||'Q',root.DaoBladeKeyLabel?.(1)||'E']],['passive',['心一','心二']]])edit[kind].forEach((value,i)=>{if(value===id)items.push(labels[i]);});
    return items.join(' · ');
  }
  function trigram(id){return `<span class="bagua-trigram" aria-hidden="true">${[...lines[id]].map(bit=>`<i class="${bit==='1'?'solid':'broken'}"></i>`).join('')}</span>`;}
  function nodeState(id){
    if(!owned(id))return ['missing','未获得'];
    if(!installed(id))return ['available','持有未装'];
    if(!connected(id))return ['unlinked','草稿未连通'];
    if(snapshot.state.nodes[id]===id&&snapshot.compiled.effective_bead_ids.includes(id))return ['effective','已保存生效'];
    const p=id.split('.')[0],role=node(id).role,loadout=snapshot.draft.loadout;
    const selected=role==='mind'?loadout.passive.includes(p):role==='core'?loadout.active.includes(p)||loadout.passive.includes(p):loadout.active.includes(p);
    return ['linked',selected?'草稿已连通':'已连通，尚未出战'];
  }
  function focus(selector){root.requestAnimationFrame?.(()=>document.querySelector(selector)?.focus?.({preventScroll:true}));}
  function renderSlots(){
    const edit=snapshot.draft.loadout;
    $('bagua-slots').innerHTML=[['active',0,(root.DaoBladeKeyLabel?.(0)||'Q')+' · 主动'],['active',1,(root.DaoBladeKeyLabel?.(1)||'E')+' · 主动'],['passive',0,'心法一'],['passive',1,'心法二']].map(([kind,index,label])=>{
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
    const paths=Object.entries(points).map(([id,[x,y]])=>{
      const core=id+'.core',status=connected(core)?`connected ${snapshot.state.nodes[core]===core?'saved':'draft'}`:'unlinked';
      return `<path d="M150 150 L${x} ${y}" class="${id===selectedPalace?'selected':''} ${status}"/>`;
    }).join('');
    const assignments=[...snapshot.draft.loadout.active.map((id,i)=>[id,root.DaoBladeKeyLabel?.(i)||(i?'E':'Q')]),...snapshot.draft.loadout.passive.map((id,i)=>[id,i?'心二':'心一'])]
      .filter(([id])=>points[id]).map(([id,label])=>{const [x,y]=points[id];return `<text x="${(x+150)/2}" y="${(y+150)/2-5}">${label}</text>`;}).join('');
    $('bagua-palaces').innerHTML=`<svg class="bagua-vein-map" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">${paths}<circle cx="150" cy="150" r="97"/><circle cx="150" cy="150" r="138"/>${assignments}</svg>`+order.map(id=>{
      if(!id)return '<div class="bagua-heart" aria-label="本命剑心"><img src="/static/sprites/weapons/base/jian.png" alt=""><small>本命剑心</small></div>';
      const p=palace(id),count=snapshot.config.nodes.filter(n=>n.palace===id&&installed(n.id)).length,[element,color]=elements[p.element];
      return `<button class="bagua-palace" type="button" data-bagua-palace="${id}" data-element="${p.element}" aria-pressed="${id===selectedPalace}" aria-label="${p.name}宫，${p.direction}，${element}行，草稿已装${count}颗，${marks(id)||'未出战'}" style="--bagua-color:${color}">${trigram(id)}<b>${esc(p.name)}宫</b><span class="bagua-element">${element}行 · ${esc(p.direction)}</span><small>${count}/5 珠</small><span class="bagua-purpose">${esc(snapshot.config.skill_guide?.[id]?.purpose||'')}</span><em>${marks(id)||'未出战'}</em></button>`;
    }).join('');
    const sword=$('bagua-palaces').querySelector('.bagua-heart img');if(sword)sword.onerror=()=>{sword.hidden=true;};
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
    }).join('')}</div><div class="bagua-bead-casket" aria-label="${p.name}宫珠匣"><strong>本宫珠匣</strong><div>${['core','trace','mind','edge','flow'].map(role=>{
      const id=selectedPalace+'.'+role,bead=owned(id);
      return `<button type="button" data-bagua-bead="${id}" draggable="${Boolean(bead&&editable()&&!installed(id))}" ${bead?'':'disabled'} aria-label="${p.name}宫${roles[role]}，${bead?`持有${bead.name}等级${bead.level}`:'未获得'}"><i class="bagua-bead-mark" aria-hidden="true">${icons[role]}</i><span>${roles[role]}<small>${bead?`Lv${bead.level}${installed(id)?' · 已装':''}`:'未得'}</small></span></button>`;
    }).join('')}</div></div>`;
    const nextNode={core:{ArrowUp:'mind',ArrowRight:'trace'},mind:{ArrowDown:'core',ArrowRight:'edge'},trace:{ArrowLeft:'core',ArrowUp:'edge',ArrowDown:'flow'},edge:{ArrowLeft:'mind',ArrowDown:'trace'},flow:{ArrowLeft:'trace',ArrowUp:'trace'}};
    $('bagua-nodes').querySelectorAll('[data-bagua-node]').forEach(button=>{
      button.onclick=()=>{selectedNode=button.dataset.baguaNode;pending=null;renderNodes();focus(`[data-bagua-node="${selectedNode}"]`);};
      button.onkeydown=event=>{const role=button.dataset.baguaNode.split('.')[1],next=nextNode[role]?.[event.key];if(next){event.preventDefault();selectedNode=selectedPalace+'.'+next;pending=null;renderNodes();focus(`[data-bagua-node="${selectedNode}"]`);}};
      button.ondragover=event=>{if(editable()&&event.dataTransfer?.types.includes('text/plain'))event.preventDefault();};
      button.ondrop=event=>{event.preventDefault();const id=event.dataTransfer?.getData('text/plain');if(id!==button.dataset.baguaNode||!owned(id)||installed(id)||!editable())return;selectedNode=id;const role=id.split('.')[1];const other=selectedPalace+'.'+(role==='edge'?'flow':'edge');if(['edge','flow'].includes(role)&&installed(other)){pending=id;renderNodes();return;}changeNode(id,true,false);};
    });
    $('bagua-nodes').querySelectorAll('[data-bagua-bead]').forEach(button=>{
      button.onclick=()=>{selectedNode=button.dataset.baguaBead;pending=null;renderNodes();focus(`[data-bagua-node="${selectedNode}"]`);};
      button.ondragstart=event=>{if(!editable()||!owned(button.dataset.baguaBead)||installed(button.dataset.baguaBead)){event.preventDefault();return;}event.dataTransfer.setData('text/plain',button.dataset.baguaBead);event.dataTransfer.effectAllowed='copy';};
    });
    if(node(selectedNode)?.palace!==selectedPalace)selectedNode=selectedPalace+'.core';
    const detailNode=node(selectedNode);
    const id=selectedNode,bead=owned(id),[status,label]=nodeState(id),saved=snapshot.state.nodes[id]===id;
    const other=selectedPalace+'.'+(detailNode.role==='edge'?'flow':'edge');
    const replacement=bead&&!installed(id)&&['edge','flow'].includes(detailNode.role)&&installed(other);
    const full=bead&&!installed(id)&&!replacement&&Object.values(snapshot.draft.nodes).filter(Boolean).length>=snapshot.config.ranks[snapshot.state.rank].capacity;
    const children=detailNode.role==='core'&&snapshot.config.nodes.some(n=>n.parent===id&&installed(n.id));
    $('bagua-node-detail').innerHTML=`<h4><i class="bagua-bead-mark" aria-hidden="true">${icons[detailNode.role]}</i>${esc(detailNode.label)}</h4><p>${bead?`${esc(bead.name)} · Lv${bead.level} / XP${bead.xp}`:'尚未获得对应灵珠'}</p><p>草稿：${label}；已保存：${saved?(snapshot.compiled.inactive[id]?'未连通':snapshot.compiled.effective_bead_ids.includes(id)?'出战生效':'已装'):'未装'}。</p>${full?'<p>容量已满，请先取下一颗灵珠。</p>':''}${children&&installed(id)?'<p>取下核心后，已装子珠将保留但暂时失去连通。</p>':''}<button type="button" data-bagua-node-action ${!bead||!editable()||full?'disabled':''}>${installed(id)?'取下灵珠':replacement?'替换当前变式':'装入灵珠'}</button>${pending===id?`<div class="bagua-confirm"><p>${replacement?'锐式与流式互斥，确认取下另一变式并装入此珠？':'确认取下核心？子珠将保留为未连通。'}</p><button type="button" data-bagua-confirm>确认</button><button type="button" data-bagua-cancel>取消</button></div>`:''}`;
    const guide=snapshot.config.node_guide?.[detailNode.role];
    if(guide){const info=document.createElement('div');info.className='skill-node-explanation';info.innerHTML=`<p>${esc(guide.effect)}</p><p>${esc(guide.growth)}</p><p>${detailNode.parent?'前置：'+esc(node(detailNode.parent).label)+(connected(detailNode.parent)?'（已连通）':'（尚未连通）'):'根节点，无连接前置'}；${bead?'Lv'+bead.level+' / '+bead.xp+'经验'+(bead.level===3?'（满级）':'，下一级需20经验'):'本宫对应元素路线胜利可获得'}。</p>`;$('bagua-node-detail').append(info);}
    if(pending===id&&snapshot.guide){const compare=document.createElement('div');compare.className='skill-candidate';$('bagua-node-detail').querySelector('.bagua-confirm').append(compare);void root.DaoBladeSkillGuide?.candidate(id,compare);}
    $('bagua-node-detail').querySelector('[data-bagua-node-action]').onclick=()=>{
      if(replacement||children&&installed(id)){pending=id;renderNodes();return;}
      changeNode(id,!installed(id),false);
    };
    $('bagua-node-detail').querySelector('[data-bagua-confirm]')?.addEventListener('click',()=>changeNode(id,!installed(id),replacement));
    $('bagua-node-detail').querySelector('[data-bagua-cancel]')?.addEventListener('click',()=>{pending=null;renderNodes();});
  }
  function changeNode(id,install,replace){
    try{root.DaoBladeJourneyUI.editNode(id,install,replace);pending=null;render();const targets=[document.querySelector(`[data-bagua-node="${id}"]`),document.querySelector('.bagua-vein-map path.selected')];targets.forEach(target=>target?.classList.add('bagua-channel-pulse'));root.setTimeout?.(()=>targets.forEach(target=>target?.classList.remove('bagua-channel-pulse')),450);focus(`[data-bagua-node="${id}"]`);}
    catch(error){$('journey-error').textContent=error.message;}
  }
  function render(){
    if(!snapshot){root.DaoBladeSkillGuide?.update(null);$('bagua-palaces').textContent='读取八宫中';$('bagua-slots').textContent='';$('bagua-nodes').textContent='';$('bagua-node-detail').textContent='';return;}
    if(!palace(selectedPalace))selectedPalace=snapshot.config.palaces[0].id;
    const used=Object.values(snapshot.draft.nodes).filter(Boolean).length;
    $('bagua-capacity').textContent=`草稿已装 ${used}/${snapshot.config.ranks[snapshot.state.rank].capacity}`;
    $('bagua-freeze').textContent=snapshot.state.active_trial?'挑战进行中：本局构筑冻结，只可查看。':snapshot.dirty?'草稿尚未保存；地图进入将受阻。':'已保存构筑可用于下一局。';
    renderSlots();renderPalaces();renderNodes();root.DaoBladeSkillGuide?.update(snapshot,selectedPalace);
  }
  function update(next){snapshot=next;if(!next){selectedSlot=null;pending=null;}render();}
  function openTab(name='board'){
    root.DaoBladeSkillGuide?.stop();
    if(!['board','training','breakthrough'].includes(name))name='board';tab=name;root.DaoBladeScene?.boardMode?.(name==='board');selectedSlot=null;pending=null;
    for(const key of ['board','training','breakthrough']){$(`bagua-${key}-pane`).hidden=key!==name;const button=document.querySelector(`[data-bagua-tab="${key}"]`);button?.setAttribute('aria-current',key===name?'page':'false');}
    if(snapshot)render();
  }
  function selectPalace(id){if(!palace(id))return;root.DaoBladeScene?.palaceSelected?.();selectedPalace=id;selectedNode=id+'.core';pending=null;openTab('board');focus(`[data-bagua-palace="${id}"]`);}
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
