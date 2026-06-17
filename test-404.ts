async function run() {
  const fetches = [
    '/api/feather/devices?cache=cache-first&maxAgeMs=60000',
    '/api/feather/discover',
    '/api/feather/devices?refresh=true',
    '/api/feather/clear-cache',
    '/api/feather/scan',
    '/api/local/ip-map',
    '/api/local/string-ip-map',
    '/api/local/modbus-map',
    '/api/local/demo-toggle',
    '/api/upload-modbus-map',
    '/api/upload-ip-map',
    '/api/upload-string-ip-map',
    '/api/local/safety-fault-clear/candidates',
    '/api/local/safety-fault-clear/execute',
    '/api/local/capabilities',
    '/api/local/cache/status',
    '/api/local/history/events?range=24h',
    '/api/local/pcs/dashboard',
    '/api/local/pcs/rotation',
    '/api/local/strings/rotation',
    '/api/local/balancing/preflight',
    '/api/local/balancing/execute',
    '/api/local/reports/recent',
    '/api/local/reports/generate',
    '/api/local/reports/cleanup',
    '/api/local/status',
    '/api/local/system/boot-status',
    '/api/local/debug/sources',
    '/api/local/snapshot/topology',
    '/api/local/snapshot',
    '/api/local/strings/dashboard',
    '/api/local/site-operations/summary',
    '/api/local/feather/devices'
  ];

  for (const f of fetches) {
    const res = await fetch(`http://localhost:3000${f}`);
    const text = await res.text();
    if (text.startsWith('<!doc') || text.startsWith('<!DOC')) {
      console.log(`404 Fallback for ${f}`);
    }
  }
}
run();
