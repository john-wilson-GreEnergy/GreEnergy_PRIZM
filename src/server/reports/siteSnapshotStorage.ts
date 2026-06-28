import fs from 'fs';
import path from 'path';
import { SiteDataSnapshot } from './siteSnapshotTypes';

const SNAPSHOTS_DIR = path.join(process.cwd(), 'data', 'reports', 'snapshots');

export function ensureSnapshotsDir() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
}

export function getSnapshotsIndex(): any[] {
  ensureSnapshotsDir();
  const indexFile = path.join(SNAPSHOTS_DIR, 'index.json');
  if (fs.existsSync(indexFile)) {
    try {
      return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    } catch (err) {
      console.error('[reports] Failed to parse snapshots index', err);
      return [];
    }
  }
  return [];
}

export function saveSnapshotIndex(index: any[]) {
  ensureSnapshotsDir();
  const indexFile = path.join(SNAPSHOTS_DIR, 'index.json');
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8');
}

export function saveSnapshot(snapshot: SiteDataSnapshot) {
  ensureSnapshotsDir();
  
  const snapshotDir = path.join(SNAPSHOTS_DIR, snapshot.snapshotId);
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }
  
  const snapshotFile = path.join(snapshotDir, 'snapshot.json');
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2), 'utf8');
  
  const index = getSnapshotsIndex();
  
  const entry = {
    snapshotId: snapshot.snapshotId,
    snapshotType: snapshot.snapshotType,
    label: snapshot.label,
    capturedAt: snapshot.capturedAt,
    stationCode: snapshot.site?.stationCode,
    blockIndex: snapshot.site?.blockIndex,
    topologyFamily: snapshot.topology?.topologyFamily,
    siteReadiness: snapshot.sections?.executive?.siteReadiness,
    sourceConfidence: snapshot.sourceCoverage?.confidence,
    alarmCount: snapshot.sections?.executive?.alarmCount || 0,
    warningCount: snapshot.sections?.executive?.warningCount || 0,
    onlineStrings: snapshot.sections?.executive?.onlineStrings || 0,
    nearlineStrings: snapshot.sections?.executive?.nearlineStrings || 0,
    offlineStrings: snapshot.sections?.executive?.offlineStrings || 0,
    notCommunicatingStrings: snapshot.sections?.executive?.notCommunicatingStrings || 0,
    storedEnergyKWh: snapshot.sections?.executive?.storedEnergyKWh || 0,
    systemSocPct: snapshot.sections?.executive?.systemSocPct || 0
  };
  
  const existingIdx = index.findIndex(i => i.snapshotId === snapshot.snapshotId);
  if (existingIdx >= 0) {
    index[existingIdx] = entry;
  } else {
    index.push(entry);
  }
  
  saveSnapshotIndex(index);
}

export function loadSnapshot(snapshotId: string): SiteDataSnapshot | null {
  ensureSnapshotsDir();
  const snapshotFile = path.join(SNAPSHOTS_DIR, snapshotId, 'snapshot.json');
  if (fs.existsSync(snapshotFile)) {
    try {
      return JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
    } catch (err) {
      console.error(`[reports] Failed to load snapshot ${snapshotId}`, err);
      return null;
    }
  }
  return null;
}

export function deleteSnapshot(snapshotId: string): boolean {
  ensureSnapshotsDir();
  const snapshotDir = path.join(SNAPSHOTS_DIR, snapshotId);
  if (fs.existsSync(snapshotDir)) {
    try {
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`[reports] Failed to delete snapshot dir ${snapshotId}`, err);
    }
  }
  
  const index = getSnapshotsIndex();
  const newIndex = index.filter(i => i.snapshotId !== snapshotId);
  saveSnapshotIndex(newIndex);
  return true;
}
