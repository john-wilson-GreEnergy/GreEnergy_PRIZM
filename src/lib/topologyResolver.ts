export type SiteTopologyProfile = {
  id: string; // matches EMS Profile ID
  profileName: string;
  stationCode?: string;
  blockIndex?: number;
  ems: {
    host: string;
    port: number;
    turtlePath: string;
    baseUrl: string;
  };
  ipTopologyMode:
    | "ems-derived"
    | "formula"
    | "explicit-map"
    | "scan-discovered"
    | "hybrid";
  allowedScanRanges: Array<{
    cidr?: string;
    startIp?: string;
    endIp?: string;
    label?: string;
    enabled: boolean;
  }>;
  formula?: {
    basePrefix?: string;              // Example: "10.0" or "10.255"
    arrayIndexMode?:
      | "third-octet"
      | "range-block"
      | "explicit-array-map"
      | "custom";
    arrayOctetIndex?: number;         // default 2 for 10.0.<array>.<host>
    hostOctetIndex?: number;          // default 3
    arrayStart?: number;
    arrayEnd?: number;
    arrayIndexOffset?: number;
    csHostOctets?: number[];          // example [3]
    esStartHostOctet?: number;        // example 10
    esHostStep?: number;              // example 5
    esCountPerArray?: number;         // example 20
    pcsHostOctets?: number[];
    customArrayMap?: Record<string, {
      arrayIndex: number;
      subnet?: string;
      thirdOctet?: number;
      label?: string;
    }>;
  };
  explicitDevices: SiteTopologyDevice[];
  discoveryOptions: {
    scanEMS: boolean;
    scanFeathers: boolean;
    scanStrings: boolean;
    scanPCS: boolean;
    scanModbus: boolean;
    scanHttp: boolean;
    scanPorts: number[];
    timeoutMs: number;
    concurrency: number;
    requireUserConfirmationBeforeWideScan: boolean;
  };
  lastDiscovery?: {
    timestamp: string;
    discoveredDeviceCount: number;
    confirmedByUser?: string;
    source: "manual" | "ems" | "scan" | "hybrid";
  };
  ipLayout?: any;
};

export type SiteTopologyDevice = {
  id: string;
  ip: string;
  port?: number;
  protocol?: "http" | "modbus-tcp" | "tcp" | "unknown";
  deviceType:
    | "ems"
    | "array"
    | "pcs"
    | "cs"
    | "es"
    | "string-controller"
    | "feather"
    | "hvac"
    | "modbus-device"
    | "unknown";
  arrayIndex?: number;
  stringIndex?: number;
  pcsIndex?: number;
  featherIndex?: number;
  hvacIndex?: number;
  blockIndex?: number;
  stationCode?: string;
  calloutLabel: string;               // Example: "Array 5 ES10"
  displayLabel: string;               // Example: "Array 5 ES10 — 10.255.164.55"
  source:
    | "manual"
    | "ems-map"
    | "strings.csv"
    | "ipMap"
    | "stringIPMap"
    | "blockviewer"
    | "scan"
    | "formula"
    | "hybrid";
  confidence: number;                 // 0-100
  reachable?: boolean;
  lastSeen?: string;
  raw?: any;
};

export type SiteTopologyResolution = {
  ip?: string;
  mapped: boolean;
  calloutLabel: string;
  displayLabel: string;
  deviceType: string;
  arrayIndex?: number;
  stringIndex?: number;
  pcsIndex?: number;
  source: string;
  confidence: number;
};

export type NormalizedEquipmentTarget = {
  raw: string;
  label: string;
  displayLabel: string;
  mapped: boolean;
  type?: "cs" | "es" | "array" | "feather" | "ems" | "pcs" | "hvac" | "unknown";
  arrayIndex?: number;
  stringIndex?: number;
  enclosureIndex?: number;
  hostOctet?: number;
  ip?: string;
  reason?: string;
};

export function isValidIp(ip: string): boolean {
  if (typeof ip !== "string") return false;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = Number(p);
    return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p.trim();
  });
}

export function parseIp(ip: string): number[] | null {
  const clean = ip.trim();
  const m = clean.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  if (octets.some(o => o < 0 || o > 255)) return null;
  return octets;
}

