const fs = require('fs');
let c = fs.readFileSync('src/components/SiteOperationsDashboard.tsx', 'utf8');

c = c.replace(/const profileId = state.stringsDashboard\?.profileId \|\| state.siteSummary\?.site\?.activeProfileId;/, 'const profileId = state.siteSummary?.site?.profileId || state.stringsDashboard?.profileId;');

fs.writeFileSync('src/components/SiteOperationsDashboard.tsx', c);
console.log("Fixed profileId resolution");
