import React, { useState, useMemo, useEffect, useRef } from "react";
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

function getPairedStringNumbers(stringNumber: number): number[] {
  if (!Number.isFinite(stringNumber) || stringNumber < 1) return [];
  const n = Math.trunc(stringNumber);
  return n % 2 === 0 ? [n - 1, n] : [n, n + 1];
}

function parseSearchQuery(query: string): { array?: number; strings?: number[] } {
  const q = query.trim().toLowerCase();
  if (!q) return {};

  // Pattern A: Match "A[number]-S[number]" or "A[number] S[number]" or similar
  const arrayStringMatch = q.match(/^a(\d+)[-\s]*s(\d+)$/);
  if (arrayStringMatch) {
    const arrNum = parseInt(arrayStringMatch[1], 10);
    const strNum = parseInt(arrayStringMatch[2], 10);
    return {
      array: arrNum,
      strings: getPairedStringNumbers(strNum)
    };
  }

  // Pattern B: Match "A[number]" (array only)
  const arrayOnlyMatch = q.match(/^a(\d+)$/);
  if (arrayOnlyMatch) {
    return {
      array: parseInt(arrayOnlyMatch[1], 10)
    };
  }

  // Pattern C: Match "S[number]" (string only)
  const stringOnlyMatch = q.match(/^s(\d+)$/);
  if (stringOnlyMatch) {
    const strNum = parseInt(stringOnlyMatch[1], 10);
    return {
      strings: getPairedStringNumbers(strNum)
    };
  }

  // Pattern D: Just a plain number
  const plainNumberMatch = q.match(/^(\d+)$/);
  if (plainNumberMatch) {
    const strNum = parseInt(plainNumberMatch[1], 10);
    return {
      strings: getPairedStringNumbers(strNum)
    };
  }

  return {};
}

