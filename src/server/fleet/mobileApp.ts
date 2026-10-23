import express,{type Request,type RequestHandler,type ErrorRequestHandler} from 'express';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import type {FleetBroker} from './FleetBroker';
import {allowedSiteIds,validateFleetOrigin} from './fleetApp';
import {LocalSessions,AccessError} from '../security/localSessions';
import type {LocalAccount} from '../security/localAccounts';
import {normalizeLocalEmail} from '../../core/security/localEmail';
import {unavailableHvac} from './mobileHvacProjection';
import type {MobileHvac} from '../../mobile/hvacModel';
import {allowedFetchSite} from './navigationPolicy';
import type {WorkspaceUi} from './workspaceUi';
import {fleetAdminRouter} from './adminRoutes';

const cookieName='prizm_mobile_session';
export const mobileSessionToken=(req:Request)=>{const all=String(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName+'='));return all.length===1?all[0].slice(cookieName.length+1):undefined;};
const tokenOf=mobileSessionToken;
export interface MobileOptions {
 origin:string;allowLoopbackHttp?:boolean;publicDirectory:string;
 accounts:()=>Promise<LocalAccount[]>;
 hvac:(siteId:string)=>MobileHvac;
 audit:(event:{action:string;outcome:string;subject?:string;siteId?:string;method?:string;path?:string})=>Promise<void>;
 remoteControlsEnabled?:boolean;
 /** Server-only account store. Used solely by the authenticated remote Fleet admin routes. */
 adminAccountsFile?:string;
 clock?:()=>number;
 setup?:(body:unknown,verifiedEmail?:string)=>Promise<unknown>;
 /** Only the dedicated Unix-socket listener supplies this cryptographic verifier. */
 remoteIdentity?:(req:Request)=>Promise<string>;
 /** Set only by the dedicated private Unix listener, never by request headers. */
 remoteListener?:boolean;
 /** Dedicated remote session store; never the LAN control store. */
 remoteSessions?:LocalSessions;
 desktopSites?:readonly string[];
 /** Presentation only. Both experiences share the same read-only authorization. */
 experience?:'mobile'|'fleet';
 adaptiveExperience?:boolean;
 /** Shared application release; does not grant any additional permissions. */
 workspaceUi?:WorkspaceUi;
}
/** Read-only overview and login shell, with optional remote Fleet administration.
 * Account changes reuse LAN authorization; these routes never dispatch commands. */
