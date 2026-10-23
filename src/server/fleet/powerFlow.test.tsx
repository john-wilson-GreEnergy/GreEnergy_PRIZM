import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {projectSitePowerFlow} from './powerFlow';
import {emptyMetrics,type SiteView} from '../../core/fleet/model';
import {emptyDetails,emptyRange,type FleetArray} from '../../core/fleet/details';
import {SitePowerFlow} from '../../components/SitePowerFlow';
import {FleetBroker} from './FleetBroker';

const now=Date.now(),stamp=new Date(now).toISOString();
const site:SiteView={siteId:'ss4',stationCode:'BHE0021',blockIndex:1,blockId:'b1',name:'Solar Star 4',
 status:'current',observedAt:stamp,ageMs:0,lastReceivedAt:stamp,metrics:emptyMetrics(),details:emptyDetails()};
site.metrics.powerKw={value:-22000,source:'EMS Modbus',quality:'live',observedAt:stamp};
const array=(n:number,power:number):FleetArray=>({number:n,powerKw:power,pcsObservedAt:stamp,pcsQuality:'live',
 observedAt:stamp,quality:'live',stringCount:40,onlineStrings:40,outOfRotation:0,socPct:50,socObservedAt:stamp,socQuality:'live',busVoltage:1400,
 pcsState:'GridFeed',rotation:'IN',voltageMv:emptyRange(),temperatureC:emptyRange()});
