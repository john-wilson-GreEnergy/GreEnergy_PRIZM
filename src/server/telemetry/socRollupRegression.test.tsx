import assert from 'node:assert/strict';
import React from 'react';
import {mkdtempSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
process.chdir(mkdtempSync('/tmp/prizm-soc-rollup-'));
const {repairFinalFleetRollupsFromStringsAndArrays}=await import('../prizmDataCoordinator');
const {fleetDetailFixture}=await import('../fleet/fleetDetailFixture');
const {buildBlockPowerFlow}=await import('../fleet/blockPowerFlow');
const {SitePowerFlow}=await import('../../components/SitePowerFlow');
const stamp=new Date().toISOString();
for(const station of ['BHE0020','BHE0021'])for(const soc of [0,.01,.4,.6,.99,1,1.01,2,100]){
 const f=fleetDetailFixture(station,stamp);
 const strings=f.snapshot.normalized.strings.map(r=>({...r,socPct:soc,bucket:'online',positiveContactorClosed:true,negativeContactorClosed:true,outRotation:false,operationalState:'NORMAL'}));
 const snapshot:any={siteIdentity:{stationCode:station,blockIndex:1},normalized:{strings,arrays:structuredClone(f.view.arraySummary)},rollups:{arraySummary:structuredClone(f.view.arraySummary)}};
 assert(repairFinalFleetRollupsFromStringsAndArrays(snapshot));
 for(const array of snapshot.rollups.arraySummary)assert(Math.abs(array.onlineSOC-soc)<1e-9,`${station} SOC ${soc}: ${array.onlineSOC}`);
 const flow=buildBlockPowerFlow({...f.view,siteIdentity:{...f.view.siteIdentity,activeProfileId:'fixture',emsBaseUrl:'http://ems.invalid'},liveStatus:{...f.view.liveStatus,state:'LIVE'},arraySummary:snapshot.rollups.arraySummary});
 assert(flow);for(const array of flow.arrays)assert(Math.abs(array.soc.percent!-soc)<1e-9);
 const html=renderToStaticMarkup(<SitePowerFlow flow={flow} siteName={station}/>);
 assert(html.includes('data-soc-percent='));
}
console.log('PASS both sites: 320 canonical rows → array rollups → power-flow SOC → battery fill, 0–2% boundaries and full charge');
