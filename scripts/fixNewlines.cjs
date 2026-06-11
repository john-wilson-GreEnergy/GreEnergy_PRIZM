const fs = require('fs');
let c = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

c = c.replace(/\\nrouter\.get\("\/summary"/g, '\nrouter.get("/summary"');
c = c.replace(/\\n        dig\(lastCall, "lastCall"\);/g, '\n        dig(lastCall, "lastCall");');

fs.writeFileSync('src/server/siteOperations.ts', c);
console.log("Fixed literal newlines");
