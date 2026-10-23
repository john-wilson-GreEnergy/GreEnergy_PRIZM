import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const [installerFile,manifestFile,priorFile]=process.argv.slice(2);
const source=fs.readFileSync(installerFile,'utf8');
const raw=fs.readFileSync(manifestFile),m=JSON.parse(raw);
const check=source.match(/assert\(m\.changed\.every\(n=>(.+)\)\);/);
assert(check);
const allow=vm.runInNewContext(`n=>${check[1]}`);
assert(m.changed.length>0);
for(const name of m.changed)assert(allow(name),name);
for(const stem of ['index.es','jspdf.es.min','SafetyFaultCandidatesPanel'])assert(allow(`assets/safety22-0123456789ab-${stem}.js`));
for(const name of ['../index.html','assets/../index.html','assets/safety22-0123456789ab-../escape.js','assets/safety22-0123456789ab-a..b.js','assets/safety22-0123456789ab-.a.js','assets/safety22-0123456789ab-a/.js','assets/safety22-0123456789ab-a.js.map','assets/safety22-0123456789ab-a.cjs','assets/safety22-0123456789a-a.js','assets/unreviewed.js','server.cjs'])assert(!allow(name),name);
const manifestHash=source.match(/const manifestHash='([a-f0-9]{64})';/)[1];
assert.equal(manifestHash,createHash('sha256').update(raw).digest('hex'));
assert(source.includes('assert.equal(hash(raw),manifestHash)'));
assert(source.includes('assert.equal(hash(b),h)'));
assert(source.indexOf(check[0])<source.indexOf('fs.mkdirSync(backup,{mode:0o700})'));
if(priorFile){
 const prior=fs.readFileSync(priorFile,'utf8');
 assert.equal(source,prior.replace('[A-Za-z0-9_]+\\.js$','[A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*\\.js$'),'Only dotted filename validation may change');
}
console.log(`PASS actual installer accepts all ${m.changed.length} pinned files; rejects unsafe/unrelated names; hash checks intact; only filename predicate changed. No network or service mutations.`);
