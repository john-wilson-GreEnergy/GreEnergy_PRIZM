import { spawn } from 'child_process';
import http from 'http';

const serverProc = spawn('node', ['start-production.cjs'], { stdio: 'inherit' });

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
  http.get('http://127.0.0.1:3000/', (res) => {
    if (res.statusCode !== 200) {
      console.error("GET / returned " + res.statusCode);
      cleanup(1);
      return;
    }
    
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      if (body.includes('/@vite/client')) {
        console.error("Contains /@vite/client");
        cleanup(1);
        return;
      }
      if (body.includes('/src/main.tsx')) {
        console.error("Contains /src/main.tsx");
        cleanup(1);
        return;
      }
      
      const cssMatch = body.match(/href="([^"]*\/assets\/[^"]+\.css)"/);
      const cssPath = cssMatch?.[1];

      if (!cssPath) {
         console.error("No css asset found");
         cleanup(1);
         return;
      }
      
      const cssUrl = cssPath.startsWith('http') ? cssPath : 'http://127.0.0.1:3000' + (cssPath.startsWith('/') ? cssPath : '/' + cssPath);

      http.get(cssUrl, (cssRes) => {
         if (cssRes.statusCode !== 200) {
            console.error("CSS asset returned " + cssRes.statusCode);
            cleanup(1);
         } else if (!cssRes.headers['content-type']?.includes('text/css')) {
            console.error("CSS asset Content-Type is not text/css, got: " + cssRes.headers['content-type']);
            cleanup(1);
         } else {
            console.log("Server verification passed!");
            cleanup(0);
         }
      });
    });
  }).on('error', () => {
    setTimeout(ping, 500);
  });
}

setTimeout(ping, 1000);
