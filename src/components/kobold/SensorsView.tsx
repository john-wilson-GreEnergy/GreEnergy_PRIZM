import { markPerf } from '../../lib/perf';
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
  Download, 
  Settings,
  X,
  Play,
  FileSpreadsheet,
  Cpu
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Matches NormalizedSensorRow from siteSensorsRoutes.ts
interface NormalizedSensorRow {
  stationCode: string;
  blockIndex: number;
  lineupId: number;
  segmentId: number;
  segmentType: string;
  siteConnected: boolean;
  segmentCommunicating: boolean;
  temperatureValue: number;
  temperatureUnit: string;
  temperatureStatus: string;
  temperatureCommunicating: boolean;
  fireSuppressionStatus: string;
  fireSuppressionCommunicating: boolean;
  heatStatus: string;
  heatCommunicating: boolean;
  heatTrippedTimestamp: string | null;
  gasStatus: string;
  gasCommunicating: boolean;
  gasTrippedTimestamp: string | null;
  smokeStatus: string;
  smokeCommunicating: boolean;
  smokeTrippedTimestamp: string | null;
  overallStatus: "OK" | "WARNING" | "FAULT" | "UNHEALTHY";
  severity: "OK" | "Warning" | "Critical";
  findings: string[];
  sourcePath: string;
  raw: any;
}

type FilterType = "all" | "abnormal" | "temp" | "heat" | "smoke" | "gas" | "fss" | "comm";

