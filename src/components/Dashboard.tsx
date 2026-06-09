import React, { useState, useEffect } from "react";
import { 
  Battery, 
  Activity, 
  Lightbulb, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Zap, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight,
  ShieldCheck,
  Cpu
} from "lucide-react";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  LineChart, 
  Line, 
  Legend 
} from "recharts";
import { BessDevice } from "../types";
import KoboldMonitor from "./KoboldMonitor";

interface DashboardProps {
  devices: BessDevice[];
  onTriggerControl: (id: string, command: "charge" | "discharge" | "idle" | "reset_fault" | "shutdown", value?: number) => void;
  onSelectDevice: (device: BessDevice) => void;
}

export default function Dashboard({ devices, onTriggerControl, onSelectDevice }: DashboardProps) {
  const [viewMode, setViewMode] = useState<"kobold" | "legacy">("kobold");
  const [historyData, setHistoryData] = useState<any[]>([]);

  useEffect(() => {
    // Only accumulate history data from live polling, not mock data.
    setHistoryData([]);
  }, []);

  // Update chart when devices change
  useEffect(() => {
    if (devices.length === 0) return;
    const timer = setTimeout(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const totalPower = devices.reduce((sum, d) => sum + (d.isOnline ? d.power : 0), 0);
      const avgSoc = parseFloat((devices.reduce((sum, d) => sum + (d.isOnline ? d.soc : 0), 0) / devices.length).toFixed(1));

      setHistoryData(prev => {
        const updated = [...prev, {
          time: timeStr,
          "Net Charge (kW)": totalPower,
          "Avg SoC (%)": avgSoc
        }];
        if (updated.length > 20) updated.shift();
        return updated;
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [devices]);

  // Aggregate stats
  const onlineCount = devices.filter(d => d.isOnline).length;
  const totalCapacity = devices.reduce((sum, d) => sum + d.capacityKwh, 0);
  const totalPower = devices.reduce((sum, d) => sum + d.power, 0); 
  const faultedCount = devices.filter(d => d.status === "Faulted").length;
  const maintenanceCount = devices.filter(d => d.status === "Maintenance").length;

  const avgSocSum = devices.reduce((sum, d) => sum + d.soc, 0);
  const avgSoc = devices.length ? parseFloat((avgSocSum / devices.length).toFixed(1)) : 0;

  return (
    <div className="space-y-6">
      {/* View Switcher Controls Header */}
      <div className="flex justify-between items-center bg-[#11131C] border border-white/5 p-3 rounded-lg flex-wrap gap-2">
        <div>
          <span className="text-[10px] font-mono text-cyan-400 font-bold block uppercase tracking-wider">Site View Mode Controller</span>
          <h2 className="text-sm font-bold text-white uppercase tracking-tight">
            {viewMode === "kobold" ? "Active: Prizm Realtime Site Monitor" : "Active: Grid Fleet Summary Charts"}
          </h2>
        </div>
        <div className="flex gap-1.5 bg-black/40 p-1 rounded-md border border-white/5 font-mono text-[11px]">
          <button
            type="button"
            onClick={() => setViewMode("kobold")}
            className={`px-3 py-1 text-[11px] rounded uppercase font-bold transition-all cursor-pointer ${
              viewMode === "kobold"
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/15"
                : "text-white/40 hover:text-white/80"
            }`}
          >
            Prizm Site Monitor
          </button>
          <button
            type="button"
            onClick={() => setViewMode("legacy")}
            className={`px-3 py-1 text-[11px] rounded uppercase font-bold transition-all cursor-pointer ${
              viewMode === "legacy"
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/15"
                : "text-white/40 hover:text-white/80"
            }`}
          >
            Legacy Fleet Stats
          </button>
        </div>
      </div>

      {viewMode === "kobold" ? (
        <KoboldMonitor initialDevices={devices} />
      ) : (
        <>
          {/* Overview Stat Cards Grid (HIGH DENSITY THEME) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Fleet Load */}
        <div className="bg-[#12141C] border border-white/5 p-4 rounded-lg relative overflow-hidden">
          <p className="text-[10px] font-mono text-white/40 uppercase mb-1 tracking-wider">Fleet Power Flow</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-light text-white">
              {totalPower > 0 ? `+${totalPower.toFixed(1)}` : totalPower.toFixed(1)}
            </span>
            <span className="text-xs text-white/30 font-mono">kW</span>
          </div>
          <div className="mt-3 text-[10px] font-mono flex items-center justify-between">
            <span className={totalPower > 0 ? "text-cyan-400 font-bold" : totalPower < 0 ? "text-amber-400 font-bold" : "text-white/40"}>
              {totalPower > 0 ? "● DRAWING FROM GRID" : totalPower < 0 ? "● INJECTING POWER" : "● STANDING IDLE"}
            </span>
            <span className="text-white/20">CTRL_NET</span>
          </div>
        </div>

        {/* Average Battery SoC */}
        <div className="bg-[#12141C] border border-white/5 p-4 rounded-lg relative overflow-hidden">
          <p className="text-[10px] font-mono text-white/40 uppercase mb-1 tracking-wider">Fleet Avg Charge</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-light text-cyan-400">{avgSoc}</span>
            <span className="text-xs text-white/30 font-mono">% SOC</span>
          </div>
          {/* High Density Bar Meter */}
          <div className="mt-4 flex gap-[1px] h-1.5 w-full bg-white/5 rounded-sm overflow-hidden">
            <div className="bg-cyan-500 h-full transition-all duration-1000" style={{ width: `${avgSoc}%` }}></div>
            <div className="bg-white/10 h-full flex-1"></div>
          </div>
        </div>

        {/* Connected BESS Units */}
        <div className="bg-[#12141C] border border-white/5 p-4 rounded-lg relative overflow-hidden">
          <p className="text-[10px] font-mono text-white/40 uppercase mb-1 tracking-wider">BESS Comm Link</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-light text-white">{onlineCount}</span>
            <span className="text-xs text-white/30 font-mono">/ {devices.length} Units Online</span>
          </div>
          <div className="mt-3 text-[10px] text-green-400 font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></span>
            ACTIVE MODBUS GATEWAY OK
          </div>
        </div>

        {/* Critical Alerts */}
        <div className="bg-[#12141C] border border-white/5 p-4 rounded-lg relative overflow-hidden">
          <p className="text-[10px] font-mono text-white/40 uppercase mb-1 tracking-wider">System Alarms</p>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-light ${faultedCount > 0 ? "text-rose-400" : "text-white"}`}>
              {faultedCount}
            </span>
            <span className="text-xs text-white/30 font-mono">Active Lockouts</span>
          </div>
          <div className="mt-3 text-[10px] font-mono">
            {faultedCount > 0 ? (
              <span className="text-rose-400 font-bold animate-pulse">▲ ACTION REQUIRED</span>
            ) : (
              <span className="text-emerald-400">● CELL BALANCES STABLE</span>
            )}
          </div>
        </div>
      </div>

      {/* Grid Power and SoC Timelines Chart Card */}
      <div className="bg-[#12141C] border border-white/5 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
          <div>
            <h3 className="text-sm font-mono font-bold uppercase tracking-[0.2em] text-white/80">GRID INTEGRATION POWER TREND</h3>
            <p className="text-[10px] text-white/30 font-mono">Modbus live registers sequence stream (3s poll window)</p>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono text-white/40 uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-1 bg-cyan-400 rounded-sm"></span>
              <span>Grid Load (kW)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-1 bg-blue-500 rounded-sm"></span>
              <span>Avg SoC (%)</span>
            </div>
          </div>
        </div>
        
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorSoC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="time" 
                stroke="#64748b" 
                fontSize={9} 
                fontFamily="JetBrains Mono, Fira Code, monospace" 
                tickLine={false}
              />
              <YAxis 
                stroke="#64748b" 
                fontSize={9} 
                fontFamily="JetBrains Mono, Fira Code, monospace" 
                tickLine={false} 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: "#12141C", borderRadius: "4px", borderColor: "rgba(255,255,255,0.1)" }}
                labelStyle={{ color: "rgba(255,255,255,0.4)", fontFamily: "monospace", fontSize: "10px" }}
                itemStyle={{ color: "#fff", fontSize: "11px", fontFamily: "sans-serif" }}
              />
              <Area 
                type="monotone" 
                dataKey="Net Charge (kW)" 
                stroke="#22d3ee" 
                strokeWidth={1.5}
                fillOpacity={1} 
                fill="url(#colorPower)" 
              />
              <Area 
                type="monotone" 
                dataKey="Avg SoC (%)" 
                stroke="#3267d6" 
                strokeWidth={1.5}
                fillOpacity={1} 
                fill="url(#colorSoC)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Individual Devices list segment */}
      <div className="space-y-3">
        <div className="flex justify-between items-center bg-[#12141C]/50 p-2 px-4 rounded border border-white/5">
          <h3 className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-white/60">Device Cluster status grid</h3>
          <span className="text-[10px] text-white/30 font-mono">CLICK MODULE TO INSPECT INTERNAL SERIES CELL VOLTAGES</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((dev) => {
            const hasError = !!dev.lastError;
            return (
              <div 
                key={dev.id} 
                id={`bess-card-${dev.id}`}
                onClick={() => onSelectDevice(dev)}
                className={`group flex flex-col bg-[#161922] border rounded overflow-hidden shadow-lg transition-all duration-250 cursor-pointer ${
                  dev.status === "Faulted" ? "border-amber-500/30 hover:border-amber-500/60" : "border-white/10 hover:border-white/20"
                }`}
              >
                {/* Header info bar */}
                <div className={`px-3 py-2 border-b border-white/5 flex justify-between items-center ${
                  dev.status === "Faulted" ? 'bg-amber-500/10' : 'bg-white/5'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold ${dev.status === "Faulted" ? "text-amber-500" : "text-white"}`}>
                      {dev.name}
                    </span>
                    <span className="text-[9px] font-mono text-white/40">({dev.ipAddress})</span>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${
                    dev.status === "Faulted" ? "bg-amber-500 animate-pulse" :
                    dev.isOnline ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-white/20"
                  }`} />
                </div>

                {/* Info values table */}
                <div className="p-3.5 flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                    <div>
                      <p className="text-[9px] text-[#D1D5DB]/40 uppercase tracking-tighter">IP Connection</p>
                      <p className="text-xs font-mono text-[#D1D5DB]">{dev.ipAddress}:{dev.port}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-[#D1D5DB]/40 uppercase tracking-tighter">Status Reg</p>
                      <p className={`text-xs font-mono font-bold uppercase ${
                        dev.status === "Charging" ? "text-cyan-400" :
                        dev.status === "Discharging" ? "text-amber-400" :
                        dev.status === "Faulted" ? "text-rose-400" : "text-slate-400"
                      }`}>{dev.status}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-[#D1D5DB]/40 uppercase tracking-tighter">Active Power Flow</p>
                      <p className="text-base font-mono font-bold text-white leading-tight">
                        {dev.power > 0 ? `+${dev.power}` : dev.power} kW
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-[#D1D5DB]/40 uppercase tracking-tighter">Register V / A</p>
                      <p className="text-xs font-mono text-slate-300 leading-tight">
                        {dev.voltage}V / {dev.current}A
                      </p>
                    </div>
                  </div>

                  {/* SoC bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-baseline text-[10px]">
                      <span className="text-[#D1D5DB]/40 uppercase tracking-tighter">SOC Allocation</span>
                      <span className="font-mono text-white font-bold">{dev.soc}%</span>
                    </div>
                    <div className="flex gap-[1px]">
                      {Array.from({ length: 5 }).map((_, i) => {
                        const step = (i + 1) * 20;
                        const isFilled = dev.soc >= step;
                        return (
                          <div 
                            key={i} 
                            className={`h-2.5 flex-1 transition-all ${
                              isFilled 
                                ? dev.status === "Faulted" ? "bg-amber-500" : "bg-cyan-500" 
                                : "bg-white/10"
                            }`} 
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Temperature metrics line */}
                  <div className="flex justify-between items-center text-[10px] font-mono border-t border-white/5 pt-2 text-[#D1D5DB]/50">
                    <span>Temp: <strong className={dev.temperature > 45 ? "text-rose-400" : "text-slate-300"}>{dev.temperature}°C</strong></span>
                    <span>Health (SOH): <strong className="text-slate-300">{dev.soh}%</strong></span>
                    <span>Cycles: <strong className="text-slate-300">{dev.cycleCount}</strong></span>
                  </div>

                  {/* Active Register Fault status overlay */}
                  {hasError && (
                    <div className="p-2 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[10px] font-mono rounded leading-normal">
                      ERR MAP: {dev.lastError}
                    </div>
                  )}
                </div>

                {/* Actions row footer */}
                <div className="p-2 bg-black/30 border-t border-white/5 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {dev.status === "Faulted" ? (
                    <button 
                      onClick={() => onTriggerControl(dev.id, "reset_fault")}
                      className="w-full py-1 text-[10px] font-mono bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-400 hover:text-black uppercase font-bold rounded cursor-pointer transition-all"
                    >
                      Reset Locked Controller
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={() => onTriggerControl(dev.id, "charge", 100)}
                        disabled={dev.status === "Maintenance"}
                        className={`flex-1 py-1 text-[9px] font-mono rounded border uppercase font-bold cursor-pointer transition-colors ${
                          dev.status === "Charging" 
                            ? "bg-cyan-500 text-black border-cyan-400" 
                            : "bg-white/5 hover:bg-white/10 border-white/10 text-white/80 disabled:opacity-30"
                        }`}
                      >
                        Charge
                      </button>
                      <button 
                        onClick={() => onTriggerControl(dev.id, "discharge", 100)}
                        disabled={dev.status === "Maintenance"}
                        className={`flex-1 py-1 text-[9px] font-mono rounded border uppercase font-bold cursor-pointer transition-colors ${
                          dev.status === "Discharging" 
                            ? "bg-cyan-500 text-black border-cyan-400" 
                            : "bg-white/5 hover:bg-white/10 border-white/10 text-white/80 disabled:opacity-30"
                        }`}
                      >
                        Discharge
                      </button>
                      <button 
                        onClick={() => onTriggerControl(dev.id, "idle")}
                        disabled={dev.status === "Maintenance" || dev.status === "Idle"}
                        className="flex-1 py-1 text-[9px] font-mono rounded border bg-white/5 hover:bg-white/10 border-white/10 text-[#D1D5DB]/60 uppercase font-bold cursor-pointer transition-colors disabled:opacity-30"
                      >
                        Idle
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
