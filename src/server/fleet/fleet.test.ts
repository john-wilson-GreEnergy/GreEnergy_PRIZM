import assert from 'node:assert/strict';
import {emptyMetrics,metricKeys,type SiteEnrollment,type SiteSummary} from '../../core/fleet/model';
import {FleetBroker,IdentityConflict} from './FleetBroker';
import {buildSiteSummary} from './siteSummary';
import {fetchCollector,parseCollector,CollectorPoller} from './CollectorPoller';
import {parseExportConfig,collectorExportFromEnvironment} from './collectorExport';
import {readFileSync} from 'node:fs';

const one:SiteEnrollment={siteId:'ss3',blockId:'1',stationCode:'FIXTURE3',blockIndex:1,name:'Test site three'};
const two:SiteEnrollment={...one,siteId:'ss4',stationCode:'FIXTURE4',name:'Test site four'};
let now=Date.now();
const summary=(site:SiteEnrollment,power=100,capacity=100,soc=50):SiteSummary=>{
  const metrics=emptyMetrics(),observedAt=new Date(now).toISOString();
  for(const key of metricKeys)metrics[key]={value:0,observedAt,quality:'live',source:'fixture'};
  metrics.powerKw.value=power;metrics.capacityKwh.value=capacity;metrics.socPct.value=soc;
  return {...site,schema:'prizm-site-summary-v1',observedAt,stale:false,metrics};
};
assert.throws(()=>new FleetBroker([one,one]),/Duplicate/);
assert.throws(()=>new FleetBroker([one,{...one,siteId:'different'}]),/Duplicate/);
const broker=new FleetBroker([one,two],()=>now),all=new Set(['ss3','ss4']);
assert.equal(broker.view(all).totals.powerKw.value,null);
broker.accept('ss3',summary(one,0,100,20));broker.accept('ss4',summary(two,-50,300,80));
assert.equal(broker.view(all).totals.powerKw.value,-50);
assert.equal(broker.view(all).totals.socPct.value,65,'Capacity-weighted SOC');
assert.equal(broker.view(new Set(['ss3'])).totals.powerKw.value,0,'Real zero retained');
assert.equal(broker.view(new Set(['ss3'])).totals.powerKw.complete,true);
assert(!JSON.stringify(broker.view(new Set(['ss3']))).includes('ss4'),'Hidden sites absent from totals and coverage');
assert.equal(broker.view(new Set()).totals.powerKw.value,null);
const bad=summary(two);bad.metrics.powerKw.value=NaN;
assert.throws(()=>broker.accept('ss4',bad),/Invalid metric/);
const enormous=summary(two);enormous.metrics.powerKw.value=1e308;assert.throws(()=>broker.accept('ss4',enormous),/range/);
assert.equal(broker.view(all).sites[1].metrics.powerKw.value,-50,'Keep last known');
assert.equal(broker.view(all).sites[1].metrics.powerKw.quality,'stale');
assert.equal(broker.view(all).totals.powerKw.value,0);
assert.throws(()=>broker.accept('ss4',summary(one)),IdentityConflict);
assert.equal(broker.view(all).sites[1].status,'identity-conflict');
broker.accept('ss4',summary(two));
now+=15000;assert.equal(broker.view(all).totals.powerKw.value,null,'TTL expiry excludes totals');
const old=summary(one);old.observedAt=new Date(now-30000).toISOString();
assert.throws(()=>broker.accept('ss3',old),/Out-of-order/);
const future=summary(one);future.observedAt=new Date(now+1).toISOString();assert.throws(()=>broker.accept('ss3',future),/Future/);
const partial=summary(one);partial.metrics.socPct.value=null;partial.metrics.powerKw.observedAt=new Date(now+1).toISOString();
broker.accept('ss3',partial);assert.equal(broker.view(all).totals.socPct.value,null);assert.equal(broker.view(all).totals.powerKw.value,null);
partial.metrics.powerKw.value=9999;assert.notEqual(broker.view(all).sites[0].metrics.powerKw.value,9999,'Owned immutable input');

