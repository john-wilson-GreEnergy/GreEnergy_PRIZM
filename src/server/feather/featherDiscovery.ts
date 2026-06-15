import { DiscoveryCandidate } from "./featherTypes";
import { ProfileStore } from "../profiles/profileStore";
import { generateFeatherDiscoveryCandidatesFromTopology } from "../profiles/profileManager";
import { buildSiteTopologyFromCachedSources } from "../topology/siteTopology";

/**
 * Discovers candidate Feather/HVAC device IPs utilizing the topology of the active profile
 * and any populated EMS diagnostics maps (IP map, string-IP map, blockviewer).
 */
export function discoverTopologyCandidates(): DiscoveryCandidate[] {
  const candidatesMap = new Map<string, DiscoveryCandidate>();
  let hasActiveProfile = false;
  
  try {
     const activeProfile = ProfileStore.getActiveProfile();
     if (activeProfile) {
         console.log(`[Feather Bootstrap] Active topology profile: ${activeProfile.profileName}`);
         hasActiveProfile = true;
         // Generate candidate set from active topology model
         const standardCandidates = generateFeatherDiscoveryCandidatesFromTopology(activeProfile);
         for (const cand of standardCandidates) {
             candidatesMap.set(cand.deviceIp, cand);
         }
     } else {
         console.log("[Feather Bootstrap] WARNING: Active topology profile missing or invalid. Using legacy fallback topology.");
     }
  } catch (err: any) {
     console.warn(`[Feather Bootstrap] Error retrieving active profile topology: ${err.message}`);
  }

  try {
     const topology = buildSiteTopologyFromCachedSources();
     
     // 1. siteTopology.featherDevices[].ipAddress (explicit feather from known reports/endpoints)
     for (const f of topology.featherDevices) {
         if (f.ipAddress) {
             const existing = candidatesMap.get(f.ipAddress);
             if (!existing) {
                 candidatesMap.set(f.ipAddress, {
                    deviceIp: f.ipAddress,
                    sourceDiscoveryMethod: "ip-map",
                    arrayIndex: f.arrayIndex ?? null,
                    stringIndex: f.stringIndex ?? null,
                    entityName: f.enclosureLabel ?? `Feather at ${f.ipAddress}`,
                    entityKeyToken: f.enclosureLabel ?? `FEATHER_${f.ipAddress}`
                 });
             } else if (f.enclosureLabel) {
                 existing.entityName = f.enclosureLabel;
             }
         }
     }

     // 2. siteTopology.ipMap[] records that explicitly look like Feather/CS/ES/BMS/HVAC/sensor nodes
     for (const ipm of topology.ipMap) {
         if (ipm.ipAddress) {
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

             const existing = candidatesMap.get(ipm.ipAddress);
             if (existing) {
                 if (isGeneralString && !existing.blockId) {
                     existing.excluded = true;
                     existing.excludeReason = "string-controller-or-inferred-es-host";
                 }
             } else {
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
     }
     
     // 3. String IPs from stringIpMap (these are almost always string controllers, not feathers)
     for (const sim of topology.stringIpMap) {
          if (sim.ipAddress) {
              const existing = candidatesMap.get(sim.ipAddress);
              if (!existing) {
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
     }

  } catch (err) {
     console.warn("Could not extract topology candidates from siteTopology:", err);
  }

  // 4. Default/Legacy fallback to Known Pattern (EMS arrays) only if we have NO candidates
  if (candidatesMap.size === 0) {
     if (!hasActiveProfile) {
         console.log("[Feather Bootstrap] WARNING: Active topology profile missing or invalid. Using legacy fallback topology.");
     }
     const arrayCount = 8; 

     for (let a = 1; a <= arrayCount; a++) {
         // CS Host (array controller)
         const arrayIp = `10.0.${a}.3`;
         candidatesMap.set(arrayIp, {
             deviceIp: arrayIp,
             sourceDiscoveryMethod: "blockviewer",
             arrayIndex: a,
             stringIndex: null,
             entityName: `Array ${a} Enclosure Controller`,
             entityKeyToken: `ARR_${a}_CTRL`
         });

         // ES Hosts (.10 to .105 step 5)
         for (let h = 10; h <= 105; h += 5) {
             const stringIp = `10.0.${a}.${h}`;
             const stringIndex = Math.floor((h - 10) / 5) + 1;
             candidatesMap.set(stringIp, {
                 deviceIp: stringIp,
                 sourceDiscoveryMethod: "blockviewer",
                 arrayIndex: a,
                 stringIndex,
                 entityName: `Array ${a} String ${stringIndex} Enclosure Controller`,
                 entityKeyToken: `ARR_${a}_STR_${stringIndex}_ES`
               });
         }
     }
  }

  return Array.from(candidatesMap.values());
}
