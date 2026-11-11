import type {ArrayCellSnapshot,CellFrame,CellHistorySite,CellMetric,CellStringFrame} from '../../core/cellHistory';
import type {SiteAnalytics} from '../../core/siteAnalytics';

export interface EngineeringSnapshotFile {name:string;body:string}
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const csvCell=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;
const csv=(rows:unknown[][])=>'\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const metricInfo={millivolts:{label:'Cell voltage',unit:'mV'},temperatureF:{label:'Cell temperature',unit:'°F'}} as const;

function documentPage(title:string,body:string){return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline'"><title>${esc(title)}</title><style>body{font:14px system-ui;max-width:1240px;margin:28px auto;padding:0 18px;color:#17372e}section{border:1px solid #ccd9d4;border-radius:8px;padding:14px;margin:18px 0;overflow:auto}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #dde6e2;padding:7px;text-align:left;white-space:nowrap}th{background:#edf4f1}svg{width:100%;min-width:720px;background:#fbfcfb}.muted{color:#60736c}</style><h1>${esc(title)}</h1>${body}</html>`}
function valueAt(row:any,keys:string[]){for(const key of keys){const value=row?.[key];if(value!==undefined&&value!==null&&value!=='')return value}return null}
function objectRows(value:any,keys:string[]){if(Array.isArray(value))return value;for(const key of keys)if(Array.isArray(value?.[key]))return value[key];return []}
function tableHtml(headers:string[],rows:unknown[][]){return `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`}
const engineeringColors=['#2878bd','#ef6c35','#22a77a','#8d62ba','#d6a11d','#d34f73','#4b9ca6','#7b7f35'];
function pcsPowerGraph(pcs:any[]){
  const series=[
    {label:'Commanded',color:engineeringColors[0],keys:['acCmdRealPowerKW','commandRealPowerKW','realPowerCommandKW']},
    {label:'Setting',color:engineeringColors[1],keys:['acRealPowerSettingKW','realPowerSettingKW']},
    {label:'Actual',color:engineeringColors[2],keys:['acRealPowerKW','acRealPowerKw']},
  ], values=pcs.flatMap(row=>series.map(item=>Number(valueAt(row,item.keys))).filter(Number.isFinite)),max=Math.max(1,...values.map(Math.abs)),width=1100,height=360;
  const x=(index:number)=>90+index*Math.max(1,(width-150)/Math.max(1,pcs.length-1)),y=(value:number)=>height/2-value/max*(height/2-60);
  const legend=series.map((item,index)=>`<circle cx="${390+index*150}" cy="24" r="5" fill="${item.color}"/><text x="${402+index*150}" y="29">${item.label}</text>`).join('');
  const marks=pcs.flatMap((row,index)=>series.map((item,offset)=>{const value=Number(valueAt(row,item.keys));return Number.isFinite(value)?`<circle cx="${x(index)+offset*10-10}" cy="${y(value)}" r="5" fill="${item.color}"><title>Array ${esc(valueAt(row,['arrayIndex','array']))} ${item.label}: ${value} kW</title></circle>`:''})).join('');
  const labels=pcs.map((row,index)=>`<text x="${x(index)}" y="${height-18}" text-anchor="middle">${esc(valueAt(row,['arrayIndex','array']))}</text>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="PCS AC real power by array"><path d="M70 ${height/2}H1070" stroke="#a9b6b1"/><path d="M70 45V${height-45}" stroke="#a9b6b1"/>${legend}${marks}${labels}<text x="18" y="${height/2}" transform="rotate(-90 18 ${height/2})" text-anchor="middle">Power (kW)</text><text x="570" y="${height-2}" text-anchor="middle">Array</text><text x="76" y="58">${max}</text><text x="76" y="${height-52}">-${max}</text></svg>`;
}

/** Converts the coordinator's current spatial metrics into portable CSV and inline-SVG evidence. */
export function buildEngineeringAnalyticsSnapshot(analytics:SiteAnalytics):EngineeringSnapshotFile[]{
  const rows:unknown[][]=[['metric_id','metric','unit','array','target','position','observation_time_utc','value','low','high','quality','source']];
  const sections=analytics.metrics.map(metric=>{const sorted=[...metric.rows].sort((a,b)=>a.array-b.array||a.position-b.position);for(const row of sorted)rows.push([metric.id,metric.label,metric.unit,row.array,row.target,row.position,row.observedAt?new Date(row.observedAt).toISOString():'',row.value,row.low,row.high,row.quality,row.source]);
    const values=sorted.flatMap(r=>[r.value,r.low,r.high]).filter(finite),low=values.length?Math.min(...values):0,high=values.length?Math.max(...values):1,span=high-low||1,width=1100,height=260,x=(i:number)=>45+i*Math.max(1,(width-75)/Math.max(1,sorted.length-1)),y=(v:number)=>height-30-(v-low)/span*(height-55);
    const marks=sorted.map((r,i)=>finite(r.value)?`<circle cx="${x(i)}" cy="${y(r.value)}" r="3" fill="#176b87"><title>${esc(`Array ${r.array} ${r.target}: ${r.value} ${metric.unit}`)}</title></circle>`:'').join('');
    return `<section><h2>${esc(metric.label)} <span class="muted">(${esc(metric.unit)})</span></h2><svg viewBox="0 0 ${width} ${height}"><path d="M45 15V230H1075" fill="none" stroke="#81918b"/>${marks}<text x="50" y="18">${esc(high)}</text><text x="50" y="225">${esc(low)}</text></svg><p class="muted">${sorted.length} retained points; gaps remain blank.</p></section>`}).join('');
  return [{name:'csv/site_metrics.csv',body:csv(rows)},{name:'html/site_metrics.html',body:documentPage(`${analytics.site} · Site metrics`, `<p>${esc(new Date(analytics.preparedAt).toISOString())}</p>${sections}`)}];
}

/** Produces operator-readable current PCS evidence while retaining raw JSON separately. */
export function buildEngineeringPcsSnapshot(view:any):EngineeringSnapshotFile[]{
  const pcs=objectRows(view,['pcs']),headers=['array','pcs','observed_time_utc','command_real_kw','setting_real_kw','actual_real_kw','command_reactive_kvar','setting_reactive_kvar','actual_reactive_kvar','dc_voltage_v','dc_current_a','cabinet_temp_c','heat_sink_temp_c','electronics_humidity_pct','ac_humidity_pct','dc_humidity_pct','dehumidification_status','dehumidification_timer_s','insulation_resistance','operating_state','fault_code','source'];
  const rows=pcs.map((r:any)=>[valueAt(r,['arrayIndex','array']),valueAt(r,['pcsIndex','pcs'])??1,valueAt(r,['telemetryCapturedAt','observedAt','timestamp']),valueAt(r,['acCmdRealPowerKW','commandRealPowerKW','realPowerCommandKW']),valueAt(r,['acRealPowerSettingKW','realPowerSettingKW']),valueAt(r,['acRealPowerKW','acRealPowerKw']),valueAt(r,['acCmdReactivePowerKVAR','commandReactivePowerKVAR']),valueAt(r,['acReactivePowerSettingKVAR','reactivePowerSettingKVAR']),valueAt(r,['acReactivePowerKVAR','acReactivePowerKvar']),valueAt(r,['dcVoltageVolt','dcVoltage']),valueAt(r,['dcCurrentAmp','dcCurrent']),valueAt(r,['cabinetTemperatureC']),valueAt(r,['heatSinkTemperatureC']),valueAt(r,['electronicsAreaHumidityPct']),valueAt(r,['acAreaHumidityPct']),valueAt(r,['dcAreaHumidityPct']),valueAt(r,['dehumidificationStatus']),valueAt(r,['dehumidificationTimerSeconds']),valueAt(r,['insulationResistanceKOhm','insulationResistance']),valueAt(r,['modbusOperatingState','operatingState']),valueAt(r,['modbusFaultCode','faultCode']),valueAt(r,['telemetrySource'])]);
  return [{name:'csv/pcs.csv',body:csv([headers,...rows])},{name:'html/pcs.html',body:documentPage('PCS power, environment, and diagnostics',`<p class="muted">Command, setting, and actual power are kept separate. Missing telemetry remains blank.</p><section><h2>PCS AC real power by array</h2>${pcsPowerGraph(pcs)}</section><section><h2>Engineering values</h2>${tableHtml(headers,rows)}</section>`)}];
}

export function buildEngineeringEnvironmentalSnapshot(view:any):EngineeringSnapshotFile[]{
  const records=objectRows(view,['feather','devices','rows']),keys=[...new Set(records.flatMap((r:any)=>Object.keys(r||{})).filter(k=>!['raw'].includes(k)))].sort(),rows=records.map((r:any)=>keys.map(k=>typeof r?.[k]==='object'?JSON.stringify(r[k]):r?.[k]));
  return [{name:'csv/hvac_environmental.csv',body:csv([keys,...rows])},{name:'html/hvac_environmental.html',body:documentPage('HVAC and environmental telemetry',`<section>${tableHtml(keys,rows)}</section>`)}];
}

export function buildEngineeringNotificationSnapshot(view:any):EngineeringSnapshotFile[]{
  const headers=['severity','code','name','description','category','scope','array','string','bpc','cell_group','device_ip'],rows=objectRows(view,['notifications']).map((n:any)=>[n.severity,n.code,n.name,n.description,n.category,n.scope,n.source?.arrayIndex,n.source?.stringIndex,n.source?.batteryPackIndex,n.source?.cellGroupIndex,n.source?.deviceIp]);
  return [{name:'csv/notifications.csv',body:csv([headers,...rows])},{name:'html/notifications.html',body:documentPage('Notifications',`<section>${tableHtml(headers,rows)}</section>`)}];
}

export function buildEngineeringIndex(site:string,at:number,arrays:number[]):EngineeringSnapshotFile{return {name:'index.html',body:documentPage(`${site} Site Snapshot`,`<p>${esc(new Date(at).toISOString())} · Offline engineering evidence captured from retained PRIZM data.</p><h2>Site sections</h2><ul><li><a href="html/site_metrics.html">Site metric graphs</a> · <a href="csv/site_metrics.csv">CSV</a></li><li><a href="html/pcs.html">PCS power, environment, and diagnostics</a> · <a href="csv/pcs.csv">CSV</a></li><li><a href="html/hvac_environmental.html">HVAC and environmental</a> · <a href="csv/hvac_environmental.csv">CSV</a></li><li><a href="html/notifications.html">Notifications</a> · <a href="csv/notifications.csv">CSV</a></li></ul><h2>Cell-level sections</h2><ul>${arrays.map(a=>`<li>Array ${a}: <a href="html/cells_array_${a}.html">graphs</a> · <a href="csv/cells_array_${a}.csv">CSV</a></li>`).join('')}</ul>`)}}

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
  return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline'"><title>${esc(site)} Array ${array}</title><style>body{font:15px system-ui;max-width:1200px;margin:24px auto;padding:0 18px;color:#17372e}section{border:1px solid #ccd9d4;border-radius:8px;padding:14px;margin:18px 0}svg{width:100%;background:#fbfcfb}small{color:#50665f}</style><h1>${esc(site)} · Array ${array}</h1><p>${esc(new Date(at).toISOString())} · Site Snapshot retained cell evidence</p>${section('millivolts')}${section('temperatureF')}<small>Missing and ignored readings are blank; no interpolation or zero substitution.</small></html>`;
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
  files.push({name:'index.html',body:`<!doctype html><html><meta charset="utf-8"><title>${esc(site)} Site Snapshot</title><style>body{font:16px system-ui;max-width:900px;margin:32px auto}li{margin:12px}</style><h1>${esc(site)} Site Snapshot</h1><p>${esc(new Date(frame.acquiredAt).toISOString())}</p><ul>${links}</ul></html>`});
  return files;
}

export function frameFromArraySnapshots(site:CellHistorySite,voltage:ArrayCellSnapshot[],temperature:ArrayCellSnapshot[]):CellFrame{
  if(!voltage.length||voltage.length!==temperature.length)throw Error('Complete voltage and temperature snapshots are required');
  const temps=new Map(temperature.map(a=>[a.array,a])),acquiredAt=Math.min(...voltage.map(a=>a.acquiredAt)),strings:CellStringFrame[]=[];
  for(const v of voltage){const t=temps.get(v.array);if(!t||t.acquiredAt!==v.acquiredAt)throw Error(`Array ${v.array} cell snapshots are not aligned`);const byString=new Map(t.strings.map(s=>[s.string,s]));
    for(const row of v.strings){const tr=byString.get(row.string);if(!tr||tr.cells.length!==row.cells.length)throw Error(`Array ${v.array} string ${row.string} cell coverage mismatch`);strings.push({array:v.array,string:row.string,bpcCount:row.bpcCount,groupsPerBpc:row.groupsPerBpc,observedAt:row.cells.map(c=>c.observedAt),millivolts:row.cells.map(c=>c.value),temperatureF:tr.cells.map(c=>c.value),ignoredTemperatures:tr.cells.map((c,i)=>c.quality==='ignored'?i:-1).filter(i=>i>=0)});}}
  return {schema:1,site,acquiredAt,reportAt:null,strings,issues:[]};
}
