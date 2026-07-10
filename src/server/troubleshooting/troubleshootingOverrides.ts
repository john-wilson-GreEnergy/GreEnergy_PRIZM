import fs from "fs";
import path from "path";
import { TROUBLESHOOTING_KB, TroubleshootingEntry } from "./troubleshootingKnowledgeBase";

const DATA_DIR = path.resolve(process.cwd(), ".prizm-data");
const OVERRIDE_PATH = path.join(DATA_DIR, "troubleshooting-guidance-overrides.json");

export type TroubleshootingOverride = Partial<TroubleshootingEntry> & {
  id: string;
  overrideEnabled?: boolean;
  overrideUpdatedAt?: string;
  overrideSource?: string;
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readTroubleshootingOverrides(): Record<string, TroubleshootingOverride> {
  try {
    ensureDataDir();

    if (!fs.existsSync(OVERRIDE_PATH)) {
      fs.writeFileSync(OVERRIDE_PATH, JSON.stringify({}, null, 2));
      return {};
    }

    const raw = fs.readFileSync(OVERRIDE_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    console.warn("[TroubleshootingOverrides] Failed to read overrides:", err);
    return {};
  }
}

export function writeTroubleshootingOverrides(overrides: Record<string, TroubleshootingOverride>) {
  ensureDataDir();
  fs.writeFileSync(OVERRIDE_PATH, JSON.stringify(overrides || {}, null, 2));
}

export function getMergedTroubleshootingLibrary(): TroubleshootingEntry[] {
  const overrides = readTroubleshootingOverrides();

  return TROUBLESHOOTING_KB.map((entry) => {
    const override = overrides[entry.id];

    if (!override || override.overrideEnabled === false) {
      return {
        ...entry,
        overrideStatus: "built-in"
      } as any;
    }

    return {
      ...entry,
      ...override,
      id: entry.id,
      source: override.overrideSource || "admin-override",
      overrideStatus: "override",
      builtInSource: entry.source
    } as any;
  });
}

export function saveTroubleshootingOverride(id: string, patch: Partial<TroubleshootingEntry>) {
  const builtIn = TROUBLESHOOTING_KB.find((entry) => entry.id === id);
  if (!builtIn) {
    throw new Error(`Troubleshooting matrix entry not found: ${id}`);
  }

  const overrides = readTroubleshootingOverrides();

  overrides[id] = {
    ...overrides[id],
    ...patch,
    id,
    overrideEnabled: true,
    overrideUpdatedAt: new Date().toISOString(),
    overrideSource: "admin-override"
  };

  writeTroubleshootingOverrides(overrides);

  return overrides[id];
}

export function deleteTroubleshootingOverride(id: string) {
  const overrides = readTroubleshootingOverrides();
  const existed = !!overrides[id];

  delete overrides[id];
  writeTroubleshootingOverrides(overrides);

  return existed;
}