export function ipMatchesSubnet(ip: string, cidr: string): boolean {
  try {
    const parts = cidr.split("/");
    const subnetIp = parts[0];
    const maskBits = parts[1] ? parseInt(parts[1], 10) : 32;

    const ipOctets = parseIp(ip);
    const subnetOctets = parseIp(subnetIp);
    if (!ipOctets || !subnetOctets) return false;

    const ipLong = ((ipOctets[0] << 24) | (ipOctets[1] << 16) | (ipOctets[2] << 8) | ipOctets[3]) >>> 0;
    const subnetLong = ((subnetOctets[0] << 24) | (subnetOctets[1] << 16) | (subnetOctets[2] << 8) | subnetOctets[3]) >>> 0;

    const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
    return (ipLong & mask) === (subnetLong & mask);
  } catch {
    return false;
  }
}

// 10.0.<array>.<host> default formula values
const DEFAULT_FORMULA = {
  basePrefix: "10.0",
  arrayIndexMode: "third-octet" as const,
  arrayOctetIndex: 2,
  hostOctetIndex: 3,
  arrayStart: 1,
  arrayEnd: 8,
  arrayIndexOffset: 0,
  csHostOctets: [3],
  esStartHostOctet: 10,
  esHostStep: 5,
  esCountPerArray: 20,
  pcsHostOctets: [1]
};

/**
 * Universal IP to Topology Device Resolver
 */
