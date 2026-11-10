import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readPowerSnapshot} from './stage/read-power-snapshot.mjs';
const root=path.dirname(new URL(import.meta.url).pathname),dir=fs.mkdtempSync(path.join(os.tmpdir(),'prizm-power-preflight-'));
const mapping=createRequire(import.meta.url)('./stage/payload/collector/power-evidence.cjs');
function fixture(station,kw=23289.2){return {cacheMeta:{fetchedAt:new Date().toISOString()},data:{siteIdentity:{stationCode:station,blockIndex:1},rawSources:{lastCall:{blockReport:{stationCode:station,blockIndex:1},dragonAppReport:{timestamp:String(Date.now()),dragonAppData:{dragonAppSlotData:[{appCode:'SSPC001',enabled:true,appStatus:`Recent AC Power Command received : ${kw} kW / 0.00 kVAr`}]}}}}}};}
try{
 const small=path.join(dir,'small.json'),f=fixture('BHE0020');fs.writeFileSync(small,JSON.stringify(f));
 assert.deepEqual(await readPowerSnapshot(small,{chunkSize:7}),f);
 for(const [station,kw]of [['BHE0020',23289.2],['BHE0021',0]]){
  const value=fixture(station,kw),large=path.join(dir,station+'.json'),fd=fs.openSync(large,'wx');
  fs.writeSync(fd,'{"ignored":[');const row=JSON.stringify({noise:'a\\"☀'.repeat(180)})+',';
  const block=row.repeat(1000);for(let i=0;i<80;i++)fs.writeSync(fd,block);
  fs.writeSync(fd,'null],'+JSON.stringify(value).slice(1));fs.closeSync(fd);
  assert(fs.statSync(large).size>64*1024**2);
  const text=execFileSync(process.execPath,['--max-old-space-size=128','--max-semi-space-size=8',root+'/stage/read-power-snapshot.mjs',large],{encoding:'utf8',timeout:45000,maxBuffer:3*1024**2});
  const projected=JSON.parse(text);assert.deepEqual(projected,value);
  assert.equal(mapping.projectSunspecRequest(projected.data.rawSources.lastCall,station,1).valueKw,kw);
  assert.equal(mapping.projectSunspecRequest(projected.data.rawSources.lastCall,'WRONG',1).valueKw,null);
  console.log('PASS',station,'large snapshot bytes',fs.statSync(large).size,'projection bytes',Buffer.byteLength(text));
 }
 for(const [name,text]of [['truncated',JSON.stringify(f).slice(0,-1)],['trailing',JSON.stringify(f)+'x'],['duplicate','{"cacheMeta":{},"cacheMeta":{}}'],['malformed','{"unused":[1,]}']]){
  const file=path.join(dir,name);fs.writeFileSync(file,text);await assert.rejects(()=>readPowerSnapshot(file));
 }
 const oversized=path.join(dir,'oversized');fs.writeFileSync(oversized,JSON.stringify(f));await assert.rejects(()=>readPowerSnapshot(oversized,{maxBytes:10}),/bounded scan limit/);
 const symlink=path.join(dir,'link');fs.symlinkSync(small,symlink);await assert.rejects(()=>readPowerSnapshot(symlink));
 const missing=path.join(dir,'missing');fs.writeFileSync(missing,'{}');const noData=await readPowerSnapshot(missing);assert.equal(mapping.projectSunspecRequest(noData.data.rawSources.lastCall,'BHE0020',1).valueKw,null);
 const huge=path.join(dir,'huge-projection');fs.writeFileSync(huge,JSON.stringify({cacheMeta:{unused:'x'.repeat(2*1024**2)}}));await assert.rejects(()=>readPowerSnapshot(huge),/projection limit/);
 console.log('PASS small chunks, zero, wrong identity, truncation, malformed JSON, trailing data, duplicates, limits, symlinks, missing evidence');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