site.details!.arrays=[array(1,-200),array(2,150)];
let flow=projectSitePowerFlow(site,now);
assert.equal(flow.net.direction,'charging');assert.equal(flow.net.powerKw,-22000);
assert.equal(flow.arrays[1].direction,'discharging');assert.equal(flow.mixed,true);
assert.equal(flow.partial,false);assert.equal(flow.net.validUntil,now+15000);
assert.equal(flow.arrays[0].soc?.percent,50);assert.equal(flow.arrays[0].soc?.quality,'live');
assert.equal(flow.arrays[0].soc?.coverage?.label,'40/40 strings connected');
for(const connected of [0,38,40]){
 site.details!.arrays[0].onlineStrings=connected;
 const model=projectSitePowerFlow(site,now);
 assert.equal(model.arrays[0].soc?.coverage?.partial,connected<40);
 assert(renderToStaticMarkup(<SitePowerFlow flow={model} siteName={site.name}/>).includes(`${connected}/40 strings connected`));
 if(connected===0){
  const single={...model,arrays:[model.arrays[0]]};
  const markup=renderToStaticMarkup(<SitePowerFlow flow={single} siteName={site.name}/>);
  assert(markup.includes('Reported SOC'));assert(!markup.includes('data-soc-percent'));
 }
}
for(const connected of [null,-1,41,1.5,NaN]){
 site.details!.arrays[0].onlineStrings=connected;
 assert.equal(projectSitePowerFlow(site,now).arrays[0].soc?.coverage,null);
}
site.details!.arrays[0].onlineStrings=40;
site.details!.arrays[0].stringCount=null;
assert.equal(projectSitePowerFlow(site,now).arrays[0].soc?.coverage,null);
site.details!.arrays[0].stringCount=40;
for(const pct of [0,50,100]){
 site.details!.arrays[0].socPct=pct;
 const model=projectSitePowerFlow(site,now);
 assert.equal(model.arrays[0].soc?.percent,pct);
 assert(renderToStaticMarkup(<SitePowerFlow flow={model} siteName={site.name}/>).includes(`data-soc-percent="${pct}"`));
}
for(const pct of [null,-1,101,NaN]){
 site.details!.arrays[0].socPct=pct;
 assert.equal(projectSitePowerFlow(site,now).arrays[0].soc?.quality,'unknown');
 assert.equal(projectSitePowerFlow(site,now).arrays[0].soc?.percent,null);
}
site.details!.arrays[0].socPct=50;
site.details!.arrays[0].socObservedAt=new Date(now+1).toISOString();
assert.equal(projectSitePowerFlow(site,now).arrays[0].soc?.quality,'unknown');
site.details!.arrays[0].socObservedAt=stamp;
site.details!.arrays[0].socQuality='stale';
assert.equal(projectSitePowerFlow(site,now).arrays[0].soc?.quality,'stale');
site.details!.arrays[0].socQuality='live';
for(const [kw,direction] of [[250,'discharging'],[-250,'charging'],[0,'idle'],[.5,'idle'],[-.5,'idle'],[14.99,'idle'],[-14.99,'idle'],[15,'idle'],[-15,'idle'],[15.01,'discharging'],[-15.01,'charging']] as const){
 site.metrics.powerKw.value=kw;
 const model=projectSitePowerFlow({...site,details:{...site.details!,arrays:[array(1,kw)]}},now);
 assert.equal(model.net.direction,direction);
 assert.equal(model.arrays[0].direction,direction);
 assert.equal(model.arrays[0].powerKw,kw,'Deadband must not round away measured power');
 const markup=renderToStaticMarkup(<SitePowerFlow flow={model} siteName={site.name}/>);
 assert.equal(markup.includes('pf-moving'),direction!=='idle');
}
site.metrics.powerKw.value=null;assert.equal(projectSitePowerFlow(site,now).net.direction,'unknown');
site.metrics.powerKw.value=NaN;assert.equal(projectSitePowerFlow(site,now).net.direction,'unknown');
site.metrics.powerKw.value=-200;
for(const status of ['stale','unavailable','identity-conflict'] as const){
 site.status=status;assert.equal(projectSitePowerFlow(site,now).net.direction,'stale');
}
site.status='current';
assert.equal(projectSitePowerFlow(site,now+15000).net.direction,'stale');
assert.equal(projectSitePowerFlow(site,now-1).net.direction,'unknown');
site.metrics.powerKw.source='Command setpoint';assert.equal(projectSitePowerFlow(site,now).net.direction,'unknown');
site.metrics.powerKw.source='EMS Modbus';
site.stationCode='UNVERIFIED';assert.equal(projectSitePowerFlow(site,now).net.direction,'unknown');
site.stationCode='BHE0021';site.details!.arrays[1].pcsQuality='stale';
assert.equal(projectSitePowerFlow(site,now).partial,true);
flow=projectSitePowerFlow(site,now);
const html=renderToStaticMarkup(<SitePowerFlow flow={flow} siteName={site.name}/>);
assert(html.includes('Electrons not to scale'),'Shared Fleet/mobile/block caption');
assert(html.includes('Grid → Inverters → Batteries'));assert(!html.includes('pf-reverse'));
assert(html.includes('pf-moving'));assert(html.includes('Pause power-flow'));
assert(html.includes('Partial coverage'));assert(html.includes('not switch-position'));
assert(html.includes('Inverter 1'));assert(html.includes('Inverter 2'));
assert(html.includes('Shared grid bus'));assert.equal((html.match(/role="listitem"/g)??[]).length,2);
const stale=renderToStaticMarkup(<SitePowerFlow flow={projectSitePowerFlow(site,now+15001)} siteName={site.name}/>);
assert(!stale.includes('pf-moving'));assert(stale.includes('Stale'));
assert(!stale.includes('data-soc-percent'));assert(stale.includes('SOC stale'));
assert(stale.includes('Last: 40/40 strings connected'));
site.metrics.powerKw.value=200;
const discharging=renderToStaticMarkup(<SitePowerFlow flow={projectSitePowerFlow(site,now)} siteName={site.name}/>);
assert(discharging.includes('Batteries → Inverters → Grid'));assert(discharging.includes('pf-reverse'));
site.metrics.powerKw.value=0;
// Active branches must keep their own direction even with zero net power.
assert(renderToStaticMarkup(<SitePowerFlow flow={projectSitePowerFlow(site,now)} siteName={site.name}/>).includes('pf-moving'));
site.details!.arrays=[array(1,0),array(2,0)];
assert(!renderToStaticMarkup(<SitePowerFlow flow={projectSitePowerFlow(site,now)} siteName={site.name}/>).includes('pf-moving'));
// Eight individually idle arrays must not activate shared-grid motion through
// their aggregate. Preserve the measured net reading and independent branches.
for(const kw of [10,-10,15,-15]){
 site.metrics.powerKw.value=kw*8;
 site.details!.arrays=Array.from({length:8},(_,i)=>array(i+1,kw));
 const model=projectSitePowerFlow(site,now);
 assert(model.arrays.every(a=>a.direction==='idle'));
 assert.equal(model.net.powerKw,kw*8);
 const markup=renderToStaticMarkup(<SitePowerFlow flow={model} siteName={site.name}/>);
 assert(!markup.includes('pf-moving'));
 assert(markup.includes('no array above the display threshold'));
}
site.metrics.powerKw.value=80;
site.details!.arrays=[array(1,20),array(2,10)];
const oneMoving=projectSitePowerFlow(site,now);
assert(renderToStaticMarkup(<SitePowerFlow flow={oneMoving} siteName={site.name}/>).includes('pf-moving'));
oneMoving.arrays[0].validUntil=Date.now()-1;
assert(!renderToStaticMarkup(<SitePowerFlow flow={oneMoving} siteName={site.name}/>).includes('pf-moving'),'Expired sole active array must also stop the shared link');
site.details!.arrays=[array(1,-200),array(2,150)];
flow=projectSitePowerFlow(site,now);
const mixed=renderToStaticMarkup(<SitePowerFlow flow={flow} siteName={site.name}/>);
assert(mixed.includes('Mixed directions'));assert(mixed.includes('pf-reverse'));
assert(mixed.includes('pf-branch pf-charging'));assert(mixed.includes('pf-branch pf-discharging'));
// Expired branches stop even if the browser has not received another snapshot.
const expiredFlow={...flow,net:{...flow.net,validUntil:Date.now()-1},arrays:flow.arrays.map(a=>({...a,validUntil:Date.now()-1}))};
assert(!renderToStaticMarkup(<SitePowerFlow flow={expiredFlow} siteName={site.name}/>).includes('pf-moving'));
const expiredSoc={...flow,arrays:flow.arrays.map(a=>({...a,soc:{...a.soc!,validUntil:Date.now()-1}}))};
assert(!renderToStaticMarkup(<SitePowerFlow flow={expiredSoc} siteName={site.name}/>).includes('data-soc-percent'));
// One expired branch must not suppress a different fresh branch.
const partialFlow={...flow,arrays:flow.arrays.map((a,i)=>i===0?{...a,validUntil:Date.now()-1}:a)};
const partialHtml=renderToStaticMarkup(<SitePowerFlow flow={partialFlow} siteName={site.name}/>);
assert(partialHtml.includes('pf-branch pf-stale'));assert(partialHtml.includes('pf-branch pf-discharging'));
assert(partialHtml.includes('pf-moving'));
site.metrics.powerKw.value=-200;
assert.equal(renderToStaticMarkup(<SitePowerFlow flow={undefined} siteName="Legacy"/>),'');
const css=readFileSync(new URL('../../components/sitePowerFlow.css',import.meta.url),'utf8');
assert(css.includes('prefers-reduced-motion'));assert(css.includes('animation-play-state:paused'));
const broker=new FleetBroker([site],()=>now);
broker.accept(site.siteId,{...site,schema:'prizm-site-summary-v1',stale:false});
assert.equal(broker.view(new Set([site.siteId])).sites[0].powerFlow?.net.direction,'charging');
const previous=process.env.PRIZM_FLEET_POWER_FLOW;
try{process.env.PRIZM_FLEET_POWER_FLOW='false';assert.equal(broker.view(new Set([site.siteId])).sites[0].powerFlow,undefined);}
finally{if(previous===undefined)delete process.env.PRIZM_FLEET_POWER_FLOW;else process.env.PRIZM_FLEET_POWER_FLOW=previous;}
assert.equal(broker.view(new Set()).sites.length,0);
console.log('PASS measured-power direction, deadband, per-array mixed flow, stale/missing/future/unverified data, no command inference, scoped broker, rollback, motion and accessible static fallback');
