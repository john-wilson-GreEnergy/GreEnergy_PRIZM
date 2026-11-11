import type {CellFrame,CellMetric,CellStringFrame} from '../../core/cellHistory';

export interface EngineeringSnapshotFile {name:string;body:string}
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const csvCell=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;
const csv=(rows:unknown[][])=>'\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const metricInfo={millivolts:{label:'Cell voltage',unit:'mV'},temperatureF:{label:'Cell temperature',unit:'°F'}} as const;

function cells(row:CellStringFrame,metric:CellMetric){
  return row[metric].map((value,index)=>({string:row.string,bpc:Math.floor(index/row.groupsPerBpc)+1,cell:index%row.groupsPerBpc+1,
    value,observedAt:row.observedAt[index]??null,ignored:metric==='temperatureF'&&row.ignoredTemperatures.includes(index)}));
}
function graph(rows:CellStringFrame[],metric:CellMetric){
  const traces=rows.map(row=>cells(row,metric)),values=traces.flat().map(p=>p.value).filter(finite),low=Math.min(...values),high=Math.max(...values),span=high-low||1;
  const width=1100,height=430,x=(i:number,n:number)=>45+i*Math.max(1,(width-70)/Math.max(1,n-1)),y=(v:number)=>height-35-(v-low)/span*(height-70);
  const colors=['#225ea8','#1d91c0','#41b6c4','#7fcdbb','#c7e9b4','#fdae61','#f46d43','#d73027'];
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(metricInfo[metric].label)} by string"><path d="M45 15V395H1080" fill="none" stroke="#81918b"/>${traces.map((trace,index)=>{
    const points=trace.map((p,i)=>finite(p.value)?`${x(i,trace.length).toFixed(1)},${y(p.value).toFixed(1)}`:'').filter(Boolean).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${colors[index%colors.length]}" stroke-width="1"><title>String ${trace[0]?.string??index+1}</title></polyline>`;
  }).join('')}<text x="50" y="18">${esc(high)} ${esc(metricInfo[metric].unit)}</text><text x="50" y="390">${esc(low)} ${esc(metricInfo[metric].unit)}</text></svg>`;
}
function page(site:string,at:number,array:number,rows:CellStringFrame[]){
  const section=(metric:CellMetric)=>`<section><h2>${esc(metricInfo[metric].label)} by string</h2>${graph(rows,metric)}</section>`;
  return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline'"><title>${esc(site)} Array ${array}</title><style>body{font:15px system-ui;max-width:1200px;margin:24px auto;padding:0 18px;color:#17372e}section{border:1px solid #ccd9d4;border-radius:8px;padding:14px;margin:18px 0}svg{width:100%;background:#fbfcfb}small{color:#50665f}</style><h1>${esc(site)} · Array ${array}</h1><p>${esc(new Date(at).toISOString())} · point-in-time retained cell evidence</p>${section('millivolts')}${section('temperatureF')}<small>Missing and ignored readings are blank; no interpolation or zero substitution.</small></html>`;
}

/** Builds the all-array spatial cell portion of the engineering ZIP contract. */
export function buildEngineeringCellSnapshot(frame:CellFrame):EngineeringSnapshotFile[]{
  if(frame.schema!==1||!Number.isSafeInteger(frame.acquiredAt)||!Array.isArray(frame.strings))throw Error('Invalid engineering snapshot frame');
  const site=`${frame.site.stationCode}-${frame.site.blockIndex}`,arrays=[...new Set(frame.strings.map(r=>r.array))].sort((a,b)=>a-b),files:EngineeringSnapshotFile[]=[];
  for(const array of arrays){
    const rows=frame.strings.filter(r=>r.array===array).sort((a,b)=>a.string-b.string);
    const table:unknown[][]=[['array','string','bpc','cell_group','observation_time_utc','voltage_mv','temperature_f','temperature_ignored']];
    for(const row of rows)for(let i=0;i<row.bpcCount*row.groupsPerBpc;i++)table.push([array,row.string,Math.floor(i/row.groupsPerBpc)+1,i%row.groupsPerBpc+1,row.observedAt[i]?new Date(row.observedAt[i]!).toISOString():'',row.millivolts[i],row.temperatureF[i],row.ignoredTemperatures.includes(i)]);
    files.push({name:`csv/cells_array_${array}.csv`,body:csv(table)},{name:`html/cells_array_${array}.html`,body:page(site,frame.acquiredAt,array,rows)});
  }
  const links=arrays.map(a=>`<li>Array ${a}: <a href="html/cells_array_${a}.html">graphs</a> · <a href="csv/cells_array_${a}.csv">CSV</a></li>`).join('');
  files.push({name:'index.html',body:`<!doctype html><html><meta charset="utf-8"><title>${esc(site)} engineering snapshot</title><style>body{font:16px system-ui;max-width:900px;margin:32px auto}li{margin:12px}</style><h1>${esc(site)} engineering snapshot</h1><p>${esc(new Date(frame.acquiredAt).toISOString())}</p><ul>${links}</ul></html>`});
  return files;
}
