import React from 'react';
import type {GuidanceGap} from '../core/hvacIssueReview';
export function NotificationGuidanceAudit({gaps}:{gaps?:GuidanceGap[]}){
  if(!gaps)return null;
  return <details className="hvac-issue-disclosure"><summary><strong>Fault documentation review</strong><span>{gaps.length} issue {gaps.length===1?'group':'groups'} with missing names or incomplete fault-specific guidance</span></summary>
    <div className="hvac-disclosure-body"><p>Complete snapshot audit, independent of the filters below. Missing items need an approved manual or reviewed troubleshooting entry. Generic advice is not verified clearing criteria. This list does not authorize a reset or replacement.</p>
      {gaps.map(g=><div className="hvac-target" key={g.groupId}><strong>{g.title||'Name not supplied'}</strong><p>{g.code||'No code supplied'} · {g.severity} · {g.targetCount} reported targets</p><p>Needs review: {g.missing.join(' · ')}. Guidance may be absent for some or all targets.</p></div>)}
      {!gaps.length&&<p>No missing fields detected in the supplied groups. This completeness check does not independently validate the procedures.</p>}
    </div></details>;
}
