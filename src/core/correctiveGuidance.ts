/** Presentation guidance only. Never changes telemetry, severity or clearing logic. */
export interface CorrectiveGuidanceEntry {
  key:string; category:string; actions:string[]; validation:string[]; clearing:string[];
  reference:string; reason:string; updatedAt:string; updatedBy:string;
}
export interface CorrectiveGuidanceState {
  version:1; revision:number; entries:Record<string,CorrectiveGuidanceEntry>;
  history:{revision:number;at:string;actor:string;key:string;reason:string;previous:CorrectiveGuidanceEntry|null;next:CorrectiveGuidanceEntry|null}[];
}
export const emptyCorrectiveGuidance=():CorrectiveGuidanceState=>({version:1,revision:0,entries:{},history:[]});
export const correctiveGuidanceKey=(group:{code:string;category:string;title:string})=>JSON.stringify([group.category,group.code||group.title]);
export const correctiveDisplayCategory=(group:{displayCategory?:string;section?:string;category:string})=>group.displayCategory||(group.section==='availability'?'Contactors & rotation':group.category);
