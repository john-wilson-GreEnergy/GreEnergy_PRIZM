import type {BpcVoltageSnapshot} from '../normalizers/bpcVoltageSnapshot';
import type {NotificationReview} from './notificationReview';

export interface BpcVoltageOutliers {
  quality:BpcVoltageSnapshot['quality']; reason:string; observedAt:string|null;
  source:'Cached EMS StringViewer';
  ranked:{bpc:number; voltageV:number; peerAverageV:number; deviationV:number}[];
}
export const isPackDeltaCode=(code:string)=>code==='1008'||code==='2008';
/** Diagnostic ranking only. This is NOT a reimplementation of the controller's trip logic. */
export function calculateBpcVoltageOutliers(snapshot?:BpcVoltageSnapshot):BpcVoltageOutliers {
  const result:BpcVoltageOutliers={quality:snapshot?.quality??'unavailable',reason:snapshot?.reason??'No cached StringViewer reading for this target',observedAt:snapshot?.observedAt??null,source:'Cached EMS StringViewer',ranked:[]};
  if(!snapshot || snapshot.quality==='unavailable' || snapshot.packs.length<2) return result;
  const packs=snapshot.packs,total=packs.reduce((sum,p)=>sum+p.voltageV,0);
  result.ranked=packs.map(p=>{
    const peerAverageV=(total-p.voltageV)/(packs.length-1);
    return {...p,peerAverageV,deviationV:p.voltageV-peerAverageV};
  }).sort((a,b)=>Math.abs(b.deviationV)-Math.abs(a.deviationV)||a.bpc-b.bpc);
  return result;
}
/** Enrich prepared rows, retaining all native identities, evidence and counts verbatim. */
export function attachBpcVoltageOutliers(review:NotificationReview,snapshots:readonly BpcVoltageSnapshot[],block:number|null,stale=false):void {
  const index=new Map<string,BpcVoltageSnapshot|undefined>();
  for(const snapshot of snapshots) {
    const key=`${snapshot.array}:${snapshot.string}`;
    index.set(key,index.has(key)?undefined:snapshot);
  }
  const prepared=new Map<string,BpcVoltageOutliers>();
  for(const group of review.groups.filter(g=>isPackDeltaCode(g.code))) {
    const targets=new Map(group.targets.map(t=>[t.id,t]));
    for(const row of group.tableRows??[]) {
      const target=targets.get(row.memberIds[0]),l=target?.location;
      const valid=l && block!=null && l.block===block && target.array!=null && l.string!=null && l.unit==null && l.pcs==null;
      const key=valid?`${target.array}:${l.string}`:'';
      let comparison=prepared.get(key);
      if(!comparison) {
        comparison=calculateBpcVoltageOutliers(valid?index.get(key):undefined);
        if(stale && comparison.quality==='available') comparison={...comparison,quality:'stale',reason:'Retained site snapshot; verify fresh telemetry'};
        prepared.set(key,comparison);
      }
      row.bpcOutliers=comparison;
    }
  }
}
