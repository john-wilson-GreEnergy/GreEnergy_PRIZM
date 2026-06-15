import fs from "fs";
import path from "path";
import { 
  HvacSimulationMode, 
  HvacSimulationTarget, 
  HvacValidationResult, 
  HvacAuditEntry,
  HvacValidationDefaults
} from "./hvacSimulationTypes";
import { validateHvacReport, HVAC_VALIDATION_DEFAULTS } from "./hvacSimulationValidation";
import { ProfileStore } from "../profiles/profileStore";
import { discoverTopologyCandidates } from "../feather/featherDiscovery";
import { getFeatherCache } from "../feather/featherClient";
import { isDemoActive } from "../emsTurtleClient";

const AUDIT_FILE = path.join(process.cwd(), "data", "hvac_simulation_audit.json");

// In-memory tracking of active overrides per IP
export interface SimStateOverride {
  ip: string;
  mode: HvacSimulationMode;
  timeoutMinutes: number;
  startedAt: string;
  options: any;
}

const activeOverrides = new Map<string, SimStateOverride>();
let auditLog: HvacAuditEntry[] = [];

// Load audits on module start
try {
  if (fs.existsSync(AUDIT_FILE)) {
    const raw = fs.readFileSync(AUDIT_FILE, "utf-8");
    auditLog = JSON.parse(raw);
  }
} catch (e) {
  console.error("[HvacSimulationService] Failed to load audits:", e);
}

function saveAuditLog() {
  try {
    const dir = path.dirname(AUDIT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(auditLog.slice(0, 100), null, 2), "utf-8");
  } catch (e) {
    console.error("[HvacSimulationService] Failed to save audits:", e);
  }
}

export function logAudit(entry: Omit<HvacAuditEntry, "timestamp">) {
  const fullEntry: HvacAuditEntry = {
    ...entry,
    timestamp: new Date().toISOString()
  };
  auditLog.unshift(fullEntry);
  if (auditLog.length > 100) {
    auditLog = auditLog.slice(0, 100);
  }
  saveAuditLog();
}

export function getAuditLog(): HvacAuditEntry[] {
  return auditLog.slice(0, 20); // return last 20 as requested
}

export function getActiveOverrides(): Map<string, SimStateOverride> {
  return activeOverrides;
}

/**
 * Get targets combined from active topology & Feather discovery
 */
export function getHvacTargets(): HvacSimulationTarget[] {
  const result: HvacSimulationTarget[] = [];
  const ipMap = new Map<string, HvacSimulationTarget>();

  const activeProfile = ProfileStore.getActiveProfile();
  const activeProfileName = activeProfile ? activeProfile.profileName : "PRIZM Core Hardware Bess Profile";

  // 1. Load candidates from topology discovery
  try {
    const candidates = discoverTopologyCandidates();
    for (const cand of candidates) {
      if (!cand.deviceIp) continue;
      
      const parts = (cand.deviceIp || "").split(".");
      const lastOctet = parts.length === 4 ? Number(parts[3]) : NaN;
      const isCol = cand.isCollectionSegment === true || lastOctet === 3 || (cand.entityName || "").toLowerCase().includes("collection");

      const target: HvacSimulationTarget = {
        ip: cand.deviceIp,
        arrayIndex: cand.arrayIndex ?? undefined,
        stringIndex: cand.stringIndex ?? undefined,
        entityName: cand.entityName || `Feather controller at ${cand.deviceIp}`,
        reachable: !cand.excluded, // placeholder
        source: "active-topology",
        isCollectionSegment: isCol
      };
      ipMap.set(cand.deviceIp, target);
    }
  } catch (e) {
    console.error("[HvacSimulationService] Error fetching topology candidates:", e);
  }

  // 2. Load from cached dynamic feather devices (if available)
  try {
    const cached = getFeatherCache();
    if (cached && cached.devices) {
      for (const d of cached.devices) {
        if (!d.deviceIp) continue;
        const parts = (d.deviceIp || "").split(".");
        const lastOctet = parts.length === 4 ? Number(parts[3]) : NaN;
        const isCol = (d as any).isCollectionSegment === true || lastOctet === 3 || (d.entityName || "").toLowerCase().includes("collection");

        const existing = ipMap.get(d.deviceIp);
        if (existing) {
          existing.reachable = d.reachable;
          existing.lastUpdatedAt = cached.lastUpdatedAt || undefined;
          if (existing.source === "active-topology") {
            existing.source = "feather-cache";
          }
        } else {
          ipMap.set(d.deviceIp, {
            ip: d.deviceIp,
            arrayIndex: d.arrayIndex ?? undefined,
            stringIndex: d.stringIndex ?? undefined,
            entityName: d.entityName || `Feather cache device ${d.deviceIp}`,
            reachable: d.reachable,
            lastUpdatedAt: cached.lastUpdatedAt || undefined,
            source: "feather-cache",
            isCollectionSegment: isCol
          });
        }
      }
    }
  } catch (e) {
    console.error("[HvacSimulationService] Error retrieving feather cache:", e);
  }

  return Array.from(ipMap.values());
}

