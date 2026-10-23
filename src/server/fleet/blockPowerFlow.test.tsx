import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {buildBlockPowerFlow} from './blockPowerFlow';
import {buildSiteSummary} from './siteSummary';
import {FleetBroker} from './FleetBroker';
import {fleetDetailFixture} from './fleetDetailFixture';
import {SitePowerFlow} from '../../components/SitePowerFlow';

const now=Date.now(),stamp=new Date(now).toISOString();
for(const stationCode of ['BHE0020','BHE0021']){
 const fixture=fleetDetailFixture(stationCode,stamp);
 const identity={...fixture.view.siteIdentity,activeProfileId:'verified-profile',emsBaseUrl:'http://10.0.0.3:8080'};
 const enrollment={siteId:'site',blockId:'b1',stationCode,blockIndex:1,name:stationCode,profileId:identity.activeProfileId,emsBaseUrl:identity.emsBaseUrl};
 const view={...fixture.view,siteIdentity:identity,liveStatus:{...fixture.view.liveStatus,state:'LIVE'},
  blockOperatingSummary:{modbus:{measuredKW:-1000}},modbusTelemetry:{available:true,stale:false,capturedAt:stamp},
  pcsSummary:fixture.view.pcsSummary.map((p,i)=>({...p,acRealPowerKW:i===0?0:i===1?200:-200}))};
 const broker=new FleetBroker([enrollment],()=>now);broker.accept('site',buildSiteSummary(view,enrollment));
 const flow=buildBlockPowerFlow(view,now);
 assert.deepEqual(flow,broker.view(new Set(['site'])).sites[0].powerFlow,'Block and Fleet must use identical power/freshness rules');
 assert.equal(flow?.net.direction,'charging');assert.equal(flow?.arrays.length,8);assert.equal(flow?.mixed,true);
 assert.equal(flow?.arrays[0].soc?.percent,fixture.view.arraySummary[0].onlineSOC);
 assert.equal(flow?.arrays[0].soc?.quality,'live');
 assert.equal(flow?.arrays[2].soc?.coverage?.label,'38/40 strings connected');
 assert.equal(buildBlockPowerFlow({...view,sourceHealth:[]},now)?.arrays[0].soc?.quality,'unknown');
 const html=renderToStaticMarkup(<SitePowerFlow flow={flow} siteName={stationCode}/>);
 assert.equal((html.match(/role="listitem"/g)??[]).length,8);
 assert(html.includes('pf-branch pf-idle'));assert(html.includes('pf-branch pf-charging'));assert(html.includes('pf-branch pf-discharging'));
 assert.equal(buildBlockPowerFlow(view,now+16000)?.net.direction,'stale');
 assert.equal(buildBlockPowerFlow({...view,pcsSummary:[]},now)?.partial,true);
 assert.equal(buildBlockPowerFlow({...view,siteIdentity:{}},now),undefined);
 assert.equal(buildBlockPowerFlow(view,now-1),undefined);
 const old=process.env.PRIZM_FLEET_POWER_FLOW;
 try{process.env.PRIZM_FLEET_POWER_FLOW='false';assert.equal(buildBlockPowerFlow(view,now),undefined);}
 finally{if(old===undefined)delete process.env.PRIZM_FLEET_POWER_FLOW;else process.env.PRIZM_FLEET_POWER_FLOW=old;}
}
const ui=readFileSync(new URL('../../components/SiteOperationsDashboard.tsx',import.meta.url),'utf8');
assert(ui.includes('<SitePowerFlow flow={sum?.powerFlow}'));
assert(ui.includes("import './sitePowerFlow.css'"));
console.log('PASS both block summaries: exact Fleet parity, mixed/idle branches, stale/missing/identity failure and rollback');
