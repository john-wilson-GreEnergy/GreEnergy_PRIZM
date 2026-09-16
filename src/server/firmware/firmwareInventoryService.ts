import fs from "fs";
import path from "path";
import { ProfileStore } from "../profiles/profileStore";
import { getFeatherCache } from "../feather/featherClient";
import { getEmsStringIpMap } from "../emsTurtleClient";

export interface FirmwareInventoryRow {
  deviceType: "TURTLE" | "BMS" | "SC" | "BPC" | "FEATHER";
  arrayIndex?: number;
  stringIndex?: number;
  deviceIndex?: number;
  ipAddress?: string | null;
  version: string;
  status: "reported" | "missing";
  timestamp?: string | null;
}

export interface FirmwareInventorySnapshot {
  snapshotId: string;
  capturedAt: string;
  profileId: string;
  siteName: string;
  source: string;
  scope: "site" | "target";
  summary: {
    turtleVersions: Record<string, number>;
    bmsVersions: Record<string, number>;
    scVersions: Record<string, number>;
    bpcVersions: Record<string, number>;
    featherVersions: Record<string, number>;
    mismatchCount: number;
    missingCount: number;
  };
  details: FirmwareInventoryRow[];
}

const SNAPSHOT_FILE = path.resolve(process.cwd(), ".prizm-data", "firmware-inventory.json");
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
let snapshot: FirmwareInventorySnapshot | null = null;
let capturePromise: Promise<FirmwareInventorySnapshot> | null = null;
let automationTimer: NodeJS.Timeout | null = null;

function versionOf(value: any): string {
  if (!value || typeof value !== "object") return "Unknown";
  const major = Number(value.fwVersionMajor);
  const minor = Number(value.fwVersionMinor);
  const revision = Number(value.fwVersionRevision);
  if (![major, minor, revision].every(Number.isFinite) || (major === 0 && minor === 0 && revision === 0)) return "Unknown";
  return `${major}.${minor}.${revision}`;
}

function increment(target: Record<string, number>, version: string) {
  target[version] = (target[version] || 0) + 1;
}

function buildStringIpIndex(source: any): Map<string, string> {
  let rows: any[] = [];
  if (Array.isArray(source)) rows = source;
  else if (source && typeof source === "object") rows = Object.values(source);
  else if (typeof source === "string") {
    rows = (source.match(/\{[\s\S]*?\}/g) || []).flatMap(candidate => {
      try { return [JSON.parse(candidate)]; } catch { return []; }
    });
  }
  const index = new Map<string, string>();
  for (const row of rows) {
    const arrayIndex = Number(row?.arrayIndex ?? row?.array ?? row?.ArrayIndex ?? row?.Array);
    const stringIndex = Number(row?.stringIndex ?? row?.string ?? row?.StringIndex ?? row?.String);
    const ip = row?.ipAddress ?? row?.ip ?? row?.IPAddress ?? row?.stringControllerIp ?? row?.controllerIp;
    if (Number.isFinite(arrayIndex) && Number.isFinite(stringIndex) && ip) index.set(`${arrayIndex}:${stringIndex}`, String(ip));
  }
  return index;
}

function loadSnapshot(): FirmwareInventorySnapshot | null {
  if (snapshot) return snapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
  } catch {
    snapshot = null;
  }
  return snapshot;
}

