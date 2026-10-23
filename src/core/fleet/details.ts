import type {Reading} from './model';
export type Quality=Reading['quality'];
export const fleetDetailLimits={groups:128,targets:8192,summaryBytes:4*1024*1024} as const;
export interface FleetPcsReading<T=string|number> {value:T|null;quality:Quality;observedAt:string|null;source:'EMS'|'SMA HTTP'|'SMA stream'|'PCS Modbus'|'Unknown';deviceObservedAt?:string|null;clockSkew?:boolean}
export interface FleetPcs {
  id:string;array:number;number:number;
  status:FleetPcsReading<string>;rotation:FleetPcsReading<string>;
  acContactor:FleetPcsReading<string>;dc1:FleetPcsReading<string>;dc2:FleetPcsReading<string>;dc3:FleetPcsReading<string>;
  insulationKohm:FleetPcsReading<number>;maxIgbtF:FleetPcsReading<number>;
}
export interface FleetIssueTarget {id:string;label:string;array:number|null;string:number|null;bpc:number|null;cell:number|null;pcs:number|null;segment:number|null;block?:number|null;hvacUnit?:number|null}
export interface FleetConsolidatedTarget extends FleetIssueTarget {cells:string;reportedTargets:number;isBpc:boolean}
export interface FleetBpcCounts {uniqueBpcs:number;multipleIssues:number;unmappedTargets:number;partial:boolean}
export interface FleetBpcIssue {key:string;code:string;title:string;category:IssueCategory;severity:FleetFinding['severity'];cells:string;reportedTargets:number}
export interface FleetBpcDevice {id:string;array:number;string:number;bpc:number;issues:FleetBpcIssue[];issueCount:number;severity:FleetFinding['severity'];cells:string;categories:IssueCategory[]}
export interface FleetBalancerQuantity {bpc:number;chargeOnly:number;dischargeOnly:number;both:number;quantity:number}
export interface FleetBalancerInventory {rows:FleetBalancerQuantity[];total:number;unmappedTargets:number;partial:boolean}
export interface FleetBpcReview {devices:FleetBpcDevice[];scopes:Record<string,FleetBpcCounts>;balancerInventory?:FleetBalancerInventory}
export interface DetailRange {minimum:number|null;average:number|null;maximum:number|null;delta:number|null;reportingStrings:number;expectedStrings:number;partial:boolean}
export interface FleetArray {
  number:number;observedAt:string|null;quality:Quality;
  stringCount:number|null;onlineStrings:number|null;outOfRotation:number|null;
  socPct:number|null;powerKw:number|null;busVoltage:number|null;
  socObservedAt?:string|null;socQuality?:Quality;
  pcsState:string;rotation:'IN'|'OUT'|'UNKNOWN';pcsQuality:Quality;pcsObservedAt:string|null;
  temperatureC:DetailRange;voltageMv:DetailRange;
}
export const issueCategories={battery:'Cell / String',hvac:'HVAC / Environmental',pcs:'PCS',availability:'Contactors / Rotation',other:'Other site issues'} as const;
export type IssueCategory=keyof typeof issueCategories;
export interface IssueCounts {alarms:number|null;warnings:number|null;info:number|null;unknown:number|null;targets:number|null}
export interface FleetFinding {code:string;title:string;category:IssueCategory;severity:'alarm'|'warning'|'info'|'unknown';targetCount:number;targets:string[];targetRows?:FleetIssueTarget[];consolidatedTargets?:FleetConsolidatedTarget[];bpcCounts?:Record<string,number>}
export interface FleetSensorTrip {
  id:string;label:string;kind:string;
  condition?:'trip'|'communication'|'temperature'|'reported-status';
  status?:string;message?:string;occurredAt?:string|null;
  source?:string;sourcePath?:string;findings?:string[];
}
export interface FleetDetails {
  version:1;observedAt:string|null;quality:Quality;arrays:FleetArray[];omittedArrays:number;pcs?:FleetPcs[];
  issues:{observedAt:string|null;quality:Quality;categories:Record<IssueCategory,IssueCounts>;findings:FleetFinding[];omittedGroups:number;notes:string[];bpcReview?:FleetBpcReview;hvacReview?:import('../hvacIssueReview').HvacIssueReview};
  sensors:{observedAt:string|null;quality:Quality;trips:number|null;known:number;total:number;active:FleetSensorTrip[];omittedTrips:number};
}
export const emptyRange=():DetailRange=>({minimum:null,average:null,maximum:null,delta:null,reportingStrings:0,expectedStrings:0,partial:true});
export const emptyDetails=():FleetDetails=>({version:1,observedAt:null,quality:'unknown',arrays:[],omittedArrays:0,
  issues:{observedAt:null,quality:'unknown',categories:Object.fromEntries(Object.keys(issueCategories).map(k=>[k,{alarms:null,warnings:null,info:null,unknown:null,targets:null}])) as FleetDetails['issues']['categories'],findings:[],omittedGroups:0,notes:[]},
  sensors:{observedAt:null,quality:'unknown',trips:null,known:0,total:0,active:[],omittedTrips:0}});
