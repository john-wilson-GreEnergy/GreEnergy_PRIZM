import React, { useState, useMemo, useEffect } from "react";
import { Info, Layers } from "lucide-react";
import {
  PhysicalCellSlot,
  getPhysicalBpcPosition,
  getModuleNumberForCell,
  getModuleLabelAndHvacProximity,
  buildPhysicalSlotsFromRichDetail
} from "../lib/physicalEnergySegmentLayout";
import PhysicalStringLayout from "./PhysicalStringLayout";
import { resolvePhysicalCellMetricValue } from "../utils/cellValueResolver";

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

                    return (
                      <div key={stringKey} className="w-full">
                        <HeatmapTile
                          arrayNumber={arr.arrayNumber}
                          stringNumber={stringIndex}
                          stringKey={stringKey}
                          stationCode={arr.stationCode || "BESS"}
                          mode={mode}
                          tempUnit={tempUnit}
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

interface HeatmapTileProps {
  arrayNumber: number | string;
  stringNumber: number | string;
  stringKey: string;
  stationCode: string;
  mode: "voltage" | "temperature";
  tempUnit: "C" | "F";
}

function HeatmapTile({
  arrayNumber,
  stringNumber,
  stringKey,
  stationCode,
  mode,
  tempUnit
}: HeatmapTileProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unmounted = false;
    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/local/strings/dashboard/${arrayNumber}/${stringNumber}/detail?captureHistory=true`);
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
          throw new Error("Server is restarting or unreachable");
        }
        const json = await res.json();
        if (!unmounted) {
          setData(json);
          setError(null);
          setLoading(false);
        }
      } catch (err: any) {
        console.error(`Failed to fetch string detail for A${arrayNumber}-S${stringNumber}`, err);
        if (!unmounted) {
          setError(err.message || "Failed to load");
          setLoading(false);
        }
      }
    };

    fetchDetail();
    const interval = window.setInterval(fetchDetail, 15000);
    return () => {
      unmounted = true;
      window.clearInterval(interval);
    };
  }, [arrayNumber, stringNumber]);

  const physicalLayout = useMemo(() => {
    return buildPhysicalSlotsFromRichDetail(data);
  }, [data]);

  // Temporary debug check requested by the user
  useEffect(() => {
    if (data && physicalLayout.available) {
      const validTemps: number[] = [];
      const validVolts: number[] = [];

      physicalLayout.slots.forEach(s => {
        const bpcIndex = s.bpcNumber;
        const cellIndex = s.cellNumber;
        const physicalIndex = (bpcIndex - 1) * 30 + (cellIndex - 1);

        const tempC = resolvePhysicalCellMetricValue({
          stringData: data,
          metric: "temperature",
          bpcIndex,
          cellIndex,
          physicalIndex,
          sourceUnit: "C"
        });
        const voltageMv = resolvePhysicalCellMetricValue({
          stringData: data,
          metric: "voltage",
          bpcIndex,
          cellIndex,
          physicalIndex,
          sourceUnit: "C"
        });

        if (tempC !== null && typeof tempC === "number" && Number.isFinite(tempC)) {
          validTemps.push(tempC);
        }
        if (voltageMv !== null && typeof voltageMv === "number" && Number.isFinite(voltageMv)) {
          validVolts.push(voltageMv);
        }
      });

      const tempSample = validTemps.length > 0 ? (validTemps[0] * 1.8 + 32) : null;
      const voltageSample = validVolts.length > 0 ? validVolts[0] : null;

      const tempMin = validTemps.length > 0 ? (Math.min(...validTemps) * 1.8 + 32) : null;
      const tempMax = validTemps.length > 0 ? (Math.max(...validTemps) * 1.8 + 32) : null;

      const voltageMin = validVolts.length > 0 ? Math.min(...validVolts) : null;
      const voltageMax = validVolts.length > 0 ? Math.max(...validVolts) : null;

      console.debug("[SiteHealthHeatmap resolved string detail source]", {
        arrayNumber,
        stringNumber,
        source: "string-detail",
        tempCount: validTemps.length,
        voltageCount: validVolts.length,
        tempSample,
        voltageSample,
        tempMin,
        tempMax,
        voltageMin,
        voltageMax
      });
    }
  }, [data, physicalLayout, arrayNumber, stringNumber]);

  const title = `Station ${stationCode || "BESS"} · Array ${arrayNumber} · String ${stringNumber}`;

  if (loading) {
    return (
      <div className="bg-prizm-surface border border-prizm-border/40 rounded-lg p-6 flex flex-col items-center justify-center min-h-[220px] text-center font-mono space-y-3">
        <div className="w-6 h-6 border-2 border-prizm-primary border-t-transparent rounded-full animate-spin"></div>
        <div className="text-[10px] text-prizm-text-muted font-bold uppercase tracking-wider">
          Loading detailed cell telemetry...
        </div>
        <div className="text-[8px] text-prizm-text-muted">
          Array {arrayNumber} / String {stringNumber}
        </div>
      </div>
    );
  }

  if (error || !physicalLayout.available) {
    const errorReason = error || physicalLayout.reason || "No rich battery pack reports returned for this string.";
    return (
      <div className="bg-prizm-surface border border-prizm-border/40 rounded-lg p-6 flex flex-col items-center justify-center min-h-[220px] text-center font-mono space-y-2">
        <div className="text-amber-500 font-extrabold text-[12px]">⚠️</div>
        <div className="text-[10px] text-prizm-text font-bold uppercase tracking-wider">
          Telemetry Unavailable
        </div>
        <div className="text-[8.5px] text-prizm-text-muted uppercase max-w-xs leading-normal">
          {errorReason}
        </div>
        <div className="text-[8px] text-[#ef4444] font-bold uppercase mt-1">
          A{arrayNumber}-S{stringNumber} rich details not loaded
        </div>
      </div>
    );
  }

  return (
    <PhysicalStringLayout
      slots={physicalLayout.slots}
      arrayNumber={arrayNumber}
      stringNumber={stringNumber}
      metric={mode}
      mode="tile"
      showValues={true}
      compactLabels={true}
      tempUnit={tempUnit}
      title={title}
      showMinMaxHeader={true}
      stringData={data}
    />
  );
}
