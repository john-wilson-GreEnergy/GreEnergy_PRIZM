import {emptyMetrics,metricKeys,type FleetView,type Reading,type SiteEnrollment,type SiteSummary,type SiteView} from '../../core/fleet/model';
import {parseFleetDetails,ageFleetDetails} from './detailValidation';

export const FLEET_TTL_MS=15_000;
const record=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
export const identifier=(v:unknown):v is string=>typeof v==='string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(v);
export class IdentityConflict extends Error {}
export function parseEnrollment(value:unknown):SiteEnrollment {
  if(!record(value) || !identifier(value.siteId) || !identifier(value.blockId) || !identifier(value.stationCode) ||
    !Number.isSafeInteger(value.blockIndex) || Number(value.blockIndex)<1 || typeof value.name!=='string' || !value.name.trim() || value.name.length>120) throw new Error('Invalid fleet site enrollment');
  return {siteId:value.siteId,blockId:value.blockId,stationCode:value.stationCode,blockIndex:Number(value.blockIndex),name:value.name};
}
export function observationAge(stamp:string|null,now:number):number|null {
  if(!stamp)return null;
  const time=Date.parse(stamp);return Number.isFinite(time) && time<=now ? now-time : null;
}
const validStamp=(value:unknown)=>value===null || (typeof value==='string' && value.length<=40 && Number.isFinite(Date.parse(value)));
export function parseSummary(value:unknown,site:SiteEnrollment):SiteSummary {
  if(!record(value))throw new Error('Invalid site summary');
  for(const key of ['siteId','blockId','stationCode','blockIndex'] as const) if(value[key]!==site[key])throw new IdentityConflict('Collector identity conflict');
  if(value.schema!=='prizm-site-summary-v1' || typeof value.stale!=='boolean' || !validStamp(value.observedAt) || !record(value.metrics))throw new Error('Invalid site summary');
  const metrics=emptyMetrics();
  for(const key of metricKeys){
    const r=value.metrics[key];
    if(!record(r) || !(r.value===null || (typeof r.value==='number' && Number.isFinite(r.value))) ||
      !validStamp(r.observedAt) || typeof r.quality!=='string' || !['live','stale','unknown'].includes(r.quality) || typeof r.source!=='string' || r.source.length>120)throw new Error('Invalid metric');
    const v=r.value as number|null;
    if(v!==null && (Math.abs(v)>1e12 || (key==='socPct' && (v<0 || v>100)) ||
      (['chargeKw','dischargeKw','capacityKwh','storedKwh','strings','warnings','alarms'].includes(key) && v<0) ||
      (['strings','warnings','alarms'].includes(key) && !Number.isSafeInteger(v))))throw new Error('Invalid metric range');
    metrics[key]={value:v,observedAt:r.observedAt as string|null,quality:r.quality as Reading['quality'],source:r.source};
  }
  return {schema:'prizm-site-summary-v1',siteId:site.siteId,blockId:site.blockId,stationCode:site.stationCode,blockIndex:site.blockIndex,
    stale:value.stale,observedAt:value.observedAt as string|null,metrics,details:parseFleetDetails(value.details)};
}
type Entry={summary:SiteSummary|null; receivedAt:string|null; failure:'unavailable'|'identity-conflict'|null};
/** Canonical fleet state only. Never accesses equipment, credentials or routes. */
export class FleetBroker {
  private readonly sites:SiteEnrollment[];
  private readonly entries=new Map<string,Entry>();
  constructor(sites:SiteEnrollment[],private now=Date.now){
    if(!sites.length || sites.length>16)throw new Error('Enroll between 1 and 16 sites');
    this.sites=sites.map(parseEnrollment);
    if(new Set(this.sites.map(s=>s.siteId)).size!==sites.length)throw new Error('Duplicate site ID');
    if(new Set(this.sites.map(s=>JSON.stringify([s.stationCode,s.blockIndex]))).size!==sites.length)throw new Error('Duplicate station/block enrollment');
  }
  enrollments(){return structuredClone(this.sites);}
  accept(siteId:string,payload:unknown){
    const site=this.sites.find(s=>s.siteId===siteId);if(!site)throw new Error('Unknown collector');
    try {
      const summary=parseSummary(payload,site),previous=this.entries.get(siteId);
      if(summary.observedAt && observationAge(summary.observedAt,this.now())===null)throw new Error('Future observation');
      if(previous?.summary?.observedAt && summary.observedAt && Date.parse(summary.observedAt)<Date.parse(previous.summary.observedAt))throw new Error('Out-of-order summary');
      this.entries.set(siteId,{summary,receivedAt:new Date(this.now()).toISOString(),failure:null});
    }catch(error){this.fail(siteId,error instanceof IdentityConflict?'identity-conflict':'unavailable');throw error;}
  }
  fail(siteId:string,failure:'unavailable'|'identity-conflict'='unavailable'){
    if(!this.sites.some(s=>s.siteId===siteId))throw new Error('Unknown collector');
    const previous=this.entries.get(siteId);
    this.entries.set(siteId,{summary:previous?.summary ?? null,receivedAt:previous?.receivedAt ?? null,failure});
  }
  view(allowedIds:ReadonlySet<string>):FleetView {
    const now=this.now();
    const sites:SiteView[]=this.sites.filter(s=>allowedIds.has(s.siteId)).map(site=>{
      const entry=this.entries.get(site.siteId),summary=entry?.summary,ageMs=observationAge(summary?.observedAt ?? null,now);
      const status=entry?.failure ?? (!summary?'unavailable':summary.stale || ageMs===null || ageMs>=FLEET_TTL_MS?'stale':'current');
      const metrics=structuredClone(summary?.metrics ?? emptyMetrics());
      for(const key of metricKeys){const r=metrics[key],age=observationAge(r.observedAt,now);
        if(status!=='current' || age===null || age>=FLEET_TTL_MS)r.quality=r.value===null?'unknown':'stale';}
      return {...site,status,observedAt:summary?.observedAt ?? null,ageMs,lastReceivedAt:entry?.receivedAt ?? null,metrics,details:ageFleetDetails(summary?.details,now,status==='current')};
    });
    const totals=Object.fromEntries(metricKeys.map(key=>{
      const eligible=sites.filter(s=>s.status==='current' && s.metrics[key].quality==='live' && s.metrics[key].value!==null &&
        (key!=='socPct' || (s.metrics.capacityKwh.quality==='live' && (s.metrics.capacityKwh.value ?? 0)>0)));
      const contributors=eligible.map(s=>s.siteId),excluded=sites.filter(s=>!contributors.includes(s.siteId)).map(s=>s.siteId);
      const value=!eligible.length?null:key==='socPct'
        ? eligible.reduce((n,s)=>n+s.metrics.socPct.value!*s.metrics.capacityKwh.value!,0)/eligible.reduce((n,s)=>n+s.metrics.capacityKwh.value!,0)
        : eligible.reduce((n,s)=>n+s.metrics[key].value!,0);
      return [key,{value,contributors,excluded,complete:sites.length>0 && !excluded.length}];
    })) as FleetView['totals'];
    return {schema:'prizm-fleet-v1',generatedAt:new Date(now).toISOString(),readOnly:true,sites,totals};
  }
}