export default function ArrayCellHeatmapGrid({ arrayDetailsByArray = {} }: ArrayCellHeatmapGridProps) {
  const [mode, setMode] = useState<"voltage" | "temperature">("voltage");
  const [tempUnit, setTempUnit] = useState<"C" | "F">("F");
  const [selectedArray, setSelectedArray] = useState<string | "all">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const topRef = useRef<HTMLDivElement | null>(null);

  const arrayKeys = useMemo(() => {
    const details = arrayDetailsByArray || {};
    return Object.keys(details).sort((a, b) => Number(a) - Number(b));
  }, [arrayDetailsByArray]);

  const parsedSearch = useMemo(() => {
    return parseSearchQuery(searchQuery);
  }, [searchQuery]);

  const arraysToRender = useMemo(() => {
    const details = arrayDetailsByArray || {};
    
    // 1. Initial selection of arrays
    let selected: any[] = [];
    if (selectedArray === "all") {
      selected = arrayKeys.map((k) => details[k]).filter(Boolean);
    } else {
      selected = [details[selectedArray]].filter(Boolean);
    }

    // 2. Filter arrays and strings based on parsed search query
    const results: any[] = [];
    
    for (const arr of selected) {
      const arrNum = Number(arr.arrayNumber);
      
      // If search query specifies an array, it must match
      if (parsedSearch.array !== undefined && parsedSearch.array !== arrNum) {
        continue;
      }

      const originalStrings = Array.isArray(arr.strings) ? arr.strings : [];
      let filteredStrings = originalStrings;

      // If search query specifies specific string numbers
      if (parsedSearch.strings && parsedSearch.strings.length > 0) {
        filteredStrings = originalStrings.filter((s) => {
          const sNum = Number(s.stringNumber ?? s.stringIndex ?? 0);
          return parsedSearch.strings!.includes(sNum);
        });
      }

      // If search is non-empty but didn't match our regex patterns, fallback to substring match
      if (searchQuery.trim() !== "" && parsedSearch.array === undefined && (!parsedSearch.strings || parsedSearch.strings.length === 0)) {
        const queryLower = searchQuery.toLowerCase().trim();
        filteredStrings = originalStrings.filter((s) => {
          const label = String(s.displayLabel || s.id || "").toLowerCase();
          const ip = String(s.ip || s.stringControllerIp || "").toLowerCase();
          return label.includes(queryLower) || ip.includes(queryLower);
        });
      }

      // Only render arrays that have strings matching our filter, unless they had no strings initially
      if (filteredStrings.length > 0 || originalStrings.length === 0) {
        results.push({
          ...arr,
          strings: filteredStrings
        });
      }
    }

    return results;
  }, [selectedArray, arrayKeys, arrayDetailsByArray, parsedSearch, searchQuery]);

  const isFilterActive = selectedArray !== "all" || searchQuery.trim() !== "";

  const filterSummary = useMemo(() => {
    const isArrayFiltered = selectedArray !== "all";
    const isStringFiltered = parsedSearch.strings && parsedSearch.strings.length > 0;
    const isSearchActive = searchQuery.trim() !== "";

    if (isArrayFiltered && isStringFiltered) {
      const minStr = Math.min(...parsedSearch.strings!);
      const maxStr = Math.max(...parsedSearch.strings!);
      return `Showing Array ${selectedArray} / Strings ${minStr}–${maxStr}`;
    }
    if (isArrayFiltered && parsedSearch.array !== undefined && parsedSearch.strings && parsedSearch.strings.length > 0) {
      const minStr = Math.min(...parsedSearch.strings!);
      const maxStr = Math.max(...parsedSearch.strings!);
      return `Showing Array ${parsedSearch.array} / Strings ${minStr}–${maxStr}`;
    }
    if (parsedSearch.array !== undefined && parsedSearch.strings && parsedSearch.strings.length > 0) {
      const minStr = Math.min(...parsedSearch.strings!);
      const maxStr = Math.max(...parsedSearch.strings!);
      return `Showing Array ${parsedSearch.array} / Strings ${minStr}–${maxStr}`;
    }
    if (isStringFiltered) {
      const minStr = Math.min(...parsedSearch.strings!);
      const maxStr = Math.max(...parsedSearch.strings!);
      return `Showing all arrays / Strings ${minStr}–${maxStr}`;
    }
    if (isArrayFiltered) {
      return `Showing Array ${selectedArray} / All Strings`;
    }
    if (isSearchActive) {
      return `Showing results for search: "${searchQuery}"`;
    }
    return "Showing all heatmaps";
  }, [selectedArray, parsedSearch, searchQuery]);

  const handleResetFilters = () => {
    setSelectedArray("all");
    setSearchQuery("");
  };

  return (
    <div className="space-y-6 font-mono text-[9px] w-full select-none relative" id="array-cell-heatmap-grid">
      <div ref={topRef} id="array-cell-heatmap-top" />

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
        </div>
      </div>

      {/* Horizontal Filter Bar */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-[9px] uppercase tracking-wider">
        {/* Array Filter */}
        <div className="space-y-1">
          <label className="text-[10px] text-prizm-text-muted font-bold block">Filter Array</label>
          <select
            value={selectedArray}
            onChange={(e) => setSelectedArray(e.target.value)}
            className="w-full bg-prizm-surface-strong border border-prizm-border text-prizm-text text-[11px] p-1.5 rounded outline-none focus:border-prizm-primary font-bold cursor-pointer"
          >
            <option value="all">Any Array (All)</option>
            {arrayKeys.map((k) => (
              <option key={k} value={k}>
                Array {k}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter (Disabled) */}
        <div className="space-y-1">
          <label className="text-[10px] text-prizm-text-muted font-bold block">Filter Status</label>
          <select
            disabled
            title="Status filtering pending normalized health flags."
            className="w-full bg-prizm-surface-strong/50 border border-prizm-border/60 text-prizm-text-muted text-[11px] p-1.5 rounded outline-none cursor-not-allowed font-bold"
          >
            <option value="all">Any Status (All)</option>
            <option value="normal">Healthy / Normal</option>
            <option value="warning">Warning</option>
            <option value="alarm">Alarm</option>
            <option value="missing">Not Communicating / Missing Data</option>
          </select>
          <span className="text-[8px] text-amber-500/80 normal-case block mt-0.5">
            Status filtering pending normalized health flags.
          </span>
        </div>

        {/* Search Input */}
        <div className="space-y-1">
          <label className="text-[10px] text-prizm-text-muted font-bold block">Search String IP / Label</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="e.g. A1-S3, S10, 10, Array 5 String 28..."
            className="w-full bg-prizm-surface-strong border border-prizm-border text-prizm-text text-[11px] p-1.5 rounded outline-none focus:border-prizm-primary placeholder:text-prizm-text-muted/50 placeholder:normal-case font-bold"
          />
        </div>
      </div>

      {/* Filter Summary & Reset Option */}
      <div className="bg-prizm-surface/40 border border-prizm-border/40 px-4 py-2.5 rounded-lg flex flex-col sm:flex-row justify-between items-center gap-2 text-[10px] uppercase font-bold text-prizm-text-muted shadow-sm">
        <span>{filterSummary}</span>
        {isFilterActive && (
          <button
            onClick={handleResetFilters}
            className="px-3 py-1 rounded bg-prizm-surface-strong border border-prizm-border hover:bg-prizm-surface hover:text-white transition text-[9px] tracking-wider cursor-pointer"
          >
            Reset Filters
          </button>
        )}
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

      {/* Persistent Back to Top Button */}
      <button
        type="button"
        onClick={() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-1.5 bg-prizm-surface-strong hover:bg-prizm-surface border border-prizm-border px-4 py-2 rounded-full text-[10px] font-bold text-prizm-text shadow-xl hover:text-white hover:border-prizm-primary/60 transition-all cursor-pointer"
      >
        ↑ Top
      </button>
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
