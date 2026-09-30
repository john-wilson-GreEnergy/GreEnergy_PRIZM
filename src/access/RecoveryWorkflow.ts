import type {SavedCommandView,RecoveryReview,RecoveryIntent,RecoveryReason} from '../core/security/commandRecovery';
interface Ports {
  list(signal:AbortSignal):Promise<SavedCommandView[]>;
  review(id:string,signal:AbortSignal):Promise<RecoveryReview>;
  record(intent:RecoveryIntent,signal:AbortSignal):Promise<void>;
}
export interface RecoveryView {
  phase:'closed'|'loading'|'list'|'reviewing'|'review'|'saving'|'saved'|'error';
  commands:SavedCommandView[]; review:RecoveryReview|null; message:string;
}
export class RecoveryWorkflow {
  private view:RecoveryView={phase:'closed',commands:[],review:null,message:''};
  private listeners=new Set<()=>void>();private generation=0;private abort=new AbortController();
  constructor(private ports:Ports,private clock=Date.now) {}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
  getSnapshot=()=>this.view;
  private publish(view:RecoveryView) {this.view=view;this.listeners.forEach(listener=>listener());}
  private begin(phase:RecoveryView['phase']) {this.abort.abort();this.abort=new AbortController();this.generation++;this.publish({...this.view,phase,review:null,message:''});return this.generation;}
  private failed(error:unknown,generation:number,save=false) {
    if(generation===this.generation) this.publish({...this.view,phase:'error',review:null,message:save?'Save not confirmed. Refresh saved commands before taking further action. The target remains blocked.':error instanceof Error?error.message:'Recovery unavailable'});
  }
  async open() {
    if(this.view.phase==='saving') return;
    const generation=this.begin('loading');
    try {const commands=await this.ports.list(this.abort.signal);if(generation===this.generation) this.publish({phase:'list',commands,review:null,message:''});}
    catch(error){this.failed(error,generation);}
  }
  async select(id:string) {
    if(this.view.phase==='saving') return;
    const generation=this.begin('reviewing');
    try {const review=await this.ports.review(id,this.abort.signal);if(generation===this.generation) this.publish({...this.view,phase:'review',review});}
    catch(error){this.failed(error,generation);}
  }
  canSave() {return this.view.phase==='review' && !!this.view.review && this.view.review.command.state!=='verified' && this.view.review.validUntil>this.clock();}
  async save(reason:RecoveryReason) {
    if(!this.canSave() || !['site-checked','follow-up-required'].includes(reason)) return;
    const review=this.view.review!,generation=this.generation;
    this.publish({...this.view,phase:'saving'});
    try {
      await this.ports.record({commandId:review.command.commandId,expectedUpdatedAt:review.command.updatedAt,observation:review.observation,reason,confirmed:true},this.abort.signal);
      if(generation===this.generation) this.publish({...this.view,phase:'saved',review:null,message:'Review saved. No command sent. Target remains blocked pending supervised reconciliation.'});
    } catch(error){this.failed(error,generation,true);}
  }
  close() {if(this.view.phase==='saving') return;this.stop();}
  stop() {this.generation++;this.abort.abort();this.publish({phase:'closed',commands:[],review:null,message:''});}
}
