import assert from 'node:assert/strict';
import {readOnlyTelemetry} from './readOnlyTelemetryService';
const now = Date.now();
const enrollment = {profileId:'fixture',stationCode:'TEST',blockIndex:1,emsBaseUrl:'http://fixture.invalid/turtle'};
const source = {cycleId:1,siteIdentity:{activeProfileId:'fixture',activeProfileName:'Fixture site',stationCode:'TEST',blockIndex:1,emsBaseUrl:enrollment.emsBaseUrl},
  liveStatus:{state:'LIVE',stale:false,lastUpdated:new Date(now-1000).toISOString()},
  rawSources:{password:'must-not-leak'},diagnosticSession:{owner:'must-not-leak'},
  normalized:{strings:[{arrayIndex:1,stringIndex:2,socPct:0,measuredVoltageVdc:1350,currentA:0,powerKw:-5,warningCount:1,alarmCount:0,connectionState:'ONLINE',password:'must-not-leak'}],
  correctiveActions:[{severity:'warning',title:'Fixture warning',location:'Array 1',secret:'must-not-leak'}]}};
const result = readOnlyTelemetry(source,enrollment,now);
assert.equal(result.strings[0].soc,0);assert.equal(result.strings[0].current,0);assert.equal(result.strings[0].power,-5);
assert.equal(result.ageMs,1000);assert.equal(result.stale,false);assert.equal(result.counts.warnings,1);
assert(!JSON.stringify(result).includes('must-not-leak'));assert(!JSON.stringify(result).includes('fixture.invalid'));
assert(readOnlyTelemetry(source,enrollment,now+20000).stale);
for (const field of ['profileId','stationCode','blockIndex','emsBaseUrl'] as const) assert.throws(()=>readOnlyTelemetry(source,{...enrollment,[field]:field==='blockIndex' ? 2 : 'wrong'},now),/enrollment/);
assert.throws(()=>readOnlyTelemetry(null,enrollment,now),/warming/);
const missing = structuredClone(source);
Object.assign(missing.normalized.strings[0],{socPct:null,currentA:null,warningCount:undefined,alarmCount:undefined});
const unknown = readOnlyTelemetry(missing,enrollment,now);
assert.equal(unknown.strings[0].soc,null);assert.equal(unknown.counts.warnings,null);assert.equal(unknown.counts.alarms,null);
const duplicate = structuredClone(source);duplicate.normalized.strings.push(duplicate.normalized.strings[0]);
assert.throws(()=>readOnlyTelemetry(duplicate,enrollment,now),/identity/);
assert(readOnlyTelemetry({...source,liveStatus:{...source.liveStatus,lastUpdated:new Date(now+1000).toISOString()}},enrollment,now).stale);
assert(readOnlyTelemetry({...source,liveStatus:{...source.liveStatus,state:'CACHED'}},enrollment,now).stale);
console.log('Read-only telemetry: site binding, stale age, unknown vs zero, explicit display fields and identity checks passed.');
