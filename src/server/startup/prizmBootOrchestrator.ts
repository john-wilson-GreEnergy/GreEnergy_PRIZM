import { emsCache, getEmsConnectionStatus } from "../emsTurtleClient";
import { ProfileStore } from "../profiles/profileStore";
import { getFeatherCache } from "../feather/featherClient";
import * as prizmCache from "../cache/prizmCache";
import { recordTelemetrySample } from "../telemetry/siteTelemetryAggregator";
import { normalizeTopologyModel, generateFeatherDiscoveryCandidatesFromTopology } from "../profiles/profileManager";
import { getSiteCommissioningStatus, reconcileCommissionedSiteTopology, runAutomaticSiteCommissioning } from "../commissioning/siteCommissioningService";
import { startOperationalModbusPolling } from "../telemetry/modbusOperationalTelemetry";
import { startPreparedReportSnapshotCache } from "../reports/siteSnapshotEngine";

export type PrizmBootPhase =
  | "idle"
  | "starting"
  | "probing-ems"
  | "ems-live"
  | "hydrating-cache"
  | "discovering-topology"
  | "discovering-feather"
  | "loading-modbus-profile"
  | "ready"
  | "degraded"
  | "offline";

interface PrizmBootStatus {
  phase: PrizmBootPhase;
  ready: boolean;
  emsReachable: boolean;
  activeProfile: string | null;
  activeEmsBaseUrl: string | null;
  stationCode: string;
  blockIndex: number;
  lastSuccessfulPoll: string | null;
  cachePolicy: string;
  preloadStatus: {
    siteOperations: boolean;
    topology: boolean;
    stringsDashboard: boolean;
    featherDevices: boolean;
    emsApps: boolean;
    modbusProfile: boolean;
    safetyFaults: boolean;
  };
  warnings: string[];
  errors: string[];
  updatedAt: string;
}

const bootStatus: PrizmBootStatus = {
  phase: "idle",
  ready: false,
  emsReachable: false,
  activeProfile: null,
  activeEmsBaseUrl: null,
  stationCode: "UNKNOWN",
  blockIndex: 1,
  lastSuccessfulPoll: null,
  cachePolicy: "live-first",
  preloadStatus: {
    siteOperations: false,
    topology: false,
    stringsDashboard: false,
    featherDevices: false,
    emsApps: false,
    modbusProfile: false,
    safetyFaults: false,
  },
  warnings: [],
  errors: [],
  updatedAt: new Date().toISOString()
};

let livePollingInterval: NodeJS.Timeout | null = null;
let slowRefreshInterval: NodeJS.Timeout | null = null;

let isBooting = false;

function updateStatus(updates: Partial<PrizmBootStatus>) {
  Object.assign(bootStatus, updates);
  bootStatus.updatedAt = new Date().toISOString();
}

export function getBootStatus() {
  bootStatus.cachePolicy = prizmCache.getEffectiveCachePolicy(null, null, null);
  const liveConnection = getEmsConnectionStatus();
  const emsNowReachable = ["live", "partial", "demo"].includes(liveConnection.source);
  if (emsNowReachable) {
    bootStatus.emsReachable = true;
    bootStatus.lastSuccessfulPoll = liveConnection.lastUpdated || bootStatus.lastSuccessfulPoll;
    if (["offline", "probing-ems", "ems-live", "hydrating-cache"].includes(bootStatus.phase)) {
      bootStatus.phase = "ready";
      bootStatus.ready = true;
    }
    bootStatus.stationCode = liveConnection.discoveredStationCode || liveConnection.stationCode || bootStatus.stationCode;
    bootStatus.blockIndex = liveConnection.blockIndex || bootStatus.blockIndex;
    bootStatus.preloadStatus.siteOperations = true;
    bootStatus.preloadStatus.topology = true;
    bootStatus.preloadStatus.stringsDashboard = true;
  } else if (liveConnection.source === "offline" && !bootStatus.ready) {
    bootStatus.emsReachable = false;
  }
  const mockModbus = process.env.PRIZM_MODBUS_MOCK === "true";
  
  if (mockModbus && !bootStatus.warnings.includes("MOCK MODBUS DATA ACTIVE - NOT FIELD DATA")) {
     bootStatus.warnings.push("MOCK MODBUS DATA ACTIVE - NOT FIELD DATA");
  }

  const activeProfile = ProfileStore.getActiveProfile();
  const activeProfileName = activeProfile ? activeProfile.profileName : null;
  const topologySource = activeProfile ? "active-profile" : "legacy-fallback";
  let topologyBlocks = 1;
  let topologyCandidateCount = 168; // legacy default
  let expectedBlocks: any[] = [];
  
  if (activeProfile) {
    try {
      const model = normalizeTopologyModel(activeProfile);
      topologyBlocks = model.blocks.length;
      expectedBlocks = model.blocks.map(b => ({
         blockName: b.blockName,
         basePrefix: b.basePrefix,
         emsHost: b.emsHost
      }));
      const candidates = generateFeatherDiscoveryCandidatesFromTopology(activeProfile);
      topologyCandidateCount = candidates.length;
    } catch (err) {}
  }
  
  const fCache = getFeatherCache();
  const expectedFeatherIps = new Set(activeProfile ? generateFeatherDiscoveryCandidatesFromTopology(activeProfile).map(candidate => candidate.deviceIp) : []);
  const featherReachableCount = new Set((fCache?.devices || [])
    .filter(device => device.reachable && !(device as any).rejected && (!expectedFeatherIps.size || expectedFeatherIps.has(device.deviceIp)))
    .map(device => device.deviceIp)).size;
  bootStatus.preloadStatus.featherDevices = featherReachableCount > 0;

  updateStatus({}); // just updates updatedAt
  return { 
    ...bootStatus,
    activeProfileName,
    topologySource,
    topologyBlocks,
    topologyCandidateCount,
    featherReachableCount,
    expectedBlocks,
    commissioning: getSiteCommissioningStatus()
  };
}

