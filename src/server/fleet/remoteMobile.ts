import express from 'express';
import {createServer} from 'node:http';
import {chmod,lstat,readFile,readdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createMobileApp,type MobileOptions} from './mobileApp';
import {remoteVerifier,type RemoteIdentityConfig} from './remoteIdentity';
import type {FleetBroker} from './FleetBroker';
import {LocalSessions} from '../security/localSessions';
import {createRemoteDesktop,type RemoteDesktopSite} from './remoteDesktop';
import {allowedFetchSite} from './navigationPolicy';
import {AccessError} from '../security/localSessions';
import {normalizeLocalEmail} from '../../core/security/localEmail';

export interface RemoteMobileConfig extends RemoteIdentityConfig {origin:string;socketPath:string;authentication?:'cloudflare'|'password';experience?:'adaptive'|'mobile';controls?:'disabled'|'profile'}
/** No public TCP listener. cloudflared alone connects to the private socket.
 * Desktop access uses fixed enrolled collectors and explicit profile grants. */
type Options=Omit<MobileOptions,'origin'|'remoteIdentity'|'allowLoopbackHttp'|'remoteSessions'|'remoteListener'> & {desktop?:RemoteDesktopSite[]};
export async function createRemoteMobileApp(broker:FleetBroker,options:Options,config:RemoteMobileConfig){
 const origin=new URL(config.origin);
 if(origin.protocol!=='https:'||origin.origin!==config.origin||origin.port||origin.username||origin.password||!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(origin.hostname))throw Error('Exact HTTPS remote hostname required');
 if(config.socketPath!=='/run/prizm-remote/mobile.sock')throw Error('Fixed private remote socket required');
 if(config.authentication!==undefined&&!['cloudflare','password'].includes(config.authentication))throw Error('Unknown remote authentication mode');
 if(config.experience!==undefined&&!['adaptive','mobile'].includes(config.experience))throw Error('Unknown remote experience');
 if(config.controls!==undefined&&!['disabled','profile'].includes(config.controls))throw Error('Unknown remote controls policy');
 const remoteControlsEnabled=config.controls==='profile';
 const adaptive=!!options.desktop?.length&&config.experience!=='mobile';
 const verifyIdentity=config.authentication==='password'?undefined:remoteVerifier(config);
 const identity:MobileOptions['remoteIdentity']=verifyIdentity?req=>verifyIdentity(req.headers['cf-access-jwt-assertion']):undefined;
 // This filtered provider is also re-read by LocalSessions on every authorized
 // request. Revocation is enforced without trusting any forwarded identity.
 const accounts=async()=>(await options.accounts()).filter(a=>!a.disabled&&a.remoteAccess===true);
 // Include only the mobile build's explicit dependencies, not the desktop app.
 const html=await readFile(path.join(options.publicDirectory,'mobile.html'),'utf8');
 const assets=new Set([...html.matchAll(/(?:src|href)="(\/assets\/[A-Za-z0-9_.-]+\.(?:js|css))"/g)].map(m=>m[1]));
 assets.add('/logo-transparent.svg');
 if(options.desktop?.length)for(const file of await readdir(path.join(options.publicDirectory,'assets')))if(/^[A-Za-z0-9_.-]+\.(js|css|svg|woff2?)$/.test(file))assets.add('/assets/'+file);
 const sessions=new LocalSessions(accounts,options.clock??Date.now,true,true);
 const app=express();app.disable('x-powered-by');app.set('trust proxy',false);app.set('strict routing',true);app.set('case sensitive routing',true);
 app.use((req,res,next)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  const entryDocument=['/','/mobile','/mobile/',...(adaptive?['/fleet','/fleet/']:[])].includes(req.path)||/^\/desktop\/[A-Za-z0-9_-]{1,80}\/$/.test(req.path);
  const methods=remoteControlsEnabled&&req.path.startsWith('/desktop/')?['GET','POST','PUT','PATCH','DELETE']:['GET','POST'];
  if(req.socket.remoteAddress||req.headers.host!==origin.host||req.headers.origin&&req.headers.origin!==origin.origin||!allowedFetchSite(req,entryDocument)||!req.path.startsWith('/desktop/')&&req.url!==req.path||/[\\%]/.test(req.path)||!methods.includes(req.method)||req.method!=='GET'&&req.headers.origin!==origin.origin)return res.sendStatus(403);
  res.set('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  if(!identity)return next();
  void identity(req).then(async email=>{
   const account=(await accounts()).find(a=>a.email===email);
   if(!account)throw Error('Not enrolled');next();
  }).catch(()=>res.status(403).send('Remote access is not assigned to this verified identity. Contact your PRIZM administrator.'));
 });
 app.get('/',(_req,res)=>res.redirect(302,adaptive?'/fleet/':'/mobile/'));
 app.get('/mobile',(_req,res)=>res.redirect(302,'/mobile/'));
 if(adaptive)app.get('/fleet',(_req,res)=>res.redirect(302,'/fleet/'));
 for(const asset of assets)app.get(asset,(_req,res)=>{
  if(options.workspaceUi?.send(asset,res))return;
  res.sendFile(path.join(options.publicDirectory,asset));
 });
 const setup=options.setup?async(body:unknown,verifiedEmail?:string)=>{
  const email=normalizeLocalEmail((body as {email?:unknown})?.email);
  if(!(await accounts()).some(a=>a.email===email))throw new AccessError(400,'Invalid or expired setup code');
  return options.setup!(body,verifiedEmail);
 }:undefined;
 const shared={...options,accounts,setup,origin:config.origin,remoteControlsEnabled,remoteListener:true,remoteIdentity:identity,remoteSessions:sessions,adaptiveExperience:adaptive,desktopSites:options.desktop?.map(s=>s.collector.siteId)};
 if(options.desktop?.length)app.use('/desktop',createRemoteDesktop(broker,sessions,shared,options.desktop));
 app.use('/mobile',createMobileApp(broker,shared));
 if(adaptive)app.use('/fleet',createMobileApp(broker,{...shared,experience:'fleet'}));
 app.use((_req,res)=>res.sendStatus(403));
 return app;
}
export async function startRemoteMobile(broker:FleetBroker,options:Options,config:RemoteMobileConfig){
 const app=await createRemoteMobileApp(broker,options,config);
 const directory=await lstat(path.dirname(config.socketPath));
 if(!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o777)!==0o710||directory.uid!==process.getuid?.()||directory.gid!==process.getgid?.())throw Error('Service-owned remote directory with dedicated tunnel group (0710) required');
 try{await lstat(config.socketPath);throw Error('Remote socket already exists; inspect before removing');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const server=createServer({maxHeaderSize:32768},app);
 server.requestTimeout=15000;server.headersTimeout=10000;server.maxConnections=64;server.keepAliveTimeout=5000;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(config.socketPath,resolve);});
 await chmod(config.socketPath,0o660);
 return {close:async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await unlink(config.socketPath).catch(()=>{});}};
}
