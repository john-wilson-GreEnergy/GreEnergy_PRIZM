import fs from 'fs';
const json = fs.readFileSync('src/server/siteOperations.ts', 'utf8');
const index = json.indexOf('featherCellTempExcludedCollectionSegments');
console.log('INDEX', index);
