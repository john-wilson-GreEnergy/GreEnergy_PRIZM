import fs from 'fs';

let enrichContent = fs.readFileSync('src/server/feather/deviceEnrichment.ts', 'utf8');

enrichContent = enrichContent.replace(
  /dev\.lastCheckedUtc \?\? new Date/g,
  "dev.lastSuccessAt ?? new Date" // I replaced it with something wrong before?
);

enrichContent = enrichContent.replace(
  /dev\.lastCheckedUtc/g,
  "dev.lastSuccessAt"
);

fs.writeFileSync('src/server/feather/deviceEnrichment.ts', enrichContent);
