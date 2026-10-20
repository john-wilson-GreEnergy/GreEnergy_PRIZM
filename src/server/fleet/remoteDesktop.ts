import express from 'express';
import path from 'node:path';
import type {FleetBroker} from './FleetBroker';
import {allowedSiteIds} from './fleetApp';
import {AccessError,LocalSessions} from '../security/localSessions';
import {mobileSessionToken,type MobileOptions} from './mobileApp';
import type {Collector} from './CollectorPoller';
import type {WorkspaceForward} from './workspaceGateway';
import {reviewReadPath} from '../../../scripts/operations-review-policy';

export interface RemoteDesktopSite {collector:Collector;forward:WorkspaceForward}
/** Exact canonical read allowlist. No raw device URLs, general proxy, uploads or
 * control endpoints. GET is not assumed safe merely because it is GET. */
export function remoteDesktopRead(method:string,raw:string){
 if(raw.length>4096)return null;
 const basic=reviewReadPath(method,raw);if(basic)return basic;
 if(method==='GET'&&raw==='/api/settings/site-health-visual-thresholds')return raw;
 if(method!=='GET'||!raw.startsWith('/api/local/')||/[\\#]/.test(raw))return null;
 const u=new URL(raw,'https://read.invalid');
 if(u.pathname!==raw.split('?')[0]||/[%]|\/\//.test(u.pathname))return null;
 if(/^\/api\/local\/site-data\/(strings-canonical|notifications\/string)\/[1-8]\/([1-9]|[1-3][0-9]|40)$/.test(u.pathname)&&!u.search)return u.pathname;
 const rules:Record<string,Record<string,RegExp>>={
  '/api/local/site-data/strings-stream':{shape:/^list$/},
  '/api/local/site-distribution/strings':{},
  '/api/local/site-health/graph':Object.fromEntries(['lowVolt','lowAlarmVolt','warningVolt','alarmVolt','lowTemp','lowAlarmTemp','warningTemp','alarmTemp'].map(k=>[k,/^-?\d{1,5}(\.\d{1,3})?$/])),
  '/api/local/site-data/operational-timeline':{},
  '/api/local/site-data/operational-timeline/review':{array:/^[1-8]$/,hours:/^(1|6|12|24|48|72|168)$/,string:/^([1-9]|[1-3][0-9]|40)$/},
 };
 const rule=rules[u.pathname];if(!rule)return null;
 for(const [k,v] of u.searchParams)if(!rule[k]?.test(v)||u.searchParams.getAll(k).length!==1)return null;
 return u.pathname+(u.searchParams.size?'?'+u.searchParams.toString():'');
}
export function createRemoteDesktop(broker:FleetBroker,sessions:LocalSessions,options:MobileOptions,sites:RemoteDesktopSite[]){
 const app=express();app.set('case sensitive routing',true);app.set('strict routing',true);
 app.use((req,res)=>{void(async()=>{
  const match=/^\/([A-Za-z0-9_-]{1,80})(\/.*)$/.exec(req.url);
  if(!match)throw new AccessError(403,'Unknown site workspace');
  const site=sites.find(s=>s.collector.siteId===match[1]);if(!site)throw new AccessError(403,'Unknown site workspace');
  const raw=match[2],token=mobileSessionToken(req);
  const recheck=async()=>{
   const auth=await sessions.authenticate(token,false);
   const email=options.remoteIdentity?await options.remoteIdentity(req):auth.email;
   const account=(await options.accounts()).find(a=>a.email===email);
   if(!account||account.disabled||!account.remoteAccess||auth.email!==email||!allowedSiteIds(broker,auth.principal).has(site.collector.siteId))throw new AccessError(403,'This site is not assigned to your remote account');
   return auth;
  };
  const auth=await recheck();
  if(req.method==='GET'&&/^\/(?:\?[^#]*)?$/.test(raw)){
   const query=new URL(raw,options.origin).searchParams;
   for(const [key,value] of query)if(!['tab','ui','healthView','array','targetSite','targetarray','targetstring','targetbpc','returnTo'].includes(key)||(key==='targetSite'?value.length>512||/[<>\x00-\x1f]/.test(value):!/^[-a-z0-9]{1,64}$/i.test(value))||query.getAll(key).length!==1)throw new AccessError(403,'Invalid view');
   await options.audit({action:'remote.workspace.open',outcome:'authorized',subject:auth.principal.subject});
   res.sendFile(path.resolve(options.publicDirectory,'index.html'));return;
  }
  if(raw==='/api/fleet/workspace-context'&&req.method==='GET'){
   const c=site.collector;res.json({siteId:c.siteId,siteName:c.name,stationCode:c.stationCode,blockIndex:c.blockIndex,fleetUrl:options.origin+(options.adaptiveExperience?'/fleet/':'/mobile/'),email:auth.email,csrf:auth.csrf,fullControl:false,remoteReadOnly:true});return;
  }
  if(raw==='/api/fleet/workspace-touch'&&req.method==='POST'){
   sessions.checkCsrf(auth.csrf,req.headers['x-prizm-csrf']);await sessions.authenticate(token,true);res.json({active:true,readOnly:true});return;
  }
  const safe=remoteDesktopRead(req.method,raw);
  if(!safe||Number(req.headers['content-length']??0)!==0||req.headers['transfer-encoding'])throw new AccessError(403,'Remote workspace is read-only; this request was not dispatched');
  req.url=safe;await recheck();await site.forward(req,res,async()=>{await recheck();});
 })().catch(e=>{
  if(res.headersSent){res.destroy();return;}
  if(e instanceof AccessError&&e.status===401&&req.method==='GET'&&/^\/[^/]+\/($|\?)/.test(req.url)){res.redirect(303,options.adaptiveExperience?'/fleet/':'/mobile/');return;}
  res.status(e instanceof AccessError?e.status:503).json({error:e instanceof AccessError?e.message:'Read-only workspace unavailable'});
 });});return app;
}
