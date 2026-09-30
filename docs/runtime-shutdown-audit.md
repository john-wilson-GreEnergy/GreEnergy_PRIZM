# Runtime shutdown and release checks

## Changes

SIGTERM/SIGINT now initiate one bounded shutdown: reject new HTTP requests, stop scheduled work, drain the coordinator and existing requests (up to 15 seconds), close permanent event streams, flush thermal/session/timeline writes, and release owned writer locks. The process exits within a 30-second hard deadline; unresolved locks remain available for existing crash recovery. Repeated signals do not start another close operation. Late recorder ingests are rejected or ignored, preventing a completed shutdown from reopening history files.

Shutdown stops fan refresh intervals and lightbar background work without issuing equipment commands. It does not promise cancellation of commands already accepted by equipment. Operators should coordinate application restarts with active operations.

Rollback: set `PRIZM_GRACEFUL_SHUTDOWN=false` before launch to retain Node's default termination behavior. Recording durability during abrupt termination is not guaranteed; this is a troubleshooting fallback, not the recommended deployment setting.

The type-check audit added missing React definitions and corrected stale UI/server contracts. The array-command selection check no longer assumes 40 strings: whole-array optimization requires an exact complete selection under the supported configured topology; unknown topology retains individual targets.

## Automated checks

- Shutdown fixture covers TERM, INT, repeated signals, request draining, SSE closure, the 503 gate, queued-history persistence and resume, rejection of late ingests, stop/drain/close failures, deadline exit, and rollback/crash recovery.
- Array-selection fixtures cover missing topology, partial selection, duplicates, invalid ranges, and different configured string counts.
- Type checking and production build passed locally. Thermal/history and observation-parity regression checks passed.
- A stale graph-identity fixture was corrected to the established `Array 1 / String 1` display label; identity keys remain unchanged.

## Test-safety incident and correction

On 2026-09-23 at 22:22:02 UTC, the existing balancer unit test's case 17 dispatched before its fetch mock was installed. With LAN connectivity, this started EMS charge-balancer test ID 1 on Array 1. The operator was informed and explicitly requested leaving that test running. No stop command was sent.

The balancing test now installs the mock before dispatch and loads application modules after switching to an isolated temporary storage directory. The normal `npm test`/`pretest` commands preload `scripts/test-network-guard.cjs`. Unmocked Node fetch, HTTP(S), TCP, TLS, HTTP/2, and UDP requests are blocked and cause a nonzero exit even if the application catches the exception. Local Unix-domain compiler IPC is permitted. The balancer test also imports the guard directly, protecting direct execution.

This guard is a unit-test safeguard, not an operating-system security sandbox: explicit mocks can replace networking functions, and external programs launched by custom tests require separate review. Live verification remains a separately authorized activity. `verify_bundle.js` starts a real runtime and is not an isolated unit test; it must not be treated as safe offline validation.

## Local restart validation — 2026-09-23

The operator authorized the local restart. The old runtime (PID 16477) ignored SIGTERM and required a targeted SIGKILL after the thermal write queue drained. The replacement build (PID 18812) then passed a real SIGTERM shutdown: exit code 0 in approximately 3.15 seconds, port released, both history writer locks removed, and the log confirmed recordings flushed and locks released. The final runtime (PID 18856) owns port 3000 and both reacquired writer locks.

Read-only checks at 22:31:57 and 22:32:05 UTC showed 23/23 healthy sources, advancing timestamps for all 320 strings and all eight PCS reports and SMA switch feeds. The browser returned to Connection Live / Polling Active. Thermal recording resumed for 336 units with seven-day retention, zero queued batches, no pause reason, and an advancing saved timestamp. Its cumulative dropped-sample count stayed at the pre-restart 336. One completed historical shard was checked before and after restart and retained SHA-256 `f8bcc0efcbb3dcbcc6d98a567a3aef5e14a1153c5ff94688159eeafebd17bcd9`; this is a sampled integrity check, not proof of gap-free history across downtime.

The operational timeline also resumed writing without a storage error, but its skipped-busy-batch counter increased from 2 to 3 during the observation window. Its ingest guard skips telemetry batches while a previous write is busy. This remains a follow-up audit item; the restart does not establish lossless timeline recording.

No equipment command was sent during the restart validation, and the previously reported balancer test was left alone as requested. Nothing has been committed, pushed, or deployed to the Dell as part of this work. Dell deployment validation remains pending. The test-safety guard does not change production equipment controls.

## Recorder queue follow-up restart — 22:39–22:42 UTC

With explicit approval, PID 18856 shut down gracefully, flushed recordings and released both writer locks without requiring a forced stop. The queue fix was built and started locally as PID 19395. Twenty-five samples over approximately two minutes observed zero timeline losses/errors, an advancing saved timestamp, and a pending batch draining to zero. All 23 telemetry sources, 320 strings, eight PCS reports/switch feeds and 336 thermal units were available. History/browser parity results and the rollback-build location are recorded in `operational-timeline.md`. No equipment commands were sent; no Dell deployment or Git push occurred.
