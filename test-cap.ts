async function run() {
  const url = 'http://localhost:3000/api/local/capabilities';
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Text preview: ${text.slice(0, 50)}`);
  } catch (e) {
    console.log(e);
  }
}
run();
