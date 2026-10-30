"use strict";
(async function() {
  const $=id=>document.getElementById(id), canvas=$("preview"),ctx=canvas.getContext("2d");
  const assets=DaoBladeWorldAssets.shared, enemies=new DaoBladeEnemyArt.Renderer(assets), scene=new DaoBladeSceneArt.Renderer(assets);
  const labels={idle:"待机",walk:"移动",windup:"前摇",strike:"攻击",recover:"收招",hurt:"受击",death:"死亡",
    dash_windup:"突进蓄势",dash_strike:"突进",dash_recover:"突进收招",
    cast_windup:"施法前摇",cast_strike:"施法",cast_recover:"施法收招",
    heavy_windup:"重击前摇",heavy_strike:"重击",heavy_recover:"重击收招"};
  let paused=false,time=0,last=0,manualFrame=0;
  const ready=await assets.load();
  const baseSources=new Set(Object.values(assets.manifest?.realms||{}).flatMap(s=>[s.far,s.mid]));
  const expected=40+[...new Set(Object.values(assets.manifest?.maps||{}).flatMap(s=>[s.far,s.mid]))].filter(src=>!baseSources.has(src)).length;
  $("art-status").textContent=ready ? "本地资源 "+assets.images.size+"/"+expected+" · 异常 "+assets.failed.size : "资源清单加载失败：游戏将使用 Canvas 后备模型。";
  const sceneNames={fire:["赤霞炉台","炉后石廊"],wood:["云杉根桥","古木洞府"],earth:["叠岩山门","地脉遗院"],metal:["云上剑冢","矿脉剑廊"],water:["寒潭天桥","水下石廊"]};
  for(const [realm,names] of Object.entries(sceneNames))for(const [index,route] of ["ridge","hollow"].entries()){
    const spec=assets.manifest?.maps?.[realm+":"+route],card=document.createElement("article"),title=document.createElement("h3"),note=document.createElement("p"),sample=document.createElement("canvas");
    card.className="map-card";title.textContent=names[index];note.textContent=realm+" · "+route;sample.width=768;sample.height=240;
    const view=sample.getContext("2d"),far=spec&&assets.get(spec.far),mid=spec&&assets.get(spec.mid);
    if(far&&mid){view.imageSmoothingEnabled=false;view.drawImage(far,0,0);view.drawImage(mid,0,144);}
    else{note.textContent+=" · 资源缺失，游戏将回退至五行场景";}
    card.append(title,note,sample);$("map-grid").append(card);
  }
  const family=()=>assets.manifest?.families[$("realm").value+"-"+$("family").value];
  function refresh() {
    const old=$("action").value;
    $("action").replaceChildren(...Object.keys(family()?.animations||labels).map(key=>{
      const o=document.createElement("option");o.value=key;o.textContent=labels[key]||key;return o;
    }));
    $("action").value=old in (family()?.animations||{}) ? old : "idle";
    manualFrame=0;updateRange();
  }
  function updateRange() { const a=family()?.animations[$("action").value];$("frame").max=(a?.count||1)-1;manualFrame=0;$("frame").value=0; }
  $("realm").onchange=refresh;$("family").onchange=refresh;$("action").onchange=updateRange;
  $("pause").onclick=()=>{paused=!paused;$("pause").textContent=paused?"播放":"暂停";};
  $("step").onclick=()=>{paused=true;$("pause").textContent="播放";manualFrame=(manualFrame+1)%((family()?.animations[$("action").value]?.count)||1);$("frame").value=manualFrame;};
  $("frame").oninput=()=>{paused=true;$("pause").textContent="播放";manualFrame=Number($("frame").value);};
  refresh();
  function draw(now) {
    const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;if(!paused)time+=dt;
    const realm=$("realm").value,kind=$("family").value,action=$("action").value,f=family(),animation=f?.animations[action];
    const frame=paused?manualFrame:Math.floor(time*(animation?.fps||7))%(animation?.count||1);
    $("frame").value=frame;
    ctx.fillStyle={fire:"#281720",wood:"#102a24",earth:"#2e2922",metal:"#1d2938",water:"#112c46"}[realm];ctx.fillRect(0,0,960,540);
    scene.background(ctx,realm,Number($("map-camera").value),960,540,time,`journey-v1:${realm}:${$("layout").value}:v2`);
    if($("light").value!=="0"){ctx.fillStyle=$("light").value==="1"?"rgba(227,215,188,.15)":"rgba(0,0,8,.3)";ctx.fillRect(0,0,960,540);}
    scene.platform(ctx,realm,{x:0,y:470,w:960,h:70,collision:"floor"});
    scene.platform(ctx,realm,{x:24,y:280,w:128,h:32,collision:"oneway"});
    ["swordstone","altar","shortcut","exit"].forEach((type,i)=>scene.prop(ctx,realm,type,48+i*75,470,i%2===0));
    const h=kind==="boss"?100:62,w=kind==="boss"?66:kind==="special"?48:42;
    const progress=(frame+.1)/(animation?.count||1);
    const state={family:kind,x:354,y:470-h,w,h,face:Number($("face").value),action,
      phase:action.split("_").at(-1),progress,elapsed:paused?frame/(animation?.fps||7):(Math.floor(time*(animation?.fps||7)))/(animation?.fps||7),
      dead:action==="death",hurt:action==="hurt",hp:80,maxHp:100};
    const options={anchor:$("boxes").checked,box:$("boxes").checked,health:false};
    if(!enemies.draw(ctx,realm,state,options)){ctx.strokeStyle="#ddd";ctx.strokeRect(state.x,state.y,w,h);}
    enemies.draw(ctx,realm,{...state,x:680,y:470-h*3,w:w*3,h:h*3},options);
    // 逐帧条展示所有原始 PNG 帧，不只是精灵表缩略图。
    if(f&&animation&&assets.get(f.src)) {
      const [fw,fh]=f.frameSize;
      for(let i=0;i<animation.count;i++){
        ctx.strokeStyle=i===frame?"#f4d38c":"#596474";ctx.strokeRect(315+i*145,8,140,108);
        const scale=Math.min(100/fh,130/fw);
        ctx.drawImage(assets.get(f.src),i*fw,animation.row*fh,fw,fh,Math.round(320+i*145+(130-fw*scale)/2),12,Math.round(fw*scale),Math.round(fh*scale));
      }
    }
    $("caption").textContent=(f?.name||"后备模型")+" · "+labels[action]+" · 第 "+(frame+1)+"/"+(animation?.count||1)+" 帧 · 仅展示，无伤害判定";
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
