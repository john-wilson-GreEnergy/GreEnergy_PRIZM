import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import {build} from 'esbuild';
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg);
assert(!fs.existsSync(out),'Refuse to overwrite a release');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'prizm-retention-build-'));
await build({entryPoints:['server.ts'],outfile:temp+'/server.cjs',bundle:true,platform:'node',format:'cjs',packages:'external'});
const old=fs.readFileSync(base+'/server.cjs','utf8'),next=fs.readFileSync(temp+'/server.cjs','utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
assert.equal(hash(old),'6d990646fa566857246e06e111c26d4ca11d435b6f1feccfec07f7ed1023885c','Requires the verified current collector baseline');
function find(node,pred,result=[]){if(!node||typeof node!=='object')return result;if(pred(node))result.push(node);for(const [k,v]of Object.entries(node))if(k!=='loc'){if(Array.isArray(v))v.forEach(n=>find(n,pred,result));else if(v&&typeof v==='object')find(v,pred,result);}return result;}
const one=nodes=>{assert.equal(nodes.length,1);return nodes[0];};
const cls=ast=>one(find(ast,n=>n.type==='AssignmentExpression'&&n.left?.name==='CoordinatorRuntime')).right;
const a=cls(parse(old)),b=cls(parse(next));
const code=(text,n)=>text.slice(n.start,n.end);
const methods=['constructor','setCurrentSnapshot','getDebugState','drain'];
assert.equal(a.body.body.length,b.body.body.length);
const edits=[];
for(const member of a.body.body){
 const candidate=one(b.body.body.filter(n=>n.key.name===member.key.name));
 if(methods.includes(member.key.name))edits.push({start:member.start,end:member.end,text:code(next,candidate)});
 else assert.equal(code(old,member),code(next,candidate),'Unrelated method '+member.key.name);
}
const init='coordinatorRuntime = new CoordinatorRuntime(executeCoordinatorCycle);';
assert.equal(old.split(init).length,2);
assert(next.includes('coordinatorRuntime = new CoordinatorRuntime(executeCoordinatorCycle, snapshotRetentionWorker);'));
edits.push({start:old.indexOf(init),end:old.indexOf(init)+init.length,text:'coordinatorRuntime = new CoordinatorRuntime(executeCoordinatorCycle, require("./snapshot-retention-runtime.cjs").snapshotRetentionWorker);'});
let patched=old;
for(const edit of edits.sort((a,b)=>b.start-a.start))patched=patched.slice(0,edit.start)+edit.text+patched.slice(edit.end);
parse(patched);
// Every byte outside the explicitly allowed methods and injection is retained.
fs.cpSync(base,out,{recursive:true});
fs.writeFileSync(out+'/server.cjs',patched);
for(const [entry,name]of [['SnapshotRetentionWorker.ts','snapshot-retention-runtime.cjs'],['snapshotRetentionWorkerEntry.ts','snapshot-retention-worker.cjs']]){
 await build({entryPoints:['src/server/telemetry/'+entry],outfile:out+'/'+name,bundle:true,platform:'node',format:'cjs',packages:'external'});
}
function tree(dir,prefix=''){const result={};for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const name=prefix+entry.name;if(entry.isDirectory())Object.assign(result,tree(dir+'/'+entry.name,name+'/'));else{assert(entry.isFile());result[name]=hash(fs.readFileSync(dir+'/'+entry.name));}}return result;}
const before=tree(base),after=tree(out),changed=Object.keys(after).filter(k=>before[k]!==after[k]).sort();
assert.deepEqual(changed,['server.cjs','snapshot-retention-runtime.cjs','snapshot-retention-worker.cjs']);
assert(Object.keys(before).every(k=>k in after));
fs.writeFileSync(path.dirname(out)+'/retention-manifest.json',JSON.stringify({scope:'Bounded off-thread snapshot retention with atomic publication, invalidation fencing and explicit synchronous rollback. All acquisition, source timestamps, command policies, UI and gateway bytes unchanged.',base,before,after,changed},null,2));
console.log(JSON.stringify({out,changed,hash:after['server.cjs']}));
