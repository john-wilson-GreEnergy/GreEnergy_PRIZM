import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {parse} from '@babel/parser';
const root=path.resolve(process.argv[2]);
function fn(src,name){const n=parse(src,{sourceType:'module'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n,name);return src.slice(n.start,n.end);}
const source=fs.readFileSync(root+'/collector/dist/server.cjs','utf8');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'prizm-storage-status-boot-'));
fs.mkdirSync(temp+'/data');fs.mkdirSync(temp+'/cache');fs.mkdirSync(temp+'/dist');fs.writeFileSync(temp+'/data/fixture.txt','12345');
const childSource=`const fs=require('node:fs'),http=require('node:http');
 const import_fs4={default:fs},import_path4={default:require('node:path')},import_child_process=require('node:child_process');
 const HISTORY_ROOT=process.cwd()+'/.prizm-history',CACHE_ROOT=process.cwd()+'/cache';
 let lowDiskState=false,lastCleanupAt=null,lastCleanupSummary={},maintenanceTimer;
 const loadStoragePolicy=()=>({history:{enabled:false,cleanupIntervalMinutes:30},runtimeCache:{cleanupIntervalMinutes:30}});
 const stopLocalStorageMaintenance=()=>clearInterval(maintenanceTimer);
 const runStorageCleanup=()=>{throw Error('Cleanup must not be invoked by the fixture')};
 const checkAndEnforceLowDisk=()=>{throw Error('No scheduled cleanup during fixture')};
 ${['getFolderSize','getDiskSpace','formatBytes','storageFolderExists','getStorageStatus','initLocalStorageMaintenance'].map(n=>fn(source,n)).join('\n')}
 initLocalStorageMaintenance(true);
 const server=http.createServer((req,res)=>{if(req.method!=='GET'||req.url!=='/api/local/storage/status'){res.writeHead(404);return res.end();}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(getStorageStatus()));});
 server.listen(0,'127.0.0.1',()=>console.log('READY '+server.address().port));
 process.on('SIGTERM',()=>{stopLocalStorageMaintenance();server.close(()=>process.exit(0));});`;
const child=spawn(process.execPath,['-e',childSource],{cwd:temp,stdio:['ignore','pipe','pipe']});const exited=new Promise(r=>child.once('exit',r));
try{
 const port=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Fixture boot timeout')),10000);child.stdout.on('data',b=>{output+=b;const m=/READY (\d+)/.exec(output);if(m){clearTimeout(timer);resolve(Number(m[1]));}});child.once('exit',c=>{clearTimeout(timer);reject(Error('Fixture exited '+c));});child.stderr.on('data',b=>reject(Error(String(b))));});
 const r=await fetch('http://127.0.0.1:'+port+'/api/local/storage/status');assert.equal(r.status,200);const status=await r.json();
 assert.equal(status.folders.history.exists,false);assert.equal(status.folders.nodeModules.exists,false);assert.equal(status.folders.runtimeCache.exists,true);assert.equal(status.folders.runtimeCache.sizeBytes,0);assert.equal(status.folders.data.sizeBytes,5);assert(status.disk.totalBytes>0);
 assert.deepEqual(fs.readdirSync(temp).sort(),['cache','data','dist']);assert.equal(fs.readFileSync(temp+'/data/fixture.txt','utf8'),'12345');
 console.log('PASS fresh isolated storage endpoint: actual missing/empty/populated directories, no files created or cleared by startup/status');
}finally{child.kill('SIGTERM');await exited;fs.rmSync(temp,{recursive:true});}
const deploy=fs.readFileSync('scripts/deploy-storage-presence.mjs','utf8');
const plans=[{unit:'prizm',site:'solar-star-3',override:'/ss3.conf'},{unit:'prizm-site@ss4',site:'solar-star-4',override:'/ss4.conf'},{unit:'prizm-fleet',site:'fleet',override:'/fleet.conf'}];
const files=new Map(),commands=[],base={preserved:true};let state;
const context={plans,collector:'/new-collector',recovery:'/recovery',fleet:'/new-fleet',priorFleet:'/old-fleet',priorCollector:'/old-collector',backup:'/backup',assert,console:{log:()=>{}},fs:{writeFileSync:(p,t)=>files.set(p,t),readFileSync:p=>files.get(p),existsSync:p=>files.has(p),unlinkSync:p=>files.delete(p)},run:(cmd,args)=>commands.push([cmd,...args]),healthy:async(p,updated)=>assert.equal(updated,false),same:(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b)),invariants:()=>base,save:s=>{state=s;}};
vm.createContext(context);vm.runInContext(['entry','overrideText'].map(n=>fn(deploy,n)).join('\n'),context);
context.argv=unit=>{const p=plans.find(p=>p.unit===unit);return files.has(p.override)?/ExecStart=(\/usr\/bin\/node[^\n]+)/.exec(files.get(p.override))[1]:context.entry(p,p.site==='fleet'?context.priorFleet:context.priorCollector);};
for(const p of plans)files.set(p.override,context.overrideText(p,p.site==='fleet'?context.fleet:context.collector));
await vm.runInContext(fn(deploy,'restartCollector')+'\n'+fn(deploy,'rollback')+'\nrollback({before:{preserved:true},touched:plans.map(p=>p.unit)})',context);
assert.equal(state.rolledBack,true);assert.equal(files.size,0);assert.deepEqual(commands.filter(c=>c[1]==='restart').map(c=>c[2]),['prizm-fleet','prizm-site@ss4','prizm']);
console.log('PASS recovery simulation: reversed fixed targets, original future entrypoints, no persistent skip flags');
