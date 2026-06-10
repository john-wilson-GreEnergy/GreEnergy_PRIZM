import fs from 'fs';
let cPath = 'src/components/SafetyFaultClearView.tsx';
let cContent = fs.readFileSync(cPath, 'utf8');
cContent = cContent.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync(cPath, cContent);
console.log('Fixed escaping');
