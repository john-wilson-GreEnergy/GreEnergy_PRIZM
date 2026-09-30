import type {ContactorReceipt} from './contactorAccessModel';
export interface RecoveryObservation {
  actual:'open'|'closed'; requested:'open'|'closed'|'unknown'; capturedAt:number;
}
export type RecoveryReason='site-checked'|'follow-up-required';
export interface RecoveryRecord {
  at:number; subject:string; reason:RecoveryReason; observation:RecoveryObservation;
}
export interface SavedCommandView {
  commandId:string; array:number; string:number; action:'open'|'close'; reason:string;
  state:'reserved'|'verified'|'unverified'; createdAt:number; updatedAt:number;
  result:ContactorReceipt|null; reviews:Omit<RecoveryRecord,'subject'>[]; historical:true;
}
export interface RecoveryReview {
  command:SavedCommandView; observation:RecoveryObservation; validUntil:number;
}
export interface RecoveryIntent {
  commandId:string; expectedUpdatedAt:number; observation:RecoveryObservation;
  reason:RecoveryReason; confirmed:true;
}
