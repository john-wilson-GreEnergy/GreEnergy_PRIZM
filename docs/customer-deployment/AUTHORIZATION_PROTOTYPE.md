# Offline authorization prototype and control review

Follow-up: the pure evaluator is now used for `contactors.execute` by the separately opt-in [local pilot adapter](CONTACTOR_ACCESS_ADAPTER.md). The original review below describes the prototype stage; other control adapters and production activation remain pending. The running installation has not been changed.

2026-09-24. **Not active in PRIZM. Not an identity provider, HTTP protection layer, safety interlock or compliance approval.** The prototype imports no server modules, opens no sockets, reads no runtime secrets and has no equipment dispatcher. Existing live routes are unchanged and remain subject to the access gaps in `API_ACCESS_BASELINE.md`.

## What is implemented

- `src/core/security/controlPolicyPrototype.ts`: pure permission evaluator for six logical operations: balancing execution, string rotation, PCS rotation, contactors, EMS app state, and power control.
- `controlPolicyPrototype.test.ts`: fake-control tests asserting zero dispatch calls for denied cases. Compound-workflow examples recheck authorization before each fake step; revocation, expiry or topology change stops later steps. The test does not undo earlier steps or simulate field actuation.
- `scripts/security/routeClassifications.ts`: hand-reviewed handler-effect ledger for 25 literal routes: balancing (4), rotation (4), contactors (1), EMS apps (3), thermal (13). This is classification, not acceptance of their safety/security implementation.
- `checkRouteClassifications.ts`: static coverage and drift report. Missing/ambiguous/moved registrations and changed/unreadable route files need review. New aliases are unclassified, not automatically granted access.

The ledger fingerprints route files only. Changes to downstream services, middleware, environment or identity adapters are not covered by that fingerprint. Service review is still incomplete; all classifications retain explicit caveats. The catalogue must never be loaded as a runtime allowlist merely because it has a matching hash.

Current static result: **25 handler-classified, 395 unclassified**, one dynamic-registration finding (five engineering workspace paths), seven middleware entries still requiring review. The report deliberately exits 1 while gaps remain. No production authentication or UI changes were made.

## Trust boundary

The future identity adapter supplies `VerifiedPrincipal` from a verified session. It must validate session integrity, status, expiry, revocation and grants on the server. It must never deserialize this object from a request body/header supplied by a user. `requestedBy`, portal selection, source IP and physical site labels do not establish identity.

The future topology adapter supplies `PolicyContext` from the enrolled current site/block and canonical topology revision. It expands array selections to the complete current target set; partial polling results must not shrink an array authorization check. A scoped string grant cannot authorize an array endpoint affecting additional strings. IP addresses and aliases are not authorization identifiers.

The evaluator returns a permission decision for a **normalized intent**, not an executable command. It does not validate deadbands, power limits, contactor override flags, current EMS state or readback quality. A permission grant is never approval to bypass protection. Those validations and the exact method/path/body mapping must be implemented and tested in a future adapter before production use. No HTTP middleware is installed by this prototype.

## Decisions exercised

| Case | Expected behavior |
|---|---|
| Missing, revoked, expired, future-issued or malformed verified session | Deny; no fake dispatch |
| Viewer grant or unknown operation, including inherited object-property names | Deny by default |
| Site/block mismatch or wrong topology revision | Deny |
| Expired trusted context, duplicate/unknown target, wrong equipment kind | Deny |
| Only one string authorized for a two-string request | Deny the entire intent before preparation |
| Direct balancing of enrolled, authorized strings | Require balancing capability covering every target |
| Balance after removing targets from rotation | Require both balancing and rotation capability over all selected strings |
| Balance after disabling ADB | Require scoped balancing AND block-wide EMS-app permission; a string-scoped EMS-app grant is insufficient |
| Power/EMS-app operation | Require block-wide capability; string permissions do not imply block control |
| Actor string/portal selector added to request intent | Cannot create authority or replace the verified subject |
| Session/context changes between preparation and balancing | Stop later fake steps; do not replay or implicitly restore earlier changes |

Administrators do not gain equipment authority simply by their role name. Roles must map to explicit site/block/capability grants. Any production workflow must bind the subject/session, parameters, targets, profile and approval to the reviewed plan and reevaluate before side effects. Returned allow objects are not reusable bearer tokens or durable approvals.

## Additional source-review findings

