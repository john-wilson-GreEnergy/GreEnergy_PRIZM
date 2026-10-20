import {Router} from 'express';
import {AccessError,LocalSessions} from '../security/localSessions';
import {fleetSessionToken} from './workspaceAccess';
import {manageFleetAccount,listFleetAccounts,type FleetAccountAction} from './accountManagement';
import type {SiteEnrollment} from '../../core/fleet/model';
import {normalizeLocalEmail} from '../../core/security/localEmail';
import {FLEET_MIN_PASSWORD_LENGTH} from '../../core/security/fleetPasswordPolicy';

export function parseAdminAction(body:unknown,workspaceSites:Set<string>):{action:FleetAccountAction;confirmationPassword:string}{
  if(!body||typeof body!=='object'||Array.isArray(body))throw new AccessError(400,'Invalid account request');
  const b=body as Record<string,unknown>;
  if(!['add','invite','setup','access','enable','disable','password'].includes(String(b.kind))||typeof b.email!=='string'||typeof b.confirmationPassword!=='string')throw new AccessError(400,'Invalid account request');
  const email=normalizeLocalEmail(b.email);if(!email)throw new AccessError(400,'Valid email required');
  const fields=['kind','email','confirmationPassword',...(['add','invite','access'].includes(String(b.kind))?['siteIds','workspaceIds',...('remoteAccess' in b?['remoteAccess']:[])]:[]),...(['add','password'].includes(String(b.kind))?['password']:[])];
  if('remoteAccess' in b && typeof b.remoteAccess!=='boolean')throw new AccessError(400,'Invalid remote access choice');
  if(Object.keys(b).sort().join(',')!==fields.sort().join(','))throw new AccessError(400,'Unexpected or missing account fields');
  if(['add','password'].includes(String(b.kind))&&(typeof b.password!=='string'||[...b.password].length<FLEET_MIN_PASSWORD_LENGTH||b.password.length>256))throw new AccessError(400,`New password must have at least ${FLEET_MIN_PASSWORD_LENGTH} characters`);
  if(['add','invite','access'].includes(String(b.kind))){
    for(const key of ['siteIds','workspaceIds'])if(!Array.isArray(b[key])||(b[key] as unknown[]).length>16||(b[key] as unknown[]).some(id=>typeof id!=='string'))throw new AccessError(400,'Invalid site selection');
    if((b.workspaceIds as string[]).some(id=>!workspaceSites.has(id)))throw new AccessError(400,'Full workspace is not enabled for that site');
  }
  const {confirmationPassword,...action}=b;
  return {action:{...action,email} as FleetAccountAction,confirmationPassword:confirmationPassword as string};
}
type AdminAudit={action:string;outcome:string;subject?:string;targetEmail?:string;siteIds?:string[];workspaceIds?:string[]};
export function fleetAdminRouter(options:{sessions:LocalSessions;accountsFile:string;sites:SiteEnrollment[];workspaceSites:Set<string>;origin:string;audit:(event:AdminAudit)=>Promise<void>}){
  const router=Router({caseSensitive:true,strict:true});
  router.use((req,res,next)=>{void options.sessions.requireControl(fleetSessionToken(req)).then(auth=>{
    if(!auth.administrator)throw new AccessError(403,'Administrator access required');next();
  }).catch(e=>res.status(e instanceof AccessError?e.status:503).json({error:e instanceof AccessError?e.message:'Administration unavailable'}));});
  router.get('/users',(req,res)=>{void listFleetAccounts(options.accountsFile).then(async users=>{
    const auth=await options.sessions.requireControl(fleetSessionToken(req));if(!auth.administrator)throw new AccessError(403,'Administrator access required');
    res.json({users,sites:options.sites.map(s=>({siteId:s.siteId,name:s.name,workspaceEnabled:options.workspaceSites.has(s.siteId)}))});
  }).catch(e=>res.status(e instanceof AccessError?e.status:503).json({error:'Account listing unavailable'}));});
  router.post('/users',(req,res)=>{void(async()=>{
    if(req.headers.origin!==options.origin)throw new AccessError(403,'Same-origin request required');
    const token=fleetSessionToken(req)!,auth=await options.sessions.authenticate(token,false);
    options.sessions.checkCsrf(auth.csrf,req.headers['x-prizm-csrf']);
    const {action,confirmationPassword}=parseAdminAction(req.body,options.workspaceSites);
    const confirmed=await options.sessions.confirmPassword(token,confirmationPassword);
    if(!confirmed.administrator)throw new AccessError(403,'Administrator access required');
    // Audit intent before committing. Never include passwords, request bodies or hashes.
    const event={action:'fleet.account.'+action.kind,subject:confirmed.principal.subject,targetEmail:action.email,
      ...('siteIds' in action?{siteIds:action.siteIds}:{}),...('workspaceIds' in action?{workspaceIds:action.workspaceIds}: {})};
    await options.audit({...event,outcome:'authorized'});
    let result;
    try{result=await manageFleetAccount(options.accountsFile,options.sites,action,{id:confirmed.principal.subject,version:confirmed.accountVersion});}
    catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw new AccessError(409,'Another account update is in progress');if((e as NodeJS.ErrnoException).code)throw new AccessError(503,'Account storage unavailable');throw new AccessError(400,e instanceof Error?e.message:'Account update rejected');}
    // A post-commit audit failure must not claim the account change was rolled back.
    let auditRecorded=true;
    try{await options.audit({...event,outcome:'saved'});}catch{auditRecorded=false;}
    res.json({saved:true,...result,auditRecorded});
  })().catch(e=>res.status(e instanceof AccessError?e.status:503).json({error:e instanceof AccessError?e.message:'Administration unavailable'}));});
  return router;
}
