const fs = require('fs');
let c = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

c = c.replace(/        \n                     groupMap\.get[\s\S]*?\}\);\n        \}\);/, '');

fs.writeFileSync('src/server/siteOperations.ts', c);
