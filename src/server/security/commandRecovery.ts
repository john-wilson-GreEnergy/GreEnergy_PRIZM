import type {VerifiedPrincipal} from '../../core/security/controlPolicyPrototype';
import {authorizeControlIntent} from '../../core/security/controlPolicyPrototype';
import type {RecoveryIntent,RecoveryObservation,RecoveryReview,SavedCommandView} from '../../core/security/commandRecovery';
import {ContactorReceipts,type SavedContactorCommand} from './contactorReceipts';
import {AccessError} from './localSessions';
import {requireBlockCapability,type SiteScope} from './ownedJobs';
import type {PolicyContext} from '../../core/security/controlPolicyPrototype';
interface Ports {
  receipts:ContactorReceipts; scope():SiteScope; context():Promise<PolicyContext>;
  observe(array:number,string:number):Promise<RecoveryObservation>;
  audit(event:{action:string;subject:string;outcome:string;commandId:string}):Promise<void>;
}
const publicCommand=(entry:SavedContactorCommand):SavedCommandView=>({commandId:entry.commandId,array:entry.array,string:entry.string,action:entry.action,reason:entry.reason,
  state:entry.state,createdAt:entry.createdAt,updatedAt:entry.updatedAt,result:entry.result,historical:true,
  reviews:(entry.reviews ?? []).map(({at,reason,observation})=>({at,reason,observation}))});
const sameScope=(a:SiteScope,b:SiteScope)=>a.siteId===b.siteId && a.blockId===b.blockId;
export class CommandRecovery {
  constructor(private readonly ports:Ports,private readonly clock=Date.now) {}
  private async history(auth:()=>Promise<VerifiedPrincipal>,scope:SiteScope,subject?:string) {
    const principal=await auth();requireBlockCapability(principal,scope,'history.view');
    if(!sameScope(scope,this.ports.scope()) || subject!==undefined && principal.subject!==subject) throw new AccessError(409,'Recovery context changed');
    return principal;
  }
  async list(auth:()=>Promise<VerifiedPrincipal>):Promise<SavedCommandView[]> {
    const scope=this.ports.scope(),principal=await this.history(auth,scope);
    const rows=await this.ports.receipts.listOwned(principal.subject,scope);
    await this.history(auth,scope,principal.subject);return rows.map(publicCommand);
  }
  async review(id:string,auth:()=>Promise<VerifiedPrincipal>):Promise<RecoveryReview> {
    if(!/^[A-Za-z0-9_-]{16,80}$/.test(id)) throw new AccessError(400,'Invalid command ID');
    const scope=this.ports.scope(),principal=await this.history(auth,scope);
    const entry=await this.ports.receipts.readOwned(principal.subject,scope,id);
    const check=async()=>{
      const context=await this.ports.context(),current=await this.history(auth,scope,principal.subject);
      requireBlockCapability(current,scope,'telemetry.view');
      if(current.sessionId!==principal.sessionId || !authorizeControlIntent(current,{operation:'contactors.execute',...scope,topologyRevision:entry.topologyRevision,
        targetIds:[`array:${entry.array}:string:${entry.string}`]},context,this.clock()).allowed) throw new AccessError(403,'Recovery target permission or topology changed');
    };
    await check();const observation=await this.ports.observe(entry.array,entry.string);await check();
    const now=this.clock();
    if(!['open','closed'].includes(observation.actual) || !['open','closed','unknown'].includes(observation.requested) || !Number.isSafeInteger(observation.capturedAt) || observation.capturedAt>now || observation.capturedAt+15000<=now) throw new AccessError(409,'Fresh unambiguous contactor feedback required');
    return {command:publicCommand(entry),observation,validUntil:Math.min(observation.capturedAt+15000,principal.expiresAt)};
  }
  async record(body:unknown,auth:()=>Promise<VerifiedPrincipal>):Promise<{recorded:true;targetReleased:false}> {
    const value=body as Partial<RecoveryIntent>|null;
    if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!['commandId','expectedUpdatedAt','observation','reason','confirmed'].includes(key)) ||
      typeof value.commandId!=='string' || value.confirmed!==true || !Number.isSafeInteger(value.expectedUpdatedAt) || !['site-checked','follow-up-required'].includes(String(value.reason)) ||
      !value.observation || Object.keys(value.observation).some(key=>!['actual','requested','capturedAt'].includes(key))) throw new AccessError(400,'Invalid recovery review');
    const intent=value as RecoveryIntent,scope=this.ports.scope(),principal=await this.history(auth,scope);
    const check=async()=>{
      await this.history(auth,scope,principal.subject);
      const current=await this.review(intent.commandId,auth);
      if(current.command.state==='verified' || current.command.updatedAt!==intent.expectedUpdatedAt ||
        current.observation.actual!==intent.observation.actual || current.observation.requested!==intent.observation.requested ||
        !Number.isSafeInteger(intent.observation.capturedAt) || intent.observation.capturedAt>current.observation.capturedAt || intent.observation.capturedAt+15000<=this.clock()) throw new AccessError(409,'Feedback or command changed; refresh the review');
      return current;
    };
    await check();
    await this.ports.audit({action:'contactors.recovery-review',subject:principal.subject,commandId:intent.commandId,outcome:'requested-target-remains-blocked'});
    const current=await check();
    const last=await this.history(auth,scope,principal.subject);
    if(last.sessionId!==principal.sessionId) throw new AccessError(401,'Session changed');
    await this.ports.receipts.recordReview(principal.subject,scope,intent.commandId,intent.expectedUpdatedAt,
      {at:this.clock(),subject:principal.subject,reason:intent.reason,observation:current.observation},async()=>{
        await check();const latest=await this.history(auth,scope,principal.subject);
        if(latest.sessionId!==principal.sessionId) throw new AccessError(401,'Session changed');
      });
    return {recorded:true,targetReleased:false};
  }
}
