/** Browser-only patch on top of the verified Dell string-refresh release. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {parse} from '@babel/parser';
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg);assert(!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const [k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else{assert(s.isFile());r[n]=sha(fs.readFileSync(p));}}return r;}
const before=tree(base);fs.cpSync(base,out,{recursive:true});
const client=await build({stdin:{contents:`
 export {subscribeStringList} from './src/lib/subscribeStringList';
 import {SiteDataRequests as Requests} from './src/lib/siteDataRequests';
 import {hasHealthyStringStream} from './src/lib/stringStreamHealth';
 import {RowProjectionCache as Cache,samePublication} from './src/lib/rowProjectionCache';
 export class SiteDataRequests extends Requests {
   snapshot(view,force=false,compact=true,context=new URLSearchParams(window.location.search).get('stringRefresh')!=='legacy'&&hasHealthyStringStream()){
     return super.snapshot(view,force,compact,context);
   }
 }
 export class RowProjectionCache extends Cache {constructor(){super(samePublication);}}
 `,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'browser',write:false,minify:true});
const entries=['index.html','fleet.html','mobile.html','signin.html'].filter(n=>fs.existsSync(base+'/'+n));
const names=fs.readdirSync(base+'/assets'),active=new Set(),queue=entries.map(n=>fs.readFileSync(base+'/'+n,'utf8'));
while(queue.length){const s=queue.pop();for(const n of names)if(!active.has(n)&&s.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(base+'/assets/'+n,'utf8'));}}
const helpers=[...active].filter(n=>/^string-refresh-[a-f0-9]+\.js$/.test(n));assert.equal(helpers.length,1);
const rename=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,n.replace(/\.js$/,'-startup21.js')]));
const rewrite=s=>{for(const [a,b]of rename)s=s.replaceAll(a,b);return s;};
for(const [old,next]of rename){const s=rewrite(old===helpers[0]?client.outputFiles[0].text:fs.readFileSync(base+'/assets/'+old,'utf8'));parse(s,{sourceType:'module'});fs.writeFileSync(out+'/assets/'+next,s);}
for(const name of entries)fs.writeFileSync(out+'/'+name,rewrite(fs.readFileSync(base+'/'+name,'utf8')));
const after=tree(out),changed=Object.keys(after).filter(p=>before[p]!==after[p]).sort();
assert(changed.every(p=>entries.includes(p)||p.startsWith('assets/')&&p.endsWith('-startup21.js')));
assert.equal(before['server.cjs'],after['server.cjs']);assert.equal(before['fleet-server.cjs'],after['fleet-server.cjs']);
const m={schema:1,scope:'Browser-only startup warning gate; telemetry and security unchanged',before,after,changed,clientName:rename.get(helpers[0])};
const manifest=JSON.stringify(m,null,2);fs.writeFileSync(path.dirname(out)+'/refresh-manifest.json',manifest);
// Reuse the previously exercised fixed-target rollback/check runner. All server
// bytes are unchanged; candidate parity therefore reads the baseline server.
let deploy=fs.readFileSync('scripts/deploy-string-refresh.mjs','utf8');
deploy=deploy.replace("const priorFleet='/opt/prizm-fleet/releases/snapshot-transport-20261021';","const priorFleet='/opt/prizm-fleet/releases/string-refresh-20261021';");
deploy=deploy.replaceAll("/releases/string-refresh-20261021';\nconst stage", "/releases/string-startup-20261021';\nconst stage");
for(const prefix of ['/home/ebc/prizm-','/var/lib/prizm-fleet/','/run/prizm-'])deploy=deploy.replaceAll(prefix+'string-refresh',prefix+'string-startup');
deploy=deploy.replace('zzzzzzzzzzzzzzzzzzzzzzzzzzz-string-refresh-20261021.conf','zzzzzzzzzzzzzzzzzzzzzzzzzzzz-string-startup-20261021.conf');
deploy=deploy.replace(/const manifestHash='[a-f0-9]+';/,"const manifestHash='"+sha(manifest)+"';");
deploy=deploy.replace("patches.find(([p])=>p==='server.cjs')[1]","fs.readFileSync(priorCollector+'/dist/server.cjs')");
deploy=deploy.replaceAll('String refresh deployment complete.','String startup notice deployment complete.').replaceAll('String refresh rollback complete.','String startup notice rollback complete.');
assert(deploy.includes("const release='/opt/prizm-fleet/releases/string-startup-20261021'"));
assert(deploy.includes("const priorFleet='/opt/prizm-fleet/releases/string-refresh-20261021'"));
parse(deploy,{sourceType:'module'});fs.writeFileSync(path.dirname(out)+'/prizm-string-startup-deploy.mjs',deploy);
console.log(JSON.stringify({output:out,clientName:m.clientName,changed:changed.length,manifestHash:sha(manifest),installerHash:sha(deploy)}));
