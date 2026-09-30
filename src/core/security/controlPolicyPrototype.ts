/**
 * Pure authorization policy, not an identity provider. The opt-in local pilot
 * uses contactors.execute only; other operations remain staged policy definitions.
 * Context and principal must come from trusted server adapters, NEVER request JSON.
 * An allow decision is only permission evidence, not equipment safety/dispatch approval.
 */
export type Capability = 'telemetry.view' | 'history.view' | 'diagnostics.acquire' |
  'diagnostics.record' | 'storage.manage' | 'controls.balancing' | 'controls.rotation' |
  'controls.contactors' | 'controls.ems-apps' | 'controls.power';
export interface Grant {
  capability: Capability;
  siteId: string;
  blockId: string;
  scope: { kind: 'block' } | { kind: 'targets'; ids: readonly string[] };
}
export interface VerifiedPrincipal {
  subject: string;
  sessionId: string;
  state: 'active' | 'revoked';
  issuedAt: number;
  expiresAt: number;
  grants: readonly Grant[];
}
export interface PolicyContext {
  siteId: string;
  blockId: string;
  topologyRevision: string;
  /** Enrolled canonical identifiers, not IPs or user-editable physical aliases. */
  targets: readonly { id: string; kind: 'string' | 'pcs' }[];
  validUntil: number;
}
export interface PolicyIntent {
  operation: string;
  siteId: string;
  blockId: string;
  topologyRevision: string;
  /** Array selections must already be expanded by the trusted topology planner. */
  targetIds: readonly string[];
  preparation?: 'direct' | 'disable-adb' | 'out-of-rotation';
}
export interface Requirement { capability: Capability; scope: Grant['scope'] }
export type Decision = { allowed: false; reason: string } | {
  allowed: true; subject: string; sessionId: string; requirements: Requirement[];
};

const definitions: Readonly<Record<string, { capability: Capability; kind: 'string' | 'pcs' | 'block' }>> = {
  'balancing.execute': { capability: 'controls.balancing', kind: 'string' },
  'strings.rotation': { capability: 'controls.rotation', kind: 'string' },
  'pcs.rotation': { capability: 'controls.rotation', kind: 'pcs' },
  'contactors.execute': { capability: 'controls.contactors', kind: 'string' },
  'ems-apps.enabled-status': { capability: 'controls.ems-apps', kind: 'block' },
  'ems-apps.power-control': { capability: 'controls.power', kind: 'block' },
};
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim() === value && value.length > 0;
const deny = (reason: string): Decision => ({ allowed: false, reason });

export function authorizeControlIntent(
  principal: VerifiedPrincipal | null,
  intent: PolicyIntent,
  context: PolicyContext,
  now: number,
): Decision {
  if (!Number.isFinite(now) || !principal || !nonempty(principal.subject) || !nonempty(principal.sessionId) ||
      principal.state !== 'active' || !Number.isFinite(principal.issuedAt) || !Number.isFinite(principal.expiresAt) ||
      principal.issuedAt > now || principal.expiresAt <= now || !Array.isArray(principal.grants)) return deny('invalid-session');
  if (principal.grants.some(grant => !grant || !grant.scope ||
      (grant.scope.kind !== 'block' && (grant.scope.kind !== 'targets' || !Array.isArray(grant.scope.ids) || grant.scope.ids.some((id: unknown) => !nonempty(id)))))) return deny('invalid-session');
  if (!nonempty(context.siteId) || !nonempty(context.blockId) || !nonempty(context.topologyRevision) ||
      !Number.isFinite(context.validUntil) || context.validUntil <= now || !Array.isArray(context.targets)) return deny('invalid-context');
  if (context.targets.some(target => !target || !nonempty(target.id) || !['string', 'pcs'].includes(target.kind))) return deny('invalid-context');
  if (!Object.hasOwn(definitions, intent.operation)) return deny('unclassified-operation');
  if (intent.siteId !== context.siteId || intent.blockId !== context.blockId) return deny('site-mismatch');
  if (intent.topologyRevision !== context.topologyRevision) return deny('topology-changed');
  const definition = definitions[intent.operation];
  const ids = intent.targetIds;
  if (!Array.isArray(ids) || ids.some(id => !nonempty(id)) || new Set(ids).size !== ids.length) return deny('invalid-targets');
  if (new Set(context.targets.map(target => target.id)).size !== context.targets.length) return deny('ambiguous-topology');
  if (definition.kind === 'block' ? ids.length !== 0 : ids.length === 0 || ids.some(id =>
    !context.targets.some(target => target.id === id && target.kind === definition.kind))) return deny('invalid-targets');
  if (intent.operation === 'balancing.execute') {
    if (!['direct', 'disable-adb', 'out-of-rotation'].includes(intent.preparation ?? '')) return deny('invalid-preparation');
  } else if (intent.preparation !== undefined) return deny('unexpected-preparation');

  const scope: Grant['scope'] = definition.kind === 'block' ? { kind: 'block' } : { kind: 'targets', ids: [...ids] };
  const requirements: Requirement[] = [{ capability: definition.capability, scope }];
  if (intent.preparation === 'disable-adb') requirements.push({ capability: 'controls.ems-apps', scope: { kind: 'block' } });
  if (intent.preparation === 'out-of-rotation') requirements.push({ capability: 'controls.rotation', scope });
  for (const requirement of requirements) {
    const grants = principal.grants.filter(grant => grant.capability === requirement.capability &&
      grant.siteId === context.siteId && grant.blockId === context.blockId);
    if (grants.some(grant => grant.scope.kind === 'block')) continue;
    const targetScope = requirement.scope;
    if (targetScope.kind === 'block' || !targetScope.ids.every(id => grants.some(grant =>
      grant.scope.kind === 'targets' && grant.scope.ids.includes(id)))) return deny('insufficient-scope');
  }
  return { allowed: true, subject: principal.subject, sessionId: principal.sessionId, requirements };
}
