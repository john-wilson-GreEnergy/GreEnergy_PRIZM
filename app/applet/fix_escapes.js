const fs = require('fs');
let code = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

const literalTemplatePattern = /\\\$\{/g;
console.log('Matches:', code.match(literalTemplatePattern)?.length || 0);

code = code.replace(literalTemplatePattern, '${');
fs.writeFileSync('src/server/siteOperations.ts', code);
