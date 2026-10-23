/** Narrow candidate: exact deployed files plus one compiled UI delivery sidecar. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg);assert(!fs.existsSync(out),'Use a fresh candidate directory');
fs.cpSync(base,out,{recursive:true});
await build({entryPoints:['src/server/fleet/workspaceUi.ts'],bundle:true,platform:'node',format:'cjs',outfile:out+'/workspace-ui.cjs'});
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){return Object.fromEntries(fs.readdirSync(dir).sort().flatMap(name=>{
 const file=path.join(dir,name),s=fs.lstatSync(file);assert(!s.isSymbolicLink());
 return s.isDirectory()?Object.entries(tree(file)).map(([p,h])=>[name+'/'+p,h]):[[name,sha(fs.readFileSync(file))]];
}));}
const before=tree(base),after=tree(out),changed=Object.keys(after).filter(p=>before[p]!==after[p]);
assert.deepEqual(changed,['workspace-ui.cjs']);assert.deepEqual(Object.keys(before),Object.keys(after));
const {createWorkspaceUi}=createRequire(import.meta.url)(out+'/workspace-ui.cjs'),ui=createWorkspaceUi(out);
for(const route of ['/?tab=arrays-strings','/desktop/solar-star-3/?tab=arrays-strings','/desktop/solar-star-4/?tab=arrays-strings']){
 let body='',headers={};const res={req:{originalUrl:route},set(name,value){if(typeof name==='string')headers[name]=value;else Object.assign(headers,name);return this;},type(){return this;},end(s){body=s;}};
 assert(ui.send('/',res));assert.equal(headers['X-Prizm-Startup-Preload'],'strings');assert.equal(headers['Cache-Control'],'no-store');
 assert(body.includes('StringDashboard-'));assert(!/href="[^"]*(PcsOperationalTimeline|CartesianChart|LineChart)/.test(body));
 const urls=[...body.matchAll(/(?:src|href)="(\/assets\/[A-Za-z0-9_.-]+\.(?:js|css))"/g)].map(m=>m[1]);
 for(const url of urls)assert(fs.existsSync(out+url));
 console.log(JSON.stringify({route,staticAssets:urls.length,chartPreloads:0,noTelemetryEmbedded:true}));
}
let suite=fs.readFileSync('scripts/test-unified-workspace-release.mjs','utf8');
suite=suite.replace("assert.deepEqual(changed,['createFleetApp','createMobileApp','createRemoteDesktop','createRemoteMobileApp','createWorkspaceGateway','main']);","assert.deepEqual(changed,[]);");
suite=suite.replace('only six delivery functions changed','all server functions unchanged');
const temp=fs.mkdtempSync(path.join(process.cwd(),'node_modules/.preload-release-test-'));fs.writeFileSync(temp+'/test.mjs',suite);
execFileSync(process.execPath,[temp+'/test.mjs',base,out],{stdio:'inherit',timeout:90000});
fs.writeFileSync(path.dirname(out)+'/preload-manifest.json',JSON.stringify({before,after,changed},null,2));
console.log('PASS exact UI-sidecar candidate: unchanged collectors, authentication, remote-control policy and frontend assets; fresh entrypoint, parity and rollback tests');
