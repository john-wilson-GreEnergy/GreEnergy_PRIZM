/** Offline scoped parity check. Never loads or starts a collector/Fleet bundle. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {definitions,compareFunction} from './dell-source-parity-lib.mjs';
const baseline=process.argv[2];
assert(baseline,'Usage: node scripts/check-dell-source-parity.mjs <captured-dell-baseline> (after npm run build)');
const read=p=>fs.readFileSync(p,'utf8');
const captured=path.resolve(baseline,'production');
const lock=JSON.parse(read(path.resolve(baseline,'production-lock.json')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function artifact(release,file){
 const bytes=fs.readFileSync(path.join(captured,release,'dist',file));
 assert.equal(sha(bytes),lock.roots[release].files[file],`Captured artifact changed: ${release}/${file}`);
 return bytes;
}
const production=read(path.join(captured,'safety-filtering-collector-20261022/dist/server.cjs'));
assert.equal(createHash('sha256').update(production).digest('hex'),'2db7595091fc7738abc7e85e8ca6b83cb2c3399b10b76d1e0f1dff400ef4fb33','Reviewed collector baseline required');
const source=read('dist/server.cjs');
const a=definitions(production),b=definitions(source),passed=[];
for(const name of ['normalizeKey','collectSafetyCandidates','extractLastCallCandidates','normalizeBlockviewerTopology','mergeCandidates','buildSafetyFaultCandidateSnapshot'])passed.push(compareFunction(a,b,name));
passed.push(compareFunction(a,b,'safetyFaultEquipment',{aliases:{__safetyStringToEnergySegment:'stringNumberToEnergySegment'}}));
passed.push(compareFunction(a,b,'stringNumberToEnergySegment',{deployedName:'__safetyStringToEnergySegment'}));
for(const name of ['validateGuidance','applyCorrectiveGuidance','createCorrectiveGuidanceRouter'])passed.push(compareFunction(a,b,name));
passed.push(compareFunction(a,b,'parseCollectorAccounts',{deployedName:'parseAccounts'}));
const exactArtifacts=[],sidecarDifferences=[];
for(const [entry,file,release]of [
 ['scripts/soc-strings-runtime.ts','soc-strings-runtime.cjs','safety-filtering-20261022'],
 ['src/server/fleet/workspaceUi.ts','workspace-ui.cjs','safety-filtering-20261022'],
 ['src/server/telemetry/SnapshotRetentionWorker.ts','snapshot-retention-runtime.cjs','safety-filtering-collector-20261022'],
]){
 const result=await build({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
 const current=sha(result.outputFiles[0].contents),deployed=sha(artifact(release,file));
 if(current===deployed)exactArtifacts.push(file);
 else sidecarDifferences.push({source:entry,artifact:file,current,deployed});
}
for(const [file,release]of [
 ['fleet-entry.cjs','workspaces-20261001'],
 ['snapshot-cache-worker.cjs','soc-strings-20261021'],
 ['cell-history-worker.cjs','soc-strings-20261021'],
 ['history-query-worker.cjs','soc-strings-20261021'],
]){
 assert.equal(sha(fs.readFileSync('dist/'+file)),sha(artifact(release,file)),`Build artifact differs: ${file}`);
 exactArtifacts.push(file);
}
const withoutMap=text=>text.replace(/^\/\/# sourceMappingURL=.*$/m,'').trim();
assert.equal(withoutMap(read('dist/snapshot-retention-worker.cjs')),withoutMap(artifact('safety-filtering-collector-20261022','snapshot-retention-worker.cjs').toString()),'Retention worker executable code differs');
// Known guidance/preload differences were reconciled on 2026-10-27. This
// scoped checker still does not compare complete entrypoints, classes or UI.
console.log(JSON.stringify({scope:'Selected deployed safety/guidance/collector-account functions, sidecars and workers; not the whole application',passed,exactArtifacts,sidecarDifferences,codeMatchesIgnoringSourceMap:['snapshot-retention-worker.cjs'],wholeProgramParity:'NOT_VERIFIED',equipmentCommandsSent:false},null,2));
// A successful build or a matching subset is not permission to replace Dell.
if(sidecarDifferences.length)process.exitCode=2;
