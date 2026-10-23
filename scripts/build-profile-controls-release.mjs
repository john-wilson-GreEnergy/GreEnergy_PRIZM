/** Exact-baseline interface/profile update; never substitute the dirty-tree build. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {transform,build} from 'esbuild';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default??traverseModule;
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg);assert(!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const[k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else{assert(s.isFile());r[n]=sha(fs.readFileSync(p));}}return r;}
function once(s,a,b){assert.equal(s.split(a).length,2,'Unique boundary: '+a.slice(0,100));return s.replace(a,b);}
function functions(s,ts=false){return new Map(parse(s,{sourceType:'module',plugins:ts?['typescript']:[]}).program.body.map(n=>n.type==='ExportNamedDeclaration'?n.declaration:n).filter(n=>n?.type==='FunctionDeclaration').map(n=>[n.id.name,s.slice(n.start,n.end)]));}
function replaceFunction(s,name,replacement){const body=functions(s).get(name);assert(body,name);return once(s,body,replacement);}
const before=tree(base);
assert.equal(before['fleet-server.cjs'],'0d8cfa9a9bdd6f88757078ffe17bdcce2983d47dfd1084d94dd45c43e7db47b4','Pinned deployed Fleet');
fs.cpSync(base,out,{recursive:true});
// Compile only changed functions. All unchanged security/transport primitives
// are supplied by the pinned deployed bundle, not the current source tree.
const selected={
 'src/server/security/localAccounts.ts':['parseAccounts'],
 'src/server/fleet/accountManagement.ts':['manageFleetAccount','listFleetAccounts'],
 'src/server/fleet/adminRoutes.ts':['parseAdminAction'],
 'src/server/fleet/remoteDesktop.ts':['createRemoteDesktop'],
 'src/server/fleet/remoteMobile.ts':['createRemoteMobileApp'],
};
const names=Object.values(selected).flat();
const definitions=Object.entries(selected).flatMap(([file,chosen])=>{const f=functions(fs.readFileSync(file,'utf8'),true);return chosen.map(name=>{assert(f.has(name));return f.get(name);});}).join('\n');
const deps=['object','identifier','capabilities','normalizeLocalEmail','hashLocalPassword','readAccounts','parseEnrollment','FLEET_MIN_PASSWORD_LENGTH','AccessError','LocalSessions','allowedSiteIds','mobileSessionToken','remoteDesktopRead','requireFullWorkspace','workspacePath','workspaceRouteAllowed','monitoringWorkspaceRequest','passiveWorkspaceGet','remoteVerifier','allowedFetchSite','createMobileApp'];
const factory=`module.exports=function(deps){const {${deps.join(',')}}=deps;const express=require('express'),path=require('node:path');const {lstat,open,rename,unlink,readFile,readdir}=require('node:fs/promises');const {randomUUID,randomBytes,createHash,timingSafeEqual}=require('node:crypto');${definitions}\nreturn {${names.join(',')}};};`;
const compiled=(await transform(factory,{loader:'ts',format:'cjs',target:'node24'})).code;
// Missing dependency bindings must fail at build time, not at first live command.
const free=new Set();traverse(parse(compiled),{ReferencedIdentifier(p){if(!p.scope.hasBinding(p.node.name))free.add(p.node.name);}});
assert.deepEqual([...free].filter(n=>!['module','require','Buffer','process','structuredClone','URL'].includes(n)).sort(),[]);
fs.writeFileSync(out+'/profile-controls.cjs',compiled);
let server=fs.readFileSync(base+'/fleet-server.cjs','utf8');
for(const name of names)server=replaceFunction(server,name,`function ${name}(...args){return __profileControls().${name}(...args);}`);
server=once(server,'{ event: "mobile.remote-listener.ready", readOnly: true }','{ event: "mobile.remote-listener.ready", controls: remoteConfig.controls === "profile" ? "profile" : "disabled" }');
const depValues=deps.map(n=>n==='identifier'?'identifier:identifier2':n).join(',');
server+=`\nvar __profileControlsInstance;function __profileControls(){return __profileControlsInstance??=(require('./profile-controls.cjs')({${depValues}}));}\n`;
// The lazy factory is used only after startup has initialized baseline bindings.
parse(server);fs.writeFileSync(out+'/fleet-server.cjs',server);
const assets=fs.readdirSync(base+'/assets'),entries=['index.html','fleet.html','mobile.html','signin.html'];
const active=new Set(),queue=entries.map(n=>fs.readFileSync(base+'/'+n,'utf8'));
while(queue.length){const s=queue.pop();for(const n of assets)if(!active.has(n)&&s.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(base+'/assets/'+n,'utf8'));}}
const name=prefix=>{const matches=[...active].filter(n=>n.startsWith(prefix+'-')&&n.endsWith('.js'));assert.equal(matches.length,1,prefix);return matches[0];};
const texts=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,fs.readFileSync(base+'/assets/'+n,'utf8')]));
const client=name('client'),fleet=name('fleet'),workspace=name('workspace'),flow=name('SitePowerFlow');
// Replace only the shared display component and its display-memory helper.
// Reuse the deployed React singleton; no telemetry/acquisition modules bundled.
assert(texts.get(flow).endsWith('export{$ as S};\n'));
const flowBuild=await build({stdin:{contents:"export {SitePowerFlow as S} from './src/components/SitePowerFlow';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',jsx:'transform',minify:true,write:false,metafile:true,
 plugins:[{name:'deployed-react',setup(b){b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},args=>({path:args.path,namespace:'deployed'}));b.onLoad({filter:/.*/,namespace:'deployed'},args=>({contents:args.path==='react'?`import {r as React} from './${client}';export default React;export const {useEffect,useState}=React;`:`import {j as runtime} from './${client}';export const {jsx,jsxs,Fragment}=runtime;`,loader:'js'}));b.onResolve({filter:/^\.\/client-/},args=>({path:args.path,external:true}));}}]});
