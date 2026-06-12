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
     
     // 1. siteTopology.featherDevices[].ipAddress (explicit feather from known reports/endpoints)
     for (const f of topology.featherDevices) {
         if (f.ipAddress) {
             candidatesMap.set(f.ipAddress, {
                deviceIp: f.ipAddress,
                sourceDiscoveryMethod: "ip-map",
                arrayIndex: f.arrayIndex ?? null,
                stringIndex: f.stringIndex ?? null,
                entityName: f.enclosureLabel ?? `Feather at ${f.ipAddress}`,
                entityKeyToken: f.enclosureLabel ?? `FEATHER_${f.ipAddress}`
             });
         }
     }

     // 2. siteTopology.ipMap[] records that explicitly look like Feather/CS/ES/BMS/HVAC/sensor nodes
     for (const ipm of topology.ipMap) {
         const typeStr = (ipm.entityType || "").toLowerCase();
         const descStr = (ipm.entityDescription || ipm.displayKey || "").toLowerCase();
         // If it explicitly looks like feather/environment/bms AND not just a general string/bpc
         const isExplicitFeather = 
             typeStr.includes('feather') || descStr.includes('feather') || 
             typeStr.includes('bms') || 
             typeStr.includes('hvac') || descStr.includes('hvac') ||
             typeStr.includes('hts') || descStr.includes('hts') ||
             typeStr.includes('thermal') || descStr.includes('thermal') ||
             typeStr.includes('mio') || descStr.includes('mio') ||
             typeStr.includes('fss') || descStr.includes('fss') ||
             typeStr.includes('door') || descStr.includes('door') ||
             typeStr.includes('sensor') || descStr.includes('sensor') ||
             typeStr.includes('enclosure controller') || descStr.includes('enclosure controller');
             
         const isGeneralString = 
             typeStr.includes('bpc') || descStr.includes('bpc') || 
             typeStr.includes('string controller') || descStr.includes('string controller') ||
             typeStr.includes('pcs') || descStr.includes('pcs');

         if (ipm.ipAddress && !candidatesMap.has(ipm.ipAddress)) {
             if (isExplicitFeather && !isGeneralString) {
                 candidatesMap.set(ipm.ipAddress, {
                      deviceIp: ipm.ipAddress,
                      sourceDiscoveryMethod: "ip-map",
                      arrayIndex: ipm.arrayIndex ?? null,
                      stringIndex: ipm.stringIndex ?? null,
                      entityName: ipm.entityDescription || ipm.displayKey || `IP-Map Entity`,
                      entityKeyToken: `IP_MAP_VAL`
                 });
             } else if (isGeneralString || typeStr.includes('es')) {
                 candidatesMap.set(ipm.ipAddress, {
                      deviceIp: ipm.ipAddress,
                      sourceDiscoveryMethod: "ip-map",
                      arrayIndex: ipm.arrayIndex ?? null,
                      stringIndex: ipm.stringIndex ?? null,
                      entityName: ipm.entityDescription || ipm.displayKey || `IP-Map Entity`,
                      entityKeyToken: `IP_MAP_VAL`,
                      excluded: true,
                      excludeReason: "string-controller-or-inferred-es-host"
                 });
             }
         }
     }
     
     // 3. String IPs from stringIpMap (these are almost always string controllers, not feathers)
     for (const sim of topology.stringIpMap) {
          if (sim.ipAddress && !candidatesMap.has(sim.ipAddress)) {
              candidatesMap.set(sim.ipAddress, {
                  deviceIp: sim.ipAddress,
                  sourceDiscoveryMethod: "string-ip-map",
                  arrayIndex: sim.arrayIndex ?? null,
                  stringIndex: sim.stringIndex ?? null,
                  entityName: `Array ${sim.arrayIndex} String ${sim.stringIndex} Controller`,
                  entityKeyToken: `STR_IP_VAL`,
                  excluded: true,
                  excludeReason: "string-controller-or-inferred-es-host"
              });
          }
     }

     // 4. Fallback to Known Pattern (EMS arrays)
     // Always augment with probable ES hosts if we know arrays exist
     const activeProfile = ProfileStore.getActiveProfile();
     let arrayCount = activeProfile ? (activeProfile.arrayCount ?? 0) : 0;
     
     // Use topology array count if available and > activeProfile count
     if (topology.counts?.arrayCount && topology.counts.arrayCount > arrayCount) {
         arrayCount = topology.counts.arrayCount;
     }
     
     // fallback to 8 standard arrays if not known initially, matching typical BESS topology
     if (arrayCount === 0) arrayCount = 8; 

     for (let a = 1; a <= arrayCount; a++) {
         // CS Host (array controller)
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
         } else if (candidatesMap.get(arrayIp)?.excluded) {
             candidatesMap.get(arrayIp)!.excluded = false;
         }

         // ES Hosts (.10 to .105 step 5)
         for (let h = 10; h <= 105; h += 5) {
             const stringIp = `10.0.${a}.${h}`;
             const stringIndex = Math.floor((h - 10) / 5) + 1;
             if (!candidatesMap.has(stringIp)) {
                 candidatesMap.set(stringIp, {
                     deviceIp: stringIp,
                     sourceDiscoveryMethod: "blockviewer",
                     arrayIndex: a,
                     stringIndex,
                     entityName: `Array ${a} String ${stringIndex} Enclosure Controller`,
                     entityKeyToken: `ARR_${a}_STR_${stringIndex}_ES`
                 });
             } else if (candidatesMap.get(stringIp)?.excluded) {
                 candidatesMap.get(stringIp)!.excluded = false;
             }
         }
     }
  } catch (err) {
     console.warn("Could not extract topology candidates from siteTopology:", err);
  }

  return Array.from(candidatesMap.values());
}
