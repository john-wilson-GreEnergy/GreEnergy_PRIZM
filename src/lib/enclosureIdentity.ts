export function parseGlobalSegmentIdentity(input: string | number): {
  globalSegmentNumber: number | null;
  arrayIndex: number | null;
  positionInArray: number | null;
  segmentType: "CS" | "ES" | "UNKNOWN";
  localEsNumber: number | null;
  displayName: string;
  shortLabel: string;
} {
  let globalSegmentNumber: number | null = null;
  const str = String(input).trim();
  
  // Try robust format parsing first
  const arrayMatch = str.match(/Array\s*(\d+)/i);
  if (arrayMatch) {
    const arrayIndex = parseInt(arrayMatch[1], 10);
    const isCS = /Collection\s*Segment|CS/i.test(str);
    const esMatch = str.match(/(?:Energy\s*Segment|ES)\s*(\d+)/i);
    
    if (isCS) {
      const globalSegNum = (arrayIndex - 1) * 21 + 1;
      return {
        globalSegmentNumber: globalSegNum,
        arrayIndex,
        positionInArray: 1,
        segmentType: "CS",
        localEsNumber: null,
        displayName: `Array ${arrayIndex} Collection Segment`,
        shortLabel: `Array ${arrayIndex} - CS`
      };
    } else if (esMatch) {
      const localEsVal = parseInt(esMatch[1], 10);
      const positionInArray = localEsVal + 1;
      const globalSegNum = (arrayIndex - 1) * 21 + positionInArray;
      return {
        globalSegmentNumber: globalSegNum,
        arrayIndex,
        positionInArray,
        segmentType: "ES",
        localEsNumber: localEsVal,
        displayName: `Array ${arrayIndex} Energy Segment ${localEsVal}`,
        shortLabel: `Array ${arrayIndex} - ES${localEsVal}`
      };
    }
  }

  // Fallback to legacy digit matching
  let rawSegNum: number | null = null;
  const prefixMatch = str.match(/(?:CS|ES)\s*(\d+)/i);
  if (prefixMatch) {
    rawSegNum = parseInt(prefixMatch[1], 10);
  } else {
    const digitsMatch = str.match(/\d+/);
    if (digitsMatch) {
      rawSegNum = parseInt(digitsMatch[0], 10);
    }
  }

  if (rawSegNum === null || isNaN(rawSegNum)) {
    return {
      globalSegmentNumber: null,
      arrayIndex: null,
      positionInArray: null,
      segmentType: "UNKNOWN",
      localEsNumber: null,
      displayName: "Unknown Enclosure",
      shortLabel: "Unknown"
    };
  }

  const arrayIndex = Math.floor((rawSegNum - 1) / 21) + 1;
  const positionInArray = ((rawSegNum - 1) % 21) + 1;

  let segmentType: "CS" | "ES" | "UNKNOWN" = "UNKNOWN";
  let localEsNumber: number | null = null;
  let displayName = "";
  let shortLabel = "";

  if (positionInArray === 1) {
    segmentType = "CS";
    localEsNumber = null;
    displayName = `Array ${arrayIndex} Collection Segment`;
    shortLabel = `Array ${arrayIndex} - CS`;
  } else {
    segmentType = "ES";
    localEsNumber = positionInArray - 1;
    displayName = `Array ${arrayIndex} Energy Segment ${localEsNumber}`;
    shortLabel = `Array ${arrayIndex} - ES${localEsNumber}`;
  }

  return {
    globalSegmentNumber: rawSegNum,
    arrayIndex,
    positionInArray,
    segmentType,
    localEsNumber,
    displayName,
    shortLabel
  };
}

