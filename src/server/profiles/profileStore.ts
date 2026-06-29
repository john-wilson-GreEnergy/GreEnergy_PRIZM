import fs from "fs";
import path from "path";
import { EmsProfile, TopologyModel, SensorMonitoringProfile } from "./profileTypes";

const PROFILES_DIR = path.join(process.cwd(), "data");
const PROFILES_FILE = path.join(PROFILES_DIR, "prizm_connection_profiles.json");

export function getDefaultSensorMonitoringProfile(): SensorMonitoringProfile {
  return {
    collectionSegment: {
      dataUnavailable: true,
      acDoors: true,
      dcDoors: true,
      topCapDoors: true,
      manualVentilation: true,
      smoke: true,
      fireTrouble: true,
      fire: true,
      io: true,
      heat: true,
      upsAlarm: true,
      moisture: false,
      leakDetector: false,
      hydrogen: false,
      hydrogenFault: false,
      envControllerVent: false
    },
    energySegment: {
      dataUnavailable: true,
      batteryDoors: true,
      topCapDoors: true,
      envControllerVent: true,
      smoke: true,
      hydrogenFault: true,
      hydrogen: true,
      io: true,
      heat: true,
      fireTrouble: true,
      moisture: true,
      fire: false,
      acDoors: false,
      dcDoors: false,
      manualVentilation: false,
      upsAlarm: false
    }
  };
}

export function getDefaultTopologyModel(): TopologyModel {
  return {
    type: "standard-array-segment",
    siteModelVersion: 2,
    basePrefix: "10.0",
    arrayOctet: 3,
    segmentOctet: 4,
    arrayStart: 1,
    arrayEnd: 8,
    segmentStart: 3,
    segmentEnd: 75,
    csSegment: 3,
    esSegmentStart: 10,
    esSegmentStep: 5,
    esCountPerArray: 20,
    includeCollectionSegment: true,
    blocks: [
      {
        blockId: "block-1",
        blockName: "Block 1",
        blockIndex: 1,
        stationCode: "BHE0020",
        emsHost: "10.0.0.3",
        emsPort: 8080,
        turtlePath: "/turtle",
        modbusHost: "10.0.0.3",
        modbusPort: 4502,
        modbusUnitId: 1,
        basePrefix: "10.0",
        arrayStart: 1,
        arrayEnd: 8,
        segmentStart: 3,
        segmentEnd: 75,
        csSegment: 3,
        esSegmentStart: 10,
        esSegmentStep: 5,
        esCountPerArray: 20,
        includeCollectionSegment: true
      }
    ]
  };
}

export function getDefaultCapacityProfile() {
  return {
    profileName: "Default 742.5kWh Operational Energy Segment",
    energySegmentCapacityKWh: 742.5,
    stringsPerEnergySegment: 2,
    nominalStringVoltageV: 1344,
    cellChemistry: "LFP",
    batteryManufacturer: "EVE/CATL/AESC/REPT compatible",
    notes: "Operational capacity profile using 742.5 kWh per Energy Segment to account for process/circuit losses from the 750 kWh DC nameplate basis."
  };
}

function getDefaultProfile(): EmsProfile {
  const now = new Date().toISOString();
  return {
    id: "default-local-ems",
    profileName: "Local EMS Default",
    siteName: "Local BESS Site",
    stationCode: "BHE0020",
    blockIndex: 1,
    emsHost: "10.0.0.3",
    emsPort: 8080,
    turtlePath: "/turtle",
    modbusHost: "10.0.0.3",
    modbusPort: 4502,
    modbusUnitId: 1,
    arrayCount: 8,
    stringsPerArray: 40,
    notes: "Default local EMS profile",
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastTestedAt: null,
    lastTestResult: null,
    topologyModel: getDefaultTopologyModel(),
    capacityProfile: getDefaultCapacityProfile(),
    sensorMonitoringProfile: getDefaultSensorMonitoringProfile()
  };
}

export class ProfileStore {
  private static initCompleted = false;

