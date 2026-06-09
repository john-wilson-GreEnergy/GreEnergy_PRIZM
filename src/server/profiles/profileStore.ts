import fs from "fs";
import path from "path";
import { EmsProfile } from "./profileTypes";

const PROFILES_DIR = path.join(process.cwd(), "data");
const PROFILES_FILE = path.join(PROFILES_DIR, "prizm_connection_profiles.json");

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
    arrayCount: 8,
    stringsPerArray: 40,
    notes: "Default local EMS profile",
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastTestedAt: null,
    lastTestResult: null
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
          if (!Array.isArray(list) || list.length === 0) {
            fs.writeFileSync(PROFILES_FILE, JSON.stringify([getDefaultProfile()], null, 2), "utf8");
          } else {
            // Validate structure of each profile item & regenerate ID if missing
            list.forEach((p, idx) => {
              if (!p.id) p.id = "prof-" + Math.random().toString(36).substring(2, 11);
              if (!p.profileName) p.profileName = `Site Profile ${idx + 1}`;
              if (!p.emsHost) p.emsHost = "10.0.0.3";
              if (p.emsPort === undefined) p.emsPort = 8080;
              if (!p.turtlePath) p.turtlePath = "/turtle";
              if (!p.modbusHost) p.modbusHost = p.emsHost;
              if (p.modbusPort === undefined) p.modbusPort = 4502;
              if (p.arrayCount === undefined) p.arrayCount = 8;
              if (p.stringsPerArray === undefined) p.stringsPerArray = 40;
            });
            // Enforce active single profile sanity
            const activeCount = list.filter(p => p.isActive).length;
            if (activeCount !== 1) {
              list.forEach((p, idx) => {
                p.isActive = idx === 0;
              });
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