export async function initializePrizmBootFlow() {
  if (isBooting) return;
  isBooting = true;
  updateStatus({ phase: "starting", errors: [], warnings: [], ready: false });

  try {
    let activeProfile = ProfileStore.getActiveProfile();
    if (!activeProfile) {
      // Create default
      const defaultProfileInput = {
        profileName: "PRIZM Core Hardware BESS Profile",
        siteName: "Default Local EMS",
        stationCode: "BHE0021",
        blockIndex: 1,
        emsHost: "10.0.0.3",
        emsPort: 8080,
        turtlePath: "/turtle",
        modbusHost: "10.0.0.3",
        modbusPort: 4502,
        arrayCount: 8,
        stringsPerArray: 40,
        notes: "Default PRIZM local EMS target"
      };
      const created = ProfileStore.createProfile(defaultProfileInput, true);
      activeProfile = created;
    }

    if (process.env.PRIZM_AUTO_COMMISSION !== "false") {
      const commissioning = await runAutomaticSiteCommissioning({ updateProfile: true });
      if (commissioning.profileUpdated) activeProfile = ProfileStore.getActiveProfile();
      if (commissioning.state !== "connected") bootStatus.warnings.push(`Site auto-commissioning: ${commissioning.message}`);
    }

    updateStatus({
      activeProfile: activeProfile.id,
      activeEmsBaseUrl: `http://${activeProfile.emsHost}:${activeProfile.emsPort}${activeProfile.turtlePath}`,
      stationCode: activeProfile.stationCode,
      blockIndex: activeProfile.blockIndex,
      phase: "probing-ems"
    });

    // The coordinator is the sole acquisition owner. Boot observes existing
    // cache state and starts the unchanged coordinator cadence below.
    const connection = getEmsConnectionStatus();
    const reachable = connection.source === "live" || connection.source === "partial";
    if (reachable) applyDiscoveredStation();

    updateStatus({
      emsReachable: reachable,
      phase: reachable ? "ems-live" : "offline"
    });

    startBackgroundPolling();
    if (process.env.PRIZM_AUTO_COMMISSION !== "false") {
      setTimeout(() => {
        try { reconcileCommissionedSiteTopology(); }
        catch (error: any) { bootStatus.warnings.push(`Topology reconciliation: ${error?.message || String(error)}`); }
      }, Math.max(5000, Number(process.env.PRIZM_COMMISSION_RECONCILE_DELAY_MS || 15000)));
    }
    
    // Asynchronously continue hydration without blocking
    hydrateCache().catch(console.error);

  } catch (err: any) {
    updateStatus({ phase: "degraded", errors: [err.message] });
  } finally {
    isBooting = false;
  }
}

import { startCoordinator, stopCoordinator } from "../prizmDataCoordinator";

export function handleProfileChange() {
  // Reset sequence
  stopCoordinator();
  if (slowRefreshInterval) clearInterval(slowRefreshInterval);
  
  updateStatus({
    preloadStatus: {
      siteOperations: false,
      topology: false,
      stringsDashboard: false,
      featherDevices: false,
      emsApps: false,
      modbusProfile: false,
      safetyFaults: false,
    }
  });

  prizmCache.clear();
  
  initializePrizmBootFlow();
}

async function hydrateCache() {
  updateStatus({ phase: "hydrating-cache" });
  
  if (bootStatus.emsReachable) {
     // Triggering a background poll should cache stuff
     bootStatus.preloadStatus.topology = true;
     bootStatus.preloadStatus.emsApps = true;
     bootStatus.preloadStatus.siteOperations = true;
     updateStatus({});
     
     bootStatus.preloadStatus.featherDevices = getFeatherCache().devices.length > 0;
     updateStatus({});
  }

  updateStatus({ phase: bootStatus.emsReachable ? "ready" : "offline", ready: true });
}

function applyDiscoveredStation() {
  const currentStatus = getEmsConnectionStatus();
  const activeProfile = ProfileStore.getActiveProfile();
  
  const discovered = currentStatus.discoveredStationCode;
  const live = currentStatus.stationCode;
  const profileStat = activeProfile?.stationCode || "BHE0020";
  
  const finalStationCode = discovered || live || profileStat;
  const finalBlockIndex = currentStatus.blockIndex || activeProfile?.blockIndex || 1;
  
  updateStatus({
    stationCode: finalStationCode,
    blockIndex: finalBlockIndex
  });
}

export function startBackgroundPolling() {
  stopCoordinator();
  if (slowRefreshInterval) clearInterval(slowRefreshInterval);

  // Keep the fast EMS register snapshot alive independently of the heavier
  // coordinator cycle. Summary and PCS views intentionally reject Modbus data
  // older than 15 seconds, so merely exposing the manual refresh endpoint is
  // not enough for normal operation.
  startOperationalModbusPolling();
  startPreparedReportSnapshotCache();
  startCoordinator();

  slowRefreshInterval = setInterval(async () => {
    // maybe refresh modbus map
  }, 5 * 60 * 1000);
}
