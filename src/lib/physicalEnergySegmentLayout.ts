import { normalizeRichTemp } from "./temperatureUnits";

export type PhysicalCellSlot = {
  bpcNumber: number;
  cellNumber: number;
  cellGroupNumber: number;
  moduleNumber: 1 | 2 | 3;
  moduleLabel: "Outer" | "Middle" | "Inner";
  side: "left" | "right";
  physicalRow: number;
  physicalColumnGroup:
    | "leftOuter"
    | "leftMiddle"
    | "leftInner"
    | "rightInner"
    | "rightMiddle"
    | "rightOuter";
  hvacProximity: "outer" | "middle" | "inner";
  voltageMv: number | null;
  tempRaw: number | null;
  tempC: number | null;
  tempF: number | null;
  tempSourceKind: "deci-celsius" | "celsius" | "compact" | "unknown";
  source: "rich-string-detail";
};

export function getPhysicalBpcPosition(bpcNumber: number): {
  side: "left" | "right";
  physicalRow: number;
} | null {
  if (bpcNumber >= 1 && bpcNumber <= 7) {
    return {
      side: "left",
      physicalRow: bpcNumber
    };
  }
  if (bpcNumber >= 8 && bpcNumber <= 14) {
    return {
      side: "right",
      physicalRow: 15 - bpcNumber
    };
  }
  return null;
}

export function getModuleNumberForCell(cellNumber: number): 1 | 2 | 3 | null {
  if (cellNumber >= 1 && cellNumber <= 10) return 1;
  if (cellNumber >= 11 && cellNumber <= 20) return 2;
  if (cellNumber >= 21 && cellNumber <= 30) return 3;
  return null;
}

export function getModuleLabelAndHvacProximity(
  side: "left" | "right",
  moduleNumber: 1 | 2 | 3
): {
  moduleLabel: "Outer" | "Middle" | "Inner";
  hvacProximity: "outer" | "middle" | "inner";
  physicalColumnGroup:
    | "leftOuter"
    | "leftMiddle"
    | "leftInner"
    | "rightInner"
    | "rightMiddle"
    | "rightOuter";
} {
  if (side === "left") {
    if (moduleNumber === 1) {
      return {
        moduleLabel: "Outer",
        hvacProximity: "outer",
        physicalColumnGroup: "leftOuter"
      };
    }
    if (moduleNumber === 2) {
      return {
        moduleLabel: "Middle",
        hvacProximity: "middle",
        physicalColumnGroup: "leftMiddle"
      };
    }
    return {
      moduleLabel: "Inner",
      hvacProximity: "inner",
      physicalColumnGroup: "leftInner"
    };
  }
  if (moduleNumber === 1) {
    return {
      moduleLabel: "Inner",
      hvacProximity: "inner",
      physicalColumnGroup: "rightInner"
    };
  }
  if (moduleNumber === 2) {
    return {
      moduleLabel: "Middle",
      hvacProximity: "middle",
      physicalColumnGroup: "rightMiddle"
    };
  }
  return {
    moduleLabel: "Outer",
    hvacProximity: "outer",
    physicalColumnGroup: "rightOuter"
  };
}

function getBpcNumber(bpc: any, fallbackIndex: number): number {
  return Number(
    bpc?.batteryPackIndex ??
    bpc?.batteryPackNumber ??
    bpc?.bpcNumber ??
    bpc?.bpIndex ??
    bpc?.index ??
    fallbackIndex + 1
  );
}

function getCellGroupsFromBpc(bpc: any): any[] {
  if (Array.isArray(bpc?.cellGroups)) return bpc.cellGroups;
  if (Array.isArray(bpc?.cellGroupReportList)) return bpc.cellGroupReportList;
  if (Array.isArray(bpc?.cellGroupReports)) return bpc.cellGroupReports;
  if (Array.isArray(bpc?.batteryPackData?.cellGroups)) return bpc.batteryPackData.cellGroups;
  if (Array.isArray(bpc?.batteryPackData?.cellGroupReportList)) return bpc.batteryPackData.cellGroupReportList;
  if (Array.isArray(bpc?.batteryPackData?.cellGroupReports)) return bpc.batteryPackData.cellGroupReports;
  return [];
}

function getCellGroupNumber(cg: any, fallbackIndex: number): number {
  return Number(
    cg?.cellGroupNumber ??
    cg?.cellGroupIndex ??
    cg?.groupNumber ??
    cg?.index ??
    fallbackIndex + 1
  );
}

const finite = (value: any): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function getCellVoltageMv(cg: any): number | null {
  return finite(
    cg?.voltage ??
    cg?.cellVoltage ??
    cg?.cellGroupVoltage ??
    cg?.millivolts ??
    cg?.mV
  );
}

function getCellTempRaw(cg: any): number | null {
  return finite(
    cg?.temperature ??
    cg?.temp ??
    cg?.cellTemperature ??
    cg?.cellGroupTemp ??
    cg?.cellGroupTemperature
  );
}

export function buildPhysicalSlotsFromRichDetail(detail: any): {
  slots: PhysicalCellSlot[];
  available: boolean;
  reason?: string;
} {
  const bpcSource = Array.isArray(detail?.batteryPackReportList) && detail?.batteryPackReportList.length > 0
    ? detail.batteryPackReportList
    : Array.isArray(detail?.bpcs) && detail?.bpcs.length > 0
      ? detail.bpcs
      : [];

  if (bpcSource.length === 0) {
    return {
      slots: [],
      available: false,
      reason: "No rich battery pack reports provided."
    };
  }

  const slots: PhysicalCellSlot[] = [];

  for (let i = 0; i < bpcSource.length; i++) {
    const bpc = bpcSource[i];
    const bpcNumber = getBpcNumber(bpc, i);
    const position = getPhysicalBpcPosition(bpcNumber);
    if (!position) continue; // skip outside 1-14

    const cellGroups = getCellGroupsFromBpc(bpc);
    if (!cellGroups || cellGroups.length === 0) continue;

    for (let cIdx = 0; cIdx < cellGroups.length; cIdx++) {
      const cg = cellGroups[cIdx];
      const cellNumber = getCellGroupNumber(cg, cIdx);
      const moduleNumber = getModuleNumberForCell(cellNumber);
      if (!moduleNumber) continue;

      const { moduleLabel, hvacProximity, physicalColumnGroup } = getModuleLabelAndHvacProximity(position.side, moduleNumber);

      const voltageMv = getCellVoltageMv(cg);
      const tempRaw = getCellTempRaw(cg);
      const tempInfo = normalizeRichTemp(tempRaw);

      slots.push({
        bpcNumber,
        cellNumber,
        cellGroupNumber: cellNumber,
        moduleNumber,
        moduleLabel,
        side: position.side,
        physicalRow: position.physicalRow,
        physicalColumnGroup,
        hvacProximity,
        voltageMv,
        tempRaw: tempInfo.raw,
        tempC: tempInfo.celsius,
        tempF: tempInfo.fahrenheit,
        tempSourceKind: tempInfo.sourceKind,
        source: "rich-string-detail"
      });
    }
  }

  if (slots.length === 0) {
    return {
      slots: [],
      available: false,
      reason: "Individual cell groups telemetry was not returned for this string."
    };
  }

  return {
    slots,
    available: true
  };
}
