/** Loopback-only visual fixture. Synthetic accounts; no collectors or equipment. */
import path from 'node:path';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createFleetApp} from '../src/server/fleet/fleetApp';
import {FleetBroker} from '../src/server/fleet/FleetBroker';
import {LocalSessions} from '../src/server/security/localSessions';
import {hashLocalPassword,readAccounts} from '../src/server/security/localAccounts';
const publicDirectory=path.resolve(process.argv[2]??'dist');
const directory=await mkdtemp(path.join(tmpdir(),'prizm-profile-preview-')),file=path.join(directory,'accounts.json');
const origin='http://127.0.0.1:3212',password='Preview fixture only';
const sites=[3,4].map(n=>({siteId:'sample-ss'+n,blockId:'1',blockIndex:1,stationCode:'SIMULATED-SS'+n,name:'Solar Star '+n+' · Sample'}));
const hash=await hashLocalPassword(password);
await writeFile(file,JSON.stringify(['admin','viewer'].map(id=>({id,email:id+'@example.test',version:1,disabled:false,fleetAdmin:id==='admin',remoteAccess:true,remoteControlSites:id==='admin'?sites.map(s=>s.siteId):[],password:hash,
 grants:sites.flatMap(s=>(['telemetry.view','workspace.full'] as const).map(capability=>({capability,siteId:s.siteId,blockId:s.blockId,scope:{kind:'block'}})))}))),{mode:0o600});
const app=createFleetApp(new FleetBroker(sites),new LocalSessions(()=>readAccounts(file),Date.now,true),{origin,allowLoopbackHttp:true,simulated:true,publicDirectory,accountsFile:file,
 workspaces:sites.map((s,i)=>({siteId:s.siteId,origin:'https://127.0.0.1:'+String(3444+i)})),audit:async()=>{}});
const server=app.listen(3212,'127.0.0.1',()=>console.log(origin+' — synthetic admin@example.test / Preview fixture only'));
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{server.closeAllConnections();server.close(()=>{void rm(directory,{recursive:true,force:true}).then(()=>process.exit(0));});});
