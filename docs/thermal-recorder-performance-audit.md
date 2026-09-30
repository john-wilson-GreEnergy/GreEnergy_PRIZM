# Thermal recorder and history performance — 2026-09-23

## Scope and architecture

This local-only audit follow-up changes disk recording and history presentation, not device acquisition, equipment commands, retention configuration, or the Dell deployment. Existing canonical Feather observations remain the source. The hourly JSONL format and seven-day setting are unchanged. Raw history remains authoritative; graph representatives are not substituted for raw review input.

## Changes

- Deduplicate against durable and already-queued observations before checking overload. Duplicate source readings no longer consume recording slots or inflate the dropped counter.
- Bound recording to four complete queued/running batches. Do not coalesce distinct observations: short peaks are retained. Further unique observations still increment the existing dropped counter if the queue is full; this is not a claim of lossless recording under unlimited load.
- Write at most four independent device shards concurrently. Each shard is still synced. Started writes drain before an error is surfaced; a failed writer pauses recording rather than hiding the failure.
- Retention maintenance also processes at most four shards concurrently. Cutoff-hour rewrites use bounded output buffers instead of a disk write for every line. Exact timestamp expiry, ownership checks, free-disk reserve, and storage cap remain.
- History graph reads parse chunks rather than awaiting every individual line. Periodic event-loop yields preserve cancellation and live-telemetry responsiveness. Existing first/last/min/max/gap representatives, filtering, collection-segment exclusions, output shape, and source timestamps remain unchanged.
- Storage diagnostics expose queued batches, last write duration, and saved sample count. Lifetime drop counts are preserved, not reset; older counter values can include duplicates counted by the former implementation.
- Empty graphs say “Preparing history…” while a selection is loading. Existing graphs remain visible during refresh.

## Rollback

Set `PRIZM_HISTORY_CHUNKED_READS=false` to restore the previous line-by-line graph reader. Set `PRIZM_HISTORY_PARALLEL_WRITES=false` to serialize shard writes and maintenance. Restart PRIZM after changing deployment environment settings. These flags do not disable recording, remove data, or alter retention. The serial writer retains improved deduplication and bounded queuing.

## Validation

- `historyIo.test.ts`: duplicate queued readings, bounded overload, every accepted distinct observation, serial-write rollback, reader rollback, exact graph payload parity, malformed tails, multi-chunk Unicode, cancellation, consumer errors, symlink rejection, and draining partial failures.
- 42-target / 60,480-observation synthetic fixture: three alternating old/new reader runs per trial. Median old/new times were 132/117 ms, 127/121 ms, and 146/117 ms across three local runs. This is a modest local parsing improvement; no Dell speedup is asserted.
- Existing site-history tests: exact seven-day expiry, extrema/gaps, restart deduplication, single writer ownership, interrupted-tail repair, storage cap, disk reserve, and global history rollback passed.
- Collection history, filters/catalogue (including 336-device bounds), thermal metrics, target classification/ranking, thermal service, morning-review and morning-review route tests passed.
- Production build passed. Repository-wide TypeScript checking still reports 18 pre-existing errors; it is not a clean release gate.
- Local production runtime restarted, preserving existing runtime flags. Existing shutdown handling did not exit on TERM and required stopping the specifically verified local process; clean shutdown remains a separate audit item.
- Live local seven-day-window query returned HTTP 200, all 42 requested Array 1 HVAC units, 571 representatives, in 983 ms. Available local history covers less than seven days; this is not a full seven-day Dell benchmark.
- Browser: overhead map intact; retained history rendered; new storage indicators visible; no browser errors observed during the check. No recording settings were changed.
- Twelve live status samples from 21:53:57–21:54:54 UTC: all 336 units, seven-day retention, no pause, queue depth 0–1, completed 336-sample batch times 1,021–1,228 ms. Lifetime dropped counter stayed at 336 while saved timestamps advanced. This short observation does not establish overnight reliability.

## Remaining work

Full seven-day cold-query performance on the Dell and long-duration recorder reliability need deployment validation. This patch still reads raw hourly files on graph requests; background precomputed multiresolution summaries would be a separate, larger change requiring raw-history parity and cache invalidation tests. It does not claim to finish that redesign or the broader application audit.
