import * as fs from 'fs';

let code = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

code = code.replace(/\\\$\{/g, '${');

fs.writeFileSync('src/server/siteOperations.ts', code);
console.log('Fixed literally escaped template strings');
