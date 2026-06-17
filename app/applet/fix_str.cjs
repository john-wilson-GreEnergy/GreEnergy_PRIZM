const fs = require('fs');
let s = fs.readFileSync('src/server/stringsDashboard.ts', 'utf8');

// The top one (around 670) has `const responsePayload: any = {` ending with `});`.
s = s.replace(`        const responsePayload: any = { \n            ...outputData, \n            ...cacheMetadata,`, `        res.json({ \n            ...outputData, \n            ...cacheMetadata,`);

// The bottom one (around 1470) has `isLive: cacheEntry.isLive,\n            isStale: cacheEntry.isStale\n        };\n        if (includePerf) {` 
// wait, line 1486 has an error too: `error TS1005: ')' expected.`
// Let's print out what we generated there.
fs.writeFileSync('src/server/stringsDashboard.ts', s);
