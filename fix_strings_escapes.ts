import fs from 'fs';
let cPath = 'src/components/SiteStringsDashboard.tsx';
let sPath = 'server.ts';

let cContent = fs.readFileSync(cPath, 'utf8');
cContent = cContent.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync(cPath, cContent);

let sContent = fs.readFileSync(sPath, 'utf8');
sContent = sContent.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync(sPath, sContent);
console.log('Fixed escaping');
