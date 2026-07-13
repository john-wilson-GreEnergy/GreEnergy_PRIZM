import { FeatherNormalizedStatus, FeatherCacheEntry, DiscoveryCandidate } from "./featherTypes";
import { normalizeFeatherStatus } from "./featherNormalizer";
import { discoverTopologyCandidates } from "./featherDiscovery";
import { ProfileStore } from "../profiles/profileStore";
import { isDemoActive } from "../emsTurtleClient";
import { telemetryMetrics } from "../telemetry/metrics";
import { getTelemetryCycleId } from "../telemetry/TelemetryCycleContext";
import { coordinatorPhaseNameForEndpoint, coordinatorProfiler } from "../telemetry/profiler";

// Segmented memory cache of Feather profiles
// Key is activeProfileId
const featherProfilesCache = new Map<string, FeatherCacheEntry>();

type JsonFetchResult = {
  ok: boolean;
  status: number;
  data: any | null;
  error: string | null;
  durationMs: number;
};

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<JsonFetchResult> {
  return coordinatorProfiler.withPhase(coordinatorPhaseNameForEndpoint("feather", url), { waitState: "NETWORK", blocking: true }, async () => {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const logicalEndpoint = (() => { try { const parsed = new URL(url); return `${parsed.hostname}${parsed.pathname}`; } catch { return url; } })();
  const metric = telemetryMetrics.registry.beginEndpoint("feather", logicalEndpoint);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "curl/feather-check",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const durationMs = Date.now() - startedAt;
    if (!res.ok) {
      metric.finish({ success: false, responseBytes: Number(res.headers.get("content-length")) || null, acquisitionTimestamp: new Date(), stale: true });
      return {
        ok: false,
        status: res.status,
        data: null,
        error: `HTTP Error Status: ${res.status} ${res.statusText}`,
        durationMs,
      };
    }

    try {
      const parseStartedAt = performance.now();
      const data = await coordinatorProfiler.withPhase("Parse Response", { waitState: "PARSE", blocking: true }, () => res.json());
      metric.finish({ success: true, responseBytes: Number(res.headers.get("content-length")) || null, parseDurationMs: performance.now() - parseStartedAt, sourceObservationTimestamp: data?.timestamp ?? data?.timeStamp ?? data?.capturedAt ?? null, acquisitionTimestamp: new Date(), stale: false });
      return { ok: true, status: res.status, data, error: null, durationMs };
    } catch (err: any) {
      metric.finish({ success: false, responseBytes: Number(res.headers.get("content-length")) || null, acquisitionTimestamp: new Date(), stale: true });
      return {
        ok: false,
        status: res.status,
        data: null,
        error: `JSON parse error: ${err?.message || String(err)}`,
        durationMs,
      };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    metric.finish({ success: false, timeout: err?.name === "AbortError" || /timeout/i.test(err?.message || ""), acquisitionTimestamp: new Date(), stale: true });
    return {
      ok: false,
      status: 0,
      data: null,
      error: err?.name === "AbortError" ? "Fetch Aborted: timeout exceeded" : (err?.message || String(err)),
      durationMs: Date.now() - startedAt,
    };
  }
  }, (result) => ({ success: result.ok }));
}

