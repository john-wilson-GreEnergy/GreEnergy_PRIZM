import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { boundedControlRequest } from './boundedRequest';
import { assessPcsRotation, pcsRowsFromBlock, pcsRowFromReport, rotationOutcome } from './pcsRotationReadback';

// Run with scripts/test-network-guard.cjs. No app module is loaded before chdir.
const cwd = process.cwd(), originalFetch = globalThis.fetch;
process.chdir(await mkdtemp('/tmp/prizm-control-hardening-'));
let calls = 0;
globalThis.fetch = async () => { calls++; throw new Error('Unexpected mocked request'); };
const { ProfileStore } = await import('../profiles/profileStore');
const originalProfile = ProfileStore.getActiveProfile;
const profile = { ...ProfileStore.getActiveProfile(), emsHost: 'fixture.invalid', stationCode: 'Fixture', blockIndex: 1 };
ProfileStore.getActiveProfile = () => profile;
const { setMockLastCall, setEmsCachedBlock } = await import('../emsTurtleClient');
const { resolveControlDestination } = await import('./controlDestination');
const { setPowerControl, buildSetPowerControlCommand } = await import('../ems/powerControl');
const { setEmsApplicationEnabledStatus } = await import('../ems/dragonAppControl');
const { executeBalancingWorkflow } = await import('../balancingControlService');
const { executeContactorControl } = await import('../contactorControlService');
const { setPcsRotation, setStringRotation } = await import('../rotationControlService');
const { operationalTimeline } = await import('../history/operationalTimeline');
const previousOverride = process.env.PRIZM_EMS_TURTLE_BASE;
delete process.env.PRIZM_EMS_TURTLE_BASE;
const powerInput = { stationCode: 'Fixture', blockIndex: 1, priority: 40, realPowerkW: -5, reactivePowerkVAr: 0 };
const appInput = { stationCode: 'Fixture', blockIndex: 1, appCode: 'ADB0001', priority: 300, enabled: true, confirmationText: 'ENABLE ADB0001' };
const powerApp: Record<string, unknown> = { appCode: 'PC00001', priority: 40, appStatus: 'Real Power: -5 kW\nReactive Power: 0 kVAr' };
const payload = { stationCode: 'Fixture', blockIndex: 1, dragonApps: [powerApp, { appCode: 'ADB0001', priority: 300, enabled: false }],
  arrays: [1, 2].map(arrayIndex => ({ arrayIndex, pcs: [{ arrayPcsIndex: 1, outRotation: true }] })) };
