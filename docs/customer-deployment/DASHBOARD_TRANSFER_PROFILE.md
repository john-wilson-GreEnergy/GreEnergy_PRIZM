# Dashboard transfer profiling — 2026-09-25

## Baseline and bounded change

Read-only local cached requests identified the fast string GET as a transfer
outlier: 8,056,743 decoded bytes, no compression, 46–49 ms warm response headers,
9–13 ms local body receipt, 13–19 ms client JSON parsing. PCS: 102,929 decoded
bytes, gzip, 1–2 ms warm headers. Block summary: about 65,320 bytes, 2–3 ms warm
headers with one 1,368 ms delayed sample. These are sequential local samples, not
controlled LAN benchmarks or browser paint measurements.

An unchanged captured string body compressed losslessly to 498,403 bytes from
8,056,320 (93.8% smaller), using level-one gzip in 12.9 ms synchronously in a
standalone benchmark. No row fields need to be removed to achieve this saving.

## Architecture before implementation

Keep the existing string broker, authority, data model, HTTP cadence and stream.
Add a single-entry encoded-response cache between the existing fast-view getter
and HTTP transport. Its identity is the fast publication object plus the string
broker version, not cycle ID alone: multiple fast publications and post-command
patches can occur inside one cycle. Encode the existing response with no field
changes. Concurrent readers of the same revision share encoding work. Async gzip
avoids blocking the event loop during compression. Read-only routes return the
prepared representation; they never initiate device acquisition.

No timer, extra dwell, equipment write, frontend polling change, or freshness
restamping. New revisions invalidate immediately. Encoding errors propagate (no
silent older-data fallback). Only the newest revision's promise is retained;
completion of an older revision cannot overwrite it. Standard Accept-Encoding
negotiation respects gzip refusal. Clients without gzip receive the original JSON.

Rollback: `PRIZM_FAST_STRINGS_TRANSPORT=false` restores the existing route. Keep
legacy getter and response shape. Unit tests must prove decoded-byte parity,
coalescing, same-cycle updates, version invalidation, out-of-order completion,
error retry, no mutation, encoding negotiation and rollback. Verify build/restart
and read-only browser behavior before wider deployment.

## Separate observations

The Overview displayed a degraded-data warning while cached coordinator and
source diagnostics reported successful acquisition. This may be a client
comparison/publication issue, not a network failure; it remains unresolved in this
bounded transfer change. SSE deltas and the main snapshot are unchanged. Browser
render/paint cost has not yet been quantitatively instrumented. Do not describe
this transfer improvement as resolving all polling instability or render latency.

## Validation and results

- `EncodedJsonCache.test.ts` passed: lossless gzip decoding, original Unicode/null/
  zero/stale/diagnostic fields, concurrent-read coalescing, broker patch revision,
  same-cycle publication replacement, out-of-order completion, failed-encode retry,
  gzip refusal/identity/unacceptable encodings, and rollback flag. Domain broker
  and Developer Diagnostics regression tests passed. Typecheck and production
  build passed; pre-existing client chunk-size warning remains.
- Offline replay of a captured 320-string response: 8,043,163 decoded bytes,
  523,760 compressed bytes. Initial copy/serialization/async compression took
  49.2 ms; identical-revision reuse took 0.0006–0.0093 ms in this standalone test.
- Local restart completed after verifying no active balancer tests or fan holds.
  PID 13650; build `/tmp/prizm-strings-transport-build.239edF`; rollback build
  `/tmp/prizm-strings-transport-rollback-pqFYuF/dist`. Existing optimization flags
  preserved; experimental primary reader remains off.
- Live gzip response: 8,044,845 decoded bytes, 514,643 wire body bytes. Identity
  negotiation returned byte-identical JSON for the same revision. First request
  during warm-up took 760 ms to headers; four subsequent same-revision requests
  took 0.9–2.0 ms to headers. Body decode/parse still takes time: compression does
  not shrink the in-memory JSON or React render work.
- Six samples over 51 seconds with the string drill-down open: all HTTP 200, all
  320 rows, advancing cycle/broker revisions, successful completed coordinator
  cycles 10–19, maximum concurrency one. New-revision request+decode+parse totals
  were 90–116 ms, so the warm reuse figure is not the cost of every fresh update.
  This is a short smoke test, not an overnight or full application soak.
- Browser checked Overview, all eight collapsed PCS tiles and the Array 1 PCS
  one-line, then the updated String List and Array 1 / String 2 detail. Temperature
  and voltage maps rendered; lower balancing table retained 14 BPC rows, provided
  target values and 5/5 mV commanded deadbands. No command was issued. Thermal
  recorder remained enabled with seven-day retention, 336 units, no pause, zero
  pending batches and advancing saved time.
- Another pre-existing display issue: PCS page says data is unavailable while
  all eight tiles have data and no tile is selected; opening a tile renders its
  one-line. This copy issue is recorded, not changed in this transport patch.
- No commit, push, Dell deployment, or equipment configuration changes made.

The new cache is transport-only: unlike a timer-based publication cache it adds no
publication delay. First access to each revision still copies/serializes on demand;
only compression is asynchronous. The continuous string event stream is untouched.

## Follow-on correctness fix: view-aware snapshot quality

Further inspection found the client rejects compact heartbeat views if the prior
page supplied array-summary rows: `arraySummaryRows > 0` becoming zero is treated
as degradation for every view. The server intentionally omits these rows for
Overview, PCS, and Thermal. This explains a reproducible false warning after
navigating from a full view to a heartbeat view, even with successful acquisition.

Make only this array-row comparison aware of the server's three heartbeat views.
Keep synthesized Array 0 rejection, missing normalized/rollup checks, and string
count collapse protection intact. No timestamps or failure counters are forged.
Rollback query: `snapshotQuality=legacy` restores the prior array-row comparison.
Test full-to-heartbeat transitions, true losses in string/other full views,
malformed heartbeat data and Array 0. This does not fix the separately observed
304 freshness semantics or all possible degraded warnings.

### View-quality validation

`SiteDataContext.quality.test.ts` passes full-to-heartbeat transitions for all
three compact views and verifies real string/array losses, missing required
containers and Array 0 still trigger protection. Legacy comparison reproduces
the false warning in the fixture. Transport/broker regression tests, typecheck,
production build and diff checks passed again.

Final local runtime: PID 13846, build `/tmp/prizm-view-quality-build.SchWE2`,
rollback `/tmp/prizm-view-quality-rollback-8K1fd2/dist`. This rollback retains the
string transport change; the earlier `prizm-strings-transport-rollback-pqFYuF`
build predates both changes. All three live cached routes returned HTTP 200;
PCS had eight units and strings had 320 rows. Browser reload populated the full
String List, then switching to Overview displayed the compact block data without
the false degraded warning. No controls were exercised. The changes are local
and uncommitted; broader render profiling and longer stability testing remain.