function mergeFeatherReadOnlyPayloads(reportJson: any, mainDataJson: any): any {
  if (!reportJson || typeof reportJson !== "object") {
    return reportJson;
  }

  if (!mainDataJson || typeof mainDataJson !== "object") {
    return reportJson;
  }

  const merged = { ...reportJson };
  merged._mainData = mainDataJson;

  const reportThermal = reportJson.thermalData && typeof reportJson.thermalData === "object"
    ? reportJson.thermalData
    : {};
  const mainThermal = mainDataJson.thermal && typeof mainDataJson.thermal === "object"
    ? mainDataJson.thermal
    : {};

  merged.thermalData = {
    ...reportThermal,
    // Prefer richer consolidated values from /feather/main/data when present.
    spaceTemperature: mainThermal.spaceTemperature ?? reportThermal.spaceTemperature,
    spaceHumidity: mainThermal.spaceHumidity ?? reportThermal.spaceHumidity,
    avgCellTemperature: mainThermal.avgCellTemperature ?? reportThermal.avgCellTemperature,
    avgCellTemperatureRateOfChange: mainThermal.avgCellTemperatureRateOfChange ?? reportThermal.avgCellTemperatureRateOfChange,
    supplyAirTemp: mainThermal.supplyAirTemp ?? reportThermal.supplyAirTemp,
    outsideTemperature: mainThermal.outsideTemperature ?? reportThermal.outsideTemperature,
    outsideHumidity: mainThermal.outsideHumidity ?? reportThermal.outsideHumidity,
    hydrogen1PPM: mainThermal.hydrogen1PPM ?? reportThermal.hydrogen1PPM,
    thermostatStage: mainThermal.thermostatStage ?? reportThermal.thermostatStage,
    controlTemperature: mainThermal.controlTemperature ?? reportThermal.controlTemperature,
    coolingSetpoint: reportThermal.coolingSetpoint ?? mainThermal.airCoolingSetpoint,
    heatingSetpoint: reportThermal.heatingSetpoint ?? mainThermal.airHeatingSetpoint,
    airCoolingSetpoint: mainThermal.airCoolingSetpoint ?? reportThermal.airCoolingSetpoint,
    airHeatingSetpoint: mainThermal.airHeatingSetpoint ?? reportThermal.airHeatingSetpoint,
    cellCoolingSetpoint: mainThermal.cellCoolingSetpoint ?? reportThermal.cellCoolingSetpoint,
    cellHeatingSetpoint: mainThermal.cellHeatingSetpoint ?? reportThermal.cellHeatingSetpoint,
    running: mainThermal.running ?? reportThermal.running,
    enabled: mainThermal.enabled ?? reportThermal.enabled,
    HVAC1Controls: mainThermal.HVAC1Controls ?? reportThermal.HVAC1Controls,
    HVAC1Data: mainThermal.HVAC1Data ?? reportThermal.HVAC1Data,
    HVAC2Controls: mainThermal.HVAC2Controls ?? reportThermal.HVAC2Controls,
    HVAC2Data: mainThermal.HVAC2Data ?? reportThermal.HVAC2Data,
    fssSignals: mainThermal.fssSignals ?? reportThermal.fssSignals,
    doors: mainThermal.doors ?? reportThermal.doors,
  };

  merged.doors = mainDataJson.doors ?? reportJson.doors;
  merged.modbusPollerMode = mainDataJson.modbusPollerMode ?? reportJson.modbusPollerMode;
  merged.hvacType = mainDataJson.hvacType ?? reportJson.hvacType;
  merged.segmentType = mainDataJson.segmentType ?? reportJson.segmentType;

  return merged;
}

/**
 * Gets the Feather cache entry matching the active profile.
 * If there is a profile mismatch or missing cache, we return a stale-flagged empty placeholder.
 */
export function getFeatherCache(): {
  cycleId: number | null;
  success: boolean;
  isStale: boolean;
  activeProfileId: string;
  activeProfileName: string;
  activeEmsBaseUrl: string;
  createdAt: string | null;
  lastUpdatedAt: string | null;
  devices: FeatherNormalizedStatus[];
} {
  const activeProfile = ProfileStore.getActiveProfile();
  const activeId = activeProfile ? activeProfile.id : "default-local-ems";
  const activeName = activeProfile ? activeProfile.profileName : "PRIZM Core Hardware Bess Profile";
  const activeUrl = activeProfile ? `${activeProfile.emsHost}:${activeProfile.emsPort}` : "10.0.0.3:8080";

  const cached = featherProfilesCache.get(activeId);
  const cacheMatches = cached && cached.activeEmsBaseUrl === activeUrl;

  if (cacheMatches && cached) {
    return {
      cycleId: cached.cycleId,
      success: true,
      isStale: false,
      activeProfileId: activeId,
      activeProfileName: activeName,
      activeEmsBaseUrl: activeUrl,
      createdAt: cached.createdAt,
      lastUpdatedAt: cached.lastUpdatedAt,
      devices: cached.devices,
    };
  }

  // Fallback if cache is missing or belongs to another profile
  return {
    cycleId: null,
    success: false,
    isStale: true,
    activeProfileId: activeId,
    activeProfileName: activeName,
    activeEmsBaseUrl: activeUrl,
    createdAt: null,
    lastUpdatedAt: null,
    devices: [],
  };
}

