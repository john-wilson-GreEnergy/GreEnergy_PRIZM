import {jsPDF} from 'jspdf';
import * as XLSX from 'xlsx';
import {exportColumns,packetRows,type CorrectivePacket} from './correctivePacket';
import {buildNotificationTargetTable} from '../server/notifications/notificationTargetTable';

/** Offline app export, using the utility's existing bundled writers. No cloud upload. */
export function packetWorkbook(p:CorrectivePacket){
  const wb=XLSX.utils.book_new();
  const append=(name:string,rows:unknown[][],widths:number[])=>{
    const sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=widths.map(wch=>({wch}));
    if(rows.length>1)sheet['!autofilter']={ref:XLSX.utils.encode_range({r:0,c:0},{r:rows.length-1,c:rows[0].length-1})};
    XLSX.utils.book_append_sheet(wb,sheet,name);
  };
  append('Worklist',[Array.from(exportColumns),...packetRows(p)],[28,25,50,24,12,22,48,60,8,8,8,8,10,28,70,70,70,60,60,65,35,12]);
  append('Unique BPCs',[
    ['Scope','Array','String','BPC number','Reported severity','Issue codes (whole device)','Cell groups (whole device)','Technician','Work notes','Verification result'],
    ...(p.bpcs??[]).map(d=>[p.site,d.array,d.string,d.bpc,d.severity,d.issues.map(i=>i.code).join(', '),d.cells,'','','']),
  ],[28,10,10,14,20,35,40,24,60,40]);
  if(p.inventory)append('Balancing quantities',[
    ['Scope','BPC number','Charge only','Discharge only','Both faults','Unique quantity','Coverage'],
    ...(p.inventory?.rows??[]).map(r=>[p.site+' - entire site',r.bpc,r.chargeOnly,r.dischargeOnly,r.both,r.quantity,p.inventory?.partial?'Partial - lower bound':'Mapped candidates']),
  ],[40,14,14,16,14,18,35]);
  append('Snapshot notes',[
    ['Field','Value'],['Brand','GreEnergy PRIZM'],['Site',p.site],['Snapshot UTC',p.capturedAt],['Exported UTC',p.generatedAt],['Site guidance revision',p.revision],['Shared guidance revision',p.sharedRevision],
    ['Filters',JSON.stringify(p.filters)],['Fault groups selected',p.selected.length],['Reported target rows',p.targets.length],['Unique BPCs in selected faults',p.bpcs?.length??'Unavailable'],
    ['BPC coverage',p.partialBpcs?'Partial / unavailable - counts are lower bounds':'Mapped physical devices'],
    ['Balancing quantities scope',p.inventory?'Entire site, independent of export filters. Charge 2074 + discharge 2073; each physical BPC counted once.':'Not included in this selected worklist.'],
    ['Coverage warnings',p.warnings.join('\n')||'None supplied'],['Freshness',p.stale?'Retained snapshot - verify freshness':'Published snapshot - verify before field work'],
    ['Use','Inspection / replacement candidates, not confirmed replacement orders. Does not authorize switching or field work. Follow approved site procedures.'],
    ['Guidance','Local edits are reference guidance only; they do not change controller clear logic. Blank guidance is not an all-clear.'],
  ],[36,110]);
  return wb;
}
const pdfText=(v:string)=>v.replace(/[–—−]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/→/g,'to').replace(/[^\x20-\x7e\n\r\t\u00a0-\u00ff]/g,'?');
export function packetPdf(p:CorrectivePacket,logo?:string,options:{compactBpcs?:boolean}={}){
  const compactBpcs=options.compactBpcs!==false;
  const checklist=compactBpcs?p.bpcChecklist:[];
  const listedIds=new Set(checklist.flatMap(d=>d.targetIds));
  const doc=new jsPDF({unit:'pt',format:'letter'}),width=516,left=48,bottom=730;let y=0,context='';
  const header=()=>{doc.setFillColor(20,73,54);doc.rect(0,0,612,72,'F');if(logo)doc.addImage(logo,'PNG',48,16,40,40);doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('GreEnergy PRIZM',logo?100:48,35);doc.setFontSize(10);doc.text('CORRECTIVE ACTIONS / FIELD WORK TICKET',logo?100:48,54);y=94;doc.setTextColor(28,53,43);};
  const next=()=>{doc.addPage();header();if(context){doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text(pdfText(context),left,y);y+=20;}};
  const line=(text:string,size=10,bold=false)=>{
    doc.setFontSize(size);doc.setFont('helvetica',bold?'bold':'normal');
    const lines=doc.splitTextToSize(pdfText(text),width) as string[];
    for(const l of lines){if(y+size*1.4>bottom){next();doc.setFontSize(size);doc.setFont('helvetica',bold?'bold':'normal');}doc.text(l,left,y);y+=size*1.4;}y+=4;
  };
  const section=(title:string,texts:string[])=>{if(y>bottom-65)next();doc.setDrawColor(198,216,205);doc.line(left,y-10,left+width,y-10);line(title,11,true);for(const text of texts.length?texts:['Not supplied. Confirm the approved procedure before work.'])line(text);y+=6;};
  header();line('Field work package',20,true);line(p.site,12,true);line('Snapshot: '+p.capturedAt+' | Exported: '+p.generatedAt);line('Filters: '+Object.entries(p.filters).map(([k,v])=>k+' = '+v).join('; '));
  line(p.stale?'RETAINED DATA - VERIFY FRESHNESS':'Published snapshot - verify current conditions before field work',11,true);
  p.warnings.forEach(w=>line('Coverage warning: '+w,10,true));
  line(p.selected.length+' fault groups | '+p.targets.length+' reported target rows | '+(p.bpcs?p.bpcs.length:'Unavailable')+' unique mapped BPCs in selected faults',11,true);
  if(p.partialBpcs)line('BPC counts are incomplete or unavailable. Treat available counts as lower bounds.');
  line('Guidance revision: site '+p.revision+' / shared '+p.sharedRevision+'. Inspection / replacement candidates are not confirmed replacement orders. This ticket does not authorize equipment commands, switching or field work. Follow approved site procedures.');
  section('Dispatch', ['Work order / permit: __________________________________________________','Assigned technician: _________________________  Planned date: ______________','Supervisor / dispatcher: __________________________________________________']);
  if(p.inventory){section('Balancing configuration quantities - entire site', ['Independent of filters. Charge 2074 + discharge 2073, each BPC counted once. '+(p.inventory.partial?'Partial coverage; lower bounds.':''),...p.inventory.rows.map(r=>'BPC '+r.bpc+': '+r.quantity+' total ('+r.chargeOnly+' charge only; '+r.dischargeOnly+' discharge only; '+r.both+' both)')]);}
  if(checklist.length){
    const checklistHeader=()=>{line('BPC field checklist - '+checklist.length+' unique devices',12,true);line(p.site+' | Snapshot: '+p.capturedAt,9);line('One checkbox per BPC. Fault codes at right refer to guidance tickets below.',9);};
    if(y>bottom-100)next();checklistHeader();
    for(let i=0;i<checklist.length;i+=2){
      const pair=checklist.slice(i,i+2);
      doc.setFontSize(8);
      const codeLines=pair.map(d=>doc.splitTextToSize(d.codes.join(', '),68) as string[]);
      const height=Math.max(18,6+Math.max(...codeLines.map(lines=>lines.length))*10);
      if(y+height>bottom){next();checklistHeader();}
      pair.forEach((d,col)=>{
        const x=left+col*264;
        doc.setDrawColor(90,119,104);doc.rect(x,y-7,9,9);
        doc.setFont('helvetica','bold');doc.setFontSize(9);
        doc.text(`Array ${d.array} / String ${d.string} / BPC ${d.bpc}`,x+16,y);
        doc.setFont('helvetica','normal');doc.setFontSize(8);
        codeLines[col].forEach((code,j)=>doc.text(pdfText(code),x+180,y+j*10));
      });
      y+=height;
    }
    line('Checklist marks record field progress only, not verified fault clearance. Detailed cell observations and timestamps remain in CSV / Excel exports.',9);
  }
  p.selected.forEach((g,index)=>{
    const ticket='CA-'+p.capturedAt.replace(/[^0-9]/g,'').slice(0,14)+'-'+String(index+1).padStart(3,'0');context=ticket+' | '+g.code;next();
    line(p.site+' | Snapshot: '+p.capturedAt);line(g.code+' - '+g.title,16,true);line((g.displayCategory||g.category)+' | '+g.severity.toUpperCase()+' | '+g.targets.length+' selected targets | '+g.targetCount+' whole-group targets',10,true);
    line('Reference guidance revision: site '+p.revision+' / shared '+p.sharedRevision+'. Controller clearing behavior is unchanged.');
    section('Safety / prerequisites',p.textFor(g,'safety'));
    for(const [key,label] of [['actions','Recommended actions'],['validation','Validation checks'],['clearing','Clear conditions / required state']] as const){
      const selectedIds=new Set(g.targets.map(t=>t.id));
      const items=(g.troubleshooting?.[key]??[]).filter(i=>i.targetIds.some(id=>selectedIds.has(id)));
      section(label,items.map((i,n)=>(n+1)+'. '+(i.advisory?'General advisory: ':'')+i.text+(g.targets.some(t=>!i.targetIds.includes(t.id))?' Applies only to: '+g.targets.filter(t=>i.targetIds.includes(t.id)).map(t=>t.label).join('; '):'')));
    }
    if(g.documentedClearing)section('Documented controller clearing behavior',[g.documentedClearing]);
    section('Guidance references',[...new Set((g.troubleshooting?.sources??[]).filter(s=>s.targetIds.some(id=>g.targets.some(t=>t.id===id))).map(s=>s.label+(s.advisory?' - general advisory':'')))]);
    const mapped=checklist.filter(d=>d.targetIds.some(id=>g.targets.some(t=>t.id===id)));
    if(mapped.length)line('Affected BPCs: '+mapped.length+' unique devices. Use the combined BPC field checklist at the front of this package; match fault code '+g.code+'.',10,true);
    const otherTargets=g.targets.filter(t=>!listedIds.has(t.id));
    if(otherTargets.length){if(y>bottom-65)next();line('Affected equipment - '+(mapped.length?'other / unresolved targets':'consolidated target list'),11,true);}
    for(const row of buildNotificationTargetTable(otherTargets,g.title).rows){if(y>bottom-65)next();line('[  ] '+row.label,10,true);if(row.scope.join('; ')!==row.label)line(row.scope.join('; '));if(row.context.length)line(row.context.join('; '),9);line('Observed: '+[...new Set(row.observations.flatMap(o=>o.times.length?o.times:['Not supplied']))].join('; ')+' | Source: '+row.source.join('; '),9);}
    if(y>bottom-160)next();section('Field record',['Work performed / parts / serial numbers: __________________________________','________________________________________________________________________','________________________________________________________________________','Verification readings / observations: _______________________________________','________________________________________________________________________','Technician / date: ____________________  Operator review / date: ______________','Status: [  ] Open  [  ] Follow-up needed  [  ] Work performed, verification pending','Resolution must be verified in current telemetry. A completed form does not clear an alarm.']);
  });
  const count=doc.getNumberOfPages();for(let n=1;n<=count;n++){doc.setPage(n);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(80,96,86);doc.text('GreEnergy Resources LLC | PRIZM | Reference snapshot - not a switching order',48,762);doc.text('Page '+n+' of '+count,564,762,{align:'right'});}
  return doc;
}