  private static ensureInitialized() {
    if (this.initCompleted) return;
    try {
      if (!fs.existsSync(PROFILES_DIR)) {
        fs.mkdirSync(PROFILES_DIR, { recursive: true });
      }
      if (!fs.existsSync(PROFILES_FILE)) {
        const defaultList = [getDefaultProfile()];
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(defaultList, null, 2), "utf8");
      } else {
        try {
          const data = fs.readFileSync(PROFILES_FILE, "utf8");
          const list: EmsProfile[] = JSON.parse(data);
          let modified = false;
          if (!Array.isArray(list) || list.length === 0) {
            fs.writeFileSync(PROFILES_FILE, JSON.stringify([getDefaultProfile()], null, 2), "utf8");
          } else {
            // Validate structure of each profile item & regenerate ID if missing
            list.forEach((p, idx) => {
              if (!p.id) { p.id = "prof-" + Math.random().toString(36).substring(2, 11); modified = true; }
              if (!p.profileName) { p.profileName = `Site Profile ${idx + 1}`; modified = true; }
              if (!p.emsHost) { p.emsHost = "10.0.0.3"; modified = true; }
              if (p.emsPort === undefined) { p.emsPort = 8080; modified = true; }
              if (!p.turtlePath) { p.turtlePath = "/turtle"; modified = true; }
              if (!p.modbusHost) { p.modbusHost = p.emsHost; modified = true; }
              if (p.modbusPort === undefined) { p.modbusPort = 4502; modified = true; }
              if (p.modbusUnitId === undefined) { p.modbusUnitId = 1; modified = true; }
              if (p.arrayCount === undefined) { p.arrayCount = 8; modified = true; }
              if (p.stringsPerArray === undefined) { p.stringsPerArray = 40; modified = true; }
              if (!p.sensorMonitoringProfile) {
                p.sensorMonitoringProfile = getDefaultSensorMonitoringProfile();
                modified = true;
              }
              if (!p.capacityProfile) {
                p.capacityProfile = getDefaultCapacityProfile();
                modified = true;
              } else if (p.capacityProfile.energySegmentCapacityKWh === 750) {
                p.capacityProfile = getDefaultCapacityProfile();
                modified = true;
              }
              if (!p.topologyModel || p.topologyModel.siteModelVersion !== 2) {
                 const oldTopology = p.topologyModel;
                 p.topologyModel = {
                    type: oldTopology?.type || "standard-array-segment",
                    siteModelVersion: 2,
                    basePrefix: oldTopology?.basePrefix || p.emsHost.split('.').slice(0, 2).join('.') || "10.0",
                    arrayOctet: oldTopology?.arrayOctet !== undefined ? Number(oldTopology.arrayOctet) : 3,
                    segmentOctet: oldTopology?.segmentOctet !== undefined ? Number(oldTopology.segmentOctet) : 4,
                    arrayStart: oldTopology?.arrayStart !== undefined ? Number(oldTopology.arrayStart) : 1,
                    arrayEnd: oldTopology?.arrayEnd !== undefined ? Number(oldTopology.arrayEnd) : Number(p.arrayCount || 8),
                    segmentStart: oldTopology?.segmentStart !== undefined ? Number(oldTopology.segmentStart) : 3,
                    segmentEnd: oldTopology?.segmentEnd !== undefined ? Number(oldTopology.segmentEnd) : 75,
                    csSegment: oldTopology?.csSegment !== undefined ? Number(oldTopology.csSegment) : 3,
                    esSegmentStart: oldTopology?.esSegmentStart !== undefined ? Number(oldTopology.esSegmentStart) : 10,
                    esSegmentStep: oldTopology?.esSegmentStep !== undefined ? Number(oldTopology.esSegmentStep) : 5,
                    esCountPerArray: oldTopology?.esCountPerArray !== undefined ? Number(oldTopology.esCountPerArray) : 20,
                    includeCollectionSegment: (oldTopology as any)?.includeCollectionSegment !== undefined ? !!(oldTopology as any).includeCollectionSegment : true,
                    blocks: []
                 };
                 // Add back block list
                 const tPrefix = p.topologyModel.basePrefix || "10.0";
                 p.topologyModel.blocks = [
                    {
                       blockId: `block-${p.blockIndex || 1}`,
                       blockName: `Block ${p.blockIndex || 1}`,
                       blockIndex: p.blockIndex || 1,
                       stationCode: p.stationCode || "BHE0020",
                       emsHost: p.emsHost,
                       emsPort: p.emsPort,
                       turtlePath: p.turtlePath,
                       modbusHost: p.modbusHost,
                       modbusPort: p.modbusPort,
                       modbusUnitId: p.modbusUnitId || 1,
                       basePrefix: tPrefix,
                       arrayStart: p.topologyModel.arrayStart,
                       arrayEnd: p.topologyModel.arrayEnd,
                       segmentStart: p.topologyModel.segmentStart,
                       segmentEnd: p.topologyModel.segmentEnd,
                       csSegment: p.topologyModel.csSegment,
                       esSegmentStart: p.topologyModel.esSegmentStart,
                       esSegmentStep: p.topologyModel.esSegmentStep,
                       esCountPerArray: p.topologyModel.esCountPerArray,
                       includeCollectionSegment: p.topologyModel.includeCollectionSegment
                    }
                 ];
                 modified = true;
              }
            });
            // Enforce active single profile sanity
            const activeCount = list.filter(p => p.isActive).length;
            if (activeCount !== 1) {
              list.forEach((p, idx) => {
                p.isActive = idx === 0;
              });
              modified = true;
            }
            if (modified) {
              fs.writeFileSync(PROFILES_FILE, JSON.stringify(list, null, 2), "utf8");
            }
          }
        } catch (e) {
          console.error("Corrupted connection profiles storage file detected, resetting safely to default profile", e);
          const defaultList = [getDefaultProfile()];
          fs.writeFileSync(PROFILES_FILE, JSON.stringify(defaultList, null, 2), "utf8");
        }
      }
    } catch (err) {
      console.error("Failed to initialize system connection profiles file:", err);
    } finally {
      this.initCompleted = true;
    }
  }

  public static getProfiles(): EmsProfile[] {
    this.ensureInitialized();
    try {
      if (!fs.existsSync(PROFILES_FILE)) {
        return [getDefaultProfile()];
      }
      const data = fs.readFileSync(PROFILES_FILE, "utf8");
      const list = JSON.parse(data);
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
      return [getDefaultProfile()];
    } catch (err) {
      console.error("Failed to fetch profiles list from store:", err);
      return [getDefaultProfile()];
    }
  }

  public static getActiveProfile(): EmsProfile {
    const list = this.getProfiles();
    const active = list.find(p => p.isActive) || list[0] || getDefaultProfile();
    return active;
  }

  public static saveProfiles(list: EmsProfile[]) {
    this.ensureInitialized();
    try {
      // Validate single active profile constraint
      if (list.length === 0) {
        list.push(getDefaultProfile());
      }
      const activeCount = list.filter(p => p.isActive).length;
      if (activeCount !== 1) {
        list.forEach((p, idx) => {
          p.isActive = idx === 0;
        });
      }
      fs.writeFileSync(PROFILES_FILE, JSON.stringify(list, null, 2), "utf8");
    } catch (err) {
      console.error("Failed saving loaded profiles list:", err);
    }
  }

  public static createProfile(p: Omit<EmsProfile, "id" | "createdAt" | "updatedAt" | "isActive">, activate = false): EmsProfile {
    const list = this.getProfiles();
    const now = new Date().toISOString();
    const id = "prof-" + Math.random().toString(36).substring(2, 11);

    const newProfile: EmsProfile = {
      ...p,
      id,
      isActive: activate,
      createdAt: now,
      updatedAt: now,
      lastTestedAt: null,
      lastTestResult: null
    };

    if (activate) {
      list.forEach(item => {
        item.isActive = false;
      });
    }

    list.push(newProfile);
    this.saveProfiles(list);
    return newProfile;
  }

  public static updateProfile(id: string, updates: Partial<Omit<EmsProfile, "id" | "createdAt" | "updatedAt">>): EmsProfile {
    const list = this.getProfiles();
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) {
      throw new Error(`Profile with id '${id}' not found`);
    }

    const now = new Date().toISOString();
    const updated: EmsProfile = {
      ...list[idx],
      ...updates,
      updatedAt: now
    };

    // If setting active, deactivate others
    if (updates.isActive) {
      list.forEach(item => {
        item.isActive = false;
      });
      updated.isActive = true;
    }

    list[idx] = updated;
    this.saveProfiles(list);
    return updated;
  }

  public static deleteProfile(id: string): EmsProfile[] {
    const list = this.getProfiles();
    if (list.length <= 1) {
      throw new Error("Deletion aborted. You cannot delete the only remaining connection profile.");
    }

    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) {
      throw new Error(`Profile with id '${id}' not found`);
    }

    const wasActive = list[idx].isActive;
    list.splice(idx, 1);

    if (wasActive && list.length > 0) {
      list[0].isActive = true;
    }

    this.saveProfiles(list);
    return list;
  }

  public static activateProfile(id: string): EmsProfile {
    const list = this.getProfiles();
    const target = list.find(p => p.id === id);
    if (!target) {
      throw new Error(`Profile with id '${id}' not found`);
    }

    list.forEach(p => {
      p.isActive = p.id === id;
    });

    this.saveProfiles(list);
    return target;
  }
}
