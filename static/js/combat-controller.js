"use strict";
// Pure policy/physics helpers. The entity remains the only owner of timers.
(function(root){
  const freeze=v=>{if(v&&typeof v==="object"){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
  const config=freeze({version:2, jumpSpeed:500, gravity:1250, jumpCut:220,
    groundAccel:11, airAccel:8, friction:.001, jumpBuffer:.14,coyote:.11,
    guardCost:12,heavyCost:20,guardBreak:.45,regenDelay:.3,
    slash:[{duration:.28,cooldown:.32,range:82},{duration:.28,cooldown:.32,range:82},{duration:.36,cooldown:.47,range:104}],
    windup:.18,activeEnd:.78});
  function phase(p){const n=1-p.slash/(p.slashDuration||.28);return p.slash<=0?"none":n<=config.windup?"windup":n<config.activeEnd?"active":"recovery";}
  function permit(p,action){
    if(p.hp<=0)return {status:"rejected",reason:"dead"};
    if(p.hurt>0||p.guardBreak>0)return {status:"buffered",reason:"hurt"};
    if(p.dash>0||p.qiCast>0)return {status:"buffered",reason:"committed"};
    if(p.slash>0 && !(["block","dash"].includes(action)&&p.combo!==3&&phase(p)==="recovery"))
      return {status:"buffered",reason:"slash_"+phase(p)};
    if(action==="slash"&&p.slashCooldown>0)return {status:"buffered",reason:"cooldown"};
    if(action==="dash"&&p.dashCooldown>0)return {status:"buffered",reason:"cooldown"};
    if(action==="qi"&&p.qi<20)return {status:"rejected",reason:"resource"};
    if(action==="qi"&&p.qiCooldown>0)return {status:"buffered",reason:"cooldown"};
    return {status:"accepted",reason:"ready"};
  }
  const order=["dash","block","dao2","dao","qi","slash"];
  function enqueue(g,action){
    if(["down","left","right"].includes(action))return;
    if(action==="jump"){g.player.jumpBuffer=config.jumpBuffer;g.player.jumpReleased=!g.keys.has("jump");return;}
    const state=permit(g.player,action);
    if(state.reason==="dead")return state;
    const key=action.startsWith("dao")?"skill":action;
    g.intents[key]={action,time:g.elapsed,remaining:action==="slash"?.2:.18,ordinary:action==="block"&&state.status!=="accepted"};
    if(action!=="block"){g.player.guardRecovery=false;g.guardInput=0;if(g.intents.block?.time<g.elapsed-1e-8)delete g.intents.block;}
    return state;
  }
  function consume(g,dt){
    const p=g.player;
    for(const [key,v] of Object.entries(g.intents)){
      v.remaining-=dt;
      if(v.action==="block"){
        if(!g.keys.has("block")){delete g.intents[key];continue;}
      }else if(v.remaining < -1e-8){delete g.intents[key];continue;}
    }
    for(const action of order){
      const key=action.startsWith("dao")?"skill":action, request=g.intents[key];
      if(!request||request.action!==action)continue;
      const result=permit(p,action);g.lastActionResult={action,...result};
      if(result.status==="rejected"){delete g.intents[key];continue;}
      if(result.status!=="accepted"){if(action==="block")request.ordinary=true;continue;}
      if(action.startsWith("dao")){
        const slot=action==="dao2"?1:0, skill=g.lab?.skills?.[slot];
        if(!skill||p.qi<skill.cost){delete g.intents[key];g.lastActionResult={action,status:"rejected",reason:"resource_or_disabled"};continue;}
        if(p.skillCooldowns[slot]>0)continue;
      }
      delete g.intents[key];
      if(p.slash>0){p.slash=0;p.queuedSlash=0;g.emitBattleEvent("action_cancelled",{action_id:"slash",phase:"recovery"});}
      if(action==="block"){g.beginBlock(request.ordinary);delete g.intents.slash;delete g.intents.skill;return;}
      p.blocking=false;p.parryArmed=0;
      // Only one combat action is accepted per simulation tick. Discard lower-priority
      // simultaneous requests, rather than unexpectedly executing them after a dash.
      g.intents={};
      if(action==="slash")g.beginSlash();
      else if(action==="dash")g.dash();
      else if(action==="qi")g.swordQi();
      else g.daoSkill(action==="dao2"?1:0);
      return;
    }
  }
  function releaseJump(p){p.jumpReleased=true;if(p.vy < -config.jumpCut)p.vy=-config.jumpCut;}
  function rects(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
  function physics(p,platforms,dt,width){
    const solids=platforms.filter(s=>s.collision==="solid"||s.collision==="floor").sort((a,b)=>p.vx>=0?a.x-b.x:b.x-a.x);
    const oldX=p.x, oldY=p.y;
    p.x=Math.max(0,Math.min(width-p.w,p.x+p.vx*dt));
    for(const s of solids)if(p.y<s.y+s.h&&p.y+p.h>s.y){
      if(p.vx>0&&oldX+p.w<=s.x+.01&&p.x+p.w>=s.x)p.x=s.x-p.w;
      else if(p.vx<0&&oldX>=s.x+s.w-.01&&p.x<=s.x+s.w)p.x=s.x+s.w;
      else continue;
      p.vx=0;
    }
    p.y+=p.vy*dt;p.onGround=false;
    for(const s of platforms){
      if(s.collision==="decor"||s.id===p.dropPlatform)continue;
      if(p.x+p.w<=s.x||p.x>=s.x+s.w)continue;
      if(p.vy>=0&&oldY+p.h<=s.y+.01&&p.y+p.h>=s.y){
        p.y=s.y-p.h;p.vy=0;p.onGround=true;p.jumpCount=0;p.groundPlatform=s.id;
      }else if((s.collision==="solid"||s.collision==="floor")&&p.vy<0&&oldY>=s.y+s.h-.01&&p.y<=s.y+s.h){
        p.y=s.y+s.h;p.vy=0;
      }
    }
    if(p.dropPlatform){const s=platforms.find(s=>s.id===p.dropPlatform);if(!s||p.y>=s.y+s.h)p.dropPlatform=null;}
    if(!p.onGround)p.groundPlatform=null;
  }
  function drop(p,platforms){
    const s=platforms.find(s=>s.id===p.groundPlatform);
    if(!s||s.collision!=="oneway")return false;
    p.dropPlatform=s.id;p.onGround=false;p.coyote=0;p.jumpBuffer=0;p.vy=60;p.y+=2;return true;
  }
  const api=freeze({config,phase,permit,enqueue,consume,releaseJump,physics,drop,rects});
  root.DaoBladeController=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:window);
