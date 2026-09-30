import {NOTIFICATION_CATALOG, type NotificationCatalogEntry} from './notificationCatalog';
import {buildNotificationTargetTable, type NotificationTableRow} from './notificationTargetTable';
import {createNotificationMetrics,type NotificationTelemetry} from './notificationMetrics';
import {appendTroubleshooting,emptyTroubleshooting,type NotificationTroubleshooting} from './notificationTroubleshooting';
/** Read-only presentation projection. Never clears, acknowledges or suppresses a finding. */
type RecordValue = Record<string, unknown>;
const obj = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const text = (...values: unknown[]) => String(values.find(v => v !== null && v !== undefined && v !== '') ?? '');
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const number = (...values: unknown[]): number | null => {
  const value = values.find(v => v !== null && v !== undefined && v !== '');
  return value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
};
export type NotificationSeverity = 'critical' | 'alarm' | 'warning' | 'info' | 'unknown';
export interface NotificationEvidence { label: string; value: string }
export interface NotificationTarget {
  id: string; label: string; array: number | null; source: string[];
  location?: {block:number; string:number|null; bpc:number|null; cell:number|null; unit:number|null; pcs:number|null; segment?:number|null; side?:string; ip?:string};
  observations: { title: string; condition: string; at: string | null; evidence: NotificationEvidence[]; guidance: string[] }[];
}
export interface NotificationGroup {
  id: string; code: string; title: string; category: string; severity: NotificationSeverity;
  section?: 'equipment' | 'availability'; explanation?: string;
  documentedClearing?: string; catalogSource?: NotificationCatalogEntry['source']; sourceNotes?: string[];
  targets: NotificationTarget[]; targetCount: number; arrays: number[];
  tableRows?: NotificationTableRow[]; commonGuidance?: string[];
  troubleshooting?:NotificationTroubleshooting;
}
export interface NotificationReview {
  version: 1; capturedAt: string; groups: NotificationGroup[];
  totals: { groups: number; targets: number; occurrences: number; alarm: number; warning: number; unknown: number };
  inputFindings: number; inputTargets: number;
  sourceNotes?: string[];
  sourceWarnings?: string[];
}
const rank = { critical: 0, alarm: 1, warning: 2, unknown: 3, info: 4 };
const titles: Record<string, string> = {
  'contactor-requested-closed-actual-open': 'String requested closed but contactors are open',
  'contactor-requested-open-actual-closed': 'String requested open but contactors are closed',
  'contactor-feedback-mismatch': 'Contactor feedback mismatch',
  'hvac-commanded-no-current': 'HVAC commanded on — no running feedback',
  'hvac-current-without-command': 'HVAC running feedback without command',
};
const codes: Record<string, string> = {
  'contactor-requested-closed-actual-open': 'STR-CON-EXPECTED-CLOSED-ACTUAL-OPEN',
  'contactor-requested-open-actual-closed': 'STR-CON-EXPECTED-OPEN-ACTUAL-CLOSED',
  'contactor-feedback-mismatch': 'STR-CON-MISMATCH',
  'hvac-commanded-no-current': 'ENV-HVAC-COMMANDED-NO-CURRENT',
  'hvac-current-without-command': 'ENV-HVAC-CURRENT-WITHOUT-COMMAND',
};
function evidenceFor(issue: RecordValue, target: RecordValue): NotificationEvidence[] {
  const ev = {...obj(issue.evidence), ...obj(target.evidence)};
  const fields: Record<string, string> = {requestedState:'Requested state',actualState:'Observed state',rotationState:'Rotation state',rotationSource:'Rotation source',positiveContactorClosed:'Positive contactor closed',negativeContactorClosed:'Negative contactor closed',stringToBusDeltaVoltage:'String / bus delta (V)',quality:'Source quality',commanded:'HVAC commanded',active:'Running feedback',currentA:'Current (A)',hvacProfile:'HVAC profile',mismatchType:'Mismatch',hvacLatchStatus:'Retention status'};
  const rows = Object.entries(fields).flatMap(([key,label]) => ev[key] == null ? [] : [{label,value:String(ev[key])}]);
  if (ev.hvacProfile === 'bergstrom' && ev.fanSpeedRpm != null) rows.push({label:'Fan speed (RPM)',value:String(ev.fanSpeedRpm)});
  const paired = obj(ev.pairedHvac);
  for (const unit of ['hvac1','hvac2']) {
    const state = obj(paired[unit]);
    if (Object.keys(state).length) rows.push({label:unit === 'hvac1' ? 'HVAC 1 · command / current' : 'HVAC 2 · command / current',value:`${state.commanded === true ? 'ON' : state.commanded === false ? 'OFF' : 'Unknown'} / ${state.currentA == null ? 'Unknown' : `${state.currentA} A`}`});
  }
  return rows;
}
/** Availability context from canonical rows, not a new fault rule or command. */
export function buildRotationStatusFindings(strings: unknown[], pcsRows: unknown[]): RecordValue[] {
  const sources: [string,unknown[]][] = [['String',strings],['PCS',pcsRows]];
  return sources.flatMap(([kind,rows]) => rows.flatMap(value => {
    const row=obj(value), rotation=obj(row.rotation);
    const state=text(row.rotationStatus,rotation.displayState).toUpperCase();
    if (!['OUT','OUT_OF_ROTATION','OUT OF ROTATION'].includes(state)) return [];
    const array=number(row.arrayNumber,row.arrayIndex);
    const device=kind==='PCS'?number(row.pcsIndex,row.pcsNumber):number(row.stringNumber,row.stringIndex);
    if (array==null || device==null) return [];
    const capturedAt=text(rotation.fetchedAt,row.fetchedAt,row.timestampUtc,row.sourceTimestampUtc);
    return [{code:`PRIZM-${kind==='PCS'?'PCS':'STR'}-OUT-OF-ROTATION`,title:`${kind} out of rotation`,subsystem:kind,severity:'info',
      source:'canonical availability status',detectedCondition:`${kind} is reported out of rotation. This operating state alone is not a new fault.`,
      affected:[{arrayIndex:array,...(kind==='PCS'?{pcsIndex:device}:{stringIndex:device}),label:`Array ${array} / ${kind} ${device}`}],
      evidence:{rotationState:state,rotationSource:text(rotation.source,row.source,'Canonical snapshot'),capturedAt:capturedAt||null,
        quality:row.stale===true||row.communicating===false?'retained / verify freshness':'Snapshot state; verify source time'}}];
  }));
}
export function buildNotificationReview(inputs: unknown[], capturedAt: string, telemetry?:NotificationTelemetry): NotificationReview {
  const metricsFor=createNotificationMetrics(telemetry,capturedAt);
  const groups = new Map<string, NotificationGroup>();
  let inputTargets = 0;
  for (const [index, input] of inputs.entries()) {
    const issue = obj(input), ev = obj(issue.evidence);
    const strategy = text(issue.remediationStrategyId);
    const code = text(issue.nativeFaultCode, issue.code, issue.faultCode, ev.normalizedFaultCode, ev.faultCode, codes[strategy], issue.faultId);
    const resolved = obj(issue.resolved);
    const knownName = resolved.matched === true ? obj(resolved.resolvedTroubleshooting).issueName : '';
    const title = text(titles[strategy],NOTIFICATION_CATALOG[code]?.name,knownName,issue.title,issue.faultName,issue.fault,issue.faultLabel,'Unclassified notification');
    const rawSeverity = text(issue.severity,issue.level,NOTIFICATION_CATALOG[code]?.defaultSeverity).toLowerCase();
    const severity: NotificationSeverity = rawSeverity === 'fault' ? 'alarm' : Object.hasOwn(rank,rawSeverity) ? rawSeverity as NotificationSeverity : 'unknown';
    const categoryText = `${issue.subsystem} ${resolved.system} ${NOTIFICATION_CATALOG[code]?.component ?? ''} ${title} ${code}`;
    const category = /hvac|environment|fan|compressor/i.test(categoryText) ? 'HVAC / Environmental' : /\bpcs\b|inverter/i.test(categoryText) ? 'PCS' : /string|cell|bpc|balanc|contactor/i.test(categoryText) ? 'String / Cell' : 'Other site issues';
    const section = /contactor|rotation|\boor\b/i.test(`${categoryText} ${strategy} ${NOTIFICATION_CATALOG[code]?.family ?? ''}`) ? 'availability' : 'equipment';
    // Known codes group across targets; uncoded findings group only by exact normalized title.
    const id = JSON.stringify([category,severity,code || title.toLowerCase()]);
    let group = groups.get(id);
    if (!group) { group = {id,code,title,category,severity,section,explanation:NOTIFICATION_CATALOG[code]?.description,
      documentedClearing:NOTIFICATION_CATALOG[code]?.clearingDescription,catalogSource:NOTIFICATION_CATALOG[code]?.source,sourceNotes:NOTIFICATION_CATALOG[code]?.sourceNotes,
      targets:[],targetCount:0,arrays:[]}; groups.set(id,group); }
    const affected = list(issue.affected).length ? list(issue.affected) : list(issue.occurrences).length ? list(issue.occurrences) : list(issue.affectedTargets).length ? list(issue.affectedTargets) : [issue];
    const guidanceTargetIds:string[]=[];
    for (const [targetIndex, value] of affected.entries()) {
      inputTargets++;
      const target = obj(value);
      const rawLabel = text(typeof value === 'string' ? value : '',target.callout,target.displayLabel,target.label,target.object,ev.targetLabel,issue.targetLabel)
        .replace(/block-\d+_ARR_\d+_STR_(\d+)_ES\b/gi,'Energy Segment $1')
        .replace(/block-\d+_ARR_\d+_CS\b/gi,'Collection Segment');
      const array = number(target.arrayIndex,target.arrayNumber,issue.arrayNumber,ev.arrayNumber,rawLabel.match(/Array\s+(\d+)/i)?.[1]);
      const string = number(target.stringIndex,target.stringNumber,issue.stringNumber,rawLabel.match(/String\s+(\d+)/i)?.[1]);
      const segment = number(target.energySegmentIndex,target.energySegmentNumber,ev.energySegmentNumber,rawLabel.match(/(?:ES|Energy Segment)\s*(\d+)/i)?.[1]);
      const bpc = number(target.batteryPackIndex,target.bpcIndex,target.bpc,rawLabel.match(/BPC\s*(\d+)/i)?.[1]);
      const cell = number(target.cellGroupIndex,rawLabel.match(/(?:CG|Cell Group)\s*(\d+)/i)?.[1]);
      const unit = number(target.hvacUnit,ev.hvacUnit,rawLabel.match(/HVAC\s*(\d+)/i)?.[1]);
      const pcs = number(target.pcsIndex,target.pcsNumber,issue.pcsIndex,rawLabel.match(/PCS\s*(\d+)/i)?.[1]);
      const ip = text(target.deviceIp,target.ip,ev.deviceIp,issue.deviceIp);
      const block=number(target.blockIndex,issue.blockIndex)??1;
      const label = rawLabel || [array == null ? null : `Array ${array}`, string == null ? segment == null ? null : `Energy Segment ${segment}` : `String ${string}`,unit == null ? null : `HVAC ${unit}`,ip].filter(Boolean).join(' / ') || text(issue.object,issue.stringKey,'Location unavailable');
      // No topology guesses: unresolved targets remain separate unless the exact label/IP matches.
      const targetId = JSON.stringify([block,array,string,string == null ? segment : null,bpc,cell,unit,string == null ? ip : '',string == null && segment == null && !ip ? rawLabel || `${text(issue.id,index)}:${targetIndex}` : '',pcs]);
      guidanceTargetIds.push(targetId);
      let entry = group.targets.find(t => t.id === targetId);
      if (!entry) { entry={id:targetId,label,array,location:{block,string,bpc,cell,unit,pcs,segment,side:text(target.side,rawLabel.match(/\b[AB]-Side\b/i)?.[0]),ip},source:[],observations:[]}; group.targets.push(entry); }
      const source = text(target.source,issue.source,ev.source,'Source not specified');
      if (!entry.source.includes(source)) entry.source.push(source);
      const remediation = obj(issue.remediation), kb = obj(obj(issue.resolved).resolvedTroubleshooting);
      const guidance = [...list(issue.recommendedActions),...list(remediation.technicianSteps),issue.suggestedAction,...list(issue.safetyNotes)].filter(v=>typeof v==='string' && v.length) as string[];
      // Native troubleshooting is retained, but never substitutes for runtime evidence.
      if (!strategy && kb.summaryAction) guidance.push(String(kb.summaryAction));
      const observation = {title,condition:text(issue.detectedCondition,issue.details,ev.detectedCondition),at:text(target.timestamp,ev.capturedAt) || null,evidence:evidenceFor(issue,target),guidance:[...new Set(guidance)]};
      if (!entry.observations.some(o=>JSON.stringify(o)===JSON.stringify(observation))) entry.observations.push(observation);
    }
    group.troubleshooting??=emptyTroubleshooting();
    appendTroubleshooting(group.troubleshooting,issue,guidanceTargetIds);
  }
  const output = [...groups.values()];
  for (const group of output) {
    group.targets.sort((a,b)=>(a.array ?? Infinity)-(b.array ?? Infinity)||a.label.localeCompare(b.label,undefined,{numeric:true}));
    group.targetCount=group.targets.length;
    group.arrays=[...new Set(group.targets.flatMap(t=>t.array == null ? [] : [t.array]))].sort((a,b)=>a-b);
    const table=buildNotificationTargetTable(group.targets,group.title);
    group.tableRows=table.rows;
    const targetsById=new Map(group.targets.map(target=>[target.id,target]));
    for(const row of table.rows) row.metrics=metricsFor(group.code,targetsById.get(row.memberIds[0])!);
    group.commonGuidance=table.commonGuidance;
  }
  output.sort((a,b)=>rank[a.severity]-rank[b.severity]||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
  return {version:1,capturedAt,groups:output,inputFindings:inputs.length,inputTargets,totals:{groups:output.length,targets:new Set(output.flatMap(g=>g.targets.map(t=>t.id))).size,occurrences:output.reduce((n,g)=>n+g.targetCount,0),alarm:output.filter(g=>g.severity==='alarm'||g.severity==='critical').reduce((n,g)=>n+g.targetCount,0),warning:output.filter(g=>g.severity==='warning').reduce((n,g)=>n+g.targetCount,0),unknown:output.filter(g=>g.severity==='unknown').reduce((n,g)=>n+g.targetCount,0)}};
}
