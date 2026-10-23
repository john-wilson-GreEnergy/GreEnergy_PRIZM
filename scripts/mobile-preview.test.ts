import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mobileRequestAllowed,mobilePreviewApi,mobileOrigin,type MobileTransport} from './mobile-preview-proxy';
import {thermalUnits} from '../src/server/thermal/thermalModel';
const host='127.0.0.1:3206';
for(const path of ['/internal/thermal/ss3','/api/local/site-data/thermal','/api/fleet/summary?url=x','/api/fleet/../admin','/api/fleet/admin/users','/api/fleet/reauthenticate','/api/ems/control','/api/fleet/workspace','/api/local/site-data/pcs'])assert(!mobileRequestAllowed('GET',path,host,undefined,undefined));
assert(mobileRequestAllowed('GET','/api/fleet/summary','192.168.1.20:3207',undefined,undefined,'https://192.168.1.20:3207'));
assert(!mobileRequestAllowed('POST','/api/fleet/login','192.168.1.20:3207',mobileOrigin,undefined,'https://192.168.1.20:3207'));
assert.throws(()=>mobilePreviewApi(undefined,{origin:'http://192.168.1.20:3207'}));
assert(!mobileRequestAllowed('GET','/api/fleet/summary','evil.test',undefined,undefined));
assert(!mobileRequestAllowed('POST','/api/fleet/login',host,undefined,undefined));
assert(!mobileRequestAllowed('GET','/api/fleet/summary',host,'https://evil.test','cross-site'));
let calls=0;const thermalCalls:string[]=[];
const transport:MobileTransport=async req=>{calls++;if(req.path.startsWith('/internal/thermal/')){thermalCalls.push(req.path);assert.equal(req.method,'GET');assert.equal(req.cookie,'secret-upstream-token');assert.equal(req.csrf,'csrf');return {status:200,data:{units:thermalUnits([{ip:'10.0.1.10',arrayIndex:1,segmentLabel:'ES 1',lastSuccessUtc:new Date().toISOString(),hvac1:{compressorOn:false,electricHeatOn:false}}],Date.now())}};}if(req.path.endsWith('/login'))return {status:200,cookie:'secret-upstream-token',data:{authenticated:true}};if(req.path.endsWith('/session'))return {status:200,data:{email:'test@example.test',csrf:'csrf',administrator:true,workspaces:[{origin:'https://controls'}]}};return {status:200,data:{schema:'prizm-fleet-v1',readOnly:true,sites:[{siteId:'ss3',stationCode:'BHE0020',blockIndex:1,status:'current'}],totals:{}}};};
const app=mobilePreviewApi(transport),server=app.listen(0,'127.0.0.1');
await new Promise<void>(r=>server.once('listening',r));
const addr=server.address() as {port:number},url=`http://127.0.0.1:${addr.port}`;
const headers={Host:host,Origin:mobileOrigin,'Content-Type':'application/json'};
// Native Node fetch does not honor a caller-supplied Host on all supported versions.
const fetch=(address:string,init:{method?:string;headers:Record<string,string>;body?:string})=>new Promise<Response>((resolve,reject)=>{
 const req=request(address,init,res=>{const chunks:Buffer[]=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const h=new Headers();for(const [k,v] of Object.entries(res.headers))if(v)h.set(k,Array.isArray(v)?v.join(';'):v);resolve(new Response(Buffer.concat(chunks).toString(),{status:res.statusCode,headers:h}));});});req.on('error',reject);req.end(init.body);
});
try{
 assert.equal((await fetch(url+'/api/fleet/summary',{headers})).status,401);assert.equal(calls,0);
 const login=await fetch(url+'/api/fleet/login',{method:'POST',headers,body:JSON.stringify({email:'test@example.test',password:'not-a-real-password'})});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie')!;assert(cookie.includes('HttpOnly'));assert(cookie.includes('SameSite=Strict'));assert(!cookie.includes('secret-upstream-token'));
 const auth={...headers,Cookie:cookie.split(';')[0]};
 const s=await(await fetch(url+'/api/fleet/session',{headers:auth})).json();assert.equal(s.administrator,false);assert.deepEqual(s.workspaces,[]);
 for(const path of ['/api/fleet/reauthenticate','/api/fleet/admin/users','/api/ems/control']){const before=calls;assert.equal((await fetch(url+path,{method:'POST',headers:auth,body:'{}'})).status,403);assert.equal(calls,before);}
 const summary=await fetch(url+'/api/fleet/summary',{headers:auth});assert.equal(summary.status,200);assert.equal((await summary.json()).sites[0].mobileHvac.units.length,2);assert.deepEqual(thermalCalls,['/internal/thermal/ss3'],'Never fetch a site not returned by authorized Fleet summary');
 assert.equal((await fetch(url+'/api/fleet/summary',{headers:{...auth,Origin:'https://evil.test'}})).status,403);
 await fetch(url+'/api/fleet/logout',{method:'POST',headers:auth});assert.equal((await fetch(url+'/api/fleet/summary',{headers:auth})).status,401);
 console.log('Mobile proxy allowlist, session isolation, origin checks, logout and control denial passed');
}finally{server.closeAllConnections();server.close();}
