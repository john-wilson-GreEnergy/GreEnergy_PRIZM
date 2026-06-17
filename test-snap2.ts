async function run() {
  const res = await fetch("http://localhost:3000/api/local/snapshot");
  const data = await res.json();
  console.log(data.normalized.arrays.length);
  if (data.normalized.arrays.length > 0) {
      console.log(data.normalized.arrays[0]);
  }
}
run();
