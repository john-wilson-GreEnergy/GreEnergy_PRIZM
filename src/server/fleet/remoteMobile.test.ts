import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Socket} from 'node:net';
import {mkdtemp,mkdir,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createRemoteMobileApp} from './remoteMobile';
import {FleetBroker} from './FleetBroker';
import {hashLocalPassword,type LocalAccount} from '../security/localAccounts';
import {emptyMetrics} from '../../core/fleet/model';
const dir=await mkdtemp(path.join(tmpdir(),'prizm-remote-test-'));
await mkdir(path.join(dir,'assets'));await writeFile(path.join(dir,'assets/mobile-fixture.js'),'// fixture');
await writeFile(path.join(dir,'mobile.html'),'<script src="/assets/mobile-fixture.js"></script>');
await writeFile(path.join(dir,'index.html'),'<h1>Desktop fixture</h1>');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const config={origin:'https://prizm.example.test',issuer:'https://fixture.cloudflareaccess.com',audience:'a'.repeat(64),keysFile:path.join(dir,'keys.json'),keysOwnerUid:process.getuid!(),socketPath:'/run/prizm-remote/mobile.sock'};
const keys=[{...publicKey.export({format:'jwk'}),kid:'fixture'}];
await writeFile(config.keysFile,JSON.stringify({fetchedAt:Date.now(),keys}),{mode:0o600});
function jwt(email:string){const sec=Math.floor(Date.now()/1000),data=[{alg:'RS256',kid:'fixture'},{iss:config.issuer,aud:[config.audience],type:'app',email,iat:sec,exp:sec+3600}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');}
const sites=['one','two'].map(siteId=>({siteId,blockId:'b1',blockIndex:1,stationCode:'LAB'+siteId,name:siteId})),broker=new FleetBroker(sites);
for(const s of sites)broker.accept(s.siteId,{...s,schema:'prizm-site-summary-v1',observedAt:new Date().toISOString(),stale:false,metrics:emptyMetrics()});
const password='Private fixture password',account:LocalAccount={id:'tech',email:'tech@example.test',password:await hashLocalPassword(password),disabled:false,version:1,remoteAccess:true,grants:[{capability:'telemetry.view',siteId:'one',blockId:'b1',scope:{kind:'block'}}]};
const other={...account,id:'other',email:'other@example.test'};
let hvacCalls:string[]=[],forwarded:string[]=[];
const app=await createRemoteMobileApp(broker,{publicDirectory:dir,accounts:async()=>[account,other],hvac:id=>{hvacCalls.push(id);return {units:[],error:null,capturedAt:Date.now()};},audit:async()=>{},desktop:sites.map(s=>({collector:{...s,url:'https://127.0.0.1:9443/api/fleet/site-summary',token:'x'.repeat(43)},forward:async(req,res,recheck)=>{await recheck();forwarded.push(s.siteId+req.url);res.json({site:s.siteId});}}))},config);
const server=createServer(app),socketPath=path.join(dir,'http.sock');await new Promise<void>((r,j)=>{server.once('error',j);server.listen(socketPath,r);});
async function request(method:string,url:string,body?:unknown,extra:Record<string,string>={}){
 const payload=body===undefined?'':JSON.stringify(body),headers={Host:'prizm.example.test',Origin:config.origin,Connection:'close','Content-Type':'application/json','Content-Length':String(Buffer.byteLength(payload)),'Cf-Access-Jwt-Assertion':jwt(account.email),...extra};
 const result=await new Promise<string>((resolve,reject)=>{const s=new Socket();let data='';s.setEncoding('utf8');s.on('data',d=>data+=d);s.on('end',()=>resolve(data));s.on('error',reject);s.setTimeout(10000,()=>s.destroy(Error('Timeout')));s.connect(socketPath,()=>s.write(`${method} ${url} HTTP/1.1\r\n${Object.entries(headers).map(([k,v])=>k+': '+v).join('\r\n')}\r\n\r\n${payload}`));});
 const boundary=result.indexOf('\r\n\r\n'),head=result.slice(0,boundary),text=result.slice(boundary+4),returned=Object.fromEntries(head.split('\r\n').slice(1).map(l=>{const i=l.indexOf(':');return [l.slice(0,i).toLowerCase(),l.slice(i+1).trim()];}));
 return {status:Number(head.split(' ')[1]),headers:returned,data:/application\/json/.test(returned['content-type'])?JSON.parse(text):text};
}
try{
 assert.equal((await request('GET','/mobile/')).status,200);
 const navigation={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
 assert.equal((await request('GET','/mobile/',undefined,navigation)).status,200,'Identity-provider return must not require a refresh');
 assert.equal((await request('GET','/mobile/api/fleet/session',undefined,navigation)).status,403);
 assert.equal((await request('POST','/mobile/api/fleet/login',{email:account.email,password},navigation)).status,403);
 assert.equal((await request('GET','/assets/mobile-fixture.js')).status,200);
 assert.equal((await request('GET','/mobile/',undefined,{'Cf-Access-Jwt-Assertion':''})).status,403);
 for(const url of ['/api/fleet/admin/users','/api/fleet/login','/api/local/commands','/mobile/api/fleet/admin/users','/mobile/api/fleet/reauthenticate','/mobile/api/fleet/%73ummary','/mobile/api/fleet/summary?x=1','/mobile/api/fleet/summary/','/assets/server.cjs','/assets/desktop.js','/accounts.json'])assert.equal((await request('GET',url)).status,403,url);
 assert.equal((await request('POST','/mobile/api/fleet/login',{email:other.email,password})).status,403);
 const login=await request('POST','/mobile/api/fleet/login',{email:account.email,password});assert.equal(login.status,200);
 assert.match(login.headers['set-cookie'],/Secure/);assert.match(login.headers['set-cookie'],/Path=\/;/);let cookie=login.headers['set-cookie'].split(';')[0];
 const session=await request('GET','/mobile/api/fleet/session',undefined,{Cookie:cookie});assert.equal(session.status,200);
 assert.deepEqual(session.data.workspaces,[{siteId:'one',origin:'/desktop/one/'}]);
 assert.equal((await request('GET','/desktop/one/?tab=site-analytics',undefined,{Cookie:cookie})).status,200);
 assert.equal((await request('GET','/desktop/one/')).status,303);
 const context=await request('GET','/desktop/one/api/fleet/workspace-context',undefined,{Cookie:cookie});assert.equal(context.data.fullControl,false);
 assert.equal((await request('GET','/desktop/one/api/local/site-data/snapshot?view=overview',undefined,{Cookie:cookie})).status,200);
 assert.deepEqual(forwarded,['one/api/local/site-data/snapshot?view=overview']);
 for(const url of ['/desktop/two/','/desktop/one/api/local/site-data/snapshot?refresh=true','/desktop/one/tools/controls/rotate','/desktop/one/api/fleet/admin/users','/desktop/one/api/local/site-data/%73napshot','/desktop/one/api/local/site-data/snapshot?view=overview&view=other','/desktop/one/api/local/site-data/snapshot?url=https://evil.test','/desktop/one/api/local/site-data/../../commands']){
  assert.equal((await request('GET',url,undefined,{Cookie:cookie})).status,403,url);
 }
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await request(method,'/desktop/one/api/local/site-data/snapshot',{}, {Cookie:cookie,'X-Prizm-Csrf':session.data.csrf})).status,403);
 assert.equal((await request('GET','/desktop/one/api/local/site-data/pcs',undefined,{Cookie:cookie,'Cf-Access-Jwt-Assertion':jwt(other.email)})).status,403);
 assert.equal((await request('POST','/desktop/one/api/fleet/workspace-reauthenticate',{password},{Cookie:cookie,'X-Prizm-Csrf':session.data.csrf})).status,403);
 assert.equal(forwarded.length,1,'Denied requests must never reach collector');
 account.version++;assert.equal((await request('GET','/desktop/one/api/local/site-data/pcs',undefined,{Cookie:cookie})).status,401);account.version--;
 // Restore a fresh session after exercising revocation.
 const replacement=await request('POST','/mobile/api/fleet/login',{email:account.email,password});
 cookie=replacement.headers['set-cookie'].split(';')[0];
 assert.equal((await request('POST','/mobile/api/fleet/logout',{}, {Cookie:cookie,'X-Prizm-Csrf':session.data.csrf,'Cf-Access-Jwt-Assertion':jwt(other.email)})).status,403);
 const summary=await request('GET','/mobile/api/fleet/summary',undefined,{Cookie:cookie});assert.equal(summary.status,200);assert.deepEqual(summary.data.sites.map((s:{siteId:string})=>s.siteId),['one']);assert.deepEqual(hvacCalls,['one']);
 assert.equal((await request('GET','/mobile/api/fleet/summary',undefined,{Cookie:cookie,'Cf-Access-Jwt-Assertion':jwt(other.email)})).status,403);
 assert.equal((await request('GET','/mobile/api/fleet/summary',undefined,{Cookie:cookie,Origin:'https://evil.test'})).status,403);
 account.remoteAccess=false;assert.equal((await request('GET','/mobile/api/fleet/summary',undefined,{Cookie:cookie})).status,403);account.remoteAccess=true;
 account.disabled=true;assert.equal((await request('GET','/mobile/')).status,403);account.disabled=false;
 await chmod(config.keysFile,0o666);assert.equal((await request('GET','/mobile/')).status,403);await chmod(config.keysFile,0o644);
 config.keysOwnerUid++;assert.equal((await request('GET','/mobile/')).status,403);config.keysOwnerUid--;
 await chmod(dir,0o777);assert.equal((await request('GET','/mobile/')).status,403);await chmod(dir,0o700);
 await writeFile(config.keysFile,JSON.stringify({fetchedAt:Date.now()-7*3600000,keys}),{mode:0o600});assert.equal((await request('GET','/mobile/')).status,403);
 console.log('PASS remote mobile: signed identity, account opt-in, read-only routes/assets, identity-bound session, site-only HVAC, revocation and stale-key fail-closed');
}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
