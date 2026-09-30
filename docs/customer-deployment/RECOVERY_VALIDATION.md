# Recovery validation — September 25, 2026

Scope: secured pilot recovery screen, receipt durability, authenticated restart and read-only rollback. Validation does not authorize equipment commands, target release, live-service restart, account provisioning, TLS changes or deployment.

## Live field check

This section records the pre-fix blocker. See the correction results below and the latest restart follow-up for the current status.

A read-only GET of the already-built local snapshot (no `refresh` parameter) returned LIVE / non-stale data with 320 strings and **zero nested `contactor` feedback records**. Snapshot source time: `2026-09-25T13:57:32.754Z`. The response was approximately 77 MB; the first bounded 30 MB probe was stopped without saving the payload. The next bounded probe printed only field availability and freshness.

The recovery observer deliberately requires explicit canonical positive/negative contactor feedback, matching target identity, quality and an observation timestamp under 15 seconds old. It must not infer physical state from ONLINE, rotation, voltage, a requested state, or a bulk snapshot timestamp. Live recovery parity therefore FAILS the field-availability prerequisite. Offline fixtures passing is not evidence of live compatibility. No live review was recorded or target released.

The compact cached projection (`/api/local/site-data/snapshot?view=one-line`, no refresh) exposes flat `positiveContactorClosed`, `negativeContactorClosed`, `contactorsCloseExpected`, and `actualContactorStateSource: last-call-explicit-polarity`. Sample Array 1 / Strings 1–2 reported CLOSED with both polarity booleans true. Their device `timestampUtc` values were `13:58:50.861` and `13:58:49.151`, while `sourceTimestampUtc` was `13:59:24.068` (September 25, UTC). Publication time is therefore not interchangeable with observation time. This is a mapping/freshness gate, not evidence of physical switch failure. No controller command or independent physical-state comparison was attempted.

## Completed results

| Check | Result |
| --- | --- |
| Focused security/access regression suites | PASS — 19 test programs, including the two HTTP suites, with outbound networking blocked |
| Fresh HTTP process restart | PASS — saved review retained, prior session rejected, new authenticated session required |
| Read-only rollback / re-enable | PASS in isolated fixture — auth gate retained, controls/recovery disabled, ledger preserved byte-for-byte, target still blocked after re-enable |
| Last-moment authorization / duplicate review race | PASS — revoked authorization does not alter storage; one concurrent save wins |
| Review capacity | PASS — 20-review limit fails closed without eviction or target release |
| Missing nested feedback / old observation with newer publication timestamp | PASS negative test — refuses recovery comparison |
| Repository type checking | PASS |
| Strict standalone new recovery/store/client/UI module checks | PASS; not a claim that all legacy modules satisfy strict mode |
| Isolated client/server production build | PASS — `/tmp/prizm-recovery-validation.iIsgES`; existing large-client-chunk warning remains |
| Live canonical feedback availability | BLOCKED — all 320 strings lack the required nested feedback object |
| Live device parity, full deployment restart, TLS and target release | NOT RUN / NOT APPROVED; release gates remain open |

New tests are in `src/server/security/recoveryLifecycle.test.ts`; it runs three isolated authenticated HTTP servers over Unix sockets using shared temporary fixture state, never the operational server. Extended receipt tests check authorization after lock acquisition, concurrent reviews, persistence and capacity. The existing browser validation from the previous increment remains applicable because no UI or production implementation was changed in this validation turn.

## Validation procedure

- Fresh isolated HTTP processes sharing a private test ledger: record a review, restart, verify old sessions rejected and saved evidence retained.
- Read-only rollback: remove control/recovery adapters while retaining the authentication gate and original receipt file, then re-enable in another isolated process; confirm the unresolved target stays blocked throughout.
- Guarded regression suite, strict checks of new modules, repository type check and isolated production bundle.
- Report pass/fail and outstanding gates; do not treat disabling the entire pilot as a safe rollback because that restores legacy unauthenticated routes.

Live mapping/parity, deployment TLS, verified queue reconciliation/target release, on-host deployment restart and approved rollback remain separate release gates. No claim of production readiness or regulatory compliance is made.

## Correction contract

The last-call string report carries `timeStamp` as epoch milliseconds encoded as a string, alongside `arrayIndex`, `stringIndex`, and `stringData`. The flat row's general timestamps can come from other sources and are not proof of contactor observation time. Normalize an atomic `contactorObservation` from this exact string report: matching explicit identities, two boolean polarity readings, optional boolean requested state, and the original per-string timestamp. Clear this observation on every normalization pass before rebuilding; never reuse a prior observation when source fields disappear. No array/report/publication timestamp fallback or current-time substitution is allowed.

Recovery prefers this canonical observation, including rejecting null/malformed observations rather than falling back to older feedback. Legacy nested contactor feedback remains supported only when the new field is absent. Preserve the 15-second observation limit, site binding, mixed-polarity rejection, and blocked-target behavior. Validate with offline fixtures and read-only live-source projection; the running service remains unchanged until a separately approved build/restart.

## Correction results — 14:04 UTC

Implemented in the canonical string normalizer and recovery observer. No equipment transport was added. Per-string source identity is required; numeric and digit-string millisecond timestamps are supported. Missing/malformed timestamps or incomplete polarity readings clear the new observation. Requested state is taken from the same report, never inherited from an older row. Recovery rejects future, expired, mixed-polarity or mismatched observations and does not fall back to legacy feedback when the new field exists but is unusable.

A bounded read of the existing cached localhost snapshot, without refresh, was processed in memory through the patched pure normalizer and observer at `2026-09-25T14:04:23.709Z`. All 320 reports supplied matching identities and timestamps. Observation ages ranged from 12,366 to 15,710 ms; 253 targets passed and 67 failed the unambiguous/fresh feedback gate. This checks compatibility against real source structure, not independent physical switch parity or a newly deployed runtime. Enrollment identity for this schema probe came from the snapshot itself; actual enrollment rejection remains separately covered by tests. Full raw payloads were not retained or printed.

All 19 previously listed test programs were rerun successfully, plus `canonicalStringSnapshot.test.ts` (20 total). Added regressions cover same-report timestamps, malformed/missing source, wrong target identities, prior-cycle clearing, unknown requested state, stale/future readings, mixed polarity, and refusal to fall back to old nested feedback. Repository type checking and strict standalone recovery-reader type checking passed. Client/server bundles built separately in `/tmp/prizm-recovery-mapping.97J1HN`; existing large-chunk warnings remain. Production assets, credentials, mode flags and running services were not changed; nothing was committed or deployed.

Follow-up: [Recovery freshness publication](RECOVERY_FRESHNESS.md) records the measured downstream wait, the implemented early-publication correction, timeout correction and 27-program regression results. The approved September 25 local restart and live timing check are now complete: recovery publication preceded full snapshot generation by 2.588–5.254 seconds, with all 320 strings fresh in 37 of 40 samples. Authentication flags and remote deployments were unchanged. Live authenticated recovery/receipt parity, an approved on-host authenticated rollback exercise, independent site verification, deployment TLS and supervised queue reconciliation remain required before production readiness.
