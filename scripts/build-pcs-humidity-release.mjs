import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const repo=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const root=repo+'/deployment/prepared/pcs-humidity-20261110';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const tree=directory=>Object.fromEntries(fs.readdirSync(directory,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>{
  const file=path.join(e.parentPath,e.name);return [path.relative(directory,file),sha(fs.readFileSync(file))];
}).sort(([a],[b])=>a.localeCompare(b)));
assert(!fs.existsSync(root),'Prepared release already exists: '+root);
fs.mkdirSync(root+'/payload',{recursive:true});
fs.cpSync(repo+'/dist',root+'/payload/dist',{recursive:true});
const manifest={schema:1,release:'pcs-humidity-20261110',sourceCommit:'b7c35f3',
  scope:'Direct SMA PCS electronics, AC-area and DC-area humidity acquisition, primary feed publication, history, and operator views',
  files:tree(root+'/payload/dist')};
fs.writeFileSync(root+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
fs.copyFileSync(repo+'/scripts/deploy-pcs-humidity.mjs',root+'/deploy.mjs');
console.log(JSON.stringify({root,files:Object.keys(manifest.files).length,manifestHash:sha(fs.readFileSync(root+'/manifest.json'))}));