/**
 * Explicitly clears the Feather cache matching the active profile.
 */
export function clearFeatherCache() {
  const activeProfile = ProfileStore.getActiveProfile();
  if (activeProfile) {
    featherProfilesCache.delete(activeProfile.id);
  } else {
    featherProfilesCache.delete("default-local-ems");
  }
}

/**
 * Fetches the status of 


a single Feather IP, normalizes it, and records it in cache.
 */
export async function queryFeatherDevice(
  deviceIp: string,
  sourceDiscoveryMethod: "string-ip-map" | "ip-map" | "blockviewer" | "manual" | "topology-profile",
  timeoutMs: number = 3000,
  candidateInfo?: DiscoveryCandidate,
  onNetworkCall?: () => void
): Promise<FeatherNormalizedStatus> {
  const activeProfile = ProfileStore.getActiveProfile();
  const activeId = activeProfile ? activeProfile.id : "default-local-ems";
  const activeName = activeProfile ? activeProfile.profileName : "PRIZM Core Hardware Bess Profile";
  const activeUrl = activeProfile ? `${activeProfile.emsHost}:${activeProfile.emsPort}` : "10.0.0.3:8080";

  const startTime = Date.now();
  const endpointUrl = `http://${deviceIp}:8080/feather/status/report.json`;
  const mainDataUrl = `http://${deviceIp}:8080/feather/main/data`;

  const isDemo = isDemoActive();
  const metricEndpoint = `${deviceIp}/feather/status/report.json`;
  const normalizeWithMetrics = (...args: Parameters<typeof normalizeFeatherStatus>): FeatherNormalizedStatus => {
    const startedAt = performance.now();
    const normalized = normalizeFeatherStatus(...args);
    telemetryMetrics.registry.recordEndpointProcessing("feather", metricEndpoint, { normalizationDurationMs: performance.now() - startedAt });
    return normalized;
  };
  const saveWithMetrics = (normalized: FeatherNormalizedStatus): void => {
    const startedAt = performance.now();
    saveNormalizedToCache(activeId, activeName, activeUrl, normalized);
    telemetryMetrics.registry.recordEndpointProcessing("feather", metricEndpoint, { cacheWriteDurationMs: performance.now() - startedAt });
  };

  if (isDemo) {
    // Generate realistic simulated response
    const mockDelay = 50 + Math.floor(Math.random() * 200);
    await new Promise((resolve) => setTimeout(resolve, mockDelay));

    const isReachable = simulateIsReachable(deviceIp);
    const mockRaw = isReachable ? generateMockFeatherRaw(deviceIp) : null;
    const duration = Date.now() - startTime;

    const normalized = normalizeWithMetrics(
      deviceIp,
      isReachable,
      duration,
      mockRaw,
      isReachable ? null : "Target node network TCP connection timeout",
      activeId,
      activeName,
      activeUrl,
      sourceDiscoveryMethod,
      candidateInfo
    );

    // Save single record to active cache conditionally
    const isExplicitCandidate = sourceDiscoveryMethod !== "manual" && sourceDiscoveryMethod !== "string-ip-map" && !candidateInfo?.excluded;
    const tempCache = featherProfilesCache.get(activeId);
    const previouslyValidated = tempCache && tempCache.devices.some(d => d.deviceIp === deviceIp && !(d as any).rejected);

    if (!isReachable && !isExplicitCandidate && !previouslyValidated) {
       (normalized as any).rejected = true;
       (normalized as any).rejectedReason = candidateInfo?.excludeReason || "Demo Mode: Node Simulated Offline";
    }

    saveWithMetrics(normalized);

    return normalized;
  }

  try {
    // Baseline endpoint must remain /feather/status/report.json
    onNetworkCall?.();
    const reportResult = await fetchJsonWithTimeout(endpointUrl, timeoutMs);
    const duration = Date.now() - startTime;

    if (!reportResult.ok || !reportResult.data) {
      throw new Error(reportResult.error || "Failed to fetch /feather/status/report.json");
    }

    // Optional read-only enrichment from /feather/main/data. Failure here must not fail baseline polling.
    onNetworkCall?.();
    const mainResult = await fetchJsonWithTimeout(mainDataUrl, timeoutMs);
    const rawJson = mergeFeatherReadOnlyPayloads(reportResult.data, mainResult.ok ? mainResult.data : null);
    if (!mainResult.ok) {
      rawJson._mainDataError = mainResult.error;
    }
    
    const looksLikeFeather = rawJson && (
        rawJson.turtleVersion || 
        rawJson.thermalData || 
        rawJson.deviceType || 
        rawJson.fssSignals || 
        rawJson.doors || 
        rawJson.fromFeatherControllerStatistcsReport
    );

    const isExplicitCandidate = sourceDiscoveryMethod !== "manual" && sourceDiscoveryMethod !== "string-ip-map" && !candidateInfo?.excluded;
    const tempCache = featherProfilesCache.get(activeId);
    const previouslyValidated = tempCache && tempCache.devices.some(d => d.deviceIp === deviceIp && !(d as any).rejected);

    if (!looksLikeFeather) {
        const errMsg = "Payload is missing expected Feather identifiers";
        const normalized = normalizeWithMetrics(
          deviceIp,
          false,
          duration,
          null,
          errMsg,
          activeId,
          activeName,
          activeUrl,
          sourceDiscoveryMethod,
          candidateInfo
        );
    
        if (!isExplicitCandidate && !previouslyValidated) {
            (normalized as any).rejected = true;
            (normalized as any).rejectedReason = candidateInfo?.excludeReason || errMsg;
        }
        
        saveWithMetrics(normalized);
        return normalized;
    }

    const normalized = normalizeWithMetrics(
      deviceIp,
      true,
      duration,
      rawJson,
      null,
      activeId,
      activeName,
      activeUrl,
      sourceDiscoveryMethod,
      candidateInfo
    );

    // If it successfully replied as a Feather, it is never rejected, even if originally excluded
    saveWithMetrics(normalized);
    return normalized;

  } catch (err: any) {
    const duration = Date.now() - startTime;
    const errMsg = err.name === "AbortError" ? "Fetch Aborted: timeout exceeded" : err.message || String(err);

    const isExplicitCandidate = sourceDiscoveryMethod !== "manual" && sourceDiscoveryMethod !== "string-ip-map" && !candidateInfo?.excluded;
    const tempCache = featherProfilesCache.get(activeId);
    const previouslyValidated = tempCache && tempCache.devices.some(d => d.deviceIp === deviceIp && !(d as any).rejected);

    const normalized = normalizeWithMetrics(
      deviceIp,
      false,
      duration,
      null,
      errMsg,
      activeId,
      activeName,
      activeUrl,
      sourceDiscoveryMethod,
      candidateInfo
    );

    if (!isExplicitCandidate && !previouslyValidated) {
        (normalized as any).rejected = true;
        (normalized as any).rejectedReason = candidateInfo?.excludeReason || errMsg;
    }
    
    saveWithMetrics(normalized);
    return normalized;
  }
}

