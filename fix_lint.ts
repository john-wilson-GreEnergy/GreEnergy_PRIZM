import fs from 'fs';

let sPath = 'server.ts';
let tPath = 'src/server/telemetry/siteTelemetryAggregator.ts';

let sContent = fs.readFileSync(sPath, 'utf8');
sContent = sContent.replace('import { emsCache } from "./src/server/emsTurtleClient";\n', '');
sContent = sContent.replace('import { getFeatherCache } from "./src/server/featherClient";\n', '');
fs.writeFileSync(sPath, sContent);

let tContent = fs.readFileSync(tPath, 'utf8');
tContent = tContent.replace('import { ProfileStore } from "../profilesConfig";', 'import { ProfileStore } from "../profiles/profileStore";');
fs.writeFileSync(tPath, tContent);

console.log('Fixed duplications and imports');
