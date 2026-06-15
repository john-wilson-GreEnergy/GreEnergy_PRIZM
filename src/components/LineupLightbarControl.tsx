import React, { useState, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Play,
  RotateCcw,
  Sliders,
  Settings,
  ShieldCheck,
  Zap,
  Info,
  Download,
  Trash2,
  Lock,
  Pause,
  AlertOctagon,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight,
  UserCheck
} from "lucide-react";

interface RGBW {
  red: number;
  green: number;
  blue: number;
  white: number;
}

interface RGB {
  red: number;
  green: number;
  blue: number;
}

interface PreviewItem {
  array: number;
  string: number;
  red: number;
  green: number;
  blue: number;
  white: number;
  duration: number;
  group: string;
}

interface ResultItem {
  array: number;
  string: number;
  red: number;
  green: number;
  blue: number;
  white: number;
  duration: number;
  ok: boolean;
  url: string;
  error: string | null;
}

interface AuditRecord {
  id: string;
  timestamp: string;
  mode: string;
  source: string;
  dryRun: boolean;
  commandCount: number;
  successCount: number;
  failedCount: number;
  duration: number;
  arrays: string;
  strings: string;
  operator?: string;
  warnings?: string[];
}

interface ActiveFaultState {
  arrayIndex: number;
  stringIndex: number;
  severity: "none" | "warning" | "alarm";
  desiredAction: string;
  color: RGBW;
  effectiveWarnings: string[];
  effectiveAlarms: string[];
  ignoredWarnings: string[];
  ignoredAlarms: string[];
}

interface ManagedState {
  key: string;
  arrayIndex: number;
  stringIndex: number;
  severity: "none" | "warning" | "alarm";
  color: RGBW;
  lastAppliedAt: string;
  activeFaultSignature: string;
}

const PRESET_COLORS = [
  { name: "Red", r: 255, g: 0, b: 0, hex: "#EF4444" },
  { name: "Green", r: 0, g: 255, b: 0, hex: "#10B981" },
  { name: "Blue", r: 0, g: 0, b: 255, hex: "#3B82F6" }, // Royal blue glow
  { name: "Cyan", r: 0, g: 255, b: 255, hex: "#06B6D4" },
  { name: "Magenta", r: 255, g: 0, b: 255, hex: "#D946EF" },
  { name: "Yellow", r: 255, g: 255, b: 0, hex: "#FBBF24" },
  { name: "Orange", r: 255, g: 128, b: 0, hex: "#F97316" },
  { name: "Purple", r: 128, g: 0, b: 255, hex: "#8B5CF6" },
  { name: "Pink", r: 255, g: 192, b: 203, hex: "#F472B6" },
  { name: "Warm White", r: 255, g: 244, b: 224, hex: "#FEF3C7" }
];

