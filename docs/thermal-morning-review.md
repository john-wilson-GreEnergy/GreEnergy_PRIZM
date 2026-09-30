# Thermal morning review — first operational-insights slice

## Scope and architecture

This is a read-only historical thermal analysis, not a site-wide safety report or
an automated control system. Existing canonical Feather observations feed the
whole-site recorder. An explicitly requested background job reads raw hourly
shards, streams one unit at a time through a server-side accumulator, and publishes
a bounded report through the existing thermal view. Chart-decimated points are
never used for performance calculations. No new controller requests or frontend
polling timer are introduced. Opening the page alone does not scan history.

The overhead map and target selection remain intact. The review covers the union
of currently mapped and retained recorded thermal devices, regardless of selected
graph targets. One report window is 12 or 24 hours, ending at request time. It is
not calendar-night based. A recent same-window report is reused for five minutes.
The job remains active across page navigation, but reports are memory-only and
must be rebuilt after a server restart. Cancel stops analysis, never recording.

## Evidence and interpretation

- Coverage measures intervals bracketed by live samples at most 120 seconds apart.
  Leading/trailing unverified time and gaps are not extrapolated. The longest
  unverified interval includes boundaries. This is telemetry coverage, not uptime.
- Commanded compressor time uses the previous known command over a covered interval
  whose two endpoints both report compressor state. Actual mechanical runtime and
  intermediate transitions are not observable from command bits alone.
- Starts require a contiguous observed off-to-on transition. Short-cycle candidates
  require a complete observed on/off cycle shorter than 3 minutes. First-observed
  running cycles and cycles crossing gaps are not counted. The threshold is a
  review heuristic, not a manufacturer limit or an operational alarm.
- Weak cooling uses the existing 2.8°C supply/space difference boundary, after
  three observed minutes in cooling mode. The candidate count requires 10 minutes
  of assessed weak response. Temperatures are shared per segment; the result does
  not prove which of two simultaneously operating HVAC units is responsible.
- Fault appearances/clears require consecutive live, explicitly recorded fault
  lists. Initial or post-gap fault observations are retained but not asserted to
  be newly appearing or clearing. Counts are fault-message transitions, not
  distinct equipment incidents. At most 64 distinct messages are retained per unit.
- Cell temperatures for collection segments are always excluded, including old
  placeholder readings. Unknown or unsupported values stay unknown, not zero.
- The recorder dropped-sample counter is lifetime-scoped and is not attributed to
  the review window. Low coverage is flagged below 95%; it is not an equipment alarm.

## Resource limits and safety

One analysis job per process, maximum 2048 targets / 24 hours, streaming memory,
one file reader, yielding every 500 observations and between devices. It runs
outside the write queue. Jobs can take minutes for a full site; progress is visible
and cancellation is available. Existing files are not modified by the analysis.
The report is fixed to a site identity; site changes invalidate reports and jobs.
Storage failures fail the report rather than declaring partial analysis complete.
Do not infer fault-free/healthy operation from no findings where coverage is poor.

Routes: GET/POST `/api/local/site-data/thermal/morning-review`, POST
`/api/local/site-data/thermal/morning-review/cancel`. POST starts local analysis only.

## Rollback and validation

Set `PRIZM_THERMAL_REVIEW_ENABLED=false` and restart to hide the panel and reject
analysis. Existing recording, selection, graphs and equipment controls are unchanged.

Focused checks:

```
node --import tsx src/server/thermal/thermalMorningReview.test.ts
node --import tsx src/components/ThermalMorningReview.test.tsx
node --import tsx src/server/thermal/thermalMorningReviewRoutes.test.ts
node --import tsx src/server/thermal/siteHistory.test.ts
node --import tsx src/server/thermal/thermalService.test.ts
npm run build
```

Fixtures check exact raw-observation parity for time, cycles and fault transitions,
missing/legacy/stale/duplicate data, collection exclusion, recorder bytes unchanged,
job sharing/caching/cancellation, site identity changes and the rollback flag.

Local validation (2026-09-23): focused analyzer/API/rendering tests and existing
retention/service/collection/selection regressions passed; production build passed.
The browser completed a 336-unit review, expanded its findings, and opened a
single unit's amperage history at the report window without changing the map
metric. Independent raw-file interval calculations matched the first two report
rows. Recording stayed enabled with seven-day retention, advancing saved times,
and no increase in the lifetime dropped-sample counter during review. The local
overnight window had only about 3% coverage: these findings must not be presented
as a complete overnight site assessment. Dell deployment was not changed.

Repository-wide type checking remains blocked by existing errors, including the
unchanged ThermalSavedViews `key` prop typing in ThermalWorkspace; no errors were
reported for the new analyzer, reader integration, routes or review component.

## Following phases — not implemented here

Unified cross-system history and incident replay; PCS condition trends;
balancing-effectiveness history; array limitation explanations; string current
sharing; electrical energy/performance analysis. Thermal review does not establish
electrical health, usable battery capacity, or compliance. Automatic scheduled
reports and durable report archives are separate future additions.
