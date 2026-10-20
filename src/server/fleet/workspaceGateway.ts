import express,{type Request,type Response} from 'express';
import https from 'node:https';
import {Transform} from 'node:stream';
import {LocalSessions,AccessError} from '../security/localSessions';
import type {Collector} from './CollectorPoller';
import {fleetSessionToken,requireFullWorkspace,workspacePath,workspaceRouteAllowed,passiveWorkspaceGet,monitoringWorkspaceRequest,type WorkspaceEnrollment} from './workspaceAccess';
import {validateFleetOrigin} from './fleetApp';

export type WorkspaceAudit=(event:{action:string;outcome:string;subject?:string;siteId?:string;method?:string;path?:string})=>Promise<void>;
export type WorkspaceForward=(req:Request,res:Response,recheck:()=>Promise<void>)=>Promise<void>;

/** Fixed TLS collector, bounded streams, no cookies, redirects or command retries. */
export function workspaceForwarder(collector:Collector,enrollment:WorkspaceEnrollment,ca?:Buffer):WorkspaceForward {
  const target=new URL(collector.url);
  if(target.protocol!=='https:')throw Error('Workspace upstream must use verified TLS');
  const agent=new https.Agent({keepAlive:true,maxSockets:8,maxFreeSockets:2,...(ca?{ca}:{})});
  let active=0;
  return async(req,res,recheck)=>{
    if(active>=24)throw new AccessError(503,'Site workspace is busy; request was not dispatched');
    active++;
    return new Promise<void>(resolve=>{
      let settled=false,received=0;
      const headers:Record<string,string>={Authorization:'Bearer '+enrollment.token,Accept:String(req.headers.accept ?? '*/*')};
      // Set only by the authenticated local gateway, never copied from client headers.
      if(typeof res.locals.prizmGuidanceActor==='string')headers['x-prizm-guidance-actor']=res.locals.prizmGuidanceActor;
      for(const key of ['content-type','content-length'])if(typeof req.headers[key]==='string')headers[key]=req.headers[key] as string;
      // Construct path without URL resolution, after workspacePath rejects ambiguous segments.
      const upstream=https.request({hostname:target.hostname,port:Number(target.port||443),method:req.method,
        path:'/api/fleet/workspace'+req.url,headers,agent,rejectUnauthorized:true},response=>{
        void recheck().then(()=>{
          if(settled)return;
          const status=response.statusCode??502;
          if(status>=300 && status<400){response.destroy();fail('Collector redirect refused');return;}
          for(const key of ['content-type','content-disposition','content-length','x-prizm-cycle-id']){
            const value=response.headers[key];if(typeof value==='string')res.setHeader(key,value);
          }
          res.status(status);
          response.on('data',chunk=>{received+=chunk.length;if(received>64*1024*1024 && !response.headers['content-type']?.startsWith('text/event-stream'))fail('Response limit exceeded');});
          response.on('error',()=>fail('Collector response interrupted'));
          response.pipe(res);
        }).catch(()=>{response.destroy();fail('Workspace access ended',401);});
      });
      const deadline=setTimeout(()=>fail('Collector request deadline exceeded'),120000);deadline.unref();
      // Revocation/idle expiry must also end long-lived event streams.
      let checking=false;
      const accessTimer=setInterval(()=>{if(checking)return;checking=true;void recheck().catch(()=>fail('Workspace access ended',401)).finally(()=>{checking=false;});},10000);accessTimer.unref();
      let uploaded=0;
      const limit=new Transform({transform(chunk,_encoding,done){uploaded+=chunk.length;done(uploaded>50*1024*1024?new Error('Upload limit exceeded'):null,chunk);}});
      function finish(){if(settled)return;settled=true;clearTimeout(deadline);clearInterval(accessTimer);active--;upstream.destroy();req.unpipe(limit);limit.unpipe(upstream);limit.destroy();resolve();}
      function fail(message:string,status=502){
        if(settled)return;
        if(!res.headersSent)res.status(status).json({error:message+'. If a command was submitted, verify its outcome before retrying.'});
        else res.destroy();
        finish();
      }
      upstream.on('error',()=>fail('Collector connection unavailable'));
      limit.on('error',()=>fail('Request body too large',413));
      req.once('aborted',finish);res.once('close',finish);res.once('finish',finish);
      req.pipe(limit).pipe(upstream);
    });
  };
}

