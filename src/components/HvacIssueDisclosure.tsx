import React from 'react';
import type {HvacIssueReview,HvacAffectedTarget} from '../core/hvacIssueReview';

/** Filters only server-prepared target rows; does not derive equipment faults or identities. */
export function HvacIssueDisclosure({review,array=null,issueKeys,query='',children}:{
  review?:HvacIssueReview;array?:number|null;issueKeys?:string[];query?:string;children?:React.ReactNode;
}){
  const matches=(t:HvacAffectedTarget)=>(array===null||t.array===array)&&
    t.label.toLowerCase().includes(query.trim().toLowerCase());
  const rows=(values:HvacAffectedTarget[])=>values.filter(matches).map(t=>({...t,issues:t.issues.filter(i=>!issueKeys||issueKeys.includes(i.key))})).filter(t=>t.issues.length);
  const devices=rows(review?.devices??[]),unassigned=rows(review?.unassigned??[]);
  const severities=[...devices,...unassigned].flatMap(t=>t.issues.map(i=>i.severity));
  // Missing target rows must not hide a code group's reported alarm severity.
  if(review?.partial||(!devices.length&&!unassigned.length))severities.push(...(review?.issueTypes??[])
    .filter(i=>!issueKeys||issueKeys.includes(i.key)).map(i=>i.severity));
  const groupCount=React.Children.count(children);
  return <details className="hvac-issue-disclosure">
    <summary><strong>HVAC & environmental issues</strong><span className="hvac-group-count">{groupCount} code {groupCount===1?'group':'groups'}</span><span>{review?`${review.partial?'At least ':''}${devices.length} mapped HVAC ${devices.length===1?'target':'targets'} · ${unassigned.length} segment / unresolved ${unassigned.length===1?'target':'targets'}`:'Unit grouping not supplied'}</span>
      <span className="hvac-severity-summary">{['critical','alarm','warning','unknown','info'].filter(s=>severities.includes(s as typeof severities[number])).join(' · ')||'Review supplied code groups'}</span>
    </summary>
    <div className="hvac-disclosure-body">
      {review?.partial&&<p className="hvac-gap">Coverage is incomplete or retained. Counts are lower bounds; verify current source health. Severity indicators also retain code groups whose target locations are unavailable.</p>}
      {children}
      {!!unassigned.length&&<p className="hvac-scope-note">Segment / FSS alerts retain their reported target; they are not assigned to both HVAC units.</p>}
      {!groupCount&&<p>No code groups supplied for these filters. This is not an all-clear.</p>}
    </div>
  </details>;
}
