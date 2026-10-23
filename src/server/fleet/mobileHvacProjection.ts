import type {MobileHvac,MobileHvacUnit} from '../../mobile/hvacModel';
import {thermalReadings} from '../thermal/thermalMetrics';
import type {ThermalPoint} from '../thermal/thermalModel';
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const unavailableHvac=(error='HVAC snapshot unavailable. No current state is inferred.'):MobileHvac=>({units:[],error,capturedAt:null});
/** Bounded projection of the canonical thermal view. Never acquires device data. */
export function projectMobileHvac(data:unknown,now=Date.now()):MobileHvac {
 if(!record(data)||!Array.isArray(data.units)||data.units.length>2048)throw Error('Invalid thermal view');
 const seen=new Set<string>();
 const units:MobileHvacUnit[]=data.units.map(raw=>{
  if(!record(raw)||typeof raw.id!=='string'||raw.id.length>200||seen.has(raw.id)||!Number.isInteger(raw.array)||Number(raw.array)<1||Number(raw.array)>128||![1,2].includes(Number(raw.unit))||typeof raw.segment!=='string'||raw.segment.length>80||typeof raw.label!=='string'||!record(raw.point))throw Error('Invalid thermal unit');
  seen.add(raw.id);const p=raw.point;
  if(!['Heating','Cooling','Idle','Unknown'].includes(String(p.mode))||!['Live','Stale','Unavailable'].includes(String(p.quality))||typeof p.at!=='number'||!Number.isFinite(p.at)||!Array.isArray(raw.faults)||raw.faults.length>128||raw.faults.some(f=>typeof f!=='string'||f.length>2000))throw Error('Invalid thermal state');
  const quality=p.quality==='Live'&&(now-p.at>120000||p.at>now+30000)?'Stale':p.quality as ThermalPoint['quality'];
  const point={...p,quality} as ThermalPoint;
  // ThermalUnits explicitly prefixes controller-wide faults. They must not be
  // attributed to either HVAC: FSS/sensor faults belong to the segment, not H1/H2.
  const faults=raw.faults as string[];
  return {id:raw.id,array:Number(raw.array),segment:raw.segment,unit:Number(raw.unit),label:raw.label.slice(0,200),mode:point.mode,quality,at:p.at,
   faults:[...new Set(faults.filter(f=>!f.startsWith('Controller: ')))],
   controllerAlerts:[...new Set(faults.filter(f=>f.startsWith('Controller: ')).map(f=>f.slice(12)))],readings:thermalReadings(point)};
 }).sort((a,b)=>a.array-b.array||a.segment.localeCompare(b.segment,undefined,{numeric:true})||a.unit-b.unit);
 return {units,error:typeof data.error==='string'&&data.error?'Collector reported a thermal service warning.':null,capturedAt:now};
}
