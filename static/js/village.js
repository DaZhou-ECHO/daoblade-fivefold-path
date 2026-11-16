"use strict";
(function(root){
  const canvas=document.getElementById("village-canvas");
  const stage=document.querySelector(".village-stage");
  const world=document.getElementById("village-world");
  const ctx=canvas.getContext("2d");
  const prompt=document.getElementById("village-prompt");
  const dialogue=document.getElementById("village-dialogue");
  const targets=[
    {x:173,panel:"atlas",label:"山河图传送台",speaker:"山河图",line:"五境皆可前往。想从哪条路开始？",choices:[["查看十境","atlas"]]},
    {x:360,panel:"quests",label:"悬赏栏",speaker:"村中告示",line:"井水断流，药队未归。这里记着村民的托付与山路悬赏。",choices:[["查看山河调查","quests","main"],["接取悬赏","quests","bounty"]]},
    {x:590,panel:"journey",label:"师父",speaker:"师父",line:"剑法须护得住眼前的人。旧镇脉的事，待你带回五地记录再谈。",choices:[["修习师门","journey","training"],["筑基心劫","journey","breakthrough"],["复核调查记录","quests","main"]]},
    {x:725,panel:"sword",label:"本命剑台",speaker:"剑台",line:"剑心连八方，先看连通，再定出战。",choices:[["照见八宫","journey","board"]]},
    {x:850,panel:"shop",label:"剑坊商人",speaker:"商人",line:"故道断了，货物迟迟不来。若你路过镇岳，也请看看那边的驿院。",choices:[["浏览剑坊","shop"]]}
  ];
  const player={x:250,y:412,w:38,h:70,vx:0,vy:0,face:1,hp:1,onGround:true,animTime:0};
  const pressed=new Set();
  let snapshot=null,last=0,background=null;
  const image=new Image();
  image.onload=()=>{background=image;};
  image.onerror=()=>{background=null;};
  image.src="/static/sprites/world-v1/wood-far.png";
  const open=(panel,focusId)=>{closeDialogue(false);if(panel==='quests'){root.DaoBladeShanhe.open(focusId);return;}document.querySelector(`.nav-button[data-panel="${panel}"]`)?.click();if(panel==='journey'&&focusId)root.DaoBladeBagua?.openTab(focusId);root.DaoBladeShanhe?.visit(panel==='shop'?'merchant':focusId==='board'?'sword':'mentor');};
  function closeDialogue(restore=true){dialogue.hidden=true;if(restore)canvas.focus({preventScroll:true});}
  function converse(target){
    if(!active())return;
    pressed.clear();dialogue.hidden=false;
    document.getElementById("village-speaker").textContent=target.speaker;
    document.getElementById("village-line").textContent=target.line;
    const choices=document.getElementById("village-choices");choices.textContent="";
    for(const [label,panel,focusId] of target.choices){const button=document.createElement("button");button.type="button";button.textContent=label;button.onclick=()=>open(panel,focusId);choices.appendChild(button);}
    choices.querySelector("button")?.focus?.({preventScroll:true});
  }
  function bindings(){
    try {const saved=JSON.parse(localStorage.getItem("daoblade-controls")||"null");return {left:saved?.left||"KeyA",right:saved?.right||"KeyD",interact:saved?.interact||"KeyF"};}
    catch(_){return {left:"KeyA",right:"KeyD",interact:"KeyF"};}
  }
  function inVillage(){return document.getElementById("panel-sanctuary").classList.contains("active")&&!document.body?.classList?.contains("entry-locked")&&!document.body?.classList?.contains("village-window-open")&&!document.querySelector("dialog[open]");}
  function active(){return inVillage()&&dialogue.hidden;}
  function nearest(){return targets.reduce((best,item)=>Math.abs(item.x-player.x)<Math.abs(best.x-player.x)?item:best,targets[0]);}
  function interact(){if(document.querySelector("dialog[open]"))return;if(!dialogue.hidden){document.getElementById("village-choices").querySelector("button")?.click();return;}if(!active())return;const target=nearest();if(Math.abs(target.x-player.x)<=90)converse(target);else prompt.textContent="靠近山河图、师父或商人后交互";}
  root.addEventListener("keydown",event=>{
    if(document.querySelector("dialog[open]"))return;
    if(!dialogue.hidden){if(event.code==="Escape"){event.preventDefault();closeDialogue();}else if(event.code===bindings().interact){event.preventDefault();interact();}return;}
    if(!active()||event.target.closest?.("input,textarea,select,[contenteditable=true]"))return;
    const keys=bindings();
    if(event.code===keys.interact){event.preventDefault();interact();return;}
    if(event.code===keys.left||event.code===keys.right){pressed.add(event.code);event.preventDefault();canvas.focus({preventScroll:true});}
  });
  root.addEventListener("keyup",event=>pressed.delete(event.code));
  root.addEventListener("blur",()=>pressed.clear());
  document.getElementById("village-dialogue-close").onclick=()=>closeDialogue();
  document.querySelectorAll("[data-village-move]").forEach(button=>{
    const name=button.dataset.villageMove;
    const end=event=>{pressed.delete(name);if(button.hasPointerCapture?.(event.pointerId))button.releasePointerCapture(event.pointerId);};
    button.addEventListener("pointerdown",event=>{pressed.add(name);button.setPointerCapture?.(event.pointerId);event.preventDefault();});
    for(const type of ["pointerup","pointercancel","lostpointercapture"])button.addEventListener(type,end);
  });
  document.getElementById("village-interact").onclick=interact;
  document.querySelectorAll("[data-village]").forEach(button=>button.onclick=()=>converse(targets.find(target=>target.panel===button.dataset.village)));
  for(const [panel,x,label] of [['quests',37.5,'悬赏栏'],['sword',75.5,'本命剑台']]){const b=document.createElement('button');b.type='button';b.className='village-hotspot';b.dataset.village=panel;b.style.setProperty('--target-x',x+'%');b.setAttribute('aria-label','与'+label+'交互');b.onclick=()=>converse(targets.find(t=>t.panel===panel));world.append(b);}
  document.querySelector('[data-village=journey]').style.setProperty('--target-x','61.5%');
  document.querySelector('[data-village=shop]').style.setProperty('--target-x','88.5%');
  function camera(){
    const width=stage?.clientWidth||960,height=stage?.clientHeight||540;
    const worldWidth=Math.max(width,height*960/540);
    if(world){world.style.width=`${worldWidth}px`;world.style.transform=`translateX(${-Math.max(0,Math.min(worldWidth-width,player.x/960*worldWidth-width/2))}px)`;}
  }
  root.addEventListener("resize",camera);
  function polygon(points,fill,stroke){ctx.beginPath();ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
  function building(x,w,roof,wall,sign){
    ctx.fillStyle="#173238";ctx.fillRect(x-8,213,w+16,102);
    ctx.fillStyle=wall;ctx.fillRect(x,207,w,105);
    ctx.fillStyle="#294448";for(let i=x+10;i<x+w-5;i+=24){ctx.fillRect(i,222,15,38);ctx.fillStyle="#d9c28a";ctx.fillRect(i+4,229,7,20);ctx.fillStyle="#294448";}
    for(let row=0;row<7;row++){const inset=Math.abs(6-row)*12;ctx.fillStyle=row%2?roof:"#263f42";ctx.fillRect(x-24+inset,156+row*8,w+48-inset*2,8);}
    ctx.fillStyle="#b39863";ctx.fillRect(x-14,207,w+28,6);ctx.fillRect(x+5,213,7,96);ctx.fillRect(x+w-12,213,7,96);
    ctx.fillStyle="#172d31";ctx.fillRect(x+w/2-19,259,38,53);ctx.fillStyle="#d2b06b";ctx.fillRect(x+w/2-3,270,6,7);
    ctx.fillStyle="#172d31";ctx.fillRect(x+w/2-27,183,54,25);ctx.strokeStyle="#d5b875";ctx.lineWidth=3;ctx.strokeRect(x+w/2-27,183,54,25);
    ctx.fillStyle="#f5dfab";ctx.font="bold 16px serif";ctx.textAlign="center";ctx.fillText(sign,x+w/2,201);
  }
  function scene(t){
    ctx.imageSmoothingEnabled=false;
    const sky=ctx.createLinearGradient(0,0,0,540);sky.addColorStop(0,"#738e8c");sky.addColorStop(.65,"#567777");sky.addColorStop(1,"#193a3b");ctx.fillStyle=sky;ctx.fillRect(0,0,960,540);
    if(background){ctx.globalAlpha=.09;ctx.drawImage(background,0,0,background.naturalWidth,background.naturalHeight,0,0,960,420);ctx.globalAlpha=1;}
    ctx.save();ctx.translate(0,170);
    polygon([[0,212],[82,130],[160,211],[250,106],[365,212],[505,119],[655,210],[778,139],[960,215]],"rgba(40,76,75,.43)");
    polygon([[0,234],[120,182],[225,220],[358,167],[483,228],[612,177],[735,221],[864,173],[960,230]],"rgba(33,73,65,.68)");
    ctx.fillStyle="rgba(225,237,215,.2)";for(let i=0;i<4;i++)ctx.fillRect(0,219+i*9,960,4);
    ctx.fillStyle="#284b45";ctx.fillRect(0,272,960,98);ctx.fillStyle="#426552";ctx.fillRect(0,292,960,22);
    ctx.fillStyle="#766e54";ctx.fillRect(0,309,960,61);ctx.fillStyle="#a69668";for(let x=8;x<960;x+=52){ctx.fillRect(x,318+(x%3)*8,30,3);ctx.fillRect(x+19,349,23,2);}
    ctx.fillStyle="#3b5c4e";for(let x=0;x<960;x+=67){ctx.fillRect(x,300+(x%3)*3,18,7);ctx.fillRect(x+4,293,5,9);}
    building(515,145,"#526b56","#69806a","师门");building(780,150,"#6e5e48","#8a7559","剑坊");
    for(const [x,robe,trim] of [[590,"#e3e6d2","#4e9d91"],[850,"#e9c37f","#725139"]]){
      ctx.save();ctx.translate(0,Math.sin(t*.002+x)*1.5);
      ctx.fillStyle="rgba(7,20,23,.5)";ctx.fillRect(x-22,307,44,5);
      ctx.fillStyle="#1d343b";ctx.fillRect(x-13,232,26,22);
      ctx.fillStyle="#eccbaa";ctx.fillRect(x-9,239,18,17);
      polygon([[x-13,255],[x+13,255],[x+19,303],[x-19,303]],robe,"#183034");
      ctx.fillStyle=trim;ctx.fillRect(x-3,256,6,43);ctx.fillRect(x-19,278,38,5);
      ctx.fillStyle="#263b3b";ctx.fillRect(x-13,303,9,10);ctx.fillRect(x+4,303,9,10);
      ctx.fillStyle="#e2c6a3";ctx.fillRect(x-20,261,5,23);ctx.fillRect(x+15,261,5,23);
      ctx.restore();
    }
    // 传送台与刻有五行的山河图。
    ctx.fillStyle="#273e40";ctx.fillRect(111,270,120,43);ctx.fillStyle="#c9b477";ctx.fillRect(124,264,94,8);
    ctx.fillStyle="#183f44";ctx.fillRect(137,164,70,102);ctx.fillStyle="#c7ab6e";ctx.fillRect(133,160,78,7);ctx.fillRect(133,260,78,7);ctx.fillRect(136,167,7,94);ctx.fillRect(201,167,7,94);
    ctx.fillStyle="#488d92";ctx.fillRect(146,177,53,75);ctx.fillStyle="#b4cfc0";ctx.fillRect(151,182,43,65);ctx.fillStyle="#1e555d";ctx.fillRect(156,187,33,55);
    ctx.fillStyle="#f6df9e";ctx.font="bold 25px serif";ctx.fillText("五",172,213);ctx.fillText("境",172,242);
    ctx.fillStyle="#e1c681";for(let i=0;i<4;i++){const pulse=Math.sin(t*.002+i)*4;ctx.fillRect(122+i*34,153+pulse,4,4);}
    // 民生区：可交互告示栏、井台；修行区的独立剑台。
    ctx.fillStyle='#423e32';ctx.fillRect(322,227,8,84);ctx.fillRect(393,227,8,84);ctx.fillRect(316,220,91,53);
    ctx.fillStyle='#b99b65';ctx.fillRect(322,226,79,40);ctx.fillStyle='#eee0b0';ctx.fillRect(329,231,25,28);ctx.fillRect(363,230,30,27);
    ctx.fillStyle='#604f39';ctx.font='bold 15px serif';ctx.fillText('悬赏',361,214);
    ctx.fillStyle='#4b6760';ctx.fillRect(425,291,57,22);ctx.fillStyle=snapshot?.state.story?.completed?'#68c4c3':'#243b42';ctx.fillRect(434,287,39,14);
    if(snapshot?.state.story?.completed){ctx.fillStyle='#67b4b4';ctx.fillRect(451,309,7,26);ctx.fillRect(453,332,46,4);}
    ctx.fillStyle='#42595b';ctx.fillRect(699,291,53,22);ctx.fillStyle='#b7b27f';ctx.fillRect(694,286,63,7);
    ctx.fillStyle='#a8d3ce';ctx.fillRect(723,217,5,66);ctx.fillStyle='#dbb479';ctx.fillRect(711,265,29,5);
    ctx.strokeStyle='#7aa39b';ctx.strokeRect(706,239,38,43);ctx.fillStyle='#e6d097';ctx.fillText('剑台',726,205);
    if(snapshot?.state.story?.commissions?.includes('merchant')){ctx.fillStyle='#9b7750';ctx.fillRect(904,284,22,25);ctx.fillRect(929,293,19,16);}
    if(snapshot?.state.story?.read_clues?.includes('wood')){ctx.fillStyle='#749b71';ctx.fillRect(494,270,7,40);ctx.fillRect(482,280,31,7);}
    if(snapshot?.state.story?.completed){ctx.fillStyle='#f1cf7a';for(const x of [300,500,675])ctx.fillRect(x,242,6,10);}
    // 草、悬灯与光点使村落有生命力，亮度不压过交互标记。
    for(let x=25;x<950;x+=43){ctx.fillStyle=x%2?"#557d61":"#72946a";ctx.fillRect(x,289,2,10);ctx.fillRect(x-3,295,8,2);}
    for(let i=0;i<11;i++){const x=(i*89+30)%930,y=102+Math.sin(t*.0005+i*2)*8+i%3*27;ctx.fillStyle="rgba(240,218,151,.65)";ctx.fillRect(x,y,3,3);}
    for(const point of [376,647,904]){ctx.fillStyle="#34453e";ctx.fillRect(point,244,6,56);ctx.fillStyle="#e7c583";ctx.fillRect(point-3,229,12,18);ctx.fillStyle="rgba(242,207,119,.17)";ctx.fillRect(point-11,225,28,30);}
    const selected=nearest();
    for(const target of targets){if(target===selected&&Math.abs(target.x-player.x)<=90&&dialogue.hidden){ctx.strokeStyle="#f5dd9d";ctx.lineWidth=3;ctx.strokeRect(target.x-32,154,64,154);}}
    ctx.restore();
  }
  function fallbackSword(color){
    ctx.fillStyle="#111c29";ctx.fillRect(player.x+13,player.y,21,10);
    ctx.fillStyle="#eacba8";ctx.fillRect(player.x+12,player.y+8,23,20);
    ctx.fillStyle="#d3e4c5";ctx.fillRect(player.x+9,player.y+28,28,28);
    ctx.fillStyle="#224b51";ctx.fillRect(player.x+7,player.y+54,12,15);ctx.fillRect(player.x+26,player.y+54,12,15);
    ctx.fillStyle="#c34843";ctx.fillRect(player.x,player.y+31,12,5);
    ctx.strokeStyle=color;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(player.x+34,player.y+43);ctx.lineTo(player.x+56,player.y+5);ctx.stroke();
  }
  function update(data){snapshot=data;}
  function frame(now){
    const dt=Math.min(.05,(now-last)/1000||0);last=now;
    if(inVillage()){
      const keys=bindings(),direction=dialogue.hidden?Number(pressed.has(keys.right)||pressed.has("right"))-Number(pressed.has(keys.left)||pressed.has("left")):0;
      player.vx=direction*175;player.x=Math.max(25,Math.min(915,player.x+player.vx*dt));if(direction)player.face=direction;player.animTime+=dt;
      scene(now);
      const art=root.DaoBladeCharacterArt?.renderer;
      if(art){void art.load();}
      const skin=snapshot?.state?.cosmetics?.equipped||"plain";
      if(!art?.draw(ctx,player,"#b6dbe6",skin))fallbackSword(root.DaoBladeCosmetics?.[skin]?.color||"#b6dbe6");
      const target=nearest(),near=Math.abs(target.x-player.x)<=90;
      prompt.textContent=near?`${bindings().interact.replace(/^Key/,"")} · 与${target.label}交互`:"A / D 行走 · 靠近目标按 F";
      document.querySelectorAll("[data-village]").forEach(button=>button.classList.toggle("near",near&&button.dataset.village===target.panel));
    }
    camera();
    root.requestAnimationFrame(frame);
  }
  root.DaoBladeVillage={update,nearest:()=>nearest().panel,interact,closeDialogue,clearInput:()=>pressed.clear()};
  root.requestAnimationFrame(frame);
})(globalThis);
