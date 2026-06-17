import { markPerf } from '../../lib/perf';
import React, { useState, useEffect, useMemo } from "react";
import { 
  Flame, 
  ShieldAlert, 
  Wind, 
  Thermometer, 
  Layers, 
  Cpu, 
  Wifi, 
  DoorOpen, 
  DoorClosed, 
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
  Download, 
  Maximize2, 
  ChevronRight,
  Heart,
  FileSpreadsheet,
  Settings
} from "lucide-react";

// Types corresponding to server API contract
interface SensorStatus {
  state: "normal" | "tripped" | "fault" | "open" | "closed" | "communicating" | "notCommunicating" | "unknown" | "na";
  healthy: boolean | null;
  label: string;
  value?: any;
  sourcePath?: string;
}

interface SiteSensorRow {
  id: string;
  stationCode?: string;
  blockIndex?: number;
  arrayIndex?: number;
  lineupIndex?: number;
  segmentIndex?: number;
  segmentPosition?: string;
  stringIndex?: number;
  deviceIp?: string;
  displayLabel: string;
  health: "healthy" | "warning" | "fault" | "unknown" | "na";
  sensors: {
    moisture?: SensorStatus;
    ioCommunications?: SensorStatus;
    dataCommunications?: SensorStatus;
    acDoors?: SensorStatus;
    dcDoors?: SensorStatus;
    topCapDoor?: SensorStatus;
    batteryDoors?: SensorStatus;
    hydrogen?: SensorStatus;
    hydrogenFault?: SensorStatus;
    smoke?: SensorStatus;
    heat?: SensorStatus;
    fire?: SensorStatus;
    fireTrouble?: SensorStatus;
    manualVentilation?: SensorStatus;
    envCtrl?: SensorStatus;
    upsAlarm?: SensorStatus;
    modbusEStop?: SensorStatus;
  };
  sourcePath: string;
  lastUpdated?: string;
  raw?: any;
}

interface SensorCategoryRollup {
  id: string;
  label: string;
  healthyCount: number;
  unhealthyCount: number;
  unknownCount: number;
  totalCount: number;
  healthyLabel: string; // e.g. "Untripped", "Communicating", etc.
  unhealthyLabel: string; // e.g. "Tripped", "Faulted"
}

// Category design mapping
const CATEGORY_ICONS: Record<string, React.ComponentType<any>> = {
  fire: Flame,
  fireTrouble: ShieldAlert,
  smoke: Wind,
  heat: Thermometer,
  hydrogen: Layers,
  hydrogenFault: AlertTriangle,
  dataCommunications: Wifi,
  ioCommunications: Cpu,
  acDoors: DoorOpen,
  dcDoors: DoorOpen,
  topCapDoor: Layers,
  batteryDoors: DoorClosed,
  manualVentilation: RotateCw,
  envCtrl: Shield,
  upsAlarm: Zap,
  moisture: Droplet,
  modbusEStop: ShieldAlert
};

