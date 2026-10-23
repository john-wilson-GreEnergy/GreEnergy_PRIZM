// Read-only one-login-per-unit check of the new enrollment. Never retries or publishes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadStreamConfig} from '../../src/server/telemetry/sma/streamConfig';
import {SmaSessionError,SmaStreamSession} from '../../src/server/telemetry/sma/streamSession';
import {StreamPoints,STREAM_IDS} from '../../src/server/telemetry/sma/streamProtocol';
import {qualifyPcsProcessPoint} from '../../src/server/telemetry/pcsDataQuality';
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let safeFailure='enrollment, identity, permissions, or namespace check';
async function main(){
  const [site,dev,ino,...extra]=process.argv.slice(2);
  assert(!extra.length&&['SS3','SS4'].includes(site),'Specify the enrolled site and expected namespace');
  const ns=fs.statSync('/proc/self/ns/net');assert.equal(String(ns.dev),dev);assert.equal(String(ns.ino),ino);
  const directory=`/var/lib/prizm-sites/${site.toLowerCase()}/sma-stream-20261015-installer`;
  const config=loadStreamConfig({PRIZM_SMA_STREAM_ENABLED:'true',PRIZM_SMA_STREAM_KEY_FILE:directory+'/key',PRIZM_SMA_STREAM_VAULT:directory+'/vault.json'});
  assert(config);assert.equal(config.stationCode,site==='SS3'?'BHE0020':'BHE0021');assert.equal(config.blockCode,'B1');
  assert.deepEqual(config.targets.map(t=>t.array),site==='SS3'?[2,3,4,5,6,7,8]:[1,2,3,4,5,6,7]);
  assert(config.targets.every(t=>t.userLevel===1),'Installer role required');
  const manifest=JSON.parse(fs.readFileSync(`/var/lib/prizm-sites/${site.toLowerCase()}/sma-stream-20261015-installer-manifest.json`,'utf8'));
  const publicTargets=config.targets.map(({password:_,...target})=>target);
  assert.deepEqual(publicTargets,manifest.targets,'Enrollment and confirmed identities differ');
  const workers=config.targets.map(target=>{const points=new StreamPoints(target.deviceId);return {target,points,session:new SmaStreamSession(target,points)};});
  const running:Promise<void>[]=[];let failure:string|null=null;
  const sample=()=>workers.map(w=>({array:w.target.array,points:STREAM_IDS.map(id=>{
    safeFailure=`${site} Array ${w.target.array}: point ${id} missing or not advancing`;
    const point=w.points.snapshot()[id];assert(point,`${site} Array ${w.target.array}: point ${id} missing`);
    const q=qualifyPcsProcessPoint(point);assert.equal(q.readingState,'live',`${site} Array ${w.target.array}: point ${id} not advancing`);
    return {id,value:q.value,deviceTimestamp:q.timestamp,freshnessAt:q.freshnessAt,clockSkew:q.clockSkew};
  })}));
  try{
    for(const w of workers){
      if(failure)throw Error(failure);
      running.push(w.session.run().catch(error=>{failure=`${site} Array ${w.target.array}: ${error instanceof SmaSessionError?`${error.code} stage=${error.stage} reason=${error.reason}`:'transport'}`;safeFailure=failure;}));
      await sleep(1000);
    }
    await sleep(15000);if(failure)throw Error(failure);const first=sample();
    // Span the provider's session refresh, not just the initial retained messages.
    for(let n=0;n<15;n++){await sleep(5000);if(failure)throw Error(failure);}
    const last=sample();
    for(let a=0;a<last.length;a++)for(let p=0;p<STREAM_IDS.length;p++)assert(last[a].points[p].deviceTimestamp!>first[a].points[p].deviceTimestamp!,`${site}: timestamp did not progress`);
    console.log(JSON.stringify({site,status:'PASS',readOnly:true,arrays:publicTargets.map(t=>t.array),sessionRefreshWindowChecked:true,first,last}));
  }finally{
    for(const w of workers)w.session.stop();
    await Promise.allSettled(running);for(const t of config.targets)t.password='';
  }
}
main().catch(()=>{console.error('Read-only stream validation failed: '+safeFailure+'. No service or equipment settings changed; activation must stop.');process.exitCode=1;});
