import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const imp = 'import { getFeatherCache } from "./src/server/feather/featherClient";\nimport { emsCache } from "./src/server/emsTurtleClient";';

if (!content.includes('import { emsCache }')) {
    content = content.replace('import express from "express";', imp + '\nimport express from "express";');
}

fs.writeFileSync('server.ts', content);

