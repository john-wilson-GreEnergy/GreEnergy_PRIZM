const fs = require('fs');

let content = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

// Fix rollups mapping and types
content = content.replace("const rollups = { totalStrings: (stringBuckets.online + stringBuckets.nearline + stringBuckets.offline + stringBuckets.notCommunicating) || 0 };", "const rollups = state.stringsDashboard?.rollups || { totalStrings: (stringBuckets.online + stringBuckets.nearline + stringBuckets.offline + stringBuckets.notCommunicating) || 0 };");

// Fix discovery missing
content = content.replace(/discovery\?/g, "(state.overviewDiscovery?.discoveredSections || {})?");

fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', content);
console.log("Fixed typescript issues");
