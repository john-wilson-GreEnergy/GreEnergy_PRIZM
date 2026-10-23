import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {remoteExperience} from './remoteExperience';
import {parseWorkspaceContext,fleetReturnUrl} from './fleetWorkspace';
import {SiteReadings,FleetCoverage,ArrayReadings,IssueCoverage} from '../mobile/FleetReadings';
import {emptyMetrics,fleetMetrics,metricKeys,type SiteView,type FleetView} from '../core/fleet/model';
import {emptyDetails,emptyRange} from '../core/fleet/details';
for(const [userAgent,maxTouchPoints,expected] of [
 ['Mozilla iPhone',5,'mobile'],['Mozilla iPad',5,'mobile'],['Mozilla Android Tablet',10,'mobile'],
 ['Mozilla Macintosh Intel Mac OS X',5,'mobile'],['Mozilla Macintosh Intel Mac OS X',0,'fleet'],
 ['Mozilla Windows NT 10.0',10,'fleet'],['Mozilla X11 Linux',0,'fleet'],
] as const)assert.equal(remoteExperience({userAgent,maxTouchPoints}),expected);
const origin='https://prizm.example.test',ctx={siteId:'one',siteName:'One',stationCode:'LAB',blockIndex:1,email:'test@example.test',csrf:'a'.repeat(43),fullControl:false,remoteReadOnly:true};
for(const route of ['/fleet/','/mobile/'])assert.equal(parseWorkspaceContext({...ctx,fleetUrl:origin+route},origin).fullControl,false);
for(const route of ['/fleet/','/mobile/'])assert.equal(parseWorkspaceContext({...ctx,remoteAccess:true,remoteReadOnly:false,fullControl:true,fleetUrl:origin+route},origin).fullControl,true);
assert.throws(()=>parseWorkspaceContext({...ctx,remoteAccess:true,fullControl:true,fleetUrl:origin+'/fleet/'},origin),'Conflicting control flags fail closed');
assert.throws(()=>parseWorkspaceContext({...ctx,remoteReadOnly:false,fullControl:true,fleetUrl:origin+'/fleet/'},origin),'Operator context must explicitly identify remote access');
for(const route of ['https://evil.test/fleet/',origin+'/admin/'])assert.throws(()=>parseWorkspaceContext({...ctx,fleetUrl:route},origin));
assert.equal(fleetReturnUrl({protocol:'https:',hostname:'10.0.0.15'}),'https://10.0.0.15:3443/');
const site={siteId:'one',name:'One',stationCode:'LAB',blockIndex:1,status:'current',observedAt:null,metrics:emptyMetrics(),details:emptyDetails()} as SiteView;
const html=renderToStaticMarkup(<SiteReadings site={site}/>);
for(const key of metricKeys)assert(html.includes(fleetMetrics[key].label));
assert(html.includes('Unknown'));assert(html.includes('No observation'));
const totals=Object.fromEntries(metricKeys.map(key=>[key,{value:null,complete:false,contributors:[],excluded:['one']}])) as FleetView['totals'];
const coverage=renderToStaticMarkup(<FleetCoverage view={{sites:[site],totals} as FleetView}/>);
assert(coverage.includes('Not included: One'));assert(coverage.includes('Partial / unknown'));
const array=renderToStaticMarkup(<ArrayReadings array={{number:1,observedAt:null,quality:'unknown',socPct:null,powerKw:null,busVoltage:null,stringCount:null,onlineStrings:null,outOfRotation:null,pcsState:'UNKNOWN',rotation:'UNKNOWN',pcsQuality:'unknown',pcsObservedAt:null,voltageMv:emptyRange(),temperatureC:emptyRange()}}/>);
assert(array.includes('Bus voltage'));assert(array.includes('partial'));assert(array.includes('—'));
const issues=renderToStaticMarkup(<IssueCoverage issues={emptyDetails().issues}/>);
assert(issues.includes('Contactors / Rotation'));assert(issues.includes('not unique BPC counts'));
console.log('PASS remote experience: phones, Android tablets, iPadOS desktop UA, touch PCs, LAN return, return URL validation, complete mobile Fleet metrics and coverage');
