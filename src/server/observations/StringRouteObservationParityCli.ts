import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CACHE_ROOT } from '../cache/prizmCache';
import { buildStringBucketSummary } from '../siteOperations';
import { parseCsvQuotesAware } from '../topology/turtleParsers';
import { normalizeLocalStringRows } from '../localStringsBrokerRoute';
import { TelemetryBindingResolver } from '../telemetry/binding';
import { ensureTopologyGraphCurrent, getLatestTopologyGraphSnapshot, getLatestTopologySourceSnapshot, getTopologyGraphFingerprint } from '../topology/TopologyGraphRuntime';
import { ObservationResolver } from './ObservationResolver';
import { StringRouteObservationParityHarness } from './StringRouteObservationParityHarness';

async function main() {
  const entries = await readdir(CACHE_ROOT, { recursive: true }); const relative = entries.find((entry) => entry.endsWith(path.join('raw', 'raw__tools_report_ems_strings_csv.csv'))); if (!relative) throw new Error('Persisted strings.csv unavailable');
  const csvPath = path.join(CACHE_ROOT, relative); const parsed = parseCsvQuotesAware(await readFile(csvPath, 'utf8')); const [headers = [], ...cells] = parsed; const raw = cells.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))); const meta = { source: 'same-cycle-route-parity', staleData: false, lastUpdated: null, activeEmsBaseUrl: null, activeProfileName: null, activeProfileId: null, stationCode: null, blockIndex: null, lastError: null, cacheProfileId: null, cacheEmsBaseUrl: null, cacheCreatedAt: null, cacheLastUpdatedAt: null }; const rows = normalizeLocalStringRows(raw, [], meta); let cachedCycleId: number | null = null; try { const metadata = JSON.parse(await readFile(path.join(path.dirname(path.dirname(csvPath)), 'raw__tools_report_ems_strings_csv.json'), 'utf8')) as { cacheMeta?: { cycleId?: unknown } }; const candidate = Number(metadata.cacheMeta?.cycleId); cachedCycleId = Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null; } catch { /* A persisted CSV remains a valid immutable snapshot without metadata. */ }
  await ensureTopologyGraphCurrent('observation-route-parity:cached-only'); const graph = getLatestTopologyGraphSnapshot(); const source = getLatestTopologySourceSnapshot(); const graphFingerprint = getTopologyGraphFingerprint(); if (!graph || !source || !graphFingerprint) throw new Error('Cached graph unavailable');
  const cycleId = cachedCycleId ?? source.cycleId; const binding = await new TelemetryBindingResolver().build({ graph, graphFingerprint, graphSourceFingerprint: source.fingerprint, graphHealthy: true, graphCycleId: source.cycleId, profileIdentity: null, telemetryProfileIdentity: null, cycleId, capturedAt: null, strings: rows, controllerHealth: null, authorities: { 'string-telemetry': { chosenProviderId: 'turtle', stale: false } }, providerHealth: { turtle: { healthy: true } } }); const observations = new ObservationResolver().build(binding);
  const dashboardRows = rows.map((row) => ({ ...row, stringKey: `A${row.arrayIndex}-S${row.stringIndex}` })); const report = new StringRouteObservationParityHarness().run({ normalizedRows: rows, observationSnapshot: observations, graph, legacyResponses: { 'local-strings': { ...meta, cycleId, data: rows }, 'strings-dashboard': { cycleId, strings: dashboardRows }, 'site-operations': { cycleId, stringSummary: buildStringBucketSummary(rows) } } });
  const output = path.resolve(process.cwd(), 'reports/generated/stringRouteObservationParityReport.json'); await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); console.log(report.pass ? 'PASS' : 'FAIL'); console.log(output); if (!report.pass) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
