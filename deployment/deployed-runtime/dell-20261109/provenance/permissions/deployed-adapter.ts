import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const base="/Users/johnwilson/Documents/Codex/2026-08-31/in-app-browser-context-source-ambient/permission-parity-20261109/release/fleet",req=createRequire("/Volumes/Dock_Storage/Projects/PRIZM_Utility/GreEnergy_PRIZM/package.json");
const module={exports:{}};
let code=fs.readFileSync(base+'/fleet-server.cjs','utf8');
const startup='void main().catch(() => {\n  console.error("Fleet startup failed. Check private enrollment, account and TLS configuration.");\n  process.exitCode = 1;\n});';
if(code.split(startup).length!==2)throw Error('Unexpected startup boundary');
code=code.replace(startup,'')+'\nmodule.exports={createRemoteMobileApp,createMobileApp,FleetBroker,hashLocalPassword,readAccounts,LocalSessions,manageFleetAccount,createWorkspaceGateway,workspaceRead,createFleetApp,workspacePath,workspaceRouteAllowed,passiveWorkspaceGet,parseWorkspaceEnrollments};';
vm.runInNewContext(code,{module,exports:module.exports,require:id=>id.startsWith('./')?req(base+'/'+id.slice(2)):req(id),process,console,Buffer,URL,URLSearchParams,structuredClone,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval,AbortController,fetch}, {filename:base+'/fleet-server.cjs'});
export const {createRemoteMobileApp,createMobileApp,FleetBroker,hashLocalPassword,readAccounts,LocalSessions,manageFleetAccount,createWorkspaceGateway,workspaceRead,createFleetApp,workspacePath,workspaceRouteAllowed,passiveWorkspaceGet,parseWorkspaceEnrollments}=module.exports as any;
