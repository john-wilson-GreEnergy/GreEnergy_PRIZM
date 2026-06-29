export interface SegmentNumberingParams {
  arrayIndex?: number | null;
  enclosureIndex?: number | null;
  segmentIndex?: number | null;
  segmentPosition?: number | null;
  energySegmentIndex?: number | null;
  segmentLabel?: string | null;
  displayName?: string | null;
  ip?: string | null;
  enclosureType?: string | null;
}

/**
 * Resolves the array-local segment number or "CS" based on the provided parameters.
 * Following the rules:
 * - CS returns "CS" or null (we return "CS").
 * - Prefer explicit energySegmentIndex if 1..21.
 * - Prefer segmentLabel/displayName containing local ES 1..21.
 * - Prefer IP-derived ES: ES = ((lastOctet - 10) / 5) + 1.
 * - Prefer segmentPosition if 1..21.
 * - Prefer segmentIndex if array-local 1..21.
 * - Convert global enclosureIndex: positionInArray = ((enclosureIndex - 1) % 21) + 1.
 *   CS is positionInArray 1, else ES number = positionInArray - 1.
 */
export function getArrayLocalEnergySegmentNumber(params: SegmentNumberingParams): number | "CS" | null {
  const {
    enclosureIndex,
    segmentIndex,
    segmentPosition,
    energySegmentIndex,
    segmentLabel,
    displayName,
    ip,
    enclosureType,
  } = params;

  const lowerDisplay = (displayName || "").toLowerCase();
  const lowerLabel = (segmentLabel || "").toLowerCase();
  const lowerEnclosureType = (enclosureType || "").toLowerCase();

  // 1. Detect CS (Collection Segment)
  const isCS =
    lowerEnclosureType.includes("collection") ||
    lowerEnclosureType === "cs" ||
    lowerDisplay.includes("collection") ||
    lowerDisplay.includes("- cs") ||
    lowerDisplay === "cs" ||
    lowerLabel.includes("collection") ||
    lowerLabel.includes("- cs") ||
    lowerLabel === "cs" ||
    (ip && (ip.endsWith(".3") || ip.split(".").pop() === "3"));

  if (isCS) {
    return "CS";
  }

  // 2. Prefer explicit energySegmentIndex if it is 1..21
  if (energySegmentIndex !== undefined && energySegmentIndex !== null && !isNaN(Number(energySegmentIndex))) {
    const val = Number(energySegmentIndex);
    if (val >= 1 && val <= 21) {
      return val;
    }
  }

  // 3. Prefer segmentLabel/displayName only if it contains local ES number like ES 1..21
  for (const token of [segmentLabel, displayName]) {
    if (token) {
      const matchES = token.match(/ES\s*(\d+)/i);
      if (matchES) {
        const val = parseInt(matchES[1], 10);
        if (val >= 1 && val <= 21) {
          return val;
        }
      }
    }
  }

  // 4. Prefer IP-derived ES for Feather devices:
  // lastOctet 10 => ES1, 15 => ES2, 20 => ES3, 25 => ES4, etc.
  // formula: ES = ((lastOctet - 10) / 5) + 1
  if (ip) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      const lastOctet = parseInt(parts[3], 10);
      if (!isNaN(lastOctet) && lastOctet >= 10 && (lastOctet - 10) % 5 === 0) {
        const val = Math.floor((lastOctet - 10) / 5) + 1;
        if (val >= 1 && val <= 21) {
          return val;
        }
      }
    }
  }

  // 5. Prefer segmentPosition if it is 1..21
  if (segmentPosition !== undefined && segmentPosition !== null && !isNaN(Number(segmentPosition))) {
    const val = Number(segmentPosition);
    if (val >= 1 && val <= 21) {
      return val;
    }
  }

  // 6. Prefer raw segmentIndex if confirmed array-local 1..21
  if (segmentIndex !== undefined && segmentIndex !== null && !isNaN(Number(segmentIndex))) {
    const val = Number(segmentIndex);
    if (val >= 1 && val <= 21) {
      return val;
    }
  }

  // 7. If using enclosureIndex, convert global enclosure index into array-local ES:
  // positionInArray = ((enclosureIndex - 1) % 21) + 1
  // CS is positionInArray 1
  // ES number = positionInArray - 1
  if (enclosureIndex !== undefined && enclosureIndex !== null && !isNaN(Number(enclosureIndex))) {
    const encIdx = Number(enclosureIndex);
    const positionInArray = ((encIdx - 1) % 21) + 1;
    if (positionInArray === 1) {
      return "CS";
    } else {
      return positionInArray - 1;
    }
  }

  return null;
}
