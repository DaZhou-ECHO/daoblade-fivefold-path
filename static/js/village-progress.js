"use strict";
(function(root){
  const $=id=>document.getElementById(id);
  const LABELS={sword:["剑术","基础劈砍伤害",3,"%"],step:["身法","移动速度",2,"%"],guard:["护体","最大生命",5,""]};
  let snapshot=null;
  function swordIcon(color,id){
    const notch=id==="sunset"?'M47 16L53 31L49 77L45 86L37 86L33 77L29 31L35 16Z':id==="frost"?'M42 18L49 35L50 56L45 85L37 85L32 56L33 35Z':'M42 14L48 31L46 84L38 84L36 31Z';
    return `<svg viewBox="0 0 84 110" aria-hidden="true"><path d="M39 86L45 86L45 105L39 105Z" fill="#293a40"/><path d="M26 86H57V92H26Z" fill="#d8b675"/><path d="${notch}" fill="${color}" stroke="#e7faf6" stroke-width="2"/><path d="M41 31V79" stroke="#f7fff5" stroke-width="2"/></svg>`;
  }
  function update(data){snapshot=data;render();}
  function render(){
    if(!snapshot){$("training-tree").textContent="读取师门中";$("shop-items").textContent="读取商品中";$("shop-balance").textContent="读取外观券中";$("training-reset").disabled=true;return;}
    const {state,config,busy,blocked,dirty,migrationRequired}=snapshot;
    const locked=busy||blocked||dirty||migrationRequired||!!state.active_trial;
    $("training-tree").innerHTML=Object.entries(LABELS).map(([key,[name,effect,step,unit]])=>{
      const level=state.training[key],cost=config.training.costs[level];
      return `<article class="training-branch"><h4>${name} · ${level}/3</h4><p>${effect} +${level*step}${unit}</p><div class="training-steps" aria-label="已学 ${level} 级">${[1,2,3].map(i=>`<span class="${i<=level?'learned':''}"></span>`).join('')}</div><p>${level<3?`下一阶：+${(level+1)*step}${unit} · ${cost} 修为`:'已修至最高阶'}</p><button class="pixel-button" data-train="${key}" ${locked||level===3||state.progress.spirit<cost?'disabled':''}>${level===3?'已圆满':'研习下一阶'}</button></article>`;
    }).join('');
    $("training-tree").querySelectorAll('[data-train]').forEach(button=>button.onclick=()=>act('train',{branch:button.dataset.train},'training-status'));
    $("training-reset").disabled=locked||Object.values(state.training).every(level=>level===0);
    $("training-status").textContent=migrationRequired?'请先在村中完成单档合并。':state.active_trial?'挑战中师门冻结。':dirty?'先保存或放弃八宫构筑草稿。':`可用修为 ${state.progress.spirit}。村中重置返还全部师门花费。`;
    $("shop-balance").textContent=`外观券 ${state.cosmetics.tickets} · 已装备 ${config.cosmetics[state.cosmetics.equipped].name}`;
    $("shop-items").innerHTML=Object.entries(config.cosmetics).map(([id,item])=>{
      const owned=state.cosmetics.owned.includes(id),equipped=state.cosmetics.equipped===id;
      return `<article class="shop-item" style="--sword:${item.color}"><div class="sword-preview">${swordIcon(item.color,id)}</div><h3>${item.name}</h3><p>剑身与剑光外观 · 不改变战斗数值</p><span class="shop-badge">${id==='plain'?'初始持有':owned?'已拥有':item.price+' 外观券'}</span><button class="pixel-button" data-cosmetic="${id}" data-action="${owned?'equip_cosmetic':'purchase'}" ${locked||equipped||(!owned&&state.cosmetics.tickets<item.price)?'disabled':''}>${equipped?'装备中':owned?'装备此剑':'购买此剑'}</button></article>`;
    }).join('');
    $("shop-items").querySelectorAll('[data-cosmetic]').forEach(button=>button.onclick=()=>act(button.dataset.action,{cosmetic:button.dataset.cosmetic},'shop-status'));
  }
  async function act(action,extra,statusId){
    try{const result=await root.DaoBladeJourneyUI.trialAction(action,extra);$(statusId).textContent=action==='train'?'研习成功。':action==='reset_training'?'师门已重置，修为已返还。':action==='purchase'?'购买成功，可立即装备。':'外观已装备。';return result;}
    catch(error){$(statusId).textContent=error.message;return null;}
  }
  $("training-reset").onclick=()=>act('reset_training',{},'training-status');
  $("home-unify").onclick=()=>void root.DaoBladeJourneyUI.previewUnify().catch(error=>{$("home-sync").textContent=error.message;});
  root.DaoBladeVillageProgress={update,swordIcon};
})(globalThis);
