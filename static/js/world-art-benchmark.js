"use strict";
// 开发检视专用，同场景对照；不读取或写入玩家存档。
(async function(){
  const $=id=>document.getElementById(id),ctx=$("view").getContext("2d");
  const assets=DaoBladeWorldAssets.shared;
  const begin=performance.now();await assets.load();
  const loadMs=performance.now()-begin;
  if(assets.status!=="ready"){$("status").textContent="资源失败，无法对照";return;}
  $("status").textContent="本地资源已就绪";$("run").disabled=false;
  const scene=new DaoBladeSceneArt.Renderer(assets),art=new DaoBladeEnemyArt.Renderer(assets);
  const palettes={fire:"#f39b60",wood:"#91be83",earth:"#d6b578",metal:"#bccbd4",water:"#8dcddd"};
  const measure=(values)=>({mean:values.reduce((a,b)=>a+b,0)/values.length,p95:[...values].sort((a,b)=>a-b)[Math.floor(values.length*.95)]});
  function sample(mode,realm){
    const timings=[],intervals=[],legacy=new LegacyWorldArt();
    Object.assign(legacy,{realmKey:realm,element:{color:palettes[realm]}});
    const enemies=Array.from({length:6},(_,i)=>({
      id:"bench"+i,kind:i===5?"boss":i===3?"ranged":i===1?"charger":"melee",
      variant:i===5?"boss":i===3?"caster":i===1?"charger":"swordsman",
      x:110+i*145,y:i===5?370:408,w:i===5?66:42,h:i===5?100:62,
      hp:64,maxHp:64,face:i%2?-1:1,attackDirection:i%2?-1:1,
      attackState:i%2?"windup":"idle",attackType:i===3?"fireball":i===1?"dash":"slash",attackTimer:.3,hurt:0
    }));
    let previous=0,frames=0;
    return new Promise(resolve=>{
      function frame(now){
        const start=performance.now(),t=frames/60;
        ctx.fillStyle="#1d2233";ctx.fillRect(0,0,960,540);
        if(mode==="PNG")scene.background(ctx,realm,240,960,540,t,"ridge");
        else legacy.drawBackground(ctx,240);
        ctx.save();ctx.translate(-240,0);
        const platforms=[{x:0,y:474,w:3200,h:66,collision:"floor"},{x:500,y:390,w:200,h:32,collision:"oneway"}];
        for(const p of platforms)if(mode==="PNG")scene.platform(ctx,realm,p,240,960);else legacy.drawPlatform(ctx,p);
        if(mode==="PNG"){art.sync(enemies,t);for(const e of enemies)art.draw(ctx,realm,art.states.get(e.id));}
        else for(const e of enemies)legacy.drawEnemy(ctx,e);
        ctx.restore();
        if(frames>=15){timings.push(performance.now()-start);intervals.push(now-previous);}
        previous=now;frames++;
        if(frames<135)requestAnimationFrame(frame);else resolve({mode,draw_ms:measure(timings),frame_interval_ms:measure(intervals),frames:120});
      }requestAnimationFrame(frame);
    });
  }
  $("run").onclick=async()=>{
    $("run").disabled=true;$("realm").disabled=true;
    const realm=$("realm").value;
    $("status").textContent="旧 Canvas：采样中…";
    const legacy=await sample("Canvas",realm);
    $("status").textContent="PNG：采样中…";
    const png=await sample("PNG",realm);
    $("results").textContent=JSON.stringify({realm,viewport:[innerWidth,innerHeight],canvas:[960,540],
      local_load_ms:loadMs,asset_failures:assets.failed.size,legacy,png},null,2);
    $("status").textContent="对照完成（浏览器环境，不是实体设备验收）";
    $("run").disabled=false;$("realm").disabled=false;
  };
})();
