// Explicit LAN opt-in. Serves a mobile-only production build, never Vite/source files.
import express from 'express';
import {createServer as httpsServer} from 'node:https';
import {createServer as httpServer} from 'node:http';
import {X509Certificate} from 'node:crypto';
import {isIP} from 'node:net';
import {networkInterfaces} from 'node:os';
import {mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {mobilePreviewApi} from './mobile-preview-proxy';
const [ip,tlsDir]=process.argv.slice(2);
if(isIP(ip)!==4||!Object.values(networkInterfaces()).flat().some(v=>v?.address===ip)||!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip))throw Error('An assigned private LAN IP is required');
if(!tlsDir||!path.isAbsolute(tlsDir))throw Error('Absolute temporary TLS directory required');
const cert=await readFile(path.join(tlsDir,'server.pem')),key=await readFile(path.join(tlsDir,'server.key'));
const certificate=new X509Certificate(cert);if(!certificate.checkIP(ip)||Date.parse(certificate.validTo)<Date.now())throw Error('Certificate does not match the local IP or has expired');
const ca=await readFile(path.join(tlsDir,'prizm-phone-ca.cer')),fingerprint=new X509Certificate(ca).fingerprint256;
const outDir=await mkdtemp('/private/tmp/prizm-phone-build-');
await build({configFile:false,plugins:[react()],publicDir:false,build:{outDir,emptyOutDir:true,sourcemap:false,rollupOptions:{input:path.resolve('mobile.html')}}});
const origin=`https://${ip}:3207`,app=mobilePreviewApi(undefined,{origin});
app.use((_req,res,next)=>{res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");next();});
app.get('/',(_req,res)=>res.sendFile(path.join(outDir,'mobile.html')));
app.get('/mobile.webmanifest',(_req,res)=>res.json({name:'GreEnergy PRIZM Mobile',short_name:'PRIZM',start_url:'/',scope:'/',display:'standalone',theme_color:'#123c32',background_color:'#f5f7f5'}));
app.use('/assets',(req,res,next)=>{if(!/^\/[A-Za-z0-9_.-]+\.(js|css|woff2?|svg|png)$/.test(req.path))return res.status(404).end();next();},express.static(path.join(outDir,'assets'),{dotfiles:'deny',index:false,redirect:false}));
app.use((_req,res)=>res.status(404).end());
const server=httpsServer({cert,key,minVersion:'TLSv1.2'},app);
// Bootstrap distributes only the public certificate. No credentials, API, assets or proxy.
const onboarding=httpServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'||req.headers.host!==`${ip}:3208`){res.writeHead(403).end();return;}
 if(req.url==='/prizm-phone-ca.cer'){res.writeHead(200,{'Content-Type':'application/pkix-cert','Content-Disposition':'attachment; filename="prizm-phone-ca.cer"'}).end(ca);return;}
 if(req.url!=='/'){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"}).end(`<!doctype html><meta name="viewport" content="width=device-width"><title>PRIZM iPhone setup</title><main style="font:17px system-ui;max-width:620px;margin:30px auto;padding:20px"><h1>PRIZM local iPhone preview</h1><p>This page only distributes the temporary public certificate. Never enter a password on an HTTP page.</p><ol><li><a href="/prizm-phone-ca.cer">Download the preview certificate</a> and allow the profile download.</li><li>Open Settings → Profile Downloaded (or General → VPN &amp; Device Management). Verify the name <b>PRIZM Temporary Phone Preview CA</b>, then install.</li><li>Settings → General → About → Certificate Trust Settings: enable full trust for that preview CA.</li><li>Open <a href="${origin}">${origin}</a> in Safari, then sign in with your Fleet account.</li></ol><p>Compare this SHA-256 fingerprint with the one supplied on your Mac before trusting:</p><code style="overflow-wrap:anywhere">${fingerprint}</code><p>Valid for seven days. Remove the temporary profile after testing. Mac must remain awake and connected. No remote access or equipment controls.</p></main>`);
});
server.listen(3207,ip,()=>console.log('Phone preview '+origin));
onboarding.listen(3208,ip,()=>console.log(`Public-certificate setup http://${ip}:3208/ · SHA-256 ${fingerprint}`));
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{server.closeAllConnections();onboarding.closeAllConnections();server.close();onboarding.close();});
