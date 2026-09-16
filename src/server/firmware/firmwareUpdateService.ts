import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { ProfileStore } from "../profiles/profileStore";
import { getEmsConnectionStatus } from "../emsTurtleClient";
import { getLatestFirmwareSnapshot, triggerFirmwareCapture } from "./firmwareInventoryService";

export type FirmwareUpdateType = "SC" | "BPC";
export type FirmwareUpdateScope = "array" | "string";

export interface FirmwareUpdateRequest {
  deviceType: FirmwareUpdateType;
  version: string;
  scope: FirmwareUpdateScope;
  arrayIndex?: number;
  stringIndex?: number;
  confirmed: boolean;
}

export interface FirmwareUpdateResult {
  operationId: string;
  accepted: boolean;
  state: "accepted" | "rejected";
  requestedAt: string;
  deviceType: FirmwareUpdateType;
  version: string;
  scope: FirmwareUpdateScope;
  targetLabel: string;
  responseStatus: number;
  responseText: string;
  verification: "scheduled" | "not-scheduled";
}

const AUDIT_FILE = path.resolve(process.cwd(), "data", "audit", "firmware_update_audit.jsonl");
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
let updatePromise: Promise<FirmwareUpdateResult> | null = null;
let lastResult: FirmwareUpdateResult | null = null;

function audit(record: Record<string, unknown>) {
  try {
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(record)}\n`, "utf8");
  } catch (error) {
    console.error("[Firmware Update] Failed to write audit record:", error);
  }
}

function availableVersions(deviceType: FirmwareUpdateType) {
  const snapshot = getLatestFirmwareSnapshot();
  const counts = new Map<string, number>();
  (snapshot?.details || [])
    .filter(row => row.deviceType === deviceType && row.status === "reported" && VERSION_PATTERN.test(row.version))
    .forEach(row => counts.set(row.version, (counts.get(row.version) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0], undefined, { numeric: true }))
    .map(([version]) => version);
}

export function getFirmwareUpdateState() {
  const catalog = {
    SC: availableVersions("SC"),
    BPC: availableVersions("BPC")
  };
  return { running: !!updatePromise, lastResult, catalog };
}

function positiveInteger(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive whole number.`);
  return parsed;
}

function validate(request: FirmwareUpdateRequest) {
  if (request.confirmed !== true) throw new Error("Update confirmation is required.");
  if (!["SC", "BPC"].includes(request.deviceType)) throw new Error("Unsupported firmware device type.");
  const match = VERSION_PATTERN.exec(request.version);
  if (!match) throw new Error("Firmware version must use major.minor.revision format.");
  if (!availableVersions(request.deviceType).includes(request.version)) {
    throw new Error(`${request.version} was not observed on a reporting ${request.deviceType} device at this site.`);
  }

  const profile = ProfileStore.getActiveProfile();
  if (!profile) throw new Error("No active site profile is available.");
  if (getEmsConnectionStatus().isDemoFallback) throw new Error("Firmware updates are unavailable while PRIZM is using demo data.");

  const [major, minor, revision] = match.slice(1).map(Number);
  if (request.scope !== "array" && request.scope !== "string") throw new Error("SC and BPC firmware require an array or string target.");
  const arrayIndex = positiveInteger(request.arrayIndex, "Array");
  if (arrayIndex > profile.arrayCount) throw new Error(`Array ${arrayIndex} is outside the active site topology.`);
  const stringIndex = request.scope === "string" ? positiveInteger(request.stringIndex, "String") : undefined;
  if (stringIndex && stringIndex > profile.stringsPerArray) throw new Error(`String ${stringIndex} is outside the active site topology.`);
  return {
    profile, major, minor, revision, arrayIndex, stringIndex,
    targetLabel: stringIndex ? `Array ${arrayIndex}, String ${stringIndex}` : `Array ${arrayIndex}`
  };
}

async function send(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal, headers: { Accept: "application/json, text/plain" } });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text: text.slice(0, 4000) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function startFirmwareUpdate(request: FirmwareUpdateRequest): Promise<FirmwareUpdateResult> {
  if (updatePromise) throw new Error("A firmware update request is already being submitted.");
  const operationId = randomUUID();
  const requestedAt = new Date().toISOString();

  updatePromise = (async () => {
    try {
      const target = validate(request);
      const baseUrl = `http://${target.profile.emsHost}:${target.profile.emsPort}${target.profile.turtlePath}`.replace(/\/$/, "");
      const type = request.deviceType.toLowerCase();
      const versionPath = `${target.major}/${target.minor}/${target.revision}`;
      const endpoint = request.scope === "string"
          ? `/tools/controls/ems/string/firmware/array/${target.arrayIndex}/string/${target.stringIndex}/version/${type}/${versionPath}/set`
          : `/tools/controls/ems/string/firmware/array/${target.arrayIndex}/version/${type}/${versionPath}/set`;
      const response = await send(`${baseUrl}${endpoint}`);
      const result: FirmwareUpdateResult = {
        operationId,
        accepted: response.ok,
        state: response.ok ? "accepted" : "rejected",
        requestedAt,
        deviceType: request.deviceType,
        version: request.version,
        scope: request.scope,
        targetLabel: target.targetLabel,
        responseStatus: response.status,
        responseText: response.text,
        verification: response.ok ? "scheduled" : "not-scheduled"
      };
      lastResult = result;
      audit({ ...result, endpoint, profileId: target.profile.id });
      if (response.ok) {
        // Reuse the canonical inventory acquisition after EMS has had time to process the queued update.
        const captureOptions = {
          force: true,
          arrayIndex: target.arrayIndex,
          stringIndex: target.stringIndex
        };
        setTimeout(() => triggerFirmwareCapture(captureOptions).catch(error => {
          audit({ operationId, event: "verification-capture-failed", at: new Date().toISOString(), error: error?.message || String(error) });
        }), 60_000);
      }
      return result;
    } catch (error: any) {
      audit({ operationId, accepted: false, state: "rejected", requestedAt, request: { ...request, confirmed: undefined }, error: error?.message || String(error) });
      throw error;
    }
  })();

  try {
    return await updatePromise;
  } finally {
    updatePromise = null;
  }
}
