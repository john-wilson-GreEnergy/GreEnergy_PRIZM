import type {AnalyticsMetric,AnalyticsRow,SiteAnalytics} from '../../core/siteAnalytics';
type Row=Record<string,unknown>;
const record=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(record):[];
const num=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)?v:null;
const time=(v:unknown):number|null=>{if(typeof v!=='number'&&typeof v!=='string')return null;const n=typeof v==='number'?v:/^\d+$/.test(v)?Number(v):Date.parse(v);return Number.isFinite(n)&&n>0?n:null;};
const fahrenheit=(v:unknown)=>{const n=num(v);return n===null?null:n*9/5+32;};
/** Pure, read-only projection of canonical publications, never a device reader. */
export function projectSiteAnalytics(input:unknown,now=Date.now()):SiteAnalytics {
  const snap=record(input),identity=record(snap.siteIdentity),normalized=record(snap.normalized);
  const site=`${identity.stationCode??'Unknown site'} / Block ${identity.blockIndex??'?'}`;
  const globalStale=record(snap.liveStatus).stale===true;
  const make=(r:Row,value:number|null,source:string,at:unknown,position:number,low?:number|null,high?:number|null):AnalyticsRow=>{
    const observedAt=time(at),array=num(r.arrayNumber)??num(r.arrayIndex)??0;
    const quality=globalStale||r.stale===true||r.communicating===false||r.sourceOk===false||r.reachable===false?'stale':observedAt===null?'unknown':observedAt>now+5000||observedAt<now-120000?'stale':'fresh';
    return {array,position,target:String(r.id??r.segmentLabel??`Array ${array} · ${position}`),observedAt,quality,source,value:quality==='fresh'?value:null,low:quality==='fresh'?low:null,high:quality==='fresh'?high:null};
  };
  const strings=rows(normalized.strings),pcs=rows(normalized.pcs),hvac=rows(normalized.feather);
  const stringMetric=(id:string,label:string,unit:string,value:(r:Row)=>number|null,low?:(r:Row)=>number|null,high?:(r:Row)=>number|null):AnalyticsMetric=>({id,label,unit,rows:strings.map(r=>make(r,value(r),String(r.metricSource??'Canonical string telemetry'),r.sourceTimestampUtc??r.timestampUtc,num(r.stringNumber)??0,low?.(r),high?.(r)))});
  const environmental=(id:string,label:string,unit:string,value:(r:Row)=>number|null):AnalyticsMetric=>({id,label,unit,rows:hvac.map(r=>make(r,value(r),'Canonical Feather telemetry',r.lastSuccessUtc,Number(String(r.segmentLabel??'').match(/\d+/)?.[0]??0)))});
  const metrics:AnalyticsMetric[]=[
    stringMetric('string-voltage','String voltage','V',r=>num(r.measuredVoltage)),
    stringMetric('string-current','String current','A',r=>num(r.amps)),
    stringMetric('string-power','String power','kW',r=>num(r.kw)),
    stringMetric('string-bus','Bus voltage','V',r=>num(r.busVoltage)),
    stringMetric('string-energy','Stored energy','kWh',r=>num(r.kwh)),
    stringMetric('string-soc','String state of charge','%',r=>num(r.socPct)),
    stringMetric('string-cell-voltage','Cell voltage by string','mV',r=>num(r.avgCellVoltage),r=>num(r.minCellVoltage),r=>num(r.maxCellVoltage)),
    stringMetric('string-cell-temperature','Cell temperature by string','°F',r=>fahrenheit(r.avgCellTempC),r=>fahrenheit(r.minCellTempC),r=>fahrenheit(r.maxCellTempC)),
    {id:'pcs-power',label:'PCS AC real power',unit:'kW',rows:pcs.map(r=>make(r,num(r.acRealPowerKW),'Canonical PCS telemetry',r.timestamp,num(r.pcsIndex)??1))},
    environmental('hvac-temperature','Enclosure temperature','°F',r=>fahrenheit(r.spaceTemperatureC)),
    environmental('hvac-supply','Supply-air temperature','°F',r=>fahrenheit(r.supplyAirTempC)),
    environmental('hvac-humidity','Enclosure humidity','%',r=>num(r.spaceHumidityPct)),
    environmental('hvac-current-1','HVAC 1 current','A',r=>record(r.hvac1).dataValid===true?num(record(r.hvac1).currentA):null),
    environmental('hvac-current-2','HVAC 2 current','A',r=>record(r.hvac2).dataValid===true?num(record(r.hvac2).currentA):null),
  ];
  for(const m of metrics)m.rows=m.rows.filter(r=>r.array>0).sort((a,b)=>a.array-b.array||a.position-b.position);
  return {site,preparedAt:now,metrics,historical:false};
}
