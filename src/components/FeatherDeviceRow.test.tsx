import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FeatherDeviceRow, deviceMatchesHvacFilter} from './FeatherDeviceRow';
import {sameFeatherRow, sameHvacDisplay, sameSensorDisplay, featherTableStats} from '../lib/featherTablePresentation';
import type {FeatherHvacDevice} from '../server/feather/deviceEnrichment';

const device: FeatherHvacDevice = {sourceCoverage:{blockviewer:false,ipMap:false,stringIpMap:false,stringsCsv:false,lastCall:false,directFeather:true,firstResponder:false},ip:'10.0.1.10', discoveryMethod:'direct-feather', arrayIndex:1, segmentLabel:'ES 1', reachable:true, deviceState:'WARNING', warningCount:1, alarmCount:0, pingMs:12, lastSuccessUtc:'2026-09-30T14:30:00Z', hvacType:'dometic', hvac1:{fanLowOn:true,currentA:2.5,fanSpeedRpm:0}, fssSignals:{valid:true,fireAlarm:false,leakAlarm:false}, doors:{batteryDoorsClosed:true}, doorApplicability:{isCollectionSegment:false,monitorsTopCap:false,monitorsBatteryDoors:true,monitorsAcDoors:false,monitorsDcDoors:false}};
const html = (d: FeatherHvacDevice, optimized = true) => renderToStaticMarkup(<table><tbody><FeatherDeviceRow device={d} onSelect={()=>{}} optimized={optimized}/></tbody></table>);
assert.equal(html(device),html(device,false),'Memo and rollback render identical table content.');
assert.match(html(device),/Array 1/); assert.match(html(device),/2.5A/);
assert(!html(device).includes(' RPM'),'Dometic display must not acquire an RPM readout.');
assert.match(html({...device,hvacType:'bergstrom'}),/ RPM/);
assert(sameFeatherRow(device,structuredClone(device)));
assert(sameFeatherRow(device,{...device,raw:{large:'changed'},spaceTemperatureC:99}),'Non-table changes do not invalidate table telemetry; details use current parent record.');
for (const [key,value] of Object.entries({ip:'10.0.2.10',reachable:false,firmwareVersion:'4.0',softwareVersion:'2',arrayIndex:2,segmentLabel:'CS 1',entityDescription:'new',deviceState:'ALARM',pingMs:14,thermostatStage:'COOL',hvacRuntimeState:'RUN',hvacMode:'HEAT',hvacStatus:'FAULT',hvacType:'bergstrom',lastSuccessUtc:'2026-09-30T14:30:05Z'})) {
  assert(!sameFeatherRow(device,{...device,[key]:value}),key);
}
for (const key of ['fanLowOn','fanHighOn','compressorOn','reversingValveOn','electricHeatOn','currentA','fanSpeedRpm']) {
  const changed={...device,hvac1:{...device.hvac1,[key]:key==='fanLowOn'?false:1}};
  assert(!sameFeatherRow(device,changed),key);
  assert.notEqual(html({...device,hvacType:'bergstrom'}),html({...changed,hvacType:'bergstrom'}),key);
}
for (const key of ['valid','fssAlarm','fssTrouble','fssAlarmOrTrouble','fireAlarm','fireTrouble','smokeAlarm','smokeAlarmTrouble','heatSensor','hydrogenAlarm','hydrogenFault','statXRelease','leakAlarm']) {
  assert(!sameSensorDisplay(device,{...device,fssSignals:{...device.fssSignals,[key]:key==='valid'?false:true}}),key);
}
assert(!sameSensorDisplay(device,{...device,doors:{batteryDoorsClosed:false}}));
assert(!sameSensorDisplay(device,{...device,doorApplicability:{...device.doorApplicability!,monitorsBatteryDoors:false}}));
assert(!sameHvacDisplay(undefined,{})); assert(!sameHvacDisplay({fanLowOn:false},{}));
const tick={...device,lastSuccessUtc:'2026-09-30T14:30:10Z',pingMs:20};
assert(!sameFeatherRow(device,tick),'Freshness display advances.');
assert(sameHvacDisplay(device.hvac1,tick.hvac1) && sameSensorDisplay(device,tick),'A freshness tick skips the heavy telemetry cells.');
const fleet=Array.from({length:168},(_,i)=>({...device,ip:`10.0.1.${i+1}`}));
const next=structuredClone(fleet); next[37].hvac1={...next[37].hvac1,currentA:9};
assert.equal(fleet.filter((d,i)=>!sameFeatherRow(d,next[i])).length,1,'One telemetry change invalidates one row, not all 168.');
assert.deepEqual(featherTableStats([device,{...device,reachable:false,alarmCount:1,warningCount:0}]),{total:2,reachable:1,unreachable:1,warnings:1,alarms:1,avgDuration:12});
assert.equal(featherTableStats([]).avgDuration,0);
assert(deviceMatchesHvacFilter(device,'all'));
assert(deviceMatchesHvacFilter({...device,hvac1:{compressorOn:true,currentA:0}},'commanded-no-current'));
console.log('Feather table: markup parity, rollback, 168-row selective invalidation, freshness, sensor/relay changes, vendor RPM and totals passed.');
