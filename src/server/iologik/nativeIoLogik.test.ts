import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { IoLogikClient, IoLogikError, attributes, parseReading, stageConfiguration, prepareDeviceConfiguration,validateUploadResponse, uploadForm, deviceHttp, type DeviceReading } from './ioLogikClient';
import { NativeIoLogikFleet, compareFirmware, inventory } from './nativeIoLogikFleet';
import { identifyFirmware, identifyFirmwareDigest, MOXA_E1242_V4_SHA512, reportedFirmwareBuild } from './firmwareIdentity';
import { IoLogikScanStore, type IoLogikScanSnapshot } from './ioLogikScanStore';
import fs from 'node:fs';
import { assessIoLogikFirmware } from './firmwareAssessment';
import { IoLogikInventory, projectIoLogikInventory, type IoLogikScanProgress } from './ioLogikInventory';

test('verified inventory survives reload and subsequent updates without rewriting the scan report', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'prizm-iologik-inventory-test-'));
  try {
    const scanStore=new IoLogikScanStore(path.join(dir,'scan.json'));
    const currentStore=new IoLogikScanStore(path.join(dir,'inventory.json'));
    const service=new IoLogikInventory(currentStore);
    const row=inventory(target,reading,120);
    const baseline:IoLogikScanSnapshot={schemaVersion:1,scopeKey:'site-a',kind:'firmware',scannedAt:'2026-09-25T20:00:00Z',targetIps:[row.ip],rows:[row]};
    scanStore.save(baseline);
    const original=readFileSync(path.join(dir,'scan.json'),'utf8');
    const result={...target,success:true,action:'updated',detail:'Verified',after:{...row,firmware:'4.0'}};
    service.recordVerified('site-a',baseline,result,'2026-09-25T20:01:00Z');
    const reloaded=new IoLogikInventory(currentStore);
    assert.equal(reloaded.read('site-a',baseline)?.rows[0].firmware,'4.0');
    assert.equal(reloaded.read('site-a',baseline)?.rows[0].observationSource,'verified-update');
    service.recordVerified('site-a',baseline,{...result,ip:'10.0.1.16',after:{...result.after,ip:'10.0.1.16'}},'2026-09-25T20:02:00Z');
    assert.equal(service.read('site-a',baseline)?.rows.length,2);
    service.recordVerified('site-a',baseline,{...result,success:false,after:row},'2026-09-25T20:03:00Z');
    service.recordVerified('site-a',baseline,{...result,after:row},'2026-09-25T19:59:00Z');
    assert.equal(service.read('site-a',baseline)?.rows[0].firmware,'4.0','failed/older readbacks cannot replace verified readings');
    assert.equal(service.read('site-b',null),null);
    assert.equal(readFileSync(path.join(dir,'scan.json'),'utf8'),original);
    const newerScan={...baseline,scannedAt:'2026-09-25T20:04:00Z'};
    assert.equal(service.read('site-a',newerScan)?.rows.length,1,'a completed scoped scan replaces inventory scope');
    assert.equal(service.read('site-a',newerScan)?.rows[0].firmware,'3.3');
    const progress:IoLogikScanProgress={id:'scan',scopeKey:'site-a',kind:'firmware',state:'running',startedAt:'2026-09-25T20:05:00Z',targetIps:[row.ip],rows:[{...row,firmware:'4.0',observedAt:'2026-09-25T20:05:01Z'}]};
    assert.equal(projectIoLogikInventory(newerScan,progress)[0].firmware,'4.0');
    assert.equal(projectIoLogikInventory(newerScan,{...progress,state:'failed'})[0].firmware,'3.3','partial failed scan is transient');
    const rename=fs.renameSync;
    try { fs.renameSync=()=>{throw new Error('disk full');}; assert.throws(()=>service.recordVerified('site-a',baseline,result,'2026-09-25T20:06:00Z'),/disk full/); }
    finally {fs.renameSync=rename;}
    assert.equal(service.read('site-a',baseline)?.rows[0].firmware,'4.0');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('scans publish completed devices before slow devices, preserve order and never upload', async () => {
  let release!:()=>void;
  const blocked=new Promise<void>(resolve=>{release=resolve;});
  const targets=Array.from({length:9},(_,i)=>({...target,ip:`10.0.1.${11+i}`}));
  const seen:string[]=[]; let active=0, peak=0, uploads=0;
  const fleet=new NativeIoLogikFleet({now:()=>Date.parse('2026-09-25T20:00:00Z'),client:ip=>({
    login:async()=>{},read:async()=>{active++;peak=Math.max(peak,active);try {if(ip===targets[0].ip)await blocked;if(ip===targets[2].ip)throw new IoLogikError('request_timeout');return reading;}finally{active--; }},
    discover:async()=>true,readConfiguration:async()=>'',upload:async()=>{uploads++;},setWatchdog:async()=>{},
  })});
  const pending=fleet.scan(targets,'not-logged',120,row=>{seen.push(row.ip);assert.equal(row.observedAt,'2026-09-25T20:00:00.000Z');});
  for(let i=0;i<50;i++)await Promise.resolve();
  assert.ok(seen.length>0 && seen.length<targets.length);
  assert.ok(!seen.includes(targets[0].ip));
  assert.ok(peak<=4);
  release();const rows=await pending;
  assert.deepEqual(rows.map(r=>r.ip),targets.map(t=>t.ip));
  assert.equal(rows[2].configurationStatus,'unknown');assert.equal(rows[2].result,'request_timeout');
  assert.equal(seen.length,targets.length);assert.equal(uploads,0);assert.deepEqual(fleet.activeTargets(),[]);
  const discovered:string[]=[];
  await fleet.discover(targets,row=>discovered.push(row.ip));assert.equal(discovered.length,targets.length);
});

test('firmware assessment distinguishes version/build drift from unavailable or unverified readings', () => {
  const target={verified:true,version:'4.0',build:'24071616'};
  const good={firmware:'4.0',firmwareRaw:'V4.0 Build24071616',reachable:true};
  assert.equal(assessIoLogikFirmware(good,target).firmwareStatus,'ok');
  for(const firmware of ['3.3','3.4','4.1','5.0']) assert.equal(assessIoLogikFirmware({...good,firmware},target).firmwareStatus,'mismatch');
  assert.equal(assessIoLogikFirmware({...good,firmwareRaw:'V4.0 Build99999999'},target).firmwareStatus,'mismatch');
  for(const row of [{}, {...good,reachable:false}, {...good,firmware:null}, {...good,firmware:'garbage'}, {...good,firmware:'4.0.1'}, {...good,firmwareRaw:'V4.0'}])
    assert.equal(assessIoLogikFirmware(row,target).firmwareStatus,'unknown');
  assert.equal(assessIoLogikFirmware(good,null).firmwareStatus,'unknown');
  assert.equal(assessIoLogikFirmware(good,{...target,verified:false}).firmwareStatus,'unknown');
  assert.equal(assessIoLogikFirmware(good,{...target,version:'4.1'}).firmwareStatus,'mismatch');
});

test('latest scan persists across restart, replaces scope, excludes secrets and ignores wrong site/policy', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'prizm-iologik-scan-test-'));
  try {
    const file=path.join(dir,'last-scan.json'), store=new IoLogikScanStore(file);
    assert.equal(store.read('site-policy'),null);
    const row=inventory(target,reading,120);
    const snapshot:IoLogikScanSnapshot={schemaVersion:1,scopeKey:'site-policy',kind:'firmware',scannedAt:'2026-09-25T20:00:00Z',targetIps:[row.ip],rows:[Object.assign({},row,{password:'NEVER_SAVE_THIS'})]};
    store.save(snapshot);
    assert.doesNotMatch(readFileSync(file,'utf8'),/NEVER_SAVE_THIS|password/);
    assert.equal(new IoLogikScanStore(file).read('site-policy')?.rows[0].firmware,'3.3');
    assert.equal(store.read('other-site'),null); assert.equal(store.read('new-policy'),null);
    const unavailable={...row,ip:'10.0.1.16',reachable:false,result:'request_timeout',configurationStatus:'unknown' as const};
    store.save({...snapshot,kind:'discover',scannedAt:'2026-09-25T20:01:00Z',targetIps:[unavailable.ip],rows:[unavailable]});
    assert.deepEqual(store.read('site-policy')?.targetIps,['10.0.1.16']);
    assert.equal(store.read('site-policy')?.rows[0].result,'request_timeout');
    const saved=readFileSync(file,'utf8'), rename=fs.renameSync;
    try { fs.renameSync=()=>{throw new Error('disk failure');};assert.throws(()=>store.save(snapshot),/disk failure/); }
    finally {fs.renameSync=rename;}
    assert.equal(readFileSync(file,'utf8'),saved);
    assert.deepEqual(fs.readdirSync(dir),['last-scan.json']);
    writeFileSync(file,'{broken'); assert.equal(store.read('site-policy'),null);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('official package digest resolves v4.0 build, never trusts filename or arbitrary bytes', () => {
  const known = identifyFirmwareDigest(MOXA_E1242_V4_SHA512.toUpperCase());
  assert.equal(known.version, '4.0'); assert.equal(known.build, '24071616');
  assert.equal(known.prerequisiteVersion, '3.4'); assert.equal(known.verified, true);
  assert.deepEqual(known.directUpgradeFrom, [{version:'3.3',build:'22072210'}]);
  const unknown = identifyFirmware(Buffer.from('moxa-e1242-v4.0.1kp'));
  assert.equal(unknown.version, null); assert.equal(unknown.verified, false);
  assert.deepEqual(unknown.directUpgradeFrom, []);
  assert.equal(reportedFirmwareBuild('V4.0 Build24071616'), '24071616');
  assert.equal(reportedFirmwareBuild('V4.0 Build 24071616'), '24071616');
  assert.equal(reportedFirmwareBuild('V4.0'), null);
});

const target = { ip: '10.0.1.11', arrayIndex: 1, segmentIndex: 1, label: 'Array 1 / ES1' };
const config = 'MOD_TYPE=ioLogik E1242\nCONNECTION_WATCHDOG=120,(sec)\nDO00=0,(Off),DO00_SAFE=2,(Hold Last)\n[4. Network Settings]\nNET_IP=10.9.9.9\nNET_MAC=abc\n[5. I/O Settings]\nNET_CONFIG_OVERWRITE=1\nAI00=1';
const currentConfig = ['Firmware= V4.0 Build24071616', 'FW_Ver=4.0', 'eCOS= V2.5.0',
  'MOD_TYPE=E1242 -Remote Ethernet I/O Server', '[2. I/O Configurations]',
  'DO00=0,(DO),\tDO00_PWN=1,(On),\tDO00_SAFE=2,(Hold Last)', 'AI00=3',
  'Peer_DO_SM_STATUS00\t=2 ,(Hold Last)', 'Peer_DO_SM_STATUS01\t=1 ,(On)',
  '[4. Network Settings]', 'NET_CONFIG_OVERWRITE=1', 'NET_IP=10.0.1.11',
  'CONNECTION_WATCHDOG=300,(sec)', 'IP_FILTER=1', 'IDLE_TIMEOUT=90',
  '[10. Security Settings]', 'MXIO_AUTH_ENABLE=1', 'VENDOR_EXTENSION=keep', '<END>', ''].join('\r\n');
const reading: DeviceReading = { model: 'ioLogik E1242', firmware: '3.3', firmwareRaw: 'V3.3', do00Safe: '0', do00PeerSafe: '0', watchdogSeconds: 120 };
const info = '<table><TR><TD>Model Name</TD><TD>ioLogik E1242</TD></TR><TR><TD>Firmware Version</TD><TD>V3.3</TD></TR></table>';
const response = (text: string, headers: Record<string, string> = {}) => new Response(text, { headers });
const fw = { bytes: new Uint8Array([1, 2, 3]), fileName: 'moxa-e1242-v4.0.1.kp', version: '4.0.1' };
test('native HTTP emits explicit length, compatible header casing and binary multipart',async()=>{
  const original=http.request;
  let sent:Buffer|undefined;
  http.request=((_url:string,options:{headers:Record<string,string>;agent:boolean},callback:(res:EventEmitter)=>void)=>{
    const req=new EventEmitter() as EventEmitter & {end:(data:Buffer)=>void};
    req.end=(body:Buffer)=>{
      sent=body;
      assert.equal(options.headers['Content-Length'],String(body.length));
      assert.match(options.headers['Content-Type'],/^multipart\/form-data; boundary=/);
      assert.equal(options.headers.Connection,'close');assert.equal(options.agent,false);
      const res=Object.assign(new EventEmitter(),{statusCode:200,rawHeaders:['Set-Cookie','session=test; Path=/']});
      callback(res);queueMicrotask(()=>{res.emit('data',Buffer.from('ok'));res.emit('end');});
    };
    return req;
  }) as unknown as typeof http.request;
  try {
    const body=new FormData();body.set('firmware',new Blob([fw.bytes]),fw.fileName);
    const result=await deviceHttp('http://10.0.1.11/upload',{method:'POST',body});
    assert.equal(await result.text(),'ok');assert.equal(result.headers.getSetCookie().length,1);
    assert.ok(sent!.includes(Buffer.from([1,2,3])));assert.match(sent!.toString(),/filename="moxa-e1242-v4.0.1.kp"/);
  }finally{http.request=original;}
});
function simulation(options: { after?: Partial<DeviceReading>; before?: Partial<DeviceReading>; uploadError?: boolean; offline?: boolean; stuck?: boolean } = {}) {
  let now = 0, uploads = 0, watchdogs = 0, reads = 0;
  const client = {
discover: async () => true, login: async () => { if (options.offline) throw new IoLogikError('device_connection_failed'); },
    read: async () => { reads++; return { ...reading, ...options.before, ...(uploads && !options.stuck ? { firmware: '4.0.1', ...options.after } : {}) }; },
    readConfiguration:async()=>currentConfig,
    upload: async () => { uploads++; if (options.uploadError) throw new IoLogikError('device_connection_failed'); }, setWatchdog: async () => { watchdogs++; }
};
  const fleet = new NativeIoLogikFleet({ client: () => client, now: () => now, sleep: async ms => { now += ms; }, recoveryMs: 9000 });
  return { fleet, counts: () => ({ uploads, watchdogs, reads }) };
}
test('parses reordered uppercase, single-quoted and unquoted controls', () => {
  assert.equal(attributes('<INPUT VALUE=abc NAME=Token>').name, 'Token');
  assert.deepEqual(uploadForm(`<FORM ACTION='upload.htm'><INPUT NAME='token' VALUE='a&amp;b' TYPE='hidden'><INPUT NAME=firmware TYPE=FILE></FORM>`), { action: 'upload.htm', field: 'firmware', hidden: { token: 'a&b' } });
  assert.throws(() => uploadForm('<html>login</html>'), /upload_form_missing/);
  assert.equal(parseReading(info, config).watchdogSeconds, 120);
  assert.equal(parseReading(info, '').watchdogSeconds, null);
});
test('staging strips all network fields and enforces Off while preserving chosen watchdog', () => {
  const staged = stageConfiguration(config);
  assert.equal(staged.watchdogSeconds, 120); assert.match(staged.text, /DO00_SAFE=0,\(Off\)/);
  assert.doesNotMatch(staged.text, /NET_|10\.9\.9\.9/); assert.match(staged.text, /AI00=1/);
  assert.throws(() => stageConfiguration(config.replace('E1242', 'E1212')), /model/);
  assert.throws(() => stageConfiguration(config.replace('120', '0')), /watchdog/);
  assert.equal(inventory(target, reading, NaN).configurationStatus, 'unknown');
});
test('per-device staging retains required network section without readdressing or changing access restrictions',()=>{
  const payload=prepareDeviceConfiguration(config,currentConfig,target.ip);
  assert.match(payload,/\[4\. Network Settings\]/);assert.match(payload,/NET_IP=10\.0\.1\.11/);
  assert.doesNotMatch(payload,/10\.9\.9\.9|NET_CONFIG_OVERWRITE=1/);
  assert.match(payload,/NET_CONFIG_OVERWRITE=0/);assert.match(payload,/CONNECTION_WATCHDOG=120/);
  assert.match(payload,/IP_FILTER=1/);assert.match(payload,/IDLE_TIMEOUT=90/);assert.match(payload,/DO00_SAFE=0/);
  assert.ok(payload.includes('\r\n'));assert.equal(payload.replace(/\r\n/g,'').includes('\n'),false);
  assert.throws(()=>prepareDeviceConfiguration(config,currentConfig,'10.0.2.11'),/identity_mismatch/);
  assert.throws(()=>prepareDeviceConfiguration(config,'',target.ip),/field_missing/);
});
test('golden policy preserves target-native metadata, authentication, unknown fields and unrelated I/O across versions', () => {
  for (const version of ['3.3', '4.0', '9.7']) {
    for (const newline of ['\r\n', '\n']) {
      const current = currentConfig.replaceAll('4.0', version).replaceAll('\r\n', newline);
      const payload = prepareDeviceConfiguration(config, current, target.ip);
      assert.equal(payload, current.replace('DO00_SAFE=2,(Hold Last)', 'DO00_SAFE=0,(Off)')
        .replace('Peer_DO_SM_STATUS00\t=2 ,(Hold Last)', 'Peer_DO_SM_STATUS00\t=0 ,(Off)')
        .replace('CONNECTION_WATCHDOG=300', 'CONNECTION_WATCHDOG=120').replace('NET_CONFIG_OVERWRITE=1', 'NET_CONFIG_OVERWRITE=0'));
      assert.match(payload, /MXIO_AUTH_ENABLE=1/);
      assert.match(payload, /AI00=3/); // Never apply AI00=1 from the golden export.
      assert.match(payload, /DO00_PWN=1,\(On\)/);
    }
  }
});
test('normalizes both DO-00 safe fields without changing other channels or adding missing native fields', () => {
  for (const peer of ['Peer_DO_SM_STATUS00\t=2 ,(Hold Last)', 'Peer_DO_SM_STATUS00=1,(On)', 'Peer_DO_SM_STATUS00 = 0 , (Off)']) {
    const current = currentConfig.replace('Peer_DO_SM_STATUS00\t=2 ,(Hold Last)', peer);
    const payload = prepareDeviceConfiguration(config, current, target.ip);
    const parsed = parseReading(info, payload);
    assert.equal(parsed.do00Safe, '0');
    assert.equal(parsed.do00PeerSafe, '0');
    assert.match(payload, /Peer_DO_SM_STATUS01\t=1 ,\(On\)/);
    assert.equal(prepareDeviceConfiguration(config, payload, target.ip), payload, 'preparation is idempotent');
    assert.equal(parseReading(info, stageConfiguration(current).text).do00PeerSafe, '0');
  }
  for (const bad of [
    currentConfig.replace('Peer_DO_SM_STATUS00\t=2 ,(Hold Last)\r\n', ''),
    currentConfig.replace('Peer_DO_SM_STATUS00\t=2', 'Peer_DO_SM_STATUS00\t=9'),
    currentConfig.replace('<END>', 'Peer_DO_SM_STATUS00=0,(Off)\r\n<END>'),
    currentConfig.replace('Peer_DO_SM_STATUS00\t=2 ,(Hold Last)', 'Peer_DO_SM_STATUS00=unrecognized'),
  ]) {
    assert.throws(() => prepareDeviceConfiguration(config, bad, target.ip), /peer_do00_configuration_unsupported/);
    assert.equal(parseReading(info, bad).do00PeerSafe, null);
  }
});
test('scan compliance includes the companion DO-00 safe state', () => {
  assert.equal(inventory(target, reading, 120).configurationStatus, 'ok');
  const conflict = inventory(target, { ...reading, do00PeerSafe: '2' }, 120);
  assert.equal(conflict.configurationStatus, 'mismatch');
  assert.match(conflict.configurationDetail!, /companion safe state 2/);
  assert.equal(inventory(target, { ...reading, do00PeerSafe: null }, 120).configurationStatus, 'unknown');
});
test('a retained Hold Last companion field cannot verify an accepted configuration upload', async () => {
  const sim = simulation({ after: { do00PeerSafe: '2' } });
  const [result] = await sim.fleet.deploy({ targets: [target], password: 'secret', kind: 'configuration', config });
  assert.equal(result.success, false);
  assert.equal(result.action, 'unverified');
  assert.equal(result.after?.configurationStatus, 'mismatch');
  assert.equal(sim.counts().uploads, 1);
  assert.equal(sim.counts().watchdogs, 0);
});
test('device-native policy accepts tab-aligned network fields and preserves DO alias entries', () => {
  const current = currentConfig.replace('NET_IP=', 'NET_IP\t\t=')
    .replace('<END>', 'DO00\t\t=DO-00\r\n<END>');
  const prepared = prepareDeviceConfiguration(config, current, target.ip);
  assert.match(prepared, /NET_IP\t\t=10\.0\.1\.11/);
  assert.match(prepared, /DO00\t\t=DO-00/);
  assert.match(prepared, /DO00_SAFE=0,\(Off\)/);
});
test('unsupported, incomplete and ambiguous device exports fail before an upload can be prepared', () => {
  for (const bad of [currentConfig.replace('<END>', ''), currentConfig.replace('DO00=0,(DO)', 'DO00=1,(Pulse)'),
    currentConfig.replace('DO00_SAFE=2', 'DO00_SAFE=9'), currentConfig.replace('CONNECTION_WATCHDOG=300,(sec)', 'CONNECTION_WATCHDOG=300,(ms)'),
    currentConfig.replace('NET_CONFIG_OVERWRITE=1', 'NET_CONFIG_OVERWRITE=2'),
    currentConfig.replace('<END>', 'CONNECTION_WATCHDOG=1,(sec)\r\n<END>'), currentConfig.replace('E1242', 'E1212')]) {
    assert.throws(() => prepareDeviceConfiguration(config, bad, target.ip), IoLogikError);
  }
});
test('recognizes actual Moxa rejection pages even when served with HTTP 200',()=>{
  assert.throws(()=>validateUploadResponse('configuration','<font>Import config fail. Please return to Import System Config page.</font>'),/configuration_import_rejected/);
  assert.throws(()=>validateUploadResponse('firmware','<h2>File process fails...</h2>File Not Found or Invalid file format !'),/upload_file_rejected/);
  assert.throws(()=>validateUploadResponse('configuration','invalid_token.htm'),/authentication_rejected/);
  assert.throws(()=>validateUploadResponse('configuration','Starting updating...'),/response_unrecognized/);
  validateUploadResponse('configuration','System configuration file imported and restart successfully.');
  validateUploadResponse('firmware','Firmware upgrade was successful.');
});
test('configuration multipart omits network overwrite and submits only after the file',async()=>{
  const client=new IoLogikClient(target.ip,'secret',async(_url,init)=>{
    if(init?.method!=='POST')return response('<form action=06_5_1.htm><input type=checkbox name=NetConfig_OverWrite value=1 checked><input type=hidden name=token value=x><input type=file name=importfile><input type=submit name=import value=Import></form>');
    const body=init.body as FormData;
    assert.deepEqual([...body.keys()],['token','importfile','import']);
    assert.equal((body.get('importfile') as File).name,'ik1242.txt');
    return response('System configuration file imported and restart successfully.');
  });
  await client.upload('configuration',Buffer.from(prepareDeviceConfiguration(config,currentConfig,target.ip)),'ik1242.txt');
});
test('native challenge login and multipart upload use isolated cookies, no password in body', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const client = new IoLogikClient(target.ip, 'secret', async (url, init) => {
    calls.push({ url, init }); const pathname = new URL(url).pathname;
    if (pathname === '/') return response('<INPUT NAME=Token VALUE=challenge>', { 'Set-Cookie': 'session=one; Path=/' });
    if (pathname === '/home.htm') return response('welcome');
    if (pathname === '/01.htm') return response(info);
    if (pathname === '/06_4.htm') return response('<form action="/upload"><input type=hidden name=token value=fresh><input type=file name=firmware></form>');
    if (pathname === '/upload') return response('Firmware upgrade was successful.');
    throw new Error('Unexpected mock request');
  });
  await client.login(); await client.upload('firmware', fw.bytes, fw.fileName);
  const login = calls.find(c => c.url.endsWith('/home.htm'))!;
  assert.equal(String(login.init!.body).includes('secret'), false);
  assert.equal((login.init!.body as URLSearchParams).get('Password'), createHash('md5').update('secretchallenge').digest('hex'));
  assert.equal(new Headers(login.init!.headers).get('Cookie'), 'session=one');
  assert.equal(new Headers(login.init!.headers).get('Content-Type'), 'application/x-www-form-urlencoded');
  const upload = calls.at(-1)!.init!.body as FormData;
  assert.equal(upload.get('token'), 'fresh'); assert.equal((upload.get('firmware') as File).size, 3);
  assert.equal(upload.get('update'), 'Update');
  assert.equal(upload.has('Submit'), false);
  const other = new IoLogikClient('10.0.2.11', 'secret', async (_url, init) => { assert.equal(new Headers(init?.headers).has('Cookie'), false); return response('hello'); });
  await other.discover();
});
test('cross-origin upload actions and missing tokens never send POST', async () => {
  for (const html of ['<form action="http://10.0.9.9/upload"><input type=file name=firmware><input type=hidden name=token value=x></form>', '<form action=/upload><input type=file name=firmware></form>']) {
    let posts = 0; const client = new IoLogikClient(target.ip, 'secret', async (_url, init) => { if (init?.method === 'POST') posts++; return response(html); });
    await assert.rejects(() => client.upload('firmware', fw.bytes, fw.fileName)); assert.equal(posts, 0);
  }
});
test('does not follow POST redirect and rejects login/error pages', async () => {
  let posts = 0;
  const client = new IoLogikClient(target.ip, 'secret', async (_url, init) => {
    if (init?.method === 'POST') { posts++; return new Response(null, { status: 302, headers: { location: '/other' } }); }
    return response('<form action=/upload><input type=file name=firmware><input type=hidden name=token value=x></form>');
  });
  await assert.rejects(() => client.upload('firmware', fw.bytes, fw.fileName), /write_redirect_unverified/); assert.equal(posts, 1);
  const badLogin = new IoLogikClient(target.ip, 'secret', async (_url, init) => response(init?.method === 'POST' ? 'Input Password' : '<input name=Token value=x>'));
  await assert.rejects(() => badLogin.login(), /login_rejected/);
});
test('watchdog update preserves unrelated form values', async () => {
  let submitted: URL | undefined;
  const client = new IoLogikClient(target.ip, 'secret', async url => {
    if (url.includes('/set.htm')) { submitted = new URL(url); return response('ok'); }
    return response('<input name=token value=x><input name=WDTime value=300><input name=MOD_LOC value="Room A"><input name=IdleTime value=90><select name=wd_src><option value=2 selected>source</option></select>');
  });
  await client.setWatchdog(120);
  assert.equal(submitted!.searchParams.get('WDTime'), '120'); assert.equal(submitted!.searchParams.get('IdleTime'), '90'); assert.equal(submitted!.searchParams.get('MOD_LOC'), 'Room A'); assert.equal(submitted!.searchParams.get('wd_src'), '2');
});
test('firmware versions require exact readback; no downgrade or ambiguous same-family reflash', async () => {
  assert.equal(compareFirmware('', '4.0.1'), 'ambiguous'); assert.equal(compareFirmware('4.0', '4.0.1'), 'ambiguous');
  for (const version of ['4.0', '4.0.1', '4.1']) {
    const sim = simulation({ before: { firmware: version } });
    const [result] = await sim.fleet.deploy({ targets: [target], password: 'secret', kind: 'firmware', config, firmware: fw });
    assert.equal(sim.counts().uploads, 0); assert.equal(result.success, version === '4.0.1');
  }
});
test('firmware recovery verifies twice, including after response lost to reboot', async () => {
  for (const uploadError of [false, true]) {
    const sim = simulation({ uploadError }); const [result] = await sim.fleet.deploy({ targets: [target], password: 'secret', kind: 'firmware', config, firmware: fw });
    assert.equal(result.success, true); assert.equal(result.after?.firmware, '4.0.1'); assert.deepEqual(sim.counts(), { uploads: 1, watchdogs: 0, reads: 3 });
  }
});
test('partial firmware readback and stale success responses stay unverified, with one upload', async () => {
  for (const options of [{ after: { firmware: '4.0' } }, { stuck: true }]) {
    const sim = simulation(options); const [result] = await sim.fleet.deploy({ targets: [target], password: 'secret', kind: 'firmware', config, firmware: fw });
    assert.equal(result.success, false); assert.equal(sim.counts().uploads, 1);
  }
});
test('configuration mismatch never passes and never triggers a secondary settings write', async () => {
  const sim = simulation({ before: { watchdogSeconds: 300 }, after: { watchdogSeconds: 300 } });
  const [result] = await sim.fleet.deploy({ targets: [target], password: 'secret', kind: 'configuration', config });
  assert.equal(result.success, false); assert.equal(sim.counts().uploads, 1); assert.equal(sim.counts().watchdogs, 0);
  assert.equal(result.uploadStatus, 'accepted');
  assert.match(result.detail, /Device reported upload success/);
  const good = simulation(); assert.equal((await good.fleet.deploy({ targets: [target], password: 'secret', kind: 'configuration', config }))[0].success, true);
});
test('lost upload response is distinguished from explicit device acceptance', async () => {
  const sim = simulation({ uploadError: true, stuck: true, before: { do00Safe: '2' } });
  const [result] = await sim.fleet.deploy({ targets: [target], password: 'secret', kind: 'configuration', config });
  assert.equal(result.success, false);
  assert.equal(result.uploadStatus, 'unconfirmed');
  assert.match(result.detail, /Upload response was not confirmed/);
  assert.equal(sim.counts().uploads, 1);
});
test('firmware-only updates do not require a golden configuration or write watchdog settings', async () => {
  for (const policy of [undefined, 'invalid golden file']) {
    const sim = simulation();
    const [result] = await sim.fleet.deploy({ targets: [target], password: 'secret', kind: 'firmware', config: policy, firmware: fw });
    assert.equal(result.success, true);
    assert.equal(sim.counts().watchdogs, 0);
    assert.equal(result.after?.configurationStatus, 'unknown');
  }
});
test('offline targets are accounted for; unknown model cannot be flashed', async () => {
  const sim = simulation({ offline: true }); const rows = await sim.fleet.scan([target], 'secret', 120); assert.equal(rows.length, 1); assert.equal(rows[0].configurationStatus, 'unknown');
  const [result] = await sim.fleet.deploy({ targets: [target], password: 'secret', kind: 'firmware', config, firmware: fw }); assert.equal(result.success, false); assert.equal(sim.counts().uploads, 0);
  const unknown = simulation({ before: { model: null } }); await unknown.fleet.deploy({ targets: [target], password: 'secret', kind: 'firmware', config, firmware: fw }); assert.equal(unknown.counts().uploads, 0);
});
test('device lock prevents concurrent writes', async () => {
  let release!: () => void, uploads = 0;
  const gate = new Promise<void>(resolve => { release = resolve; }); let now = 0;
  const fleet = new NativeIoLogikFleet({ client: () => ({ discover: async () => true, login: () => gate, read: async () => reading,readConfiguration:async()=>currentConfig, upload: async () => { uploads++; }, setWatchdog: async () => { } }), now: () => now, sleep: async ms => { now += ms; } });
  const input = { targets: [target], password: 'secret', kind: 'configuration' as const, config };
  const first = fleet.deploy(input); const second = await fleet.deploy(input); assert.equal(second[0].action, 'blocked'); release(); await first; assert.equal(uploads, 1); assert.deepEqual(fleet.activeTargets(), []);
});
test('qualified direct path admits only the tested source build and retains all write/readback safeguards', async () => {
  const identity=identifyFirmwareDigest(MOXA_E1242_V4_SHA512);
  const firmware={...fw,version:identity.version!,build:identity.build!,prerequisiteVersion:identity.prerequisiteVersion!,directUpgradeFrom:identity.directUpgradeFrom};
  for(const uploadError of [false,true]) {
    const sim=simulation({before:{firmware:'3.3',firmwareRaw:'V3.3 Build22072210'},after:{firmware:'4.0',firmwareRaw:'V4.0 Build24071616'},uploadError});
    const [result]=await sim.fleet.deploy({targets:[target],password:'',kind:'firmware',firmware});
    assert.equal(result.success,true);assert.equal(result.action,'updated');assert.deepEqual(sim.counts(),{uploads:1,watchdogs:0,reads:3});
  }
  for(const before of [
    {firmware:'3.3',firmwareRaw:'V3.3'},
    {firmware:'3.3',firmwareRaw:'V3.3 Build99999999'},
    {firmware:'3.2',firmwareRaw:'V3.2 Build22072210'},
    {firmware:'3.3',firmwareRaw:'V3.3 Build22072210',model:'ioLogik E1212'},
  ]) {
    const sim=simulation({before});const [result]=await sim.fleet.deploy({targets:[target],password:'',kind:'firmware',firmware});
    assert.equal(result.success,false);assert.equal(sim.counts().uploads,0);
  }
  const wrong=simulation({before:{firmware:'3.3',firmwareRaw:'V3.3 Build22072210'},after:{firmware:'4.0',firmwareRaw:'V4.0 Build99999999'}});
  const [result]=await wrong.fleet.deploy({targets:[target],password:'',kind:'firmware',firmware});
  assert.equal(result.success,false);assert.equal(wrong.counts().uploads,1);
});

