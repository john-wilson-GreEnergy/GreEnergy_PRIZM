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
  ChevronDown,
  X,
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
  ResponsiveContainer,
  ReferenceLine
} from "recharts";

import { 
  HvacSimulationMode, 
  HvacValidationStatus, 
  HvacSimulationTarget, 
  HvacValidationResult, 
  HvacAuditEntry 
} from "../server/hvacSimulation/hvacSimulationTypes";

// Constants & helper formatting
const formatTimestampWithUtc = (isoStr: string) => {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    const local = d.toLocaleTimeString() + " " + d.toLocaleDateString();
    const utcHours = String(d.getUTCHours()).padStart(2, "0");
    const utcMins = String(d.getUTCMinutes()).padStart(2, "0");
    return `${local} (UTC ${utcHours}:${utcMins})`;
  } catch (e) {
    return isoStr;
  }
};

const SIM_MODES = [
  { id: "ldcool", label: "Lead Cooling", desc: "HVAC1 High Fan + Compressor call", threshold: "≥12 A on Lead unit", expected: "1 HVAC fan high + compressor, safety bypass verified" },
  { id: "bcool", label: "Both Cooling", desc: "Dual air units full compressor call", threshold: "≥12 A load each redundant loop", expected: "HVAC1 + HVAC2 fan high + compressor running" },
  { id: "heating", label: "Heating Sim", desc: "Bypasses standard climate to call active heaters", threshold: "SpaceTemp preset = 5°C", expected: "Stage-1/2 electric heating coils active" },
  { id: "dehumidification", label: "Dehumidification", desc: "Injects wet bulb/RH limits into telemetry", threshold: "Relative Humidities @ 99%", expected: "Coils condenser cycle to extract condensation" },
  { id: "lowerTopCap", label: "Lower Top Cap", desc: "Manipulates top state feedback registers", threshold: "Toggle simulated shut limiters", expected: "Telemetry reports LowerTopcapClosed state" },
  { id: "leakAlarm", label: "Leak Alarm", desc: "Dispatches mock safety containment breach calls", threshold: "Inject positive hydrogen levels", expected: "System flags active leak state triggers" },
  { id: "acDoor", label: "AC Door Probe", desc: "Simulates structural door breach/limit switch", threshold: "Air intake security monitoring", expected: "Reports door sensor open/closed telemetry" },
  { id: "emergencyVentilation", label: "Emerg. Vent", desc: "Runs exhaust sequence over standard modes", threshold: "Full high volume blower override", expected: "Emergency ventilation active indicators" },
  { id: "cooling", label: "General Cooling", desc: "Default variable cooling test simulation", threshold: "Standard temperature baseline", expected: "Compressor response stage checked" },
  { id: "clearAll", label: "Reset / Clear", desc: "Restores standard direct autonomous control", threshold: "Ems autonomous command", expected: "Restores normal real-world telemetry parameters" }
];

