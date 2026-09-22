import type {HistoryDevice} from "./historyReview";
import {thermalSegmentType, type ThermalUnit} from "./thermalModel";
import {thermalMetrics, type ThermalMetric, type ThermalReadings} from "./thermalMetrics";

export type TargetUnit=ThermalUnit & {readings:ThermalReadings};
export type TargetQuery={metric:ThermalMetric;array:string;unit:string;segmentType:string;search:string;status:string;sort:string;topPerArray:number;selected:string[]};
export type TargetResult={devices:HistoryDevice[];units:TargetUnit[];ranks:Record<string,number>;candidateCount:number;excludedCount:number;rankBy:"unit"|"segment";capturedAt:number;warning?:string};
const topologyOrder=(a:HistoryDevice,b:HistoryDevice)=>a.array-b.array||a.segment.localeCompare(b.segment,undefined,{numeric:true})||a.unit-b.unit||a.id.localeCompare(b.id);

// Pure query over cached canonical telemetry. Never acquires device data.
export function selectThermalTargets(devices:HistoryDevice[],units:TargetUnit[],q:TargetQuery):TargetResult {
  if(!q||!Object.prototype.hasOwnProperty.call(thermalMetrics,q.metric)||!["all","CS","ES"].includes(q.segmentType)||
    !["all","selected","faults","stale"].includes(q.status)||!["topology","descending","ascending"].includes(q.sort)||
    ![0,1,3,5].includes(q.topPerArray)||typeof q.search!=="string"||q.search.length>512||
    !(q.array==="all"||/^\d+$/.test(q.array))||!["all","1","2"].includes(q.unit)||
    !Array.isArray(q.selected)||q.selected.length>2048||q.selected.some(id=>typeof id!=="string"))throw new Error("Invalid thermal target filters");
  const live=new Map(units.map(u=>[u.id,u])),selected=new Set(q.selected),needle=q.search.toLowerCase().trim();
  const candidates=devices.filter(d=>{
    const u=live.get(d.id),reading=u?.readings[q.metric];
    return (q.array==="all"||d.array===Number(q.array))&&(q.unit==="all"||d.unit===Number(q.unit))&&
      (q.segmentType==="all"||thermalSegmentType(d.segment,u?.point.segmentType)===q.segmentType)&&
      (!needle||`${d.id} ${d.label} ${d.ip}`.toLowerCase().includes(needle))&&
      (q.status==="all"||q.status==="selected"&&selected.has(d.id)||q.status==="faults"&&!!u?.faults.length||
        q.status==="stale"&&(!u||u.point.quality!=="Live"||reading?.state==="Not reported"));
  });
  const value=(d:HistoryDevice)=>{const r=live.get(d.id)?.readings[q.metric];return r?.state==="Live"&&r.value!==null&&Number.isFinite(r.value)?r.value:null;};
  const rankBy=q.metric==="current"||q.metric==="rpm"?"unit":"segment";
  const ranks:Record<string,number>={};
  let shown=candidates;
  const excludedCount=candidates.filter(d=>value(d)===null).length;
  if(q.topPerArray){
    const groups=new Map<string,{array:number;value:number;devices:HistoryDevice[]}>();
    for(const d of candidates){const v=value(d);if(v===null)continue;
      const key=rankBy==="unit"?d.id:`${d.array}:${d.segment}`;
      const group=groups.get(key);if(group){group.devices.push(d);group.value=Math.max(group.value,v);}else groups.set(key,{array:d.array,value:v,devices:[d]});
    }
    const counts=new Map<number,number>();shown=[];
    for(const group of [...groups.values()].sort((a,b)=>a.array-b.array||b.value-a.value||topologyOrder(a.devices[0],b.devices[0]))){
      const rank=(counts.get(group.array)||0)+1;counts.set(group.array,rank);if(rank>q.topPerArray)continue;
      for(const d of group.devices.sort(topologyOrder)){ranks[d.id]=rank;shown.push(d);}
    }
  }else shown.sort((a,b)=>{
    if(q.sort!=="topology"){const av=value(a),bv=value(b);if(av===null||bv===null){if(av!==null)return -1;if(bv!==null)return 1;}else if(av!==bv)return q.sort==="descending"?bv-av:av-bv;}
    return topologyOrder(a,b);
  });
  const ids=new Set(shown.map(d=>d.id));
  return {devices:shown,units:units.filter(u=>ids.has(u.id)),ranks,candidateCount:candidates.length,excludedCount,rankBy,capturedAt:Date.now()};
}
