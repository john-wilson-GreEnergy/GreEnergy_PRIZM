import type {NotificationGroup,NotificationTarget} from '../server/notifications/notificationReview';
export function targetMatches(t:NotificationTarget,query:string){
  const q=query.trim().toLowerCase();if(!q)return true;
  const coordinate=/^(array|string|bpc|cell)\s*(\d+)$/i.exec(q);
  if(coordinate){const key=coordinate[1].toLowerCase();return (key==='array'?t.array:t.location?.[key as 'string'|'bpc'|'cell'])===Number(coordinate[2]);}
  return t.label.toLowerCase().includes(q);
}
export function selectedTargets(group:NotificationGroup,array:string,query:string){return group.targets.filter(t=>(array==='all'||String(t.array)===array)&&targetMatches(t,query));}
const safeCell=(v:string)=>'"'+(/^[=+\-@\t\r]/.test(v)?"'":'')+v.replaceAll('"','""')+'"';
export function correctiveCsv(groups:NotificationGroup[],array:string,query:string,site:string,capturedAt:string,stale:boolean,warnings:string[]=[]){
  const records=[['Site','Snapshot','Freshness / coverage','Severity','Code','Issue','Target','Recommended steps','Clearing criteria','Guidance source']];
  for(const g of groups)for(const t of selectedTargets(g,array,query)){
    const guidance=(key:'actions'|'clearing')=>g.troubleshooting?.[key].filter(i=>i.targetIds.includes(t.id)).map(i=>(i.advisory?'General advisory: ':'')+i.text).join(' | ')||'Not supplied';
    records.push([site,capturedAt,[stale?'Retained / verify freshness':'Published snapshot — verify before field work',...warnings].join(' | '),g.severity,g.code,g.title,t.label,guidance('actions'),guidance('clearing')+(g.documentedClearing?` | Documented: ${g.documentedClearing}`:''),(g.troubleshooting?.sources??[]).filter(s=>s.targetIds.includes(t.id)).map(s=>s.label+(s.advisory?' (general advisory)':'')).join(' | ')||'Not supplied']);
  }
  return records.map(row=>row.map(safeCell).join(',')).join('\r\n');
}
export function downloadText(name:string,body:string,type='text/csv;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function printableWorklist(groups:NotificationGroup[],array:string,query:string,site:string,at:string,stale:boolean,warnings:string[]=[]){
  const sections=groups.map(g=>{
    const targets=selectedTargets(g,array,query),ids=new Set(targets.map(t=>t.id));
    const guidance=(key:'actions'|'clearing'|'validation'|'safety')=>`<ul>${(g.troubleshooting?.[key]??[]).filter(i=>i.targetIds.some(id=>ids.has(id))).map(i=>`<li>${i.advisory?'General advisory: ':''}${esc(i.text)}<small> Applies to: ${esc(targets.filter(t=>i.targetIds.includes(t.id)).map(t=>t.label).join('; '))}</small></li>`).join('')||'<li>Not supplied.</li>'}</ul>`;
    const sources=(g.troubleshooting?.sources??[]).filter(s=>s.targetIds.some(id=>ids.has(id))).map(s=>s.label+(s.advisory?' (general advisory)':''));
    return `<section><h2>${esc(g.code+' · '+g.title)} — ${esc(g.severity)}</h2><p>${esc(targets.map(t=>t.label).join('; '))}</p><h3>Safety / prerequisites</h3>${guidance('safety')}<h3>Recommended steps</h3>${guidance('actions')}<h3>Validation</h3>${guidance('validation')}<h3>Clearing criteria</h3>${guidance('clearing')}<p>${esc(g.documentedClearing||'')}</p><small>Guidance source: ${esc(sources.join('; ')||'Not supplied')}. ${esc((g.sourceNotes??[]).join('; '))}</small></section>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><title>PRIZM worklist</title><style>body{font:14px/1.5 system-ui;margin:32px;color:#19372f}h1{font-size:24px}h2{font-size:18px}h3{font-size:14px}section{border-top:1px solid #ccc;margin-top:24px}small{display:block;color:#555}li{break-inside:avoid}@media print{body{margin:0}}</style><h1>PRIZM · Corrective-action worklist</h1><p>${esc(site)} · ${esc(at)} · ${stale?'RETAINED DATA — VERIFY FRESHNESS':'Published snapshot'}</p>${warnings.map(w=>`<p><strong>Coverage warning: ${esc(w)}</strong></p>`).join('')}<p>Inspection / replacement candidates, not confirmed replacement decisions. Reference only; does not authorize equipment commands or field work. Filters: array ${esc(array)}; target ${esc(query||'all')}.</p>${sections}`;
}
