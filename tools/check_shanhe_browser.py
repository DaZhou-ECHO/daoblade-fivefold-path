"""048 isolated real-Chrome integration check. No production saves are used."""
import os
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
work = ROOT / "work"
work.mkdir(exist_ok=True)
profile = Path(tempfile.mkdtemp(prefix="shanhe048-", dir=work))
os.environ["DAOBLADE_DATABASE"] = str(profile / "test.sqlite3")
from flask import render_template
from werkzeug.serving import make_server, WSGIRequestHandler
from app import create_app
from shared_rules import get_ruleset
from journey import MAPS_V2

app = create_app({"TESTING": True, "DATABASE": os.environ["DAOBLADE_DATABASE"], "SECRET_KEY": os.urandom(32)})
SCRIPT = r"""
window.addEventListener('load',async()=>{
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,label)=>{if(!ok)throw Error(label)},$=s=>document.querySelector(s);
 const until=async(fn,label)=>{for(let i=0;i<180&&!fn();i++)await pause(40);check(fn(),label)};
 const idle=()=>until(()=>DaoBladeJourneyUI.entrySummary()&&!DaoBladeJourneyUI.entrySummary().busy,'journey idle');
 const clickText=(node,text)=>{const b=[...node.querySelectorAll('button')].find(b=>b.textContent===text);check(b,'button '+text);b.click();};
 let phase='login';
 const proof={routes:[],combat:[]};window.__shanheProof=proof;
 try{
  window.confirm=()=>true;window.prompt=()=> '山河初行';
  await until(()=>!$('#entry-auth-form').hidden,'login visible');
  $('#entry-tab-register').click();$('#entry-username').value='browser048';$('#entry-password').value='test-password048';
  $('#entry-auth-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>$('#save-selection .save-card'),'three empty slots');
  check(!$('#entry-screen').hidden&&$('.shell').inert,'still at selection');
  clickText($('#save-selection .save-card'),'创建征程');
  await until(()=>[...document.querySelectorAll('#save-selection button')].some(b=>b.textContent==='进入征程'),'created slot');
  clickText($('#save-selection .save-card'),'进入征程');
  await until(()=>$('#entry-screen').hidden,'entered selected save');await idle();
  phase='story';$('#village-journal').click();
  check($('#shanhe-journal').open,'journal open');
  $('#quest-content [data-action=story_read]').click();await idle();await pause(150);
  check(!$('#quest-content').textContent.includes('开始调查'),'intro read');
  $('#shanhe-journal [data-close]').click();
  phase='mentor';$('[data-village=journey]').click();
  check(!$('#village-dialogue').hidden,'NPC dialog');
  check(!$('#village-choices').textContent.includes('调整八宫'),'master separated');
  clickText($('#village-choices'),'修习师门');await idle();await pause(150);
  check(!document.body.classList.contains('board-screen'),'training window');
  $('#village-window-close').click();
  phase='board';$('.village-hud [data-go=journey]').click();await idle();await pause(200);
  check(document.body.classList.contains('board-screen'),'independent sword board');
  check($('#panel-journey').getBoundingClientRect().width>=innerWidth-2,'board full width');
  $('#village-window-close').click();
  phase='bounty';$('#village-journal').click();$('[data-quest-tab=bounty]').click();
  await until(()=>$('[data-action=bounty_accept]')&&!$('[data-action=bounty_accept]').disabled,'bounty enabled');
  const accept=[...document.querySelectorAll('[data-action=bounty_accept]')].find(b=>JSON.parse(b.dataset.extra).realm==='fire');accept.click();
  await until(()=>$('#quest-content').textContent.includes('已接取'),'bounty accepted');await idle();$('#shanhe-journal [data-close]').click();
  phase='ten maps';
  for(const realm of ['wood','fire','earth','metal','water'])for(const route of ['ridge','hollow']){
   $('.village-hud [data-go=atlas]').click();await idle();
   $(`[data-realm=${realm}]`).click();await pause(60);
   check($('#atlas-region-title').textContent===({wood:'青萝泽',fire:'赤霞山',earth:'镇岳故道',metal:'藏锋岭',water:'落星潭'})[realm],'geographic name '+realm);
   $(`[data-enter-route=${route}]`).click();
   await until(()=>activeGame?.journey&&$('#panel-game').classList.contains('active'),'formal start '+realm+route);await idle();await pause(100);
   const r=$('#game-canvas').getBoundingClientRect();check(Math.abs(r.left)<2&&Math.abs(r.top)<2&&Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2,'viewport filled '+realm+route);
   check(activeGame.width===960&&activeGame.height===540,'fixed physics reference');
   check(activeGame.level.map_id===route,'correct route');
   check($('#skill-hud').parentElement===$('.canvas-wrap'),'floating skills');
   proof.routes.push(realm+':'+route);
   await DaoBladeJourneyUI.abandonTrial();$('#quit-run').click();await idle();
  }
  phase='selection return';await DaoBladeSaves.reselect();
  check(!$('#entry-screen').hidden,'back to slots');clickText($('#save-selection .save-card'),'进入征程');
  await until(()=>$('#entry-screen').hidden,'reenter selected slot');await idle();
  const screen=new URLSearchParams(location.search).get('screen')||'village';
  if(screen==='slots'){
   phase='draft and save switching';$('.village-hud [data-go=journey]').click();await idle();
   DaoBladeJourneyUI.editNode('li.edge',false);
   let pending=DaoBladeSaves.reselect();await until(()=>$('dialog[open]')?.textContent.includes('八宫有未保存草稿'),'switch decision');
   clickText($('dialog[open]'),'取消');await pending;check(DaoBladeJourneyUI.entrySummary().dirty,'cancel keeps draft');
   pending=DaoBladeSaves.reselect();await until(()=>$('dialog[open]')?.textContent.includes('八宫有未保存草稿'),'save decision');
   clickText($('dialog[open]'),'保存并选档');await pending;check(!$('#save-selection').hidden,'saved and selected');
   clickText($('#save-selection .save-card'),'进入征程');await until(()=>$('#entry-screen').hidden,'saved reentry');await idle();
   const saved=await (await DaoBladeSaves.fetch('/api/journey')).json();check(saved.state.nodes['li.edge']===null,'draft persisted to exact slot');
   DaoBladeJourneyUI.editNode('li.edge',true);pending=DaoBladeSaves.reselect();await until(()=>$('dialog[open]')?.textContent.includes('八宫有未保存草稿'),'discard decision');
   clickText($('dialog[open]'),'放弃草稿并选档');await pending;
   clickText($('#save-selection .save-card'),'进入征程');await until(()=>$('#entry-screen').hidden,'discard reentry');await idle();
   const discarded=await (await DaoBladeSaves.fetch('/api/journey')).json();check(discarded.state.nodes['li.edge']===null,'discard did not write');
   await DaoBladeSaves.reselect();proof.draftChoices=['cancel','save','discard'];
  }
  if(screen==='combat'){
   phase='input-driven two-route combat';
   for(const route of ['ridge','hollow']){
    $('.village-hud [data-go=atlas]').click();await idle();$('[data-realm=fire]').click();$(`[data-enter-route=${route}]`).click();
    await until(()=>activeGame?.journey,'combat start');await idle();
    const g=activeGame,p=g.player;
    for(let frame=0;frame<60*160&&!g.finished;frame++){
     const target=g.enemies.filter(e=>!e.dead&&!e.optional).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0];
     g.keys.delete('left');g.keys.delete('right');
     if(!target){g.keys.add('right');if(g.canExit()&&Math.abs(p.x-g.level.exit.x)<85)g.interactWorld();}
     else{
      const dx=target.x-p.x;
      if(Math.abs(dx)>72)g.keys.add(dx>0?'right':'left');
      else if(!p.slash&&!p.qiCast&&!p.dash)p.face=dx<0?-1:1;
      if(Math.abs(dx)<155){
       if(['windup','strike'].includes(target.attackState)&&p.slash<=0){if(!g.keys.has('block')){g.keys.add('block');g.performAction('block');}}
       else{g.keys.delete('block');p.blocking=false;if(p.skillCooldowns[0]<=0&&p.qi>=g.lab.skills[0].cost)g.performAction('dao');else if(p.slashCooldown<=0)g.performAction('slash');}
      }
     }
     if(p.onGround&&g.platforms.some(s=>s.collision==='solid'&&s.x>=p.x&&s.x-p.x<100)){g.keys.add('jump');g.performAction('jump');}
     g.update(1/60);if(g.labPending)await pause(10);
    }
    check(g.finished&&g.lastOutcome==='victory','input combat victory '+route+' hp '+p.hp+' x '+p.x);
    await until(()=>$('#result-dialog').open,'real server settlement '+route);
    check(!g.labError,'settlement acknowledged');$('#return-sanctuary').click();await idle();
    proof.combat.push({route,hp:Math.round(p.hp),outcome:g.lastOutcome});
   }
   $('#village-journal').click();$('[data-quest-tab=bounty]').click();
   await until(()=>$('[data-action=bounty_claim]')&&!$('[data-action=bounty_claim]').disabled,'completed bounty');
   $('[data-action=bounty_claim]').click();await until(()=>$('[data-action=bounty_accept]'),'claimed reward');await idle();$('#shanhe-journal [data-close]').click();
  }
  if(screen==='map'){$('.village-hud [data-go=atlas]').click();await idle();}
  if(screen==='board'){$('.village-hud [data-go=journey]').click();await idle();}
  if(screen==='battle'){$('.village-hud [data-go=atlas]').click();await idle();$('[data-realm=fire]').click();$('[data-enter-route=ridge]').click();await until(()=>activeGame?.journey,'final battle');await idle();}
  await pause(200);check($('#runtime-error').hidden,'no runtime errors');document.title='PASS_048';
 }catch(e){document.title='FAIL_048 '+phase+' '+e.message+' '+($('#quest-error')?.textContent||'');console.error(e);}
});
"""


