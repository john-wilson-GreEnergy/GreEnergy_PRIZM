# Developer diagnostics correctness

## Architecture (before implementation)

The default diagnostics view reads the existing cached status, boot-status,
source-metrics, and topology APIs once on entry or explicit refresh. It adds no
device acquisition, timer polling, command, or authority selection. The UI is an
inspection view of server-reported diagnostics, not an independent health engine.

Each request has its own failure state and a bounded timeout. Navigation cancels
requests; obsolete responses cannot replace newer results. HTTP reachability is
separate from EMS/cache health. Browser-to-PRIZM response time includes body receipt
and is not ICMP ping or controller latency. Response size is decoded UTF-8 bytes,
not compressed wire bytes. Missing uptime remains unavailable. Original source
timestamps are displayed without replacing them with retrieval time.

Boot preload booleans are labeled reported loaded/not loaded, not successful
equipment tests. Source metrics use the actual array response; missing, zero,
failed, stale, and fallback values stay distinct. Topology is summarized without
rendering its full raw graph; full payload inspection remains in Raw Data / Debug.

The prior diagnostics implementation is retained temporarily for comparison behind
`diagnostics=legacy`, with an explicit untrusted legacy warning. Do not use it as
validation evidence. A retained production build also provides full rollback.

Validation: focused contract/loader/render tests, existing raw-inspector regression,
typecheck, production build, graceful local restart, read-only browser/API checks.
Dell deployment and equipment control are outside this change.

## Verification — 2026-09-25

- Focused loader/render tests passed: independent partial failures, HTTP 401/503,
  malformed JSON, login HTML, wrong response shapes, UTF-8 decoded byte counts,
  zero durations, stale flags, false preload flags, missing fields, cancellation,
  timeout, and query rollback selection. Existing raw-inspector tests also passed.
- Typecheck, production UI/server build, and diff whitespace checks passed. The
  existing large-client-chunk warning remains. Server bundle hash matches the prior
  build; no server acquisition or control code changed.
- Local runtime gracefully restarted as PID 10757 after confirming no active
  balancer tests or fan holds. Build: `/tmp/prizm-diagnostics-build.iRme9O`.
  Previous build retained at `/tmp/prizm-diagnostics-rollback-HLQdHQ/dist`.
- Browser default view displayed actual profile, 2,796 cached topology entities,
  original source timestamp, source durations, and real preload booleans. Unlike
  the old view, `emsApps`, `modbusProfile`, and `safetyFaults` appeared as **Not
  reported loaded**, not invented successes. These are boot-reported flags, not
  independent evidence those subsystems are currently broken.
- First observed API response time was 480.6 ms; explicit refresh showed 11.4 ms.
  These are individual browser-to-PRIZM measurements, not benchmarks or EMS ping.
  Uptime explicitly remains unavailable because these APIs do not provide it.
- Legacy query mode visibly displayed its untrusted-placeholder warning. The
  default view was restored afterward. Failure rendering is fixture-tested; no
  live server outage or equipment failure was induced.
- Subsequent cached coordinator cycle 12 succeeded; maximum concurrency remained
  one and experimental primary reader remained off. Thermal recorder: enabled,
  seven-day retention, 336 units, advancing saved time, no pause, zero pending
  batches at final check. This is a short smoke check, not a long stability soak.
- No equipment commands, Dell deployment, commit, or push performed.

Parity intentionally differs for fabricated legacy values: no fixed 4 ms ping,
245-hour uptime, 24/42 source counts, invented site identity, current-time source
timestamp fallback, or success fallback is used in the default panel. The old
checklist shape was incompatible with the actual preload map; the new view shows
that map directly. Full raw topology remains available in the raw inspector.
