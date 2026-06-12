import { DiscoveryCandidate } from "./featherTypes";
import { ProfileStore } from "../profiles/profileStore";
import { buildSiteTopologyFromCachedSources } from "../topology/siteTopology";

/**
 * Discovers candidate Feather/HVAC device IPs utilizing the topology of the active profile
 * and any populated EMS diagnostics maps (IP map, string-IP map, blockviewer).
 */
export function discoverTopologyCandidates(): DiscoveryCandidate[] {
  const candidatesMap = new Map<string, DiscoveryCandidate>();
  
  try {
     const topology = buildSiteTopologyFromCachedSources();
     
     // 1. siteTopology.featherDevices[].ipAddress
     for (const f of topology.featherDevices) {
         if (f.ipAddress) {
             candidatesMap.set(f.ipAddress, {
                deviceIp: f.ipAddress,
                sourceDiscoveryMethod: "ip-map", // close enough, means generic discovered map
                arrayIndex: f.arrayIndex ?? null,
                stringIndex: f.stringIndex ?? null,
                entityName: f.enclosureLabel ?? `Feather at ${f.ipAddress}`,
                entityKeyToken: f.enclosureLabel ?? `FEATHER_${f.ipAddress}`
             });
         }
     }

     // 2. siteTopology.ipMap[] records that look like Feather/CS/ES/BMS/HVAC/sensor nodes
     for (const ipm of topology.ipMap) {
         const typeStr = (ipm.entityType || "").toLowerCase();
         const descStr = (ipm.entityDescription || ipm.displayKey || "").toLowerCase();
         // If it looks like feather/environment/bms
         if (typeStr.includes('feather') || descStr.includes('feather') || 
             typeStr.includes('es') || typeStr.includes('bms') || 
             typeStr.includes('cs') || descStr.includes('hvac')) {
             if (ipm.ipAddress && !candidatesMap.has(ipm.ipAddress)) {
                  candidatesMap.set(ipm.ipAddress, {
                      deviceIp: ipm.ipAddress,
                      sourceDiscoveryMethod: "ip-map",
                      arrayIndex: ipm.arrayIndex ?? null,
                      stringIndex: ipm.stringIndex ?? null,
                      entityName: ipm.entityDescription || ipm.displayKey || `IP-Map Entity`,
                      entityKeyToken: `IP_MAP_VAL`
                  });
             }
         }
     }

     // 3. siteTopology.stringIpMap[]
     for (const sim of topology.stringIpMap) {
          if (sim.ipAddress && !candidatesMap.has(sim.ipAddress)) {
              candidatesMap.set(sim.ipAddress, {
                  deviceIp: sim.ipAddress,
                  sourceDiscoveryMethod: "string-ip-map",
                  arrayIndex: sim.arrayIndex ?? null,
                  stringIndex: sim.stringIndex ?? null,
                  entityName: `Array ${sim.arrayIndex} String ${sim.stringIndex} Controller`,
                  entityKeyToken: `STR_IP_VAL`
              });
          }
     }
     
     // 4. EMS strings / fallback inference
     // For each array and string that isn't mapped, fallback via standard LAN plan
     if (candidatesMap.size === 0) {
        const activeProfile = ProfileStore.getActiveProfile();
        const arrayCount = activeProfile ? (activeProfile.arrayCount ?? 8) : 8;

        for (let a = 1; a <= arrayCount; a++) {
            // Array Controller (Feather host 3)
            const arrayIp = `10.0.${a}.3`;
            if (!candidatesMap.has(arrayIp)) {
                candidatesMap.set(arrayIp, {
                    deviceIp: arrayIp,
                    sourceDiscoveryMethod: "blockviewer",
                    arrayIndex: a,
                    stringIndex: null,
                    entityName: `Array ${a} Enclosure Controller`,
                    entityKeyToken: `ARR_${a}_CTRL`
                });
            }

            // Battery strings (hosts 10, 15, 20, ..., 105)
            for (let h = 10; h <= 105; h += 5) {
                const stringIp = `10.0.${a}.${h}`;
                const stringIndex = Math.floor((h - 10) / 5) + 1;
                if (!candidatesMap.has(stringIp)) {
                    candidatesMap.set(stringIp, {
                        deviceIp: stringIp,
                        sourceDiscoveryMethod: "blockviewer",
                        arrayIndex: a,
                        stringIndex,
                        entityName: `Array ${a} String ${stringIndex} Controller`,
                        entityKeyToken: `ARR_${a}_STR_${stringIndex}`
                    });
                }
            }
        }
     }

  } catch (err) {
     console.warn("Could not extract topology candidates from siteTopology:", err);
  }

  return Array.from(candidatesMap.values());
}
