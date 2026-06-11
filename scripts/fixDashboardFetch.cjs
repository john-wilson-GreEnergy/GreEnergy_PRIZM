const fs = require('fs');
let c = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

c = c.replace(/fetch\("\/api\/local\/overview\/\(state\.overviewDiscovery\?\.discoveredSections \|\| \{\}\)\?fullTables=true"\)/, 'fetch("/api/local/overview/discovery?fullTables=true")');

fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', c);
console.log("Fixed dashboard fetch url");
