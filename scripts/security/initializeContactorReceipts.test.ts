import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,stat,chmod,symlink} from 'node:fs/promises';
import path from 'node:path';
const run=(directory:string,...args:string[])=>promisify(execFile)(process.execPath,[
  '--require',path.resolve('scripts/test-network-guard.cjs'),'--import','tsx',
  path.resolve('scripts/security/initializeContactorReceipts.ts'),directory,...args,
]);
const acknowledgment='--new-pilot-no-unresolved-commands';
const directory=await mkdtemp('/tmp/prizm-receipt-init-'),file=path.join(directory,'contactor-receipts.json');
await assert.rejects(run(directory));
await assert.rejects(stat(file),'Missing acknowledgment must not create storage');
await run(directory,acknowledgment);
const original=await readFile(file,'utf8');
assert.deepEqual(JSON.parse(original),{version:1,entries:[]});
assert.equal((await stat(file)).mode&0o777,0o600);
await assert.rejects(run(directory,acknowledgment),'Existing history must not be overwritten');
assert.equal(await readFile(file,'utf8'),original);
const insecure=await mkdtemp('/tmp/prizm-receipt-insecure-');
await chmod(insecure,0o755);
await assert.rejects(run(insecure,acknowledgment));
await assert.rejects(stat(path.join(insecure,'contactor-receipts.json')));
const linked=path.join(directory,'linked-directory');
await symlink(directory,linked);
await assert.rejects(run(linked,acknowledgment));
console.log('Receipt initializer: explicit acknowledgment, private permissions, no overwrite and symlink refusal passed in temporary directories only.');