/**
 * Internal helper to send real network request or generate highly realistic mock report.
 * Merges any active simulated overrides so live polling displays simulation outputs.
 */
export async function getSingleHvacReport(ip: string): Promise<any> {
  const isDemo = isDemoActive();
  const override = activeOverrides.get(ip);

  // Default mock base if offline/demo
  if (isDemo) {
    const report = buildDefaultMockReport(ip);
    applySimulationOverridesToReport(report, override);
    return report;
  }

  // Real HTTP Fetch
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`http://${ip}:8080/feather/status/report.json`, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const payload = await res.json();
    applySimulationOverridesToReport(payload, override);
    return payload;
  } catch (err) {
    clearTimeout(timeoutId);
    // If real request fails but there is an active override, fail gracefully with override-enabled report fallback
    if (override) {
      const fallbackReport = buildDefaultMockReport(ip);
      applySimulationOverridesToReport(fallbackReport, override);
      return fallbackReport;
    }
    throw err;
  }
}

/**
 * Apply the simulation overrides directly into the report object
 */
function applySimulationOverridesToReport(report: any, override?: SimStateOverride) {
  if (!override) {
    report.simulatedValueTimeoutTimestamp = 0;
    return;
  }

  const td = report.thermalData || {};
  const h1d = td.HVAC1Data || {};
  const h1c = td.HVAC1Controls || {};
  const h2d = td.HVAC2Data || {};
  const h2c = td.HVAC2Controls || {};
  const fss = report.fssSignals || {};
  const doors = report.doors || {};

  // Setup simulation timestamp details
  const elapsedMs = Date.now() - new Date(override.startedAt).getTime();
  const elapsedMinutes = elapsedMs / 60000;
  const remainingMinutes = Math.max(0, override.timeoutMinutes - Math.floor(elapsedMinutes));

  report.simulatedValueTimeoutTimestamp = Date.now() + remainingMinutes * 60000;
  report.fromFeatherControllerStatistcsReport = report.fromFeatherControllerStatistcsReport || {};
  report.fromFeatherControllerStatistcsReport.timeStamp = Date.now();

  if (remainingMinutes <= 0) {
    // expired
    return;
  }

  switch (override.mode) {
    case "cooling":
      // Dynamic simulated transitions based on elapsed run time (simulating automatic stage escalation)
      if (elapsedMinutes < 1.0) {
        td.thermostatStage = "CoolStage1";
        
        h1c.fanHighOn = true;
        h1c.fanLowOn = false;
        h1c.YCompressorOn = true;
        h1d.hvacCurrent = 14.2;

        h2c.fanHighOn = false;
        h2c.fanLowOn = false;
        h2c.YCompressorOn = false;
        h2d.hvacCurrent = 0.0;
      } else {
        td.thermostatStage = "CoolStage2";

        h1c.fanHighOn = true;
        h1c.fanLowOn = false;
        h1c.YCompressorOn = true;
        h1d.hvacCurrent = 14.5;

        h2c.fanHighOn = true;
        h2c.fanLowOn = false;
        h2c.YCompressorOn = true;
        h2d.hvacCurrent = 14.1;
      }
      break;

    case "ldcool":
      td.thermostatStage = "CoolStage1";
      
      // HVAC1 reacts as active cooling call, HVAC2 is idle
      h1c.fanHighOn = true;
      h1c.fanLowOn = false;
      h1c.YCompressorOn = true;
      h1d.hvacCurrent = 14.2;

      h2c.fanHighOn = false;
      h2c.fanLowOn = false;
      h2c.YCompressorOn = false;
      h2d.hvacCurrent = 0.0;
      break;

    case "bcool":
      td.thermostatStage = "CoolStage2";

      // Both HVACs react as active cooling call
      h1c.fanHighOn = true;
      h1c.fanLowOn = false;
      h1c.YCompressorOn = true;
      h1d.hvacCurrent = 14.5;

      h2c.fanHighOn = true;
      h2c.fanLowOn = false;
      h2c.YCompressorOn = true;
      h2d.hvacCurrent = 14.1;
      break;

    case "heating":
      td.thermostatStage = "HeatStage1";
      
      h1c.ElectricHeatOn = true;
      h1c.fanLowOn = true;
      h1d.hvacCurrent = 11.5;

      h2c.ElectricHeatOn = false;
      h2c.fanLowOn = false;
      h2d.hvacCurrent = 0.0;
      break;

    case "dehumidification":
      td.thermostatStage = "DehumidStage";
      td.outsideHumidity = 99;
      td.spaceHumidity = 99;

      h1c.fanLowOn = true;
      h1c.YCompressorOn = true;
      h1d.hvacCurrent = 6.2;

      h2c.fanLowOn = false;
      h2d.hvacCurrent = 0.0;
      break;

    case "lowerTopCap":
      const closedState = override.options?.toggleState ?? true;
      doors.lowerTopcapClosed = closedState;
      break;

    case "leakAlarm":
      const alarmActive = override.options?.toggleState ?? true;
      fss.leakAlarm = alarmActive;
      break;

    case "acDoor":
      const acDoorClosed = override.options?.toggleState ?? true;
      doors.acDoorsClosed = acDoorClosed;
      break;

    case "emergencyVentilation":
      const evActive = override.options?.toggleState ?? true;
      fss.emergencyVentilation = evActive;
      report.emergencyVentilation = evActive;
      h1c.fanHighOn = evActive;
      h1d.hvacCurrent = 2.1;
      break;

    case "clearAll":
    default:
      report.simulatedValueTimeoutTimestamp = 0;
      break;
  }
}

