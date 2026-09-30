import type {ContactorIntent, ContactorReceipt, ContactorReview} from '../core/security/contactorAccessModel';

export const contactorReasons = ['Maintenance','Troubleshooting','Return to service'] as const;
type Target = {array:number;string:number};
export interface ContactorView {
  phase:'closed'|'loading'|'review'|'sending'|'result'|'unknown'|'unavailable';
  target:Target|null; review:ContactorReview|null; action:'open'|'close'|null;
  reason:string; commandId:string|null; receipt:ContactorReceipt|null; message:string;
}
interface Ports {
  review(array:number,string:number,signal:AbortSignal):Promise<ContactorReview>;
  submit(intent:ContactorIntent,signal:AbortSignal):Promise<ContactorReceipt>;
  fresh(target:Target):boolean;
  id():string;
}
const initial = ():ContactorView => ({phase:'closed',target:null,review:null,action:null,reason:contactorReasons[0],commandId:null,receipt:null,message:''});
const key = (target:Target) => `${target.array}:${target.string}`;
/** Session-memory UI state only. Server authorization remains authoritative. */
export class ContactorWorkflow {
  private view = initial();
  private listeners = new Set<()=>void>();
  private generation = 0;
  private request:AbortController|null = null;
  private blocked = new Map<string,string>();
  private expiry:ReturnType<typeof setTimeout>|undefined;
  constructor(private readonly ports:Ports,private readonly clock=Date.now) {}
  getSnapshot = () => this.view;
  subscribe = (listener:()=>void) => {this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  private publish(patch:Partial<ContactorView>) {this.view={...this.view,...patch};this.listeners.forEach(fn=>fn());}
  private cancelRead() {this.generation++;this.request?.abort();clearTimeout(this.expiry);}
  async open(target:Target) {
    if(this.view.phase==='sending') return;
    this.cancelRead();const generation=this.generation;
    this.view=initial();this.publish({phase:'loading',target});
    const prior=this.blocked.get(key(target));
    if(prior) {this.publish({phase:'unknown',commandId:prior,message:'This target has an unresolved command. Reconcile its state and audit record before issuing another command.'});return;}
    if(!this.ports.fresh(target)) {this.publish({phase:'unavailable',message:'Fresh site telemetry and an active session are required.'});return;}
    const controller=new AbortController();this.request=controller;
    try {
      const review=await this.ports.review(target.array,target.string,controller.signal);
      if(generation!==this.generation) return;
      if(review.validUntil<=this.clock()) throw new Error('Review expired. Refresh the review before proceeding.');
      this.publish({phase:'review',review});
      this.expiry=setTimeout(()=>{if(generation===this.generation && this.view.phase==='review') this.publish({message:'Review expired. Refresh the review before proceeding.'});},Math.max(0,review.validUntil-this.clock()));
    } catch(error) {if(generation===this.generation) this.publish({phase:'unavailable',message:error instanceof Error ? error.message : 'Control review unavailable.'});}
  }
  choose(action:'open'|'close') {if(this.view.phase==='review') this.publish({action});}
  reason(reason:string) {if(this.view.phase==='review' && contactorReasons.some(value=>value===reason)) this.publish({reason});}
  canSend() {return this.view.phase==='review' && !!this.view.target && !!this.view.action && !!this.view.review && this.view.review.validUntil>this.clock() && this.ports.fresh(this.view.target);}
  async confirm() {
    if(!this.canSend()) return;
    const {target,review,action,reason}=this.view;
    const commandId=this.ports.id();
    const generation=this.generation,controller=new AbortController();this.request=controller;
    clearTimeout(this.expiry);
    this.blocked.set(key(target!),commandId);
    this.publish({phase:'sending',commandId,message:'Sending once, then waiting for fresh verification. Do not repeat the command.'});
    try {
      const receipt=await this.ports.submit({array:target!.array,string:target!.string,action:action!,reason,topologyRevision:review!.topologyRevision,commandId,confirmed:true},controller.signal);
      if(generation!==this.generation) return;
      if(receipt.success) this.blocked.delete(key(target!));
      this.publish({phase:'result',receipt,message:receipt.success ? 'Requested state verified by fresh telemetry.' : receipt.acceptedCount ? 'EMS accepted the command; requested state was not verified. Reconcile before sending another command.' : 'Dispatch was not confirmed. Reconcile before sending another command.'});
    } catch {
      if(generation===this.generation) this.publish({phase:'unknown',message:'Command outcome is unknown. It may already have executed. Do not repeat it; verify the string state and the audit record.'});
    }
  }
  close() {if(this.view.phase==='sending') return;this.cancelRead();this.view=initial();this.publish({});}
  stop() {this.cancelRead();this.blocked.clear();this.view=initial();this.publish({});}
}
