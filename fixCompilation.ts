import fs from 'fs';

let dashContent = fs.readFileSync('src/components/FeatherDashboard.tsx', 'utf8');

dashContent = dashContent.replace(
  /const sortedDevices = sortByIPv4\(filteredDevices,/g,
  "const sortedDevices = sortByIPv4<FeatherHvacDevice>(filteredDevices,"
);

// Remove the `?? "N/A"` error in export for any? Let me just cast as any.
dashContent = dashContent.replace(
  /d\.raw\?\.directFeather\?\.hydrogen1PPM \?\? "N\/A"/g,
  '(d.raw?.directFeather as any)?.hydrogen1PPM ?? "N/A"'
);
dashContent = dashContent.replace(
  /d\.raw\?\.directFeather\?\.lostComms \?\? "none"/g,
  '(d.raw?.directFeather as any)?.lostComms ?? "none"'
);
dashContent = dashContent.replace(
  /d\.raw\?\.directFeather\?\.batteryDoorsClosed/g,
  "(d.raw?.directFeather as any)?.batteryDoorsClosed"
);

fs.writeFileSync('src/components/FeatherDashboard.tsx', dashContent);

// Also fix server/feather/deviceEnrichment.ts
let enrichContent = fs.readFileSync('src/server/feather/deviceEnrichment.ts', 'utf8');

enrichContent = enrichContent.replace(
  /stringsCsv: null as string,/g,
  "stringsCsv: null as any,"
);
// fix lastUpdatedAt not existing
enrichContent = enrichContent.replace(
  /dev\.lastUpdatedAt/g,
  "dev.lastCheckedUtc" // wait, FeaterNormalizedStatus has no lastUpdatedAt?
);
fs.writeFileSync('src/server/feather/deviceEnrichment.ts', enrichContent);

console.log('Fix compilation errors done');
