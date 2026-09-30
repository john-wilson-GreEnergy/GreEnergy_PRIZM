import type {FleetDetails} from './details';
export const fleetMetrics = {
  powerKw:{label:'Real power',unit:'kW'}, reactiveKvar:{label:'Reactive power',unit:'kVAR'},
  targetKw:{label:'Power target',unit:'kW'}, chargeKw:{label:'Available charge',unit:'kW'},
  dischargeKw:{label:'Available discharge',unit:'kW'}, capacityKwh:{label:'Installed capacity',unit:'kWh'},
  storedKwh:{label:'Stored energy',unit:'kWh'}, socPct:{label:'Capacity-weighted SOC',unit:'%'},
  strings:{label:'Strings',unit:''}, warnings:{label:'Warning targets',unit:''}, alarms:{label:'Alarm targets',unit:''},
} as const;
export type MetricKey = keyof typeof fleetMetrics;
export const metricKeys = Object.keys(fleetMetrics) as MetricKey[];
export interface SiteIdentity {siteId:string; blockId:string; stationCode:string; blockIndex:number}
export interface SiteEnrollment extends SiteIdentity {name:string}
export interface Reading {value:number|null; observedAt:string|null; quality:'live'|'stale'|'unknown'; source:string}
export interface SiteSummary extends SiteIdentity {
  schema:'prizm-site-summary-v1'; observedAt:string|null; stale:boolean;
  metrics:Record<MetricKey,Reading>;
  details?:FleetDetails;
}
export interface SiteView extends SiteEnrollment {
  status:'current'|'stale'|'unavailable'|'identity-conflict'; lastReceivedAt:string|null;
  observedAt:string|null; ageMs:number|null; metrics:Record<MetricKey,Reading>;
  details?:FleetDetails;
}
export interface AggregateReading {value:number|null; contributors:string[]; excluded:string[]; complete:boolean}
export interface FleetView {
  schema:'prizm-fleet-v1'; generatedAt:string; readOnly:true;
  sites:SiteView[]; totals:Record<MetricKey,AggregateReading>;
}
export const emptyMetrics = ():Record<MetricKey,Reading> => Object.fromEntries(metricKeys.map(key=>
  [key,{value:null,observedAt:null,quality:'unknown',source:'Unavailable'}])) as Record<MetricKey,Reading>;
