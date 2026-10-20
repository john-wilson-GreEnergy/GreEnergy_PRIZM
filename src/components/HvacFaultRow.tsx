import React from 'react';
import type {FleetFinding} from '../core/fleet/details';

/** Presentation of supplied fault rows only: no new fault or identity inference. */
export function HvacFaultRow({finding,array=null}:{finding:FleetFinding;array?:number|null}){
  const rows=finding.targetRows?.filter(t=>array===null||t.array===array);
  const missing=Math.max(0,finding.targetCount-(finding.targetRows?.length??finding.targets.length));
  const count=array===null?finding.targetCount:rows?.length??0;
  return <details className="hvac-fault-row">
    <summary><span className="hvac-chevron" aria-hidden="true">▸</span>
      <span className={`hvac-severity ${finding.severity}`}>{finding.severity}</span>
      <code>{finding.code||'No code'}</code><strong>{finding.title}</strong>
      <span className="hvac-fault-count">{count} {count===1?'target':'targets'}</span>
    </summary>
    <div className="hvac-target-table-wrap"><table className="hvac-target-table">
      <thead><tr><th scope="col">Array</th><th scope="col">Reported affected target</th></tr></thead>
      <tbody>{rows?rows.map(t=><tr key={t.id}><td>{t.array??'—'}</td><td>{t.label}</td></tr>):
        array===null?finding.targets.map((label,i)=><tr key={i}><td>—</td><td>{label}</td></tr>):null}</tbody>
    </table></div>
    {missing>0&&<p className="hvac-gap">Partial target list: {missing} additional targets were not supplied. Review the full site's notification details.</p>}
    {count===0&&<p>No mapped targets supplied for this selection. This is not an all-clear.</p>}
  </details>;
}