export function resolveIpToTopologyDevice(
  ipOrLabel: string,
  profile?: any
): SiteTopologyResolution {
  const cleanStr = (ipOrLabel || "").trim();

  if (!cleanStr) {
    return {
      mapped: false,
      calloutLabel: "Unknown",
      displayLabel: "Unknown",
      deviceType: "unknown",
      source: "none",
      confidence: 0
    };
  }

  // Dual-compatibility adaptation step
  let activeProfile: SiteTopologyProfile | undefined = undefined;
  if (profile) {
    if (profile.ipLayout) {
      const layout = profile.ipLayout;
      activeProfile = {
        id: profile.id || "adapted",
        profileName: profile.profileName || "Adapted",
        ems: {
          host: profile.emsHost || "10.0.0.3",
          port: profile.emsPort || 8080,
          turtlePath: profile.turtlePath || "/turtle",
          baseUrl: ""
        },
        ipTopologyMode: "formula",
        allowedScanRanges: [],
        explicitDevices: [],
        discoveryOptions: {
          scanEMS: false, scanFeathers: false, scanStrings: false, scanPCS: false, scanModbus: false, scanHttp: false,
          scanPorts: [], timeoutMs: 1000, concurrency: 10, requireUserConfirmationBeforeWideScan: false
        }
      };

      activeProfile.formula = {
        basePrefix: layout.baseNetwork ? layout.baseNetwork.split('.').slice(0, 2).join('.') : "10.0",
        arrayIndexMode: layout.arraySubnetMode || "third-octet",
        arrayOctetIndex: layout.arrayOctetIndex ?? 2,
        hostOctetIndex: layout.hostOctetIndex ?? 3,
        csHostOctets: layout.csHostOctets ?? [3],
        esStartHostOctet: layout.esStartHostOctet ?? 10,
        esHostStep: layout.esHostStep ?? 5,
        esCountPerArray: layout.esCountPerArray ?? 20,
        arrayIndexOffset: layout.arrayIndexOffset ?? 0,
        pcsHostOctets: [1]
      };

      if (layout.explicitDeviceMap) {
        Object.entries(layout.explicitDeviceMap).forEach(([ip, label]) => {
          let type: any = "unknown";
          if (/cs/i.test(label as string)) type = "cs";
          else if (/es/i.test(label as string)) type = "es";
          activeProfile!.explicitDevices.push({
            id: `explicit_${ip}`,
            ip,
            deviceType: type,
            calloutLabel: label as string,
            displayLabel: `${label} — ${ip}`,
            source: "manual",
            confidence: 100
          });
        });
      }
    } else {
      activeProfile = profile;
    }
  }

  // A. IF IT IS A LABEL — Try to find in explicitDevices or resolve it
  if (!isValidIp(cleanStr)) {
    if (activeProfile && activeProfile.explicitDevices) {
      const match = activeProfile.explicitDevices.find(
        d => d.calloutLabel.toLowerCase() === cleanStr.toLowerCase()
      );
      if (match) {
        return {
          ip: match.ip,
          mapped: true,
          calloutLabel: match.calloutLabel,
          displayLabel: match.displayLabel,
          deviceType: match.deviceType,
          arrayIndex: match.arrayIndex,
          stringIndex: match.stringIndex,
          pcsIndex: match.pcsIndex,
          source: match.source,
          confidence: match.confidence
        };
      }
    }
    return {
      mapped: false,
      calloutLabel: cleanStr,
      displayLabel: cleanStr,
      deviceType: "unknown",
      source: "raw-label",
      confidence: 50
    };
  }

  // B. IF IT IS AN IP
  // 1. Check explicit devices (from manual input, scans, or EMS maps)
  if (activeProfile && activeProfile.explicitDevices) {
    const match = activeProfile.explicitDevices.find(d => d.ip === cleanStr);
    if (match) {
      return {
        ip: cleanStr,
        mapped: true,
        calloutLabel: match.calloutLabel,
        displayLabel: match.displayLabel,
        deviceType: match.deviceType,
        arrayIndex: match.arrayIndex,
        stringIndex: match.stringIndex,
        pcsIndex: match.pcsIndex,
        source: match.source,
        confidence: match.confidence
      };
    }
  }

  // 2. Load and overlay active formula (or fallback to default)
  const formula = {
    ...DEFAULT_FORMULA,
    ...(activeProfile?.formula || {})
  };

  const basePrefix = formula.basePrefix || "10.0";
  const arrayIndexMode = formula.arrayIndexMode || "third-octet";

  // Check prefix / subnet match if configured
  const matchesSubnet = cleanStr.startsWith(basePrefix) || ipMatchesSubnet(cleanStr, `${basePrefix}.0.0/16`);

  if (matchesSubnet) {
    const octets = parseIp(cleanStr);
    if (octets) {
      let arrayIndex: number | undefined;

      // Determine array number
      if (arrayIndexMode === "third-octet") {
        const arrOctetVal = octets[formula.arrayOctetIndex ?? 2];
        if (arrOctetVal !== undefined) {
          arrayIndex = arrOctetVal + (formula.arrayIndexOffset || 0);
        }
      } else if (arrayIndexMode === "explicit-array-map" && formula.customArrayMap) {
        // Search custom map subnets
        for (const [key, details] of Object.entries(formula.customArrayMap)) {
          if (details.subnet && ipMatchesSubnet(cleanStr, details.subnet)) {
            arrayIndex = details.arrayIndex;
            break;
          } else if (details.thirdOctet !== undefined && octets[2] === details.thirdOctet) {
            arrayIndex = details.arrayIndex;
            break;
          }
        }
      } else if (arrayIndexMode === "range-block") {
        // e.g. 10.255.160.0/21, where third octet 160-167 maps to arrays 1-8
        const arrOctetVal = octets[2];
        const arrStart = formula.arrayStart ?? 1;
        const arrEnd = formula.arrayEnd ?? 8;
        // Map linearly from a block (e.g. third octet 160 = array 1)
        if (arrOctetVal >= 160 && arrOctetVal <= 160 + (arrEnd - arrStart)) {
          arrayIndex = arrOctetVal - 160 + arrStart;
        } else {
          arrayIndex = arrOctetVal % 10; // modest mod-based mapper
        }
      }

      // Check hosts
      if (arrayIndex !== undefined && arrayIndex >= (formula.arrayStart ?? 1) && arrayIndex <= (formula.arrayEnd ?? 8)) {
        const hostOctetVal = octets[formula.hostOctetIndex ?? 3];

        // CS match
        if (formula.csHostOctets && formula.csHostOctets.includes(hostOctetVal)) {
          const calloutLabel = `Array ${arrayIndex} CS`;
          return {
            ip: cleanStr,
            mapped: true,
            calloutLabel,
            displayLabel: `${calloutLabel} — ${cleanStr}`,
            deviceType: "cs",
            arrayIndex,
            source: "formula",
            confidence: 80
          };
        }

        // ES (String Controller) match
        const esStart = formula.esStartHostOctet ?? 10;
        const esStep = formula.esHostStep ?? 5;
        const esCount = formula.esCountPerArray ?? 20;

        if (hostOctetVal >= esStart && (hostOctetVal - esStart) % esStep === 0) {
          const esIndex = ((hostOctetVal - esStart) / esStep) + 1;
          if (esIndex >= 1 && esIndex <= esCount) {
            const calloutLabel = `Array ${arrayIndex} ES${esIndex}`;
            return {
              ip: cleanStr,
              mapped: true,
              calloutLabel,
              displayLabel: `${calloutLabel} — ${cleanStr}`,
              deviceType: "es",
              arrayIndex,
              stringIndex: esIndex,
              source: "formula",
              confidence: 80
            };
          }
        }

        // PCS match
        if (formula.pcsHostOctets && formula.pcsHostOctets.includes(hostOctetVal)) {
          const pcsIndex = 1; // Default
          const calloutLabel = `Array ${arrayIndex} PCS ${pcsIndex}`;
          return {
            ip: cleanStr,
            mapped: true,
            calloutLabel,
            displayLabel: `${calloutLabel} — ${cleanStr}`,
            deviceType: "pcs",
            arrayIndex,
            pcsIndex,
            source: "formula",
            confidence: 75
          };
        }
      }
    }
  }

  // 3. Fallback to default raw IP structure
  return {
    ip: cleanStr,
    mapped: false,
    calloutLabel: `Device: ${cleanStr}`,
    displayLabel: `Unmapped device — ${cleanStr}`,
    deviceType: "unknown",
    source: "unmapped",
    confidence: 30
  };
}

