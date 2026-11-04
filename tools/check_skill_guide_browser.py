"""046 local Chrome smoke, isolated database/profile; writes evidence only under work/."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from flask import render_template
from werkzeug.serving import make_server, WSGIRequestHandler
from app import create_app
from shared_rules import get_ruleset
from journey import MAPS_V2

mode = sys.argv[1] if len(sys.argv) > 1 else 'desktop'
if mode not in ('desktop', 'mobile'):
    raise SystemExit('Use desktop or mobile')
work = ROOT/'work'
work.mkdir(exist_ok=True)
profile = Path(tempfile.mkdtemp(prefix='guide046-', dir=work))
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
 document.querySelector('#quit-run').click();check(document.querySelector('#panel-sanctuary.active'),'return village');
 document.querySelector('.village-hud [data-go=journey]').click();
 await until(()=>document.querySelector('[data-bagua-node-action]').disabled,'frozen');
 check(document.documentElement.scrollWidth<=innerWidth+5,'horizontal overflow');
 document.querySelector('#skill-mobile-detail').click();
 document.querySelector('#skill-guide').scrollIntoView({block:'start'});
 document.title='PASS_046';
}catch(e){document.title='FAIL_046 '+e.message;}
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
shot = work/f'guide046-{mode}.png'
try:
    result = subprocess.run([chrome, '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--hide-scrollbars',
                             '--window-size='+('500,844' if mode=='mobile' else '1440,1000'), '--force-device-scale-factor=1',
                             '--virtual-time-budget=18000', '--dump-dom', f'--user-data-dir={profile}', f'--screenshot={shot}',
                             f'http://127.0.0.1:{server.server_port}/_guide-smoke'], capture_output=True, timeout=35)
    title = re.search(rb'<title>(.*?)</title>', result.stdout)
    label = title.group(1).decode('utf-8') if title else 'No page title'
    print(json.dumps({'mode': mode, 'result': label, 'screenshot': str(shot), 'exit': result.returncode}, ensure_ascii=False))
    raise SystemExit(0 if result.returncode == 0 and label == 'PASS_046' else 1)
finally:
    server.shutdown()
    database.unlink(missing_ok=True)
