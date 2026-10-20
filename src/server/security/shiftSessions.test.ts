import assert from 'node:assert/strict';
import {LocalSessions,AccessError} from './localSessions';
import {hashLocalPassword,type LocalAccount} from './localAccounts';
import {monitoringWorkspaceRequest} from '../fleet/workspaceAccess';
const password='Offline fixture password only';
const account:LocalAccount={id:'test',email:'shift@example.invalid',disabled:false,version:1,password:await hashLocalPassword(password),grants:[]};
let now=Date.now();const start=now;
const sessions=new LocalSessions(async()=>structuredClone([account]),()=>now,true,false);
const auth=await sessions.login(account.email,password,'fixture');
assert.equal((await sessions.status(auth.token)).expiresAt,start+12*3600000);
for(let minute=1;minute<=16;minute++){now=start+minute*60000;await sessions.monitoring(auth.token);}
await assert.rejects(sessions.requireControl(auth.token),(e:unknown)=>e instanceof AccessError&&e.status===423);
await sessions.authenticate(auth.token,true);
await assert.rejects(sessions.requireControl(auth.token),/Controls locked/,'A click cannot unlock expired controls');
await assert.rejects(sessions.unlockControls(auth.token,'wrong',async()=>{}));
await assert.rejects(sessions.unlockControls(auth.token,password,async()=>{throw Error('Audit unavailable');}));
await assert.rejects(sessions.requireControl(auth.token));
await sessions.unlockControls(auth.token,password,async()=>{});await sessions.requireControl(auth.token);
now+=14*60000;await sessions.authenticate(auth.token,true);now+=14*60000;await sessions.requireControl(auth.token);
// Visible monitoring spans a shift but cannot bypass the absolute deadline.
for(;now<start+12*3600000-60000;now+=60000)await sessions.monitoring(auth.token);
now=start+12*3600000;await assert.rejects(sessions.monitoring(auth.token));
const unattended=await sessions.login(account.email,password,'fixture');now+=15*60000;
await assert.rejects(sessions.monitoring(unattended.token),'Hidden/unattended sessions expire');
const revoked=await sessions.login(account.email,password,'fixture');account.disabled=true;
await assert.rejects(sessions.monitoring(revoked.token));account.disabled=false;
const legacy=new LocalSessions(async()=>[account],()=>now);assert.equal(legacy.maximumAgeMs,8*3600000);
const old=await legacy.login(account.email,password,'fixture');now+=14*60000;await legacy.monitoring(old.token);now+=60000;
await assert.rejects(legacy.authenticate(old.token),'Rollback keeps legacy idle expiry');
for(const [method,path] of [['POST','/api/local/balancing'],['GET','/tools/controls/ems/array/1/contactors/open'],['GET','/api/unknown'],['DELETE','/api/local/site-data/cells'],['POST','/api/local/site-data/thermal/storage']])assert.equal(monitoringWorkspaceRequest(method,path),false);
for(const [method,path] of [['GET','/api/local/site-data/cells/history'],['GET','/api/local/site-data/pcs'],['POST','/api/local/site-data/thermal/site-history/query']])assert.equal(monitoringWorkspaceRequest(method,path),true);
// The default shift policy keeps both navigation and controls valid for one
// fixed 24-hour login, without depending on a visible tab or heartbeat.
const daily=new LocalSessions(async()=>structuredClone([account]),()=>now,true);
const dailyStart=now,day=await daily.login(account.email,password,'day');
assert.equal(daily.maximumAgeMs,24*3600000);
now+=23*3600000;
const status=await daily.status(day.token);
assert.equal(status.continuousControlAccess,true);
assert.equal(status.idleExpiresAt,dailyStart+24*3600000);
assert.equal(status.controlExpiresAt,status.expiresAt);
await daily.requireControl(day.token);
// Cleanup while another user signs in cannot evict a valid unattended shift.
const second=await daily.login(account.email,password,'second');
await daily.requireControl(day.token);
await daily.authenticate(day.token,true);await daily.monitoring(day.token);
assert.equal((await daily.status(day.token)).expiresAt,dailyStart+24*3600000,'Activity never extends the absolute deadline');
now=dailyStart+24*3600000-1;await daily.requireControl(day.token);
now++;await assert.rejects(daily.requireControl(day.token));
await assert.rejects(daily.unlockControls(day.token,password,async()=>{}),'Expired sessions require a fresh login');
daily.logout(second.token);await assert.rejects(daily.authenticate(second.token));
const revokedDaily=await daily.login(account.email,password,'revoked');account.version++;
await assert.rejects(daily.requireControl(revokedDaily.token),'Grant/account edits revoke shift access');
const disabledDaily=await daily.login(account.email,password,'disabled');account.disabled=true;
await assert.rejects(daily.requireControl(disabledDaily.token));account.disabled=false;
console.log('PASS fixed 24-hour navigation/control access, inactive tabs, expiry, logout/revocation, 12-hour rollback and legacy policy');
