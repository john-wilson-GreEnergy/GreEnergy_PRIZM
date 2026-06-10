import { spawn } from 'child_process';
import http from 'http';

const serverProc = spawn('node', ['dist/server.cjs'], { stdio: 'inherit' });

let timeout;
function cleanup(code) {
  clearTimeout(timeout);
  serverProc.kill('SIGTERM');
  process.exit(code);
}

timeout = setTimeout(() => {
  console.error("Timeout waiting for server to start");
  cleanup(1);
}, 10000);

function ping() {
  http.get('http://127.0.0.1:3000/api/local/mode', (res) => {
    if (res.statusCode === 200) {
      console.log("Server responded with 200 OK!");
      cleanup(0);
    } else {
      setTimeout(ping, 500);
    }
  }).on('error', () => {
    setTimeout(ping, 500);
  });
}

setTimeout(ping, 1000);
