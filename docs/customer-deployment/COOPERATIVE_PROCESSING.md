# Cooperative telemetry processing — 2026-09-28

## Scope

The coordinator keeps its single-flight collection lock but yields to the Node
event loop between site normalization, cache persistence, HVAC normalization,
safety normalization and string normalization. A resolved Promise alone does
not let ready sockets/timers run; these checkpoints use Node's `setImmediate`.

There is no new device poller, broker process, delayed-render buffer, command or
changed acquisition interval. Canonical calculations, source authority, freshness,
fault handling, history retention and response schemas are unchanged. The final
snapshot assembly, validation and publication remain uninterrupted: no checkpoint
is inserted while updating the snapshot and its dependent domain brokers.
Readers continue to receive a complete published revision during processing.

Each checkpoint verifies the active site/cache identity and snapshot-clear
generation. An invalidated draft aborts rather than continuing after a clear or
site change at a new yield boundary. These checks also remain enabled in rollback
mode. This is not a replacement for provider-level site/epoch isolation.

The existing bounded coordinator profiler now separates Snapshot Assembly,
Snapshot Publication, Cache Serialization, Cache File Write and Cache Manifest.
These are elapsed spans, not exclusive CPU measurements; nested phases must not
be added together. No raw device payloads are added to diagnostics.

## PCS startup correction

The restart validation exposed an existing out-of-order completion bug. Assigning
an arriving PCS result at an array position could leave holes; copying that array
turned holes into explicit undefined entries, causing background projection to
throw when reading `smaProcessData`. PCS switch results now merge by `arrayIndex`
into a dense immutable array. Until a unit replies, its reading remains absent
(unknown in consumers), not fabricated. Source timestamps and quality are kept.

## Measurements and reproduction

Run on a warmed local PRIZM instance:

```sh
node scripts/measure-local-response-latency.mjs > /tmp/prizm-response-latency.json
```

This reads the existing PCS-view heartbeat and PCS JSON endpoints concurrently,
60 times each, with 350 ms between batches and a 10-second request timeout.
It records time to headers, full response time, bytes and HTTP status, not device
payloads. It makes no explicit refresh or control requests. Simultaneous sampling
is important: reading the PCS endpoint only after a blocked heartbeat would hide
the shared event-loop stall.

Local macOS samples on September 28 (milliseconds, rounded):

| Mode | Endpoint | Median | p95 | Maximum | Responses >500 ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Original running build | Heartbeat | 3 | 1385 | 1577 | 8/60 |
| Original running build | PCS | 3 | 1385 | 1577 | 8/60 |
| Checkpoints enabled, first sample | Heartbeat | 15 | 310 | 335 | 0/60 |
| Checkpoints enabled, first sample | PCS | 15 | 310 | 335 | 0/60 |
| Checkpoints disabled, rollback flag | Heartbeat | 2 | 1338 | 1588 | 7/60 |
| Checkpoints disabled, rollback flag | PCS | 2 | 1338 | 1588 | 7/60 |
| Final build, startup recovery | Heartbeat | 3 | 345 | 436 | 0/60 |
| Final build, startup recovery | PCS | 3 | 345 | 418 | 0/60 |
| Final build, fully populated | Heartbeat | 14 | 198 | 367 | 0/60 |
| Final build, fully populated | PCS | 14 | 198 | 367 | 0/60 |

All responses in these samples returned HTTP 200. Heartbeats were about 13 KB;
PCS payloads ranged from about 42–103 KB during startup across the enabled runs.
The fully populated final sample ranged from 102,527 to 102,600 bytes; it began
after verifying all eight PCS HTTP sources, 29 extended point entries per PCS,
eight fresh switch/status readings, fresh EMS Modbus and a LIVE heartbeat. Point
entry presence is not a claim that every individual point is valid; per-point
quality remains authoritative. The startup samples are not steady-state
throughput claims.
These measurements show reduced tail latency, not uniformly faster requests:
the initial enabled median increased. They are short live samples, not a soak
test, Windows/Linux benchmark or guarantee of end-to-end browser frame latency.

Raw local timing artifacts are `/tmp/prizm-latency-before.json`,
`/tmp/prizm-latency-after.json`, `/tmp/prizm-latency-rollback.json`,
`/tmp/prizm-latency-final.json` and `/tmp/prizm-latency-steady.json`.
The new PCS startup projection exception did not recur in the final restart log.
The final server is running with checkpoints enabled. No commit or push was made.

The first twelve instrumented cycles showed mean Snapshot Publication around
239 ms, Site Operations 183 ms, String Normalization 147 ms and Snapshot Assembly
36 ms. Individual cache serialization and writes reached roughly 93 and 87 ms.
Snapshot Generation as a whole still averaged 370 ms. The next optimization is
the publication/persistence path, with bounded queues, atomic writes and shutdown
draining if disk work is moved out of the main thread. Do not reduce source
coverage, drop alarms or relabel stale data as live to improve timing numbers.

## Validation

- `npm run test:cooperative`: real event-loop fairness, disabled-mode data parity,
  context invalidation and a coordinator fixture showing refresh coalescing,
  producing-cycle context retention and no partial publication.
- `npm run posttest`: the above plus PCS value/freshness checks and reversed
  completion order, sparse recovery, replacement and immutable revision tests.
- Existing full regression suite, cache serialization/schema parity,
  summary-selection parity and operational Modbus tests.
- TypeScript checking, production Vite build, bundled server and history worker.
- Local idle-runtime restarts, live read-only API checks and browser PCS
  rendering/drill-down verification. No equipment control was sent.

Uses portable Node/TypeScript APIs; no shell dependency in runtime changes.
Actual runtime execution here was macOS only, not Windows or Linux.

## Rollback

Set `PRIZM_COOPERATIVE_PROCESSING=false` in the server launch environment and
restart the idle PRIZM process. The live rollback comparison above verified the
flag; normal operation is restored with the variable unset or `true`. Diagnostics
report the effective value as `cooperativeProcessing` at the existing coordinator
debug endpoint. The dense PCS merge and added diagnostics remain under this flag.

For complete binary rollback, the previous `server.cjs` and source map are saved
in `/tmp/prizm-before-cooperative-mYIApU`. Restore those two files into `dist` and
restart only after verifying no control/update job is active. The frontend and
history-worker files were not replaced. This temporary local backup is not a
durable release archive. Source backups preserve all pre-existing local changes.
