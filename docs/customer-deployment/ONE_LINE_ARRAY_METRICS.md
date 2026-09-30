# One-line array cell metrics

The shared browser snapshot adds `rollups.arrayCellMetrics`, projected on the server from canonical normalized strings. No additional device polling or control writes are performed. Existing array summaries are unchanged.

- Units: Celsius and millivolts.
- High/low: extrema across all reporting strings in the array, regardless of contactor or rotation state.
- Delta: array maximum minus array minimum, not the maximum within-string delta.
- Average: unweighted mean of reporting string averages, explicitly labeled in the tile. This is not a cell-weighted average on arrays with unequal string populations.
- Explicit communication failures, bad reports and stale-preserved/stale rows are excluded. Missing/nonfinite/inconsistent min/average/max triples are excluded independently for each metric family.
- Coverage is displayed against the greater of configured string count and distinct observed strings. Missing values remain unknown; incomplete coverage is marked Partial. Coverage is not a claim of synchronized acquisition across strings.

Validation (2026-09-26): aggregation, rendering and compact snapshot regression tests passed; TypeScript and production builds passed. Read-only live parity checked all eight arrays / 320 strings against the same published canonical snapshot. Browser showed all eight enhanced tiles; array drilldown and station-icon return still worked. No equipment commands sent.

Local generated-entry rollback files: `/tmp/prizm-before-array-metrics-4dqsW8` (index.html, signin.html, server.cjs and server.cjs.map). Previous hashed frontend assets remain in dist. Restore these entry files during an idle local runtime restart to return to the preceding build; history worker is unchanged. Tests also cover absence of the new rollup (UI shows Not reported) and unchanged legacy array summaries.

Focused tests:

```sh
node --require ./scripts/test-network-guard.cjs --import tsx src/server/telemetry/arrayCellMetrics.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx src/components/OneLineView.test.tsx
node --require ./scripts/test-network-guard.cjs --import tsx src/server/telemetry/compactStringRoutes.test.ts
```
