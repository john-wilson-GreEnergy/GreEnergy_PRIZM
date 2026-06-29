import React, { useState, useEffect, useMemo } from "react";
import {
  Flame,
  ShieldAlert,
  Wind,
  Thermometer,
  Layers,
  Wifi,
  WifiOff,
  RotateCw,
  Zap,
  Droplet,
  Shield,
  Search,
  Activity,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Cpu,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Sliders,
  Compass,
  Database,
  Info,
  X,
  Plus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  TopologySensorPoint,
  BlockSensorMatrixRow,
  NormalizedSensorCell,
  TopologySensorSummary,
  getPointFamily,
  getRowFamilies,
  matchesArrayFilter,
  matchesSegmentFilter,
  matchesHealthFilter,
  matchesSearch,
  formatActiveState,
  formatAvailability,
  formatEntityKey
} from "./topologyUtils";

export default function TopologySensorHealthPanel() {
  const [data, setData] = useState<TopologySensorSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // SECTION 3 & 5 Filters State
  const [selectedArray, setSelectedArray] = useState<string>("all");
  const [selectedSegment, setSelectedSegment] = useState<"all" | "CS" | "ES">("all");
  const [selectedFamily, setSelectedFamily] = useState<string>("all");
  const [selectedHealth, setSelectedHealth] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [capabilityFilter, setCapabilityFilter] = useState<"expected" | "optional" | "all">("expected");
  const [showSourceDebug, setShowSourceDebug] = useState<boolean>(false);

  // Pagination for point browser (Section 5)
  const [pointLimit, setPointLimit] = useState<number>(250);

  // Drilldown States (Section 6)
  const [selectedRow, setSelectedRow] = useState<BlockSensorMatrixRow | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<TopologySensorPoint | null>(null);

  // Fetch Endpoint
  const fetchTopologyData = async (isManual = false) => {
    if (isManual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetch("/api/local/site-sensors/topology?refresh=true&maxAgeMs=0");
      if (!res.ok) {
        throw new Error(`Server returned HTTP state code ${res.status}`);
      }
      const json: any = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error("Error fetching site-sensors topology:", err);
      setError(err?.message || "Fault encountered while requesting topology information.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTopologyData();

    // Background polling
    const timer = setInterval(() => {
      fetchTopologyData(true);
    }, 10000);

    return () => clearInterval(timer);
  }, []);

  // Helper to extract Array number for sorting and divider grouping
  const getArrayNumber = (displayName: string): number => {
    const m = displayName.match(/Array\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : 999;
  };

  const expectedOnly = capabilityFilter === "expected";
  const includeOptional = capabilityFilter === "optional";
  const showUnsupported = capabilityFilter === "all";

  const shouldShowCellByToggles = (cell: any) => {
    if (!cell) return false;
    const cap = cell.capability || "expected";
    if (expectedOnly) {
      return cap === "expected";
    }
    if (includeOptional) {
      return cap === "expected" || cap === "optional";
    }
    if (showUnsupported) {
      return true;
    }
    return !!cell.applicable;
  };

  // Helper to format Row Location Name beautifully (Section 4 requirements)
  const formatRowLocationName = (row: BlockSensorMatrixRow): string => {
    const name = row.location?.displayName || "";
    const arrayMatch = name.match(/Array\s+(\d+)/i);
    const arrNum = arrayMatch ? arrayMatch[1] : "1";
    const isCS = row.location?.enclosureType === "CollectionSegment";
    
    if (isCS) {
      return `Array ${arrNum} - CS`;
    } else {
      const esIndex = row.location?.enclosureIndex || row.location?.segmentPosition || 1;
      return `Array ${arrNum} - ES${esIndex}`;
    }
  };

  // Filter local physical rows (Section 3 & 4)
  const physicalRows = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows.filter((row) => {
      if (!row.location) return false;
      const index = row.location.enclosureIndex;
      if (index === null || index < 1) return false;
      
      const name = row.location.displayName || "";
      // No Array 0 or ES-1 displaying
      if (name.includes("Array 0") || name.includes("ES-1")) return false;
      return true;
    });
  }, [data]);

  // Derive dynamic list of Arrays
  const dynamicArrays = useMemo(() => {
    const found = new Set<number>();
    physicalRows.forEach((row) => {
      const num = getArrayNumber(row.location?.displayName || "");
      if (num !== 999 && num !== 0) {
        found.add(num);
      }
    });
    if (found.size === 0) return [1, 2, 3, 4, 5, 6, 7, 8];
    return Array.from(found).sort((a, b) => a - b);
  }, [physicalRows]);

  // Sort Physical Rows by Array family first for clean separator display
  const sortedPhysicalRows = useMemo(() => {
    return [...physicalRows].sort((a, b) => {
      const arrA = getArrayNumber(a.location?.displayName || "");
      const arrB = getArrayNumber(b.location?.displayName || "");
      if (arrA !== arrB) return arrA - arrB;
      
      const typeA = a.location?.enclosureType || "";
      const typeB = b.location?.enclosureType || "";
      if (typeA !== typeB) {
        return typeB.localeCompare(typeA); // CS before ES
      }

      const posA = a.location?.enclosureIndex || 0;
      const posB = b.location?.enclosureIndex || 0;
      return posA - posB;
    });
  }, [physicalRows]);

  // List of active Global points
  const globalPoints = useMemo(() => {
    if (!data?.points) return [];
    return data.points.filter((point) => point.segmentKind === "GLOBAL");
  }, [data]);

  // Filtered physical matrix output
  const filteredRows = useMemo(() => {
    return sortedPhysicalRows.filter((row) => {
      if (!matchesArrayFilter(row, selectedArray)) return false;
      if (!matchesSegmentFilter(row, selectedSegment)) return false;
      if (selectedFamily !== "all") {
        const rowFams = getRowFamilies(row);
        if (!rowFams.includes(selectedFamily)) return false;
      }
      if (!matchesHealthFilter(row, selectedHealth, true)) return false;
      if (!matchesSearch(row, searchQuery)) return false;
      return true;
    });
  }, [sortedPhysicalRows, selectedArray, selectedSegment, selectedFamily, selectedHealth, searchQuery]);

  // Filtered telemetry points list
  const filteredPoints = useMemo(() => {
    if (!data?.points) return [];
    return data.points.filter((point) => {
      if (!matchesArrayFilter(point, selectedArray)) return false;
      if (!matchesSegmentFilter(point, selectedSegment)) return false;
      if (selectedFamily !== "all") {
        if (getPointFamily(point) !== selectedFamily) return false;
      }
      if (!matchesHealthFilter(point, selectedHealth, false)) return false;
      if (!matchesSearch(point, searchQuery)) return false;
      return true;
    });
  }, [data, selectedArray, selectedSegment, selectedFamily, selectedHealth, searchQuery]);

  // Categorized counts for chips (Section 5 dynamic labels)
  const pointCountsByFamily = useMemo(() => {
    const counts: Record<string, number> = {
      all: 0,
      "Communications / IO": 0,
      Doors: 0,
      Smoke: 0,
      Heat: 0,
      Hydrogen: 0,
      Fire: 0,
      Moisture: 0,
      "UPS / E-stop": 0,
      Environment: 0,
      Global: 0,
      Uncategorized: 0
    };
    if (!data?.points) return counts;
    counts.all = data.points.length;
    data.points.forEach((p) => {
      const f = getPointFamily(p);
      if (counts[f] !== undefined) {
        counts[f]++;
      } else {
        counts.Uncategorized++;
      }
    });
    return counts;
  }, [data]);

  // Points associated with selected row (Section 6 Selected Detail drilldown)
  const pointsInSelectedRowGrouped = useMemo(() => {
    if (!selectedRow || !data?.points) return {};
    const row = selectedRow;
    const kind = row.location.enclosureType === "CollectionSegment" ? "CS" : "ES";
    const rawList = data.points.filter(
      (p) => p.enclosureIndex === row.location.enclosureIndex && p.segmentKind === kind
    );
    const groups: Record<string, TopologySensorPoint[]> = {};
    rawList.forEach((point) => {
      const fam = getPointFamily(point);
      if (!groups[fam]) groups[fam] = [];
      groups[fam].push(point);
    });
    return groups;
  }, [selectedRow, data]);

  // Clear all filters state handler
  const handleClearFilters = () => {
    setSelectedArray("all");
    setSelectedSegment("all");
    setSelectedFamily("all");
    setSelectedHealth("all");
    setSearchQuery("");
  };

  // Overall Severity color card styles
  const globalSeverity = useMemo(() => {
    if (!data) return "OK";
    if (data.activePointCount > 0) return "Critical";
    if (data.unavailablePointCount > 0 || (data.debug?.numericIdParseFailedCount && data.debug.numericIdParseFailedCount > 0)) {
      return "Warning";
    }
    return "OK";
  }, [data]);

  const severityStyles = {
    Critical: "bg-red-50 text-red-800 border-red-200 shadow-red-50",
    Warning: "bg-amber-50 text-amber-800 border-amber-200 shadow-amber-50",
    OK: "bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-50"
  };

  // Render tiny compact dots inside matrix cells (Section 4)
  const renderCellIndicator = (cell: NormalizedSensorCell, isHighlighted = false) => {
    if (!cell || !shouldShowCellByToggles(cell)) {
      return <span className="text-slate-300 font-normal select-none font-mono text-[10px]">-</span>;
    }

    const highlightStyle = isHighlighted ? "ring-2 ring-indigo-500 scale-110" : "";
    const cellAny = cell as any;
    const debugSuffix = showSourceDebug 
      ? ` [Cap: ${cellAny.capability || "expected"}, State: ${cellAny.displayState || "normal"}]`
      : "";

    if (cell.tripped === true) {
      return (
        <span
          title={`${cell.friendlyName || "Sensor Tripped"}: ${cell.status}${debugSuffix}`}
          className={`h-5 px-1.5 inline-flex items-center justify-center text-[9px] font-bold rounded bg-red-105 text-red-700 border border-red-200 animate-pulse ${highlightStyle}`}
        >
          TRIP
        </span>
      );
    }

    if (!cell.healthy) {
      return (
        <span
          title={`${cell.friendlyName || "Sensor Issue"}: ${cell.status}${debugSuffix}`}
          className={`h-5 px-1.5 inline-flex items-center justify-center text-[9px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-200 ${highlightStyle}`}
        >
          FAULT
        </span>
      );
    }

    return (
      <span
        title={`${cell.friendlyName || "Sensor Healthy"}${debugSuffix}`}
        className={`h-4 w-4 inline-flex items-center justify-center rounded-full bg-emerald-100 border border-emerald-200 ${highlightStyle}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm flex flex-col items-center justify-center min-h-[300px]">
        <RefreshCw size={32} className="text-slate-400 animate-spin mb-3" />
        <p className="text-slate-605 font-medium font-sans">Querying local site sensors topology...</p>
        <p className="text-xs text-slate-400 mt-1 font-mono">GET /api/local/site-sensors/topology</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-white border border-rose-300 rounded-lg p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-rose-50 rounded-lg text-rose-600">
            <AlertCircle size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-rose-900 text-base font-sans">Topology Pipeline Disrupted</h3>
            <p className="text-xs text-rose-700 mt-1 leading-relaxed bg-rose-50/50 p-2.5 rounded border border-rose-100 font-mono select-all">
              {error}
            </p>
            <button
              onClick={() => fetchTopologyData(false)}
              className="mt-4 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-semibold transition-all shadow-sm"
            >
              Retry Active Query
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (data && data.success === false) {
    const debug = (data as any).sensorSafetyHealthDebug || {};
    return (
      <div className="bg-white border border-amber-300 rounded-lg p-6 shadow-sm space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
            <ShieldAlert size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-amber-900 text-base font-sans">Sensor &amp; Safety Data Unavailable</h3>
            <p className="text-sm text-slate-600 mt-1">
              Live telemetry is currently unavailable. No seeded/mock values are used in this environment.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-sans">Pipeline Diagnostics (sensorSafetyHealthDebug)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono text-slate-600">
            <div>
              <span className="font-semibold text-slate-500">Requested URL:</span> {debug.requestedUrl || "N/A"}
            </div>
            <div>
              <span className="font-semibold text-slate-500">Source Health:</span> <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 rounded text-[10px] font-bold">{debug.sourceHealth || "N/A"}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Selected Profile:</span> {debug.selectedProfile || "N/A"}
            </div>
            <div>
              <span className="font-semibold text-slate-500">Source Endpoints:</span> {JSON.stringify(debug.sourceEndpoints || [])}
            </div>
          </div>
          {debug.error && (
            <div className="pt-2 border-t border-slate-200">
              <span className="text-[11px] font-bold text-rose-600 font-sans block mb-1">Error Reason:</span>
              <pre className="text-xs bg-rose-50/50 p-2.5 rounded border border-rose-100 font-mono text-rose-700 overflow-x-auto select-all whitespace-pre-wrap">{debug.error}</pre>
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => fetchTopologyData(false)}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-semibold transition-all shadow-sm"
          >
            Retry Sensor Query
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-850 font-sans animate-fade-in" id="topology-sensor-health-submodule">
      
      {/* SECTION 1 — Site Health Header Toolbar */}
      <div className={`border rounded-xl p-4 shadow-2xs transition-all duration-300 ${severityStyles[globalSeverity]}`}>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className={`p-2 rounded-lg ${globalSeverity === "Critical" ? "bg-red-500 text-white animate-pulse" : "bg-white border border-slate-200 text-slate-800 shadow-2xs"}`}>
                <Activity size={18} className="stroke-[2.5]" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold font-sans text-slate-900 leading-none">
                    EMS Topology Diagnostics Console
                  </h2>
                  <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-white border border-slate-200 text-slate-500 uppercase tracking-widest leading-none">
                    LIVE
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Full schematic scan rendering modular BESS segments across {data?.groupedEnclosureCount || 0} sub-cabinets.
                </p>
              </div>
            </div>
          </div>

          {/* Local Toolbar stats layout inside Section 1 */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className="text-[10px] uppercase font-mono bg-white border border-slate-200 rounded-md p-2 grid grid-cols-2 sm:flex items-center gap-x-4 gap-y-1 text-slate-600 shadow-2xs w-full sm:w-auto">
              <div className="flex items-center gap-1">
                <span>Station:</span>
                <strong className="text-slate-900">{data?.stationCode || "BHE0020"}</strong>
              </div>
              <div className="hidden sm:block h-3 w-px bg-slate-200" />
              <div className="flex items-center gap-1">
                <span>Block:</span>
                <strong className="text-slate-900">{data?.blockIndex ?? 1}</strong>
              </div>
              <div className="hidden sm:block h-3 w-px bg-slate-200" />
              <div className="flex items-center gap-1">
                <span>Mode:</span>
                <strong className="text-slate-900">{data?.parserMode || "PRODUCTION"}</strong>
              </div>
              <div className="hidden sm:block h-3 w-px bg-slate-200" />
              <div className="flex items-center gap-1">
                <span>Updated:</span>
                <strong className="text-slate-900">{lastUpdated ? lastUpdated.toLocaleTimeString() : "-"}</strong>
              </div>
            </div>

            <div className="text-[10px] uppercase font-mono bg-white border border-slate-200 rounded-md p-2 flex items-center justify-between sm:justify-start gap-4 text-slate-650 shadow-2xs w-full sm:w-auto">
              <div>
                Points: <strong className="text-slate-905">{data?.points?.length || 0}</strong>
              </div>
              <div className="h-3 w-px bg-slate-200" />
              <div>
                Enclosures: <strong className="text-slate-905">{physicalRows.length}</strong>
              </div>
              <div className="h-3 w-px bg-slate-200" />
              <div>
                Faults: <strong className={`${data?.activePointCount && data.activePointCount > 0 ? "text-red-700 font-bold" : "text-emerald-700"}`}>
                  {data?.activePointCount || 0}
                </strong>
              </div>
            </div>

            <button
              onClick={() => fetchTopologyData(true)}
              disabled={refreshing || loading}
              className="flex items-center justify-center gap-1 bg-slate-900 text-white hover:bg-slate-800 transition-colors py-2 px-3 rounded-md text-[11px] font-semibold shadow-xs disabled:opacity-50 w-full sm:w-auto"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Scanning..." : "Force Scan"}
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 2 — Global Status Strip */}
      {data && globalPoints.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex flex-col md:flex-row md:items-center justify-between text-xs font-mono gap-2 shadow-2xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
            <span className="font-bold uppercase text-slate-700 tracking-wider text-[10px]">Global Block Readiness Indicators:</span>
          </div>
          <div className="flex flex-col gap-1.5 w-full md:w-auto">
            {globalPoints.map((point) => {
              const abbrKey = formatEntityKey(point.entityKey);
              const isAlert = point.activeState === true;
              const isUnk = point.activeState === null;
              
              return (
                <div key={point.entityKey} className="bg-white border border-slate-150 rounded px-2.5 py-1.5 flex flex-wrap items-center gap-2 shadow-2xs">
                  <span className="font-sans font-extrabold text-slate-950 text-[11px]">{point.displayName || "Block Level Link"}</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-650">{point.pointLabel}</span>
                  <span className="text-slate-300">|</span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold leading-none ${point.pointAvailable ? "bg-emerald-50 text-emerald-700 border border-emerald-250" : "bg-red-50 text-red-750 border border-red-200"}`}>
                    {formatAvailability(point)}
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold leading-none ${isAlert ? "bg-red-100 text-red-750 border border-red-300 animate-pulse" : isUnk ? "bg-slate-50 text-slate-500 border border-slate-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                    Type State: {formatActiveState(point.activeState)}
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold leading-none ${point.severity === "Critical" ? "bg-red-500 text-white" : point.severity === "Warning" ? "bg-amber-100 text-amber-800 border border-amber-250" : "bg-emerald-100 text-emerald-750 border border-emerald-255"}`}>
                    {point.severity}
                  </span>
                  {point.entitySubType && (
                    <>
                      <span className="text-slate-300">|</span>
                      <span className="text-slate-450">{point.entitySubType}</span>
                    </>
                  )}
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-400 select-all cursor-help" title={point.entityKey}>Raw Entity: {point.entityKey}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3 — Shared Physical Matrix Filters Bar */}
      {data && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5">
              <Sliders size={14} className="text-slate-500" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-700 font-mono">
                Operator Schematic Query Filters
              </h3>
            </div>
            
            <div className="text-[10px] font-mono text-slate-500 bg-slate-50 border border-slate-150 rounded px-2 py-0.5">
              Matched: <strong className="text-slate-900">{filteredRows.length}</strong>/{physicalRows.length} Rows & <strong className="text-slate-900">{filteredPoints.length}</strong>/{data.points.length} Points
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
            {/* 1. Array Selector */}
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Array Segment</label>
              <select
                value={selectedArray}
                onChange={(e) => {
                  setSelectedArray(e.target.value);
                  setSelectedRow(null);
                }}
                className="bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-800 font-medium"
              >
                <option value="all">All Arrays (1 - {dynamicArrays[dynamicArrays.length - 1] || 8})</option>
                {dynamicArrays.map((num) => (
                  <option key={num} value={num.toString()}>
                    Array {num}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. CS/ES Segment Type Selector */}
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Segment Level</label>
              <select
                value={selectedSegment}
                onChange={(e) => {
                  setSelectedSegment(e.target.value as any);
                  setSelectedRow(null);
                }}
                className="bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-800 font-medium"
              >
                <option value="all">All Segments (CS + ES)</option>
                <option value="CS">Collection Segment (CS) only</option>
                <option value="ES">Energy Segment (ES) only</option>
              </select>
            </div>

            {/* 3. Sensor Family Selector */}
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Sensor Family</label>
              <select
                value={selectedFamily}
                onChange={(e) => setSelectedFamily(e.target.value)}
                className="bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-800 font-medium"
              >
                <option value="all">All Sensor Families</option>
                <option value="Communications / IO">Communications / IO</option>
                <option value="Doors">Doors</option>
                <option value="Smoke">Smoke</option>
                <option value="Heat">Thermal Heat</option>
                <option value="Hydrogen">Hydrogen Diagnostics</option>
                <option value="Fire">Fire / Core Trigger</option>
                <option value="Moisture">Moisture Detectors</option>
                <option value="UPS / E-stop">UPS / E-stop Relay</option>
                <option value="Environment">HVAC Environment</option>
                <option value="Global">Global Readiness</option>
              </select>
            </div>

            {/* 4. Health Severity State Selector */}
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Health / Severity</label>
              <select
                value={selectedHealth}
                onChange={(e) => {
                  setSelectedHealth(e.target.value);
                  setSelectedRow(null);
                }}
                className="bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-805 font-medium"
              >
                <option value="all">All Health Profiles</option>
                <option value="Healthy">HEALTHY only (OK)</option>
                <option value="Warning">WARNING status (Issue)</option>
                <option value="Critical">CRITICAL alarms</option>
                <option value="Unavailable / Offline">UNAVAILABLE / Offline</option>
                <option value="Active / Tripped">ACTIVE / Tripped</option>
                <option value="State Unknown">State Unknown (NULL)</option>
              </select>
            </div>

            {/* 5. Clear Button */}
            <div className="flex items-end">
              <button
                onClick={handleClearFilters}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded py-1.5 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <X size={13} />
                Clear Filters
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 select-none pointer-events-none">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Search and isolate by displayName, CS/ES identifier, raw entityKey, subType label description (e.g. 'Array 6', 'Hydrogen', '10707')..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedRow(null);
              }}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-slate-950 focus:border-slate-950 shadow-2xs"
            />
          </div>

          {/* Active Filter Pill Identifiers */}
          {(selectedArray !== "all" || selectedSegment !== "all" || selectedFamily !== "all" || selectedHealth !== "all" || searchQuery) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
              <span className="text-slate-450 uppercase font-bold">Active Rules:</span>
              {selectedArray !== "all" && (
                <span className="bg-slate-105 text-slate-800 border border-slate-200 px-2 py-0.5 rounded flex items-center gap-1">
                  Array {selectedArray} <X size={10} className="cursor-pointer" onClick={() => setSelectedArray("all")} />
                </span>
              )}
              {selectedSegment !== "all" && (
                <span className="bg-indigo-50 text-indigo-800 border border-indigo-150 px-2 py-0.5 rounded flex items-center gap-1">
                  Segment: {selectedSegment} <X size={10} className="cursor-pointer" onClick={() => setSelectedSegment("all")} />
                </span>
              )}
              {selectedFamily !== "all" && (
                <span className="bg-purple-50 text-purple-800 border border-purple-150 px-2 py-0.5 rounded flex items-center gap-1">
                  Family: {selectedFamily} <X size={10} className="cursor-pointer" onClick={() => setSelectedFamily("all")} />
                </span>
              )}
              {selectedHealth !== "all" && (
                <span className="bg-amber-50 text-amber-800 border border-amber-150 px-2 py-0.5 rounded flex items-center gap-1">
                  Health: {selectedHealth} <X size={10} className="cursor-pointer" onClick={() => setSelectedHealth("all")} />
                </span>
              )}
              {searchQuery && (
                <span className="bg-blue-50 text-blue-800 border border-blue-150 px-2 py-0.5 rounded flex items-center gap-1">
                  Search: "{searchQuery}" <X size={10} className="cursor-pointer" onClick={() => setSearchQuery("")} />
                </span>
              )}
            </div>
          )}

          {/* Site Profile Capability Filter & Source Telemetry Toggles */}
          <div className="border-t border-slate-100 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider flex items-center gap-1 font-mono">
                <Shield size={11} className="text-indigo-600" /> Site Profile Capability Resolver
              </label>
              <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200 w-fit">
                <button
                  type="button"
                  id="toggle-expected-only"
                  onClick={() => setCapabilityFilter("expected")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    capabilityFilter === "expected"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  Expected Only
                </button>
                <button
                  type="button"
                  id="toggle-include-optional"
                  onClick={() => setCapabilityFilter("optional")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    capabilityFilter === "optional"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  Include Optional
                </button>
                <button
                  type="button"
                  id="toggle-show-unsupported"
                  onClick={() => setCapabilityFilter("all")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    capabilityFilter === "all"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                  }`}
                >
                  Show Unsupported
                </button>
              </div>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider font-mono">Source Diagnostic Logs</label>
              <button
                type="button"
                id="toggle-source-debug"
                onClick={() => setShowSourceDebug(!showSourceDebug)}
                className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-semibold transition-all ${
                  showSourceDebug
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-extrabold shadow-2xs"
                    : "bg-white hover:bg-slate-50 border-slate-200 text-slate-650"
                }`}
              >
                <Info size={13} />
                {showSourceDebug ? "Source Debug: ACTIVE" : "Show Source Debug"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4 — Physical Enclosure Matrix Summary (The Core Table) */}
      {data && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs flex flex-col">
          <div className="bg-slate-50 border-b border-slate-200 py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono flex items-center gap-1.5">
                <Layers size={14} /> Physical Enclosure Matrix Summary
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Click any row below to drill down and inspect localized BESS module points in Section 6.
              </p>
            </div>
            <div className="text-[10px] font-mono text-slate-500 bg-white border border-slate-150 rounded px-2.5 py-1">
              Active Rows Count: <strong className="text-slate-900">{filteredRows.length}</strong> / {physicalRows.length} rows displayed
            </div>
          </div>

          <div className="overflow-y-auto max-h-[500px] w-full relative">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 select-none shadow-3xs">
                <tr className="text-slate-500 font-mono text-[9px] font-bold uppercase tracking-wider">
                  <th className="py-2 px-4 font-semibold">Location</th>
                  <th className="py-2 px-3 font-semibold text-center w-14">Type</th>
                  <th className="py-2 px-3 font-semibold text-center w-20">Severity</th>
                  <th className="py-2 px-3 font-semibold text-center w-24">Status</th>
                  <th className="py-2 px-2 font-semibold text-center">Comms/IO</th>
                  <th className="py-2 px-2 font-semibold text-center">Doors</th>
                  <th className="py-2 px-2 font-semibold text-center">Smoke</th>
                  <th className="py-2 px-2 font-semibold text-center">Heat</th>
                  <th className="py-2 px-2 font-semibold text-center">Moisture</th>
                  <th className="py-2 px-2 font-semibold text-center">Hydrogen</th>
                  <th className="py-2 px-2 font-semibold text-center">Fire</th>
                  <th className="py-2 px-2 font-semibold text-center">UPS/USV</th>
                  <th className="py-2 px-4 font-semibold">Sensor Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-slate-400 font-sans">
                      No matching physical enclosure segments found. Clear filters above.
                    </td>
                  </tr>
                ) : (
                  (() => {
                    let lastArrayNum = -1;
                    return filteredRows.map((row) => {
                      const currentArrayNum = getArrayNumber(row.location?.displayName || "");
                      const renderArrayDivider = lastArrayNum !== currentArrayNum;
                      lastArrayNum = currentArrayNum;

                      const isCS = row.location?.enclosureType === "CollectionSegment";
                      const locationLabel = formatRowLocationName(row);

                      // Group doors cell info (Surgical door logic per requirement)
                      const acTripped = row.doorSensors.acDoors?.tripped === true;
                      const dcTripped = row.doorSensors.dcDoors?.tripped === true;
                      const capTripped = row.doorSensors.topCapDoors?.tripped === true;
                      const batTripped = row.doorSensors.batteryDoors?.tripped === true;
                      const doorCellAggregate: NormalizedSensorCell = {
                        applicable:
                          row.doorSensors.acDoors?.applicable ||
                          row.doorSensors.dcDoors?.applicable ||
                          row.doorSensors.topCapDoors?.applicable ||
                          row.doorSensors.batteryDoors?.applicable,
                        healthy:
                          row.doorSensors.acDoors?.healthy &&
                          row.doorSensors.dcDoors?.healthy &&
                          row.doorSensors.topCapDoors?.healthy &&
                          row.doorSensors.batteryDoors?.healthy,
                        tripped: acTripped || dcTripped || capTripped || batTripped,
                        status: acTripped ? "AC Door Open" : dcTripped ? "DC Door Open" : "Doors Closed",
                        displayValue: acTripped || dcTripped ? "Open" : "Closed",
                        value: null,
                        sensorRole: "doors"
                      };

                      // Map health status text
                      let healthDisplay = (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-250 leading-none">
                          HEALTHY
                        </span>
                      );
                      if (row.severity === "Critical") {
                        healthDisplay = (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-250 leading-none animate-pulse">
                            CRITICAL
                          </span>
                        );
                      } else if (row.severity === "Warning") {
                        healthDisplay = (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-250 leading-none">
                            WARNING
                          </span>
                        );
                      }

                      const isRowSelected = selectedRow?.id === row.id;

                      return (
                        <React.Fragment key={row.id}>
                          {/* Array grouping separator (Section 4 Divider) */}
                          {renderArrayDivider && currentArrayNum !== 999 && (
                            <tr className="bg-slate-100/70 border-y border-slate-200 font-sans select-none">
                              <td colSpan={13} className="py-1 px-4 text-[10px] font-extrabold text-slate-650 tracking-wider">
                                ARRAY {currentArrayNum} ENCLOSURE STRING MODULES
                              </td>
                            </tr>
                          )}

                          <tr
                            onClick={() => {
                              setSelectedRow(isRowSelected ? null : row);
                            }}
                            className={`cursor-pointer transition-colors font-mono font-medium text-[11px] text-slate-705 ${
                              isRowSelected ? "bg-indigo-50/50 hover:bg-indigo-50" : "hover:bg-slate-50/75"
                            }`}
                          >
                            <td className="py-1.5 px-4 font-bold text-slate-950 font-sans text-xs">
                              {locationLabel}
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              <span className={`px-1 rounded text-[9px] font-extrabold ${isCS ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : "bg-teal-50 text-teal-700 border border-teal-200"}`}>
                                {isCS ? "CS" : "ES"}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 text-center text-[10px] font-bold">
                              <span className={`px-1 rounded ${row.severity === "Critical" ? "text-red-700 font-black animate-pulse" : row.severity === "Warning" ? "text-amber-500 font-extrabold" : "text-emerald-700"}`}>
                                {row.severity}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 text-center">{healthDisplay}</td>

                            {/* Cell column highlights if its family filter is active */}
                            <td className={`py-1.5 px-2 text-center select-none ${selectedFamily === "Communications / IO" ? "bg-indigo-50/45 border-x border-indigo-100" : ""}`}>
                              <div className="flex items-center justify-center gap-1">
                                {renderCellIndicator(row.comStatus.dataCommunications, selectedFamily === "Communications / IO")}
                                {renderCellIndicator(row.comStatus.io, selectedFamily === "Communications / IO")}
                              </div>
                            </td>

                            <td className={`py-1.5 px-2 text-center select-none ${selectedFamily === "Doors" ? "bg-indigo-50/45 border-x border-indigo-100" : ""}`}>
                              {renderCellIndicator(doorCellAggregate, selectedFamily === "Doors")}
                            </td>

                            <td className={`py-1.5 px-2 text-center select-none ${selectedFamily === "Smoke" ? "bg-indigo-50/45 border-x border-indigo-100" : ""}`}>
                              {renderCellIndicator(row.otherSensors.smoke, selectedFamily === "Smoke")}
                            </td>

                            <td className={`py-1.5 px-2 text-center select-none ${selectedFamily === "Heat" ? "bg-indigo-50/45 border-x border-indigo-100" : ""}`}>
                              {renderCellIndicator(row.otherSensors.heat, selectedFamily === "Heat")}
                            </td>

                            <td className={`py-1.5 px-2 text-center select-none ${selectedFamily === "Moisture" ? "bg-indigo-50/45 border-x border-indigo-100" : ""}`}>
                              {renderCellIndicator(row.emergencySensors.moisture, selectedFamily === "Moisture")}
                            </td>

                            <td className={`py-1.5 px-2 text-center select-none ${selectedFamily === "Hydrogen" ? "bg-indigo-50/45 border-x border-indigo-100" : ""}`}>
                              <div className="flex items-center justify-center gap-1">
                                {renderCellIndicator(row.otherSensors.hydrogen, selectedFamily === "Hydrogen")}
                                {renderCellIndicator(row.otherSensors.hydrogenFault, selectedFamily === "Hydrogen")}
                              </div>
                            </td>

                            <td className={`py-1.5 px-2 text-center select-none ${selectedFamily === "Fire" ? "bg-indigo-50/45 border-x border-indigo-100" : ""}`}>
                              {renderCellIndicator(row.otherSensors.fire, selectedFamily === "Fire")}
                            </td>

                            <td className={`py-1.5 px-2 text-center select-none ${selectedFamily === "UPS / E-stop" ? "bg-indigo-50/45 border-x border-indigo-100" : ""}`}>
                              {isCS ? (
                                renderCellIndicator(row.otherSensors.upsAlarm, selectedFamily === "UPS / E-stop")
                              ) : (
                                <span className="text-slate-300 font-normal select-none">-</span>
                              )}
                            </td>

                            {/* Remarks */}
                            <td className="py-1.5 px-4 font-sans text-slate-500 text-[11px]">
                              {row.findings && row.findings.length > 0 ? (
                                <div className="space-y-0.5 text-red-650 text-[10px] font-bold leading-none font-sans">
                                  {row.findings.map((f, i) => (
                                    <div key={i} className="flex items-center gap-1">
                                      <span className="h-1 w-1 bg-red-400 rounded-full flex-shrink-0" />
                                      <span className="truncate max-w-[190px]" title={f}>{f}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[10px]">No abnormal diagnostics</span>
                              )}
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    });
                  })()
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 6 — Drilldown / Detail Panel */}
      <AnimatePresence>
        {(selectedRow || selectedPoint) && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-4"
            id="drilldown-inspektor-details"
          >
            {/* 6.a Enclosure Detail Block */}
            {selectedRow && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-slate-200">
                      Schematic Drilldown Enclosure details
                    </h3>
                    <p className="text-xs font-bold font-sans text-indigo-400 mt-1">
                      {formatRowLocationName(selectedRow)} ({selectedRow.location.enclosureType})
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedRow(null)}
                    className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* Metadata Stats */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-150 p-2.5 rounded-lg text-xs">
                    <div>
                      <span className="text-slate-450 uppercase text-[9px] font-bold block">Internal Lineup</span>
                      <strong className="text-slate-800 font-mono">
                        Lineup {selectedRow.location.lineupId ?? 1} Index {selectedRow.location.lineupIndex ?? "-"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-450 uppercase text-[9px] font-bold block">Site Linkage Status</span>
                      <strong className={`font-mono inline-flex items-center gap-1 ${selectedRow.location.siteConnected ? "text-emerald-700" : "text-red-750"}`}>
                        {selectedRow.location.siteConnected ? "CONNECTED" : "OFFLINE"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-450 uppercase text-[9px] font-bold block">Modbus Communicating</span>
                      <strong className={`font-mono inline-flex items-center gap-1 ${selectedRow.location.segmentCommunicating ? "text-emerald-700" : "text-amber-700"}`}>
                        {selectedRow.location.segmentCommunicating ? "ONLINE" : "TIMEOUT FAULT"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-450 uppercase text-[9px] font-bold block">Severity Status</span>
                      <strong className="font-mono text-slate-900">{selectedRow.severity}</strong>
                    </div>
                  </div>

                  {/* Findings */}
                  <div>
                    <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5 flex items-center gap-1">
                      <AlertTriangle size={11} className="text-amber-500" /> Active System Findings
                    </h4>
                    {selectedRow.findings && selectedRow.findings.length > 0 ? (
                      <div className="bg-red-50/70 border border-red-200 rounded p-2.5 space-y-1">
                        {selectedRow.findings.map((f, i) => (
                          <div key={i} className="text-red-700 text-xs font-mono flex items-start gap-1">
                            <span className="text-red-500 font-bold">●</span>
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-emerald-50/35 border border-emerald-100 rounded p-2.5 text-emerald-805 text-xs font-medium font-sans">
                        No telemetry alerts or abnormal variables caught on this segment lineup. All points healthy.
                      </div>
                    )}
                  </div>

                  {/* Points Associated list grouped by family (Section 6 Requirement) */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] uppercase font-bold text-slate-700 tracking-wider flex items-center gap-1">
                      <Database size={11} /> Locals telemetry point array mapping
                    </h4>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {Object.keys(pointsInSelectedRowGrouped).length === 0 ? (
                        <p className="text-xs text-slate-400 font-sans">No child points mapped to indices.</p>
                      ) : (
                        (Object.entries(pointsInSelectedRowGrouped) as [string, TopologySensorPoint[]][]).map(([family, pointList]) => (
                          <div key={family} className="border border-slate-150 rounded-lg overflow-hidden bg-slate-50/30 font-sans">
                            <div className="bg-slate-100 border-b border-slate-200 p-1.5 px-2.5 text-[10px] font-bold uppercase text-slate-700 font-mono">
                              {family} ({pointList.length} Point{pointList.length !== 1 ? "s" : ""})
                            </div>
                            <div className="p-1.5 space-y-1">
                              {pointList.map((point) => (
                                <div
                                  key={point.entityKey}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPoint(point);
                                  }}
                                  className={`p-1.5 rounded text-xs flex items-center justify-between font-mono cursor-pointer transition-all ${
                                    selectedPoint?.entityKey === point.entityKey ? "bg-indigo-100 border border-indigo-200" : "hover:bg-white border border-transparent"
                                  }`}
                                >
                                  <div className="flex-1 truncate pr-2">
                                    <span className="font-sans font-bold text-slate-900 block truncate text-[11px]">{point.pointLabel}</span>
                                    <span className="text-[9px] text-slate-400 select-all font-mono">{point.entityKey}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-right flex-shrink-0 text-[10px] font-bold ml-2">
                                    <span className={`px-1.5 py-0.2 rounded ${point.pointAvailable ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                                      {point.pointAvailable ? "ON" : "OFF"}
                                    </span>
                                    <span className={`px-1.5 py-0.2 rounded ${point.activeState ? "bg-red-100 text-red-750 animate-pulse" : "bg-slate-100 text-slate-500"}`}>
                                      {point.activeState ? "TRIP" : "OK"}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 6.b Telemetry Point Detail Block */}
            {selectedPoint && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-slate-800 text-white p-3.5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-slate-300">
                      Schematic Telemetry Point inspect
                    </h3>
                    <p className="text-xs font-bold font-sans text-amber-400 mt-1 truncate max-w-[280px]" title={selectedPoint.pointLabel}>
                      {selectedPoint.pointLabel}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedPoint(null)}
                    className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 id-close rounded transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="p-4 space-y-3.5 max-h-[500px] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="space-y-0.5 border-b border-slate-100 pb-1.5 col-span-2">
                      <span className="text-slate-400 text-[9px] block">ENTITY KEY</span>
                      <strong className="text-slate-900 select-all font-bold text-[11px] block break-all">{selectedPoint.entityKey}</strong>
                    </div>
                    <div className="space-y-0.5 border-b border-slate-100 pb-1.5">
                      <span className="text-slate-400 text-[9px] block">DISPLAY NAME</span>
                      <strong className="text-slate-900">{selectedPoint.displayName}</strong>
                    </div>
                    <div className="space-y-0.5 border-b border-slate-100 pb-1.5">
                      <span className="text-slate-400 text-[9px] block">POINT ROLE</span>
                      <strong className="text-indigo-700 uppercase font-black">{selectedPoint.pointRole}</strong>
                    </div>
                    <div className="space-y-0.5 border-b border-slate-100 pb-1.5">
                      <span className="text-slate-400 text-[9px] block">SEVERITY LEVEL</span>
                      <strong className={`font-extrabold uppercase ${selectedPoint.severity === "Critical" ? "text-red-700 animate-pulse" : selectedPoint.severity === "Warning" ? "text-amber-500" : "text-emerald-700"}`}>
                        {selectedPoint.severity}
                      </strong>
                    </div>
                    <div className="space-y-0.5 border-b border-slate-100 pb-1.5">
                      <span className="text-slate-400 text-[9px] block font-sans">Enclosure Index</span>
                      <strong className="text-slate-800 font-sans">Unit Cabinet #{selectedPoint.enclosureIndex ?? "-"}</strong>
                    </div>
                    <div className="space-y-0.5 border-b border-slate-100 pb-1.5">
                      <span className="text-slate-400 text-[9px] block">Segment Category</span>
                      <strong className="text-slate-800">{selectedPoint.segmentKind} Num: {selectedPoint.segmentNumber ?? "-"}</strong>
                    </div>
                    <div className="space-y-0.5 border-b border-slate-100 pb-1.5">
                      <span className="text-slate-400 text-[9px] block">Numeric ID Code</span>
                      <strong className="text-slate-800">{selectedPoint.numericId ?? "N/A"}</strong>
                    </div>
                    <div className="space-y-0.5 border-b border-slate-100 pb-1.5">
                      <span className="text-slate-400 text-[9px] block">Sensor Binary Code</span>
                      <strong className="text-slate-800">{selectedPoint.sensorCode ?? "N/A"}</strong>
                    </div>
                    <div className="space-y-0.5 border-b border-slate-100 pb-1.5">
                      <span className="text-slate-400 text-[9px] block">Array Index Number</span>
                      <strong className="text-slate-800 font-sans">Array {selectedPoint.arrayIndex ?? "N/A"}</strong>
                    </div>
                    <div className="space-y-0.5 border-b border-slate-100 pb-1.5">
                      <span className="text-slate-400 text-[9px] block">Telemetry Entity Type</span>
                      <strong className="text-slate-600">{selectedPoint.entityType}</strong>
                    </div>
                    <div className="space-y-0.5 border-b border-slate-100 pb-1.5 col-span-2">
                      <span className="text-slate-400 text-[9px] block font-sans">Active Alarm Status Message</span>
                      <p className="text-[11px] text-slate-800 mt-0.5 bg-slate-50 border p-2 rounded font-sans leading-tight">
                        {selectedPoint.statusMessage || "Operating value indicates no abnormal system status logs."}
                      </p>
                    </div>
                    <div className="space-y-0.5 border-b border-slate-100 pb-1.5">
                      <span className="text-slate-400 text-[9px] block">Com Available</span>
                      <strong className={`font-bold ${selectedPoint.pointAvailable ? "text-emerald-700" : "text-red-750"}`}>
                        {selectedPoint.pointAvailable ? "YES" : "OFFLINE / TIMEOUT"}
                      </strong>
                    </div>
                    <div className="space-y-0.5 border-b border-slate-100 pb-1.5">
                      <span className="text-slate-400 text-[9px] block font-sans">Active Tripped State</span>
                      <strong className={`font-extrabold ${selectedPoint.activeState === true ? "text-red-700 uppercase animate-pulse font-mono text-[10px]" : selectedPoint.activeState === false ? "text-emerald-705 font-mono text-[10px]" : "text-slate-400"}`}>
                        {selectedPoint.activeState === true ? "ALARM / TRIPPED" : selectedPoint.activeState === false ? "CLEAR" : "STATE NULL"}
                      </strong>
                    </div>
                  </div>

                  {/* Behind raw expandable disclosure block (Section 6 Requirement) */}
                  <div className="border border-slate-150 rounded overflow-hidden">
                    <details className="group">
                      <summary className="bg-slate-50/75 p-2 px-3 text-[10px] font-bold text-slate-600 cursor-pointer select-none hover:bg-slate-100 flex items-center justify-between font-sans">
                        <span>Show raw structural diagnostics variables</span>
                        <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                      </summary>
                      <div className="p-2 border-t border-slate-150 bg-slate-50/20 text-[9px] font-mono leading-tight">
                        <ul className="space-y-1 text-slate-600">
                          <li>Source Endpoint: <span className="text-slate-850 select-all">{selectedPoint.sourceEndpoint}</span></li>
                          <li>Source Path: <span className="text-slate-850">{selectedPoint.sourcePath}</span></li>
                          <li>Active State Source: <span className="text-indigo-805">{selectedPoint.activeStateSource || "N/A"}</span></li>
                          <li>Value Field Used: <span className="text-slate-500">{selectedPoint.valueFieldUsed || "N/A"}</span></li>
                          <li>Raw parsed value: <span className="text-slate-900 select-all font-bold">{JSON.stringify(selectedPoint.rawValue ?? null)}</span></li>
                          <li>Allow fault override reset: <span className="text-blue-700 font-bold">{selectedPoint.allowFaultReset === true ? "TRUE" : "FALSE"}</span></li>
                          <li>Is Diagnostic Healthy: <span className={selectedPoint.pointHealthy ? "text-emerald-750 font-bold" : "text-red-750 font-bold"}>{selectedPoint.pointHealthy ? "YES" : "NO"}</span></li>
                        </ul>
                        <div className="mt-2 bg-slate-100 p-2 rounded">
                          <code className="text-slate-800 block break-all whitespace-pre-wrap text-[8px]">
                            {JSON.stringify(selectedPoint.raw, null, 2)}
                          </code>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* SECTION 5 — Full Site Telemetry Point Browser Section */}
      {data && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="bg-slate-50 border-b border-slate-200 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
              <div>
                <h3 className="text-xs font-bold text-slate-850 uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <Sliders size={14} /> Full Site Telemetry Point Browser
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5 font-sans">
                  Full list of {data.points.length} telemetry indicators. Click a point to inspect diagnostics.
                </p>
              </div>
              
              <div className="text-[10px] uppercase font-mono text-slate-600 bg-white border border-slate-200/80 p-2.5 rounded shadow-2xs">
                Matched Count: <strong className="text-slate-900">{filteredPoints.length}</strong> points matching rules
              </div>
            </div>

            {/* Active family category selection chips (Section 5 dynamic labels) */}
            <div className="flex flex-wrap gap-1.5 mb-3.5 border-b border-slate-100 pb-3">
              {[
                { type: "all", label: "All Families", count: pointCountsByFamily.all },
                { type: "Communications / IO", label: "Communications / IO", count: pointCountsByFamily["Communications / IO"] },
                { type: "Doors", label: "Doors State", count: pointCountsByFamily.Doors },
                { type: "Smoke", label: "Smoke Detector", count: pointCountsByFamily.Smoke },
                { type: "Heat", label: "Thermal Heat", count: pointCountsByFamily.Heat },
                { type: "Hydrogen", label: "Hydrogen Detector", count: pointCountsByFamily.Hydrogen },
                { type: "Fire", label: "Fire Trigger", count: pointCountsByFamily.Fire },
                { type: "Moisture", label: "Moisture Sensor", count: pointCountsByFamily.Moisture },
                { type: "UPS / E-stop", label: "UPS / E-stop Relay", count: pointCountsByFamily["UPS / E-stop"] },
                { type: "Environment", label: "HVAC Environment", count: pointCountsByFamily.Environment },
                { type: "Global", label: "Global Level", count: pointCountsByFamily.Global }
              ].map((btn) => (
                <button
                  key={btn.type}
                  onClick={() => {
                    setSelectedFamily(btn.type);
                    setPointLimit(250); // reset page
                  }}
                  className={`px-2.5 py-1 text-[10px] sm:text-xs font-bold font-sans rounded-md border transition-all flex items-center gap-1.5 ${
                    selectedFamily === btn.type
                      ? "bg-slate-900 border-slate-900 text-white shadow-xs"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>{btn.label}</span>
                  <span className={`px-1 py-0.2 text-[9px] font-mono leading-none rounded-lg font-bold ${selectedFamily === btn.type ? "bg-slate-800 text-slate-200" : "bg-slate-105 text-slate-600"}`}>
                    {btn.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Dropdown controls work combined together with search context */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
              <div className="flex flex-col space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-slate-450 font-sans">Dropdown Array</span>
                <select
                  value={selectedArray}
                  onChange={(e) => setSelectedArray(e.target.value)}
                  className="bg-white border border-slate-200 rounded px-2 py-1 text-xs select-none"
                >
                  <option value="all">All Arrays</option>
                  {dynamicArrays.map((num) => (
                    <option key={num} value={num.toString()}>
                      Array {num}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-slate-450 font-sans">Segment Type</span>
                <select
                  value={selectedSegment}
                  onChange={(e) => setSelectedSegment(e.target.value as any)}
                  className="bg-white border border-slate-200 rounded px-2 py-1 text-xs select-none"
                >
                  <option value="all">All Segments</option>
                  <option value="CS">Collection (CS)</option>
                  <option value="ES">Energy (ES)</option>
                </select>
              </div>

              <div className="flex flex-col space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-slate-450 font-sans">Sensor Family Link</span>
                <select
                  value={selectedFamily}
                  onChange={(e) => setSelectedFamily(e.target.value)}
                  className="bg-white border border-slate-200 rounded px-2 py-1 text-xs select-none"
                >
                  <option value="all">All Families</option>
                  <option value="Communications / IO">Communications / IO</option>
                  <option value="Doors">Doors</option>
                  <option value="Smoke">Smoke</option>
                  <option value="Heat">Heat</option>
                  <option value="Hydrogen">Hydrogen</option>
                  <option value="Fire">Fire</option>
                  <option value="Moisture">Moisture</option>
                  <option value="UPS / E-stop">UPS / E-stop</option>
                  <option value="Environment">Environment</option>
                  <option value="Global">Global</option>
                </select>
              </div>

              <div className="flex flex-col space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-slate-450 font-sans">Active Severity</span>
                <select
                  value={selectedHealth}
                  onChange={(e) => setSelectedHealth(e.target.value)}
                  className="bg-white border border-slate-200 rounded px-2 py-1 text-xs select-none"
                >
                  <option value="all">All Severities</option>
                  <option value="Healthy">OK</option>
                  <option value="Warning">Warning</option>
                  <option value="Critical">Critical</option>
                  <option value="Unavailable / Offline">Offline</option>
                  <option value="Active / Tripped">Tripped</option>
                  <option value="State Unknown">Unknown</option>
                </select>
              </div>

              <div className="flex items-end col-span-2 md:col-span-1">
                <button
                  onClick={handleClearFilters}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-800 rounded px-2 py-1 text-xs font-semibold select-none flex items-center justify-center gap-1 cursor-pointer"
                >
                  Clear Browser
                </button>
              </div>
            </div>
          </div>

          {/* Points Table */}
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-450 font-mono text-[9px] font-bold uppercase tracking-wider select-none">
                  <th className="py-2 px-4 font-semibold">Location</th>
                  <th className="py-2 px-2 text-center w-16">Array</th>
                  <th className="py-2 px-2 text-center w-20">Segment</th>
                  <th className="py-2 px-3 font-semibold w-32">Point Category / Role</th>
                  <th className="py-2 px-3 font-semibold">Label Description</th>
                  <th className="py-2 px-3 w-28">Entity Type</th>
                  <th className="py-2 px-2 w-24">SubType</th>
                  <th className="py-2 px-3 text-center w-28">Comm Status</th>
                  <th className="py-2 px-3 text-center w-24">Active State</th>
                  <th className="py-2 px-3 text-center w-20">Severity</th>
                  <th className="py-2 px-4 font-semibold">Entity Key</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[10px] text-slate-705">
                {filteredPoints.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400 font-sans">
                      No matching topology telemetry points found matching isocratic filters.
                    </td>
                  </tr>
                ) : (
                  filteredPoints.slice(0, pointLimit).map((point) => {
                    const isRowPointSelected = selectedPoint?.entityKey === point.entityKey;
                    const keyFormatted = formatEntityKey(point.entityKey);

                    // Formats per Section 5 guidelines
                    const activeStateStr = formatActiveState(point.activeState);
                    const availabilityStr = formatAvailability(point);

                    return (
                      <tr
                        key={point.entityKey}
                        onClick={() => setSelectedPoint(isRowPointSelected ? null : point)}
                        className={`cursor-pointer transition-colors ${
                          isRowPointSelected ? "bg-indigo-50/50 hover:bg-slate-50/50" : "hover:bg-slate-50/50"
                        }`}
                      >
                        <td className="py-2 px-4 font-sans font-bold text-slate-905">
                          {point.displayName}
                        </td>
                        <td className="py-2 px-2 text-center text-slate-800 font-bold">
                          {point.arrayIndex ?? "-"}
                        </td>
                        <td className="py-2 px-2 text-center font-bold">
                          <span className={`px-1 py-0.2 rounded text-[8px] font-extrabold ${point.segmentKind === "CS" ? "bg-indigo-50 text-indigo-700" : point.segmentKind === "ES" ? "bg-teal-50 text-teal-700" : "bg-purple-100 text-purple-700"}`}>
                            {point.segmentKind}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-800">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-slate-100 border border-slate-205 font-mono">
                            {point.pointRole}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-xs font-sans text-slate-650 font-medium">
                          {point.pointLabel}
                        </td>
                        <td className="py-2 px-2 text-slate-500 truncate max-w-[120px]" title={point.entityType}>
                          {selectedFamily === "Environment" && point.entityType === "humidityTemperatureSensor" ? (
                            <span className="text-blue-700 font-bold">{point.entityType}</span>
                          ) : (
                            point.entityType
                          )}
                        </td>
                        <td className="py-2 px-2 text-slate-400">
                          {point.entitySubType || "-"}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${point.pointAvailable ? "bg-emerald-50 text-emerald-700 border border-emerald-250" : "bg-red-50 text-red-750 border border-red-200"}`}>
                            {availabilityStr}
                          </span>
                        </td>
                        <td className="py-1 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold border ${
                            activeStateStr === "ACTIVE" ? "bg-red-100 text-red-750 border-red-300 animate-pulse" :
                            activeStateStr === "CLEAR" ? "bg-emerald-50 text-emerald-755 border-emerald-200" :
                            "bg-slate-50 text-slate-450 border-slate-200"
                          }`}>
                            {activeStateStr}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center select-none">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            point.severity === "Critical" ? "bg-red-500 text-white animate-pulse" :
                            point.severity === "Warning" ? "bg-amber-100 text-amber-900 border border-amber-300" :
                            "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          }`}>
                            {point.severity}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-slate-400 select-all" title={point.entityKey}>
                          {keyFormatted}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredPoints.length > pointLimit && (
            <div className="bg-slate-50 border-t border-slate-200/60 p-3.5 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-505 gap-3 font-sans">
              <span>
                Showing first <strong>{pointLimit}</strong> of <strong>{filteredPoints.length}</strong> loaded elements. Use status filters above to focus context.
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPointLimit(prev => prev + 250)}
                  className="px-3.5 py-1.5 bg-white border border-slate-250 hover:bg-slate-50 rounded text-slate-700 font-bold shadow-2xs text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={12} /> Load More (+250)
                </button>
                <button
                  onClick={() => setPointLimit(filteredPoints.length + 10)}
                  className="px-3.5 py-1.5 bg-slate-900 text-white hover:bg-slate-800 rounded font-bold shadow-2xs text-[11px] cursor-pointer"
                >
                  Unlimit Array View
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 7 — Collapsible Debug Strip */}
      {data && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="w-full bg-slate-50/50 py-3 px-4 flex items-center justify-between text-left text-xs font-bold text-slate-600 uppercase tracking-widest font-mono hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Cpu size={14} /> Pipeline Debug Telemetry logs
            </div>
            {showDebug ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          <AnimatePresence>
            {showDebug && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-slate-200 p-4 space-y-4 font-mono text-[10px] text-slate-600 bg-slate-50/10"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans">
                  <div>
                    <h5 className="font-bold text-slate-800 uppercase tracking-wide text-[9px] mb-1 font-mono">Parser Integrity</h5>
                    <ul className="space-y-1 bg-white border border-slate-150 rounded-lg p-3 shadow-3xs font-mono">
                      <li>Parse Failures: <strong className={data.debug?.numericIdParseFailedCount ? "text-red-600" : "text-emerald-700"}>{data.debug?.numericIdParseFailedCount || 0}</strong></li>
                      <li>Global Points Detected: <strong className="text-indigo-600">{data.debug?.globalPointCount || 0}</strong></li>
                      <li>Discovered Boolean Fields: <span className="text-slate-500 block mt-1 overflow-x-auto max-w-full truncate">{JSON.stringify(data.debug?.booleanStateFieldsDiscovered || [])}</span></li>
                    </ul>
                  </div>

                  <div className="md:col-span-2">
                    <h5 className="font-bold text-slate-800 uppercase tracking-wide text-[9px] mb-1 font-mono">Warnings & Assertions</h5>
                    <div className="bg-white border border-slate-150 rounded-lg p-3 max-h-[140px] overflow-y-auto shadow-3xs font-mono text-[10px]">
                      {data.debug?.parserWarnings && (data.debug.parserWarnings as string[]).length > 0 ? (
                        <ul className="space-y-1 list-disc list-inside text-amber-705">
                          {(data.debug.parserWarnings as string[]).map((w: string, i: number) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-400">All entity ID extractions matched clean schema definitions.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="font-bold text-slate-808 uppercase tracking-wide text-[9px] mb-1 font-mono">Sample Parsed Global Entries</h5>
                  <pre className="bg-white border border-slate-150 rounded-lg p-3 overflow-x-auto max-h-[160px] text-[9px] text-slate-700 shadow-3xs">
                    {JSON.stringify(data.debug?.sampleGlobalPoints || [], null, 2)}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