const enrolled={...one,profileId:'fixture-profile',emsBaseUrl:'http://10.0.0.3:8080'};
const stamp=new Date(now).toISOString();
const view={siteIdentity:{activeProfileId:enrolled.profileId,emsBaseUrl:enrolled.emsBaseUrl,stationCode:one.stationCode,blockIndex:1},
  liveStatus:{lastUpdated:stamp,state:'LIVE',stale:false,liveSucceeded:true,cacheUsed:false},
  modbusTelemetry:{available:true,stale:false,capturedAt:stamp},blockOperatingSummary:{modbus:{measuredKW:0,measuredKVAR:-1,targetKW:-5,stateOfChargePct:20,availableChargeKW:50,availableDischargeKW:40}},
  fleetCapacity:{installedCapacityKWh:100,onlineStoredKWh:20},stringSummary:{totalStrings:320,valid:true},topologyStatus:{warningTargetCount:2,alarmTargetCount:0},secret:'never export'};
const adapted=buildSiteSummary(view,enrolled);
assert.equal(adapted.metrics.powerKw.value,0);assert.equal(adapted.metrics.reactiveKvar.value,-1);assert.equal(adapted.metrics.storedKwh.value,null);
assert(!JSON.stringify(adapted).includes('never export'));
assert.throws(()=>buildSiteSummary({...view,siteIdentity:{...view.siteIdentity,emsBaseUrl:'http://10.0.0.9'}},enrolled),IdentityConflict);
assert.equal(buildSiteSummary({...view,modbusTelemetry:{...view.modbusTelemetry,stale:true}},enrolled).metrics.powerKw.quality,'stale');
const token='a'.repeat(43),collector=parseCollector({...one,url:'https://collector.example/api/fleet/site-summary',token});
for(const url of ['http://10.0.0.3/api/fleet/site-summary','https://collector.example/other','https://collector.example/api/fleet/site-summary?url=evil','https://u:p@collector.example/api/fleet/site-summary'])assert.throws(()=>parseCollector({...one,url,token},true));
assert.throws(()=>parseExportConfig({identity:enrolled,origin:'http://10.0.0.15:3000',allowLoopbackHttp:true,token}));
assert(parseExportConfig({identity:enrolled,origin:'http://localhost:3000',allowLoopbackHttp:true,token}));
const previous=process.env.PRIZM_FLEET_EXPORT_CONFIG;delete process.env.PRIZM_FLEET_EXPORT_CONFIG;
assert.equal(collectorExportFromEnvironment(()=>{throw new Error('Must not read');},()=>false),null);
if(previous!==undefined)process.env.PRIZM_FLEET_EXPORT_CONFIG=previous;
let options:RequestInit|undefined;
const fakeFetch:typeof fetch=async(_url,init)=>{options=init;return new Response(JSON.stringify(adapted),{headers:{'content-type':'application/json'}});};
assert.deepEqual(await fetchCollector(collector,new AbortController().signal,fakeFetch),adapted);
assert.equal(options!.redirect,'error');assert.equal(options!.method,'GET');assert.equal((options!.headers as Record<string,string>).Authorization,'Bearer '+token);
await assert.rejects(fetchCollector(collector,new AbortController().signal,async()=>new Response('x'.repeat(263000),{headers:{'content-type':'application/json'}})),/too large/);
await assert.rejects(fetchCollector(collector,new AbortController().signal,async()=>new Response('html')),/unavailable/);
let calls=0,active=0,maxActive=0;
const poller=new CollectorPoller(new FleetBroker([one]),[collector],async(_site,signal)=>{
  calls++;active++;maxActive=Math.max(active,maxActive);
  return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{active--;reject(new Error('stop'));},{once:true}));
});
poller.start();poller.start();await new Promise(r=>setTimeout(r,25));await poller.stop();assert.equal(calls,1);assert.equal(maxActive,1);assert.equal(active,0);
if(process.argv[2]){
  const live=JSON.parse(readFileSync(process.argv[2],'utf8')),identity=live.siteIdentity;
  const configured={...one,stationCode:identity.stationCode,blockIndex:identity.blockIndex,profileId:identity.activeProfileId,emsBaseUrl:identity.emsBaseUrl};
  const projected=buildSiteSummary(live,configured);
  assert.equal(projected.metrics.powerKw.value,live.blockOperatingSummary.modbus.measuredKW);
  assert.equal(projected.metrics.targetKw.value,live.blockOperatingSummary.modbus.targetKW);
  assert.equal(projected.metrics.capacityKwh.value,live.fleetCapacity.installedCapacityKWh);
  assert.equal(projected.metrics.warnings.value,live.topologyStatus.warningTargetCount);
  console.log('Captured canonical live summary: fleet metric parity verified (no acquisition or writes)');
}
console.log('Fleet identity, quality, aggregate, adapter and bounded transport tests passed');
