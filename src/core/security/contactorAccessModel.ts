export interface ContactorReview {
  array: number; string: number; topologyRevision: string; validUntil: number;
}
export interface ContactorIntent {
  commandId: string; action: 'open' | 'close'; array: number; string: number;
  confirmed: true; reason: string; topologyRevision: string;
}
export interface ContactorReceipt {
  success: boolean; acceptedCount: number; verifiedCount: number; mismatchCount: number; unknownCount: number;
  results: {target:{array:number;string?:number};action:'open'|'close';accepted:boolean;readbackConfirmed:boolean|null;status:string}[];
}
