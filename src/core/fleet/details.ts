import type {Reading} from './model';
export type Quality=Reading['quality'];
export interface DetailRange {minimum:number|null;average:number|null;maximum:number|null;delta:number|null;reportingStrings:number;expectedStrings:number;partial:boolean}
export interface FleetArray {
  number:number;observedAt:string|null;quality:Quality;
  stringCount:number|null;onlineStrings:number|null;outOfRotation:number|null;
  socPct:number|null;powerKw:number|null;busVoltage:number|null;
  pcsState:string;rotation:'IN'|'OUT'|'UNKNOWN';pcsQuality:Quality;pcsObservedAt:string|null;
  temperatureC:DetailRange;voltageMv:DetailRange;
}
export const issueCategories={battery:'Cell / String',hvac:'HVAC / Environmental',pcs:'PCS',availability:'Contactors / Rotation',other:'Other site issues'} as const;
export type IssueCategory=keyof typeof issueCategories;
export interface IssueCounts {alarms:number|null;warnings:number|null;info:number|null;unknown:number|null;targets:number|null}
export interface FleetFinding {code:string;title:string;category:IssueCategory;severity:'alarm'|'warning'|'info'|'unknown';targetCount:number;targets:string[]}
export interface FleetSensorTrip {
  id:string;label:string;kind:string;
  condition?:'trip'|'communication'|'temperature'|'reported-status';
  status?:string;message?:string;occurredAt?:string|null;
  source?:string;sourcePath?:string;findings?:string[];
}
export interface FleetDetails {
  version:1;observedAt:string|null;quality:Quality;arrays:FleetArray[];omittedArrays:number;
  issues:{observedAt:string|null;quality:Quality;categories:Record<IssueCategory,IssueCounts>;findings:FleetFinding[];omittedGroups:number;notes:string[]};
  sensors:{observedAt:string|null;quality:Quality;trips:number|null;known:number;total:number;active:FleetSensorTrip[];omittedTrips:number};
}
export const emptyRange=():DetailRange=>({minimum:null,average:null,maximum:null,delta:null,reportingStrings:0,expectedStrings:0,partial:true});
export const emptyDetails=():FleetDetails=>({version:1,observedAt:null,quality:'unknown',arrays:[],omittedArrays:0,
  issues:{observedAt:null,quality:'unknown',categories:Object.fromEntries(Object.keys(issueCategories).map(k=>[k,{alarms:null,warnings:null,info:null,unknown:null,targets:null}])) as FleetDetails['issues']['categories'],findings:[],omittedGroups:0,notes:[]},
  sensors:{observedAt:null,quality:'unknown',trips:null,known:0,total:0,active:[],omittedTrips:0}});
