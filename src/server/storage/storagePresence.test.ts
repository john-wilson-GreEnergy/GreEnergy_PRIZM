import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { storageFolderExists } from './storageMaintenance';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prizm-folder-presence-'));
try {
  fs.mkdirSync(path.join(root, 'empty'));
  fs.writeFileSync(path.join(root, 'file'), 'test');
  fs.symlinkSync(path.join(root, 'empty'), path.join(root, 'linked'));
  assert.equal(storageFolderExists(path.join(root, 'absent')), false);
  assert.equal(storageFolderExists(path.join(root, 'empty')), true);
  assert.equal(storageFolderExists(path.join(root, 'linked')), true);
  assert.equal(storageFolderExists(path.join(root, 'file')), null);
  assert.equal(storageFolderExists(path.join(root, 'file', 'child')), null);
  const original = fs.statSync;
  try {
    Object.defineProperty(fs, 'statSync', {value: () => { throw Object.assign(new Error('Denied'), {code:'EACCES'}); }});
    assert.equal(storageFolderExists(root), null);
  } finally { Object.defineProperty(fs, 'statSync', {value: original}); }
  assert.deepEqual(fs.readdirSync(root).sort(), ['empty','file','linked']);
} finally { fs.rmSync(root, {recursive:true}); }
console.log('PASS folder existence: missing, empty, symlink, non-directory, inaccessible; read-only probes');
