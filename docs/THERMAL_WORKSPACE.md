# Thermal Controls — first integration slice (2026-09-03)

## Delivered

Both portals expose Thermal Controls without replacing Feather/HVAC or the summary.
One selection drives device details, colored comparison traces, and prospective
recording targets. An active recording keeps its original targets, independently
of later graph selections. Review selects the recording's targets automatically.

Canonical coordinator Feather snapshots feed a one-hour, maximum 720-sample/unit
memory buffer. There is no new device poller. Source success timestamps are used,
not browser refresh timestamps. Quality failures and gaps over two minutes break
traces. Segment temperature sensors are explicitly shared between HVAC 1 and 2.
Mode is command-derived, not proof of compressor/heater operation.

The supply-air response thresholds and 180-second stabilization rule are ported
from `GreEnergy_HVAC_Intelligence/src/greenergy/services/thermal_query.py`.
Recording adopts that utility's explicit targets, continuity samples, deadbands,
durable-write acknowledgement, and low-disk-stop principles. The Python runtime,
databases and frontend are not copied or started. This is not full historian parity.

## Recording policy

Explicit start only, 1–8 units, 0.1–24 hours, one active session.
Local directory: `.prizm-data/thermal`, override with `PRIZM_THERMAL_DIR`.
Sessions use UUID metadata plus append-only JSONL samples. Sample writes are synced
before the state becomes Recording. Metadata uses synced temporary files + rename.
On restart, an unfinished session resumes the same targets until its original end;
it shows Waiting for data until a new write succeeds. No retrospective backfill.
Gaps during downtime remain gaps. Keep only one PRIZM process on a history directory.

Total directory cap: 64 MiB, free-disk reserve: 5 GiB, at most 200 sessions.
Recording pauses on storage failure; polling continues. No automatic deletion.
Temperature/current deadbands: 0.1 native units, RPM: 1; setpoints: 0.001.
Mode/quality changes and 60-second continuity samples are retained.
The UI exports the selected history as JSON. Archive/retention management and
full-fleet long-term history are follow-up work; do not treat this bounded store
as the other utility's portable historian replacement.

## Safety and deferred work

All thermal device interaction is read-only. Start/stop only affects local recording.
No automatic HVAC controls, hysteresis control, setpoint writes, or fault resets.
Supply response requires valid temperatures and command state; stabilization is
observed since this process first saw a mode or quality transition.
Short-cycle detection, measured hysteresis thresholds, annotations, fault overlays,
portable-history migration, configurable policies and optimized long-range queries
remain subsequent stages. Review details are explicitly current readings, while
the graph can be historical.

## Rollback

Set `PRIZM_THERMAL_ENABLED=false` and restart to disable ingestion and thermal APIs.
Existing views stay intact and recordings remain on disk. The tab reports disabled.
Pre-integration copies of App.tsx, coordinator and site-data routes were saved in
`/tmp/prizm-before-thermal-20260903.tgz`. This temporary checkpoint is not a durable
backup; review subsequent changes before restoring any file. The new code resides
in `src/server/thermal` and `src/components/ThermalWorkspace.tsx`.

## Validation

Run `npx tsx src/server/thermal/thermalService.test.ts` and `npm run build`.
Tests use isolated temporary directories and cover recording lifecycle, restart,
compression, command transitions, missing devices, expiry and storage reserve.
No live controller commands are part of verification.

## Metric overhead map and filtered results (2026-09-03)

The overhead map, results table, current details and history graph share unit IDs
and a single metric selection. Metric changes clear numeric limits because units
may change. Search, array, reading quality, minimum/maximum, faults and selected-only
filters affect the result list and dim map tiles without rearranging segment
positions or discarding selected units. Results can sort by topology or measured
value; stale/missing readings sort last and cannot match numeric bounds. Selection
outside the current filter remains explicit. Both map and table respect the same
8-unit comparison limit and fixed recording-target behavior.

Metrics: enclosure, supply air, average cell, control and outside temperatures;
HVAC amperage, RPM, heating/cooling setpoints, enclosure humidity and cell temperature
rate. Temperatures/cell readings remain shared canonical Feather segment readings,
not per-cell measurements or a new aggregation of Turtle data. Unreported fields
stay unavailable. Older recordings without the new fields create gaps, not zeros.
The cell-rate recording deadband is 0.01 °C/min.

