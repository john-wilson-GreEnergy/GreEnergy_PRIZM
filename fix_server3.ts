import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// 1. Add imports to server.ts
content = content.replace(
  'import express from "express";',
  'import express from "express";\nimport { recordTelemetrySample, getSiteTelemetryHistory, getLatestSiteMetrics } from "./src/server/telemetry/siteTelemetryAggregator";'
);

// 2. Add polling
const pollFind = `setInterval(async () => {
  await pollEmsTurtle();
}, emsPollInterval);`;
const pollReplace = `setInterval(async () => {
  await pollEmsTurtle();
  const { emsCache } = await import("./src/server/emsTurtleClient.js");
  const { __featherCache } = await import("./src/server/featherClient.js");
  recordTelemetrySample(emsCache, __featherCache);
}, emsPollInterval);`;
content = content.replace(pollFind, pollReplace);

// 3. Add endpoints before "app.get('/api/local/status"
const metricsEndpoints = `
app.get("/api/local/site-metrics", (req, res) => {
  res.json(getLatestSiteMetrics() || { error: "No metrics available yet" });
});

app.get("/api/local/site-metrics/history", (req, res) => {
  res.json(getSiteTelemetryHistory());
});
`;
content = content.replace(
  'app.get("/api/local/status",',
  metricsEndpoints + '\napp.get("/api/local/status",'
);

fs.writeFileSync('server.ts', content);
console.log('server.ts patched');
