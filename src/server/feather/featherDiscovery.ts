import { DiscoveryCandidate } from "./featherTypes";
import { ProfileStore } from "../profiles/profileStore";
import { getEmsCachedBlock, getEmsIpMap, getEmsStringIpMap } from "../emsTurtleClient";

/**
 * Discovers candidate Feather/HVAC device IPs utilizing the topology of the active profile
 * and any populated EMS diagnostics maps (IP map, string-IP map, blockviewer).
 */
export function discoverTopologyCandidates(): DiscoveryCandidate[] {
  const candidatesMap = new Map<string, DiscoveryCandidate>();

  const activeProfile = ProfileStore.getActiveProfile();
  const arrayCount = activeProfile ? (activeProfile.arrayCount ?? 8) : 8;

  // 1. Array/Shorthand Derived Candidates (Standard architecture of BESS LAN)
  // Each array 'a' has an array controller (host 3) and battery string controllers (hosts 10, 15, ..., 105)
  for (let a = 1; a <= arrayCount; a++) {
    // Array Controller (Feather host 3)
    const arrayIp = `10.0.${a}.3`;
    candidatesMap.set(arrayIp, {
      deviceIp: arrayIp,
      sourceDiscoveryMethod: "blockviewer",
      arrayIndex: a,
      stringIndex: null,
      entityName: `Array ${a} Enclosure Controller`,
      entityKeyToken: `ARR_${a}_CTRL`
    });

    // Battery strings (hosts 10, 15, 20, ..., 105)
    for (let h = 10; h <= 105; h += 5) {
      const stringIp = `10.0.${a}.${h}`;
      const stringIndex = Math.floor((h - 10) / 5) + 1;
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

  // 2. Discover from blockviewer data (stack managers)
  try {
    const blockRes = getEmsCachedBlock();
    if (blockRes && blockRes.data) {
      const managers = blockRes.data.stackManagers;
      if (Array.isArray(managers)) {
        managers.forEach((m: any) => {
          if (m.ip && typeof m.ip === "string") {
            const ip = m.ip.trim();
            if (ip) {
              const existing = candidatesMap.get(ip);
              candidatesMap.set(ip, {
                deviceIp: ip,
                sourceDiscoveryMethod: "blockviewer",
                arrayIndex: m.id || existing?.arrayIndex || null,
                stringIndex: existing?.stringIndex || null,
                entityName: m.name || existing?.entityName || `Stack Manager unit #${m.id}`,
                entityKeyToken: `STACK_MGR_${m.id}`
              });
            }
          }
        });
      }
    }
  } catch (err) {
    console.warn("Could not extract topology candidates from blockviewer stackManagers:", err);
  }

  // 3. Discover from ipMap data
  try {
    const ipMapRes = getEmsIpMap();
    if (ipMapRes && Array.isArray(ipMapRes.data)) {
      ipMapRes.data.forEach((item: any) => {
        if (item.ip && typeof item.ip === "string") {
          const ip = item.ip.trim();
          if (ip) {
            const existing = candidatesMap.get(ip);
            candidatesMap.set(ip, {
              deviceIp: ip,
              sourceDiscoveryMethod: "ip-map",
              arrayIndex: item.array ?? item.arrayIndex ?? existing?.arrayIndex ?? null,
              stringIndex: item.string ?? item.stringIndex ?? existing?.stringIndex ?? null,
              entityName: item.name ?? item.entityName ?? existing?.entityName ?? `IP-Map Entity`,
              entityKeyToken: item.key ?? item.token ?? existing?.entityKeyToken ?? `IP_MAP_VAL`
            });
          }
        }
      });
    }
  } catch (err) {
    console.warn("Could not extract topology candidates from ipMap:", err);
  }

  // 4. Discover from stringIPMap data
  try {
    const stringIpMapRes = getEmsStringIpMap();
    if (stringIpMapRes && Array.isArray(stringIpMapRes.data)) {
      stringIpMapRes.data.forEach((item: any) => {
        if (item.ip && typeof item.ip === "string") {
          const ip = item.ip.trim();
          if (ip) {
            const existing = candidatesMap.get(ip);
            candidatesMap.set(ip, {
              deviceIp: ip,
              sourceDiscoveryMethod: "string-ip-map",
              arrayIndex: item.array ?? item.arrayIndex ?? existing?.arrayIndex ?? null,
              stringIndex: item.string ?? item.stringIndex ?? existing?.stringIndex ?? null,
              entityName: item.name ?? existing?.entityName ?? `String-IP Entity`,
              entityKeyToken: item.token ?? existing?.entityKeyToken ?? `STR_IP_VAL`
            });
          }
        }
      });
    }
  } catch (err) {
    console.warn("Could not extract topology candidates from stringIPMap:", err);
  }

  return Array.from(candidatesMap.values());
}
