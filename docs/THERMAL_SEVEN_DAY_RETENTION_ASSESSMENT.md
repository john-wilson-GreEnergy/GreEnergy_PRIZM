# Whole-site thermal history: seven-day retention assessment

Status: original design assessment, followed by the implementation documented in THERMAL_WORKSPACE.md under “Implemented whole-site rolling retention and storage modal.” Date: 2026-09-03.

## Recommended scope

A separate opt-in site recorder retaining the newest seven days of canonical thermal
observations. It records all mapped thermal devices independently of the eight-unit
graph selection. Opening, closing or filtering the Thermal Controls page must not
change acquisition or recorder coverage. Reuse the coordinator's existing ingestion
callback; no additional device polling and no equipment commands.

Treat seven days as a rolling retention window, rather than a seven-day session
followed by a recording gap. Expire only records belonging to the new site store.
Keep existing explicitly saved targeted recordings untouched. If a finite seven-day
study is desired instead, its stop time is a separate setting from retention age.

## Evidence from current implementation

- `thermalService.ts`: one-hour live buffer, maximum 720 samples per HVAC unit.
- Targeted recording: eight units, 24 hours per session, 64 MiB total directory cap,
  5 GiB free-space reserve, no automatic deletion.
- JSONL appends preserve changes and 60-second continuity samples when fresh data
  arrives. History review currently reads a complete recording file into memory.
- Existing points contain numeric readings, command-derived Heating/Cooling/Idle
  state, source success timestamp and overall quality. Individual command edges and
  fault histories are not fully represented in the saved point model.
- Saved active topology is `default-stack750`. Its assumptions specify eight arrays,
  20 energy segments and one collection segment per array. At two HVAC units per
  energy segment this is 320 HVAC units, or 336 if all collection segments also have
  two applicable HVAC units. These are configuration assumptions, not live inventory
  verification.

## Storage estimate

The earlier isolated service experiment produced a representative 230-byte JSONL
sample. Seven days is 604,800 seconds. Raw size is approximately:

`HVAC units × (604800 / sample interval seconds) × bytes per sample`

| Fresh sample interval | Samples/unit/week | 320 HVAC units | 336 HVAC units |
|---|---:|---:|---:|
| 60 seconds | 10,080 | 0.69 GiB | 0.73 GiB |
| 15 seconds | 40,320 | 2.76 GiB | 2.90 GiB |
| 5 seconds | 120,960 | 8.29 GiB | 8.71 GiB |

These estimates exclude indexes, journals, metadata, extra command/fault fields,
variable numeric precision, export files and temporary maintenance space. They are
not measurements of the proposed store. Compression may reduce size; do not rely
on it before benchmarking the actual schema. Faster source updates raise usage.
Provision roughly 25–30 GiB of free space for an initial five-second design test at
this configured size, including working headroom and the existing 5 GiB free-space
reserve. Set the final cap from a representative complete-schema benchmark before
turning on production recording. Site size and actual source cadence must be shown
in the recorder's preflight estimate.

## Hysteresis fidelity

Preserve each fresh source observation at the cadence already available. A nominal
five-second retention estimate does not justify polling devices every five seconds.
Record source timestamps and receipt timestamps separately, with quality and gaps.
Never repeat an unchanged cached source timestamp as a new live measurement.

Retain enclosure/control/supply/average-cell/outside temperatures, humidity, cell
rate, measured H1/H2 amperage and RPM, and all applicable reported setpoints. Extend
the canonical historical model with individual compressor, fan, reversing-valve and
electric-heat command bits and validity, where already reported by the canonical
source; include observed fault/quality transitions. Unknown remains unknown.
Temperature storage remains Celsius; the page displays Fahrenheit.

Capture all observed command changes even when the combined Heating/Cooling label
does not change. Preserve measured current changes independently of commanded mode.
Never treat a command bit as proof that equipment ran. Only observed edges can be
analyzed; cycles occurring between telemetry updates cannot be reconstructed.
Avoid applying the targeted recorder's current deadbands to full-fidelity study
history without evaluating their effect on the transition temperatures of interest.

