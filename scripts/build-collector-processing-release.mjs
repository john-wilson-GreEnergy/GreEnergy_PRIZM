import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
const [baseArg,outArg]=process.argv.slice(2);assert(baseArg&&outArg);
const base=path.resolve(baseArg),out=path.resolve(outArg);
assert(!fs.existsSync(out),'Refuse to overwrite a candidate');
const old=fs.readFileSync(base+'/server.cjs','utf8'),next=fs.readFileSync('dist/server.cjs','utf8');
const a=parse(old),b=parse(next),edits=[];
function find(node,pred,result=[]){if(!node||typeof node!=='object')return result;if(pred(node))result.push(node);for(const [k,v]of Object.entries(node))if(k!=='loc'){if(Array.isArray(v))v.forEach(n=>find(n,pred,result));else if(v&&typeof v==='object')find(v,pred,result);}return result;}
const one=nodes=>{assert.equal(nodes.length,1);return nodes[0];};
const cls=(ast,name)=>one(find(ast,n=>n.type==='AssignmentExpression'&&n.left?.name===name)).right;
const member=(c,name)=>one(c.body.body.filter(n=>n.key?.name===name));
const fn=(ast,name)=>one(ast.program.body.filter(n=>n.type==='FunctionDeclaration'&&n.id?.name===name));
const code=(s,n)=>s.slice(n.start,n.end);
const replace=(s,x,y)=>{assert.equal(s.split(x).length,2,'Expected unique patch');return s.replace(x,y);};
for(const name of ['EntityDomainBroker','CoordinatorRuntime']){
  const prior=cls(a,name),candidate=cls(b,name);
  const changed=name==='EntityDomainBroker'?['constructor','emit']:['drain'];
  const added=name==='EntityDomainBroker'?['subscribeProjected']:[];
  if(name==='EntityDomainBroker')assert.equal(code(next,member(candidate,'constructor')).replace('        this.projectedListeners = /* @__PURE__ */ new Set();\n',''),code(old,member(prior,'constructor')));
  assert.equal(candidate.body.body.length,prior.body.body.length+added.length);
  for(const n of prior.body.body)if(!changed.includes(n.key.name))assert.equal(code(old,n),code(next,member(candidate,n.key.name)),`Unrelated ${name}.${n.key.name}`);
  for(const method of changed){const x=member(prior,method),y=member(candidate,method);edits.push({start:x.start,end:x.end,text:code(next,y)});}
  if(added.length)edits.push({start:prior.body.end-1,end:prior.body.end-1,text:'\n'+added.map(key=>code(next,member(candidate,key))).join('\n')+'\n'});
}
const priorOps=fn(a,'buildSiteOperationsSummaryFromCache'),newOps=fn(b,'buildSiteOperationsSummaryFromCache');
// Compare everything outside the existing PCS discovery block before replacing.
const original=code(old,priorOps),candidate=code(next,newOps);
const startOld=original.indexOf('    const pcsDebugKeys'),endOld=original.indexOf('    const pcsCnds');
const startNew=candidate.indexOf('    const { pcsDebugKeys, pcsCandidates }'),endNew=candidate.indexOf('    const pcsCnds');
assert(startOld>0&&endOld>startOld&&startNew>0&&endNew>startNew);
const hoistedStart=original.indexOf('    let dig = function('),hoistedEnd=original.indexOf('}, numOrNull = function(',hoistedStart);
assert(hoistedStart>0&&hoistedEnd>hoistedStart);
const outsideOld=original.slice(0,startOld)+original.slice(endOld);
const withoutDig=outsideOld.slice(0,hoistedStart)+'    let numOrNull = function('+outsideOld.slice(hoistedEnd+'}, numOrNull = function('.length);
assert.equal(withoutDig,candidate.slice(0,startNew)+candidate.slice(endNew),'Only PCS search may change in site operations');
edits.push({start:priorOps.start,end:priorOps.end,text:candidate});
const route=(s)=>{const start=s.indexOf('siteDataRouter.get("/strings-stream",');const end=s.indexOf('siteDataRouter.get("/domains",',start);assert(start>0&&end>start);return {start,end,text:s.slice(start,end)};};
const ra=route(old),rb=route(next);
assert(rb.text.includes('PRIZM_PROJECTED_STRING_STREAM'));
const routeText=replace(rb.text,'new StringFieldDeltas()','new (require("./soc-strings-runtime.cjs").StringFieldDeltas)(stringTransportEpoch)');
assert.equal(ra.text.slice(0,ra.text.indexOf('  const unsubscribe')),routeText.slice(0,routeText.indexOf('  const deliver')),'Handshake and delta setup unchanged');
assert.equal(ra.text.slice(ra.text.indexOf('  const heartbeat')),routeText.slice(routeText.indexOf('  const heartbeat')),'Heartbeat and cleanup unchanged');
edits.push({start:ra.start,end:ra.end,text:routeText});
let output=old;
for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
output+='\n'+code(next,fn(b,'findPcsCandidates'))+'\n';
parse(output);
fs.cpSync(base,out,{recursive:true});
fs.writeFileSync(out+'/server.cjs',output);
const hash=s=>createHash('sha256').update(s).digest('hex');
function tree(dir,prefix=''){const result={};for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())Object.assign(result,tree(dir+'/'+entry.name,name+'/'));else if(entry.isFile())result[name]=hash(fs.readFileSync(dir+'/'+entry.name));}return result;}
const before=tree(base),after=tree(out),changed=Object.keys(after).filter(key=>before[key]!==after[key]);
assert.deepEqual(changed,['server.cjs']);
assert.deepEqual(Object.keys(before).sort(),Object.keys(after).sort());
fs.writeFileSync(path.dirname(out)+'/processing-manifest.json',JSON.stringify({scope:'Projected string subscriptions, scalar-skipping PCS candidate scan, snapshot retention timing context. Remote permissions, equipment acquisition and all UI/gateway bytes unchanged.',base,before,after,changed},null,2));
console.log(JSON.stringify({out,changed,serverSha256:after['server.cjs']}));
