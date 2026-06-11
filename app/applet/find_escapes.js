const fs = require('fs');
let code = fs.readFileSync('src/server/siteOperations.ts', 'utf8');
const lines = code.split('\n');
lines.forEach((l, i) => {
   if (l.indexOf('\\$') >= 0 || l.indexOf('\\{') >= 0) {
      console.log(i + 1, l);
   }
});