These were found by reading source, not by sending requests. The table preserves the original findings. A subsequent local-only correction pass is recorded in [CONTROL_HARDENING.md](CONTROL_HARDENING.md); the authorization prototype itself does not enforce these controls. Remaining authentication, inventory and deployment gates are still open.

| ID | Evidence | Required follow-up |
|---|---|---|
| CONTROL-01 | `executeBalancingWorkflow` validates mode but does not explicitly reject unknown `preflightChoice` values. Its direct-balancing ADB guard and preparation branches compare only known strings. | Strict runtime request schema and exhaustive preparation handling before any side effect; guard every accepted mode. Prototype denies unknown preparation, but the live route does not use it yet. |
| CONTROL-02 | `executeRotationCommand` can mark PCS rotation confirmed from cached `arrayPcsList` without checking that its sample is newer than dispatch. Aggregate rotation success is based on any accepted target. | Fresh independent PCS readback with complete requested-target coverage and explicit partial outcomes; do not equate cached match or partial acceptance with complete verification. |
| CONTROL-03 | Contactor execution obtains its write base from `PRIZM_EMS_TURTLE_BASE` or a fixed fallback, while other services resolve the active profile. The reviewed path does not establish matching site identity before constructing that write URL. | One trusted command destination resolver bound to the current enrolled site/profile. Verify actual deployment configuration separately; this review does not claim a wrong-site command occurred. |
| CONTROL-04 | Power control uses `app.enabled !== false`, so absent/unknown enabled state becomes true in the command payload. Power readback fetches and EMS-app verification fetches lack per-request abort deadlines in the reviewed code. | Unknown state must block rather than implicitly enable; keep setpoints separate from app-state changes. Bound every acquisition and the overall verification job. |
| CONTROL-05 | The contactor builder accepts a voltage-delta override option; generic operation-level permission alone cannot distinguish it from ordinary control. | Future pilot adapter must reject override/bypass fields; any expansion needs separately approved safety policy and acceptance. Do not infer permission from a confirmation boolean. |
| CONTROL-06 | Balancing verification jobs are looked up solely by supplied job ID; thermal recordings/review status also lack authenticated ownership checks at route level. Thermal lazy initialization can create directories even through nominally read-only handlers. | Bind jobs/results to site and authorized viewers/owners; distinguish device writes, local persistence and pure reads in policy and tests. |

## Reproduce offline checks

From the repository root:

```sh
node --require ./scripts/test-network-guard.cjs --import tsx src/core/security/controlPolicyPrototype.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx scripts/security/apiInventory.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx scripts/security/checkRouteClassifications.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx scripts/security/checkRouteClassifications.ts server.ts > /tmp/prizm-route-review.json
```

The final command's exit 1 is intentional until the open classification/middleware/dynamic-route work is resolved. Do not treat it as a passing security release gate. Generated evidence remains outside the source tree.

## Before integration or activation

1. Complete outstanding classifications and service review, prioritizing maintenance/firmware, safety-clear, repeating fan/lightbar writes, arbitrary destination/path inputs and external diagnostics. Fix the above issues in independently tested changes.
2. Implement strict method/path/body adapters, enrolled target expansion, parameter limits and protections against alternate aliases/HEAD/OPTIONS/fallback routes. Test real HTTP behavior against fake services, not live EMS. Remove or isolate unapproved external diagnostic paths.
3. Choose the customer-approved local/offline identity mechanism, grant administration and recovery procedure. No universal password, client-controlled principal or anonymous fail-open fallback.
4. Add durable protected audit, session/origin/CSRF controls, bounded workloads, job/stream revocation, full transaction binding and independent readback semantics. Decide explicitly what happens when audit persistence fails.
5. Produce an isolated build, rollback plan and supervised access/cutover tests. Obtain approval before changes to the running service, credentials, networking or equipment.

No production release gate is closed by a fake-dispatch unit test. This prototype makes permission behavior testable while the operating installation remains untouched.

## Local validation record

September 24: pure-policy fake-dispatch tests, static inventory regression fixtures and classification/drift tests passed under the network guard. Strict standalone TypeScript checks for all security prototype/tool files and the repository `npm run lint` passed. Prototype and classification-tool bundles built to `/tmp`; production `dist` was not rebuilt. The real-source classification report found 25 classified and 395 unclassified registrations, with no drift in the five classified route files; its exit 1 correctly preserves the unresolved review gate. `git diff --check` passed. No server restart, live request, identity activation, commit, push or deployment was performed.
