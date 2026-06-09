import React, { useState, useEffect } from "react";
import { 
  Activity, 
  Cpu, 
  FileText, 
  ShieldAlert, 
  Zap, 
  RefreshCw, 
  Clock, 
  CheckCircle,
  Network,
  Terminal,
  Sliders
} from "lucide-react";
import Dashboard from "./components/Dashboard";
import DevicesManager from "./components/DevicesManager";
import Reporting from "./components/Reporting";
import SmartDiagnostics from "./components/SmartDiagnostics";
import TerminalToolbox from "./components/TerminalToolbox";
import ToolDashboards from "./components/ToolDashboards";
import { GreEnergyLogo } from "./components/GreEnergyLogo";
import { BessDevice, BessLog, ReportConfig } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "devices" | "reports" | "diagnose" | "terminal" | "tool-dashboards">("dashboard");
  const [devices, setDevices] = useState<BessDevice[]>([]);
  const [logs, setLogs] = useState<BessLog[]>([]);
  const [reports, setReports] = useState<ReportConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeviceForDiagnose, setSelectedDeviceForDiagnose] = useState<BessDevice | null>(null);

  // Dynamic system clock matching timezone metadata
  const [currentTime, setCurrentTime] = useState(new Date("2026-05-29T14:19:25Z"));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(prev => new Date(prev.getTime() + 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch full telemetry, reports & alerts
  const fetchAllData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [devRes, logRes, repRes] = await Promise.all([
        fetch("/api/devices").catch(err => {
          console.log("[App Telemetry Info] Devices endpoint standby:", err);
          return null;
        }),
        fetch("/api/logs").catch(err => {
          console.log("[App Telemetry Info] Logs endpoint standby:", err);
          return null;
        }),
        fetch("/api/reports").catch(err => {
          console.log("[App Telemetry Info] Reports endpoint standby:", err);
          return null;
        })
      ]);

      if (devRes && devRes.ok) {
        const devs = await devRes.json().catch(() => null);
        if (devs) setDevices(devs);
      }
      if (logRes && logRes.ok) {
        const lg = await logRes.json().catch(() => null);
        if (lg) setLogs(lg);
      }
      if (repRes && repRes.ok) {
        const rep = await repRes.json().catch(() => null);
        if (rep) setReports(rep);
      }
    } catch (err) {
      console.log("[App Telemetry Info] Telemetry gateway offline standby:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Immediate fetch + active 3-seconds interval polling to synchronize state
  useEffect(() => {
    fetchAllData();
    const poll = setInterval(() => {
      fetchAllData(true);
    }, 3000);
    return () => clearInterval(poll);
  }, []);

  // Dispatch direct BESS command values (Charge limit kW, discharge limit, bypass, reset)
  const handleTriggerControl = async (id: string, command: "charge" | "discharge" | "idle" | "reset_fault" | "shutdown", value?: number) => {
    try {
      const res = await fetch(`/api/devices/${id}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, value })
      });
      const data = await res.json();
      if (data.success) {
        // Optimistic local update
        setDevices(prev => prev.map(d => d.id === id ? { ...d, ...data.updatedDevice } : d));
        // Fetch new log entries immediately
        const logRes = await fetch("/api/logs");
        const lg = await logRes.json();
        setLogs(lg);
      }
    } catch (err) {
      console.error("Direct control command transmission failed:", err);
    }
  };

  // Add BESS node manual connection
  const handleAddDevice = async (devData: any) => {
    const res = await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(devData)
    });
    if (!res.ok) throw new Error("Could not add device specifications.");
    const newDev = await res.json();
    setDevices(prev => [...prev, newDev]);
    fetchAllData(true);
  };

  // Edit BESS registration details
  const handleEditDevice = async (id: string, devData: any) => {
    const res = await fetch(`/api/devices/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(devData)
    });
    if (!res.ok) throw new Error("Could not modify device registers.");
    const updated = await res.json();
    setDevices(prev => prev.map(d => d.id === id ? updated : d));
    fetchAllData(true);
  };

  // Delete/deregister BESS node
  const handleDeleteDevice = async (id: string) => {
    const res = await fetch(`/api/devices/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDevices(prev => prev.filter(d => d.id !== id));
      fetchAllData(true);
    }
  };

  // Add automated reporting config
  const handleAddReport = async (repData: any) => {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(repData)
    });
    if (!res.ok) throw new Error("Failed to register schedule config.");
    const newRep = await res.json();
    setReports(prev => [...prev, newRep]);
    fetchAllData(true);
  };

  // Delete report config
  const handleDeleteReport = async (id: string) => {
    const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
    if (res.ok) {
      setReports(prev => prev.filter(r => r.id !== id));
      fetchAllData(true);
    }
  };

  // Clear log history archive
  const handleClearLogs = async () => {
    await fetch("/api/logs", { method: "DELETE" });
    setLogs([]);
  };

  // Select card link handler from Dashboard
  const handleSelectDeviceFromGrid = (device: BessDevice) => {
    setSelectedDeviceForDiagnose(device);
    setActiveTab("diagnose");
  };

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-[#D1D5DB] font-sans flex flex-col">
      
      {/* TOP NAVIGATION BAR (HIGH DENSITY DESIGN THEME) */}
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 sm:px-6 bg-[#12141C] sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <GreEnergyLogo className="w-6 h-6" strokeWidth={10} />
            <span className="font-mono font-bold tracking-tighter text-white text-base sm:text-lg">
              <span className="text-[#5CF2A5]">GreEnergy</span> PRIZM
            </span>
          </div>
          <div className="h-4 w-[1px] bg-white/10 mx-1 sm:mx-2"></div>
          <div className="hidden md:flex items-center gap-6 text-[11px] font-mono uppercase tracking-widest text-white/50">
            <span className="text-cyan-400 font-bold">● ACTIVE</span>
            <span>NODE: 192.168.1.1</span>
            <span>GATEWAY: ON</span>
            <span className="text-emerald-400">{devices.filter(d => d.isOnline).length} / {devices.length} NODES LOGGED</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {devices.filter(d => d.status === "Faulted").length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 rounded">
              <span className="text-rose-400 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                {devices.filter(d => d.status === "Faulted").length} RACK ALERTS
              </span>
            </div>
          )}
          <div className="text-right">
            <div className="text-[11px] text-white/80 font-mono">
              {currentTime.toISOString().replace('T', ' ').slice(0, 19)} UTC
            </div>
          </div>
        </div>
      </header>

      {/* DASHBOARD CONTROL NAVIGATION TOOLBAR LINE */}
      <section className="bg-[#0F1117] border-b border-white/15 z-40 sticky top-14 transition-all shrink-0">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between overflow-x-auto no-scrollbar scroll-smooth">
            
            {/* Tabs control styled beautifully to resemble sidebar list of Design HTML */}
            <div className="flex space-x-1 py-1">
              <button
                onClick={() => {
                  setActiveTab("dashboard");
                  setSelectedDeviceForDiagnose(null);
                }}
                className={`flex items-center gap-2 px-3.5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${
                  activeTab === "dashboard"
                    ? "bg-cyan-500/10 border-b-2 border-cyan-500 text-cyan-400"
                    : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
              >
                <Activity size={12} className="text-cyan-400" />
                DASHBOARD
              </button>

              <button
                onClick={() => {
                  setActiveTab("diagnose");
                }}
                className={`flex items-center gap-2 px-3.5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${
                  activeTab === "diagnose"
                    ? "bg-[#22d3ee]/10 border-b-2 border-cyan-500 text-cyan-400"
                    : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
              >
                <ShieldAlert size={12} className="text-indigo-400" />
                CLI LOGS & AI AUDIT
              </button>

              <button
                onClick={() => {
                  setActiveTab("devices");
                  setSelectedDeviceForDiagnose(null);
                }}
                className={`flex items-center gap-2 px-3.5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${
                  activeTab === "devices"
                    ? "bg-cyan-500/10 border-b-2 border-cyan-500 text-cyan-400"
                    : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
              >
                <Cpu size={12} className="text-amber-400" />
                DEVICE MATRIX
              </button>

              <button
                onClick={() => {
                  setActiveTab("reports");
                  setSelectedDeviceForDiagnose(null);
                }}
                className={`flex items-center gap-2 px-3.5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${
                  activeTab === "reports"
                    ? "bg-cyan-500/10 border-b-2 border-cyan-500 text-cyan-400"
                    : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
              >
                <FileText size={12} className="text-emerald-400" />
                AUTOMATION REPORTING
              </button>

              <button
                onClick={() => {
                  setActiveTab("terminal");
                  setSelectedDeviceForDiagnose(null);
                }}
                className={`flex items-center gap-2 px-3.5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${
                  activeTab === "terminal"
                    ? "bg-cyan-500/10 border-b-2 border-cyan-500 text-cyan-400"
                    : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
              >
                <Sliders size={12} className="text-cyan-400" />
                EMS CONTROL CENTER
              </button>

              <button
                onClick={() => {
                  setActiveTab("tool-dashboards");
                  setSelectedDeviceForDiagnose(null);
                }}
                className={`flex items-center gap-2 px-3.5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${
                  activeTab === "tool-dashboards"
                    ? "bg-cyan-500/10 border-b-2 border-cyan-500 text-cyan-400"
                    : "text-white/40 hover:text-white hover:bg-white/5"
                }`}
              >
                <Sliders size={12} className="text-[#5CF2A5]" />
                TOOL DASHBOARDS
              </button>
            </div>

            {/* Quick inline online node counts indicator */}
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-white/40">
              <span>SYNC HEARTBEAT:</span>
              <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 bg-cyan-400 rounded-full animate-ping"></span>
                POLLING ACTIVE
              </span>
            </div>

          </div>
        </div>
      </section>

      {/* CORE WORKSPACE CONSOLE WINDOW */}
      <main className="flex-1 p-4 sm:p-6 bg-[#0A0B0E] w-full px-4 sm:px-6 lg:px-8">
        {loading ? (
          <div className="h-[400px] flex flex-col items-center justify-center space-y-4 border border-white/5 bg-[#12141C] rounded-lg">
            <RefreshCw className="animate-spin text-cyan-400" size={32} />
            <div className="text-center font-mono">
              <span className="text-xs text-white font-bold block">INITIALIZING PRIZM...</span>
              <p className="text-[11px] text-white/40 mt-1">Gathering site telemetry & preparing diagnostic view</p>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in duration-300">
            {activeTab === "dashboard" && (
              <Dashboard 
                devices={devices} 
                onTriggerControl={handleTriggerControl}
                onSelectDevice={handleSelectDeviceFromGrid}
              />
            )}

            {activeTab === "devices" && (
              <DevicesManager 
                devices={devices} 
                onAddDevice={handleAddDevice}
                onEditDevice={handleEditDevice}
                onDeleteDevice={handleDeleteDevice}
              />
            )}

            {activeTab === "reports" && (
              <Reporting 
                devices={devices}
                reports={reports}
                onAddReport={handleAddReport}
                onDeleteReport={handleDeleteReport}
              />
            )}

            {activeTab === "diagnose" && (
              <SmartDiagnostics 
                devices={devices}
                logs={logs}
                onClearLogs={handleClearLogs}
                selectedDeviceFromDashboard={selectedDeviceForDiagnose}
              />
            )}

            {activeTab === "terminal" && (
              <TerminalToolbox devices={devices} />
            )}

            {activeTab === "tool-dashboards" && (
              <ToolDashboards />
            )}
          </div>
        )}
      </main>

      {/* FOOTER STATUS LINE (HIGH DENSITY HIGH FIDELITY DESIGN) */}
      <footer className="h-8 bg-black border-t border-white/5 px-4 sm:px-6 flex items-center justify-between text-[9px] font-mono tracking-widest text-[#D1D5DB]/40 uppercase shrink-0">
        <div className="flex gap-4 sm:gap-8 items-center">
          <span className="text-[#5CF2A5] font-bold">GreEnergy Prizm</span>
          <span className="text-cyan-500 font-bold hidden sm:inline">● SYSTEM NORMAL</span>
          <span className="hidden md:inline">PLC LINK: SECURE_OK</span>
          <span className="hidden lg:inline">GATEWAYS: 12/12 CHANNELS OPEN</span>
        </div>
        <div className="flex gap-4">
          <span>VER: 4.2.0-STABLE</span>
          <span className="text-[#D1D5DB]/60">USER: JOHN_WILSON</span>
        </div>
      </footer>

    </div>
  );
}
