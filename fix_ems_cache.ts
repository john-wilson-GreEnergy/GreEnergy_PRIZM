import fs from 'fs';
let fp = 'src/server/emsTurtleClient.ts';
let content = fs.readFileSync(fp, 'utf8');

content = content.replace('const emsCache: EmsCache = {', 'export const emsCache: EmsCache = {');

fs.writeFileSync(fp, content);
console.log('Fixed emsCache export');
