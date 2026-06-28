import fs from "fs";
import path from "path";
import { getFeatherCache } from "../feather/featherClient";
import { getEmsCachedBlock, getEmsCachedStatus, getEmsCachedRawStrings, getEmsConnectionStatus, getEmsCachedFirstResponder } from "../emsTurtleClient";

export type TopologyLayoutFamily =
  | "stack750_800"
  | "stack360"
  | "stack225_230"
  | "custom";

export type EquipmentModel =
  | "centipede"
  | "containerized-central-control"
  | "containerized-distributed-environmental"
  | "custom";

export type TopologyUiMode =
  | "lineup"
  | "container"
  | "distributed-environmental"
  | "custom";

export type SiteTopologyProfile = {
  id: string;
  name: string;
  stationCode: string;
  blockIndex: number;
  customer?: string;
  siteName?: string;
  layoutFamily: TopologyLayoutFamily;
  equipmentModel: EquipmentModel;
  uiMode: TopologyUiMode;

  architecture?: {
    usesLineups: boolean;
    usesCollectionSegments: boolean;
    usesEnergySegments: boolean;
    usesContainers: boolean;
    usesStacks: boolean;
    usesCentralEnvironmentalPlc: boolean;
    usesDistributedEnvironmentalDevices: boolean;
  };

  assumptions: {
    arrayCount: number;

    // Stack 750 / Centipede assumptions
    energySegmentsPerArray?: number;
    collectionSegmentsPerArray?: number;
    stringsPerEnergySegment?: number;
    pcsCount?: number;
    bmsUnitsPerString?: number;
    phoenixBmsPerString?: number;

    // Stack 360 / Containerized assumptions
    containersPerArray?: number;
    stacksPerContainer?: number;
    stringsPerStack?: number;
    environmentalControllersPerContainer?: number;
    upsPerArray?: number;
    enclosureSwitchesPerArray?: number;

    baseSubnet: string;
  };

  ipPlan: {
    subnet: string;
    arrayThirdOctetMode?: "array-index" | "custom";

    stack750?: {
      feather: {
        collectionSegmentLastOctet: number;       // default 3
        energySegmentStartLastOctet: number;      // default 10
        energySegmentStep: number;                // default 5
      };
      strings?: {
        pattern?: string;
      };
      pcs?: {
        pattern?: string;
      };
    };

    stack360?: {
      controlsRange?: string;
      pcsRange?: string;
      environmentalControllerRange?: string;
      upsRange?: string;
      enclosureSwitchRange?: string;
      dhcpStackRange?: string;
    };

    customDevices?: SiteTopologyDevice[];
  };

  createdAt: string;
  updatedAt: string;
  source: "user-configured" | "imported" | "live-discovered" | "default";
};

export type SiteTopologyDevice = {
  id: string;
  deviceType:
    | "feather"
    | "collection-segment-feather"
    | "energy-segment-feather"
    | "environmental-controller"
    | "string-controller"
    | "bms-phoenix"
    | "pcs"
    | "ups"
    | "moxa-io"
    | "network-switch"
    | "hirschmann-switch"
    | "gateway"
    | "ems"
    | "container-controller"
    | "stack-controller"
    | "unknown";

  ip: string;
  hostname?: string;
  label: string;

  stationCode?: string;
  blockIndex?: number;
  arrayIndex?: number;

  layoutFamily: TopologyLayoutFamily;

  segmentType?: "CS" | "ES" | "CONTAINER" | "STACK" | "NONE" | "UNKNOWN";

  collectionSegmentIndex?: number | null;
  energySegmentIndex?: number | null;
  containerIndex?: number | null;
  stackIndex?: number | null;

  stringIndex?: number | null;
  pairedStringNumbers?: number[];

  expected: boolean;
  discovered: boolean;
  reachable?: boolean;

  dataSourceMode?:
    | "direct-ip"
    | "turtle-report"
    | "ems-cache"
    | "imported-metadata"
    | "generated-reference"
    | "manual"
    | "unknown";

  requiresDirectIpValidation?: boolean;

  logicalSource?: {
    provider: "turtle" | "ems" | "direct" | "manual";
    endpointTemplate?: string;
    arrayIndex?: number;
    pcsIndex?: number;
    stringIndex?: number;
    segmentIndex?: number;
  };

  networkAddress?: {
    ip?: string | null;
    port?: number | null;
    source: "imported" | "generated" | "discovered" | "manual" | "unknown";
    validationApplies: boolean;
  };

  source:
    | "generated"
    | "live-discovered"
    | "imported"
    | "user-override"
    | "merged";

  capabilities: {
    hasStrings: boolean;
    hasCellVoltage: boolean;
    hasCellTemperature: boolean;
    hasHvac: boolean;
    hasOpenClosedDetectors: boolean;
    hasPcsTelemetry: boolean;
    hasBmsTelemetry: boolean;
    hasStackTelemetry: boolean;
    hasContainerTelemetry: boolean;
  };

  sourceCoverage?: {
    topologyProfile: boolean;
    liveLanDiscovery: boolean;
    turtleEndpoint: boolean;
    userOverride: boolean;
  };

  raw?: any;
};

export type NormalizedSiteTopology = {
  profile: SiteTopologyProfile;
  devices: SiteTopologyDevice[];
  arrays: Array<{
    arrayIndex: number;
    collectionSegments: SiteTopologyDevice[];
    energySegments: SiteTopologyDevice[];
    containers: SiteTopologyDevice[];
    stacks: SiteTopologyDevice[];
    stringControllers: SiteTopologyDevice[];
    pcsUnits: SiteTopologyDevice[];
    bmsUnits: SiteTopologyDevice[];
    upsUnits: SiteTopologyDevice[];
    networkDevices: SiteTopologyDevice[];
    ioDevices: SiteTopologyDevice[];
  }>;
  summary: {
    expectedDevices: number;
    discoveredDevices: number;
    missingDevices: number;
    unexpectedDevices: number;

    inferredLiveFamily?: TopologyLayoutFamily;
    inferredLiveConfidence?: number;

    arrays: number;
    energySegments: number;
    collectionSegments: number;
    containers: number;
    stacks: number;
    strings: number;
    pcsUnits: number;
    bmsUnits: number;
    upsUnits: number;
    networkDevices: number;
    integrityScore?: number;
  };
  validation: {
    missing: SiteTopologyDevice[];
    unexpected: SiteTopologyDevice[];
    mismatched: any[];
    warnings: string[];
  };
};

