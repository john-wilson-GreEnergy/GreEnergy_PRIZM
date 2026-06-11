import fetch from "node-fetch";

async function run() {
  const urls = [
    "http://localhost:3000/api/local/cache/status",
    "http://localhost:3000/api/local/strings/dashboard?array=ALL&enrich=none&maxAgeMs=15000",
    "http://localhost:3000/api/feather/devices?refresh=true",
    "http://localhost:3000/api/local/safety-fault-clear/candidates",
    "http://localhost:3000/api/local/overview/discovery",
    "http://localhost:3000/api/local/history/events?range=24h"
  ];
  for (const u of urls) {
      console.log("----");
      console.log("URL:", u);
      try {
        const res = await fetch(u);
        const text = await res.text();
        console.log(text.substring(0, 500));
      } catch (err) {
        console.log("ERROR:", err.message);
      }
  }
}
run();
