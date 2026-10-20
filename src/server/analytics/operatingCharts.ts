import {powerKeys,operatingChartLimits,type OperatingCharts,type PowerSample,type DistributionPoint} from '../../core/operatingCharts';
import {projectSiteAnalytics} from './siteAnalyticsProjection';
type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const list=(v:unknown):Row[]=>Array.isArray(v)?v.map(row):[];
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12?v:null;
const time=(v:unknown)=>{const n=typeof v==='number'?v:typeof v==='string'?(/^\d+$/.test(v)?Number(v):Date.parse(v)):NaN;return Number.isSafeInteger(n)&&n>0?n:null;};
export function operatingSiteKey(input:unknown):string|null {
  const s=row(row(input).siteIdentity);
  return typeof s.stationCode==='string'&&Number.isInteger(s.blockIndex)&&typeof s.emsBaseUrl==='string'?JSON.stringify([s.stationCode,s.blockIndex,s.emsBaseUrl,s.activeProfileId??null]):null;
}
/** All four traces use the same boundary: canonical PCS AC reports. No meter/PCS mixing. */
export function projectPower(input:unknown,now=Date.now()):PowerSample {
  const snap=row(input),n=row(snap.normalized),pcs=list(n.pcs),arrays=list(n.arrays);
  const ids=new Set(arrays.map(a=>num(a.arrayNumber)??num(a.arrayIndex)).filter((a):a is number=>a!==null&&a>0));
  const actualIds=pcs.map(p=>`${p.arrayNumber??p.arrayIndex}:${p.pcsIndex??1}`);
  const duplicates=new Set(actualIds).size!==pcs.length;
  const expected=Math.max(ids.size,pcs.length);
  const mapped=ids.size>0&&pcs.every(p=>ids.has(Number(p.arrayNumber??p.arrayIndex)))&&[...ids].every(a=>pcs.some(p=>Number(p.arrayNumber??p.arrayIndex)===a));
  const fresh=pcs.map(p=>{const at=time(p.timestamp);return at!==null&&at<=now+5000&&now-at<=30000&&p.communicating!==false&&p.sourceOk!==false&&p.stale!==true&&row(snap.liveStatus).stale!==true;});
  const fields={commandKw:'acCmdRealPowerKW',actualKw:'acRealPowerKW',commandKvar:'acCmdReactivePowerKVAR',actualKvar:'acReactivePowerKVAR'} as const;
  const result:PowerSample={at:now,observedAt:null,expected,reporting:{commandKw:0,actualKw:0,commandKvar:0,actualKvar:0},commandKw:null,actualKw:null,commandKvar:null,actualKvar:null};
  const times=pcs.map(p=>time(p.timestamp)).filter((v):v is number=>v!==null);
  result.observedAt=times.length?Math.min(...times):null;
  for(const key of powerKeys){
    const values=pcs.map((p,i)=>fresh[i]?num(p[fields[key]]):null);
    result.reporting[key]=values.filter(v=>v!==null).length;
    if(expected>0&&mapped&&!duplicates&&result.reporting[key]===expected)result[key]=values.reduce<number>((s,v)=>s+(v??0),0);
  }
  return result;
}
export function projectDistribution(input:unknown,now=Date.now()):DistributionPoint[] {
  const metrics=projectSiteAnalytics(input,now).metrics;
  const get=(id:string)=>new Map(metrics.find(m=>m.id===id)?.rows.map(r=>[`${r.array}:${r.position}`,r])??[]);
  const sources={voltageMv:get('string-cell-voltage'),temperatureF:get('string-cell-temperature'),currentA:get('string-current'),powerKw:get('string-power'),socPct:get('string-soc'),stringVoltageV:get('string-voltage'),busVoltageV:get('string-bus'),energyKwh:get('string-energy')};
  return [...sources.voltageMv.entries()].slice(0,operatingChartLimits.strings).map(([key,r])=>({array:r.array,string:r.position,label:`A${r.array} · S${r.position}`,observedAt:r.observedAt,
    ...Object.fromEntries(Object.entries(sources).map(([name,values])=>[name,values.get(key)?.value??null]))} as DistributionPoint));
}
/** Strict bounded wire validation shared by Fleet and the recorder; older collectors may omit charts. */
export function parseOperatingCharts(input:unknown):OperatingCharts|undefined {
  if(input===undefined)return undefined;
  const v=row(input),fail=()=>{throw Error('Invalid operating charts');};
  if(v.version!==1||typeof v.site!=='string'||v.site.length>160||typeof v.capturedAt!=='number'||!time(v.capturedAt)||v.intervalMs!==operatingChartLimits.intervalMs||v.retentionMs!==operatingChartLimits.retentionMs)fail();
  const bounded=(x:unknown,max:number)=>{if(!Array.isArray(x)||x.length>max)fail();return x as unknown[];};
  const nullable=(x:unknown):number|null=>{if(x===null)return null;const n=num(x);if(n===null)fail();return n;};
  const integer=(x:unknown,max:number)=>{const n=num(x);if(n===null||!Number.isInteger(n)||n<0||n>max)fail();return n!;};
  const stamp=(x:unknown)=>{if(x===null)return null;const t=time(x);if(t===null)fail();return t;};
  let last=0;
  const power=bounded(v.power,operatingChartLimits.points).map(value=>{const p=row(value),at=time(p.at);if(!at||at<=last||at>Number(v.capturedAt)+5000)fail();last=at!;
    const expected=integer(p.expected,256),report=row(p.reporting),reporting={} as PowerSample['reporting'],values={} as Pick<PowerSample,typeof powerKeys[number]>;
    for(const k of powerKeys){reporting[k]=integer(report[k],256);values[k]=nullable(p[k]);if(reporting[k]>expected||(values[k]!==null&&(!expected||reporting[k]!==expected)))fail();}
    return {at:at!,observedAt:stamp(p.observedAt),expected,reporting,...values};});
  const identities=new Set<string>();
  const distribution=bounded(v.distribution,operatingChartLimits.strings).map(value=>{const d=row(value),array=integer(d.array,64),string=integer(d.string,9999),id=`${array}:${string}`;
    if(!array||!string||identities.has(id)||typeof d.label!=='string'||d.label.length>80)fail();identities.add(id);
    return {array,string,label:d.label as string,observedAt:stamp(d.observedAt),voltageMv:nullable(d.voltageMv),temperatureF:nullable(d.temperatureF),currentA:nullable(d.currentA),powerKw:nullable(d.powerKw),socPct:nullable(d.socPct),stringVoltageV:nullable(d.stringVoltageV),busVoltageV:nullable(d.busVoltageV),energyKwh:nullable(d.energyKwh)};});
  if(v.recordingError!==null&&(typeof v.recordingError!=='string'||v.recordingError.length>160))fail();
  return {version:1,site:v.site as string,capturedAt:v.capturedAt as number,intervalMs:operatingChartLimits.intervalMs,retentionMs:operatingChartLimits.retentionMs,power,distribution,recordingError:v.recordingError as string|null};
}
