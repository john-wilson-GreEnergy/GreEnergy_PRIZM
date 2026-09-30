# Local render profiling and stability check

Architecture: opt-in production React profiling build (`PRIZM_REACT_PROFILE=true`)
and browser query `renderProfile=1`. Explicit boundaries measure Overview, PCS,
String List/detail, and Thermal renders. Profiler actualDuration measures React
render CPU, not acquisition, JSON parsing, layout or paint. A separate read-only
meter outside those boundaries displays aggregate samples only when requested.
Bound each boundary to 2,000 samples; no persistence, telemetry payload capture,
network reporting, new polling, or equipment writes. Reset clears measurements
only. The normal production build has instrumentation disabled regardless of query.

Rollback: rebuild without PRIZM_REACT_PROFILE (default) and reload; retain the
previous dist before local installation. Profiling adds overhead, so observations
are diagnostic, not an SLA or a normal-build benchmark. Validate unit tests, normal
and profiling builds, graceful local restart, actual browser render samples and a
five-minute bounded cached-health check. Restore the normal build afterward.

## Browser observations — 2026-09-25

Local production-profiling build, live EMS data, existing browser viewport.
These are diagnostic samples, not a controlled comparison with Dell hardware.

| Boundary / scenario | Updates | Median ms | p95 ms | Maximum ms |
| --- | ---: | ---: | ---: | ---: |
| Overview, including HVAC group opened | 70 | 1.6 | 3.6 | 4.4 |
| PCS, Array 1 one-line expanded | 49 | 0.5 | 1.2 | 2.0 |
| Full 320-string list, before opening details | 75 | 5.7 | 19.7 | 28.3 |
| String list plus Array 1 / String 2 details | 173 | 2.6 | 16.8 | 28.3 |
| Thermal, eight retained-history traces and readings table | 537 | 2.2 | 3.9 | 7.9 |

No recorded React update exceeded 50 ms. String rows are the heaviest measured
render boundary. Thermal displayed 1,223 summarized samples over the requested
seven-day window (actual available history started September 21). Isolating one
trace and restoring overlays worked. The original one-target/live-buffer
selection was restored. Collection-segment targets were tested with enclosure
temperature, not placeholder cell temperatures.

The meter was reset before thermal target selection, so thermal mount time is
not available. Initial lazy component work can appear as an update rather than
the boundary's mount. Percentiles use nearest-rank samples (the median uses the
upper middle sample for even counts). Timing excludes work outside each boundary,
browser layout/paint, transfer, and JSON parsing; low React times do not establish
low end-to-end latency. Profiling overhead and interactions are included.

Inference: prioritize reducing redundant string transformations/row work and
large client payload processing next; delaying every page's rendering is not
justified by these measurements. Measure layout/paint separately before claiming
the browser's entire frame budget is healthy.

## Bounded stability run

31 cached-health observations from 17:24:10 to 17:29:21 UTC (311 seconds),
spanning the four browser scenarios. 76 cycles completed during this interval;
all reported successful. Cycle duration median 3,783 ms, p95 5,162 ms, maximum
6,500 ms. Maximum observed concurrency 1; sampled refresh queue depth 0.
All health requests returned successfully. This validates the observed interval,
not overnight reliability or every individual device's freshness.

Thermal recording stayed enabled with seven-day retention and 336 units. Saved
time advanced; sampled write queue stayed zero; pause reason stayed null.
The pre-existing lifetime dropped-sample counter remained 336 (zero new drops).
Evidence: `/tmp/prizm-render-stability-20260925.jsonl` (local diagnostic file).

Normal build: `/tmp/prizm-render-normal.T4t8eh`.
Profiling build: `/tmp/prizm-render-profile.Ul4iEN`.
Pre-test rollback: `/tmp/prizm-render-rollback-AfE34s/dist`.
No equipment controls or Dell deployment changes were made.

Normal-build restoration verified after graceful local restart: successful
coordinator cycle, eight PCS rows, and no Render measurements element even with
`renderProfile=1` still in the URL. Returned the browser to the overview without
the profiling query. Normal server log: `/tmp/prizm-render-normal-20260925.log`.
Focused render, view-quality, encoding tests and TypeScript validation passed;
both normal and profiling production builds passed (existing large-chunk warning).
