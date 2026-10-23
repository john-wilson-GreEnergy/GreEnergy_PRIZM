/** Local-review transport only. Fixed Dell origin, verified system TLS, no device/control routes. */
import express from 'express';
import {execFile} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {projectMobileHvac,unavailableHvac} from './mobile-hvac';
import type {SiteView} from '../src/core/fleet/model';
import {projectSitePowerFlow} from '../src/server/fleet/powerFlow';
import {attachFleetHvacs} from '../src/server/notifications/hvacIssueReview';
export const mobileOrigin='http://127.0.0.1:3206';
const dellOrigin='https://10.0.0.15:3443';
export const mobileRoutes=new Map([
 ['/api/fleet/session','GET'],['/api/fleet/summary','GET'],
 ['/api/fleet/login','POST'],['/api/fleet/logout','POST'],['/api/fleet/touch','POST'],
]);
export function mobileRequestAllowed(method:string,path:string,host:string|undefined,origin:string|undefined,fetchSite:string|undefined,expectedOrigin=mobileOrigin){
 return host===new URL(expectedOrigin).host&&(!origin||origin===expectedOrigin)&&(!fetchSite||['same-origin','none'].includes(fetchSite))&&mobileRoutes.get(path)===method&&(method==='GET'||origin===expectedOrigin);
}
// Server-only targets. Not added to the client route allowlist; no arbitrary workspace proxy.
const thermalTargets=new Map([['/internal/thermal/ss3','https://10.0.0.15:3444'],['/internal/thermal/ss4','https://10.0.0.15:3445']]);
interface UpstreamRequest{path:string;method:string;cookie?:string;csrf?:string;body?:string}
interface UpstreamResponse{status:number;data:unknown;cookie?:string}
export type MobileTransport=(req:UpstreamRequest)=>Promise<UpstreamResponse>;
/** curl uses the Mac's already trusted CA. Secrets go through stdin, not process arguments/files. */
export const dellTransport:MobileTransport=req=>new Promise((resolve,reject)=>{
 const thermalOrigin=thermalTargets.get(req.path);
 if(thermalOrigin?req.method!=='GET'||!req.cookie:mobileRoutes.get(req.path)!==req.method)return reject(Error('Not allowed'));
 if([req.cookie,req.csrf].some(v=>v&&/[\r\n]/.test(v)))return reject(Error('Invalid header'));
 const origin=thermalOrigin??dellOrigin;
 const config=[`url = ${JSON.stringify(origin+(thermalOrigin?'/api/local/site-data/thermal':req.path))}`,`request = ${JSON.stringify(req.method)}`,`header = ${JSON.stringify('Origin: '+origin)}`,
 ...(req.cookie?[`header = ${JSON.stringify('Cookie: prizm_fleet_session='+req.cookie)}`]:[]),
 ...(req.csrf?[`header = ${JSON.stringify('X-Prizm-Csrf: '+req.csrf)}`]:[]),
 ...(req.body?[`header = "Content-Type: application/json"`,`data = ${JSON.stringify(req.body)}`]:[])].join('\n');
 const child=execFile('/usr/bin/curl',['--silent','--show-error','--proto','=https','--connect-timeout','2','--max-time',thermalOrigin?'2':'5','--max-redirs','0','--dump-header','-','--config','-'],{timeout:5800,maxBuffer:20*1024*1024,encoding:'utf8'},(error,stdout)=>{
  // Never forward curl diagnostics/configuration, cookies, or authentication errors to logs.
  if(error)return reject(Error('Fleet HTTPS unavailable'));
  try{
   const boundary=stdout.indexOf('\r\n\r\n');if(boundary<0)throw Error('Invalid HTTP');
   const headers=stdout.slice(0,boundary),status=Number(/^HTTP\/\S+ (\d{3})/.exec(headers)?.[1]);
   const cookie=/^set-cookie:\s*prizm_fleet_session=([^;\r\n]*)/im.exec(headers)?.[1];
   const data=JSON.parse(stdout.slice(boundary+4));
   resolve({status,data,cookie});
  }catch{reject(Error('Invalid Fleet response'));}
 });
 child.stdin?.end(config+'\n');
});
export function mobilePreviewApi(transport:MobileTransport=dellTransport,options:{origin?:string;remoteReview?:boolean}={}){
 const expectedOrigin=options.origin??mobileOrigin,secure=new URL(expectedOrigin).protocol==='https:';
 if(!secure&&![mobileOrigin,'http://127.0.0.1:3210'].includes(expectedOrigin))throw Error('LAN preview requires HTTPS');
 const app=express(),sessions=new Map<string,{cookie:string;expires:number;csrf?:string}>();
 app.disable('x-powered-by');app.set('case sensitive routing',true);app.set('strict routing',true);
 app.use((req,res,next)=>{
  res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  if(req.headers.host!==new URL(expectedOrigin).host||req.headers.origin&&req.headers.origin!==expectedOrigin||req.headers['sec-fetch-site']&&!['same-origin','none'].includes(String(req.headers['sec-fetch-site'])))return res.status(403).json({error:'Local same-origin preview only'});
  if(req.path.startsWith('/api/')&&!mobileRequestAllowed(req.method,req.originalUrl,req.headers.host,req.headers.origin,String(req.headers['sec-fetch-site']??'' )||undefined,expectedOrigin))return res.status(403).json({error:'Read-only preview: route disabled'});
  if(!['GET','POST'].includes(req.method))return res.status(403).end();
  next();
 });
 app.use(express.json({limit:'4kb',strict:true}));
 app.use('/api',async(req,res)=>{
  const path=req.originalUrl;
  const id=String(req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith('prizm_mobile_preview='))?.slice('prizm_mobile_preview='.length);
  for(const [key,value] of sessions)if(value.expires<=Date.now())sessions.delete(key);
  const session=id?sessions.get(id):undefined;
  if(path!=='/api/fleet/login'&&!session)return res.status(401).json({error:'Sign in required'});
  if(path==='/api/fleet/login'&&(!req.body||Object.keys(req.body).sort().join(',')!=='email,password'||typeof req.body.email!=='string'||typeof req.body.password!=='string'))return res.status(400).json({error:'Email and password required'});
  if(path==='/api/fleet/login'&&sessions.size>=16)return res.status(429).json({error:'Preview session limit reached'});
  try{
   const result=await transport({path,method:req.method,cookie:session?.cookie,csrf:typeof req.headers['x-prizm-csrf']==='string'?req.headers['x-prizm-csrf']:undefined,body:path==='/api/fleet/login'?JSON.stringify({email:req.body.email,password:req.body.password}):undefined});
   if(result.status===401&&id)sessions.delete(id);
   if(path==='/api/fleet/login'&&result.status===200){
    if(!result.cookie)throw Error('No session');
    if(id)sessions.delete(id);const nextId=randomBytes(32).toString('hex');
    sessions.set(nextId,{cookie:result.cookie,expires:Date.now()+86400000});
    res.cookie('prizm_mobile_preview',nextId,{httpOnly:true,secure,sameSite:'strict',path:'/',maxAge:86400000});
    return res.json({authenticated:true});
   }
   if(path==='/api/fleet/logout'){
    if(id)sessions.delete(id);res.clearCookie('prizm_mobile_preview',{httpOnly:true,secure,sameSite:'strict',path:'/'});
   }
   if(result.status!==200)return res.status([400,401,403,429].includes(result.status)?result.status:503).json({error:'Fleet request unavailable'});
   if(path==='/api/fleet/session'){
    const s=result.data as Record<string,unknown>;
    if(session&&typeof s.csrf==='string')session.csrf=s.csrf;
    const workspaces=options.remoteReview&&Array.isArray(s.workspaces)?s.workspaces.filter((w:unknown):w is {siteId:string}=>!!w&&typeof w==='object'&&'siteId' in w&&typeof w.siteId==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(w.siteId)).map(w=>({siteId:w.siteId,origin:'https://prizm.greenergyresources.org/desktop/'+w.siteId+'/'})):[];
    return res.json({email:s.email,csrf:s.csrf,idleExpiresAt:s.idleExpiresAt,simulated:s.simulated===true,refreshIntervalMs:s.refreshIntervalMs,readOnly:true,remoteReadOnly:options.remoteReview===true,administrator:false,workspaces});
   }
   if(path==='/api/fleet/summary'){
    const data=result.data as {schema?:string;readOnly?:boolean;sites?:SiteView[]};
    if(data.schema!=='prizm-fleet-v1'||data.readOnly!==true||!Array.isArray(data.sites))throw Error('Invalid summary');
    if(data.sites.length>32)throw Error('Too many sites');
    data.sites=await Promise.all(data.sites.map(async site=>{
     attachFleetHvacs(site.details.issues);
     // Only sites in this authenticated Fleet response are considered; the workspace
     // independently rechecks the same user's grants on every thermal read.
     const key=site.blockIndex===1?(site.stationCode==='BHE0020'?'ss3':site.stationCode==='BHE0021'?'ss4':null):null;
     let mobileHvac=unavailableHvac();
     if(key&&site.status==='current')try{
      const r=await transport({path:'/internal/thermal/'+key,method:'GET',cookie:session?.cookie,csrf:session?.csrf});
      mobileHvac=r.status===200?projectMobileHvac(r.data):unavailableHvac(r.status===403?'HVAC detail requires existing site workspace permission.':'HVAC snapshot unavailable.');
     }catch{/* Keep Fleet available; never substitute old HVAC readings. */}
     return {...site,mobileHvac,...(process.env.PRIZM_FLEET_POWER_FLOW==='false'?{}:{powerFlow:projectSitePowerFlow(site,Date.now())})};
    }));
   }
   res.json(result.data);
  }catch{res.status(503).json({error:'Dell Fleet connection unavailable. No cached telemetry is served.'});}
 });
 return app;
}
