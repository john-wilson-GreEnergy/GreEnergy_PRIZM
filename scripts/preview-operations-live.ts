// Local read-only review of the real application. No production server modules or device clients.
import express from 'express';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {createServer as createHttpServer} from 'node:http';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {assertReviewSite,reviewOrigin,reviewReadPath,trustedReviewRequest} from './operations-review-policy';
import {projectNotificationBpcs} from '../src/server/notifications/notificationBpcs';
import {projectSiteAnalytics} from '../src/server/analytics/siteAnalyticsProjection';
import {selectSnapshotIndex} from '../src/server/cells/snapshotIndex';
import {ss3IndexReadScript,shellQuote} from './analytics-preview-index';
import {OperatingChartsStore} from '../src/server/analytics/OperatingChartsStore';
import {FleetBroker} from '../src/server/fleet/FleetBroker';
import {buildSiteSummary} from '../src/server/fleet/siteSummary';
import {buildBlockPowerFlow} from '../src/server/fleet/blockPowerFlow';
import {readFile} from 'node:fs/promises';
import {hvacReviewFixture} from './hvac-review-fixture';
import {projectNotificationHvacs,auditNotificationGuidance,annotateNotificationNames} from '../src/server/notifications/hvacIssueReview';
import {CorrectiveGuidanceStore,createCorrectiveGuidanceRouter,applyCorrectiveGuidance} from '../src/server/notifications/correctiveGuidance';
const guidanceDrafts=new CorrectiveGuidanceStore('/private/tmp/prizm-corrective-guidance-preview.json');

const charts=new OperatingChartsStore();
const reviewSite={siteId:'ss3-review',blockId:'1',blockIndex:1,stationCode:'BHE0020',name:'Solar Star 3 · LOCAL READ-ONLY REVIEW'};
const fleet=new FleetBroker([reviewSite]);

