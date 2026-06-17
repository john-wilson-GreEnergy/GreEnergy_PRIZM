async function run() {
  const res = await fetch("http://localhost:3000/api/local/pcs/dashboard");
  const data = await res.json();
  console.log(data.length);
  if (data.length > 0) {
      console.log(data[0]);
  }
}
run();
