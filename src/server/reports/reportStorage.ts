import fs from 'fs/promises';
import path from 'path';
import { SiteHealthSnapshot, ReportIndexEntry, SiteReportPayload } from './reportTypes';

const REPORTS_DIR = path.join(process.cwd(), 'data', 'reports');
const SNAPSHOTS_DIR = path.join(REPORTS_DIR, 'snapshots');
const INDEX_FILE = path.join(REPORTS_DIR, 'reports-index.json');

// Ensure directories exist
async function initDirs() {
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
}

export async function getReportIndex(): Promise<ReportIndexEntry[]> {
  await initDirs();
  try {
    const data = await fs.readFile(INDEX_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }
    console.error('Failed to read report index', err);
    return [];
  }
}

export async function addReportToIndex(entry: ReportIndexEntry) {
  const index = await getReportIndex();
  index.unshift(entry);
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
}

export async function saveSnapshot(snapshot: SiteHealthSnapshot) {
  await initDirs();
  const filePath = path.join(SNAPSHOTS_DIR, `snapshot-${snapshot.snapshotId}.json`);
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
}

export async function getSnapshots(): Promise<SiteHealthSnapshot[]> {
  await initDirs();
  const files = await fs.readdir(SNAPSHOTS_DIR);
  const snapshots: SiteHealthSnapshot[] = [];
  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const data = await fs.readFile(path.join(SNAPSHOTS_DIR, file), 'utf-8');
        snapshots.push(JSON.parse(data));
      } catch (err) {
        console.error('Failed to read snapshot file:', file, err);
      }
    }
  }
  // Sort descending by capturedAt
  return snapshots.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
}

export async function getSnapshot(snapshotId: string): Promise<SiteHealthSnapshot | null> {
  await initDirs();
  const filePath = path.join(SNAPSHOTS_DIR, `snapshot-${snapshotId}.json`);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

export async function deleteSnapshot(snapshotId: string) {
  await initDirs();
  const filePath = path.join(SNAPSHOTS_DIR, `snapshot-${snapshotId}.json`);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    console.error('Failed to delete snapshot:', snapshotId, err);
  }
}

export async function saveReport(payload: SiteReportPayload, pdfBuffer: Buffer, csvs: { name: string; content: string }[] = []) {
  await initDirs();
  const reportDir = path.join(REPORTS_DIR, payload.reportId);
  await fs.mkdir(reportDir, { recursive: true });

  const jsonPath = path.join(reportDir, 'report.json');
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf-8');

  const pdfPath = path.join(reportDir, 'report.pdf');
  await fs.writeFile(pdfPath, pdfBuffer);

  const csvPaths: string[] = [];
  for (const csv of csvs) {
    const csvPath = path.join(reportDir, csv.name);
    await fs.writeFile(csvPath, csv.content, 'utf-8');
    csvPaths.push(csvPath);
  }

  const indexEntry: ReportIndexEntry = {
    reportId: payload.reportId,
    reportType: payload.reportType,
    title: payload.title,
    createdAt: payload.generatedAt,
    stationCode: payload.site.stationCode,
    blockIndex: payload.site.blockIndex,
    topologyFamily: payload.topology.layoutFamily,
    pdfPath,
    jsonPath,
    csvPaths,
    sourceFreshnessStatus: payload.freshness.overallStatus,
    warnings: payload.freshness.warnings
  };

  await addReportToIndex(indexEntry);
  return indexEntry;
}

export async function getReportPath(reportId: string, filename: string): Promise<string | null> {
  const filePath = path.join(REPORTS_DIR, reportId, filename);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return null;
  }
}

export async function deleteReport(reportId: string) {
  const reportDir = path.join(REPORTS_DIR, reportId);
  try {
    await fs.rm(reportDir, { recursive: true, force: true });
    
    // Update index
    const index = await getReportIndex();
    const updatedIndex = index.filter(r => r.reportId !== reportId);
    await fs.writeFile(INDEX_FILE, JSON.stringify(updatedIndex, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to delete report:', reportId, err);
  }
}