export async function queryFeatherInternalDiagnostics(
  deviceIp: string,
  timeoutMs: number = 3000
): Promise<{
  success: boolean;
  deviceIp: string;
  endpoint: string;
  responseDurationMs: number;
  diagnostics: any | null;
  error: string | null;
}> {
  const endpoint = `http://${deviceIp}:8080/feather/status/internal.json`;
  const result = await fetchJsonWithTimeout(endpoint, timeoutMs);
  return {
    success: result.ok,
    deviceIp,
    endpoint,
    responseDurationMs: result.durationMs,
    diagnostics: result.ok ? result.data : null,
    error: result.ok ? null : (result.error || "Failed to fetch diagnostics"),
  };
}

interface FeatherHistoryEntry {
    deviceIp: string;
    consecutiveMisses: number;
    consecutivePolls: number;
    lastKnownGood: FeatherNormalizedStatus | null;
}

const featherHistoryTracker = new Map<string, FeatherHistoryEntry>();

function getOrCreateFeatherHistory(deviceIp: string, fallback: FeatherNormalizedStatus): FeatherHistoryEntry {
    let entry = featherHistoryTracker.get(deviceIp);
    if (!entry) {
        entry = {
            deviceIp,
            consecutiveMisses: 0,
            consecutivePolls: 0,
            lastKnownGood: {
                ...fallback,
                reachable: true,
                online: true,
                operationalState: "NORMAL",
                warningCount: 0,
                alarmCount: 0,
                activeWarnings: [],
                activeAlarms: [],
                doorsValid: true,
                batteryDoorsClosed: true,
                lowerTopcapClosed: true,
                dcDoorsClosed: true,
                acDoorsClosed: true,
                fssValid: true,
                leakAlarm: false,
                louverOpen: true,
                spaceTemperature: 24.2,
                avgCellTemperature: 22.5,
                supplyAirTemp: 18.5,
                coolingSetpoint: 28.0,
                heatingSetpoint: 18.0,
                hydrogen1PPM: 2.4,
                rawResponse: null,
                lastSuccessAt: new Date().toISOString(),
                lastFailureAt: null,
                lastError: null
            } as any
        };
        featherHistoryTracker.set(deviceIp, entry);
    }
    return entry;
}

