import React, { useState, useMemo } from "react";

interface CellTelemetryHeatmapProps {
  mode: "single-string" | "site-overview";
  voltages?: (number | null)[];
  temperatures?: (number | null)[];
  title?: string;
  gridColumns?: number;
  isCompact?: boolean;
}

export default function CellTelemetryHeatmap({
  mode,
  voltages = [],
  temperatures = [],
  title,
  gridColumns,
  isCompact = false
}: CellTelemetryHeatmapProps) {
  const [viewMode, setViewMode] = useState<"volts" | "temps">("volts");

  const safeVoltages = Array.isArray(voltages) ? voltages : [];
  const safeTemperatures = Array.isArray(temperatures) ? temperatures : [];
  const listToUse = viewMode === "volts" ? safeVoltages : safeTemperatures;
  const isVolts = viewMode === "volts";

  const { min, max, avg, formattedList } = useMemo(() => {
    let rawMin = Infinity;
    let rawMax = -Infinity;
    let sum = 0;
    let validCount = 0;

    const formatted = listToUse.map((val) => {
      const parsed = Number(val);
      if (val === undefined || val === null || !Number.isFinite(parsed)) {
        return null;
      }
      
      let p = parsed;
      if (!isCompact) {
        if (isVolts) {
          // Normalize mV to V if value is typical of mV
          if (p > 1000) {
            p = p / 1000;
          }
        } else {
          // Temperature division: if raw is above 100, normalize (e.g. 250 -> 25.0)
          if (p > 100) {
            p = p / 10;
          }
        }
      }

      if (p < rawMin) rawMin = p;
      if (p > rawMax) rawMax = p;
      sum += p;
      validCount++;

      return p;
    });

    return {
      min: validCount > 0 ? rawMin : null,
      max: validCount > 0 ? rawMax : null,
      avg: validCount > 0 ? sum / validCount : null,
      formattedList: formatted
    };
  }, [listToUse, isVolts, isCompact]);

  const rawCols = Number(gridColumns);
  const cols = Math.max(1, Number.isFinite(rawCols) && rawCols > 0 ? rawCols : 30);

  const unit = isCompact ? " Compact value" : (isVolts ? " V" : " °C");

  if (formattedList.length === 0) {
    return (
      <div className="bg-prizm-surface border border-prizm-border/40 p-4 rounded-lg space-y-3 font-mono text-[9px] w-full select-none flex items-center justify-center min-h-[100px] text-prizm-text-muted italic">
        No heatmap telemetry available for this string.
      </div>
    );
  }

  return (
    <div className="bg-prizm-surface border border-prizm-border/40 p-4 rounded-lg space-y-3 font-mono text-[9px] w-full select-none">
      <div className="flex justify-between items-center">
        <div>
          <span className="text-[#10b981] font-bold uppercase tracking-wider block text-[8px]">
            {title ?? (mode === "single-string" ? "STRING TELEMETRY HEATMAP" : "SITE OVERVIEW HEATMAP")}
          </span>
          <span className="text-prizm-text-muted mt-0.5 block text-[8.5px]">
            Mode: {mode === "single-string" ? "Single String" : "Site Overview"} ({formattedList.length} items){isCompact ? " - COMPACT EMS REPORT" : ""}
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

      {isCompact && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 p-1.5 rounded uppercase text-[7px] text-center tracking-wider">
          ⚠ Compact EMS report values. Not absolute mV/°C.
        </div>
      )}

      {min !== null && max !== null ? (
        <div className="grid grid-cols-3 gap-2.5 bg-prizm-surface border border-prizm-border/30 p-2 rounded text-center text-[8.5px]">
          <div>
            <span className="text-prizm-text-muted text-[7.5px] block uppercase">Min{isCompact ? " compact" : ""}</span>
            <span className={`font-bold ${isVolts ? "text-emerald-400" : "text-prizm-primary"}`}>
              {min.toFixed(isCompact ? 1 : (isVolts ? 3 : 1))}{!isCompact ? unit : ""}
            </span>
          </div>
          <div>
            <span className="text-prizm-text-muted text-[7.5px] block uppercase">Max{isCompact ? " compact" : ""}</span>
            <span className={`font-bold ${isVolts ? "text-emerald-400" : "text-prizm-primary"}`}>
              {max.toFixed(isCompact ? 1 : (isVolts ? 3 : 1))}{!isCompact ? unit : ""}
            </span>
          </div>
          <div>
            <span className="text-prizm-text-muted text-[7.5px] block uppercase">Avg{isCompact ? " compact" : ""}</span>
            <span className="text-prizm-text font-bold">
              {avg !== null ? avg.toFixed(isCompact ? 1 : (isVolts ? 3 : 1)) : "--"}{!isCompact && avg !== null ? unit : ""}
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

          const label = labelValueForHover(val, isVolts, isCompact);

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
        <span>Low-intensity ({isVolts ? "Min" : "Min"}) ➔ High-intensity ({isVolts ? "Max" : "Max"})</span>
      </div>
    </div>
  );
}

function labelValueForHover(val: number, isVolts: boolean, isCompact: boolean): string {
  if (isCompact) {
    return `Compact EMS report value ${val}`;
  }
  return isVolts ? `${val.toFixed(3)} V` : `${val.toFixed(1)} °C`;
}
