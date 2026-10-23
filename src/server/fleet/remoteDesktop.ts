import express from 'express';
import path from 'node:path';
import type {FleetBroker} from './FleetBroker';
import {allowedSiteIds} from './fleetApp';
import {AccessError,LocalSessions} from '../security/localSessions';
import {mobileSessionToken,type MobileOptions} from './mobileApp';
import type {Collector} from './CollectorPoller';
import type {WorkspaceForward} from './workspaceGateway';
import {reviewReadPath} from '../../../scripts/operations-review-policy';
import {requireFullWorkspace,workspacePath,workspaceRouteAllowed,monitoringWorkspaceRequest,passiveWorkspaceGet} from './workspaceAccess';

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
  '/api/local/site-data/strings-stream':{shape:/^list(?:-v2)?$/},
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
  let requestPath:string;
  try{requestPath=workspacePath(raw);}catch{throw new AccessError(403,'Invalid remote workspace path');}
  const recheck=async(control=false,fresh=false)=>{
   const auth=await sessions.authenticate(token,false);
   const email=options.remoteIdentity?await options.remoteIdentity(req):auth.email;
   const account=(await options.accounts()).find(a=>a.email===email);
   if(!account||account.disabled||!account.remoteAccess||auth.email!==email||!allowedSiteIds(broker,auth.principal).has(site.collector.siteId))throw new AccessError(403,'This site is not assigned to your remote account');
   const operator=options.remoteControlsEnabled===true&&account.remoteControlSites?.includes(site.collector.siteId)===true;
   if(operator)requireFullWorkspace(auth.principal,site.collector);
   if(control){
    if(!operator)throw new AccessError(403,'Remote controls are locked for your profile on this site. Verify any previously submitted command outcome before retrying');
    await sessions.requireControl(token);
   }
   // Consume the existing broker publication; never force a device poll to unlock.
   if(fresh&&broker.view(new Set([site.collector.siteId])).sites[0]?.status!=='current')throw new AccessError(409,'Current site telemetry is required for remote controls. Verify any previously submitted command outcome before retrying');
   // Check again after the separate account read to close a permission-change race.
   await sessions.authenticate(token,false);
   return {...auth,operator};
  };
  const auth=await recheck();
  if(req.method==='GET'&&/^\/(?:\?[^#]*)?$/.test(raw)){
   const query=new URL(raw,options.origin).searchParams;
   for(const [key,value] of query)if(!['tab','ui','healthView','array','targetSite','targetarray','targetstring','targetbpc','returnTo'].includes(key)||(key==='targetSite'?value.length>512||/[<>\x00-\x1f]/.test(value):!/^[-a-z0-9]{1,64}$/i.test(value))||query.getAll(key).length!==1)throw new AccessError(403,'Invalid view');
   await options.audit({action:'remote.workspace.open',outcome:'authorized',subject:auth.principal.subject});
   if(options.workspaceUi?.send('/',res))return;
   res.sendFile(path.resolve(options.publicDirectory,'index.html'));return;
  }
  if(raw==='/api/fleet/workspace-context'&&req.method==='GET'){
   const c=site.collector;res.json({siteId:c.siteId,siteName:c.name,stationCode:c.stationCode,blockIndex:c.blockIndex,fleetUrl:options.origin+(options.adaptiveExperience?'/fleet/':'/mobile/'),email:auth.email,csrf:auth.csrf,fullControl:auth.operator,remoteReadOnly:!auth.operator,remoteAccess:true,...(auth.operator?await sessions.status(token):{}),...(options.workspaceUi?{uiRelease:options.workspaceUi.releaseId}:{})});return;
  }
  if(raw==='/api/fleet/workspace-touch'&&req.method==='POST'){
   if(req.headers.origin!==options.origin)throw new AccessError(403,'Same-origin request required');
   sessions.checkCsrf(auth.csrf,req.headers['x-prizm-csrf']);await sessions.authenticate(token,true);res.json({active:true,readOnly:!auth.operator});return;
  }
  if(auth.operator){
   // Use the same enrolled collector and route policy as LAN, never another
   // target, credential, or alternate implementation of an equipment command.
   // Native EventSource and downloads cannot attach a CSRF header. Keep the
   // same narrow passive-GET exception as LAN; mutations never use it.
   if(req.method!=='GET'||!passiveWorkspaceGet(requestPath))sessions.checkCsrf(auth.csrf,req.headers['x-prizm-csrf']);
   if(req.headers.origin&&req.headers.origin!==options.origin||req.method!=='GET'&&req.headers.origin!==options.origin)throw new AccessError(403,'Same-origin request required');
   if(raw==='/api/fleet/workspace-monitor'&&req.method==='POST'){res.json(await sessions.monitoring(token));return;}
   if(!workspaceRouteAllowed(req.method,requestPath))throw new AccessError(403,'Route is not available in the enrolled workspace');
   // Shared guidance and administration remain local administrator operations.
   if(req.method!=='GET'&&(requestPath.toLowerCase().startsWith('/api/local/troubleshooting/overrides')||requestPath.toLowerCase()==='/api/local/corrective-guidance'))throw new AccessError(403,'Use local administration for shared guidance changes');
   if(req.method==='GET'&&(Number(req.headers['content-length']??0)!==0||req.headers['transfer-encoding']))throw new AccessError(400,'GET body refused');
   if(Number(req.headers['content-length']??0)>50*1024*1024)throw new AccessError(413,'Request body too large');
   const controlRequired=!monitoringWorkspaceRequest(req.method,requestPath);
   await recheck(true,controlRequired);
   if(controlRequired||req.method!=='GET')await options.audit({action:'remote.workspace.dispatch',outcome:'authorized',subject:auth.principal.subject,siteId:site.collector.siteId,method:req.method,path:requestPath});
   await recheck(true,controlRequired);
   req.url=raw;
   // Freshness is a pre-dispatch gate, not a reason to interrupt an accepted
   // maintenance operation or discard its result. Access revocation still applies.
   await site.forward(req,res,async()=>{await recheck(true);});return;
  }
  const safe=remoteDesktopRead(req.method,raw);
  if(!safe||Number(req.headers['content-length']??0)!==0||req.headers['transfer-encoding'])throw new AccessError(403,'Remote workspace is read-only; this request was not dispatched');
  req.url=safe;await recheck();await site.forward(req,res,async()=>{await recheck();});
 })().catch(e=>{
  if(res.headersSent){res.destroy();return;}
  if(e instanceof AccessError&&e.status===401&&req.method==='GET'&&/^\/[^/]+\/($|\?)/.test(req.url)){res.redirect(303,options.adaptiveExperience?'/fleet/':'/mobile/');return;}
  res.status(e instanceof AccessError?e.status:503).json({error:e instanceof AccessError?e.message:'Site workspace unavailable; verify any submitted command outcome before retrying'});
 });});return app;
}
