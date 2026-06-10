import fs from 'fs';
let content = fs.readFileSync('src/server/emsTurtleClient.ts', 'utf8');

content = content.replace(/export function isDemoActive\(\): boolean \{[\s\S]*?\}/, 'export function isDemoActive(): boolean { return false; }');
content = content.replace(/export function setDemoMode\(active: boolean\) \{[\s\S]*?\}/, 'export function setDemoMode(active: boolean) {}');

fs.writeFileSync('src/server/emsTurtleClient.ts', content);
console.log('patched isDemoActive');