const seed = () => { setMockLastCall(payload); setEmsCachedBlock(payload); };
seed();
try {
  // Untrusted preparation and malformed selections must be rejected before reads OR writes.
  const balancing = { confirmed: true, targetType: 'string', targets: [{ array: 1, string: 2 }], mode: 'avg', chargingDeadband: 5, dischargingDeadband: 10 };
  for (const choice of [undefined, '', 'bypass-adb', '__proto__']) {
    await assert.rejects(executeBalancingWorkflow({ ...balancing, preflightChoice: choice } as never), /preflight choice/);
  }
  await assert.rejects(executeBalancingWorkflow({ ...balancing, mode: 'provided', providedMv: NaN, preflightChoice: 'balance-directly' } as never), /Finite numeric/);
  await assert.rejects(executeBalancingWorkflow({ ...balancing, targetType: 'array', preflightChoice: 'balance-directly' } as never), /Ambiguous/);
  await assert.rejects(setStringRotation({ confirmed: true, action: 'out', targets: [{array: 1, string: 1}, {array: 2, string: 1.5}] }), /Invalid rotation target/);
  await assert.rejects(setPcsRotation({ confirmed: true, action: 'out', targets: [{array: 1, pcs: 1}, {array: 2, allPcs: 'true'}] }), /Invalid rotation target/);
  const contactor = { confirmed: true, action: 'open' as const, reason: 'offline test', ignoreLowCgVoltAlarm: false, ignoreHighCgVoltAlarm: false, targets: [{ array: 1, string: 1 }] };
  await assert.rejects(executeContactorControl({ ...contactor, targets: [...contactor.targets, {array: 2, string: 1.5}] }), /Invalid contactor target/);
  await assert.rejects(executeContactorControl({ ...contactor, ignoreStringDcBusVoltageDeltaLimit: true }), /protection overrides/);
  assert.equal((await setPowerControl(powerInput)).error, 'APP_STATE_UNKNOWN');
  powerApp.enabled = 'false';
  assert.equal((await setPowerControl(powerInput)).error, 'APP_STATE_UNKNOWN');
  powerApp.enabled = false; powerApp.applicationEnabled = true;
  assert.equal((await setPowerControl(powerInput)).error, 'APP_STATE_UNKNOWN');
  delete powerApp.applicationEnabled;
  assert.throws(() => buildSetPowerControlCommand(powerInput, undefined as never), /Known app enabled state/);
  assert.equal((await setEmsApplicationEnabledStatus({...appInput, enabled: 'false' as never})).error, 'INVALID_ENABLED');
  assert.equal(calls, 0);

  const destination = resolveControlDestination();
  process.env.PRIZM_EMS_TURTLE_BASE = 'http://wrong-site.invalid/turtle';
  assert.throws(resolveControlDestination, /conflicts/);
  assert.throws(destination.assertCurrent, /site changed/);
  delete process.env.PRIZM_EMS_TURTLE_BASE;
  profile.stationCode = 'Other';
  assert.throws(resolveControlDestination, /not verified/);
  assert.throws(destination.assertCurrent, /site changed/);
  profile.stationCode = 'Fixture';
  const stringsPerArray = profile.stringsPerArray;
  profile.stringsPerArray = stringsPerArray + 1;
  assert.throws(destination.assertCurrent, /site changed/);
  profile.stringsPerArray = stringsPerArray;
  assert.equal(calls, 0);

  // A 403 with misleading success words is never acceptance; no verification reads follow.
  globalThis.fetch = async (url, init) => {
    assert(String(url).startsWith(destination.baseUrl + '/tools/controls/ems/'));
    assert.equal(init?.redirect, 'error'); calls++;
    return new Response('OK QUEUED 200 setting contactor state without flags', {status: 403});
  };
  assert.equal((await setPowerControl(powerInput)).success, false);
  assert.equal((await setEmsApplicationEnabledStatus(appInput)).success, false);
  const rejectedContactor = await executeContactorControl({...contactor, commandId: 'fixture-command-1'});
  assert.equal(rejectedContactor.acceptedCount, 0);
  assert.equal(rejectedContactor.success, false);
  await executeContactorControl({...contactor, commandId: 'fixture-command-1'});
  await assert.rejects(executeContactorControl({...contactor, commandId: 'fixture-command-1', action: 'close'}), /different plan/);
  assert.equal(calls, 3);

  // Trusted authorization hook runs at the actual dispatch edge, not only in a route.
  const callsBeforeGuard = calls;
  await assert.rejects(executeContactorControl({...contactor,commandId:'guard-denied'}, {
    actor:'fixture-account',namespace:'fixture-session',beforeDispatch:async()=>{throw new Error('Session revoked');},
  }),/Session revoked/);
  assert.equal(calls,callsBeforeGuard);
  let dispatchChecks=0;
  await assert.rejects(executeContactorControl({...contactor,commandId:'guard-compound',targets:[{array:1,string:1},{array:1,string:2}]}, {
    actor:'fixture-account',namespace:'fixture-session',beforeDispatch:async()=>{if(++dispatchChecks===2) throw new Error('Session revoked');},
  }),/Session revoked/);
  assert.equal(dispatchChecks,2);assert.equal(calls,callsBeforeGuard+1,'Revocation must stop remaining writes');
  await assert.rejects(executeContactorControl({...contactor,commandId:'guard-site-change'}, {
    actor:'fixture-account',namespace:'fixture-session',beforeDispatch:async()=>{profile.stationCode='Changed';},
  }),/site changed/);
  profile.stationCode='Fixture';assert.equal(calls,callsBeforeGuard+1,'Destination must still match after async authorization');

  // PCS cached OUT rows cannot supply confirmation. Read inventory, dispatch, then
  // require two separate matching responses. A second rejected target defeats aggregate success.
  let reads = 0, writes = 0, reportReads = 0;
  const reportTime = Date.now() + 1000;
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.redirect, 'error');
    const address = String(url); assert(address.startsWith(destination.baseUrl + '/'));
    if (address.includes('/rotate/')) {
      writes++;
      return new Response(writes === 1 ? '' : 'OK', {status: writes === 1 ? 202 : 403});
    }
    reads++;
    if (address.includes('/report.json')) {
      reportReads++;
      return Response.json({timeStamp: String(reportTime + (reportReads > 2 ? 1 : 0)), arrayPcsData: {outRotation: true}});
    }
    assert(address.includes('/blockviewer/data?rotationVerify='));
    return Response.json({...payload, arrays: payload.arrays.map(a => ({arrayIndex:a.arrayIndex,pcses:a.pcs.map(p => ({arrayPcsIndex:p.arrayPcsIndex}))}))});
  };
  const rotation = await setPcsRotation({ confirmed: true, action: 'out', targets: [{array: 1, pcs: 1}, {array: 2, pcs: 1}] });
  assert.equal(rotation.success, false); assert.equal(rotation.acceptedCount, 1); assert.equal(rotation.verifiedCount, 1);
  assert.equal(writes, 2); assert.equal(reads, 5, 'Two inventory reads plus three report reads; duplicate timestamp cannot confirm');
  const before = Date.now() - 1000;
  const rows = pcsRowsFromBlock(payload);
  assert.equal(assessPcsRotation(rows, 1, [1], 'out', before), true);
  assert.equal(assessPcsRotation(rows, 1, [1, 2], 'out', before), null);
  assert.equal(assessPcsRotation([...rows, rows[0]], 1, [1], 'out', before), null);
  for (const changed of [{outRotation: undefined}, {communicating: false}, {inRotation: true}, {staleData: true}, {sourceTimestampUtc: new Date(before - 1).toISOString()}]) {
    assert.equal(assessPcsRotation([{...rows[0], ...changed}], 1, [1], 'out', before), null);
  }
  assert.equal(assessPcsRotation(rows, 1, [1], 'in', before), false);
  assert.deepEqual(pcsRowsFromBlock({staleData: true, blockReport: payload}), []);
  assert.equal(rotationOutcome([]).success, false);
  assert.equal(rotationOutcome([{accepted: true, readbackConfirmed: null}]).success, false);
  const liveShape = pcsRowsFromBlock({arrays:[{arrayIndex:2,pcses:[{arrayPcsIndex:1,state:'GridFeed'}]}]});
  assert.equal(liveShape[0].pcsIndex,1);
  assert.equal(assessPcsRotation(liveShape,2,[1],'in',before),null,'Operating state is not rotation');
  const report = pcsRowFromReport({timeStamp:String(Date.now()),arrayPcsData:{outRotation:false}},2,1)!;
  assert.equal(assessPcsRotation([report],2,[1],'in',before),true);
  assert.equal(assessPcsRotation([report],2,[1],'out',before),false);
  assert.equal(pcsRowFromReport({arrayPcsData:{outRotation:false}},2,1),null);
  assert.equal(pcsRowFromReport({timeStamp:String(Date.now()),arrayPcsData:{arrayPcsIndex:2,outRotation:false}},2,1),null);
  assert.equal(pcsRowFromReport({timeStamp:String(Date.now()),staleData:true,arrayPcsData:{outRotation:false}},2,1),null);

  // Deadlines include headers and body, including transports ignoring AbortSignal.
  for (const stalledBody of [false, true]) {
    let requests = 0;
    let signal: AbortSignal | undefined;
    globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
      requests++; signal = init.signal as AbortSignal;
      return stalledBody ? {ok: true, status: 200, text: () => new Promise(() => {})} : new Promise(() => {});
    }) as typeof fetch;
    await assert.rejects(boundedControlRequest('http://fixture.invalid', 20), /timed out/);
    assert.equal(requests, 1, 'Never automatically retry an uncertain delivery');
    assert.equal(signal?.aborted, true);
  }
  console.log('Control hardening: validation, destination pinning, HTTP acceptance, PCS readback, aggregate outcomes and deadlines passed offline');
} finally {
  await operationalTimeline().close();
  globalThis.fetch = originalFetch;
  ProfileStore.getActiveProfile = originalProfile;
  if (previousOverride === undefined) delete process.env.PRIZM_EMS_TURTLE_BASE; else process.env.PRIZM_EMS_TURTLE_BASE = previousOverride;
  process.chdir(cwd);
}
