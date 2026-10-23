import React,{useState} from 'react';
import type {NotificationGroup} from '../server/notifications/notificationReview';
import {NotificationGroupRow} from './NotificationReviewPanel';
import {selectedTargets} from '../lib/correctiveWorklist';
import {buildNotificationTargetTable} from '../server/notifications/notificationTargetTable';
import {correctiveDisplayCategory} from '../core/correctiveGuidance';

export const correctiveCategory=correctiveDisplayCategory;
const rank={critical:0,alarm:1,warning:2,unknown:3,info:4};
export function CorrectiveCategoryList({groups,array='all',query='',showMetrics=true,onEditGuidance}: {
  groups:NotificationGroup[];array?:string;query?:string;showMetrics?:boolean;onEditGuidance?:(id:string|null)=>void;
}){
  const [opened,setOpened]=useState<string[]>([]);
  const categories=[...new Set(groups.map(correctiveCategory))].sort((a,b)=>{
    const priority=(cat:string)=>Math.min(...groups.filter(g=>correctiveCategory(g)===cat).map(g=>rank[g.severity]));
    return priority(a)-priority(b)||a.localeCompare(b);
  });
  return <div className="ca-categories">{categories.map(category=>{
    const list=groups.filter(g=>correctiveCategory(g)===category).sort((a,b)=>rank[a.severity]-rank[b.severity]||a.title.localeCompare(b.title));
    const alarm=list.filter(g=>['critical','alarm'].includes(g.severity)).length,warning=list.filter(g=>g.severity==='warning').length,unknown=list.filter(g=>g.severity==='unknown').length;
    return <details key={category} className="ca-category" onToggle={e=>{const open=e.currentTarget.open;setOpened(prev=>open?[...new Set([...prev,category])]:prev.filter(c=>c!==category));}}>
      <summary><span className="ca-chevron" aria-hidden="true">▸</span><span className="ca-category-name">{category}<small>{list.length} fault / condition {list.length===1?'group':'groups'}</small></span><span className="ca-category-counts">{alarm>0&&<span className="ca-alarm">{alarm} alarm / critical</span>}{warning>0&&<span className="ca-warning">{warning} warning</span>}{unknown>0&&<span>{unknown} unknown severity</span>}{!alarm&&!warning&&!unknown&&<span>Information / operating states</span>}</span></summary>
      {opened.includes(category)&&<div className="ca-category-body">{list.map(group=>{
        const targets=selectedTargets(group,array,query);
        const rows=buildNotificationTargetTable(targets,group.title).rows.map(row=>{
          const source=group.tableRows?.find(r=>r.id===row.id);
          return {...row,metrics:source?.metrics,bpcOutliers:source?.memberIds.length===row.memberIds.length?source.bpcOutliers:undefined};
        });
        return <div key={group.id}>{targets.length!==group.targets.length&&<p className="text-xs text-slate-600 mb-1">{targets.length} targets match the equipment filter; whole-fault total remains {group.targetCount}.</p>}<NotificationGroupRow group={{...group,targets,tableRows:rows}} array={array} showMetrics={showMetrics} onEditGuidance={onEditGuidance}/></div>;
      })}</div>}
    </details>;
  })}</div>;
}
