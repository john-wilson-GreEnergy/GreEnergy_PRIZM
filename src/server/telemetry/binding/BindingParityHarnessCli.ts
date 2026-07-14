import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getLatestTelemetrySnapshot } from '../TelemetryRuntime';
import { ensureTopologyGraphCurrent, getLatestTopologyGraphSnapshot, getLatestTopologySourceSnapshot, getTopologyGraphFingerprint } from '../../topology/TopologyGraphRuntime';
import { parseCsvQuotesAware } from '../../topology/turtleParsers';
import { CACHE_ROOT } from '../../cache/prizmCache';
import { BindingParityHarness } from './BindingParityHarness';

async function cachedBrokerSnapshot(): Promise<Readonly<Record<string, unknown>>> {
  const entries = await readdir(CACHE_ROOT, { recursive: true }); const relative = entries.find((entry) => entry.endsWith(path.join('raw', 'raw__tools_report_ems_strings_csv.csv')));
  if (!relative) throw new Error('Persisted strings.csv cache artifact is unavailable');
  const parsed = parseCsvQuotesAware(await readFile(path.join(CACHE_ROOT, relative), 'utf8')); const [headers = [], ...values] = parsed;
  const rows = values.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
  const metadataPath = path.join(path.dirname(path.dirname(path.join(CACHE_ROOT, relative))), 'raw__tools_report_ems_strings_csv.json'); let cycleId: number | null = null;
  try { const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as { cacheMeta?: { cycleId?: unknown } }; const value = Number(metadata.cacheMeta?.cycleId); cycleId = Number.isSafeInteger(value) && value > 0 ? value : null; } catch { /* CSV remains a valid immutable observation without cache metadata. */ }
  return { cycleId, authorities: { 'string-telemetry': { chosenProviderId: 'turtle', fallbackUsed: false, stale: false, sourceEndpoint: 'persisted:strings.csv' } }, health: { turtle: { healthy: true, source: 'persisted-cache' } }, unified: { stringTelemetry: { rows: rows.map((raw) => ({ raw })), totalRows: rows.length } } };
}

async function main(): Promise<void> {
  const broker = getLatestTelemetrySnapshot() ?? await cachedBrokerSnapshot();
  await ensureTopologyGraphCurrent('binding-parity-cli:cached-snapshot');
  const graph = getLatestTopologyGraphSnapshot(); const source = getLatestTopologySourceSnapshot(); const graphFingerprint = getTopologyGraphFingerprint();
  if (!graph || !source || !graphFingerprint) throw new Error('Cached topology graph is unavailable');
  const report = await new BindingParityHarness().run({ brokerSnapshot: broker as unknown as Readonly<Record<string, unknown>>, graph, graphFingerprint, graphSourceFingerprint: source.fingerprint });
  const output = path.resolve(process.cwd(), 'bindingParityReport.json'); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(report.pass ? 'PASS' : 'FAIL'); console.log(output); if (!report.pass) process.exitCode = 1;
}

main().catch((error) => { console.error('FAIL'); console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
