// Deployment-only reader: no network calls and no writes to site data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const {JSONParser}=createRequire(import.meta.url)('./vendor/streamparser-json/cjs/index.js');
export async function readPowerSnapshot(file,{maxBytes=512*1024**2,chunkSize=64*1024}={}) {
 const handle=await fs.promises.open(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try {
  const before=await handle.stat();assert(before.isFile(),'Snapshot must be a regular file');
  assert(before.size>0&&before.size<=maxBytes,`Snapshot exceeds bounded scan limit (${before.size} bytes; limit ${maxBytes})`);
  const paths=['cacheMeta','data.siteIdentity','data.rawSources.lastCall.blockReport.stationCode','data.rawSources.lastCall.blockReport.blockIndex','data.rawSources.lastCall.dragonAppReport'];
  const selected=new Map();let retained=0,bytes=0;
  const parser=new JSONParser({paths:paths.map(p=>'$.'+p),keepStack:false,stringBufferSize:65536,numberBufferSize:1024});
  parser.onValue=(value,key,_parent,stack)=>{
   const name=[...stack.slice(1).map(s=>s.key),key].join('.');
   assert(paths.includes(name),'Unexpected selected path');assert(!selected.has(name),'Duplicate snapshot evidence path: '+name);
   retained+=Buffer.byteLength(JSON.stringify(value));assert(retained<=2*1024**2,'Power evidence exceeds bounded projection limit');selected.set(name,value);
  };
  const stream=handle.createReadStream({highWaterMark:chunkSize,autoClose:false});
  for await(const chunk of stream){bytes+=chunk.length;assert(bytes<=maxBytes,'Snapshot grew beyond bounded scan limit');parser.write(chunk);}
  if(!parser.isEnded)parser.end();assert(parser.isEnded,'Incomplete snapshot');
  const after=await handle.stat();assert(bytes===before.size&&after.size===before.size&&after.mtimeMs===before.mtimeMs,'Snapshot changed during read; retry required');
  const data={siteIdentity:selected.get('data.siteIdentity'),rawSources:{lastCall:{blockReport:{stationCode:selected.get('data.rawSources.lastCall.blockReport.stationCode'),blockIndex:selected.get('data.rawSources.lastCall.blockReport.blockIndex')},dragonAppReport:selected.get('data.rawSources.lastCall.dragonAppReport')}}};
  return {cacheMeta:selected.get('cacheMeta'),data};
 } finally {await handle.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{assert.equal(process.argv.length,3);console.log(JSON.stringify(await readPowerSnapshot(process.argv[2])));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
