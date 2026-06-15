export type SiteTopologyProfile = {
  ipLayout?: {
    arraySubnetMode?: "third-octet" | "explicit-map" | "custom";
    baseNetwork?: string;              // example: "10.0.0.0/16"
    arrayOctetIndex?: number;          // default 2 for 10.0.<array>.<host>
    hostOctetIndex?: number;           // default 3
    csHostOctets?: number[];           // default [3]
    esStartHostOctet?: number;         // default 10
    esHostStep?: number;               // default 5
    esCountPerArray?: number;          // default 20
    arrayIndexOffset?: number;         // default 0
    explicitDeviceMap?: Record<string, string>;
  };
};

export type NormalizedEquipmentTarget = {
  raw: string;
  label: string;
  displayLabel: string;
  mapped: boolean;
  type?: "cs" | "es" | "array" | "feather" | "ems" | "pcs" | "unknown";
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

const DEFAULT_LAYOUT = {
  arraySubnetMode: "third-octet" as const,
  baseNetwork: "10.0.0.0/16",
  arrayOctetIndex: 2,
  hostOctetIndex: 3,
  csHostOctets: [3],
  esStartHostOctet: 10,
  esHostStep: 5,
  esCountPerArray: 20,
  arrayIndexOffset: 0,
};

export function normalizeIpToEquipmentCallout(
  ip: string,
  topologyProfile?: SiteTopologyProfile,
  liveDevices?: any[]
): NormalizedEquipmentTarget {
  const cleanIp = (ip || "").trim();

  // If it is not a valid IP, preserve as-is
  if (!isValidIp(cleanIp)) {
    return {
      raw: cleanIp,
      label: cleanIp,
      displayLabel: cleanIp,
      mapped: false,
      type: "unknown"
    };
  }

  const layout = {
    ...DEFAULT_LAYOUT,
    ...(topologyProfile?.ipLayout || {})
  };

  // 1. Explicit profile device map match
  if (layout.explicitDeviceMap && layout.explicitDeviceMap[cleanIp]) {
    const mappedLabel = layout.explicitDeviceMap[cleanIp];
    let type: "cs" | "es" | "array" | "feather" | "ems" | "pcs" | "unknown" = "unknown";
    let arrayIndex: number | undefined;
    let stringIndex: number | undefined;

    if (/cs/i.test(mappedLabel)) type = "cs";
    else if (/es/i.test(mappedLabel)) type = "es";

    const arrayMatch = mappedLabel.match(/Array\s*(\d+)/i);
    if (arrayMatch) arrayIndex = parseInt(arrayMatch[1], 10);

    const esMatch = mappedLabel.match(/ES\s*(\d+)/i);
    if (esMatch) stringIndex = parseInt(esMatch[1], 10);

    return {
      raw: cleanIp,
      label: mappedLabel,
      displayLabel: `${mappedLabel} — ${cleanIp}`,
      mapped: true,
      type,
      arrayIndex,
      stringIndex,
      enclosureIndex: stringIndex,
      ip: cleanIp
    };
  }

  // 2. Profile formula match
  const baseNetwork = layout.baseNetwork || "10.0.0.0/16";
  const arraySubnetMode = layout.arraySubnetMode || "third-octet";

  if (arraySubnetMode === "third-octet" && ipMatchesSubnet(cleanIp, baseNetwork)) {
    const octets = parseIp(cleanIp);
    if (octets) {
      const arrayOctetVal = octets[layout.arrayOctetIndex ?? 2];
      const hostOctetVal = octets[layout.hostOctetIndex ?? 3];

      if (arrayOctetVal !== undefined && hostOctetVal !== undefined) {
        const arrayIndex = arrayOctetVal + (layout.arrayIndexOffset || 0);

        const csHostOctets = layout.csHostOctets || [3];
        if (csHostOctets.includes(hostOctetVal)) {
          const label = `Array ${arrayIndex} CS`;
          return {
            raw: cleanIp,
            label,
            displayLabel: `${label} — ${cleanIp}`,
            mapped: true,
            type: "cs",
            arrayIndex,
            hostOctet: hostOctetVal,
            ip: cleanIp
          };
        }

        const esStartHostOctet = layout.esStartHostOctet ?? 10;
        const esHostStep = layout.esHostStep ?? 5;
        const esCountPerArray = layout.esCountPerArray ?? 20;

        if (hostOctetVal >= esStartHostOctet && (hostOctetVal - esStartHostOctet) % esHostStep === 0) {
          const esIndex = ((hostOctetVal - esStartHostOctet) / esHostStep) + 1;
          if (esIndex >= 1 && esIndex <= esCountPerArray) {
            const label = `Array ${arrayIndex} ES${esIndex}`;
            return {
              raw: cleanIp,
              label,
              displayLabel: `${label} — ${cleanIp}`,
              mapped: true,
              type: "es",
              arrayIndex,
              stringIndex: esIndex,
              enclosureIndex: esIndex,
              hostOctet: hostOctetVal,
              ip: cleanIp
            };
          }
        }
      }
    }
  }

  // 3. Existing device metadata from live topology/netmap, if available
  if (liveDevices && Array.isArray(liveDevices)) {
    const foundDev = liveDevices.find((d: any) => (d.deviceIp || "").trim() === cleanIp || (d.ip || "").trim() === cleanIp);
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

  // 4. Raw IP fallback
  return {
    raw: cleanIp,
    label: "Unmapped device",
    displayLabel: `Unmapped device — ${cleanIp}`,
    mapped: false,
    type: "unknown",
    ip: cleanIp
  };
}
