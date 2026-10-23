/** Reviewed staged-pilot rollback. Never deletes application data or site history. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,unlink} from 'node:fs/promises';
const exec=promisify(execFile);
if(process.getuid?.()!==0||process.argv[2]!=='--restore-staged-pilot')throw Error('Explicit root rollback required');
const units=['prizm-fleet-entry-ss3.service','prizm-fleet-entry@ss4.service','prizm-fleet.service','prizm-site@ss4.service'];
// Restore must persist across reboot, not just stop the current processes.
await exec('systemctl',['disable',...units,'prizm-fleet-network.service'],{timeout:30000});
await exec('systemctl',['stop',...units],{timeout:180000});
await exec('systemctl',['stop','prizm-fleet-network.service'],{timeout:120000});
// If startup failed before systemd recorded success, finish the journal recovery.
await exec('/usr/bin/flock',['-w','30','/run/prizm-fleet-pilot/lock','/usr/bin/node','/opt/prizm-fleet/current/scripts/fleet-pilot-network.mjs','stop','/etc/prizm-fleet/network-plan.json'],{timeout:120000});
const dropin='/etc/systemd/system/prizm.service.d/90-fleet-export.conf';
try {
  const text=await readFile(dropin,'utf8');
  if(!text.startsWith('# PRIZM reviewed staged Fleet export\n'))throw Error('Export override changed; manual review required');
  await unlink(dropin);await exec('systemctl',['daemon-reload']);await exec('systemctl',['restart','prizm'],{timeout:180000});
} catch(e){if(e.code!=='ENOENT')throw e;}
console.log('Staged Fleet stopped, SS4 port returned, SS3 standalone configuration restored. Site data and certificates retained.');
