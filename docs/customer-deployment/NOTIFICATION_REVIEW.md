# Summary notification review

The default summary page consumes a server-prepared `notificationReview` from the coordinator snapshot. It combines the existing final corrective-action list with existing contactor analysis of the canonical string broker and the existing Feather HVAC normalizer. No commands, acknowledgments, clears or threshold changes are introduced. No route-triggered acquisition is needed. Missing/stale source coverage is called out above the filters, including during restart warm-up.

Groups use equipment category, severity and fault code (exact normalized title when no code exists). Structured target identity includes Array, String, BPC, cell group and HVAC unit. Distinct observations and guidance remain under their target. Unknown locations and severities remain visible. Display text is never used to infer that different fault codes are equivalent.

All counts derive from the same grouped targets. Occurrences mean issue/target pairs; unique targets count each target once across groups. Alarm counts include critical findings. Summary counters cover the complete snapshot even when presentation filters are active.

The page supports search, severity, equipment and array filters. Native expandable issue groups keep layout in normal page flow and use stable keys so polling does not reset open sections. Targets now render in a compact table, not individual dropdowns.

## Consolidated target table

### Group-level troubleshooting

Each expanded issue now begins with the original guidance sections: Recommended Actions, Validation Checks, Clearing Criteria / required state, safety prerequisites, technician guidance, source references and Edit Guidance. The coordinator projection preserves the existing resolved troubleshooting object and runtime remediation fields without adding device reads or new resolver heuristics. Identical instructions are deduplicated by text and advisory status, retaining their target IDs. Array filters limit guidance to the displayed targets; instructions that apply to only some targets show their explicit scope. The table keeps measurements, conditions and timestamps, not repeated troubleshooting paragraphs. Older snapshots without this projection retain the prior row guidance rather than dropping it.

Unmatched knowledge-base fallback instructions and clearing criteria are marked generic advisory, not verified fault-specific conditions. The documented fault-catalog clearing behavior remains separately labeled in the top panel. No numeric threshold or resolution state is invented, and missing checks/criteria remain explicit. The original granular guidance and whole-view `notificationView=legacy` rollback remain available. Edit Guidance uses the existing matrix navigation and entry ID, opening the general editor when no unambiguous matched entry exists.

The default compact presentation aligns metric values under shared unit-bearing column headers instead of repeating metric cards and labels inside each row. Target/location has an Array / Segment / String column; a separate BPC / Cell groups column keeps each BPC paired with its own cell groups, one line per BPC within the same consolidated string row. Scope remains on each row even when every target shares it. Notification and telemetry sources appear once in the caption when shared by every displayed target; differing sources stay visible on their own rows. Missing values use an accessible dash with an explicit unavailable label. Dates/times and distinct evidence remain visible; group troubleshooting is displayed above the table. Padding is reduced without changing grouping, telemetry, counts or acquisition. `&notificationDensity=comfortable` restores the previous card-in-table presentation; `notificationTargets=details` still restores per-target disclosures.

Compact-layout validation: full suite, focused presentation tests, TypeScript and production build passed. Following an idle local restart, browser checks confirmed 2003 values/units/timestamps and 1001 BPC/cell scope retention. Sampled voltage rows measured approximately 44–45 px versus 133–134 px before, at the same browser viewport. Comfortable-layout rollback was verified and the browser returned to the compact view. No telemetry or fault-count logic changed.

The server prepares `tableRows` alongside the unchanged granular `targets` and counters. Within each issue code and severity, targets with a resolved block/array/string identity share one row. BPCs appear once with their affected cell-group lists. Different arrays, blocks, strings, PCS and HVAC units remain separate; missing string identities are not guessed. Member IDs preserve a one-to-one coverage check against the granular targets. The group heading distinguishes affected targets from consolidated rows, so condensation never silently reduces alarm counts.

Distinct measurements and conditions retain their BPC/cell scope. Identical observation content shares a detail block with its supplied source timestamps; the visible range is not a first-seen/last-seen inference. Invalid or missing timestamps remain unavailable. Repeated generated `Affected: ...` text is replaced by the actual table, while original observations remain in the granular model. Guidance shared by every target is displayed once below the table; target-specific guidance stays with its evidence. No per-target dropdown or inner vertical scrolling is used.

For the previous per-target disclosure layout, append `&notificationTargets=details` to the overview URL. This presentation-only rollback uses the retained granular targets. `notificationView=legacy` still selects the older whole notification view. Neither flag changes detection, sources or counts.

Focused tests cover duplicate cells, repeated BPCs, block/array separation, unresolved targets, PCS/HVAC identity, timestamp normalization, evidence scope and unchanged counts. A recorded live snapshot condensed 31 high-voltage alarm targets into 21 string rows and 43 charge-balancer warning targets into 24 string rows without dropping a target.

The compact-table update passed focused tests, the full test suite, TypeScript and production build. After restarting the idle local runtime, a fresh snapshot retained all 340 issue/target occurrences exactly once across table member IDs. The browser showed 43 charge-balancer targets in 24 rows, including BPC 10 / cell groups 9 and 10 together for Array 1 / String 11. The `notificationTargets=details` rollback restored 43 per-target disclosures, and the browser was returned to the default table view. Validation sent no equipment commands.

