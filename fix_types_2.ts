import fs from 'fs';
let file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

file = file.replace(/if \(maxTempC !== null && Math\.abs\(maxTempRaw\) > 100\)/g, 'if (maxTempRaw !== null && Math.abs(maxTempRaw) > 100)');
file = file.replace(/tempDeltaC: \(maxTempC !== null/g, 'tempDeltaC: (maxTempRaw !== null');

file = file.replace(/str\.powerkW/g, 'str.powerKw');

file = file.replace(/const tAvg = str\.avgTempRaw;/g, 'const tAvg = str.avgTempC;');
file = file.replace(/const tMax = str\.maxTempRaw;/g, 'const tMax = str.maxTempC;');
file = file.replace(/const tMin = str\.minTempRaw;/g, 'const tMin = str.minTempC;');

fs.writeFileSync('src/server/siteOperations.ts', file);
