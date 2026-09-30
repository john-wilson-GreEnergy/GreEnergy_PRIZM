import {emptyDetails,issueCategories,type FleetDetails,type DetailRange,type Quality,type IssueCategory} from '../../core/fleet/details';
const row=(v:unknown):Record<string,unknown>=>{if(!v || typeof v!=='object' || Array.isArray(v))throw new Error('Invalid fleet detail');return v as Record<string,unknown>;};
const num=(v:unknown,min=-1e12,max=1e12):number|null=>{if(v===null)return null;if(typeof v!=='number' || !Number.isFinite(v) || v<min || v>max)throw new Error('Invalid detail number');return v;};
const count=(v:unknown)=>{const n=num(v,0);if(n===null || !Number.isSafeInteger(n))throw new Error('Invalid detail count');return n;};
const text=(v:unknown,limit=160)=>{if(typeof v!=='string' || v.length>limit)throw new Error('Invalid detail text');return v;};
const stamp=(v:unknown)=>{if(v===null)return null;const s=text(v,40);if(!Number.isFinite(Date.parse(s)))throw new Error('Invalid detail time');return s;};
const quality=(v:unknown):Quality=>{if(v!=='live' && v!=='stale' && v!=='unknown')throw new Error('Invalid detail quality');return v;};
const list=(v:unknown,max:number):unknown[]=>{if(!Array.isArray(v) || v.length>max)throw new Error('Invalid detail list');return v;};
function range(value:unknown):DetailRange {
  const r=row(value),minimum=num(r.minimum),average=num(r.average),maximum=num(r.maximum),delta=num(r.delta,0);
  const reportingStrings=count(r.reportingStrings),expectedStrings=count(r.expectedStrings);
  if(typeof r.partial!=='boolean' || reportingStrings>expectedStrings || (expectedStrings>0 && r.partial!==(reportingStrings<expectedStrings)))throw new Error('Invalid range coverage');
  if([minimum,average,maximum,delta].some(v=>v===null) && [minimum,average,maximum,delta].some(v=>v!==null))throw new Error('Incomplete range');
  if(minimum!==null && average!==null && maximum!==null && (minimum>average || average>maximum || Math.abs(maximum-minimum-delta!)>1e-6))throw new Error('Invalid range extrema');
  return {minimum,average,maximum,delta,reportingStrings,expectedStrings,partial:r.partial};
}
export function parseFleetDetails(value:unknown):FleetDetails {
  if(value===undefined)return emptyDetails(); // Backward-compatible collectors.
  const r=row(value),i=row(r.issues),s=row(r.sensors),result=emptyDetails();
  if(r.version!==1)throw new Error('Unsupported fleet detail version');
  result.observedAt=stamp(r.observedAt);result.quality=quality(r.quality);result.omittedArrays=count(r.omittedArrays);
  result.arrays=list(r.arrays,64).map(value=>{
    const a=row(value),rotation=a.rotation;if(typeof rotation!=='string' || !['IN','OUT','UNKNOWN'].includes(rotation))throw new Error('Invalid rotation');
    const id=count(a.number);if(id===0)throw new Error('Invalid array');
    return {number:id,observedAt:stamp(a.observedAt),quality:quality(a.quality),
      stringCount:a.stringCount===null?null:count(a.stringCount),onlineStrings:a.onlineStrings===null?null:count(a.onlineStrings),outOfRotation:a.outOfRotation===null?null:count(a.outOfRotation),
      powerKw:num(a.powerKw),socPct:num(a.socPct,0,100),busVoltage:num(a.busVoltage,0),pcsState:text(a.pcsState,80),rotation:rotation as 'IN'|'OUT'|'UNKNOWN',
      pcsQuality:quality(a.pcsQuality),pcsObservedAt:stamp(a.pcsObservedAt),temperatureC:range(a.temperatureC),voltageMv:range(a.voltageMv)};
  });
  if(new Set(result.arrays.map(a=>a.number)).size!==result.arrays.length)throw new Error('Duplicate array detail');
  result.issues.observedAt=stamp(i.observedAt);result.issues.quality=quality(i.quality);result.issues.omittedGroups=count(i.omittedGroups);
  const categories=row(i.categories);
  for(const key of Object.keys(issueCategories) as IssueCategory[]){const c=row(categories[key]);for(const name of ['alarms','warnings','info','unknown','targets'] as const)result.issues.categories[key][name]=c[name]===null?null:count(c[name]);}
  result.issues.notes=list(i.notes,8).map(v=>text(v,240));
  result.issues.findings=list(i.findings,60).map(value=>{const f=row(value);
    if(typeof f.category!=='string' || !Object.hasOwn(issueCategories,f.category) || typeof f.severity!=='string' || !['alarm','warning','info','unknown'].includes(f.severity))throw new Error('Invalid finding');
    return {code:text(f.code,80),title:text(f.title),category:f.category as IssueCategory,severity:f.severity as 'alarm'|'warning'|'info'|'unknown',targetCount:count(f.targetCount),targets:list(f.targets,6).map(v=>text(v))};});
  result.sensors={observedAt:stamp(s.observedAt),quality:quality(s.quality),trips:s.trips===null?null:count(s.trips),known:count(s.known),total:count(s.total),omittedTrips:count(s.omittedTrips),
    active:list(s.active,50).map(value=>{const t=row(value);
      if(t.condition===undefined)return {id:text(t.id,200),label:text(t.label),kind:text(t.kind,80)};
      if(typeof t.condition!=='string' || !['trip','communication','temperature','reported-status'].includes(t.condition))throw new Error('Invalid sensor condition');
      return {id:text(t.id,200),label:text(t.label),kind:text(t.kind,80),condition:t.condition as 'trip'|'communication'|'temperature'|'reported-status',
        status:text(t.status,80),message:text(t.message,240),occurredAt:stamp(t.occurredAt),source:text(t.source,80),sourcePath:text(t.sourcePath,240),findings:list(t.findings,8).map(v=>text(v,240))};})};
  const visibleTrips=result.sensors.active.filter(t=>!t.condition || t.condition==='trip').length;
  if(result.sensors.known>result.sensors.total || (result.sensors.trips!==null && (result.sensors.trips>result.sensors.known || result.sensors.trips<visibleTrips || result.sensors.trips>visibleTrips+result.sensors.omittedTrips)))throw new Error('Invalid sensor coverage');
  return result;
}
export function ageFleetDetails(value:FleetDetails|undefined,now:number,current:boolean):FleetDetails {
  const result=structuredClone(value ?? emptyDetails());
  const age=(q:Quality,time:string|null):Quality=>q==='unknown'?'unknown':!current || !time || Date.parse(time)>now || now-Date.parse(time)>=15000?'stale':q;
  result.quality=age(result.quality,result.observedAt);
  result.issues.quality=age(result.issues.quality,result.issues.observedAt);result.sensors.quality=age(result.sensors.quality,result.sensors.observedAt);
  for(const array of result.arrays){array.quality=age(array.quality,array.observedAt);array.pcsQuality=age(array.pcsQuality,array.pcsObservedAt);}
  return result;
}
