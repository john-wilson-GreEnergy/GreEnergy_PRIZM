import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// I will just remove the one from line 2 and it should be fine since line 35 imports it correctly
content = content.replace('import { getFeatherCache } from "./src/server/feather/featherClient";\n', '');

fs.writeFileSync('server.ts', content);
