import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
// macOS's per-user TMPDIR exceeds sockaddr_un's path limit after nesting.
const temp=process.platform==='darwin'?'/private/tmp':fs.realpathSync(os.tmpdir());
const root=fs.mkdtempSync(path.join(temp,'prizm-offline-integration-'));
fs.chmodSync(root,0o700);
const result=spawnSync(process.execPath,['--require','./scripts/test-unix-network-guard.cjs','--import','tsx','src/server/fleet/remoteAdmin.test.ts'],{
 cwd:process.cwd(),stdio:'inherit',timeout:60000,
 env:{...process.env,TMPDIR:root,TMP:root,TEMP:root,PRIZM_TEST_SOCKET_ROOT:root},
});
if(result.error)console.error(result.error.message);
// Keep the fixture directory on failure for inspection; never touch site data.
if(result.status===0)fs.rmSync(root,{recursive:true});
else console.error('Private synthetic fixture retained:',root);
process.exitCode=result.status??1;
