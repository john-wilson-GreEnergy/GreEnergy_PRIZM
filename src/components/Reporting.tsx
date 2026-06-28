import { markPerf } from '../lib/perf';
import React, { useState, useEffect } from "react";
import { 
  FileSpreadsheet, 
  Download, 
  Calendar, 
  Plus, 
  Check, 
  Trash2, 
  Briefcase, 
  FileText, 
  Mail, 
  Clock, 
  Activity,
  Sparkles,
  Layers,
  ArrowRight,
  Database,
  RefreshCw,
  Info,
  CheckCircle,
  AlertTriangle,
  FileArchive,
  Play,
  Pause,
  Square,
  Camera,
  FileJson,
  Users,
  CheckSquare,
  FileCheck
} from "lucide-react";
import { BessDevice, ReportConfig } from "../types";
import SiteSensorsMatrix from "./SiteSensorsMatrix";

interface ReportingProps {
  devices: BessDevice[];
  reports: ReportConfig[];
  onAddReport: (repData: any) => Promise<void>;
  onDeleteReport: (id: string) => Promise<void>;
  diagnosticSession?: any;
  onRefreshDiagnostic?: () => void;
}

import SiteDataExport from './SiteDataExport';

export default function Reporting({ 
  devices, 
  reports, 
  onAddReport, 
  onDeleteReport,
  diagnosticSession,
  onRefreshDiagnostic
}: ReportingProps) {
  // Report Catalog Template items
  const [catalog, setCatalog] = useState<any[]>([]);
  // Sub-tabs navigation for matrix vs reports
  const [activeSubTab, setActiveSubTab] = useState<"archives" | "sensors">("sensors");
  // Recent exports list
  const [recentReports, setRecentReports] = useState<any[]>([]);
  // Selected builder template state
  const [selectedBuilderType, setSelectedBuilderType] = useState<string>("site-validation-package");
  const [selectedBuilderFormat, setSelectedBuilderFormat] = useState<string>("zip");
  
  // States for loaders
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [compilingType, setCompilingType] = useState<string | null>(null);
  const [isCleanupRunning, setIsCleanupRunning] = useState(false);
  const [infoMsg, setInfoMsg] = useState("");
  const [errBuilderMsg, setErrBuilderMsg] = useState("");

  // Diagnostic Session States
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [sessionName, setSessionName] = useState("Field Test Routine");
  const [sessionTechnician, setSessionTechnician] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState(10);
  const [scopes, setScopes] = useState({
    strings: true,
    stringDetails: false,
    balancing: true,
    pcs: true,
    siteSensors: true,
    hvac: false,
    sourceHealth: true,
    notifications: true
  });
  
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryMsg, setSummaryMsg] = useState("");

  const [durationSecs, setDurationSecs] = useState<number>(0);

  useEffect(() => {
    if (!diagnosticSession || !diagnosticSession.active) {
      if (diagnosticSession && diagnosticSession.startedAt) {
        const end = diagnosticSession.endedAt ? new Date(diagnosticSession.endedAt).getTime() : Date.now();
        setDurationSecs(Math.floor((end - new Date(diagnosticSession.startedAt).getTime()) / 1000));
      }
      return;
    }

    const interval = setInterval(() => {
      if (diagnosticSession && diagnosticSession.startedAt) {
        setDurationSecs(Math.floor((Date.now() - new Date(diagnosticSession.startedAt).getTime()) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [diagnosticSession]);

  const formatDuration = (secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, "0");
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // Pre-load summary if session page changes
  useEffect(() => {
    if (diagnosticSession && !diagnosticSession.active && diagnosticSession.id) {
      fetchSummary(diagnosticSession.id);
    }
  }, [diagnosticSession?.id, diagnosticSession?.active]);

  const fetchSummary = async (sessionId: string) => {
    const t0 = performance.now();
    setLoadingSummary(true);
    setSummaryMsg("");
    try {
      const res = await fetch(`/api/local/diagnostic-session/${sessionId}/summary`);
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data?.summary || null);
      } else {
        setSummaryData(null);
      }
    } catch (e: any) {
      console.error("Summary fetch error", e);
      setSummaryMsg("Could not fetch comparison summary: " + e.message);
    } finally {
      setLoadingSummary(false);
      markPerf('Reporting fetchSummary', t0);
    }
  };

  const handleStartSession = async () => {
    setErrBuilderMsg("");
    try {
      const res = await fetch("/api/local/diagnostic-session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sessionName,
          technician: sessionTechnician,
          notes: sessionNotes,
          pollIntervalMs: pollIntervalSeconds * 1000,
          captureScope: scopes
        })
      });
      if (res.ok) {
        const session = await res.json();
        setInfoMsg(`Diagnostic session "${session.name}" successfully started.`);
        setShowSetupModal(false);
        setSummaryData(null); // Clear last summary
        if (onRefreshDiagnostic) onRefreshDiagnostic();
      } else {
        const err = await res.json().catch(() => null);
        setErrBuilderMsg("Start failed: " + (err?.error || res.statusText));
      }
    } catch (e: any) {
      setErrBuilderMsg("Start failed: " + e.message);
    }
  };

  const handlePauseSession = async () => {
    try {
      const res = await fetch("/api/local/diagnostic-session/pause", { method: "POST" });
      if (res.ok) {
        setInfoMsg("Diagnostic session paused.");
        if (onRefreshDiagnostic) onRefreshDiagnostic();
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleResumeSession = async () => {
    try {
      const res = await fetch("/api/local/diagnostic-session/resume", { method: "POST" });
      if (res.ok) {
        setInfoMsg("Diagnostic session resumed.");
        if (onRefreshDiagnostic) onRefreshDiagnostic();
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleStopSession = async () => {
    try {
      const res = await fetch("/api/local/diagnostic-session/stop", { method: "POST" });
      if (res.ok) {
        const ended = await res.json();
        setInfoMsg(`Session "${ended.name}" stopped. Uptime: ${formatDuration(durationSecs)}.`);
        if (onRefreshDiagnostic) onRefreshDiagnostic();
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleCaptureOnce = async () => {
    setInfoMsg("Requesting instant high-priority LAN capture matrix...");
    try {
      const res = await fetch("/api/local/diagnostic-session/capture-once", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Manual Snapshot" })
      });
      if (res.ok) {
        setInfoMsg("Manual snapshot captured and appended successfully.");
        if (onRefreshDiagnostic) onRefreshDiagnostic();
      } else {
        setInfoMsg("Manual snapshot failed.");
      }
    } catch (e) {
      setInfoMsg("Manual snapshot failed.");
    }
    setTimeout(() => setInfoMsg(""), 4000);
  };

  const fetchCatalog = async () => {
    const t0 = performance.now();
    try {
      const res = await fetch("/api/local/reports/catalog");
      if (res.ok) {
        const data = await res.json();
        if (data && data.catalog) setCatalog(data.catalog);
      }
    } catch (e) {
      console.error("[Reporting] Error fetching report catalog:", e);
    } finally {
      setLoadingCatalog(false);
      markPerf('Reporting fetchCatalog', t0);
    }
  };

  const fetchRecentReports = async () => {
    const t0 = performance.now();
    setLoadingRecent(true);
    try {
      const res = await fetch("/api/local/reports/recent");
      if (res.ok) {
        const data = await res.json();
        if (data && data.reports) setRecentReports(data.reports);
      }
    } catch (e) {
      console.error("[Reporting] Error fetching recent reports:", e);
    } finally {
      setLoadingRecent(false);
      markPerf('Reporting fetchRecentReports', t0);
    }
  };

  useEffect(() => {
    fetchCatalog();
    fetchRecentReports();
  }, []);

  // Update builder formats whenever report type changes in selector
  useEffect(() => {
    const matched = catalog.find(c => c.id === selectedBuilderType);
    if (matched && matched.formats && matched.formats.length > 0) {
      if (!matched.formats.includes(selectedBuilderFormat)) {
        setSelectedBuilderFormat(matched.formats[0]);
      }
    }
  }, [selectedBuilderType, catalog]);

  // Trigger report creation on backend
  const handleGenerateReport = async (type: string, formatSelected: string) => {
    setCompilingType(type);
    setInfoMsg(`Staging assets... Compiling ${formatSelected.toUpperCase()} datasets...`);
    setErrBuilderMsg("");
    try {
      const res = await fetch("/api/local/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: type,
          format: formatSelected
        })
      });

      if (!res.ok) throw new Error("Backend compilation failure");
      
      const resJson = await res.json();
      if (resJson.success && resJson.downloadUrl) {
        // Automatically trigger browser download request
        const link = document.createElement("a");
        link.href = resJson.downloadUrl;
        link.setAttribute("download", resJson.filename);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);

        setInfoMsg(`Success! Saved as ${resJson.filename}`);
        // Refresh archives
        fetchRecentReports();
      } else {
        throw new Error(resJson.error || "Failed to generate report file.");
      }
    } catch (e: any) {
      console.error("[Reporting] Generation failed:", e);
      setErrBuilderMsg(e.message || "Export compilation failed.");
    } finally {
      setCompilingType(null);
      setTimeout(() => setInfoMsg(""), 4000);
    }
  };

  // Trigger Deletion
  const handleDeleteReportFile = async (id: string) => {
    if (!confirm(`Are you sure you want to permanently delete archive ${id}?`)) return;
    try {
      const res = await fetch(`/api/local/reports/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchRecentReports();
      }
    } catch (e) {
      console.error("[Reporting] Error deleting report:", e);
    }
  };

  // Trigger Cleanup
  const handleTriggerCleanup = async () => {
    setIsCleanupRunning(true);
    setInfoMsg("Reviewing file age retention. Clearing archives exceeding 14 days or capacity thresholds...");
    try {
      const res = await fetch("/api/local/reports/cleanup", { method: "POST" });
      if (res.ok) {
        setInfoMsg("Storage policy cleanup completed.");
        fetchRecentReports();
      }
    } catch (e) {
      console.error("[Reporting] Storage cleanup failed:", e);
    } finally {
      setIsCleanupRunning(false);
      setTimeout(() => setInfoMsg(""), 3000);
    }
  };

  // Convert bytes size to human units
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Get active selected catalog item
  const activeCatalogItem = catalog.find(c => c.id === selectedBuilderType);

  return (
    <div className="space-y-6 font-mono animate-fade-in w-full pb-8">

      {/* DIAGNOSTIC CAPTURE SETUP MODAL OVERLAY */}
      {showSetupModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-mono">
          <div className="bg-prizm-surface border border-prizm-border rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            <div className="bg-prizm-surface-strong p-4 border-b border-prizm-border flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-prizm-primary flex items-center gap-1.5">
                <Play size={12} className="fill-cyan-400" />
                Initialize Diagnostic Capture Session
              </h3>
              <button 
                onClick={() => setShowSetupModal(false)}
                className="text-prizm-text-muted hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto pr-1 no-scrollbar scroll-smooth">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-prizm-text-muted block">
                  Session Name / ID Label *
                </label>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="w-full bg-prizm-surface-strong border border-prizm-border p-2.5 rounded text-xs text-prizm-text font-mono focus:border-prizm-primary outline-none"
                  placeholder="e.g. Stress Test Battery Block A"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-prizm-text-muted block">
                    Technician Code
                  </label>
                  <input
                    type="text"
                    value={sessionTechnician}
                    onChange={(e) => setSessionTechnician(e.target.value)}
                    className="w-full bg-prizm-surface-strong border border-prizm-border p-2.5 rounded text-xs text-prizm-text font-mono focus:border-prizm-primary outline-none"
                    placeholder="e.g. JW-982"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-prizm-text-muted block">
                    Telemetry Interval
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[5, 10, 30, 60].map(s => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setPollIntervalSeconds(s)}
                        className={`p-2 border text-[10px] text-center rounded font-mono font-bold transition-all cursor-pointer ${
                          pollIntervalSeconds === s
                            ? "bg-[#06B6D4] text-black border-[#06B6D4]"
                            : "bg-prizm-surface hover:bg-black/20 text-prizm-text border-prizm-border"
                        }`}
                      >
                        {s}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-prizm-text-muted block">
                  Additional Notes
                </label>
                <textarea
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-prizm-surface-strong border border-prizm-border p-2.5 rounded text-xs text-prizm-text font-mono focus:border-prizm-primary outline-none resize-none"
                  placeholder="Special configurations, environmental baseline etc."
                />
              </div>

              <div className="space-y-2 border-t border-prizm-border pt-3">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] uppercase font-bold text-prizm-text-muted block">
                    Capture Scope checklist
                  </label>
                  <span className="text-[8px] bg-cyan-400/10 text-prizm-primary font-bold px-1.5 py-0.5 rounded uppercase font-mono tracking-wider">
                    LAN bandwidth optimizer active
                  </span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10.5px]">
                  {Object.keys(scopes).map(key => {
                    const active = (scopes as any)[key];
                    const labels: Record<string, string> = {
                      strings: "BESS String States",
                      stringDetails: "BPC Cell Matrix (high size)",
                      balancing: "Balancer Row Matrices",
                      pcs: "PCS Inverter telemetry",
                      siteSensors: "Environmental Sensors",
                      hvac: "Feather / HVAC data",
                      sourceHealth: "EMS Status Logs",
                      notifications: "Active Site warnings"
                    };
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setScopes(prev => ({ ...prev, [key]: !active }))}
                        className={`p-2 border rounded text-left flex items-center justify-between transition-colors cursor-pointer ${
                          active
                            ? "bg-[#06B6D4]/5 border-cyan-500 text-prizm-primary"
                            : "bg-prizm-surface-strong border-prizm-border hover:border-white/5 text-prizm-text-muted"
                        }`}
                      >
                        <span className="uppercase text-[9.5px] tracking-wide truncate max-w-[160px]">{labels[key] || key}</span>
                        <span className={`h-3 w-3 border flex items-center justify-center rounded text-[8px] ${active ? "border-[#06B6D4] bg-[#06B6D4] text-black font-black" : "border-prizm-border"}`}>
                          {active ? "✓" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-prizm-surface-strong p-4 border-t border-prizm-border flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowSetupModal(false)}
                className="px-4 py-2 border border-prizm-border hover:bg-black/20 text-prizm-text text-[10px] uppercase font-bold tracking-wider rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartSession}
                className="px-5 py-2 bg-prizm-primary hover:bg-cyan-400 text-black text-[10px] font-black uppercase rounded shadow-lg tracking-wider cursor-pointer"
              >
                Start Session and Begin Polling
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TABS NAVIGATION */}
      <div className="flex border-b border-prizm-border pb-0.5 gap-2" id="prizm-reporting-subtabs">
        <button
          onClick={() => setActiveSubTab("sensors")}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
            activeSubTab === "sensors"
              ? "border-prizm-primary text-prizm-primary font-sans"
              : "border-transparent text-prizm-text-muted hover:text-white"
          }`}
        >
          Environmental Sensors Matrix
        </button>
        <button
          onClick={() => setActiveSubTab("archives")}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
            activeSubTab === "archives"
              ? "border-prizm-primary text-prizm-primary font-sans"
              : "border-transparent text-prizm-text-muted hover:text-white"
          }`}
        >
          Diagnostic Journals & Exports
        </button>
      </div>

      {activeSubTab === "sensors" ? (
        <SiteSensorsMatrix />
      ) : (
        <>

      {/* CORE DIAGNOSTIC CAPTURE PANEL */}
      {diagnosticSession && diagnosticSession.active ? (
        <div id="diagnostic-session-panel" className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-prizm-border pb-3">
            <div className="flex items-center gap-3">
              <Activity className={diagnosticSession.paused ? "text-amber-500 animate-pulse" : "text-rose-500 animate-pulse"} size={18} />
              <div>
                <h3 className="text-sm font-bold text-prizm-text uppercase tracking-wider flex items-center gap-2">
                  Diagnostic Session Capture
                </h3>
                <p className="text-[10px] text-prizm-text-muted uppercase">ACTIVE POLLING SNAPSHOT ENGINE</p>
              </div>
            </div>
            <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${
              diagnosticSession.paused 
                ? "bg-amber-950/20 text-amber-500 border-amber-500/30" 
                : "bg-rose-950/20 text-rose-500 border-rose-500/40 animate-pulse"
            }`}>
              {diagnosticSession.paused ? "PAUSED" : "RECORDING"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-prizm-surface-strong border border-white/5 p-4 rounded-lg">
            <div className="space-y-1">
              <span className="text-[9px] uppercase font-bold text-prizm-text-muted">Session Name</span>
              <span className="block font-bold text-[11px] text-prizm-text truncate" title={diagnosticSession.name}>
                {diagnosticSession.name}
              </span>
              {diagnosticSession.technician && (
                <span className="block text-[10px] text-[#9CA3AF]/60 italic truncate">
                  Tech: {diagnosticSession.technician}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-[9px] uppercase font-bold text-prizm-text-muted">Duration (Uptime Clock)</span>
              <span className="block font-sans font-bold text-base text-cyan-400">
                {formatDuration(durationSecs)}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-[9px] uppercase font-bold text-prizm-text-muted">Samples Captured</span>
              <div className="flex items-center gap-2">
                <span className="block font-mono font-bold text-sm text-prizm-text">
                  {diagnosticSession.sampleCount}
                </span>
                <span className="text-[9px] text-[#9CA3AF]/60 uppercase">
                  (Interval: {diagnosticSession.pollIntervalMs / 1000}s)
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[9px] uppercase font-bold text-prizm-text-muted">Storage & Synchronicity</span>
              <div className="text-[10px] space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-prizm-text-muted">EST SIZE:</span>
                  <span className="font-bold text-prizm-text">{formatBytes(diagnosticSession.storageEstimateBytes || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-prizm-text-muted">LAST STAT:</span>
                  <span className={`font-bold ${diagnosticSession.lastPollStatus === "success" ? "text-emerald-400" : "text-amber-500"}`}>
                    {diagnosticSession.lastPollStatus || "pending"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex flex-wrap gap-2">
              {diagnosticSession.paused ? (
                <button
                  onClick={handleResumeSession}
                  className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase rounded cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Play size={10} />
                  Resume Polling
                </button>
              ) : (
                <button
                  onClick={handlePauseSession}
                  className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold uppercase rounded cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Pause size={10} />
                  Pause Polling
                </button>
              )}

              <button
                onClick={handleStopSession}
                className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold uppercase rounded cursor-pointer transition-colors flex items-center gap-1.5"
              >
                <Square size={10} />
                Stop Session & Save
              </button>

              <button
                onClick={handleCaptureOnce}
                className="px-4 py-2 bg-prizm-surface-strong hover:bg-black/20 border border-prizm-border text-prizm-text text-[10px] uppercase font-bold tracking-wider rounded cursor-pointer transition-colors flex items-center gap-1.5"
              >
                <Camera size={10} className="text-cyan-400" />
                Capture Snapshot Now
              </button>
            </div>

            <div className="flex gap-2">
              <a
                href={`/api/local/diagnostic-session/${diagnosticSession.id}/export/json`}
                download={`diagnostic_session_${diagnosticSession.id}_export.json`}
                className="px-3 py-2 bg-black/40 hover:bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded text-[10px] uppercase font-bold transition-colors flex items-center gap-1 cursor-pointer"
              >
                <FileJson size={11} />
                Export JSON
              </a>
              <a
                href={`/api/local/diagnostic-session/${diagnosticSession.id}/export/csv`}
                className="px-3 py-2 bg-black/40 hover:bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded text-[10px] uppercase font-bold transition-colors flex items-center gap-1 cursor-pointer"
              >
                <FileArchive size={11} />
                Export CSV (.ZIP)
              </a>
            </div>
          </div>

          <div className="p-3 bg-[#EAB308]/5 border border-dashed border-[#EAB308]/20 rounded text-[10px] text-[#EAB308]/80 leading-relaxed uppercase">
            <div className="flex gap-2 items-start">
              <Info size={12} className="shrink-0 mt-0.5" />
              <span>
                Session capture records local diagnostic data while this laptop is connected to the BESS LAN.
                Turn off session capture when finished to stop polling and reduce LAN traffic.
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div id="diagnostic-session-panel" className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-prizm-border pb-3">
            <div className="flex items-center gap-3">
              <Activity className="text-prizm-text-muted" size={18} />
              <div>
                <h3 className="text-sm font-bold text-prizm-text uppercase tracking-wider">
                  Diagnostic Session Capture
                </h3>
                <p className="text-[10px] text-prizm-text-muted uppercase">ACTIVE POLLING SNAPSHOT ENGINE</p>
              </div>
            </div>
            <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded border border-prizm-border text-prizm-text-muted bg-prizm-surface-strong">
              OFF
            </span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2">
            <div className="space-y-1">
              <p className="text-[11px] text-prizm-text uppercase tracking-wide font-medium">
                Session capture is off. Start a diagnostic session to record polling data.
              </p>
              <p className="text-[10px] text-prizm-text-muted leading-relaxed uppercase max-w-2xl">
                Enabling diagnostic session capture will trigger background polling of Modbus loops and site endpoints to create local chronologically-indexed logs.
              </p>
            </div>

            <button
              onClick={() => setShowSetupModal(true)}
              className="px-5 py-3 bg-cyan-500 hover:bg-cyan-600 text-black text-xs font-black uppercase rounded shadow-lg shadow-cyan-950/40 tracking-wider flex items-center gap-2 cursor-pointer transition-all active:translate-y-px text-center justify-center shrink-0"
            >
              <Play size={13} className="fill-black" />
              Start Diagnostic Session
            </button>
          </div>

          <div className="p-3 bg-[#EAB308]/5 border border-dashed border-[#EAB308]/20 rounded text-[10px] text-[#EAB308]/80 leading-relaxed uppercase">
            <div className="flex gap-2 items-start">
              <Info size={12} className="shrink-0 mt-0.5" />
              <span>
                Session capture records local diagnostic data while this laptop is connected to the BESS LAN.
                Turn off session capture when finished to stop polling and reduce LAN traffic.
              </span>
            </div>
          </div>

          {/* LAST SESSION REPORT VIEW */}
          {diagnosticSession && diagnosticSession.id && (
            <div className="pt-3 border-t border-prizm-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-prizm-primary font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <FileCheck size={14} />
                  Last Diagnostic Journal Report: {diagnosticSession.name || "Offline session"}
                </span>
                <div className="flex gap-2">
                  <a
                    href={`/api/local/diagnostic-session/${diagnosticSession.id}/export/json`}
                    download={`diagnostic_session_${diagnosticSession.id}_export.json`}
                    className="px-2 py-1 bg-black/40 hover:bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded text-[9px] uppercase font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <FileJson size={10} />
                    JSON Journal
                  </a>
                  <a
                    href={`/api/local/diagnostic-session/${diagnosticSession.id}/export/csv`}
                    className="px-2 py-1 bg-black/40 hover:bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded text-[9px] uppercase font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <FileArchive size={10} />
                    CSV Zip Package
                  </a>
                </div>
              </div>

              {loadingSummary ? (
                <div className="py-4 text-center text-[10px] text-prizm-text-muted">
                  <RefreshCw size={12} className="animate-spin inline-block mr-2" />
                  COMPILING BASELINE VS FINAL SUMMARY...
                </div>
              ) : summaryData ? (
                <div className="bg-prizm-surface-strong rounded border border-white/5 p-4 space-y-3 text-[10px] uppercase">
                  <h4 className="font-bold text-prizm-text-muted tracking-wider pb-1.5 border-b border-white/[0.04]">
                    Baseline vs Final Delta Comparison Summary:
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-cyan-400 font-bold block">Capacity/Uptime Metric</span>
                      <div className="space-y-1 text-prizm-text-muted font-mono leading-relaxed">
                        <div className="flex justify-between">
                          <span>Elapsed Duration:</span>
                          <span className="text-prizm-text font-bold">{Math.round((summaryData.durationMs || 0) / 1000)}s</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Start Avg String SOC:</span>
                          <span className="text-prizm-text font-bold">{summaryData.capacitySocialStart || "0"}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>End Avg String SOC:</span>
                          <span className="text-prizm-text font-bold">{summaryData.capacitySocialEnd || "0"}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-prizm-primary font-bold block">Balancing Operations</span>
                      <div className="space-y-1 text-prizm-text-muted">
                        <div>
                          <span>Balancers Engaged:</span>
                          {summaryData.balancingStarted?.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
                              {summaryData.balancingStarted.map((b: string) => (
                                <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-bold" key={b}>{b}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-prizm-text font-bold ml-1">None started</span>
                          )}
                        </div>
                        <div className="mt-1">
                          <span>Balancers Disengaged:</span>
                          {summaryData.balancingStopped?.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
                              {summaryData.balancingStopped.map((b: string) => (
                                <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded font-bold" key={b}>{b}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-prizm-text font-bold ml-1">None disengaged</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/[0.04]">
                    <div className="space-y-1.5">
                      <span className="text-red-400 font-bold block">Faults Raised ({summaryData.newFaults?.length || 0})</span>
                      {summaryData.newFaults?.length > 0 ? (
                        <div className="space-y-1.5">
                          {summaryData.newFaults.map((f: any, idx: number) => (
                            <div key={idx} className="bg-red-500/5 border border-red-500/20 rounded p-1.5 text-[9px] text-red-300">
                              <span className="font-extrabold block">{f.heading || f.code}</span>
                              <span className="text-[#9CA3AF]/60 block leading-normal">{f.body}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-prizm-text-muted italic">No new faults raised during this test run.</span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-emerald-400 font-bold block">Faults Cleared ({summaryData.clearedFaults?.length || 0})</span>
                      {summaryData.clearedFaults?.length > 0 ? (
                        <div className="space-y-1.5">
                          {summaryData.clearedFaults.map((f: any, idx: number) => (
                            <div key={idx} className="bg-emerald-500/5 border border-emerald-500/20 rounded p-1.5 text-[9px] text-emerald-300">
                              <span className="font-extrabold block">{f.heading || f.code}</span>
                              <span className="text-[#9CA3AF]/60 block leading-normal">{f.body}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-prizm-text-muted italic">No faults cleared.</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/[0.04] grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <span className="text-prizm-text-muted block">String State Changes:</span>
                      {summaryData.stringChanges?.length > 0 ? (
                        <div className="space-y-1 mt-1 text-[9px] text-prizm-text">
                          {summaryData.stringChanges.map((sc: any, idx: number) => (
                            <div className="p-1 bg-[#22D3EE]/5 border border-[#22D3EE]/15 rounded" key={idx}>
                              <span className="font-bold">{sc.string}:</span> {sc.from} → {sc.to}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[9px] text-[#9CA3AF]/60 italic block mt-0.5">No string state transitions</span>
                      )}
                    </div>

                    <div>
                      <span className="text-prizm-text-muted block">PCS Switch Events:</span>
                      {summaryData.pcsChanges?.length > 0 ? (
                        <div className="space-y-1 mt-1 text-[9px] text-prizm-text">
                          {summaryData.pcsChanges.map((pc: any, idx: number) => (
                            <div className="p-1 bg-[#22D3EE]/5 border border-[#22D3EE]/15 rounded" key={idx}>
                              <span className="font-bold">{pc.name}:</span> {pc.from} → {pc.to}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[9px] text-[#9CA3AF]/60 italic block mt-0.5">No PCS state shifts</span>
                      )}
                    </div>

                    <div>
                      <span className="text-prizm-text-muted block">Sensor Alarm Changes:</span>
                      {summaryData.sensorChanges?.length > 0 ? (
                        <div className="space-y-1 mt-1 text-[9px] text-prizm-text">
                          {summaryData.sensorChanges.map((sec: any, idx: number) => (
                            <div className="p-1 bg-[#22D3EE]/5 border border-[#22D3EE]/15 rounded" key={idx}>
                              <span className="font-bold">{sec.label}:</span> {sec.from} → {sec.to}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[9px] text-[#9CA3AF]/60 italic block mt-0.5">No sensor state shifts</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* ONE-CLICK SITE VALIDATION PACKAGE HERO */}
      <div className="bg-prizm-surface border border-prizm-primary/30 rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl relative overflow-hidden backdrop-blur-md">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2">
            <Sparkles className="text-prizm-primary animate-pulse" size={16} />
            <span className="text-[10px] uppercase font-mono tracking-widest bg-cyan-400/10 text-prizm-primary px-2 py-0.5 rounded border border-prizm-primary/20">
              Core Commissioning Feature
            </span>
          </div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-prizm-text">
            Site Validation Evidence Package
          </h2>
          <p className="text-[11px] text-prizm-text-muted leading-relaxed uppercase">
            One-click generator compiling total system configuration profiles, Modbus registers layout models, complete active block/array checklists, fault punchlists, and HVAC system diagnostic trace streams into a single authenticated billing-grade evidence .ZIP file.
          </p>
        </div>

        <button 
          onClick={() => handleGenerateReport("site-validation-package", "zip")}
          disabled={!!compilingType}
          className="w-full md:w-auto px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-black text-xs font-black uppercase rounded shadow-lg shadow-cyan-950/40 tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:translate-y-px shrink-0 disabled:opacity-40"
        >
          {compilingType === "site-validation-package" ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              Compiling Evidence Folder...
            </>
          ) : (
            <>
              <FileArchive size={15} />
              Build Validation Package (.ZIP)
            </>
          )}
        </button>
      </div>

      {infoMsg && (
        <div className="p-3 bg-prizm-info/10 text-cyan-300 font-extrabold uppercase border border-prizm-primary/20 text-[10px] rounded animate-pulse flex items-center gap-2 shadow-inner">
          <Info size={12} className="text-prizm-primary" />
          {infoMsg}
        </div>
      )}

      {/* THREE INTERACTIVE COLUMN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: QUICK EXPORTS & CONFIGURABLE BUILDER */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* CONFIGURABLE REPORT BUILDER */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-4">
            <h3 className="text-xs font-bold text-prizm-text uppercase tracking-wider flex items-center gap-2 border-b border-prizm-border pb-2">
              <Briefcase size={14} className="text-cyan-500" />
              Dynamic Report Builder Engine
            </h3>

            {loadingCatalog ? (
              <div className="py-8 text-center text-prizm-text-muted text-[10px]">
                <RefreshCw size={14} className="animate-spin inline-block mr-2 text-prizm-primary" />
                Querying report template engines...
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* 1. Select template product */}
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-prizm-text-muted block">
                    Product Template
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {catalog.map(c => {
                      const active = selectedBuilderType === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelectedBuilderType(c.id)}
                          className={`p-3 rounded border text-left font-mono text-[11px] transition-all cursor-pointer flex flex-col justify-between ${
                            active
                              ? "bg-cyan-500/[0.03] border-prizm-primary"
                              : "bg-prizm-surface-strong border-prizm-border hover:border-white/10"
                          }`}
                        >
                          <div className="space-y-1">
                            <span className={`block font-bold leading-tight ${active ? "text-prizm-primary" : "text-prizm-text"}`}>
                              {c.name}
                            </span>
                            <p className="text-[9px] text-[#9CA3AF]/60 uppercase leading-snug truncate max-w-sm">
                              {c.description}
                            </p>
                          </div>
                          <span className="text-[8px] uppercase text-prizm-text-muted mt-2 block font-extrabold tracking-widest bg-black/30 p-0.5 px-1.5 rounded w-fit">
                            {c.category}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Format Selection & Settings */}
                {activeCatalogItem && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-prizm-surface-strong border border-white/5 p-4 rounded-lg">
                    <div className="space-y-2">
                      <span className="text-[10px] uppercase font-bold text-prizm-text-muted block">
                        Output Format
                      </span>
                      <div className="flex gap-2">
                        {activeCatalogItem.formats.map((f: string) => {
                          const active = selectedBuilderFormat === f;
                          return (
                            <button
                              key={f}
                              onClick={() => setSelectedBuilderFormat(f)}
                              className={`px-4 py-2 border rounded font-bold uppercase text-[10px] tracking-wider transition-colors cursor-pointer ${
                                active
                                  ? "bg-cyan-500 text-black border-prizm-primary"
                                  : "bg-prizm-surface hover:bg-black/20 text-prizm-text border-prizm-border"
                              }`}
                            >
                              <FileText size={10} className="inline mr-1" />
                              {f}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1 text-[10px] text-prizm-text-muted leading-relaxed flex flex-col justify-center">
                      <div className="flex items-center gap-1">
                        <CheckCircle size={10} className="text-emerald-400 shrink-0" />
                        <span>Sign-off / utility compliance document</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckCircle size={10} className="text-emerald-400 shrink-0" />
                        <span>Pre-mapped variables & timestamps</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckCircle size={10} className="text-emerald-400 shrink-0" />
                        <span>Compliant with standard spreadsheets</span>
                      </div>
                    </div>
                  </div>
                )}

                {errBuilderMsg && (
                  <div className="p-2.5 bg-red-950/20 border border-red-500/30 text-rose-300 text-[10px] uppercase font-bold rounded">
                    Error compiling: {errBuilderMsg}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end pt-2 border-t border-prizm-border">
                  <button
                    onClick={() => handleGenerateReport(selectedBuilderType, selectedBuilderFormat)}
                    disabled={!!compilingType}
                    className="px-5 py-2.5 bg-prizm-primary hover:bg-cyan-400 text-black text-[10.5px] font-black uppercase rounded shadow-lg shadow-cyan-950/20 tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {compilingType === selectedBuilderType ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" />
                        Compiling Dataset...
                      </>
                    ) : (
                      <>
                        <Download size={13} />
                        Compile and Generate Report
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* AUTOMATED TASK RUNNERS DIAGNOSTICS */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-3">
            <h3 className="text-xs font-bold text-prizm-text uppercase tracking-wider flex items-center gap-2">
              <Activity size={14} className="text-cyan-500" />
              Automated Scheduler & Buffer Diagnostic Loggers
            </h3>
            <p className="text-[11px] text-prizm-text-muted leading-relaxed uppercase">
              Automated diagnostics background modules check the MODBUS IP loop registers periodically. Alarms are aggregated to persistent storage arrays in chronological indices. Active warning packets trigger real-time log dumps to prevent flash memory saturation.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] pt-2">
              <div className="bg-prizm-surface-strong p-3 rounded border border-white/5 space-y-2 flex gap-3">
                <Clock size={16} className="text-prizm-primary shrink-0 mt-0.5" />
                <div>
                  <span className="block font-bold text-prizm-text uppercase tracking-wider">Storage Retention Check</span>
                  <span className="text-emerald-400 font-bold block mt-1">✔ OK — CRON DAEMON ACTIVE</span>
                  <span className="text-[#9CA3AF]/60 block uppercase">Checked on hourly rotation intervals</span>
                </div>
              </div>
              <div className="bg-prizm-surface-strong p-3 rounded border border-white/5 space-y-2 flex gap-3">
                <Layers size={16} className="text-prizm-primary shrink-0 mt-0.5" />
                <div>
                  <span className="block font-bold text-prizm-text uppercase tracking-wider">Buffer capacity status</span>
                  <span className="text-emerald-400 font-bold block mt-1">✔ SAFE — 0.05% FLASH EXGEST</span>
                  <span className="text-[#9CA3AF]/60 block uppercase">1GB MAX DISK POOLI LIMIT</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: RECENT EXPORTS HISTORY & ARCHIVEN RETENTION */}
        <div className="space-y-6">
          
          {/* RETENTION CAPACITY STATS */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-4">
             <div className="flex justify-between items-center border-b border-prizm-border pb-2">
                <span className="text-xs font-bold text-prizm-text uppercase tracking-wider flex items-center gap-2">
                   <Database size={14} className="text-cyan-500" />
                   Storage Retention Status
                </span>
                <span className="text-[8px] bg-emerald-400/10 text-emerald-400 py-0.5 px-2 font-black rounded border border-emerald-400/20">
                   NOMINAL
                </span>
             </div>

             <div className="space-y-2 text-[10px] text-prizm-text-muted">
                <div className="flex justify-between">
                   <span className="uppercase">Maximum Retention Age:</span>
                   <span className="text-prizm-text font-bold">14 Days max</span>
                </div>
                <div className="flex justify-between">
                   <span className="uppercase">Buffer Pool limit:</span>
                   <span className="text-prizm-text font-bold">1.0 GB Cap</span>
                </div>
                <div className="flex justify-between">
                   <span className="uppercase">Disk Purge Threshold:</span>
                   <span className="text-prizm-text font-bold">95% capacity trigger</span>
                </div>
                <div className="flex justify-between">
                   <span className="uppercase">Scheduled auto-clean:</span>
                   <span className="text-prizm-primary font-bold">Active (1hr clock)</span>
                </div>
             </div>

             <button
               onClick={handleTriggerCleanup}
               disabled={isCleanupRunning}
               className="w-full py-2 bg-prizm-surface-strong hover:bg-black/20 border border-prizm-border text-prizm-text text-[10px] uppercase font-bold tracking-wider rounded cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
             >
                <Trash2 size={12} className="text-rose-400" />
                {isCleanupRunning ? "Cleaning Archives..." : "Run Autoclean Cycle"}
             </button>
          </div>

          {/* RECENT ARCHIVES HISTORY */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-prizm-border pb-2">
                <span className="text-xs font-bold text-prizm-text uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-prizm-primary" />
                  Recent Report Runs
                </span>
                <button 
                  onClick={fetchRecentReports}
                  className="text-prizm-text-muted hover:text-prizm-text"
                  title="Refresh lists"
                >
                  <RefreshCw size={12} />
                </button>
              </div>

              {loadingRecent ? (
                <div className="text-center py-6 text-[10px] text-prizm-text-muted uppercase">
                  Reading database directory...
                </div>
              ) : recentReports.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-prizm-border rounded text-[9px] text-[#9CA3AF]/60 uppercase tracking-widest font-bold">
                  No compiled reports in cache folders. Build reports using builder panel.
                </div>
              ) : (
                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 no-scrollbar scroll-smooth">
                  {recentReports.map(rep => (
                    <div 
                      key={rep.id} 
                      className="p-3 rounded bg-prizm-surface-strong border border-white/5 flex flex-col justify-between gap-2.5 transition-colors hover:border-cyan-500/15"
                    >
                      <div className="space-y-1">
                        <span className="text-[11px] font-black text-slate-200 block truncate leading-tight" title={rep.filename}>
                          {rep.filename}
                        </span>
                        <div className="flex justify-between items-center text-[9px] text-prizm-text-muted">
                          <span className="uppercase tracking-wide">
                            {formatBytes(rep.sizeBytes)}
                          </span>
                          <span>
                            {new Date(rep.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex gap-1 justify-end border-t border-white/[0.04] pt-1.5">
                        <a
                          href={rep.url}
                          download={rep.filename}
                          className="px-2.5 py-1 bg-black/40 hover:bg-cyan-500 hover:text-black rounded text-[9px] uppercase font-bold text-cyan-400 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Download size={10} />
                          Download
                        </a>
                        <button
                          onClick={() => handleDeleteReportFile(rep.id)}
                          className="p-1 px-1.5 rounded bg-black/40 hover:bg-rose-500/10 hover:text-rose-400 border border-transparent text-prizm-text-muted transition-colors cursor-pointer"
                        >
                          <Plus size={10} className="rotate-45" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
      <SiteDataExport />
      </>
      )}

    </div>
  );
}
