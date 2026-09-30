import {createHash,timingSafeEqual} from 'node:crypto';
import express, {type RequestHandler} from 'express';
import {readPrivateJson} from '../security/localAccounts';
import {buildSiteSummary,parseCollectorIdentity,type CollectorIdentity} from './siteSummary';
import {parseCollector} from './CollectorPoller';
import type {SiteSummary} from '../../core/fleet/model';
import type {Server} from 'node:https';
import {parseCollectorTls,startCollectorTls} from './collectorTls';

export interface ExportConfig {identity:CollectorIdentity; token:string; host:string; allowLoopbackHttp:boolean}
export function parseExportConfig(value:unknown):ExportConfig {
  const row=value as Record<string,unknown>;
  if(!row || typeof row!=='object' || typeof row.origin!=='string')throw new Error('Invalid collector export configuration');
  const identity=parseCollectorIdentity(row.identity), origin=new URL(row.origin);
  if(origin.origin!==row.origin)throw new Error('Exact collector origin required');
  const collector=parseCollector({...identity,token:row.token,url:row.origin+'/api/fleet/site-summary'},row.allowLoopbackHttp===true);
  return {identity,token:collector.token,host:origin.host,allowLoopbackHttp:origin.protocol==='http:' && row.allowLoopbackHttp===true};
}
const hash=(text:string)=>createHash('sha256').update(text).digest();
/** A prepared projection of canonical data; no route-time acquisition. */
export class CollectorExport {
  private snapshot:SiteSummary|null=null;
  private timer:ReturnType<typeof setInterval>|undefined;
  constructor(readonly config:ExportConfig,private source:()=>unknown,private identityMatches:()=>boolean){}
  prepare(){try{this.snapshot=buildSiteSummary(this.source(),this.config.identity);}catch{this.snapshot=null;}}
  start(){if(this.timer)return;this.prepare();this.timer=setInterval(()=>this.prepare(),4000);this.timer.unref();}
  stop(){clearInterval(this.timer);this.timer=undefined;this.snapshot=null;}
  router():RequestHandler {
    const router=express.Router({caseSensitive:true,strict:true});
    router.use((req,res)=>{
      res.set('Cache-Control','no-store');
      if(req.method!=='GET' || req.path!=='/site-summary' || Object.keys(req.query).length)return res.status(403).json({error:'Collector route not enabled'});
      const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
      if(req.headers.host!==this.config.host || (!req.secure && !(this.config.allowLoopbackHttp && loopback)))return res.status(403).json({error:'Trusted collector transport required'});
      const token=req.headers.authorization ?? '';
      if(token.length>160 || !timingSafeEqual(hash(token),hash('Bearer '+this.config.token)))return res.status(401).json({error:'Collector authentication required'});
      // Check active identity again, without normalizing or acquiring telemetry,
      // before returning a prepared snapshot after a profile change.
      if(!this.snapshot || !this.identityMatches())return res.status(503).json({error:'Collector summary unavailable'});
      res.json(this.snapshot);
    });return router;
  }
}
/** Off by default. Invalid enabled configuration fails closed without legacy fallthrough. */
export function collectorExportFromEnvironment(source:()=>unknown,identityMatches:(identity:CollectorIdentity)=>boolean):{router:RequestHandler;stop:()=>void;ready:Promise<void>}|null {
  const file=process.env.PRIZM_FLEET_EXPORT_CONFIG;if(!file)return null;
  let service:CollectorExport|undefined, stopped=false;
  let handler:RequestHandler|undefined;
  let listener:Server|undefined;
  const close=()=>{handler=undefined;service?.stop();listener?.closeAllConnections();listener?.close();};
  const ready=readPrivateJson(file).then(async raw=>{
    if(stopped)return;
    const config=parseExportConfig(raw), row=raw as Record<string,unknown>;
    service=new CollectorExport(config,source,()=>identityMatches(config.identity));
    service.start();
    if(config.allowLoopbackHttp){
      if(row.tls!==undefined)throw new Error('HTTP test mode cannot include TLS configuration');
      handler=service.router();
    }else{
      listener=await startCollectorTls(parseCollectorTls(row.tls,row.origin as string),service.router());
      if(stopped){close();return;}
      listener.on('error',()=>{close();console.error('[fleet-export] TLS listener unavailable; export disabled');});
      // No HTTP fallback: the legacy port must not expose this enrollment.
      handler=(_req,res)=>{res.status(403).json({error:'Dedicated collector HTTPS listener required'});};
      console.info('[fleet-export] Read-only HTTPS collector ready');
    }
  }).catch(()=>{close();console.error('[fleet-export] Invalid configuration or TLS startup failure; export disabled');});
  const router:RequestHandler=(req,res,next)=>{void ready.then(()=>{if(handler)handler(req,res,next);else res.status(503).json({error:'Collector export unavailable'});});};
  return {router,ready,stop:()=>{stopped=true;close();}};
}
