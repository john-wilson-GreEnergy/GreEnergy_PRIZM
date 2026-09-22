import {thermalMetrics,type ThermalMetric} from "../server/thermal/thermalMetrics";
import {validateHistoryFilters,type HistoryFilters} from "../server/thermal/historyReview";
import type {TraceVisibility} from "./thermalTraceVisibility";
export type TargetFilters={search:string;array:string;unit:string;status:string;sort:string;segmentType:string;topPerArray:string};
export const defaultTargetFilters:TargetFilters={search:"",array:"all",unit:"all",status:"all",sort:"topology",segmentType:"all",topPerArray:"0"};
export type ThermalSavedState={metric:ThermalMetric;overheadMetric:ThermalMetric;array:string;mapMode:"metric"|"mode";selected:string[];targetFilters:TargetFilters;reviewFilters:HistoryFilters;session:string;minutes:number;historyDays:number;visibility:TraceVisibility;showCommands:boolean;tracePage?:number};
export type SavedThermalView={name:string;state:ThermalSavedState};
export function parseSavedViews(raw:string|null):SavedThermalView[]{
  try{
    const data=JSON.parse(raw||"null");if(data?.version!==1||!Array.isArray(data.views))return [];
    return data.views.slice(0,20).filter((view:SavedThermalView)=>{
      const s=view?.state,f=s?.targetFilters,v=s?.visibility;
      if(s?.tracePage!==undefined&&(!Number.isInteger(s.tracePage)||s.tracePage<0||s.tracePage>127))return false;
      if(typeof view?.name!=="string"||!view.name.trim()||view.name.length>60||!s||!Object.hasOwn(thermalMetrics,s.metric)||!Object.hasOwn(thermalMetrics,s.overheadMetric)||!f||!v)return false;
      if(!Array.isArray(s.selected)||s.selected.length>2048||s.selected.some(id=>typeof id!=="string"||id.length>160))return false;
      if(!Array.isArray(v.hidden)||v.hidden.some(id=>!s.selected.includes(id))||v.only!==null&&!s.selected.includes(v.only))return false;
      if(typeof s.array!=="string"||typeof f.array!=="string"||typeof f.search!=="string"||f.search.length>200||typeof s.session!=="string")return false;
      if(!["all","1","2"].includes(f.unit)||!["all","selected","faults","stale"].includes(f.status)||!["topology","descending","ascending"].includes(f.sort)||!["all","CS","ES"].includes(f.segmentType)||!["0","1","3","5"].includes(f.topPerArray))return false;
      if(![15,60].includes(s.minutes)||![1/24,0.25,1,3,7].includes(s.historyDays)||!["metric","mode"].includes(s.mapMode)||typeof s.showCommands!=="boolean"||!s.reviewFilters)return false;
      try{validateHistoryFilters(s.reviewFilters);}catch{return false;}return true;
    });
  }catch{return [];}
}
