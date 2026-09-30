# Operational timeline — PCS, string states, EMS apps and PRIZM commands

## Scope

The PCS dashboard and string list have a collapsed **Operational history & incident timeline** panel. Select an array and a 1, 12 or 24-hour window, then load a review. A first load populates the recorded string selector. Single-string reviews retain array-wide commands and PCS context. Results include coverage by source, longest unobserved interval, electrical observations, string/PCS state changes, and separately labeled PRIZM command entries. Reviews can be exported as JSON; event tables paginate in groups of 20.

This is a best-effort operational timeline, not a compliance audit, fault diagnosis, protection system, or full historian replay. Commands sent through Kobold or other tools are not recorded; their effects may appear in observed telemetry. Thermal morning review continues to use its existing raw thermal history.

## Data path and authority

Existing acquisition → coordinator PCS projection → existing background PCS publication → asynchronous local recorder → on-demand bounded review → UI.

No new equipment polls, controls, timers or browser polling loops are added. The existing PCS publication supplies the recorder even when no browser is open. Recording does not wait in the HTTP request path; only the existing background publication calls ingestion. Existing live values and controls are unchanged.

The coordinator creates these canonical streams:

- **electrical:** EMS Modbus real kW, reactive kVAR, DC volts and DC amps. Null values stay null; no Turtle fallback is relabeled as Modbus.
- **pcs-status:** direct PCS source, inverter phrase, DC 1/2/3, AC and grid switch states. Source is explicitly SMA web process data or SMA Modbus as supplied by existing authority resolution.
- **string-state:** positive and negative contactor feedback, EMS close request and rotation from the existing published canonical string snapshot. Collection does not add direct device reads or duplicate the fast string broker. Unknown/stale/offline values remain unavailable; a close request with open feedback is not automatically classified as a fault (for example, voltage matching may still be pending).
- **ems-app:** explicit reported enabled/disabled state per application code and priority, plus reported Power Control kW/kVAR settings. These settings are not measured output and do not establish which competing EMS application controls the site. Unknown enabled state is not inferred from health text.

EMS app freshness is stamped on rows in the existing successful BlockViewer acquisition, before retained rows are merged. Normalized apps carry that response timestamp and EMS identity into the projection. Cache/disk bootstrap, fallback/mock responses, local enabled/health cache mutations and site mismatches cannot masquerade as new live EMS observations. Retained rows keep their old timestamps; after 120 seconds the recorder marks them unavailable. The timestamp is the local receipt time of an EMS response, not the exact time the equipment changed state. The existing live app UI/control behavior is unchanged by this provenance metadata.

The streams retain separate source and observation timestamps. Repeated source timestamps are not new samples. Stale, future-invalid, out-of-order or absent timestamps become unavailable observations. Unknown switches remain unknown. The source EMS host must match the current canonical site before observations can be live.

Electrical samples and unchanged PCS states are limited to one per 10 seconds; unchanged string/app states to one per minute. Observed state/quality changes can be saved sooner. This is not a transient/event recorder and can miss changes between canonical publications. Extended SMA diagnostics (including power-off reason, temperature and energy) are not yet included because they need their own per-field freshness provenance.

Existing contactor, string/PCS rotation, balancing, EMS app enable/disable and Power Control command services also emit passive **command** entries. A request record means dispatch was attempted, not accepted. Its paired result reports delivery and readback as reported by that command service, not independent proof of actuation. Transport errors are unknown delivery, not proof of rejection. Balancing records include mode and requested charging/discharging deadbands; the existing delayed settings check is recorded separately and does not prove active balancing. Power commands record requested signed kW/kVAR, app priority and the enabled value in the actual existing payload, without changing that payload. No new command, retry, readback request or timer is introduced. Raw payloads, credentials, operator notes and response bodies are not stored here.

Block-wide app observations and commands are stored once in a dedicated shard (internal array key `0`, explicit `scope: block`), never attributed to an individual string. They appear as block context in every array/string review. Command station/block identity must match the captured canonical site as well as the EMS URL. Reviews keep the newest 300 events by timestamp across both block and array shards, rather than by file order.

Current site limitation: the September 23 BlockViewer Power Control row exposes enabled status but omits numeric app setpoints (`appStatus` absent and empty report values). The history therefore displays **Unknown**, never measured PCS power as a substitute. Requested setpoints and the existing command service's later matching-settings result will still be recorded for future PRIZM commands. Independent numerical app-setpoint history requires a canonical source with its own provenance before it can be advertised as available.

