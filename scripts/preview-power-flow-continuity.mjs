/** Loopback-only visual/DOM regression fixture. No accounts or telemetry reads. */
import {build} from 'esbuild';
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
let client=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {SitePowerFlow} from './src/components/SitePowerFlow';
const root=createRoot(document.getElementById('root'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const check=(ok,message)=>{if(!ok)throw Error(message);};
const make=()=>{const stamp=new Date().toISOString(),r={direction:'charging',powerKw:-100,label:'Charging',observedAt:stamp,validUntil:Date.now()+15000};return {version:1,source:'Synthetic fixture · no equipment',note:'Continuity test only',mixed:false,partial:false,net:r,arrays:[{...r,array:1,soc:{percent:42,quality:'live',observedAt:stamp,validUntil:r.validUntil,source:'Fixture',coverage:{connected:40,total:40,label:'40/40 strings connected',partial:false}}}]};};
let model=make();
const render=(flow=model,siteName='SS4 · Synthetic')=>flushSync(()=>root.render(<SitePowerFlow flow={flow} siteName={siteName}/>));
async function run(){
 render();await delay(100);
 const card=document.querySelector('.pf-branch'),fill=document.querySelector('.pf-soc-fill'),pulse=card.querySelector('.pf-pulse');
 const animation=pulse.getAnimations()[0],color=getComputedStyle(card).getPropertyValue('--flow');
 check(animation,'Animation exists');
 for(let i=0;i<8;i++){model=make();model.arrays[0].soc.percent=43+i;render();await delay(30);check(document.querySelector('.pf-branch')===card,'Branch remounted');check(document.querySelector('.pf-soc-fill')===fill,'Fill remounted');check(pulse.getAnimations()[0]===animation,'Animation restarted');}
 check(animation.currentTime>200,'Animation clock advances through updates');
 const missing=structuredClone(model);missing.net={direction:'unknown',powerKw:null,observedAt:null,validUntil:null,label:'Unavailable'};missing.arrays[0]={...missing.net,array:1};render(missing);
 check(fill.getAttribute('visibility')==='visible','Last fill remains');check(fill.getAttribute('data-last-soc-percent')==='50','Last percent retained');
 check(card.textContent.includes('Last -100'),'Last power retained');check(!card.classList.contains('pf-moving')&&!card.querySelector('.pf-moving'),'Unknown motion withheld');check(getComputedStyle(card).getPropertyValue('--flow')===color,'No grey flash');
 check(pulse.getAnimations()[0]===animation&&animation.playState==='paused','Same animation pauses');
 model=make();model.arrays[0].soc.percent=60;render();check(pulse.getAnimations()[0]===animation&&animation.playState==='running','Same animation resumes');check(fill.getAttribute('data-soc-percent')==='60','Fresh fill updates');
 model=make();model.net.validUntil=Date.now()+120;model.arrays[0].validUntil=model.net.validUntil;model.arrays[0].soc.validUntil=model.net.validUntil;render();await delay(220);
 check(!document.querySelector('.pf-moving'),'Deadline stops motion without a new publication');check(fill.getAttribute('data-last-soc-percent')==='42','Deadline retains fill as Last');
 render(missing,'SS3 · Synthetic');check(!document.querySelector('[data-last-soc-percent]'),'No cross-site value retention');
 flushSync(()=>root.render(<SitePowerFlow flow={undefined} siteName="SS3 · Synthetic"/>));check(!document.querySelector('.power-flow'),'Disable/invalid model clears display');
 model=make();render();document.getElementById('result').textContent='PASS: stable DOM and animation phase; retained numbers/fill; real expiry pauses; new data updates; site isolation and disable clear.';
}
run().catch(e=>{document.getElementById('result').textContent='FAIL: '+e.message;console.error(e);});
`;
const release=process.argv[2]?path.resolve(process.argv[2]):null;
let css=fs.readFileSync('src/components/sitePowerFlow.css','utf8');
if(release){
 const manifest=JSON.parse(fs.readFileSync(path.dirname(release)+'/profiles-manifest.json'));
 const flow=fs.readFileSync(release+'/assets/'+manifest.assets.flow,'utf8');
 const clientAsset=/["']\.\/(client-[^"']+\.js)["']/.exec(flow)?.[1];if(!clientAsset)throw Error('Missing deployed React binding');
 client=client.replace("import React from 'react';",`import {r as React,c as ReactDOM,e as getDom} from '/assets/${clientAsset}';const {createRoot}=ReactDOM;const {flushSync}=getDom();`)
  .replace("import {createRoot} from 'react-dom/client';",'').replace("import {flushSync} from 'react-dom';",'')
  .replace("import {SitePowerFlow} from './src/components/SitePowerFlow';",`import {S as SitePowerFlow} from '/assets/${manifest.assets.flow}';`);
 const names=[...new Set(['index.html','fleet.html','mobile.html'].flatMap(f=>[...fs.readFileSync(release+'/'+f,'utf8').matchAll(/(?:\.\/|\/)assets\/([\w.-]+\.css)/g)].map(m=>m[1])))];
 css=names.filter(n=>n!==manifest.assets.flowCss).map(n=>fs.readFileSync(release+'/assets/'+n,'utf8')).join('\n')+'\n'+fs.readFileSync(release+'/assets/'+manifest.assets.flowCss,'utf8');
}
const bundled=await build({stdin:{contents:client,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',write:false,tsconfigRaw:{compilerOptions:{jsx:'react'}},external:['/assets/*']});
const js=bundled.outputFiles[0].text;
const server=createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(release&&/^\/assets\/[\w.-]+\.js$/.test(req.url??'')){const file=release+req.url;if(fs.existsSync(file)){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));return;}}
 if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Power-flow continuity test</title><style>'+css+' body{font:16px system-ui;margin:24px}#result{padding:16px;background:#edf5ed}</style><h1>Power-flow continuity · synthetic data</h1><p id="result">Running checks…</p><div id="root"></div><script type="module" src="/fixture.js"></script>');
});
server.listen(3213,'127.0.0.1',()=>console.log('http://127.0.0.1:3213 — synthetic continuity fixture only'));
process.once('SIGINT',()=>{server.closeAllConnections();server.close();});
