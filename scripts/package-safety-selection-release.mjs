/** Adapt the previously verified fixed-target installer; no activation here. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);assert(!fs.existsSync(out));
const hash=b=>createHash('sha256').update(b).digest('hex');
const raw=fs.readFileSync(root+'/safety-selection-manifest.json'),m=JSON.parse(raw);
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/safety-selection-manifest.json',raw);
for(const n of m.changed){const b=fs.readFileSync(root+'/fleet/dist/'+n);assert.equal(hash(b),m.after[n]);fs.mkdirSync(path.dirname(out+'/fleet/'+n),{recursive:true});fs.writeFileSync(out+'/fleet/'+n,b);}
fs.mkdirSync(out+'/collector');for(const[n,h]of [['server.cjs',m.collectorAfter['server.cjs']],['rollback-server.cjs',m.rollbackServerSha]]){const b=fs.readFileSync(root+'/collector/'+(n==='server.cjs'?'dist/':'')+n);assert.equal(hash(b),h);fs.writeFileSync(out+'/collector/'+n,b);}
function once(s,a,b){assert.equal(s.split(a).length,2,a);return s.replace(a,b);}
let installer=fs.readFileSync('scripts/deploy-storage-presence.mjs','utf8');
installer=once(installer,"const priorFleet='/opt/prizm-fleet/releases/storage-display-20261021';","const priorFleet='/opt/prizm-fleet/releases/__PRIOR_FLEET__';");
installer=once(installer,"const priorCollector='/opt/prizm-fleet/releases/snapshot-retention-20261021';","const priorCollector='/opt/prizm-fleet/releases/__PRIOR_COLLECTOR__';");
installer=installer.replaceAll('storage-presence','safety-selection').replaceAll('20261021','20261022').replaceAll('__PRIOR_FLEET__','storage-presence-20261021').replaceAll('__PRIOR_COLLECTOR__','storage-presence-collector-20261021');
installer=once(installer,"'z'.repeat(48)","'z'.repeat(49)");
installer=once(installer,"n.startsWith('assets/')&&n.endsWith('-presence21.js')","/^assets\\/safety22-[a-f0-9]{12}-[A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*\\.js$/.test(n)");
// Validate the actual generated installer predicate against the complete package,
// including dotted module stems such as index.es and jspdf.es.min.
const nameCheck=installer.match(/assert\(m\.changed\.every\(n=>(.+)\)\);/);
assert(nameCheck,'Generated changed-file predicate is required');
const allowedName=new Function('n',`return ${nameCheck[1]};`);
assert(m.changed.every(allowedName),'Generated installer must accept every packaged filename');
installer=installer.replaceAll('Storage folder presence','Safety fault selection').replaceAll('Folder presence deployment complete.','Safety fault workflow deployment complete.');
installer=once(installer,'return {observedAt:s.observedAt,ageMs:age,folders,independentPresence:expected};',`const blockResponse=await read(base+'/api/local/site-data/block-summary',workspace.token);assert.equal(blockResponse.status,200);const block=JSON.parse(blockResponse.body);
 assert.equal(block.siteIdentity.stationCode,p.station);assert.equal(block.siteIdentity.blockIndex,1);assert(block.site?.profileId,'Site profile identity required');
 assert(block.safetySummary&&Array.isArray(block.safetySummary.clearableFaults),'Canonical safety summary required');
 const candidates=block.safetySummary.clearableFaults;
 if(updated)for(const candidate of candidates){assert(candidate.equipment&&['array','segment','controller'].every(key=>typeof candidate.equipment[key]==='string'&&candidate.equipment[key].length>0),'Safety equipment identity projection required');assert.equal(candidate.allowFaultReset,true);}
 return {observedAt:s.observedAt,ageMs:age,folders,independentPresence:expected,safety:{candidateCount:candidates.length,equipmentProjectionVerified:updated,sourceOk:block.safetySummary.sourceOk===true}};`);
installer=once(installer,'__MANIFEST_HASH__',hash(raw));
const file=path.dirname(out)+'/prizm-safety-selection-deploy.mjs';fs.writeFileSync(file,installer);
let verifier=fs.readFileSync('scripts/verify-storage-presence-stage.mjs','utf8');
verifier=verifier.replaceAll('storage-presence','safety-selection').replaceAll('20261021','20261022').replaceAll('/releases/storage-display-20261022/','/releases/storage-presence-20261021/').replaceAll('/releases/snapshot-retention-20261022/','/releases/storage-presence-collector-20261021/');
fs.writeFileSync(path.dirname(out)+'/verify-safety-selection-stage.mjs',verifier);
console.log(JSON.stringify({out,installer:file,manifestHash:hash(raw),equipmentCommandsSent:false,activationPerformed:false}));