test('verified builds and adjacent-release policy prevent skipped releases and false success', async () => {
  const firmware = { ...fw, version: '4.0', build: '24071616', prerequisiteVersion: '3.4' };
  for (const before of [
    { firmware: '3.3', firmwareRaw: 'V3.3 Build22072210' },
    { firmware: '4.0', firmwareRaw: 'V4.0' },
    { firmware: '4.0', firmwareRaw: 'V4.0 Build99999999' },
    { firmware: '4.1', firmwareRaw: 'V4.1 Build99999999' },
  ]) {
    const sim = simulation({ before });
    const [result] = await sim.fleet.deploy({ targets: [target], password: '', kind: 'firmware', firmware });
    assert.equal(result.success, false); assert.equal(sim.counts().uploads, 0);
  }
  const current = simulation({ before: { firmware: '4.0', firmwareRaw: 'V4.0 Build24071616' } });
  const [skipped] = await current.fleet.deploy({ targets: [target], password: '', kind: 'firmware', firmware });
  assert.equal(skipped.success, true); assert.equal(skipped.action, 'skipped'); assert.equal(current.counts().uploads, 0);
  for (const build of ['24071616', '99999999', '']) {
    const sim = simulation({ before: { firmware: '3.4' }, after: { firmware: '4.0', firmwareRaw: `V4.0 Build${build}` } });
    const [result] = await sim.fleet.deploy({ targets: [target], password: '', kind: 'firmware', firmware });
    assert.equal(result.success, build === '24071616'); assert.equal(sim.counts().uploads, 1);
    assert.ok(sim.counts().reads >= 3);
  }
});

