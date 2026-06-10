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
  Sparkles
} from "lucide-react";
import { BessDevice, ReportConfig } from "../types";

interface ReportingProps {
  devices: BessDevice[];
  reports: ReportConfig[];
  onAddReport: (repData: any) => Promise<void>;
  onDeleteReport: (id: string) => Promise<void>;
}

export default function Reporting({ devices, reports, onAddReport, onDeleteReport }: ReportingProps) {
  // Creating schedule state
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');
  const [format, setFormat] = useState<'JSON' | 'CSV'>('CSV');
  const [recipient, setRecipient] = useState("");
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["soc", "temperature", "power"]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const metricsAvailable = [
    { key: "soc", label: "State of Charge (%)" },
    { key: "temperature", label: "Core Temperature (°C)" },
    { key: "power", label: "Active Power Flow (kW)" },
    { key: "voltage", label: "Module Voltage (V)" },
    { key: "current", label: "Current (A)" },
    { key: "soh", label: "State of Health (SoH)" },
    { key: "cycleCount", label: "Charge Cycle Rates" },
    { key: "cellVoltages", label: "Individual Cell Imbalances" }
  ];

  // Quick export state
  const [quickFormat, setQuickFormat] = useState<'JSON' | 'CSV'>('CSV');
  const [exportLoading, setExportLoading] = useState(false);

  // Toggle device selection helper
  const handleToggleDevice = (id: string) => {
    setSelectedDevices(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Toggle metric selection helper
  const handleToggleMetric = (key: string) => {
    setSelectedMetrics(prev =>
      prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]
    );
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !recipient) {
      setErrMsg("Please provide schedule name and developer/operator recipient.");
      return;
    }
    if (selectedDevices.length === 0) {
      setErrMsg("Please select at least one BESS module to compile.");
      return;
    }

    setLoading(true);
    setErrMsg("");
    try {
      await onAddReport({
        name,
        frequency,
        format,
        recipients: [recipient],
        selectedDevices,
        includeMetrics: selectedMetrics
      });
      // reset
      setName("");
      setRecipient("");
      setSelectedDevices([]);
    } catch (err) {
      console.error(err);
      setErrMsg("Failed to persist report.");
    } finally {
      setLoading(false);
    }
  };

  // TRIGGER REAL LIVE DOWNLOAD (Generates actual file return from express in real-time!)
  const handleTriggerExport = async (configId?: string, forceFormat?: 'JSON' | 'CSV') => {
    setExportLoading(true);
    const selectedFmt = forceFormat || quickFormat;
    try {
      const response = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configId,
          selectedFormat: selectedFmt
        })
      });

      if (!response.ok) throw new Error("Could not construct report export.");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `BESS_LAN_Report_${Date.now()}.${selectedFmt.toLowerCase()}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err) {
      console.error(err);
      alert("Export failed.");
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Overview Intro banner */}
      <div className="bg-prizm-surface border border-prizm-border p-5 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono">
        <div>
          <h2 className="text-sm font-mono font-bold uppercase tracking-[0.2em] text-prizm-text">Automated Telemetry Reporting System</h2>
          <p className="text-[11px] text-[#D1D5DB]/40 font-mono mt-1">
            Configure periodic modbus scans, email log aggregates, and generate raw CSV/JSON spreadsheet alignments.
          </p>
        </div>
        
        {/* Quick export module */}
        <div className="flex items-center gap-2 bg-prizm-surface-strong p-2 rounded border border-prizm-border shrink-0">
          <select 
            value={quickFormat}
            onChange={e => setQuickFormat(e.target.value as any)}
            className="text-[10px] uppercase font-bold tracking-wider bg-transparent border-none text-prizm-text focus:outline-none"
          >
            <option value="CSV">Slicing CSV</option>
            <option value="JSON">Structure JSON</option>
          </select>
          <button 
            onClick={() => handleTriggerExport(undefined, quickFormat)}
            disabled={exportLoading}
            className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black hover:text-black font-mono text-[10px] font-bold uppercase tracking-wider rounded flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download size={11} />
            {exportLoading ? "Compiling..." : "Export Fleet"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: ACTIVE SCHEDULES & LOG LIST */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 mb-4 flex items-center gap-2">
              <Calendar size={14} className="text-cyan-400" />
              Active System Automated Scheduling Profiles ({reports.length})
            </h3>

            {reports.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-prizm-border rounded text-[10px] text-prizm-text-muted uppercase tracking-widest font-mono">
                No automatic task schedules configured. Build one using the panel generator.
              </div>
            ) : (
              <div className="space-y-3 font-mono">
                {reports.map((rep) => (
                  <div key={rep.id} className="bg-prizm-surface-strong border border-prizm-border p-4 rounded flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 transition-colors hover:border-prizm-border">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-200 text-xs">{rep.name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono font-bold text-[9px] uppercase tracking-wide">
                          {rep.frequency}
                        </span>
                      </div>
                      
                      {/* Sub details */}
                      <div className="text-[10px] text-prizm-text-muted flex items-center flex-wrap gap-x-2 gap-y-1">
                        <Mail size={10} className="text-white/20" />
                        <span className="text-prizm-text-muted font-semibold truncate max-w-[200px]">{rep.recipients.join(", ")}</span>
                        <span>•</span>
                        <span>{rep.selectedDevices.length} sub-units</span>
                        <span>•</span>
                        <span className="text-prizm-text-muted uppercase">Format: {rep.format}</span>
                      </div>

                      <div className="pt-2 flex flex-wrap gap-1">
                        {rep.includeMetrics.map((met) => (
                          <span key={met} className="px-1.5 py-0.5 rounded bg-prizm-surface-strong text-prizm-text-muted text-[9px] border border-prizm-border font-semibold">
                            {met}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Operational download shortcut triggers */}
                    <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-prizm-border justify-end">
                      <button 
                        onClick={() => handleTriggerExport(rep.id, rep.format)}
                        className="px-2.5 py-1.5 text-[10px] font-bold uppercase transition-all bg-prizm-surface-strong border border-prizm-border hover:border-prizm-border rounded text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 cursor-pointer"
                        title="Force schedule dispatch export"
                      >
                        <Download size={11} />
                        Run
                      </button>
                      <button 
                        onClick={() => onDeleteReport(rep.id)}
                        className="p-1.5 rounded text-prizm-text-muted border border-prizm-border hover:border-rose-500/20 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                        title="Delete scheduling"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Simulated task diagnostics parameters */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5">
            <h3 className="font-mono text-[11.5px] font-bold uppercase tracking-[0.2em] text-prizm-text mb-2 flex items-center gap-1.5">
              <Activity size={14} className="text-cyan-400" />
              Gateway Modbus Auto-Scanner Telemetry Loggers
            </h3>
            <p className="text-[11px] text-prizm-text-muted font-mono leading-relaxed">
              Every hour on the hour, the system automatically runs network polling diagnostics using pre-configured target Modbus coils. Data variables (State of Charge, Temperatures, Cell delta spikes) are structured locally and formatted for download. Automated backups prevent local data loss if power isolates.
            </p>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
              <div className="bg-prizm-surface-strong p-3.5 rounded border border-prizm-border flex gap-3">
                <Clock className="text-cyan-400 mt-1 shrink-0" size={15} />
                <div>
                  <span className="block text-xs font-bold text-prizm-text uppercase tracking-wider">Last System Polling</span>
                  <p className="text-[10px] text-prizm-text-muted mt-1 font-semibold">Success: 192.168.1.101, .102, .104</p>
                  <p className="text-[10px] text-rose-400 font-semibold">Bypassed/Soft faulted: 192.168.1.103</p>
                </div>
              </div>
              <div className="bg-prizm-surface-strong p-3.5 rounded border border-prizm-border flex gap-3">
                <FileSpreadsheet className="text-cyan-400 mt-1 shrink-0" size={15} />
                <div>
                  <span className="block text-xs font-bold text-prizm-text uppercase tracking-wider">Local Integrity Backup</span>
                  <p className="text-[10px] text-prizm-text-muted mt-1 font-semibold">Size limits: 14.5 MB accumulated</p>
                  <p className="text-[10px] text-emerald-400 font-semibold uppercase">Status: OK (Encryption active)</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: REPORT GENERATION FORM CARD */}
        <div>
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 sticky top-4 font-mono">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-prizm-text mb-4 flex items-center gap-1.5">
              <Plus size={14} className="text-cyan-400" />
              Create Automation Profile
            </h3>

            <form onSubmit={handleCreateSchedule} className="space-y-4">
              <div>
                <label className="block text-[10px] text-prizm-text-muted uppercase">Profile Label *</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Weekly Feeder Integrity"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="mt-1.5 w-full text-xs font-mono rounded bg-prizm-surface-strong border border-prizm-border px-3 py-2 text-prizm-text placeholder-white/10 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-prizm-text-muted uppercase">Interval Period</label>
                  <select 
                    value={frequency}
                    onChange={e => setFrequency(e.target.value as any)}
                    className="mt-1.5 w-full text-xs font-mono rounded bg-prizm-surface-strong border border-prizm-border px-2 py-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Daily">Daily Map</option>
                    <option value="Weekly">Weekly Digest</option>
                    <option value="Monthly">Monthly Rollup</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-prizm-text-muted uppercase">Export Format</label>
                  <select 
                    value={format}
                    onChange={e => setFormat(e.target.value as any)}
                    className="mt-1.5 w-full text-xs font-mono rounded bg-prizm-surface-strong border border-prizm-border px-2 py-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                  >
                    <option value="CSV">CSV Spreadsheet</option>
                    <option value="JSON">Raw JSON Dump</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-prizm-text-muted uppercase">Recipient Email *</label>
                <input 
                  type="email"
                  required
                  placeholder="e.g. operators@site.com"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  className="mt-1.5 w-full text-xs font-mono rounded bg-prizm-surface-strong border border-prizm-border px-3 py-2 text-prizm-text placeholder-white/10 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Selection list: Devices to scope */}
              <div>
                <span className="block text-[10px] text-prizm-text-muted uppercase mb-2">Scope Target Devices</span>
                <div className="space-y-1.5 max-h-[110px] overflow-y-auto bg-prizm-surface-strong p-2.5 rounded border border-prizm-border no-scrollbar">
                  {devices.map(dev => {
                    const isSelected = selectedDevices.includes(dev.id);
                    return (
                      <div 
                        key={dev.id}
                        onClick={() => handleToggleDevice(dev.id)}
                        className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors text-xs font-semibold select-none ${isSelected ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-prizm-text-muted hover:text-prizm-text hover:bg-white/5 border border-transparent'}`}
                      >
                        <span>{dev.name}</span>
                        {isSelected && <Check size={11} />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selection list: Metrics to compile */}
              <div>
                <span className="block text-[10px] text-prizm-text-muted uppercase mb-2">Include Metrics</span>
                <div className="grid grid-cols-1 gap-1">
                  {metricsAvailable.map(met => {
                    const isSelected = selectedMetrics.includes(met.key);
                    return (
                      <div 
                        key={met.key}
                        onClick={() => handleToggleMetric(met.key)}
                        className={`flex items-center justify-between p-1.5 text-xs rounded cursor-pointer select-none border transition-colors ${isSelected ? 'bg-cyan-500/5 border-cyan-500/20 text-cyan-400' : 'bg-transparent border-prizm-border text-prizm-text-muted hover:text-white'}`}
                      >
                        <span className="font-bold uppercase text-[9px] tracking-wide">{met.label}</span>
                        {isSelected && <Check size={11} />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {errMsg && (
                <p className="text-rose-400 text-xs font-semibold bg-rose-500/10 p-2 rounded border border-rose-500/25">
                  {errMsg}
                </p>
              )}

              <button 
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold font-mono text-xs uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles size={12} />
                {loading ? "Persisting Schedule..." : "Activate automated schedule"}
              </button>
            </form>
          </div>
        </div>

      </div>

    </div>
  );
}
