# String row rendering — architecture and validation

Keep telemetry providers, broker, authority, transport, cadence and payload fields
unchanged. At the existing UI adapter, preserve merged row identity when its fast
row, snapshot enrichment and command overlay inputs are unchanged. Bound the cache
to the current rows, dropping removed targets. Never compare only cycle IDs or
omit timestamps, warnings, source health or command observations from equality.

Extract the existing table row presentation into a memoized component. Pass stable
selection callbacks and primitive selection state; only first rows receive array
selection IDs. Compute time-dependent communication state in the parent on its
existing updates so memoization cannot freeze the delayed/lost indicator. No new
timer, device acquisition, retained-history changes or equipment commands.

Rollback query: `stringRowReuse=off` disables row projection reuse and row memo
reuse while retaining identical presentation. Tests must cover enrichment/overlay
parity, removal, changed nested inputs, selection, stale threshold transitions and
row markup. Validate production build, local restart and browser behavior before
claiming improvement. Full decoded payload remains unchanged; this step targets
repeated client preparation and row rendering, not payload size or all browser CPU.

## Implementation and offline evidence — 2026-09-25

`prepareStringRows` retains the original merge exactly, including balancing
enrichment and temporary post-command overlays. `RowProjectionCache` uses input
object identity, never a subset of telemetry fields. New immutable publications
invalidate affected rows. `StringListRow` uses React's default shallow prop
comparison; there is no custom comparator that can hide changed callbacks or data.
Selection callbacks use functional state updates; row clicks retain the full row.

Focused tests cover changed timestamps, stale flags, warnings, nested provenance,
balancing details, rotation, zero/null readings, overlay removal, cache removal,
age thresholds, full-row click payload and independent selection callbacks.

Against the prior implementation extracted before editing, the captured 320-row
dataset produced byte-identical server-rendered markup for no selection, one
selected string, and a selected array. Full merged objects matched with a command
overlay present. One changed fast row invalidated exactly one merged row.
Temporary comparison harness: `/tmp/prizm-string-row-parity.tsx`.
60-iteration unchanged-input preparation benchmark: prior median 11.42 ms / p95
12.23 ms; cached median 0.131 ms / p95 0.158 ms. This is only warm repeated
preparation, not new-publication processing or whole-page latency.

Production profiling build `/tmp/prizm-string-rows-profile.fI0axB`; normal build
`/tmp/prizm-string-rows-normal.4izitY`; prior build backed up at
`/tmp/prizm-string-rows-rollback-BGy9fD/dist`.

## Live browser validation

Same local profiling build, sequential live observations (not a controlled SLA):

| Mode | React updates | Median ms | p95 ms | Maximum ms |
| --- | ---: | ---: | ---: | ---: |
| Reuse enabled, including selection tests | 175 | 0.6 | 16.6 | 26.9 |
| Rollback `stringRowReuse=off` | 121 | 6.4 | 17.1 | 27.7 |

Neither sample contained an update over 50 ms. Typical updates improved markedly;
the tail changed little because fresh multi-row telemetry still requires work.
Profiler CPU excludes network, JSON parsing, layout and paint. No claim is made
that full payload ingestion is faster or that these timings apply to the Dell.

Verified 320 rows in both modes. Select all -> 320, clear -> 0, Array 1 -> 40,
deselect its first string -> 39 and an indeterminate array checkbox, clear -> 0.
No control button was executed. Seven read-only coordinator samples over a minute
reported HTTP 200, successful completed cycles, max concurrency 1 and queue 0.
Thermal storage: enabled, seven-day retention, 336 units, queue 0, no pause;
existing lifetime drop count stayed 336. Normal production mode restored afterward.

Focused new tests, snapshot-quality and lossless-transport regression tests,
TypeScript, both production builds and diff whitespace checks passed. The existing
large bundle warning remains. No commit, push or Dell deployment performed.

After normal-build restart, live verification returned 320 strings and eight PCS
rows, successful collection cycles, and resumed 336-unit thermal recording.
Array 1 / String 2 opened with current electrical readings, all 14 BPC balancing
rows and commanded 5/5 mV deadbands. Returned to the string list with zero targets
selected and no profiling overlay. Local log:
`/tmp/prizm-string-rows-normal-20260925.log`.
