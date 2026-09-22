# Thermal targets and outliers

The Thermal Controls **Targets** panel is the sole selection surface for trends
and targeted recording. Its array, segment type (collection/energy/all), HVAC
unit, search, quality and fault filters define the candidate subset. Filtering
does not remove existing selections. **Add matching** and **Remove matching**
operate across all result pages.

**Highest 1/3/5 per array** ranks live, finite readings within that subset by the
**Targets & trends metric**, independently of the **Overhead metric**. The target
metric selector stays accessible when the target list is collapsed and drives
target readings, per-array ranks, the optional outlier overview and graphs.
Changing the overhead metric only changes map readings/colors; it does not
reload history or reset target filters. Changing the target metric preserves
selected targets and clears numeric history bounds tied to the previous metric.
Amperage and RPM rank individual HVAC units. Shared
segment measurements (including cell and enclosure temperatures) rank distinct
segments, keeping matching HVAC rows together. Ties use deterministic segment
and unit order; the limit is not expanded to include every tied segment. The
ranking updates with cached telemetry, but selected trend/recording targets
remain fixed until the technician changes them. This is a comparison tool, not
an alarm threshold or a historical maximum search.

## Data path

### Saved views and quick filters

The collapsible Saved views panel is not another target selector. Quick filters
prepare the existing Targets list (highest amperage per array, hottest ES, or
CS only); Add matching remains the explicit action to change graph targets.
Named views restore fixed target IDs, target filters, both metrics, overhead
array/colors, time window, history filters/source, trace visibility/page and
command-band preference. They never invoke recording or equipment controls.
Up to 20 named views are stored in browser local storage, scoped by active
profile, station and block. Saving the same name explicitly updates that view.
Unavailable saved devices remain missing; no automatic target substitution.
Views are not transferred to another browser or to the Dell deployment.

### Time-aligned review and command bands

The service attaches a `review` projection to each returned history sample:
formatted value, eligibility, expiry and command description derived from
canonical recorded command bits. The frontend indexes those returned samples
once and uses a binary lookup for each visible trace at the cursor. It never
chooses a future sample or interpolates a missing value. Observations expire
after two minutes. Filtered, stale, unavailable and CS cell readings remain
explicitly invalid. Cursor age is relative to the review time, not wall clock.
Hover displays a compact table without updating workspace state; a chart click
pins detailed readings/commands. The pinned device inspector uses the same
non-future lookup and validity rules.

Amperage can display optional command bands for the visible trace page. Live
buffer/targeted recordings carry observed commands to the next sample, at most
two minutes and never past the final observation. Whole-site summaries display
sample markers only: downsampling does not preserve every command transition,
so a continuous commanded interval must not be inferred. Old recordings with
no command bits show Unknown, regardless of current or stored mode text.
Idle refers to compressor/electric heat demand, not a guarantee of zero fan
current. These are diagnostic comparisons, not automatic mismatch alarms.

No extra hardware polling, historian writes or controller commands were added.
Existing point fields remain intact for older clients. To return to the simpler
view, hide command bands, close Saved views and unpin the comparison. A prior
frontend build can still consume these additive history responses.

### Graph visibility

The legend below the trend toggles each target's line without changing target
selection, queries, exports, or recordings. **Only** isolates a trace, and
**Show all overlays** restores normal visibility. Hidden labels remain in the
legend, even if every line is hidden. Visibility survives telemetry refreshes
and trace-page changes; the legend shows the current page of up to 16 targets.
Moving to another trace page exits solo mode. Shared-temperature HVAC traces
may overlap; **Only** is useful to inspect one of those targets unambiguously.

`POST /api/local/site-data/thermal/targets/query` is read-only. The service combines
retained device metadata with the current canonical thermal snapshot and applies
`selectThermalTargets`. It does not poll hardware or issue commands. Requests
follow the existing workspace refresh and are cancelled when filters change.
Bulk selection is disabled while a changed query is pending or has failed.

Collection segment identity comes from mapped topology/segment labels, never
temperature magnitude or a hard-coded IP suffix. Canonical collection-segment
points carry `segmentType: CS`, with `cell` and `cellRate` null. Their current
readings display **N/A — no cells**; they do not enter numeric rankings or plots.
Enclosure/supply/control/outside temperatures and amperage remain available.
Unknown segment identities are not guessed to be energy or collection segments.

Older retained samples are sanitized using their saved segment identity before
filtering/downsampling. Older targeted recordings use saved target labels (or
current mapped identity). Original recording files are not rewritten. The
normalized query/export includes null cell fields, not the placeholder maximum.

## Verification and rollback

Focused tests: `thermalTargets.test.ts`, `collectionHistory.test.ts`,
`thermalMetrics.test.ts`, `thermalReview.test.tsx`,
`thermalTraceVisibility.test.tsx`, and `ThermalSelection.test.tsx`. Live verification should
check CS null values, valid ES values, subset ranks for each array, and retained
CS query results. UI verification should check that changing rank/filter options
preserves selected targets. Choose **Show all matches** to leave ranked mode;
**Reset filters** restores the full target list. No history format migration is
required, and older builds can read the additive point metadata.
