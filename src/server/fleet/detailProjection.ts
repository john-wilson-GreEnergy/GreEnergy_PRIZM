import {emptyDetails,emptyRange,issueCategories,type FleetDetails,type FleetArray,type IssueCategory,type Quality} from '../../core/fleet/details';
import {buildArrayCellMetrics} from '../telemetry/arrayCellMetrics';

type Row=Record<string,unknown>;
export const object=(v:unknown):Row=>v && typeof v==='object' && !Array.isArray(v)?v as Row:{};
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):[];
const number=(v:unknown)=>typeof v==='number' && Number.isFinite(v)?v:null;
const text=(v:unknown,max=160)=>typeof v==='string'?v.slice(0,max):'';
const stamp=(v:unknown)=>typeof v==='string' && Number.isFinite(Date.parse(v))?v:null;
const index=(r:Row)=>number(r.arrayNumber) ?? number(r.arrayIndex);
const collection=(r:Row)=>r.isCollectionSegment===true || /collection/i.test(text(r.segmentType)) || r.hasCells===false;
const quality=(r:Row):Quality=>r.stale===true || r.communicating===false || r.sourceOk===false?'stale':'live';
const category=(group:Row):IssueCategory=>group.section==='availability'?'availability':group.category==='HVAC / Environmental'?'hvac':group.category==='String / Cell'?'battery':group.category==='PCS'?'pcs':'other';

