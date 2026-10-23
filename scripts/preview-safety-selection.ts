/** Synthetic loopback preview. No collector imports, proxies, or equipment transport. */
import express from 'express';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const app = express();
app.use(express.json());
app.post('/api/local/safety-fault-clear/execute', (req,res) => {
  if (req.body.profileId !== 'synthetic-safety-preview') return res.status(403).json({error:'Synthetic profile only'});
  if (!['fixture-door','fixture-hydrogen'].includes(req.body.entityKeyToken)) return res.status(400).json({error:'Unknown fixture target'});
  return res.json({queued:true,verification:{appearsCleared:false},simulation:true});
});
app.use('/api', (_req,res) => res.status(403).json({error:'Only synthetic preview actions are available'}));
const vite = await createServer({configFile:false,plugins:[react(),tailwindcss()],server:{host:'127.0.0.1',middlewareMode:true,hmr:false},appType:'custom'});
app.use(vite.middlewares);
app.get('/', async (_req,res,next) => {
  try {res.type('html').send(await vite.transformIndexHtml('/', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRIZM safety selection — simulation</title></head><body><div id="root"></div><script type="module" src="/src/workspaces/SafetySelectionPreview.tsx"></script></body></html>'));} catch(error) {next(error);}
});
const server = app.listen(3218,'127.0.0.1',()=>console.log('Synthetic safety preview: http://127.0.0.1:3218/ — no equipment connected'));
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,()=>{server.closeAllConnections();server.close(()=>{void vite.close().then(()=>process.exit(0));});});
