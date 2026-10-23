import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg),manifest=JSON.parse(fs.readFileSync(path.dirname(out)+'/assets-manifest.json','utf8'));
for(const file of ['server.cjs','fleet-server.cjs','fleet-entry.cjs'])assert.equal(fs.readFileSync(out+'/'+file,'utf8'),fs.readFileSync(base+'/'+file,'utf8'));
const seen=new Set();
function visit(file){if(seen.has(file))return;seen.add(file);const source=fs.readFileSync(out+'/assets/'+file,'utf8');for(const m of source.matchAll(/(?:\bfrom\s*|\bimport\s*)["']\.\/([^"']+\.js)["']/g))visit(m[1]);}
visit(manifest.stringName);
assert(![...seen].some(f=>/PcsOperationalTimeline|CartesianChart|LineChart/.test(f)),'No history charts in static string graph');
assert(seen.has(manifest.wrapperName));
const wrapper=fs.readFileSync(out+'/assets/'+manifest.wrapperName,'utf8');assert(wrapper.includes(`import("./${manifest.timelineName}")`));
const shell=fs.readFileSync(out+'/assets/'+manifest.clientName,'utf8');
assert(shell.includes(manifest.stringName));
console.log(JSON.stringify({staticStringModules:seen.size,staticStringBytes:[...seen].reduce((n,f)=>n+fs.statSync(out+'/assets/'+f).size,0),chartsDeferred:true,serverBundlesUnchanged:true}));
// Run authorization, revocation, revalidation, canonical-data routing, denied
// remote-control and fresh-start/rollback tests against the exact release files.
let suite=fs.readFileSync('scripts/test-unified-workspace-release.mjs','utf8');
suite=suite.replace("assert.deepEqual(changed,['createFleetApp','createMobileApp','createRemoteDesktop','createRemoteMobileApp','createWorkspaceGateway','main']);","assert.deepEqual(changed,[]);");
suite=suite.replace('only six delivery functions changed','all server functions unchanged');
const dir=fs.mkdtempSync(path.join(process.cwd(),'node_modules/.startup-assets-test-'));
const file=dir+'/test.mjs';fs.writeFileSync(file,suite);
execFileSync(process.execPath,[file,base,out],{stdio:'inherit',timeout:90000});
execFileSync(process.execPath,[path.dirname(out)+'/prizm-startup-assets-deploy.mjs','--self-test'],{stdio:'inherit'});
