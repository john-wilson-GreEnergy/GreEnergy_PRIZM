import {constants} from 'node:fs';
import {open,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {readPrivateJson} from './localAccounts';
import {AccessError} from './localSessions';
import type {Capability, VerifiedPrincipal} from '../../core/security/controlPolicyPrototype';

export interface SiteScope {siteId: string; blockId: string}
export type JobKind = 'balancing' | 'thermal-recording' | 'thermal-review';
type Owner = SiteScope & {kind: JobKind; id: string; subject: string; sessionId: string; createdAt: number};
export function requireBlockCapability(principal: VerifiedPrincipal, scope: SiteScope, capability: Capability) {
  if (principal.state !== 'active' || principal.expiresAt <= Date.now() || !principal.grants.some(grant => grant.siteId === scope.siteId && grant.blockId === scope.blockId && grant.capability === capability && grant.scope.kind === 'block')) throw new AccessError(403,'Permission denied for this site');
}
/** Unknown/legacy jobs have no inferred owner and are inaccessible in the pilot. */
export class OwnedJobs {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}
  private async load(): Promise<Owner[]> {
    const raw = await readPrivateJson(this.file);
    if (!Array.isArray(raw) || raw.length > 10000 || raw.some(row => !row || typeof row !== 'object' ||
      !['balancing','thermal-recording','thermal-review'].includes(row.kind) || ['id','subject','sessionId','siteId','blockId'].some(key => typeof row[key] !== 'string' || !row[key] || row[key].length > 128) || !Number.isFinite(row.createdAt))) throw new Error('Invalid ownership ledger');
    return raw as Owner[];
  }
  async check(principal: VerifiedPrincipal, scope: SiteScope, kind: JobKind, id: string) {
    const rows = await this.load();
    const matches = rows.filter(row => row.kind === kind && row.id === id && row.siteId === scope.siteId && row.blockId === scope.blockId);
    if (matches.length !== 1 || matches[0].subject !== principal.subject) throw new AccessError(404,'Job unavailable');
  }
  /** Called only with a server-produced job ID, never a client-supplied owner. */
  bind(principal: VerifiedPrincipal, scope: SiteScope, kind: JobKind, id: string) {
    const operation = this.tail.then(async () => {
      if (!id || id.length > 128) throw new Error('Invalid server job ID');
      const rows = await this.load();
      const existing = rows.find(row => row.kind === kind && row.id === id && row.siteId === scope.siteId && row.blockId === scope.blockId);
      if (existing) {if (existing.subject !== principal.subject) throw new AccessError(409,'Job already belongs to another account'); return;}
      if (rows.length >= 10000) throw new AccessError(503,'Ownership ledger capacity reached');
      rows.push({...scope,kind,id,subject:principal.subject,sessionId:principal.sessionId,createdAt:Date.now()});
      const temporary = this.file+'.'+randomUUID()+'.tmp';
      const handle = await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try {await handle.writeFile(JSON.stringify(rows)); await handle.sync();} finally {await handle.close();}
      await rename(temporary,this.file);
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}