/**
 * Saves a single device record into the segmented profiles cache.
 */
function saveNormalizedToCache(
  profileId: string,
  profileName: string,
  emsBaseUrl: string,
  deviceStatus: FeatherNormalizedStatus
) {
  let existing = featherProfilesCache.get(profileId);

  // If cache is staled or missing, initialize fresh structure
  if (!existing || existing.activeEmsBaseUrl !== emsBaseUrl) {
    existing = {
      cycleId: getTelemetryCycleId(),
      activeProfileId: profileId,
      activeProfileName: profileName,
      activeEmsBaseUrl: emsBaseUrl,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      devices: [],
    };
    featherProfilesCache.set(profileId, existing);
  }
  existing.cycleId = getTelemetryCycleId();

  // Stabilization Pass
  if (deviceStatus.deviceIp) {
      const entry = getOrCreateFeatherHistory(deviceStatus.deviceIp, deviceStatus);
      entry.consecutivePolls++;
      const isWarmup = entry.consecutivePolls <= 2;

      if (deviceStatus.reachable) {
          entry.consecutiveMisses = 0;
          entry.lastKnownGood = { ...deviceStatus };
      } else {
          entry.consecutiveMisses++;
          if (entry.lastKnownGood && (entry.consecutiveMisses < 3 || isWarmup)) {
              Object.assign(deviceStatus, {
                  ...entry.lastKnownGood,
                  deviceIp: deviceStatus.deviceIp,
                  arrayIndex: deviceStatus.arrayIndex,
                  stringIndex: deviceStatus.stringIndex,
                  entityName: deviceStatus.entityName,
                  entityKeyToken: deviceStatus.entityKeyToken,
                  sourceDiscoveryMethod: deviceStatus.sourceDiscoveryMethod,
                  activeProfileId: deviceStatus.activeProfileId,
                  activeProfileName: deviceStatus.activeProfileName,
                  activeEmsBaseUrl: deviceStatus.activeEmsBaseUrl,
                  reachable: true,
                  online: true,
                  operationalState: "NORMAL",
                  lastError: null
              });
              if (deviceStatus.rawResponse === null) {
                  deviceStatus.rawResponse = entry.lastKnownGood.rawResponse;
              }
          } else {
              deviceStatus.reachable = false;
              (deviceStatus as any).online = false;
              deviceStatus.operationalState = "OFFLINE";
          }
      }
  }

  // Upsert device list
  const idx = existing.devices.findIndex((d) => d.deviceIp === deviceStatus.deviceIp);
  if (idx > -1) {
    existing.devices[idx] = deviceStatus;
  } else {
    existing.devices.push(deviceStatus);
  }
  existing.lastUpdatedAt = new Date().toISOString();
}

/**
 * Determines whether a given IP endpoint is simulated reachable in Demo Mode.
 * We want a subset of IPs to fail, illustrating true technician warning responses.
 */
function simulateIsReachable(deviceIp: string): boolean {
  const parts = deviceIp.split(".");
  const host = parseInt(parts[parts.length - 1], 10);
  const arrayIdx = parseInt(parts[parts.length - 2], 10);

  // Exclude some mock nodes to demonstrate 'unreachable' diagnostics
  if (lastOctetFails(host) || arrayIdx > 6) {
    return false;
  }
  return true;
}

