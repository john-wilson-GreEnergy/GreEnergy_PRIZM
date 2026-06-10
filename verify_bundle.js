import { spawn } from 'child_process';
import http from 'http';

const serverProc = spawn('node', ['start-production.cjs'], { stdio: 'inherit', env: { ...process.env, PORT: '3001' } });

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
  http.get('http://127.0.0.1:3001/', (res) => {
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
      
      const cssUrl = cssPath.startsWith('http') ? cssPath : 'http://127.0.0.1:3001' + (cssPath.startsWith('/') ? cssPath : '/' + cssPath);

      http.get(cssUrl, (cssRes) => {
         if (cssRes.statusCode !== 200) {
            console.error("CSS asset returned " + cssRes.statusCode);
            cleanup(1);
         } else if (!cssRes.headers['content-type']?.includes('text/css')) {
            console.error("CSS asset Content-Type is not text/css, got: " + cssRes.headers['content-type']);
            cleanup(1);
         } else {
            console.log("CSS verified, checking /api/local/safety-fault-clear/candidates...");
            http.get('http://127.0.0.1:3001/api/local/safety-fault-clear/candidates', (safRes) => {
               if (safRes.statusCode !== 200) {
                 console.error("Safety candidates returned " + safRes.statusCode);
                 cleanup(1);
                 return;
               }
               if (!safRes.headers['content-type']?.includes('application/json')) {
                 console.error("Safety candidates Content-Type is not application/json");
                 cleanup(1);
                 return;
               }
               let safBody = '';
               safRes.on('data', chunk => safBody += chunk);
               safRes.on('end', () => {
                 if (safBody.includes('<!doctype html>')) {
                   console.error("Safety candidates returned HTML");
                   cleanup(1);
                   return;
                 }
                 try {
                   const safJson = JSON.parse(safBody);
                   if (!safJson.eligible && !safJson.notEligible && !safJson.error) {
                     console.error("Safety candidates body invalid format");
                     cleanup(1);
                     return;
                   }
                 } catch (err) {
                   console.error("Safety candidates invalid JSON");
                   cleanup(1);
                   return;
                 }
                 
                 console.log("Checking /api/local/strings/dashboard...");
                 http.get('http://127.0.0.1:3001/api/local/strings/dashboard', (strRes) => {
                     if (strRes.statusCode !== 200 && strRes.statusCode !== 500 && strRes.statusCode !== 400) {
                         console.error("Strings dashboard returned " + strRes.statusCode);
                         cleanup(1);
                         return;
                     }
                     if (!strRes.headers['content-type']?.includes('application/json')) {
                         console.error("Strings dashboard Content-Type is not application/json");
                         cleanup(1);
                         return;
                     }
                     let strBody = '';
                     strRes.on('data', chunk => strBody += chunk);
                     strRes.on('end', () => {
                         if (strBody.includes('<!doctype html>')) {
                            console.error("Strings dashboard returned HTML");
                            cleanup(1);
                            return;
                         }
                         try {
                           JSON.parse(strBody);
                         } catch (err) {
                           console.error("Strings dashboard invalid JSON");
                           cleanup(1);
                           return;
                         }
                         console.log("Server verification passed!");
                         cleanup(0);
                     });
                 }).on('error', () => cleanup(1));
               });
            }).on('error', () => cleanup(1));
         }
      });
    });
  }).on('error', () => {
    setTimeout(ping, 500);
  });
}

setTimeout(ping, 1000);
