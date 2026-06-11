import * as fs from 'fs';

let code = fs.readFileSync('src/server/siteOperations.ts', 'utf8');

const regex = /\\\\\$\{([^}]+)\}/g;
const regex2 = /\\\$\{([^}]+)\}/g;

let count = 0;
code = code.replace(regex, (match, p1) => {
    count++;
    return '${' + p1 + '}';
});
code = code.replace(regex2, (match, p1) => {
    count++;
    return '${' + p1 + '}';
});

console.log('Fixed interpolations:', count);
fs.writeFileSync('src/server/siteOperations.ts', code);
