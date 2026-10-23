/** Local-only captured-data review. Never imports equipment acquisition. */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createWorkspaceUi} from '../src/server/fleet/workspaceUi';
import {stringListContextRow} from '../src/server/telemetry/stringListContext';
import {prepareStringRows} from '../src/lib/prepareStringRows';
import {RowProjectionCache,samePublication} from '../src/lib/rowProjectionCache';
const capture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const port=Number(process.env.PRIZM_REPLAY_PORT||3212),origin=`http://127.0.0.1:${port}`,app=express(),ui=createWorkspaceUi(path.resolve(process.argv[3]||'dist'));
assert([3212,3213].includes(port));
const requestDelayMs=Number(process.env.PRIZM_REPLAY_REQUEST_DELAY_MS||0);
assert(Number.isInteger(requestDelayMs)&&requestDelayMs>=0&&requestDelayMs<=1000);
const startupDelayMs=Number(process.env.PRIZM_REPLAY_STARTUP_DELAY_MS||0);
assert(Number.isInteger(startupDelayMs)&&startupDelayMs>=0&&startupDelayMs<=8000);
const stats:Record<string,Record<string,number>>={};
app.disable('x-powered-by');
app.use((req,res,next)=>{
  if(req.headers.host!==`127.0.0.1:${port}` || req.headers.origin && req.headers.origin!==origin ||
    req.headers['sec-fetch-site'] && !['same-origin','none'].includes(String(req.headers['sec-fetch-site'])))return res.sendStatus(403);
  res.set('Cache-Control','no-store');
  if(requestDelayMs)setTimeout(next,requestDelayMs);else next();
});
for(const {site,snapshot,topology} of capture.sites){
 assert(['solar-star-3','solar-star-4'].includes(site));assert.equal(snapshot.normalized.strings.length,320);
 const rows=snapshot.normalized.strings;
 const context={...snapshot,stringContextOnly:true,normalized:{...snapshot.normalized,strings:rows.map(stringListContextRow)}};
 const cache=new RowProjectionCache(samePublication);
 const original=prepareStringRows(rows,rows,new Map(),cache);
 const reduced=prepareStringRows(context.normalized.strings,rows,new Map(),cache);
 assert.deepEqual(reduced,original);reduced.forEach((row,i)=>assert.equal(row,original[i]));
 const summarize=(s:unknown)=>({decoded:Buffer.byteLength(JSON.stringify(s)),wire:gzipSync(JSON.stringify(s),{level:1}).length});
 console.log(JSON.stringify({site,rows:rows.length,allRowFieldsEqual:true,unchangedRowsReused:reduced.length,full:summarize(snapshot),context:summarize(context),capturedAt:capture.capturedAt}));
 stats[site]={bootstrap:0,context:0,full:0,stream:0,events:0};
 const prefix='/desktop/'+site,epoch='captured-'+site;
 let version=0;
 const metadata={cycleId:snapshot.cycleId,summary:snapshot.rollups.stringSummary.summary,
  rollups:snapshot.rollups.stringSummary.rollups,buckets:snapshot.rollups.stringSummary.buckets,
  sourceHealth:snapshot.rollups.sourceHealth,durationMs:snapshot.debug.lastPollDurationMs};
 app.get(prefix+'/api/fleet/workspace-context',(_req,res)=>res.json({siteId:site,siteName:`${site} · CAPTURED REPLAY — NOT LIVE`,stationCode:snapshot.siteIdentity.stationCode,blockIndex:1,
  fleetUrl:origin+'/fleet/',email:'Local captured-data review',csrf:'x'.repeat(43),fullControl:false,remoteReadOnly:true,uiRelease:ui.releaseId}));
 app.post(prefix+'/api/fleet/workspace-touch',(req,res)=>req.headers.origin===origin?res.json({active:true,readOnly:true}):res.sendStatus(403));
 app.get(prefix+'/api/local/topology/active',(_req,res)=>res.json(topology));
 app.get(prefix+'/api/local/site-data/snapshot',(req,res)=>{
  const small=req.query.shape==='list-context';stats[site][small?'context':'full']++;
  res.json(small?context:snapshot);
 });
 app.get(prefix+'/api/local/site-data/strings-fast',(_req,res)=>{
  stats[site].bootstrap++;
  const timer=setTimeout(()=>res.json({...metadata,transportEpoch:epoch,brokerVersion:version,capturedAt:snapshot.liveStatus.lastUpdated,strings:rows}),startupDelayMs);
  res.once('close',()=>clearTimeout(timer));
 });
 app.get(prefix+'/api/local/site-data/strings-stream',(_req,res)=>{
  stats[site].stream++;res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform'});res.flushHeaders();
  res.write(`event: ready\ndata: ${JSON.stringify({transportEpoch:epoch,version,stringRefreshVersion:1})}\n\n`);
  const timer=setInterval(()=>{stats[site].events++;res.write(`event: strings\ndata: ${JSON.stringify({transportEpoch:epoch,version:++version,capturedAt:snapshot.liveStatus.lastUpdated,changes:[],metadata})}\n\n`);},2700);
  res.once('close',()=>clearInterval(timer));
 });
 app.get(prefix+'/',(_req,res)=>ui.send('/',res));
}
app.get('/benchmark-status',(_req,res)=>res.json({capturedAt:capture.capturedAt,stats}));
app.get('/fleet/',(_req,res)=>res.type('html').send('<h1>Captured data review — not live</h1>'+capture.sites.map((s:{site:string})=>`<p><a href="/desktop/${s.site}/?tab=arrays-strings">${s.site}</a></p>`).join('')));
app.use((req,res)=>{if(req.method==='GET'&&req.url===req.path&&ui.send(req.path,res))return;res.sendStatus(403);});
const server=app.listen(port,'127.0.0.1',()=>console.log(origin+'/fleet/ — captured data only; no Dell connection'));
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