test('service validates targets before network, imports portable assets, rejects corrupted package', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'prizm-iologik-native-test-'));
  const saved = process.env.PRIZM_IOLOGIK_ASSET_DIR; process.env.PRIZM_IOLOGIK_ASSET_DIR = dir;
  try {
    const service = await import('./iologikFleetService');
    service.importIoLogikConfiguration({ text: config }); assert.equal(service.getIoLogikAssets().backend, 'native');
    assert.equal(service.getIoLogikConfigurationProfile().deploymentTargets?.watchdogSeconds, 120);
    assert.doesNotMatch(readFileSync(path.join(dir, 'golden-config.txt'), 'utf8'), /NET_/);
    await assert.rejects(() => service.deployIoLogikFirmware({ targetIps: [] }), /Select/);
    await assert.rejects(() => service.discoverIoLogik(['10.0.99.9']), /Unknown/);
    await assert.rejects(() => service.discoverIoLogik([target.ip, target.ip]), /duplicate/);
    assert.throws(() => service.importIoLogikFirmware({ fileName: 'wrong-v4.0.1.kp', base64: 'AQID' }), /E1242|Moxa/);
    const manifest = service.importIoLogikFirmware({ fileName: fw.fileName, base64: 'AQID' });
    assert.equal(manifest.sizeBytes, 3);
    assert.equal(manifest.version, null); assert.equal(manifest.verified, false);
    await assert.rejects(() => service.deployIoLogikFirmware({ targetIps: [target.ip] }), /not vendor-verified/);
    writeFileSync(path.join(dir, manifest.storedName), 'corrupt');
    await assert.rejects(() => service.deployIoLogikFirmware({ targetIps: [target.ip] }), /checksum/);
    // Assets are stored without any host-specific executable or paths.
    assert.equal(service.getIoLogikAssets().backendAvailable, true);
    assert.equal(service.getIoLogikOperation().operation, null);
    const backend = process.env.PRIZM_IOLOGIK_BACKEND;
    process.env.PRIZM_IOLOGIK_BACKEND = 'legacy';
    assert.equal(service.getIoLogikAssets().backend, 'legacy');
    await assert.rejects(() => service.deployIoLogikFirmware({ targetIps: [target.ip] }), /native backend/);
    if (backend === undefined) delete process.env.PRIZM_IOLOGIK_BACKEND; else process.env.PRIZM_IOLOGIK_BACKEND = backend;
  } finally { if (saved === undefined) delete process.env.PRIZM_IOLOGIK_ASSET_DIR; else process.env.PRIZM_IOLOGIK_ASSET_DIR = saved; rmSync(dir, { recursive: true, force: true }); }
});

