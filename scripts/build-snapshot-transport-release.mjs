/** Only two deployed functions change. No UI, controls, acquisition or policies. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import {transformSync} from 'esbuild';
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg);assert(!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const r={};for(const n of fs.readdirSync(dir).sort()){const p=dir+'/'+n,s=fs.lstatSync(p);assert(!s.isSymbolicLink());if(s.isDirectory())for(const [k,v]of Object.entries(tree(p)))r[n+'/'+k]=v;else{assert(s.isFile());r[n]=sha(fs.readFileSync(p));}}return r;}
const before=tree(base);fs.cpSync(base,out,{recursive:true});
function replaceFunction(file,name,source){
 const old=fs.readFileSync(base+'/'+file,'utf8'),nodes=parse(old).program.body.filter(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.equal(nodes.length,1);
 const n=nodes[0],next=old.slice(0,n.start)+source.trimEnd()+old.slice(n.end);parse(next);fs.writeFileSync(out+'/'+file,next);
}
function sourceFunction(file,start,end){const s=fs.readFileSync(file,'utf8'),a=s.indexOf(start),b=s.indexOf(end,a);assert(a>=0&&b>a);return transformSync(s.slice(a,b).replace(/^export /,''),{loader:'ts'}).code;}
replaceFunction('server.cjs','buildBrowserSnapshot',sourceFunction('src/server/siteDataRoutes.ts','export function buildBrowserSnapshot(','/**\n * Overview,'));
let forward=sourceFunction('src/server/fleet/workspaceGateway.ts','export function workspaceForwarder(','export function createWorkspaceGateway(');
// Shared guidance is separate unshipped work; keep the deployed actor behavior.
forward=forward.replace(/\s*if \(res.locals.prizmGuidanceShared === true\) headers\["x-prizm-guidance-shared"\] = "true";/,'');
assert(!forward.includes('prizmGuidanceShared'));
forward=forward.replaceAll('https.','import_node_https.default.').replaceAll('new Transform(','new import_node_stream.Transform(');
replaceFunction('fleet-server.cjs','workspaceForwarder',forward);
const after=tree(out),changed=Object.keys(after).filter(p=>before[p]!==after[p]).sort();
assert.deepEqual(changed,['fleet-server.cjs','server.cjs']);
const manifest={schema:1,scope:'Slim string snapshot and lossless compressed/conditional gateway transport with separate SSE pool',before,after,changed};
const raw=JSON.stringify(manifest,null,2);fs.writeFileSync(path.dirname(out)+'/snapshot-manifest.json',raw);
console.log(JSON.stringify({output:out,changed,manifestHash:sha(raw)}));
