import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {projectPower,projectDistribution,parseOperatingCharts} from './operatingCharts';
import {OperatingChartsStore} from './OperatingChartsStore';
import {OperatingCharts} from '../../components/OperatingCharts';
import {FleetStringDistribution,distributionPlot} from '../../components/FleetStringDistribution';
import {FleetBroker,parseSummary,IdentityConflict} from '../fleet/FleetBroker';
import {emptyMetrics} from '../../core/fleet/model';
import {operatingChartsEnabled} from './operatingChartsRuntime';
const at=1792420000000;
function snapshot(now=at,station='BHE0020'){
  return {siteIdentity:{stationCode:station,blockIndex:1,emsBaseUrl:'http://10.0.0.3:8080/turtle',activeProfileId:'site-profile'},liveStatus:{stale:false},normalized:{
    arrays:[{arrayIndex:1},{arrayIndex:2}],
    pcs:[1,2].map(arrayIndex=>({arrayIndex,pcsIndex:1,timestamp:String(now),communicating:true,sourceOk:true,stale:false,acCmdRealPowerKW:-100,acRealPowerKW:-99,acCmdReactivePowerKVAR:0,acReactivePowerKVAR:2})),
    strings:[1,2].map(arrayNumber=>({arrayNumber,stringNumber:1,sourceTimestampUtc:new Date(now).toISOString(),communicating:true,avgCellVoltage:3300,avgCellTempC:20,amps:0,kw:-20,socPct:50,measuredVoltage:1400,busVoltage:1401,kwh:100})),
  }};
}
const input=snapshot(),before=JSON.stringify(input),p=projectPower(input,at);
assert.equal(p.commandKw,-200);assert.equal(p.actualKw,-198);assert.equal(p.commandKvar,0);assert.equal(p.actualKvar,4);assert.equal(p.expected,2);
assert.equal(JSON.stringify(input),before);
assert.equal(projectPower(snapshot(),at+31000).actualKw,null);
const previousFlag=process.env.PRIZM_OPERATING_CHARTS;process.env.PRIZM_OPERATING_CHARTS='false';assert.equal(operatingChartsEnabled(),false);if(previousFlag===undefined)delete process.env.PRIZM_OPERATING_CHARTS;else process.env.PRIZM_OPERATING_CHARTS=previousFlag;
assert.equal(projectPower(snapshot(at+6000),at).actualKw,null);
const missing=snapshot();missing.normalized.pcs.pop();assert.equal(projectPower(missing,at).actualKw,null);assert.equal(projectPower(missing,at).expected,2);
const duplicate=snapshot();duplicate.normalized.pcs[1].arrayIndex=1;assert.equal(projectPower(duplicate,at).actualKw,null);
const offline=snapshot();offline.normalized.pcs[1].communicating=false;assert.equal(projectPower(offline,at).actualKw,null);
const invalid=snapshot();invalid.normalized.pcs[0].acCmdRealPowerKW=NaN;assert.equal(projectPower(invalid,at).commandKw,null);assert.equal(projectPower(invalid,at).actualKw,-198);
const distribution=projectDistribution(input,at);assert.equal(distribution.length,2);assert.equal(distribution[0].temperatureF,68);assert.equal(distribution[0].currentA,0);assert.equal(distribution[0].powerKw,-20);
assert.equal(projectDistribution(input,at+121000)[0].voltageMv,null);
const store=new OperatingChartsStore();store.ingest(input,at);store.ingest(snapshot(at+1000),at+1000);assert.equal(store.view(input,at)!.power.length,1);
store.ingest(input,at+30000);assert.equal(store.view(input,at+30000)!.power.at(-1)!.actualKw,null,'Repeated source is a gap');
store.ingest(snapshot(at+180000),at+180000);const charts=store.view(input,at+180000)!;
assert.equal(charts.power.length,4);assert.equal(charts.power[2].actualKw,null,'Outage break');assert.deepEqual(parseOperatingCharts(charts),charts);
assert.equal(store.view(input,at+220000)!.distribution[0].voltageMv,null);
assert.equal(parseOperatingCharts(undefined),undefined,'Older collectors supported');
assert.throws(()=>parseOperatingCharts({...charts,power:[charts.power[0],charts.power[0]]}));
assert.throws(()=>parseOperatingCharts({...charts,distribution:[distribution[0],distribution[0]]}));
assert.throws(()=>parseOperatingCharts({...charts,power:[{...p,reporting:{...p.reporting,actualKw:1}}]}));
assert.throws(()=>parseOperatingCharts({...charts,power:Array(2881).fill(p)}));
assert.throws(()=>parseOperatingCharts({...charts,capturedAt:String(at)}));
const noMapping=snapshot();noMapping.normalized.arrays=[];assert.equal(projectPower(noMapping,at).actualKw,null,'Unknown topology cannot imply full coverage');
const enrollment={siteId:'ss3',blockId:'1',stationCode:'BHE0020',blockIndex:1,name:'SS3'};
const summary={...enrollment,schema:'prizm-site-summary-v1',observedAt:new Date(at+180000).toISOString(),stale:false,metrics:emptyMetrics(),operatingCharts:charts};
assert.equal(parseSummary(summary,enrollment).operatingCharts!.power.length,4);
assert.throws(()=>parseSummary({...summary,operatingCharts:{...charts,site:'BHE0021 / Block 1'}},enrollment),IdentityConflict);
const broker=new FleetBroker([enrollment],()=>at+180000);broker.accept('ss3',summary);assert.equal(broker.view(new Set()).sites.length,0);assert.equal(broker.view(new Set(['ss3'])).sites[0].operatingCharts!.distribution.length,2);
const html=renderToStaticMarkup(<OperatingCharts data={{...charts,capturedAt:Date.now()}}/>);
assert.match(html,/Command vs actual power/);assert.match(html,/Site level distribution/);assert.match(html,/°F/);assert.match(html,/Plotted readings/);
assert.match(renderToStaticMarkup(<OperatingCharts data={charts} stale/>),/live distribution is withheld/);
assert.match(renderToStaticMarkup(<OperatingCharts/>),/has not been supplied/);
const scatterHtml=renderToStaticMarkup(<OperatingCharts data={{...charts,capturedAt:Date.now()}} distributionLayout="scatter"/>);
assert.match(scatterHtml,/String spread/);assert.match(scatterHtml,/One point per string/);assert.match(scatterHtml,/Connected lines/);assert.doesNotMatch(scatterHtml,/Left axis/);
assert.match(html,/Left axis/);assert.doesNotMatch(html,/One point per string/,'Analytics keeps original presentation');
const plotRows=[{...distribution[1],currentA:null},{...distribution[0],currentA:0}];
const plot=distributionPlot(plotRows,'','currentA');
assert.deepEqual(plot.selected.map(r=>r.array),[1,2]);assert.equal(plot.points.length,1);assert.equal(plot.points[0].currentA,0);
assert.equal(distributionPlot(plotRows,'2','currentA').selected[0].siteIndex,2,'Filtering retains site index');
assert.equal(plotRows[0].array,2,'Presentation does not mutate canonical rows');
assert.match(renderToStaticMarkup(<FleetStringDistribution rows={[]} stale={false}/>),/No mapped strings/);
const stalePlot=renderToStaticMarkup(<FleetStringDistribution rows={distribution} stale/>);
assert.match(stalePlot,/Waiting for fresh/);assert.doesNotMatch(stalePlot,/String readings/,'Stale values not exposed in table');
store.ingest(snapshot(at+240000,'BHE0021'),at+240000);assert.equal(store.view(input),undefined,'Site isolation');
assert.equal(store.view(snapshot(at,'BHE0021'),at+240000)!.power.length,1);
const bounded=new OperatingChartsStore();for(let i=0;i<2900;i++)bounded.ingest(snapshot(at+i*30000),at+i*30000);
assert.equal(bounded.view(input,at+2899*30000)!.power.length,2880);
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'prizm-chart-test-'));
try{
  const saved=new OperatingChartsStore(directory);saved.ingest(input,at);await saved.flush();
  const files=await fs.readdir(directory);assert.equal(files.length,1);assert.equal((await fs.stat(path.join(directory,files[0]))).mode&0o777,0o600);
  const restored=new OperatingChartsStore(directory);restored.ingest(snapshot(at+120000),at+120000);await restored.flush();
  assert.equal(restored.view(input,at+120000)!.power.length,3,'Restart includes gap and retained sample');
  await fs.writeFile(path.join(directory,files[0]),'invalid');
  const corrupt=new OperatingChartsStore(directory);corrupt.ingest(snapshot(at+240000),at+240000);await corrupt.flush();assert.match(corrupt.view(input,at+240000)!.recordingError!,/could not be restored/);
}finally{await fs.rm(directory,{recursive:true,force:true});}
console.log('Operating charts: canonical parity, units, coverage, freshness, scope, persistence, retention, gaps, bounds, Fleet and shared UI passed');