const formatSecondsToHumanReadable = (totalSeconds: number) => {
  if (totalSeconds < 60) {
    return `${totalSeconds} seconds`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours} hr${hours > 1 ? "s" : ""}`);
  if (minutes > 0) parts.push(`${minutes} min${minutes > 1 ? "s" : ""}`);
  if (seconds > 0) parts.push(`${seconds} sec${seconds > 1 ? "s" : ""}`);

  return `${parts.join(" ")} (${totalSeconds.toLocaleString()} seconds)`;
};

export default function LineupLightbarControl() {
  // 1. Connection settings context
  const [activeProfile, setActiveProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // 2. Target selection states
  const [arraysInput, setArraysInput] = useState("1-8");
  const [stringsInput, setStringsInput] = useState("1-40");
  const [concurrency, setConcurrency] = useState(8);
  const [concurrencyType, setConcurrencyType] = useState<"fixed" | "custom">("fixed");
  const [customConcurrency, setCustomConcurrency] = useState("8");

  // Multi-block topology if present
  const [selectedBlockIdx, setSelectedBlockIdx] = useState(1);

  // 3. Pattern mode state
  const [mode, setMode] = useState<"single" | "alt4" | "mirror" | "usa" | "clear" | "fault-visualizer">("single");

  // 4. Color configurations
  const [singleColor, setSingleColor] = useState<RGB>({ red: 255, green: 0, blue: 0 });
  const [whiteChannel, setWhiteChannel] = useState(0);

  // ALT4 Group Colors
  const [altColors, setAltColors] = useState<{ o1: RGB; o2: RGB; e1: RGB; e2: RGB }>({
    o1: { red: 255, green: 0, blue: 0 },
    o2: { red: 255, green: 255, blue: 255 },
    e1: { red: 0, green: 0, blue: 255 },
    e2: { red: 255, green: 255, blue: 0 }
  });

  // MIRROR Colors
  const [mirrorColors, setMirrorColors] = useState<{ a: RGB; b: RGB }>({
    a: { red: 255, green: 0, blue: 0 },
    b: { red: 0, green: 0, blue: 255 }
  });

  // 5. Duration controls
  const [durationPreset, setDurationPreset] = useState<string>("30");
  const [customDurationVal, setCustomDurationVal] = useState<number>(60);
  const [customDurationUnit, setCustomDurationUnit] = useState<"s" | "m" | "h">("s");

  // 6. Action state & results
  const [previewResponse, setPreviewResponse] = useState<any>(null);
  const [resultsResponse, setResultsResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Audit trail
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Modal confirm workflow
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // ==========================================================================
  // 7. Fault Visualizer Live Engine state & data
  // ==========================================================================
  const [fvStatus, setFvStatus] = useState<any>(null);
  const [fvLoading, setFvLoading] = useState(false);
  const [fvPreviewMode, setFvPreviewMode] = useState(true);
  const [fvClearOnResolved, setFvClearOnResolved] = useState(true);
  const [fvRefreshOnChange, setFvRefreshOnChange] = useState(true);
  const [fvPollInterval, setFvPollInterval] = useState(30);
  const [fvDuration, setFvDuration] = useState(50400); // 14h
  const [fvWarningColor, setFvWarningColor] = useState<RGBW>({ red: 255, green: 255, blue: 0, white: 0 });
  const [fvAlarmColor, setFvAlarmColor] = useState<RGBW>({ red: 255, green: 0, blue: 0, white: 0 });
  const [fvClearColor, setFvClearColor] = useState<RGBW>({ red: 0, green: 0, blue: 0, white: 255 });
  const [fvIgnoredPatterns, setFvIgnoredPatterns] = useState<string[]>([]);
  const [newPatternInput, setNewPatternInput] = useState("");

  const [fvPreviewData, setFvPreviewData] = useState<any>(null);
  const [fvAuditLogs, setFvAuditLogs] = useState<AuditRecord[]>([]);

  // Fetch meta on mounting
  useEffect(() => {
    fetchActiveProfile();
    fetchAuditLogs();
    fetchFaultVisualizerStatus();
    fetchFaultVisualizerAudit();
  }, []);

  // Sync preview whenever manual criteria moves
  useEffect(() => {
    if (mode !== "fault-visualizer") {
      triggerManualPreview();
    }
  }, [mode, arraysInput, stringsInput, singleColor, whiteChannel, altColors, mirrorColors, durationPreset, customDurationVal, customDurationUnit]);

  // Handle USA mode defaulting to 14 Hours (50400s)
  useEffect(() => {
    if (mode === "usa") {
      setDurationPreset("50400");
    }
  }, [mode]);

  // Fetch active network profiles
  const fetchActiveProfile = async () => {
    try {
      setProfileLoading(true);
      const r = await fetch("/api/local/lightbar/status");
      if (r.ok) {
        const body = await r.json();
        if (body.activeProfile) {
          setActiveProfile(body.activeProfile);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      setLogsLoading(true);
      const r = await fetch("/api/local/lightbar/audit");
      if (r.ok) {
        const data = await r.json();
        setAuditLogs(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchFaultVisualizerStatus = async () => {
    try {
      setFvLoading(true);
      const r = await fetch("/api/local/lightbar/fault-visualizer/status");
      if (r.ok) {
        const data = await r.json();
        setFvStatus(data);
        if (data.ignoredPatterns) {
          setFvIgnoredPatterns(data.ignoredPatterns);
        }
        if (data.warningColor) setFvWarningColor(data.warningColor);
        if (data.alarmColor) setFvAlarmColor(data.alarmColor);
        if (data.clearColor) setFvClearColor(data.clearColor);
        setFvPollInterval(data.pollIntervalSeconds || 30);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFvLoading(false);
    }
  };

  const fetchFaultVisualizerAudit = async () => {
    try {
      const r = await fetch("/api/local/lightbar/fault-visualizer/audit");
      if (r.ok) {
        const data = await r.json();
        setFvAuditLogs(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Convert duration helper
  const getDurationSec = () => {
    if (durationPreset === "custom") {
      let multiplier = 1;
      if (customDurationUnit === "m") multiplier = 60;
      if (customDurationUnit === "h") multiplier = 3600;
      return (customDurationVal * multiplier) || 60;
    }
    return parseInt(durationPreset, 10) || (mode === "usa" ? 50400 : 30);
  };

  const getConcurrencyVal = () => {
    if (concurrencyType === "custom") {
      return parseInt(customConcurrency, 10) || 8;
    }
    return concurrency;
  };

  // Trigger preview for manual patterns
  const triggerManualPreview = async () => {
    try {
      setErrorMsg("");
      const duration = getDurationSec();
      const payload: any = {
        mode,
        arrays: arraysInput,
        strings: stringsInput,
        durationSeconds: duration,
        blockIndex: selectedBlockIdx
      };

      if (mode === "single") {
        payload.color = { ...singleColor, white: whiteChannel };
      } else if (mode === "alt4") {
        payload.colors = altColors;
        payload.white = whiteChannel;
      } else if (mode === "mirror") {
        payload.colors = mirrorColors;
        payload.white = whiteChannel;
      } else if (mode === "usa") {
        payload.white = whiteChannel;
      }

      const r = await fetch("/api/local/lightbar/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await r.json();
      if (!r.ok) {
        setErrorMsg(data.error || "Preview generation failed");
        setPreviewResponse(null);
      } else {
        setPreviewResponse(data);
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to reach backend preview endpoint");
    }
  };

  // Trigger Deployment of manual patterns
  const executeDeployment = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      setShowConfirmModal(false);

      const duration = getDurationSec();
      const activeConcurrency = getConcurrencyVal();

      const payload: any = {
        mode,
        arrays: arraysInput,
        strings: stringsInput,
        durationSeconds: duration,
        confirmed: true,
        concurrency: activeConcurrency,
        operator: "Admin Terminal",
        blockIndex: selectedBlockIdx
      };

      if (mode === "single") {
        payload.color = { ...singleColor, white: whiteChannel };
      } else if (mode === "alt4") {
        payload.colors = altColors;
        payload.white = whiteChannel;
      } else if (mode === "mirror") {
        payload.colors = mirrorColors;
        payload.white = whiteChannel;
      } else if (mode === "usa") {
        payload.white = whiteChannel;
      }

      const r = await fetch("/api/local/lightbar/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await r.json();
      if (!r.ok) {
        setErrorMsg(data.error || "Deployment failed");
      } else {
        setResultsResponse(data);
        fetchAuditLogs();
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to initiate visual deployment series");
    } finally {
      setLoading(false);
    }
  };

  // Shortcut Clear 1-8 1-40
  const triggerShortcutClear = async () => {
    if (!window.confirm("You are about to rapidly command arrays 1-8 strings 1-40 to white clear (RGBW 0,0,0,255) for 1 second. Proceed?")) {
      return;
    }
    try {
      setLoading(true);
      setErrorMsg("");
      const r = await fetch("/api/local/lightbar/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true, concurrency: getConcurrencyVal() })
      });

      const data = await r.json();
      if (!r.ok) {
        setErrorMsg(data.error || "Clear shortcut failed");
      } else {
        setResultsResponse(data);
        fetchAuditLogs();
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to dispatch clear shortcut");
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // FAULT VISUALIZER COMMAND IMPLEMENTATIONS
  // ==========================================================================
  const triggerFvPreview = async () => {
    try {
      setErrorMsg("");
      setFvLoading(true);
      const r = await fetch("/api/local/lightbar/fault-visualizer/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun: fvPreviewMode,
          clearOnResolved: fvClearOnResolved,
          refreshOnChange: fvRefreshOnChange,
          warningColor: fvWarningColor,
          alarmColor: fvAlarmColor,
          clearColor: fvClearColor,
          ignoredPatterns: fvIgnoredPatterns
        })
      });
      const data = await r.json();
      if (r.ok) {
        setFvPreviewData(data);
      } else {
        setErrorMsg(data.error || "Failed to build fault preview");
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Network error fetching fault preview");
    } finally {
      setFvLoading(false);
    }
  };

  const triggerFvApplyOnce = async () => {
    if (!window.confirm("Perform a one-time deployment of yellow/red/clear indicators based on active filtered faults? This sends live commands to the strings.")) {
      return;
    }
    try {
      setErrorMsg("");
      setLoading(true);
      const r = await fetch("/api/local/lightbar/fault-visualizer/apply-once", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          dryRun: false,
          clearOnResolved: fvClearOnResolved,
          refreshOnChange: fvRefreshOnChange,
          durationSeconds: fvDuration,
          concurrency: getConcurrencyVal(),
          warningColor: fvWarningColor,
          alarmColor: fvAlarmColor,
          clearColor: fvClearColor,
          ignoredPatterns: fvIgnoredPatterns,
          operator: "Unscheduled Cycle Deployment"
        })
      });
      const data = await r.json();
      if (r.ok) {
        alert(`Finished: Commanded ${data.commandsSentCount || 0} strings. ${data.successCount || 0} Succeeded, ${data.failedCount || 0} Failed.`);
        fetchFaultVisualizerStatus();
        fetchFaultVisualizerAudit();
      } else {
        setErrorMsg(data.error || "Cycle deployment failure");
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const triggerFvStartLive = async (actualExecution = false) => {
    const runString = actualExecution ? "LIVE ACTUAL CONTROL (Sending signals to Turtle)" : "DRY RUN Simulation (Computing results, no commands dispatched)";
    if (!window.confirm(`Initiate continuous fault-visualizer background loop under ${runString}? Polling period will be ${fvPollInterval} seconds.`)) {
      return;
    }

    try {
      setErrorMsg("");
      setFvLoading(true);
      const r = await fetch("/api/local/lightbar/fault-visualizer/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          dryRun: !actualExecution,
          clearOnResolved: fvClearOnResolved,
          refreshOnChange: fvRefreshOnChange,
          pollIntervalSeconds: fvPollInterval,
          durationSeconds: fvDuration,
          concurrency: getConcurrencyVal(),
          warningColor: fvWarningColor,
          alarmColor: fvAlarmColor,
          clearColor: fvClearColor,
          ignoredPatterns: fvIgnoredPatterns,
          operator: "Operator Console Start"
        })
      });
      const data = await r.json();
      if (r.ok) {
        fetchFaultVisualizerStatus();
        fetchFaultVisualizerAudit();
      } else {
        setErrorMsg(data.error || "Could not launch continuous loop");
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setFvLoading(false);
    }
  };

  const triggerFvStopLive = async (shouldClear = false) => {
    try {
      setErrorMsg("");
      setFvLoading(true);
      const r = await fetch("/api/local/lightbar/fault-visualizer/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clearManagedLightbars: shouldClear,
          concurrency: getConcurrencyVal()
        })
      });
      const data = await r.json();
      if (r.ok) {
        alert("Continuous Fault Visualizer engine suspended successfully.");
        fetchFaultVisualizerStatus();
        fetchFaultVisualizerAudit();
      } else {
        setErrorMsg(data.error || "Suspension routine reported issues");
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setFvLoading(false);
    }
  };

  const triggerFvClearResolved = async () => {
    try {
      setErrorMsg("");
      setFvLoading(true);
      const r = await fetch("/api/local/lightbar/fault-visualizer/clear-resolved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency: getConcurrencyVal() })
      });
      const data = await r.json();
      if (r.ok) {
        alert(`Cleared ${data.clearedCount || 0} resolved field indicators.`);
        fetchFaultVisualizerStatus();
      } else {
        setErrorMsg(data.error);
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setFvLoading(false);
    }
  };

  const triggerFvClearAll = async () => {
    if (!window.confirm("This dispatches clear signals to ALL strings currently in the managed table. Continue?")) {
      return;
    }
    try {
      setErrorMsg("");
      setFvLoading(true);
      const r = await fetch("/api/local/lightbar/fault-visualizer/clear-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency: getConcurrencyVal() })
      });
      const data = await r.json();
      if (r.ok) {
        alert(`Reset dispatched. Successfully cleared: ${data.clearedCount || 0}.`);
        fetchFaultVisualizerStatus();
      } else {
        setErrorMsg(data.error);
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setFvLoading(false);
    }
  };

  const addIgnoredPattern = () => {
    if (!newPatternInput.trim()) return;
    const trimmed = newPatternInput.trim();
    if (!fvIgnoredPatterns.includes(trimmed)) {
      setFvIgnoredPatterns([...fvIgnoredPatterns, trimmed]);
      setNewPatternInput("");
    }
  };

  const removeIgnoredPattern = (p: string) => {
    setFvIgnoredPatterns(fvIgnoredPatterns.filter(item => item !== p));
  };

  // Export functions
  const downloadJSON = (obj: any, filename: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = (headers: string[], rows: any[][], filename: string) => {
    const content = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Profile Banner */}
      <div className="p-4 bg-prizm-surface border border-prizm-border rounded-lg shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="text-prizm-primary h-5 w-5" />
            <h1 className="text-prizm-text text-lg font-bold font-mono uppercase tracking-wider">
              Lineup Lightbar Control
            </h1>
          </div>
          <p className="text-[11px] text-prizm-text-muted mt-1 leading-normal">
            Deploy visual RGBW lightbar commands to selected arrays and strings through Turtle controller APIs.
          </p>
        </div>

        <div className="flex gap-4 items-center self-start md:self-auto font-mono text-[10px]">
          <div className="bg-black/10 border border-prizm-border p-2 rounded">
            <span className="text-prizm-text-muted block">ACTIVE SITE PROFILE:</span>
            <span className="text-prizm-primary font-bold block truncate max-w-[200px]">
              {activeProfile?.profileName || "Unknown Profile"}
            </span>
          </div>
          <div className="bg-black/10 border border-prizm-border p-2 rounded">
            <span className="text-prizm-text-muted block">TURTLE BASE ADDRESS:</span>
            <span className="text-prizm-info font-bold block truncate max-w-[250px]">
              {activeProfile?.emsBaseUrl || "Connecting..."}
            </span>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-prizm-danger/10 border border-prizm-danger text-prizm-danger text-xs font-mono rounded-lg flex items-start gap-2.5">
          <AlertOctagon size={16} className="shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">VALIDATION / SYSTEM ERROR:</span>
            <p className="mt-1 leading-relaxed">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* 2. Primary layout grids */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column Controls */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Target Selection Card */}
          <div className="p-4 bg-prizm-surface border border-prizm-border rounded-lg space-y-4">
            <div className="flex items-center justify-between border-b border-prizm-border pb-2">
              <span className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest flex items-center gap-1.5">
                <Settings size={13} className="text-prizm-primary" />
                Target Selection
              </span>
              <span className="text-[9px] font-mono text-prizm-text-muted bg-black/15 px-1.5 py-0.5 rounded">
                LAN INGRESS
              </span>
            </div>

            <div className="space-y-3">
              {activeProfile?.blocks && activeProfile.blocks.length > 1 && (
                <div>
                  <label className="text-[10px] font-bold font-mono text-prizm-text-muted block uppercase mb-1">
                    BESS Block Target:
                  </label>
                  <select
                    value={selectedBlockIdx}
                    onChange={e => setSelectedBlockIdx(Number(e.target.value))}
                    className="w-full bg-prizm-bg border border-prizm-border p-2 text-xs font-mono rounded text-prizm-text outline-none focus:border-prizm-primary cursor-pointer"
                  >
                    {activeProfile.blocks.map((b: any) => (
                      <option key={b.blockIndex} value={b.blockIndex}>
                        {b.blockName || `Block ${b.blockIndex}`} (Index {b.blockIndex})
                      </option>
                    ))}
                  </select>
                  <span className="text-[9px] text-prizm-text-muted mt-1 block">
                    Routing commands to Turtle endpoint at Block {selectedBlockIdx}
                  </span>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold font-mono text-prizm-text-muted block uppercase mb-1">
                  Arrays Selector:
                </label>
                <input
                  type="text"
                  value={arraysInput}
                  onChange={e => setArraysInput(e.target.value)}
                  placeholder="all or e.g., 1,3-5"
                  className="w-full bg-prizm-bg border border-prizm-border p-2 text-xs font-mono rounded text-prizm-text outline-none focus:border-prizm-primary"
                />
                <span className="text-[9px] text-prizm-text-muted mt-1 block">
                  Valid options: "all" or csv lists/ranges (limits up to active topology)
                </span>
              </div>

              <div>
                <label className="text-[10px] font-bold font-mono text-prizm-text-muted block uppercase mb-1">
                  Strings Selector:
                </label>
                <input
                  type="text"
                  value={stringsInput}
                  onChange={e => setStringsInput(e.target.value)}
                  placeholder="all or e.g., 1-10,12"
                  className="w-full bg-prizm-bg border border-prizm-border p-2 text-xs font-mono rounded text-prizm-text outline-none focus:border-prizm-primary"
                />
                <span className="text-[9px] text-prizm-text-muted mt-1 block">
                  Support range formats (e.g. 1-40)
                </span>
              </div>

              {/* Dynamic Concurrency */}
              <div>
                <label className="text-[10px] font-bold font-mono text-prizm-text-muted block uppercase mb-1">
                  Concurrency Control Limit:
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => { setConcurrencyType("fixed"); setConcurrency(8); }}
                    className={`p-1.5 rounded font-mono text-[10px] border transition ${
                      concurrencyType === "fixed"
                        ? "bg-prizm-primary/15 border-prizm-primary text-prizm-primary font-bold"
                        : "border-prizm-border text-prizm-text-muted hover:bg-black/5"
                    }`}
                  >
                    Standard Parallel (8)
                  </button>
                  <button
                    type="button"
                    onClick={() => setConcurrencyType("custom")}
                    className={`p-1.5 rounded font-mono text-[10px] border transition ${
                      concurrencyType === "custom"
                        ? "bg-prizm-primary/15 border-prizm-primary text-prizm-primary font-bold"
                        : "border-prizm-border text-prizm-text-muted hover:bg-black/5"
                    }`}
                  >
                    Custom Concurrency
                  </button>
                </div>

                {concurrencyType === "custom" && (
                  <input
                    type="number"
                    min="1"
                    max="64"
                    value={customConcurrency}
                    onChange={e => setCustomConcurrency(e.target.value)}
                    className="w-full bg-prizm-bg border border-prizm-border p-1.5 text-xs font-mono rounded text-prizm-text outline-none"
                    placeholder="Enter 1-64 threads"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Mode Selector Card */}
          <div className="p-4 bg-prizm-surface border border-prizm-border rounded-lg space-y-3">
            <div className="flex items-center justify-between border-b border-prizm-border pb-2">
              <span className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest flex items-center gap-1.5">
                <Activity size={13} className="text-prizm-primary" />
                Command Modes
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["single", "alt4", "mirror", "usa", "clear", "fault-visualizer"] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`p-2.5 rounded font-mono text-[11px] uppercase border font-bold transition flex flex-col items-center justify-center gap-1 min-h-[56px] text-center ${
                    mode === m
                      ? "bg-prizm-primary/15 border-prizm-primary text-prizm-primary"
                      : "border-prizm-border text-prizm-text hover:bg-black/5"
                  }`}
                >
                  <span className="tracking-wide block truncate">{m}</span>
                  <span className="text-[7.5px] font-normal text-prizm-text-muted capitalize">
                    {m === "single" && "Single Color"}
                    {m === "alt4" && "String Alternating"}
                    {m === "mirror" && "Reflected Split"}
                    {m === "usa" && "Red/White/Blue"}
                    {m === "clear" && "Rapid Flush"}
                    {m === "fault-visualizer" && "Dynamic Alarms"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Color Configuration Panel */}
          {mode !== "fault-visualizer" && (
            <div className="p-4 bg-prizm-surface border border-prizm-border rounded-lg space-y-4">
              <div className="flex items-center justify-between border-b border-prizm-border pb-2">
                <span className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest">
                  Color Configuration
                </span>
                <span className="text-[9px] font-mono text-prizm-text-muted">RGBW HEX</span>
              </div>

              {/* USA mode info */}
              {mode === "usa" && (
                <div className="bg-prizm-primary/5 border border-prizm-primary/30 p-2 text-[10px] font-mono text-prizm-text rounded leading-normal">
                  🏆 <span className="font-bold text-prizm-primary">USA STREAK PATTERN:</span> Dispatches Repeating Red, White, and Blue indices down odd and even segments automatically. Duration defaulted to 50400s (14 hours).
                </div>
              )}

              {/* Clear mode warning */}
              {mode === "clear" && (
                <div className="bg-prizm-warning/5 border border-prizm-warning/30 p-2 text-[10px] font-mono text-prizm-text rounded leading-normal">
                  ⚠️ <span className="font-bold text-prizm-warning">FLUSH TRIGGER:</span> Dispatches zero commands on RGB, white value 255 and 1s duration to reset lineup lightbars.
                </div>
              )}

              {/* Single Mode Presets */}
              {mode === "single" && (
                <div className="space-y-3">
                  <span className="text-[10px] uppercase font-bold font-mono text-prizm-text-muted block">
                    Choose Preset Color:
                  </span>
                  <div className="grid grid-cols-5 gap-1.5">
                    {PRESET_COLORS.map(preset => (
                      <button
                        key={preset.name}
                        onClick={() => setSingleColor({ red: preset.r, green: preset.g, blue: preset.b })}
                        className="h-7 rounded border border-prizm-border duration-200 transition-all cursor-pointer hover:scale-105 active:scale-95 flex items-center justify-center relative"
                        style={{ backgroundColor: preset.hex }}
                        title={`${preset.name} (R:${preset.r} G:${preset.g} B:${preset.b})`}
                      >
                        {singleColor.red === preset.r && singleColor.green === preset.g && singleColor.blue === preset.b && (
                          <div className="h-2 w-2 rounded-full bg-black border border-white" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Manual Sliders */}
                  <div className="space-y-2 mt-2 pt-2 border-t border-prizm-border/50">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-prizm-danger font-bold">R - RED</span>
                      <span>{singleColor.red}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={singleColor.red}
                      onChange={e => setSingleColor({ ...singleColor, red: parseInt(e.target.value) })}
                      className="w-full h-1 bg-prizm-bg rounded cursor-pointer accent-prizm-danger"
                    />

                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-prizm-primary font-bold">G - GREEN</span>
                      <span>{singleColor.green}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={singleColor.green}
                      onChange={e => setSingleColor({ ...singleColor, green: parseInt(e.target.value) })}
                      className="w-full h-1 bg-prizm-bg rounded cursor-pointer accent-prizm-primary"
                    />

                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-prizm-info font-bold">B - BLUE</span>
                      <span>{singleColor.blue}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={singleColor.blue}
                      onChange={e => setSingleColor({ ...singleColor, blue: parseInt(e.target.value) })}
                      className="w-full h-1 bg-prizm-bg rounded cursor-pointer accent-prizm-info"
                    />
                  </div>
                </div>
              )}

              {/* ALT4 specific controls */}
              {mode === "alt4" && (
                <div className="space-y-3 text-xs font-mono">
                  <div className="border border-prizm-border rounded p-2.5 space-y-2">
                    <span className="font-bold text-prizm-text text-[10px]">GROUP O1 (string % 4 == 1) Red</span>
                    <input
                      type="color"
                      value={`#${altColors.o1.red.toString(16).padStart(2, '0')}${altColors.o1.green.toString(16).padStart(2, '0')}${altColors.o1.blue.toString(16).padStart(2, '0')}`}
                      onChange={e => {
                        const hex = e.target.value;
                        setAltColors({
                          ...altColors,
                          o1: {
                            red: parseInt(hex.substring(1, 3), 16),
                            green: parseInt(hex.substring(3, 5), 16),
                            blue: parseInt(hex.substring(5, 7), 16)
                          }
                        });
                      }}
                      className="w-full h-8 cursor-pointer rounded"
                    />
                  </div>

                  <div className="border border-prizm-border rounded p-2.5 space-y-2">
                    <span className="font-bold text-prizm-text text-[10px]">GROUP O2 (string % 4 == 3) White</span>
                    <input
                      type="color"
                      value={`#${altColors.o2.red.toString(16).padStart(2, '0')}${altColors.o2.green.toString(16).padStart(2, '0')}${altColors.o2.blue.toString(16).padStart(2, '0')}`}
                      onChange={e => {
                        const hex = e.target.value;
                        setAltColors({
                          ...altColors,
                          o2: {
                            red: parseInt(hex.substring(1, 3), 16),
                            green: parseInt(hex.substring(3, 5), 16),
                            blue: parseInt(hex.substring(5, 7), 16)
                          }
                        });
                      }}
                      className="w-full h-8 cursor-pointer rounded"
                    />
                  </div>

                  <div className="border border-prizm-border rounded p-2.5 space-y-2">
                    <span className="font-bold text-prizm-text text-[10px]">GROUP E1 (string % 4 == 2) Blue</span>
                    <input
                      type="color"
                      value={`#${altColors.e1.red.toString(16).padStart(2, '0')}${altColors.e1.green.toString(16).padStart(2, '0')}${altColors.e1.blue.toString(16).padStart(2, '0')}`}
                      onChange={e => {
                        const hex = e.target.value;
                        setAltColors({
                          ...altColors,
                          e1: {
                            red: parseInt(hex.substring(1, 3), 16),
                            green: parseInt(hex.substring(3, 5), 16),
                            blue: parseInt(hex.substring(5, 7), 16)
                          }
                        });
                      }}
                      className="w-full h-8 cursor-pointer rounded"
                    />
                  </div>

                  <div className="border border-prizm-border rounded p-2.5 space-y-2">
                    <span className="font-bold text-prizm-text text-[10px]">GROUP E2 (string % 4 == 0) Yellow</span>
                    <input
                      type="color"
                      value={`#${altColors.e2.red.toString(16).padStart(2, '0')}${altColors.e2.green.toString(16).padStart(2, '0')}${altColors.e2.blue.toString(16).padStart(2, '0')}`}
                      onChange={e => {
                        const hex = e.target.value;
                        setAltColors({
                          ...altColors,
                          e2: {
                            red: parseInt(hex.substring(1, 3), 16),
                            green: parseInt(hex.substring(3, 5), 16),
                            blue: parseInt(hex.substring(5, 7), 16)
                          }
                        });
                      }}
                      className="w-full h-8 cursor-pointer rounded"
                    />
                  </div>
                </div>
              )}

              {/* Mirror specific colors */}
              {mode === "mirror" && (
                <div className="space-y-3 text-xs font-mono">
                  <div className="border border-prizm-border rounded p-2.5 space-y-2">
                    <span className="font-bold text-prizm-text text-[10px]">COLOR A (string % 4 is 1 or 2):</span>
                    <input
                      type="color"
                      value={`#${mirrorColors.a.red.toString(16).padStart(2, '0')}${mirrorColors.a.green.toString(16).padStart(2, '0')}${mirrorColors.a.blue.toString(16).padStart(2, '0')}`}
                      onChange={e => {
                        const hex = e.target.value;
                        setMirrorColors({
                          ...mirrorColors,
                          a: {
                            red: parseInt(hex.substring(1, 3), 16),
                            green: parseInt(hex.substring(3, 5), 16),
                            blue: parseInt(hex.substring(5, 7), 16)
                          }
                        });
                      }}
                      className="w-full h-8 cursor-pointer rounded"
                    />
                  </div>

                  <div className="border border-prizm-border rounded p-2.5 space-y-2">
                    <span className="font-bold text-prizm-text text-[10px]">COLOR B (string % 4 is 3 or 0):</span>
                    <input
                      type="color"
                      value={`#${mirrorColors.b.red.toString(16).padStart(2, '0')}${mirrorColors.b.green.toString(16).padStart(2, '0')}${mirrorColors.b.blue.toString(16).padStart(2, '0')}`}
                      onChange={e => {
                        const hex = e.target.value;
                        setMirrorColors({
                          ...mirrorColors,
                          b: {
                            red: parseInt(hex.substring(1, 3), 16),
                            green: parseInt(hex.substring(3, 5), 16),
                            blue: parseInt(hex.substring(5, 7), 16)
                          }
                        });
                      }}
                      className="w-full h-8 cursor-pointer rounded"
                    />
                  </div>
                </div>
              )}

              {/* White Channel Slider (Shared across non-clear/USA modes) */}
              {mode !== "clear" && (
                <div className="space-y-2 pt-2 border-t border-prizm-border/40">
                  <div className="grid grid-cols-4 gap-1">
                    <button
                      onClick={() => setWhiteChannel(0)}
                      className={`p-1 rounded font-mono text-[9px] border transition ${
                        whiteChannel === 0 ? "bg-prizm-text/15 border-prizm-text text-prizm-text font-bold" : "border-prizm-border text-prizm-text-muted"
                      }`}
                    >
                      W=0 Recommended
                    </button>
                    <button
                      onClick={() => setWhiteChannel(128)}
                      className={`p-1 rounded font-mono text-[9px] border transition ${
                        whiteChannel === 128 ? "bg-prizm-text/15 border-prizm-text text-prizm-text font-bold" : "border-prizm-border text-prizm-text-muted"
                      }`}
                    >
                      W=128 Half
                    </button>
                    <button
                      onClick={() => setWhiteChannel(255)}
                      className={`p-1 rounded font-mono text-[9px] border transition ${
                        whiteChannel === 255 ? "bg-prizm-text/15 border-prizm-text text-prizm-text font-bold" : "border-prizm-border text-prizm-text-muted"
                      }`}
                    >
                      W=255 Max
                    </button>
                    <button
                      disabled
                      className="p-1 rounded font-mono text-[9px] border border-prizm-border/40 text-prizm-text-muted/40 cursor-not-allowed"
                    >
                      Val: {whiteChannel}
                    </button>
                  </div>
                  
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={whiteChannel}
                    onChange={e => setWhiteChannel(parseInt(e.target.value))}
                    className="w-full h-1 bg-prizm-bg rounded cursor-pointer accent-prizm-text mt-1"
                  />
                  <span className="text-[9px] text-prizm-text-muted block mt-1">
                    High White channel overlays bright illumination onto RGB. Avoid maximum long-term power draw.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Time / Duration configuration */}
          {mode !== "clear" && mode !== "fault-visualizer" && (
            <div className="p-4 bg-prizm-surface border border-prizm-border rounded-lg space-y-4">
              <div className="flex items-center justify-between border-b border-prizm-border pb-1">
                <span className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest">
                  Duration Configuration
                </span>
                <span className="text-[9px] font-mono text-prizm-text-muted text-prizm-primary font-bold">SELECT OR OVERRIDE</span>
              </div>

              <div className="space-y-3">
                {/* Visual quick preset picker */}
                <div>
                  <span className="text-[9px] font-mono font-bold text-prizm-text-muted block uppercase mb-1.5">
                    Select Preset:
                  </span>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { label: "15s", val: "15", desc: "Short test" },
                      { label: "30s", val: "30", desc: "Standard test" },
                      { label: "1m", val: "60", desc: "Medium run" },
                      { label: "5m", val: "300", desc: "Longer run" },
                      { label: "15m", val: "900", desc: "Extended hold" },
                      { label: "1h", val: "3600", desc: "Thermal soak" },
                      { label: "8h", val: "28800", desc: "Shift window" },
                      { label: "14h (USA)", val: "50400", desc: "USA Standard" }
                    ].map(preset => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => setDurationPreset(preset.val)}
                        title={preset.desc}
                        className={`p-1.5 rounded font-mono text-[10px] border transition flex flex-col items-center justify-center ${
                          durationPreset === preset.val
                            ? "bg-prizm-primary/10 border-prizm-primary text-prizm-primary font-bold shadow-sm"
                            : "border-prizm-border text-prizm-text-muted hover:bg-black/5"
                        }`}
                      >
                        <span>{preset.label}</span>
                        <span className="text-[7.5px] font-normal opacity-70 truncate max-w-full">
                          {preset.val === "50400" ? "USA Std" : (parseInt(preset.val) < 60 ? `${preset.val}s` : (parseInt(preset.val) < 3600 ? `${parseInt(preset.val)/60}m` : `${parseInt(preset.val)/3600}h`))}
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setDurationPreset("custom")}
                      className={`p-1.5 col-span-4 rounded font-mono text-[10px] border transition flex items-center justify-center gap-1.5 ${
                        durationPreset === "custom"
                          ? "bg-prizm-primary/10 border-prizm-primary text-prizm-primary font-bold shadow-sm"
                          : "border-prizm-border text-prizm-text-muted hover:bg-black/5"
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-prizm-primary animate-pulse" />
                      Configure Custom Time Duration...
                    </button>
                  </div>
                </div>

                {/* Custom input panel with unit selectors */}
                {durationPreset === "custom" && (
                  <div className="bg-prizm-bg p-3 border border-prizm-border rounded-md space-y-2 animate-fade-in duration-200">
                    <span className="text-[9px] font-mono font-bold text-prizm-text-muted block uppercase">
                      Custom Duration Value
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="1"
                        max={customDurationUnit === "s" ? 86400 : (customDurationUnit === "m" ? 1440 : 24)}
                        value={customDurationVal}
                        onChange={e => setCustomDurationVal(parseFloat(e.target.value) || 0)}
                        className="flex-1 bg-prizm-surface border border-prizm-border p-2 text-xs font-mono rounded text-prizm-text outline-none focus:border-prizm-primary"
                        placeholder="Duration"
                      />
                      <select
                        value={customDurationUnit}
                        onChange={e => setCustomDurationUnit(e.target.value as "s" | "m" | "h")}
                        className="bg-prizm-surface text-xs font-mono border border-prizm-border rounded p-1 text-prizm-text outline-none focus:border-prizm-primary cursor-pointer"
                      >
                        <option value="s">Seconds</option>
                        <option value="m">Minutes</option>
                        <option value="h">Hours</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Visual helper breakdown text */}
                <div className="bg-prizm-bg/50 border border-prizm-border p-2.5 rounded text-[10.5px] font-mono text-prizm-text leading-relaxed">
                  <div className="flex items-center justify-between text-[9px] text-prizm-text-muted uppercase mb-1">
                    <span>Effective Duration:</span>
                    <span className="font-bold text-prizm-warning">ACTIVE</span>
                  </div>
                  <div className="text-prizm-text font-bold">
                    ⏱️ {formatSecondsToHumanReadable(getDurationSec())}
                  </div>
                  {mode === "usa" && durationPreset === "50400" && (
                    <div className="text-[9.5px] text-prizm-info mt-1.5 leading-normal">
                      💡 Standard USA streak timer active down all strings. You can override it above by choosing a different preset or typing a custom duration.
                    </div>
                  )}
                  {getDurationSec() > 3600 && (
                    <div className="text-[9.5px] text-prizm-warning mt-1.5 leading-normal">
                      ⚠️ Highly extended duration detected (&gt; 1h). Maintain thermal observation on physical array enclosures.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action deploy button */}
          {mode !== "fault-visualizer" && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  if (previewResponse?.commandCount > 0) {
                    setShowConfirmModal(true);
                  }
                }}
                disabled={loading || !previewResponse || previewResponse.commandCount === 0}
                className="w-full p-3 bg-prizm-primary hover:bg-prizm-primary/90 text-white font-bold font-mono text-xs uppercase rounded cursor-pointer transition-all flex items-center justify-center gap-2 shadow duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Lock size={13} />
                Deploy Lineup Configuration ({previewResponse?.commandCount || 0} jobs)
              </button>

              <button
                type="button"
                onClick={triggerShortcutClear}
                disabled={loading}
                className="w-full p-2.5 bg-prizm-surface hover:bg-prizm-surface-strong border border-prizm-border text-prizm-text font-bold font-mono text-xs uppercase rounded cursor-pointer transition flex items-center justify-center gap-1.5"
              >
                <Trash2 size={13} className="text-prizm-danger" />
                Flush Clear Row 1-8 (Shortcut)
              </button>
            </div>
          )}

        </div>

        {/* Right Column Layout Views */}
        <div className="lg:col-span-8 space-y-6">

          {/* WARNING LABEL REQUIREMENT */}
          <div className="p-3 bg-prizm-warning/10 border border-prizm-warning/50 text-[11px] font-mono rounded-lg flex items-start gap-2 max-w-full">
            <AlertTriangle className="text-prizm-warning shrink-0" size={15} />
            <div>
              <span className="font-bold text-prizm-warning block uppercase">LiveVisual Field Ingress Warning</span>
              <p className="mt-0.5 text-prizm-text leading-normal">
                This sends live string lightbar commands through Turtle. Confirm the target arrays and strings before deployment.
              </p>
            </div>
          </div>

          {/* ==========================================================================
              IF MODE IS FAULT VISUALIZER: RENDER FAULT CONTROLS PANEL
             ========================================================================== */}
          {mode === "fault-visualizer" ? (
            <div className="space-y-6 animate-fade-in duration-200">
              
              {/* FAULT CONTROLS */}
              <div className="p-4 bg-prizm-surface border border-prizm-border rounded-lg space-y-4">
                <div className="flex items-center justify-between border-b border-prizm-border pb-2.5">
                  <span className="text-xs font-bold font-mono text-prizm-primary uppercase tracking-widest flex items-center gap-1.5">
                    <Activity size={14} />
                    Dynamic Fault Illuminator Settings
                  </span>
                  <span className={`text-[9.5px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                    fvStatus?.liveModeActive ? "bg-prizm-primary/20 text-prizm-primary animate-pulse" : "bg-black/15 text-prizm-text-muted"
                  }`}>
                    {fvStatus?.liveModeActive ? "● daemon RUNNING" : "● daemon IDLE"}
                  </span>
                </div>

                <div className="p-3 bg-prizm-warning/10 border border-prizm-warning/40 text-[10px] font-mono text-prizm-text rounded leading-normal mb-2">
                  <AlertCircleWithSpace />
                  <span className="font-bold text-prizm-warning">Fault Visualizer warning:</span> Fault Visualizer sends live string lightbar commands based on PRIZM fault data. Confirm ignored fault rules before enabling live mode.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column Settings */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-black/10 p-2 border border-prizm-border rounded">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono font-bold text-prizm-text">PREVIEW ONLY MODE:</span>
                        <span className="text-[8px] text-prizm-text-muted">Perform calculations dry-run</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={fvPreviewMode}
                        onChange={e => setFvPreviewMode(e.target.checked)}
                        className="h-4 w-4 accent-prizm-primary cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between bg-black/10 p-2 border border-prizm-border rounded">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono font-bold text-prizm-text">CLEAR ON FAULT RESOLVED:</span>
                        <span className="text-[8px] text-prizm-text-muted">Send white clear on healthy state</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={fvClearOnResolved}
                        onChange={e => setFvClearOnResolved(e.target.checked)}
                        className="h-4 w-4 accent-prizm-primary cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between bg-black/10 p-2 border border-prizm-border rounded">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono font-bold text-prizm-text">REFRESH ON SIGNATURE CHANGE:</span>
                        <span className="text-[8px] text-prizm-text-muted">Resend command if fault text alters</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={fvRefreshOnChange}
                        onChange={e => setFvRefreshOnChange(e.target.checked)}
                        className="h-4 w-4 accent-prizm-primary cursor-pointer"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-[9px] text-prizm-text-muted uppercase">Interval (Secs)</span>
                        <input
                          type="number"
                          value={fvPollInterval}
                          onChange={e => setFvPollInterval(parseInt(e.target.value) || 30)}
                          className="w-full bg-prizm-bg border border-prizm-border rounded p-1.5 text-prizm-text font-mono mt-1"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] text-prizm-text-muted uppercase">Duration (Secs)</span>
                        <input
                          type="number"
                          value={fvDuration}
                          onChange={e => setFvDuration(parseInt(e.target.value) || 50400)}
                          className="w-full bg-prizm-bg border border-prizm-border rounded p-1.5 text-prizm-text font-mono mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column Ignored Rules */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono font-bold text-prizm-text uppercase block">
                      Ignored Fault Keywords / Nuisance Filtering:
                    </span>
                    <div className="bg-prizm-bg border border-prizm-border rounded p-2 max-h-[110px] overflow-y-auto space-y-1">
                      {fvIgnoredPatterns.map(pat => (
                        <div key={pat} className="flex items-center justify-between bg-black/5 px-1.5 py-0.5 rounded text-[10px] font-mono border border-prizm-border/40">
                          <span className="truncate max-w-[200px]">{pat}</span>
                          <button
                            onClick={() => removeIgnoredPattern(pat)}
                            className="text-prizm-danger hover:text-prizm-danger/80 cursor-pointer"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {fvIgnoredPatterns.length === 0 && (
                        <span className="text-[9px] text-prizm-text-muted block">No words ignored. Filter is fully open.</span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newPatternInput}
                        onChange={e => setNewPatternInput(e.target.value)}
                        placeholder="Add e.g., thermal leak"
                        className="flex-1 bg-prizm-bg border border-prizm-border rounded p-1 text-[11px] font-mono text-prizm-text outline-none"
                      />
                      <button
                        onClick={addIgnoredPattern}
                        className="bg-prizm-primary text-white text-[10px] font-mono font-bold px-2.5 shadow rounded cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Operations Actions Buttons Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-prizm-border/60">
                  <button
                    onClick={triggerFvPreview}
                    disabled={fvLoading}
                    className="p-2.5 bg-prizm-surface border border-prizm-border text-prizm-text hover:bg-black/10 rounded font-mono font-bold uppercase text-[10px] flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={11} className={fvLoading ? "animate-spin" : ""} />
                    Preview State
                  </button>
                  <button
                    onClick={triggerFvApplyOnce}
                    className="p-2.5 bg-prizm-primary text-white hover:bg-prizm-primary/95 rounded font-mono font-bold uppercase text-[10px] flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Play size={11} />
                    Apply Once
                  </button>
                  <button
                    onClick={() => triggerFvStartLive(false)}
                    className="p-2.5 bg-prizm-info/20 text-prizm-info border border-prizm-info/40 hover:bg-prizm-info/30 rounded font-mono font-bold uppercase text-[10px] flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Activity size={11} />
                    Start Dry Run
                  </button>
                  <button
                    onClick={() => triggerFvStartLive(true)}
                    className="p-2.5 bg-prizm-primary/20 text-prizm-primary border border-prizm-primary/40 hover:bg-prizm-primary/30 rounded font-mono font-bold uppercase text-[10px] flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <UserCheck size={11} />
                    Start Live Control
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => triggerFvStopLive(false)}
                    className="p-2 bg-prizm-surface border border-prizm-border hover:bg-prizm-bg rounded font-mono uppercase text-[9.5px]"
                  >
                    Stop Polling Only
                  </button>
                  <button
                    onClick={triggerFvClearResolved}
                    className="p-2 bg-prizm-surface border border-prizm-warning/30 hover:bg-prizm-bg rounded font-mono uppercase text-[9.5px] text-prizm-warning"
                  >
                    Clear Resolved
                  </button>
                  <button
                    onClick={triggerFvClearAll}
                    className="p-2 bg-prizm-surface border border-prizm-danger/30 hover:bg-prizm-bg rounded font-mono uppercase text-[9.5px] text-prizm-danger font-bold flex items-center justify-center gap-1"
                  >
                    <Trash2 size={10} />
                    Clear Managed (All)
                  </button>
                </div>
              </div>

              {/* STATS COUNT OVERVIEW */}
              {fvPreviewData?.summary && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3 bg-prizm-surface border border-prizm-border rounded-lg text-center">
                    <span className="text-[10px] font-mono text-prizm-text-muted block">ALARM STRINGS:</span>
                    <span className="text-xl font-bold font-mono text-prizm-danger block mt-1">
                      {fvPreviewData.summary.alarmCount || 0}
                    </span>
                  </div>
                  <div className="p-3 bg-prizm-surface border border-prizm-border rounded-lg text-center">
                    <span className="text-[10px] font-mono text-prizm-text-muted block">WARNING STRINGS:</span>
                    <span className="text-xl font-bold font-mono text-prizm-warning block mt-1">
                      {fvPreviewData.summary.warningCount || 0}
                    </span>
                  </div>
                  <div className="p-3 bg-prizm-surface border border-prizm-border rounded-lg text-center">
                    <span className="text-[10px] font-mono text-prizm-text-muted block">IGNORED ONLY COUNT:</span>
                    <span className="text-xl font-bold font-mono text-prizm-info block mt-1">
                      {fvPreviewData.summary.ignoredOnlyCount || 0}
                    </span>
                  </div>
                  <div className="p-3 bg-prizm-surface border border-prizm-border rounded-lg text-center">
                    <span className="text-[10px] font-mono text-prizm-text-muted block">CLEAR PENDING:</span>
                    <span className="text-xl font-bold font-mono text-prizm-text block mt-1">
                      {fvPreviewData.summary.clearPendingCount || 0}
                    </span>
                  </div>
                  <div className="p-3 bg-prizm-surface border border-prizm-border rounded-lg text-center col-span-2 sm:col-span-1 border-prizm-primary/40 bg-prizm-primary/5">
                    <span className="text-[10px] font-mono text-prizm-primary font-bold block">SIGNAL ACTIONS:</span>
                    <span className="text-xl font-bold font-mono text-prizm-primary block mt-1">
                      {fvPreviewData.summary.commandCount || 0}
                    </span>
                  </div>
                </div>
              )}

              {/* DYNAMIC FAULT ILLUMINATOR ACTIONS PREVIEW TABLE */}
              <div className="p-4 bg-prizm-surface border border-prizm-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Activity size={14} className="text-prizm-primary" />
                    <span className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest">
                      Fault State Visuals Matrix
                    </span>
                  </div>
                  {fvPreviewData?.actions && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => downloadJSON(fvPreviewData, "fault-visualizer-preview.json")}
                        className="text-[10px] font-mono bg-black/10 border border-prizm-border px-2 py-1 rounded hover:bg-black/15 flex items-center gap-1 cursor-pointer text-prizm-text"
                      >
                        <Download size={10} /> JSON
                      </button>
                      <button
                        onClick={() => {
                          const h = ["Array", "String", "Severity", "DesiredAction", "Color", "Alarms", "Warnings", "IgnoredAlarms", "IgnoredWarnings"];
                          const rows = fvPreviewData.actions.map((a: any) => [
                            a.arrayIndex,
                            a.stringIndex,
                            a.severity,
                            a.desiredAction,
                            `RGBW(${a.color.red} ${a.color.green} ${a.color.blue} ${a.color.white})`,
                            a.effectiveAlarms.join(";"),
                            a.effectiveWarnings.join(";"),
                            a.ignoredAlarms.join(";"),
                            a.ignoredWarnings.join(";")
                          ]);
                          downloadCSV(h, rows, "fault-visualizer-preview.csv");
                        }}
                        className="text-[10px] font-mono bg-black/10 border border-prizm-border px-2 py-1 rounded hover:bg-black/15 flex items-center gap-1 cursor-pointer text-prizm-text"
                      >
                        <Download size={10} /> CSV
                      </button>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto max-w-full">
                  <table className="w-full text-left font-mono text-[10px] border-collapse">
                    <thead>
                      <tr className="bg-black/10 border-b border-prizm-border text-prizm-text-muted leading-relaxed uppercase">
                        <th className="p-2">Array</th>
                        <th className="p-2">String</th>
                        <th className="p-2">Severity</th>
                        <th className="p-2 text-center">Desired Color</th>
                        <th className="p-2">Pending Action</th>
                        <th className="p-2">Fault Telemetry Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-prizm-border/40">
                      {fvPreviewData?.actions ? (
                        fvPreviewData.actions.map((item: any) => {
                          const key = `${item.arrayIndex}-${item.stringIndex}`;
                          const isWarning = item.severity === "warning";
                          const isAlarm = item.severity === "alarm";
                          return (
                            <tr key={key} className="hover:bg-black/5">
                              <td className="p-2 font-bold text-prizm-text">Array {item.arrayIndex}</td>
                              <td className="p-2 font-bold text-prizm-text">S{String(item.stringIndex).padStart(2, '0')}</td>
                              <td className="p-2">
                                <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase ${
                                  isAlarm ? "bg-prizm-danger/20 text-prizm-danger" : isWarning ? "bg-prizm-warning/20 text-prizm-warning" : "bg-black/20 text-prizm-text-muted"
                                }`}>
                                  {item.severity}
                                </span>
                              </td>
                              <td className="p-2 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <div
                                    className="h-3 w-6 rounded border border-prizm-border"
                                    style={{ backgroundColor: `rgb(${item.color.red},${item.color.green},${item.color.blue})` }}
                                  />
                                  <span className="text-[8.5px] text-prizm-text-muted">({item.color.red} {item.color.green} {item.color.blue} {item.color.white})</span>
                                </div>
                              </td>
                              <td className="p-2">
                                <span className={`font-bold ${
                                  item.desiredAction === "set-alarm" ? "text-prizm-danger" : item.desiredAction === "set-warning" ? "text-prizm-warning" : item.desiredAction === "clear" ? "text-prizm-primary animate-pulse" : "text-prizm-text-muted"
                                }`}>
                                  {item.desiredAction}
                                </span>
                              </td>
                              <td className="p-2 leading-relaxed">
                                {isAlarm && <div className="text-prizm-danger truncate max-w-[280px]">⚠️ Alr: {item.effectiveAlarms.join(", ")}</div>}
                                {isWarning && <div className="text-prizm-warning truncate max-w-[280px]">⚠️ Warn: {item.effectiveWarnings.join(", ")}</div>}
                                {item.ignoredAlarms.length > 0 || item.ignoredWarnings.length > 0 ? (
                                  <div className="text-prizm-info/80 text-[9px] truncate max-w-[280px]">
                                    (Ignored: {[...item.ignoredAlarms, ...item.ignoredWarnings].join(", ")})
                                  </div>
                                ) : null}
                                {!isAlarm && !isWarning && item.ignoredAlarms.length === 0 && item.ignoredWarnings.length === 0 && (
                                  <span className="text-prizm-primary">Normal Lineup</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="text-center p-6 text-prizm-text-muted font-mono h-[100px] leading-relaxed">
                            No Fault visual array preview loaded. Click "Preview State" above to scan current BESS status registries.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* FAULT ILLUMINATOR AUDIT TRAIL LOG */}
              <div className="p-4 bg-prizm-surface border border-prizm-border rounded-lg space-y-3">
                <div className="flex items-center justify-between border-b border-prizm-border pb-2">
                  <span className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest flex items-center gap-1.5">
                    <Activity size={13} className="text-prizm-primary" />
                    Fault Visualizer Audit Logs
                  </span>
                </div>

                <div className="max-h-[180px] overflow-y-auto space-y-2">
                  {fvAuditLogs.map(log => (
                    <div key={log.id} className="p-2.5 bg-black/10 border border-prizm-border/60 rounded text-[9.5px] font-mono flex flex-col md:flex-row justify-between gap-1">
                      <div className="space-y-1">
                        <span className="font-bold text-prizm-text">[{new Date(log.timestamp).toLocaleString()}] </span>
                        <span className="text-prizm-primary">Active Command Count: {log.commandCount} (Succ: {log.successCount} Fail: {log.failedCount})</span>
                        {log.warnings && log.warnings.length > 0 && (
                          <div className="text-prizm-warning text-[8.5px]">Warnings: {log.warnings.join(", ")}</div>
                        )}
                      </div>
                      <div className="text-right text-prizm-text-muted self-start md:self-auto text-[8.5px]">
                        Operator: {log.operator || "System Cycle"} {log.dryRun ? "[DRY RUN]" : "[LIVE]"}
                      </div>
                    </div>
                  ))}
                  {fvAuditLogs.length === 0 && (
                    <span className="text-[9px] text-prizm-text-muted block text-center py-4">No recent fault visualizer polling events resolved.</span>
                  )}
                </div>
              </div>

            </div>
          ) : (
            
            // OTHERWISE: MANUAL LIGHTBAR PATTERNS VIEW RENDERERS
            <div className="space-y-6 animate-fade-in duration-200">
              
              {/* Preview Grid Panel */}
              <div className="p-4 bg-prizm-surface border border-prizm-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest flex items-center gap-1.5">
                    <Activity size={13} className="text-prizm-primary" />
                    Field Lineup Pattern Preview
                  </span>
                  {previewResponse?.preview && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => downloadJSON(previewResponse, "lightbar-pattern-preview.json")}
                        className="text-[10px] font-mono bg-black/10 border border-prizm-border px-2 py-1 rounded hover:bg-black/15 flex items-center gap-1 cursor-pointer text-prizm-text"
                      >
                        <Download size={10} /> JSON
                      </button>
                      <button
                        onClick={() => {
                          const h = ["Array", "String", "Red", "Green", "Blue", "White", "Duration", "Group"];
                          const rows = previewResponse.preview.map((p: any) => [
                            p.array,
                            p.string,
                            p.red,
                            p.green,
                            p.blue,
                            p.white,
                            p.duration,
                            p.group
                          ]);
                          downloadCSV(h, rows, "lightbar-pattern-preview.csv");
                        }}
                        className="text-[10px] font-mono bg-black/10 border border-prizm-border px-2 py-1 rounded hover:bg-black/15 flex items-center gap-1 cursor-pointer text-prizm-text"
                      >
                        <Download size={10} /> CSV
                      </button>
                    </div>
                  )}
                </div>

                {/* Pattern specs metrics row */}
                {previewResponse && (
                  <div className="grid grid-cols-4 gap-2 bg-black/10 border border-prizm-border p-2 rounded text-center text-[10px] font-mono">
                    <div>
                      <span className="text-prizm-text-muted block font-mono">ARRAYS AFFECTED:</span>
                      <span className="text-prizm-primary font-bold">{previewResponse.arrayCount}</span>
                    </div>
                    <div>
                      <span className="text-prizm-text-muted block font-mono">STRINGS AFFECTED:</span>
                      <span className="text-prizm-primary font-bold">{previewResponse.stringCount}</span>
                    </div>
                    <div>
                      <span className="text-prizm-text-muted block font-mono">TOTAL COMMAND JOBS:</span>
                      <span className="text-prizm-info font-bold">{previewResponse.commandCount}</span>
                    </div>
                    <div>
                      <span className="text-prizm-text-muted block font-mono">ACTIVE DURATION:</span>
                      <span className="text-prizm-warning font-bold">{previewResponse.durationSeconds}s</span>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto max-h-[300px] overflow-y-auto max-w-full">
                  <table className="w-full text-left font-mono text-[10px] border-collapse border border-prizm-border">
                    <thead className="bg-black/10 text-prizm-text-muted uppercase">
                      <tr>
                        {activeProfile?.blocks && activeProfile.blocks.length > 1 && (
                          <th className="p-2 border-b border-prizm-border">BESS Block</th>
                        )}
                        <th className="p-2 border-b border-prizm-border">Array Index</th>
                        <th className="p-2 border-b border-prizm-border">String Index</th>
                        <th className="p-2 border-b border-prizm-border text-center">Illumination Preview</th>
                        <th className="p-2 border-b border-prizm-border">RGBW Color Params</th>
                        <th className="p-2 border-b border-prizm-border">Duration</th>
                        <th className="p-2 border-b border-prizm-border">Group ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-prizm-border/40">
                      {previewResponse?.preview ? (
                        previewResponse.preview.slice(0, 100).map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-black/5">
                            {activeProfile?.blocks && activeProfile.blocks.length > 1 && (
                              <td className="p-1.5 font-bold text-prizm-primary">Block {item.blockIndex ?? 1}</td>
                            )}
                            <td className="p-1.5 font-bold">Array {item.array}</td>
                            <td className="p-1.5 font-bold">S{String(item.string).padStart(2, '0')}</td>
                            <td className="p-1.5 text-center">
                              <div
                                className="h-3 w-10 mx-auto rounded border border-prizm-border duration-200"
                                style={{ backgroundColor: `rgb(${item.red},${item.green},${item.blue})` }}
                              />
                            </td>
                            <td className="p-1.5 text-[9px] text-prizm-text-muted">
                              R:{item.red} G:{item.green} B:{item.blue} W:{item.white}
                            </td>
                            <td className="p-1.5">{item.duration}s</td>
                            <td className="p-1.5">
                              <span className="bg-black/25 px-1.5 py-0.5 rounded text-[8.5px] text-prizm-primary font-bold">
                                {item.group}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={activeProfile?.blocks && activeProfile.blocks.length > 1 ? 7 : 6} className="text-center p-12 text-prizm-text-muted font-mono leading-relaxed h-[150px]">
                            Adjust manual color/range criteria on left side to calculate visual pattern maps.
                          </td>
                        </tr>
                      )}
                      {previewResponse?.preview && previewResponse.preview.length > 100 && (
                        <tr className="bg-black/20">
                          <td colSpan={activeProfile?.blocks && activeProfile.blocks.length > 1 ? 7 : 6} className="text-center p-2 font-mono text-[9px] text-prizm-text-muted">
                            Truncated representation display. Showing first 100 items out of {previewResponse.preview.length} command rows. Use export CSV/JSON options to fetch full array maps.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Deploy Outcome results table */}
              {resultsResponse && (
                <div id="deploy-results-div" className="p-4 bg-prizm-surface border border-prizm-info/50 rounded-lg space-y-4 shadow animate-fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-prizm-border pb-2">
                    <span className="text-xs font-bold font-mono text-prizm-primary uppercase tracking-widest flex items-center gap-1.5">
                      <CheckCircle size={14} />
                      Lineup Command Transmission Results
                    </span>
                    <button
                      onClick={() => setResultsResponse(null)}
                      className="text-[9.5px] text-prizm-text-muted hover:text-prizm-text font-mono"
                    >
                      Dismiss Results
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-black/10 border border-prizm-border rounded text-center p-2 text-[10px] font-mono">
                    <div>
                      <span className="text-prizm-text-muted block">COMMANDED TARGETS:</span>
                      <span className="text-lg font-bold text-prizm-text">{resultsResponse.commandCount}</span>
                    </div>
                    <div>
                      <span className="text-prizm-text-muted block">TRANSMITTED SUCCESS:</span>
                      <span className="text-lg font-bold text-prizm-primary">{resultsResponse.successCount}</span>
                    </div>
                    <div>
                      <span className="text-prizm-text-muted block text-prizm-danger">REJECTED / FAILED:</span>
                      <span className={`text-lg font-bold ${resultsResponse.failedCount > 0 ? "text-prizm-danger" : "text-prizm-text-muted"}`}>{resultsResponse.failedCount}</span>
                    </div>
                  </div>

                  {resultsResponse.failedCount > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold font-mono text-prizm-danger block uppercase">
                        Transmission Failures List (Check hardware IP links):
                      </span>
                      <div className="bg-prizm-bg border border-prizm-danger/40 p-2 rounded text-[9px] font-mono text-prizm-danger space-y-1 max-h-[120px] overflow-y-auto">
                        {resultsResponse.results.filter((r: any) => !r.ok).map((row: any, idx: number) => (
                          <div key={idx} className="flex justify-between hover:bg-black/10 p-1">
                            <span>Array {row.array} String {row.string}: {row.error || "Response Rejected"}</span>
                            <span className="text-[8px] truncate max-w-[200px]">{row.url}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Audit trail lists */}
              <div className="p-4 bg-prizm-surface border border-prizm-border rounded-lg space-y-3">
                <div className="flex items-center justify-between border-b border-prizm-border pb-2">
                  <span className="text-xs font-bold font-mono text-prizm-text uppercase tracking-widest flex items-center gap-1.5">
                    <Activity size={13} className="text-prizm-primary" />
                    Transaction Audit History (Manual Actions)
                  </span>
                </div>

                <div className="max-h-[180px] overflow-y-auto space-y-2">
                  {auditLogs.filter(log => log.source === "manual").map(log => (
                    <div key={log.id} className="p-2.5 bg-black/10 border border-prizm-border/60 rounded text-[9.5px] font-mono flex flex-col md:flex-row justify-between gap-1">
                      <div className="space-y-1">
                        <span className="font-bold text-prizm-text">[{new Date(log.timestamp).toLocaleString()}] </span>
                        <span className="text-prizm-text capitalize font-bold">Mode: {log.mode} </span>
                        <span className="text-prizm-primary">Command Count: {log.commandCount} (Succ: {log.successCount} Fail: {log.failedCount})</span>
                        <div className="text-[8.5px] text-prizm-text-muted mt-0.5">Arrays: {log.arrays} | Strings: {log.strings} | Duration: {log.duration}s</div>
                      </div>
                      <div className="text-right text-prizm-text-muted self-start md:self-auto text-[8.5px]">
                        Operator: {log.operator || "Operator Terminal"}
                      </div>
                    </div>
                  ))}
                  {auditLogs.filter(log => log.source === "manual").length === 0 && (
                    <span className="text-[9px] text-prizm-text-muted block text-center py-4">No recent manual command audits logged.</span>
                  )}
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* ==========================================================================
          8. CONFIRMATION DEPLOY DESIGN DIALOG MODAL
         ========================================================================== */}
      {showConfirmModal && previewResponse && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-prizm-surface border border-prizm-border rounded-lg max-w-md w-full p-6 space-y-5 animate-scale-up shadow-2xl relative">
            <div className="flex items-start gap-3">
              <AlertOctagon size={24} className="text-prizm-warning shrink-0" />
              <div>
                <h3 className="text-sm font-bold font-mono text-prizm-text uppercase tracking-widest">
                  Confirm Lineup Deployment Series
                </h3>
                <p className="text-[11.5px] text-prizm-text-muted mt-1 leading-normal">
                  You are about to command <span className="text-prizm-warning font-bold font-mono">{previewResponse.commandCount}</span> string lightbars for <span className="text-prizm-warning font-bold font-mono">{previewResponse.durationSeconds}</span> seconds.
                </p>
              </div>
            </div>

            {/* Threshold Checks warnings info */}
            {previewResponse.commandCount > 100 && (
              <div className="p-3 bg-prizm-warning/10 border border-prizm-warning/50 rounded text-[10px] font-mono leading-normal text-prizm-warning">
                ⚠️ <span className="font-bold">LARGE VOLUME WORKFLOW:</span> Command count exceeds 100 targets. Parallel queues with congestion throttles will be deployed. Expect slight propagation latency across the lineups.
              </div>
            )}

            {previewResponse.durationSeconds > 3600 && (
              <div className="p-3 bg-prizm-danger/10 border border-prizm-danger/50 rounded text-[10px] font-mono leading-normal text-prizm-danger">
                ⚠️ <span className="font-bold">EXTENDED HOLD PERIOD:</span> Active duration is larger than 1 hour. This triggers long-duration illumination down field strings, consuming slight continuous operating power.
              </div>
            )}

            <div className="bg-prizm-bg border border-prizm-border rounded p-3 text-[10.5px] font-mono space-y-1.5">
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">Target Arrays:</span>
                <span className="text-prizm-text font-bold">{arraysInput}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">Target Strings:</span>
                <span className="text-prizm-text font-bold">{stringsInput}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">Pattern Style:</span>
                <span className="text-prizm-primary font-bold uppercase">{mode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">Max Concurrency Threads:</span>
                <span className="text-prizm-info font-bold">{getConcurrencyVal()} concurrent</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 p-2 bg-prizm-surface border border-prizm-border hover:bg-prizm-bg text-prizm-text font-mono font-bold uppercase text-xs rounded cursor-pointer transition-all"
              >
                Cancel / Edit
              </button>
              <button
                type="button"
                onClick={executeDeployment}
                className="flex-1 p-2 bg-prizm-primary hover:bg-prizm-primary/90 text-white font-mono font-bold uppercase text-xs rounded cursor-pointer transition-all border border-prizm-primary shadow-lg shadow-prizm-primary/25"
              >
                Confirm Apply
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Visual layout helper and code formatting adjustments
function AlertCircleWithSpace() {
  return <AlertTriangle size={15} className="inline mr-1" />;
}
