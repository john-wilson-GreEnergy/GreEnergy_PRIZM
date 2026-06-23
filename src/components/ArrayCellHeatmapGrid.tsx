import React, { useState, useMemo } from "react";
import { Info, Layers } from "lucide-react";
import { cToF } from "../lib/temperatureUnits";
import {
  PhysicalCellSlot,
  getPhysicalBpcPosition,
  getModuleNumberForCell,
  getModuleLabelAndHvacProximity
} from "../lib/physicalEnergySegmentLayout";
import PhysicalStringLayout from "./PhysicalStringLayout";

function convertVectorsToSlots(volts: number[], temps: number[]): PhysicalCellSlot[] {
  const slots: PhysicalCellSlot[] = [];
  for (let bpc = 1; bpc <= 14; bpc++) {
    const position = getPhysicalBpcPosition(bpc);
    if (!position) continue;
    for (let cg = 1; cg <= 30; cg++) {
      const idx = (bpc - 1) * 30 + (cg - 1);
      const voltageMv = volts[idx] !== undefined && volts[idx] !== null && Number.isFinite(volts[idx]) ? Number(volts[idx]) : null;
      const tempC = temps[idx] !== undefined && temps[idx] !== null && Number.isFinite(temps[idx]) ? Number(temps[idx]) : null;
      const tempF = tempC !== null ? tempC * 1.8 + 32 : null;
      
      const moduleNumber = getModuleNumberForCell(cg);
      if (!moduleNumber) continue;
      const { moduleLabel, hvacProximity, physicalColumnGroup } = getModuleLabelAndHvacProximity(position.side, moduleNumber);

      slots.push({
        bpcNumber: bpc,
        cellNumber: cg,
        cellGroupNumber: cg,
        moduleNumber,
        moduleLabel,
        side: position.side,
        physicalRow: position.physicalRow,
        physicalColumnGroup,
        hvacProximity,
        voltageMv,
        tempRaw: tempC,
        tempC,
        tempF,
        tempSourceKind: "compact",
        timestampAge: null,
        balancing: null,
        source: "stringviewer-monitor"
      });
    }
  }
  return slots;
}

type ArrayCellHeatmapGridProps = {
  arrayDetailsByArray: Record<string, any>;
};

