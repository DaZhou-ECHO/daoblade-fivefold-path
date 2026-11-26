// 052：用真实 Chrome 打开世界美术预览页，截取木境高径、回廊与 Boss 起手帧。
const fs = require('node:fs');
const [port, base, outDir] = process.argv.slice(2);

(async () => {
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const tab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let serial = 0; const pending = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { const [r, j] = pending.get(m.id); pending.delete(m.id); m.error ? j(Error(JSON.stringify(m.error))) : r(m.result); }
  };
  const call = (method, params = {}) => new Promise((r, j) => { const id = ++serial; pending.set(id, [r, j]); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async expression => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const shoot = async (name, selector) => {
    const raw = await ev(`(()=>{const c=document.querySelector('${selector}');const r=c.getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height});})()`);
    const box = JSON.parse(raw);
    const img = await call('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 },
    });
    fs.writeFileSync(`${outDir}/${name}`, Buffer.from(img.data, 'base64'));
  };
  const choose = async (label, value) => ev(`(()=>{const el=document.querySelector('${label}');el.value='${value}';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);

  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: base + '/static/world-art-preview.html' });
  let status = '';
  for (let i = 0; i < 120; i += 1) {
    await pause(150);
    status = await ev('document.querySelector("#art-status")?.textContent || ""');
    if (/\d+\/\d+/.test(status) && !/正在/.test(status)) break;
  }
  await pause(600);

  await choose('#realm', 'wood');
  await choose('#layout', 'ridge');
  await ev(`(()=>{const c=document.querySelector('#map-camera');c.value='640';c.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await pause(900);
  await shoot('browser-preview-ridge.png', '#preview');

  await choose('#layout', 'hollow');
  await pause(700);
  await shoot('browser-preview-hollow.png', '#preview');

  await choose('#family', 'boss');
  await ev(`(()=>{const a=document.querySelector('#action');const o=[...a.options].find(o=>/windup/.test(o.value));if(o){a.value=o.value;a.dispatchEvent(new Event('change',{bubbles:true}));}
    const b=document.querySelector('#boxes');if(b&&b.checked)b.click();})()`);
  await pause(800);
  await shoot('browser-preview-boss.png', '#preview');

  console.log(JSON.stringify({ status, files: ['browser-preview-ridge.png', 'browser-preview-hollow.png', 'browser-preview-boss.png'] }));
  ws.close();
  process.exit(0);
})().catch(error => { console.error(String(error)); process.exit(1); });
