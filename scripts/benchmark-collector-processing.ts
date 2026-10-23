import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {EntityDomainBroker} from '../src/server/domainBrokers/EntityDomainBroker';
import {compactStringPublication} from '../src/server/telemetry/compactStringList';
import {findPcsCandidates} from '../src/server/normalizers/pcsCandidateSearch';
const summarize=(values:number[])=>{
  const sorted=values.slice().sort((a,b)=>a-b);
  return {medianMs:sorted[Math.floor(sorted.length/2)],maxMs:sorted.at(-1)};
};
for (const file of process.argv.slice(2)) {
  const bytes=readFileSync(file), snapshot=JSON.parse((file.endsWith('.gz')?gunzipSync(bytes):bytes).toString()).data;
  assert(['BHE0020','BHE0021'].includes(snapshot.siteIdentity.stationCode));
  const rows=snapshot.normalized.strings;
  assert.equal(rows.length,320);
  const full={domain:'strings',version:1,capturedAt:'2026-10-21T00:00:00Z',changes:rows.map((row:any)=>({key:`${row.arrayNumber}:${row.stringNumber}`,row,updatedAt:'2026-10-21T00:00:00Z'}))};
  assert.equal(JSON.stringify(structuredClone(compactStringPublication(full)))===JSON.stringify(compactStringPublication(structuredClone(full))),true,'Exact wire parity, independent of VM object prototypes');
  const dispatch=[];
  for (const connections of [1,4,8]) {
    const old:number[]=[],next:number[]=[];
    for(let pass=0;pass<7;pass++) for (const optimized of pass%2?[true,false]:[false,true]) {
      const start=performance.now();
      for(let i=0;i<connections;i++) {
        const result=optimized?structuredClone(compactStringPublication(full)):compactStringPublication(structuredClone(full));
        assert.equal(result.changes.length,320);
      }
      (optimized?next:old).push(performance.now()-start);
    }
    dispatch.push({connections,legacy:summarize(old),projected:summarize(next)});
  }
  const sources={block:snapshot.rawSources.nativeBlockSummary ?? snapshot.rawSources.block,
    status:snapshot.rawSources.status,lastCall:snapshot.rawSources.lastCall};
  // The summary overlays blockReport before traversing these same sources.
  for(const key of ['block','lastCall'] as const)if(sources[key]?.blockReport)sources[key]={...sources[key],...sources[key].blockReport};
  if(sources.status?.statusReport)sources.status={...sources.status,...sources.status.statusReport};
  const prior=findPcsCandidates(sources,false),next=findPcsCandidates(sources,true);
  assert.deepEqual(next,prior);
  next.pcsCandidates.forEach((row,index)=>assert.equal(row,prior.pcsCandidates[index]));
  const oldTimes:number[]=[],newTimes:number[]=[];
  for(let i=0;i<7;i++)for(const optimized of i%2?[true,false]:[false,true]){
    const start=performance.now();findPcsCandidates(sources,optimized);(optimized?newTimes:oldTimes).push(performance.now()-start);
  }
  // Verify publication/storage ownership using actual site rows as well.
  const broker=new EntityDomainBroker<any>('strings',r=>`${r.arrayNumber}:${r.stringNumber}`);
  let oldWire:any,newWire:any;
  broker.subscribe(p=>{oldWire=compactStringPublication(p);});
  broker.subscribeProjected(compactStringPublication,p=>{newWire=p;});
  broker.publish(rows,full.capturedAt);
  assert.equal(JSON.stringify(newWire)===JSON.stringify(oldWire),true,'Actual broker wire parity');
  console.log(JSON.stringify({site:snapshot.siteIdentity.stationCode,rows:rows.length,exactParity:true,
    publicationBytes:Buffer.byteLength(JSON.stringify(full)),compactBytes:Buffer.byteLength(JSON.stringify(compactStringPublication(full))),
    dispatch,pcsScan:{candidates:next.pcsCandidates.length,legacy:summarize(oldTimes),optimized:summarize(newTimes)}}));
}