Each command captures the canonical site identity before dispatch; the EMS URL must match. Late readbacks remain associated with the original site if the connection changes. A bounded asynchronous queue (100 pending entries) prevents a busy telemetry write from dropping a normal command entry. Missing site identity, queue overflow and write failures are exposed as unsaved command entries. Recording failures do not block or change equipment commands. A process interruption may leave a request without a result; that outcome remains unknown. Commands never count toward telemetry coverage, and temporal proximity does not prove causation.

## Storage and performance

Default directory: `.prizm-data/operational-timeline` (override `PRIZM_OPERATIONAL_TIMELINE_DIR`). SHA-256 site identity includes station, block and EMS URL. Hourly files are partitioned by site and array. Up to seven days are retained, with a 2 GiB cap and 5 GiB free-disk reserve. Actual retention depends on site size and state-change rate. Only expired, owned shards are removed; reaching the cap pauses recording without deleting unexpired evidence. Status exposes errors, last saved time, used bytes, pending telemetry/command entries, unsaved or incomplete telemetry batches, the latest loss reason and unsaved command entries. Counters are process-local and reset on restart, not durable audit totals. Resolve a paused disk condition and restart PRIZM to resume.

Telemetry now shares the sequential command writer instead of being dropped whenever the writer is busy. Its buffer includes active plus waiting batches, bounded at 32 batches and 8 MiB of serialized snapshots (not an exact heap cap). Command entries retain their separate 100-entry capacity. Snapshots are captured at ingestion so later live-object mutations cannot alter saved evidence. No latest-only coalescing is used: short observed state changes remain ordered. The existing source deduplication and 10-second/one-minute recording cadence still apply. Quality is assessed against the original observation time, not the later disk-write time; queued data never receives a new source timestamp.

On telemetry overflow the newest incoming batch is rejected and counted without removing accepted observations or command entries. A write error pauses the writer and counts queued records that cannot be completed; a partially written batch is reported as incomplete rather than retried and duplicated. Graceful close stops accepting work, drains accepted entries, syncs the files, and releases the writer lock. This is a bounded in-memory buffer, not a durable message queue: abrupt process loss can still lose queued entries. Site baselines reset in writer order to keep an incoming site switch from interfering with an earlier site's pending transitions.

A format marker and exclusive process lock prevent adopting arbitrary directories or concurrent writers. All writes are queued asynchronously and synced; partial trailing lines are ignored. Every new append starts on a new line after an interrupted write. Restart creates a new baseline rather than manufacturing state transitions over downtime. Site changes isolate both records and review caches.

Reviews stream files instead of loading raw history into the browser; one query runs at a time, cached for 30 seconds, bounded at 200,000 scanned records even when filtering a string. Only the latest 300 matching events are returned (explicitly labeled if truncated). Electrical charts show the last saved observation of each minute as **points, without interpolation**, not averages or peaks. Missing readings are never zero-filled.

Coverage uses adjacent fresh source observations, with maximum intervals of 25 seconds for electrical and 120 seconds for PCS/string status. Leading/trailing time and longer gaps are uncovered; there is no extrapolated uptime. It measures observation availability, not equipment health or completeness of every individual field.

## Rollback

Set `PRIZM_OPERATIONAL_TIMELINE_ENABLED=false` and restart. This disables history recording/reviews only; live acquisition, PCS controls and thermal recording remain unchanged. Existing history is retained. Removing the flag and restarting resumes recording.

For a targeted queue rollback, set `PRIZM_TIMELINE_BUFFERING=false` before restart. Telemetry again skips while any telemetry/command write is pending; the loss counter and reason remain visible. No history files or equipment settings are changed.

## Verification commands

For the recorder queue and related persistence, command-entry, balancing-history and UI regression fixtures, use `npm run test:timeline`. This suite preloads the unit-test network guard and uses temporary storage only. The older route checks below use loopback HTTP and require separate review; do not run broad integration scripts assuming they are isolated from devices.

```
node --import tsx src/server/history/operationalTimeline.test.ts
node --import tsx src/server/history/operationalTimelineRoutes.test.ts
node --import tsx src/server/history/stringTimelineProjection.test.ts
node --import tsx src/server/history/commandTimeline.test.ts
node --import tsx src/server/history/emsAppTimeline.test.ts
node --import tsx src/server/ems/emsAppProvenance.test.ts
node --import tsx src/server/ems/emsCommandTimeline.test.ts
node --import tsx src/components/PcsOperationalTimeline.test.tsx
npm run build
```

After restart, check `/api/local/site-data/operational-timeline` and `/api/local/site-data/operational-timeline/review?array=1&hours=1`. Verify values against `/api/local/site-data/pcs`, preserving separate sample times. The history intentionally begins at installation; previous overnight operation cannot be reconstructed from current values.