assert(Object.keys(flowBuild.metafile.inputs).every(p=>['<stdin>','deployed:react','deployed:react/jsx-runtime','src/components/SitePowerFlow.tsx','src/components/powerFlowPresentation.ts'].includes(p)),'Only reviewed display code bundled: '+JSON.stringify(Object.keys(flowBuild.metafile.inputs)));
texts.set(flow,flowBuild.outputFiles[0].text);
const flowCssName='power-flow-continuity21.css';
fs.writeFileSync(out+'/assets/'+flowCssName,fs.readFileSync('src/components/sitePowerFlow.css'));
let admin=fs.readFileSync('src/fleet/AdminUsers.tsx','utf8');
admin=once(admin,"import React,{useEffect,useState} from 'react';",`import {r as React} from './${client}';const {useEffect,useState}=React;`);
assert(server.includes('var FLEET_MIN_PASSWORD_LENGTH = 6;'),'Preserve deployed password policy');
admin=once(admin,"import {FLEET_MIN_PASSWORD_LENGTH} from '../core/security/fleetPasswordPolicy';",'const FLEET_MIN_PASSWORD_LENGTH=6;');
const adminName='AdminUsers-profilecontrols21.js';texts.set(adminName,(await transform(admin,{loader:'tsx',format:'esm',jsx:'transform',minify:true})).code);
let fleetSource=texts.get(fleet);const adminFunction=[...functions(fleetSource)].find(([,s])=>s.includes('Users & site access'));assert(adminFunction);
fleetSource=replaceFunction(fleetSource,adminFunction[0],`function ${adminFunction[0]}(props){return __ProfileAdminUsers(props);}`);
fleetSource=`import {AdminUsers as __ProfileAdminUsers} from './${adminName}';\n`+fleetSource;
fleetSource=once(fleetSource,'REMOTE · READ-ONLY ACCESS','REMOTE · PROFILE-BASED ACCESS');
fleetSource=once(fleetSource,'Your regular Fleet workspace and assigned PRIZM sites. Remote equipment controls and user administration are unavailable.','Your assigned PRIZM sites. Remote controls require site permission in your profile. User administration is available through LAN.');
fleetSource=once(fleetSource,'Full site utility · Remote read-only access','Full site utility · Remote controls depend on your profile');
texts.set(fleet,fleetSource);
// Replace only the original workspace-context module, preserving all exported
// bindings used by the deployed page chunks and its existing telemetry pipeline.
let w=texts.get(workspace),module=fs.readFileSync('src/lib/fleetWorkspace.ts','utf8');
module=once(module,'import {remoteHome} from "./remoteExperience";','');
module=(await transform(module,{loader:'ts',format:'esm',minify:false})).code;
module=module.replace(/export \{[\s\S]*?\};\s*$/,'');
const mapping={remoteHome:'ft',remoteWorkspacePrefix:'pe',remoteReadOnlyWorkspace:'qr',workspaceReadUrl:'As',remoteViewTabs:'we',context:'W',directRequest:'Me',refreshFleetWorkspace:'Gr',getFleetWorkspace:'_t',isFleetWorkspacePort:'Wr',fleetReturnUrl:'Ct',parseWorkspaceContext:'Rt',initializeFleetWorkspace:'Br'};
// Rename references and declarations, never strings or property names.
const edits=[];traverse(parse(module,{sourceType:'module'}),{Identifier(p){const n=p.node.name;if(mapping[n]&&(p.isBindingIdentifier()||p.isReferencedIdentifier()))edits.push([p.node.start,p.node.end,mapping[n]]);}});
for(const[start,end,value]of edits.sort((a,b)=>b[0]-a[0]))module=module.slice(0,start)+value+module.slice(end);
const block=w.slice(w.indexOf('function pe('),w.indexOf('const Zr='));assert(block.startsWith('function pe(')&&block.endsWith('}'));
w=once(w,block,module+'\n');parse(w,{sourceType:'module'});texts.set(workspace,w);
// Native downloads bypass fetch. Scope only reviewed passive links to the
// selected remote site; LAN retains its original absolute paths.
const downloadHelper='function __profileDownload(u){return (/^\\/desktop\\/[A-Za-z0-9_-]{1,80}\\//.exec(window.location.pathname)?.[0].slice(0,-1)||"")+u;}\n';
const reporting=name('Reporting');let reportingSource=texts.get(reporting),downloadCount=0;
reportingSource=reportingSource.replace(/href:(`\/api\/local\/(?:diagnostic-session|reports\/download)\/[^`]+`)/g,(_m,url)=>{downloadCount++;return 'href:__profileDownload('+url+')';});
assert.equal(downloadCount,6,'Exact native report download links');texts.set(reporting,downloadHelper+reportingSource);
const settings=name('SiteConfigurationDashboard');texts.set(settings,downloadHelper+once(texts.get(settings),'window.location.href="/api/settings/profiles/export"','window.location.href=__profileDownload("/api/settings/profiles/export")'));
const rename=new Map([...texts.keys()].map(n=>[n,n===adminName?n:n.replace(/\.js$/,'-profiles21.js')]));
const rewrite=s=>{for(const[a,b]of rename)s=s.replaceAll(a,b);return s;};
for(const[prior,next]of rename){const s=rewrite(texts.get(prior));parse(s,{sourceType:'module'});fs.writeFileSync(out+'/assets/'+next,s);}
for(const n of entries)fs.writeFileSync(out+'/'+n,once(rewrite(fs.readFileSync(base+'/'+n,'utf8')),'</head>',`<link rel="stylesheet" href="/assets/${flowCssName}">\n</head>`));
const after=tree(out),changed=Object.keys(after).filter(p=>before[p]!==after[p]).sort();
assert(changed.every(p=>['fleet-server.cjs','profile-controls.cjs','assets/'+flowCssName,...entries].includes(p)||p.startsWith('assets/')&&p.endsWith('.js')));
for(const f of ['server.cjs','fleet-entry.cjs','workspace-ui.cjs','snapshot-cache-worker.cjs'])assert.equal(before[f],after[f],f+' preserved');
const manifest={schema:1,scope:'Persistent per-array animation display and profile-managed remote full workspace, including maintenance; no collector/acquisition changes',before,after,changed,functions:[...names,'main'],assets:{fleet:rename.get(fleet),workspace:rename.get(workspace),flow:rename.get(flow),flowCss:flowCssName,admin:adminName}};
fs.writeFileSync(path.dirname(out)+'/profiles-manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({out,changed:changed.length,functions:names,collectorsUnchanged:true}));
