import express, {type Request, type RequestHandler} from 'express';
import type {VerifiedPrincipal} from '../../core/security/controlPolicyPrototype';
import {AccessError, LocalSessions} from './localSessions';
import {OwnedJobs, requireBlockCapability, type JobKind, type SiteScope} from './ownedJobs';
import type {ReadOnlyTelemetry} from '../../core/security/readOnlyTelemetry';
import type {ContactorAccess} from './contactorAccess';
import type {CommandRecovery} from './commandRecovery';

export interface PilotPorts {
  scope(): SiteScope; // Trusted enrolled site, checked against the active profile on every call.
  readTelemetry?(): Promise<ReadOnlyTelemetry>;
  contactors?: ContactorAccess;
  recovery?:CommandRecovery;
  readJob(kind: JobKind, id: string): Promise<unknown>;
  stopRecording(id: string): Promise<unknown>;
  startRecording(targets: string[], hours: number): Promise<{id: string}>;
  audit(event: {action: string; subject?: string; outcome: string}): Promise<void>;
}
export interface PilotOptions {origin: string; allowLoopbackHttp?: boolean}
const jobKinds = new Set(['balancing','thermal-recording','thermal-review']);
const cookieName = 'prizm_local_session';
function tokenFrom(req: Request) {
  const entries = String(req.headers.cookie ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(cookieName+'='));
  return entries.length === 1 ? entries[0].slice(cookieName.length+1) : undefined;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Opt-in API gate. Does NOT fall through to legacy handlers, even for authenticated users. */
export function createLocalAccessPilot(sessions: LocalSessions, jobs: OwnedJobs, ports: PilotPorts, options: PilotOptions): RequestHandler {
  const origin = new URL(options.origin);
  if (origin.origin !== options.origin || origin.username || origin.password || !['https:', 'http:'].includes(origin.protocol) ||
      (origin.protocol === 'http:' && (!options.allowLoopbackHttp || !['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))) throw new Error('Pilot requires an exact HTTPS origin, or explicitly enabled loopback HTTP');
  const router = express.Router({caseSensitive:true,strict:true});
  router.use((req,res,next) => {
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    if (!['GET','POST'].includes(req.method)) return res.status(403).json({error:'Method not enabled in the security pilot'});
    const peer = req.socket.remoteAddress;
    const loopback = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer ?? '');
    if (req.headers.host !== origin.host || (req.headers.origin && req.headers.origin !== options.origin) ||
        (!req.secure && !(origin.protocol === 'http:' && options.allowLoopbackHttp && loopback))) return res.status(403).json({error:'Trusted transport and origin required'});
    next();
  });
  router.use(express.json({limit:'16kb',strict:true}));
  const cookieOptions = {httpOnly:true,secure:origin.protocol === 'https:',sameSite:'strict' as const,path:'/',maxAge:8*3600000};
  const guard = (handler: (req: Request, principal: VerifiedPrincipal, token: string) => Promise<unknown>, touch = true): RequestHandler => (req,res) => {
    void (async () => {
      const token = tokenFrom(req);
      const authenticated = await sessions.authenticate(token,touch);
      if (req.method !== 'GET') {
        if (req.headers.origin !== options.origin) throw new AccessError(403,'Same-origin request required');
        sessions.checkCsrf(authenticated.csrf,req.headers['x-prizm-csrf']);
      }
      const result = await handler(req,authenticated.principal,token!);
      await sessions.authenticate(token,false); // Revocation during slow work blocks result disclosure.
      res.json(result);
    })().catch(error => res.status(error instanceof AccessError ? error.status : 503).json({error:error instanceof AccessError ? error.message : 'Access service unavailable'}));
  };
  router.get('/access/config',(_req,res) => res.json({mode:'restricted-pilot'}));
  router.post('/access/login',(req,res) => {
    void (async () => {
      if (req.headers.origin !== options.origin) throw new AccessError(403,'Same-origin request required');
      const result = await sessions.login(req.body?.email,req.body?.password,req.socket.remoteAddress ?? 'unknown');
      // Rotate away the browser's previous session; tokens never enter logs or response JSON.
      const old = tokenFrom(req); if (old) sessions.logout(old);
      try {await ports.audit({action:'login',outcome:'accepted'});} catch (error) {sessions.logout(result.token); throw error;}
      res.cookie(cookieName,result.token,cookieOptions).json({authenticated:true,csrf:result.csrf});
    })().catch(async error => {
      await ports.audit({action:'login',outcome:'rejected'}).catch(() => {});
      res.status(error instanceof AccessError ? error.status : 503).json({error:error instanceof AccessError ? error.message : 'Access service unavailable'});
    });
  });
  router.get('/access/session',guard(async (_req,principal,token) => {
    const {csrf,email,idleExpiresAt} = await sessions.authenticate(token,false);
    const scope = ports.scope();
    const singleStringContactors = !!ports.contactors && principal.grants.some(grant => grant.capability === 'controls.contactors' && grant.siteId === scope.siteId && grant.blockId === scope.blockId && (grant.scope.kind === 'block' || grant.scope.ids.length > 0));
    return {email,subject:principal.subject,expiresAt:principal.expiresAt,idleExpiresAt,grants:principal.grants,csrf,mode:'restricted-pilot',controls:{singleStringContactors}};
  }));
  router.get('/access/telemetry',guard(async (req,principal,token) => {
    if (Object.keys(req.query).length) throw new AccessError(400,'Telemetry does not accept target, refresh or source overrides');
    const scope = ports.scope(); requireBlockCapability(principal,scope,'telemetry.view');
    if (!ports.readTelemetry) throw new AccessError(503,'Telemetry workspace unavailable');
    const result = await ports.readTelemetry();
    const current = (await sessions.authenticate(token,false)).principal;
    if (JSON.stringify(ports.scope()) !== JSON.stringify(scope)) throw new AccessError(409,'Site changed');
    requireBlockCapability(current,scope,'telemetry.view');
    return result;
  },false));
  router.post('/access/logout',(req,res) => {
    void (async () => {
      const token = tokenFrom(req), current = await sessions.authenticate(token);
      if (req.headers.origin !== options.origin) throw new AccessError(403,'Same-origin request required');
      sessions.checkCsrf(current.csrf,req.headers['x-prizm-csrf']);
      sessions.logout(token!);
      const {maxAge: _maxAge,...clearOptions} = cookieOptions;
      res.clearCookie(cookieName,clearOptions);
      await ports.audit({action:'logout',subject:current.principal.subject,outcome:'accepted'});
      res.json({authenticated:false});
    })().catch(error => res.status(error instanceof AccessError ? error.status : 503).json({error:'Logout unavailable or session expired'}));
  });
  router.post('/access/controls/contactors',guard(async (req,_principal,token) => {
    if (!ports.contactors) throw new AccessError(403,'Contactor controls are not enabled in this pilot');
    if (Object.keys(req.query).length) throw new AccessError(400,'Control query overrides are not supported');
    return ports.contactors.submit(req.body,async () => (await sessions.authenticate(token,false)).principal);
  }));
  router.get('/access/controls/contactors/:array/:string',guard(async (req,_principal,token) => {
    if (!ports.contactors) throw new AccessError(403,'Contactor controls are not enabled in this pilot');
    if (Object.keys(req.query).length || ![req.params.array,req.params.string].every(value => /^[1-9][0-9]{0,4}$/.test(String(value)))) throw new AccessError(400,'Invalid review target');
    return ports.contactors.review(Number(req.params.array),Number(req.params.string),async () => (await sessions.authenticate(token,false)).principal);
  },false));
  router.get('/access/controls/receipts/:id',guard(async(req,principal)=>{
    if(!ports.contactors) throw new AccessError(403,'Contactor controls are not enabled in this pilot');
    if(Object.keys(req.query).length || !/^[A-Za-z0-9_-]{16,80}$/.test(String(req.params.id))) throw new AccessError(400,'Invalid receipt request');
    const scope=ports.scope();
    const result=await ports.contactors.readSaved(String(req.params.id),principal,scope);
    if(JSON.stringify(ports.scope())!==JSON.stringify(scope)) throw new AccessError(409,'Site changed');
    return result;
  },false));
  router.get('/access/recovery',guard(async(req,_principal,token)=>{
    if(!ports.recovery) throw new AccessError(403,'Command recovery not enabled');
    if(Object.keys(req.query).length) throw new AccessError(400,'Recovery query overrides not supported');
    return ports.recovery.list(async()=>(await sessions.authenticate(token,false)).principal);
  },false));
  router.get('/access/recovery/:id',guard(async(req,_principal,token)=>{
    if(!ports.recovery) throw new AccessError(403,'Command recovery not enabled');
    if(Object.keys(req.query).length) throw new AccessError(400,'Recovery query overrides not supported');
    return ports.recovery.review(String(req.params.id),async()=>(await sessions.authenticate(token,false)).principal);
  },false));
  router.post('/access/recovery',guard(async(req,_principal,token)=>{
    if(!ports.recovery) throw new AccessError(403,'Command recovery not enabled');
    if(Object.keys(req.query).length) throw new AccessError(400,'Recovery query overrides not supported');
    return ports.recovery.record(req.body,async()=>(await sessions.authenticate(token,false)).principal);
  }));
  router.get('/access/jobs/:kind/:id',guard(async (req,principal) => {
    const kind = String(req.params.kind), id = String(req.params.id);
    if (!jobKinds.has(kind) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new AccessError(404,'Job unavailable');
    const scope = ports.scope(); requireBlockCapability(principal,scope,'history.view');
    await jobs.check(principal,scope,kind as JobKind,id);
    const result = await ports.readJob(kind as JobKind,id);
    if (!result) throw new AccessError(404,'Job unavailable');
    if (JSON.stringify(ports.scope()) !== JSON.stringify(scope)) throw new AccessError(409,'Site changed');
    return result;
  }));
  router.post('/access/recordings',guard(async (req,principal,token) => {
    const scope = ports.scope(); requireBlockCapability(principal,scope,'diagnostics.record');
    const body: unknown = req.body;
    if (!record(body) || Object.keys(body).some(key => !['targets','hours'].includes(key)) || !Array.isArray(body.targets) || !body.targets.length || body.targets.length > 8 ||
        body.targets.some(id => typeof id !== 'string' || id.length > 128) || typeof body.hours !== 'number' || !Number.isFinite(body.hours) || body.hours < 0.1 || body.hours > 24) throw new AccessError(400,'Invalid recording request');
    await ports.audit({action:'recording.start',subject:principal.subject,outcome:'requested'});
    requireBlockCapability((await sessions.authenticate(token)).principal,ports.scope(),'diagnostics.record');
    if (JSON.stringify(ports.scope()) !== JSON.stringify(scope)) throw new AccessError(409,'Site changed');
    const job = await ports.startRecording(body.targets as string[],body.hours);
    // If persistence fails the job stays inaccessible, not anonymously visible.
    await jobs.bind(principal,scope,'thermal-recording',job.id);
    if (JSON.stringify(ports.scope()) !== JSON.stringify(scope)) throw new AccessError(409,'Site changed');
    return job;
  }));
  router.post('/access/recordings/:id/stop',guard(async (req,principal,token) => {
    const scope = ports.scope(), id = String(req.params.id);
    requireBlockCapability(principal,scope,'diagnostics.record');
    await jobs.check(principal,scope,'thermal-recording',id);
    await ports.audit({action:'recording.stop',subject:principal.subject,outcome:'requested'});
    requireBlockCapability((await sessions.authenticate(token)).principal,ports.scope(),'diagnostics.record');
    if (JSON.stringify(ports.scope()) !== JSON.stringify(scope)) throw new AccessError(409,'Site changed');
    return ports.stopRecording(id);
  }));
  // Includes legacy control aliases, GET-triggered writes, HEAD, OPTIONS and profile changes.
  router.use((_req,res) => res.status(403).json({error:'Route not enabled in the restricted security pilot'}));
  router.use(((error: unknown,_req: Request,res: express.Response,_next: express.NextFunction) => {
    res.status(400).json({error:'Invalid request body'});
  }) as express.ErrorRequestHandler);
  return router;
}