For string verification, use `/api/local/site-data/operational-timeline/review?array=1&hours=1&string=2` and compare explicit polarity feedback, EMS close request and rotation against `/api/local/site-data/strings`. Test command pairing/site isolation using the temporary-directory fixtures; do not issue live commands merely to populate the timeline.

Local verification on September 23, 2026: all eight arrays produced electrical and direct PCS records, no recorder error or skipped busy batch was reported, and the most recent recorded kW/kVAR/DC V/DC A matched the existing live PCS API for each array during the comparison. The browser review displayed independent source coverage and the expected short history since installation. No equipment commands were sent. Full-repository type checking remains blocked by pre-existing errors; focused tests and production build pass. This phase has not been deployed to the Dell server.

String/command extension verification on the same date: after a fresh local server restart, all 320 strings (40 per array) appeared in recorded history. Recorded live polarity, request and rotation fields matched the canonical string API during comparison, with zero recorder errors, skipped busy batches or unsaved command entries. All eight array reviews exposed 40 recorded string targets; the Array 1 / String 2 review contained only that string's state stream plus PCS context. Browser checks passed on both PCS and String List pages, including target filtering and event pagination. Temporary-directory tests covered request/result pairing, array-scope inclusion, queueing behind telemetry, late result site isolation, unknown readback, minute heartbeats, immediate observed transitions, API validation and rollback. Existing contactor, rotation, balancing and string-dashboard regression tests also passed. Command history was tested with fixtures only: no live command was sent, and live command execution has not been revalidated by this change. These changes remain local, uncommitted and unpushed.

EMS app/power extension verification: nine app streams matched all nine canonical enabled-state values, including explicit `false` and app priority `0`. An Array 8 / String 2 review retained all nine block app streams and separate PCS context. Recorder error, skipped-batch and unsaved-command counters were zero during the check (these counters are process-local, not a durable audit). Tests verified fresh/retained/mutated/fallback provenance, unknown fields, signed/zero setpoints, block/site isolation, newest-event truncation across shards and rollback. Intercepted-fetch command-service tests verified unchanged payloads and request counts, successful app/power readbacks and rejected delivery without any network calls. Existing EMS app serializer/control matrix and block-summary regressions passed. Production build passed; repository-wide type checking still has pre-existing errors, with none reported in the new history/app modules. No app was toggled, no power movement was requested, and the Dell deployment was not changed.

### Recorder queue follow-up — September 23, 2026

The later restart check observed busy-batch skips, prompting the bounded queue change above. Network-guarded local fixtures cover immutable FIFO bursts, command interleaving, transient states, eight bursts of 320 strings across eight arrays, count/byte overflow, recovery after draining, storage-failure accounting, delayed-write freshness, site changes, close/drain/lock release and rollback. Related persistence, command-history, EMS app, balancing-history and UI fixtures pass. Repository-wide type checking now passes. A production build was generated in a separate temporary directory; the running application and its static assets were not replaced. Fresh primary-server restart, live queue/recording parity and browser validation of this queue change remain pending. Nothing was committed, pushed or deployed, and no equipment commands were sent for this change.

Subsequent operator-approved local restart and read-only validation completed at 22:42 UTC. The prior runtime gracefully flushed both recorders and released both locks. A fresh production build was installed locally and started as PID 19395, with both writer locks owned by that PID. The previous build remains available at `/tmp/prizm-pre-queue-restart-0iRUVK/dist` for local rollback.

Twenty-five read-only samples from 22:40:05 through 22:42:11 UTC showed buffering enabled, zero dropped/incomplete telemetry batches, zero unsaved command entries, no recorder errors, and advancing saved timestamps. A pending 229,058-byte batch was observed at 22:41:44 and drained by the next sample. All samples reported 23/23 healthy sources, 320 strings and eight healthy PCS reports/switch feeds. Thermal storage continued recording 336 units with seven-day retention; its prior cumulative dropped count remained 336, with no new losses or pause. The sampled pre-existing thermal shard hash remained unchanged.

Reviews succeeded for all eight arrays and exposed 40 recorded strings per array. Latest saved kW, kVAR, DC volts and DC amps matched the canonical PCS API for all eight arrays in the comparison; this compares observations taken at nearby times, not an atomic device capture. An Array 1 / String 2 review retained that string plus independent PCS and block-app context. The refreshed browser displayed Connection Live / Polling Active and successfully rendered the history panel, 51 coverage streams, populated string targets, and zero-loss queue counters. This is a short validation window, not an overnight endurance guarantee. No equipment commands were sent or existing balancing tests modified. Nothing was committed, pushed, or deployed to the Dell.
