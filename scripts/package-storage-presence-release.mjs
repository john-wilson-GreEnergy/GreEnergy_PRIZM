import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);assert(!fs.existsSync(out));
const hash=b=>createHash('sha256').update(b).digest('hex');
const raw=fs.readFileSync(root+'/storage-presence-manifest.json'),m=JSON.parse(raw);
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(out+'/storage-presence-manifest.json',raw);
for(const n of m.changed){const bytes=fs.readFileSync(root+'/fleet/dist/'+n);assert.equal(hash(bytes),m.after[n]);fs.mkdirSync(path.dirname(out+'/fleet/'+n),{recursive:true});fs.writeFileSync(out+'/fleet/'+n,bytes);}
fs.mkdirSync(out+'/collector');for(const [n,h]of [['server.cjs',m.collectorAfter['server.cjs']],['rollback-server.cjs',m.rollbackServerSha]]){const bytes=fs.readFileSync(root+'/collector/'+(n==='server.cjs'?'dist/':'')+n);assert.equal(hash(bytes),h);fs.writeFileSync(out+'/collector/'+n,bytes);}
const template=fs.readFileSync('scripts/deploy-storage-presence.mjs','utf8');assert.equal(template.split('__MANIFEST_HASH__').length,2);
fs.writeFileSync(path.dirname(out)+'/prizm-storage-presence-deploy.mjs',template.replace('__MANIFEST_HASH__',hash(raw)));
console.log(JSON.stringify({out,installer:path.dirname(out)+'/prizm-storage-presence-deploy.mjs',manifestHash:hash(raw)}));
