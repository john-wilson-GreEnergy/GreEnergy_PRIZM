import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildNotificationReview} from '../src/server/notifications/notificationReview';
import {HvacIssueDisclosure} from '../src/components/HvacIssueDisclosure';
import {HvacFaultRow} from '../src/components/HvacFaultRow';
import {NotificationGuidanceAudit} from '../src/components/NotificationGuidanceAudit';
/** Local visual QA only. Never injected into a telemetry response or production build. */
export function hvacReviewFixture(css:string){
  const target={arrayIndex:4,energySegmentIndex:2,hvacUnit:1,label:'Example Array 4 / ES 2 / HVAC 1',ip:'192.0.2.1'};
  const review=buildNotificationReview([
    {code:'DEMO-HVAC-1',title:'HVAC commanded on — no running feedback',subsystem:'hvac',severity:'alarm',affected:[target,
      {...target,arrayIndex:5,label:'Example Array 5 / ES 2 / HVAC 1',ip:'192.0.2.2'},
      {...target,arrayIndex:6,hvacUnit:2,label:'Example Array 6 / ES 2 / HVAC 2',ip:'192.0.2.3'}]},
    {code:'DEMO-HVAC-2',title:'Example fan warning',subsystem:'hvac',severity:'warning',affected:[target]},
    {code:'DEMO-FSS',title:'Example FSS segment alert',subsystem:'hvac',severity:'critical',affected:[{arrayIndex:4,label:'Example CS 4'}]},
  ],'2026-10-20T16:00:00Z');
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>PRIZM HVAC layout review · Test data</title><style>body{font:14px system-ui;background:#f4f7f6;margin:0;padding:20px;color:#193b40}main{max-width:920px;margin:auto}.banner{padding:14px;background:#fff4d4;border:1px solid #dfb963;border-radius:8px}'+css+'</style></head><body>'+renderToStaticMarkup(
    <main><p className="banner">LOCAL LAYOUT TEST · Example data only — not Solar Star telemetry. No controls.</p><h1>Equipment issues</h1><p>Expand HVAC, then select a fault to see its affected targets.</p>
      <HvacIssueDisclosure review={review.hvacReview}>{review.groups.map(g=><HvacFaultRow key={g.id} finding={{
        code:g.code,title:g.title,category:'hvac',severity:g.severity==='critical'?'alarm':g.severity,targetCount:g.targetCount,targets:[],
        targetRows:g.targets.map(t=>({id:t.id,label:t.label,array:t.array,segment:t.location?.energySegment??null,
          string:null,bpc:null,cell:null,pcs:null}))
      }}/>)}</HvacIssueDisclosure>
      <NotificationGuidanceAudit gaps={review.guidanceGaps}/>
    </main>)+'</body></html>';
}
