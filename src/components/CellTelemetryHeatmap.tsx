import React, { useState, useMemo } from "react";

interface CellTelemetryHeatmapProps {
  mode: "single-string" | "site-overview";
  voltages?: (number | null)[];
  temperatures?: (number | null)[];
  title?: string;
  gridColumns?: number;
}

export default function CellTelemetryHeatmap({
  mode,
  voltages = [],
  temperatures = [],
  title,
  gridColumns
}: CellTelemetryHeatmapProps) {
  const [viewMode, setViewMode] = useState<"volts" | "temps">("volts");

  const listToUse = viewMode === "volts" ? voltages : temperatures;
  const isVolts = viewMode === "volts";

  const { min, max, avg, formattedList } = useMemo(() => {
    let rawMin = Infinity;
    let rawMax = -Infinity;
    let sum = 0;
    let validCount = 0;

    const formatted = listToUse.map((val) => {
      if (val === undefined || val === null || Number.isNaN(val)) {
        return null;
      }
      
      let parsed = Number(val);
      if (isVolts) {
        // Normalize mV to V if value is typical of mV
        if (parsed > 1000) {
          parsed = parsed / 1000;
        }
      } else {
        // Temperature division: if raw is above 100, normalize (e.g. 250 -> 25.0)
        if (parsed > 100) {
          parsed = parsed / 10;
        }
      }

      if (parsed < rawMin) rawMin = parsed;
      if (parsed > rawMax) rawMax = parsed;
      sum += parsed;
      validCount++;

      return parsed;
    });

    return {
      min: validCount > 0 ? rawMin : null,
      max: validCount > 0 ? rawMax : null,
      avg: validCount > 0 ? sum / validCount : null,
      formattedList: formatted
    };
  }, [listToUse, isVolts]);

  // Determine standard columns: single-string defaults to 12 items, site-overview defaults to 30.
  const cols = gridColumns ?? (mode === "single-string" ? 14 : 30);

  return (
    <div className="bg-prizm-surface border border-prizm-border/40 p-4 rounded-lg space-y-3 font-mono text-[9px] w-full select-none">
      <div className="flex justify-between items-center">
        <div>
          <span className="text-[#10b981] font-bold uppercase tracking-wider block text-[8px]">
            {title ?? (mode === "single-string" ? "STRING TELEMETRY HEATMAP" : "SITE OVERVIEW HEATMAP")}
          </span>
          <span className="text-prizm-text-muted mt-0.5 block text-[8.5px]">
            Mode: {mode === "single-string" ? "Single String" : "Site Overview"} ({formattedList.length} items)
          </span>
        </div>

        <div className="flex gap-1.5 bg-prizm-surface p-0.5 rounded border border-prizm-border/40">
          <button
            onClick={() => setViewMode("volts")}
            className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-colors ${
              isVolts
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                : "text-prizm-text-muted hover:text-white"
            }`}
          >
            Voltages
          </button>
          <button
            onClick={() => setViewMode("temps")}
            className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-colors ${
              !isVolts
                ? "bg-prizm-primary/20 text-prizm-primary border border-prizm-primary/40"
                : "text-prizm-text-muted hover:text-white"
            }`}
          >
            Temps
          </button>
        </div>
      </div>

      {min !== null && max !== null ? (
        <div className="grid grid-cols-3 gap-2.5 bg-prizm-surface border border-prizm-border/30 p-2 rounded text-center text-[8.5px]">
          <div>
            <span className="text-prizm-text-muted text-[7.5px] block uppercase">Min</span>
            <span className={`font-bold ${isVolts ? "text-emerald-400" : "text-prizm-primary"}`}>
              {min.toFixed(isVolts ? 3 : 1)} {isVolts ? "V" : "°C"}
            </span>
          </div>
          <div>
            <span className="text-prizm-text-muted text-[7.5px] block uppercase">Max</span>
            <span className={`font-bold ${isVolts ? "text-emerald-400" : "text-prizm-primary"}`}>
              {max.toFixed(isVolts ? 3 : 1)} {isVolts ? "V" : "°C"}
            </span>
          </div>
          <div>
            <span className="text-prizm-text-muted text-[7.5px] block uppercase">Avg</span>
            <span className="text-prizm-text font-bold">
              {avg !== null ? avg.toFixed(isVolts ? 3 : 1) : "--"} {isVolts ? "V" : "°C"}
            </span>
          </div>
        </div>
      ) : (
        <div className="text-center p-2 text-prizm-text-muted italic border border-prizm-border/20 rounded">No metrics available</div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: "2.5px"
        }}
        className="bg-prizm-surface border border-prizm-border/20 p-2.5 rounded hover:border-prizm-border/60 transition-colors"
      >
        {formattedList.map((val, idx) => {
          if (val === null) {
            return (
              <div
                key={idx}
                title={`Index ${idx + 1}: No data`}
                className="aspect-square rounded-[1px] bg-prizm-border/10"
              />
            );
          }

          // Calculate color opacity based on standard ranges
          let opacity = 0.25;
          if (min !== null && max !== null && max > min) {
            opacity = 0.2 + 0.8 * ((val - min) / (max - min));
          }
          
          const bgStyle = isVolts
            ? `rgba(16, 185, 129, ${opacity})`
            : `rgba(2, 132, 199, ${opacity})`;

          const label = isVolts
            ? `${val.toFixed(3)} V`
            : `${val.toFixed(1)} °C`;

          return (
            <div
              key={idx}
              title={`Index ${idx + 1}: ${label}`}
              style={{ backgroundColor: bgStyle }}
              className="aspect-square rounded-[1px] hover:scale-125 transition-transform cursor-pointer border border-transparent hover:border-white/30"
            />
          );
        })}
      </div>
      
      <div className="text-[7.5px] text-prizm-text-muted flex justify-between select-none">
        <span>* Hover over a cell block to see individual measurements.</span>
        <span>Low-intensity ({isVolts ? "V Min" : "T Min"}) ➔ High-intensity ({isVolts ? "V Max" : "T Max"})</span>
      </div>
    </div>
  );
}