/**
 * Backwards compatible mapping resolver wrapper matching legacy target format
 */
export function normalizeIpToEquipmentCallout(
  ip: string,
  topologyProfile?: any,
  liveDevices?: any[]
): NormalizedEquipmentTarget {
  const cleanIp = (ip || "").trim();
  if (!isValidIp(cleanIp)) {
    return {
      raw: cleanIp,
      label: cleanIp,
      displayLabel: cleanIp,
      mapped: false,
      type: "unknown"
    };
  }

  // Translate the input parameters to standard SiteTopologyProfile format if available.
  // We first perform a direct resolution using clean structures.
  const resolved = resolveIpToTopologyDevice(ip, topologyProfile as SiteTopologyProfile);

  if (resolved.mapped) {
    let legacyType: NormalizedEquipmentTarget["type"] = "unknown";
    if (resolved.deviceType === "cs") legacyType = "cs";
    else if (resolved.deviceType === "es" || resolved.deviceType === "string-controller") legacyType = "es";
    else if (resolved.deviceType === "pcs") legacyType = "pcs";
    else if (resolved.deviceType === "feather") legacyType = "feather";
    else if (resolved.deviceType === "ems") legacyType = "ems";
    else if (resolved.deviceType === "hvac") legacyType = "hvac";

    return {
      raw: ip,
      label: resolved.calloutLabel,
      displayLabel: resolved.displayLabel,
      mapped: true,
      type: legacyType,
      arrayIndex: resolved.arrayIndex,
      stringIndex: resolved.stringIndex,
      enclosureIndex: resolved.stringIndex,
      ip: resolved.ip
    };
  }

  // Attempt to check if liveDevices provides fallback mapping (legacy Step 3)
  if (liveDevices && Array.isArray(liveDevices)) {
    const foundDev = liveDevices.find(
      (d: any) => (d.deviceIp || "").trim() === cleanIp || (d.ip || "").trim() === cleanIp
    );
    if (foundDev) {
      const name = foundDev.entityName || foundDev.label || foundDev.name;
      if (name) {
        return {
          raw: cleanIp,
          label: name,
          displayLabel: `${name} — ${cleanIp}`,
          mapped: true,
          type: (foundDev.deviceType?.toLowerCase() || "unknown") as any,
          arrayIndex: foundDev.arrayIndex ?? undefined,
          stringIndex: foundDev.stringIndex ?? undefined,
          enclosureIndex: foundDev.stringIndex ?? undefined,
          ip: cleanIp
        };
      }
    }
  }

  return {
    raw: ip,
    label: "Unmapped device",
    displayLabel: `Unmapped device — ${cleanIp}`,
    mapped: false,
    type: "unknown"
  };
}
