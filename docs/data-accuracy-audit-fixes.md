# Data-accuracy audit fixes — 2026-09-23

## Scope

First implementation batch from the September 23 audit. No command encoders, equipment controls, target addressing, firmware, recorder configuration or Dell deployment are changed by this batch.

### PCS

- Missing/null/blank/boolean process values are not coerced to numeric zero. A genuine numeric zero remains valid.
- Process-point quality and the original SMA observation timestamp determine availability and freshness. Epoch seconds and milliseconds are accepted. Missing or implausibly future timestamps are unverified; points over 120 seconds old are stale.
- Extended HTTP values retain their original timestamps and can remain visible as explicitly stale last-known readings. Completing a sweep does not renew older readings.
- Explicit SMA configuration responses (`_isProcessData=false`) and fixed firmware identity use the successful retrieval time, not a nonexistent process timestamp or the old reboot/change time. This was checked against the live read-only rating and operating-mode responses. Process readings with missing quality remain unavailable.
- Derived capability/uptime values require live inputs. Individual stale readings include their age; unavailable fields show `Not reported`.
- The switch/status timestamp is labeled separately from extended HTTP data. Source metadata identifies SMA HTTP and port 443 rather than incorrectly calling it direct Modbus.
- Positive DC voltage alone no longer makes a collapsed PCS tile report communicating.

### Contactor-state API

`GET /api/local/strings/dashboard/contactors/state` reads the canonical string-domain broker used for the fast string list. It never starts another acquisition sweep, including when a caller supplies the old refresh/concurrency query parameters. The response declares `refreshPolicy: background-only`, broker version, data age, source and stale/warming state.

The adapter preserves the row's actual observation timestamp. Empty data or rows older than 30 seconds cannot appear current. The legacy on-demand engine remains available to its existing consumers; this endpoint does not switch acquisition authorities or invent a new polling schedule.

### Open-contactor warnings

Corrective-action aggregation no longer unconditionally excludes code 2534. It classifies each target using fresh canonical feedback:

- Intentional open: not actionable as an open-contactor fault.
- Requested closed, both open, measured string/bus delta >10 V: voltage-alignment wait, not an actionable close failure.
- Missing/stale/request-unknown or conflicting feedback: keep the warning visible.
- Requested closed with no verified voltage wait: keep the warning visible.
- Active alarm on the same string: retain both the alarm and the open warning; do not assume voltage alone explains the condition.

Alarms are never downgraded by this classification. Raw array notifications remain unchanged. `snapshot.debug.contactorOpenAssessments` retains expected/waiting classifications and evidence. Actionable code 2534 remains eligible for summaries/exports. Existing rotation-warning treatment is not changed in this batch.

## Validation

Focused tests:

- `src/server/telemetry/pcsDataQuality.test.ts`
- `src/server/telemetry/modbusOperationalTelemetry.test.ts`
- `src/server/notifications/contactorOpenAssessment.test.ts`
- `src/server/notifications/contactorFaultIntegration.test.ts`
- `src/server/contactorStateRoute.test.ts`
- Existing corrective-action, contactor-control and PCS-normalizer tests.

Production build passes. Full type checking still has 18 pre-existing errors outside this correction; the undefined contactor-route function error is removed. Do not describe the full repository as type-clean.

Live verification is read-only against the local deployment. No physical equipment command is required to test this batch. Restarting the existing local runtime still encounters the independently audited shutdown-handler defect; fixing coordinated shutdown remains a separate priority.

Observed after restart:

- Contactor-state endpoint returned HTTP 200, all 320 strings, and zero command/feedback differences against the fast string-list snapshot. Source is `canonical-string-broker`; all readings were fresh in that sample.
- All eight PCS reported `EMS Modbus + SMA HTTP`; direct web source metadata uses port 443.
- Browser diagnostics showed unavailable coupler/battery masks as `Not reported / Not reported`, preserving real zero fault/timer readings.
- Seven current open warnings were classified as voltage-alignment waits using fresh requested/actual states and measured deltas of 17–35 V. One corrective-action group remained visible. These are observations at validation time, not permanent site conditions.

## Release / rollback

This working tree also contains previously unfinished timeline/review features and runtime data. Stage only reviewed implementation hunks and new tests/docs for this batch; do not stage all changes or runtime data. No push or Dell update is implied by local validation.

Rollback is restoration of the previous reviewed application build/release, followed by a controlled restart. No data schema migration or device-side change occurs. A rollback also restores the older missing-value and notification-filtering behavior; use it only to recover a regression, not to hide a warning.