export function createWorkspaceGateway(sessions:LocalSessions,collector:Collector,enrollment:WorkspaceEnrollment,
  fleetOrigin:string,audit:WorkspaceAudit,forward:WorkspaceForward,allowLoopbackHttp=false){
  const origin=validateFleetOrigin(enrollment.origin,allowLoopbackHttp),fleet=validateFleetOrigin(fleetOrigin,allowLoopbackHttp),app=express();
  if(origin.hostname!==fleet.hostname || origin.origin===fleet.origin)throw Error('Distinct workspace origin on the Fleet host required');
  app.disable('x-powered-by');app.set('trust proxy',false);app.set('case sensitive routing',true);app.set('strict routing',true);
  // Parse only our small authentication payload; never consume forwarded command/upload bodies.
  app.use('/api/fleet/workspace-reauthenticate',express.json({limit:'4kb',strict:true}));
  app.use((req,res)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});
    void(async()=>{
      const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'');
      if(req.headers.host!==origin.host || (req.headers.origin && req.headers.origin!==origin.origin) ||
        (!req.secure && !(allowLoopbackHttp && origin.protocol==='http:' && loopback)))throw new AccessError(403,'Trusted workspace origin required');
      const path=workspacePath(req.url),token=fleetSessionToken(req);
      const recheck=async()=>{const auth=await sessions.authenticate(token,false);requireFullWorkspace(auth.principal,collector);return auth;};
      const auth=await recheck();
      if(req.method!=='GET'&&path.startsWith('/api/local/troubleshooting/overrides')&&!auth.administrator)throw new AccessError(403,'Local administrator access required');
      if(path==='/api/local/corrective-guidance'){
        if(req.method!=='GET'&&!auth.administrator)throw new AccessError(403,'Local administrator access required');
        if(auth.administrator)res.locals.prizmGuidanceActor=auth.principal.subject;
      }
      if(path==='/api/fleet/workspace-context' && req.method==='GET' && !req.url.includes('?')){
        res.json({siteId:collector.siteId,siteName:collector.name,stationCode:collector.stationCode,blockIndex:collector.blockIndex,
          fleetUrl:fleet.origin+'/#site='+encodeURIComponent(collector.siteId),email:auth.email,csrf:auth.csrf,fullControl:true,...await sessions.status(token)});return;
      }
      if(req.method!=='GET' || !passiveWorkspaceGet(path)){
        if(req.headers.origin && req.headers.origin!==origin.origin)throw new AccessError(403,'Same-origin request required');
        if(req.method!=='GET' && req.headers.origin!==origin.origin)throw new AccessError(403,'Same-origin request required');
        sessions.checkCsrf(auth.csrf,req.headers['x-prizm-csrf']);
      }
      if(path==='/api/fleet/workspace-touch' && req.method==='POST' && !req.url.includes('?')){await sessions.authenticate(token,true);res.json({active:true});return;}
      if(path==='/api/fleet/workspace-monitor' && req.method==='POST' && !req.url.includes('?')){res.json(await sessions.monitoring(token));return;}
      if(path==='/api/fleet/workspace-reauthenticate' && req.method==='POST' && !req.url.includes('?')){
        if(!req.body || Object.keys(req.body).join(',')!=='password')throw new AccessError(400,'Password required');
        res.json(await sessions.unlockControls(token!,req.body.password,()=>audit({action:'workspace.controls.unlock',outcome:'authorized',subject:auth.principal.subject,siteId:collector.siteId})));return;
      }
      if(!workspaceRouteAllowed(req.method,path))throw new AccessError(403,'Connection enrollment and this route are not editable from the site workspace');
      const controlRequired=!monitoringWorkspaceRequest(req.method,path);
      if(controlRequired)await sessions.requireControl(token);
      if(Number(req.headers['content-length']??0)>50*1024*1024)throw new AccessError(413,'Request body too large');
      // Do not log bodies, queries, cookies, tokens or target credentials.
      if(req.method!=='GET' || path.startsWith('/tools/controls/')){
        await audit({action:'workspace.dispatch',outcome:'authorized',subject:auth.principal.subject,siteId:collector.siteId,method:req.method,path});
      }else if(path==='/')await audit({action:'workspace.open',outcome:'authorized',subject:auth.principal.subject,siteId:collector.siteId});
      await recheck();
      if(controlRequired)await sessions.requireControl(token);
      await forward(req,res,async()=>{await recheck();});
    })().catch(error=>{
      if(res.headersSent){res.destroy();return;}
      const status=error instanceof AccessError?error.status:503;
      if(status===401 && req.url==='/' && req.method==='GET'){res.redirect(303,fleet.origin+'/');return;}
      res.status(status).json({error:error instanceof AccessError?error.message:'Site workspace unavailable'});
    });
  });
  return app;
}
