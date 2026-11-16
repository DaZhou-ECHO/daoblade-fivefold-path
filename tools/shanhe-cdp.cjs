// Drive isolated Chrome with exact viewport metrics; no external dependencies.
const fs=require('node:fs');
const [port,url,width,height,shot]=process.argv.slice(2);
(async()=>{
 const tabs=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
 const tab=tabs.find(t=>t.type==='page');
 const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let serial=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const [r,j]=pending.get(m.id);pending.delete(m.id);m.error?j(Error(m.error.message)):r(m.result);}};
 const call=(method,params={})=>new Promise((r,j)=>{const id=++serial;pending.set(id,[r,j]);ws.send(JSON.stringify({id,method,params}));});
 await call('Emulation.setDeviceMetricsOverride',{width:+width,height:+height,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url});
 let title='';for(let i=0;i<400;i++){await new Promise(r=>setTimeout(r,100));title=(await call('Runtime.evaluate',{expression:'document.title',returnByValue:true})).result.value;if(/^(PASS|FAIL)_048/.test(title))break;}
 const metrics=(await call('Runtime.evaluate',{expression:'JSON.stringify({width:innerWidth,height:innerHeight,proof:window.__shanheProof})',returnByValue:true})).result.value;
 const img=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(shot,Buffer.from(img.data,'base64'));ws.close();console.log(JSON.stringify({title,metrics}));process.exit(title==='PASS_048'?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
