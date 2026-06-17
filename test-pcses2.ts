async function run() {
  const res = await fetch("http://localhost:3000/api/local/snapshot/pcses");
  const data = await res.json();
  console.log(Object.keys(data));
  console.log(data);
}
run();
