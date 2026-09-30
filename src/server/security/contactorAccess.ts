import {createHash} from 'node:crypto';
import {authorizeControlIntent, type PolicyContext, type VerifiedPrincipal} from '../../core/security/controlPolicyPrototype';
import type {ReadOnlyTelemetry} from '../../core/security/readOnlyTelemetry';
import type {ContactorControlRequest, ContactorControlResponse, ContactorExecutionGuard} from '../contactorControlService';
import type {SiteScope} from './ownedJobs';
import {AccessError} from './localSessions';
import type {ContactorIntent, ContactorReview, ContactorReceipt} from '../../core/security/contactorAccessModel';
import type {ContactorReceipts,CommandReservation} from './contactorReceipts';
import {requireBlockCapability} from './ownedJobs';

export interface ContactorAudit {
  action: string; subject: string; outcome: string;
  commandId: string; sessionId: string; siteId: string; blockId: string; targetId: string;
}
interface Ports {
  receipts:Pick<ContactorReceipts,'reserve'|'finish'|'assertTargetClear'|'readOwned'>;
  context(): Promise<PolicyContext>;
  execute(request: ContactorControlRequest, guard: ContactorExecutionGuard): Promise<ContactorControlResponse>;
  audit(event: ContactorAudit): Promise<void>;
}
const targetId = (array: number, string: number) => `array:${array}:string:${string}`;
const record = (value: unknown): value is Record<string,unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function parseIntent(value: unknown): ContactorIntent {
  if (!record(value) || Object.keys(value).some(key => !['commandId','action','array','string','confirmed','reason','topologyRevision'].includes(key)) ||
      typeof value.commandId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(value.commandId) ||
      typeof value.topologyRevision !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.topologyRevision) ||
      (value.action !== 'open' && value.action !== 'close') || value.confirmed !== true ||
      !Number.isSafeInteger(value.array) || Number(value.array) < 1 || !Number.isSafeInteger(value.string) || Number(value.string) < 1 ||
      typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 160 || /[\x00-\x1f\x7f]/.test(value.reason)) {
    throw new AccessError(400,'Invalid single-string contactor request');
  }
  return {commandId:value.commandId,action:value.action,array:Number(value.array),string:Number(value.string),confirmed:true,reason:value.reason.trim(),topologyRevision:value.topologyRevision};
}

/** Trusted cached snapshot only. A partial, stale or uncertain topology cannot authorize writes. */
export function contactorPolicyContext(scope: SiteScope, telemetry: ReadOnlyTelemetry, now = Date.now()): PolicyContext {
  const capturedAt = Date.parse(telemetry.capturedAt ?? '');
  if (telemetry.state !== 'LIVE' || telemetry.stale || !Number.isFinite(capturedAt) || capturedAt > now || capturedAt + 15000 <= now ||
      !telemetry.strings.length || telemetry.strings.some(row => row.stale || !Number.isSafeInteger(row.array) || row.array < 1 || !Number.isSafeInteger(row.string) || row.string < 1)) {
    throw new AccessError(409,'Fresh verified site telemetry is required for controls');
  }
  const ids = telemetry.strings.map(row => targetId(row.array,row.string)).sort();
  if (new Set(ids).size !== ids.length) throw new AccessError(409,'Ambiguous control topology');
  return {...scope,topologyRevision:createHash('sha256').update(JSON.stringify([scope,telemetry.site.station,telemetry.site.block,ids])).digest('hex'),
    targets:ids.map(id => ({id,kind:'string' as const})),validUntil:capturedAt+15000};
}

function publicResult(result: ContactorControlResponse): ContactorReceipt {
  return {success:result.success,acceptedCount:result.acceptedCount,verifiedCount:result.verifiedCount,
    mismatchCount:result.mismatchCount,unknownCount:result.unknownCount,
    results:result.results.map(row => ({target:{array:row.target.array,string:row.target.string},action:row.action,
      accepted:row.accepted,readbackConfirmed:row.readbackConfirmed,
      status:row.readbackConfirmed === true ? 'Verified by fresh telemetry' : row.accepted ? 'Accepted; requested state not verified' : 'Dispatch not confirmed; reconcile before retrying'}))};
}
type PublicResult = ReturnType<typeof publicResult>;

/** Durable admission plus in-flight coalescing; no automatic replay or destination selection. */
export class ContactorAccess {
  private readonly receipts = new Map<string,{fingerprint:string;sessionId:string;at:number;pending:boolean;operation:Promise<PublicResult>}>();
  constructor(private readonly ports: Ports, private readonly clock = Date.now) {}

