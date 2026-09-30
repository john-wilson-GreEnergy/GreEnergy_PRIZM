/** Run manually on the host. Never creates a shared/default password or grants controls. */
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {mkdir,open,rename,lstat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {hashLocalPassword,parseAccounts,readAccounts,type LocalAccount} from '../../src/server/security/localAccounts';
import type {Grant} from '../../src/core/security/controlPolicyPrototype';
import {normalizeLocalEmail} from '../../src/core/security/localEmail';

const [directory,inputEmail,siteId,blockId,role,...extra] = process.argv.slice(2);
const email = normalizeLocalEmail(inputEmail);
if (!directory || !path.isAbsolute(directory) || !email || extra.length || ![siteId,blockId].every(value => /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/.test(value ?? '')) || !['viewer','recorder'].includes(role)) {
  throw new Error('Usage: addLocalAccount.ts /absolute/private-directory email siteId blockId viewer|recorder');
}
if (!process.stdin.isTTY) throw new Error('Use an interactive terminal; passwords are not accepted in command arguments or environment variables');
await mkdir(directory,{recursive:true,mode:0o700});
const stat = await lstat(directory);
if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error('Account directory must be private (0700)');
const file = path.join(directory,'accounts.json');
let accounts: LocalAccount[];
try {accounts = await readAccounts(file);} catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; accounts = [];}
if (accounts.some(account => account.email === email)) throw new Error('Account exists; no credentials changed');
const muted = new Writable({write(_chunk,_encoding,done){done();}});
const prompt = createInterface({input:process.stdin,output:muted,terminal:true});
let password: string, confirmation: string;
try {
  process.stdout.write('New password (hidden): '); password = await prompt.question('');
  process.stdout.write('\nRepeat password (hidden): '); confirmation = await prompt.question('');
  process.stdout.write('\n');
} finally {prompt.close();}
if (password !== confirmation) throw new Error('Passwords differ; no account created');
const record = await hashLocalPassword(password);
password = ''; confirmation = '';
const grants: Grant[] = ['history.view','telemetry.view'].map(capability => ({capability:capability as Grant['capability'],siteId,blockId,scope:{kind:'block'}}));
if (role === 'recorder') grants.push({capability:'diagnostics.record',siteId,blockId,scope:{kind:'block'}});
accounts.push({id:randomUUID(),email,disabled:false,version:1,password:record,grants});
const validated = parseAccounts(accounts);
// Refuse concurrent provisioning rather than clobbering another administrator's edit.
const lock = await open(path.join(directory,'provision.lock'),'wx',0o600);
try {
  let current: LocalAccount[];
  try {current = await readAccounts(file);} catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; current = [];}
  if (JSON.stringify(current) !== JSON.stringify(accounts.slice(0,-1))) throw new Error('Account store changed; retry provisioning');
  const temporary = path.join(directory,randomUUID()+'.accounts.tmp');
  const output = await open(temporary,'wx',0o600);
  try {await output.writeFile(JSON.stringify(validated,null,2));await output.sync();} finally {await output.close();}
  await rename(temporary,file);
  try {const owners = await open(path.join(directory,'owners.json'),'wx',0o600);try {await owners.writeFile('[]');await owners.sync();} finally {await owners.close();}} catch(error) {if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;}
} finally {
  await lock.close();
  // Only the exact lock created by this invocation is removed.
  const {unlink} = await import('node:fs/promises'); await unlink(path.join(directory,'provision.lock'));
}
console.log('Local account created. No equipment-control grants added; running access mode unchanged.');
