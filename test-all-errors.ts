async function run() {
  const urls = [
    '/api/local/topology/profile',
    '/api/local/topology/resolved-devices',
    '/api/local/topology/validation',
    '/api/local/strings',
    '/api/feather/devices?cache=cache-first&maxAgeMs=60000',
    '/api/feather/devices?refresh=true',
    '/api/local/controller-statistics',
    '/api/local/status-codes',
    '/api/local/ip-map',
    '/api/local/string-ip-map',
    '/api/local/last-call',
    '/api/local/modbus-map',
    '/api/local/capabilities',
    '/api/local/cache/status',
    '/api/local/history/events?range=24h',
    '/api/local/pcs/dashboard',
    '/api/local/system/boot-status',
    '/api/local/ems/connection-status',
    '/api/local/cache/policy',
    '/api/local/modbus/profile/active',
    '/api/local/modbus/discovery/status',
    '/api/local/telemetry/snapshot',
    '/api/local/cache/history/status',
    '/api/local/storage/status',
    '/api/local/storage/policy',
    '/api/settings/profiles',
    '/api/settings/active-profile',
    '/api/local/diagnostic-session/status',
    '/api/local/reports/catalog',
    '/api/local/reports/recent',
    '/api/local/strings/dashboard?array=ALL&enrich=none&maxAgeMs=10000',
    '/api/local/status',
    '/api/local/debug/sources',
    '/api/local/snapshot/topology',
    '/api/local/snapshot',
    '/api/local/strings/dashboard',
    '/api/local/site-operations/summary',
    '/api/local/feather/devices'
  ];
  
  for (const url of urls) {
    try {
      const res = await fetch(`http://localhost:3000${url}`);
      const text = await res.text();
      if (!res.ok) {
          console.log(`\n❌ ERROR STATUS ${res.status} FOR: ${url}`);
          console.log(`Preview: ${text.slice(0, 100)}`);
      }
    } catch (e) {
      console.log(`\n🔥 FETCH FAILED FOR: ${url} - ${e.message}`);
    }
  }
}
run();
