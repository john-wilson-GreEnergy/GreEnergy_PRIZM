import React, { useState, useEffect, useRef } from "react";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Database, 
  Download, 
  Eye, 
  FileText, 
  Filter, 
  Info, 
  RefreshCw, 
  Sliders, 
  Server, 
  Flame, 
  DoorOpen, 
  ShieldCheck, 
  TrendingUp, 
  Play, 
  Square,
  Trash2,
  ChevronRight,
  ChevronDown,
  Sparkles,
  HelpCircle
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from "recharts";

import { 
  HvacSimulationMode, 
  HvacValidationStatus, 
  HvacSimulationTarget, 
  HvacValidationResult, 
  HvacAuditEntry 
} from "../server/hvacSimulation/hvacSimulationTypes";

export default function HvacSimulationDashboard() {
  // --- Header states ---
  const [profileName, setProfileName] = useState<string>("Active Profile");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // --- Target Candidates & Selection ---
  const [allTargets, setAllTargets] = useState<HvacSimulationTarget[]>([]);
  const [selectedIps, setSelectedIps] = useState<string[]>([]);
  
  // Target Filters
  const [blockFilter, setBlockFilter] = useState<string>("all");
  const [arrayFilter, setArrayFilter] = useState<string>("all");
  const [stringFilter, setStringFilter] = useState<string>("all");
  const [reachableOnly, setReachableOnly] = useState<boolean>(false);
  const [includeCollection, setIncludeCollection] = useState<boolean>(false);

  // --- Active Simulation Settings ---
  const [selectedMode, setSelectedMode] = useState<HvacSimulationMode>("cooling");
  const [timeoutMinutes, setTimeoutMinutes] = useState<number>(30);
  const [normalizeBeforeApply, setNormalizeBeforeApply] = useState<boolean>(true);
  const [verifyAfterApply, setVerifyAfterApply] = useState<boolean>(true);
  const [concurrency, setConcurrency] = useState<number>(8);
  const [isApplying, setIsApplying] = useState<boolean>(false);

  // Boolean state toggles for secondary simulations
  const [topCapState, setTopCapState] = useState<boolean>(true);
  const [leakAlarmState, setLeakAlarmState] = useState<boolean>(false);
  const [acDoorState, setAcDoorState] = useState<boolean>(true);
  const [evState, setEvState] = useState<boolean>(false);

  // --- Advanced validation thresholds ---
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);
  const [fanCurrentMinA, setFanCurrentMinA] = useState<number>(1.5);
  const [compressorCurrentMinA, setCompressorCurrentMinA] = useState<number>(12.0);
  const [staleReportMaxAgeSec, setStaleReportMaxAgeSec] = useState<number>(15);
  const [responseGracePeriodSec, setResponseGracePeriodSec] = useState<number>(20);

  // --- Live Polling / Poller control ---
  const [pollingActive, setPollingActive] = useState<boolean>(false);
  const [pollingIntervalSec, setPollingIntervalSec] = useState<number>(3);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [latestResults, setLatestResults] = useState<HvacValidationResult[]>([]);
  const [lastPollTime, setLastPollTime] = useState<string | null>(null);

  // --- Graphing and Time-Series buffers ---
  // Tracks past 20 records per IP. Map schema: IP -> Array array of samples
  const [timeSeriesData, setTimeSeriesData] = useState<Record<string, any[]>>({});
  const [graphingIp, setGraphingIp] = useState<string>("");

  // --- Audit log ---
  const [auditLogs, setAuditLogs] = useState<HvacAuditEntry[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Diagnostics filter
  const [warningFilter, setWarningFilter] = useState<"all" | "warn-fail" | "not-responding" | "pass">("all");

  const pollerRef = useRef<any>(null);

  // 1. Initial Load targets & configuration
  const loadInitialData = async () => {
    setLoading(true);
    try {
      // Load capabilities
      const capRes = await fetch("/api/local/hvac-simulation/capabilities");
      if (capRes.ok) {
        const caps = await capRes.json();
        setFanCurrentMinA(caps.defaultValidation.fanCurrentMinA);
        setCompressorCurrentMinA(caps.defaultValidation.compressorCurrentMinA);
        setStaleReportMaxAgeSec(caps.defaultValidation.staleReportMaxAgeSec);
        setResponseGracePeriodSec(caps.defaultValidation.responseGracePeriodSec);
      }

      // Load targets
      const tRes = await fetch("/api/local/hvac-simulation/targets");
      if (tRes.ok) {
        const body = await tRes.json();
        setAllTargets(body.targets || []);
        
        // Auto-select first few devices just to make visual immediately ready
        const defaultSelect = (body.targets || [])
          .filter((t: HvacSimulationTarget) => !t.isCollectionSegment)
          .map((t: HvacSimulationTarget) => t.ip)
          .slice(0, 4);
        setSelectedIps(defaultSelect);
      }

      // Load Audits
      fetchAudits();
    } catch (e: any) {
      setErrorMsg("Failed to load HVAC topology models: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAudits = async () => {
    try {
      const aRes = await fetch("/api/local/hvac-simulation/audit");
      if (aRes.ok) {
        const body = await aRes.json();
        setAuditLogs(body.log || []);
      }
    } catch (e) {}
  };

  // Run on mount
  useEffect(() => {
    loadInitialData();
    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, []);

  // Update graphing IP dynamically if currently graphed IP becomes unselected or empty
  useEffect(() => {
    if (selectedIps.length > 0 && !selectedIps.includes(graphingIp)) {
      setGraphingIp(selectedIps[0]);
    }
  }, [selectedIps, graphingIp]);

  // Handle Poller Timer trigger
  useEffect(() => {
    if (pollingActive) {
      pollerRef.current = setInterval(() => {
        executeVerifyFetch();
      }, pollingIntervalSec * 1000);
    } else {
      if (pollerRef.current) {
        clearInterval(pollerRef.current);
        pollerRef.current = null;
      }
    }
    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, [pollingActive, pollingIntervalSec, selectedIps, selectedMode, startedAt]);

  // Execute verification inquiry
  const executeVerifyFetch = async () => {
    if (selectedIps.length === 0) return;
    try {
      const res = await fetch("/api/local/hvac-simulation/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetIps: selectedIps,
          mode: selectedMode,
          startedAt: startedAt || new Date().toISOString()
        })
      });

      if (res.ok) {
        const data = await res.json();
        setLatestResults(data.results || []);
        setLastPollTime(new Date().toLocaleTimeString());

        // Update in-memory time-series data
        const timestampStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        
        setTimeSeriesData((prevBuffer) => {
          const newBuffer = { ...prevBuffer };
          (data.results || []).forEach((row: HvacValidationResult) => {
            const h1cur = row.hvac1.currentA ?? 0;
            const h2cur = row.hvac2.currentA ?? 0;
            const spaceT = row.metrics.spaceTempC ?? 0;
            const supplyT = row.metrics.supplyAirTempC ?? 0;
            const cellT = row.metrics.avgCellTempC ?? 0;
            const spaceH = row.metrics.spaceHumidityPct ?? 0;
            const outsideH = row.metrics.outsideHumidityPct ?? 0;
            const h2ppm = row.metrics.hydrogenPpm ?? 0;
            const remTime = row.simulationRemainingMinutes ?? 0;

            const existingList = newBuffer[row.ip] || [];
            const updatedList = [
              ...existingList,
              {
                time: timestampStr,
                hvac1Current: h1cur,
                hvac2Current: h2cur,
                spaceTemp: spaceT,
                supplyTemp: supplyT,
                cellTemp: cellT,
                spaceHumidity: spaceH,
                outsideHumidity: outsideH,
                hydrogenPpm: h2ppm,
                remainingMinutes: remTime
              }
            ].slice(-20); // retain last 20 ticks

            newBuffer[row.ip] = updatedList;
          });
          return newBuffer;
        });

      }
    } catch (e) {}
  };

  // Filter utility models
  const filteredTargets = allTargets.filter(t => {
    // Block Filter
    if (blockFilter !== "all" && t.blockId !== blockFilter) return false;
    
    // Array Filter
    if (arrayFilter !== "all" && String(t.arrayIndex) !== arrayFilter) return false;
    
    // String Filter
    if (stringFilter !== "all" && String(t.stringIndex) !== stringFilter) return false;

    // Reachable Only Filter
    if (reachableOnly && !t.reachable) return false;

    // Include/Exclude Collection Segment Filter
    if (!includeCollection && t.isCollectionSegment) return false;

    return true;
  });

  // Action: Select target toggles
  const toggleSelectIp = (ip: string) => {
    setSelectedIps(prev => 
      prev.includes(ip) ? prev.filter(item => item !== ip) : [...prev, ip]
    );
  };

  const selectAllFiltered = () => {
    const filteredIps = filteredTargets.map(t => t.ip);
    setSelectedIps(prev => Array.from(new Set([...prev, ...filteredIps])));
  };

  const selectNoneFiltered = () => {
    const filteredIps = filteredTargets.map(t => t.ip);
    setSelectedIps(prev => prev.filter(ip => !filteredIps.includes(ip)));
  };

  // Options triggers
  const getSimPayloadRepresentation = () => {
    switch (selectedMode) {
      case "cooling":
      case "ldcool":
      case "bcool":
        return {
          values: [
            { name: "SpaceTemp", usingDefault: false, type: "NUMBER", value: "55", unit: "' Celsius" },
            { name: "UseCellSetpoint", usingDefault: false, type: "BOOLEAN", value: "false" }
          ]
        };
      case "heating":
        return {
          values: [
            { name: "SpaceTemp", usingDefault: false, type: "NUMBER", value: "5", unit: "' Celsius" },
            { name: "UseCellSetpoint", usingDefault: false, type: "BOOLEAN", value: "false" }
          ]
        };
      case "dehumidification":
        return {
          values: [
            { name: "OutsideHumidity", usingDefault: false, type: "NUMBER", value: "99", unit: "0-100 (RH%)" },
            { name: "SpaceHumidity", usingDefault: false, type: "NUMBER", value: "99", unit: "0-100 (RH%)" }
          ]
        };
      case "lowerTopCap":
        return { values: [{ name: "LowerTopcapClosed", type: "BOOLEAN", value: String(topCapState) }] };
      case "leakAlarm":
        return { values: [{ name: "LeakAlarm", type: "BOOLEAN", value: String(leakAlarmState) }] };
      case "acDoor":
        return { values: [{ name: "AcDoorClosed", type: "BOOLEAN", value: String(acDoorState) }] };
      case "emergencyVentilation":
        return { values: [{ name: "EmergencyVentilation", type: "BOOLEAN", value: String(evState) }] };
      case "clearAll":
      default:
        return { command: "GET /feather/simulate/clearall" };
    }
  };

  const handleApplyClick = () => {
    if (selectedIps.length === 0) {
      setErrorMsg("Cannot apply simulation overrides: You must select at least one target device index.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setShowConfirmModal(true);
  };

  const executeApplyOverride = async () => {
    setShowConfirmModal(false);
    setIsApplying(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const nowIso = new Date().toISOString();
    setStartedAt(nowIso);

    // Identify toggle state options
    let toggleVal = true;
    if (selectedMode === "lowerTopCap") toggleVal = topCapState;
    if (selectedMode === "leakAlarm") toggleVal = leakAlarmState;
    if (selectedMode === "acDoor") toggleVal = acDoorState;
    if (selectedMode === "emergencyVentilation") toggleVal = evState;

    try {
      const res = await fetch("/api/local/hvac-simulation/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetIps: selectedIps,
          timeoutMinutes,
          mode: selectedMode,
          options: { toggleState: toggleVal },
          normalizeBeforeApply,
          verifyAfterApply,
          concurrency
        })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Status ${res.status}`);
      }

      const body = await res.json();
      if (body.success) {
        setSuccessMsg(`Commanded simulation Mode [${selectedMode.toUpperCase()}] successfully applied on ${body.targetCount} units.`);
        
        // Populate results immediate
        setLatestResults(body.results || []);
        
        // Start live polling automatically
        setPollingActive(true);
        fetchAudits();
        
        // Run verify query immediately
        setTimeout(() => executeVerifyFetch(), 1500);
      } else {
        setErrorMsg("Failed to deploy commands: " + (body.error || "Execution error"));
      }

    } catch (e: any) {
      setErrorMsg("Critical API proxy failure: " + e.message);
    } finally {
      setIsApplying(false);
    }
  };

  // Action: Clear active simulations
  const handleClearAllSimulation = async () => {
    if (selectedIps.length === 0) {
      setErrorMsg("Please select active target IPs to clear simulation overrides.");
      return;
    }

    setIsApplying(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/local/hvac-simulation/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetIps: selectedIps,
          verifyAfterApply: true
        })
      });

      if (res.ok) {
        const body = await res.json();
        setSuccessMsg(`Simulation overrides cleared for ${body.targetCount} targets.`);
        setStartedAt(null);
        setPollingActive(false);
        setLatestResults([]);
        setTimeSeriesData({});
        fetchAudits();
      } else {
        setErrorMsg("Failed to clear overrides from targets.");
      }
    } catch (e: any) {
      setErrorMsg("Failed to connect to simulation proxy service: " + e.message);
    } finally {
      setIsApplying(false);
    }
  };

  // Export runners
  const triggerCsvExport = () => {
    if (latestResults.length === 0) {
      setErrorMsg("No active validation metrics available to export. Run simulations first.");
      return;
    }

    const headers = [
      "IP Address", "Sim Mode", "Validation Status", "Active Flags", 
      "HVAC1 Current (A)", "HVAC1 Fan High", "HVAC1 Compressor", 
      "HVAC2 Current (A)", "HVAC2 Fan High", "HVAC2 Compressor",
      "Space Temperature (C)", "Supply Air Temp (C)", "Humidity Space (%)",
      "Simulation Remaining Min", "FSS Valid", "MIO Valid", "Timestamp"
    ];

    const rows = latestResults.map(r => [
      r.ip,
      r.mode,
      r.status,
      r.flags.join(" | "),
      r.hvac1.currentA ?? "n/a",
      r.hvac1.fanHighOn ? "ON" : "OFF",
      r.hvac1.compressorOn ? "ON" : "OFF",
      r.hvac2.currentA ?? "n/a",
      r.hvac2.fanHighOn ? "ON" : "OFF",
      r.hvac2.compressorOn ? "ON" : "OFF",
      r.metrics.spaceTempC ?? "n/a",
      r.metrics.supplyAirTempC ?? "n/a",
      r.metrics.spaceHumidityPct ?? "n/a",
      r.simulationRemainingMinutes ?? 0,
      r.hvac1.passed ? "VALID" : "INVALID",
      r.hvac2.passed ? "VALID" : "INVALID",
      r.reportTimestamp || ""
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `PRIZM_HVAC_Simulation_Run_${selectedMode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const triggerJsonExport = () => {
    if (latestResults.length === 0) {
      setErrorMsg("No current results to export.");
      return;
    }
    const fullLogData = {
      simulationMode: selectedMode,
      commandedAt: startedAt,
      exportedAt: new Date().toISOString(),
      validationDefaultsUsed: {
        fanCurrentMinA,
        compressorCurrentMinA,
        responseGracePeriodSec,
        staleReportMaxAgeSec
      },
      targetsSelected: selectedIps,
      runs: latestResults,
      timeSeriesLogs: timeSeriesData
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullLogData, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `PRIZM_HVAC_Simulation_FullRun_${selectedMode}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
  };

  // Classify diagnostic items for panel summary
  const diagnosticItems = latestResults.filter(r => {
    if (warningFilter === "warn-fail") return r.status === "FAIL" || r.status === "WARNING";
    if (warningFilter === "not-responding") return r.status === "NOT_RESPONDING";
    if (warningFilter === "pass") return r.status === "PASS";
    return true;
  });

  const activeGraphData = timeSeriesData[graphingIp] || [];

  return (
    <div id="hvac-simulation-container" className="space-y-6 w-full text-prizm-text animate-fade-in font-sans">
      
      {/* 1. Header Banner */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-5 opacity-5">
          <Sliders size={120} className="text-prizm-primary" />
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1 rounded bg-prizm-primary/20 text-prizm-primary animate-pulse">
                <Sliders size={18} />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-white uppercase font-mono">
                HVAC Simulation + Validation
              </h1>
            </div>
            <p className="text-xs text-prizm-text-muted font-mono">
              Technician system controls interface targeting direct LAN Feather endpoints.
            </p>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-center p-1 bg-black/25 rounded border border-prizm-border/50 font-mono text-[10px]">
            <div className="p-2 border-r border-prizm-border/40">
              <span className="block text-prizm-text-muted">Executor</span>
              <strong className="text-cyan-400">Direct Feather</strong>
            </div>
            <div className="p-2 border-r border-prizm-border/40 truncate" title="Active Profile">
              <span className="block text-prizm-text-muted">Active Profile</span>
              <strong className="text-prizm-primary">BESS Local EMS</strong>
            </div>
            <div className="p-2 border-r border-prizm-border/40">
              <span className="block text-prizm-text-muted">Topology Source</span>
              <strong className="text-prizm-text">Active Profile</strong>
            </div>
            <div className="p-2 border-r border-prizm-border/40">
              <span className="block text-prizm-text-muted">Selected Targets</span>
              <strong className="text-yellow-400">{selectedIps.length}</strong>
            </div>
            <div className="p-2">
              <span className="block text-prizm-text-muted">Polling Mode</span>
              <span className={`inline-flex items-center gap-1 font-bold ${pollingActive ? "text-green-400" : "text-prizm-text-muted"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${pollingActive ? "bg-green-400 animate-pulse" : "bg-prizm-text-muted"}`}></span>
                {pollingActive ? "ACTIVE" : "STOPPED"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Safety warnings & logs notifications */}
      {errorMsg && (
        <div className="bg-prizm-danger/10 border border-prizm-danger/25 text-prizm-danger rounded-lg p-3 text-xs flex items-center gap-3 font-mono">
          <AlertTriangle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="bg-green-600/10 border border-green-500/25 text-prizm-primary rounded-lg p-3 text-xs flex items-center gap-3 font-mono">
          <CheckCircle size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 2. Main content Layout Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left column – Target selector & overrides controls */}
        <div className="lg:col-span-4 space-y-5">
          
          {/* Target Selection Card */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg shadow p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-prizm-border pb-2">
              <h2 className="text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 text-white">
                <Server size={14} className="text-prizm-primary" />
                Target Selection
              </h2>
              <span className="text-[10px] font-mono text-prizm-text-muted bg-black/45 px-2 py-0.5 rounded">
                Available: {filteredTargets.length} / {allTargets.length}
              </span>
            </div>

            {/* Quick Filter Selectors */}
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <label className="block text-prizm-text-muted font-bold font-mono mb-0.5 uppercase">Array Octet</label>
                <select 
                  className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-1.5 py-1 text-prizm-text focus:outline-none"
                  value={arrayFilter}
                  onChange={(e) => setArrayFilter(e.target.value)}
                >
                  <option value="all">De-select (All Arrays)</option>
                  {[1,2,3,4,5,6,7,8].map(a => (
                    <option key={a} value={a}>Array Octet {a}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-prizm-text-muted font-bold font-mono mb-0.5 uppercase">String Node</label>
                <select 
                  className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-1.5 py-1 text-prizm-text focus:outline-none"
                  value={stringFilter}
                  onChange={(e) => setStringFilter(e.target.value)}
                >
                  <option value="all">All ES Nodes</option>
                  {Array.from({ length: 18 }, (_, k) => k + 1).map(n => (
                    <option key={n} value={n}>String Controller ES {n}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Logical Filter Checklist Options */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 bg-black/10 p-2.5 rounded border border-prizm-border/40 text-[10px] font-mono">
              <label className="flex items-center gap-1.5 cursor-pointer text-prizm-text hover:text-white">
                <input 
                  type="checkbox" 
                  className="rounded bg-prizm-surface border-prizm-border text-prizm-primary accent-prizm-primary scale-90"
                  checked={reachableOnly}
                  onChange={(e) => setReachableOnly(e.target.checked)}
                />
                Reachable Only
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-prizm-text hover:text-white" title="Segment 1 often constitutes the collection segment, which is normally excluded from direct HVAC testing">
                <input 
                  type="checkbox" 
                  className="rounded bg-prizm-surface border-prizm-border text-prizm-primary accent-prizm-primary scale-90"
                  checked={includeCollection}
                  onChange={(e) => setIncludeCollection(e.target.checked)}
                />
                Include Collection Segments
              </label>
            </div>

            {/* Select Buttons */}
            <div className="flex gap-2 text-[9px] font-mono">
              <button 
                onClick={selectAllFiltered}
                className="flex-1 py-1 bg-prizm-primary/10 text-prizm-primary hover:bg-prizm-primary/20 border border-prizm-primary/30 rounded uppercase font-bold tracking-widest transition-colors"
              >
                Select Filtered
              </button>
              <button 
                onClick={selectNoneFiltered}
                className="flex-1 py-1 bg-prizm-border/30 text-prizm-text hover:bg-prizm-border/45 border border-prizm-border/50 rounded uppercase font-bold tracking-widest transition-colors"
              >
                Clear Filtered
              </button>
            </div>

            {/* Target Checklist Table */}
            <div className="max-h-[170px] overflow-y-auto no-scrollbar border border-prizm-border/50 rounded bg-prizm-surface-strong/60 divide-y divide-prizm-border/30">
              {filteredTargets.length === 0 ? (
                <div className="p-3 text-center text-prizm-text-muted text-[10px] uppercase font-mono">
                  No targets match active filters
                </div>
              ) : (
                filteredTargets.map(t => {
                  const isChecked = selectedIps.includes(t.ip);
                  return (
                    <div 
                      key={t.ip} 
                      className={`p-2 flex items-center justify-between text-[11px] font-mono cursor-pointer transition-colors ${isChecked ? "bg-prizm-primary/5 hover:bg-prizm-primary/10" : "hover:bg-prizm-surface"}`}
                      onClick={() => toggleSelectIp(t.ip)}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => {}} // toggled on container click
                          className="accent-prizm-primary rounded bg-prizm-surface-strong"
                        />
                        <span className="text-white font-semibold">{t.ip}</span>
                        <span className="text-[10px] text-prizm-text-muted truncate hidden sm:inline" title={t.entityName}>{t.entityName}</span>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        {t.isCollectionSegment && (
                          <span className="text-[8px] bg-cyan-900/40 text-cyan-400 border border-cyan-800/65 px-1 rounded uppercase">COL</span>
                        )}
                        <span className={`w-1.5 h-1.5 rounded-full ${t.reachable ? "bg-green-400 animate-pulse" : "bg-prizm-danger"}`}></span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            <div className="text-[10px] font-mono text-prizm-text-muted bg-black/20 p-2 rounded">
              Selected target set: <span className="text-white font-bold">{selectedIps.length} nodes</span>
              <div className="truncate max-h-[30px] overflow-y-auto mt-1 flex flex-wrap gap-1">
                {selectedIps.map(ip => (
                  <span key={ip} className="bg-prizm-border px-1 rounded text-[9px] text-white font-mono">{ip}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Simulation Commands Selector */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg shadow p-4 space-y-4">
            <h2 className="text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 text-white border-b border-prizm-border pb-2">
              <Sliders size={14} className="text-prizm-primary" />
              Simulation Payload Control
            </h2>

            {/* Mode selector list */}
            <div className="space-y-1.5">
              {[
                { id: "cooling", label: "Cooling / cooling", desc: "SpaceTemp=55, UseCellSetpoint=false. Auto-escalating stage controller (Lead level to dual-engagement by runtime).", icon: Activity },
                { id: "heating", label: "Heating", desc: "SpaceTemp=5, UseCellSetpoint=false (Active heating stage)", icon: Flame },
                { id: "dehumidification", label: "Dehumidification", desc: "OutsideHumidity=99, SpaceHumidity=99 (RH% high)", icon: Activity },
                { id: "lowerTopCap", label: "Lower Top Cap", desc: "Toggles Simulated LowerTopcapClosed state feedback", icon: DoorOpen, hasToggle: true, valState: topCapState, setValState: setTopCapState },
                { id: "leakAlarm", label: "Leak Alarm", desc: "Override Simulated LeakAlarm signal state", icon: AlertTriangle, hasToggle: true, valState: leakAlarmState, setValState: setLeakAlarmState },
                { id: "acDoor", label: "AC Door", desc: "Override Simulated AC Door Closed state", icon: DoorOpen, hasToggle: true, valState: acDoorState, setValState: setAcDoorState },
                { id: "emergencyVentilation", label: "Emergency Ventilation", desc: "Toggle Simulated EmergencyVentilation active overrides", icon: Sliders, hasToggle: true, valState: evState, setValState: setEvState },
                { id: "clearAll", label: "Clear All Commands", desc: "Clears and resets all active simulations on target", icon: Trash2 }
              ].map(modeItem => {
                const isSelected = selectedMode === modeItem.id;
                return (
                  <div 
                    key={modeItem.id}
                    className={`p-2 border rounded cursor-pointer transition-all ${
                      isSelected 
                        ? "bg-prizm-primary/15 border-prizm-primary shadow-sm" 
                        : "bg-prizm-surface-strong/40 border-prizm-border/40 hover:bg-prizm-surface"
                    }`}
                    onClick={() => setSelectedMode(modeItem.id as HvacSimulationMode)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-white">
                        <modeItem.icon size={12} className={isSelected ? "text-prizm-primary" : "text-prizm-text-muted"} />
                        <span>{modeItem.label}</span>
                      </div>
                      
                      {/* True/False Sub-toggle selector */}
                      {modeItem.hasToggle && isSelected && (
                        <div className="flex bg-black/60 rounded p-0.5 border border-prizm-border text-[9px] font-sans" onClick={(e) => e.stopPropagation()}>
                          <button 
                            onClick={() => modeItem.setValState!(true)}
                            className={`px-1.5 py-0.5 rounded font-black uppercase transition-colors ${modeItem.valState ? "bg-prizm-primary text-black" : "text-prizm-text hover:text-white"}`}
                          >
                            True
                          </button>
                          <button 
                            onClick={() => modeItem.setValState!(false)}
                            className={`px-1.5 py-0.5 rounded font-black uppercase transition-colors ${!modeItem.valState ? "bg-prizm-primary text-black" : "text-prizm-text hover:text-white"}`}
                          >
                            False
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="block text-[9px] text-prizm-text-muted mt-0.5 font-sans italic">{modeItem.desc}</span>
                  </div>
                );
              })}
            </div>

            {/* Simulation timeout sliding scale */}
            {selectedMode !== "clearAll" && (
              <div className="space-y-1 font-mono text-[10px] bg-black/25 p-2.5 rounded border border-prizm-border/40">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-prizm-text-muted font-bold uppercase">Simulation Window Timeout:</span>
                  <span className="text-yellow-400 font-bold bg-yellow-400/5 px-2 py-0.5 rounded">{timeoutMinutes} mins</span>
                </div>
                <input 
                  type="range" 
                  min={30} 
                  max={240} 
                  step={10} 
                  value={timeoutMinutes} 
                  onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
                  className="w-full accent-prizm-primary cursor-pointer mt-1" 
                />
                <div className="flex justify-between text-[8px] text-prizm-text-muted font-black uppercase tracking-wider">
                  <span>30 mins Min</span>
                  <span>240 mins Max</span>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Right column – Graphing, options, warnings & table results split */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* Simulation Actions & Options Panel */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg shadow p-4 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-prizm-border pb-2.5">
              <h2 className="text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 text-white">
                <Info size={14} className="text-prizm-primary" />
                Options & Deploy Console
              </h2>
              
              <div className="flex items-center gap-2">
                {/* Advanced Validation Settings trigger */}
                <button 
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  className="text-[10px] font-mono text-cyan-400 hover:text-white flex items-center gap-1 uppercase tracking-wider"
                >
                  <Sliders size={11} />
                  {advancedOpen ? "Hide Advanced Settings" : "Advanced Validation Settings"}
                </button>
              </div>
            </div>

            {/* Advanced validation config section */}
            {advancedOpen && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/40 p-3 rounded border border-prizm-border/65 animate-fade-in font-mono text-[10px] text-prizm-text">
                <div>
                  <label className="block text-prizm-text-muted font-bold uppercase mb-1">Fan Current Min (A)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-2 py-1 text-white" 
                    value={fanCurrentMinA} 
                    onChange={(e) => setFanCurrentMinA(Number(e.target.value))}
                  />
                  <span className="text-[8px] text-prizm-text-muted mt-0.5 block">Default 1.5 A</span>
                </div>
                
                <div>
                  <label className="block text-prizm-text-muted font-bold uppercase mb-1">Compressor Current Min (A)</label>
                  <input 
                    type="number" 
                    step="0.5"
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-2 py-1 text-white" 
                    value={compressorCurrentMinA} 
                    onChange={(e) => setCompressorCurrentMinA(Number(e.target.value))}
                  />
                  <span className="text-[8px] text-prizm-text-muted mt-0.5 block">Default 12.0 A</span>
                </div>

                <div>
                  <label className="block text-prizm-text-muted font-bold uppercase mb-1">Response Grace Period (s)</label>
                  <input 
                    type="number" 
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-2 py-1 text-white" 
                    value={responseGracePeriodSec} 
                    onChange={(e) => setResponseGracePeriodSec(Number(e.target.value))}
                  />
                  <span className="text-[8px] text-prizm-text-muted mt-0.5 block">Default 20s</span>
                </div>

                <div>
                  <label className="block text-prizm-text-muted font-bold uppercase mb-1">Stale Report Expiry (s)</label>
                  <input 
                    type="number" 
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-2 py-1 text-white" 
                    value={staleReportMaxAgeSec} 
                    onChange={(e) => setStaleReportMaxAgeSec(Number(e.target.value))}
                  />
                  <span className="text-[8px] text-prizm-text-muted mt-0.5 block">Default 15s</span>
                </div>
              </div>
            )}

            {/* Basic deploy parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-[10px] font-mono text-prizm-text font-bold">
              <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                <input 
                  type="checkbox" 
                  checked={normalizeBeforeApply}
                  onChange={(e) => setNormalizeBeforeApply(e.target.checked)}
                  className="accent-prizm-primary rounded bg-prizm-surface" 
                />
                <div>
                  <span className="block">Normalize-Reset targets first</span>
                  <p className="text-[8px] text-prizm-text-muted font-light mt-0.5">Clears overrides before new payload</p>
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                <input 
                  type="checkbox" 
                  checked={verifyAfterApply}
                  onChange={(e) => setVerifyAfterApply(e.target.checked)}
                  className="accent-prizm-primary rounded bg-prizm-surface" 
                />
                <div>
                  <span className="block">Verify report immediately</span>
                  <p className="text-[8px] text-prizm-text-muted font-light mt-0.5">Fetches validation payload in 2s</p>
                </div>
              </label>

              <div>
                <span className="block text-prizm-text-muted mb-1">Concurrency Limit:</span>
                <input 
                  type="number" 
                  min={1} 
                  max={16} 
                  className="bg-prizm-surface-strong border border-prizm-border rounded px-2 py-1 text-white w-full max-w-[100px]" 
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                />
              </div>

              <div>
                <span className="block text-prizm-text-muted mb-1">Worker Pool Execution</span>
                <p className="text-[8px] text-prizm-text-muted font-light">Uses segmented sub-routines (asynchronous)</p>
              </div>
            </div>

            {/* Execute simulation cluster cards panel */}
            <div className="bg-[#1F2937]/35 border border-[#374151]/50 p-3 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-mono">
                <span className="text-yellow-400 font-bold block">🚨 SYSTEM NOTICE & REGULATORY WARNING</span>
                <span className="text-prizm-text-muted text-[10px] mt-0.5 block leading-normal">
                  Simulation commands alter simulated Feather values used for HVAC validation. Confirm with site procedure before use.
                </span>
              </div>

              <div className="flex gap-2 w-full sm:w-auto">
                <button 
                  onClick={handleApplyClick}
                  disabled={isApplying}
                  className="flex-1 sm:flex-none px-4 py-2 bg-prizm-primary text-black font-black font-mono text-xs rounded uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-opacity-95 active:scale-95 disabled:opacity-50 transition-all shadow"
                >
                  {isApplying ? <RefreshCw className="animate-spin" size={13} /> : <Play size={13} />}
                  Deploy Simulated Override
                </button>

                <button 
                  onClick={handleClearAllSimulation}
                  disabled={isApplying}
                  className="flex-1 sm:flex-none px-4 py-2 bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/30 font-bold font-mono text-xs rounded uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-prizm-danger/20 active:scale-95 disabled:opacity-50 transition-all"
                >
                  <Trash2 size={13} />
                  Clear Simulation Override
                </button>
              </div>
            </div>

            {/* Real-time Validation Action bar controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-black/25 p-2.5 rounded border border-prizm-border/40 font-mono text-[10px]">
              <div className="flex items-center gap-3">
                <span className="text-prizm-text-muted font-bold uppercase">LIVE VERIFY MONITOR:</span>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => { setPollingActive(true); executeVerifyFetch(); }}
                    disabled={pollingActive || selectedIps.length === 0}
                    className="px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/25 rounded flex items-center gap-1 hover:bg-green-500/20 disabled:opacity-50 uppercase text-[9px]"
                  >
                    <Play size={10} />
                    Start Polling
                  </button>
                  <button 
                    onClick={() => setPollingActive(false)}
                    disabled={!pollingActive}
                    className="px-2 py-1 bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/25 rounded flex items-center gap-1 hover:bg-prizm-danger/20 disabled:opacity-50 uppercase text-[9px]"
                  >
                    <Square size={10} />
                    Stop Polling
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-prizm-text-muted uppercase text-[9px]">Rate:</span>
                  <select 
                    value={pollingIntervalSec}
                    onChange={(e) => setPollingIntervalSec(Number(e.target.value))}
                    className="bg-prizm-surface-strong border border-prizm-border rounded px-1 py-0.5 text-white text-[9px]"
                  >
                    <option value={1}>1s Refresh</option>
                    <option value={3}>3s Refresh</option>
                    <option value={5}>5s Refresh</option>
                    <option value={10}>10s Refresh</option>
                  </select>
                </div>

                <button 
                  onClick={executeVerifyFetch}
                  disabled={selectedIps.length === 0 || isApplying}
                  className="px-2.5 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/35 rounded uppercase text-[9px] hover:bg-cyan-500/20 active:scale-95 transition-all text-center flex items-center gap-1"
                >
                  <RefreshCw size={10} />
                  Refresh / Check report
                </button>
              </div>
            </div>
          </div>

          {/* Real-time validation charts */}
          {selectedIps.length > 0 && (
            <div className="bg-prizm-surface border border-prizm-border rounded-lg shadow p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-prizm-border pb-2.5 gap-2">
                <h2 className="text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 text-white">
                  <TrendingUp size={14} className="text-prizm-primary" />
                  Real-time HVAC Time-Series Graphs
                </h2>
                
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-prizm-text-muted">Target IP:</span>
                  <select 
                    className="bg-prizm-surface-strong border border-prizm-border rounded px-1.5 py-0.5 text-white text-[10px] font-mono"
                    value={graphingIp}
                    onChange={(e) => setGraphingIp(e.target.value)}
                  >
                    {selectedIps.map(ip => (
                      <option key={ip} value={ip}>{ip}</option>
                    ))}
                  </select>
                </div>
              </div>

              {activeGraphData.length === 0 ? (
                <div className="h-[150px] flex flex-col items-center justify-center border border-dashed border-prizm-border/40 rounded bg-black/10 text-center font-mono text-[10px] p-5">
                  <Clock className="text-prizm-text-muted/60 mb-1" size={24} />
                  <span className="text-prizm-text-muted font-bold block uppercase">No time series coordinates collected yet</span>
                  <p className="max-w-md mt-0.5 font-light text-[9px]">
                    Poller needs active simulation commands to populate dynamic history coordinates. Start live polling or refresh targets to collect telemetry data.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Amperage Chart */}
                  <div className="bg-black/15 border border-prizm-border/30 rounded p-2">
                    <div className="text-[9px] font-bold font-mono text-prizm-primary uppercase mb-2 tracking-wider">
                      HVAC Electrical Amperage Load Index (Amps A)
                    </div>
                    <div className="h-[140px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={activeGraphData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" opacity={0.3} />
                          <XAxis dataKey="time" stroke="#4A5568" style={{ fontSize: "7px" }} />
                          <YAxis stroke="#4A5568" style={{ fontSize: "7px" }} unit=" A" />
                          <Tooltip contentStyle={{ background: "#2D3748", border: "1px solid #4A5568", fontSize: "10px" }} />
                          <Line type="monotone" dataKey="hvac1Current" name="HVAC 1 Amps" stroke="#6366F1" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="hvac2Current" name="HVAC 2 Amps" stroke="#3B82F6" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Temperature Chart */}
                  <div className="bg-black/15 border border-prizm-border/30 rounded p-2">
                    <div className="text-[9px] font-bold font-mono text-cyan-300 uppercase mb-2 tracking-wider">
                      Enclosure Climates & Thermal Trends (°C)
                    </div>
                    <div className="h-[140px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={activeGraphData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" opacity={0.3} />
                          <XAxis dataKey="time" stroke="#4A5568" style={{ fontSize: "7px" }} />
                          <YAxis stroke="#4A5568" style={{ fontSize: "7px" }} unit="°" />
                          <Tooltip contentStyle={{ background: "#2D3748", border: "1px solid #4A5568", fontSize: "10px" }} />
                          <Line type="monotone" dataKey="spaceTemp" name="Space Temp" stroke="#10B981" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="supplyTemp" name="Supply Temp" stroke="#EF4444" strokeWidth={1.5} dot={false} />
                          <Line type="monotone" dataKey="cellTemp" name="Cell Temp" stroke="#F59E0B" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Result Table Panel */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg shadow-md p-4 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-prizm-border pb-2.5 gap-2 font-mono">
              <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-white">
                <Database size={14} className="text-prizm-primary" />
                Validation Reports Table ({latestResults.length} active)
              </h2>

              <div className="flex bg-black/45 p-0.5 rounded border border-prizm-border/60 text-[9px] gap-1">
                <button 
                  onClick={triggerCsvExport}
                  disabled={latestResults.length === 0}
                  className="px-2 py-0.5 hover:text-white text-prizm-text-muted flex items-center gap-1 border-r border-prizm-border/40 disabled:opacity-50"
                >
                  <FileText size={10} />
                  CSV SUMMARY
                </button>
                <button 
                  onClick={triggerJsonExport}
                  disabled={latestResults.length === 0}
                  className="px-2 py-0.5 hover:text-white text-prizm-text-muted flex items-center gap-1 disabled:opacity-50"
                >
                  <Download size={10} />
                  JSON LOG DATA
                </button>
              </div>
            </div>

            {latestResults.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-prizm-border/30 rounded bg-black/5 font-mono text-[10px] text-prizm-text-muted flex flex-col items-center justify-center">
                <Database className="opacity-40 mb-1" size={24} />
                <span>NO REPORTS TABLE LOADS AT THIS STAGE</span>
                <p className="max-w-md font-light text-[9px] mt-0.5">
                  Connect target IPs on the left pane and apply simulation commands. Live validation scans will populate detailed HVAC metrics here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-prizm-border/40 rounded bg-black/15 max-h-[300px]">
                <table className="w-full text-left border-collapse font-sans text-[10px] whitespace-nowrap">
                  <thead className="bg-[#111827] sticky top-0 text-prizm-text-muted font-mono font-bold uppercase border-b border-prizm-border text-[9px]">
                    <tr>
                      <th className="p-2 border-r border-prizm-border/20 text-center">IP</th>
                      <th className="p-2 border-r border-prizm-border/20 text-center">Status</th>
                      <th className="p-2 border-r border-prizm-border/20 text-center">Flags</th>
                      <th className="p-2 border-r border-prizm-border/20 text-center">HVAC1 [Amps]</th>
                      <th className="p-2 border-r border-prizm-border/20 text-center">H1 FanH</th>
                      <th className="p-2 border-r border-prizm-border/20 text-center">H1 Comp</th>
                      <th className="p-2 border-r border-prizm-border/20 text-center">HVAC2 [Amps]</th>
                      <th className="p-2 border-r border-prizm-border/20 text-center">H2 FanH</th>
                      <th className="p-2 border-r border-prizm-border/20 text-center">H2 Comp</th>
                      <th className="p-2 border-r border-prizm-border/20 text-center">Ht Pump</th>
                      <th className="p-2 border-r border-prizm-border/20 text-center">Elc Ht</th>
                      <th className="p-2 border-r border-prizm-border/20 text-center">Sim?</th>
                      <th className="p-2 text-center">Sim Rem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-prizm-border/30 font-mono font-medium">
                    {latestResults.map(r => {
                      const statusColor = r.status === "PASS"
                        ? "text-green-400 bg-green-500/10 border border-green-500/20"
                        : r.status === "WARNING"
                        ? "text-yellow-400 bg-yellow-500/10 border border-yellow-500/20"
                        : "text-prizm-danger bg-prizm-danger/10 border border-prizm-danger/20";

                      return (
                        <tr key={r.ip} className="hover:bg-prizm-surface-strong/60 transition-all">
                          <td className="p-2 text-white font-bold border-r border-prizm-border/20">{r.ip}</td>
                          <td className="p-2 border-r border-prizm-border/20 text-center">
                            <span className={`px-2 py-0.5 rounded font-black text-[8px] uppercase tracking-wider block ${statusColor}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="p-2 text-prizm-text border-r border-prizm-border/20 max-w-[150px] truncate" title={r.flags.join(", ") || "No active warning flags"}>
                            {r.flags.length === 0 ? "-" : r.flags.join(", ")}
                          </td>
                          <td className="p-2 text-white border-r border-prizm-border/20 text-center font-bold">
                            {r.hvac1.currentA !== null ? `${r.hvac1.currentA.toFixed(1)} A` : "-"}
                          </td>
                          <td className="p-2 border-r border-prizm-border/20 text-center">
                            <span className={r.hvac1.fanHighOn ? "text-green-400 font-bold" : "text-prizm-text-muted"}>
                              {r.hvac1.fanHighOn ? "true" : "false"}
                            </span>
                          </td>
                          <td className="p-2 border-r border-prizm-border/20 text-center">
                            <span className={r.hvac1.compressorOn ? "text-green-400 font-bold" : "text-prizm-text-muted"}>
                              {r.hvac1.compressorOn ? "true" : "false"}
                            </span>
                          </td>

                          <td className="p-2 text-white border-r border-prizm-border/20 text-center font-bold">
                            {r.hvac2.currentA !== null ? `${r.hvac2.currentA.toFixed(1)} A` : "-"}
                          </td>
                          <td className="p-2 border-r border-prizm-border/20 text-center">
                            <span className={r.hvac2.fanHighOn ? "text-green-400 font-bold" : "text-prizm-text-muted"}>
                              {r.hvac2.fanHighOn ? "true" : "false"}
                            </span>
                          </td>
                          <td className="p-2 border-r border-prizm-border/20 text-center">
                            <span className={r.hvac2.compressorOn ? "text-green-400 font-bold" : "text-prizm-text-muted"}>
                              {r.hvac2.compressorOn ? "true" : "false"}
                            </span>
                          </td>

                          <td className="p-2 border-r border-prizm-border/20 text-center">
                            <span className={(r.hvac1.reversingValveOn || r.hvac2.reversingValveOn) ? "text-green-400 font-bold" : "text-prizm-text-muted"}>
                              {(r.hvac1.reversingValveOn || r.hvac2.reversingValveOn) ? "true" : "false"}
                            </span>
                          </td>
                          <td className="p-2 border-r border-prizm-border/20 text-center">
                            <span className={(r.hvac1.electricHeatOn || r.hvac2.electricHeatOn) ? "text-green-400 font-bold" : "text-prizm-text-muted"}>
                              {(r.hvac1.electricHeatOn || r.hvac2.electricHeatOn) ? "true" : "false"}
                            </span>
                          </td>
                          <td className="p-2 border-r border-prizm-border/20 text-center">
                            <span className={r.simulationRemainingMinutes && r.simulationRemainingMinutes > 0 ? "text-green-400 font-bold" : "text-prizm-text-muted"}>
                              {r.simulationRemainingMinutes && r.simulationRemainingMinutes > 0 ? "true" : "false"}
                            </span>
                          </td>
                          <td className="p-2 text-center text-white">{r.simulationRemainingMinutes ?? 0} mins</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Diagnostics warning panel */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg shadow p-4 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-prizm-border pb-2.5 gap-2 font-mono">
              <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-white">
                <AlertTriangle size={14} className="text-yellow-400 animate-pulse" />
                Technician Diagnostics & Warnings Panel
              </h2>

              <div className="flex bg-black p-0.5 rounded border border-prizm-border/50 text-[9px]">
                {[
                  { id: "all", label: "Show All" },
                  { id: "warn-fail", label: "Warnings / Faults Only" },
                  { id: "not-responding", label: "Offline Only" },
                  { id: "pass", label: "Passed Only" }
                ].map(fOpt => (
                  <button 
                    key={fOpt.id}
                    onClick={() => setWarningFilter(fOpt.id as any)}
                    className={`px-2 py-0.5 rounded font-bold uppercase text-[8px] transition-colors ${warningFilter === fOpt.id ? "bg-prizm-primary text-black" : "text-prizm-text-muted hover:text-white"}`}
                  >
                    {fOpt.label}
                  </button>
                ))}
              </div>
            </div>

            {diagnosticItems.length === 0 ? (
              <div className="p-4 text-center text-prizm-text-muted font-mono text-[10px] uppercase">
                No active diagnostic warnings mapped under this selection
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto no-scrollbar font-mono text-[10.5px]">
                {diagnosticItems.map(row => {
                  let alertStyle = "border-l-4 border-green-400 bg-green-500/5 text-prizm-text";
                  let badge = "text-green-400 bg-green-500/10 border border-green-500/20";
                  let labelText = "PASS";
                  let diagnosticDetail = "All simulated controls and feedback fields respond properly.";

                  if (row.status === "FAIL" || row.status === "NOT_RESPONDING") {
                    alertStyle = "border-l-4 border-prizm-danger bg-prizm-danger/5 text-white";
                    badge = "text-prizm-danger bg-prizm-danger/10 border border-prizm-danger/20 animate-pulse";
                    labelText = row.status === "NOT_RESPONDING" ? "NOT RESPONDING" : "FAIL";

                    if (row.status === "NOT_RESPONDING") {
                      diagnosticDetail = "Feather client connection request timed out. Node failed to respond within 3000ms TCP window.";
                    } else {
                      // Custom fail hints based on flags
                      if (row.flags.includes("COMPRESSOR_NOT_CALLED")) {
                        diagnosticDetail = `Cooling override commanded but target thermostat stage is [${row.reportTimestamp ? "Idle/Ready" : "n/a"}]. Compressor signal failed to engage.`;
                      } else if (row.flags.includes("HVAC1_COMPRESSOR_NOT_CALLED") || row.flags.includes("HVAC2_COMPRESSOR_NOT_CALLED")) {
                        diagnosticDetail = "Cooling calls expect compressor load engagement but response detected compressor failures.";
                      } else if (row.flags.includes("HEATING_CURRENT_LOW")) {
                        diagnosticDetail = "Heating call registered but electrical loads failed to draw appropriate amperes.";
                      } else if (row.flags.includes("DEHUMIDIFICATION_NO_RESPONSE")) {
                        diagnosticDetail = "Dehumidification override is active but fans / stage coils remain un-reacting.";
                      } else {
                        diagnosticDetail = "Device registers high command discrepancy with missing thermostat stage states.";
                      }
                    }
                  } else if (row.status === "WARNING") {
                    alertStyle = "border-l-4 border-yellow-400 bg-yellow-400/5 text-prizm-text";
                    badge = "text-yellow-400 bg-yellow-500/10 border border-yellow-500/20";
                    labelText = "WARNING";

                    if (row.flags.includes("LEAD_COOL_EXTRA_HVAC_ACTIVE")) {
                      diagnosticDetail = "Single lead cooling expected, but both redundant air units registered compressor engagement simultaneously.";
                    } else if (row.flags.includes("COMPRESSOR_CURRENT_LOW")) {
                      diagnosticDetail = `Compressor coil engaged but target current is [${row.hvac1.currentA ?? row.hvac2.currentA ?? 0} A], falling below configured minimum current threshold of [${compressorCurrentMinA} A].`;
                    } else if (row.flags.includes("FAN_CURRENT_LOW")) {
                      diagnosticDetail = "Unit fan is active but electrical load draws insufficient current. Check contactor.";
                    } else {
                      diagnosticDetail = `Partial warnings detected: ${row.flags.join(", ")}`;
                    }
                  } else if (row.status === "STALE") {
                    alertStyle = "border-l-4 border-yellow-500 bg-yellow-500/5 text-prizm-text-muted";
                    badge = "text-yellow-500 bg-yellow-500/10 border border-yellow-500/20";
                    labelText = "STALE";
                    diagnosticDetail = "Report timestamp age exceeds maximum allowable threshold.";
                  } else if (row.status === "SIMULATION_EXPIRED") {
                    alertStyle = "border-l-4 border-prizm-text-muted bg-white/5 text-prizm-text-muted";
                    badge = "text-prizm-text-muted bg-white/5 border border-prizm-border";
                    labelText = "EXPIRED";
                    diagnosticDetail = "The commanded simulation override window has finished countdown.";
                  }

                  return (
                    <div key={row.ip} className={`p-2.5 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-r border-t border-b border-prizm-border/45 select-none hover:bg-black/5 ${alertStyle}`}>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <strong className="text-white text-[11px]">{row.ip}</strong>
                          <span className={`px-1.5 py-[1px] rounded text-[8px] font-black uppercase tracking-widest ${badge}`}>
                            {labelText}
                          </span>
                        </div>
                        <p className="text-[10px] text-prizm-text-muted leading-relaxed font-sans font-light">
                          {diagnosticDetail}
                        </p>
                      </div>

                      {row.flags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 sm:mt-0 max-w-[200px] justify-start sm:justify-end">
                          {row.flags.map(f => (
                            <span key={f} className="bg-black/45 text-yellow-500/90 text-[8px] border border-yellow-500/20 px-1 py-[1.5px] rounded select-none tracking-tight uppercase" title={f}>
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Audit events ledger */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg shadow p-4 space-y-4">
            <h2 className="text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 text-white border-b border-prizm-border pb-2">
              <Clock size={14} className="text-prizm-primary" />
              Direct HVAC Simulation Audit History (Last 20 Logs)
            </h2>

            {auditLogs.length === 0 ? (
              <div className="p-4 text-center text-prizm-text-muted font-mono text-[10px] uppercase">
                No audited overrides records logged on this controller BESS site
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto no-scrollbar font-mono text-[10px]">
                {auditLogs.map((log, lidx) => {
                  const sColor = log.validationStatus === "FAIL"
                    ? "text-prizm-danger border border-prizm-danger/30"
                    : log.validationStatus === "WARNING"
                    ? "text-yellow-400 border border-yellow-400/30"
                    : "text-green-400 border border-green-500/30";

                  return (
                    <div key={lidx} className="p-2 border border-prizm-border/40 rounded bg-prizm-surface-strong/35 hover:bg-prizm-surface-strong/70 transition-colors flex items-center justify-between gap-3 font-mono text-[10px] text-prizm-text">
                      <div className="truncate space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[#38BDF8] font-bold uppercase">{log.mode}</span>
                          <span className="text-[9px] text-prizm-text-muted bg-prizm-border/60 px-1.5 py-0.5 rounded">{log.targetIps.length} target IPs</span>
                        </div>
                        <div className="text-[9px] text-prizm-text-muted leading-none">
                          Timestamp: <span className="text-white">{new Date(log.timestamp).toLocaleString()}</span>  |  Profile: <span className="text-prizm-primary">{log.profileName || "Local Default"}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`px-1.5 py-0.5 rounded font-black text-[8px] uppercase ${sColor}`}>
                          {log.validationStatus || "PASS"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* 3. Confirm Modal Overlay */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-prizm-surface border border-prizm-border rounded-lg shadow-2xl max-w-lg w-full overflow-hidden p-5 animate-fade-in text-xs font-mono space-y-4">
            
            <div className="flex items-center gap-2 border-b border-prizm-border/50 pb-3">
              <Sliders size={18} className="text-yellow-400 animate-pulse" />
              <h3 className="text-white text-sm font-bold uppercase">Confirm Simulated Override Apply</h3>
            </div>

            <p className="text-prizm-text leading-relaxed">
              You are applying a simulated load override to the selected <strong className="text-yellow-400">{selectedIps.length} units</strong>. This overrides real hardware registers inside physical controllers of BESS batteries.
            </p>

            <div className="bg-black/37 p-3 rounded-lg border border-prizm-border/50 space-y-2">
              <div className="flex justify-between border-b border-prizm-border/20 pb-1.5">
                <span className="text-prizm-text-muted font-bold">Selected Mode:</span>
                <span className="text-cyan-400 uppercase font-bold">{selectedMode}</span>
              </div>
              <div className="flex justify-between border-b border-prizm-border/20 pb-1.5">
                <span className="text-prizm-text-muted font-bold">Window Timeout Action:</span>
                <span className="text-white font-semibold">{timeoutMinutes} Minutes</span>
              </div>
              <div className="flex justify-between border-b border-prizm-border/20 pb-1.5">
                <span className="text-prizm-text-muted font-bold">Normalize Reset first:</span>
                <span className="text-white font-semibold">{normalizeBeforeApply ? "Active" : "Bypass"}</span>
              </div>
              <div className="flex justify-between border-b border-prizm-border/20 pb-1.5">
                <span className="text-prizm-text-muted font-bold">Verify Delay:</span>
                <span className="text-white font-semibold">2 Seconds Grace</span>
              </div>

              <div className="pt-1">
                <span className="block text-[9px] text-prizm-text-muted uppercase font-bold mb-1">Payload definition preview:</span>
                <pre className="text-[8.5px] bg-black/60 p-2 rounded text-cyan-300 max-h-[85px] overflow-auto border border-prizm-border/30 no-scrollbar">
                  {JSON.stringify(getSimPayloadRepresentation(), null, 2)}
                </pre>
              </div>
            </div>

            <div className="text-[9.5px] font-sans leading-normal bg-yellow-500/10 border border-yellow-500/25 p-2.5 rounded text-yellow-400 font-bold flex items-start gap-2">
              <AlertTriangle className="flex-shrink-0 mt-0.5" size={14} />
              <span>
                WARNING: Confirm this action complies with local standard operating procedures (SOP). Do not execute tests outside strict diagnostic hours of cooling parameters.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-prizm-border text-prizm-text hover:bg-prizm-surface-strong/70 font-semibold rounded uppercase tracking-wider text-[10px]"
              >
                Cancel
              </button>
              
              <button 
                onClick={executeApplyOverride}
                className="px-4 py-2 bg-prizm-primary text-black font-black rounded uppercase tracking-wider text-[10px] hover:bg-opacity-95"
              >
                Execute Sim Test
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
