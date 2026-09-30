# Compact string transport

Architecture: retain the canonical string broker and existing acquisition cadence.
Project existing records for the list: retain all fields except raw source payload,
duplicate balancing object and verbose sourceDebug; keep the communication-reason
provenance and the exact BPC fields consumed by list tooltips. Never alter values,
timestamps, warning lists, control targets or post-command broker protection.
Apply the same projection to shared snapshots, fast GET and SSE. Keep legacy
payloads available via `stringPayload=legacy`. Full JSON export fetches full data
on demand; detail fetches one canonical full row and its cell fallback on demand.

Compact bootstrap and deltas carry a process epoch and broker version. Reconnect
requires a new bootstrap; buffer bounded deltas during bootstrap, discard stale
responses and duplicates, detect gaps and recover via existing snapshot GET. Never
label transport failure as current telemetry or restamp source observations.
No new device poll, control write, changed site configuration or Dell deployment.

Validate offline output/field parity, stream ordering/restart/gap cases, builds,
local restart, read-only browser detail/export paths, response sizes and rollback.

## Local validation — 2026-09-25

- Captured 320-row replay: identical full/compact table markup for every row;
  warning/alarm lists, zero/null values, source timestamps and balancing tooltips retained.
- Fast response replay: 8,043,163 → 2,524,814 decoded bytes; gzip level 1:
  523,760 → 172,746 bytes (about 69% / 67% reductions).
- Live local comparison: fast response 8,045,318 → 2,526,575 decoded bytes;
  shared string-page snapshot 14,345,206 → 3,414,789 bytes (about 76% smaller).
  These are payload measurements, not a claim of equivalent end-to-end latency reduction.
- Live canonical detail for Array 1 / String 2: 26,983 bytes, 14 BPC detail rows.
  Browser shows both 5 mV requested deadbands, populated cell heatmaps and balancing rows.
- Browser select-all/clear: 320 → 0; no control command sent. Legacy query rollback
  loads 320 strings; compact mode restored afterward.
- Live SSE ready/update versions 72 → 73 shared one process epoch and contained
  compact rows. Unit tests cover duplicate/older messages, missed versions, bounded
  buffers, restart epochs, reconnect generations, abort/cleanup and delayed HTTP
  responses following simulated command feedback. No live command replay was used.
- Full JSON endpoint retains raw diagnostics; compact export requests it on demand
  and fails explicitly if unavailable. Browser export click produced no visible error,
  but the in-app browser did not return a download event; saved-file verification
  remains a manual check in a standard browser.
- Focused tests, TypeScript checks, Vite and server builds passed. Existing large
  bundle warning remains. Normal (non-profiling) local runtime restarted with backup
  at `/tmp/prizm-compact-strings-rollback-SiJlQD/dist`.
- Recorder remains enabled for 7 days / 336 units, pending writes 0, no pause;
  historical dropped-sample count stayed at 336 while last-saved time advanced.
- Dell unchanged. No commit or push performed.

Rollback: append `&stringPayload=legacy` to the string-page URL. This switches the
shared snapshot, fast GET/SSE and detail fallback to their earlier paths. Remove
the parameter to restore compact transport. Full deployment rollback uses the
backup above after checking for active local jobs and gracefully stopping PRIZM.
