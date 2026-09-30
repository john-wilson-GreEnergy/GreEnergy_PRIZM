/** Preserve existing guidance in a group-level, target-scoped presentation. No lookup or device I/O. */
export type GuidanceSection='actions'|'validation'|'clearing'|'safety'|'field';
export interface GuidanceItem {text:string;targetIds:string[];advisory:boolean}
export interface NotificationTroubleshooting {
  actions:GuidanceItem[];validation:GuidanceItem[];clearing:GuidanceItem[];safety:GuidanceItem[];field:GuidanceItem[];
  sources:{label:string;entryId:string|null;advisory:boolean;targetIds:string[]}[];
}
type Row=Record<string,unknown>;
const obj=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
const strings=(v:unknown):string[]=>Array.isArray(v)?v.map(text).filter(Boolean):text(v)?[text(v)]:[];
export const emptyTroubleshooting=():NotificationTroubleshooting=>({actions:[],validation:[],clearing:[],safety:[],field:[],sources:[]});
export function appendTroubleshooting(result:NotificationTroubleshooting,input:unknown,targetIds:string[]) {
  const issue=obj(input),resolved=obj(issue.resolved),kb=obj(resolved.resolvedTroubleshooting),remediation=obj(issue.remediation);
  const advisory=resolved.matched===false||kb.id==='unknown-issue';
  const add=(section:GuidanceSection,values:unknown[],fallback=false)=>{
    for(const value of [...new Set(values.flatMap(strings))]) {
      let entry=result[section].find(item=>item.text===value&&item.advisory===fallback);
      if(!entry){entry={text:value,targetIds:[],advisory:fallback};result[section].push(entry);}
      entry.targetIds=[...new Set([...entry.targetIds,...targetIds])];
    }
  };
  add('actions',[kb.recommendedActions,resolved.recommendedActions],advisory);
  add('validation',[kb.validationChecks,resolved.validationChecks],advisory);
  add('clearing',[kb.clearingCriteria,resolved.clearingCriteria],advisory);
  add('safety',[kb.safetyNote],advisory);
  add('field',[kb.fieldCorrections,kb.technicianDetail,resolved.replacementGuidance,resolved.escalationGuidance],advisory);
  add('actions',[issue.recommendedActions,remediation.technicianSteps]);
  if(![kb.recommendedActions,resolved.recommendedActions,issue.recommendedActions,remediation.technicianSteps].some(v=>strings(v).length)) add('actions',[issue.suggestedAction,kb.summaryAction],advisory);
  add('validation',[issue.validationChecks,remediation.validationChecks]);
  add('clearing',[issue.clearingCriteria,remediation.clearingCriteria]);
  add('safety',[issue.safetyNotes,remediation.safetyNotes]);
  add('field',[remediation.escalationCriteria]);
  const label=text(resolved.sourceLabel)||[text(kb.sourceDocument),kb.sourcePage==null?'':`Page ${kb.sourcePage}`].filter(Boolean).join(' · ');
  const entryId=advisory?null:text(resolved.matrixEntryId)||text(kb.id)||null;
  if(label) {
    let source=result.sources.find(s=>s.label===label&&s.entryId===entryId&&s.advisory===advisory);
    if(!source){source={label,entryId,advisory,targetIds:[]};result.sources.push(source);}
    source.targetIds=[...new Set([...source.targetIds,...targetIds])];
  }
}
