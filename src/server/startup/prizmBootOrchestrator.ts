import { pollEmsTurtle, emsCache } from "../emsTurtleClient";
import { ProfileStore } from "../profiles/profileStore";
import { refreshFeatherCache, getFeatherCache } from "../feather/featherClient";
import * as prizmCache from "../cache/prizmCache";
import { recordTelemetrySample } from "../telemetry/siteTelemetryAggregator";

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
  const mockModbus = process.env.PRIZM_MODBUS_MOCK === "true";
  
  if (mockModbus && !bootStatus.warnings.includes("MOCK MODBUS DATA ACTIVE - NOT FIELD DATA")) {
     bootStatus.warnings.push("MOCK MODBUS DATA ACTIVE - NOT FIELD DATA");
  }

  updateStatus({}); // just updates updatedAt
  return { ...bootStatus };
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

    updateStatus({
      activeProfile: activeProfile.id,
      activeEmsBaseUrl: `http://${activeProfile.emsHost}:${activeProfile.emsPort}${activeProfile.turtlePath}`,
      stationCode: activeProfile.stationCode,
      blockIndex: activeProfile.blockIndex,
      phase: "probing-ems"
    });

    // initial poll
    let reachable = false;
    try {
      await pollEmsTurtle();
      reachable = true;
    } catch (e) {
      updateStatus({ errors: ["EMS initially unreachable"] });
    }

    updateStatus({
      emsReachable: reachable,
      phase: reachable ? "ems-live" : "offline"
    });

    startBackgroundPolling();
    
    // Asynchronously continue hydration without blocking
    hydrateCache().catch(console.error);

  } catch (err: any) {
    updateStatus({ phase: "degraded", errors: [err.message] });
  } finally {
    isBooting = false;
  }
}

export function handleProfileChange() {
  // Reset sequence
  if (livePollingInterval) clearInterval(livePollingInterval);
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
     
     // Trigger feather discovery
     updateStatus({ phase: "discovering-feather" });
     try {
       await refreshFeatherCache({ force: true });
       bootStatus.preloadStatus.featherDevices = true;
     } catch (e) {
       console.error(e);
     }
  }

  updateStatus({ phase: bootStatus.emsReachable ? "ready" : "offline", ready: true });
}

export function startBackgroundPolling() {
  if (livePollingInterval) clearInterval(livePollingInterval);
  if (slowRefreshInterval) clearInterval(slowRefreshInterval);

  livePollingInterval = setInterval(async () => {
    try {
      await pollEmsTurtle();
      recordTelemetrySample(emsCache, getFeatherCache());
      updateStatus({
         lastSuccessfulPoll: new Date().toISOString(),
         emsReachable: true
      });
    } catch (e) {
      updateStatus({ emsReachable: false });
    }
  }, 5000);

  slowRefreshInterval = setInterval(async () => {
    // maybe refresh modbus map
  }, 5 * 60 * 1000);
}