export default function ArrayCellHeatmapGrid({ arrayDetailsByArray = {} }: ArrayCellHeatmapGridProps) {
  const [mode, setMode] = useState<"voltage" | "temperature">("voltage");
  const [tempUnit, setTempUnit] = useState<"C" | "F">("F");
  const [selectedArray, setSelectedArray] = useState<string | "all">("all");

  const arrayKeys = useMemo(() => {
    return Object.keys(arrayDetailsByArray).sort((a, b) => Number(a) - Number(b));
  }, [arrayDetailsByArray]);

  const arraysToRender = useMemo(() => {
    if (selectedArray === "all") {
      return arrayKeys.map((k) => arrayDetailsByArray[k]).filter(Boolean);
    }
    return [arrayDetailsByArray[selectedArray]].filter(Boolean);
  }, [selectedArray, arrayKeys, arrayDetailsByArray]);

  return (
    <div className="space-y-6 font-mono text-[9px] w-full select-none" id="array-cell-heatmap-grid">
      {/* Header Controls Bar */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-[#10b981] font-bold uppercase tracking-wider block text-[10px] flex items-center gap-1.5">
            <Layers size={14} className="text-[#10b981]" />
            Site Cell Telemetry Heatmap Windows
          </span>
          <span className="text-prizm-text-muted mt-0.5 block text-[8.5px]">
            Windowed granular physical alignment layout cards grouped by Array and String
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Active Mode Selector */}
          <div className="flex bg-prizm-surface p-0.5 rounded border border-prizm-border/40">
            <button
              onClick={() => setMode("voltage")}
              className={`px-3 py-1 rounded text-[8.5px] font-bold uppercase transition-colors ${
                mode === "voltage"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "text-prizm-text-muted hover:text-white"
              }`}
            >
              Voltage Compact
            </button>
            <button
              onClick={() => setMode("temperature")}
              className={`px-3 py-1 rounded text-[8.5px] font-bold uppercase transition-colors ${
                mode === "temperature"
                  ? "bg-prizm-primary/20 text-prizm-primary border border-prizm-primary/40"
                  : "text-prizm-text-muted hover:text-white"
              }`}
            >
              Temp Compact
            </button>
          </div>

          {/* Temperature Unit Toggle */}
          {mode === "temperature" && (
            <div className="flex bg-prizm-surface px-2.5 py-1 rounded border border-prizm-border/40 text-[#10b981] font-bold text-[8.5px] uppercase tracking-wider">
              Fixed: °F
            </div>
          )}

          {/* Array Dropdown Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-prizm-text-muted text-[8px] uppercase font-bold">Filter:</span>
            <select
              value={selectedArray}
              onChange={(e) => setSelectedArray(e.target.value)}
              className="bg-prizm-surface-strong text-prizm-text border border-prizm-border rounded px-2.5 py-1 text-[8.5px] font-bold uppercase cursor-pointer outline-none focus:border-prizm-primary text-center"
            >
              <option value="all">All Arrays</option>
              {arrayKeys.map((k) => (
                <option key={k} value={k}>
                  Array {k}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Caution Box */}
      <div className="bg-amber-500/10 border border-amber-500/30 text-amber-500/90 p-3 rounded-lg text-[8.5px] leading-relaxed flex items-start gap-2 sm:gap-3">
        <Info size={14} className="shrink-0 mt-0.5 text-amber-500" />
        <p className="normal-case">
          <strong>Site-Wide Physical Layout:</strong> This view generates exact physical alignment tables mapping modules to environmental slots. Use toggles above to switch modes and display units dynamically.
        </p>
      </div>

      {/* Stacked Arrays List */}
      <div className="space-y-8">
        {arraysToRender.map((arr) => {
          const stringsList = Array.isArray(arr.strings) ? arr.strings : [];
          const sortedStrings = [...stringsList].sort((a, b) => {
            const numA = Number(a.stringNumber ?? a.stringIndex ?? 0);
            const numB = Number(b.stringNumber ?? b.stringIndex ?? 0);
            return numA - numB;
          });

          return (
            <div key={arr.arrayNumber} className="space-y-3">
              <div className="border-b border-prizm-border/40 pb-1.5">
                <h3 className="text-prizm-text font-bold text-[9.5px] uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-3 bg-prizm-primary rounded-sm inline-block"></span>
                  ARRAY {arr.arrayNumber} PHYSICAL TIMELINE HEATMAPS
                  <span className="text-prizm-text-muted font-normal text-[8px] tracking-normal normal-case">
                    ({sortedStrings.length} strings mapped)
                  </span>
                </h3>
              </div>

              {sortedStrings.length === 0 ? (
                <div className="text-prizm-text-muted italic p-4 text-center border border-dashed border-prizm-border/20 rounded bg-prizm-surface-strong">
                  No active string data reported in Array {arr.arrayNumber}
                </div>
              ) : (
                /* Balanced 2-column physical layout card structure */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {sortedStrings.map((str) => {
                    const stringIndex = str.stringNumber ?? str.stringIndex ?? 1;
                    const stringKey = str.id || `Array ${arr.arrayNumber} - String ${stringIndex}`;
                    const volts = Array.isArray(str.millivolts) ? str.millivolts : [];
                    const temps = Array.isArray(str.temperatures) ? str.temperatures : [];
                    const slots = convertVectorsToSlots(volts, temps);

                    const title = `Station ${arr.stationCode || "BESS"} · Array ${arr.arrayNumber} · String ${stringIndex}`;

                    return (
                      <div key={stringKey} className="w-full">
                        <PhysicalStringLayout
                          slots={slots}
                          arrayNumber={arr.arrayNumber}
                          stringNumber={stringIndex}
                          metric={mode}
                          mode="tile"
                          showValues={true}
                          compactLabels={true}
                          tempUnit={tempUnit}
                          title={title}
                          showMinMaxHeader={true}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