## Equipment versus availability

Battery & equipment issues contains voltage, temperature, balancing, HVAC and other notifications. Contactors & rotation contains connection/rotation findings for strings and PCS. Classification is server-side and never changes severity or drops a finding. Both sections remain visible under filters. Explicit canonical OUT rotation states are supplemental information rows (PRIZM-prefixed codes, not invented EMS codes); unknown states and a false enable flag alone do not create an OUT finding. Retained state quality and source timestamps remain visible. PCS identity is kept separate from string identity.

The shared catalog names 1003/2003 as String High Voltage Alarm/Warning and 1008/2008 as Battery Pack Voltage Delta Alarm/Warning, as confirmed by the site operator. Each pair shares a family but keeps its own code and severity. No numeric thresholds are invented. The compact code, explanation, affected scope and severity presentation is inspired by the inspected Elexity BESS status page. PRIZM does not import Elexity-specific status codes, site-impact percentages, or event-start timestamps without an authoritative source.

Source observation timestamps are shown only when supplied; snapshot preparation time is not relabeled as device observation time. Retained snapshots are marked. Dometic RPM values are excluded from evidence; per-device HVAC profile detection and existing Dometic fallback are unchanged. Both HVAC command/current pairs are retained when supplied.

## Document-backed notification catalog (September 28, 2026)

The supplied `String Controller Fault Codes.pdf` contains 160 distinct codes on printed manual pages 41–51 (PDF pages 1–11). Its SHA-256 is `5ff4a2a124959f8147ee27b85b1fa7465cfc656482cddd0fa66e4fc8bf6e199d`. No manual revision or installed-controller firmware applicability was established. The PDF is a reference, not a replacement for live controller authority.

`stringControllerFaultCatalog.ts` contains the curated definitions, documented severity, descriptions, clearing behavior, and page provenance. This adds 147 codes to the existing 16-entry shared catalog and enriches the 13 overlapping entries. The three existing entries absent from this manual (2073, 2074, 2561) and their visibility/export policies remain unchanged. The legacy BESS code-name helper now derives documented names and severity from the same pure catalog, while retaining its additional undocumented names. BatteryPack spacing, broken line wraps, Warranty underscores, and the abbreviated 2017 label are normalized for display; IDs are unchanged.

Only explicitly documented codes are included: no unlisted severity variants are inferred. Warranty alarm/warning families remain separate from ordinary notifications. Warranty alarms have permanently-recorded semantics, not manual-clear semantics. The summary uses catalog severity only when runtime severity is absent; an explicit unknown remains unknown. Reference clearing text is informational only and cannot clear, suppress, acknowledge, or reset a device. Existing fault detection, numerical thresholds, and control paths are unchanged.

Most ordinary Warning descriptions in this manual refer to an “alarm” setting/timeout; code 3003 also mixes info detection and alarm clearing thresholds. A per-code note makes those inconsistencies visible. Descriptions use neutral configured-threshold wording, not an invented numeric value or inferred hysteresis. The unusual E-Stop clearing description for 1558 is retained as a qualified reference, not an operating instruction.

Coverage checks independently transcribe all IDs by printed page and test missing/extra codes, shared labels, explicit severity precedence, clearing differences, warranty separation, retained legacy codes and UI reference text. A separate comparison with extracted PDF text found 160 IDs, no missing/extra IDs, and no page mismatches. Focused tests, the full test suite, TypeScript checks and production build passed. Read-only local validation after restart retained all 282 native issue/target occurrences in the sampled snapshot (306 combined occurrences); counts vary with telemetry. Browser verification covered the expanded 2008 reference, code filtering, and the prior view. No controller commands were sent. Mac runtime tested; these pure TypeScript changes introduce no OS-specific runtime dependencies.

## View rollback

### Notification metric context

The coordinator joins its canonical string rows once by block/array/string before publishing the target table. The pure `notificationMetrics` projection selects explicit-unit metrics for documented voltage, cell-temperature and string-current code families, plus the existing derived contactor findings. Voltage context includes measured string V, minimum/maximum cell mV and their difference. Temperature context includes mean/min/max cell °C and the min/max spread; current context includes A, kW and measured V. Existing HVAC command/current evidence is unchanged. Enclosure temperature and ground-leakage faults do not borrow cell temperatures or string current as if they measured those quantities.

Context stays separate from original notification evidence, fault counts and observation timestamps. BPC/cell faults show **string-wide context**, not an invented BPC/cell measurement. No thresholds or clearing decisions are inferred. No requests or device commands are added. Missing, non-finite, reversed ranges, bad reports, conflicting identities and missing block identity are not replaced with zero or another source. Freshness uses canonical source time plus snapshot/row stale flags; over 30 seconds is marked stale, absent/future time is unverified. This is a presentation freshness label, not an alarm rule. A partially missing range remains explicitly unavailable. `&notificationMetrics=off` hides the additional context without changing the tables, sources or counts.