Legacy parity: metric selector, numerical tile values, quality-aware tile rendering,
array/segment/HVAC structure and filterable results are carried forward. Enclosure
colors retain HVAC Intelligence's 70/75/80/85/90°F boundaries (shown in Celsius).
Other readings use labeled, fixed scales appropriate to their units rather than
applying the legacy generic temperature range to amperage or RPM. Scales indicate
relative readings, not alarm thresholds. Fault badges remain visible independently
of color mode. The original operating-mode map remains selectable. Derived current
imbalance, paired commands and cooling/heating deltas are not included in this slice.

Server projections provide formatted readings, quality and colors; browser filters
only compare canonical values for display. Selecting equipment reloads only cached
history; changing metrics/filters causes no fetch. Snapshot refresh uses the existing
SiteDataContext signal. No new timer, acquisition call, coordinator registration,
controller command or equipment-control endpoint is added. Existing PRIZM portals,
Feather views, safety behavior and recording storage are retained.

Validation performed:
- Production client/server build passes.
- Thermal metric and recording tests pass, including zero vs missing, stale quality,
  canonical cell readings, old-recording compatibility and new-field persistence.
- Feather enrichment and role workspace regression tests pass.
- Fresh isolated Express server with the real thermal routes and sample canonical
  data passes browser checks at 1366px: map/table selection, graph metric coupling,
  numeric filtering, missing/stale handling, comparison, retained hidden selection,
  and no browser errors. Screenshot visually inspected.
- Browser request capture confirms only thermal GET routes and a single snapshot
  request across selection/filter changes. Recording commands were not invoked.
- Disable flag returns 503; restoring it returns 200. Existing restart recording
  tests pass. No production poller was started for validation; live hardware has
  not been verified in this enhancement.
- Full type check still reports errors outside thermal files, including
  HvacQuickReference, SiteOperationsDashboard, fingerprint/core models, balancer
  analysis, observation adapters, coordinator metadata and troubleshooting overrides.

Run focused tests with `node --import tsx src/server/thermal/thermalMetrics.test.ts`
and `node --import tsx src/server/thermal/thermalService.test.ts`. Browser acceptance:
`PRIZM_PLAYWRIGHT_PATH=/path/to/installed/@playwright/test node --import tsx src/server/thermal/thermalWorkspace.browser.test.ts`.
The browser test uses a temporary history directory and never starts the coordinator.
Rollback remains `PRIZM_THERMAL_ENABLED=false` with a server restart; recordings are
preserved. Restart an older running PRIZM server before using the updated client.

### Fahrenheit and Site Health row layout

Page temperature readings, limits, scales, chart axes and tooltips use °F; cell
rates use °F/min (multiplication only, no 32-degree offset). Canonical data and
recordings retain Celsius. Server history projections include `displayValues` in
page units, and exports label canonical versus display units explicitly. Enclosure
color thresholds are displayed as 70/75/80/85/90°F.

The overhead view follows Site Health's horizontally scrolling array rows: a sticky
array label at the left and all segments in a single nonwrapping grid. Both HVAC
units remain individually selectable within each segment. Browser checks verify
Fahrenheit numeric bounds and history values, absence of Celsius page labels, and
single-row layout with horizontal scrolling at 600px, plus desktop visual inspection.

### Fit all segments without horizontal scrolling

Array rows now use fluid equal-width segment columns with no fixed minimum width.
All segments stay on one row within the available page width. H1 and H2 are stacked
inside each segment, with compact labels and wrapping readings where needed.
Full equipment names, values, and faults remain in tooltips and the connected table
and details. This replaces the horizontal-scrolling layout described above.
Production build and browser acceptance pass, including a 24-segment row at 1366,
1024 and 600 pixels with every segment in bounds and no horizontal map overflow.

### Direct segment selection and paired amperage

The whole overhead segment tile is now a keyboard-accessible toggle. One click
adds both HVAC IDs without a comparison-mode checkbox; clicking the selected
segment removes the pair. Result-row clicks use the same segment toggle. Selection
remains additive across arrays and filters. The existing eight-unit history and
recording limit is retained (four complete segments), with an explicit limit message
and no partial addition. Clear graph selection removes all graph targets.

