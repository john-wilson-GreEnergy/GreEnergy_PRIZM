import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MobileView,MonitorBrand} from './MobileApp';
import {mobileChartHeight} from './MobileCharts';
import {FleetBroker} from '../server/fleet/FleetBroker';
import {emptyMetrics} from '../core/fleet/model';
import {emptyDetails} from '../core/fleet/details';
const site={siteId:'test',blockId:'1',stationCode:'TEST',blockIndex:1,name:'Test site'};
const brand=renderToStaticMarkup(<MonitorBrand/>);
assert(brand.includes('src="/logo-transparent.svg"'),'Brand asset is same-origin for offline LAN use');
assert(brand.includes('OPERATIONS MONITOR'));
assert(!brand.includes('https://'),'Monitoring must not depend on external branding assets');
assert.equal(mobileChartHeight(390,844),undefined);
assert.equal(mobileChartHeight(844,390),260);
assert.equal(mobileChartHeight(915,412),282);
assert.equal(mobileChartHeight(667,320),240);
assert.equal(mobileChartHeight(1366,768),300);
const broker=new FleetBroker([site]);
const details=emptyDetails();details.sensors.trips=0;details.sensors.known=1;details.sensors.total=1;details.sensors.active=[{id:'gas',label:'Array 2',kind:'Gas',condition:'communication',status:'Gas sensor communication fault',message:'Communication lost',occurredAt:null,source:'Test',sourcePath:'test',findings:[]}];
broker.accept(site.siteId,{...site,schema:'prizm-site-summary-v1',stale:false,observedAt:new Date().toISOString(),metrics:emptyMetrics(),details});
const view=broker.view(new Set(['test']));
for(const tab of ['overview','trends','equipment','issues'] as const){
 const html=renderToStaticMarkup(<MobileView view={view} selected="" tab={tab} onSelect={()=>{}} onTab={()=>{}}/>);
 assert(!/href=|unlock|Open full PRIZM|User administration/.test(html),'No control/admin navigation');
 assert(html.includes('No equipment controls'));
 assert.equal(html.includes('class="m-overview"'),tab==='overview');
 if(tab==='overview'){assert(html.includes('Gas sensor communication fault'));assert(html.includes('Partial / unknown'));assert(html.includes('—'));}
 if(tab==='trends')assert(html.includes('Chart data has not been supplied'));
 if(tab==='issues')assert(html.includes('Issue coverage is unknown'));
}
const selectedHtml=renderToStaticMarkup(<MobileView view={view} selected="test" tab="overview" onSelect={()=>{}} onTab={()=>{}}/>);
assert(selectedHtml.includes('class="m-overview m-single-site"'),'Single-site landscape spans the available width');
broker.fail('test');assert.equal(broker.view(new Set(['test'])).sites[0].status,'unavailable');
console.log('Mobile canonical rendering, unknown data, sensor visibility and read-only navigation passed');
