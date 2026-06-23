import { cToF } from "../lib/temperatureUnits";

export interface CellValueResolverParams {
  stringData: any;
  metric: "temperature" | "voltage";
  bpcIndex: number;
  cellIndex: number;
  physicalIndex: number;
  sourceUnit?: "C" | "F";
}

/**
 * Resolves a single physical cell value, returning Celsius for temperature and preserving voltage mV.
 * Excludes layout-index derived/synthesized placeholder temperatures and returns null instead.
 */
export function resolvePhysicalCellMetricValue({
  stringData,
  metric,
  bpcIndex,
  cellIndex,
  physicalIndex,
  sourceUnit = "C"
}: CellValueResolverParams): number | null {

  const debug = true; // small local debug flag for development as requested

  const logDebug = (msg: string, ...args: any[]) => {
    if (debug) {
      console.debug(`[PhysicalStringLayout:temperature-source] ` + msg, ...args);
    }
  };

  if (!stringData) {
    return null;
  }

  // Validation function to reject synthesized and layout-index derived placeholder temperatures
  const isInvalidTemp = (val: any): boolean => {
    if (val === null || val === undefined || val === "" || val === "---") return true;
    const num = Number(val);
    if (!Number.isFinite(num)) return true;

    // "Do not synthesize 0, 1, 2, 3, etc. as temperatures."
    if (num === 0 || num === 1 || num === 2 || num === 3) {
      logDebug(`Rejected near-zero placeholder temperature: ${num}`);
      return true;
    }

    // It must not return BPC index, layout index, row index, cell position index, or placeholder values.
    if (num === bpcIndex || num === cellIndex || num === physicalIndex) {
      logDebug(`Rejected index-matching placeholder temperature (BPC:${bpcIndex}, Cell:${cellIndex}, FlatIdx:${physicalIndex}): ${num}`);
      return true;
    }

    // Extra safeguard against modulo indexing (e.g. idx % 4) that falls into low numbers
    if (num < 5 && (num === (physicalIndex % 4) || num === (cellIndex % 4) || num === (bpcIndex % 4))) {
      logDebug(`Rejected modulo index-derived placeholder temperature: ${num}`);
      return true;
    }

    return false;
  };

  if (metric === "voltage") {
    // 1. Try to fetch from voltageMatrix if present
    if (Array.isArray(stringData.voltageMatrix)) {
      const row = stringData.voltageMatrix[bpcIndex - 1];
      if (row) {
        const v = row[cellIndex - 1];
        if (v !== undefined && v !== null && v !== "" && v !== "---") {
          const num = Number(v);
          if (Number.isFinite(num)) return num;
        }
      }
    }

    // 2. Try to fetch from flat millivolts array
    if (Array.isArray(stringData.millivolts)) {
      const v = stringData.millivolts[physicalIndex];
      if (v !== undefined && v !== null && v !== "" && v !== "---") {
        const num = Number(v);
        if (Number.isFinite(num)) return num;
      }
    }

    // 3. Try structured BPCs
    const bpcs = stringData.bpcs || stringData.batteryPackReportList || [];
    if (Array.isArray(bpcs) && bpcs.length > 0) {
      const bpc = bpcs.find((b: any) => {
        const bNum = Number(b?.bpcNumber ?? b?.batteryPackIndex ?? b?.batteryPackNumber ?? b?.index);
        return bNum === bpcIndex;
      }) || bpcs[bpcIndex - 1];

      if (bpc) {
        const cgs = bpc.cellGroups || bpc.cellGroupReportList || bpc.cellGroupReports || [];
        if (Array.isArray(cgs) && cgs.length > 0) {
          const cg = cgs.find((c: any) => {
            const cNum = Number(c?.cellGroupNumber ?? c?.cellGroupIndex ?? c?.index);
            return cNum === cellIndex;
          }) || cgs[cellIndex - 1];

          if (cg) {
            const v = cg.voltage ?? cg.cellVoltage ?? cg.cellGroupVoltage ?? cg.millivolts ?? cg.mV;
            if (v !== undefined && v !== null && v !== "" && v !== "---") {
              const num = Number(v);
              if (Number.isFinite(num)) return num;
            }
          }
        }
      }
    }

    return null;
  }

  if (metric === "temperature") {
    // 1. Try to fetch from temperatureMatrix if present
    if (Array.isArray(stringData.temperatureMatrix)) {
      const row = stringData.temperatureMatrix[bpcIndex - 1];
      if (row) {
        const t = row[cellIndex - 1];
        if (!isInvalidTemp(t)) {
          return Number(t);
        }
      }
    }

    // 2. Try to fetch from flat temperatures array
    if (Array.isArray(stringData.temperatures)) {
      const t = stringData.temperatures[physicalIndex];
      if (!isInvalidTemp(t)) {
        return Number(t);
      }
    }

    // 3. Try structured BPCs
    const bpcs = stringData.bpcs || stringData.batteryPackReportList || [];
    if (Array.isArray(bpcs) && bpcs.length > 0) {
      const bpc = bpcs.find((b: any) => {
        const bNum = Number(b?.bpcNumber ?? b?.batteryPackIndex ?? b?.batteryPackNumber ?? b?.index);
        return bNum === bpcIndex;
      }) || bpcs[bpcIndex - 1];

      if (bpc) {
        const cgs = bpc.cellGroups || bpc.cellGroupReportList || bpc.cellGroupReports || [];
        if (Array.isArray(cgs) && cgs.length > 0) {
          const cg = cgs.find((c: any) => {
            const cNum = Number(c?.cellGroupNumber ?? c?.cellGroupIndex ?? c?.index);
            return cNum === cellIndex;
          }) || cgs[cellIndex - 1];

          if (cg) {
            const t = cg.temperature ?? cg.temp ?? cg.cellTemperature ?? cg.cellGroupTemp ?? cg.cellGroupTemperature;
            if (!isInvalidTemp(t)) {
              return Number(t);
            }
          }
        }
      }
    }

    return null;
  }

  return null;
}
