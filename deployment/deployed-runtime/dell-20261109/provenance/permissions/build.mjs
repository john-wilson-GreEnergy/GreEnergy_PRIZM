import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const repo='/Volumes/Dock_Storage/Projects/PRIZM_Utility/GreEnergy_PRIZM',require=createRequire(repo+'/package.json'),{build,transform}=require('esbuild'),{parse}=require('@babel/parser');
const {inventory,sha256:sha}=await import(repo+'/scripts/deployed-runtime-lib.mjs');
const root=path.dirname(new URL(import.meta.url).pathname),baseline=path.resolve(root,'../mobile-admin-deployment-20261105/release'),out=root+'/release',stage=root+'/stage',roles=['collector','fleet','lan'];
assert(!fs.existsSync(out)&&!fs.existsSync(stage));
const before=JSON.parse(fs.readFileSync(path.resolve(root,'../mobile-admin-deployment-20261105/stage/manifest.json'))).after;
for(const r of roles)for(const [n,h]of Object.entries(before[r])){const bytes=fs.readFileSync(baseline+'/'+r+'/'+n);assert.equal(sha(bytes),h,r+'/'+n);const dest=out+'/'+r+'/'+n;fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);}

const walk=(n,f)=>{if(!n||typeof n!=='object')return;f(n);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(x=>walk(x,f));else if(v&&typeof v==='object')walk(v,f);};
function func(s,name){const found=[];walk(parse(s,{sourceType:'unambiguous'}),n=>{if(n.type==='FunctionDeclaration'&&n.id?.name===name)found.push(n);});assert.equal(found.length,1,name);return found[0];}
const proof=[];
async function compiled(file){return (await transform(fs.readFileSync(repo+'/'+file,'utf8'),{loader:'ts',format:'esm',target:'es2022'})).code;}
function replaceFunction(code,source,name,file){const a=func(code,name),b=func(source,name);proof.push({file,name,old:sha(code.slice(a.start,a.end)),new:sha(source.slice(b.start,b.end))});return code.slice(0,a.start)+source.slice(b.start,b.end)+code.slice(a.end);}
function renameIdentifiers(code,map){const edits=[];walk(parse(code,{sourceType:'module'}),n=>{if(n.type==='Identifier'&&map[n.name])edits.push(n);});for(const n of edits.sort((a,b)=>b.start-a.start))code=code.slice(0,n.start)+map[n.name]+code.slice(n.end);return code;}
let main=fs.readFileSync(out+'/fleet/fleet-server.cjs','utf8'),profile=fs.readFileSync(out+'/fleet/profile-controls.cjs','utf8');
for(const [source,names]of [['src/server/fleet/accountManagement.ts',['manageFleetAccount']],['src/server/fleet/adminRoutes.ts',['parseAdminAction']],['src/server/fleet/remoteDesktop.ts',['createRemoteDesktop']]]){const c=await compiled(source);for(const n of names)profile=replaceFunction(profile,c,n,'profile-controls.cjs');}
profile=profile.replace('remoteDesktopRead, requireFullWorkspace,','remoteDesktopRead, requireFullWorkspace, hasWorkspaceControls, workspaceRead,');
main=main.replace('mobileSessionToken,remoteDesktopRead,requireFullWorkspace,','mobileSessionToken,remoteDesktopRead,requireFullWorkspace,hasWorkspaceControls,workspaceRead,');
const access=await compiled('src/server/fleet/workspaceAccess.ts'),read=await compiled('src/server/fleet/workspaceRead.ts');
for(const n of ['requireWorkspaceView','hasWorkspaceControls']){const f=func(access,n);main+='\n'+access.slice(f.start,f.end)+'\n';}
{const f=func(read,'workspaceRead');main+='\n'+read.slice(f.start,f.end)+'\n';}
// Preserve deployed unrelated code and import aliases; only these policy functions change.
const gatewaySource=await compiled('src/server/fleet/workspaceGateway.ts'),gatewayNode=func(gatewaySource,'createWorkspaceGateway');
const gateway=renameIdentifiers(gatewaySource.slice(gatewayNode.start,gatewayNode.end),{express:'import_express7.default'});
main=replaceFunction(main,gateway,'createWorkspaceGateway','fleet-server.cjs');
const fleet=func(main,'createFleetApp'),old=main.slice(fleet.start,fleet.end);assert.equal(old.split('requireFullWorkspace').length,2);main=main.slice(0,fleet.start)+old.replace('requireFullWorkspace','requireWorkspaceView')+main.slice(fleet.end);
for(const [file,code]of [['fleet-server.cjs',main],['profile-controls.cjs',profile]]){parse(code,{sourceType:'script'});fs.writeFileSync(out+'/fleet/'+file,code);}
// Rebuild just the permission helper and admin panel against the deployed React runtime.
let workspace=await compiled('src/lib/fleetWorkspace.ts');
const ast=parse(workspace,{sourceType:'module'});for(const n of [...ast.program.body].reverse()){if(n.type==='ImportDeclaration'||n.type==='ExportNamedDeclaration'&&!n.declaration)workspace=workspace.slice(0,n.start)+workspace.slice(n.end);else if(n.type==='ExportNamedDeclaration'&&n.declaration)workspace=workspace.slice(0,n.start)+workspace.slice(n.declaration.start);}
workspace=renameIdentifiers(workspace,{remoteHome:'ft',remoteWorkspacePrefix:'pe',remoteReadOnlyWorkspace:'qr',workspaceReadUrl:'As',remoteViewTabs:'we',context:'W',directRequest:'Me',refreshFleetWorkspace:'Gr',getFleetWorkspace:'_t',isFleetWorkspacePort:'Wr',fleetReturnUrl:'Ct',parseWorkspaceContext:'Rt',initializeFleetWorkspace:'Br'});
const assets={};
for(const role of ['fleet','lan']){
 const base=baseline+'/'+role,all=Object.keys(before[role]).filter(n=>n.startsWith('assets/')).map(n=>n.slice(7)),entries=['index.html','fleet.html','mobile.html','signin.html'],active=new Set(),queue=entries.map(n=>fs.readFileSync(base+'/'+n,'utf8'));
 while(queue.length){const s=queue.pop();for(const n of all)if(!active.has(n)&&s.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(base+'/assets/'+n,'utf8'));}}
 const sources=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,fs.readFileSync(base+'/assets/'+n,'utf8')])),changed=new Set();
 let workspaceCount=0;for(const[n,s]of sources){if(!s.includes('Invalid site workspace identity'))continue;const a=func(s,'pe'),b=func(s,'Br');assert(b.start>a.end);let c=s.slice(0,a.start)+workspace+s.slice(b.end);c=c.replaceAll('Remote workspace · Read-only','Site workspace · Read-only');sources.set(n,c);changed.add(n);workspaceCount++;}assert(workspaceCount>=1);
 const clients=[...sources.keys()].filter(n=>n.startsWith('client-'));assert.equal(clients.length,1);
 let panel;
 if(role==='fleet'){
  const panels=[...sources].filter(([,s])=>s.includes('Users & site access'));assert.equal(panels.length,1);panel=panels[0][0];
  const result=await build({absWorkingDir:repo,stdin:{contents:"export {AdminUsers} from './src/fleet/AdminUsers';",resolveDir:repo,loader:'tsx'},bundle:true,format:'esm',jsx:'transform',minify:true,write:false,metafile:true,plugins:[{name:'deployed-react',setup(b){b.onResolve({filter:/^react$/},a=>({path:a.path,namespace:'deployed'}));b.onLoad({filter:/.*/,namespace:'deployed'},()=>({contents:`import {r as React} from './${clients[0]}';export default React;export const {useEffect,useState,useRef}=React;`,loader:'js'}));b.onResolve({filter:/^\.\//},a=>a.namespace==='deployed'?{path:a.path,external:true}:undefined);}}]});
  sources.set(panel,result.outputFiles[0].text);changed.add(panel);
 }
 let grew=true;while(grew){grew=false;for(const[n,s]of sources)if(!changed.has(n)&&[...changed].some(c=>s.includes(c))){changed.add(n);grew=true;}}
 const rename=new Map([...changed].map(n=>[n,'permissions09-'+sha(role+n+sources.get(n)).slice(0,12)+'.js']));
 const rewrite=s=>{for(const[a,b]of [...rename].sort((a,b)=>b[0].length-a[0].length))s=s.replaceAll(a,b);return s;};
 for(const[a,b]of rename){const code=rewrite(sources.get(a));parse(code,{sourceType:'module'});fs.writeFileSync(out+'/'+role+'/assets/'+b,code);}
 for(const n of entries)fs.writeFileSync(out+'/'+role+'/'+n,rewrite(fs.readFileSync(base+'/'+n,'utf8')));
 assets[role]={panel:rename.get(panel??[...changed][0]),workspaceCount,renamed:Object.fromEntries(rename)};
}
const after=Object.fromEntries(roles.map(r=>[r,inventory(out+'/'+r)])),changed=Object.fromEntries(roles.map(r=>[r,Object.keys(after[r]).filter(n=>before[r][n]!==after[r][n]).sort()]));assert.deepEqual(changed.collector,[]);
const manifest={schema:1,scope:'Shared per-site LAN/remote permissions and passive monitoring parity. Existing account grants preserved; legacy remote-control flags no longer override workspace.full.',before,after,changed,assets,proof};fs.mkdirSync(stage);fs.writeFileSync(stage+'/manifest.json',JSON.stringify(manifest,null,2));for(const r of roles)for(const n of changed[r]){const dest=stage+'/payload/'+r+'/'+n;fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(out+'/'+r+'/'+n,dest);}console.log(JSON.stringify({manifestHash:sha(fs.readFileSync(stage+'/manifest.json')),changed:Object.fromEntries(roles.map(r=>[r,changed[r].length]))}));
