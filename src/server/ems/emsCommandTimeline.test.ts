import assert from "node:assert/strict";
import {mkdtemp} from "node:fs/promises";
// All side effects stay in a temporary directory, and every fetch is intercepted.
const previousCwd=process.cwd(), originalFetch=globalThis.fetch;
process.chdir(await mkdtemp('/tmp/prizm-ems-command-history-'));
globalThis.fetch=async()=>{throw new Error('Unexpected fetch before fixture setup');};
const {ProfileStore}=await import('../profiles/profileStore');
const originalProfile=ProfileStore.getActiveProfile;
const profile={...ProfileStore.getActiveProfile(),emsHost:'fixture.invalid',stationCode:'Fixture',blockIndex:1};
ProfileStore.getActiveProfile=()=>profile;
const {buildEmsBaseUrl}=await import('../profiles/profileManager');
const {setMockLastCall,setEmsCachedBlock}=await import('../emsTurtleClient');
const {setEmsApplicationEnabledStatus}=await import('./dragonAppControl');
const {setPowerControl}=await import('./powerControl');
const {fetchLiveEmsApps}=await import('./emsAppsService');
const {stampEmsAppResponse}=await import('./emsAppProvenance');
const {operationalTimeline}=await import('../history/operationalTimeline');
const base=buildEmsBaseUrl(profile), recorder=operationalTimeline();
const payload={stationCode:'Fixture',blockIndex:1,dragonApps:[
  {appCode:'ADB0001',priority:300,enabled:false,health:'HEALTH_NOT_ENABLED'},
  {appCode:'PC00001',priority:40,enabled:false,appStatus:'Real Power: -5 kW\nReactive Power: 0 kVAr'}
]};
setMockLastCall(payload);stampEmsAppResponse(payload,new Date().toISOString(),base,true);setEmsCachedBlock(payload);
recorder.ingest({site:{id:JSON.stringify(['Fixture',1,base]),label:'Fixture'},observations:[]});await recorder.flush();
let posts=0,reads=0,reject=false;
globalThis.fetch=async(url,options)=>{
  const address=String(url);assert(address.startsWith(base+'/'),'All requests must target the intercepted fixture');
  if(options?.method==='POST') {
    posts++;
    assert(address.endsWith('/tools/controls/ems/command'));
    if(posts===2) assert(Buffer.from(options.body as Uint8Array).includes(Buffer.from('"enabled":false')),'Power command preserves existing disabled app state');
    return new Response(reject?'REJECTED':'OK',{status:reject?403:200});
  }
  reads++;
  if(address.includes('blockviewer/data?verifyTs=')) return Response.json({dragonApps:[{appCode:'ADB0001',priority:300,enabled:true}]});
  if(address.includes('lastCall.json?powerVerify=')) return Response.json(payload);
  throw new Error('Unexpected fixture endpoint');
};
try {
  assert.equal((await fetchLiveEmsApps()).apps[0].sourceLive,true);
  const result=await setEmsApplicationEnabledStatus({stationCode:'Fixture',blockIndex:1,appCode:'ADB0001',priority:300,enabled:true,confirmationText:'ENABLE ADB0001'});
  assert.equal(result.success,true);
  assert.equal((await fetchLiveEmsApps()).apps[0].sourceLive,false,'Locally patched enabled/health fields do not become fresh history');
  const power=await setPowerControl({stationCode:'Fixture',blockIndex:1,priority:40,realPowerkW:-5,reactivePowerkVAr:0});
  assert.equal(power.verified,true);
  reject=true;
  const rejected=await setPowerControl({stationCode:'Fixture',blockIndex:1,priority:40,realPowerkW:1,reactivePowerkVAr:2});
  assert.equal(rejected.success,false);
  assert.equal(posts,3);assert.equal(reads,2,'Timeline adds no readback requests');
  await recorder.flush();const report=await recorder.query(8,1,2);
  assert.equal(report.events.length,6);assert(report.events.every(e=>e.label==='Block 1 · All arrays'));
  assert(report.events.some(e=>e.message.includes('EMS app ADB0001 / priority 300: ENABLE')));
  assert(report.events.some(e=>e.message.includes('requested -5 kW, 0 kVAR')));
  assert(report.events.some(e=>e.message.includes('delivery: not accepted')));
  assert.equal(report.coverage.length,0,'Command readback is not independent telemetry coverage');
} finally {await recorder.close();globalThis.fetch=originalFetch;ProfileStore.getActiveProfile=originalProfile;process.chdir(previousCwd);}
console.log('EMS control hooks preserve payloads and request counts; command history verified with intercepted fetches only');
