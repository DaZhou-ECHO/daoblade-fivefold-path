"use strict";
(function(root) {
  const assetAPI=root.DaoBladeWorldAssets||(typeof module!=="undefined"?require("./world-art-assets.js"):null);
  class Renderer {
    constructor(assets=assetAPI?.shared || null) { this.assets=assets; }
    theme(realm) { return this.assets?.status==="ready" ? this.assets.manifest.realms[realm] : null; }
    routeScene(realm,mapId) {
      if(this.assets?.status!=="ready")return null;
      const id=String(mapId),match=id.match(/^journey-v1:[a-z]+:(ridge|hollow)(?::v2)?$/);
      const route=match?.[1]||(["ridge","hollow"].includes(id)?id:null);
      return route?this.assets.manifest.maps?.[realm+":"+route]||null:null;
    }
    background(ctx,realm,camera,width,height,elapsed=0,mapId="",worldWidth=3200) {
      const fallback=this.theme(realm),mapped=this.routeScene(realm,mapId);
      const selected=mapped&&this.assets.get(mapped.far)&&this.assets.get(mapped.mid)?mapped:fallback;
      if(!selected)return false;
      if(this.drawBackground(ctx,selected,realm,camera,width,height,elapsed,Boolean(mapped&&selected===mapped),worldWidth))return true;
      return selected!==fallback&&fallback
        ?this.drawBackground(ctx,fallback,realm,camera,width,height,elapsed,false,worldWidth):false;
    }
    drawBackground(ctx,t,realm,camera,width,height,elapsed,journey,worldWidth) {
      const image=this.assets.get(t.far),mid=this.assets.get(t.mid);
      if(!image||!mid)return false;
      ctx.save();
      try {
        ctx.imageSmoothingEnabled=false;
        if(journey){
          // 全图横向展开：入口先见远处目标，接近首领时建筑在视野中放大。
          ctx.globalAlpha=.62;ctx.drawImage(image,Math.round(-camera*.78),140,worldWidth,288);
          ctx.globalAlpha=.27;ctx.drawImage(mid,Math.round(-camera),298,worldWidth,192);
        }else{
          // 旧局保持原五境重复视差，以兼容既有地图视觉。
          for(let i=-1;i<3;i++) {
            const x=Math.round(i*1536-((camera*.12)%1536));
            ctx.globalAlpha=.62;ctx.drawImage(image,x,140,1536,288);
          }
          for(let i=-1;i<3;i++) {
            const x=Math.round(i*1536-((camera*.28)%1536));
            ctx.globalAlpha=.27;ctx.drawImage(mid,x,298,1536,192);
          }
        }
        ctx.globalAlpha=.42;ctx.fillStyle="#101622";ctx.fillRect(0,400,width,height-400);
        // 有界、确定性的环境点缀：不消耗游戏随机数，不使用墙钟。
        ctx.globalAlpha=.35;ctx.fillStyle=t.accent||this.theme(realm)?.accent||"#c7c7c7";
        for(let i=0;i<14;i++) {
          const x=Math.round(((i*137-camera*.35+elapsed*(realm==="water"?-9:6))%(width+30)+width+30)%(width+30));
          const y=Math.round(180+(i*41)%220+Math.sin(elapsed*.7+i)*8);
          ctx.fillRect(x,y,realm==="wood"?3:2,realm==="water"?2:3);
        }
      } catch(_) {this.assets.reject(t.far);return false;} finally {ctx.restore();}
      return true;
    }
    platform(ctx,realm,p,camera=0,width=960) {
      const t=this.theme(realm), image=t&&this.assets.get(t.tiles);
      if(!image)return false;
      ctx.save();
      try {
        ctx.imageSmoothingEnabled=false;
        const start=Math.max(0,Math.floor((camera-p.x)/32)*32);
        const end=Math.min(p.w,camera+width-p.x+32);
        // 只绘制可见列；碰撞尺寸完全取原数据。
        ctx.beginPath();ctx.rect(p.x,p.y,p.w,p.h);ctx.clip();
        const one=p.collision==="oneway" || (!p.collision&&p.h<40);
        for(let x=start;x<end;x+=32) {
          ctx.drawImage(image,one?32:0,0,32,32,Math.round(p.x+x),Math.round(p.y),32,32);
          if(!one)for(let y=32;y<p.h;y+=32)
            ctx.drawImage(image,64,0,32,32,Math.round(p.x+x),Math.round(p.y+y),32,32);
        }
      } catch(_) {this.assets.reject(t.tiles);return false;} finally {ctx.restore();}
      return true;
    }
    prop(ctx,realm,kind,x,foot,active=false) {
      const t=this.theme(realm), image=t&&this.assets.get(t.props);
      const index={swordstone:0,altar:1,shortcut:2,exit:3}[kind];
      if(!image||index===undefined)return false;
      ctx.save();
      try {
        ctx.imageSmoothingEnabled=false;
        if(active)ctx.filter="brightness(1.25)";
        ctx.drawImage(image,index*64,0,64,96,Math.round(x)-32,Math.round(foot)-90,64,96);
      }catch(_){this.assets.reject(t.props);return false;}finally{ctx.restore();}
      return true;
    }
  }
  root.DaoBladeSceneArt={Renderer};
  if(typeof module!=="undefined"&&module.exports)module.exports={Renderer};
})(globalThis);
