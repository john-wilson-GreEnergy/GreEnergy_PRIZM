# Snapshot conversion worker — local pilot

Validated on macOS on 2026-09-28. Equipment commands, acquisition cadence,
telemetry authority, frontend models, and history/audit recording are unchanged.

## Architecture and rollout

This extends the [bounded background cache writer](ASYNC_SNAPSHOT_CACHE.md).
The two canonical snapshot cache keys can capture their graph with Node's V8
serializer on the main thread, transfer the owned binary buffer to one worker,
then deserialize, JSON-encode, and atomically replace the cache file in that
worker. Repeated references remain shared until JSON encoding. No binary data
is stored in the cache, sent to browsers, or sent to controllers.

The capture is synchronous so subsequent mutation of live objects cannot change
an already queued save. It also pins the site-specific destination and timestamps
before yielding. Queue ordering, latest-pending coalescing, null clears, and
draining on shutdown are preserved. The queue estimate charges three times the
binary size; this is not a total-process memory bound. One worker has a 512 MiB
old-generation heap limit and a 25-second job deadline. Failures are reported via
existing persistence diagnostics; there is no competing synchronous fallback.

Worker termination can leave its uniquely named temporary file behind. The
destination is never deleted to recover from an error. As with the existing
writer, sudden process/power loss is not guaranteed to retain the newest queued
snapshot. Unchanged history/audit paths are separate from these latest-value
caches.

The transport is intentionally limited to PRIZM's canonical, JSON-derived
records/arrays/primitives (Date round trips are tested). It is not a generic
serializer for arbitrary class instances or custom `toJSON` methods. New
snapshot producers must retain this contract and pass the parity gate below.

## Enable, validate, and roll back

- Build normally: `npm run build` also builds `dist/snapshot-cache-worker.cjs`.
- Enabled by default at process startup; no launcher-specific environment flag
  is required. `PRIZM_SNAPSHOT_WORKER=false` restores main-thread conversion.
- For a short parity audit, additionally set
  `PRIZM_SNAPSHOT_WORKER_VERIFY=true`. Each save computes SHA-256 of the original
  JSON on the main thread and compares it with the worker output before writing.
  A mismatch fails persistence and retains the previous disk cache. This audit
  mode deliberately adds CPU cost and is not the performance measurement mode.
- Disable the verification flag after parity passes and restart while idle.
- Roll back with `PRIZM_SNAPSHOT_WORKER=false` and a graceful idle restart.
  `PRIZM_ASYNC_SNAPSHOT_CACHE=false` also disables worker use and restores the
  previous fully synchronous persistence path. Existing JSON needs no migration.

`cachePersistence` in the coordinator diagnostics adds `workerEnabled` and worker
activity/completion/encoding-duration counters. Existing queue failure/rejection
counts still cover the complete capture-to-persistence path. A missing worker
build is a visible persistence failure; live telemetry remains available.

## Evidence

- Full `npm test`, `npm run lint`, production frontend/server/worker builds passed.
- Expanded focused tests passed after the full suite: real cache integration
  exercises worker on/off and asynchronous persistence on/off, with both normal
  snapshots and null clears. Worker tests cover exact compact/pretty JSON,
  Unicode, missing/non-finite values, timestamps, shared references, frozen
  capture, transferable ownership, site isolation, coalescing, corrupt input,
  parity mismatch, missing worker, timeout, recovery, and shutdown.
- Live parity mode completed at least 18 exact-byte-checked saves with zero
  failures/rejections. Both full-site and operations-summary caches were covered.
- Normal worker mode retained eight PCS rows, eight fresh SMA HTTP sources, and
  fresh EMS Modbus. No equipment control was sent.
- Graceful worker shutdown completed and the previous conversion mode was
  restored for rollback testing. Optimized mode was restored for local testing.
- Browser reload and Array 5 PCS drill-down showed live Modbus, SMA HTTP status,
  populated readings, and normal connection/polling indicators. Screenshot:
  `/tmp/prizm-snapshot-worker-pcs.png`.

## Measured effect

Same 60-request-per-endpoint read-only sampler, cooperative scheduling and
background disk writes enabled in both runs:

| Local measurement | Before | Worker enabled |
| --- | ---: | ---: |
| PCS response median | 1.94 ms | 2.36 ms |
| PCS response p95 | 336.76 ms | 177.89 ms |
| PCS response maximum | 529.86 ms | 208.17 ms |
| Heartbeat p95 | 363.00 ms | 177.84 ms |
| Heartbeat maximum | 627.17 ms | 208.07 ms |
| HTTP failures | 0 | 0 |
| Responses over 500 ms (PCS / heartbeat) | 1 / 2 | 0 / 0 |
| Snapshot publication average | 172.43 ms | 108.93 ms |