test('service publishes scan progress, blocks overlap, persists verified updates and retains inventory on scan failure', async () => {
  const dir=mkdtempSync(path.join(tmpdir(),'prizm-iologik-service-test-'));
  const saved=process.env.PRIZM_IOLOGIK_ASSET_DIR;process.env.PRIZM_IOLOGIK_ASSET_DIR=dir;
  const originalScan=NativeIoLogikFleet.prototype.scan, originalDeploy=NativeIoLogikFleet.prototype.deploy;
  try {
    const service=await import('./iologikFleetService');
    service.importIoLogikConfiguration({text:config});
    const targets=service.getIoLogikTopology().targets.slice(0,2);
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    NativeIoLogikFleet.prototype.scan=async function (list,_password,watchdog,onRow) {
      const rows=list.map(t=>({...inventory(t,reading,watchdog),observedAt:new Date().toISOString(),observationSource:'scan' as const}));
      onRow?.(rows[0]);await gate;onRow?.(rows[1]);return rows;
    };
    const pending=service.scanIoLogikFirmware({targetIps:targets.map(t=>t.ip)});
    assert.equal(service.getIoLogikOperation().scan?.completed,1);
    assert.equal(service.getIoLogikOperation().inventory.length,1);
    await assert.rejects(()=>service.scanIoLogikFirmware({targetIps:targets.map(t=>t.ip)}),/already running/);
    await assert.rejects(()=>service.deployIoLogikConfiguration({targetIps:[targets[0].ip]}),/scan to finish/);
    release();await pending;
    const scanReport=readFileSync(path.join(dir,'last-scan.json'),'utf8');
    assert.equal(service.getIoLogikOperation().scan?.state,'complete');
    NativeIoLogikFleet.prototype.deploy=async function(input) {
      const results=input.targets.map(t=>({...t,success:true,action:'updated',detail:'Mock verified readback',after:inventory(t,{...reading,firmware:'4.0'},120)}));
      results.forEach(r=>input.onResult?.(r));return results;
    };
    // Ensure mocked fresh readbacks follow the scan timestamp without a wall-clock sleep.
    const scanPath=path.join(dir,'last-scan.json');
    const earlier=JSON.parse(scanReport);earlier.scannedAt='2026-01-01T00:00:00Z';earlier.rows.forEach((r:{observedAt:string})=>{r.observedAt=earlier.scannedAt;});writeFileSync(scanPath,JSON.stringify(earlier));
    const unchangedReport=readFileSync(scanPath,'utf8');
    await service.deployIoLogikConfiguration({targetIps:[targets[0].ip]});
    assert.equal(service.getIoLogikOperation().inventory.find(r=>r.ip===targets[0].ip)?.firmware,'4.0');
    assert.equal(readFileSync(scanPath,'utf8'),unchangedReport);
    NativeIoLogikFleet.prototype.scan=async()=>{throw new Error('mock acquisition failed');};
    await assert.rejects(()=>service.scanIoLogikFirmware({targetIps:[targets[0].ip]}),/mock acquisition failed/);
    assert.equal(service.getIoLogikOperation().scan?.state,'failed');
    assert.equal(service.getIoLogikOperation().inventory.find(r=>r.ip===targets[0].ip)?.firmware,'4.0');
    service.importIoLogikConfiguration({text:config.replace('120,(sec)','300,(sec)')});
    assert.equal(service.getIoLogikOperation().scan,null);
    assert.deepEqual(service.getIoLogikOperation().inventory,[],'different policy cannot reuse old inventory');
  } finally {
    NativeIoLogikFleet.prototype.scan=originalScan;NativeIoLogikFleet.prototype.deploy=originalDeploy;
    if(saved===undefined)delete process.env.PRIZM_IOLOGIK_ASSET_DIR;else process.env.PRIZM_IOLOGIK_ASSET_DIR=saved;
    rmSync(dir,{recursive:true,force:true});
  }
});