export function normalizeSensorEnclosureIdentity(raw: any): {
  arrayIndex: number | null;
  segmentType: "CS" | "ES" | "UNKNOWN";
  localEsNumber: number | null;
  displayName: string;
  shortLabel: string;
  globalSegmentNumber: number | null;
  sourceLabel: string;
} {
  if (!raw) {
    return {
      arrayIndex: null,
      segmentType: "UNKNOWN",
      localEsNumber: null,
      displayName: "Unknown Enclosure",
      shortLabel: "Unknown",
      globalSegmentNumber: null,
      sourceLabel: ""
    };
  }

  const ip = raw.ip || raw.ipAddress || raw.stringControllerIp || raw.deviceIp || "";
  const label = raw.label || raw.sourceLabel || raw.displayName || raw.name || "";

  let arrayIndex: number | null = null;
  let segmentType: "CS" | "ES" | "UNKNOWN" = "UNKNOWN";
  let localEsNumber: number | null = null;
  let globalSegmentNumber: number | null = null;

  // Try robust label parsing first because it is highly specific!
  const parsedFromLabel = parseGlobalSegmentIdentity(label);
  if (parsedFromLabel.globalSegmentNumber !== null) {
    globalSegmentNumber = parsedFromLabel.globalSegmentNumber;
    arrayIndex = parsedFromLabel.arrayIndex;
    segmentType = parsedFromLabel.segmentType;
    localEsNumber = parsedFromLabel.localEsNumber;
  }

  // If label parsing didn't resolve array index, try direct numeric index
  if (arrayIndex === null) {
    const numIndex = raw.enclosureIndex !== undefined && raw.enclosureIndex !== null ? Number(raw.enclosureIndex) :
                      (raw.globalEnclosureIndex !== undefined && raw.globalEnclosureIndex !== null ? Number(raw.globalEnclosureIndex) :
                      (raw.globalSegmentNumber !== undefined && raw.globalSegmentNumber !== null ? Number(raw.globalSegmentNumber) : null));

    if (numIndex !== null && !isNaN(numIndex) && numIndex >= 1) {
      globalSegmentNumber = numIndex;
      arrayIndex = Math.floor((globalSegmentNumber - 1) / 21) + 1;
      const positionInArray = ((globalSegmentNumber - 1) % 21) + 1;
      if (positionInArray === 1) {
        segmentType = "CS";
        localEsNumber = null;
      } else {
        segmentType = "ES";
        localEsNumber = positionInArray - 1;
      }
    }
  }

  // Try IP resolution if still unresolved
  if (arrayIndex === null && ip) {
    const ipParts = ip.split(".");
    if (ipParts.length === 4 && ipParts[0] === "10" && ipParts[1] === "0") {
      const arrIdx = parseInt(ipParts[2], 10);
      const lastOctet = parseInt(ipParts[3], 10);
      if (!isNaN(arrIdx) && !isNaN(lastOctet)) {
        arrayIndex = arrIdx;
        if (lastOctet === 3) {
          segmentType = "CS";
          localEsNumber = null;
          globalSegmentNumber = (arrayIndex - 1) * 21 + 1;
        } else if (lastOctet >= 10 && (lastOctet - 10) % 5 === 0) {
          segmentType = "ES";
          localEsNumber = Math.floor((lastOctet - 10) / 5) + 1;
          globalSegmentNumber = (arrayIndex - 1) * 21 + 1 + localEsNumber;
        }
      }
    }
  }

  let displayName = "";
  let shortLabel = "";

  if (arrayIndex !== null) {
    if (segmentType === "CS") {
      displayName = `Array ${arrayIndex} Collection Segment`;
      shortLabel = `Array ${arrayIndex} - CS`;
    } else if (segmentType === "ES" && localEsNumber !== null) {
      displayName = `Array ${arrayIndex} Energy Segment ${localEsNumber}`;
      shortLabel = `Array ${arrayIndex} - ES${localEsNumber}`;
    } else {
      displayName = `Array ${arrayIndex} Unknown Segment`;
      shortLabel = `Array ${arrayIndex} - UNKNOWN`;
    }
  } else {
    displayName = label || "Unknown Enclosure";
    shortLabel = label || "Unknown";
  }

  return {
    arrayIndex,
    segmentType,
    localEsNumber,
    displayName,
    shortLabel,
    globalSegmentNumber,
    sourceLabel: label
  };
}