Publication profiling used 100 baseline cycles versus 11 worker cycles, so this
is an observation rather than a controlled long-duration guarantee. Main-thread
binary capture averaged 20.46 ms (maximum 35.03 ms) across 22 captures. Worker
conversion and writes still take time; the improvement is removing that work
from the request-serving thread, not making acquisition instantaneous. Other
parsing/normalization pauses remain.

Local evidence files are `/tmp/prizm-serialization-before.json`,
`/tmp/prizm-serialization-after.json`, `/tmp/prizm-snapshot-worker-tests.log`,
`/tmp/prizm-snapshot-worker-build.log`, and
`/tmp/prizm-snapshot-worker-{true-true,true-false,false-false}.log`.
Source/build rollback copies are in `/tmp/prizm-before-snapshot-worker-cqMe7b`.
These temporary files are not committed.

Node APIs are portable and no new dependencies or platform-specific runtime
scripts were added. Windows and Linux runtime verification remains outstanding;
their runtime validation must not be inferred from the macOS results. Explicit
rollback switches remain available on all three operating systems.
## September 30 optimization plan

Promote the already parity-tested snapshot worker to default-on, with explicit
`PRIZM_SNAPSHOT_WORKER=false` rollback. Extend its bounded, coalescing persistence
queue to the two large EMS-derived string-dashboard checkpoints behind
`PRIZM_EMS_DERIVED_CACHE_WORKER=false` rollback. Memory publication, source
timestamps, raw EMS diagnostics, acquisition cadence and alarm/control paths stay
unchanged. This reduces main-thread processing of large EMS-derived data; it does
not reduce the upstream lastCall payload or enable the failed primary-reader
experiment.

Separately extract Feather table rows and memoize their displayed telemetry,
filtering, sorting and totals. Keep fresh timestamps/ping visible and use the
latest device record when opening details. The `featherRendering=legacy` query
switch retains the unmemoized rendering path for parity/rollback checks.

Require fixture/schema parity, error/clear/drain tests, type checking, production
build, idle local restart, live diagnostics and browser checks before promotion.

### September 30 implementation and validation

All three changes above are implemented locally. `cachePersistence` now also
reports `emsDerivedWorkerEnabled`. The derived keys are
`string_dashboard_enriched_ALL` and `string_dashboard_base_ALL`; raw diagnostic
files and the disabled primary EMS reader are unchanged.

- Full `npm test`, `npm run lint`, and production build passed. Added Feather
  tests are included in `posttest` through `test:feather-table`.
- Cache integration tests cover unset/default flags, worker rollback, derived-only
  rollback, synchronous rollback, immutable captures, alarm codes 2003/2008,
  zero values, timestamps, TTL, stale status, and null clears.
- Live parity mode completed 74 byte-checked writes with zero failed or rejected
  saves. Normal optimized mode subsequently completed 92 writes with no failures,
  rejections, or unresolved failures at the recorded check.
- A graceful restart with `PRIZM_SNAPSHOT_WORKER=false` reported both worker
  paths disabled, zero worker writes, and successful legacy persistence. The
  default optimized runtime was then restored without parity-audit overhead.
- Both rollback and optimized checks reported 320/320 eligible fresh string
  recovery records, with zero stale, ambiguous, or unavailable records.
- Browser checks passed for the 168-device table, Array 3 filtering, IP search,
  and opening current details for 10.0.3.15. The legacy query switch also loaded
  all 168 devices. The optimized view was restored. A pre-existing detail issue
  remains: the Feather-only projection reports no paired string records despite
  showing expected string labels; that data-path issue is outside this rendering
  change.
- Rendering fixtures retain exact optimized/legacy markup parity and verify
  field-by-field invalidation. One changed device in a 168-device fixture
  invalidates one row. Timestamp/ping changes remain visible without rebuilding
  unchanged HVAC and sensor sections. Detail opening resolves the latest device
  object rather than a memoized stale record.

Same read-only sampler, 60 requests per endpoint, before versus optimized:

| Endpoint | Median before / after | p95 before / after | Maximum before / after |
| --- | ---: | ---: | ---: |
| PCS snapshot | 13.36 / 2.62 ms | 393.49 / 254.32 ms | 574.42 / 680.82 ms |
| PCS data | 9.03 / 2.50 ms | 393.99 / 254.44 ms | 574.29 / 680.89 ms |

Both runs had zero HTTP failures and one response over 500 ms per endpoint.
These short live samples show lower typical and p95 response times, but the
worst outlier increased; they do not establish that all polling stalls are
resolved. Upstream lastCall acquisition and normalization remain significant
work. No reduction in EMS wire payload or acquisition cadence is claimed.

Local evidence: `/tmp/prizm-three-before.json`, `/tmp/prizm-three-after.json`,
`/tmp/prizm-three-tests.log`, `/tmp/prizm-three-build.log`, and
`/tmp/prizm-feather-optimized.png`. Previous build backup:
`/tmp/prizm-three-rollback-oJDEx0/dist`. These temporary artifacts are not
committed. macOS runtime validation only; Linux and Windows runtime validation
is still outstanding. No equipment control commands were sent.
