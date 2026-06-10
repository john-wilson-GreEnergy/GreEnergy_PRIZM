import fs from 'fs';
import path from 'path';

let compPath = path.join(process.cwd(), 'src/components/SiteTelemetryDashboard.tsx');
let content = fs.readFileSync(compPath, 'utf8');

content = content.replace(/\\\$/g, '$');
content = content.replace(/\\`/g, '`');

fs.writeFileSync(compPath, content);
console.log('Fixed escape characters in SiteTelemetryDashboard');
