import type {ThermalPoint} from "./thermalModel";
import {thermalDisplayValues, type ThermalMetric} from "./thermalMetrics";
export type HistoryDevice={id:string;array:number;segment:string;unit:number;label:string;ip:string};
export type HistoryFilters={minimum?:number;maximum?:number;mode?:string;quality?:string;faults?:string;from?:number;to?:number};
export const defaultHistoryFilters:HistoryFilters={mode:"all",quality:"all",faults:"all"};
export function validateHistoryFilters(f:HistoryFilters){
  if([f.minimum,f.maximum,f.from,f.to].some(n=>n!==undefined&&!Number.isFinite(n))||f.minimum!==undefined&&f.maximum!==undefined&&f.minimum>f.maximum||f.from!==undefined&&f.to!==undefined&&f.from>f.to)throw new Error("Invalid history range: minimum/start must not exceed maximum/end");
  if(![undefined,"all","Heating","Cooling","Idle","Unknown"].includes(f.mode)||![undefined,"all","Live","Stale","Unavailable"].includes(f.quality)||![undefined,"all","with","without"].includes(f.faults))throw new Error("Invalid history filter");
}
export function historyFiltersFromQuery(query:Record<string,unknown>):HistoryFilters{
  const n=(key:string)=>query[key]===undefined||query[key]===""?undefined:Number(query[key]);
  const s=(key:string)=>query[key]===undefined?undefined:String(query[key]);
  const f={minimum:n("minimum"),maximum:n("maximum"),mode:s("mode"),quality:s("quality"),faults:s("faults")};validateHistoryFilters(f);return f;
}
export function matchesHistory(point:ThermalPoint,metric:ThermalMetric,f:HistoryFilters){
  if(f.from!==undefined&&point.at<f.from||f.to!==undefined&&point.at>f.to)return false;
  if(f.mode&&f.mode!=="all"&&point.mode!==f.mode||f.quality&&f.quality!=="all"&&point.quality!==f.quality)return false;
  // Older recordings did not store fault state: never classify that as fault-free.
  if(f.faults==="with"&&!point.faults?.length||f.faults==="without"&&(!point.faults||point.faults.length>0))return false;
  if(f.minimum!==undefined||f.maximum!==undefined){const n=thermalDisplayValues(point)[metric];if(point.quality!=="Live"||n===null||f.minimum!==undefined&&n<f.minimum||f.maximum!==undefined&&n>f.maximum)return false;}
  return true;
}
