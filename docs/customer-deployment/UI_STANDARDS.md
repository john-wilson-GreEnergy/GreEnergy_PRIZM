# Technician UI acceptance standard

2026-09-24 — proposed design/test contract. No pages or controls changed by this document. Pilot String List and PCS first; retain the thermal overhead view and existing deep links. These requirements supplement, not replace, backend access controls.

## Shared shell and target context

| ID | Requirement | Acceptance check |
|---|---|---|
| UI-01 | Persistent site/block identity, EMS identity, canonical target and optional physical alias. Spell out `Array 1`, not only `A1`. | Switching profiles clears incompatible selections; review still shows canonical IDs even with duplicate physical labels. |
| UI-02 | One target-selection context per workflow. Lists, overhead view and charts share selected IDs; display metric and outlier-ranking metric remain independent. | Selection count agrees everywhere; select-all states its scope (filtered targets vs whole site); explicit deselect-all works after runs. |
| UI-03 | Live, demo, disconnected and read-only modes visibly distinct. Show authenticated identity/access mode only when verified by backend. | Query/portal changes cannot grant permissions. Unavailable authorization is not displayed as operator access. |
| UI-04 | Keyboard-accessible navigation, visible focus, daylight contrast, text/icon labels alongside color. | Tab/Enter/Escape complete target selection and dialog review without losing focus. Critical warnings remain visible. |

## Telemetry presentation

- **UI-05:** Preserve tile identity, rows, drilldown, chart legend selection, focus and scroll while values update. Do not blank/rebuild the entire PCS one-line at each poll. Expanded corrective-action cards grow the page rather than creating an internal scrollbar.
- **UI-06:** Every displayed value has a defined unit and quality/source timestamp. `0` means a measured zero. Missing is `Unavailable`; retained data is `Stale` with age; unsupported is `Not supported`. Never replace these with a healthy green indicator. Use source-specific freshness for PCS Modbus, PCS HTTP, EMS and Feather.
- **UI-07:** Treat physical state, requested state and operating mode as separate fields. A pending contactor closure with a confirmed voltage interlock is `Waiting for voltage match`, not a fabricated closed state or suppressed real alarm. If the interlock reason is not known, say verification is pending/unknown.
- **UI-08:** Collection segments have no cell temperatures: show `Not applicable` and exclude placeholders from extrema/averages/outlier rankings. Dometic RPM is ignored only under the correct profile/verified capability; do not hide unrelated current/command mismatches.
- **UI-09:** One-line air gaps and switch symbols reflect authoritative state; unsupported switches stay unknown. Prefer number + unit + short explanatory state over decorative animation.
- **UI-10:** Balancing details separate requested charge/discharge deadbands, target cell voltage, measured active-cell voltage, balancing mode/activity and source age. If requested deadband is only command-history evidence, label it `Last requested`, not confirmed device configuration. Zero active shunts alone does not prove a rejected command.

## Shared control flow

`Select targets → set parameters → review scope/preconditions → execute → accepted/pending → independent verification`

- **UI-11:** Click-to-execute where site policy permits; do not require arbitrary typed phrases. Review shows exact site/array/string count, parameters/units and additional operations (disable ADB, change rotation, restart service). No hidden prerequisite writes.
- **UI-12:** Changing targets, parameters, profile or authority invalidates old preflight. Bulk commands report changed, already-matching/skipped, pending and failed targets separately. Skipped does not imply healthy.
- **UI-13:** Never optimistically paint equipment state. An HTTP acknowledgement is `Accepted`, not `Verified`. Timeouts are `Not verified within window` unless an actual rejection/failure is known. Show last authoritative timestamp and permit read-only recheck; never auto-resend an uncertain command.
- **UI-14:** Server-denied actions explain the required capability without implying a portal switch grants it. Pending work remains visible; cancellation distinguishes stopping a local waiter from stopping equipment. Provide transaction/reference IDs for support without exposing secrets.

## Page arrangement

- PCS: compact fleet summary, collapsed per-PCS tiles with state/freshness, stable expanded one-line and grouped electrical/thermal/diagnostic detail. Opening another tile must not reset the first or trigger unnecessary independent device polls.
- String List: one array/target context, SOC meter with numerical value, aligned electrical and contactor/rotation indicators, coherent detail section for cells/balancing/notifications/history. Keep source status close to affected values.
- Thermal: retain overhead view. Use one target workspace with collection/energy filters, independent ranking metric, per-array outliers and explicit selection scope. Chart legends toggle/isolate overlays without losing selected targets; restore-all restores prior overlays. Persistent labels include the actual retention setting and gaps.
- Overview/corrective actions: group by meaningful fault with affected-target count, not one representative array label. Drilldown gives Array/String/Segment, requested HVAC units and corresponding currents, mismatch evidence and age. Do not mix warnings, unavailable data and alarms into one unexplained count.

## Pilot test and performance record

Record release/configuration, hardware/browser, source count, source ages and a repeatable task set. Proposed budgets, **not measured results**: p95 selection feedback below 200 ms and a prepared local view below 1 second. Measure acquisition age, API delivery, processing and render independently; an artificial render delay must not conceal stale telemetry or delay command verification.

Use disconnected/stale/partial/unsupported fixtures and screenshots, keyboard tests, re-render stability checks and mocked-control tests. Assert that viewing, sorting, filtering, expanding or toggling a chart legend never invokes a command endpoint. Preserve source lineage and min/max spikes when downsampling graphs. Capture before/after usability and timing evidence before accepting a redesign.

No UI redesign, new authentication, restart or live test is authorized by this document. Next pilot implementation should be independently reviewable and reversible without changing telemetry/control semantics.
