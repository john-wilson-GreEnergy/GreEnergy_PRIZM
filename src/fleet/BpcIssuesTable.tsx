import React,{useState} from 'react';
import type {FleetBpcReview,IssueCategory} from '../core/fleet/details';
import {BpcListDisclosure} from '../components/BpcListDisclosure';

export function BpcIssuesTable({review,array,category}:{review:FleetBpcReview;array:number|null;category:IssueCategory|null}){
  const [selected,setSelected]=useState<string|null>(null);
  const counts=review.scopes[`${array??'all'}:${category??'all'}`];
  const devices=review.devices.filter(d=>(array===null||d.array===array)&&(category===null||d.categories.includes(category)));
  const inventory=review.balancerInventory;
  return <div className="bpc-review">
    {inventory && <section className="bpc-inventory" aria-label="Site-wide balancing BPC quantities">
      <h4>Balancing faults · BPC quantities</h4>
      <p className="source-note">Entire site · All arrays and strings, regardless of the filters below. Charge (2074) and discharge (2073) combined; each physical BPC counted once. Quantities support configuration and replacement planning, not confirmed replacement decisions.</p>
      {inventory.partial && <p className="coverage-warning">Incomplete balancing inventory: quantities are lower bounds. {inventory.unmappedTargets} reported targets could not be assigned to a unique BPC.</p>}
      <BpcListDisclosure label={`Balancing quantities · ${inventory.partial?'at least ':''}${inventory.total} unique BPCs`}>
      {inventory.rows.length?<div className="table-wrap"><table className="target-table" aria-label="Balancing fault quantities by BPC number"><thead><tr><th>BPC number</th><th>Total quantity</th><th>Charge only</th><th>Discharge only</th><th>Both faults</th></tr></thead><tbody>{inventory.rows.map(row=><tr key={row.bpc}><th>BPC {row.bpc}</th><td><strong>{row.quantity}</strong></td><td>{row.chargeOnly}</td><td>{row.dischargeOnly}</td><td>{row.both}</td></tr>)}</tbody><tfoot><tr><th>Total unique BPCs</th><td><strong>{inventory.partial?'At least ':''}{inventory.total}</strong></td><td colSpan={3}>Both faults count once in the total.</td></tr></tfoot></table></div>:<p className="empty-state">{inventory.partial?'No mapped balancing BPCs in the available detail; inventory is incomplete.':'No BPCs with reported charge or discharge balancing faults.'}</p>}
      </BpcListDisclosure>
    </section>}
    <div className="bpc-summary" role="status"><strong>{counts?.partial?'At least ':''}{counts?.uniqueBpcs??0} unique {counts?.uniqueBpcs===1?'BPC':'BPCs'}</strong><span>{counts?.multipleIssues??0} with multiple issues</span><span>{counts?.unmappedTargets??0} other / unresolved targets</span></div>
    <p className="source-note">Each BPC is counted once across equipment codes, including charge and discharge faults. Select a BPC to see all of its reported issues. An affected BPC is not automatically a replacement recommendation.</p>
    {counts?.partial && <p className="coverage-warning">Partial collector detail: this is a lower-bound count, not a complete corrective-action inventory. Review the full site notification list before planning work.</p>}
    <BpcListDisclosure label={`Unique BPC list · ${devices.length} shown`}>
    {devices.length?<div className="table-wrap"><table className="target-table bpc-table"><thead><tr><th>Array / String</th><th>BPC</th><th>Issues</th><th>Affected cell groups</th></tr></thead><tbody>
      {devices.map(device=><React.Fragment key={device.id}><tr className={selected===device.id?'selected-row':''}><td>Array {device.array} · String {device.string}</td><th><button className="text-button" aria-expanded={selected===device.id} aria-label={`Review Array ${device.array} String ${device.string} BPC ${device.bpc}`} onClick={()=>setSelected(selected===device.id?null:device.id)}>{selected===device.id?'▾':'▸'} BPC {device.bpc}</button></th><td><span className={'severity '+device.severity}>{device.severity}</span> · {device.issueCount} {device.issueCount===1?'issue':'issues'}<span className="row-meta">{device.issues.map(i=>i.code||i.title).join(' · ')}</span></td><td>{device.cells}</td></tr>
      {selected===device.id && <tr><td colSpan={4} className="bpc-drilldown"><h4>Array {device.array} / String {device.string} / BPC {device.bpc} · All reported issues</h4><table><thead><tr><th>Severity / Code</th><th>Issue</th><th>Cell groups</th><th>Reported targets</th></tr></thead><tbody>{device.issues.map(issue=><tr key={issue.key}><td><span className={'severity '+issue.severity}>{issue.severity}</span> {issue.code||'No code'}</td><td>{issue.title}</td><td>{issue.cells}</td><td>{issue.reportedTargets}</td></tr>)}</tbody></table></td></tr>}
      </React.Fragment>)}
    </tbody></table></div>:<p className="empty-state">No mapped BPCs in the supplied detail for this selection. Other equipment and unresolved targets remain listed below.</p>}
    </BpcListDisclosure>
  </div>;
}
