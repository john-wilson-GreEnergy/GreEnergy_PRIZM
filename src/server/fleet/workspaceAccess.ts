import type {Request} from 'express';
import {AccessError} from '../security/localSessions';
import type {VerifiedPrincipal} from '../../core/security/controlPolicyPrototype';
import type {Collector} from './CollectorPoller';

export interface WorkspaceEnrollment {siteId:string;origin:string;token:string}
export function parseWorkspaceEnrollments(value:unknown,collectors:Collector[],fleetOrigin:string):WorkspaceEnrollment[]{
  if(value===undefined)return [];
  if(!Array.isArray(value) || value.length>16)throw Error('Invalid workspace enrollment');
  const fleet=new URL(fleetOrigin),seenSites=new Set<string>(),seenOrigins=new Set<string>();
  return value.map(input=>{
    const w=input as Record<string,unknown>;
    if(!w || Object.keys(w).sort().join(',')!=='origin,siteId,token' || typeof w.siteId!=='string' ||
      typeof w.origin!=='string' || typeof w.token!=='string' || !/^[A-Za-z0-9_-]{43,128}$/.test(w.token))throw Error('Invalid workspace enrollment');
    const collector=collectors.find(c=>c.siteId===w.siteId),url=new URL(w.origin);
    if(!collector || w.token===collector.token || url.origin!==w.origin || url.protocol!=='https:' ||
      url.hostname!==fleet.hostname || !['3444','3445'].includes(url.port) || url.origin===fleet.origin ||
      seenSites.has(w.siteId) || seenOrigins.has(w.origin))throw Error('Workspace requires a distinct fixed HTTPS origin and credential');
    seenSites.add(w.siteId);seenOrigins.add(w.origin);
    return {siteId:w.siteId,origin:w.origin,token:w.token};
  });
}
export function requireFullWorkspace(principal:VerifiedPrincipal,site:{siteId:string;blockId:string}){
  if(principal.state!=='active' || principal.expiresAt<=Date.now() ||
    !['telemetry.view','workspace.full'].every(capability=>principal.grants.some(g=>g.capability===capability && g.siteId===site.siteId && g.blockId===site.blockId && g.scope.kind==='block')))
    throw new AccessError(403,'Full workspace access is not assigned for this site');
}
export function fleetSessionToken(req:Request){
  const tokens=String(req.headers.cookie ?? '').split(';').map(s=>s.trim()).filter(s=>s.startsWith('prizm_fleet_session='));
  return tokens.length===1?tokens[0].slice('prizm_fleet_session='.length):undefined;
}
/** Reject path ambiguity before Express decoding or upstream URL normalization. */
export function workspacePath(raw:string):string {
  const path=raw.split('?')[0];
  if(!path.startsWith('/') || path.startsWith('//') || /[%\\\x00-\x20#]/.test(path) || path.split('/').some(s=>s==='.' || s==='..') || path.includes('//'))throw new AccessError(400,'Invalid workspace path');
  return path;
}
export function workspaceRouteAllowed(method:string,path:string):boolean {
  if(!['GET','POST','PUT','PATCH','DELETE'].includes(method))return false;
  // Express routes are case-insensitive; apply the same normalization to denials.
  path=path.toLowerCase();
  if(path.startsWith('/api/fleet') || path.startsWith('/api/access'))return false;
  if(method!=='GET' && (path.startsWith('/api/settings/profiles') || path==='/api/settings/test-connection' || path==='/api/local/demo-toggle'))return false;
  if(path.startsWith('/api/') || path.startsWith('/turtle/') || path.startsWith('/tools/'))return true;
  return method==='GET' && (path==='/' || /^\/assets\/[A-Za-z0-9_.-]+\.(js|css|woff2?|ttf|png|svg)$/.test(path) ||
    /^\/(logo-transparent\.svg|favicon\.ico)$/.test(path));
}
// These GET endpoints are passive downloads/streams and cannot set equipment state.
export function passiveWorkspaceGet(path:string):boolean {
  return path==='/' || path.startsWith('/assets/') || path==='/logo-transparent.svg' || path==='/favicon.ico' ||
    path==='/api/local/site-data/strings-stream' || path==='/api/settings/profiles/export' ||
    /^\/api\/local\/diagnostic-session\/[A-Za-z0-9_-]+\/export\/(json|csv)$/.test(path) ||
    /^\/api\/local\/reports\/download\/[A-Za-z0-9_.-]+(?:\/report\.(pdf|json))?$/.test(path) ||
    /^\/turtle\/tools\/report\/ems\/(ip_modbus_associations|stringIPMap|ipMap)\.csv$/.test(path);
}

/** Reviewed display routes only. Unknown routes, including GET controls, need an unlock. */
export function monitoringWorkspaceGet(path:string):boolean {
  return path==='/api/local/corrective-guidance' || passiveWorkspaceGet(path) ||
    /^\/api\/local\/site-data(?:\/|$)/.test(path) ||
    ['/api/local/snapshot','/api/local/snapshot/site-operations-summary','/api/local/pcs/dashboard',
      '/api/local/feather/devices','/api/local/corrective-actions','/api/local/corrective-actions/matrix',
      '/api/local/system/boot-status','/api/local/system/commissioning','/api/local/connection',
      '/api/local/ems/connection-status','/api/local/ems/mode','/api/local/ems/sources','/api/local/site-metrics',
      '/api/local/site-metrics/history','/api/local/status','/api/local/block','/api/local/arrays','/api/local/strings',
      '/api/local/snapshot/pcses','/api/local/pcses','/api/local/snapshot/topology','/api/local/topology',
      '/api/local/first-responder','/api/local/status-codes','/api/local/modbus-map','/api/local/ip-map',
      '/api/local/string-ip-map','/api/local/mode','/api/local/controller-statistics','/api/local/last-call',
      '/api/settings/profiles','/api/settings/active-profile','/api/settings/site-health-visual-thresholds',
      '/api/local/strings/dashboard','/api/local/strings/dashboard/','/api/local/strings/dashboard/corrective-actions',
      '/api/local/strings/dashboard/contactors/state','/api/local/overview/discovery',
      '/api/local/workspaces/operator','/api/local/workspaces/technician','/api/local/workspaces/engineering',
      '/api/local/site-operations/summary'].includes(path) ||
    /^\/api\/local\/strings\/(?:dashboard\/)?\d+\/\d+\/detail$/.test(path) ||
    /^\/api\/local\/workspaces\/technician\/strings\/\d+\/\d+$/.test(path);
}
export function monitoringWorkspaceRequest(method:string,path:string):boolean{
  return method==='GET'&&monitoringWorkspaceGet(path) || method==='POST'&&[
    '/api/local/site-data/thermal/targets/query','/api/local/site-data/thermal/site-history/query',
  ].includes(path);
}