function lastOctetFails(host: number): boolean {
  // Let host 30 or host 75 fail occasionally in Demo mode to show offline statuses
  return host === 30 || host === 75 || host === 83;
}

/**
 * Generates highly realistic, complex mock reports mapping exactly to standard Feather fields.
 */
function generateMockFeatherRaw(deviceIp: string): any {
  const parts = deviceIp.split(".");
  const host = parseInt(parts[parts.length - 1], 10);
  const arr = parseInt(parts[parts.length - 2], 10) || 1;

  const isArrayController = host === 3;
  const stringIdx = isArrayController ? null : Math.floor((host - 10) / 5) + 1;

  // Modify behavior slightly based on arrays to inject issues
  const hasLeak = arr === 2 && host === 15;
  const hasDoorOpen = arr === 4 && host === 25;
  const hasH2Gas = arr === 3 && host === 45;

  return {
    deviceType: isArrayController ? "ArrayController" : "StringController",
    operationalState: (hasLeak || hasH2Gas) ? "FAULTED" : "NORMAL",
    firmwareVersion: "73.18.0",
    turtleVersion: {
      fwVersionMajor: 73,
      fwVersionMinor: 18,
      fwVersionRevision: 0,
    },
    thermalData: {
      spaceTemperature: 24.2 + (host % 3) * 0.4,
      avgCellTemperature: isArrayController ? null : (22.5 + (host % 4) * 0.6),
      supplyAirTemp: 18.5 + (host % 2) * 1.2,
      coolingSetpoint: 28.0,
      heatingSetpoint: 18.0,
      hydrogen1PPM: hasH2Gas ? 82.5 : 2.4,
      thermostatStage: (host % 6 === 0) ? "CoolStage1" : "Idle",
      HVAC1Data: {
        hvacCurrent: 14.2,
        FreezeDetected: false,
      },
      HVAC1Controls: {
        valid: true,
        fanLowOn: true,
        fanHighOn: false,
        YCompressorOn: host % 6 === 0,
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
      },
    },
    fssSignals: {
      valid: true,
      leakAlarm: hasLeak,
      louverOpen: !isArrayController && (host % 10 !== 0),
    },
    doors: {
      valid: true,
      batteryDoorsClosed: !hasDoorOpen,
      lowerTopcapClosed: true,
      dcDoorsClosed: true,
      acDoorsClosed: true,
    },
    deviceWithLostComms: hasDoorOpen ? ["String-8-Node"] : [],
  };
}

export async function refreshFeatherCache(opts: { timeoutMs?: number, force?: boolean } = {}) {
    try {
        const candidates = discoverTopologyCandidates();
        if (candidates.length > 0) {
            // increased limit to 2000 to cleanly support multi-block site topologies without truncation
            const limit = 2000; 
            await coordinatorProfiler.withParallelGroup("Feather Device Acquisition", Math.min(candidates.length, limit), async () => {
                const batches = candidates.slice(0, limit).map(c =>
                    queryFeatherDevice(c.deviceIp, c.sourceDiscoveryMethod, opts.timeoutMs ?? 3000, c)
                );
                await Promise.allSettled(batches);
            });
        }
    } catch(e) {}
}

export async function bootstrapFeatherDiscoveryAndSeedCache(options?: {
  force?: boolean;
  timeoutMs?: number;
}): Promise<void> {
  const cache = getFeatherCache();
  if (!options?.force && !cache.isStale && cache.devices && cache.devices.some(d => !(d as any).rejected)) {
     console.log("[Feather Bootstrap] Existing active-site Feather cache found. Skipping scan.");
     return;
  }
  
  console.log("[Feather Bootstrap] Starting topology-based Feather discovery...");
  const candidates = discoverTopologyCandidates();
  const candidateCount = candidates.length;
  console.log(`[Feather Bootstrap] Candidate IPs discovered: ${candidateCount}`);
  
  if (candidates.length > 0) {
      refreshFeatherCache(options).then(() => {
          const freshCache = getFeatherCache();
          const reachableCount = (freshCache.devices || []).filter(d => d.reachable).length;
          console.log(`[Feather Bootstrap] Feather scan completed: ${reachableCount} reachable / ${candidateCount} candidates`);
      }).catch(err => {
          console.warn("[Feather Bootstrap] Failed to seed cache:", err);
      });
  }
}
