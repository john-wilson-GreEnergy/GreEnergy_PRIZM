import { FeatherNormalizedStatus, FeatherCacheEntry, DiscoveryCandidate } from "./featherTypes";
import { normalizeFeatherStatus } from "./featherNormalizer";
import { ProfileStore } from "../profiles/profileStore";
import { isDemoActive } from "../emsTurtleClient";

// Segmented memory cache of Feather profiles
// Key is activeProfileId
const featherProfilesCache = new Map<string, FeatherCacheEntry>();

/**
 * Gets the Feather cache entry matching the active profile.
 * If there is a profile mismatch or missing cache, we return a stale-flagged empty placeholder.
 */
export function getFeatherCache(): {
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
 * Fetches the status of a single Feather IP, normalizes it, and records it in cache.
 */
export async function queryFeatherDevice(
  deviceIp: string,
  sourceDiscoveryMethod: "string-ip-map" | "ip-map" | "blockviewer" | "manual",
  timeoutMs: number = 3000,
  candidateInfo?: {
    arrayIndex?: number | null;
    stringIndex?: number | null;
    entityName?: string | null;
    entityKeyToken?: string | null;
  }
): Promise<FeatherNormalizedStatus> {
  const activeProfile = ProfileStore.getActiveProfile();
  const activeId = activeProfile ? activeProfile.id : "default-local-ems";
  const activeName = activeProfile ? activeProfile.profileName : "PRIZM Core Hardware Bess Profile";
  const activeUrl = activeProfile ? `${activeProfile.emsHost}:${activeProfile.emsPort}` : "10.0.0.3:8080";

  const startTime = Date.now();
  const endpointUrl = `http://${deviceIp}:8080/feather/status/report.json`;

  const isDemo = isDemoActive();

  if (isDemo) {
    // Generate realistic simulated response
    const mockDelay = 50 + Math.floor(Math.random() * 200);
    await new Promise((resolve) => setTimeout(resolve, mockDelay));

    const isReachable = simulateIsReachable(deviceIp);
    const mockRaw = isReachable ? generateMockFeatherRaw(deviceIp) : null;
    const duration = Date.now() - startTime;

    const normalized = normalizeFeatherStatus(
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

    // Save single record to active cache
    saveNormalizedToCache(activeId, activeName, activeUrl, normalized);
    return normalized;
  }

  // Real LAN request with AbortController timeout protection
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpointUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "curl/feather-check",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const duration = Date.now() - startTime;

    if (!res.ok) {
      throw new Error(`HTTP Error Status: ${res.status} ${res.statusText}`);
    }

    const rawJson = await res.json();
    const normalized = normalizeFeatherStatus(
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

    saveNormalizedToCache(activeId, activeName, activeUrl, normalized);
    return normalized;

  } catch (err: any) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    const errMsg = err.name === "AbortError" ? "Fetch Aborted: timeout exceeded" : err.message || String(err);

    const normalized = normalizeFeatherStatus(
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

    saveNormalizedToCache(activeId, activeName, activeUrl, normalized);
    return normalized;
  }
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
      activeProfileId: profileId,
      activeProfileName: profileName,
      activeEmsBaseUrl: emsBaseUrl,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      devices: [],
    };
    featherProfilesCache.set(profileId, existing);
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