const DATA_DIR = path.join(process.cwd(), "data");
const TOPOLOGY_PROFILES_DIR = path.join(DATA_DIR, "topology-profiles");
const ACTIVE_PROFILE_FILE = path.join(DATA_DIR, "active-topology-profile.json");

// IP Helpers
function cleanSubnet(ipOrSubnet: string): string {
  const parts = ipOrSubnet.trim().split("/");
  const ip = parts[0].trim();
  const octets = ip.split(".");
  if (octets.length >= 2) {
    return `${octets[0]}.${octets[1]}`;
  }
  return "10.0";
}

function buildIpAddress(basePrefix: string, arrayIndex: number, lastOctet: number): string {
  return `${basePrefix}.${arrayIndex}.${lastOctet}`;
}

export function isValidIpAddress(ip: string): boolean {
  if (typeof ip !== "string") return false;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = Number(p);
    return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p.trim();
  });
}

// Default Stack 750 / Centipede Profile
export function getDefaultStack750Profile(id = "default-stack750"): SiteTopologyProfile {
  return {
    id,
    name: "Default Stack 750 / Centipede Profile",
    stationCode: "BHE0020",
    blockIndex: 1,
    siteName: "Solar Star Centipede BESS",
    customer: "GreEnergy Star",
    layoutFamily: "stack750_800",
    equipmentModel: "centipede",
    uiMode: "lineup",
    architecture: {
      usesLineups: true,
      usesCollectionSegments: true,
      usesEnergySegments: true,
      usesContainers: false,
      usesStacks: false,
      usesCentralEnvironmentalPlc: false,
      usesDistributedEnvironmentalDevices: false,
    },
    assumptions: {
      arrayCount: 8,
      energySegmentsPerArray: 20,
      collectionSegmentsPerArray: 1,
      stringsPerEnergySegment: 2,
      pcsCount: 1,
      bmsUnitsPerString: 1,
      phoenixBmsPerString: 1,
      baseSubnet: "10.0.0.0/16"
    },
    ipPlan: {
      subnet: "10.0.0.0/16",
      arrayThirdOctetMode: "array-index",
      stack750: {
        feather: {
          collectionSegmentLastOctet: 3,
          energySegmentStartLastOctet: 10,
          energySegmentStep: 5
        }
      }
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "default"
  };
}

// Default Stack 360 / Containerized Profile
export function getDefaultStack360Profile(id = "default-stack360"): SiteTopologyProfile {
  return {
    id,
    name: "Default Stack 360 / Containerized Profile",
    stationCode: "YUMA001",
    blockIndex: 1,
    siteName: "Yuma Containerized BESS",
    customer: "Yuma Energy",
    layoutFamily: "stack360",
    equipmentModel: "containerized-central-control",
    uiMode: "container",
    architecture: {
      usesLineups: false,
      usesCollectionSegments: false,
      usesEnergySegments: false,
      usesContainers: true,
      usesStacks: true,
      usesCentralEnvironmentalPlc: true,
      usesDistributedEnvironmentalDevices: false,
    },
    assumptions: {
      arrayCount: 4,
      containersPerArray: 1,
      stacksPerContainer: 2,
      stringsPerStack: 10,
      environmentalControllersPerContainer: 1,
      upsPerArray: 1,
      enclosureSwitchesPerArray: 1,
      baseSubnet: "10.1.0.0/16"
    },
    ipPlan: {
      subnet: "10.1.0.0/16",
      arrayThirdOctetMode: "array-index",
      stack360: {
        controlsRange: "10.1.x.11",
        pcsRange: "10.1.x.40",
        environmentalControllerRange: "10.1.x.50-10.1.x.51",
        upsRange: "10.1.x.30",
        enclosureSwitchRange: "10.1.x.10",
        dhcpStackRange: "10.1.x.100-10.1.x.120"
      }
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "default"
  };
}

// Default Stack 225 / 230 / Containerized Distributed Profile
export function getDefaultStack225_230Profile(id = "default-stack225_230"): SiteTopologyProfile {
  return {
    id,
    name: "Default Stack 225 / 230 / Distributed Profile",
    stationCode: "DIST001",
    blockIndex: 1,
    siteName: "Distributed Environmental BESS",
    customer: "Distributed Energy",
    layoutFamily: "stack225_230",
    equipmentModel: "containerized-distributed-environmental",
    uiMode: "distributed-environmental",
    architecture: {
      usesLineups: false,
      usesCollectionSegments: false,
      usesEnergySegments: false,
      usesContainers: true,
      usesStacks: true,
      usesCentralEnvironmentalPlc: false,
      usesDistributedEnvironmentalDevices: true,
    },
    assumptions: {
      arrayCount: 4,
      containersPerArray: 1,
      stacksPerContainer: 2,
      stringsPerStack: 10,
      environmentalControllersPerContainer: 12, // distributed
      upsPerArray: 1,
      enclosureSwitchesPerArray: 1,
      baseSubnet: "10.2.0.0/16"
    },
    ipPlan: {
      subnet: "10.2.0.0/16",
      arrayThirdOctetMode: "array-index",
      customDevices: []
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "default"
  };
}

// Initialize Directories and Seed Default Profiles
export function ensureSiteTopologyEngineInitialized() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TOPOLOGY_PROFILES_DIR)) {
    fs.mkdirSync(TOPOLOGY_PROFILES_DIR, { recursive: true });
  }

  // Seed default profiles if empty
  const files = fs.readdirSync(TOPOLOGY_PROFILES_DIR);
  const jsonFiles = files.filter(f => f.endsWith(".json"));

  if (jsonFiles.length === 0) {
    const s750 = getDefaultStack750Profile();
    const s360 = getDefaultStack360Profile();
    const s225 = getDefaultStack225_230Profile();

    fs.writeFileSync(path.join(TOPOLOGY_PROFILES_DIR, `${s750.id}.json`), JSON.stringify(s750, null, 2), "utf8");
    fs.writeFileSync(path.join(TOPOLOGY_PROFILES_DIR, `${s360.id}.json`), JSON.stringify(s360, null, 2), "utf8");
    fs.writeFileSync(path.join(TOPOLOGY_PROFILES_DIR, `${s225.id}.json`), JSON.stringify(s225, null, 2), "utf8");
  }

  // Set active profile file if not present
  if (!fs.existsSync(ACTIVE_PROFILE_FILE)) {
    const s750 = getDefaultStack750Profile();
    fs.writeFileSync(ACTIVE_PROFILE_FILE, JSON.stringify({ activeId: s750.id }, null, 2), "utf8");
  }
}

