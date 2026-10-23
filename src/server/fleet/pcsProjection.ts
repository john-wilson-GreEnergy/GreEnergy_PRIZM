import type {FleetPcs,FleetPcsReading,Quality} from '../../core/fleet/details';

type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v && typeof v==='object' && !Array.isArray(v)?v as Row:{};
const stamp=(v:unknown)=>typeof v==='string' && Number.isFinite(Date.parse(v))?v:null;
const positive=(v:unknown)=>typeof v==='number' && Number.isSafeInteger(v) && v>0?v:null;
const text=(v:unknown)=>typeof v==='string' && v.trim()?v.slice(0,80):null;
const numeric=(v:unknown)=>typeof v==='number' && Number.isFinite(v)?v:null;
export function sameFleetSite(a:unknown,b:unknown){
  const left=row(a),right=row(b);
  return typeof left.stationCode==='string' && ['stationCode','blockIndex','activeProfileId','emsBaseUrl'].every(k=>left[k]===right[k]);
}
/** Project the existing coordinator PCS view, never initiate another device read. */
export function projectFleetPcs(view:unknown,identity:unknown):FleetPcs[]{
  const data=row(view);
  if(!sameFleetSite(identity,data.siteIdentity) || !Array.isArray(data.pcs))return [];
  const entries=data.pcs.map(row);
  return entries.slice(0,64).flatMap(p=>{
    const array=positive(p.arrayNumber ?? p.arrayIndex),number=positive(p.pcsNumber ?? p.pcsIndex);
    if(array===null || number===null)return [];
    // Direct SMA telemetry is array-addressed. Never assign it to multiple units.
    const unambiguous=entries.filter(other=>(other.arrayNumber ?? other.arrayIndex)===array).length===1;
    const sw=unambiguous?row(p.pcsSwitches):{},points=row(sw.smaProcessData);
    const source:FleetPcsReading['source']=sw.source==='SMA_MQTT'?'SMA stream':sw.source==='SMA_WEB_PROCESS_DATA'?'SMA HTTP':sw.source==='SMA_MODBUS'?'PCS Modbus':'Unknown';
    const emsAt=stamp(p.fetchedAt),switchAt=stamp(sw.capturedAt);
    const emsQuality:Quality=!emsAt?'unknown':p.stale===true || p.sourceOk!==true || p.communicating!==true?'stale':'live';
    const switchQuality:Quality=!switchAt || source==='Unknown'?'unknown':sw.stale!==false || sw.error?'stale':'live';
    const reading=<T extends string|number>(value:T|null,quality:Quality,observedAt:string|null,source:FleetPcsReading['source']):FleetPcsReading<T>=>({value,quality:value===null?'unknown':quality,observedAt,source});
    const contact=(key:string)=>reading(['OPEN','CLOSED'].includes(String(sw[key]))?String(sw[key]):null,switchQuality,switchAt,source);
    const process=(key:string,fahrenheit=false)=>{
      const point=row(points[key]),at=stamp(point.freshnessBasis==='stream-progression'?point.freshnessAt:point.observedAt),valid=(point.readingState==='live' || point.readingState==='stale') && at!==null && source!=='Unknown';
      const rawValue=valid?numeric(point.value):null,value=rawValue!==null && rawValue>=(fahrenheit?-273.15:0)?rawValue:null;
      const pointSource=point.source==='SMA_WEB_PROCESS_DATA'?'SMA HTTP':point.source==='SMA_MODBUS'?'PCS Modbus':source;
      return {...reading(value===null?null:fahrenheit?value*1.8+32:value,point.readingState==='live'?'live':'stale',at,pointSource),
        ...(point.freshnessBasis==='stream-progression'?{deviceObservedAt:stamp(point.observedAt),clockSkew:point.clockSkew===true}:{})};
    };
    const directStatus=text(sw.inverterOperatingState);
    return [{id:`A${array}-PCS${number}`,array,number,
      status:directStatus && switchQuality==='live'?reading(directStatus,switchQuality,switchAt,source):reading(text(p.state),emsQuality,emsAt,'EMS'),
      rotation:reading(['IN','OUT'].includes(String(p.rotationStatus))?String(p.rotationStatus):null,emsQuality,emsAt,'EMS'),
      acContactor:contact('acSwitch'),dc1:contact('dcSwitch1'),dc2:contact('dcSwitch2'),dc3:contact('dcSwitch3'),
      insulationKohm:process('insulationResistanceKOhm'),maxIgbtF:process('maxIgbtTemperatureC',true)}];
  });
}