@app.get('/_048-smoke')
def smoke():
    html = render_template('index.html', ruleset=get_ruleset(), journey_maps=MAPS_V2)
    return html.replace('</body>', '<script>'+SCRIPT+'</script></body>')


class Quiet(WSGIRequestHandler):
    def log_request(self, *args, **kwargs):
        pass


server = make_server('127.0.0.1', 0, app, request_handler=Quiet)
threading.Thread(target=server.serve_forever, daemon=True).start()
width, height = (sys.argv[1:3] or ['1920', '1080'])
screen = sys.argv[3] if len(sys.argv) > 3 else 'village'
shot = work/f'shanhe048-{width}x{height}-{screen}.png'
chrome = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
try:
    process = subprocess.Popen([chrome, '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
        '--remote-debugging-port=0', f'--user-data-dir={profile}', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        portfile = profile/'DevToolsActivePort'
        for _ in range(100):
            if portfile.exists():
                break
            time.sleep(.1)
        port = portfile.read_text().splitlines()[0]
        node = os.environ.get('SCENE_CDP_NODE', 'node')
        result = subprocess.run([node, '--experimental-websocket', str(ROOT/'tools/shanhe-cdp.cjs'), port,
            f'http://127.0.0.1:{server.server_port}/_048-smoke?screen={screen}', width, height, str(shot)], capture_output=True, timeout=60)
        print(result.stdout.decode('utf-8', errors='replace'))
        if result.stderr:
            print(result.stderr.decode('utf-8', errors='replace'))
        raise SystemExit(result.returncode)
    finally:
        process.terminate()
        process.wait(timeout=10)
finally:
    server.shutdown()