export default function SensorsView() {
  const [rows, setRows] = useState<NormalizedSensorRow[]>([]);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Developer Signal Simulator State
  const [showSimulator, setShowSimulator] = useState(false);
  const [simTargetLineup, setSimTargetLineup] = useState<number>(148);
  const [simTargetSegment, setSimTargetSegment] = useState<number>(164);
  const [simCategory, setSimCategory] = useState<string>("temperatureStatus");
  const [simValue, setSimValue] = useState<string>("HIGH");
  const [simTempValue, setSimTempValue] = useState<number>(131);
  const [injecting, setInjecting] = useState(false);

  // Fetch summary endpoint from PRIZM server
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
        setSummaryData(data);
      } else {
        setError(data.error || "Failed to process site sensors summary payload");
      }
    } catch (err: any) {
      setError(err?.message || "Fault encountered while contacting local site-sensors endpoint");
    } finally {
      setLoading(false);
      setRefreshing(false);
      markPerf('SensorsView Load', t0);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter Helper
  const isAbnormal = (statusStr: string | undefined): boolean => {
    if (!statusStr) return false;
    const upper = statusStr.trim().toUpperCase();
    if (upper === "NOT_HIGH" || upper === "NOT_TRIPPED" || upper === "NOT_INSTALLED" || upper === "NORMAL") {
      return false;
    }
    return true;
  };

  // 1. Process client side filtering
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      // Pill Filtering
      if (activeFilter === "abnormal" && row.severity === "OK") return false;
      if (activeFilter === "temp" && row.temperatureStatus !== "HIGH") return false;
      if (activeFilter === "heat" && !isAbnormal(row.heatStatus)) return false;
      if (activeFilter === "smoke" && !isAbnormal(row.smokeStatus)) return false;
      if (activeFilter === "gas" && !isAbnormal(row.gasStatus)) return false;
      if (activeFilter === "fss" && !isAbnormal(row.fireSuppressionStatus)) return false;
      if (activeFilter === "comm" && row.segmentCommunicating) return false;

      // Text search matching line up ID, segment ID or findings text
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchLineup = row.lineupId.toString().includes(q);
        const matchSegment = row.segmentId.toString().includes(q);
        const matchType = row.segmentType.toLowerCase().includes(q);
        const matchFindings = row.findings.some(f => f.toLowerCase().includes(q));

        if (!matchLineup && !matchSegment && !matchType && !matchFindings) {
          return false;
        }
      }

      return true;
    });
  }, [rows, activeFilter, searchQuery]);

  // 2. Default Sort Implementation: Critical first, then Warning, then OK, then lineupId, then segmentId
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const getSeverityWeight = (sev: string) => {
        if (sev === "Critical") return 3;
        if (sev === "Warning") return 2;
        return 1;
      };

      const weightA = getSeverityWeight(a.severity);
      const weightB = getSeverityWeight(b.severity);

      if (weightA !== weightB) {
        return weightB - weightA; // High severity first
      }

      if (a.lineupId !== b.lineupId) {
        return a.lineupId - b.lineupId; // Ascending Order for Lineup
      }

      return a.segmentId - b.segmentId; // Ascending Order for Segment
    });
  }, [filteredRows]);

  // Execute override signals to dev simulator endpoints
  const handleInject = async () => {
    setInjecting(true);
    const targetId = `segment-${simTargetLineup}-${simTargetSegment}`;
    let valToInject: any = simValue;

    if (simCategory === "temperatureValue") {
      valToInject = simTempValue;
    }

    try {
      // First save the primary target state override on the backend
      const res = await fetch("/api/local/site-sensors/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetId,
          category: simCategory,
          value: valToInject
        })
      });

      // Special handling: if we set status HIGH, sync temperatureValue
      if (simCategory === "temperatureStatus" && simValue === "HIGH") {
        await fetch("/api/local/site-sensors/override", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: targetId,
            category: "temperatureValue",
            value: 131
          })
        });
      }

      const parsed = await res.json();
      if (parsed.success) {
        await loadData(false);
      }
    } catch (e: any) {
      alert("Failed injecting simulator command: " + e.message);
    } finally {
      setInjecting(false);
    }
  };

  // Restore baseline state
  const handleResetDefaults = async () => {
    setInjecting(true);
    try {
      const res = await fetch("/api/local/site-sensors/reset", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSearchQuery("");
        setActiveFilter("all");
        await loadData(false);
      }
    } catch (e: any) {
      alert("Failed clearing overrides: " + e.message);
    } finally {
      setInjecting(false);
    }
  };

  // Export CSV mapping exactly the v2 schema
  const handleExportCSV = () => {
    const headers = [
      "Lineup ID", "Segment ID", "Type", "Temp Value", "Temp Status", "Heat Status", "Smoke Status", "Gas Status", "Fire Suppression", "Comm Status", "Severity", "Findings"
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
      ...sortedRows.map(row => [
        row.lineupId,
        row.segmentId,
        row.segmentType,
        `${row.temperatureValue}°${row.temperatureUnit}`,
        row.temperatureStatus,
        row.heatStatus,
        row.smokeStatus,
        row.gasStatus,
        row.fireSuppressionStatus,
        row.segmentCommunicating ? "CONNECTED" : "OFFLINE",
        row.severity,
        row.findings.join("; ")
      ].map(escapeCSV).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prizm_sensors_v2_export_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  // Export literal raw JSON
  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(summaryData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prizm_sensors_v2_export_${new Date().toISOString().split("T")[0]}.json`;
    link.click();
  };

  // Status badges classes mapping
  const getBadgeClass = (status: string, category: "temp" | "heat" | "smoke" | "gas" | "fss" | "comm" | "severity") => {
    const s = status.trim().toUpperCase();

    if (category === "comm") {
      return status === "true" || s === "CONNECTED"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
        : "bg-red-50 text-red-700 border-red-200 animate-pulse";
    }

    if (category === "severity") {
      if (s === "CRITICAL") return "bg-red-100 text-red-800 border-red-300 font-bold animate-pulse";
      if (s === "WARNING") return "bg-amber-100 text-amber-800 border-amber-300 font-bold";
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    }

    if (category === "fss" && s === "NOT_INSTALLED") {
      return "bg-slate-50 text-slate-500 border-slate-100";
    }

    if (s === "NOT_HIGH" || s === "NOT_TRIPPED" || s === "NORMAL") {
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    }

    // Abnormal
    return "bg-red-50 text-red-700 border-red-100 animate-pulse font-medium";
  };

  return (
    <div className="space-y-6" id="sensors-and-safety-health-dashboard">
      
      {/* Upper Navigation and Details Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-rose-50 rounded text-rose-600">
                <Flame size={20} className="stroke-[2]" />
              </span>
              <h1 className="text-xl font-bold font-sans text-slate-900 tracking-tight">
                Sensors & Safety Health Diagnostics
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Active LAN Turtle client pipeline parsing sub-cabinet environment, FSS triggers, and Modbus safety telemetry.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Live diagnostics status pills */}
            <div className="text-[10px] font-mono bg-slate-50 border border-slate-100 rounded-md py-1.5 px-3 flex items-center gap-4 text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${summaryData?.rows?.some((r: any) => !r.siteConnected) ? "bg-red-500 animate-ping" : "bg-emerald-500"}`} />
                <span>Station: <strong className="text-slate-800">{summaryData?.stationCode || "BHE0021"} (Block {summaryData?.blockIndex || 1})</strong></span>
              </div>
              <div className="h-3 w-px bg-slate-200" />
              <span>Telemetry: <strong className="text-emerald-600">CONNECTED / PARSED</strong></span>
            </div>

            <button 
              onClick={() => loadData(true)} 
              disabled={refreshing || loading}
              className="flex items-center gap-1.5 text-xs bg-slate-100 hover:bg-slate-200 transition-colors text-slate-700 py-1.5 px-3 rounded-md font-medium border border-slate-200"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Querying..." : "Sync Sensors"}
            </button>

            <button 
              onClick={() => setShowSimulator(!showSimulator)} 
              className="flex items-center gap-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors py-1.5 px-3 rounded-md border border-indigo-200 font-medium"
            >
              <Settings size={13} />
              Developer Sim
            </button>
          </div>
        </div>

        {/* Diagnostics sources health info card (Rule 6) */}
        {summaryData?.sourceHealth && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2">
              LAN Turtle Diagnostics Cache Tracing
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {summaryData.sourceHealth.map((src: any, index: number) => (
                <div key={index} className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-between text-xs font-mono">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-blue-700 font-bold break-all">{src.endpoint}</span>
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${src.success ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                      {src.success ? "ONLINE/PARSED" : "UNREACHABLE"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] text-slate-500">
                    <div>HTTP: <strong className="text-slate-800">{src.statusCode || "N/A"}</strong></div>
                    <div>Length: <strong className="text-slate-800">{src.bytes ? `${(src.bytes / 1024).toFixed(2)} KB` : "0 B"}</strong></div>
                    <div className="truncate">Timestamp: <strong className="text-slate-850" title={src.timestamp}>{new Date(src.timestamp).toLocaleTimeString()}</strong></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Simulator sliding cabinet drawer panel */}
      <AnimatePresence>
        {showSimulator && (
          <motion.div 
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-indigo-950 text-white border border-indigo-800 rounded-lg p-5 shadow-inner"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-sm font-bold text-indigo-200 uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <Cpu size={14} className="animate-spin" />
                  BESS Sentinel Simulator Interlock Console
                </h3>
                <p className="text-xs text-indigo-300 mt-1">
                  Inject alarm testing conditions to evaluate local system safety mitigation actions.
                </p>
              </div>
              <button 
                onClick={() => setShowSimulator(false)}
                className="p-1 hover:bg-indigo-800/50 rounded-full text-indigo-300"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end text-xs font-mono">
              <div>
                <label className="block text-indigo-200 mb-1.5 font-bold">Lineup ID</label>
                <select 
                  value={simTargetLineup} 
                  onChange={(e) => setSimTargetLineup(Number(e.target.value))}
                  className="w-full bg-indigo-900 border border-indigo-700 rounded p-2 text-white outline-none"
                >
                  <option value={141}>Lineup 141</option>
                  <option value={142}>Lineup 142</option>
                  <option value={143}>Lineup 143</option>
                  <option value={144}>Lineup 144</option>
                  <option value={145}>Lineup 145</option>
                  <option value={146}>Lineup 146</option>
                  <option value={147}>Lineup 147</option>
                  <option value={148}>Lineup 148 (High Temp Default)</option>
                </select>
              </div>

              <div>
                <label className="block text-indigo-200 mb-1.5 font-bold">Segment ID</label>
                <input 
                  type="number"
                  value={simTargetSegment}
                  onChange={(e) => setSimTargetSegment(Number(e.target.value))}
                  className="w-full bg-indigo-900 border border-indigo-700 rounded p-2 text-white outline-none font-sans"
                />
              </div>

              <div>
                <label className="block text-indigo-200 mb-1.5 font-bold">Cabinet Category</label>
                <select 
                  value={simCategory} 
                  onChange={(e) => setSimCategory(e.target.value)}
                  className="w-full bg-indigo-900 border border-indigo-700 rounded p-2 text-white outline-none"
                >
                  <option value="temperatureStatus">Temperature Status</option>
                  <option value="temperatureValue">Temperature Value (°F)</option>
                  <option value="heatStatus">Heat Sensor State</option>
                  <option value="smokeStatus">Smoking Sensor State</option>
                  <option value="gasStatus">Toxic Gas State</option>
                  <option value="fireSuppressionStatus">FSS Suppression Status</option>
                  <option value="segmentCommunicating">Comms Interlock (Connected?)</option>
                </select>
              </div>

              <div>
                <label className="block text-indigo-200 mb-1.5 font-bold">State Value</label>
                {simCategory === "temperatureValue" ? (
                  <input 
                    type="number" 
                    value={simTempValue} 
                    onChange={(e) => setSimTempValue(Number(e.target.value))}
                    className="w-full bg-indigo-900 border border-indigo-700 rounded p-2 text-white outline-none font-sans"
                  />
                ) : simCategory === "segmentCommunicating" ? (
                  <select 
                    value={simValue} 
                    onChange={(e) => setSimValue(e.target.value)}
                    className="w-full bg-indigo-900 border border-indigo-700 rounded p-2 text-white outline-none"
                  >
                    <option value="true">YES (Connected)</option>
                    <option value="false">NO (Offline)</option>
                  </select>
                ) : (
                  <select 
                    value={simValue} 
                    onChange={(e) => setSimValue(e.target.value)}
                    className="w-full bg-indigo-900 border border-indigo-700 rounded p-2 text-white outline-none"
                  >
                    <option value="NOT_HIGH">NOT_HIGH</option>
                    <option value="HIGH">HIGH (Alarm)</option>
                    <option value="NOT_TRIPPED">NOT_TRIPPED</option>
                    <option value="TRIPPED">TRIPPED (Physical Fault)</option>
                    <option value="NOT_INSTALLED">NOT_INSTALLED</option>
                  </select>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button 
                onClick={handleResetDefaults}
                disabled={injecting}
                className="bg-indigo-900 hover:bg-indigo-800 transition-colors border border-indigo-700 text-indigo-200 px-4 py-2 text-xs rounded font-bold font-mono"
              >
                Clear Simulator Overrides
              </button>
              <button 
                onClick={handleInject}
                disabled={injecting}
                className="bg-indigo-500 hover:bg-indigo-400 transition-all text-white px-5 py-2 text-xs rounded font-bold font-mono flex items-center gap-1.5"
              >
                <Play size={10} className="fill-current" />
                {injecting ? "Injected..." : "Inject Interlock Signal"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary Cards Grid (Rule 7) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Card 1: Total Lineups */}
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Lineups</span>
          <div className="flex justify-between items-end mt-2">
            <span className="text-2xl font-black text-slate-900">{summaryData?.totalCentipedeLineups || 8}</span>
            <span className="text-slate-300"><Layers size={22} /></span>
          </div>
        </div>

        {/* Card 2: Healthy Lineups */}
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Healthy Lineups</span>
          <div className="flex justify-between items-end mt-2">
            <span className="text-2xl font-black text-emerald-600">{summaryData?.totalHealthyLineups ?? 7}</span>
            <span className="text-emerald-200"><CheckCircle size={22} /></span>
          </div>
        </div>

        {/* Card 3: Faulty Lineups */}
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Faulty Lineups</span>
          <div className="flex justify-between items-end mt-2">
            <span className={`text-2xl font-black ${summaryData?.totalFaultyLineups > 0 ? "text-red-600 animate-pulse" : "text-slate-800"}`}>
              {summaryData?.totalFaultyLineups ?? 1}
            </span>
            <span className={summaryData?.totalFaultyLineups > 0 ? "text-red-300 animate-bounce" : "text-slate-300"}>
              <ShieldAlert size={22} />
            </span>
          </div>
        </div>

        {/* Card 4: Abnormal Segments */}
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Abnormal Segs</span>
          <div className="flex justify-between items-end mt-2">
            <span className={`text-2xl font-black ${summaryData?.totalAbnormalSegments > 0 ? "text-rose-600 font-extrabold" : "text-slate-800"}`}>
              {summaryData?.totalAbnormalSegments ?? 1}
            </span>
            <span className="text-slate-300"><Layers size={22} /></span>
          </div>
        </div>

        {/* Card 5: High Temp Segments */}
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">High Temp Cards</span>
          <div className="flex justify-between items-end mt-2">
            <span className={`text-2xl font-black ${summaryData?.totalHighTempSegments > 0 ? "text-red-600 animate-pulse" : "text-slate-800"}`}>
              {summaryData?.totalHighTempSegments ?? 1}
            </span>
            <span className="text-slate-300"><Thermometer size={22} /></span>
          </div>
        </div>

        {/* Card 6: Tripped Smoke/Gas/Heat */}
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Tripped Sensor</span>
          <div className="flex justify-between items-end mt-2">
            <span className={`text-2xl font-black ${summaryData?.totalTrippedSensors > 0 ? "text-red-600" : "text-slate-800"}`}>
              {summaryData?.totalTrippedSensors ?? 0}
            </span>
            <span className="text-slate-300"><Flame size={22} /></span>
          </div>
        </div>

        {/* Card 7: Non-Communicating */}
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Comms Offline</span>
          <div className="flex justify-between items-end mt-2">
            <span className={`text-2xl font-black ${summaryData?.totalNonCommunicating > 0 ? "text-red-500 animate-pulse" : "text-slate-800"}`}>
              {summaryData?.totalNonCommunicating ?? 0}
            </span>
            <span className="text-slate-300"><WifiOff size={22} /></span>
          </div>
        </div>
      </div>

      {/* Filter and Table Panel */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
        
        {/* Controller Bar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
          
          {/* Pills filters */}
          <div className="flex flex-wrap gap-1.5">
            <button 
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeFilter === "all" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              All Segments
            </button>
            <button 
              onClick={() => setActiveFilter("abnormal")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                activeFilter === "abnormal" ? "bg-rose-600 text-white shadow-sm" : "bg-rose-50 border border-rose-100 text-rose-700 hover:bg-rose-100"
              }`}
            >
              Abnormal Only
            </button>
            <button 
              onClick={() => setActiveFilter("temp")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                activeFilter === "temp" ? "bg-red-900 text-white shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Thermometer size={12} />
              Temperature
            </button>
            <button 
              onClick={() => setActiveFilter("heat")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                activeFilter === "heat" ? "bg-red-700 text-white shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Flame size={12} />
              Heat
            </button>
            <button 
              onClick={() => setActiveFilter("smoke")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                activeFilter === "smoke" ? "bg-amber-600 text-white shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Wind size={12} />
              Smoke
            </button>
            <button 
              onClick={() => setActiveFilter("gas")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                activeFilter === "gas" ? "bg-violet-700 text-white shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Layers size={12} />
              Gas
            </button>
            <button 
              onClick={() => setActiveFilter("fss")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                activeFilter === "fss" ? "bg-blue-800 text-white shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Shield size={12} />
              Fire Suppression
            </button>
            <button 
              onClick={() => setActiveFilter("comm")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1 ${
                activeFilter === "comm" ? "bg-slate-800 text-white shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <WifiOff size={12} />
              Non-Comm
            </button>
          </div>

          {/* Search tool */}
          <div className="relative w-full sm:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400 pointer-events-none">
              <Search size={14} />
            </span>
            <input 
              type="text" 
              placeholder="Search lineup, segment..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-md py-1.5 pl-8 pr-3 text-xs outline-none text-slate-800 hover:bg-slate-100/50 transition-colors focus:bg-white focus:border-slate-400 font-sans"
            />
          </div>
        </div>

        {/* Table View (Rule 7, Default Sort: Critical first, then lineage indexes) */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center text-slate-500 gap-2">
              <RefreshCw className="animate-spin text-slate-400" size={24} />
              <span className="text-xs font-mono">Resolving LAN Turtle site telemetry...</span>
            </div>
          ) : sortedRows.length === 0 ? (
            <div className="p-16 text-center text-slate-450 text-xs font-mono">
              No segment records detected matching the selected filter constraints.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  <th className="py-2.5 px-3">Lineup Id</th>
                  <th className="py-2.5 px-3">Segment Id</th>
                  <th className="py-2.5 px-1 bg-slate-100/30">Type</th>
                  <th className="py-2.5 px-3 text-center">Temp Metric</th>
                  <th className="py-2.5 px-3 text-center">Temp Status</th>
                  <th className="py-2.5 px-3 text-center">Heat Sens</th>
                  <th className="py-2.5 px-3 text-center">Smoke Sens</th>
                  <th className="py-2.5 px-3 text-center">Toxic Gas</th>
                  <th className="py-2.5 px-3 text-center">Fire Suppression</th>
                  <th className="py-2.5 px-3 text-center">Segment Comm</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Findings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map((row, index) => (
                  <tr 
                    key={`${row.lineupId}-${row.segmentId}-${index}`}
                    className={`hover:bg-slate-50 transition-colors group ${row.severity !== "OK" ? "bg-rose-50/20" : ""}`}
                  >
                    {/* Lineup Id */}
                    <td className="py-3 px-3 font-semibold font-mono text-slate-700">
                      Lineup {row.lineupId}
                    </td>

                    {/* Segment Id */}
                    <td className="py-3 px-3 font-semibold font-mono text-slate-800">
                      #{row.segmentId}
                    </td>

                    {/* Segment Type */}
                    <td className="py-3 px-1 text-slate-500 font-mono text-[9px] uppercase tracking-wider">
                      {row.segmentType}
                    </td>

                    {/* Temp Value */}
                    <td className="py-3 px-3 text-center font-mono font-medium">
                      <span className={`inline-flex items-center gap-0.5 justify-center ${row.temperatureStatus === "HIGH" ? "text-red-600 font-bold" : "text-slate-600"}`}>
                        <Thermometer size={12} className={row.temperatureStatus === "HIGH" ? "text-red-500" : "text-slate-400"} />
                        {row.temperatureValue}°{row.temperatureUnit}
                      </span>
                    </td>

                    {/* Temp Status Badge */}
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${getBadgeClass(row.temperatureStatus, "temp")}`}>
                        {row.temperatureStatus}
                      </span>
                    </td>

                    {/* Heat State */}
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${getBadgeClass(row.heatStatus, "heat")}`}>
                        {row.heatStatus}
                      </span>
                    </td>

                    {/* Smoke Badge */}
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${getBadgeClass(row.smokeStatus, "smoke")}`}>
                        {row.smokeStatus}
                      </span>
                    </td>

                    {/* Gas State */}
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${getBadgeClass(row.gasStatus, "gas")}`}>
                        {row.gasStatus}
                      </span>
                    </td>

                    {/* Suppression Badge with NOT_INSTALLED filter exception */}
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${getBadgeClass(row.fireSuppressionStatus, "fss")}`}>
                        {row.fireSuppressionStatus === "NOT_INSTALLED" ? "Not Installed" : row.fireSuppressionStatus}
                      </span>
                    </td>

                    {/* Seg Comm Link */}
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border flex items-center justify-center gap-1.5 w-24 mx-auto ${getBadgeClass(String(row.segmentCommunicating), "comm")}`}>
                        {row.segmentCommunicating ? (
                          <>
                            <Wifi size={11} className="text-emerald-500" />
                            Connected
                          </>
                        ) : (
                          <>
                            <WifiOff size={11} className="text-red-500" />
                            Offline
                          </>
                        )}
                      </span>
                    </td>

                    {/* Severity Badge */}
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border font-bold uppercase tracking-wider ${getBadgeClass(row.severity, "severity")}`}>
                        {row.severity}
                      </span>
                    </td>

                    {/* Field findings log list */}
                    <td className="py-3 px-3">
                      {row.findings.length === 0 ? (
                        <span className="text-emerald-600 font-mono text-[10px] flex items-center gap-1">
                          <CheckCircle size={11} /> Clear
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {row.findings.map((f, i) => (
                            <span key={i} className="text-rose-700 bg-rose-50/75 border border-rose-100 rounded px-1.5 py-0.5 text-[9px] font-mono max-w-xs break-words">
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-3 justify-between items-center text-xs text-slate-500">
          <div className="font-mono">
            Showing <strong className="text-slate-800">{filteredRows.length}</strong> of {rows.length} total segments
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handleExportCSV} 
              disabled={loading || rows.length === 0}
              className="flex items-center gap-1 bg-white hover:bg-slate-100 text-slate-700 transition-colors py-1.5 px-3 rounded-md font-medium border border-slate-200"
            >
              <FileSpreadsheet size={13} />
              Export CSV
            </button>
            <button 
              onClick={handleExportJSON} 
              disabled={loading || rows.length === 0}
              className="flex items-center gap-1 bg-white hover:bg-slate-100 text-slate-700 transition-colors py-1.5 px-3 rounded-md font-medium border border-slate-200"
            >
              <Download size={13} />
              Export Raw Payload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
