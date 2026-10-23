import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatStorageBytes, formatStorageFolder, storageUsedPercent, type StorageStatus } from './storagePresentation';

for (const value of [undefined, null, NaN, Infinity, -Infinity, -1, {}, {sizeBytes: 1024}, '1024']) {
  assert.equal(formatStorageBytes(value), 'Unavailable');
}
for (const [bytes, expected] of [[0,'0 MB'],[1,'1.0 Bytes'],[1024,'1.0 KB'],[1024**2,'1.0 MB'],[1024**3,'1.0 GB'],[1024**4,'1.0 TB'],[1024**6,'1024.0 PB']] as const) {
  assert.equal(formatStorageBytes(bytes), expected);
}
for (const disk of [undefined, {}, {totalBytes:0,freeBytes:0}, {totalBytes:100,freeBytes:101}, {totalBytes:100,freeBytes:-1}, {totalBytes:Infinity,freeBytes:1}, {totalBytes:100,freeBytes:NaN}]) {
  assert.equal(storageUsedPercent(disk), null);
}
assert.equal(storageUsedPercent({totalBytes:100,freeBytes:100}),0);
assert.equal(storageUsedPercent({totalBytes:100,freeBytes:0}),100);
assert.equal(storageUsedPercent({totalBytes:100,freeBytes:25}),75);
const sample: StorageStatus = {disk:{totalBytes:1024**4,freeBytes:512*1024**3},folders:{history:{sizeBytes:0},runtimeCache:{sizeBytes:1024**2},nodeModules:{sizeBytes:1024**3},data:{sizeBytes:2048},dist:{sizeBytes:4096}}};
assert.equal(formatStorageBytes(sample.disk?.totalBytes),'1.0 TB');
assert.equal(storageUsedPercent(sample.disk),50);
assert.equal(formatStorageBytes(sample.folders?.runtimeCache?.sizeBytes),'1.0 MB');
const component = readFileSync(new URL('../components/ConnectionSettings.tsx',import.meta.url),'utf8');
assert(component.includes('storageStatus.disk?.freeBytes'));
assert(component.includes('storageStatus.disk?.totalBytes'));
for(const key of ['history','runtimeCache','nodeModules','data','dist']) assert(component.includes(`folder: storageStatus.folders?.${key}`));
assert(component.includes('formatStorageFolder(dir.folder)'));
assert.equal(formatStorageFolder({exists:false,sizeBytes:0}), 'Not present');
assert.equal(formatStorageFolder({exists:false,sizeBytes:1024}), 'Not present');
assert.equal(formatStorageFolder({exists:true,sizeBytes:0}), '0 MB');
assert.equal(formatStorageFolder({exists:true,sizeBytes:1024}), '1.0 KB');
assert.equal(formatStorageFolder({sizeBytes:1024}), '1.0 KB');
for(const folder of [undefined, {}, {sizeBytes:0}, {exists:null,sizeBytes:0}, {exists:null,sizeBytes:1024}, {exists:true,sizeBytes:NaN}]) assert.equal(formatStorageFolder(folder), 'Unavailable');
assert(!component.includes('storageStatus.folders.prizmHistory'));
assert(!component.includes('Math.log(bytes)'));
console.log('PASS storage presentation: canonical fields, zero, unavailable, invalid values, units and meter bounds');
