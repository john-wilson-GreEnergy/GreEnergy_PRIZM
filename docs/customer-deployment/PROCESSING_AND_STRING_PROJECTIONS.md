# Processing and String List projection optimization

## Architecture before implementation — September 30, 2026

The merged repository already separates compact String List GET/SSE payloads
from full single-string details. Preserve those contracts, including every alarm,
freshness field, balance indicator and detail fallback. Do not add another poller.

Measured lastCall parsing is about 13 ms for a 12 MB report. The larger reported
normalization span includes several operations, not a single CPU-bound parser.
Inspection found repeated recursive freezing of already-owned, deeply frozen
StringViewer payloads on every cache read. Remove that redundant traversal while
recomputing age and stale status on every read. Keep full deep freezing at
ingestion; a rollback flag restores the old traversal.

The compact GET currently copies the full broker fleet, copies it again with
metadata, then strips diagnostic fields. Project each broker row before copying
it instead. Projection callbacks are internal pure functions; public returns
remain defensive copies. Full detail and legacy fleet reads remain unchanged.

Site Operations also searches the same source tree several times for different
array signatures. Batch these searches into one traversal per source while
preserving each query's original order, duplicates and branch-pruning behavior.
Keep the previous independent traversal path behind a rollback flag.

These changes remove unnecessary main-thread work before adding another worker
and its payload-transfer overhead. They do not replace upstream EMS acquisition
or claim all normalization is moved off-thread. No source cadence, command,
alarm, notification or telemetry authority changes are permitted.

## Validation gate

Require focused parity/immutability/freshness tests, full tests, typecheck, build,
idle restart, live read-only checks, browser String List and detail checks, and
runtime rollback checks. Compare the same response-time sampler before/after;
retain worst-case results as well as typical response times. Longer endurance
measurement should be bounded and read-only. Windows/Linux execution must not
be claimed from macOS-only validation.

## Validation results — September 30, 2026

- `npm run test:processing`, the complete `npm test` chain, `npm run lint`,
  `npm run build`, and `git diff --check` passed.
- A captured 320-string fixture produced deeply equal compact results with both
  implementations. Median preparation time over 20 iterations was 49.36 ms with
  the legacy full-copy path and 11.23 ms with projection before copying. This is
  an offline CPU comparison, not a device acquisition or browser render time.
- The compact transport already existed. This change does not claim a new wire
  payload reduction. Full string details remain available on demand.
- Equal 60-sample localhost checks of the published PCS snapshot and PCS views
  had no failed requests. Snapshot median/p95/max changed from 3.79/277.61/609.66
  ms to 2.12/203.68/308.64 ms. The PCS view was nearly identical. These are short
  sequential windows against changing live telemetry, not a controlled load test.
- The extended check completed 120 requests per endpoint (360 total), with zero
  failures. Snapshot median/p95/max was 1.99/375.53/694.52 ms; PCS was
  2.19/375.52/694.48 ms; compact Strings was 31.34/905.21/1370.06 ms. There were
  respectively 4, 4 and 31 responses over 500 ms. This heavier check included
  String List reads and overlapping browser/diagnostic activity, so it is not
  the same workload as the two-endpoint baseline. It confirms reliability over
  the bounded window but also demonstrates remaining list-response spikes.
- After 61 optimized cycles, normalization median/p95 was 283.38/322.90 ms;
  the earlier 100-cycle baseline was approximately 440.7/525.5 ms. Different
  windows and payloads limit attribution. Remaining publication and enrichment
  work still causes pauses; this is not a claim that all latency is eliminated.
- Browser verification: 320 strings loaded; Array 1 filtering returned 40 rows;
  Array 1 / String 2 opened with cell maps, 14 balancing rows, active-cell
  voltages for charging rows, deadbands and notifications. Return navigation and
  live updates worked. A detail-header BPC count of zero despite populated BPC
  rows was observed and remains a separate presentation follow-up.
- Read-only diagnostics after restart reported all 320 strings eligible, no
  stale/ambiguous/unavailable recovery rows, and no cache write failures or
  rejections. No equipment commands were sent.
- Both rollback and optimized builds were started from idle and checked live.
  The optimized runtime remains running locally. No commit/push was performed.

## Rollback and portability

Set any of these environment variables to `false` before restarting PRIZM to
restore that individual legacy processing path:

```text
PRIZM_STRINGVIEWER_CACHE_REUSE=false
PRIZM_COMPACT_STRING_PROJECTION=false
PRIZM_BATCHED_ARRAY_SEARCH=false
```

All three were exercised together in the local rollback check with 320 fresh,
eligible strings, then removed for the optimized restart. Effective settings
appear under `processingOptimizations` in `/api/local/debug/coordinator`.
Stop/restart only while no control or maintenance job is active.

These changes use existing TypeScript/Node facilities, with no new platform
shell command or dependency in application execution. Runtime verification was
on macOS only; Windows and Linux still require their own release checks.

The read-only comparison tool accepts a bounded extended run:

```sh
node scripts/measure-local-response-latency.mjs --samples=120 --interval-ms=1000 --include-strings
```

It reads already-published views; it does not force device refreshes. Invalid
sample counts are rejected before requests. Long-term endurance and memory
growth validation remain separate release gates.
