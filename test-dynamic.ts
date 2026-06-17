async function run() {
  const urls = [
    '/api/local/strings/1/1/detail',
    '/api/local/diagnostic-session/123/summary'
  ];
  for (const url of urls) {
    try {
      const res = await fetch(`http://localhost:3000${url}`);
      const text = await res.text();
      if (text.startsWith('<!doctype')) {
        console.log(`\n❌ HTML RETURNED FOR: ${url}`);
      } else {
        console.log(`\n✅ JSON RETURNED FOR: ${url}`);
      }
    } catch (e) {}
  }
}
run();
