import type {NotificationGroup,NotificationReview} from '../server/notifications/notificationReview';

/** A fault/target pair, not a device ID: excluding one fault must not select another. */
export const exportTargetKey=(groupId:string,targetId:string)=>JSON.stringify([groupId,targetId]);
export const exportTargetKeys=(groups:NotificationGroup[])=>groups.flatMap(g=>g.targets.map(t=>exportTargetKey(g.id,t.id)));
export function setExportTargets(current:ReadonlySet<string>,keys:string[],checked:boolean){
  const next=new Set(current);for(const key of keys){if(checked)next.add(key);else next.delete(key);}return next;
}
export function exportSelectionState(keys:string[],selected:ReadonlySet<string>){
  const count=keys.filter(k=>selected.has(k)).length;return {count,checked:keys.length>0&&count===keys.length,mixed:count>0&&count<keys.length};
}
/** Use the existing canonical BPC mapping. All reported cells for one physical BPC
 * can be selected together; unresolved targets are never guessed into a device. */
export function exportTargetChoices(group:NotificationGroup,review:NotificationReview){
  const devices=new Map<string,{id:string;label:string}>();
  for(const d of review.bpcReview?.devices??[])for(const id of review.bpcReview?.targetIdsByDevice[d.id]??[])
    devices.set(id,{id:d.id,label:`Array ${d.array} / String ${d.string} / BPC ${d.bpc}`});
  const buckets=new Map<string,{id:string;label:string;keys:string[];details:string[]}>();
  for(const target of group.targets){
    const device=devices.get(target.id),id=device?'bpc:'+device.id:'target:'+target.id;
    const choice=buckets.get(id)??{id,label:device?.label??target.label,keys:[],details:[]};
    choice.keys.push(exportTargetKey(group.id,target.id));choice.details.push(target.label);buckets.set(id,choice);
  }
  return [...buckets.values()];
}
