# Background snapshot cache persistence

Validated locally on macOS, 2026-09-28. No equipment commands were issued.

## Scope and behavior

`prizm-site-snapshot` and `site-operations-summary` retain immediate in-memory
publication, but persist their serialized disk caches through one bounded
asynchronous writer. Other caches, history, audit records, and control paths
are unchanged. The JSON format, timestamps, cycle IDs, and provenance are
unchanged; persistence does not make a reading fresh.

Each job captures its absolute site-specific destination and serialized content.
The writer coalesces pending revisions of the same file and finishes an active
revision before writing a newer revision. It retains at most eight jobs and an
estimated 512 MiB of strings/write buffers. Queue saturation reports a failure
and retains the previous disk cache; it does not fall back to a competing
synchronous write. Later successful persistence of that destination clears an
older unresolved failure.

Replacement uses a unique same-directory temporary file, flush, close, and
rename. Failed replacement never deletes the previous destination. Graceful
shutdown drains acquisition first, then stops and drains cache persistence.
An unresolved persistence failure is reported by shutdown. A forced kill or
power loss can lose queued snapshots; directory metadata is not explicitly
fsynced, so this is not a power-loss durability guarantee. These are recoverable
latest-value caches, not durable history records.

The manifest continues to describe acquisition success, not disk commit.
`/api/local/debug/coordinator` exposes `cachePersistence` separately, including
queue counts, retained bytes, completions, failures, rejections, last completion,
and unresolved failures. Warnings are rate limited. In the legacy asynchronous
writer path, JSON serialization remains synchronous.

The subsequent [snapshot conversion worker](SNAPSHOT_CONVERSION_WORKER.md) is
enabled by default as of September 30. It moves JSON expansion and persistence
off-thread while retaining a bounded queue, and also handles the two large
EMS-derived string-dashboard checkpoints. `PRIZM_SNAPSHOT_WORKER=false` restores
the legacy behavior described here; the evidence below records the original
asynchronous-writer validation, not the newer worker measurements.

## Validation and parity

- `npm run lint`, full `npm test`, production frontend/server/worker builds passed.
- Focused writer/integration tests passed, including coalescing, queue limits,
  failed writes, immutable queued content, site-path isolation, shutdown drain,
  atomic-reader checks, null-clearing order, and enabled/disabled format parity.
- Live optimized runtime reported all eight PCS HTTP sources fresh and Modbus
  available with eight of eight PCS switch sets. No queue failures/rejections
  were observed during the validation window.
- Graceful optimized shutdown completed. Both saved JSON caches remained
  readable; no pending temporary files remained in the active site's directory.
- Restart with the rollback flag reported persistence disabled and continued to
  publish eight PCS rows and fresh Modbus data. Optimized mode was restored.
- Browser reloaded for read-only PCS dashboard verification.

## Local measurements

Same read-only script (`scripts/measure-local-response-latency.mjs`), 60 requests
per endpoint, with live telemetry and cooperative scheduling enabled in both
runs. These are short observations, not a performance guarantee.

| Measurement | Synchronous cache baseline | Background cache |
| --- | ---: | ---: |
| Heartbeat median | 1.98 ms | 2.98 ms |
| Heartbeat p95 | 331.11 ms | 300.06 ms |
| Heartbeat maximum | 382.18 ms | 512.55 ms |
| PCS response median | 2.13 ms | 3.21 ms |
| PCS response p95 | 331.12 ms | 300.13 ms |
| PCS response maximum | 382.23 ms | 512.83 ms |
| HTTP failures | 0 | 0 |
| Snapshot publication average | 264.70 ms | 197.30 ms |
| Snapshot generation average | 393.07 ms | 328.35 ms |

Profiler baseline used 100 retained cycles; optimized profile used 32 cycles.
Publication time decreased about 25%, but endpoint tail latency is not uniformly
better: each optimized endpoint had one response over 500 ms, versus zero in
the baseline. Serialization and other processing still block the event loop.
Do not sum nested profiler spans or equate publication improvement with whole
page render improvement.

## Rollback and platform limits

Set `PRIZM_ASYNC_SNAPSHOT_CACHE=false` in the PRIZM runtime environment and
gracefully restart while no control jobs are active. This preserves the legacy
synchronous path. The flag is fixed for the process lifetime so queued and
synchronous writes cannot race. Remove the flag or set it to `true` and restart
to restore background persistence.

Uses Node filesystem/path APIs rather than platform-specific shell commands.
macOS live validation is complete; Windows and Linux runtime validation is
still required, especially Windows file-sharing/rename behavior. Failed rename
remains visible and retains the old destination rather than deleting it.

Local evidence: `/tmp/prizm-cache-before.json`, `/tmp/prizm-cache-after.json`,
`/tmp/prizm-async-cache-tests.log`, `/tmp/prizm-async-cache-build.log`,
`/tmp/prizm-async-cache-runtime.log`, `/tmp/prizm-async-cache-rollback.log`,
and `/tmp/prizm-async-cache-final.log`. Temporary evidence is not committed.
