import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const oldBlock = `setInterval(async () => {
  await pollEmsTurtle();
  const { emsCache } = await import("./src/server/emsTurtleClient.js");
  const { __featherCache } = await import("./src/server/featherClient.js");
  recordTelemetrySample(emsCache, __featherCache);
}, emsPollInterval);`;

const newBlock = `
import { emsCache } from "./src/server/emsTurtleClient";
import { getFeatherCache } from "./src/server/featherClient";

// ... we can't reliably inject imports in the middle of server.ts easily using replace if it's already got other imports.
// Let's just find "setInterval" and replace the block to just use regular requires if esbuild permits, or import them up top.
`;

// Actuallly I'll just write a script to insert imports AT THE VERY TOP
let sIdx = content.indexOf('import express from "express";');
let imports = `
import { emsCache } from "./src/server/emsTurtleClient";
import { getFeatherCache } from "./src/server/featherClient";
`;

if (!content.includes('import { emsCache }')) {
   content = content.substring(0, sIdx) + imports + content.substring(sIdx);
}

const safePollLoop = `setInterval(async () => {
  await pollEmsTurtle();
  recordTelemetrySample(emsCache, getFeatherCache());
}, emsPollInterval);`;

content = content.replace(oldBlock, safePollLoop);

fs.writeFileSync('server.ts', content);
console.log('Fixed server.ts imports');
