import fs from 'fs';
let content = fs.readFileSync('src/server/emsTurtleClient.ts', 'utf8');
content = content.replace('export function setDemoMode(active: boolean) {}\n}', 'export function setDemoMode(active: boolean) {}');
fs.writeFileSync('src/server/emsTurtleClient.ts', content);
console.log('Fixed extra brace');