HVAC amperage shows H1 and H2 readings together in each segment, including when
operating-mode colors are selected. Selecting the segment plots two distinctly
labeled amperage traces, and current details list both units' amperages. Missing
readings and measured zero stay distinct. Fixed recording targets, Fahrenheit,
fit-to-width array rows and cached-only reads remain unchanged.

Build and browser checks pass: additive segment clicks, pair removal, both amperage
readings and legend traces, four-segment limit, shared result selection, filters,
Fahrenheit values, 24-segment fit checks and the existing read-only endpoint checks.

### Whole-site outlier overview and memory sizing

`Show whole-site outlier graph` plots latest cached readings for the selected
metric across every array, independently of search/array/value filters. The x-axis
is segment position, not time. H1/H2 have separate series; excluded stale/missing
readings remain listed. Clicking or keyboard-activating a point toggles the same
segment selection used by the map, table, detail and eight-unit history graph.
`Show highest readings in results` clears narrowing filters and ranks live values.
No history is fetched for the whole site and no new polling is added. This is a
visual comparison, not a statistical alarm detector or whole-site history recorder.

Isolated Node heap experiment with the actual ThermalService: 120 segments / 240
HVAC units, fresh samples every 5 seconds, no active recording. At 720 cycles
(720 samples per unit), retained heap growth after garbage collection was 31.82 MiB;
at 900 cycles it was 31.84 MiB and still 720 samples per unit. This measures the
thermal service increment only, excluding the rest of PRIZM, browser rendering,
transient allocations and history-review overhead. Rough linear sizing is about
13.3 MiB per 100 units for this representative fixture. Runtime and data vary.

Representative JSONL sample size was 230 bytes: 8 units at one stored sample/minute
would use about 2.53 MiB/day, or about 30.32 MiB/day at one stored sample/5 seconds.
Actual size depends on value precision, IDs, changes and source update cadence.
Recording retains changes plus 60-second continuity samples when fresh data arrives.
Existing limits remain 8 recorded units, 24 hours/session, 64 MiB aggregate disk
storage and 5 GiB free-disk reserve. Multi-day site-wide hysteresis recording is
not enabled; increasing retention needs a separate storage/downsampling design.
Reading a saved session currently loads the file and selected samples into memory,
so reviewing long sessions adds transient server and browser memory beyond the
bounded live buffer.

Validation: production build, thermal tests and browser acceptance pass. The
browser checks full-site scope despite restrictive filters, missing-value exclusion,
keyboard/click selection, both amperage series, ranked results and no extra snapshot
request on enabling the overview. Screenshot reviewed with a 58-unit fixture.

## Implemented whole-site rolling retention and storage modal

`Site history storage` opens a keyboard-accessible modal with explicit start/stop,
1–7 retention days, a configurable data cap (default 32 GiB), a separate 5 GiB
free-space reserve, current site/coverage, saved bytes, free disk, last saved sample,
cleanup time, dropped observations and pause/error status. The whole-site recorder
is initially stopped. Start authorizes that current site; settings persist across
restart. There is no automatic activation from merely opening the page.

The recorder receives all mapped canonical thermal units from the existing
coordinator callback, independent of the eight-unit graph selection. It stores each
new source observation, commands and faults. There is no new device poller. A
60-second unref'd maintenance timer performs only local retention cleanup. Recording
requires site identity and is bound to station/block/EMS identity; a site change
pauses writes and prevents the history reader from mixing sites.

Storage lives under `PRIZM_THERMAL_DIR/site-history` (default
`.prizm-data/thermal/site-history`). Hourly JSONL shards indexed by target hash allow
streamed reads of only the selected units and hours. This implements the assessment's
partitioned-file alternative without adding native database dependencies. Each
batch acknowledges synced file writes and atomically replaced settings. A persistent
process lock rejects concurrent writers and recovers locks from exited processes.
Restart reconstructs duplicate-source suppression from each target's newest shard;
a torn final JSON line is separated from the next append and never treated as data.

