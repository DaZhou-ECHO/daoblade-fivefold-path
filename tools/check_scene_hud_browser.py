"""047 local Chrome smoke, isolated database/profile; writes evidence only under work/."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from flask import render_template
from werkzeug.serving import make_server, WSGIRequestHandler
from app import create_app
from shared_rules import get_ruleset
from journey import MAPS_V2

mode = sys.argv[1] if len(sys.argv) > 1 else 'desktop'
if mode not in ('desktop', 'mobile', 'narrow', 'landscape'):
    raise SystemExit('Use desktop, mobile, narrow or landscape')
work = ROOT/'work'
work.mkdir(exist_ok=True)
profile = Path(tempfile.mkdtemp(prefix='hud047-', dir=work))
database = profile/'test.sqlite3'
app = create_app({'TESTING': True, 'DATABASE': str(database), 'SECRET_KEY': os.urandom(32)})

SCRIPT = r"""
window.addEventListener('load',async()=>{const pause=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,label)=>{if(!ok)throw Error(label)};
try{
 const until=async(fn,label)=>{for(let i=0;i<100&&!fn();i++)await pause(50);check(fn(),label)};
 await until(()=>!document.querySelector('#entry-auth-form').hidden,'entry form');
 document.querySelector('#entry-guest').click();await until(()=>document.querySelector('#entry-screen').hidden,'guest entry');
 document.querySelector('.village-hud [data-go=journey]').click();
 await until(()=>document.querySelector('#skill-demo-play'),'guide loaded');
 check(document.body.classList.contains('board-screen'),'standalone board');
 const rect=document.querySelector('#panel-journey').getBoundingClientRect();
 check(Math.abs(rect.left)<2&&Math.abs(rect.right-innerWidth)<2,'board fills viewport');
 check(getComputedStyle(document.querySelector('.topbar')).display==='none','no global header');
 document.querySelector('#village-window-close').click();
 document.querySelector('.village-hud').lastElementChild.click();
 check(document.querySelector('#settings-dialog').open,'village settings');
 document.querySelector('[data-rebind=dao]').click();
 window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyR',key:'r',bubbles:true}));
 check(DaoBladeKeyLabel(0)==='R','rebound key');
 document.querySelector('#close-settings').click();
 document.querySelector('.village-hud [data-go=journey]').click();
 check(document.querySelector('[data-bagua-slot="active:0"]').textContent.includes('R'),'board key updated');
 check(document.querySelector('.scene-node-editor').contains(document.querySelector('#bagua-nodes')),'nodes in primary editor');
 DaoBladeBagua.openTab('training');check(!document.body.classList.contains('board-screen'),'training separate');
 DaoBladeBagua.openTab('board');

 for(const id of ['qian','kun','zhen','xun','kan','li','gen','dui']){
   document.querySelector(`[data-bagua-palace=${id}]`).click();
   check(document.querySelector('#skill-guide').textContent.includes('限制'),'limits '+id);
   document.querySelector('#skill-demo-play').click();await pause(80);
   document.querySelector('#skill-demo-enemy').click();
   document.querySelector('[data-guide-mode=mind]').click();
   check(document.querySelector('#skill-guide').textContent.includes('无需按键'),'mind '+id);
   document.querySelector('[data-guide-mode=active]').click();
 }
 document.querySelector('[data-bagua-palace=li]').click();
 document.querySelector('[data-bagua-palace=li]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 check(document.querySelector('[data-bagua-palace=kun]').getAttribute('aria-pressed')==='true','keyboard palace navigation');
 document.querySelector('[data-bagua-palace=li]').click();
 const media=window.matchMedia;window.matchMedia=()=>({matches:true});document.querySelector('#skill-demo-play').click();
 check(document.querySelector('#skill-demo-caption').textContent.includes('减少动态'),'reduced motion');window.matchMedia=media;
 document.querySelector('#skill-demo-canvas').getContext=()=>{throw Error('simulated canvas failure')};document.querySelector('#skill-demo-enemy').click();
 check(document.querySelector('#skill-demo-caption').textContent.includes('静态分镜'),'canvas fallback');
 document.querySelector('[data-bagua-palace=gen]').click();document.querySelector('[data-bagua-palace=li]').click();
 const core=()=>document.querySelector('[data-bagua-node="li.core"]');
 core().click();document.querySelector('[data-bagua-node-action]').click();
 await until(()=>document.querySelector('.skill-candidate')?.textContent.includes('停用'),'candidate preview');
 document.querySelector('[data-bagua-confirm]').click();
 await until(()=>document.querySelector('#skill-comparison').textContent.includes('停用'),'draft comparison');
 document.querySelector('#journey-discard').click();
 document.querySelector('[data-bagua-slot="active:1"]').click();document.querySelector('[data-bagua-choice=gen]').click();
 await until(()=>document.querySelector('#skill-comparison').textContent.includes('新增'),'new active preview');
 document.querySelector('#journey-save').click();
 await until(()=>!document.querySelector('#skill-save-recap').hidden,'save recap');
 check(document.querySelector('#skill-save-recap').textContent.includes('止戈'),'saved active');
 document.querySelector('#skill-recap-map').click();
 await until(()=>!document.querySelector('[data-enter-route=ridge]').disabled,'map ready');
 document.querySelector('[data-enter-route=ridge]').click();await until(()=>document.querySelector('#panel-game.active'),'formal route');
 await pause(100);
 check(document.querySelector('#skill-hud').textContent.includes('R'),'battle key matches binding');
 document.querySelector('#pause-run').click();check(activeGame.pause,'pause');
 document.querySelector('#settings-run').click();check(document.querySelector('#settings-dialog').open,'battle settings');
 window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape',bubbles:true}));
 check(activeGame.pause,'dialog escape cannot resume battle');
 document.querySelector('#close-settings').click();check(activeGame.pause,'settings closes to pause');
 document.querySelector('#resume-run').click();check(!activeGame.pause,'explicit resume');
 document.querySelector('#quit-run').click();check(document.querySelector('#panel-sanctuary.active'),'return village');
 document.querySelector('.village-hud [data-go=journey]').click();
 await until(()=>document.querySelector('[data-bagua-node-action]').disabled,'frozen');
 check(document.documentElement.scrollWidth<=innerWidth+5,'horizontal overflow');
 await until(()=>!document.querySelector('#journey-status').textContent.includes('保存中'),'read complete before abandon');
 await DaoBladeJourneyUI.abandonTrial();
 await until(()=>!document.querySelector('[data-bagua-node-action]').disabled,'formal abandon unlocks build');
 document.body.classList.remove('board-detail-open');
 document.querySelector('.scene-guide-open')?.classList.remove('scene-guide-open');
 document.querySelector('#panel-journey').scrollTop=0;
 const footer=document.querySelector('#bagua-actions').getBoundingClientRect();
 check(Math.abs(footer.bottom-innerHeight)<3,'save footer at viewport bottom');

 if(location.search.includes('village')) document.querySelector('#village-window-close').click();
 if(location.search.includes('battle')){document.querySelector('#village-window-close').click();document.querySelector('[data-go=atlas]').click();await pause(100);document.querySelector('[data-enter-route=ridge]').click();await pause(100);}
 document.title='PASS_047';
}catch(e){document.title='FAIL_047 '+e.message;}
});
"""


@app.get('/_guide-smoke')
def page():
    return render_template('index.html', ruleset=get_ruleset(), journey_maps=MAPS_V2).replace('</body>', '<script>'+SCRIPT+'</script></body>')


class Quiet(WSGIRequestHandler):
    def log_request(self, *args, **kwargs):
        pass


server = make_server('127.0.0.1', 0, app, request_handler=Quiet)
threading.Thread(target=server.serve_forever, daemon=True).start()
chrome = shutil.which('google-chrome') or shutil.which('chromium') or r'C:\Program Files\Google\Chrome\Application\chrome.exe'
shot = work/f'hud047-{mode}-{sys.argv[2] if len(sys.argv)>2 else "board"}.png'
try:
    process = subprocess.Popen([chrome, '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--remote-debugging-port=0', f'--user-data-dir={profile}', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        portfile=profile/'DevToolsActivePort'
        for _ in range(100):
            if portfile.exists(): break
            time.sleep(.1)
        port=portfile.read_text().splitlines()[0]
        width,height={'mobile':('390','844'),'desktop':('1440','1000'),'narrow':('1366','768'),'landscape':('844','390')}[mode]
        url=f'http://127.0.0.1:{server.server_port}/_guide-smoke?'+(sys.argv[2] if len(sys.argv)>2 else 'board')
        result=subprocess.run([os.environ.get('SCENE_CDP_NODE','node'),str(ROOT/'tools/scene-hud-cdp.cjs'),port,url,width,height,str(shot)],capture_output=True,timeout=40)
        print(result.stdout.decode('utf-8',errors='replace').strip())
        if result.stderr: print(result.stderr.decode('utf-8',errors='replace').strip())
        raise SystemExit(result.returncode)
    finally:
        process.terminate()
        process.wait(timeout=10)
finally:
    server.shutdown()
    database.unlink(missing_ok=True)
