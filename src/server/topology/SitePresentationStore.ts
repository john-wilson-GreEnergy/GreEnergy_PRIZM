import fs from "fs";
import path from "path";

export interface SitePresentationArray {
  arrayIndex: number;
  physicalLabel: string;
  zone: string;
  order: number;
}

export interface SitePresentationProfile {
  schemaVersion: 1;
  siteKey: string;
  updatedAt: string;
  columns: number;
  arrays: SitePresentationArray[];
  segmentLabels: Record<string, string>;
}

const STORE_DIR = path.resolve(process.cwd(), ".prizm-data", "site-presentation");
const safeKey = (value: string) => value.replace(/[^a-z0-9._-]/gi, "-");

function fileFor(siteKey: string) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  return path.join(STORE_DIR, `${safeKey(siteKey)}.json`);
}

export function loadSitePresentation(siteKey: string, arrayIndices: number[]): SitePresentationProfile {
  const target = fileFor(siteKey);
  let saved: Partial<SitePresentationProfile> = {};
  try { if (fs.existsSync(target)) saved = JSON.parse(fs.readFileSync(target, "utf8")); } catch { saved = {}; }
  const savedByArray = new Map((saved.arrays || []).map(array => [Number(array.arrayIndex), array]));
  return {
    schemaVersion: 1,
    siteKey,
    updatedAt: saved.updatedAt || new Date(0).toISOString(),
    columns: Math.min(8, Math.max(1, Number(saved.columns) || 4)),
    arrays: arrayIndices.map((arrayIndex, order) => ({
      arrayIndex,
      physicalLabel: String(savedByArray.get(arrayIndex)?.physicalLabel || ""),
      zone: String(savedByArray.get(arrayIndex)?.zone || ""),
      order: Number.isFinite(savedByArray.get(arrayIndex)?.order) ? Number(savedByArray.get(arrayIndex)?.order) : order
    })).sort((a, b) => a.order - b.order),
    segmentLabels: saved.segmentLabels && typeof saved.segmentLabels === "object" ? saved.segmentLabels : {}
  };
}

export function saveSitePresentation(profile: SitePresentationProfile): SitePresentationProfile {
  const normalized: SitePresentationProfile = {
    schemaVersion: 1,
    siteKey: profile.siteKey,
    updatedAt: new Date().toISOString(),
    columns: Math.min(8, Math.max(1, Number(profile.columns) || 4)),
    arrays: profile.arrays.map((array, order) => ({
      arrayIndex: Number(array.arrayIndex),
      physicalLabel: String(array.physicalLabel || "").trim().slice(0, 80),
      zone: String(array.zone || "").trim().slice(0, 80),
      order
    })),
    segmentLabels: Object.fromEntries(Object.entries(profile.segmentLabels || {}).map(([key, value]) => [key, String(value || "").trim().slice(0, 80)]))
  };
  const target = fileFor(profile.siteKey);
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(normalized, null, 2), "utf8");
  fs.renameSync(temporary, target);
  return normalized;
}
