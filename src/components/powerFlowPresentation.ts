import type {SitePowerFlow,PowerFlowReading,PowerFlowSoc,FlowDirection} from '../core/fleet/powerFlow';

/** Display memory only, never a source of live quality, direction or deadlines.
 * Missing readings can retain their last number/fill, explicitly marked Last.
 * The caller scopes this memory to a mounted site and canonical source. */
export interface FlowPresentation {
 net?:PowerFlowReading;
 tone:FlowDirection;
 arrays:Map<number,{power?:PowerFlowReading;soc?:PowerFlowSoc;tone:FlowDirection}>;
}
const tone=(reading:PowerFlowReading,previous?:FlowDirection):FlowDirection=>
 ['charging','discharging','idle'].includes(reading.direction)?reading.direction:previous??'unknown';
const observed=(stamp:string|null,now:number)=>stamp!==null&&Number.isFinite(Date.parse(stamp))&&Date.parse(stamp)<=now;
function power(next:PowerFlowReading,previous:PowerFlowReading|undefined,now:number){
 return next.powerKw!==null&&Number.isFinite(next.powerKw)&&observed(next.observedAt,now)&&
  (!previous?.observedAt||Date.parse(next.observedAt!)>=Date.parse(previous.observedAt))
  ?{...next}:previous;
}
function soc(next:PowerFlowSoc|undefined,previous:PowerFlowSoc|undefined,now:number){
 return next&&next.percent!==null&&Number.isFinite(next.percent)&&next.percent>=0&&next.percent<=100&&
  observed(next.observedAt,now)&&(!previous?.observedAt||Date.parse(next.observedAt!)>=Date.parse(previous.observedAt))
  ?{...next,coverage:next.coverage?{...next.coverage}:next.coverage}:previous;
}
export function rememberFlow(flow:SitePowerFlow,previous?:FlowPresentation,now=Date.now()):FlowPresentation {
 return {net:power(flow.net,previous?.net,now),tone:tone(flow.net,previous?.tone),arrays:new Map(flow.arrays.map(a=>{
  const old=previous?.arrays.get(a.array);
  return [a.array,{power:power(a,old?.power,now),soc:soc(a.soc,old?.soc,now),tone:tone(a,old?.tone)}];
 }))};
}
