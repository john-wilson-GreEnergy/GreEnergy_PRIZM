const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  "const { bootstrapEmsAndSeedCache, getExtendedConnectionStatus } = require('./src/server/emsTurtleClient');",
  ""
);

content = content.replace(
  'import { emsCache } from "./src/server/emsTurtleClient";',
  'import { emsCache, bootstrapEmsAndSeedCache, getExtendedConnectionStatus } from "./src/server/emsTurtleClient";'
);

fs.writeFileSync('server.ts', content);
console.log('Fixed ES module require');