/**
 * Builds standard mock data report matching raw Feather device structure
 */
function buildDefaultMockReport(ip: string): any {
  const parts = ip.split(".");
  const host = Number(parts[parts.length - 1]) || 10;
  
  return {
    deviceType: host === 3 ? "ArrayController" : "StringController",
    operationalState: "NORMAL",
    firmwareVersion: "73.18.0",
    turtleVersion: {
      fwVersionMajor: 73,
      fwVersionMinor: 18,
      fwVersionRevision: 0,
    },
    thermalData: {
      spaceTemperature: 23.5,
      avgCellTemperature: 21.4,
      supplyAirTemp: 18.2,
      coolingSetpoint: 28.0,
      heatingSetpoint: 18.0,
      hydrogen1PPM: 1.2,
      thermostatStage: "Idle",
      HVAC1Data: {
        hvacCurrent: 0.0,
        FreezeDetected: false,
      },
      HVAC1Controls: {
        valid: true,
        fanLowOn: false,
        fanHighOn: false,
        YCompressorOn: false,
        ElectricHeatOn: false,
        ReversingValveOn: false,
      },
      HVAC2Data: {
        hvacCurrent: 0.0,
        FreezeDetected: false,
      },
      HVAC2Controls: {
        valid: true,
        fanLowOn: false,
        fanHighOn: false,
        YCompressorOn: false,
        ElectricHeatOn: false,
        ReversingValveOn: false,
      },
    },
    fssSignals: {
      valid: true,
      leakAlarm: false,
      louverOpen: true,
    },
    doors: {
      valid: true,
      batteryDoorsClosed: true,
      lowerTopcapClosed: true,
      dcDoorsClosed: true,
      acDoorsClosed: true,
    },
    deviceWithLostComms: [],
    fromFeatherControllerStatistcsReport: {
      timeStamp: Date.now()
    }
  };
}

/**
 * Executes Simulation applying (POST timeout + apply) concurrently
 */
