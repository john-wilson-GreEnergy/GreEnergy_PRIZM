import React, { useState, useEffect, useMemo } from "react";
import { 
  Layers, 
  Search, 
  Activity, 
  Info, 
  ShieldAlert, 
  Wrench, 
  RefreshCw, 
  SlidersHorizontal, 
  AlertTriangle, 
  CheckCircle2, 
  Trash2, 
  Wifi, 
  X, 
  Flame, 
  Droplet,
  ShieldCheck,
  Minimize2,
  ListFilter
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SensorDetail {
  applicable: boolean;
  healthy: boolean;
  tripped: boolean;
  latched: boolean;
  value: number | null;
  status: string;
  displayValue: string;
  label: string;
  friendlyName: string;
  sensorRole: string;
  sensorIndex?: number;
  openClosedDetectorType?: string;
  sensorTypeCode?: number;
  detectorIndex?: number;
  entityKey?: any;
  entitySubType?: string;
  entityType?: string;
  statusMessage?: string;
  communicating?: boolean;
  enabled?: boolean;
  ready?: boolean;
  timestamp?: number;
  unhealthyReasons?: string[];
  estopActive?: boolean | null;
  estopCountdown?: number | null;
  allowFaultReset?: boolean;
  sourcePath?: string;
  debug?: {
    expectedEnclosureIndex?: number;
    parsedEnclosureIndex?: number;
    sensorIndexParentMismatch?: boolean;
    derivedFrom?: string;
  };
  raw?: any;
}

interface BlockLocation {
  arrayIndex: number;
  arrayLabel: string;
  segmentKind: "CS" | "BS" | "ES";
  segmentNumber: number | null;
  segmentLabel: string;
  displayName: string;
  sortKey: string;
  locationDerivedFromFallback: boolean;
  rawLineupId: number;
  rawLineupIndex: number;
  rawSegmentIndex: number;
  rawEnclosureIndex: number;
  rawSegmentPosition: number | null;
  rawGroupIndex: number;
  strings: Array<{ arrayIndex: number; stringIndex: number }>;
}

interface BlockRow {
  location: BlockLocation;
  emergencySensors: {
    moisture?: SensorDetail;
    smoke?: SensorDetail;
    estop?: SensorDetail;
  };
}

export default function SiteSensorsMatrix() {
  const [rows, setRows] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState<number>(0);
  const [sourceUsed, setSourceUsed] = useState<string>("unknown");
  
  // UI states
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "tripped" | "normal" | "issues">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedRow, setSelectedRow] = useState<BlockRow | null>(null);
  
  // Overrides operation states
  const [overridingSensor, setOverridingSensor] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [operationalLog, setOperationalLog] = useState<string[]>([]);

  // Fetch blockviewer telemetry from backend
  const fetchBlockviewerData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/local/site-sensors/blockviewer");
      if (!res.ok) {
        throw new Error(`HTTP status error: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.rows)) {
        setRows(data.rows);
        setSourceUsed(data.source || "blockviewer");
        setErrorMsg(null);
      } else {
        throw new Error(data.error || "Malformed response payload from site-sensors blockviewer endpoint");
      }
    } catch (err: any) {
      console.error("[SiteSensorsMatrix] Error fetching blockviewer:", err);
      setErrorMsg(err.message || "Failed to load site physical telemetry");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlockviewerData(false);
    // Setup automatic refresh loop (every 10 seconds)
    const interval = setInterval(() => {
      fetchBlockviewerData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  // Log function
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setOperationalLog(prev => [`[${time}] ${msg}`, ...prev.slice(0, 19)]);
  };

  // Inject standard override trigger
  const handleSimulateTrip = async (row: BlockRow, role: "moisture" | "smoke" | "estop", trip: boolean) => {
    const rowId = `segment-${row.location.rawLineupId}-${row.location.rawEnclosureIndex}`;
    setOverridingSensor(`${rowId}-${role}`);
    
    // In our backend, we use siteSensorsRoutes `/override` which uses `siteSensorOverrides` key.
    // Based on siteSensorsRoutes, let's map:
    // moisture -> maps to overrides.moistureTrip / overrides.moistureStatus
    // smoke -> overrides.smokeStatus ("TRIPPED" vs "NOT_TRIPPED")
    // estop -> overrides.estopStatus / overrides.isEStopActive
    // Let's call the override endpoint with correct params!
    let targetCategory = "";
    let targetValue: any = null;

    if (role === "moisture") {
      targetCategory = "moistureStatus";
      targetValue = trip ? "TRIPPED" : "NOT_TRIPPED";
    } else if (role === "smoke") {
      targetCategory = "smokeStatus";
      targetValue = trip ? "TRIPPED" : "NOT_TRIPPED";
    } else {
      targetCategory = "estopStatus";
      targetValue = trip ? "ESTOP_PRESSED" : "NOT_PRESSED";
    }

    try {
      addLog(`Simulating Override targeting ${row.location.displayName} ${role.toUpperCase()} -> ${trip ? 'TRIPPED' : 'NORMAL'}`);
      
      const payload = {
        // Since we are overriding cells under lineup/enclosure:
        id: `segment-${row.location.rawLineupId}-${row.location.rawEnclosureIndex}`,
        category: targetCategory,
        value: targetValue
      };

      const res = await fetch("/api/local/site-sensors/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        addLog(`Override successfully updated on simulation layer!`);
        // Trigger silent update immediately
        await fetchBlockviewerData(true);
        // Refresh selected panel status
        const updatedRows = await fetch("/api/local/site-sensors/blockviewer").then(r => r.json()).then(d => d.rows);
        if (updatedRows) {
          const freshRow = updatedRows.find((r: any) => r.location.sortKey === row.location.sortKey);
          if (freshRow) setSelectedRow(freshRow);
        }
      } else {
        throw new Error("Override endpoint responded with failure status");
      }
    } catch (err: any) {
      addLog(`ERR: Failed to submit override: ${err.message}`);
    } finally {
      setOverridingSensor(null);
    }
  };

  // Reset all overrides on the simulator
  const handleResetSimulator = async () => {
    setIsResetting(true);
    addLog("Sending reset request to development site sensors simulator...");
    try {
      const res = await fetch("/api/local/site-sensors/reset", { method: "POST" });
      if (res.ok) {
        addLog("Dev simulator reset to pristine baseline values! All overrides cleared.");
        await fetchBlockviewerData(false);
        setSelectedRow(null);
      } else {
        throw new Error("Reset responded with error.");
      }
    } catch (err: any) {
      addLog(`ERR: Reset failed: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  // Group rows by Array index to form the grid.
  // 168 rows total, representing indices 1..8, segments CS, BS, ES1..19.
  const arraysMap = useMemo(() => {
    const grouped: Record<number, BlockRow[]> = {};
    for (let i = 1; i <= 8; i++) {
      grouped[i] = [];
    }
    rows.forEach(r => {
      const aIdx = r.location.arrayIndex;
      if (grouped[aIdx]) {
        grouped[aIdx].push(r);
      }
    });

    // Sort each array's segments in column order: CS, BS, ES1..ES19
    const getSortOrder = (kind: string, num: number | null): number => {
      if (kind === "CS") return 0;
      if (kind === "BS") return 1;
      return 2 + (num || 0);
    };

    Object.keys(grouped).forEach(k => {
      grouped[Number(k)].sort((a, b) => {
        return getSortOrder(a.location.segmentKind, a.location.segmentNumber) - 
               getSortOrder(b.location.segmentKind, b.location.segmentNumber);
      });
    });

    return grouped;
  }, [rows]);

  // Statistics summaries
  const stats = useMemo(() => {
    let total = rows.length;
    let trippedCount = 0;
    let unhealthyCount = 0;
    let overrideActiveCount = 0;

    rows.forEach(r => {
      const sensors = [r.emergencySensors.moisture, r.emergencySensors.smoke, r.emergencySensors.estop];
      const isTripped = sensors.some(s => s?.tripped);
      const isUnhealthy = sensors.some(s => s && !s.healthy);
      
      const hasDebugOverride = sensors.some(s => 
        s?.debug?.derivedFrom === "override" || 
        (s?.raw && s.raw.healthy === false)
      );

      if (isTripped) trippedCount++;
      if (isUnhealthy) unhealthyCount++;
      if (hasDebugOverride) overrideActiveCount++;
    });

    return { total, trippedCount, unhealthyCount, overrideActiveCount };
  }, [rows]);

  // Filter and Search processor
  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      const sensors = [r.emergencySensors.moisture, r.emergencySensors.smoke, r.emergencySensors.estop];

      // Search matches
      const query = searchQuery.toLowerCase().trim();
      if (query !== "") {
        const matchName = r.location.displayName.toLowerCase().includes(query);
        const matchSortKey = r.location.sortKey.toLowerCase().includes(query);
        const matchSensorName = sensors.some(s => 
          s?.friendlyName.toLowerCase().includes(query) || 
          s?.sensorIndex?.toString().includes(query) ||
          s?.detectorIndex?.toString().includes(query)
        );
        if (!matchName && !matchSortKey && !matchSensorName) return false;
      }

      // Status filters
      if (filterStatus === "tripped") {
        return sensors.some(s => s?.tripped);
      }
      if (filterStatus === "issues") {
        return sensors.some(s => s && (!s.healthy || !s.communicating));
      }
      if (filterStatus === "normal") {
        const anyIssue = sensors.some(s => s && (s.tripped || !s.healthy));
        return !anyIssue;
      }

      return true;
    });
  }, [rows, searchQuery, filterStatus]);

  return (
    <div className="space-y-6 text-sm font-mono pb-8">
      
      {/* SECTION TITLE & TELEMETRY HEADING */}
      <div className="bg-prizm-surface border border-prizm-border rounded-xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Layers className="text-prizm-primary animate-pulse" size={18} />
            <span className="text-[10px] uppercase font-bold tracking-widest bg-cyan-400/10 text-prizm-primary px-2.5 py-0.5 rounded border border-prizm-primary/20">
              PHYSICAL HEATMAP CONSOLE
            </span>
          </div>
          <h2 className="text-base font-black uppercase text-prizm-text tracking-wider">
            All-Sensors Telemetry Matrix
          </h2>
          <p className="text-[10.5px] text-prizm-text-muted uppercase leading-relaxed max-w-2xl">
            Live physical block diagrams auditing real-world water intrusion detectors, enclosure security locks, optical fire/smoke diagnostics, and emergency-stop lines.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 shrink-0">
          <button
            onClick={handleResetSimulator}
            disabled={isResetting || stats.overrideActiveCount === 0}
            className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] font-black uppercase tracking-wider rounded cursor-pointer transition-all disabled:opacity-45"
            title="Clears all injected simulator faults & returns site to nominal baseline"
          >
            <Trash2 size={12} className="inline mr-1" />
            Clear Simulator Overrides ({stats.overrideActiveCount})
          </button>

          <button
            onClick={() => {
              fetchBlockviewerData(false);
              addLog("Forced manual resynchronization from Turtle servers.");
            }}
            className="px-4 py-2 bg-prizm-surface-strong hover:bg-black/25 border border-prizm-border text-prizm-text text-[10px] font-bold uppercase tracking-wider rounded cursor-pointer transition-colors"
          >
            <RefreshCw size={12} className={`inline mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* METRIC CARD HIGHLIGHTS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-3.5 space-y-1 flex items-center gap-3">
          <div className="p-2.5 bg-cyan-400/10 text-prizm-primary rounded">
            <Activity size={18} />
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-prizm-text-muted block">Monitoring Points</span>
            <span className="text-base font-black text-prizm-text font-sans block leading-tight">{stats.total} Segments</span>
          </div>
        </div>

        <div className={`bg-prizm-surface border rounded-lg p-3.5 space-y-1 flex items-center gap-3 transition-colors ${
          stats.trippedCount > 0 ? "border-amber-500/50 bg-amber-500/[0.02]" : "border-prizm-border"
        }`}>
          <div className={`p-2.5 rounded ${stats.trippedCount > 0 ? "bg-amber-500/10 text-amber-500 animate-pulse" : "bg-prizm-surface-strong text-prizm-text-muted"}`}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-prizm-text-muted block">Active Alarm Trips</span>
            <span className={`text-base font-black font-sans block leading-tight ${stats.trippedCount > 0 ? "text-amber-500" : "text-prizm-text"}`}>
              {stats.trippedCount} Active
            </span>
          </div>
        </div>

        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-3.5 space-y-1 flex items-center gap-3">
          <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded">
            <Flame size={18} />
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-prizm-text-muted block">Diagnostic Health Status</span>
            <span className="text-base font-black text-prizm-text font-sans block leading-tight">
              {stats.unhealthyCount > 0 ? `${stats.unhealthyCount} Warning` : "100% NOMINAL"}
            </span>
          </div>
        </div>

        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-3.5 space-y-1 flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded">
            <Wifi size={18} />
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-prizm-text-muted block">LAN Matrix Source</span>
            <span className="text-xs font-black text-cyan-400 block truncate leading-tight uppercase font-mono">
              {sourceUsed === "fallback_blockviewer" ? "DEV FALLBACK DATA" : "TURTLE MON LOCAL"}
            </span>
          </div>
        </div>

      </div>

      {/* SEARCH / FILTERS CONTROLS BAR */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 space-y-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Search */}
        <div className="relative w-full md:max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search segments, IDs, strings, or sensor roles..."
            className="w-full bg-prizm-surface-strong border border-prizm-border pr-10 pl-3 py-2 text-xs rounded text-prizm-text focus:border-prizm-primary outline-none transition-colors"
          />
          <Search size={14} className="absolute right-3.5 top-2.5 text-prizm-text-muted" />
        </div>

        {/* Action Filters Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          
          <div className="flex rounded p-0.5 border border-prizm-border bg-prizm-surface-strong">
            {(["all", "tripped", "normal", "issues"] as const).map(f => {
              const active = filterStatus === f;
              const labels: Record<string, string> = {
                all: "All",
                tripped: "Tripped",
                normal: "Normal",
                issues: "Unstable/Offline"
              };
              return (
                <button
                  key={f}
                  onClick={() => setFilterStatus(f)}
                  className={`px-3 py-1 text-[10px] uppercase font-extrabold rounded cursor-pointer transition-colors ${
                    active 
                      ? "bg-cyan-500 text-black font-sans" 
                      : "text-prizm-text-muted hover:text-white"
                  }`}
                >
                  {labels[f]}
                </button>
              );
            })}
          </div>

          <div className="flex rounded p-0.5 border border-prizm-border bg-prizm-surface-strong ml-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded cursor-pointer ${
                viewMode === "grid" ? "bg-prizm-primary text-black" : "text-prizm-text-muted hover:text-white"
              }`}
            >
              Physical Grid Map
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded cursor-pointer ${
                viewMode === "list" ? "bg-prizm-primary text-black" : "text-prizm-text-muted hover:text-white"
              }`}
            >
              List Feed ({filteredRows.length})
            </button>
          </div>

        </div>

      </div>

      {/* CORE DISPLAY (GRID VIEW MODE VS LIST FEED VIEW MODE) */}
      {viewMode === "grid" ? (
        <div className="space-y-4">
          
          {/* THE HEATMAP LEGEND */}
          <div className="bg-prizm-surface border border-prizm-border p-3.5 rounded-lg flex flex-wrap items-center justify-between gap-4 text-[10.5px]">
            <div className="flex items-center gap-2.5 text-prizm-text-muted font-bold uppercase tracking-wider">
              <SlidersHorizontal size={13} className="text-prizm-primary" />
              <span>Diagnostic Map Legend:</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-emerald-500 shadow shadow-emerald-500/40"></span>
                <span className="uppercase text-prizm-text">Nominal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-amber-500 animate-pulse"></span>
                <span className="uppercase text-amber-500 font-black">Tripped Alarm / Active Intrusion</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-amber-950/40 border border-dashed border-amber-500/45"></span>
                <span className="uppercase text-prizm-text-muted">Partially Mapped / Warning</span>
              </div>
              
              <div className="pl-4 border-l border-prizm-border flex items-center gap-4 text-[10px] text-prizm-text-muted font-bold">
                <span className="flex items-center gap-1"><Droplet size={11} className="text-[#38BDF8]" /> Water</span>
                <span className="flex items-center gap-1"><Flame size={11} className="text-rose-400" /> Smoke</span>
                <span className="flex items-center gap-1"><ShieldAlert size={11} className="text-red-400" /> E-Stop</span>
              </div>
            </div>
          </div>

          {/* DYNAMIC SCROLLABLE MULTI-ARRAY CONTAINER */}
          <div className="bg-prizm-surface border border-prizm-border rounded-xl p-5 overflow-x-auto pr-2 no-scrollbar scroll-smooth">
            
            <div className="min-w-[940px] space-y-4">
              
              {/* Columns Header Coordinates */}
              <div className="grid grid-cols-[80px_1fr] gap-2 text-center text-[9px] text-[#9CA3AF]/60 font-bold tracking-widest uppercase">
                <div>LANE</div>
                <div className="grid grid-cols-21 gap-1">
                  <div>CS</div>
                  <div>BS</div>
                  {[...Array(19)].map((_, i) => (
                    <div key={i}>ES{i+1}</div>
                  ))}
                </div>
              </div>

              {/* 8 Arrays Physical Lanes */}
              {Object.keys(arraysMap).map(arrKey => {
                const arrayIndex = Number(arrKey);
                const blockList = arraysMap[arrayIndex];

                return (
                  <div key={arrayIndex} className="grid grid-cols-[80px_1fr] gap-2 items-center">
                    
                    {/* Left Array indicator badge */}
                    <div className="bg-prizm-surface-strong border border-prizm-border p-2 rounded text-center shrink-0">
                      <span className="text-[10px] font-black tracking-wider text-prizm-primary block">ARRAY {arrayIndex}</span>
                    </div>

                    {/* 21 Columns Grid */}
                    <div className="grid grid-cols-21 gap-1 h-14">
                      {blockList.map((row) => {
                        const isMoistureTripped = row.emergencySensors.moisture?.tripped;
                        const isSmokeTripped = row.emergencySensors.smoke?.tripped;
                        const isEstopTripped = row.emergencySensors.estop?.tripped;
                        
                        const hasTrip = isMoistureTripped || isSmokeTripped || isEstopTripped;
                        const hasWarning = [row.emergencySensors.moisture, row.emergencySensors.smoke, row.emergencySensors.estop].some(s => s && !s.healthy);
                        
                        // Check selected border
                        const isSelected = selectedRow?.location.sortKey === row.location.sortKey;

                        let borderStyle = "border-prizm-border";
                        let bgStyle = "bg-prizm-surface-strong hover:bg-black/35";
                        
                        if (hasTrip) {
                          borderStyle = "border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.25)] animate-pulse";
                          bgStyle = "bg-amber-950/20";
                        } else if (hasWarning) {
                          borderStyle = "border-amber-800";
                          bgStyle = "bg-[#27272a]/30";
                        }
                        
                        if (isSelected) {
                          borderStyle = "border-cyan-400 ring-1 ring-cyan-400";
                        }

                        return (
                          <div
                            key={row.location.sortKey}
                            onClick={() => setSelectedRow(row)}
                            className={`border ${borderStyle} ${bgStyle} rounded p-1 flex flex-col justify-between items-center transition-all cursor-pointer h-full relative group`}
                          >
                            <span className={`text-[9.5px] font-black ${hasTrip ? "text-amber-400 font-sans" : "text-prizm-text"}`}>
                              {row.location.segmentLabel}
                            </span>

                            {/* Micro Indicator Dots for the three security cells */}
                            <div className="flex gap-1">
                              {/* Moisture */}
                              {row.emergencySensors.moisture?.applicable ? (
                                <span 
                                  className={`h-1.5 w-1.5 rounded-full ${isMoistureTripped ? "bg-[#38BDF8] animate-pulse" : "bg-emerald-500"}`}
                                  title={`Moisture: ${isMoistureTripped ? 'TRIPPED' : 'NOMINAL'}`}
                                ></span>
                              ) : (
                                <span className="h-1.5 w-1.5 rounded-full bg-zinc-800"></span>
                              )}

                              {/* Smoke */}
                              {row.emergencySensors.smoke?.applicable ? (
                                <span 
                                  className={`h-1.5 w-1.5 rounded-full ${isSmokeTripped ? "bg-rose-500 animate-pulse" : "bg-emerald-500"}`}
                                  title={`Smoke: ${isSmokeTripped ? 'TRIPPED' : 'NOMINAL'}`}
                                ></span>
                              ) : (
                                <span className="h-1.5 w-1.5 rounded-full bg-zinc-800"></span>
                              )}

                              {/* E-Stop */}
                              {row.emergencySensors.estop?.applicable ? (
                                <span 
                                  className={`h-1.5 w-1.5 rounded-full ${isEstopTripped ? "bg-red-400 animate-pulse" : "bg-emerald-500"}`}
                                  title={`E-Stop: ${isEstopTripped ? 'ACTIVE/PRESSED' : 'NOMINAL'}`}
                                ></span>
                              ) : (
                                <span className="h-1.5 w-1.5 rounded-full bg-zinc-800"></span>
                              )}
                            </div>

                            {/* Hover HUD Box */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 border border-prizm-border bg-black/95 text-[8.5px] text-zinc-300 p-2 rounded shadow-2xl invisible group-hover:visible z-40 w-44 space-y-1 select-none leading-normal">
                              <div className="font-extrabold text-[#D1D5DB] uppercase border-b border-zinc-800 pb-0.5 mb-1 flex justify-between">
                                <span>{row.location.displayName}</span>
                                <span className="text-[#9CA3AF]/60 font-mono">#{row.location.rawEnclosureIndex}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>MOISTURE:</span>
                                <span className={isMoistureTripped ? "text-amber-400 font-extrabold" : "text-emerald-400"}>
                                  {isMoistureTripped ? "TRIPPED" : "NORMAL"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>SMOKE DET:</span>
                                <span className={isSmokeTripped ? "text-red-400 font-extrabold" : "text-emerald-400"}>
                                  {isSmokeTripped ? "ALERT" : "NORMAL"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>E-STOP SWITCH:</span>
                                <span className={isEstopTripped ? "text-red-400 font-extrabold font-sans" : "text-emerald-400"}>
                                  {isEstopTripped ? "ENGAGED" : "SAFE"}
                                </span>
                              </div>
                            </div>

                          </div>
                        );
                      })}
                    </div>

                  </div>
                );
              })}

            </div>

          </div>

        </div>
      ) : (
        /* LIST FEED VIEW MODE */
        <div className="bg-prizm-surface border border-prizm-border rounded-xl p-5 space-y-4">
          <div className="text-[11px] font-bold text-prizm-text-muted uppercase tracking-wider flex items-center justify-between">
            <span>AUDITED RESULTS FEED ({filteredRows.length} OF {rows.length})</span>
            <span className="text-[9px] bg-black/40 px-2 py-0.5 rounded text-white">FILTER ACTIVE</span>
          </div>

          {filteredRows.length === 0 ? (
            <div className="py-12 text-center border mr-1 border-dashed border-prizm-border rounded text-[#9CA3AF]/60 italic font-bold">
              No matching environmental locations found.
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 no-scrollbar scroll-smooth">
              {filteredRows.map(row => {
                const isMoistureTripped = row.emergencySensors.moisture?.tripped;
                const isSmokeTripped = row.emergencySensors.smoke?.tripped;
                const isEstopTripped = row.emergencySensors.estop?.tripped;
                
                const hasTrip = isMoistureTripped || isSmokeTripped || isEstopTripped;

                return (
                  <div
                    key={row.location.sortKey}
                    onClick={() => setSelectedRow(row)}
                    className={`p-3 rounded border transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                      selectedRow?.location.sortKey === row.location.sortKey
                        ? "bg-cyan-500/[0.03] border-cyan-400"
                        : hasTrip
                          ? "bg-amber-950/20 border-amber-500/40 hover:border-amber-500/60"
                          : "bg-prizm-surface-strong border-white/5 hover:border-white/10"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-prizm-text leading-none">{row.location.displayName}</span>
                        <span className="text-[8.5px] bg-black/30 px-1.5 py-0.5 rounded text-prizm-primary border border-prizm-border uppercase font-mono font-bold">
                          {row.location.sortKey}
                        </span>
                        {hasTrip && (
                          <span className="text-[8px] bg-amber-500/10 text-amber-500 border border-amber-500/30 py-0.5 px-1.5 rounded animate-pulse font-extrabold uppercase">
                            ALARM TRIP ACTIVE
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap gap-2 text-[9.5px] text-[#9CA3AF]/60 uppercase">
                        <span>Lineup Index: {row.location.rawLineupIndex}</span>
                        <span>•</span>
                        <span>Enclosure: {row.location.rawEnclosureIndex}</span>
                        <span>•</span>
                        <span>Segment: {row.location.segmentKind} ({row.location.segmentLabel})</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1 md:pt-0">
                      
                      <div className={`p-1.5 rounded border text-[9px] flex items-center gap-1 uppercase font-bold ${
                        isMoistureTripped ? "bg-[#38BDF8]/10 text-cyan-300 border-[#38BDF8]/20 animate-pulse" : "bg-black/30 border-transparent text-[#9CA3AF]/60"
                      }`}>
                        <Droplet size={10} />
                        <span>Mst: {isMoistureTripped ? "TRIPPED" : "SAFE"}</span>
                      </div>

                      <div className={`p-1.5 rounded border text-[9px] flex items-center gap-1 uppercase font-bold ${
                        isSmokeTripped ? "bg-rose-500/10 text-rose-300 border-rose-500/20 animate-pulse" : "bg-black/30 border-transparent text-[#9CA3AF]/60"
                      }`}>
                        <Flame size={10} />
                        <span>Smoke: {isSmokeTripped ? "ALERT" : "SAFE"}</span>
                      </div>

                      <div className={`p-1.5 rounded border text-[9px] flex items-center gap-1 uppercase font-bold ${
                        isEstopTripped ? "bg-red-400/10 text-red-300 border-red-500/20 animate-pulse" : "bg-black/30 border-transparent text-[#9CA3AF]/60"
                      }`}>
                        <ShieldAlert size={10} />
                        <span>Est: {isEstopTripped ? "ENGAGED" : "SAFE"}</span>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* DETAILED FOCUS PANEL & SIMULATOR OVERRIDES */}
      <AnimatePresence>
        {selectedRow && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="bg-prizm-surface border border-cyan-500/30 rounded-xl p-5 space-y-5 shadow-2xl relative"
          >
            <button
              onClick={() => setSelectedRow(null)}
              className="absolute right-4 top-4 hover:bg-black/20 p-1.5 rounded text-prizm-text-muted hover:text-white transition-colors"
            >
              <Minimize2 size={14} />
            </button>

            {/* Title / Info */}
            <div className="border-b border-prizm-border pb-3.5 space-y-1 pr-8">
              <span className="text-[9px] font-black uppercase tracking-widest text-[#06B6D4] block">
                Audited Element Diagnosis Card
              </span>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Wifi size={14} className="text-prizm-primary animate-pulse" />
                {selectedRow.location.displayName} Inspection Console
              </h3>
            </div>

            {/* Two-Column Detail HUD / Override Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Box 1: Topology Metadata */}
              <div className="space-y-4 lg:col-span-1 bg-prizm-surface-strong border border-white/5 p-4 rounded-lg">
                <h4 className="text-[10px] text-prizm-primary font-black uppercase tracking-wider border-b border-zinc-800 pb-1.5 flex items-center gap-1.5">
                  <Activity size={12} />
                  Topological Details
                </h4>

                <div className="space-y-2 text-[10.5px] uppercase">
                  <div className="flex justify-between">
                    <span className="text-[#9CA3AF]/60">Assoc Array:</span>
                    <span className="font-extrabold text-[#F3F4F6]">{selectedRow.location.arrayLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9CA3AF]/60">Segment Kind:</span>
                    <span className="font-extrabold text-[#F3F4F6]">{selectedRow.location.segmentKind}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9CA3AF]/60">Physical Pos:</span>
                    <span className="font-extrabold text-[#F3F4F6]">Lineup #{selectedRow.location.rawLineupId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9CA3AF]/60">Enclosure Index:</span>
                    <span className="font-extrabold text-[#F3F4F6]">Enclosure {selectedRow.location.rawEnclosureIndex}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9CA3AF]/60">Checklist Index:</span>
                    <span className="font-extrabold text-prizm-primary font-mono">{selectedRow.location.sortKey}</span>
                  </div>
                  
                  {/* Battery String mappings */}
                  <div className="pt-2.5 border-t border-zinc-800 space-y-1">
                    <span className="text-[#9CA3AF]/60 block text-[9.5px]">Assoc Battery Strings:</span>
                    {selectedRow.location.strings.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedRow.location.strings.map((str, idx) => (
                          <span 
                            key={idx} 
                            className="bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[9px] py-0.5 px-1.5 rounded font-bold uppercase"
                          >
                            String {str.stringIndex}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[8.5px] text-[#9CA3AF]/40 italic block">CS/BS No Local Batteries</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Box 2: Three Emergency Sensors Status Details */}
              <div className="space-y-4 lg:col-span-2 space-y-3">
                <h4 className="text-[10px] text-zinc-300 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                  <SlidersHorizontal size={12} className="text-prizm-primary" />
                  Active Environmental Telemetry Signals
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  
                  {/* Moisture Sensor Box */}
                  <div className="bg-prizm-surface-strong border border-white/5 p-3 rounded-lg flex flex-col justify-between h-44">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-start">
                        <Droplet size={16} className={selectedRow.emergencySensors.moisture?.tripped ? "text-[#38BDF8]" : "text-[#9CA3AF]/50"} />
                        <span className={`text-[8px] font-black uppercase py-0.5 px-1.5 rounded ${
                          selectedRow.emergencySensors.moisture?.applicable 
                            ? selectedRow.emergencySensors.moisture?.tripped 
                              ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" 
                              : "bg-emerald-500/10 text-emerald-400"
                            : "bg-zinc-800 text-[#9CA3AF]/40"
                        }`}>
                          {selectedRow.emergencySensors.moisture?.applicable ? "MAPPED" : "N/A"}
                        </span>
                      </div>
                      <span className="block text-[11px] font-black text-white uppercase leading-none">Moisture Sensor</span>
                      <p className="text-[9px] text-[#9CA3AF]/60 leading-normal uppercase">
                        {selectedRow.emergencySensors.moisture?.friendlyName || "Not implemented"}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-zinc-800 space-y-2">
                      <div className="flex justify-between text-[9px] uppercase">
                        <span className="text-[#9CA3AF]/50">Status:</span>
                        <span className={selectedRow.emergencySensors.moisture?.tripped ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>
                          {selectedRow.emergencySensors.moisture?.applicable 
                            ? selectedRow.emergencySensors.moisture?.tripped ? "TRIPPED" : "NOMINAL" 
                            : "N/A"}
                        </span>
                      </div>
                      
                      {selectedRow.emergencySensors.moisture?.applicable && (
                        <button
                          onClick={() => handleSimulateTrip(selectedRow, "moisture", !selectedRow.emergencySensors.moisture?.tripped)}
                          disabled={overridingSensor !== null}
                          className={`w-full py-1 rounded text-[8.5px] font-bold uppercase transition-colors cursor-pointer text-center ${
                            selectedRow.emergencySensors.moisture?.tripped 
                              ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" 
                              : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 animate-pulse"
                          }`}
                        >
                          {selectedRow.emergencySensors.moisture?.tripped ? "Reset Normal" : "Simulate Trip"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Smoke Sensor Box */}
                  <div className="bg-prizm-surface-strong border border-white/5 p-3 rounded-lg flex flex-col justify-between h-44">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-start">
                        <Flame size={16} className={selectedRow.emergencySensors.smoke?.tripped ? "text-rose-400 animate-pulse" : "text-[#9CA3AF]/50"} />
                        <span className={`text-[8px] font-black uppercase py-0.5 px-1.5 rounded ${
                          selectedRow.emergencySensors.smoke?.applicable 
                            ? selectedRow.emergencySensors.smoke?.tripped 
                              ? "bg-red-500/10 text-rose-400 border border-red-500/20" 
                              : "bg-emerald-500/10 text-emerald-400"
                            : "bg-zinc-800 text-[#9CA3AF]/40"
                        }`}>
                          {selectedRow.emergencySensors.smoke?.applicable ? "MAPPED" : "N/A"}
                        </span>
                      </div>
                      <span className="block text-[11px] font-black text-white uppercase leading-none">Smoke Detector</span>
                      <p className="text-[9px] text-[#9CA3AF]/60 leading-normal uppercase">
                        {selectedRow.emergencySensors.smoke?.friendlyName || "Not implemented"}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-zinc-800 space-y-2">
                      <div className="flex justify-between text-[9px] uppercase">
                        <span className="text-[#9CA3AF]/50">Status:</span>
                        <span className={selectedRow.emergencySensors.smoke?.tripped ? "text-red-400 font-bold animate-pulse" : "text-emerald-400 font-bold"}>
                          {selectedRow.emergencySensors.smoke?.applicable 
                            ? selectedRow.emergencySensors.smoke?.tripped ? "TRIPPED" : "NOMINAL" 
                            : "N/A"}
                        </span>
                      </div>
                      
                      {selectedRow.emergencySensors.smoke?.applicable && (
                        <button
                          onClick={() => handleSimulateTrip(selectedRow, "smoke", !selectedRow.emergencySensors.smoke?.tripped)}
                          disabled={overridingSensor !== null}
                          className={`w-full py-1 rounded text-[8.5px] font-bold uppercase transition-colors cursor-pointer text-center ${
                            selectedRow.emergencySensors.smoke?.tripped 
                              ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" 
                              : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 animate-pulse"
                          }`}
                        >
                          {selectedRow.emergencySensors.smoke?.tripped ? "Reset Normal" : "Simulate Alert"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* E-Stop Sensor Box */}
                  <div className="bg-prizm-surface-strong border border-white/5 p-3 rounded-lg flex flex-col justify-between h-44">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-start">
                        <ShieldAlert size={16} className={selectedRow.emergencySensors.estop?.tripped ? "text-red-400 animate-pulse" : "text-[#9CA3AF]/50"} />
                        <span className={`text-[8px] font-black uppercase py-0.5 px-1.5 rounded ${
                          selectedRow.emergencySensors.estop?.applicable 
                            ? selectedRow.emergencySensors.estop?.tripped 
                              ? "bg-rose-500/10 text-red-400 border border-red-500/20" 
                              : "bg-emerald-500/10 text-emerald-400"
                            : "bg-zinc-800 text-[#9CA3AF]/40"
                        }`}>
                          {selectedRow.emergencySensors.estop?.applicable ? "MAPPED" : "N/A"}
                        </span>
                      </div>
                      <span className="block text-[11px] font-black text-white uppercase leading-none">Emergency Stop</span>
                      <p className="text-[9px] text-[#9CA3AF]/60 leading-normal uppercase">
                        {selectedRow.emergencySensors.estop?.friendlyName || "Not implemented"}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-zinc-800 space-y-2">
                      <div className="flex justify-between text-[9px] uppercase">
                        <span className="text-[#9CA3AF]/50">Status:</span>
                        <span className={selectedRow.emergencySensors.estop?.tripped ? "text-red-400 font-bold animate-pulse" : "text-emerald-400 font-bold"}>
                          {selectedRow.emergencySensors.estop?.applicable 
                            ? selectedRow.emergencySensors.estop?.tripped ? "RELEASE ACTIVE" : "RELEASED SAFE" 
                            : "N/A"}
                        </span>
                      </div>
                      
                      {selectedRow.emergencySensors.estop?.applicable && (
                        <button
                          onClick={() => handleSimulateTrip(selectedRow, "estop", !selectedRow.emergencySensors.estop?.tripped)}
                          disabled={overridingSensor !== null}
                          className={`w-full py-1 rounded text-[8.5px] font-bold uppercase transition-colors cursor-pointer text-center ${
                            selectedRow.emergencySensors.estop?.tripped 
                              ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" 
                              : "bg-rose-500/15 hover:bg-rose-500/20 text-rose-450 border border-rose-500/20 animate-pulse"
                          }`}
                        >
                          {selectedRow.emergencySensors.estop?.tripped ? "Simulate Release" : "Simulate Press"}
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              </div>

            </div>

            {/* Simulated log output stream */}
            {operationalLog.length > 0 && (
              <div className="p-3 bg-black/60 border border-zinc-800 rounded font-mono text-[9px] text-[#9CA3AF] h-20 overflow-y-auto no-scrollbar">
                <span className="text-[#9CA3AF]/40 block uppercase font-bold tracking-wider mb-1 border-b border-zinc-900 pb-0.5">COMMUNICATION LOGGER:</span>
                {operationalLog.map((log, idx) => (
                  <div key={idx} className="truncate select-none">{log}</div>
                ))}
              </div>
            )}

          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
