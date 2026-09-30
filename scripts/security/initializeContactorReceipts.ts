/** Host-admin migration only. Never call from startup or automated recovery. */
import {constants} from 'node:fs';
import {lstat,open} from 'node:fs/promises';
import path from 'node:path';
import {ContactorReceipts} from '../../src/server/security/contactorReceipts';
const [directory,acknowledgment,...extra]=process.argv.slice(2);
if(!directory || !path.isAbsolute(directory) || acknowledgment!=='--new-pilot-no-unresolved-commands' || extra.length) {
  throw new Error('Usage: initializeContactorReceipts.ts /absolute/private-directory --new-pilot-no-unresolved-commands. Use only for a new pilot after verifying there are no unresolved commands. Never replace lost history.');
}
const stat=await lstat(directory);
if(!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode&0o077)!==0 || stat.uid!==process.getuid?.()) throw new Error('Run as the owner of an existing private (0700) directory');
const file=path.join(directory,'contactor-receipts.json');
const output=await open(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
try {await output.writeFile(JSON.stringify({version:1,entries:[]}));await output.sync();} finally {await output.close();}
const parent=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
try {await parent.sync();} finally {await parent.close();}
await new ContactorReceipts(file).validate();
console.log('Empty receipt ledger initialized for a new pilot. No permissions, mode flags, server state or equipment changed.');