export default function SensorsView(_props?: { lateralSensors?: any; sensorRows?: any }) {
  const [rows, setRows] = useState<SiteSensorRow[]>([]);
  const [categories, setCategories] = useState<SensorCategoryRollup[]>([]);
  const [sourceHealth, setSourceHealth] = useState<any[]>([]);
  const [timestamp, setTimestamp] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArray, setSelectedArray] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [hideHealthy, setHideHealthy] = useState(false);

  // Developer Simulation tools
  const [simTargetNode, setSimTargetNode] = useState<string>("STR-SEG-44");
  const [simTargetCategory, setSimTargetCategory] = useState<string>("fire");
  const [simValue, setSimValue] = useState<string>("ALARM");
  const [injecting, setInjecting] = useState(false);

  // Load health data from server API
  const loadData = async (isRefreshed = false) => {
    const t0 = performance.now();
    if (isRefreshed) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const url = `/api/local/site-sensors/summary${isRefreshed ? "?refresh=true" : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setRows(data.rows || []);
        setCategories(data.categories || []);
        setSourceHealth(data.sourceHealth || []);
        setTimestamp(data.timestamp || "");
      } else {
        setError(data.error || "Failed to load site sensors data");
      }
    } catch (err: any) {
      setError(err?.message || "Error reaching telemetry server endpoint");
    } finally {
      setLoading(false);
      setRefreshing(false);
      markPerf('SensorsView Refresh', t0);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter rows based on filters & search query
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      // 1. Array filter
      if (selectedArray !== "All") {
        if (row.arrayIndex !== Number(selectedArray)) {
          return false;
        }
      }

      // 2. Hide healthy filter
      if (hideHealthy) {
        if (row.health === "healthy" || row.health === "na") {
          return false;
        }
      }

      // 3. Category click filter
      if (selectedCategory) {
        const sens = (row.sensors as any)[selectedCategory];
        if (!sens || sens.state === "na" || sens.healthy === true) {
          return false;
        }
      }

      // 4. Search query word matching (segment, string, IP, label)
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim();
        const matchLabel = row.displayLabel.toLowerCase().includes(query);
        const matchIp = row.deviceIp?.toLowerCase().includes(query) || false;
        const matchSegment = row.segmentIndex?.toString().includes(query) || false;
        const matchString = row.stringIndex?.toString().includes(query) || false;
        const matchId = row.id.toLowerCase().includes(query);

        if (!matchLabel && !matchIp && !matchSegment && !matchString && !matchId) {
          return false;
        }
      }

      return true;
    });
  }, [rows, selectedArray, hideHealthy, selectedCategory, searchQuery]);

  // Handle Injecting overrides back to server
  const handleInject = async () => {
    setInjecting(true);
    try {
      const res = await fetch("/api/local/site-sensors/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: simTargetNode,
          category: simTargetCategory,
          value: simValue
        })
      });
      const data = await res.json();
      if (data.success) {
        // Reload summary dynamically from server
        await loadData(false);
      } else {
        alert("Failed to inject signal override onto server");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setInjecting(false);
    }
  };

  const handleResetDefaults = async () => {
    setInjecting(true);
    try {
      const res = await fetch("/api/local/site-sensors/reset", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSelectedCategory(null);
        setSelectedArray("All");
        setSearchQuery("");
        setHideHealthy(false);
        await loadData(false);
      }
    } catch (err: any) {
      alert("Error resetting defaults: " + err.message);
    } finally {
      setInjecting(false);
    }
  };

  // Get available target state values based on simulated categoric selection
  const getSimValueOptions = (catId: string) => {
    if (["fire", "smoke", "fireTrouble", "moisture", "modbusEStop"].includes(catId)) {
      return ["OK", "ALARM", "tripped"];
    }
    if (["heat", "hydrogen"].includes(catId)) {
      return ["NORMAL", "WARNING", "CRITICAL"];
    }
    if (["acDoors", "dcDoors", "topCapDoor", "batteryDoors"].includes(catId)) {
      return ["Closed", "Open"];
    }
    if (["dataCommunications", "ioCommunications"].includes(catId)) {
      return ["OK", "stable", "WARNING", "error", "lostComms"];
    }
    return ["NORMAL", "ALARM", "FAULT"];
  };

  // Export CSV download function mapping all 17 categories
  const handleExportCSV = () => {
    const headers = [
      "stationCode", "blockIndex", "arrayIndex", "lineupIndex", "segmentIndex", "stringIndex", "deviceIp", "displayLabel", "overallHealth",
      "moisture", "ioComms", "dataComms", "acDoors", "dcDoors", "topCapDoors", "batteryDoors", "hydrogen", "hydrogenFault", "smoke", "heat", "fire", "fireTrouble", "manualVentilation", "emergencyVentilation", "modbusEStop",
      "sourcePath", "lastUpdated"
    ];

    const escapeCSV = (val: any) => {
      if (val === undefined || val === null) return "";
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const csvContent = [
      headers.join(","),
      ...filteredRows.map(row => {
        return [
          row.stationCode || "",
          row.blockIndex ?? "",
          row.arrayIndex ?? "",
          row.lineupIndex ?? "",
          row.segmentIndex ?? "",
          row.stringIndex ?? "",
          row.deviceIp || "",
          row.displayLabel || "",
          row.health || "",
          row.sensors?.moisture?.label || "N/A",
          row.sensors?.ioCommunications?.label || "N/A",
          row.sensors?.dataCommunications?.label || "N/A",
          row.sensors?.acDoors?.label || "N/A",
          row.sensors?.dcDoors?.label || "N/A",
          row.sensors?.topCapDoor?.label || "N/A",
          row.sensors?.batteryDoors?.label || "N/A",
          row.sensors?.hydrogen?.label || "N/A",
          row.sensors?.hydrogenFault?.label || "N/A",
          row.sensors?.smoke?.label || "N/A",
          row.sensors?.heat?.label || "N/A",
          row.sensors?.fire?.label || "N/A",
          row.sensors?.fireTrouble?.label || "N/A",
          row.sensors?.manualVentilation?.label || "N/A",
          "N/A", // emergencyVentilation
          row.sensors?.modbusEStop?.label || "N/A",
          row.sourcePath || "",
          row.lastUpdated || ""
        ].map(escapeCSV).join(",");
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `prizm_site_sensors_summary_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export JSON download function
  const handleExportJSON = () => {
    const exportObj = {
      timestamp: new Date().toISOString(),
      categories: categories,
      rows: filteredRows,
      sourceHealth: sourceHealth
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `prizm_site_sensors_summary_${new Date().toISOString().split("T")[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Draw Cell Icon and color with full tooltips details
  const renderCellIcon = (sensor: SensorStatus | undefined, categoryLabel: string) => {
    if (!sensor || sensor.state === "na") {
      return (
        <div 
          className="flex justify-center items-center h-8 w-11 text-prizm-text-muted font-mono text-[10px] cursor-help"
          title={`${categoryLabel}\nState: Not Applicable\nValue: N/A`}
        >
          —
        </div>
      );
    }

    const { state, healthy, label, value, sourcePath } = sensor;
    const tooltipText = `${categoryLabel}\nState: ${label}\nRaw Value: "${value ?? ''}"\nPath: ${sourcePath ?? ''}\nUpdated: ${new Date(timestamp).toLocaleTimeString()}`;

    if (state === "unknown") {
      return (
        <div 
          className="flex justify-center items-center h-8 w-11 text-prizm-text-muted cursor-help"
          title={tooltipText}
        >
          <HelpCircle size={13} className="text-prizm-text-muted stroke-[2.5]" />
        </div>
      );
    }

    if (healthy === false) {
      // Unhealthy state
      const isWarningOnly = (
        categoryLabel === "AC DOORS" || 
        categoryLabel === "TOP CAP DOOR" || 
        categoryLabel === "MANUAL VENTILATION" ||
        label === "Warning" ||
        categoryLabel === "FIRE TROUBLE"
      );
      if (isWarningOnly) {
        return (
          <div 
            className="flex justify-center items-center h-8 w-11 bg-amber-500/10 border border-amber-500/20 rounded cursor-help"
            title={tooltipText}
          >
            <AlertTriangle size={13} className="text-amber-500 stroke-[2.5] animate-pulse" />
          </div>
        );
      } else {
        return (
          <div 
            className="flex justify-center items-center h-8 w-11 bg-red-500/15 border border-red-500/30 rounded cursor-help animate-pulse shadow-md shadow-red-950/20"
            title={tooltipText}
          >
            <AlertTriangle size={13} className="text-red-500 stroke-[2.5]" />
          </div>
        );
      }
    }

    // Healthy/Normal
    return (
      <div 
        className="flex justify-center items-center h-8 w-11 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/15 rounded cursor-help transition-all"
        title={tooltipText}
      >
        <CheckCircle size={13} className="text-emerald-400 stroke-[2.5]" />
      </div>
    );
  };

  // Draw Row Health Icon Badge
  const renderRowHealth = (health: string) => {
    switch (health) {
      case "fault":
        return <Heart size={14} className="text-red-500 fill-red-500 animate-pulse shrink-0" title="Critical Active Faults" />;
      case "warning":
        return <AlertTriangle size={14} className="text-amber-500 shrink-0" title="Active Warning Signals" />;
      case "unknown":
        return <HelpCircle size={14} className="text-prizm-text-muted shrink-0" title="Stale / Unknown Signals" />;
      default:
        return <Heart size={14} className="text-emerald-500 fill-emerald-500 shrink-0" title="All Systems Normal" />;
    }
  };

  return (
    <div className="space-y-4 text-prizm-text select-none">
      
      {/* DEVELOPER SIMULATION INJECTOR CONTROL BLOCK */}
      <div className="bg-prizm-surface border border-prizm-border/60 p-4 rounded-lg flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Settings size={15} className="text-cyan-400 animate-spin" style={{ animationDuration: "12s" }} />
            <span className="font-extrabold text-sm text-white uppercase tracking-wider">Prizm RTU Sensor Signal Overrides</span>
            <span className="bg-prizm-primary/10 border border-prizm-primary/30 text-[8.5px] px-1.5 py-0.5 rounded text-cyan-400 font-bold uppercase">EMS Simulator Layer</span>
          </div>
          <p className="text-[11px] text-prizm-text-muted font-sans">
            Inject emergency, fault, and communication status overrides directly to the platform server memory. Rollups and tooltips adjust live.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Target Nodes */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-[#059669] font-bold uppercase tracking-wider font-mono">Hardware Node Address</label>
            <select
              value={simTargetNode}
              onChange={(e) => setSimTargetNode(e.target.value)}
              className="bg-prizm-surface text-prizm-text text-xs border border-prizm-border rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-cyan-500 min-w-[200px]"
            >
              {rows.map(row => (
                <option key={row.id} value={row.id}>
                  {row.displayLabel.length > 32 ? row.displayLabel.substring(0, 32) + "..." : row.displayLabel} [{row.id}]
                </option>
              ))}
            </select>
          </div>

          {/* Sensor Column Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-[#059669] font-bold uppercase tracking-wider font-mono">Mapped Sensor Category</label>
            <select
              value={simTargetCategory}
              onChange={(e) => {
                setSimTargetCategory(e.target.value);
                const opts = getSimValueOptions(e.target.value);
                setSimValue(opts[opts.length - 1]); // Default to fault state typically
              }}
              className="bg-prizm-surface text-prizm-text text-xs border border-prizm-border rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-cyan-500 min-w-[170px]"
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </div>

          {/* Inject State Options */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-[#059669] font-bold uppercase tracking-wider font-mono">Injected Overriding Value</label>
            <select
              value={simValue}
              onChange={(e) => setSimValue(e.target.value)}
              className="bg-prizm-surface text-prizm-text text-xs border border-prizm-border rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-cyan-500 min-w-[120px]"
            >
              {getSimValueOptions(simTargetCategory).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end self-end gap-2 pt-2 xl:pt-0">
            <button
              onClick={handleInject}
              disabled={injecting}
              className="bg-prizm-primary/20 hover:bg-prizm-primary/35 text-cyan-300 font-bold text-xs px-4 py-1.5 h-[34px] rounded border border-prizm-primary/40 flex items-center gap-1 cursor-pointer transition uppercase"
            >
              {injecting ? "..." : "Inject Signal"}
            </button>
            <button
              onClick={handleResetDefaults}
              disabled={injecting}
              className="bg-prizm-surface hover:bg-prizm-surface-strong text-prizm-text font-bold text-xs px-4 py-1.5 h-[34px] rounded border border-prizm-border flex items-center gap-1 cursor-pointer transition uppercase"
              title="Clear all overrides back to EMS defaults"
            >
              Reset Defaults
            </button>
          </div>
        </div>
      </div>

      {/* THREE ZONE VIEW LAYOUT GRID */}
      <div className="flex flex-col lg:flex-row gap-4 min-h-[550px]">
        
        {/* LEFT SIDE: SENSOR CATEGORIES ROLLUP */}
        <div className="w-full lg:w-64 shrink-0 bg-prizm-surface border border-prizm-border rounded-lg p-3 space-y-3 shadow-md">
          <div className="border-b border-prizm-border pb-2 flex justify-between items-center px-1 font-mono">
            <span className="text-[10px] uppercase font-extrabold text-white/50 tracking-wider">Rollup Index</span>
            <div className="flex gap-2 text-[9px]">
              {refreshing ? (
                <span className="text-cyan-400 animate-pulse">POLLING...</span>
              ) : (
                <span className="text-prizm-text-muted">ACTIVE ({rows.length} rows)</span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`w-full flex items-center justify-between p-2 rounded text-[10px] font-bold uppercase transition font-mono ${
                selectedCategory === null 
                  ? "bg-prizm-primary/10 text-cyan-300 border-l-2 border-prizm-primary font-extrabold"
                  : "text-prizm-text-muted hover:text-white hover:bg-white/[0.02]"
              }`}
            >
              <span>Show All Categories</span>
              <Maximize2 size={10} className="text-cyan-400" />
            </button>
            
            <div className="h-px bg-prizm-border my-2" />

            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-0.5 scrollbar-thin font-mono text-[10.5px]">
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                const Icon = CATEGORY_ICONS[cat.id] || HelpCircle;

                // Formulate count formatting following BHE / Solar Star rules
                let countString = "";
                let indicatorColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                
                if (cat.unhealthyCount > 0) {
                  indicatorColor = "bg-red-500/15 text-red-400 border-red-500/30 animate-pulse";
                }

                if (["fire", "fireTrouble", "smoke", "heat", "hydrogen", "hydrogenFault"].includes(cat.id)) {
                  countString = `${cat.healthyCount} / ${cat.totalCount} Untripped`;
                } else if (["dataCommunications", "ioCommunications"].includes(cat.id)) {
                  countString = `${cat.healthyCount} / ${cat.totalCount} Communicating`;
                } else if (["acDoors", "dcDoors", "topCapDoor", "batteryDoors"].includes(cat.id)) {
                  countString = `${cat.healthyCount} / ${cat.totalCount} Closed`;
                } else if (cat.id === "moisture") {
                  countString = `${cat.healthyCount} / ${cat.totalCount} Dry`;
                } else {
                  countString = `${cat.healthyCount} / ${cat.totalCount} Normal`;
                }

                return (
                  <div key={cat.id} className="space-y-1">
                    <button
                      onClick={() => setSelectedCategory(isSelected ? null : cat.id)}
                      className={`w-full text-left p-2 rounded transition-all border flex flex-col gap-1 cursor-pointer ${
                        isSelected
                          ? "bg-prizm-primary/10 border-prizm-primary/60 text-white font-semibold shadow-sm"
                          : "bg-prizm-surface/25 border-transparent hover:border-prizm-border/40 hover:bg-prizm-surface/40 text-prizm-text-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold flex items-center gap-1.5 text-white/90 truncate tracking-tight">
                          <Icon size={12} className={isSelected ? "text-cyan-400" : "text-prizm-text-muted"} />
                          {cat.label}
                        </span>
                        {cat.unhealthyCount > 0 && (
                          <span className="text-[8.5px] px-1 py-0.5 rounded leading-none bg-red-500/10 text-red-500 border border-red-500/20 font-extrabold animate-pulse">
                            {cat.unhealthyCount} FAULT
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-[9px] text-prizm-text-muted mt-0.5">
                        <span className={`px-1 rounded-sm border text-[8.5px] ${indicatorColor}`}>
                          {countString}
                        </span>
                      </div>
                    </button>
                    {cat.id === "modbusEStop" && (
                      <div className="pl-4 py-0.5 border-l border-cyan-500/30 text-[9px] text-prizm-text-muted text-left font-mono space-y-0.5 select-none">
                        <div className="flex items-center gap-1">
                          <span className="h-1 w-1 bg-cyan-400 rounded-full inline-block" />
                          <span>↳ Modbus E-Stop</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT AREA: THE MASTER DETAIL TABLE */}
        <div className="flex-1 space-y-4">
          
          {/* CONTROL PANEL HEADER */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-prizm-surface p-3 rounded-lg border border-prizm-border text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-bold text-white uppercase tracking-wider font-mono">
                Site Safety Health Matrix
              </span>
              {timestamp && (
                <span className="font-mono text-prizm-text-muted text-[10px]/none whitespace-nowrap">
                  (Updated: {new Date(timestamp).toLocaleTimeString()})
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Array Select */}
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-prizm-text-muted font-bold uppercase">Array:</span>
                <select
                  value={selectedArray}
                  onChange={(e) => setSelectedArray(e.target.value)}
                  className="bg-prizm-surface text-[10px] text-prizm-text border border-prizm-border rounded px-2 py-1 font-mono outline-none cursor-pointer"
                >
                  <option value="All">All Arrays</option>
                  <option value="1">Array 1</option>
                  <option value="2">Array 2</option>
                  <option value="3">Array 3</option>
                  <option value="4">Array 4</option>
                </select>
              </div>

              {/* Hide Healthy toggle */}
              <label className="flex items-center gap-1.5 text-[10px] text-prizm-text-muted font-bold font-mono uppercase cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={hideHealthy}
                  onChange={(e) => setHideHealthy(e.target.checked)}
                  className="rounded border-prizm-border bg-prizm-surface text-[#06B6D4] focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer"
                />
                Hide Healthy
              </label>

              {/* Search textbox */}
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-2.5 text-prizm-text-muted" />
                <input 
                  type="text" 
                  placeholder="ID, IP, or Segment..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-prizm-surface border border-prizm-border rounded pl-7 pr-2 py-1.5 text-[10px] font-mono text-prizm-text placeholder-prizm-text-muted focus:outline-none focus:border-cyan-500 w-36"
                />
              </div>

              {/* Refresh & export action buttons */}
              <div className="flex items-center gap-1 border-l border-prizm-border pl-2">
                <button
                  onClick={() => loadData(true)}
                  disabled={refreshing}
                  className="p-1.5 rounded text-prizm-text-muted hover:text-white hover:bg-white/5 cursor-pointer transition-colors"
                  title="Force telemetry refresh"
                >
                  <RefreshCw size={13} className={refreshing ? "animate-spin text-cyan-400" : ""} />
                </button>
                <button
                  onClick={handleExportCSV}
                  className="p-1.5 rounded text-prizm-text-muted hover:text-[#059669] hover:bg-white/5 cursor-pointer transition-colors"
                  title="Export grid as CSV"
                >
                  <FileSpreadsheet size={13} />
                </button>
                <button
                  onClick={handleExportJSON}
                  className="p-1.5 rounded text-prizm-text-muted hover:text-cyan-400 hover:bg-white/5 cursor-pointer transition-colors"
                  title="Export raw JSON packet payload"
                >
                  <Download size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* ACTIVE FILTER NOTIFIER */}
          {selectedCategory && (
            <div className="bg-prizm-primary/5 border border-prizm-primary/25 px-3 py-2 rounded flex items-center justify-between text-xs text-prizm-text font-sans">
              <span className="flex items-center gap-1.5 uppercase font-mono text-[10.5px]">
                <Settings size={12} className="text-prizm-primary animate-pulse" />
                Highlight Filter: Showing only units with active issues in <strong className="text-cyan-300">{(categories.find(c => c.id === selectedCategory))?.label}</strong>.
              </span>
              <button 
                onClick={() => setSelectedCategory(null)}
                className="text-[9.5px]/none uppercase font-mono font-bold text-prizm-primary hover:underline cursor-pointer"
              >
                Clear Count Filter
              </button>
            </div>
          )}

          {/* MASTER DETAIL TABLE VIEWPORT */}
          <div className="border border-prizm-border rounded-lg overflow-x-auto bg-[#07090C] shadow-lg max-h-[700px] relative scrollbar-thin">
            <table className="w-full text-left text-[11px] leading-normal border-collapse min-w-[1450px]">
              
              {/* STICKY HEADER */}
              <thead className="sticky top-0 bg-[#0F111A] z-10 select-none shadow border-b border-prizm-border">
                {/* 1st row: Column groups */}
                <tr className="text-[#64748B] text-[8.5px] uppercase font-bold text-center border-b border-prizm-border/30">
                  <th colSpan={6} className="p-2 border-r border-prizm-border/40 bg-prizm-surface/20 text-left pl-3 text-prizm-text-muted font-mono text-[9px] uppercase tracking-wider">
                    Site Topology Address
                  </th>
                  <th colSpan={1} className="p-2 border-r border-prizm-border bg-emerald-900/10 text-emerald-400 font-bold uppercase text-[9px] tracking-wider">
                    Emergency Sensors
                  </th>
                  <th colSpan={2} className="p-2 border-r border-prizm-border bg-blue-950/10 text-blue-400 font-bold uppercase text-[9px] tracking-wider">
                    Com Status
                  </th>
                  <th colSpan={4} className="p-2 border-r border-prizm-border bg-purple-950/10 text-purple-400 font-bold uppercase text-[9px] tracking-wider">
                    Door Sensors
                  </th>
                  <th colSpan={9} className="p-2 border-r border-prizm-border bg-prizm-bg text-prizm-text font-bold uppercase text-[9px] tracking-wider">
                    Environmental / Safety
                  </th>
                  <th colSpan={1} className="p-2 bg-prizm-bg text-[#A78BFA] font-bold uppercase text-[9px] tracking-wider">
                    Other Sensors
                  </th>
                </tr>

                {/* 2nd row: Column elements headers */}
                <tr className="text-prizm-text-muted uppercase text-[9px] font-semibold border-b border-prizm-border">
                  {/* Topology group */}
                  <th className="p-2.5 pl-3 w-10 text-center">HLTH</th>
                  <th className="p-2.5 w-[210px] text-left">Location Label / ID</th>
                  <th className="p-2.5 text-center w-14">Seg Idx</th>
                  <th className="p-2.5 text-center w-14">Lineup</th>
                  <th className="p-2.5 text-center w-14">Position</th>
                  <th className="p-2.5 text-center w-14 border-r border-prizm-border/50">Arrays</th>

                  {/* Emergency */}
                  <th className="p-2 text-center w-14 border-r border-prizm-border/50 bg-[#059669]/5" title="Moisture Detection Sensor">Moisture</th>

                  {/* Com Status */}
                  <th className="p-2 text-center w-14" title="IO communications controller online">IO</th>
                  <th className="p-2 text-center w-14 border-r border-prizm-border/50" title="Data/Aux Communications Link">Data Comms</th>

                  {/* Doors Group */}
                  <th className="p-2 text-center w-14" title="AC electrical cabinets enclosure door">AC Doors</th>
                  <th className="p-2 text-center w-14" title="DC inverter bus cabinet containment doors">DC Doors</th>
                  <th className="p-2 text-center w-14" title="Top Cap containment louver hatch open status">Top Cap</th>
                  <th className="p-2 text-center w-14 border-r border-prizm-border/50" title="Container compartment auxiliary battery door status">Battery</th>

                  {/* Env/Safety */}
                  <th className="p-2 text-center w-14" title="Fire detection panel warning state">Fire</th>
                  <th className="p-2 text-center w-14" title="Fire panel secondary trouble monitoring status">Fire Trb</th>
                  <th className="p-2 text-center w-14" title="Smoke aerosol density warning">Smoke</th>
                  <th className="p-2 text-center w-14" title="Internal containment cabinet thermistors sensor">Heat</th>
                  <th className="p-2 text-center w-14" title="Hydrogen gas target PPM warning">Hydrogen</th>
                  <th className="p-2 text-center w-14" title="Hydrogen sensor diagnostic loop integrity fault">H2 Fault</th>
                  <th className="p-2 text-center w-14" title="Manual fan override active status">Man Vent</th>
                  <th className="p-2 text-center w-14" title="Environmental control thermostat alarm status">Env Ctrl</th>
                  <th className="p-2 text-center w-14 border-r border-prizm-border/50 bg-[#1e1b4b]/10" title="Uninterruptible power supply telemetry warning">UPS Alarm</th>

                  {/* Other Sensors */}
                  <th className="p-2 text-center w-14 bg-[#1e1b4b]/20" title="Modbus master E-Stop emergency loop">Modbus E-Stop</th>
                </tr>
              </thead>

              {/* TABLE BODY DECORATION: ALTERNATING STRIPED ROWS */}
              <tbody className="divide-y divide-prizm-border/50 font-mono text-[10.5px]">
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={23} className="p-8 text-center text-prizm-text-muted">
                      Loading real-time site safety telemetry matrix...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={23} className="p-8 text-center text-prizm-text-muted italic">
                      No matching hardware sensor records discovered with current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => {
                    const isEven = index % 2 === 0;
                    return (
                      <tr 
                        key={row.id} 
                        className={`hover:bg-prizm-primary/[0.02] transition-colors leading-tight ${
                          isEven ? "bg-prizm-surface/15" : "bg-transparent"
                        }`}
                      >
                        {/* Overall health badge */}
                        <td className="p-2 pl-3 text-center">
                          <div className="flex justify-center">{renderRowHealth(row.health)}</div>
                        </td>

                        {/* Location address information */}
                        <td className="p-2 font-medium py-2.5 max-w-[210px] truncate leading-tight" title={`${row.displayLabel}\nIP Address: ${row.deviceIp ?? 'N/A'}`}>
                          <span className="text-prizm-text font-semibold block truncate">{row.displayLabel}</span>
                          <span className="text-[9px] text-[#059669] block leading-none mt-0.5">{row.deviceIp ?? "10.0.0.x / Unassigned"}</span>
                        </td>

                        {/* segment index */}
                        <td className="p-2 text-center text-prizm-text-muted font-mono font-semibold">
                          {row.segmentIndex ?? "—"}
                        </td>

                        {/* lineup index */}
                        <td className="p-2 text-center text-[#A78BFA] font-bold">
                          {row.lineupIndex ? `L${row.lineupIndex}` : "—"}
                        </td>

                        {/* segment position */}
                        <td className="p-2 text-center text-amber-500 font-bold">
                          {row.segmentPosition || "—"}
                        </td>

                        {/* segment position or arrayIndex */}
                        <td className="p-2 text-center text-cyan-400 border-r border-prizm-border font-bold">
                          {row.arrayIndex ? `A${row.arrayIndex}` : "—"}
                        </td>

                        {/* Emergency: Moisture */}
                        <td className="p-1 bg-[#059669]/5 border-r border-prizm-border/50">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.moisture, "MOISTURE")}</div>
                        </td>

                        {/* Com status Group */}
                        <td className="p-1">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.ioCommunications, "IO COMMUNICATIONS")}</div>
                        </td>
                        <td className="p-1 border-r border-prizm-border/50">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.dataCommunications, "DATA COMMUNICATIONS")}</div>
                        </td>

                        {/* Doors Group */}
                        <td className="p-1">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.acDoors, "AC DOORS")}</div>
                        </td>
                        <td className="p-1">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.dcDoors, "DC DOORS")}</div>
                        </td>
                        <td className="p-1">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.topCapDoor, "TOP CAP DOOR")}</div>
                        </td>
                        <td className="p-1 border-r border-prizm-border/50">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.batteryDoors, "BATTERY DOORS")}</div>
                        </td>

                        {/* Environmental / Safety Group */}
                        <td className="p-1">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.fire, "FIRE")}</div>
                        </td>
                        <td className="p-1">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.fireTrouble, "FIRE TROUBLE")}</div>
                        </td>
                        <td className="p-1">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.smoke, "SMOKE")}</div>
                        </td>
                        <td className="p-1">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.heat, "HEAT")}</div>
                        </td>
                        <td className="p-1">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.hydrogen, "HYDROGEN")}</div>
                        </td>
                        <td className="p-1">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.hydrogenFault, "HYDROGEN FAULT")}</div>
                        </td>
                        <td className="p-1">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.manualVentilation, "MANUAL VENTILATION")}</div>
                        </td>
                        <td className="p-1">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.envCtrl, "ENV CTRL")}</div>
                        </td>
                        <td className="p-1 border-r border-prizm-border/50 bg-[#1e1b4b]/5">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.upsAlarm, "UPS ALARM")}</div>
                        </td>

                        {/* Other Sensors Group */}
                        <td className="p-1 bg-[#1e1b4b]/10">
                          <div className="flex justify-center">{renderCellIcon(row.sensors?.modbusEStop, "STATION-WIDE / MODBUS E-STOP")}</div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* TELEMETRY EMPTY STATE INFO BANNER */}
          {filteredRows.length === 0 && !loading && (
            <div className="bg-prizm-surface border border-dashed border-prizm-border/80 rounded-lg p-8 text-center space-y-2 font-mono">
              <AlertTriangle className="mx-auto text-amber-500 animate-bounce" size={24} />
              <p className="text-white text-xs font-bold uppercase tracking-wider">No Active Sensors Found</p>
              <p className="text-prizm-text-muted text-[11px] max-w-sm mx-auto font-sans leading-relaxed">
                No telemetry sensor lines are currently active matching your criteria. Try reseting the filters or clear active search queries.
              </p>
              <button
                onClick={handleResetDefaults}
                className="bg-prizm-primary/10 border border-prizm-primary/40 text-cyan-300 font-bold text-[10px] px-3.5 py-1.5 rounded uppercase hover:bg-prizm-primary/20 cursor-pointer transition mt-2 font-mono"
              >
                Reset Search Filters
              </button>
            </div>
          )}

          {/* SENSOR HEALTH EXTRAS GUIDE */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-2.5 rounded bg-prizm-surface border border-prizm-border text-[10.5px] text-prizm-text-muted font-sans space-y-0.5">
              <span className="font-bold text-white uppercase block font-mono text-[9px] text-cyan-400">site fire panel gateway</span>
              <p>Site-wide master gateway maps dry contact points from the Siemens FC-200 central station module directly. Real-time updates occur via Modbus TCP on slave address ID "FC200".</p>
            </div>
            <div className="p-2.5 rounded bg-prizm-surface border border-prizm-border text-[10.5px] text-prizm-text-muted font-sans space-y-0.5">
              <span className="font-bold text-white uppercase block font-mono text-[9px] text-[#F472B6]">collection segment nodes</span>
              <p>Lineup collectors acts as localized Modbus masters polling cluster strings and compiling HVAC, door interlocks and UPS alarms. Monitored on network segments 10.1.X.X - 10.4.X.X.</p>
            </div>
            <div className="p-2.5 rounded bg-prizm-surface border border-prizm-border text-[10.5px] text-prizm-text-muted font-sans space-y-0.5">
              <span className="font-bold text-white uppercase block font-mono text-[9px] text-[#10B981]">string card transducers</span>
              <p>Physical inverters report containment hydrogen PPM concentration and cabinet door contact switch states continuously. Fault blocks highlight structural containment problems.</p>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
