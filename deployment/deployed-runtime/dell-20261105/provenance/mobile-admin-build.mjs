import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const repo='/Volumes/Dock_Storage/Projects/PRIZM_Utility/GreEnergy_PRIZM',require=createRequire(repo+'/package.json'),{build,transform}=require('esbuild'),{parse}=require('@babel/parser');
const {inventory,sha256:sha,applicationFile}=await import(repo+'/scripts/deployed-runtime-lib.mjs');
const root=path.dirname(new URL(import.meta.url).pathname),out=root+'/release',stage=root+'/stage',roles=['collector','fleet','lan'];
assert(!fs.existsSync(out)&&!fs.existsSync(stage));const before={};for(const r of roles){before[r]=inventory(root+'/baseline/'+r);assert(Object.keys(before[r]).every(applicationFile));fs.cpSync(root+'/baseline/'+r,out+'/'+r,{recursive:true});}
const walk=(n,f)=>{if(!n||typeof n!=='object')return;f(n);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(x=>walk(x,f));else if(v&&typeof v==='object')walk(v,f);};
function func(s,name){const found=[];walk(parse(s,{sourceType:'unambiguous'}),n=>{if(n.type==='FunctionDeclaration'&&n.id?.name===name)found.push(n);});assert.equal(found.length,1,name);return found[0];}
const proof=[];
for(const [file,source,names]of [['profile-controls.cjs','src/server/fleet/accountManagement.ts',['manageFleetAccount']],['profile-controls.cjs','src/server/fleet/adminRoutes.ts',['parseAdminAction']],['remote-admin.cjs','src/server/fleet/adminRoutes.ts',['fleetAdminRouter']]]){
 const compiled=(await transform(fs.readFileSync(repo+'/'+source,'utf8'),{loader:'ts',format:'esm',target:'node24'})).code;
 const target=out+'/fleet/'+file;let code=fs.readFileSync(target,'utf8');for(const name of names){const a=func(code,name),b=func(compiled,name);proof.push({file,name,source,old:sha(code.slice(a.start,a.end)),new:sha(compiled.slice(b.start,b.end))});code=code.slice(0,a.start)+compiled.slice(b.start,b.end)+code.slice(a.end);}parse(code,{sourceType:'script'});fs.writeFileSync(target,code);
}
const assets={};
for(const role of ['fleet','lan']){
 const base=root+'/baseline/'+role,all=fs.readdirSync(base+'/assets'),entries=['index.html','fleet.html','mobile.html','signin.html'],active=new Set(),queue=entries.map(n=>fs.readFileSync(base+'/'+n,'utf8'));
 while(queue.length){const s=queue.pop();for(const n of all)if(!active.has(n)&&s.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(base+'/assets/'+n,'utf8'));}}
 const sources=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,fs.readFileSync(base+'/assets/'+n,'utf8')])),changed=new Set();
 const client=[...sources.keys()].filter(n=>n.startsWith('client-'));assert.equal(client.length,1);
 const admin='AdminUsers-remoteadmin21.js';if(role==='fleet'){assert(sources.has(admin));
 const result=await build({absWorkingDir:repo,stdin:{contents:"export {AdminUsers} from './src/fleet/AdminUsers';",resolveDir:repo,loader:'tsx'},bundle:true,format:'esm',jsx:'transform',minify:true,write:false,metafile:true,plugins:[{name:'deployed-react',setup(b){b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:a.path,namespace:'deployed'}));b.onLoad({filter:/.*/,namespace:'deployed'},a=>({contents:a.path==='react'?`import {r as React} from './${client[0]}';export default React;export const {useEffect,useState,useRef}=React;`:`import {j as runtime} from './${client[0]}';export const {jsx,jsxs,Fragment}=runtime;`,loader:'js'}));b.onResolve({filter:/^\.\//},a=>a.namespace==='deployed'?{path:a.path,external:true}:undefined);}}]});
 for(const n of Object.keys(result.metafile.inputs))assert(['<stdin>','deployed:react','deployed:react/jsx-runtime','src/fleet/AdminUsers.tsx','src/core/security/fleetPasswordPolicy.ts'].includes(n),'Unexpected dependency '+n);
 sources.set(admin,result.outputFiles[0].text);changed.add(admin);}
 const remote=[...sources.keys()].filter(n=>n.startsWith('remoteExperience-'));assert.equal(remote.length,1);
 const remoteResult=await build({stdin:{contents:`export {routeRemoteExperience as a,remoteHome as r} from '${repo}/src/lib/remoteExperience.ts';`,resolveDir:repo},bundle:true,format:'esm',minify:true,write:false});sources.set(remote[0],remoteResult.outputFiles[0].text);changed.add(remote[0]);
 const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'Unique patch '+a);return s.replace(a,b);};
 const fleet=role==='fleet'?'fleet-remoteadmin21.js':[...sources.keys()].find(n=>n.startsWith('fleet-'));let f=sources.get(fleet);f=once(f,'className:"header-right",children:[','className:"header-right",children:[A&&e.jsx("a",{className:"monitor-link",href:"/mobile/#monitor",children:"Mobile monitor"}),');sources.set(fleet,f);changed.add(fleet);
 const mobile=[...sources].filter(([,s])=>s.includes('className:"m-preview"'));assert.equal(mobile.length,1);let [mn,ms]=mobile[0];
 ms=once(ms,'className:"m-preview",children:','className:"m-preview",children:'); // Assert expected deployed template.
 const needle='!!((d=(x=n.session)==null?void 0:x.workspaces)';
 ms=once(ms,needle,'document.documentElement.dataset.prizmAdaptive==="true"&&e.jsxs("section",{className:"m-full-fleet",children:[e.jsx("a",{href:"/fleet/#full",children:"Full Fleet & administration"}),e.jsx("span",{children:"Use your assigned site tools and account permissions."})]}),'+needle);sources.set(mn,ms);changed.add(mn);
 let shellCount=0,shellName;
 for(const[n,s]of sources){if(!s.includes('ops-mobile-menu'))continue;const nodes=[];walk(parse(s,{sourceType:'module'}),x=>{if(x.type==='FunctionDeclaration'&&s.slice(x.start,x.end).includes('className:"ops-icon-button ops-mobile-menu"'))nodes.push(x);});assert.equal(nodes.length,1);const fn=nodes[0];let body=s.slice(fn.start,fn.end);
 const hooks=/\[([\w$]+),([\w$]+)\]=([\w$]+)\.useState\(!1\);return/.exec(body);assert(hooks);const[,open,set,react]=hooks;
 body=once(body,hooks[0],`[${open},${set}]=${react}.useState(!1);const __menuRef=${react}.useRef(null),__closeMenu=()=>{${set}(!1);__menuRef.current?.focus();};${react}.useEffect(()=>{if(!${open})return;const escape=event=>{if(event.key==="Escape")__closeMenu();};window.addEventListener("keydown",escape);return()=>window.removeEventListener("keydown",escape);},[${open}]);return`);
 body=once(body,'className:"ops-icon-button ops-mobile-menu"','ref:__menuRef,className:"ops-icon-button ops-mobile-menu"');
 body=body.replaceAll(`onClick:()=>${set}(!1)`,`onClick:__closeMenu`);body=once(body,`),${set}(!1)}`,`),__closeMenu()}`);
 sources.set(n,s.slice(0,fn.start)+body+s.slice(fn.end));changed.add(n);shellCount++;shellName??=n;
 }
 assert(shellCount>=1);
 let grew=true;while(grew){grew=false;for(const[n,s]of sources)if(!changed.has(n)&&[...changed].some(c=>s.includes(c))){changed.add(n);grew=true;}}
 const rename=new Map([...changed].map(n=>[n,'mobileadmin05-'+sha(role+n+sources.get(n)).slice(0,12)+'.js']));
 const rewrite=s=>{for(const[a,b]of [...rename].sort((a,b)=>b[0].length-a[0].length))s=s.replaceAll(a,b);return s;};
 for(const[a,b]of rename){const code=rewrite(sources.get(a));parse(code,{sourceType:'module'});fs.writeFileSync(out+'/'+role+'/assets/'+b,code);}
 const touch=fs.readFileSync(repo+'/src/theme/touch.css','utf8'),adminCss=fs.readFileSync(repo+'/src/fleet/style.css','utf8').split('/* Account actions remain readable')[1],ops=fs.readFileSync(repo+'/src/workspaces/operations.css','utf8').split('\n').filter(l=>l.startsWith('@media(max-width:1024px)')).join('\n'),mobileCss=fs.readFileSync(repo+'/src/mobile/responsive.css','utf8').split('\n').find(l=>l.startsWith('.m-full-fleet'));
 assert(adminCss&&ops.includes('ops-mobile-menu')&&mobileCss);const css=touch+'\n/* Account actions remain readable'+adminCss+'\n'+ops+'\n'+mobileCss,cssName='mobileadmin05-'+sha(css).slice(0,12)+'.css';fs.writeFileSync(out+'/'+role+'/assets/'+cssName,css);
 for(const n of entries){let html=rewrite(fs.readFileSync(base+'/'+n,'utf8'));assert(html.includes('</head>'));html=html.replace('</head>',`<link rel="stylesheet" href="/assets/${cssName}">\n</head>`);fs.writeFileSync(out+'/'+role+'/'+n,html);}
 assets[role]={panel:rename.get(role==='fleet'?admin:shellName),oldPanel:role==='fleet'?admin:shellName,fleet:rename.get(fleet),mobile:rename.get(mn),remote:rename.get(remote[0]),css:cssName,shellCount,renamed:Object.fromEntries(rename)};
}
const after=Object.fromEntries(roles.map(r=>[r,inventory(out+'/'+r)])),changed=Object.fromEntries(roles.map(r=>[r,Object.keys(after[r]).filter(n=>before[r][n]!==after[r][n]).sort()]));assert.deepEqual(changed.collector,[]);
for(const role of ['fleet','lan'])assert(changed[role].every(n=>['index.html','fleet.html','mobile.html','signin.html',...(role==='fleet'?['profile-controls.cjs','remote-admin.cjs']:[])].includes(n)||/^assets\/mobileadmin05-[a-f0-9]{12}\.(js|css)$/.test(n)));
const manifest={schema:1,scope:'Mobile/tablet presentation and Fleet email/delete/password administration; unchanged collector code and acquisition settings',before,after,changed,assets,proof};fs.mkdirSync(stage);const raw=JSON.stringify(manifest,null,2);fs.writeFileSync(stage+'/manifest.json',raw);for(const r of roles)for(const n of changed[r]){const dest=stage+'/payload/'+r+'/'+n;fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(out+'/'+r+'/'+n,dest);}console.log(JSON.stringify({manifestSha:sha(raw),changed:Object.fromEntries(roles.map(r=>[r,changed[r].length])),proof},null,2));
