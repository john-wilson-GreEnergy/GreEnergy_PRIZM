export type FlowDirection='charging'|'discharging'|'idle'|'unknown'|'stale';
export interface PowerFlowReading {
 direction:FlowDirection; powerKw:number|null; observedAt:string|null;
 label:string; validUntil:number|null;
}
export interface PowerFlowSoc {
 percent:number|null;quality:'live'|'stale'|'unknown';observedAt:string|null;
 validUntil:number|null;source:string;
 coverage?:{connected:number;total:number;label:string;partial:boolean}|null;
}
export interface SitePowerFlow {
 version:1; net:PowerFlowReading; arrays:Array<PowerFlowReading&{array:number;soc?:PowerFlowSoc}>;
 mixed:boolean; partial:boolean; source:string; note:string;
}