const execute=promisify(execFile);
const pending=new Map<string,Promise<string>>();
const cache=new Map<string,{at:number;body:string}>();
let indexCache:{at:number;site:string;timestamps:number[]}|null=null;
let indexJob:Promise<void>|null=null;
async function readIndex(path:string){
  if(!indexCache||Date.now()-indexCache.at>30000){
    indexJob??=(async()=>{
      const {stdout}=await execute('ssh',['-i','/Users/johnwilson/.ssh/prizm_dell_fleet','-o','BatchMode=yes','-o','ConnectTimeout=5','-o','StrictHostKeyChecking=yes','ebc@10.0.0.15',`node --input-type=module -e ${shellQuote(ss3IndexReadScript)}`],{timeout:15000,maxBuffer:2*1024*1024,encoding:'utf8'});
      const result=JSON.parse(stdout);
      if(result.site!=='BHE0020 / Block 1'||!Array.isArray(result.timestamps)||result.timestamps.some((n:unknown)=>!Number.isSafeInteger(n)))throw Error('Invalid recorder index');
      indexCache={...result,at:Date.now()};
    })().finally(()=>{indexJob=null;});
    await indexJob;
  }
  const params=new URL(path,reviewOrigin).searchParams;
  return JSON.stringify(selectSnapshotIndex(indexCache!.timestamps,indexCache!.site,Object.fromEntries([...params].map(([k,v])=>[k,Number(v)]))));
}
async function readPublished(path:string):Promise<string>{
  if(reviewReadPath('GET',path)!==path)throw new Error('Read not permitted');
  if(path.split('?')[0]==='/api/local/site-data/cells/index')return readIndex(path);
  if(path==='/api/local/site-data/analytics'){
    const snapshot=JSON.parse(await readPublished('/api/local/site-data/snapshot?view=one-line'));
    return JSON.stringify({...projectSiteAnalytics(snapshot),operatingCharts:charts.view(snapshot)});
  }
  const cached=cache.get(path);
  if(cached&&Date.now()-cached.at<1000)return cached.body;
  if(pending.has(path))return pending.get(path)!;
  if(pending.size>=6)throw new Error('Local review is busy; retry on the next poll');
  const job=(async()=>{
    const {stdout}=await execute('ssh',['-i','/Users/johnwilson/.ssh/prizm_dell_fleet','-o','BatchMode=yes','-o','ConnectTimeout=5','-o','StrictHostKeyChecking=yes','ebc@10.0.0.15',
      `curl --fail --silent --show-error --max-time 8 'http://127.0.0.1:3000${path}'`],{timeout:9500,maxBuffer:64*1024*1024,encoding:'utf8'});
    const data=JSON.parse(stdout);
    if(path==='/api/local/site-data/block-summary')data.powerFlow=buildBlockPowerFlow(data);
    if(path.startsWith('/api/local/site-data/snapshot'))assertReviewSite(data);
    if(path==='/api/local/site-data/snapshot?view=one-line')charts.ingest(data);
    // Preview-only server projection of the existing published review; no additional acquisition.
    if(data.normalized?.notificationReview)data.normalized.notificationReview.bpcReview=projectNotificationBpcs(data.normalized.notificationReview,data.siteIdentity);
    for(const review of [data.normalized?.notificationReview,data.notificationReview])if(review){
      annotateNotificationNames(review);
      review.hvacReview=projectNotificationHvacs(review);
      Object.assign(review,applyCorrectiveGuidance(review,guidanceDrafts.read()));
      review.guidanceGaps=auditNotificationGuidance(review);
    }
    const body=JSON.stringify(data);
    // Bounded short-lived transport cache, never an offline fallback or extra poller.
    if(cache.size>=32)cache.delete(cache.keys().next().value!);
    cache.set(path,{at:Date.now(),body});
    return body;
  })().finally(()=>pending.delete(path));
  pending.set(path,job);return job;
}
assertReviewSite(JSON.parse(await readPublished('/api/local/site-data/snapshot?view=overview')));
const app=express();
app.disable('x-powered-by');
app.use((req,res,next)=>{
  if(!trustedReviewRequest(req.headers.host,req.headers.origin,req.headers['sec-fetch-site'] as string|undefined))return res.status(403).json({error:'Local same-origin review only.'});
  next();
});
app.use('/api/local/corrective-guidance',(req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'&&req.headers.origin!==reviewOrigin)return res.status(403).json({error:'Same-origin local draft request required'});
  res.locals.prizmGuidanceActor='Mac preview administrator (draft only)';
  if(req.method==='GET')return res.json({canEdit:true,localDraft:true,revision:guidanceDrafts.read().revision});
  res.once('finish',()=>{if(res.statusCode===200)cache.clear();});next();
},express.json({limit:'256kb'}),createCorrectiveGuidanceRouter(guidanceDrafts));
app.use('/api',async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  // Local preview routes are never forwarded to production; all writes remain denied.
  if(req.method==='GET'&&req.originalUrl==='/api/fleet/session')return res.json({email:'Local read-only SS3 review · no account session',csrf:'local-review-only',idleExpiresAt:Date.now()+86400000,simulated:false,localReview:true});
  if(req.method==='GET'&&req.originalUrl==='/api/fleet/summary'){
    try{
      const [snapshot,block,pcs]=await Promise.all(['/api/local/site-data/snapshot?view=one-line','/api/local/site-data/block-summary','/api/local/site-data/pcs'].map(async path=>JSON.parse(await readPublished(path))));
      assertReviewSite(block);
      fleet.accept(reviewSite.siteId,buildSiteSummary({...block,fleetDetailSnapshot:snapshot,fleetPcsView:pcs,operatingCharts:charts.view(snapshot)},{...reviewSite,profileId:snapshot.siteIdentity.activeProfileId,emsBaseUrl:snapshot.siteIdentity.emsBaseUrl}));
      return res.json(fleet.view(new Set([reviewSite.siteId])));
    }catch{return res.status(503).json({error:'Local read-only SS3 chart review is unavailable.'});}
  }
  const path=reviewReadPath(req.method,req.originalUrl);
  if(!path)return res.status(403).json({success:false,error:'Read-only local review: this action or endpoint is not enabled. No request was sent to the Dell.'});
  try{
    const body=await readPublished(path);
    const etag='"'+createHash('sha256').update(body).digest('hex')+'"';
    res.setHeader('ETag',etag);
    if(req.headers['if-none-match']===etag)return res.status(304).end();
    res.type('json').send(body);
  }catch{
    res.status(503).json({error:'Live Solar Star 3 data is unavailable. Check the Mac’s site connection. No synthetic fallback is used.'});
  }
});
const server=createHttpServer(app);
app.get('/review-hvac',async(_req,res,next)=>{
  try{res.type('html').send(hvacReviewFixture(await readFile(new URL('../src/components/hvacIssueDisclosure.css',import.meta.url),'utf8')));}
  catch(error){next(error);}
});
const vite=await createServer({configFile:false,plugins:[react(),tailwindcss()],server:{host:'127.0.0.1',middlewareMode:true,hmr:{server}},appType:'custom'});
app.use(vite.middlewares);
app.get('/fleet',async(_req,res,next)=>{
  try{res.type('html').send(await vite.transformIndexHtml('/fleet',`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRIZM Fleet · Local read-only SS3 review</title></head><body><div id="root"></div><script type="module" src="/src/fleet/main.tsx"></script></body></html>`));}catch(error){next(error);}
});
app.get('/',async(req,res,next)=>{
  if(!req.query.ui)return res.redirect('/?ui=operations&tab=corrective-actions');
  try{res.type('html').send(await vite.transformIndexHtml('/',`<!doctype html><html data-prizm-local-review="read-only"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRIZM · Live local review · SS3</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`));}catch(error){next(error);}
});
server.listen(3205,'127.0.0.1',()=>console.log(`PRIZM live local review: ${reviewOrigin}/ · SS3 · read-only · Dell unchanged`));
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{server.closeAllConnections();server.close(()=>{void vite.close().then(()=>process.exit(0));});});