## Storage and query architecture

Use an indexed, disk-backed local store with batched writes and bounded queues.
SQLite is a candidate, subject to packaging/driver validation on supported Windows
and macOS Node runtimes. The project advertises Node 20+, so a built-in database API
must not be assumed available on every supported installation. Benchmark the chosen
adapter/schema before integration; no dependency or runtime changes are made here.

Store shared segment sensor observations once, with H1/H2 measurements linked to the
same source observation. Persist site identity and stable topology identity alongside
historical labels; IP address alone must not merge different equipment or sites.
Index by site, device and observation time. Use segmented/partitioned storage or
bounded indexed deletion, with bounded maintenance and explicit space accounting for
journals and sidecars. Ensure deletion actually permits disk reuse/reclamation.

Do not load seven days into RAM or deliver millions of points to the browser.
Keep the existing bounded live buffer and bound query working memory. Query by site,
target, metric and time range. Return graph-sized min/max envelopes plus transition
markers for wide time ranges, retaining source-resolution samples on disk for zoom
and export. Avoid averaged-only graphs that hide short spikes. Limit raw-query page
size and support cancellable, streamed exports.

Whole-site historical overview should calculate per-device extrema, spread and
observed state/quality changes for a chosen window. Clicking an outlier opens the
same selected targets in detailed history. Recording all units does not require
rendering hundreds of full-resolution time traces simultaneously. The present
whole-site overview remains a latest-reading view until this history API is added.

## Retention and operational behavior

- Explicit start/stop; persisted state resumes only the authorized site after restart.
- Show retention age, first/last recorded source timestamps, coverage, missed/dropped
  samples, actual disk use, configured cap, free space and projected seven-day size.
- Exclude expired observations from all queries. Purge expired site-store records
  during normal maintenance and on startup before serving history; catch up after
  downtime. Cleanup touches only the new store's own data.
- If disk cap/reserve is reached while unexpired history remains, pause and report
  the reason; do not silently reduce retained detail or delete younger observations.
- Bound the writer queue; overload must report a gap without blocking telemetry.
- Process restarts and source outages produce gaps. Do not backfill invented data.
- Separate archive/export destinations from managed retention. Existing targeted
  sessions and user exports are outside the new rolling cleanup policy.
- Rollback disables the new recorder/query surface, preserving existing PRIZM views,
  targeted sessions and the new store's files for recovery.

## Memory expectations

The actual existing ThermalService measured about 31.82 MiB of retained heap growth
for 240 HVAC units at 720 samples/unit, and 31.84 MiB after 900 cycles. A rough linear
extrapolation gives about 42–45 MiB for 320–336 units. This is only the live-buffer
increment, not total application RAM or a guarantee for a future database backend.
A disk-backed seven-day store should add bounded writer/query overhead rather than
seven days of resident samples. Long-session review in the current JSONL code does
not meet that requirement and must not be reused for full-site history.

## Required implementation validation

1. Representative full-schema storage benchmark at configured site size and actual
   source cadence; measure size, write latency, heap plateau and bounded query output.
2. Synthetic observations spanning more than eight days; test the precise seven-day
   query cutoff, startup expiry, cleanup isolation and reclaimed disk space.
3. Crash/restart and interrupted writes, disk-full/reserve handling, writer overload,
   duplicate timestamps, out-of-order samples, missing devices and site changes.
4. H1/H2 independent command transitions, brief amperage spikes, missing values,
   quality gaps, correct Fahrenheit presentation and extrema-preserving wide graphs.
5. Whole-site history overview to map/table/detail selection and drilldown; paging,
   export cancellation and no extra device requests.
6. Existing regression tests, production build, fresh server endpoints, packaging
   checks, rollback and live read-only parity when hardware is available.

This assessment changes documentation only. No recorder, retention deletion,
controller interaction, dependency installation or polling changes were enabled.
