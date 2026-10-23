// Loopback-only synthetic UI fixture. No collectors, equipment clients or saved accounts.
import express from 'express';
import path from 'node:path';
import {FleetBroker} from '../src/server/fleet/FleetBroker';
import {buildFleetDetails} from '../src/server/fleet/detailProjection';
import {fleetDetailFixture} from '../src/server/fleet/fleetDetailFixture';
import {emptyMetrics} from '../src/core/fleet/model';
const site={siteId:'bpc-preview',blockId:'1',blockIndex:1,stationCode:'SIMULATED',name:'BPC review · SIMULATED'};
const broker=new FleetBroker([site]),app=express();
const update=()=>{
  const observedAt=new Date().toISOString(),fixture=fleetDetailFixture(site.stationCode,observedAt);
  const details=buildFleetDetails(fixture.view,fixture.snapshot);
  const cells=Array.from({length:30},(_,i)=>({id:`cell-${i+1}`,label:`Array 1 / String 2 / BPC 3 / Cell ${i+1}`,array:1,string:2,bpc:3,cell:i+1,pcs:null,segment:1,block:1}));
  details.issues.findings.push(...['Charge balancing fault','Discharge balancing fault'].map((title,i)=>({code:i===0?'2074':'2073',title,category:'battery' as const,severity:'warning' as const,targetCount:30,targets:[],targetRows:cells})));
  details.issues.findings.push({code:'2074',title:'Charge balancing fault',category:'battery',severity:'warning',targetCount:3,targets:[],targetRows:[{...cells[0],id:'second-bpc-3',array:2},{...cells[0],id:'bpc-12',bpc:12},{...cells[0],id:'bpc-14',bpc:14}]});
  details.issues.findings.push({code:'DEMO-3',title:'Cell temperature warning',category:'battery',severity:'warning',targetCount:1,targets:[],targetRows:[{...cells[0],id:'array-2',array:2}]});
  broker.accept(site.siteId,{...site,schema:'prizm-site-summary-v1',observedAt,stale:false,metrics:emptyMetrics(),details});
};
update();const timer=setInterval(update,4000);
app.get('/api/fleet/session',(_req,res)=>res.json({email:'synthetic@example.test',csrf:'preview-only',idleExpiresAt:Date.now()+3600000,simulated:true}));
app.get('/api/fleet/summary',(_req,res)=>res.json(broker.view(new Set([site.siteId]))));
app.get('/',(_req,res)=>res.sendFile(path.resolve('dist/fleet.html')));
app.use(express.static(path.resolve('dist'),{index:false}));
app.use((_req,res)=>res.status(403).json({error:'Synthetic read-only preview; no equipment connected'}));
const server=app.listen(3199,'127.0.0.1',()=>console.log('SIMULATED BPC preview http://127.0.0.1:3199'));
const stop=()=>{clearInterval(timer);server.closeAllConnections();server.close();};
process.once('SIGTERM',stop);process.once('SIGINT',stop);