Queries enforce the current retention cutoff immediately. Maintenance runs roughly
every minute and on startup: fully expired shards are deleted; only the cutoff hour
is streamed and rewritten to remove older samples precisely. Expiry continues after
recording is stopped. Changing retention applies expiry immediately. Only recognized
files inside a store with a valid ownership marker are eligible; targeted recordings
and unrelated files are preserved. On process downtime cleanup resumes at startup.
At a cap/reserve failure, recording pauses and preserves younger observations until
the operator resumes. No automatic reduction of fidelity is performed.

`Whole-site retained history` in the graph's recording selector provides one-hour,
six-hour, one-day, three-day and seven-day windows. All units are recorded, while
up to eight selected units are graphed. Queries stream data into at most 241 buckets
per target, preserving first/last, min/max and a gap marker; response size is bounded
at roughly 9,640 points across eight targets. Up to two reads run concurrently.
Wide graphs are summaries: they do not show every individual command transition.
Raw observations remain on disk; `Export shown data` exports the shown summary, not
a full raw archive. The site outlier scatter remains a current-reading comparison.

### Validation and observed sizing

Unit tests exercise eight-day retention, exact cutoff rewrites, cleanup while stopped,
restart expiry, deduplication, twelve-unit ingestion, site mismatch, gaps/extrema,
command fields, disk reserve/cap pauses, ownership isolation, competing writers,
torn tails and the site-only rollback flag. Existing thermal recording, metric,
Feather enrichment and workspace regressions pass. Production build passes;
project-wide type checking retains unrelated pre-existing errors, with none in the
thermal modules at validation time.

Browser acceptance uses a fresh isolated Express server and real thermal APIs:
modal focus/close, start/save/stop, all-site writes beyond selected targets, status,
retained-history graph loading, connected selections, Fahrenheit, 24-segment fit,
whole-site outlier chart and rollback. POST traffic is restricted to the tested
local storage-settings route; no equipment commands or additional polls occur.
Synthetic data and temporary directories only; production collection was not started
by the test and live hardware parity remains unverified.

A 320-unit, 12-cycle local write test measured 504.2 bytes/observation, 1.37 seconds
average and 1.80 seconds maximum per synced batch, with no dropped observations.
At five-second cadence this fixture extrapolates to about 18.2 GiB for seven days,
excluding small metadata and filesystem allocation overhead. This is an estimate,
not a seven-day soak test. The modal uses a conservative 600-byte estimate. Wider
values, longer labels/fault lists, faster cadence and slower disks change the result.
A selected-history summary query over that fixture returned 16 points in about 9 ms;
this does not measure a fully populated seven-day query. Large histories are streamed
and bounded in memory, but first-query latency still depends on rows scanned/disk.

### Rollback

Set `PRIZM_SITE_HISTORY_ENABLED=false` and restart to disable only the new recorder,
maintenance and history reader while preserving existing thermal views and targeted
recordings. Files are retained. `PRIZM_THERMAL_ENABLED=false` disables the entire
thermal integration. Keep one PRIZM process per history directory. No new dependency
or database runtime is required on supported Node versions.

Deployment check: restarted the local PRIZM production server and verified
`GET /api/local/site-data/thermal/storage` returns the new JSON contract. At that
check it reported zero mapped units, no current site identity and recording stopped.
Production recording has not been started; the modal enables Start once site identity
and mapped telemetry arrive. Automatic expiry begins when site storage is configured.

## Device selection and recorded-data review

The graph section now includes individual H1/H2 checkboxes, device/IP search,
array/HVAC filters, selected-only mode, add/remove shown devices and clear selection.
The eight-device limit is enforced atomically: an oversized bulk addition leaves
selection unchanged. Segment tiles still toggle both units; checkboxes can select a
single unit. Retained-device metadata survives restart and remains selectable if a
device is no longer in the current snapshot. Selection is shared with map highlights,
graph traces and export, independently of full-site recording coverage.

Recorded-data filters are separate from the latest-reading filters: local-time
start/end, minimum/maximum in display units (Fahrenheit for temperature), observed
mode, quality and recorded fault presence. Filters apply explicitly. Switching metrics
clears numerical limits; choosing a preset window clears custom dates. A fixed end
stops automatic history reload on the central live-refresh signal, so past-data review
is stable. Invalid bounds are rejected. Missing/stale measurements never match a
numeric range; old samples without fault fields are not treated as fault-free.

