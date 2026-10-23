// Loopback-only visual review; no authentication bypass, device clients, or production routes.
import express from 'express';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {buildNotificationReview,buildRotationStatusFindings} from '../src/server/notifications/notificationReview';
import {STACK750_FAULT_MATRIX} from '../src/server/correctiveActions/correctiveActionMatrix';

const at='2026-10-15T16:30:00Z';
const findings:unknown[]=[];
const balancing=STACK750_FAULT_MATRIX.find(entry=>entry.id==='bpc-not-balancing')!;
for(const [code,array,string,bpc,cells] of [
  ['2074',1,3,3,30],['2074',1,12,12,8],['2074',2,9,14,4],['2073',1,3,3,30],['2073',3,21,12,5],
  ['1001',2,6,4,2],['2008',2,16,7,3],['2008',4,22,11,2],['2003',1,8,null,1],['2003',3,18,null,1],['2005',4,5,9,3],
] as const)for(let cell=1;cell<=cells;cell++)findings.push({code,severity:code.startsWith('1')?'alarm':'warning',
  ...(code==='2073'||code==='2074'?{resolved:{matched:true,matrixEntryId:balancing.id,sourceLabel:`Existing PRIZM matrix · ${balancing.source.label}`,recommendedActions:balancing.recommendedActions,validationChecks:balancing.validationChecks,clearingCriteria:balancing.clearingCriteria},safetyNotes:['Design review only. Field work requires qualified personnel and the approved site safety procedure.']}:{}),
  affected:[{arrayIndex:array,stringIndex:string,batteryPackIndex:bpc,cellGroupIndex:bpc?cell:null,timestamp:at,label:`Array ${array} / String ${string}${bpc?` / BPC ${bpc} / Cell ${cell}`:''}`}],source:'Synthetic review fixture'});
findings.push({severity:'alarm',subsystem:'hvac',remediationStrategyId:'hvac-commanded-no-current',arrayNumber:4,evidence:{deviceIp:'10.0.4.10',energySegmentNumber:1,hvacUnit:2,commanded:true,currentA:0},source:'Synthetic review fixture'});
findings.push({code:'UNMAPPED-DEMO',title:'Unclassified equipment notification',severity:'unknown',arrayNumber:3,stringNumber:8,source:'Synthetic review fixture'});
findings.push({remediationStrategyId:'contactor-requested-closed-actual-open',subsystem:'contactor',arrayNumber:2,stringNumber:7,severity:'alarm',title:'String requested closed but contactors are open',evidence:{requestedState:'closed',actualState:'open'},source:'Synthetic review fixture'});
findings.push(...buildRotationStatusFindings([{arrayNumber:1,stringNumber:4,rotationStatus:'OUT',timestampUtc:at},{arrayNumber:3,stringNumber:11,rotationStatus:'OUT',timestampUtc:at}],[{arrayNumber:4,pcsIndex:1,rotationStatus:'OUT'}]));
const strings=[{arrayNumber:1,stringNumber:8},{arrayNumber:3,stringNumber:18},{arrayNumber:2,stringNumber:6},{arrayNumber:2,stringNumber:16},{arrayNumber:4,stringNumber:22}].map((location,index)=>({...location,measuredVoltageVdc:1460+index,minCellVoltageMv:3420+index,maxCellVoltageMv:3495+index,sourceTimestampUtc:at,metricSource:'Synthetic telemetry'}));
const review=buildNotificationReview(findings,at,{strings,blockIndex:1});
review.sourceNotes=['Synthetic design-review fixture. No live site values or equipment connections. All counts and target consolidation use the existing server projection.'];
const app=express();
app.get('/preview/notification-review',(_req,res)=>res.json(review));
// Never proxy requests to the actual utility or equipment from this review server.
app.use('/api',(_req,res)=>res.status(404).json({error:'Live APIs are not available in the design preview.'}));
const vite=await createServer({configFile:false,plugins:[react(),tailwindcss()],server:{host:'127.0.0.1',middlewareMode:true,hmr:false},appType:'custom'});
app.use(vite.middlewares);
app.get('/',async(_req,res,next)=>{try{res.type('html').send(await vite.transformIndexHtml('/',`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRIZM · Operations design review</title></head><body><div id="root"></div><script type="module" src="/src/workspaces/OperationsPreview.tsx"></script></body></html>`));}catch(error){next(error);}});
const server=app.listen(3204,'127.0.0.1',()=>console.log('PRIZM UI review: http://127.0.0.1:3204/ · synthetic data only'));
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{server.closeAllConnections();server.close(()=>{void vite.close().then(()=>process.exit(0));});});
