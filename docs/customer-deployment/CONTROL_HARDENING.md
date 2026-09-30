# Local control hardening — September 24, 2026

Status: source changes and offline validation only. No service restart, live control, push or deployment. These changes are not a compliance certification or production authorization.

Follow-up: [LOCAL_ACCESS_PILOT.md](LOCAL_ACCESS_PILOT.md) documents the opt-in offline identity and owned-recording pilot. It is inactive; balancing and singleton-review ownership integration and full application permissions remain open.

## Changes against the authorization prototype findings

| Finding | Local correction | Remaining evidence/boundary |
|---|---|---|
| CONTROL-01 | Reject missing/unknown balancing preparation choices before any read or dispatch. Reject non-finite provided targets, ambiguous array scope, duplicate/overlapping balancing selections. Unknown ADB state cannot claim direct balancing is safe. | Full authenticated route schema, enrolled target expansion and compound-operation permission adapter remain separate work. |
| CONTROL-02 | PCS rotation no longer confirms from the PRIZM cache. Acquire an EMS PCS list before dispatch, pin its IDs, and require two new matching EMS responses. Missing, duplicate, explicitly stale/noncommunicating or conflicting rows cannot verify. Supplied sample timestamps must be after dispatch. Overall rotation success requires every result accepted and verified; partial results remain visible. | Array coverage is the IDs actually listed by EMS, not independent proof of complete physical inventory. When the endpoint supplies no source sample timestamp, two new HTTP responses establish acquisition freshness only, not device-sample freshness. Hardware acceptance is still required. |
| CONTROL-03 | Balancing, rotation, contactor and EMS app/power writes use a shared active-profile destination check. Require matching cached EMS station/block and cache ownership; reject demo/offline/mismatched contexts and conflicting legacy override. Pin profile/base/site across preparation and dispatch. Contactor idempotency results are scoped to site and exact plan. | This is destination consistency, not authentication or trusted enrollment. Site-profile authorization, complete topology revisions, cache-age policy and transactional concurrency still need the security adapter. |
| CONTROL-04 | Power commands require a known boolean enabled state and preserve false rather than enabling implicitly. Serializer has no default enabled value. App/power verification reads have per-request and total deadlines. Shared requests bound body consumption as well as headers, reject redirects and do not retry commands. Non-2xx responses containing success words are not accepted. | HTTP acceptance remains distinct from physical application. Existing app/power UI result contracts and comprehensive audit delivery-state semantics need the next adapter review. |
| CONTROL-05 | Ordinary contactor execution now rejects all protection-override fields unless absent or false. | The URL builder is not a safety boundary. Any future bypass facility requires separately reviewed site safety policy, explicit capability, audited approval and supervised acceptance; generic control permission is insufficient. |
| CONTROL-06 | Not closed by this patch. | Authenticated site/session/owner binding of balancing and thermal jobs requires the identity layer. No new job authorization claim is made. |

Original protocol builders, endpoints and device commands are preserved except that unsupported override requests are rejected before dispatch. A profile change does not cause command retransmission or automatic restoration of prior app/rotation state. Accepted operations may remain unverified; operators must inspect readback before choosing another action.

## Offline verification

Run from the repository root:

```sh
node --require ./scripts/test-network-guard.cjs --import tsx src/server/controls/controlHardening.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx src/server/ems/emsCommandTimeline.test.ts
npm run lint
```

The new test changes to a temporary working directory before importing services and mocks all requests. It covers invalid preparation choices, NaN, ambiguous targets, invalid later selections, unknown/conflicting app state, preservation of disabled state (timeline regression), profile/override conflicts, misleading non-2xx bodies, idempotency plan mismatch, independent PCS reads, partial acceptance, stale/missing/conflicting PCS fields, empty aggregate results, and both header/body stalls without retry. The network preload rejects any unmocked connection.

The existing balancing, rotation, contactor and app-command regressions are also run under the network guard from a temporary working directory. Production bundles must be built to a temporary output directory for local validation; do not overwrite the running server's `dist` or invoke the live-runtime verification script.

Validation record: the new hardening suite, command-timeline suite, four existing control regressions, authorization-prototype tests and route-classification tests passed offline. Repository type checking and whitespace checks passed. Client and server bundles built under `/tmp/prizm-control-hardening-build.R21LvP`, not the running `dist`. The client build reports an existing large-chunk warning; the ESM timeline test also reports a caught legacy `require` cache-write warning. Neither is evidence of a live equipment test. No production process was started or restarted.

## Before activation

1. Review this diff together with existing uncommitted work; create an explicit release/rollback checkpoint. Do not discard the user's other changes.
2. Confirm profile station/block identity and the actual PCS endpoint payload on the intended deployment with read-only evidence. Missing fields must block or remain unknown, not be guessed.
3. Approve a bounded maintenance test plan naming targets, action, preconditions and expected non-target behavior before starting captures or sending controls.
4. Restart only with approval. Validate accepted/rejected/unknown states and compare physical feedback independently. Do not retry ambiguous deliveries automatically.
5. Continue identity, route permissions, job ownership, durable audit and OT deployment gates. This patch does not expose any remote access service or activate the offline authorization prototype.
