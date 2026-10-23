/** Loopback-only browser QA; existing read-only SS3 preview is the sole upstream. */
import express from 'express';
import path from 'node:path';
import {remoteDesktopRead} from '../src/server/fleet/remoteDesktop';
const app=express(),origin='http://127.0.0.1:3207',prefix='/desktop/ss3-review';
app.use((req,res,next)=>{if(req.headers.host!=='127.0.0.1:3207'||req.headers.origin&&req.headers.origin!==origin)return res.sendStatus(403);next();});
app.get(prefix+'/api/fleet/workspace-context',(_req,res)=>res.json({siteId:'ss3-review',siteName:'Solar Star 3 · LOCAL REMOTE-VIEW REVIEW',stationCode:'BHE0020',blockIndex:1,fleetUrl:origin+'/mobile/',email:'Local read-only review',csrf:'x'.repeat(43),fullControl:false,remoteReadOnly:true}));
app.post(prefix+'/api/fleet/workspace-touch',(_req,res)=>res.json({active:true}));
app.use(prefix+'/api',(req,res)=>{void(async()=>{
 const safe=remoteDesktopRead(req.method,'/api'+req.url);if(!safe){res.sendStatus(403);return;}
 const response=await fetch('http://127.0.0.1:3205'+safe,{signal:AbortSignal.timeout(15000)});
 res.status(response.status).type(response.headers.get('content-type')??'application/json').send(Buffer.from(await response.arrayBuffer()));
 })().catch(()=>res.status(503).json({error:'Existing read-only preview unavailable'}));});
app.get(prefix+'/',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));
app.use('/assets',express.static(path.resolve('dist/assets'),{index:false}));
app.get('/logo-transparent.svg',(_req,res)=>res.sendFile(path.resolve('dist/logo-transparent.svg')));
app.use((_req,res)=>res.sendStatus(403));
app.listen(3207,'127.0.0.1',()=>console.log(origin+prefix+'/?tab=overview'));
