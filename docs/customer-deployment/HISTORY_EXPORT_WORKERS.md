# Background history and export processing

## Scope — 2026-09-26

This stage isolates whole-site retained thermal history parsing/projection from
the telemetry event loop, and thermal shown-data JSON formatting from the browser
UI thread. It does not change device acquisition, controls, recorder retention,
source authority, sampling cadence, historical values, or chart semantics.
Morning-review analysis, live/session history, other report formats and chart
rendering are not migrated in this stage.

## Architecture and limits

- SiteHistory still owns identity validation, retention bounds, the shard manifest,
  recorder writes and the two-query admission limit. Clients cannot supply paths.
- Each accepted retained-history request uses a short-lived Node worker: at most
  two jobs, no unbounded queue, 128 MiB old-generation heap limit per worker, and
  a two-minute deadline. Cancellation/disconnection terminates its reader; shutdown
  cancels workers before releasing the recorder lock. Workers perform no network
  acquisition or equipment writes.
- `projectHistoryQuery` is the shared projection for the worker and cooperative
  rollback. Existing extrema, gaps, quality filters, Celsius/Fahrenheit values,
  CS cell exclusion and representative bounds are retained. The current chunked
  and line-iterator read modes both remain available.
- Worker failures are surfaced as query errors, not blank successful history.
  The existing UI retains its previous plot on request failure. No automatic
  main-thread retry silently reintroduces the expensive workload.
- Thermal `Export shown data` captures one displayed revision. A dedicated browser
  worker formats its JSON and returns a Blob. The UI shows Preparing export and a
  cancel action, prevents concurrent exports, and cancels on unmount. Filtering,
  units and file shape are unchanged. No browser data is sent to another server.

## Build and portability

`npm run build` now also bundles `dist/history-query-worker.cjs`; deploy the whole
build, not just `server.cjs`. `npm run dev` prepares that artifact through predev.
The worker is resolved relative to the PRIZM working directory, as used by the
existing launchers/services. Vite bundles the separate browser worker asset.
The implementation uses Node/browser workers and portable paths without shell,
SSH, Python or OS-specific commands. Only macOS execution has been verified here;
Windows/Linux runtime checks remain required before releasing on those platforms.

## Tests and measurement

- `npm run test:history-workers`: worker/cooperative result parity; peaks, gaps,
  CS exclusions, filters, duplicate targets, both read modes; bounded concurrency,
  pre/in-flight cancellation, timeout, missing worker, shutdown, and rollback.
  Export tests cover revision capture, format parity, cancellation and failures.
- Existing history I/O, thermal service, history review, morning review and UI
  review tests pass, including the 336-device representative bound test.
- Full `npm test`, TypeScript checking, Vite and server/worker builds pass.
- The small 24,000-observation fixture returned 1,482 identical points: cooperative
  28 ms versus worker 52 ms in one local run. This is not a speedup claim: worker
  startup costs more for small jobs; the objective is CPU isolation during larger
  jobs. The 60,480-observation regression fixture also passes.
- Local production runtime restarted after confirming equipment tasks were idle.
  A fixed 24-hour/four-target query returned the same 725 points and identical
  serialized SHA-256 before and after migration (worker API HTTP 200, 98 ms).
- In-app browser: seven-day retained graph loaded; actual downloaded JSON contains
  exactly its 187 displayed samples, one device, the expected units, and no excluded
  observations. No browser errors were logged; the chart emitted its existing
  initial-container-size warning. Connection Live returned after startup.
- A seven-day/42-target live API query returned 2,002 points in 1,506 ms. Concurrent
  snapshot requests measured 8, 1,371, 1, 2 and 2 ms. One substantial spike remains:
  this result does not establish consistently low end-to-end polling latency or
  its cause. A subsequent no-history baseline measured 604, 1, 1, 1, 2, 4, 18,
  1, 1 and 3 ms, so spikes also occur outside history queries. Additional runtime
  profiling is still needed.
- Existing shutdown/recovery integration and yesterday's site-loading regressions
  pass. No equipment command, firmware/configuration update, commit or push was
  performed during this stage.

## Rollback

Set `PRIZM_HISTORY_WORKERS=false` before starting PRIZM to retain the cooperative
reader with the same projection. Add `exportProcessing=legacy` to the page query
to retain the former synchronous shown-data JSON export. Both paths have parity
tests. The production entry files preceding this change are byte-verified in
`/tmp/prizm-before-history-workers-a5NFJT`; restoring those files to dist and
restarting an idle runtime restores the previous version. Old hashed assets are
retained. Saved histories and configuration are not deleted by rollback.