export default function HvacSimulationDashboard() {
  const [profileName] = useState<string>("BESS Local EMS");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Targets
  const [allTargets, setAllTargets] = useState<HvacSimulationTarget[]>([]);
  const [selectedIps, setSelectedIps] = useState<string[]>([]);
  
  // Filters
  const [blockFilter, setBlockFilter] = useState<string>("all");
  const [arrayFilter, setArrayFilter] = useState<string>("all");
  const [stringFilter, setStringFilter] = useState<string>("all");
  const [reachableOnly, setReachableOnly] = useState<boolean>(false);
  const [includeCollection, setIncludeCollection] = useState<boolean>(false);

  // Active configurations
  const [selectedMode, setSelectedMode] = useState<HvacSimulationMode>("ldcool");
  const [timeoutMinutes, setTimeoutMinutes] = useState<number>(30);
  const [normalizeBeforeApply, setNormalizeBeforeApply] = useState<boolean>(true);
  const [verifyAfterApply, setVerifyAfterApply] = useState<boolean>(true);
  const [concurrency, setConcurrency] = useState<number>(8);
  const [isApplying, setIsApplying] = useState<boolean>(false);

  // Toggles for digital states
  const [topCapState, setTopCapState] = useState<boolean>(true);
  const [leakAlarmState, setLeakAlarmState] = useState<boolean>(false);
  const [acDoorState, setAcDoorState] = useState<boolean>(true);
  const [evState, setEvState] = useState<boolean>(false);

  // Threshold presets
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);
  const [fanCurrentMinA, setFanCurrentMinA] = useState<number>(1.5);
  const [compressorCurrentMinA, setCompressorCurrentMinA] = useState<number>(12.0);
  const [staleReportMaxAgeSec, setStaleReportMaxAgeSec] = useState<number>(15);
  const [responseGracePeriodSec, setResponseGracePeriodSec] = useState<number>(20);

  // Poller control
  const [pollingActive, setPollingActive] = useState<boolean>(false);
  const [pollingIntervalSec, setPollingIntervalSec] = useState<number>(3);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [latestResults, setLatestResults] = useState<HvacValidationResult[]>([]);
  const [lastPollTime, setLastPollTime] = useState<string | null>(null);

  // Selected row for detail slide drawer
  const [selectedResultDetail, setSelectedResultDetail] = useState<HvacValidationResult | null>(null);

  // Time-Series buffer
  const [timeSeriesData, setTimeSeriesData] = useState<Record<string, any[]>>({});
  const [graphingIp, setGraphingIp] = useState<string>("aggregate");

  // Audit list
  const [auditLogs, setAuditLogs] = useState<HvacAuditEntry[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Diagnostic checklist filter
  const [warningFilter, setWarningFilter] = useState<"all" | "warn-fail" | "not-responding" | "pass">("all");
  const [historyCollapsed, setHistoryCollapsed] = useState<boolean>(true);

  const pollerRef = useRef<any>(null);

  // Initialize
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const capRes = await fetch("/api/local/hvac-simulation/capabilities");
        if (capRes.ok) {
          const caps = await capRes.json();
          setFanCurrentMinA(caps.defaultValidation.fanCurrentMinA || 1.5);
          setCompressorCurrentMinA(caps.defaultValidation.compressorCurrentMinA || 12.0);
          setStaleReportMaxAgeSec(caps.defaultValidation.staleReportMaxAgeSec || 15);
          setResponseGracePeriodSec(caps.defaultValidation.responseGracePeriodSec || 20);
        }

        const tRes = await fetch("/api/local/hvac-simulation/targets");
        if (tRes.ok) {
          const body = await tRes.json();
          const list: HvacSimulationTarget[] = body.targets || [];
          setAllTargets(list);
          // Pre-select first 4 reachable normal targets
          const initial = list
            .filter(t => !t.isCollectionSegment && t.reachable)
            .map(t => t.ip)
            .slice(0, 4);
          setSelectedIps(initial);
        }
        fetchAudits();
      } catch (e: any) {
        setErrorMsg("Failed to connect with simulation service: " + e.message);
      } finally {
        setLoading(false);
      }
    };
    init();
    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, []);

  // Update Graph defaults
  useEffect(() => {
    if (selectedIps.length > 0 && graphingIp !== "aggregate" && !selectedIps.includes(graphingIp)) {
      setGraphingIp("aggregate");
    }
  }, [selectedIps, graphingIp]);

  // Polling thread trigger
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

  const fetchAudits = async () => {
    try {
      const aRes = await fetch("/api/local/hvac-simulation/audit");
      if (aRes.ok) {
        const body = await aRes.json();
        setAuditLogs(body.log || []);
      }
    } catch (e) {}
  };

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
        const resultsList: HvacValidationResult[] = data.results || [];
        setLatestResults(resultsList);
        setLastPollTime(new Date().toLocaleTimeString());

        // Fill time series
        const tick = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setTimeSeriesData(prev => {
          const next = { ...prev };
          resultsList.forEach((row: HvacValidationResult) => {
            const list = next[row.ip] || [];
            next[row.ip] = [
              ...list,
              {
                time: tick,
                hvac1Current: row.hvac1.currentA ?? 0,
                hvac2Current: row.hvac2.currentA ?? 0,
                spaceTemp: row.metrics.spaceTempC ?? 0,
                supplyTemp: row.metrics.supplyAirTempC ?? 0,
                cellTemp: row.metrics.avgCellTempC ?? 0,
                spaceHumidity: row.metrics.spaceHumidityPct ?? 0,
                outsideHumidity: row.metrics.outsideHumidityPct ?? 0,
                remainingMinutes: row.simulationRemainingMinutes ?? 0
              }
            ].slice(-20);
          });
          return next;
        });

        // Keep detail in sync if open
        if (selectedResultDetail) {
          const fresh = resultsList.find(r => r.ip === selectedResultDetail.ip);
          if (fresh) setSelectedResultDetail(fresh);
        }
      }
    } catch (e) {}
  };

  // Run apply simulation
  const executeApplyOverride = async () => {
    setShowConfirmModal(false);
    setIsApplying(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const nowStr = new Date().toISOString();
    setStartedAt(nowStr);

    let activeToggleState = true;
    if (selectedMode === "lowerTopCap") activeToggleState = topCapState;
    if (selectedMode === "leakAlarm") activeToggleState = leakAlarmState;
    if (selectedMode === "acDoor") activeToggleState = acDoorState;
    if (selectedMode === "emergencyVentilation") activeToggleState = evState;

    try {
      const res = await fetch("/api/local/hvac-simulation/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetIps: selectedIps,
          timeoutMinutes,
          mode: selectedMode,
          options: { toggleState: activeToggleState },
          normalizeBeforeApply,
          verifyAfterApply,
          concurrency
        })
      });

      if (!res.ok) {
        throw new Error(await res.text() || `Status ${res.status}`);
      }

      const body = await res.json();
      if (body.success) {
        setSuccessMsg(`Simulated controls applied successfully to ${body.targetCount} nodes.`);
        setLatestResults(body.results || []);
        setPollingActive(true);
        fetchAudits();
        setTimeout(() => executeVerifyFetch(), 1000);
      } else {
        setErrorMsg("Failed deploying commands: " + (body.error || "Hardware reject."));
      }
    } catch (e: any) {
      setErrorMsg("Simulation deployment failing: " + e.message);
    } finally {
      setIsApplying(false);
    }
  };

  // Clear commands
  const handleClearAllSimulation = async () => {
    if (selectedIps.length === 0) {
      setErrorMsg("Select target network nodes first to clear active overrides.");
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
        setSuccessMsg(`Resetted simulation states for ${body.targetCount} hardware nodes.`);
        setStartedAt(null);
        setPollingActive(false);
        setLatestResults([]);
        setTimeSeriesData({});
        setSelectedResultDetail(null);
        fetchAudits();
      } else {
        setErrorMsg("Clear simulation response failure from target gateways.");
      }
    } catch (e: any) {
      setErrorMsg("Failed link connectivity with server service: " + e.message);
    } finally {
      setIsApplying(false);
    }
  };

  // Export functions
  const triggerCsvExport = () => {
    if (latestResults.length === 0) return;
    const cols = ["IP", "Mode", "Status", "Flags", "H1_Amps", "H1_Fan", "H1_Comp", "H2_Amps", "H2_Fan", "H2_Comp", "SpaceTemp_C", "Supply_C", "RemMin", "Timestamp"];
    const rows = latestResults.map(r => [
      r.ip, r.mode, r.status, r.flags.join("|"), r.hvac1.currentA ?? "", r.hvac1.fanHighOn ? "ON" : "OFF", r.hvac1.compressorOn ? "ON" : "OFF",
      r.hvac2.currentA ?? "", r.hvac2.fanHighOn ? "ON" : "OFF", r.hvac2.compressorOn ? "ON" : "OFF", r.metrics.spaceTempC ?? "", r.metrics.supplyAirTempC ?? "",
      r.simulationRemainingMinutes ?? "", r.reportTimestamp || ""
    ]);
    const dStr = "data:text/csv;charset=utf-8," + [cols.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = encodeURI(dStr);
    a.download = `PRIZM_Simulation_Report_${selectedMode}.csv`;
    a.click();
  };

  const triggerJsonExport = () => {
    if (latestResults.length === 0) return;
    const payload = JSON.stringify({
      mode: selectedMode,
      durationMinutes: timeoutMinutes,
      configs: { fanCurrentMinA, compressorCurrentMinA },
      targets: selectedIps,
      runs: latestResults,
      timeSeries: timeSeriesData
    }, null, 2);
    const dStr = "data:text/json;charset=utf-8," + encodeURIComponent(payload);
    const a = document.createElement("a");
    a.href = dStr;
    a.download = `PRIZM_Full_Sim_${selectedMode}.json`;
    a.click();
  };

  // Filters candidates
  const filteredTargets = allTargets.filter(t => {
    if (blockFilter !== "all" && t.blockId !== blockFilter) return false;
    if (arrayFilter !== "all" && String(t.arrayIndex) !== arrayFilter) return false;
    if (stringFilter !== "all" && String(t.stringIndex) !== stringFilter) return false;
    if (reachableOnly && !t.reachable) return false;
    if (!includeCollection && t.isCollectionSegment) return false;
    return true;
  });

  const getBlocksMap = () => {
    const map = new Set<string>();
    allTargets.forEach(t => { if (t.blockId) map.add(t.blockId); });
    return Array.from(map).sort();
  };

  // Counters for the stats card
  const cPass = latestResults.filter(r => r.status === "PASS").length;
  const cWarn = latestResults.filter(r => r.status === "WARNING" || r.status === "STALE").length;
  const cFail = latestResults.filter(r => r.status === "FAIL").length;
  const cExpired = latestResults.filter(r => r.status === "SIMULATION_EXPIRED").length;
  const cOffline = latestResults.filter(r => r.status === "NOT_RESPONDING").length;

  const currentModeConfig = SIM_MODES.find(m => m.id === selectedMode) || SIM_MODES[0];

  // Logic to process chart aggregate or single target
  const getChartData = () => {
    if (graphingIp === "aggregate") {
      const tsMap = new Set<string>();
      selectedIps.forEach(ip => {
        (timeSeriesData[ip] || []).forEach(pt => tsMap.add(pt.time));
      });
      const tList = Array.from(tsMap).sort();
      return tList.map(tStr => {
        let h1Sum = 0, h2Sum = 0, stSum = 0, count = 0;
        selectedIps.forEach(ip => {
          const list = timeSeriesData[ip] || [];
          const match = list.find(pt => pt.time === tStr);
          if (match) {
            h1Sum += match.hvac1Current || 0;
            h2Sum += match.hvac2Current || 0;
            stSum += match.spaceTemp || 0;
            count++;
          }
        });
        return {
          time: tStr,
          hvac1Current: count > 0 ? Number((h1Sum / count).toFixed(2)) : 0,
          hvac2Current: count > 0 ? Number((h2Sum / count).toFixed(2)) : 0,
          spaceTemp: count > 0 ? Number((stSum / count).toFixed(1)) : 0,
        };
      });
    }
    return timeSeriesData[graphingIp] || [];
  };

  const activeChartData = getChartData();

  // Diagnostics list filtering
  const displayDiagnostics = latestResults.filter(r => {
    if (warningFilter === "warn-fail") return r.status === "FAIL" || r.status === "WARNING";
    if (warningFilter === "not-responding") return r.status === "NOT_RESPONDING";
    if (warningFilter === "pass") return r.status === "PASS";
    return true;
  });

  return (
    <div id="hvac-sim-technician" className="text-prizm-text space-y-6 font-sans">
      
      {/* HEADER STATUS / CONTEXT BAR */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 space-y-3 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-prizm-primary/20 text-prizm-primary animate-pulse">
                <Sliders size={18} />
              </span>
              <h1 className="text-lg font-mono font-bold tracking-tight text-white uppercase">
                HVAC Simulation & Diagnostics Console
              </h1>
            </div>
            <p className="text-[11px] text-prizm-text-muted mt-0.5">
              Field technician workflow terminal for redundant HVAC performance verification and remote command simulation.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-prizm-bg text-prizm-text-muted border border-prizm-border">
              UTC Sync Active
            </span>
          </div>
        </div>

        {/* 7 Context Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          
          <div className="bg-prizm-bg p-2 rounded border border-prizm-border/60 text-center">
            <span className="text-[9px] text-prizm-text-muted block uppercase font-mono">Executor</span>
            <span className="text-[11px] font-bold text-cyan-400 font-mono">Direct Feather</span>
          </div>

          <div className="bg-prizm-bg p-2 rounded border border-prizm-border/60 text-center">
            <span className="text-[9px] text-prizm-text-muted block uppercase font-mono">Active Profile</span>
            <span className="text-[11px] font-bold text-prizm-primary font-mono truncate max-w-full block">{profileName}</span>
          </div>

          <div className="bg-prizm-bg p-2 rounded border border-prizm-border/60 text-center">
            <span className="text-[9px] text-prizm-text-muted block uppercase font-mono">Topology Source</span>
            <span className="text-[11px] font-bold text-gray-300 font-mono">Active profile</span>
          </div>

          <div className="bg-prizm-bg p-2 rounded border border-prizm-border/60 text-center">
            <span className="text-[9px] text-prizm-text-muted block uppercase font-mono">Selected Targets</span>
            <span className={`text-[11px] font-bold font-mono ${selectedIps.length > 0 ? "text-yellow-400" : "text-prizm-text-muted"}`}>
              {selectedIps.length} units
            </span>
          </div>

          <div className="bg-prizm-bg p-2 rounded border border-prizm-border/60 text-center">
            <span className="text-[9px] text-prizm-text-muted block uppercase font-mono">Polling Mode</span>
            <span className={`text-[11px] font-bold font-mono inline-flex items-center gap-1 justify-center ${pollingActive ? "text-green-400" : "text-prizm-text-muted"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${pollingActive ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
              {pollingActive ? "ACTIVE" : "STOPPED"}
            </span>
          </div>

          <div className="bg-prizm-bg p-2 rounded border border-prizm-border/60 text-center">
            <span className="text-[9px] text-prizm-text-muted block uppercase font-mono">Last Report</span>
            <span className="text-[11px] font-bold text-gray-200 font-mono truncate">{lastPollTime || "-"}</span>
          </div>

          <div className="bg-prizm-bg p-2 rounded border border-prizm-border/60 text-center">
            <span className="text-[9px] text-prizm-text-muted block uppercase font-mono">Validation Metrics</span>
            <span className="text-[10px] font-bold block leading-tight font-mono">
              <span className="text-green-400">{cPass} P</span> / <span className="text-prizm-danger">{cFail + cOffline} F</span>
            </span>
          </div>

        </div>

        {/* Partial Connection Alert */}
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-2 text-[11px] flex items-center justify-between font-mono">
          <div className="flex items-center gap-2 text-yellow-500">
            <AlertTriangle size={14} className="animate-bounce" />
            <span>Connection Partial — simulation operates against direct network targets, but secondary EMS profiles remain static.</span>
          </div>
          <span className="text-[8px] bg-yellow-500/20 px-1 py-0.5 rounded text-white font-black uppercase">DIRECT LAN</span>
        </div>
      </div>

      {/* Errors & Success bars */}
      {errorMsg && (
        <div className="p-3 bg-prizm-danger/10 border border-prizm-danger/30 text-prizm-danger rounded-md text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-prizm-danger/70 hover:text-prizm-danger"><X size={14} /></button>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 text-green-400 rounded-md text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={15} />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-green-400/70 hover:text-green-400"><X size={14} /></button>
        </div>
      )}

      {/* TWO COLUMN RESPONSIVE FIELD LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COMPACT TECHNI PANEL (35%) */}
        <aside className="lg:col-span-4 space-y-6">
          
          {/* STEP 1: TARGET SELECTION REDESIGN */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-prizm-border pb-1.5">
              <h2 className="text-xs font-bold font-mono uppercase text-white flex items-center gap-1.5">
                <span className="bg-prizm-primary/25 text-prizm-primary px-1.5 rounded text-[10px]">1</span>
                Select Target Nodes
              </h2>
              <span className="text-[10px] font-mono text-prizm-text-muted font-bold">
                MAPPED: {filteredTargets.length}/{allTargets.length}
              </span>
            </div>

            {/* Block & Filter dropdown grids */}
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1 grid-flow-row">
                <div>
                  <label className="text-[8.5px] uppercase font-mono font-bold text-prizm-text-muted block mb-0.5">Block selection</label>
                  <select 
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-1 text-[10px] text-white focus:outline-none focus:border-prizm-primary cursor-pointer"
                    value={blockFilter}
                    onChange={e => setBlockFilter(e.target.value)}
                  >
                    <option value="all">ALL BLOCKS</option>
                    {getBlocksMap().map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="text-[8.5px] uppercase font-mono font-bold text-prizm-text-muted block mb-0.5 font-sans">Array Octet</label>
                  <select
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-1 text-[10px] text-white focus:outline-none focus:border-prizm-primary cursor-pointer font-sans"
                    value={arrayFilter}
                    onChange={e => setArrayFilter(e.target.value)}
                  >
                    <option value="all">ALL ARRAYS</option>
                    {[1,2,3,4,5,6,7,8].map(idx => (
                      <option key={idx} value={idx}>Array {idx}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[8.5px] uppercase font-mono font-bold text-prizm-text-muted block mb-0.5">String ES Node</label>
                  <select
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-1 text-[10px] text-white focus:outline-none focus:border-prizm-primary cursor-pointer"
                    value={stringFilter}
                    onChange={e => setStringFilter(e.target.value)}
                  >
                    <option value="all">ALL NODES</option>
                    {Array.from({ length: 18 }, (_, k) => k + 1).map(nodeIdx => (
                      <option key={nodeIdx} value={nodeIdx}>ES-{nodeIdx}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Toggles bar */}
              <div className="flex gap-4 p-2 bg-prizm-bg rounded border border-prizm-border/50 text-[9.5px] font-mono select-none">
                <label className="flex items-center gap-1.5 cursor-pointer text-prizm-text hover:text-white">
                  <input 
                    type="checkbox" 
                    className="accent-prizm-primary scale-90"
                    checked={reachableOnly} 
                    onChange={e => setReachableOnly(e.target.checked)}
                  />
                  Reachable Only
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-prizm-text hover:text-white" title="Toggle collection hub targets">
                  <input 
                    type="checkbox" 
                    className="accent-prizm-primary scale-90"
                    checked={includeCollection} 
                    onChange={e => setIncludeCollection(e.target.checked)}
                  />
                  Collection segment
                </label>
              </div>

              {/* Selection actions panel */}
              <div className="grid grid-cols-4 gap-1">
                <button 
                  onClick={() => setSelectedIps(allTargets.map(t => t.ip))}
                  className="py-1 text-[8.5px] font-mono border border-prizm-border bg-prizm-bg hover:bg-black/20 text-prizm-text-muted uppercase font-bold rounded"
                >
                  Select All
                </button>
                <button 
                  onClick={() => setSelectedIps([])}
                  className="py-1 text-[8.5px] font-mono border border-prizm-border bg-prizm-bg hover:bg-black/20 text-prizm-text-muted uppercase font-bold rounded"
                >
                  Deselect All
                </button>
                <button 
                  onClick={() => {
                    const filtered = filteredTargets.map(t => t.ip);
                    setSelectedIps(prev => Array.from(new Set([...prev, ...filtered])));
                  }}
                  className="py-1 text-[8.5px] font-mono border border-prizm-primary/30 bg-prizm-primary/10 text-prizm-primary hover:bg-prizm-primary/25 uppercase font-bold rounded"
                >
                  Filtered
                </button>
                <button 
                  onClick={() => {
                    const fails = latestResults.filter(r => r.status === "FAIL" || r.status === "NOT_RESPONDING").map(r => r.ip);
                    if (fails.length > 0) setSelectedIps(fails);
                  }}
                  className="py-1 text-[8.5px] font-mono border border-prizm-danger/30 bg-prizm-danger/10 text-prizm-danger hover:bg-prizm-danger/25 uppercase font-bold rounded"
                >
                  Failed Only
                </button>
              </div>
            </div>

            {/* Checklist items container */}
            <div className="max-h-[140px] overflow-y-auto no-scrollbar border border-prizm-border/60 rounded bg-prizm-bg divide-y divide-prizm-border/25">
              {filteredTargets.length === 0 ? (
                <div className="p-3 text-center text-[10px] uppercase text-prizm-text-muted font-mono">No nodes match search filters</div>
              ) : (
                filteredTargets.map(t => {
                  const check = selectedIps.includes(t.ip);
                  return (
                    <div 
                      key={t.ip}
                      onClick={() => {
                        setSelectedIps(prev => prev.includes(t.ip) ? prev.filter(ip => ip !== t.ip) : [...prev, t.ip]);
                      }}
                      className={`p-1.5 flex items-center justify-between text-[11px] font-mono cursor-pointer transition-colors ${
                        check ? "bg-prizm-primary/10 hover:bg-prizm-primary/15" : "hover:bg-prizm-surface-strong/60"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input type="checkbox" checked={check} onChange={() => {}} className="accent-prizm-primary pointer-events-none scale-90" />
                        <span className={`font-semibold ${check ? "text-prizm-primary" : "text-white"}`}>{t.ip}</span>
                        <span className="text-[9px] text-prizm-text-muted block truncate">{t.entityName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {t.isCollectionSegment && <span className="text-[7.5px] font-bold bg-cyan-900 border border-cyan-700/60 px-1 rounded text-cyan-300">COL</span>}
                        <span className={`w-1.5 h-1.5 rounded-full ${t.reachable ? "bg-green-400 animate-pulse" : "bg-prizm-danger"}`} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Selection summary */}
            <div className="bg-prizm-bg/50 p-2 border border-prizm-border/60 rounded text-[10px] font-mono leading-tight">
              <span className="text-prizm-text-muted uppercase text-[9px] block mb-1">Active Target Nodes Set ({selectedIps.length})</span>
              {selectedIps.length === 0 ? (
                <span className="text-prizm-danger/90 font-bold uppercase">No target gateways selected! Deploy blocked.</span>
              ) : selectedIps.length <= 8 ? (
                <div className="flex flex-wrap gap-1">
                  {selectedIps.map(ip => <span key={ip} className="bg-prizm-surface border border-prizm-border px-1 rounded text-[9.5px] text-white">{ip}</span>)}
                </div>
              ) : (
                <div className="flex justify-between items-center text-white">
                  <span>Selected count: <strong className="text-yellow-400 font-bold">{selectedIps.length} target IPs</strong></span>
                  <button onClick={() => setSelectedIps([])} className="text-[9px] underline text-prizm-danger font-bold hover:text-white">Clear List</button>
                </div>
              )}
            </div>
          </div>

          {/* STEP 2: SIMULATION MODE SELECTION REDESIGN */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 space-y-3 shadow-sm">
            <div className="border-b border-prizm-border pb-1.5">
              <h2 className="text-xs font-bold font-mono uppercase text-white flex items-center gap-1.5">
                <span className="bg-prizm-primary/25 text-prizm-primary px-1.5 rounded text-[10px]">2</span>
                Choose Test Simulation
              </h2>
            </div>

            {/* Grid of action cards/tiles */}
            <div className="grid grid-cols-2 gap-2">
              {SIM_MODES.map(modeItem => {
                const active = selectedMode === modeItem.id;
                const isSpecial = ["ldcool", "bcool"].includes(modeItem.id);
                return (
                  <div
                    key={modeItem.id}
                    onClick={() => setSelectedMode(modeItem.id as HvacSimulationMode)}
                    className={`p-2.5 rounded border text-left cursor-pointer transition-all flex flex-col justify-between relative ${
                      active
                        ? "bg-prizm-primary/10 border-prizm-primary shadow-sm"
                        : "bg-prizm-bg/60 border-prizm-border/40 hover:bg-prizm-surface"
                    }`}
                  >
                    {isSpecial && (
                      <span className="absolute top-1 right-1 text-[7px] font-bold px-1 rounded bg-[#EF4444]/20 border border-[#EF4444]/40 text-[#EF4444] uppercase tracking-wide">
                        HVAC Stage 
                      </span>
                    )}
                    <div>
                      <span className={`block text-[11px] font-bold font-mono ${active ? "text-prizm-primary" : "text-white"}`}>
                        {modeItem.label}
                      </span>
                      <span className="block text-[9px] text-prizm-text-muted mt-0.5 leading-snug font-light">
                        {modeItem.desc}
                      </span>
                    </div>

                    <div className="mt-2 pt-1 border-t border-prizm-border/20 flex items-center justify-between">
                      <span className="text-[8px] text-prizm-text-muted tracking-tight font-mono whitespace-nowrap block truncate max-w-full">
                        {modeItem.threshold}
                      </span>
                      <span className={`w-1 h-1 rounded-full ${active ? "bg-prizm-primary" : "bg-transparent"}`} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Logical toggles display for probe-based simulators */}
            {["lowerTopCap", "leakAlarm", "acDoor", "emergencyVentilation"].includes(selectedMode) && (
              <div className="p-2.5 bg-prizm-bg rounded border border-prizm-border space-y-1 text-[10px] font-mono animate-fade-in duration-200">
                <span className="text-prizm-text-muted uppercase block text-[8px] font-black">Configure Boolean Signal Probe</span>
                
                {selectedMode === "lowerTopCap" && (
                  <div className="flex items-center justify-between">
                    <span>LowerTopcapClosed state:</span>
                    <button 
                      onClick={() => setTopCapState(!topCapState)}
                      className={`px-2 py-0.5 rounded font-bold uppercase transition ${topCapState ? "bg-green-500/20 border border-green-500 text-green-400" : "bg-red-500/20 border border-red-500 text-red-400"}`}
                    >
                      {topCapState ? "CLOSED (TRUE)" : "OPEN (FALSE)"}
                    </button>
                  </div>
                )}

                {selectedMode === "leakAlarm" && (
                  <div className="flex items-center justify-between">
                    <span>Leak Detection Alarm active:</span>
                    <button 
                      onClick={() => setLeakAlarmState(!leakAlarmState)}
                      className={`px-2 py-0.5 rounded font-bold uppercase transition ${leakAlarmState ? "bg-red-500/20 border border-red-500 text-red-400 animate-pulse" : "bg-green-500/20 border border-green-500 text-green-400"}`}
                    >
                      {leakAlarmState ? "ALARM (TRUE)" : "CLEAR (FALSE)"}
                    </button>
                  </div>
                )}

                {selectedMode === "acDoor" && (
                  <div className="flex items-center justify-between">
                    <span>HVAC Door contact limit switch:</span>
                    <button 
                      onClick={() => setAcDoorState(!acDoorState)}
                      className={`px-2 py-0.5 rounded font-bold uppercase transition ${acDoorState ? "bg-green-500/20 border border-green-500 text-green-400" : "bg-yellow-500/25 border border-yellow-500 text-yellow-400"}`}
                    >
                      {acDoorState ? "SECURED (TRUE)" : "BREACHED (FALSE)"}
                    </button>
                  </div>
                )}

                {selectedMode === "emergencyVentilation" && (
                  <div className="flex items-center justify-between">
                    <span>Safety Exhaust blower override:</span>
                    <button 
                      onClick={() => setEvState(!evState)}
                      className={`px-2 py-0.5 rounded font-bold uppercase transition ${evState ? "bg-red-500/20 border border-red-500 text-red-300" : "bg-prizm-bg border border-prizm-border text-prizm-text-muted"}`}
                    >
                      {evState ? "EXHAUST FAN ALWAYS ON" : "PASSIVE CONTROL"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* STEP 3: CONFIGURE RUN REDESIGN */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 space-y-3 shadow-sm font-mono text-[10px]">
            <div className="border-b border-prizm-border pb-1.5 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
                <span className="bg-prizm-primary/25 text-prizm-primary px-1.5 rounded text-[10px]">3</span>
                Configure Run Settings
              </h2>
            </div>

            {/* Timeout Slider + numeric */}
            {selectedMode !== "clearAll" && (
              <div className="bg-prizm-bg p-2.5 rounded border border-prizm-border space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-prizm-text-muted font-bold uppercase text-[9px]">Simulation timeout window:</span>
                  <span className="text-yellow-400 font-bold bg-yellow-400/5 px-2 py-0.5 rounded">{timeoutMinutes} minutes</span>
                </div>
                <div className="flex items-center gap-3">
                  <input 
                    type="range"
                    min={30}
                    max={240}
                    step={10}
                    value={timeoutMinutes}
                    onChange={e => setTimeoutMinutes(Number(e.target.value))}
                    className="flex-1 accent-prizm-primary cursor-pointer"
                  />
                  <input
                    type="number"
                    min={30}
                    max={240}
                    value={timeoutMinutes}
                    onChange={e => {
                      let val = parseInt(e.target.value) || 30;
                      if (val > 240) val = 240;
                      if (val < 10) val = 10;
                      setTimeoutMinutes(val);
                    }}
                    className="w-[50px] bg-prizm-surface border border-prizm-border text-right p-0.5 rounded text-white text-[10px]"
                  />
                </div>
              </div>
            )}

            {/* Boolean option flags */}
            <div className="space-y-1.5 bg-prizm-bg/60 p-2.5 rounded border border-prizm-border/60">
              <label className="flex items-center gap-2 cursor-pointer text-prizm-text hover:text-white select-none">
                <input 
                  type="checkbox"
                  checked={normalizeBeforeApply}
                  onChange={e => setNormalizeBeforeApply(e.target.checked)}
                  className="accent-prizm-primary scale-90"
                />
                <div>
                  <span className="block font-bold">Normalize / reset targets first</span>
                  <span className="text-[8px] text-prizm-text-muted block font-light">Erase current settings before executing override payload</span>
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-prizm-text hover:text-white select-none">
                <input 
                  type="checkbox"
                  checked={verifyAfterApply}
                  onChange={e => setVerifyAfterApply(e.target.checked)}
                  className="accent-prizm-primary scale-90"
                />
                <div>
                  <span className="block font-bold">Verify telemetry query immediately</span>
                  <span className="text-[8px] text-prizm-text-muted block font-light">Dispatches immediate 2-second telemetry verification grace sequence</span>
                </div>
              </label>
            </div>

            {/* Worker pool & poll intervals */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[8.5px] uppercase font-bold text-prizm-text-muted block mb-0.5">Worker Concurrency</label>
                <input 
                  type="number"
                  min={1}
                  max={16}
                  value={concurrency}
                  onChange={e => setConcurrency(Math.max(1, parseInt(e.target.value) || 8))}
                  className="w-full bg-prizm-bg text-white rounded p-1 text-[10px] border border-prizm-border text-center"
                />
              </div>

              <div>
                <label className="text-[8.5px] uppercase font-bold text-prizm-text-muted block mb-0.5">Telemetry Poll Interval</label>
                <select
                  value={pollingIntervalSec}
                  onChange={e => setPollingIntervalSec(Number(e.target.value))}
                  className="w-full bg-prizm-bg text-white rounded p-1 text-[10px] border border-prizm-border focus:outline-none focus:border-prizm-primary cursor-pointer text-center"
                >
                  <option value={1}>1s Refresh</option>
                  <option value={3}>3s Standard</option>
                  <option value={5}>5s Coarse</option>
                  <option value={10}>10s Relaxed</option>
                </select>
              </div>
            </div>

            {/* COLLAPSIBLE ADVANCED THRESHOLDS CARD */}
            <div className="pt-1.5">
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="w-full bg-black/25 text-cyan-400 text-center font-mono py-1 rounded border border-prizm-border/50 text-[9.5px] font-bold uppercase transition hover:text-white flex items-center justify-center gap-1"
              >
                <Sliders size={10} />
                {advancedOpen ? "Hide Advanced Threshold Configurations" : "Show Advanced Validation Settings"}
              </button>

              {advancedOpen && (
                <div className="mt-2 bg-prizm-bg p-2.5 rounded border border-prizm-border space-y-2 text-[9.5px] animate-fade-in font-mono duration-150">
                  <span className="text-yellow-400 font-bold block uppercase text-[8px]">Precision Validation Parameters</span>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="block text-prizm-text-muted uppercase mb-0.5">Fan Min Current:</span>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number"
                          step="0.1" 
                          value={fanCurrentMinA}
                          onChange={e => setFanCurrentMinA(parseFloat(e.target.value) || 0)}
                          className="w-full bg-prizm-surface text-center rounded p-1 border border-prizm-border text-white text-[10px]"
                        />
                        <span>A</span>
                      </div>
                    </div>

                    <div>
                      <span className="block text-prizm-text-muted uppercase mb-0.5">Compressor Min Load:</span>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number"
                          step="0.5" 
                          value={compressorCurrentMinA}
                          onChange={e => setCompressorCurrentMinA(parseFloat(e.target.value) || 0)}
                          className="w-full bg-prizm-surface text-center rounded p-1 border border-prizm-border text-white text-[10px]"
                        />
                        <span>A</span>
                      </div>
                    </div>

                    <div>
                      <span className="block text-prizm-text-muted uppercase mb-0.5">Response Grace:</span>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number"
                          value={responseGracePeriodSec}
                          onChange={e => setResponseGracePeriodSec(parseInt(e.target.value) || 0)}
                          className="w-full bg-prizm-surface text-center rounded p-1 border border-prizm-border text-white text-[10px]"
                        />
                        <span>s</span>
                      </div>
                    </div>

                    <div>
                      <span className="block text-prizm-text-muted uppercase mb-0.5">Report Stale Age:</span>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number"
                          value={staleReportMaxAgeSec}
                          onChange={e => setStaleReportMaxAgeSec(parseInt(e.target.value) || 0)}
                          className="w-full bg-prizm-surface text-center rounded p-1 border border-prizm-border text-white text-[10px]"
                        />
                        <span>s</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </aside>

        {/* RIGHT METRICS & RESULTS INTERACTIVE LAYOUT (65%) */}
        <main className="lg:col-span-8 space-y-6">
          
          {/* STEP 4: DEPLOY / CLEAR COMMAND CARD */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-5 relative overflow-hidden">
            <div className="space-y-1.5 flex-1 relative z-10">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping" />
                <span className="text-xs font-mono font-bold text-yellow-400 uppercase tracking-widest block">
                  Step 4: Deploy & Override Controller Limits
                </span>
              </div>
              
              <h3 className="text-base font-bold text-white uppercase font-mono tracking-tight">
                Ready to Command: <span className="text-prizm-primary">{currentModeConfig.label}</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[10.5px] font-mono leading-relaxed text-prizm-text-muted">
                <div>
                  Targets Selected: <span className="text-white font-bold">{selectedIps.length} units</span>
                </div>
                <div>
                  Runtime Duration: <span className="text-white font-bold">{timeoutMinutes} mins</span>
                </div>
                <div>
                  Immediate Probe Verification: <span className="text-white font-bold">{verifyAfterApply ? "ACTIVE" : "BYPASSED"}</span>
                </div>
                <div>
                  Expected Response: <span className="text-cyan-400 font-bold block truncate max-w-[200px]" title={currentModeConfig.expected}>
                    {currentModeConfig.expected}
                  </span>
                </div>
              </div>
            </div>

            {/* Run Action triggers */}
            <div className="flex flex-row md:flex-col gap-2 w-full md:w-auto relative z-10 sm:min-w-[190px]">
              <button
                onClick={() => {
                  if (selectedIps.length === 0) {
                    setErrorMsg("You must select at least one target gateway node first to deploy simulation.");
                    return;
                  }
                  setErrorMsg(null);
                  setSuccessMsg(null);
                  setShowConfirmModal(true);
                }}
                disabled={isApplying || selectedIps.length === 0}
                className="flex-1 py-2.5 px-4 bg-green-500 hover:bg-green-600 text-black font-black font-mono text-xs uppercase rounded tracking-wider flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none shadow"
              >
                {isApplying ? <RefreshCw className="animate-spin" size={13} /> : <Play size={13} />}
                Deploy Simulation
              </button>

              <button
                onClick={handleClearAllSimulation}
                disabled={isApplying || selectedIps.length === 0}
                className="flex-1 py-1.5 px-4 bg-prizm-bg border border-prizm-danger hover:bg-prizm-danger/10 text-prizm-danger font-bold font-mono text-[10.5px] uppercase rounded tracking-wider flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
              >
                <Trash2 size={12} />
                Clear Overrides
              </button>

              <div className="hidden sm:flex gap-1 text-[9px] font-mono">
                <button 
                  onClick={() => executeVerifyFetch()} 
                  disabled={selectedIps.length === 0}
                  className="flex-1 py-1 bg-[#1F2937] hover:bg-black/30 border border-prizm-border rounded text-center uppercase tracking-tighter"
                >
                  Recall Report
                </button>
              </div>
            </div>

            {/* Back grid overlay motif */}
            <div className="absolute inset-y-0 right-0 w-1/3 opacity-2 bg-[radial-gradient(#6366F1_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
          </div>

          {/* STEP 5: LIVE VALIDATION SUMMARY & MONITOR PANEL */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 space-y-4 shadow-md">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-prizm-border pb-2.5 font-mono">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Step 5: Live Verification Logs & Monitors
                </span>
              </div>

              {/* Poller Action Controls */}
              <div className="flex items-center gap-2 text-xs">
                <div className="flex bg-black/45 rounded p-0.5 border border-prizm-border text-[9.5px]">
                  <button
                    onClick={() => { setPollingActive(true); executeVerifyFetch(); }}
                    disabled={pollingActive || selectedIps.length === 0}
                    className="px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/25 rounded disabled:opacity-40 hover:bg-green-500/15"
                  >
                    POLL START
                  </button>
                  <button
                    onClick={() => setPollingActive(false)}
                    disabled={!pollingActive}
                    className="px-2 py-1 bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/25 rounded disabled:opacity-40 hover:bg-prizm-danger/15"
                  >
                    STOP
                  </button>
                </div>

                <button
                  onClick={executeVerifyFetch}
                  disabled={selectedIps.length === 0}
                  className="p-1 px-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded text-[9.5px] uppercase font-bold tracking-wider"
                >
                  Scan Now
                </button>
              </div>
            </div>

            {/* Aggregated visual status card block */}
            <div className="grid grid-cols-5 gap-2 text-center select-none font-mono">
              
              <div 
                onClick={() => setWarningFilter("all")}
                className={`p-2 border rounded-md cursor-pointer transition ${
                  warningFilter === "all" ? "bg-prizm-border border-gray-400" : "bg-prizm-bg border-prizm-border/40 hover:bg-prizm-surface-strong/40"
                }`}
              >
                <span className="block text-[18px] font-black text-white leading-tight">{latestResults.length}</span>
                <span className="block text-[8.5px] text-prizm-text-muted uppercase">MONITORED</span>
              </div>

              <div 
                onClick={() => setWarningFilter("pass")}
                className={`p-2 border rounded-md cursor-pointer transition ${
                  warningFilter === "pass" ? "bg-green-500/15 border-green-400" : "bg-prizm-bg border-prizm-border/40 hover:bg-prizm-surface-strong/40"
                }`}
              >
                <span className="block text-[18px] font-black text-green-400 leading-tight">{cPass}</span>
                <span className="block text-[8.5px] text-green-500 block uppercase">PASSING</span>
              </div>

              <div 
                onClick={() => setWarningFilter("warn-fail")}
                className={`p-2 border rounded-md cursor-pointer transition ${
                  warningFilter === "warn-fail" ? "bg-yellow-500/15 border-yellow-400" : "bg-prizm-bg border-prizm-border/40 hover:bg-prizm-surface-strong/40"
                }`}
              >
                <span className="block text-[18px] font-black text-yellow-400 leading-tight">{cWarn + cFail}</span>
                <span className="block text-[8.5px] text-yellow-500 block uppercase">WARNINGS</span>
              </div>

              <div 
                className="p-2 border rounded-md bg-prizm-bg border-prizm-border/40 text-prizm-text-muted cursor-default"
              >
                <span className="block text-[18px] font-black text-cyan-400 leading-tight">{cExpired}</span>
                <span className="block text-[8.5px] text-prizm-text-muted block uppercase">EXPIRED</span>
              </div>

              <div 
                onClick={() => setWarningFilter("not-responding")}
                className={`p-2 border rounded-md cursor-pointer transition ${
                  warningFilter === "not-responding" ? "bg-red-500/15 border-prizm-danger" : "bg-prizm-bg border-prizm-border/40 hover:bg-prizm-surface-strong/40"
                }`}
              >
                <span className="block text-[18px] font-black text-prizm-danger leading-tight">{cOffline}</span>
                <span className="block text-[8.5px] text-prizm-danger block uppercase">OFFLINE</span>
              </div>

            </div>

            {/* REAL-TIME CHARTS PANEL */}
            {selectedIps.length > 0 && (
              <div className="bg-prizm-bg p-3 border border-prizm-border/80 rounded-lg space-y-3">
                <div className="flex items-center justify-between pb-1.5 border-b border-prizm-border/40 font-mono text-[10.5px]">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp size={13} className="text-prizm-primary animate-pulse" />
                    <span className="text-white uppercase font-bold">Live Trends:</span>
                    <span className="text-yellow-400 font-bold bg-[#1F2937] px-2 py-0.5 rounded">
                      {graphingIp === "aggregate" ? "ALL (Selected Aggregate)" : graphingIp}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-prizm-text-muted">Target IP:</span>
                    <select
                      value={graphingIp}
                      onChange={e => setGraphingIp(e.target.value)}
                      className="bg-prizm-surface border border-prizm-border text-white text-[10px] font-mono rounded px-1.5 cursor-pointer"
                    >
                      <option value="aggregate">★ ALL SELECTED (AGGREGATE)</option>
                      {selectedIps.map(ip => <option key={ip} value={ip}>{ip}</option>)}
                    </select>
                  </div>
                </div>

                {activeChartData.length === 0 ? (
                  <div className="h-[120px] flex flex-col items-center justify-center border border-dashed border-prizm-border/40 rounded bg-black/10 text-center font-mono text-[9.5px] p-5 text-prizm-text-muted">
                    <Clock className="opacity-50 mb-1" size={20} />
                    <span>TIMELINE COORDINATES CACHING...</span>
                    <span>Start poller thread to stream electric load graphs.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Amps Chart */}
                    <div className="bg-black/15 p-2 rounded border border-prizm-border/45 space-y-1">
                      <div className="flex justify-between text-[9px] font-mono font-bold text-prizm-primary uppercase">
                        <span>HVAC Electrical Amps Load index</span>
                        <span className="text-[8px] text-prizm-text-muted">Limit: {compressorCurrentMinA}A</span>
                      </div>
                      <div className="h-[125px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={activeChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" opacity={0.25} />
                            <XAxis dataKey="time" stroke="#4A5568" style={{ fontSize: "7px" }} />
                            <YAxis stroke="#4A5568" style={{ fontSize: "7px" }} unit=" A" />
                            <Tooltip contentStyle={{ background: "#1F2937", border: "1px solid #4A5568", fontSize: "10px" }} />
                            <Line type="monotone" dataKey="hvac1Current" name="HVAC 1 Amps" stroke="#6366F1" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="hvac2Current" name="HVAC 2 Amps" stroke="#3B82F6" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                            <ReferenceLine y={compressorCurrentMinA} stroke="#EF4444" strokeDasharray="3 3" />
                            <ReferenceLine y={fanCurrentMinA} stroke="#10B981" strokeDasharray="2 2" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Temp Trends */}
                    <div className="bg-black/15 p-2 rounded border border-prizm-border/45 space-y-1">
                      <span className="block text-[9px] font-mono font-bold text-cyan-300 uppercase">
                        Internal space temperature Trends (°C)
                      </span>
                      <div className="h-[125px] w-full block">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={activeChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" opacity={0.25} />
                            <XAxis dataKey="time" stroke="#4A5568" style={{ fontSize: "7px" }} />
                            <YAxis stroke="#4A5568" style={{ fontSize: "7px" }} unit="°" />
                            <Tooltip contentStyle={{ background: "#1F2937", border: "1px solid #4A5568", fontSize: "10px" }} />
                            <Line type="monotone" dataKey="spaceTemp" name="Internal Space" stroke="#10B981" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            )}

            {/* VALIDATION RESULTS TABLE */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-mono text-[10px] pb-1 border-b border-prizm-border/40">
                <span className="text-white font-bold uppercase tracking-wider flex items-center gap-1">
                  <Database size={11} className="text-prizm-primary" />
                  Live Field Verification reports ({latestResults.length} active)
                </span>

                <div className="flex bg-black p-0.5 rounded border border-prizm-border text-[8.5px]">
                  <button onClick={triggerCsvExport} disabled={latestResults.length === 0} className="px-1.5 hover:text-white text-prizm-text-muted uppercase border-r border-prizm-border/30 disabled:opacity-40">
                    EX CSV
                  </button>
                  <button onClick={triggerJsonExport} disabled={latestResults.length === 0} className="px-1.5 hover:text-white text-prizm-text-muted uppercase disabled:opacity-40">
                    EX JSON
                  </button>
                </div>
              </div>

              {latestResults.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-prizm-border/30 rounded bg-black/10 font-mono text-[9.5px] text-prizm-text-muted flex flex-col items-center justify-center">
                  <Database className="opacity-30 mb-2" size={24} />
                  <span>NO REAL-WORLD REPORTS COMPILED</span>
                  <span>Connect target units above and deploy simulated override parameters.</span>
                </div>
              ) : (
                <div className="overflow-x-auto border border-prizm-border rounded bg-prizm-bg max-h-[220px]">
                  <table className="w-full text-left font-mono text-[10px] whitespace-nowrap table-auto">
                    <thead className="bg-[#111827] text-white/90 sticky top-0 font-bold border-b border-prizm-border text-[9px] uppercase">
                      <tr>
                        <th className="p-2 border-r border-prizm-border/20">Target IP</th>
                        <th className="p-2 border-r border-prizm-border/20 text-center">Status</th>
                        <th className="p-2 border-r border-prizm-border/20 text-center">Stage Call</th>
                        <th className="p-2 border-r border-prizm-border/20 text-center">H1 Amps</th>
                        <th className="p-2 border-r border-prizm-border/20 text-center font-bold">H1 Blower / Comp</th>
                        <th className="p-2 border-r border-prizm-border/20 text-center font-bold">H2 Amps</th>
                        <th className="p-2 border-r border-prizm-border/20 text-center font-bold">H2 Blower / Comp</th>
                        <th className="p-2 border-r border-prizm-border/20 text-center">Sim?</th>
                        <th className="p-2 text-right">Time Rem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-prizm-border/25">
                      {latestResults.map(r => {
                        const sClass = r.status === "PASS"
                          ? "bg-green-500/10 text-green-400 border-green-500/20"
                          : r.status === "WARNING"
                          ? "bg-yellow-500/15 text-yellow-500 border-yellow-500/20"
                          : r.status === "NOT_RESPONDING"
                          ? "bg-red-500/15 text-prizm-danger border-prizm-danger/20"
                          : "bg-prizm-danger/10 text-prizm-danger border-prizm-danger/20";

                        const h1Passed = r.hvac1.passed;
                        const h2Passed = r.hvac2.passed;

                        return (
                          <tr 
                            key={r.ip} 
                            onClick={() => setSelectedResultDetail(r)}
                            className="hover:bg-prizm-surface-strong/60 transition-all cursor-pointer border-b border-prizm-border/10"
                          >
                            <td className="p-2 font-bold text-white border-r border-prizm-border/20 flex items-center gap-1.5">
                              <Eye size={10} className="text-prizm-primary" />
                              {r.ip}
                            </td>
                            
                            <td className="p-1.5 text-center border-r border-prizm-border/20">
                              <span className={`px-2 py-0.5 rounded font-black text-[8px] uppercase tracking-wider border ${sClass}`}>
                                {r.status === "NOT_RESPONDING" ? "OFFLINE" : r.status}
                              </span>
                            </td>

                            <td className="p-1.5 text-center font-light border-r border-prizm-border/20">
                              {r.mode.toUpperCase()}
                            </td>

                            <td className="p-1.5 text-center border-r border-prizm-border/20 font-bold text-white">
                              {r.hvac1.currentA !== null ? `${r.hvac1.currentA.toFixed(1)}A` : "-"}
                            </td>

                            <td className="p-1.5 text-center border-r border-prizm-border/20 space-x-1.5 font-bold">
                              {/* Fan badge */}
                              {r.hvac1.fanHighOn !== null ? (
                                <span className={`px-1 rounded text-[8px] ${r.hvac1.fanHighOn ? "bg-green-500/10 text-green-400" : "bg-prizm-bg text-prizm-text-muted"}`}>
                                  {r.hvac1.fanHighOn ? "FAN_HI" : "FAN_OFF"}
                                </span>
                              ) : <span className="text-prizm-text-muted">-</span>}

                              {/* Comp badge */}
                              {r.hvac1.compressorOn !== null ? (
                                <span className={`px-1 rounded text-[8px] border ${
                                  r.hvac1.compressorOn 
                                    ? "bg-green-500/10 text-green-400 border-green-500/20" 
                                    : (r.hvac1.expected && !h1Passed ? "bg-red-500/20 text-prizm-danger border-prizm-danger/30 animate-pulse" : "bg-prizm-bg text-prizm-text-muted border-transparent")
                                }`}>
                                  {r.hvac1.compressorOn ? "COMP_ON" : "COMP_OFF"}
                                </span>
                              ) : <span className="text-prizm-text-muted">-</span>}
                            </td>

                            <td className="p-1.5 text-center border-r border-prizm-border/20 font-bold text-white">
                              {r.hvac2.currentA !== null ? `${r.hvac2.currentA.toFixed(1)}A` : "-"}
                            </td>

                            <td className="p-1.5 text-center border-r border-prizm-border/20 space-x-1.5 font-bold">
                              {/* Fan badge */}
                              {r.hvac2.fanHighOn !== null ? (
                                <span className={`px-1 rounded text-[8px] ${r.hvac2.fanHighOn ? "bg-green-500/10 text-green-400" : "bg-prizm-bg text-prizm-text-muted"}`}>
                                  {r.hvac2.fanHighOn ? "FAN_HI" : "FAN_OFF"}
                                </span>
                              ) : <span className="text-prizm-text-muted">-</span>}

                              {/* Comp badge */}
                              {r.hvac2.compressorOn !== null ? (
                                <span className={`px-1 rounded text-[8px] border ${
                                  r.hvac2.compressorOn 
                                    ? "bg-green-500/10 text-green-400 border-green-500/20" 
                                    : (r.hvac2.expected && !h2Passed ? "bg-red-500/20 text-prizm-danger border-prizm-danger/30 animate-pulse" : "bg-prizm-bg text-prizm-text-muted border-transparent")
                                }`}>
                                  {r.hvac2.compressorOn ? "COMP_ON" : "COMP_OFF"}
                                </span>
                              ) : <span className="text-prizm-text-muted">-</span>}
                            </td>

                            <td className="p-1.5 text-center border-r border-prizm-border/20">
                              <span className={r.simulationRemainingMinutes && r.simulationRemainingMinutes > 0 ? "text-green-400 font-bold" : "text-prizm-text-muted"}>
                                {r.simulationRemainingMinutes && r.simulationRemainingMinutes > 0 ? "YES" : "NO"}
                              </span>
                            </td>

                            <td className="p-1.5 text-right font-bold text-white">
                              {r.simulationRemainingMinutes !== null ? `${r.simulationRemainingMinutes} min` : "-"}
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* STEP 6: WARN / FAILURE DETAILED DIAGNOSTICS PANEL */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 space-y-4 shadow-md">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-prizm-border pb-2">
              <h2 className="text-xs font-bold font-mono uppercase text-white flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-yellow-400 animate-pulse" />
                Step 6: Actionable Warning & Discrepancy Details
              </h2>

              {/* Warnings local filters list */}
              <div className="flex bg-black/45 p-0.5 rounded border border-prizm-border/60 text-[8.5px] font-mono">
                {[
                  { id: "all", label: "Show All" },
                  { id: "warn-fail", label: "Failed/Warnings" },
                  { id: "not-responding", label: "Offline" },
                  { id: "pass", label: "Passed Only" }
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setWarningFilter(opt.id as any)}
                    className={`px-1.5 py-0.5 rounded font-bold uppercase transition ${
                      warningFilter === opt.id ? "bg-prizm-primary text-black" : "text-prizm-text-muted hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {displayDiagnostics.length === 0 ? (
              <div className="p-4 text-center text-prizm-text-muted text-[10.5px] font-mono uppercase bg-black/5 rounded">
                No active diagnostic warnings logged for this scope
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto no-scrollbar font-mono text-[10.5px]">
                {displayDiagnostics.map(row => {
                  let borderCol = "border-l-4 border-green-400 bg-green-500/5";
                  let severity = "LOW";
                  let issueText = "Autonomous Operations Nominal";
                  let measured = `H1: ${row.hvac1.currentA ?? 0}A, H2: ${row.hvac2.currentA ?? 0}A`;
                  let expected = `Standard climate feedback controls reacting.`;
                  let recommendation = "Verify cooling metrics periodically under standard poller sequence.";

                  if (row.status === "NOT_RESPONDING") {
                    borderCol = "border-l-4 border-prizm-danger bg-prizm-danger/5";
                    severity = "CRITICAL";
                    issueText = "NODE HEARTBEAT LOSS / OFFLINE";
                    measured = "Direct Feather ping timeout. No responding LAN frames received.";
                    expected = "Active TCP socket heartbeat response <3000ms.";
                    recommendation = "Check direct KVM LAN switches, check direct ethernet interface wiring, or power-cycle direct Feather controller board.";
                  } else if (row.status === "FAIL") {
                    borderCol = "border-l-4 border-prizm-danger bg-prizm-danger/5";
                    severity = "CRITICAL FAIL";
                    issueText = row.flags.includes("COMPRESSOR_NOT_CALLED") ? "COMPRESSOR THERMOSTAT CALL FAILURE" : "ELECTRICAL STAGE DISCREPANCY DETECTED";
                    measured = `measured H1 current = ${row.hvac1.currentA ?? 0}A, current H2 = ${row.hvac2.currentA ?? 0}A`;
                    expected = `Expected compressor current load >= ${compressorCurrentMinA}A under cooling command sequence.`;
                    recommendation = "Verify command stages from Feather, check local HVAC electrical panels, inspect compressor contactor hardware drifts.";
                  } else if (row.status === "WARNING" || row.status === "STALE") {
                    borderCol = "border-l-4 border-yellow-400 bg-yellow-400/5";
                    severity = "WARNING";
                    issueText = row.status === "STALE" ? "TELEMETRY LATENCY STALE WARNING" : "REDUNDANCY OVERRIDE ENGED DRIFT";
                    measured = `Measured timestamp age = ${row.reportTimestamp ? "Aging report profile" : "Expired interval"}`;
                    expected = `Expected active report age < ${staleReportMaxAgeSec} seconds.`;
                    recommendation = "Uplink packet routing latency detected on this gateway string segment. Re-sync direct LAN switch interfaces.";
                    
                    if (row.flags.includes("COMPRESSOR_CURRENT_LOW")) {
                      issueText = "COMPRESSOR CURRENT UNDER LIMIT";
                      measured = `HVAC current drew = ${row.hvac1.currentA ?? row.hvac2.currentA ?? 0}A`;
                      expected = `Expected minimum operating load >= ${compressorCurrentMinA}A threshold.`;
                      recommendation = "Inspect thermal cycle pressures, check freon leak stages, contact field HVAC technician to inspect electrical compressor drawing logs.";
                    }
                  } else if (row.status === "SIMULATION_EXPIRED") {
                    borderCol = "border-l-4 border-gray-500 bg-white/5";
                    severity = "EXPIRED";
                    issueText = "SIMULATION CONTROL WINDOW TIMER EXPIRED";
                    measured = "Simulated duration remaining = 0 minutes.";
                    expected = "Timeout timer active > 0 minutes.";
                    recommendation = "Reset simulation state or deploy a fresh simulation window configuration to restore active verification.";
                  }

                  return (
                    <div key={row.ip} className={`p-3 rounded border border-prizm-border hover:bg-black/10 transition-colors flex flex-col sm:flex-row justify-between gap-3 ${borderCol}`}>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <strong className="text-white font-bold">{row.ip}</strong>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${
                            severity.includes("CRITICAL") ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"
                          }`}>
                            {severity}
                          </span>
                        </div>
                        <div className="text-white/90 font-bold uppercase text-[9.5px] leading-tight">
                          {issueText}
                        </div>
                        <div className="text-[10px] text-prizm-text-muted space-y-0.5 font-light">
                          <div><span className="font-bold">MEASURED:</span> {measured}</div>
                          <div><span className="font-bold">EXPECTED:</span> {expected}</div>
                        </div>
                      </div>

                      <div className="sm:max-w-[220px] text-[10px] sm:text-right font-sans p-2 bg-black/20 rounded border border-prizm-border/40 flex flex-col justify-center">
                        <span className="text-[8px] font-mono text-prizm-primary font-bold uppercase block mb-1">Recommended Action</span>
                        <p className="text-prizm-text leading-tight text-[9.5px]">{recommendation}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* STEP 7: RUN AUDIT HISTORY / EXPORTS PANEL */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 shadow-md space-y-3">
            <button
              onClick={() => setHistoryCollapsed(!historyCollapsed)}
              className="w-full flex items-center justify-between border-b border-prizm-border pb-1.5 text-xs text-white font-mono uppercase font-bold"
            >
              <div className="flex items-center gap-1.5">
                <Clock size={12} className="text-prizm-primary" />
                <span>Step 7: Run History logs & audit ledger ({auditLogs.length})</span>
              </div>
              <span className="text-[9.5px] text-cyan-400 underline font-normal">
                {historyCollapsed ? "Expand Lists" : "Collapse"}
              </span>
            </button>

            {!historyCollapsed && (
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto no-scrollbar font-mono text-[9.5px]">
                {auditLogs.length === 0 ? (
                  <div className="p-3 text-center text-prizm-text-muted uppercase">No audit trails parsed.</div>
                ) : (
                  auditLogs.map((log, index) => {
                    const ok = log.validationStatus === "PASS";
                    return (
                      <div key={index} className="p-2 border border-prizm-border/60 rounded bg-prizm-bg flex items-center justify-between gap-3 text-prizm-text leading-tight">
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="text-cyan-400 font-bold uppercase">{log.mode}</span>
                            <span className="text-white">Applied to {log.targetIps?.length || 0} nodes</span>
                          </div>
                          <span className="text-[8.5px] text-prizm-text-muted block mt-0.5">
                            TIMED: {formatTimestampWithUtc(log.timestamp)}  |  Profile: {log.profileName || "EMS_DEFAULT"}
                          </span>
                        </div>

                        <span className={`px-2 py-0.5 rounded font-black border text-[8.5px] ${
                          ok ? "bg-green-500/10 border-green-500/25 text-green-400" : "bg-yellow-500/15 border-yellow-500/30 text-yellow-400"
                        }`}>
                          {log.validationStatus || "PASS"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

        </main>
      </div>

      {/* SINGLE COLUMN DETAILED SLIDE OUT DRAWER/PANEL */}
      {selectedResultDetail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-prizm-surface-strong border-l border-prizm-border w-full max-w-lg shadow-2xl p-5 overflow-y-auto flex flex-col gap-4 font-mono text-xs">
            
            <div className="flex items-center justify-between border-b border-prizm-border pb-3">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-prizm-primary animate-pulse" />
                <h3 className="text-white text-sm font-bold uppercase font-mono">
                  Device Details: {selectedResultDetail.ip}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedResultDetail(null)}
                className="p-1 rounded bg-prizm-bg border border-prizm-border text-prizm-text-muted hover:text-white hover:border-white transition"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto no-scrollbar">
              
              {/* Dynamic details */}
              <div className="space-y-1.5 bg-prizm-bg p-3 border border-prizm-border rounded">
                <div className="flex justify-between border-b border-prizm-border/10 pb-1">
                  <span className="text-prizm-text-muted font-bold">VAL TIMESTAMP:</span>
                  <span className="text-white">{formatTimestampWithUtc(selectedResultDetail.reportTimestamp || "")}</span>
                </div>
                <div className="flex justify-between border-b border-prizm-border/10 pb-1">
                  <span className="text-prizm-text-muted font-bold">SIM ACTIVE STATE:</span>
                  <span className="text-green-400 font-bold uppercase">{selectedResultDetail.simulationRemainingMinutes ? "ACTIVE" : "INACTIVE"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-prizm-text-muted font-bold">TIMER REMAINING:</span>
                  <span className="text-white font-bold">{selectedResultDetail.simulationRemainingMinutes ?? 0} mins</span>
                </div>
              </div>

              {/* Status details HVAC 1 */}
              <div className="p-3 border border-prizm-border rounded space-y-1.5 bg-prizm-bg">
                <span className="text-prizm-primary font-bold block uppercase border-b border-prizm-border/20 pb-1">HVAC 1 Telemetry diagnostics</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>Current draw: <strong className="text-white">{selectedResultDetail.hvac1.currentA !== null ? `${selectedResultDetail.hvac1.currentA}A` : "-"}</strong></div>
                  <div>Compressor call: <strong className="text-white">{selectedResultDetail.hvac1.compressorOn ? "ON (HIGH)" : "OFF"}</strong></div>
                  <div>Condenser fan: <strong className="text-white">{selectedResultDetail.hvac1.fanHighOn ? "HIGH SPEED" : "LOW/OFF"}</strong></div>
                  <div>Reversing Valve: <strong className="text-white">{selectedResultDetail.hvac1.reversingValveOn ? "HEATING" : "COOLING"}</strong></div>
                </div>
              </div>

              {/* Status details HVAC 2 */}
              <div className="p-3 border border-prizm-border rounded space-y-1.5 bg-prizm-bg">
                <span className="text-cyan-400 font-bold block uppercase border-b border-prizm-border/20 pb-1">HVAC 2 Telemetry diagnostics</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>Current draw: <strong className="text-white">{selectedResultDetail.hvac2.currentA !== null ? `${selectedResultDetail.hvac2.currentA}A` : "-"}</strong></div>
                  <div>Compressor call: <strong className="text-white">{selectedResultDetail.hvac2.compressorOn ? "ON (HIGH)" : "OFF"}</strong></div>
                  <div>Condenser fan: <strong className="text-white">{selectedResultDetail.hvac2.fanHighOn ? "HIGH SPEED" : "LOW/OFF"}</strong></div>
                  <div>Reversing Valve: <strong className="text-white">{selectedResultDetail.hvac2.reversingValveOn ? "HEATING" : "COOLING"}</strong></div>
                </div>
              </div>

              {/* Climate readings */}
              <div className="p-3 border border-prizm-border rounded space-y-1.5 bg-prizm-bg">
                <span className="text-[#38BDF8] font-bold block uppercase border-b border-prizm-border/20 pb-1">Climate sensor package readings</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>Space Climate Temp: <strong className="text-white">{selectedResultDetail.metrics.spaceTempC}°C</strong></div>
                  <div>Discharge Climate Temp: <strong className="text-white">{selectedResultDetail.metrics.supplyAirTempC}°C</strong></div>
                  <div>Cell Thermal Average: <strong className="text-white">{selectedResultDetail.metrics.avgCellTempC}°C</strong></div>
                  <div>Discharging humidity: <strong className="text-white">{selectedResultDetail.metrics.spaceHumidityPct}% RH</strong></div>
                </div>
              </div>

              {/* Warning flags */}
              <div className="p-3 border border-prizm-border rounded bg-prizm-bg">
                <span className="text-yellow-500 font-bold block uppercase border-b border-prizm-border/20 pb-1">Triggered alert warning flags</span>
                {selectedResultDetail.flags.length === 0 ? (
                  <span className="text-green-400 text-[10px] block mt-1">✓ No warning flags active on this controller.</span>
                ) : (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {selectedResultDetail.flags.map(f => (
                      <span key={f} className="bg-red-500/20 text-prizm-danger border border-prizm-danger/40 rounded px-1.5 py-0.5 text-[9px] font-bold">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>

            </div>

            <div className="border-t border-prizm-border/60 pt-3 text-right">
              <button 
                onClick={() => setSelectedResultDetail(null)}
                className="px-4 py-2 bg-prizm-bg hover:bg-prizm-border/30 border border-prizm-border rounded text-[11px] font-black uppercase text-white"
              >
                Close detail view
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CONFIRMATION OVERLAY MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-mono">
          <div className="bg-prizm-surface border border-prizm-border rounded-lg shadow-2xl p-5 max-w-md w-full space-y-4">
            
            <div className="flex items-center gap-2 border-b border-prizm-border/50 pb-3 text-yellow-400">
              <AlertTriangle size={18} className="animate-pulse" />
              <h3 className="text-white text-sm font-bold uppercase">Confirm Simulated Override Apply</h3>
            </div>

            <p className="text-[11.5px] leading-relaxed text-prizm-text">
              You are applying a simulated load override to the selected <strong className="text-yellow-400">{selectedIps.length} units</strong>. This overrides real hardware registers inside physical controllers.
            </p>

            <div className="bg-prizm-bg/80 p-3 rounded border border-prizm-border/40 text-[10px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">Selected Mode:</span>
                <span className="text-prizm-primary font-bold uppercase">{selectedMode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">Duration:</span>
                <span className="text-white font-bold">{timeoutMinutes} Minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">Normalize first:</span>
                <span className="text-white font-bold">{normalizeBeforeApply ? "Active" : "Bypass"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">Min expected load:</span>
                <span className="text-white font-bold">{compressorCurrentMinA}A on compressors</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 text-[10px]">
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-1.5 border border-prizm-border rounded uppercase font-bold text-prizm-text hover:bg-white/5"
              >
                Cancel
              </button>
              
              <button 
                onClick={executeApplyOverride}
                className="px-4 py-1.5 bg-green-500 hover:bg-green-600 text-black font-black uppercase rounded tracking-wider"
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
