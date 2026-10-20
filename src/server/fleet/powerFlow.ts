import type {SiteView} from '../../core/fleet/model';
import type {FlowDirection,PowerFlowReading,PowerFlowSoc,SitePowerFlow} from '../../core/fleet/powerFlow';

const labels:Record<FlowDirection,string>={charging:'Charging',discharging:'Discharging',idle:'Idle',unknown:'Direction unavailable',stale:'Stale · flow withheld'};
const ttl=15000;
/** Operator-confirmed Solar Star display convention (2026-10-20):
 * negative charging, positive discharging.
 * Do NOT apply this convention to command setpoints (which may be inverted).
 * Unknown deployments fail closed until their measured convention is verified.
 */
export function projectSitePowerFlow(site:SiteView,now:number):SitePowerFlow {
 const supported=['BHE0020','BHE0021'].includes(site.stationCode);
 const reading=(power:number|null,stamp:string|null,quality:string):PowerFlowReading=>{
  const at=stamp?Date.parse(stamp):NaN;
  const known=supported&&power!==null&&Number.isFinite(power)&&Number.isFinite(at)&&at<=now;
  const fresh=known&&site.status==='current'&&quality==='live'&&now-at<ttl;
  const direction:FlowDirection=!known||quality==='unknown'?'unknown':!fresh?'stale':
   power< -0.5?'charging':power>0.5?'discharging':'idle';
  return {direction,powerKw:known?power:null,observedAt:stamp,label:labels[direction],validUntil:fresh?at+ttl:null};
 };
 const r=site.metrics?.powerKw??{value:null,observedAt:null,quality:'unknown',source:'Unavailable'};
 const net=reading(r.value,r.observedAt,r.source==='EMS Modbus'?r.quality:'unknown');
 const arrays=(site.details?.arrays??[]).map(a=>{
  const percent=a.socPct,stamp=a.socObservedAt??null,at=stamp?Date.parse(stamp):NaN;
  const known=typeof percent==='number'&&Number.isFinite(percent)&&percent>=0&&percent<=100&&Number.isFinite(at)&&at<=now&&a.socQuality!==undefined&&a.socQuality!=='unknown';
  const fresh=known&&site.status==='current'&&a.socQuality==='live'&&now-at<ttl;
  const connected=a.onlineStrings,total=a.stringCount;
  const countsValid=typeof connected==='number'&&Number.isSafeInteger(connected)&&connected>=0&&typeof total==='number'&&Number.isSafeInteger(total)&&total>0&&connected<=total;
  const coverage=known&&countsValid?{connected,total,label:`${connected}/${total} strings connected`,partial:connected<total}:null;
  const soc:PowerFlowSoc={percent:known?percent:null,quality:!known?'unknown':fresh?'live':'stale',observedAt:stamp,validUntil:fresh?at+ttl:null,source:'EMS array online SOC',coverage};
  return {array:a.number,...reading(a.powerKw,a.pcsObservedAt,a.pcsQuality),soc};
 });
 const mixed=arrays.some(a=>a.direction==='charging')&&arrays.some(a=>a.direction==='discharging');
 return {version:1,net,arrays,mixed,partial:!arrays.length||!!site.details?.omittedArrays||arrays.some(a=>['unknown','stale'].includes(a.direction)),
  source:'EMS Modbus net real power · Canonical PCS AC power by array',
  note:'Power-flow schematic, not switch-position or DC-current telemetry. Net site flow may differ from individual arrays. ±0.5 kW is shown as idle; animation speed does not represent power magnitude.'};
}
