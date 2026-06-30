import { stringNumberToEnergySegment } from "./stringToEsMapper";
import { normalizeSensorEnclosureIdentity } from "./enclosureIdentity";

export interface SegmentIdentity {
  arrayNumber: number | null;
  enclosureType: string;
  localEsNumber: number | null;
  stringNumber: number | null;
  side: "A-Side" | "B-Side" | null;
  displayLabel: string;
  ip: string | null;
}

export function normalizeSegmentIdentity(input: any): SegmentIdentity {
  if (!input) {
    return {
      arrayNumber: null,
      enclosureType: "ES",
      localEsNumber: null,
      stringNumber: null,
      side: null,
      displayLabel: "Unknown Target",
      ip: null
    };
  }

  const ip = input.ip || input.stringControllerIp || input.deviceIp || input.ipAddress || null;
  const rawLabel = input.displayLabel || input.label || input.displayName || "";
  const parsed = normalizeSensorEnclosureIdentity({ ip, label: rawLabel });

  let arrayNumber = (typeof input.arrayNumber === "number" && !isNaN(input.arrayNumber)) ? input.arrayNumber : 
                     ((typeof input.arrayIndex === "number" && !isNaN(input.arrayIndex)) ? input.arrayIndex : 
                     ((typeof input.array === "number" && !isNaN(input.array)) ? input.array : 
                     (input.arrayNumber ? Number(input.arrayNumber) : null)));
  
  let enclosureType = input.enclosureType || "ES";

  let stringNumber = (typeof input.stringNumber === "number" && !isNaN(input.stringNumber)) ? input.stringNumber : 
                      ((typeof input.stringIndex === "number" && !isNaN(input.stringIndex)) ? input.stringIndex : 
                      ((typeof input.string === "number" && !isNaN(input.string)) ? input.string : 
                      (input.stringNumber ? Number(input.stringNumber) : null)));

  let localEsNumber = (typeof input.localEsNumber === "number" && !isNaN(input.localEsNumber)) ? input.localEsNumber : 
                       ((typeof input.energySegmentNumber === "number" && !isNaN(input.energySegmentNumber)) ? input.energySegmentNumber : 
                       ((typeof input.esNumber === "number" && !isNaN(input.esNumber)) ? input.esNumber : 
                       (stringNumber !== null ? stringNumberToEnergySegment(stringNumber) : null)));

  if (parsed.arrayIndex !== null) {
    arrayNumber = parsed.arrayIndex;
    if (parsed.segmentType !== "UNKNOWN") {
      enclosureType = parsed.segmentType;
    }
    if (parsed.localEsNumber !== null) {
      localEsNumber = parsed.localEsNumber;
    }
  }

  let side: "A-Side" | "B-Side" | null = null;
  if (input.side === "A-Side" || input.side === "A" || input.side === "Left" || input.stringSide === "A-Side") {
    side = "A-Side";
  } else if (input.side === "B-Side" || input.side === "B" || input.side === "Right" || input.stringSide === "B-Side") {
    side = "B-Side";
  } else if (stringNumber !== null) {
    side = stringNumber % 2 === 1 ? "A-Side" : "B-Side";
  }

  // Generate displayLabel cleanly
  let displayLabel = "";
  if (parsed.arrayIndex !== null) {
    displayLabel = parsed.shortLabel;
  } else if (rawLabel && !/^\d+$/.test(String(rawLabel).trim())) {
    displayLabel = rawLabel;
  } else {
    const parts: string[] = [];
    if (arrayNumber !== null) {
      parts.push(`A${arrayNumber}`);
    }
    if (localEsNumber !== null) {
      parts.push(`ES${localEsNumber}`);
    }
    if (stringNumber !== null) {
      parts.push(`S${stringNumber}`);
    }
    if (side !== null) {
      parts.push(side);
    }
    displayLabel = parts.join(" / ") || "Unknown Target";
  }

  return {
    arrayNumber,
    enclosureType,
    localEsNumber,
    stringNumber,
    side,
    displayLabel,
    ip
  };
}
