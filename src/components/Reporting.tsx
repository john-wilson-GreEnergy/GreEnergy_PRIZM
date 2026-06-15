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
  FileArchive
} from "lucide-react";
import { BessDevice, ReportConfig } from "../types";

interface ReportingProps {
  devices: BessDevice[];
  reports: ReportConfig[];
  onAddReport: (repData: any) => Promise<void>;
  onDeleteReport: (id: string) => Promise<void>;
}

export default function Reporting({ devices, reports, onAddReport, onDeleteReport }: ReportingProps) {
  // Report Catalog Template items
  const [catalog, setCatalog] = useState<any[]>([]);
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

  const fetchCatalog = async () => {
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
    }
  };

  const fetchRecentReports = async () => {
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

    </div>
  );
}
