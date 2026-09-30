import assert from 'node:assert/strict';
import { authorizeControlIntent, type VerifiedPrincipal, type PolicyContext, type PolicyIntent, type Grant } from './controlPolicyPrototype';

const now = 10_000;
const context: PolicyContext = { siteId: 'site-test', blockId: 'block-1', topologyRevision: 'v1', validUntil: 20_000,
  targets: [{ id: 'a1s1', kind: 'string' }, { id: 'a1s2', kind: 'string' }, { id: 'a1p1', kind: 'pcs' }] };
const intent: PolicyIntent = { operation: 'balancing.execute', siteId: context.siteId, blockId: context.blockId,
  topologyRevision: 'v1', targetIds: ['a1s1'], preparation: 'direct' };
const grant = (capability: Grant['capability'], scope: Grant['scope'] = { kind: 'targets', ids: ['a1s1'] }): Grant =>
  ({ capability, siteId: context.siteId, blockId: context.blockId, scope });
const principal: VerifiedPrincipal = { subject: 'verified-tech', sessionId: 'session-test', state: 'active', issuedAt: 1_000, expiresAt: 15_000,
  grants: [grant('controls.balancing')] };

// Only this fake sink is callable. No real routers, control services or transport imports.
let calls = 0;
function simulate(p: VerifiedPrincipal | null = principal, i: PolicyIntent = intent, c: PolicyContext = context, at = now) {
  const decision = authorizeControlIntent(p, i, c, at);
  if (decision.allowed) calls++;
  return decision;
}
function rejected(p: VerifiedPrincipal | null, i = intent, c = context, at = now) {
  const before = calls;
  assert.equal(simulate(p, i, c, at).allowed, false);
  assert.equal(calls, before, 'Rejected intent must make zero fake dispatch calls');
}
assert.equal(simulate().allowed, true);
rejected(null);
rejected({ ...principal, state: 'revoked' });
rejected({ ...principal, expiresAt: now });
rejected({ ...principal, issuedAt: now + 1 });
rejected({ ...principal, expiresAt: NaN });
rejected({ ...principal, subject: '' });
rejected({ ...principal, grants: [] });
rejected({ ...principal, grants: [{ ...grant('controls.balancing'), scope: { kind: 'targets', ids: 'a1s1' } } as unknown as Grant] });
rejected({ ...principal, grants: [grant('telemetry.view', { kind: 'block' })] });
rejected(principal, { ...intent, operation: 'runtime.admin' });
rejected(principal, { ...intent, operation: 'constructor' });
rejected(principal, { ...intent, operation: '__proto__' });
rejected(principal, { ...intent, siteId: 'other-site' });
rejected(principal, { ...intent, blockId: 'block-2' });
rejected(principal, { ...intent, topologyRevision: 'v0' });
rejected(principal, intent, { ...context, validUntil: now });
rejected(principal, intent, context, NaN);
rejected(principal, { ...intent, targetIds: [] });
rejected(principal, { ...intent, targetIds: ['a1s1', 'a1s1'] });
rejected(principal, { ...intent, targetIds: ['a1p1'] });
rejected(principal, { ...intent, targetIds: ['unknown'] });
rejected(principal, { ...intent, targetIds: ['a1s1', 'a1s2'] });
rejected(principal, intent, { ...context, targets: [...context.targets, context.targets[0]] });
rejected({ ...principal, grants: [{ ...grant('controls.balancing'), siteId: 'other-site' }] });
rejected({ ...principal, grants: [{ ...grant('controls.balancing'), blockId: 'other-block' }] });
rejected(principal, { ...intent, preparation: undefined });
rejected(principal, { ...intent, preparation: 'typo' as PolicyIntent['preparation'] });
rejected(principal, { ...intent, preparation: 'disable-adb' });
rejected(principal, { ...intent, preparation: 'out-of-rotation' });
rejected({ ...principal, grants: [...principal.grants, grant('controls.ems-apps')] }, { ...intent, preparation: 'disable-adb' });
assert.equal(simulate({ ...principal, grants: [...principal.grants, grant('controls.ems-apps', { kind: 'block' })] }, { ...intent, preparation: 'disable-adb' }).allowed, true);
assert.equal(simulate({ ...principal, grants: [...principal.grants, grant('controls.rotation')] }, { ...intent, preparation: 'out-of-rotation' }).allowed, true);
assert.equal(simulate({ ...principal, grants: [...principal.grants, grant('controls.balancing', { kind: 'targets', ids: ['a1s2'] })] }, { ...intent, targetIds: ['a1s1', 'a1s2'] }).allowed, true);
const power = { ...intent, operation: 'ems-apps.power-control', targetIds: [], preparation: undefined };
rejected(principal, power);
rejected({ ...principal, grants: [grant('controls.power')] }, power);
assert.equal(simulate({ ...principal, grants: [grant('controls.power', { kind: 'block' })] }, power).allowed, true);
rejected(principal, { ...power, preparation: 'disable-adb' });
// An actor string or portal selector attached to an intent never becomes identity.
const spoofed = { ...intent, requestedBy: 'admin', portal: 'operator' };
rejected(null, spoofed);
const identity = simulate(principal, spoofed);
assert.ok(identity.allowed && identity.subject === 'verified-tech');
// A saved allow result is not reusable after a session/profile change.
assert.equal(simulate().allowed, true);
rejected({ ...principal, state: 'revoked' });
rejected(principal, intent, { ...context, topologyRevision: 'v2' });
for (const [operation, capability, targetIds] of [
  ['contactors.execute', 'controls.contactors', ['a1s1']],
  ['strings.rotation', 'controls.rotation', ['a1s1']],
  ['pcs.rotation', 'controls.rotation', ['a1p1']],
  ['ems-apps.enabled-status', 'controls.ems-apps', []],
] as const) {
  const testIntent = { ...intent, operation, targetIds, preparation: undefined };
  rejected({ ...principal, grants: [] }, testIntent);
  assert.equal(simulate({ ...principal, grants: [grant(capability, { kind: 'block' })] }, testIntent).allowed, true);
}
// Demonstrate required orchestration with fake steps only. This is NOT a runtime executor.
const compound = { ...intent, preparation: 'disable-adb' as const };
const compoundPrincipal = { ...principal, grants: [...principal.grants, grant('controls.ems-apps', { kind: 'block' })] };
for (const change of ['revoke', 'topology', 'expire'] as const) {
  let activePrincipal = compoundPrincipal;
  let activeContext = context;
  let time = now;
  let dispatched = 0;
  for (const step of ['fake-disable-adb', 'fake-balance']) {
    const decision = authorizeControlIntent(activePrincipal, compound, activeContext, time);
    if (!decision.allowed) break;
    assert.equal(decision.requirements.length, 2, 'All prerequisite permissions checked before any step');
    dispatched++;
    if (step === 'fake-disable-adb') {
      if (change === 'revoke') activePrincipal = { ...activePrincipal, state: 'revoked' };
      if (change === 'topology') activeContext = { ...activeContext, topologyRevision: 'v2' };
      if (change === 'expire') time = principal.expiresAt;
    }
  }
  assert.equal(dispatched, 1, 'No later step after loss of authorization; no automatic rollback or retry');
}
assert.deepEqual(intent.targetIds, ['a1s1'], 'Policy must not mutate selected targets');
console.log('Offline authorization prototype passed: zero fake dispatches on denied identity, scope, prerequisite, topology and expiry cases.');