// List all Profiles
export function getTopologyProfiles(): SiteTopologyProfile[] {
  ensureSiteTopologyEngineInitialized();
  const files = fs.readdirSync(TOPOLOGY_PROFILES_DIR);
  const profiles: SiteTopologyProfile[] = [];

  for (const file of files) {
    if (file.endsWith(".json")) {
      try {
        const content = fs.readFileSync(path.join(TOPOLOGY_PROFILES_DIR, file), "utf8");
        const prof = JSON.parse(content) as SiteTopologyProfile;
        profiles.push(prof);
      } catch (err) {
        console.error(`Failed to read/parse topology profile: ${file}`, err);
      }
    }
  }

  return profiles;
}

// Get Active Profile
export function getActiveTopologyProfile(): SiteTopologyProfile {
  ensureSiteTopologyEngineInitialized();
  let activeId = "default-stack750";
  try {
    if (fs.existsSync(ACTIVE_PROFILE_FILE)) {
      const activeData = JSON.parse(fs.readFileSync(ACTIVE_PROFILE_FILE, "utf8"));
      if (activeData && activeData.activeId) {
        activeId = activeData.activeId;
      }
    }
  } catch (err) {
    console.error("Failed to read active topology profile configuration, defaulting.", err);
  }

  const profiles = getTopologyProfiles();
  const activeProf = profiles.find(p => p.id === activeId) || profiles[0] || getDefaultStack750Profile(activeId);
  return activeProf;
}

// Activate Profile
export function activateTopologyProfile(id: string): SiteTopologyProfile {
  ensureSiteTopologyEngineInitialized();
  const profiles = getTopologyProfiles();
  const target = profiles.find(p => p.id === id);
  if (!target) {
    throw new Error(`Topology Profile with ID '${id}' does not exist.`);
  }

  fs.writeFileSync(ACTIVE_PROFILE_FILE, JSON.stringify({ activeId: id }, null, 2), "utf8");
  return target;
}

// Save Profile
export function saveTopologyProfile(profile: SiteTopologyProfile): SiteTopologyProfile {
  ensureSiteTopologyEngineInitialized();
  if (!profile.id) {
    profile.id = "topology-prof-" + Math.random().toString(36).substring(2, 11);
  }
  profile.updatedAt = new Date().toISOString();
  if (!profile.createdAt) {
    profile.createdAt = profile.updatedAt;
  }

  fs.writeFileSync(
    path.join(TOPOLOGY_PROFILES_DIR, `${profile.id}.json`),
    JSON.stringify(profile, null, 2),
    "utf8"
  );
  return profile;
}

