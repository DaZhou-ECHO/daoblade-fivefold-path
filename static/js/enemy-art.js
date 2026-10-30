"use strict";
(function(root) {
  const assetAPI = root.DaoBladeWorldAssets || (typeof module !== "undefined" ? require("./world-art-assets.js") : null);
  const clamp = n => Math.max(0,Math.min(1,n));
  const family = e => e.kind === "boss" ? "boss" : e.kind === "ranged" ? "ranged"
    : ["charger","guard","crusher","stalker","skirmisher"].includes(e.variant) || e.kind === "charger" ? "special" : "guard";
  const motion = e => ["dash","thrust"].includes(e.attackType) ? "dash"
    : ["bolt","fireball","wave","vines","rock","ice"].includes(e.attackType) || e.kind === "ranged" || e.bossMove?.projectile ? "cast"
    : ["slam","cleave"].includes(e.attackType) ? "heavy" : "";
  // 只读快照：阶段进度来自真实 attackTimer，不另计攻击时钟。
  function visualState(e, elapsed, phaseDuration = 1, deathStart = elapsed, moving = false) {
    const phase = ["windup","strike","recover"].includes(e.attackState) ? e.attackState : "idle";
    const progress = clamp(1-Math.max(0,e.attackTimer||0)/Math.max(.001,phaseDuration));
    const prefix = motion(e);
    let action = e.dead ? "death" : phase !== "idle"
      ? (prefix ? prefix+"_" : "")+phase : e.hurt > 0 ? "hurt" : moving || Math.abs(e.vx||0)>4 ? "walk" : "idle";
    return Object.freeze({
      id:e.id, family:family(e), x:e.x, y:e.y, w:e.w, h:e.h,
      face:phase === "idle" ? e.face : e.attackDirection ?? e.face,
      action, phase, progress:e.dead ? clamp((elapsed-deathStart)/.65) : progress,
      elapsed, dead:Boolean(e.dead), hurt:e.hurt>0,
      hp:e.hp, maxHp:e.maxHp, attackType:e.attackType||""
    });
  }
  function frameIndex(animation, state) {
    if (state.action === "idle" || state.action === "walk") return Math.floor(state.elapsed*animation.fps)%animation.count;
    return Math.min(animation.count-1,Math.floor(state.progress*animation.count));
  }
  class Renderer {
    constructor(assets=assetAPI?.shared || null) { this.assets=assets; this.observed=new Map(); this.states=new Map(); }
    sync(enemies, elapsed) {
      const live = new Set();
      for (const e of enemies) {
        live.add(e.id);
        let old=this.observed.get(e.id);
        if (!old) old={phase:null,type:null,timer:0,x:e.x,deathStart:elapsed,dead:false,moving:false,time:elapsed};
        const changed=old.phase!==e.attackState || old.type!==e.attackType || (e.attackTimer||0)>old.remaining+.001;
        const duration=changed ? Math.max(.001,e.attackTimer||0) : old.timer;
        const deathStart=e.dead&&!old.dead ? elapsed : old.deathStart;
        const moving=elapsed===old.time ? old.moving : Math.abs(e.x-old.x)>.05;
        let state=visualState(e,elapsed,duration,deathStart,moving);
        // 旧普通怪没有独立 strike 状态：伤害发生在 windup -> recover。
        // 用同一个 recover 剩余计时器展示瞬时命中姿态，再回落；不增加有效段。
        const legacyImpact=e.attackState==="recover" && (old.phase==="windup" || old.legacyImpact);
        if(legacyImpact&&!e.dead) {
          const impact=state.progress<.45;
          state=Object.freeze({...state,action:(motion(e)?motion(e)+"_":"")+(impact?"strike":"recover"),
            progress:impact?state.progress/.45:(state.progress-.45)/.55});
        }
        this.states.set(e.id,state);
        this.observed.set(e.id,{phase:e.attackState,type:e.attackType,timer:duration,remaining:e.attackTimer||0,
          x:e.x,dead:Boolean(e.dead),deathStart,moving,time:elapsed,legacyImpact});
      }
      for (const id of this.observed.keys()) if (!live.has(id)) { this.observed.delete(id); this.states.delete(id); }
    }
    clear() { this.observed.clear(); this.states.clear(); }
    draw(ctx, realm, state, options={}) {
      if (!state || this.assets?.status!=="ready") return false;
      const f=this.assets.manifest.families[realm+"-"+state.family];
      if (!f) return false;
      const image=this.assets.get(f.src);
      const animation=f.animations[state.action]||f.animations[state.phase]||f.animations.idle;
      if (!image || !animation) return false;
      if (state.dead && state.progress>=1) return true;
      ctx.save();
      try {
        const [w,h]=f.frameSize, scale=options.scale || state.h/f.bodyHeight;
        const x=Math.round(state.x+state.w/2), y=Math.round(state.y+state.h);
        ctx.imageSmoothingEnabled=false;
        ctx.translate(x,y); ctx.scale(state.face<0?-1:1,1);
        const dw=Math.round(w*scale), dh=Math.round(h*scale);
        const fx=Math.round(f.foot[0]*scale), fy=Math.round(f.foot[1]*scale);
        if (state.dead) ctx.globalAlpha=1-state.progress*.65;
        if (state.hurt) ctx.filter="brightness(1.7)";
        ctx.drawImage(image,frameIndex(animation,state)*w,animation.row*h,w,h,-fx,-fy,dw,dh);
        ctx.filter="none";
        if (state.phase==="windup"&&!state.dead) {
          // 形状提示与真实朝向一致；不宣称该标记就是攻击范围。
          ctx.fillStyle="#ffe7a5";
          ctx.fillRect(Math.round(state.w/2)+5,-Math.round(state.h*.72),4,12);
          ctx.fillRect(Math.round(state.w/2)+5,-Math.round(state.h*.72)+15,4,3);
        }
        if (options.anchor) { ctx.fillStyle="#ff76d6"; ctx.fillRect(-2,-2,4,4); }
      } catch (_) { this.assets.reject(f.src); return false; }
      finally { ctx.restore(); }
      if (!state.dead && options.health!==false) {
        ctx.fillStyle="#0b101b"; ctx.fillRect(Math.round(state.x),Math.round(state.y)-12,state.w,5);
        ctx.fillStyle=this.assets.manifest.realms[realm].accent;
        ctx.fillRect(Math.round(state.x),Math.round(state.y)-12,Math.round(state.w*clamp(state.hp/Math.max(1,state.maxHp))),5);
      }
      if (options.box) { ctx.strokeStyle="#83e4c2";ctx.strokeRect(state.x,state.y,state.w,state.h); }
      return true;
    }
  }
  const api={Renderer,visualState,frameIndex,family,motion};
  root.DaoBladeEnemyArt=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(globalThis);