export function createMobileApp(broker:FleetBroker,options:MobileOptions){
 const app=express(),origin=validateFleetOrigin(options.origin,options.allowLoopbackHttp);
 const remote=options.remoteListener===true||!!options.remoteIdentity;
 const administration=remote&&options.experience==='fleet'&&!!options.adminAccountsFile;
 const sessions=remote&&options.remoteSessions?options.remoteSessions:new LocalSessions(options.accounts,options.clock??Date.now,true,true);
 const identities=new WeakMap<Request,string>();
 app.disable('x-powered-by');app.set('case sensitive routing',true);app.set('strict routing',true);app.set('trust proxy',false);
 const routes=new Map([['/api/fleet/session','GET'],['/api/fleet/summary','GET'],['/api/fleet/login','POST'],['/api/fleet/logout','POST'],['/api/fleet/touch','POST'],['/','GET'],['/mobile.webmanifest','GET']]);
 if(options.setup)routes.set('/api/fleet/setup','POST');
 app.use((req,res,next)=>{
  if(options.workspaceUi)res.set('X-Prizm-UI-Release',options.workspaceUi.releaseId);
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
   'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});
  const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'');
  if(req.headers.host!==origin.host||req.headers.origin&&req.headers.origin!==origin.origin||
   !allowedFetchSite(req,req.path==='/')||
   !req.secure&&!(remote&&!req.socket.remoteAddress)&&!(options.allowLoopbackHttp&&origin.protocol==='http:'&&loopback)||
   req.url!==req.path||!(routes.get(req.path)===req.method||administration&&req.path==='/api/fleet/admin/users'&&['GET','POST'].includes(req.method))||req.method==='POST'&&req.headers.origin!==origin.origin)
   return res.status(403).json({error:'Read-only mobile route disabled'});
  next();
 });
 app.use(express.json({limit:'4kb',strict:true}));
 app.use((req,res,next)=>{
  if(!options.remoteIdentity)return next();
  void options.remoteIdentity(req).then(async email=>{
   const account=(await options.accounts()).find(a=>a.email===email);
   if(!account||account.disabled||account.remoteAccess!==true)throw new AccessError(403,'Remote access is not assigned to this identity');
   identities.set(req,email);next();
  }).catch(()=>res.status(403).json({error:'Verified remote identity and assigned access required'}));
 });
 if(administration)app.use('/api/fleet/admin',(req,res,next)=>{
  void sessions.authenticate(tokenOf(req),false).then(auth=>{
   if(options.remoteIdentity&&auth.email!==identities.get(req))throw new AccessError(403,'Sign in with your verified remote email');
   next();
  }).catch(e=>res.status(e instanceof AccessError?e.status:503).json({error:'Administrator session required'}));
 },fleetAdminRouter({sessions,accountsFile:options.adminAccountsFile!,sites:broker.enrollments(),workspaceSites:new Set(options.desktopSites??[]),origin:origin.origin,audit:options.audit,tokenOf}));
 const cookie={path:remote?'/':'/mobile',secure:origin.protocol==='https:',httpOnly:true,sameSite:'strict' as const,maxAge:86400000};
 const guarded=(fn:(req:Request,token:string,auth:Awaited<ReturnType<LocalSessions['authenticate']>>)=>Promise<unknown>):RequestHandler=>(req,res)=>{
  void(async()=>{const token=tokenOf(req),auth=await sessions.authenticate(token,false);if(options.remoteIdentity&&auth.email!==identities.get(req))throw new AccessError(403,'Sign in with your verified remote email');const data=await fn(req,token!,auth);await sessions.authenticate(token,false);res.json(data);})()
   .catch(e=>res.status(e instanceof AccessError?e.status:503).json({error:e instanceof AccessError?e.message:'Mobile readings unavailable'}));
 };
 app.post('/api/fleet/login',(req,res)=>{void(async()=>{
  if(!req.body||Object.keys(req.body).sort().join(',')!=='email,password')throw new AccessError(400,'Email and password required');
  if(options.remoteIdentity&&normalizeLocalEmail(req.body.email)!==identities.get(req))throw new AccessError(403,'Sign in with your verified remote email');
  const login=await sessions.login(req.body.email,req.body.password,req.socket.remoteAddress??'unknown');
  try{await options.audit({action:'mobile.login',outcome:'accepted'});}catch(e){sessions.logout(login.token);throw e;}
  const previous=tokenOf(req);if(previous)sessions.logout(previous);
  if(remote)res.clearCookie(cookieName,{path:'/mobile',secure:true,httpOnly:true,sameSite:'strict'});
  res.cookie(cookieName,login.token,cookie).json({authenticated:true});
 })().catch(async e=>{await options.audit({action:'mobile.login',outcome:'rejected'}).catch(()=>{});res.status(e instanceof AccessError?e.status:503).json({error:e instanceof AccessError?e.message:'Sign-in unavailable'});});});
 app.get('/api/fleet/session',guarded(async(_req,_token,auth)=>({email:auth.email,csrf:auth.csrf,idleExpiresAt:auth.idleExpiresAt,readOnly:true,remoteReadOnly:remote,administrator:administration&&auth.administrator,workspaces:(options.desktopSites??[]).filter(id=>allowedSiteIds(broker,auth.principal).has(id)).map(siteId=>({siteId,origin:'/desktop/'+encodeURIComponent(siteId)+'/'})),simulated:false,refreshIntervalMs:5000})));
 app.get('/api/fleet/summary',guarded(async(_req,_token,auth)=>{
  const view=broker.view(allowedSiteIds(broker,auth.principal));
  return {...view,sites:view.sites.map(site=>{
   let mobileHvac=unavailableHvac();
   // Site telemetry permission is sufficient for this bounded read-only view.
   // Never grant workspace.full merely to make HVAC monitoring available.
   if(site.status==='current')mobileHvac=options.hvac(site.siteId);
   return {...site,mobileHvac};
  })};
 }));
 app.post('/api/fleet/touch',guarded(async(req,token,auth)=>{sessions.checkCsrf(auth.csrf,req.headers['x-prizm-csrf']);await sessions.authenticate(token,true);return {active:true};}));
 if(options.setup)app.post('/api/fleet/setup',(req,res)=>{void options.setup!(req.body,identities.get(req)).then(result=>res.json(result)).catch(e=>res.status(e instanceof AccessError?e.status:503).json({error:e instanceof AccessError?e.message:'Password setup unavailable'}));});
 app.post('/api/fleet/logout',(req,res)=>{void(async()=>{
  const token=tokenOf(req),auth=await sessions.authenticate(token,false);
  if(options.remoteIdentity&&auth.email!==identities.get(req))throw new AccessError(403,'Sign in with your verified remote email');
  sessions.checkCsrf(auth.csrf,req.headers['x-prizm-csrf']);sessions.logout(token!);
  await options.audit({action:'mobile.logout',subject:auth.principal.subject,outcome:'accepted'});
  const {maxAge:_,...clear}=cookie;res.clearCookie(cookieName,clear).json({authenticated:false});
 })().catch(e=>res.status(e instanceof AccessError?e.status:503).json({error:'Session ended or unavailable'}));});
 app.get('/',(_req,res)=>{void readFile(path.resolve(options.publicDirectory,options.experience==='fleet'?'fleet.html':'mobile.html'),'utf8').then(html=>res.type('html').send(options.adaptiveExperience?html.replace('<html','<html data-prizm-adaptive="true"'):html)).catch(()=>res.status(503).send('Workspace unavailable'));});
 app.get('/mobile.webmanifest',(_req,res)=>res.type('application/manifest+json').json({name:'GreEnergy PRIZM Mobile',short_name:'PRIZM',start_url:'/mobile/',scope:'/mobile/',display:'standalone',background_color:'#f5f7f5',theme_color:'#123c32',icons:[{src:'/logo-transparent.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]}));
 app.use((_req,res)=>res.status(403).json({error:'Read-only mobile route disabled'}));
 const errors:ErrorRequestHandler=(_e,_req,res,_next)=>{res.status(400).json({error:'Invalid mobile request'});};app.use(errors);
 return app;
}
