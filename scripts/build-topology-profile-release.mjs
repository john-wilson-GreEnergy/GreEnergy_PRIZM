/** Patch only the deployed topology read, its passive policies and client URL. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {transformSync} from 'esbuild';
import {parse} from '@babel/parser';
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg);assert(!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const [k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else{assert(s.isFile());r[n]=sha(fs.readFileSync(p));}}return r;}
const before=tree(base);fs.cpSync(base,out,{recursive:true});
function once(s,a,b){assert.equal(s.split(a).length,2,'Boundary: '+a.slice(0,100));return s.replace(a,b);}
let server=fs.readFileSync(base+'/server.cjs','utf8');
const routeSource=fs.readFileSync('src/server/topology/topologyRoutes.ts','utf8');
const start='topologyRouter.get("/topology/active",';
const route=routeSource.slice(routeSource.indexOf(start),routeSource.indexOf('// POST /api/local/topology/active/validate'));
const a=server.indexOf(start),b=server.indexOf('topologyRouter.post("/topology/active/validate",',a);assert(a>0&&b>a);
server=server.slice(0,a)+transformSync(route,{loader:'ts'}).code+server.slice(b);parse(server);fs.writeFileSync(out+'/server.cjs',server);
let fleet=fs.readFileSync(base+'/fleet-server.cjs','utf8');
fleet=once(fleet,'  ["/api/local/troubleshooting/library", []],','  ["/api/local/topology/active", ["view"]],\n  ["/api/local/troubleshooting/library", []],');
fleet=once(fleet,'    if (!keys.includes(key) || url.searchParams.getAll(key).length !== 1) return null;',
 '    if (!keys.includes(key) || url.searchParams.getAll(key).length !== 1) return null;\n    if(url.pathname === "/api/local/topology/active" && value !== "profile")return null;');
fleet=once(fleet,'    "/api/local/snapshot/topology",\n    "/api/local/topology",','    "/api/local/snapshot/topology",\n    "/api/local/topology",\n    "/api/local/topology/active",');
parse(fleet);fs.writeFileSync(out+'/fleet-server.cjs',fleet);
// Cache-bust only the currently reachable JS graph; retain every old asset for rollback/open tabs.
const entries=['index.html','fleet.html','mobile.html','signin.html'].filter(n=>fs.existsSync(base+'/'+n));
const names=fs.readdirSync(base+'/assets'),active=new Set(),queue=entries.map(n=>fs.readFileSync(base+'/'+n,'utf8'));
while(queue.length){const s=queue.pop();for(const name of names)if(!active.has(name)&&s.includes(name)){active.add(name);if(name.endsWith('.js'))queue.push(fs.readFileSync(base+'/assets/'+name,'utf8'));}}
const rename=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,n.replace(/\.js$/,'-topology21.js')]));
const rewrite=s=>{for(const [old,next]of rename)s=s.replaceAll(old,next);return s;};
let urlChanges=0;
for(const [old,next]of rename){let s=fs.readFileSync(base+'/assets/'+old,'utf8');const needle='"/api/local/topology/active"';
 const count=s.split(needle).length-1;if(count){assert.equal(count,1);urlChanges++;s=once(s,needle,'"/api/local/topology/active?view=profile"');}
 s=rewrite(s);parse(s,{sourceType:'module'});fs.writeFileSync(out+'/assets/'+next,s);
}
assert.equal(urlChanges,1,'Exactly one workspace topology request');
for(const name of entries)fs.writeFileSync(out+'/'+name,rewrite(fs.readFileSync(base+'/'+name,'utf8')));
const after=tree(out),changed=Object.keys(after).filter(p=>before[p]!==after[p]).sort();
assert(changed.every(p=>['server.cjs','fleet-server.cjs',...entries].includes(p)||p.startsWith('assets/')&&p.endsWith('-topology21.js')));
const manifest={schema:1,scope:'Profile-only topology read; passive access; shared client cache bust',before,after,changed,urlChanges};
fs.writeFileSync(path.dirname(out)+'/topology-manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({output:out,changed:changed.length,urlChanges,manifestHash:sha(JSON.stringify(manifest,null,2))}));
