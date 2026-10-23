import express,{type Request,type RequestHandler,type ErrorRequestHandler} from 'express';
import {fleetRefreshMs} from '../../core/fleet/pollingCadence';
import path from 'node:path';
import {FleetBroker} from './FleetBroker';
import {LOOPBACK_HOSTS} from './CollectorPoller';
import {LocalSessions,AccessError} from '../security/localSessions';
import type {VerifiedPrincipal} from '../../core/security/controlPolicyPrototype';
import {requireFullWorkspace} from './workspaceAccess';
import {fleetAdminRouter} from './adminRoutes';
import type {WorkspaceUi} from './workspaceUi';

const cookieName='prizm_fleet_session';
function tokenFrom(req:Request){
  const entries=String(req.headers.cookie ?? '').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName+'='));
  return entries.length===1?entries[0].slice(cookieName.length+1):undefined;
}
export interface FleetAppOptions {
  origin:string; allowLoopbackHttp?:boolean; publicDirectory:string; simulated?:boolean;
  audit:(event:{action:string;outcome:string;subject?:string})=>Promise<void>;
  workspaces?:Array<{siteId:string;origin:string}>;
  accountsFile?:string;
  workspaceUi?:WorkspaceUi;
}
export function validateFleetOrigin(value:string,allowLoopbackHttp=false):URL {
  const origin=new URL(value);
  if(origin.origin!==value || origin.username || origin.password || (origin.protocol!=='https:' &&
    !(allowLoopbackHttp && origin.protocol==='http:' && LOOPBACK_HOSTS.includes(origin.hostname))))throw new Error('Fleet requires an exact HTTPS origin, or explicit loopback HTTP');
  return origin;
}
export function allowedSiteIds(broker:FleetBroker,principal:VerifiedPrincipal):Set<string> {
  if(principal.state!=='active' || principal.expiresAt<=Date.now())return new Set();
  return new Set(broker.enrollments().filter(site=>principal.grants.some(g=>g.capability==='telemetry.view' &&
    g.siteId===site.siteId && g.blockId===site.blockId && g.scope.kind==='block')).map(site=>site.siteId));
}

