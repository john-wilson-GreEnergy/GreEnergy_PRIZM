const fs = require('fs');
let code = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

const regex = /\\\\\$\{([^}]+)\}/g;
const regex2 = /\\\$\{([^}]+)\}/g;

code = code.replace(regex, (match, p1) => {
    return '${' + p1 + '}';
});
code = code.replace(regex2, (match, p1) => {
    return '${' + p1 + '}';
});

fs.writeFileSync('src/server/siteOperations.ts', code);
console.log('Fixed interpolations');
