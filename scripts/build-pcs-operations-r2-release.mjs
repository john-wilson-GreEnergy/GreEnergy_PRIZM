import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const repo=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const name='prizm-pcs-operations-20261110-r2';
const root=`${repo}/deployment/prepared/${name}`;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const tree=directory=>Object.fromEntries(fs.readdirSync(directory,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>{
  const file=path.join(e.parentPath,e.name);return [path.relative(directory,file),sha(fs.readFileSync(file))];
}).sort(([a],[b])=>a.localeCompare(b)));
assert(!fs.existsSync(root),'Prepared release already exists: '+root);
fs.mkdirSync(root+'/payload',{recursive:true});
fs.cpSync(repo+'/dist',root+'/payload/dist',{recursive:true});
const manifest={schema:1,release:'pcs-operations-20261110-r2',sourceCommit:'dfca2a7',
  scope:'PCS humidity acquisition and primary feed, partial-coverage command-versus-actual power charts, and removal of obsolete Operations workspace banner',
  files:tree(root+'/payload/dist')};
fs.writeFileSync(root+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
let deploy=fs.readFileSync(repo+'/scripts/deploy-pcs-humidity.mjs','utf8');
const once=(before,after)=>{assert.equal(deploy.split(before).length,2,`Expected one: ${before}`);deploy=deploy.replace(before,after);};
once("const stage='/home/ebc/prizm-pcs-humidity-20261110';",`const stage='/home/ebc/${name}';`);
once("const release='/opt/prizm-fleet/releases/pcs-humidity-20261110';","const release='/opt/prizm-fleet/releases/pcs-operations-20261110-r2';");
once("const backup='/var/lib/prizm-fleet/pcs-humidity-20261110';","const backup='/var/lib/prizm-fleet/pcs-operations-20261110-r2';");
deploy=deploy.replaceAll('~zzzz-pcs-humidity-20261110.conf','~zzzzz-pcs-operations-20261110-r2.conf');
once("assert.equal(manifest.release,'pcs-humidity-20261110');","assert.equal(manifest.release,'pcs-operations-20261110-r2');");
once("console.log('PCS humidity deployment complete for Solar Star 3, Solar Star 4, and Fleet.');","console.log('PCS operations R2 deployment complete for Solar Star 3, Solar Star 4, and Fleet.');");
fs.writeFileSync(root+'/deploy.mjs',deploy);
console.log(JSON.stringify({root,files:Object.keys(manifest.files).length,manifestHash:sha(fs.readFileSync(root+'/manifest.json')),deployHash:sha(deploy)}));
