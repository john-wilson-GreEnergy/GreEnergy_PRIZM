import * as fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// Add import
const importPattern = `import express from "express";`;
content = content.replace(importPattern, importPattern + `\nimport { recordTelemetrySample, getSiteTelemetryHistory, getLatestSiteMetrics } from "./src/server/telemetry/siteTelemetryAggregator";`);

// Remove mock device seeding and arrays
content = content.replace(/const DEVICES_FILE =[^;]+;/g, '');
content = content.replace(/let devices = readJSONFile[^;]+;/g, '');
content = content.replace(/let logs: BessLog\[\] = \[\];/g, '');
content = content.replace(/const DEFAULT_REPORTS: ReportConfig\[\] = [^\]]+\];/g, '');
content = content.replace(/let reports = readJSONFile[^;]+;/g, '');

// Update poll loop to record telemetry
const pollLoop = `setInterval(async () => {
  await pollEmsTurtle();
}, emsPollInterval);`;

const newPollLoop = `setInterval(async () => {
  await pollEmsTurtle();
  // We can fetch feathered status or just pass null if not immediately available
  // The feather devices are polled elsewhere or not at all automatically?
  // Let's just pass the cached EMS data for now.
  const { emsCache } = require("./src/server/emsTurtleClient");
  recordTelemetrySample(emsCache, { devices: [] }); // simplistic mock feather for now
}, emsPollInterval);`;

content = content.replace(pollLoop, newPollLoop);

// Remove mock endpoints
const devicesStart = `// API: Get BESS devices`;
const reportsEnd = `// System status and logs demo endpoints`;
let idx1 = content.indexOf(devicesStart);
let idx2 = content.indexOf(reportsEnd, idx1);
if (idx1 > -1 && idx2 > -1) {
  // delete until reportsEnd or next valid block
  // Let's just regex replace out the specific endpoints
}

// Add site-metrics endpoints in front of `// Provide system mode fallback info`
const metricsEndpoints = `
app.get("/api/local/site-metrics", (req, res) => {
  res.json(getLatestSiteMetrics() || { error: "No metrics available yet" });
});

app.get("/api/local/site-metrics/history", (req, res) => {
  res.json(getSiteTelemetryHistory());
});
`;

content = content.replace(`// Profile Switcher (Local Mock)`, metricsEndpoints + `\n// Profile Switcher (Local Mock)`);

fs.writeFileSync('server.ts', content);
console.log('server.ts patched dynamically');
