import type {StringViewerCacheEntry} from '../telemetry/stringviewer/StringViewerTypes';

export interface BpcVoltageSnapshot {
  array:number; string:number; observedAt:string|null;
  quality:'available'|'stale'|'unavailable'|'time unknown'; reason:string;
  packs:{bpc:number; voltageV:number}[];
}
type Row=Record<string,unknown>;
const obj=(v:unknown):Row=>v && typeof v==='object' && !Array.isArray(v)?v as Row:{};
const num=(v:unknown):number|null=>{
  if(typeof v!=='number' && typeof v!=='string' || typeof v==='string' && !v.trim()) return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
};
const consecutive=(row:Row,count:number)=>Object.keys(row).length===count && Array.from({length:count},(_,i)=>String(i+1)).every(k=>Object.hasOwn(row,k));

/** Normalize one complete, identity-checked broker observation. No acquisition, defaults or partial-pack sums. */
export function normalizeBpcVoltageSnapshot(entry:StringViewerCacheEntry, now:number):BpcVoltageSnapshot {
  const result:BpcVoltageSnapshot={array:entry.arrayIndex,string:entry.stringIndex,observedAt:entry.sourceObservationAt??entry.lastSuccessAt,quality:'unavailable',reason:'Complete pack voltage data unavailable',packs:[]};
  const raw=obj(entry.value),m=obj(raw.stringViewerDataModel??raw);
  const count=num(m.batteryPackCount),cells=num(m.cellGroupCount);
  if(num(m.arrayIndex)!==entry.arrayIndex || num(m.stringIndex)!==entry.stringIndex || m.badReport===true || m.hasVoltageMap!==true) return result;
  // Bounds are parser resource limits, not assumed topology or fault thresholds.
  if(count==null || cells==null || !Number.isInteger(count) || !Number.isInteger(cells) || count<2 || count>256 || cells<1 || cells>1024) return result;
  const voltage=obj(obj(m.voltageMap).batteryPacks),times=obj(obj(m.timestampMap).batteryPacks);
  if(!consecutive(voltage,count)) return result;
  let oldestAge=0,unknownTime=m.hasTimestampMap!==true || !consecutive(times,count);
  const packs:BpcVoltageSnapshot['packs']=[];
  for(let bpc=1;bpc<=count;bpc++) {
    const groups=obj(obj(voltage[String(bpc)]).cellGroups),ages=obj(obj(times[String(bpc)]).cellGroups);
    if(!consecutive(groups,cells)) return result;
    if(!consecutive(ages,cells)) unknownTime=true;
    let sum=0;
    for(let cg=1;cg<=cells;cg++) {
      const cell=obj(groups[String(cg)]),v=num(cell.value),age=num(obj(ages[String(cg)]).value);
      if(v==null || v<=0 || (cell.cellGroupIndex!=null && num(cell.cellGroupIndex)!==cg)) return result;
      sum+=v;
      if(age==null || age<0) unknownTime=true;else oldestAge=Math.max(oldestAge,age*1000);
    }
    if(!Number.isFinite(sum)) return result;
    packs.push({bpc,voltageV:sum/1000});
  }
  const acquired=Date.parse(entry.lastSuccessAt??''),observed=Date.parse(result.observedAt??'');
  if(!Number.isFinite(now) || !Number.isFinite(acquired) || !Number.isFinite(observed) || acquired>now || observed>now) unknownTime=true;
  const stale=entry.stale || !entry.success || now-observed>30000 || now-acquired+oldestAge>30000;
  result.packs=packs;
  result.quality=unknownTime?'time unknown':stale?'stale':'available';
  result.reason=unknownTime?'Cell or source timestamp unavailable / invalid':stale?'Retained reading; verify fresh telemetry':'Complete StringViewer cell-group snapshot';
  return result;
}
