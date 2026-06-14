import fs from 'fs';

let file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

file = file.replace(/debug: \{/, 
`debug: {
               featherCellTempExcludedCollectionSegments,
               normalizedStringRowCount: stringSummary.tableRows.length,`);
               
fs.writeFileSync('src/server/siteOperations.ts', file);
