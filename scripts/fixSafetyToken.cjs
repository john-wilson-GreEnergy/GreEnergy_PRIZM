const fs = require('fs');
let c = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

c = c.replace(
    /const clearableFaults = Array\.isArray\(topology\) \? topology\.filter\(\(t: any\) => t\.allowFaultReset === true\) : \[\];/,
    `const clearableFaults = Array.isArray(topology) ? topology.filter((t: any) => t.allowFaultReset === true).map((t: any) => ({ ...t, entityKeyToken: t.entityKeyToken || t.id || t.name || "UNKNOWN_TOKEN" })) : [];`
);

fs.writeFileSync('src/server/siteOperations.ts', c);
console.log("Fixed clearableFaults token mapping");