/** Independent application. Never mounts standalone PRIZM or any control adapter. */
export function createFleetApp(broker:FleetBroker,sessions:LocalSessions,options:FleetAppOptions){
  const origin=validateFleetOrigin(options.origin,options.allowLoopbackHttp),app=express();
  app.disable('x-powered-by');app.set('case sensitive routing',true);app.set('strict routing',true);app.set('trust proxy',false);
  app.use((req,res,next)=>{
    if(options.workspaceUi)res.set('X-Prizm-UI-Release',options.workspaceUi.releaseId);
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});
    const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
    if(req.headers.host!==origin.host || (req.headers.origin && req.headers.origin!==origin.origin) ||
      (!req.secure && !(options.allowLoopbackHttp && origin.protocol==='http:' && loopback)))return res.status(403).json({error:'Trusted transport and origin required'});
    if(!['GET','POST'].includes(req.method) || Object.keys(req.query).length)return res.status(403).json({error:'Route not enabled in the read-only fleet pilot'});
    next();
  });
  app.use(express.json({limit:'4kb',strict:true}));
  const cookieOptions={httpOnly:true,secure:origin.protocol==='https:',sameSite:'strict' as const,path:'/',maxAge:sessions.maximumAgeMs};
  const guarded=(fn:(req:Request,token:string,principal:VerifiedPrincipal)=>Promise<unknown>):RequestHandler=>(req,res)=>{
    void (async()=>{
      const token=tokenFrom(req),auth=await sessions.authenticate(token,false);
      const result=await fn(req,token!,auth.principal);
      await sessions.authenticate(token,false);
      res.json(result);
    })().catch(error=>res.status(error instanceof AccessError?error.status:503).json({error:error instanceof AccessError?error.message:'Fleet service unavailable'}));
  };
  app.post('/api/fleet/login',(req,res)=>{
    void (async()=>{
      if(req.headers.origin!==origin.origin)throw new AccessError(403,'Same-origin request required');
      if(!req.body || Object.keys(req.body).sort().join(',')!=='email,password')throw new AccessError(400,'Email and password required');
      const result=await sessions.login(req.body.email,req.body.password,req.socket.remoteAddress ?? 'unknown');
      try{await options.audit({action:'fleet.login',outcome:'accepted'});}catch(error){sessions.logout(result.token);throw error;}
      const old=tokenFrom(req);if(old)sessions.logout(old);
      res.cookie(cookieName,result.token,cookieOptions).json({authenticated:true});
    })().catch(async error=>{
      await options.audit({action:'fleet.login',outcome:'rejected'}).catch(()=>{});
      res.status(error instanceof AccessError?error.status:503).json({error:error instanceof AccessError?error.message:'Sign-in unavailable'});
    });
  });
  app.get('/api/fleet/session',guarded(async(_req,token)=>{
    const auth=await sessions.authenticate(token,false);
    const workspaces=(options.workspaces??[]).filter(w=>{
      const site=broker.enrollments().find(s=>s.siteId===w.siteId);
      if(!site)return false;
      try{requireFullWorkspace(auth.principal,site);return true;}catch{return false;}
    });
    return {email:auth.email,csrf:auth.csrf,...await sessions.status(token),readOnly:true,simulated:options.simulated===true,administrator:!!options.accountsFile&&auth.administrator,workspaces,refreshIntervalMs:fleetRefreshMs(process.env.PRIZM_FLEET_REFRESH_MS)};
  }));
  app.get('/api/fleet/summary',guarded(async(_req,_token,principal)=>broker.view(allowedSiteIds(broker,principal))));
  if(options.accountsFile)app.use('/api/fleet/admin',fleetAdminRouter({sessions,accountsFile:options.accountsFile,sites:broker.enrollments(),workspaceSites:new Set((options.workspaces??[]).map(w=>w.siteId)),origin:origin.origin,audit:options.audit}));
  app.post('/api/fleet/touch',guarded(async(req,token)=>{
    const auth=await sessions.authenticate(token,false);
    if(req.headers.origin!==origin.origin)throw new AccessError(403,'Same-origin request required');
    sessions.checkCsrf(auth.csrf,req.headers['x-prizm-csrf']);
    await sessions.authenticate(token,true);return {active:true};
  }));
  for(const action of ['monitor','reauthenticate'])app.post('/api/fleet/'+action,guarded(async(req,token)=>{
    const auth=await sessions.authenticate(token,false);
    if(req.headers.origin!==origin.origin)throw new AccessError(403,'Same-origin request required');
    sessions.checkCsrf(auth.csrf,req.headers['x-prizm-csrf']);
    if(action==='monitor')return sessions.monitoring(token);
    if(!req.body || Object.keys(req.body).join(',')!=='password')throw new AccessError(400,'Password required');
    return sessions.unlockControls(token,req.body.password,()=>options.audit({action:'fleet.controls.unlock',subject:auth.principal.subject,outcome:'authorized'}));
  }));
  app.post('/api/fleet/logout',(req,res)=>{
    void (async()=>{
      const token=tokenFrom(req),auth=await sessions.authenticate(token,false);
      if(req.headers.origin!==origin.origin)throw new AccessError(403,'Same-origin request required');
      sessions.checkCsrf(auth.csrf,req.headers['x-prizm-csrf']);sessions.logout(token!);
      await options.audit({action:'fleet.logout',subject:auth.principal.subject,outcome:'accepted'});
      const {maxAge:_,...clear}=cookieOptions;res.clearCookie(cookieName,clear).json({authenticated:false});
    })().catch(error=>res.status(error instanceof AccessError?error.status:503).json({error:'Session ended or unavailable'}));
  });
  const send=(file:string):RequestHandler=>(_req,res)=>res.sendFile(path.resolve(options.publicDirectory,file),{dotfiles:'deny'},error=>{
    if(error && !res.headersSent)res.status(503).json({error:'Build the fleet UI before starting this service'});
  });
  app.get('/',send('fleet.html'));
  app.get('/logo-transparent.svg',send('logo-transparent.svg'));
  app.get(/^\/assets\/([A-Za-z0-9_-]+\.(?:js|css))$/,(req,res,next)=>send('assets/'+req.params[0])(req,res,next));
  app.use((_req,res)=>res.status(403).json({error:'Route not enabled in the read-only fleet pilot'}));
  const errors:ErrorRequestHandler=(_error,_req,res,_next)=>{res.status(400).json({error:'Invalid request'});};app.use(errors);
  return app;
}
