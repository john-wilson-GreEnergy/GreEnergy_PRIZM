/** Exact emitted panel and deployed styles, isolated from every equipment transport. */
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
const root=path.resolve(process.argv[2]),m=JSON.parse(fs.readFileSync(root+'/safety-selection-manifest.json'));
const css=[...new Set(['index.html','fleet.html','mobile.html'].flatMap(f=>[...fs.readFileSync(root+'/fleet/dist/'+f,'utf8').matchAll(/(?:\.\/|\/)assets\/([\w.-]+\.css)/g)].map(x=>x[1])))];
const script=`import {r as React,c as ReactDOM} from '/assets/${m.assets.client}';import Panel from '/assets/${m.assets.panel}';
const root=ReactDOM.createRoot(document.getElementById('root'));
const candidates=[{entityKeyToken:'fixture-door',displayKey:'ES3 door controller',statusMessage:'Battery door interlock latched — manual reset required',allowFaultReset:true,enabled:true,communicating:true,equipment:{array:'Array 2',segment:'ES3',controller:'Door interlock controller'}},{entityKeyToken:'fixture-offline',displayKey:'Collection segment controller',statusMessage:'Safety interlock latched; controller is offline',allowFaultReset:true,enabled:true,communicating:false,equipment:{array:'Array 1',segment:'Collection segment',controller:'Safety controller'}}];
const render=()=>root.render(React.createElement(Panel,{key:document.querySelector('select').value,candidates,profileId:'synthetic',stale:document.querySelector('select').value==='stale',readOnly:document.querySelector('select').value==='locked'}));document.querySelector('select').addEventListener('change',render);render();`;
const server=createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method==='POST'&&req.url==='/api/local/safety-fault-clear/execute'){let body='';req.on('data',b=>{body+=b;if(body.length>4096)req.destroy();});req.on('end',()=>{try{const v=JSON.parse(body);if(v.profileId!=='synthetic'||v.entityKeyToken!=='fixture-door')throw Error();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({queued:true,verification:{appearsCleared:false},simulation:true}));}catch{res.writeHead(400);res.end();}});return;}
 if(req.method!=='GET'){res.writeHead(403);res.end();return;}
 if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(script);return;}
 if(req.url==='/assets/'+m.assets.workspace){res.setHeader('Content-Type','text/javascript');res.end('export const r=()=>true;');return;}
 if(/^\/assets\/[\w.-]+\.(js|css)$/.test(req.url??'')&&fs.existsSync(root+'/fleet/dist'+req.url)){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(root+'/fleet/dist'+req.url));return;}
 if(req.url!=='/'){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Safety release — isolated verification</title>'+css.map(n=>'<link rel="stylesheet" href="/assets/'+n+'">').join('')+'<style>body{margin:28px;font:14px system-ui;background:#eef4fa;color:#122035}h1{font-size:24px;font-weight:700;margin:16px 0}.notice{padding:16px;background:#e6f1ff;border:1px solid #b4cce8;margin-bottom:16px}select{padding:8px;background:white;margin:12px}footer{padding:20px;background:white;border:1px solid #cbd5e1;margin-top:16px}</style><div class="notice">SIMULATION ONLY — exact deployment panel and existing styles. No equipment connected.</div><h1>Block summary · SS4 example</h1><label>Preview state <select><option value="normal">Normal</option><option value="stale">Stale data</option><option value="locked">Controls locked</option></select></label><div id="root"></div><footer>Notifications &amp; corrective actions</footer><script type="module" src="/fixture.js"></script>');
});server.listen(3218,'127.0.0.1',()=>console.log('Exact release simulation ready at http://127.0.0.1:3218/'));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.closeAllConnections();server.close();});
