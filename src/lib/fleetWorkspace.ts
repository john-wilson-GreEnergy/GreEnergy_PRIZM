import {remoteHome} from "./remoteExperience";
export interface FleetWorkspaceContext {siteId:string;siteName:string;stationCode:string;blockIndex:number;fleetUrl:string;email:string;csrf:string;fullControl:boolean;remoteReadOnly?:boolean;remoteAccess?:boolean}
export function remoteWorkspacePrefix(pathname=typeof window==='undefined'?'':window.location.pathname){return /^\/desktop\/[A-Za-z0-9_-]{1,80}\//.exec(pathname)?.[0].slice(0,-1)??'';}
export const remoteReadOnlyWorkspace=()=>!!remoteWorkspacePrefix()&&!(context?.remoteAccess===true&&context.fullControl===true&&context.remoteReadOnly===false);
export const workspaceReadUrl=(url:string)=>remoteWorkspacePrefix()+url;
export const remoteViewTabs=new Set(['overview','one-line','corrective-actions','arrays-strings','site-health','pcs-dashboard','feather-hvac','cell-history','site-analytics','troubleshooting-library']);
let context:FleetWorkspaceContext|null=null;
let directRequest:typeof fetch|undefined;
export async function refreshFleetWorkspace(){
  if(!directRequest)throw Error('Workspace is not initialized');
  const response=await directRequest(remoteWorkspacePrefix()+'/api/fleet/workspace-context',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('Sign in to Fleet first, then resume this view.');
  const next=parseWorkspaceContext(await response.json(),window.location.origin);
  if(remoteWorkspacePrefix()&&remoteWorkspacePrefix()!=='/desktop/'+next.siteId)throw Error('Remote site identity mismatch');
  if(context && (next.email!==context.email||next.fullControl!==context.fullControl)){window.location.reload();throw Error('Account access changed; reloading the workspace.');}
  context=next;return next;
}
export const getFleetWorkspace=()=>context;
export function isFleetWorkspacePort(port:string){return port==='3444' || port==='3445';}
export function fleetReturnUrl(location:{protocol:string;hostname:string;pathname?:string;origin?:string}){return location.pathname&&remoteWorkspacePrefix(location.pathname)?`${location.origin}${typeof navigator==='undefined'?'/fleet/':remoteHome()}`:`${location.protocol}//${location.hostname}:3443/`;}
export function parseWorkspaceContext(value:unknown,origin:string):FleetWorkspaceContext{
  const c=value as FleetWorkspaceContext,url=new URL(origin);
  if(!c || typeof c.siteId!=='string' || typeof c.siteName!=='string' || typeof c.stationCode!=='string' || !Number.isInteger(c.blockIndex) || c.blockIndex<1 ||
    typeof c.email!=='string' || typeof c.csrf!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(c.csrf) ||
    (c.remoteAccess===true||c.remoteReadOnly===true?typeof c.remoteReadOnly!=='boolean'||c.fullControl!==!c.remoteReadOnly||![origin+'/mobile/',origin+'/fleet/'].includes(c.fleetUrl):c.fullControl!==true||c.fleetUrl!==fleetReturnUrl(url)+'#site='+encodeURIComponent(c.siteId)))throw Error('Invalid site workspace identity');
  return (c.remoteAccess||c.remoteReadOnly)&&c.fleetUrl===origin+'/fleet/'&&typeof navigator!=='undefined'?{...c,fleetUrl:origin+remoteHome()}:c;
}
/** Dedicated origins keep the unmodified full utility's URLs and caches site-local. */
export async function initializeFleetWorkspace(){
  const prefix=remoteWorkspacePrefix();
  if(!prefix&&!isFleetWorkspacePort(window.location.port))return;
  const request=window.fetch.bind(window),origin=window.location.origin;
  directRequest=request;
  const ready=(async()=>{
    const response=await request(prefix+'/api/fleet/workspace-context',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Sign in to Fleet to open this site workspace.');
    context=parseWorkspaceContext(await response.json(),origin);
    if(prefix&&(!(context.remoteAccess||context.remoteReadOnly)||prefix!=='/desktop/'+context.siteId))throw Error('Remote site identity mismatch');
    if(prefix){document.documentElement.dataset.prizmOperations='enabled';document.documentElement.dataset.prizmRemoteReadOnly=String(context.remoteReadOnly);}
    document.documentElement.dataset.fleetWorkspace=context.siteId;
    return context;
  })();
  window.fetch=async(input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input),window.location.href);
    if(url.origin!==origin)return request(input,init); // Never send a session token off-origin.
    // Remote reads use published snapshots; never ask the collector to repoll equipment.
    if(prefix&&url.pathname.startsWith('/api/local/site-data/'))url.searchParams.delete('refresh');
    await ready;const ctx=context!,headers=new Headers(input instanceof Request?input.headers:undefined);
    new Headers(init?.headers).forEach((v,k)=>headers.set(k,v));headers.set('X-Prizm-Csrf',ctx.csrf);
    const target=prefix&&/^\/(api|turtle|tools)\//.test(url.pathname)?prefix+url.pathname+url.search:input;
    // Rewriting a Request as a bare URL would silently discard its method/body.
    // Preserve uploads and control payloads; never reconstruct a command as GET.
    const forwarded=input instanceof Request&&typeof target==='string'?new Request(new URL(target,origin),input):target;
    const response=await request(forwarded,{...init,headers,credentials:'same-origin'});
    if(response.status===401)window.dispatchEvent(new Event('prizm-workspace-access-ended'));
    if(response.status===423)window.dispatchEvent(new Event('prizm-workspace-controls-locked'));
    return response;
  };
  await ready;
  let lastTouch=0;
  const activity=()=>{
    if(Date.now()-lastTouch<60000)return;lastTouch=Date.now();
    void window.fetch('/api/fleet/workspace-touch',{method:'POST'}).catch(()=>{});
  };
  window.addEventListener('pointerdown',activity);window.addEventListener('keydown',activity);
}
