// Read-only local comparison: existing published views only, no refresh/control requests.
// Start a warm PRIZM runtime first. Writes measurements to stdout, never device payloads.
import {setTimeout as delay} from 'node:timers/promises';

const paths = ['/api/local/site-data/snapshot?view=pcs-dashboard', '/api/local/site-data/pcs'];
const samples = [];
for (let i = 0; i < 60; i++) {
  samples.push(...await Promise.all(paths.map(async path => {
    const start = performance.now();
    try {
      const response = await fetch('http://localhost:3000' + path, {signal: AbortSignal.timeout(10000)});
      const headersMs = performance.now() - start;
      const body = await response.arrayBuffer();
      return {path, status: response.status, headersMs, totalMs: performance.now() - start, bytes: body.byteLength};
    } catch (error) {
      return {path, error: error.message};
    }
  })));
  await delay(350);
}
const summary = paths.map(path => {
  const rows = samples.filter(row => row.path === path);
  const times = rows.filter(row => row.status === 200).map(row => row.totalMs).sort((a,b) => a-b);
  return {
    path, count: rows.length, failures: rows.filter(row => row.status !== 200).length,
    median: times[Math.ceil(times.length * .5)-1] ?? null,
    p95: times[Math.ceil(times.length * .95)-1] ?? null,
    max: times.at(-1) ?? null, over500ms: times.filter(ms => ms > 500).length,
  };
});
console.log(JSON.stringify({measuredAt: new Date().toISOString(), summary, samples}, null, 2));
if (summary.some(row => row.failures)) process.exitCode = 1;
