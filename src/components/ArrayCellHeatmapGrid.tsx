import React, { useState, useMemo } from "react";
import { Info, Layers } from "lucide-react";

type ArrayCellHeatmapGridProps = {
  arrayDetailsByArray: Record<string, any>;
};

export default function ArrayCellHeatmapGrid({ arrayDetailsByArray = {} }: ArrayCellHeatmapGridProps) {
  const [mode, setMode] = useState<"voltage" | "temperature">("voltage");
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
            Windowed granular matrices grouped by Array and String
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
              Voltages [mV]
            </button>
            <button
              onClick={() => setMode("temperature")}
              className={`px-3 py-1 rounded text-[8.5px] font-bold uppercase transition-colors ${
                mode === "temperature"
                  ? "bg-prizm-primary/20 text-prizm-primary border border-prizm-primary/40"
                  : "text-prizm-text-muted hover:text-white"
              }`}
            >
              Temps [°C]
            </button>
          </div>

          {/* Array Dropdown Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-prizm-text-muted text-[8px] uppercase">Filter:</span>
            <select
              value={selectedArray}
              onChange={(e) => setSelectedArray(e.target.value)}
              className="bg-prizm-surface-strong text-prizm-text border border-prizm-border rounded px-2.5 py-1 text-[8.5px] font-bold uppercase cursor-pointer outline-none focus:border-prizm-primary font-mono text-center"
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
          <strong>Caution:</strong> Compact EMS report values from staged cache. Use for relative comparison and anomaly spotting; do not interpret as absolute mV or °C unless source is confirmed absolute.
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
                  ARRAY {arr.arrayNumber} CELL HEATMAP
                  <span className="text-prizm-text-muted font-normal text-[8px] tracking-normal normal-case">
                    ({sortedStrings.length} strings mapped)
                  </span>
                </h3>
              </div>

              {sortedStrings.length === 0 ? (
                <div className="text-prizm-text-muted italic p-4 text-center border border-dashed border-prizm-border/20 rounded bg-prizm-surface-strong">
                  No string data reported in Array {arr.arrayNumber}
                </div>
              ) : (
                /* 4 strings per row card layout */
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {sortedStrings.map((str) => {
                    const stringKey = str.id || `A${arr.arrayNumber}-S${str.stringIndex ?? str.stringNumber}`;
                    const rawVals = mode === "voltage" ? str.millivolts : str.temperatures;
                    const vals = Array.isArray(rawVals) ? rawVals : [];

                    // Calculate local string relative bounds to color cells nicely
                    const validValues = vals.map(Number).filter((v) => !Number.isNaN(v) && v !== null && v !== undefined);
                    const sMin = validValues.length ? Math.min(...validValues) : 0;
                    const sMax = validValues.length ? Math.max(...validValues) : 0;

                    // Compute columns (typically 14 BPCs * 30 CG = 420 cells. So 30 columns makes 14 rows)
                    const colsCount = vals.length === 420 ? 30 : (vals.length % 30 === 0 && vals.length > 0) ? 30 : 30;

                    return (
                      <div
                        key={stringKey}
                        className="bg-prizm-surface-strong border border-prizm-border/30 rounded-lg p-3 space-y-2 flex flex-col justify-between"
                      >
                        {/* String Card Header */}
                        <div className="flex justify-between items-center border-b border-prizm-border/20 pb-1.5 select-none font-bold">
                          <span className="text-prizm-text text-[9px] uppercase tracking-wide">
                            {stringKey}
                          </span>
                          <span className="text-prizm-text-muted text-[8px] font-normal tracking-normal text-right">
                            {vals.length > 0 ? `${Math.round(vals.length / 30)} BPC / 30 CG` : "-- BPC / CG"}
                          </span>
                        </div>

                        {/* Relative Range Bar */}
                        {validValues.length > 0 && (
                          <div className="flex justify-between items-center text-[7.5px] text-prizm-text-muted px-0.5 select-none font-semibold">
                            <span>Min: {sMin}</span>
                            <span>Max: {sMax}</span>
                          </div>
                        )}

                        {/* Heatmap Grid */}
                        {vals.length === 0 ? (
                          <div className="h-[80px] flex items-center justify-center text-prizm-text-muted text-[8px] border border-dashed border-prizm-border/20 rounded bg-prizm-surface p-2 text-center italic">
                            No active telemetry reported
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: `repeat(${colsCount}, minmax(0, 1fr))`,
                              gap: "1.5px"
                            }}
                            className="bg-prizm-surface border border-prizm-border/10 p-1.5 rounded"
                          >
                            {vals.map((val, cIdx) => {
                              if (val === null || val === undefined || Number.isNaN(val)) {
                                return (
                                  <div
                                    key={cIdx}
                                    title={`${stringKey} Index ${cIdx + 1}: No data`}
                                    className="aspect-square rounded-[0.5px] bg-prizm-border/15"
                                  />
                                );
                              }

                              const valNum = Number(val);
                              let opacity = 0.25;
                              if (sMax > sMin) {
                                opacity = 0.15 + 0.85 * ((valNum - sMin) / (sMax - sMin));
                              }

                              const bgStyle =
                                mode === "voltage"
                                  ? `rgba(16, 185, 129, ${opacity})`
                                  : `rgba(2, 132, 199, ${opacity})`;

                              return (
                                <div
                                  key={cIdx}
                                  title={`${stringKey} Index ${cIdx + 1}: Compact EMS report value ${valNum}`}
                                  style={{ backgroundColor: bgStyle }}
                                  className="aspect-square rounded-[0.5px] hover:scale-125 transition-transform cursor-pointer border border-transparent hover:border-white/30"
                                />
                              );
                            })}
                          </div>
                        )}
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
