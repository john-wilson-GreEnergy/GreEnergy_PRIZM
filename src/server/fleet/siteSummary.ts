import {emptyMetrics, type SiteEnrollment, type SiteSummary, type MetricKey} from '../../core/fleet/model';
import {IdentityConflict, parseEnrollment, parseSummary} from './FleetBroker';
import {buildFleetDetails} from './detailProjection';

export interface CollectorIdentity extends SiteEnrollment {profileId:string; emsBaseUrl:string}
const obj=(value:unknown):Record<string,unknown>=>value && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:{};
export function parseCollectorIdentity(value:unknown):CollectorIdentity {
  const row=obj(value), site=parseEnrollment(value);
  if(typeof row.profileId!=='string' || !row.profileId || typeof row.emsBaseUrl!=='string')throw new Error('Collector profile and EMS enrollment required');
  const url=new URL(row.emsBaseUrl);
  if(!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)throw new Error('Invalid enrolled EMS URL');
  return {...site,profileId:row.profileId,emsBaseUrl:row.emsBaseUrl};
}

/** Projects the existing canonical block view. No device acquisition or source fallback. */
export function buildSiteSummary(view:unknown, enrolled:CollectorIdentity):SiteSummary {
  const data=obj(view), identity=obj(data.siteIdentity), live=obj(data.liveStatus);
  if(identity.activeProfileId!==enrolled.profileId || identity.stationCode!==enrolled.stationCode ||
    identity.blockIndex!==enrolled.blockIndex || identity.emsBaseUrl!==enrolled.emsBaseUrl)throw new IdentityConflict('Active collector profile does not match enrollment');
  const stamp=typeof live.lastUpdated==='string'?live.lastUpdated:null;
  const stale=live.stale!==false || live.liveSucceeded!==true || live.cacheUsed===true || !['LIVE','PARTIAL'].includes(String(live.state));
  const metrics=emptyMetrics();
  const put=(key:MetricKey,value:unknown,observedAt:string|null,valid:boolean,source:string)=>{
    if(typeof value==='number' && Number.isFinite(value))metrics[key]={value,observedAt,quality:valid?'live':'stale',source};
  };
  const modbus=obj(obj(data.blockOperatingSummary).modbus), health=obj(data.modbusTelemetry);
  const modbusStamp=typeof health.capturedAt==='string'?health.capturedAt:null;
  for(const [key,field] of Object.entries({powerKw:'measuredKW',reactiveKvar:'measuredKVAR',targetKw:'targetKW',
    chargeKw:'availableChargeKW',dischargeKw:'availableDischargeKW',socPct:'stateOfChargePct'})){
    put(key as MetricKey,modbus[field],modbusStamp,health.available===true && health.stale===false,'EMS Modbus');
  }
  put('capacityKwh',obj(data.fleetCapacity).installedCapacityKWh,stamp,!stale,'Canonical installed capacity (may be profile-derived)');
  // No verified complete stored-energy rollup exists here. Do not sum partial
  // buckets, treat missing energy as zero, or estimate stored energy from SOC.
  put('strings',obj(data.stringSummary).totalStrings,stamp,!stale && obj(data.stringSummary).valid===true,'Canonical string inventory');
  const topology=obj(data.topologyStatus);
  put('warnings',topology.warningTargetCount,stamp,!stale,'Canonical warning targets');
  put('alarms',topology.alarmTargetCount,stamp,!stale,'Canonical alarm targets');
  return parseSummary({schema:'prizm-site-summary-v1',...enrolled,observedAt:stamp,stale,metrics,details:buildFleetDetails(data,data.fleetDetailSnapshot)},enrolled);
}
