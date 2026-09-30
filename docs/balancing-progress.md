# Balancing progress review

Read-only addition to Operational history & incident timeline on the string and PCS pages. Choose an array, load recorded targets, then choose a string and refresh for a spread chart and active-cell list.

## Data path

Existing canonical string snapshots → existing one-minute string history records → bounded server-side historical review → UI. No new device requests, polling timers, commands, or command-service behavior. Numeric spread/activity/cell changes do not produce extra history writes. Mode and deadband changes are saved as observed state events. The existing seven-day retention, 2 GiB cap and 5 GiB free-space reserve still apply; additional fields consume space and may reach the cap sooner.

Only explicitly normalized mV fields are used. Deadbands/target are summarized across canonical BPC rows: all known and equal, Mixed, or Unknown / incomplete. Active-cell voltage is never inferred from target or average. The current canonical fleet feed does not supply active-cell voltage; the separate string detail view can expose it, but this recorder does not acquire that extra feed. Missing BPC activity is not treated as zero.

Requested mode/target/deadbands, acceptance and command-service readback remain separate evidence in the command timeline. Reported controller mode may say Provided for an average-derived target. An independently observed setting is not labeled as confirmation of a specific command. Commands from other tools are not recorded as PRIZM commands.

## Trend and limitations

At least three valid samples over two minutes, within the latest continuous run (maximum source gap 120 seconds), are needed for an endpoint spread comparison. Gaps, unavailable samples, source changes, mode/target/deadband/rotation changes reset that comparison. The trend is decreased/increased/unchanged, not a diagnosis or proof of balancing effectiveness. Site load, cell behavior and intervening ADB activity can change spread. ADB's latest recorded state and string rotation are shown independently; no causal association is inferred.

Samples older than 120 seconds at report generation are stale and their summary readings are withheld. Historical charts show last saved observation per minute as dots without interpolation, not captured peaks or averages. Reviews may be cached up to 30 seconds and do not auto-refresh. No historic backfill; unknown settings, missing telemetry and zero active BPCs never become a false failure or a claim that balancing has completed.

## Rollback / validation

Set `PRIZM_BALANCING_PROGRESS_ENABLED=false` and restart to disable new progress projection and UI report fields. Existing state/command history, live data and controls are unchanged. `PRIZM_OPERATIONAL_TIMELINE_ENABLED=false` remains the whole-recorder rollback. Focused tests cover projection, zero/missing readings, state gaps, settings changes, minute cadence, saved review, flag rollback and read-only UI. Production build and live read-only browser/API parity checks are required. No live balancing command is needed for validation.

Local validation on 2026-09-23: production build passed; progress, recorder, routes, string projection, command history, EMS app history, balancing service and UI regression tests passed. Restarted the local production server and verified the browser's Array 1 / String 2 review. Saved samples at 20:10:36Z and 20:11:36Z showed spreads of 8 and 7 mV respectively, not an invented live match across different timestamps. Reported Provided mode, target 3267 mV, 1/1 mV deadbands, rotation IN and 14 active BPCs agreed with the canonical feed's corresponding fields during the read-only check. ADB was reported Disabled. Minute sampling, missing active-cell voltages and initial insufficient-history behavior were visible. Recorder reported no storage errors or dropped batches/commands. Full project type checking still reports existing errors outside the new progress modules. No equipment commands, commit, push or Dell deployment were performed.
