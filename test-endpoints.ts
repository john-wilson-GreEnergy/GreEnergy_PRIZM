async function run() {
  const urls = [
    '/api/local/status',
    '/api/local/system/boot-status',
    '/api/local/debug/sources',
    '/api/local/snapshot/topology',
    '/api/local/snapshot',
    '/api/local/strings/dashboard',
    '/api/local/site-operations/summary',
    '/api/local/feather/devices',
    '/api/local/ems/connection-status',
    '/api/local/diagnostic-session/status',
    '/api/local/pcs/dashboard'
  ];
  for (const url of urls) {
    try {
      const res = await fetch(`http://localhost:3000${url}`);
      const text = await res.text();
      console.log(`\n--- ${url} ---`);
      console.log(`Status: ${res.status}`);
      if (text.startsWith('<!doctype')) {
        console.log(`Returned HTML! (length: ${text.length})`);
      } else {
        console.log(`Returned JSON/Text (length: ${text.length})`);
      }
    } catch (err) {
      console.log(`Fetch error for ${url}:`, err.message);
    }
  }
}
run();
