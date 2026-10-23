/** Preserve the deployed release; patch only shared interface delivery. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {parse} from '@babel/parser';
const [baselineArg,outputArg]=process.argv.slice(2);assert(baselineArg&&outputArg);
const baseline=path.resolve(baselineArg),output=path.resolve(outputArg);
assert(!fs.existsSync(output),'Fresh output required');
const digest=b=>createHash('sha256').update(b).digest('hex');
function tree(dir){const result={};for(const name of fs.readdirSync(dir).sort()){
 const file=path.join(dir,name),s=fs.lstatSync(file);assert(!s.isSymbolicLink(),'No symlinks');
 if(s.isDirectory())for(const [p,h]of Object.entries(tree(file)))result[name+'/'+p]=h;
 else {assert(s.isFile());result[name]=digest(fs.readFileSync(file));}
}return result;}
const before=tree(baseline);fs.cpSync(baseline,output,{recursive:true});
const sidecar=await build({entryPoints:['src/server/fleet/workspaceUi.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
fs.writeFileSync(output+'/workspace-ui.cjs',sidecar.outputFiles[0].contents);
let source=fs.readFileSync(baseline+'/fleet-server.cjs','utf8');
const changes=[];
function once(from,to,label){assert.equal(source.split(from).length,2,'Exact boundary: '+label);source=source.replace(from,to);changes.push(label);}
once('function createWorkspaceGateway(sessions, collector, enrollment, fleetOrigin, audit, forward, allowLoopbackHttp = false) {',
 'function createWorkspaceGateway(sessions, collector, enrollment, fleetOrigin, audit, forward, allowLoopbackHttp = false, _reservedSharedSites = [], workspaceUi) {','optional LAN UI provider');
once('          fullControl: true,\n          ...await sessions.status(token)',
 '          fullControl: true,\n          ...(workspaceUi ? {uiRelease:workspaceUi.releaseId} : {}),\n          ...await sessions.status(token)','LAN release identity');
once('      await forward(req, res, async () => {',
 '      if(req.method === "GET" && workspaceUi?.send(path10,res))return;\n      await forward(req, res, async () => {','authenticated LAN static delivery');
once('        res.sendFile(import_node_path6.default.resolve(options.publicDirectory, "index.html"));',
 '        if(options.workspaceUi?.send("/",res))return;\n        res.sendFile(import_node_path6.default.resolve(options.publicDirectory, "index.html"));','remote desktop shared delivery');
once('fullControl: false, remoteReadOnly: true });',
 'fullControl: false, remoteReadOnly: true, ...(options.workspaceUi ? {uiRelease:options.workspaceUi.releaseId} : {}) });','remote identity preserves read-only');
once('  for (const asset of assets) app.get(asset, (_req, res) => res.sendFile(import_node_path7.default.join(options.publicDirectory, asset)));',
 '  for (const asset of assets) app.get(asset, (_req, res) => {if(options.workspaceUi?.send(asset,res))return;res.sendFile(import_node_path7.default.join(options.publicDirectory, asset));});','remote shared assets');
for(const name of ['createFleetApp','createMobileApp']){
 const start=source.indexOf('function '+name+'('),at=source.indexOf('  app.use((req, res, next) => {',start);
 assert(start>0&&at>start&&at-start<2000);const boundary=source.slice(start,at)+'  app.use((req, res, next) => {';
 once(boundary,boundary+'\n    if(options.workspaceUi)res.set("X-Prizm-UI-Release",options.workspaceUi.releaseId);',name+' release header');
}
once('  const workspaces = parseWorkspaceEnrollments(config.workspaces, collectors, config.origin);',
 '  const workspaces = parseWorkspaceEnrollments(config.workspaces, collectors, config.origin);\n  const workspaceUi=process.env.PRIZM_UNIFIED_WORKSPACE_UI === "false" ? undefined : require("./workspace-ui.cjs").createWorkspaceUi(import_node_path9.default.resolve("dist"));','one immutable UI instance and rollback');
const publicBoundary='publicDirectory: import_node_path9.default.resolve("dist"),';
assert.equal(source.split(publicBoundary).length,4);source=source.replaceAll(publicBoundary,publicBoundary+' workspaceUi,');changes.push('three existing application options');
once('const gateway = createWorkspaceGateway(sessions, collector, workspace, config.origin, audit, workspaceForwarder(collector, workspace));',
 'const gateway = createWorkspaceGateway(sessions, collector, workspace, config.origin, audit, workspaceForwarder(collector, workspace), false, [], workspaceUi);','both LAN gateways shared UI');
parse(source);fs.writeFileSync(output+'/fleet-server.cjs',source);
const after=tree(output),changed=Object.keys(after).filter(p=>before[p]!==after[p]);
assert.deepEqual(changed.sort(),['fleet-server.cjs','workspace-ui.cjs']);
const manifest={schema:1,scope:'Shared LAN/remote UI delivery only; collectors and remote controls unchanged',before,after,changed,changes};
fs.writeFileSync(path.dirname(output)+'/unified-manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({changed,filesPreserved:Object.keys(before).length-1,output}));
