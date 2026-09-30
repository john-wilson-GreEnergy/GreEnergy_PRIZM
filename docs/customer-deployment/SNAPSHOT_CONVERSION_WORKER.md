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
- Enable at process startup with `PRIZM_SNAPSHOT_WORKER=true`. The flag remains
  opt-in; without it, the previous main-thread JSON conversion stays active.
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
keep the opt-in gate until those deployment environments are validated.