/** Only consumes already canonical data; no raw controller payloads or fault inference. */
export function buildFleetDetails(view:unknown,snapshot:unknown):FleetDetails {
  const data=object(view),snap=object(snapshot),identity=object(data.siteIdentity),snapshotIdentity=object(snap.siteIdentity);
  const sameSite=typeof identity.stationCode==='string' && identity.stationCode===snapshotIdentity.stationCode && identity.blockIndex===snapshotIdentity.blockIndex &&
    ['activeProfileId','emsBaseUrl'].every(key=>identity[key]===snapshotIdentity[key]);
  const normalized=sameSite?object(snap.normalized):{},live=object(data.liveStatus),result=emptyDetails();
  result.observedAt=stamp(live.lastUpdated);
  result.quality=live.stale===false && live.liveSucceeded===true && live.cacheUsed!==true?'live':'stale';
  const strings=rows(normalized.strings).filter(r=>!collection(r));
  const summaries=rows(data.arraySummary),pcs=rows(data.pcsSummary),health=rows(data.sourceHealth);
  const metrics=buildArrayCellMetrics(strings,summaries);
  const ids=[...new Set([...summaries,...pcs].map(index).filter((n):n is number=>n!==null && Number.isSafeInteger(n) && n>0))].sort((a,b)=>a-b);
  result.omittedArrays=Math.max(0,ids.length-64);
  result.arrays=ids.slice(0,64).map(id=>{
    const summary=summaries.find(r=>index(r)===id) ?? {},inverters=pcs.filter(r=>index(r)===id),inverter=inverters.length===1?inverters[0]:{};
    const cells=metrics.find(m=>m.arrayNumber===id),stringSource=health.find(h=>h.name===`array-${id}-report`) ?? health.find(h=>h.name==='strings');
    const rotation=text(inverter.rotationStatus).toUpperCase();
    const reportAt=stamp(stringSource?.lastUpdated);
    const cellQuality:Quality=!reportAt || !cells || (!cells.temperatureC.reportingStrings && !cells.voltageMv.reportingStrings)?'unknown':stringSource?.stale===true || stringSource?.ok!==true || result.quality!=='live'?'stale':'live';
    return {number:id,observedAt:reportAt,quality:cellQuality,stringCount:number(summary.stringCount),onlineStrings:number(summary.onlineStringCount),outOfRotation:number(summary.outOfRotationCount),
      socPct:number(summary.onlineSOC),powerKw:number(inverter.acRealPowerKW),busVoltage:number(summary.voltageVolt),
      pcsState:text(inverter.state,80) || (inverters.length>1?'Multiple PCS units':'Not reported'),rotation:rotation==='IN'?'IN':rotation==='OUT'?'OUT':'UNKNOWN',
      pcsQuality:inverters.length===1?quality(inverter):'unknown',pcsObservedAt:stamp(inverter.fetchedAt),
      temperatureC:cells?.temperatureC ?? emptyRange(),voltageMv:cells?.voltageMv ?? emptyRange()} satisfies FleetArray;
  });
  const review=object(data.notificationReview ?? normalized.notificationReview);
  if(review.version===1 && Array.isArray(review.groups)){
    const groups=rows(review.groups);
    result.issues.observedAt=stamp(review.capturedAt);result.issues.quality=result.quality;
    result.issues.notes=(Array.isArray(review.sourceWarnings)?review.sourceWarnings:[]).filter((v):v is string=>typeof v==='string').slice(0,8).map(v=>v.slice(0,240));
    for(const key of Object.keys(issueCategories) as IssueCategory[]){
      const members=groups.filter(g=>category(g)===key),sets={alarms:new Set<string>(),warnings:new Set<string>(),info:new Set<string>(),unknown:new Set<string>(),targets:new Set<string>()};
      for(const group of members){const severity=['alarm','critical'].includes(text(group.severity))?'alarms':group.severity==='warning'?'warnings':group.severity==='info'?'info':'unknown';
        for(const target of rows(group.targets)){const id=text(target.id,600);if(id){sets[severity].add(id);sets.targets.add(id);}}
      }
      result.issues.categories[key]=Object.fromEntries(Object.entries(sets).map(([name,set])=>[name,set.size])) as unknown as FleetDetails['issues']['categories'][IssueCategory];
    }
    const rank:Record<string,number>={critical:0,alarm:0,warning:1,unknown:2,info:3};
    const ordered=[...groups].sort((a,b)=>(rank[text(a.severity)] ?? 2)-(rank[text(b.severity)] ?? 2));
    result.issues.findings=ordered.slice(0,60).map(group=>({code:text(group.code,80),title:text(group.title),category:category(group),
      severity:['alarm','critical'].includes(text(group.severity))?'alarm':group.severity==='warning'?'warning':group.severity==='info'?'info':'unknown',
      targetCount:new Set(rows(group.targets).map(t=>text(t.id,600)).filter(Boolean)).size,
      targets:rows(group.targets).slice(0,6).map(t=>text(t.label))}));
    result.issues.omittedGroups=Math.max(0,ordered.length-60);
  }else result.issues.notes=['Detailed notification review is not available from this collector. Site totals remain separate.'];
  const sensors=rows(normalized.sensors),unique=new Map<string,Row>();
  for(const sensor of sensors){const id=text(sensor.id);if(id && sensor.stationCode===identity.stationCode && sensor.blockIndex===identity.blockIndex)unique.set(id,sensor);}
  const active:FleetDetails['sensors']['active']=[];let known=0,total=0,trips=0;
  for(const [id,sensor] of unique){
    const add=(key:string,kind:string,condition:NonNullable<FleetDetails['sensors']['active'][number]['condition']>,status:string,message:string)=>{
      active.push({id:`${id}:${key}`,label:text(sensor.displayLabel) || id,kind,condition,status,message,
        occurredAt:stamp(sensor[key+'TrippedTimestamp']),source:text(sensor.source,80),sourcePath:text(object(object(sensor.sensors)[key]).sourcePath || sensor.sourcePath,240),
        findings:(Array.isArray(sensor.findings)?sensor.findings:[]).filter((v):v is string=>typeof v==='string').slice(0,8).map(v=>text(v,240))});
    };
    if(sensor.segmentCommunicating===false)add('segmentCommunications','Enclosure communications','communication','OFFLINE','Enclosure communications link offline; sensor states cannot be confirmed.');
    for(const [key,label] of [['heat','Heat detector'],['gas','Gas detector'],['smoke','Smoke detector'],['fireSuppression','Fire suppression']]){
      total++;const state=text(sensor[key+'Status'],80),communicating=sensor.segmentCommunicating===true && sensor[key+'Communicating']===true;
      if(state==='NOT_INSTALLED')continue;
      if(communicating && (state==='TRIPPED' || state==='NOT_TRIPPED')){
        known++;if(state==='TRIPPED'){trips++;add(key,label,'trip',state,`${label} reports a physical trip.`);}
      }else if(sensor.segmentCommunicating===true && sensor[key+'Communicating']===false){
        add(key,label,'communication',state || 'NOT_REPORTED',`${label} communication lost; the reported state is not confirmed current.`);
      }else if(communicating && state && !['NOT_INSTALLED','UNKNOWN','UNAVAILABLE'].includes(state)){
        add(key,label,'reported-status',state,`${label} reports ${state}. This is not classified as a confirmed physical trip.`);
      }
    }
    if(sensor.segmentCommunicating===true && sensor.temperatureCommunicating===false)add('temperature','Temperature sensor','communication',text(sensor.temperatureStatus,80) || 'NOT_REPORTED','Temperature sensor communication lost.');
    else if(sensor.segmentCommunicating===true && sensor.temperatureCommunicating===true && sensor.temperatureStatus==='HIGH'){
      const reading=number(sensor.temperatureValue),unit=text(sensor.temperatureUnit).toUpperCase(),fahrenheit=reading===null?null:unit==='F'?reading:unit==='C'?reading*1.8+32:null;
      add('temperature','Temperature sensor','temperature','HIGH',`High temperature reported${fahrenheit===null?'':`: ${Number(fahrenheit.toFixed(1))} °F`}.`);
    }
  }
  const priority={trip:0,temperature:1,'reported-status':2,communication:3};
  active.sort((a,b)=>priority[a.condition!]-priority[b.condition!]);
  result.sensors={observedAt:total?result.observedAt:null,quality:total?result.quality:'unknown',trips:known?trips:null,known,total,active:active.slice(0,50),omittedTrips:Math.max(0,active.length-50)};
  return result;
}