Validation on September 28: focused metric/UI tests, full suite, type checks and production build passed. A live same-snapshot comparison matched 225 metric rows to canonical explicit-unit fields with zero discrepancies; all 304 issue/target occurrences remained covered exactly once. Browser verification covered voltage warning readings, separate notification/telemetry times, and the metrics-off rollback. A detected preparation-time ordering issue was corrected: the review uses projection completion time rather than the earlier acquisition timestamp. No equipment commands were sent; only the idle local application was restarted. Mac runtime verified; Windows/Linux execution was not exercised and no platform-specific dependencies were added.


Append `&notificationView=legacy` to the summary URL (or `?tab=overview&notificationView=legacy`). This retains the previous UI and PDF workflow. Remove the parameter to return to the new view. The original final corrective actions and raw sources remain unchanged in the snapshot.

## Validation

Target-column split validated September 28: notification projection/presentation tests, TypeScript checks and production build passed. Regression fixtures verify separate identity/scope cells, multiple BPC-to-cell-group associations, metric/no-metric layouts and retained comfortable/detail rollback rendering. After an idle local restart, the prepared endpoint preserved 272 of 272 target memberships without duplication. Browser verification displayed Array 2 / String 24 with BPC 4 (cell groups 15, 17) and BPC 9 (cell groups 6, 8) in the dedicated adjacent column. Troubleshooting stays above the table. No telemetry, fault rules or device controls changed.

Group-guidance restoration validated September 28: focused tests, full test suite, type checks and production build passed. The local browser showed the original Recommended Actions, Validation Checks and Clearing Criteria sections once above the expanded group's compact target table; table rows no longer repeat those steps. Edit Guidance opened the matching Abnormal Cell Voltage matrix entry without saving changes. Live payload checks confirmed curated guidance for 1001/2001/2074, explicitly advisory unmatched guidance for 2003/2008, and retained target membership. Array-specific scoping and absent-field behavior are covered by regression tests. Only the idle local PRIZM runtime was restarted; no equipment commands were sent. Mac runtime verified; Windows/Linux execution was not exercised and no platform-specific dependencies were added.

Run `node --require ./scripts/test-network-guard.cjs --import tsx src/server/notifications/notificationReview.test.ts` and the same command for `src/components/NotificationReviewPanel.test.tsx`, then lint/build and read-only local browser validation. Check input/target coverage, severity separation, unknown targets, Dometic evidence, multiple arrays, expansion stability, filtering and rollback. No controller actions are required.

The saved live snapshot check on September 28 retained all 301 native issue/target occurrences across six original groups. Supplemental contactor and HVAC findings remain separate from this native parity check. Live counts change with telemetry; this is not a fixed expected site fault total.

The subsequent section/catalog update passed focused tests, TypeScript checks, the full test suite and production build. After a local restart, the live check retained 315 of 315 native issue/target occurrences; all 336 combined occurrences were assigned to exactly one section. The live browser displayed 2003 and 2008 with their resolved names and verified code filtering and target expansion. Alarm variants and string/PCS OUT rotation classification are covered by fixtures; no device state was changed to manufacture a live example.
# Calculated BPC voltage comparison (1008 / 2008)

The prepared notification table can show the three largest absolute BPC deviations
per affected string, with a group-wide “Show all BPC comparisons” button. The original
controller-reported BPC/cell scope remains a separate column; a calculated ranking is
not a confirmed fault location and does not change counts, severity or clearing.

Pack voltage is the sum of all reported cell-group voltages (mV converted to V).
The peer average excludes that BPC. Signed deviation is pack voltage minus peer
average. This diagnostic method is **not** a verified controller trip formula or
threshold. No fault is generated from the ranking, including for equal voltages.

Only complete, explicit pack/cell topology from the existing active-site StringViewer
broker cache is used. Missing/invalid/zero cell voltages withhold the comparison;
missing or invalid times are labeled “time unknown.” Failed refreshes, stale cache
entries, retained site snapshots, or source/cell ages over 30 seconds are labeled
stale. This is current context, not event-time evidence. No routes, timers, device
commands, new polls or dependencies are added. Raw payloads stay server-side.

Rollback: `PRIZM_BPC_OUTLIERS=false` before starting PRIZM removes the enrichment
and restores the existing string-context columns. `notificationMetrics=off` hides
all diagnostic metrics without affecting native notifications.

Validation (2026-09-28): focused normalization/projection/presentation and broker
cache-isolation tests passed, as did the full regression suite, TypeScript check and
production build. A fresh local runtime published comparisons for all 16 current
2008 target strings after cache warm-up, with both fresh and stale quality states
observed. Independently checked all 14 pack sums and excluded-peer averages against
the captured live Array 1 / String 27 voltage map. Projection parity tests confirm
removing `bpcOutliers` gives the identical original review (including native scope,
counts, severity, evidence and metrics). Browser verification covers compact/full
ranking and the diagnostic-metrics rollback. No equipment commands were sent.
