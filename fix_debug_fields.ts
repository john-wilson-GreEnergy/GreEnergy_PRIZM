import fs from 'fs';
let file = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

file = file.replace(
/debug: \{\s*pcsDebugKeys: Array\.from\(new Set\(pcsDebugKeys\)\),\s*appDebugKeys: \[\],\s*emsAppCandidateCount: emsApps\.length,\s*emsAppSourcePaths: emsAppSourcePaths,\s*unknownDragonAppCodes: unknownDragonAppCodes\s*\}/s,
`debug: {
               pcsDebugKeys: Array.from(new Set(pcsDebugKeys)),
               appDebugKeys: [],
               emsAppCandidateCount: emsApps.length,
               emsAppSourcePaths: emsAppSourcePaths,
               unknownDragonAppCodes: unknownDragonAppCodes,
               arraySummarySource,
               arraySummaryCandidateCount: arrCands.length,
               fleetMetricSource
            }`
);
fs.writeFileSync('src/server/siteOperations.ts', file);
console.log('Fixed debug fields');