// Delete Profile
export function deleteTopologyProfile(id: string) {
  ensureSiteTopologyEngineInitialized();
  const filePath = path.join(TOPOLOGY_PROFILES_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Check if active profile was deleted
  try {
    if (fs.existsSync(ACTIVE_PROFILE_FILE)) {
      const activeData = JSON.parse(fs.readFileSync(ACTIVE_PROFILE_FILE, "utf8"));
      if (activeData && activeData.activeId === id) {
        const remaining = getTopologyProfiles();
        if (remaining.length > 0) {
          activateTopologyProfile(remaining[0].id);
        } else {
          const s750 = getDefaultStack750Profile();
          saveTopologyProfile(s750);
          activateTopologyProfile(s750.id);
        }
      }
    }
  } catch {}
}

// Generate Expected Devices based on profile constraints
export function generateExpectedDevices(profile: SiteTopologyProfile): SiteTopologyDevice[] {
  const devices: SiteTopologyDevice[] = [];

  // If this profile was imported from a CSV/Map, use the explicit custom devices it parsed, regardless of the layoutFamily.
  // The layoutFamily is used to drive UI modes and capabilities, but the IP list is explicit.
  if (profile.source === "imported" && profile.ipPlan.customDevices && profile.ipPlan.customDevices.length > 0) {
    profile.ipPlan.customDevices.forEach((d, idx) => {
      devices.push({
        ...d,
        id: d.id || `custom_device_${idx}`,
        expected: true,
        discovered: false,
        source: "imported"
      });
    });
    return devices;
  }

  const basePrefix = cleanSubnet(profile.assumptions.baseSubnet || "10.0");

  if (profile.layoutFamily === "stack750_800") {
    const arrayCount = profile.assumptions.arrayCount || 8;
    const esCount = profile.assumptions.energySegmentsPerArray || 20;
    const plan750 = profile.ipPlan.stack750 || {
      feather: {
        collectionSegmentLastOctet: 3,
        energySegmentStartLastOctet: 10,
        energySegmentStep: 5
      }
    };

    const csOctet = plan750.feather?.collectionSegmentLastOctet ?? 3;
    const esStart = plan750.feather?.energySegmentStartLastOctet ?? 10;
    const esStep = plan750.feather?.energySegmentStep ?? 5;

    for (let arr = 1; arr <= arrayCount; arr++) {
      // 1. PCS Units (pcsCount interpreted as pcsPerArray for stack750_800)
      const pcsPerArray = profile.assumptions.pcsCount || 1;
      for (let p = 1; p <= pcsPerArray; p++) {
        const pcsIp = buildIpAddress(basePrefix, arr, p); // Usually .1, .2
        devices.push({
          id: `pcs_arr_${arr}_${p}`,
          dataSourceMode: "turtle-report",
          requiresDirectIpValidation: false,
          logicalSource: { provider: "turtle", endpointTemplate: "/tools/report/ems/array/{arrayIndex}/pcs/{pcsIndex}/report.json" },
          networkAddress: { source: "generated", validationApplies: false },
          deviceType: "pcs",
          ip: pcsIp,
          label: `Array ${arr} PCS ${p}`,
          stationCode: profile.stationCode,
          blockIndex: profile.blockIndex,
          arrayIndex: arr,
          layoutFamily: "stack750_800",
          segmentType: "NONE",
          expected: true,
          discovered: false,
          source: "generated",
          capabilities: {
            hasStrings: false,
            hasCellVoltage: false,
            hasCellTemperature: false,
            hasHvac: false,
            hasOpenClosedDetectors: false,
            hasPcsTelemetry: true,
            hasBmsTelemetry: false,
            hasStackTelemetry: false,
            hasContainerTelemetry: false
          }
        });
      }

      // 2. Collection Segment Feather
      const csIp = buildIpAddress(basePrefix, arr, csOctet);
      devices.push({
        id: `cs_arr_${arr}`,
        dataSourceMode: "direct-ip",
        requiresDirectIpValidation: true,
        logicalSource: { provider: "direct", endpointTemplate: "http://{ip}:8080/feather/status/report.json" },
        networkAddress: { ip: csIp, source: "generated", validationApplies: true },
        deviceType: "collection-segment-feather",
        ip: csIp,
        label: `Array ${arr} CS`,
        stationCode: profile.stationCode,
        blockIndex: profile.blockIndex,
        arrayIndex: arr,
        layoutFamily: "stack750_800",
        segmentType: "CS",
        collectionSegmentIndex: 1,
        expected: true,
        discovered: false,
        source: "generated",
        capabilities: {
          hasStrings: false,
          hasCellVoltage: false,
          hasCellTemperature: false,
          hasHvac: true, // CS can have HVAC
          hasOpenClosedDetectors: true,
          hasPcsTelemetry: false,
          hasBmsTelemetry: false,
          hasStackTelemetry: false,
          hasContainerTelemetry: false
        }
      });

      // 3. Energy Segment Feathers
      for (let es = 1; es <= esCount; es++) {
        const lastOctet = esStart + (es - 1) * esStep;
        const esIp = buildIpAddress(basePrefix, arr, lastOctet);
        const strA = (es * 2) - 1;
        const strB = es * 2;

        devices.push({
          id: `es_arr_${arr}_es_${es}`,
          dataSourceMode: "direct-ip",
          requiresDirectIpValidation: true,
          logicalSource: { provider: "direct", endpointTemplate: "http://{ip}:8080/feather/status/report.json" },
          networkAddress: { ip: esIp, source: "generated", validationApplies: true },
          deviceType: "energy-segment-feather",
          ip: esIp,
          label: `Array ${arr} ES ${es}`,
          stationCode: profile.stationCode,
          blockIndex: profile.blockIndex,
          arrayIndex: arr,
          layoutFamily: "stack750_800",
          segmentType: "ES",
          energySegmentIndex: es,
          pairedStringNumbers: [strA, strB],
          expected: true,
          discovered: false,
          source: "generated",
          capabilities: {
            hasStrings: true,
            hasCellVoltage: true,
            hasCellTemperature: true,
            hasHvac: true,
            hasOpenClosedDetectors: true,
            hasPcsTelemetry: false,
            hasBmsTelemetry: true,
            hasStackTelemetry: false,
            hasContainerTelemetry: false
          }
        });
      }
    }
  } else if (profile.layoutFamily === "stack360") {
    const arrayCount = profile.assumptions.arrayCount || 4;
    const contCount = profile.assumptions.containersPerArray || 1;
    const stackCount = profile.assumptions.stacksPerContainer || 2;
    const ecCount = profile.assumptions.environmentalControllersPerContainer || 1;
    const totalSitePcs = profile.assumptions.pcsCount || 6;

    // Generate Site-Wide Central PCS units
    for (let p = 1; p <= totalSitePcs; p++) {
      const pcsIp = buildIpAddress(basePrefix, 0, 40 + p); // e.g. .0.41, .0.42
      devices.push({
        id: `pcs_site_${p}`,
        dataSourceMode: "turtle-report",
        requiresDirectIpValidation: false,
        logicalSource: { provider: "turtle" },
        networkAddress: { source: "generated", validationApplies: false },
        deviceType: "pcs",
        ip: pcsIp,
        label: `Site PCS ${p}`,
        stationCode: profile.stationCode,
        blockIndex: profile.blockIndex,
        layoutFamily: "stack360",
        segmentType: "NONE",
        expected: true,
        discovered: false,
        source: "generated",
        capabilities: {
          hasStrings: false,
          hasCellVoltage: false,
          hasCellTemperature: false,
          hasHvac: false,
          hasOpenClosedDetectors: false,
          hasPcsTelemetry: true,
          hasBmsTelemetry: false,
          hasStackTelemetry: false,
          hasContainerTelemetry: false
        }
      });
    }

    for (let arr = 1; arr <= arrayCount; arr++) {
      for (let c = 1; c <= contCount; c++) {
        // Enclosure Switch (often lastOctet .10)
        const swIp = buildIpAddress(basePrefix, arr, 10);
        devices.push({
          id: `switch_arr_${arr}_c_${c}`,
          deviceType: "network-switch",
          ip: swIp,
          label: `Array ${arr} Container ${c} Switch`,
          stationCode: profile.stationCode,
          blockIndex: profile.blockIndex,
          arrayIndex: arr,
          containerIndex: c,
          layoutFamily: "stack360",
          segmentType: "CONTAINER",
          expected: true,
          discovered: false,
          source: "generated",
          capabilities: {
            hasStrings: false,
            hasCellVoltage: false,
            hasCellTemperature: false,
            hasHvac: false,
            hasOpenClosedDetectors: false,
            hasPcsTelemetry: false,
            hasBmsTelemetry: false,
            hasStackTelemetry: false,
            hasContainerTelemetry: false
          }
        });

        // Container Controller (often .11)
        const ccIp = buildIpAddress(basePrefix, arr, 11);
        devices.push({
          id: `cc_arr_${arr}_c_${c}`,
          deviceType: "container-controller",
          ip: ccIp,
          label: `Array ${arr} Container ${c} Controller`,
          stationCode: profile.stationCode,
          blockIndex: profile.blockIndex,
          arrayIndex: arr,
          containerIndex: c,
          layoutFamily: "stack360",
          segmentType: "CONTAINER",
          expected: true,
          discovered: false,
          source: "generated",
          capabilities: {
            hasStrings: false,
            hasCellVoltage: false,
            hasCellTemperature: false,
            hasHvac: false,
            hasOpenClosedDetectors: true,
            hasPcsTelemetry: false,
            hasBmsTelemetry: false,
            hasStackTelemetry: false,
            hasContainerTelemetry: true
          }
        });

        // UPS (.30)
        const upsIp = buildIpAddress(basePrefix, arr, 30);
        devices.push({
          id: `ups_arr_${arr}_c_${c}`,
          deviceType: "ups",
          ip: upsIp,
          label: `Array ${arr} Container ${c} UPS`,
          stationCode: profile.stationCode,
          blockIndex: profile.blockIndex,
          arrayIndex: arr,
          containerIndex: c,
          layoutFamily: "stack360",
          segmentType: "CONTAINER",
          expected: true,
          discovered: false,
          source: "generated",
          capabilities: {
            hasStrings: false,
            hasCellVoltage: false,
            hasCellTemperature: false,
            hasHvac: false,
            hasOpenClosedDetectors: false,
            hasPcsTelemetry: false,
            hasBmsTelemetry: false,
            hasStackTelemetry: false,
            hasContainerTelemetry: false
          }
        });

        // Environmental Controllers (starting at .50)
        for (let ec = 1; ec <= ecCount; ec++) {
          const ecIp = buildIpAddress(basePrefix, arr, 50 + (ec - 1));
          devices.push({
            id: `ec_arr_${arr}_c_${c}_ec_${ec}`,
            deviceType: "environmental-controller",
            ip: ecIp,
            label: `Array ${arr} Container ${c} EC ${ec}`,
            stationCode: profile.stationCode,
            blockIndex: profile.blockIndex,
            arrayIndex: arr,
            containerIndex: c,
            layoutFamily: "stack360",
            segmentType: "CONTAINER",
            expected: true,
            discovered: false,
            source: "generated",
            capabilities: {
              hasStrings: false,
              hasCellVoltage: false,
              hasCellTemperature: false,
              hasHvac: true,
              hasOpenClosedDetectors: true,
              hasPcsTelemetry: false,
              hasBmsTelemetry: false,
              hasStackTelemetry: false,
              hasContainerTelemetry: false
            }
          });
        }

        // Stack Controllers (starting at .100)
        for (let stk = 1; stk <= stackCount; stk++) {
          const stkIp = buildIpAddress(basePrefix, arr, 100 + (stk - 1));
          devices.push({
            id: `sc_arr_${arr}_c_${c}_stk_${stk}`,
            deviceType: "stack-controller",
            ip: stkIp,
            label: `Array ${arr} Container ${c} Stack ${stk}`,
            stationCode: profile.stationCode,
            blockIndex: profile.blockIndex,
            arrayIndex: arr,
            containerIndex: c,
            stackIndex: stk,
            layoutFamily: "stack360",
            segmentType: "STACK",
            expected: true,
            discovered: false,
            source: "generated",
            capabilities: {
              hasStrings: true,
              hasCellVoltage: true,
              hasCellTemperature: true,
              hasHvac: false,
              hasOpenClosedDetectors: false,
              hasPcsTelemetry: false,
              hasBmsTelemetry: true,
              hasStackTelemetry: true,
              hasContainerTelemetry: false
            }
          });
        }
      }
    }
  } else if (profile.layoutFamily === "stack225_230") {
    const arrayCount = profile.assumptions?.arrayCount || 4;
    const containersPerArray = profile.assumptions?.containersPerArray || 1;
    const stacksPerContainer = profile.assumptions?.stacksPerContainer || 2;
    const ecCount = profile.assumptions?.environmentalControllersPerContainer || 12;
    const totalSitePcs = profile.assumptions?.pcsCount || 6;
    const basePrefix = cleanSubnet(profile.ipPlan.subnet);

    // Generate Site-Wide Central PCS units
    for (let p = 1; p <= totalSitePcs; p++) {
      const pcsIp = buildIpAddress(basePrefix, 0, 40 + p);
      devices.push({
        id: `pcs_site_${p}`,
        dataSourceMode: "turtle-report",
        requiresDirectIpValidation: false,
        logicalSource: { provider: "turtle" },
        networkAddress: { source: "generated", validationApplies: false },
        deviceType: "pcs",
        ip: pcsIp,
        label: `Site PCS ${p}`,
        stationCode: profile.stationCode,
        blockIndex: profile.blockIndex,
        layoutFamily: "stack225_230",
        segmentType: "NONE",
        expected: true,
        discovered: false,
        source: "generated",
        capabilities: {
          hasStrings: false,
          hasCellVoltage: false,
          hasCellTemperature: false,
          hasHvac: false,
          hasOpenClosedDetectors: false,
          hasPcsTelemetry: true,
          hasBmsTelemetry: false,
          hasStackTelemetry: false,
          hasContainerTelemetry: false
        }
      });
    }

    for (let arr = 1; arr <= arrayCount; arr++) {
      for (let c = 1; c <= containersPerArray; c++) {
        // Enclosure Switch (.10)
        const switchIp = buildIpAddress(basePrefix, arr, 10);
        devices.push({
          id: `sw_arr_${arr}_c_${c}`,
          deviceType: "network-switch",
          ip: switchIp,
          label: `Array ${arr} Container ${c} Switch`,
          stationCode: profile.stationCode,
          blockIndex: profile.blockIndex,
          arrayIndex: arr,
          containerIndex: c,
          layoutFamily: "stack225_230",
          segmentType: "CONTAINER",
          expected: true,
          discovered: false,
          source: "generated",
          capabilities: {
            hasStrings: false,
            hasCellVoltage: false,
            hasCellTemperature: false,
            hasHvac: false,
            hasOpenClosedDetectors: false,
            hasPcsTelemetry: false,
            hasBmsTelemetry: false,
            hasStackTelemetry: false,
            hasContainerTelemetry: false
          }
        });

        // Distributed Environmental Controllers (starting at .50)
        for (let ec = 1; ec <= ecCount; ec++) {
          const ecIp = buildIpAddress(basePrefix, arr, 50 + (ec - 1));
          devices.push({
            id: `ec_arr_${arr}_c_${c}_ec_${ec}`,
            deviceType: "environmental-controller",
            ip: ecIp,
            label: `Array ${arr} Container ${c} Env. Device ${ec}`,
            stationCode: profile.stationCode,
            blockIndex: profile.blockIndex,
            arrayIndex: arr,
            containerIndex: c,
            layoutFamily: "stack225_230",
            segmentType: "CONTAINER",
            expected: true,
            discovered: false,
            source: "generated",
            capabilities: {
              hasStrings: false,
              hasCellVoltage: false,
              hasCellTemperature: false,
              hasHvac: true,
              hasOpenClosedDetectors: true,
              hasPcsTelemetry: false,
              hasBmsTelemetry: false,
              hasStackTelemetry: false,
              hasContainerTelemetry: false
            }
          });
        }

        // Stack Controllers (starting at .100)
        for (let stk = 1; stk <= stacksPerContainer; stk++) {
          const stkIp = buildIpAddress(basePrefix, arr, 100 + (stk - 1));
          devices.push({
            id: `sc_arr_${arr}_c_${c}_stk_${stk}`,
            deviceType: "stack-controller",
            ip: stkIp,
            label: `Array ${arr} Container ${c} Stack ${stk}`,
            stationCode: profile.stationCode,
            blockIndex: profile.blockIndex,
            arrayIndex: arr,
            containerIndex: c,
            stackIndex: stk,
            layoutFamily: "stack225_230",
            segmentType: "STACK",
            expected: true,
            discovered: false,
            source: "generated",
            capabilities: {
              hasStrings: true,
              hasCellVoltage: true,
              hasCellTemperature: true,
              hasHvac: false,
              hasOpenClosedDetectors: false,
              hasPcsTelemetry: false,
              hasBmsTelemetry: true,
              hasStackTelemetry: true,
              hasContainerTelemetry: false
            }
          });
        }
      }
    }
  } else if (profile.layoutFamily === "custom") {
    // Return explicit devices if present, or generated list empty
    const custom = profile.ipPlan.customDevices || [];
    custom.forEach((d, idx) => {
      devices.push({
        ...d,
        id: d.id || `custom_device_${idx}`,
        expected: true,
        discovered: false,
        source: "generated"
      });
    });
  }

  if (profile.layoutFamily === "stack360" || profile.layoutFamily === "stack225_230") {
    devices.forEach(d => {
      if (d.deviceType !== "pcs") {
        d.dataSourceMode = "ems-cache";
        d.requiresDirectIpValidation = false;
        d.logicalSource = { provider: "ems" };
        d.networkAddress = { source: "generated", validationApplies: false };
      }
    });
  }

  return devices;
}

// Merge live discovery into topology
export function mergeLiveDiscoveryIntoTopology(
  profile: SiteTopologyProfile,
  customLiveDiscovery?: any[]
): NormalizedSiteTopology {
  // 1. Generate expected devices list
  const expectedDevices = generateExpectedDevices(profile);
  const devicesMap = new Map<string, SiteTopologyDevice>();

  // Helper to map expected devices
  expectedDevices.forEach(d => {
    devicesMap.set(d.ip, {
      ...d,
      sourceCoverage: {
        topologyProfile: true,
        liveLanDiscovery: false,
        turtleEndpoint: false,
        userOverride: false
      }
    });
  });

  // 2. Fetch live data from backend caches if not supplied
  let liveList: any[] = [];
  if (customLiveDiscovery && Array.isArray(customLiveDiscovery)) {
    liveList = customLiveDiscovery;
  } else {
    // Compile from cache layers
    // A. Feather cache
    try {
      const fCache = getFeatherCache();
      if (fCache && Array.isArray(fCache.devices)) {
        fCache.devices.forEach((d: any) => {
          liveList.push({
            ip: d.deviceIp || d.ip,
            deviceType: d.deviceType || "feather",
            reachable: d.reachable,
            source: "feather",
            raw: d
          });
        });
      }
    } catch (e) {
      console.error("Failed to load feather cache in siteTopologyEngine:", e);
    }

    // B. Strings list
    try {
      const rawStrings = getEmsCachedRawStrings().data || [];
      rawStrings.forEach((s: any) => {
        if (s.ipAddress) {
          liveList.push({
            ip: s.ipAddress,
            deviceType: "string-controller",
            reachable: true,
            source: "strings",
            raw: s
          });
        }
      });
    } catch {}

    // C. PCS units from blockviewer
    try {
      const bBlock = getEmsCachedBlock().data || {};
      const arrays = bBlock.arrays || [];
      arrays.forEach((a: any) => {
        const pcsList = a.pcses || a.arrayPcsReport || [];
        pcsList.forEach((p: any) => {
          if (p.ipAddress) {
            liveList.push({
              ip: p.ipAddress,
              deviceType: "pcs",
              reachable: true,
              source: "pcs",
              raw: p
            });
          }
        });
      });
    } catch {}
  }

  // Helper to infer or map device type nicely
  const classifyLiveDevice = (type: string, ip: string, activeProfile: SiteTopologyProfile): SiteTopologyDevice["deviceType"] => {
    const cleanType = type.toLowerCase();
    
    if (cleanType.includes("feather") || cleanType.includes("controller")) {
      if (activeProfile.layoutFamily === "stack750_800") {
        // Stack 750 / Centipede logic
        const parts = ip.split(".");
        if (parts.length === 4) {
          const lastOctet = parseInt(parts[3], 10);
          if (lastOctet === 3 || lastOctet === 4) {
            return "collection-segment-feather";
          } else if (lastOctet >= 10 && (lastOctet - 10) % 5 === 0) {
            return "energy-segment-feather";
          }
        }
        return "energy-segment-feather";
      } else if (activeProfile.layoutFamily === "stack360") {
        return "container-controller";
      } else if (activeProfile.layoutFamily === "stack225_230") {
        return "environmental-controller";
      }
      return "environmental-controller";
    }

    if (cleanType.includes("pcs")) return "pcs";
    if (cleanType.includes("string") || cleanType.includes("bpc")) return "string-controller";
    if (cleanType.includes("ups")) return "ups";
    if (cleanType.includes("switch")) return "network-switch";
    if (cleanType.includes("moxa") || cleanType.includes("io")) return "moxa-io";
    if (cleanType.includes("stack")) return "stack-controller";
    if (cleanType.includes("container")) return "container-controller";
    return "unknown";
  };

  // 3. Process live list and overlay on expected devices or add unexpected
  liveList.forEach(l => {
    if (!l.ip || !isValidIpAddress(l.ip)) return;

    const ip = l.ip.trim();
    const existing = devicesMap.get(ip);

    if (existing) {
      existing.discovered = true;
      existing.reachable = l.reachable !== false;
      existing.raw = { ...existing.raw, ...l.raw };
      if (existing.sourceCoverage) {
        existing.sourceCoverage.liveLanDiscovery = true;
        existing.sourceCoverage.turtleEndpoint = l.source === "feather";
      }
      existing.source = "merged";
    } else {
      // Unexpected device discovered
      const inferredType = classifyLiveDevice(l.deviceType || "unknown", ip, profile);
      let arrayIdx: number | undefined;

      // Simple array parsing from third octet
      const octets = ip.split(".").map(Number);
      if (octets.length === 4) {
        arrayIdx = octets[2];
      }

      devicesMap.set(ip, {
        id: `unexpected_${ip.replace(/\./g, "_")}`,
        deviceType: inferredType,
        ip,
        label: `Unexpected Discovered ${l.deviceType || "Device"} (${ip})`,
        arrayIndex: arrayIdx,
        layoutFamily: profile.layoutFamily,
        expected: false,
        discovered: true,
        reachable: l.reachable !== false,
        source: "live-discovered",
        capabilities: {
          hasStrings: inferredType === "stack-controller" || inferredType === "string-controller" || inferredType === "energy-segment-feather",
          hasCellVoltage: inferredType === "stack-controller" || inferredType === "energy-segment-feather",
          hasCellTemperature: inferredType === "stack-controller" || inferredType === "energy-segment-feather",
          hasHvac: inferredType === "environmental-controller" || inferredType === "collection-segment-feather" || inferredType === "energy-segment-feather" || inferredType === "feather",
          hasOpenClosedDetectors: inferredType === "environmental-controller" || inferredType === "collection-segment-feather" || inferredType === "energy-segment-feather" || inferredType === "container-controller" || inferredType === "feather",
          hasPcsTelemetry: inferredType === "pcs",
          hasBmsTelemetry: inferredType === "stack-controller" || inferredType === "string-controller" || inferredType === "energy-segment-feather",
          hasStackTelemetry: inferredType === "stack-controller",
          hasContainerTelemetry: inferredType === "container-controller"
        },
        sourceCoverage: {
          topologyProfile: false,
          liveLanDiscovery: true,
          turtleEndpoint: l.source === "feather",
          userOverride: false
        },
        raw: l.raw
      });
    }
  });

  const devicesList = Array.from(devicesMap.values());

  // 4. Group into arrays
  const arrayMap = new Map<number, NormalizedSiteTopology["arrays"][0]>();

  // Determine array list
  const maxArrayIdx = Math.max(
    ...devicesList.filter(d => d.arrayIndex !== undefined).map(d => d.arrayIndex || 0),
    profile.assumptions.arrayCount || 0
  );

  for (let aIdx = 1; aIdx <= maxArrayIdx; aIdx++) {
    arrayMap.set(aIdx, {
      arrayIndex: aIdx,
      collectionSegments: [],
      energySegments: [],
      containers: [],
      stacks: [],
      stringControllers: [],
      pcsUnits: [],
      bmsUnits: [],
      upsUnits: [],
      networkDevices: [],
      ioDevices: []
    });
  }

  devicesList.forEach(d => {
    const arrIdx = d.arrayIndex;
    if (arrIdx === undefined || arrIdx < 1) return;

    let arrayNode = arrayMap.get(arrIdx);
    if (!arrayNode) {
      arrayNode = {
        arrayIndex: arrIdx,
        collectionSegments: [],
        energySegments: [],
        containers: [],
        stacks: [],
        stringControllers: [],
        pcsUnits: [],
        bmsUnits: [],
        upsUnits: [],
        networkDevices: [],
        ioDevices: []
      };
      arrayMap.set(arrIdx, arrayNode);
    }

    if (d.deviceType === "collection-segment-feather") {
      arrayNode.collectionSegments.push(d);
    } else if (d.deviceType === "energy-segment-feather") {
      arrayNode.energySegments.push(d);
    } else if (d.deviceType === "container-controller" || d.deviceType === "environmental-controller") {
      arrayNode.containers.push(d);
    } else if (d.deviceType === "stack-controller") {
      arrayNode.stacks.push(d);
    } else if (d.deviceType === "string-controller") {
      arrayNode.stringControllers.push(d);
    } else if (d.deviceType === "pcs") {
      arrayNode.pcsUnits.push(d);
    } else if (d.deviceType === "bms-phoenix") {
      arrayNode.bmsUnits.push(d);
    } else if (d.deviceType === "ups") {
      arrayNode.upsUnits.push(d);
    } else if (d.deviceType === "network-switch" || d.deviceType === "hirschmann-switch" || d.deviceType === "gateway") {
      arrayNode.networkDevices.push(d);
    } else if (d.deviceType === "moxa-io") {
      arrayNode.ioDevices.push(d);
    }
  });

  const arraysResult = Array.from(arrayMap.values()).sort((a, b) => a.arrayIndex - b.arrayIndex);

  // 5. Compute summary metrics
  const expectedDevicesCount = devicesList.filter(d => d.expected).length;
  const discoveredDevicesCount = devicesList.filter(d => d.discovered).length;
  const missingDevices = devicesList.filter(d => d.expected && !d.discovered);
  const unexpectedDevices = devicesList.filter(d => !d.expected && d.discovered);

  const missing = missingDevices;
  const unexpected = unexpectedDevices;
  const mismatched: any[] = [];
  const warnings: string[] = [];

  // Identify mismatches (e.g., an expected CS mapped to an ES in discovery, or reachable status is failed)
  devicesList.forEach(d => {
    if (d.expected && d.discovered) {
      // Check if reachable is false
      if (d.reachable === false) {
        warnings.push(`Device ${d.label} at ${d.ip} is unreachable in dynamic polling.`);
      }
    }
  });

  if (missing.length > 0) {
    warnings.push(`${missing.length} expected devices are offline or missing from LAN telemetry.`);
  }
  if (unexpected.length > 0) {
    warnings.push(`${unexpected.length} unexpected devices detected during live network scanning.`);
  }

  let inferredLiveFamily: TopologyLayoutFamily | undefined = profile.layoutFamily;
  let inferredLiveConfidence: number | undefined = 100; // Default to active profile

  try {
    const blockCache = getEmsCachedBlock();
    const frCache = getEmsCachedFirstResponder();

    let v1, v2;
    if (frCache && frCache.data) {
      v1 = frCache.data.v1;
      v2 = frCache.data.v2;
    }

    // Inference priority mapping
    let inferred: TopologyLayoutFamily | undefined;
    let confidence = 0;

    // 1. IP pattern fallback (40%)
    let ecCount = 0;
    devicesList.forEach(d => {
      if (d.deviceType === "environmental-controller") ecCount++;
    });
    if (ecCount > 10) {
       inferred = "stack225_230";
       confidence = 40;
    }

    // 2. /firstresponder/data structure (80%)
    if (v1 && Object.keys(v1).length > 0 && Array.isArray(v1.containers || v1.devices)) {
      inferred = "stack360";
      confidence = 80;
    }

    // 3. /v2/firstresponder/data structure (85%)
    if (v2 && Object.keys(v2).length > 0 && Array.isArray(v2.segments || v2.devices)) {
      // Look for SegmentType
      const hasCentipede = Array.isArray(v2.devices) ? v2.devices.some((d:any) => d.segmentType === "ENERGY_SEGMENT" || d.segmentType === "COLLECTION_SEGMENT") : false;
      if (hasCentipede || typeof v2.highVoltageInterlockOk !== "undefined") {
        inferred = "stack750_800";
        confidence = 85;
      }
    }

    // 4. Turtle active stack/config hints (stackDefinitionName) (90%)
    if (blockCache && blockCache.data && blockCache.data.system) {
      const stackDef = blockCache.data.system.stackDefinitionName;
      if (stackDef) {
        if (stackDef.includes("750") || stackDef.includes("800")) {
          inferred = "stack750_800";
          confidence = 90;
        } else if (stackDef.includes("360")) {
          inferred = "stack360";
          confidence = 90;
        } else if (stackDef.includes("225") || stackDef.includes("230")) {
          inferred = "stack225_230";
          confidence = 90;
        }
      }
    }

    // We do not override an active profile automatically, but we report what we inferred
    if (inferred && confidence >= 80) {
      inferredLiveFamily = inferred;
      inferredLiveConfidence = confidence;
    }
  } catch (e) {
    console.warn("Could not infer live topology family:", e);
  }

  let integrityScore = 100;
  if (expectedDevicesCount > 0) {
    const penalty = ((missing.length + unexpected.length) / expectedDevicesCount) * 100;
    integrityScore = Math.max(0, 100 - penalty);
  }

  const summary = {
    expectedDevices: expectedDevicesCount,
    discoveredDevices: discoveredDevicesCount,
    missingDevices: missing.length,
    unexpectedDevices: unexpected.length,
    inferredLiveFamily,
    inferredLiveConfidence,
    integrityScore: Math.round(integrityScore),
    arrays: arraysResult.length,
    energySegments: devicesList.filter(d => d.deviceType === "energy-segment-feather" && d.discovered).length,
    collectionSegments: devicesList.filter(d => d.deviceType === "collection-segment-feather" && d.discovered).length,
    containers: devicesList.filter(d => d.deviceType === "container-controller" && d.discovered).length,
    stacks: devicesList.filter(d => d.deviceType === "stack-controller" && d.discovered).length,
    strings: devicesList.filter(d => d.deviceType === "string-controller" && d.discovered).length,
    pcsUnits: devicesList.filter(d => d.deviceType === "pcs" && d.discovered).length,
    bmsUnits: devicesList.filter(d => d.deviceType === "bms-phoenix" && d.discovered).length,
    upsUnits: devicesList.filter(d => d.deviceType === "ups" && d.discovered).length,
    networkDevices: devicesList.filter(d => (d.deviceType === "network-switch" || d.deviceType === "hirschmann-switch") && d.discovered).length
  };

  return {
    profile,
    devices: devicesList.sort((a, b) => {
      if (a.arrayIndex !== b.arrayIndex) {
        return (a.arrayIndex || 0) - (b.arrayIndex || 0);
      }
      return a.ip.localeCompare(b.ip);
    }),
    arrays: arraysResult,
    summary,
    validation: {
      missing,
      unexpected,
      mismatched,
      warnings
    }
  };
}