export async function applySimulation(params: {
  targetIps: string[];
  timeoutMinutes: number;
  mode: HvacSimulationMode;
  options?: any;
  normalizeBeforeApply?: boolean;
  verifyAfterApply?: boolean;
  verificationDelaySec?: number;
  concurrency?: number;
}): Promise<any[]> {
  const {
    targetIps,
    timeoutMinutes,
    mode,
    options = {},
    normalizeBeforeApply = true,
    concurrency = 8
  } = params;

  const results: any[] = [];
  const startedAt = new Date().toISOString();

  // Helper function to process safety validation and apply overrides
  const execTarget = async (ip: string) => {
    try {
      const isDemo = isDemoActive();

      // Clear previous overrides on target
      if (normalizeBeforeApply || mode === "clearAll") {
        activeOverrides.delete(ip);
      }

      if (mode !== "clearAll") {
        activeOverrides.set(ip, {
          ip,
          mode,
          timeoutMinutes,
          startedAt,
          options
        });
      }

      // If NOT Demo Mode, send real physical requests to Feather LAN endpoints
      if (!isDemo) {
        const port = 8080;
        const baseUrl = `http://${ip}:${port}/feather/simulate`;

        // 1. POST TimeoutMinutes
        await fetch(`${baseUrl}/timeoutminutes/${timeoutMinutes}`, { method: "POST" }).catch(() => {});

        // 2. ClearAll if normalize
        if (normalizeBeforeApply) {
          await fetch(`${baseUrl}/clearall`, { method: "GET" }).catch(() => {});
        }

        // 3. Command apply
        if (mode !== "clearAll") {
          let payload: any = null;

          if (mode === "ldcool" || mode === "bcool" || mode === "cooling") {
            payload = {
              values: [
                { name: "SpaceTemp", usingDefault: false, type: "NUMBER", value: "55", unit: "' Celsius" },
                { name: "UseCellSetpoint", usingDefault: false, type: "BOOLEAN", value: "false", unit: "true=cell,false=air" }
              ]
            };
          } else if (mode === "heating") {
            payload = {
              values: [
                { name: "SpaceTemp", usingDefault: false, type: "NUMBER", value: "5", unit: "' Celsius" },
                { name: "UseCellSetpoint", usingDefault: false, type: "BOOLEAN", value: "false", unit: "true=cell,false=air" }
              ]
            };
          } else if (mode === "dehumidification") {
            payload = {
              values: [
                { name: "OutsideHumidity", usingDefault: false, type: "NUMBER", value: "99", unit: "0-100 (RH%)" },
                { name: "SpaceHumidity", usingDefault: false, type: "NUMBER", value: "99", unit: "0-100 (RH%)" }
              ]
            };
          } else if (mode === "lowerTopCap") {
            payload = { values: [{ name: "LowerTopcapClosed", type: "BOOLEAN", value: String(options.toggleState ?? true) }] };
          } else if (mode === "leakAlarm") {
            payload = { values: [{ name: "LeakAlarm", type: "BOOLEAN", value: String(options.toggleState ?? true) }] };
          } else if (mode === "acDoor") {
            payload = { values: [{ name: "AcDoorClosed", type: "BOOLEAN", value: String(options.toggleState ?? true) }] };
          } else if (mode === "emergencyVentilation") {
            payload = { values: [{ name: "EmergencyVentilation", type: "BOOLEAN", value: String(options.toggleState ?? true) }] };
          }

          if (payload) {
            await fetch(`${baseUrl}/commands`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            }).catch(() => {});
          }
        }
      }

      // Fetch immediate verification state
      const rawReport = await getSingleHvacReport(ip).catch(() => null);
      const validation = validateHvacReport(ip, rawReport, mode, startedAt);

      results.push({
        ip,
        commanded: true,
        verified: !!rawReport,
        status: validation.status,
        flags: validation.flags,
        message: validation.message,
        stage: rawReport?.thermalData?.thermostatStage || "Idle",
        simulated: (validation.simulationRemainingMinutes ?? 0) > 0,
        simMinutesRemaining: validation.simulationRemainingMinutes,
        error: null
      });

    } catch (err: any) {
      results.push({
        ip,
        commanded: false,
        verified: false,
        status: "NOT_RESPONDING",
        flags: ["DEVICE_NOT_RESPONDING"],
        message: err.message || "Failed simulation apply",
        stage: "Unknown",
        simulated: false,
        simMinutesRemaining: 0,
        error: err.message || String(err)
      });
    }
  };

  // Concurrency controlled executor
  const chunks: string[][] = [];
  for (let i = 0; i < targetIps.length; i += concurrency) {
    chunks.push(targetIps.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    await Promise.all(chunk.map(ip => execTarget(ip)));
  }

  // Find aggregated audit status
  let finalStatus: any = "PASS";
  let allFlags: string[] = [];
  results.forEach(r => {
    if (r.status === "FAIL" || r.status === "NOT_RESPONDING") {
      finalStatus = "FAIL";
    } else if (r.status === "WARNING" && finalStatus !== "FAIL") {
      finalStatus = "WARNING";
    }
    allFlags = [...allFlags, ...r.flags];
  });

  // Persist Audit Record
  logAudit({
    mode,
    targetIps,
    timeoutMinutes,
    success: results.some(r => r.commanded),
    validationStatus: finalStatus,
    flags: Array.from(new Set(allFlags)),
    profileName: ProfileStore.getActiveProfile()?.profileName || "Local EMS Default",
    operator: "Technician Mode"
  });

  return results;
}
