import fetch from "node-fetch";

async function run() {
    const res = await fetch("http://localhost:3000/api/local/strings/dashboard?array=ALL&enrich=none&maxAgeMs=15000");
    const data = await res.json();
    console.log(JSON.stringify(Object.keys(data), null, 2));
    if (data.rollups) {
        console.log(JSON.stringify(data.rollups, null, 2));
    }
}
run();