Retained-site filtering happens before graph reduction so qualifying middle values
are not discarded by unfiltered extrema selection. Excluded observations remain
line-break markers, preventing misleading interpolation. Synthetic source-gap markers
are excluded from the readings table and export. The expandable recorded-readings
table is sorted by time and paged at 100 rows, using the same selected, filtered
samples as the graph. Export includes applied filters, metric, units and summary
status, and omits excluded samples. Site-history output remains a bounded summary,
not a raw archive of every observation.

No new finding/diagnostic analysis rules were added. That stage remains deferred
until the review workflow is accepted. Existing supply-response text is unchanged.

Validation: focused tests cover Fahrenheit/zero/missing/fault-state filters, invalid
bounds, filtering before downsampling and retained-device discovery after restart.
The browser verifies individual add/remove, atomic bulk limits, custom valid/invalid
dates, mode/value filtering, table/graph agreement, reset, exported matches and that
review changes do not stop recording. Existing thermal/retention tests and production
build pass. Whole-site polling and equipment-control behavior remain unchanged.

Deployment status for the review update: deployed after explicit user approval for
a brief recorder interruption and server restart. Recording was stopped and flushed,
the production server restarted, and recording resumed with the existing one-day
retention and 32 GiB cap. Live checks confirmed `reviewVersion: 1`, 336 retained
devices, a successful filtered history response, and advancing saved timestamps and
storage bytes with no pause reason. The built client checks `reviewVersion: 1` and
shows an update/restart notice against older servers; browser compatibility tests
cover both old and new backends.

### Whole-site and array history review
Historical selection now supports up to 2,048 devices, including the current 336-unit
site. Select whole site selects the entire catalogue; Select entire array selects
both HVAC units throughout the chosen array. Add/remove shown and individual checks
share selection with overhead tiles, graphs, table and export. Selections above eight
automatically open retained history, including after reloading a saved selection.
The live buffer and separate targeted recorder retain their eight-unit limit.

A read-only POST history query avoids URL size limits. Streaming reduction budgets
approximately 10,000 representatives across the selection, retaining each device's
first/last, extrema and quality gaps per bucket. Larger selections use coarser time
buckets; narrow devices/time for detail. Above eight selected devices, refresh is
manual to avoid continuously rereading large archives. Recording and expiry continue
independently through the existing coordinator feed. Legends above 16 traces are
replaced by the scrollable selected-device list; device labels remain on tooltips.

Validation: 336-device fixture retains every device and its peak within bounded
output; browser selection tests cover entire site, array, additive selection and
removal along with existing filters/export/rollback. Production build passed.
Deployed using the approved recorder flush/restart/resume procedure, preserving
one-day retention and 32 GiB cap. Live whole-site POST returned HTTP 200 with all
336 devices represented (723 representative samples, 316 ms at verification).
Existing PRIZM_SITE_HISTORY_ENABLED=false rollback remains available.

Graph visibility update: the graph reports selected/with-data/without-data counts
for the plotted metric, range and filters (zero is valid; excluded, stale, missing
and nonfinite values do not count). Device chips mark no plotted data. Clicking a
chip toggles highlighting and selects device details; the highlighted trace draws
last with a thicker line and point markers while other traces fade. Clear trace
highlight restores all traces without changing selection, history requests, table,
export or recording. Build and isolated browser regression checks passed. This
client-only update is served by the running static server without a recorder restart.

Pinned-point inspection: click the graph (or Inspect latest point) to open Devices
at this point. The panel lists the closest returned observation for every selected
device, grouped by rounded displayed value, with each observation's actual timestamp.
It does not interpolate or claim simultaneous observations in summarized history.
Invalid/excluded observations are identified separately. Previous/Next and left/right
keys on the focused panel move through devices at the fixed pinned time. Selecting a
device highlights its trace and details. Show only this device affects chart visibility
only; Unpin restores all traces. Selection, table/export and recording are preserved.
Production build and isolated browser tests passed for pinning, navigation at a fixed
time, isolation and restoration. The running server serves the client update without
interrupting recording; no server or polling changes were needed.
