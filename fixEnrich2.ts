import fs from 'fs';

let content = fs.readFileSync('src/server/feather/deviceEnrichment.ts', 'utf8');

const rawOld = `  raw?: {
    blockviewer?: unknown;
    ipMap?: unknown;
    stringIpMap?: unknown;
    stringsCsv?: unknown;
    lastCall?: unknown;
    directFeather?: unknown;
    firstResponder?: unknown;
  };`;
const rawNew = `  raw?: any;`;
content = content.replace(rawOld, rawNew);

fs.writeFileSync('src/server/feather/deviceEnrichment.ts', content);