function persist(next: FirmwareInventorySnapshot) {
  fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
  const temp = `${SNAPSHOT_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(temp, SNAPSHOT_FILE);
  snapshot = next;
}

async function fetchJson(url: string, timeoutMs = 20_000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function mapLimited<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await task(item);
    }
  });
  await Promise.all(workers);
}

function reportProgress(report: any, arrayIndex: number, stringIndex?: number) {
  const strings = report?.arrayFirmwareReport?.[String(arrayIndex)]?.stringFirmwareReport || {};
  const candidates = stringIndex ? [strings[String(stringIndex)]] : Object.values<any>(strings);
  let total = 0;
  let reported = 0;
  for (const stringReport of candidates) {
    for (const bpc of Object.values<any>(stringReport?.batteryPackFirmwareReport || {})) {
      total++;
      if (versionOf(bpc?.firmwareVersion) !== "Unknown") reported++;
    }
  }
  return { total, reported, stringCount: candidates.filter(Boolean).length };
}

export function getLatestFirmwareSnapshot(): FirmwareInventorySnapshot | null {
  return loadSnapshot();
}

export function getFirmwareCaptureState() {
  return { running: !!capturePromise, snapshot: loadSnapshot() };
}

export async function triggerFirmwareCapture(options: { force?: boolean; arrayIndex?: number; stringIndex?: number } = {}): Promise<FirmwareInventorySnapshot> {
  if (capturePromise) return capturePromise;
  const existing = loadSnapshot();
  if (!options.force && existing?.scope === "site" && existing.source === "ems-triggered-firmware-report-v4" && Date.now() - new Date(existing.capturedAt).getTime() < MAX_AGE_MS) return existing;

  capturePromise = (async () => {
    const profile = ProfileStore.getActiveProfile();
    const baseUrl = `http://${profile.emsHost}:${profile.emsPort}${profile.turtlePath}`;
    const arrays = options.arrayIndex ? [options.arrayIndex] : Array.from({ length: profile.arrayCount }, (_, index) => index + 1);

    await mapLimited(arrays, 2, async arrayIndex => {
      const triggerPath = options.stringIndex
        ? `/tools/controls/ems/string/firmware/array/${arrayIndex}/string/${options.stringIndex}/report/trigger`
        : `/tools/controls/ems/string/firmware/array/${arrayIndex}/report/trigger`;
      await fetchJson(`${baseUrl}${triggerPath}`, 30_000);
    });

    const reports: any[] = [];
    await mapLimited(arrays, 3, async arrayIndex => {
      let report: any = null;
      let bestReport: any = null;
      let bestReported = -1;
      for (let attempt = 0; attempt < 10; attempt++) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 2_000));
        report = await fetchJson(`${baseUrl}/tools/controls/ems/string/firmware/array/${arrayIndex}/report/results.json`, 30_000);
        const progress = reportProgress(report, arrayIndex, options.stringIndex);
        if (progress.reported > bestReported) {
          bestReport = report;
          bestReported = progress.reported;
        }
        const expectedStrings = options.stringIndex ? 1 : profile.stringsPerArray;
        if (progress.stringCount >= expectedStrings && progress.total > 0 && progress.reported === progress.total) break;
      }
      reports.push(bestReport || report);
    });

    const details: FirmwareInventoryRow[] = [];
    const stringIpIndex = buildStringIpIndex(getEmsStringIpMap()?.data);
    let turtleVersion = "Unknown";
    try {
      const controllerStatistics = await fetchJson(`${baseUrl}/tools/report/ems/controllerStatistics.json`, 20_000);
      turtleVersion = versionOf(controllerStatistics?.controllerStatisticsData?.turtleVersion);
    } catch {
      // The Phoenix firmware reports remain useful when site-level statistics are unavailable.
    }
    for (const report of reports) {
      const arrayReports = report?.arrayFirmwareReport || {};
      for (const [arrayKey, arrayReport] of Object.entries<any>(arrayReports)) {
        const phoenixVersion = versionOf(report?.firmwareVersion);
        details.push({ deviceType: "BMS", arrayIndex: Number(arrayKey), version: phoenixVersion, status: phoenixVersion === "Unknown" ? "missing" : "reported" });
        for (const [stringKey, stringReport] of Object.entries<any>(arrayReport?.stringFirmwareReport || {})) {
          const stringIp = stringIpIndex.get(`${Number(arrayKey)}:${Number(stringKey)}`) || null;
          details.push({ deviceType: "SC", arrayIndex: Number(arrayKey), stringIndex: Number(stringKey), ipAddress: stringIp, version: versionOf(stringReport?.firmwareVersion), status: versionOf(stringReport?.firmwareVersion) === "Unknown" ? "missing" : "reported", timestamp: stringReport?.timeStamp || null });
          for (const [bpcKey, bpcReport] of Object.entries<any>(stringReport?.batteryPackFirmwareReport || {})) {
            const version = versionOf(bpcReport?.firmwareVersion);
            details.push({ deviceType: "BPC", arrayIndex: Number(arrayKey), stringIndex: Number(stringKey), deviceIndex: Number(bpcKey), version, status: version === "Unknown" ? "missing" : "reported", timestamp: stringReport?.timeStamp || null });
          }
        }
      }
    }
    details.unshift({ deviceType: "TURTLE", version: turtleVersion, status: turtleVersion === "Unknown" ? "missing" : "reported" });

    const verifiedStringIps = new Set(stringIpIndex.values());
    for (const device of getFeatherCache().devices || []) {
      if (verifiedStringIps.has(device.deviceIp)) continue;
      const version = device.firmwareVersion || "Unknown";
      details.push({ deviceType: "FEATHER", arrayIndex: device.arrayIndex ?? undefined, deviceIndex: device.stringIndex ?? undefined, ipAddress: device.deviceIp, version, status: version === "Unknown" ? "missing" : "reported", timestamp: device.lastUpdatedAt });
    }

    const summary = { turtleVersions: {} as Record<string, number>, bmsVersions: {} as Record<string, number>, scVersions: {} as Record<string, number>, bpcVersions: {} as Record<string, number>, featherVersions: {} as Record<string, number>, mismatchCount: 0, missingCount: 0 };
    for (const row of details) {
      if (row.status === "missing") summary.missingCount++;
      const target = row.deviceType === "TURTLE" ? summary.turtleVersions : row.deviceType === "BMS" ? summary.bmsVersions : row.deviceType === "SC" ? summary.scVersions : row.deviceType === "BPC" ? summary.bpcVersions : summary.featherVersions;
      increment(target, row.version);
    }
    summary.mismatchCount = [summary.bmsVersions, summary.scVersions, summary.bpcVersions, summary.featherVersions].filter(group => Object.keys(group).filter(key => key !== "Unknown").length > 1).length;

    const next: FirmwareInventorySnapshot = {
      snapshotId: `firmware-${Date.now()}`,
      capturedAt: new Date().toISOString(),
      profileId: profile.id,
      siteName: profile.siteName,
      source: "ems-triggered-firmware-report-v4",
      scope: options.arrayIndex || options.stringIndex ? "target" : "site",
      summary,
      details: details.sort((a, b) => (a.deviceType.localeCompare(b.deviceType) || (a.arrayIndex || 0) - (b.arrayIndex || 0) || (a.stringIndex || 0) - (b.stringIndex || 0) || (a.deviceIndex || 0) - (b.deviceIndex || 0)))
    };
    persist(next);
    return next;
  })();

  try {
    return await capturePromise;
  } finally {
    capturePromise = null;
  }
}

export function initializeFirmwareInventoryAutomation() {
  if (automationTimer) clearInterval(automationTimer);
  setTimeout(() => triggerFirmwareCapture().catch(error => console.warn("[Firmware Inventory] Automatic capture failed:", error?.message || error)), 20_000);
  automationTimer = setInterval(() => triggerFirmwareCapture().catch(error => console.warn("[Firmware Inventory] Scheduled capture failed:", error?.message || error)), MAX_AGE_MS);
}