  async review(array: number, string: number, authenticate: () => Promise<VerifiedPrincipal>): Promise<ContactorReview> {
    const context = await this.ports.context();
    const principal = await authenticate();
    const decision = authorizeControlIntent(principal,{operation:'contactors.execute',siteId:context.siteId,blockId:context.blockId,
      topologyRevision:context.topologyRevision,targetIds:[targetId(array,string)]},context,this.clock());
    if (!decision.allowed) throw new AccessError(403,'Contactor review is not permitted for this target');
    await this.ports.receipts.assertTargetClear({siteId:context.siteId,blockId:context.blockId,array,string});
    const latest=await this.ports.context(),current=await authenticate();
    const recheck=authorizeControlIntent(current,{operation:'contactors.execute',siteId:context.siteId,blockId:context.blockId,
      topologyRevision:context.topologyRevision,targetIds:[targetId(array,string)]},latest,this.clock());
    if(!recheck.allowed || current.subject!==principal.subject || current.sessionId!==principal.sessionId) throw new AccessError(403,'Control review context changed');
    return {array,string,topologyRevision:context.topologyRevision,validUntil:context.validUntil};
  }

  async readSaved(commandId:string,principal:VerifiedPrincipal,scope:SiteScope) {
    requireBlockCapability(principal,scope,'history.view');
    const entry=await this.ports.receipts.readOwned(principal.subject,scope,commandId);
    // Saved evidence only; never expose other accounts, session IDs or raw device responses.
    return {commandId:entry.commandId,array:entry.array,string:entry.string,action:entry.action,reason:entry.reason,
      state:entry.state,createdAt:entry.createdAt,updatedAt:entry.updatedAt,result:entry.result,historical:true};
  }

  async submit(body: unknown, authenticate: () => Promise<VerifiedPrincipal>): Promise<PublicResult> {
    const intent = parseIntent(body);
    const principal = await authenticate();
    const pinned = await this.ports.context();
    if (intent.topologyRevision !== pinned.topologyRevision) throw new AccessError(409,'Reviewed topology changed; review the target again');
    const id = targetId(intent.array,intent.string);
    const check = async () => {
      const context = await this.ports.context();
      const current = await authenticate();
      if (current.subject !== principal.subject || current.sessionId !== principal.sessionId) throw new AccessError(401,'Session changed');
      const decision = authorizeControlIntent(current,{operation:'contactors.execute',siteId:pinned.siteId,blockId:pinned.blockId,
        topologyRevision:pinned.topologyRevision,targetIds:[id]},context,this.clock());
      if (!decision.allowed) throw new AccessError(403,'Contactor permission or site context is no longer valid');
    };
    await check();
    const key = JSON.stringify([principal.subject,pinned.siteId,pinned.blockId,intent.commandId]);
    const fingerprint = JSON.stringify([intent,pinned.topologyRevision]);
    const previous = this.receipts.get(key);
    if (previous) {
      if (previous.sessionId !== principal.sessionId || previous.fingerprint !== fingerprint) throw new AccessError(409,'Command ID already used; reconcile the original command');
      const result = await previous.operation;
      await check();
      return result;
    }
    for (const [receiptKey,receipt] of this.receipts) if (!receipt.pending && receipt.at + 86400000 < this.clock()) this.receipts.delete(receiptKey);
    if (this.receipts.size >= 128) throw new AccessError(429,'Control receipt capacity reached; supervised reconciliation required');
    const audit = (outcome: string) => this.ports.audit({action:`contactors.${intent.action}`,subject:principal.subject,sessionId:principal.sessionId,
      commandId:intent.commandId,siteId:pinned.siteId,blockId:pinned.blockId,targetId:id,outcome});
    const reservation:CommandReservation={commandId:intent.commandId,subject:principal.subject,sessionId:principal.sessionId,siteId:pinned.siteId,blockId:pinned.blockId,
      array:intent.array,string:intent.string,action:intent.action,reason:intent.reason,topologyRevision:pinned.topologyRevision};
    // No await between receipt lookup and insertion. Shared execution locks still protect competing IDs.
    const operation = (async () => {
      await this.ports.receipts.reserve(reservation); // Must be durable before any dispatch.
      await audit('requested');
      await check();
      try {
        const result = await this.ports.execute({commandId:intent.commandId,action:intent.action,targets:[{array:intent.array,string:intent.string}],
          confirmed:true,reason:intent.reason,ignoreLowCgVoltAlarm:false,ignoreHighCgVoltAlarm:false,ignoreStringDcBusVoltageDeltaLimit:false}, {
          actor:principal.subject,namespace:JSON.stringify([principal.subject,principal.sessionId]),
          beforeDispatch:async target => {
            if (target.allStrings || target.array !== intent.array || target.string !== intent.string) throw new AccessError(403,'Dispatch target differs from authorized target');
            await check();
            await audit('dispatch-authorized');
            await check(); // Audit I/O must not open a revocation/site-change window.
          },
        });
        await audit(result.success ? 'verified' : result.acceptedCount ? 'accepted-not-fully-verified' : 'dispatch-not-confirmed');
        const receipt=publicResult(result);
        await this.ports.receipts.finish(reservation,receipt);
        return receipt;
      } catch (error) {
        await audit('interrupted-reconcile-before-retry').catch(() => {});
        throw error instanceof AccessError ? error : new AccessError(503,'Command outcome unavailable; reconcile before retrying');
      }
    })();
    const receipt = {fingerprint,sessionId:principal.sessionId,at:this.clock(),pending:true,operation};
    this.receipts.set(key,receipt);
    try {const result = await operation; await check(); return result;}
    finally {receipt.pending=false;}
  }
}
