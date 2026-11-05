"use strict";
// Version-three actions. Timers belong to BattleGame; rendering only reads them.
(function(root){
  const center=e=>e.x+e.w/2;
  function clear(g){
    g.swordWindow=null;g.swordCast=null;g.swordShield=null;g.swordCharge=null;
    g.swordEffects=[];g.swordStrike=null;
    if(g.player){g.player.swordPose=null;g.player.swordCharging=false;}
  }
  function cancel(g){
    if(g.swordStrike)g.player.slash=0;
    g.swordWindow=null;g.swordCharge=null;g.swordCast=null;g.swordStrike=null;g.swordRelease=false;
    g.player.swordCharging=false;g.player.swordPose=null;
  }
  function arm(g,target,before){
    if(!g.lab.combo)return;
    g.swordWindow={remaining:1,opened:g.elapsed,target:target?{x:center(target),y:target.y+target.h/2,id:target.id}:null,before,face:g.player.face};
  }
  function hit(g,e,damage,element,seen,control){
    if(e.dead||seen.has(e.id))return false;
    seen.add(e.id);g.hitEnemy(e,damage,false,false,"sword_combo",element);
    if(!e.dead&&control==="slow")e.slow=Math.max(e.slow,e.kind==="boss"?.8:2);
    if(!e.dead&&control==="interrupt"&&e.kind!=="boss"){
      e.attackState="idle";e.attackTimer=0;e.attackCd=Math.max(e.attackCd,.6);
    }
    return true;
  }
  function area(g,x,y,w,h,damage,element,seen=new Set(),control){
    let count=0;
    for(const e of g.enemies)if(g.overlap(x,y,w,h,e.x,e.y,e.w,e.h)&&hit(g,e,damage,element,seen,control))count++;
    return count;
  }
  function effect(g,spec){
    (g.swordEffects??=[]).push({...spec,elapsed:0,hit:new Set(),done:false});
  }
  function shift(g,distance,safe){
    const p=g.player,step=Math.sign(distance)*6;
    let left=Math.abs(distance);
    while(left>0){
      const move=Math.sign(step)*Math.min(6,left),next=p.x+move;
      if(safe&&p.onGround&&!g.platforms.some(s=>s.y>=p.y+p.h-8&&s.y<=p.y+p.h+12&&next+p.w/2>=s.x&&next+p.w/2<=s.x+s.w))break;
      const old=p.x,vx=p.vx;p.vx=move/.008;
      root.DaoBladeController.physics(p,g.platforms,.008,g.worldWidth);p.vx=vx;
      left-=Math.abs(move);if(Math.abs(p.x-old)<.1)break;
    }
  }
  function base(g,cast){
    const {skill,slot}=cast,p=g.player,before=p.x;
    if(skill.id==="xun"){shift(g,p.face*180,false);p.invuln=Math.max(p.invuln,.2);}
    const targets=g.enemies.filter(e=>{
      if(e.dead||Math.abs(e.y+e.h/2-p.y-p.h/2)>105)return false;
      const dx=center(e)-center(p);
      if(skill.id==="xun")return e.x+e.w>=Math.min(before,p.x)&&e.x<=Math.max(before,p.x)+p.w;
      return skill.id==="kun"?Math.abs(dx)<skill.range:dx*p.face>=0&&dx*p.face<=skill.range;
    }).sort((a,b)=>Math.abs(center(a)-center(p))-Math.abs(center(b)-center(p)));
    if(skill.id==="gen"){
      p.shield=Math.max(p.shield,12);p.shieldTime=3;
      g.swordShield={kind:"base",remaining:3,main:slot===0};
    }
    for(const e of targets){
      g.hitEnemy(e,cast.damage,false,false,"journey_"+skill.id,skill.element);
      if(e.dead)continue;
      if(skill.id==="li"){e.labBurn=3;e.labBurnTick=1;}
      if(skill.id==="kan")e.slow=Math.max(e.slow,e.kind==="boss"?.8:2);
      if(skill.id==="zhen"&&e.kind!=="boss"){e.attackCd=Math.max(e.attackCd,.6);e.attackState="idle";e.attackTimer=0;}
      if(skill.id==="kun")e.x=Math.max(30,Math.min(g.worldWidth-80,e.x+Math.sign(center(e)-center(p))*(e.kind==="boss"?15:70)));
    }
    if(skill.id==="dui"&&targets.length)p.qi=Math.min(g.stats.qiMax,p.qi+8);
    if(slot===0&&skill.id!=="gen"&&targets.length){
      const crossed=targets.find(e=>(center(e)-(before+p.w/2))*(center(e)-center(p))<0);
      if(skill.id!=="xun"||crossed)arm(g,crossed||targets[0],before);
    }
    effect(g,{kind:"flash",x:center(p),y:p.y+p.h/2,range:skill.id==="kun"?170:skill.range,face:p.face,color:elementColor(skill.element),duration:.24});
  }
  function elementColor(id){return {fire:"#fa9365",wood:"#8ec9a0",earth:"#dec083",metal:"#e6e2ba",water:"#88d4e3"}[id]||"#e8da9f";}
  function combine(g,cast){
    const p=g.player,c=cast.context,d=cast.damage,kind=g.lab.combo.id,x=center(p),y=p.y+p.h/2;
    const common={damage:d,element:cast.skill.element,color:elementColor(cast.skill.element)};
    if(kind==="li-gen"){
      p.shield=Math.max(p.shield,12);p.shieldTime=3;
      g.swordShield={kind:"lamp",remaining:3,damage:d,element:"fire"};
    }else if(kind==="gen-zhen"){
      p.face=c.face;area(g,p.face>0?x:x-130,p.y-5,130,p.h+10,d,cast.skill.element,new Set(),"interrupt");
    }else if(kind==="zhen-kun")effect(g,{...common,kind:"wave",x,y:g.floorY-35,face:p.face,duration:.65});
    else if(kind==="kun-xun"){
      shift(g,-p.face*140,true);effect(g,{...common,kind:"scar",x,y,face:p.face,duration:.4});
    }else if(kind==="xun-qian"){
      p.face=-c.face;const a=c.before+p.w/2;
      area(g,Math.min(a,x)-20,p.y-10,Math.abs(a-x)+40,p.h+20,d,cast.skill.element);
      effect(g,{...common,kind:"line",x,y,to:a,duration:.25});
    }else if(kind==="qian-kan")effect(g,{...common,kind:"tide",x:c.target.x,y:c.target.y,duration:.75});
    else if(kind==="kan-dui")effect(g,{...common,kind:"return",x:c.target.x,y:c.target.y,to:x,toY:y,duration:.35});
    else if(kind==="dui-li"){
      const first=g.enemies.find(e=>e.id===c.target.id&&!e.dead);
      const other=g.enemies.filter(e=>!e.dead&&e!==first&&(center(e)-c.target.x)*c.face>0&&Math.abs(center(e)-c.target.x)<=240&&Math.abs(e.y+e.h/2-c.target.y)<105).sort((a,b)=>Math.abs(center(a)-c.target.x)-Math.abs(center(b)-c.target.x))[0];
      for(const [e,amount] of [[first,d*(other ? .6 : 1)],[other,d*.4]])if(e){hit(g,e,amount,cast.skill.element,new Set());if(!e.dead){e.labBurn=3;e.labBurnTick=1;}effect(g,{...common,kind:"lamp",x:center(e),y:e.y+e.h/2,duration:.35});}
    }
  }
  function cast(g,slot){
    const p=g.player,skill=g.lab.skills[slot];
    if(g.pause||g.finished||g.disposed||g.labPending||g.labError||!skill||g.skillInputBlocked(slot)||p.qi<skill.cost||p.blocking)return false;
    const pressed=g.swordIntentAt??g.elapsed;g.swordIntentAt=null;
    const context=slot===1&&g.lab.combo&&g.swordWindow?.remaining>0&&pressed>=g.swordWindow.opened?g.swordWindow:null;
    if(slot===1)g.swordWindow=null;
    p.qi-=skill.cost;p.skillCooldowns[slot]=skill.cooldown*(g.lab.minds.includes("kan")?(.95-.05*g.journeyMindLevel("kan")):1);
    p.qiCast=.34;p.castDuration=.34;p.skillPose=skill.id;p.swordPose=context?g.lab.combo.id:skill.id;
    g.swordCharge=null;p.swordCharging=false;
    g.swordCast={skill,slot,context,remaining:.12,damage:skill.damage+(g.lab.minds.includes("li")?1+g.journeyMindLevel("li"):0)};
    return true;
  }
  function shieldHit(g,amount,sourceX,sourceId){
    const s=g.swordShield;
    if(!s||amount<=0||sourceId==="environment")return;
    g.swordShield=null;
    if(s.kind==="lamp"){
      g.swordLastCombo={id:"li-gen",event:"shield_hit",at:g.elapsed};
      area(g,center(g.player)-110,g.player.y-10,220,g.player.h+20,s.damage,s.element);
      effect(g,{kind:"flash",x:center(g.player),y:g.player.y+35,range:110,color:"#ed9b64",duration:.3});
    }else if(s.main){arm(g,null,g.player.x);g.swordWindow.face=sourceX>=center(g.player)?1:-1;}
  }
  function beginStrike(g){
    const p=g.player;
    p.swordPose=null;g.swordCharge=null;p.swordCharging=false;
    if(!g.keys.has("down")||p.counterAttack)return;
    const kind=p.onGround?"lift":"dive";
    p.combo=1;p.lastSlashAt=-10;p.slashDuration=kind==="lift"?.4:.7;p.slash=p.slashDuration;p.slashCooldown=.48;
    p.swordPose=kind;g.swordStrike={kind,elapsed:0,hit:new Set(),landed:false};
    if(kind==="dive")p.vy=Math.max(p.vy,560);
  }
  function charge(g){
    const p=g.player;
    if(root.DaoBladeController.permit(p,"qi").status!=="accepted"||p.blocking)return;
    g.swordNotice="";g.swordWindow=null;g.swordCharge={elapsed:0};p.swordCharging=true;p.swordPose="charge";
  }
  function release(g){
    const charge=g.swordCharge;if(!charge)return;
    g.swordCharge=null;g.player.swordCharging=false;g.player.swordPose=null;
    const full=charge.elapsed>=.45;
    if(g.pause||g.finished||g.disposed||g.player.hurt>0)return;
    if(g.player.qi<(full?28:20)){g.swordNotice="剑意不足";return;}
    g.swordRelease=full;root.DaoBladeController.enqueue(g,"qi");
  }
  function tick(g,dt){
    const p=g.player;
    if(p.hurt>0||p.guardBreak>0||p.hp<=0){cancel(g);g.swordShield=null;g.swordEffects=[];return;}
    if(g.swordCharge){g.swordCharge.elapsed+=dt;p.swordCharging=true;}
    if(g.swordWindow){g.swordWindow.remaining-=dt;if(g.swordWindow.remaining<=0)g.swordWindow=null;}
    if(g.swordShield){g.swordShield.remaining-=dt;if(g.swordShield.remaining<=0||p.shield<=0)g.swordShield=null;}
    if(g.swordCast){
      g.swordCast.remaining-=dt;
      if(g.swordCast.remaining<=0){const c=g.swordCast;g.swordCast=null;if(c.context)combine(g,c);else base(g,c);}
    }
    const s=g.swordStrike;
    if(s){
      const damage=g.stats.attack*(1+(g.lab.training?.sword||0)*.03);
      s.elapsed+=dt;
      if(s.kind==="lift"&&s.elapsed>=.08&&s.elapsed<=.23){
        const x=p.face>0?center(p):center(p)-75;
        for(const e of g.enemies)if(g.overlap(x,p.y-70,75,130,e.x,e.y,e.w,e.h)&&hit(g,e,damage*1.12,null,s.hit)){
          if(!e.dead&&e.kind!=="boss"&&!["crusher","charger"].includes(e.variant)&&!e.swordLift){e.swordLift={floor:e.y,vy:-300};e.hurt=Math.max(e.hurt,.25);}
        }
      }
      if(s.kind==="dive"){
        p.vy=Math.max(560,p.vy);
        area(g,p.x-12,p.y, p.w+24,p.h+12,damage*1.2,null,s.hit);
        if(p.onGround&&!s.landed){s.landed=true;p.slash=.22;p.slashDuration=.22;p.slashCooldown=.26;area(g,p.x-65,p.y+p.h-35,p.w+130,45,damage*1.2,null,s.hit);}
        if(!s.landed)p.slash=Math.max(.05,p.slash);
      }
      if(p.slash<=0)g.swordStrike=null;
    }
    for(const e of g.enemies)if(e.swordLift){const l=e.swordLift;l.vy+=1000*dt;e.y+=l.vy*dt;if(e.y>=l.floor){e.y=l.floor;delete e.swordLift;}}
    for(const e of g.swordEffects||[]){
      e.elapsed+=dt;const t=e.elapsed/e.duration;
      if(e.kind==="wave"){
        const travel=t<.5?t*2*180:180-(t-.5)*2*360;
        area(g,e.x+travel*e.face-50,e.y-40,100,80,e.damage,e.element,e.hit);
      }else if(e.kind==="scar")area(g,e.x-65,e.y-55,130,110,e.damage,e.element,e.hit);
      else if(e.kind==="tide"&&t>=.6&&!e.done){area(g,e.x-50,e.y-70,100,140,e.damage,e.element,e.hit,"slow");e.done=true;}
      else if(e.kind==="return"){
        const x=e.x+(e.to-e.x)*Math.min(1,t),y=e.y+(e.toY-e.y)*Math.min(1,t);
        if(area(g,x-35,y-35,70,70,e.damage,e.element,e.hit)&&!e.refunded){p.qi=Math.min(g.stats.qiMax,p.qi+8);e.refunded=true;}
      }
    }
    g.swordEffects=(g.swordEffects||[]).filter(e=>e.elapsed<e.duration);
    if(p.qiCast<=0&&p.slash<=0&&!g.swordCharge)p.swordPose=null;
  }
  function draw(g,ctx){
    if(g.swordCharge){
      const p=g.player,progress=Math.min(1,g.swordCharge.elapsed/.45);
      ctx.save();ctx.fillStyle="#19393e";ctx.fillRect(p.x-12,p.y-19,64,7);ctx.fillStyle=progress>=1?"#ffe6a0":"#8dc9c9";ctx.fillRect(p.x-12,p.y-19,64*progress,7);
      ctx.font="12px sans-serif";ctx.fillText(progress>=1?"满蓄 · 松开出剑":"蓄剑",p.x-24,p.y-27);ctx.restore();
    }
    for(const e of g.swordEffects||[]){
      const t=e.elapsed/e.duration;ctx.save();ctx.strokeStyle=e.color;ctx.lineWidth=3;ctx.globalAlpha=Math.max(.2,1-t*.7);ctx.setLineDash(e.kind==="tide"&&t<.6?[6,5]:[]);
      ctx.beginPath();
      if(e.kind==="line"||e.kind==="return"){ctx.moveTo(e.x,e.y);ctx.lineTo(e.to,e.toY??e.y);}
      else if(e.kind==="wave"){const travel=t<.5?t*360:180-(t-.5)*720;ctx.ellipse(e.x+travel*e.face,e.y,48,22,0,0,Math.PI*2);}
      else if(e.kind==="scar"){ctx.moveTo(e.x-60,e.y);ctx.lineTo(e.x+60,e.y);}
      else if(e.kind==="tide")ctx.rect(e.x-50*(1-t),e.y-65,100*(1-t),130);
      else ctx.ellipse(e.x,e.y,Math.max(10,(e.range||45)*Math.sin(Math.PI*t)),35,0,0,Math.PI*2);
      ctx.stroke();ctx.restore();
    }
    if(g.swordWindow){const p=g.player;ctx.save();ctx.strokeStyle="#e8d99c";ctx.lineWidth=3;ctx.beginPath();ctx.arc(center(p),p.y-18,14,-Math.PI/2,-Math.PI/2+Math.PI*2*g.swordWindow.remaining);ctx.stroke();ctx.fillStyle="#f4e5b5";ctx.font="12px sans-serif";ctx.fillText((root.DaoBladeKeyLabel?.(1)||"E")+" · "+g.lab.combo.name,p.x-45,p.y-40);ctx.restore();}
  }
  const api={clear,cancel,cast,tick,draw,shieldHit,beginStrike,charge,release};
  root.DaoBladeSword=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(globalThis);
