/** Produce a hash-pinned UI-only installer from the established reversible Fleet installer. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]),stage=path.resolve(process.argv[3]);assert(!fs.existsSync(stage));
const raw=fs.readFileSync(root+'/storage-display-manifest.json'),m=JSON.parse(raw);
const sha=b=>createHash('sha256').update(b).digest('hex');
let installer=fs.readFileSync('scripts/deploy-remote-admin.mjs','utf8');
const once=(a,b)=>{assert.equal(installer.split(a).length,2,a);installer=installer.replace(a,b);};
// Rename this rollout, then point its rollback baseline to the active remote-admin release.
installer=installer.replaceAll('remote-admin','storage-display').replaceAll('animation-continuity','remote-admin');
installer=installer.replaceAll('Remote User administration','Local Storage display').replaceAll('remote administration','storage presentation');
once("const manifestHash='1d3993805aa50e7436ac17da35c02219ab6056ae27019ed5e15a5c2479cb428b';",`const manifestHash='${sha(raw)}';`);
once("for(const f of ['server.cjs','profile-controls.cjs','fleet-entry.cjs','workspace-ui.cjs','snapshot-cache-worker.cjs','index.html','mobile.html'])assert.equal(m.before[f],m.after[f]);assert.deepEqual(m.changed,['assets/AdminUsers-remoteadmin21.js','assets/fleet-remoteadmin21.js','fleet-server.cjs','fleet.html','storage-display.cjs'].sort());return m;",
 "for(const [f,h]of Object.entries(m.before))if(!['index.html','fleet.html','mobile.html','signin.html'].includes(f))assert.equal(h,m.after[f],f+' preserved');assert(m.changed.every(p=>['index.html','fleet.html','mobile.html','signin.html'].includes(p)||p.startsWith('assets/')&&p.endsWith('-storage21.js')));return m;");
once("['/fleet/api/fleet/admin/users',updated?401:403]","['/fleet/api/fleet/admin/users',401]");
once("['fleet-server.cjs','profile-controls.cjs','storage-display.cjs']","['fleet-server.cjs','profile-controls.cjs','remote-admin.cjs']");
once("assert(source.includes(\"admin/users',updated?401:403\"));","assert(source.includes(\"admin/users',401\"));");
assert(installer.includes("const prior='/opt/prizm-fleet/releases/remote-admin-20261021'"));
assert(installer.includes("const release='/opt/prizm-fleet/releases/storage-display-20261021'"));
assert(!installer.includes('updated?401:403'));
fs.mkdirSync(stage,{recursive:true});fs.writeFileSync(stage+'/storage-display-manifest.json',raw);
for(const p of m.changed){assert(/^[a-zA-Z0-9_./-]+$/.test(p)&&!p.split('/').includes('..'));const bytes=fs.readFileSync(root+'/dist/'+p);assert.equal(sha(bytes),m.after[p]);fs.mkdirSync(path.dirname(stage+'/'+p),{recursive:true});fs.writeFileSync(stage+'/'+p,bytes);}
fs.writeFileSync(path.dirname(stage)+'/prizm-storage-display-deploy.mjs',installer);
console.log(JSON.stringify({stage,installer:path.dirname(stage)+'/prizm-storage-display-deploy.mjs',changed:m.changed.length,backendUnchanged:true}));
