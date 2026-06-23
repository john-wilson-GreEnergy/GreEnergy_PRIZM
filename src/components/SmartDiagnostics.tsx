import React, { useState, useEffect } from "react";
import { 
  AlertOctagon, 
  Sparkles, 
  Terminal, 
  Cpu, 
  CheckCircle, 
  Flame, 
  AlertTriangle, 
  RefreshCcw, 
  ShieldAlert, 
  Copy, 
  HelpCircle,
  TrendingDown
} from "lucide-react";
import { BessDevice, BessLog, SmartDiagnosticResponse } from "../types";
import { formatTemperatureF } from "../utils/temperatureScale";

interface SmartDiagnosticsProps {
  devices: BessDevice[];
  logs: BessLog[];
  onClearLogs: () => void;
  selectedDeviceFromDashboard: BessDevice | null;
}

export default function SmartDiagnostics({ devices, logs, onClearLogs, selectedDeviceFromDashboard }: SmartDiagnosticsProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<SmartDiagnosticResponse | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Sync selection if technician clicked a specific module on the Dashboard grid!
  useEffect(() => {
    if (selectedDeviceFromDashboard) {
      setSelectedDeviceId(selectedDeviceFromDashboard.id);
      // Auto-trigger diagnostics
      handleRunDiagnostics(selectedDeviceFromDashboard.id);
    } else if (devices.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(devices[0].id);
    }
  }, [selectedDeviceFromDashboard, devices]);

  const activeDevice = devices.find(d => d.id === selectedDeviceId);

  const handleRunDiagnostics = async (deviceId: string) => {
    if (!deviceId) return;
    setIsDiagnosing(true);
    setDiagnosticResult(null);
    try {
      const res = await fetch(`/api/devices/${deviceId}/diagnose`, { method: "POST" });
      const data = await res.json();
      setDiagnosticResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleCopyCommand = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  // Filter logs representing warnings or errors to highlight parsed exceptions
  const alertLogs = logs.filter(l => l.level === "WARNING" || l.level === "ERROR" || l.level === "CRITICAL");

  return (
    <div className="space-y-6">
      
      {/* Upper header */}
      <div className="bg-[#12141C] border border-white/5 rounded-lg p-5 font-mono">
        <h2 className="text-sm font-mono font-bold uppercase tracking-[0.2em] text-white">Parsed Error Summaries & Gemini Log Auditor</h2>
        <p className="text-[11px] text-[#D1D5DB]/40 font-mono mt-1">
          Real-time error notifications parsed directly from device registers. Run Gemini LLM analysis to examine balance deviations on pack cells.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT COLUMN: LIVE ERROR SUMMARIES & ACTIVE NOTIFICATIONS */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-[#12141C] border border-white/5 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-white/80 flex items-center gap-1.5">
                <ShieldAlert size={14} className="text-rose-400" />
                Active Alerts ({alertLogs.length})
              </h3>
              {alertLogs.length > 0 && (
                <button 
                  onClick={onClearLogs}
                  className="text-[10px] font-mono text-white/40 hover:text-white uppercase font-bold cursor-pointer"
                >
                  Clear Feed
                </button>
              )}
            </div>

            {alertLogs.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-white/5 rounded text-[10px] uppercase font-mono tracking-wider text-white/30">
                <CheckCircle size={20} className="mx-auto mb-2 text-emerald-500/60" />
                No active alarms parsed.
              </div>
            ) : (
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 no-scrollbar">
                {alertLogs.map((log) => (
                  <div 
                    key={log.id} 
                    className={`p-3 rounded border text-[11px] font-mono leading-relaxed space-y-1.5 transition-colors ${
                      log.level === "CRITICAL" ? "bg-rose-500/10 border-rose-500/20 text-rose-300" :
                      log.level === "ERROR" ? "bg-red-500/10 border-red-500/20 text-red-300" :
                      "bg-amber-500/5 border-amber-500/15 text-amber-300"
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-white/5 pb-1">
                      <span className="font-bold flex items-center gap-1">
                        <AlertOctagon size={11} className="animate-pulse" />
                        {log.level}
                      </span>
                      <span className="text-[9px] text-white/30">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <span className="block font-bold text-white/90">{log.deviceName}</span>
                    <p className="text-[10px] text-white/60 leading-normal">{log.message}</p>
                    <div className="text-[9px] text-white/30 flex justify-between">
                      <span>Code: {log.code}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick calibration status alerts panel */}
          <div className="bg-[#12141C] border border-white/5 rounded-lg p-5 text-[11px] font-mono text-white/50 space-y-3">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-white/80">LAN Connection Topology</span>
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span>BMS Modbus Router</span>
              <span className="text-emerald-400 font-semibold uppercase">ONLINE (100% up)</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span>ICMP Subnet Pings</span>
              <span className="text-emerald-400 font-semibold uppercase">4 Active Nodes</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Cell Delta Trip Limits</span>
              <span className="text-white/30 uppercase font-semibold">Max Delta &gt;500mV</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: AI LOG & TELEMETRY DIAGNOSTICS SCREEN */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#12141C] border border-white/5 rounded-lg p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3 border-b border-white/5 pb-4">
              <div>
                <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">Cell balancing & BMS Telemetry Auditor</h3>
                <p className="text-[10px] text-white/40 font-mono mt-1">Run specialized parser models (Gemini-3.5) on hardware registers</p>
              </div>

              {/* Selector */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedDeviceId}
                  onChange={e => {
                    setSelectedDeviceId(e.target.value);
                    setDiagnosticResult(null);
                  }}
                  className="bg-[#0F1117] border border-white/10 text-white text-xs font-mono px-2.5 py-1.5 rounded focus:outline-none focus:border-cyan-500"
                >
                  {devices.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.ipAddress})
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => handleRunDiagnostics(selectedDeviceId)}
                  disabled={isDiagnosing || !selectedDeviceId}
                  className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black hover:text-black rounded font-bold uppercase font-mono tracking-wider text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Sparkles size={12} />
                  {isDiagnosing ? "Analyzing Cell Stack..." : "Run AI Diagnostics"}
                </button>
              </div>
            </div>

            {activeDevice && (
              <div className="bg-[#161922] p-4 rounded border border-white/5 mb-6 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                  <div>
                    <span className="font-bold font-mono text-xs text-white leading-none">{activeDevice.name}</span>
                    <p className="text-[10px] font-mono text-white/40 mt-1">Node model type: {activeDevice.model}</p>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-mono text-white/60">
                    <div>
                      <span className="text-white/30 block text-[9px] uppercase">SOC</span>
                      <span className="text-white font-bold">{activeDevice.soc}%</span>
                    </div>
                    <div>
                      <span className="text-white/30 block text-[9px] uppercase">SOH</span>
                      <span className="text-white font-bold">{activeDevice.soh}%</span>
                    </div>
                    <div>
                      <span className="text-white/30 block text-[9px] uppercase">Temp</span>
                      <span className={`font-bold ${activeDevice.temperature > 45 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {formatTemperatureF(activeDevice.temperature, { decimals: 1, showUnit: true, sourceUnit: "C" })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 16 cell string voltages visualizer */}
                <div>
                  <span className="block text-[9px] font-mono text-white/40 uppercase mb-2 font-bold tracking-wider">
                    16 Series Individual Cell Voltages String View (Register indices 40200-40215)
                  </span>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                    {activeDevice.cellVoltages.map((volts, idx) => {
                      // Highlight high cell voltages (overpressure charging or chemical runaway spike)
                      const isSpiked = volts > 3.39;
                      const isSagged = volts < 3.10;
                      return (
                        <div 
                          key={idx} 
                          className={`p-1.5 rounded text-center border text-[10px] font-mono ${
                            isSpiked ? "bg-rose-500/15 border-rose-500/30 text-rose-300 font-bold animate-pulse" :
                            isSagged ? "bg-amber-500/5 border-amber-500/20 text-amber-300" :
                            "bg-[#0F1117] border-white/5 text-white/60"
                          }`}
                          title={`Cell #${idx + 1}`}
                        >
                          <span className="block text-[8px] text-white/35 font-bold uppercase">C#{idx + 1}</span>
                          <span>{volts} V</span>
                        </div>
                      );
                    })}
                  </div>
                  {activeDevice.id === "bess-03" && (
                    <span className="block text-[10px] text-rose-400 font-mono mt-2 uppercase font-semibold">
                      Warning: Voltage mismatch of 430mV identified between C#14 (3.51V) and C#13 (3.08V).
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* AI DIAGNOSTICS REPORT WRAPPER */}
            {isDiagnosing && (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <RefreshCcw className="animate-spin text-cyan-400" size={24} />
                <div className="text-center font-mono">
                  <span className="block text-xs uppercase tracking-widest text-[#D1D5DB]/80 font-bold">Gemini BMS Analysis in progress...</span>
                  <p className="text-[10px] text-white/30 mt-1">Sieving 16 series Modbus registers and active event logs for cell stress metrics</p>
                </div>
              </div>
            )}

            {diagnosticResult && !isDiagnosing && (
              <div className="space-y-5 border-t border-white/5 pt-5 animate-fade-in font-mono">
                
                {/* Findings Banner Summary */}
                <div className="p-4 rounded bg-[#161922] border border-white/15">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="text-cyan-400 shrink-0" size={14} />
                    <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-widest">Expert BMS Audit Findings</span>
                    <span className={`ml-auto px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      diagnosticResult.severity === "Critical" ? "bg-rose-500/20 text-rose-300 border border-rose-500/20" :
                      diagnosticResult.severity === "High" ? "bg-orange-500/15 text-orange-400" :
                      "bg-emerald-500/15 text-emerald-400"
                    }`}>
                      {diagnosticResult.severity} Severity
                    </span>
                  </div>

                  <p className="text-[11px] text-white leading-relaxed font-semibold">
                    {diagnosticResult.summary}
                  </p>
                </div>

                {/* Estimate Core Cause */}
                <div className="space-y-1.5">
                  <span className="text-[9px] text-white/40 uppercase font-bold block tracking-wider">Estimated Root Cause</span>
                  <p className="text-[11px] text-slate-300 leading-relaxed bg-[#0F1117] p-4 rounded border border-white/10">
                    {diagnosticResult.rootCause}
                  </p>
                </div>

                {/* Physical Actionable Recommendations Checklist */}
                <div className="space-y-2">
                  <span className="text-[9px] text-white/40 uppercase font-bold block tracking-wider">Recommended Action Steps</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {diagnosticResult.recommendations.map((step, idx) => (
                      <div key={idx} className="bg-[#161922] border border-white/5 p-3 rounded flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-cyan-950 text-cyan-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <p className="text-[11px] text-slate-300 leading-normal py-0.5">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Direct Manual Diagnostics Command Overrides */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="text-cyan-400" size={13} />
                    <span className="text-[9px] text-white/40 uppercase font-bold block tracking-wider">Direct curl overrides (modbus registers writes)</span>
                  </div>
                  
                  <div className="space-y-3">
                    {diagnosticResult.suggestedCurlCmds.map((cmdRecord, idx) => (
                      <div key={idx} className="bg-[#161922] p-3.5 rounded border border-white/5 text-xs text-slate-300 space-y-1.5">
                        <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-1.5">
                          <span className="font-bold text-cyan-400 text-[10px] uppercase font-mono">{cmdRecord.title}</span>
                          <button 
                            onClick={() => handleCopyCommand(cmdRecord.cmd, idx)}
                            className="px-2 py-1 border border-white/10 hover:border-white/20 bg-[#0F1117] rounded text-white text-[9px] uppercase font-bold cursor-pointer transition-colors"
                          >
                            {copiedIndex === idx ? "Copied!" : "Copy Command"}
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400">{cmdRecord.desc}</p>
                        <div className="p-2 gap-1 rounded bg-[#0F1117] font-mono text-[9px] break-all select-all text-slate-300 border border-white/10">
                          {cmdRecord.cmd}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {!diagnosticResult && !isDiagnosing && (
              <div className="py-16 text-center border border-dashed border-white/5 rounded-lg space-y-2 text-white/30 flex flex-col items-center justify-center font-mono">
                <Sparkles size={20} className="text-cyan-500/20" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#D1D5DB]/50">Select a device and run AI diagnostics.</span>
                <p className="text-[10px] max-w-sm mt-1">
                  Gemini parses direct register cell indexes to identify thermal issues, voltage spikes, and suggests authentic cURL solutions.
                </p>
              </div>
            )}

          </div>
        </div>

      </div>

    </div>
  );
}
