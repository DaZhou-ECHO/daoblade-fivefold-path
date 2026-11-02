"use strict";
(function(root){
  const canvas=document.getElementById("village-canvas");
  const ctx=canvas.getContext("2d");
  const prompt=document.getElementById("village-prompt");
  const targets=[{x:173,panel:"atlas",label:"山河图传送台"},{x:480,panel:"journey",label:"师父"},{x:780,panel:"shop",label:"剑坊商人"}];
  const player={x:250,y:242,w:38,h:70,vx:0,vy:0,face:1,hp:1,onGround:true,animTime:0};
  const pressed=new Set();
  let snapshot=null,last=0,background=null;
  const image=new Image();
  image.onload=()=>{background=image;};
  image.onerror=()=>{background=null;};
  image.src="/static/sprites/world-v1/wood-far.png";
  const open=panel=>document.querySelector(`.nav-button[data-panel="${panel}"]`)?.click();
  function bindings(){
    try {const saved=JSON.parse(localStorage.getItem("daoblade-controls")||"null");return {left:saved?.left||"KeyA",right:saved?.right||"KeyD",interact:saved?.interact||"KeyF"};}
    catch(_){return {left:"KeyA",right:"KeyD",interact:"KeyF"};}
  }
  function active(){return document.getElementById("panel-sanctuary").classList.contains("active")&&!document.querySelector("dialog[open]");}
  function nearest(){return targets.reduce((best,item)=>Math.abs(item.x-player.x)<Math.abs(best.x-player.x)?item:best,targets[0]);}
  function interact(){if(!active())return;const target=nearest();if(Math.abs(target.x-player.x)<=90)open(target.panel);else prompt.textContent="靠近山河图、师父或商人后交互";}
  root.addEventListener("keydown",event=>{
    if(!active()||event.target.closest?.("input,textarea,select,[contenteditable=true]"))return;
    const keys=bindings();
    if(event.code===keys.interact){event.preventDefault();interact();return;}
    if(event.code===keys.left||event.code===keys.right){pressed.add(event.code);event.preventDefault();canvas.focus({preventScroll:true});}
  });
  root.addEventListener("keyup",event=>pressed.delete(event.code));
  root.addEventListener("blur",()=>pressed.clear());
  document.querySelectorAll("[data-village-move]").forEach(button=>{
    const name=button.dataset.villageMove;
    const end=event=>{pressed.delete(name);if(button.hasPointerCapture?.(event.pointerId))button.releasePointerCapture(event.pointerId);};
    button.addEventListener("pointerdown",event=>{pressed.add(name);button.setPointerCapture?.(event.pointerId);event.preventDefault();});
    for(const type of ["pointerup","pointercancel","lostpointercapture"])button.addEventListener(type,end);
  });
  document.getElementById("village-interact").onclick=interact;
  document.querySelectorAll("[data-village]").forEach(button=>button.onclick=()=>open(button.dataset.village));
  function polygon(points,fill,stroke){ctx.beginPath();ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
  function building(x,w,roof,wall,sign){
    ctx.fillStyle="rgba(5,16,23,.32)";ctx.fillRect(x-8,223,w+16,96);
    ctx.fillStyle=wall;ctx.fillRect(x,201,w,111);
    ctx.fillStyle="#233b3d";for(let i=x+13;i<x+w-8;i+=28){ctx.fillRect(i,220,15,34);ctx.fillStyle="#e8d59e";ctx.fillRect(i+4,226,7,18);ctx.fillStyle="#233b3d";}
    polygon([[x-17,200],[x+w/2,156],[x+w+17,200],[x+w+7,204],[x+w/2,173],[x-7,204]],roof,"#d2b775");
    ctx.fillStyle="#b99462";ctx.fillRect(x-3,203,w+6,7);ctx.fillStyle="#233431";ctx.fillRect(x+w/2-17,256,34,56);
    ctx.fillStyle="#ead8a6";ctx.font="bold 16px serif";ctx.textAlign="center";ctx.fillText(sign,x+w/2,192);
  }
  function scene(t){
    const sky=ctx.createLinearGradient(0,0,0,310);sky.addColorStop(0,"#b9d3c4");sky.addColorStop(.55,"#719c99");sky.addColorStop(1,"#344f52");ctx.fillStyle=sky;ctx.fillRect(0,0,960,370);
    if(background){ctx.globalAlpha=.44;ctx.drawImage(background,0,0,background.naturalWidth,background.naturalHeight,0,0,960,250);ctx.globalAlpha=1;}
    polygon([[0,212],[82,130],[160,211],[250,106],[365,212],[505,119],[655,210],[778,139],[960,215]],"rgba(40,76,75,.43)");
    polygon([[0,234],[120,182],[225,220],[358,167],[483,228],[612,177],[735,221],[864,173],[960,230]],"rgba(33,73,65,.68)");
    ctx.fillStyle="rgba(225,237,215,.3)";for(let i=0;i<4;i++)ctx.fillRect(0,219+i*9,960,4);
    ctx.fillStyle="#34584c";ctx.fillRect(0,272,960,98);ctx.fillStyle="#507461";ctx.fillRect(0,292,960,22);
    ctx.fillStyle="#a4a27a";ctx.fillRect(0,309,960,61);ctx.fillStyle="#c9bb86";for(let x=8;x<960;x+=52){ctx.fillRect(x,318+(x%3)*8,30,3);ctx.fillRect(x+19,349,23,2);}
    building(405,152,"#526b56","#69806a","修行");building(703,155,"#6e5e48","#8a7559","剑坊");
    // 传送台与刻有五行的山河图。
    ctx.fillStyle="#435b5d";ctx.fillRect(111,270,120,43);ctx.fillStyle="#c9b477";ctx.fillRect(124,264,94,8);
    ctx.fillStyle="#254950";ctx.fillRect(139,174,65,92);ctx.strokeStyle="#e8ca83";ctx.lineWidth=5;ctx.strokeRect(139,174,65,92);ctx.fillStyle="#78bfc4";ctx.fillRect(148,184,47,71);
    ctx.fillStyle="#e6d9af";ctx.font="bold 25px serif";ctx.fillText("五",171,215);ctx.fillText("境",171,245);
    // 草、悬灯与光点使村落有生命力，亮度不压过交互标记。
    for(let x=25;x<950;x+=43){ctx.fillStyle=x%2?"#557d61":"#72946a";ctx.fillRect(x,289,2,10);ctx.fillRect(x-3,295,8,2);}
    for(let i=0;i<11;i++){const x=(i*89+30)%930,y=102+Math.sin(t*.0005+i*2)*8+i%3*27;ctx.fillStyle="rgba(240,218,151,.65)";ctx.fillRect(x,y,3,3);}
    for(const point of [376,647,904]){ctx.fillStyle="#34453e";ctx.fillRect(point,244,6,56);ctx.fillStyle="#e7c583";ctx.fillRect(point-3,229,12,18);ctx.fillStyle="rgba(242,207,119,.17)";ctx.fillRect(point-11,225,28,30);}
    const selected=nearest();
    for(const target of targets){if(target===selected&&Math.abs(target.x-player.x)<=90){ctx.strokeStyle="#f5dd9d";ctx.lineWidth=3;ctx.strokeRect(target.x-32,160,64,144);}}
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
    if(active()){
      const keys=bindings(),direction=Number(pressed.has(keys.right)||pressed.has("right"))-Number(pressed.has(keys.left)||pressed.has("left"));
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
    root.requestAnimationFrame(frame);
  }
  root.DaoBladeVillage={update,nearest:()=>nearest().panel,interact};
  root.requestAnimationFrame(frame);
})(globalThis);
