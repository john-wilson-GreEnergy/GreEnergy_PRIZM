import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {EventEmitter} from 'node:events';
import type tls from 'node:tls';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type WebSocket from 'ws';
import {validateStreamConfig,openConfig,sealConfig,loadStreamConfig,type SmaStreamTarget} from './streamConfig';
import {StreamPoints,MqttFrames,mqttConnect,mqttSubscribe,mqttDisconnect,mqttPing} from './streamProtocol';
import {qualifyPcsProcessPoint} from '../pcsDataQuality';
import {SmaStreamSession,SmaSessionError,PinnedSmaAgent,type SessionTransport} from './streamSession';
import {verifyPrivateFile,createPrivateDirectory} from './privateStorage';
import {SmaStreamRuntime,reconnectDelay,matchesStreamSite} from './streamRuntime';
import {mergeSmaStreamSnapshots,type PcsSwitchTelemetry} from '../modbusOperationalTelemetry';
import {projectFleetPcs} from '../../fleet/pcsProjection';
import {parseFleetDetails,ageFleetDetails} from '../../fleet/detailValidation';
import {emptyDetails} from '../../../core/fleet/details';

const target:SmaStreamTarget={array:2,host:'10.0.2.118',deviceId:'1179842054052',fingerprint256:Array(32).fill('AB').join(':'),userLevel:0,password:'test-only-not-a-device-password'};
const config={version:1 as const,stationCode:'BHE0021',blockCode:'B1',targets:[target]};
const key=randomBytes(32),sealed=sealConfig(config,key);
assert.ok(!sealed.includes(target.password));assert.deepEqual(openConfig(sealed,key),config);
assert.throws(()=>openConfig(sealed,randomBytes(32)));assert.throws(()=>openConfig(sealed.replace(/"tag":"./,'"tag":"!'),key));
assert.equal(loadStreamConfig({}),null);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'prizm-sma-vault-test-')),privateDir=path.join(temp,'credentials');
createPrivateDirectory(privateDir);fs.writeFileSync(path.join(privateDir,'key'),key,{mode:0o600});fs.writeFileSync(path.join(privateDir,'vault'),sealed,{mode:0o600});
assert.deepEqual(loadStreamConfig({PRIZM_SMA_STREAM_ENABLED:'true',PRIZM_SMA_STREAM_KEY_FILE:path.join(privateDir,'key'),PRIZM_SMA_STREAM_VAULT:path.join(privateDir,'vault')}),config);
if(process.platform!=='win32'){fs.chmodSync(path.join(privateDir,'key'),0o644);assert.throws(()=>verifyPrivateFile(path.join(privateDir,'key'),32));}
for(const change of [{host:'10.0.3.118'},{array:0},{deviceId:'+/x'},{fingerprint256:''},{userLevel:2},{password:''}])
  assert.throws(()=>validateStreamConfig({...config,targets:[{...target,...change}]}));
assert.throws(()=>validateStreamConfig({...config,targets:[target,target]}));
assert.equal(matchesStreamSite(config,{stationCode:'BHE0020',blockCode:'B1'}),false);
assert.equal(matchesStreamSite(config,{stationCode:'BHE0021',blockCode:'B1'}),true);
assert.deepEqual([1,2,3,12].map(reconnectDelay),[5000,10000,20000,300000]);

const now=Date.parse('2026-10-01T17:33:00Z'),oldStamp=39916854;
const points=new StreamPoints(target.deviceId);
const payload=(stamp:number,quality=0)=>Buffer.from(JSON.stringify({data:{processData:{332:[13,stamp,quality],6070:[613552417,stamp,quality],6644:[760.7,stamp,quality],6100:[44.7,stamp,quality]}}}));
points.begin();points.ingest('process/other',payload(oldStamp),false,now);assert.deepEqual(points.snapshot(),{});
points.ingest(`process/${target.deviceId}`,payload(oldStamp),true,now);assert.deepEqual(points.snapshot(),{});
points.ingest(`process/${target.deviceId}`,payload(oldStamp),false,now);
assert.equal(qualifyPcsProcessPoint(points.snapshot()[6644],now).readingState,'unverified');
points.ingest(`process/${target.deviceId}`,payload(oldStamp+1),false,now+1000);
let q=qualifyPcsProcessPoint(points.snapshot()[6644],now+1000);
assert.equal(q.readingState,'live');assert.equal(q.clockSkew,true);assert.match(q.observedAt!,/^1971/);assert.match(q.freshnessAt!,/^2026/);
points.ingest(`process/${target.deviceId}`,payload(oldStamp+1),false,now+14_000);
assert.equal(qualifyPcsProcessPoint(points.snapshot()[6644],now+16_001).readingState,'stale','cached messages must not renew freshness');
const live=mergeSmaStreamSnapshots([],[{array:2,host:target.host,points:points.snapshot(),status:'connected'}],now+1000);
assert.equal(live[0].source,'SMA_MQTT');assert.equal(live[0].inverterOperatingState,'GridFeed');assert.equal(live[0].stale,false);
const identity={stationCode:'BHE0021',blockIndex:1,activeProfileId:'ss4',emsBaseUrl:'http://10.0.0.3:8080/turtle'};
const published={...live[0],smaProcessData:Object.fromEntries(Object.entries(live[0].smaProcessData).map(([k,p])=>[k,qualifyPcsProcessPoint(p,now+1000)]))};
const fleet=projectFleetPcs({siteIdentity:identity,pcs:[{arrayIndex:2,pcsIndex:1,pcsSwitches:published}]},identity);
assert.equal(fleet[0].insulationKohm.value,760.7);assert.equal(fleet[0].insulationKohm.source,'SMA stream');assert.equal(fleet[0].insulationKohm.quality,'live');
assert.equal(fleet[0].insulationKohm.clockSkew,true);assert.ok(Math.abs(Number(fleet[0].maxIgbtF.value)-112.46)<0.01);
const details=parseFleetDetails({...emptyDetails(),pcs:fleet});assert.equal(details.pcs![0].insulationKohm.clockSkew,true);
assert.equal(ageFleetDetails(details,now+600_000,true).pcs![0].insulationKohm.quality,'stale');
points.end();assert.equal(qualifyPcsProcessPoint(points.snapshot()[6644],now+1000).readingState,'stale');
const fallback={...live[0],source:'SMA_WEB_PROCESS_DATA' as const,stale:false,capturedAt:new Date(now+1000).toISOString()};
assert.equal(mergeSmaStreamSnapshots([fallback],[{array:2,host:target.host,points:points.snapshot(),status:'transport'}],now+1000)[0].source,'SMA_WEB_PROCESS_DATA');
points.begin();points.ingest(`process/${target.deviceId}`,payload(oldStamp+3),false,now+2000);
assert.equal(qualifyPcsProcessPoint(points.snapshot()[6644],now+2000).readingState,'unverified','new connections need new progression');
points.ingest(`process/${target.deviceId}`,payload(oldStamp+4),false,now+3000);
points.ingest(`process/${target.deviceId}`,payload(oldStamp+4,5),false,now+4000);
assert.equal(qualifyPcsProcessPoint(points.snapshot()[6644],now+4000).readingState,'unavailable');
points.ingest(`process/${target.deviceId}`,payload(oldStamp-10),false,now+5000);
assert.equal(qualifyPcsProcessPoint(points.snapshot()[6644],now+5000).readingState,'unverified');

const frames=new MqttFrames();assert.deepEqual(frames.push(Buffer.from([0x20])),[]);assert.deepEqual(frames.push(Buffer.from([2,0,0])),[{header:0x20,body:Buffer.from([0,0])}]);
assert.throws(()=>new MqttFrames().push(Buffer.from([0x30,255,255,255,255,1])));
assert.throws(()=>new MqttFrames().push(Buffer.alloc(1024*1024+1)));
for(const b of [mqttConnect('fake-token'),mqttSubscribe(target.deviceId),mqttPing(),mqttDisconnect()])assert.ok([1,8,12,14].includes(b[0]>>4),'outbound MQTT cannot publish');

class FakeSocket extends EventEmitter {
  readyState=1;sent:Buffer[]=[];
  send(b:Buffer){this.sent.push(b);if(b[0]===0x10)queueMicrotask(()=>this.emit('message',Buffer.from([0x20,2,0,0])));
    if(b[0]===0x82)queueMicrotask(()=>this.emit('message',Buffer.from([0x90,3,0,1,0])));}
  close(){this.readyState=3;this.emit('close');}terminate(){this.readyState=3;}
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
for(const good of [false,true]){
  let released=false,destroyed=false;
  class FakeTls extends EventEmitter {setTimeout(){return this;}destroy(){destroyed=true;return this;}getPeerCertificate(){return {fingerprint256:good?target.fingerprint256:'wrong'};}}
  const socket=new FakeTls();
  const agent=new PinnedSmaAgent(target,(_options,ready)=>{queueMicrotask(ready);return socket as unknown as tls.TLSSocket;});
  agent.createConnection({},(error)=>{if(!error)released=true;else assert.equal((error as SmaSessionError).code,'certificate');});
  assert.equal(released,false,'socket cannot be handed to HTTP before pin validation');await tick();
  assert.equal(released,good);assert.equal(destroyed,!good);agent.destroy();
}
async function sessionTest(ret:boolean){
  const socket=new FakeSocket(),requests:string[]=[],store=new StreamPoints(target.deviceId);
  const transport:SessionTransport={request:async(path)=>{requests.push(path);return {data:{ret}};},token:()=> 'fake-token',socket:()=>{queueMicrotask(()=>socket.emit('open'));return socket as unknown as WebSocket;},dispose:()=>{}};
  const session=new SmaStreamSession(target,store,transport);let failed:unknown;
  const running=session.run().catch(e=>{failed=e;});await tick();
  if(ret){assert.equal(store.connected,true);
    // Exercise the actual session decoder as well as the pure point store.
    const pub=(stamp:number)=>{const topic=Buffer.from(`process/${target.deviceId}`),size=Buffer.alloc(2);size.writeUInt16BE(topic.length);const body=Buffer.concat([size,topic,payload(stamp)]);let n=body.length;const len:number[]=[];do{const d=n%128;n=Math.floor(n/128);len.push(d|(n?128:0));}while(n);return Buffer.concat([Buffer.from([0x30,...len]),body]);};
    socket.emit('message',pub(oldStamp));socket.emit('message',pub(oldStamp+1));assert.equal(qualifyPcsProcessPoint(store.snapshot()[6644]).readingState,'live');
    session.stop();}await running;
  assert.equal(requests.at(-1),'/home/logout');assert.equal(store.connected,false);
  if(!ret){assert.equal((failed as SmaSessionError).code,'authentication');assert.equal((failed as SmaSessionError).stage,'login');assert.equal((failed as SmaSessionError).reason,'rejected');}
  assert.ok(socket.sent.every(b=>[1,8,12,14].includes(b[0]>>4)));
}
await sessionTest(true);await sessionTest(false);
// Diagnostic metadata is local enums/numbers, never upstream text or secrets.
const diagnosticSocket=new FakeSocket();
const diagnosticTransport:SessionTransport={request:async()=>({data:{ret:true}}),token:()=> 'fake-token',socket:()=>{queueMicrotask(()=>diagnosticSocket.emit('open'));return diagnosticSocket as unknown as WebSocket;},dispose:()=>{}};
const diagnosticRun=new SmaStreamSession(target,new StreamPoints(target.deviceId),diagnosticTransport).run();
const diagnosticAssertion=assert.rejects(diagnosticRun,(e:SmaSessionError)=>e.code==='transport'&&e.stage==='websocket'&&e.reason==='closed'&&e.detail===1006);
await tick();diagnosticSocket.emit('close',1006,Buffer.from('sensitive upstream text'));await diagnosticAssertion;
let attempts=0;
const runtime=new SmaStreamRuntime({...config,targets:[{...target}]},(t,p)=>{attempts++;return new SmaStreamSession(t,p,{request:async()=>({data:{ret:false}}),token:()=>'',socket:()=>{throw Error('never');},dispose:()=>{}});});
runtime.tick({stationCode:'BHE0020',blockCode:'B1'});assert.equal(attempts,0);
runtime.tick(config);await tick();runtime.tick(config,Date.now()+1_000_000);assert.equal(attempts,1,'bad credentials must not cause repeated logins');
runtime.stop();assert.deepEqual(runtime.snapshots(config),[]);
let retryCount=0;
const retryRuntime=new SmaStreamRuntime({...config,targets:[{...target}]},(t,p)=>{retryCount++;return new SmaStreamSession(t,p,{request:async()=>{throw new SmaSessionError('transport');},token:()=>'',socket:()=>{throw Error('never');},dispose:()=>{}});});
retryRuntime.tick(config);await tick();retryRuntime.tick(config);assert.equal(retryCount,1);retryRuntime.tick(config,Date.now()+10_000);await tick();assert.equal(retryCount,2);retryRuntime.stop();
assert.deepEqual(mergeSmaStreamSnapshots([fallback],[],now),[fallback],'flag-off rollback preserves legacy');
console.log('SMA stream: vault, identity, freshness, framing, session cleanup, credential circuit breaker, legacy fallback and Fleet projection passed');
