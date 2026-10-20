import React from 'react';
import {SitePowerFlow} from '../components/SitePowerFlow';
import {fleetMetrics,metricKeys,type FleetView,type SiteView} from '../core/fleet/model';
import {issueCategories,type FleetArray,type FleetDetails} from '../core/fleet/details';
const value=(n:number|null)=>n===null?'—':n.toLocaleString(undefined,{maximumFractionDigits:1});
const time=(s:string|null)=>s?new Date(s).toLocaleString():'No observation';
const quality=(q:string)=>q==='live'?'Current':q==='stale'?'Last known':'Unknown';

/** Same canonical Fleet fields, arranged for touch rather than a wide desktop table. */
export function SiteReadings({site}:{site:SiteView}){
 return <><details className="m-more"><summary>All site metrics & sources</summary><dl className="m-reading-list">{metricKeys.map(key=>{
  const r=site.metrics[key],m=fleetMetrics[key];
  return <div key={key}><dt>{m.label}</dt><dd><strong>{value(r.value)} {m.unit}</strong><small>{quality(r.quality)} · {r.source}<br/>{time(r.observedAt)}</small></dd></div>;
 })}</dl></details><SitePowerFlow flow={site.powerFlow} siteName={site.name}/></>;
}
export function FleetCoverage({view}:{view:FleetView}){
 const names=(ids:string[])=>ids.map(id=>view.sites.find(s=>s.siteId===id)?.name??id).join(', ')||'None';
 return <details className="m-card m-more"><summary>All Fleet totals & coverage</summary><dl className="m-reading-list">{metricKeys.map(key=>{
  const r=view.totals[key],m=fleetMetrics[key];
  return <div key={key}><dt>{m.label}</dt><dd><strong>{value(r.value)} {m.unit}</strong><small>{r.complete?'Complete':'Partial / unknown'} · Included: {names(r.contributors)}{r.excluded.length>0&&<><br/>Not included: {names(r.excluded)}</>}</small></dd></div>;
 })}</dl><p className="m-muted">SOC is capacity-weighted. Unknown values are never counted as zero.</p></details>;
}
export function ArrayReadings({array}:{array:FleetArray}){
 return <div className="m-more"><dl className="m-reading-list"><div><dt>State of charge</dt><dd>{value(array.socPct)} %</dd></div><div><dt>Bus voltage</dt><dd>{value(array.busVoltage)} V</dd></div></dl>
 <div className="m-range-scroll"><table><caption>Array ranges · {quality(array.quality)}</caption><thead><tr><th>Metric</th><th>Min</th><th>Average</th><th>Max</th><th>Δ</th></tr></thead><tbody>{(['voltageMv','temperatureC'] as const).map(key=>{
  const r=array[key],temp=key==='temperatureC';
  const n=(v:number|null,delta=false)=>value(v===null?null:temp?v*1.8+(delta?0:32):v);
  return <tr key={key}><th>{temp?'Temperature °F':'Voltage mV'}<small>{r.reportingStrings}/{r.expectedStrings} strings{r.partial?' · partial':''}</small></th><td>{n(r.minimum)}</td><td>{n(r.average)}</td><td>{n(r.maximum)}</td><td>{n(r.delta,true)}</td></tr>;
 })}</tbody></table></div></div>;
}
export function IssueCoverage({issues}:{issues:FleetDetails['issues']}){
 return <details className="m-card m-more"><summary>Issue categories & availability</summary><dl className="m-reading-list">{(Object.keys(issueCategories) as Array<keyof typeof issueCategories>).map(key=>{
  const r=issues.categories[key];return <div key={key}><dt>{issueCategories[key]}</dt><dd><strong>{value(r.targets)} targets</strong><small>{value(r.alarms)} alarms · {value(r.warnings)} warnings<br/>{value(r.info)} info · {value(r.unknown)} unclassified</small></dd></div>;
 })}</dl><p className="m-muted">Category counts may overlap. Targets are not unique BPC counts.</p></details>;
}
