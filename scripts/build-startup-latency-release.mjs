/** Narrow patch against the deployed artifact; unrelated workspace changes stay local. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg);assert(!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const [k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else{assert(s.isFile());r[n]=sha(fs.readFileSync(p));}}return r;}
function find(root,predicate){const matches=[];function walk(n){if(!n||typeof n!=='object')return;if(predicate(n))matches.push(n);for(const [k,v]of Object.entries(n))if(k!=='loc'&&k!=='comments'){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}walk(root);return matches;}
function only(nodes){assert.equal(nodes.length,1);return nodes[0];}
function replaceOnce(s,a,b){assert.equal(s.split(a).length,2,'Expected unique patch: '+a.slice(0,90));return s.replace(a,b);}
const before=tree(base);fs.cpSync(base,out,{recursive:true});
const old=fs.readFileSync(base+'/server.cjs','utf8'),candidate=fs.readFileSync('dist/server.cjs','utf8');
const oldAst=parse(old),newAst=parse(candidate);
const cls=ast=>only(find(ast,n=>n.type==='AssignmentExpression'&&n.left?.name==='CoordinatorRuntime')).right;
const priorClass=cls(oldAst),nextClass=cls(newAst);
const member=(c,name)=>only(c.body.body.filter(n=>n.key?.name===name));
// Verify that copying the three changed methods cannot import unrelated edits.
for(const method of priorClass.body.body){if(['setCurrentSnapshot','drain'].includes(method.key?.name))continue;const next=member(nextClass,method.key.name);assert.equal(old.slice(method.start,method.end),candidate.slice(next.start,next.end),'Unrelated runtime change: '+method.key.name);}
assert.equal(nextClass.body.body.length,priorClass.body.body.length+1);
const edits=[];
for(const name of ['setCurrentSnapshot','drain']){const a=member(priorClass,name),b=member(nextClass,name);let text=candidate.slice(b.start,b.end);if(name==='setCurrentSnapshot'){const r=member(nextClass,'retainSnapshot');text+='\n'+candidate.slice(r.start,r.end);}edits.push({start:a.start,end:a.end,text});}
const stopA=only(oldAst.program.body.filter(n=>n.type==='FunctionDeclaration'&&n.id.name==='stopPublishedViewCache'));
const stopB=only(newAst.program.body.filter(n=>n.type==='FunctionDeclaration'&&n.id.name==='stopPublishedViewCache'));
edits.push({start:stopA.start,end:stopA.end,text:candidate.slice(stopB.start,stopB.end)});
let server=old;for(const e of edits.sort((a,b)=>b.start-a.start))server=server.slice(0,e.start)+e.text+server.slice(e.end);
const scheduler=only(newAst.program.body.filter(n=>n.type==='FunctionDeclaration'&&n.id.name==='deferPublishedViewRefresh'));
server=replaceOnce(server,'var publishedViewBuildInProgress = false;','var publishedViewBuildInProgress = false;\nvar deferredPublishedViewRefresh = null;\n'+candidate.slice(scheduler.start,scheduler.end));
server=replaceOnce(server,'if (cached.source !== snap) void publishBrowserViews();','if (cached.source !== snap) deferPublishedViewRefresh();');
parse(server);fs.writeFileSync(out+'/server.cjs',server);
const entries=['index.html','fleet.html','mobile.html','signin.html'].filter(n=>fs.existsSync(base+'/'+n));
const names=fs.readdirSync(base+'/assets'),active=new Set(),queue=entries.map(n=>fs.readFileSync(base+'/'+n,'utf8'));
while(queue.length){const s=queue.pop();for(const n of names)if(!active.has(n)&&s.includes(n)){active.add(n);if(n.endsWith('.js'))queue.push(fs.readFileSync(base+'/assets/'+n,'utf8'));}}
const entry=/src="\/assets\/([^"]+\.js)"/.exec(fs.readFileSync(base+'/index.html','utf8'))[1];
let client=fs.readFileSync(base+'/assets/'+entry,'utf8');
// Exact deployed App initial effect and guard identities, verified by focused tests.
assert(client.includes('if(a||be.current)return;'));
client=replaceOnce(client,'(async()=>{a||(await Le(),Ie.current=Date.now())})();','(async()=>{if(!a){be.current=true;try{await Le()}finally{Ie.current=Date.now();be.current=false}}})();');
const rename=new Map([...active].filter(n=>n.endsWith('.js')).map(n=>[n,n.replace(/\.js$/,'-latency21.js')]));
const rewrite=s=>{for(const [a,b]of rename)s=s.replaceAll(a,b);return s;};
for(const [prior,next]of rename){const s=rewrite(prior===entry?client:fs.readFileSync(base+'/assets/'+prior,'utf8'));parse(s,{sourceType:'module'});fs.writeFileSync(out+'/assets/'+next,s);}
for(const name of entries)fs.writeFileSync(out+'/'+name,rewrite(fs.readFileSync(base+'/'+name,'utf8')));
const after=tree(out),changed=Object.keys(after).filter(p=>before[p]!==after[p]).sort();
assert(changed.every(p=>p==='server.cjs'||entries.includes(p)||p.startsWith('assets/')&&p.endsWith('-latency21.js')));
assert.equal(before['fleet-server.cjs'],after['fleet-server.cjs']);
const manifest=JSON.stringify({schema:1,scope:'Single defensive snapshot retention; deferred cached-view refresh; single-flight initial status request. No permission, acquisition or networking changes.',before,after,changed,clientName:rename.get(entry)},null,2);
fs.writeFileSync(path.dirname(out)+'/refresh-manifest.json',manifest);
let deploy=fs.readFileSync('scripts/deploy-string-refresh.mjs','utf8');
deploy=replaceOnce(deploy,"const priorFleet='/opt/prizm-fleet/releases/snapshot-transport-20261021';","const priorFleet='/opt/prizm-fleet/releases/string-connection-20261021';");
deploy=deploy.replaceAll('string-refresh','startup-latency');
deploy=deploy.replace(/zz+-startup-latency-20261021\.conf/,'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-startup-latency-20261021.conf');
deploy=deploy.replace(/const manifestHash='[a-f0-9]+';/,"const manifestHash='"+sha(manifest)+"';");
deploy=deploy.replaceAll('String refresh deployment complete.','Startup latency deployment complete.').replaceAll('String refresh rollback complete.','Startup latency rollback complete.');
assert(deploy.includes("const priorFleet='/opt/prizm-fleet/releases/string-connection-20261021'"));
parse(deploy,{sourceType:'module'});fs.writeFileSync(path.dirname(out)+'/prizm-startup-latency-deploy.mjs',deploy);
const upload=path.dirname(out)+'/upload';fs.mkdirSync(upload);for(const p of changed){fs.mkdirSync(path.dirname(upload+'/'+p),{recursive:true});fs.copyFileSync(out+'/'+p,upload+'/'+p);}
fs.writeFileSync(upload+'/refresh-manifest.json',manifest);
const probe=path.dirname(base)+'/upload/refresh-probe.cjs';assert.equal(sha(fs.readFileSync(probe)),/const probeHash='([a-f0-9]+)'/.exec(deploy)[1]);fs.copyFileSync(probe,upload+'/refresh-probe.cjs');
console.log(JSON.stringify({out,changed:changed.length,clientName:rename.get(entry),manifestHash:sha(manifest),installerHash:sha(deploy)}));
