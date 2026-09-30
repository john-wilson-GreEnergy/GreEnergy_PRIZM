import type {NotificationTarget} from './notificationReview';

export interface NotificationMetrics {
  scope:'String context';
  fields:{label:string; value:number|null; unit:string}[];
  source:string;
  at:string|null;
  quality:'available'|'stale'|'unavailable'|'time unknown';
}
export interface NotificationTelemetry {
  strings:unknown[];
  blockIndex:number|null;
  stale?:boolean;
}
type Row=Record<string,unknown>;
const object=(v:unknown):Row=>v && typeof v==='object' && !Array.isArray(v)?v as Row:{};
const numeric=(v:unknown):number|null=>typeof v==='number' && Number.isFinite(v)?v:null;
const identity=(v:unknown)=>typeof v==='number' && Number.isInteger(v) && v>0?v:null;
const key=(block:number,array:number,string:number)=>`${block}:${array}:${string}`;
function timestamp(v:unknown):string|null {
  if(typeof v!=='string' || !v.trim()) return null;
  const ms=Date.parse(v);
  return Number.isFinite(ms)?new Date(ms).toISOString():null;
}
// Explicit documented code families, not inferred from prose or alarm severity.
function kind(code:string):'voltage'|'temperature'|'current'|'contactor'|null {
  if(/^STR-CON-/.test(code)) return 'contactor';
  if(!/^[123]\d{3}$/.test(code)) return null;
  const suffix=Number(code)%1000;
  if([1,2,3,4,5,6,7,8,9,22].includes(suffix)) return 'voltage';
  if([10,11,12,14,15,16,18,57].includes(suffix)) return 'temperature';
  if([19,20,46,47].includes(suffix)) return 'current';
  return null;
}
/** Cached canonical rows only. Never reads devices, changes faults or infers trip thresholds.
 * String ranges are context, NOT the affected BPC/cell measurement or event-time evidence.
 */
export function createNotificationMetrics(telemetry:NotificationTelemetry|undefined, capturedAt:string) {
  const index=new Map<string,Row|null>();
  for(const value of telemetry?.strings??[]) {
    const row=object(value),block=identity(row.blockIndex??telemetry?.blockIndex),array=identity(row.arrayNumber),string=identity(row.stringNumber);
    if(block==null || array==null || string==null) continue;
    const id=key(block,array,string);
    index.set(id,index.has(id)?null:row); // Conflicting identities must not select an arbitrary measurement.
  }
  return (code:string,target:NotificationTarget):NotificationMetrics|undefined=>{
    const type=kind(code),l=target.location;
    if(!type || !l || target.array==null || l.string==null || l.unit!=null || l.pcs!=null) return;
    const row=index.get(key(l.block,target.array,l.string));
    const invalid=!row || row.badReport===true;
    const read=(name:string)=>invalid?null:numeric(row[name]);
    const fields:NotificationMetrics['fields']=[];
    const add=(label:string,name:string,unit:string)=>fields.push({label,value:read(name),unit});
    const range=(min:string,max:string,unit:string)=>{
      const low=read(min),high=read(max),valid=low!=null && high!=null && high>=low;
      fields.push({label:'Cell low',value:valid?low:null,unit},{label:'Cell high',value:valid?high:null,unit},
        {label:'Cell Δ (high − low)',value:valid?Number((high-low).toFixed(3)):null,unit});
    };
    if(type==='voltage' || type==='contactor') {
      add('String measured','measuredVoltageVdc','V');
      if(type==='voltage') {
        range('minCellVoltageMv','maxCellVoltageMv','mV');
        if(Number(code)%1000===22) add('String calculated','calculatedVoltageVdc','V');
      } else {
        add('Bus','busVoltageVdc','V');
        const string=read('measuredVoltageVdc'),bus=read('busVoltageVdc');
        fields.push({label:'String / bus Δ',value:string!=null&&bus!=null?Number(Math.abs(string-bus).toFixed(3)):null,unit:'V'});
      }
    }
    if(type==='temperature') {add('Cell average','avgCellTempC','°C');range('minCellTempC','maxCellTempC','°C');}
    if(type==='current') {add('String current','currentA','A');add('String power','powerKw','kW');add('String measured','measuredVoltageVdc','V');}
    const at=timestamp(row?.sourceTimestampUtc),age=at?Date.parse(capturedAt)-Date.parse(at):null;
    const stale=telemetry?.stale || row?.stale===true || row?.stalePreserved===true || row?.staleData===true || row?.communicating===false || (age!=null && age>30000);
    return {scope:'String context',fields,source:typeof row?.metricSource==='string'?row.metricSource:'Canonical string telemetry',at,
      quality:invalid||fields.every(f=>f.value==null)?'unavailable':stale?'stale':age==null||!Number.isFinite(age)||age<0?'time unknown':'available'};
  };
}
