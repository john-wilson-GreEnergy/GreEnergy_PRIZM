/** Local visual acceptance only. Uses the existing SS3 read-only preview's
 * published data; no production configuration, accounts or equipment writes. */
import express from 'express';
import path from 'node:path';
import {createWorkspaceUi} from '../src/server/fleet/workspaceUi';
import {remoteDesktopRead} from '../src/server/fleet/remoteDesktop';
const origin='http://127.0.0.1:3211',prefix='/desktop/ss3-review',app=express();
const ui=createWorkspaceUi(path.resolve('dist'));
const baseline=await fetch('http://127.0.0.1:3205/api/local/site-data/block-summary',{signal:AbortSignal.timeout(10000)});
if(!baseline.ok)throw Error('Existing local read-only data preview unavailable');
const block=await baseline.json();
if(block.siteIdentity?.stationCode!=='BHE0020'||block.siteIdentity?.blockIndex!==1)throw Error('Unexpected preview site');
app.disable('x-powered-by');app.set('strict routing',true);app.set('case sensitive routing',true);
app.use((req,res,next)=>{
  if(req.headers.host!=='127.0.0.1:3211'||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']&&!['same-origin','none'].includes(String(req.headers['sec-fetch-site'])))return res.sendStatus(403);
  res.set({'Cache-Control':'no-store','X-Prizm-UI-Release':ui.releaseId,'X-Content-Type-Options':'nosniff'});next();
});
app.get('/',(_req,res)=>res.redirect(prefix+'/?tab=arrays-strings'));
app.get('/fleet/',(_req,res)=>res.redirect(prefix+'/?tab=overview'));
app.get(prefix+'/api/fleet/workspace-context',(_req,res)=>res.json({siteId:'ss3-review',siteName:'Solar Star 3 · LOCAL UNIFIED UI REVIEW',stationCode:'BHE0020',blockIndex:1,fleetUrl:origin+'/fleet/',email:'Local read-only review',csrf:'x'.repeat(43),fullControl:false,remoteReadOnly:true,uiRelease:ui.releaseId}));
app.post(prefix+'/api/fleet/workspace-touch',(req,res)=>{
  if(req.headers.origin!==origin)return res.sendStatus(403);
  res.json({active:true,readOnly:true});
});
app.use(prefix+'/api',(req,res)=>{void(async()=>{
  const safe=remoteDesktopRead(req.method,'/api'+req.url);
  if(!safe){res.sendStatus(403);return;}
  // This preview verifies UI/live read compatibility, not transport performance.
  // The existing preview is JSON-only; never buffer a live event stream.
  if(safe.startsWith('/api/local/site-data/strings-stream')){res.status(503).json({error:'Live stream benchmarking is not enabled in this visual preview'});return;}
  const upstream=await fetch('http://127.0.0.1:3205'+safe,{signal:AbortSignal.timeout(15000)});
  res.status(upstream.status).type(upstream.headers.get('content-type')??'application/json').send(Buffer.from(await upstream.arrayBuffer()));
})().catch(()=>res.status(503).json({error:'Existing local read-only data preview unavailable; no fallback values used'}));});
app.get(prefix+'/',(_req,res)=>{ui.send('/',res);});
app.use((req,res)=>{if(req.method==='GET'&&req.url===req.path&&ui.send(req.path,res))return;res.sendStatus(403);});
const server=app.listen(3211,'127.0.0.1',()=>console.log(origin+prefix+'/?tab=arrays-strings\nRead-only live SS3 visual review; Dell unchanged. UI '+ui.releaseId));
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
