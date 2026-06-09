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
      <div className="flex justify-between items-center bg-prizm-surface-strong border border-prizm-border p-3 rounded-lg flex-wrap gap-2">
        <div>
          <span className="text-[10px] font-mono text-prizm-primary-strong font-bold block uppercase tracking-wider">Site View Mode Controller</span>
          <h2 className="text-sm font-bold text-prizm-text uppercase tracking-tight">
            {viewMode === "kobold" ? "Active: Prizm Realtime Site Monitor" : "Active: Grid Fleet Summary Charts"}
          </h2>
        </div>
        <div className="flex gap-1.5 bg-prizm-bg p-1 rounded-md border border-prizm-border font-mono text-[11px]">
          <button
            type="button"
            onClick={() => setViewMode("kobold")}
            className={`px-3 py-1 text-[11px] rounded uppercase font-bold transition-all cursor-pointer ${
              viewMode === "kobold"
                ? "bg-prizm-info/10 text-prizm-primary border border-prizm-primary/20"
                : "text-prizm-text-muted hover:text-prizm-text"
            }`}
          >
            Prizm Site Monitor
          </button>
          <button
            type="button"
            onClick={() => setViewMode("legacy")}
            className={`px-3 py-1 text-[11px] rounded uppercase font-bold transition-all cursor-pointer ${
              viewMode === "legacy"
                ? "bg-prizm-info/10 text-prizm-primary border border-prizm-primary/20"
                : "text-prizm-text-muted hover:text-prizm-text"
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
        <div className="bg-prizm-surface border border-prizm-border p-4 rounded-lg relative overflow-hidden">
          <p className="text-[10px] font-mono text-prizm-text-muted uppercase mb-1 tracking-wider">Fleet Power Flow</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-light text-prizm-text">
              {totalPower > 0 ? `+${totalPower.toFixed(1)}` : totalPower.toFixed(1)}
            </span>
            <span className="text-xs text-prizm-text-muted font-mono">kW</span>
          </div>
          <div className="mt-3 text-[10px] font-mono flex items-center justify-between">
            <span className={totalPower > 0 ? "text-prizm-primary-strong font-bold" : totalPower < 0 ? "text-prizm-warning font-bold" : "text-prizm-text-muted"}>
              {totalPower > 0 ? "● DRAWING FROM GRID" : totalPower < 0 ? "● INJECTING POWER" : "● STANDING IDLE"}
            </span>
            <span className="text-prizm-text-muted opacity-50">CTRL_NET</span>
          </div>
        </div>

        {/* Average Battery SoC */}
        <div className="bg-prizm-surface border border-prizm-border p-4 rounded-lg relative overflow-hidden">
          <p className="text-[10px] font-mono text-prizm-text-muted uppercase mb-1 tracking-wider">Fleet Avg Charge</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-light text-prizm-primary">{avgSoc}</span>
            <span className="text-xs text-prizm-text-muted font-mono">% SOC</span>
          </div>
          {/* High Density Bar Meter */}
          <div className="mt-4 flex gap-[1px] h-1.5 w-full bg-prizm-bg-muted rounded-sm overflow-hidden">
            <div className="bg-prizm-primary h-full transition-all duration-1000" style={{ width: `${avgSoc}%` }}></div>
            <div className="bg-prizm-border h-full flex-1"></div>
          </div>
        </div>

        {/* Connected BESS Units */}
        <div className="bg-prizm-surface border border-prizm-border p-4 rounded-lg relative overflow-hidden">
          <p className="text-[10px] font-mono text-prizm-text-muted uppercase mb-1 tracking-wider">BESS Comm Link</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-light text-prizm-text">{onlineCount}</span>
            <span className="text-xs text-prizm-text-muted font-mono">/ {devices.length} Units Online</span>
          </div>
          <div className="mt-3 text-[10px] text-prizm-success font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-prizm-success shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse"></span>
            ACTIVE MODBUS GATEWAY OK
          </div>
        </div>

        {/* Critical Alerts */}
        <div className="bg-prizm-surface border border-prizm-border p-4 rounded-lg relative overflow-hidden">
          <p className="text-[10px] font-mono text-prizm-text-muted uppercase mb-1 tracking-wider">System Alarms</p>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-light ${faultedCount > 0 ? "text-prizm-danger" : "text-prizm-text"}`}>
              {faultedCount}
            </span>
            <span className="text-xs text-prizm-text-muted font-mono">Active Lockouts</span>
          </div>
          <div className="mt-3 text-[10px] font-mono">
            {faultedCount > 0 ? (
              <span className="text-prizm-danger font-bold animate-pulse">▲ ACTION REQUIRED</span>
            ) : (
              <span className="text-prizm-success">● CELL BALANCES STABLE</span>
            )}
          </div>
        </div>
      </div>

      {/* Grid Power and SoC Timelines Chart Card */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
          <div>
            <h3 className="text-sm font-mono font-bold uppercase tracking-[0.2em] text-prizm-text">GRID INTEGRATION POWER TREND</h3>
            <p className="text-[10px] text-prizm-text-muted font-mono">Modbus live registers sequence stream (3s poll window)</p>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono text-prizm-text-muted uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-1 bg-prizm-info rounded-sm"></span>
              <span>Grid Load (kW)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-1 bg-prizm-primary rounded-sm"></span>
              <span>Avg SoC (%)</span>
            </div>
          </div>
        </div>
        
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0284C7" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#0284C7" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorSoC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16A34A" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#16A34A" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="time" 
                stroke="#94a3b8" 
                fontSize={9} 
                fontFamily="JetBrains Mono, Fira Code, monospace" 
                tickLine={false}
              />
              <YAxis 
                stroke="#94a3b8" 
                fontSize={9} 
                fontFamily="JetBrains Mono, Fira Code, monospace" 
                tickLine={false} 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: "#ffffff", borderRadius: "4px", borderColor: "#e2e8f0" }}
                labelStyle={{ color: "#64748b", fontFamily: "monospace", fontSize: "10px" }}
                itemStyle={{ color: "#0f172a", fontSize: "11px", fontFamily: "sans-serif" }}
              />
              <Area 
                type="monotone" 
                dataKey="Net Charge (kW)" 
                stroke="#0284C7" 
                strokeWidth={1.5}
                fillOpacity={1} 
                fill="url(#colorPower)" 
              />
              <Area 
                type="monotone" 
                dataKey="Avg SoC (%)" 
                stroke="#16A34A" 
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
        <div className="flex justify-between items-center bg-prizm-surface p-2 px-4 rounded border border-prizm-border">
          <h3 className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-prizm-text-muted">Device Cluster status grid</h3>
          <span className="text-[10px] text-prizm-text-muted font-mono">CLICK MODULE TO INSPECT INTERNAL SERIES CELL VOLTAGES</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((dev) => {
            const hasError = !!dev.lastError;
            return (
              <div 
                key={dev.id} 
                id={`bess-card-${dev.id}`}
                onClick={() => onSelectDevice(dev)}
                className={`group flex flex-col bg-prizm-surface border rounded overflow-hidden shadow-lg transition-all duration-250 cursor-pointer ${
                  dev.status === "Faulted" ? "border-prizm-warning hover:border-prizm-danger" : "border-prizm-border hover:border-prizm-text-muted"
                }`}
              >
                {/* Header info bar */}
                <div className={`px-3 py-2 border-b border-prizm-border flex justify-between items-center ${
                  dev.status === "Faulted" ? 'bg-prizm-warning/10' : 'bg-prizm-surface-strong'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold ${dev.status === "Faulted" ? "text-prizm-warning" : "text-prizm-text"}`}>
                      {dev.name}
                    </span>
                    <span className="text-[9px] font-mono text-prizm-text-muted">({dev.ipAddress})</span>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${
                    dev.status === "Faulted" ? "bg-prizm-warning animate-pulse" :
                    dev.isOnline ? "bg-prizm-success shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-prizm-border"
                  }`} />
                </div>

                {/* Info values table */}
                <div className="p-3.5 flex-1 space-y-3">
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                    <div>
                      <p className="text-[9px] text-prizm-text-muted uppercase tracking-tighter">IP Connection</p>
                      <p className="text-xs font-mono text-prizm-text">{dev.ipAddress}:{dev.port}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-prizm-text-muted uppercase tracking-tighter">Status Reg</p>
                      <p className={`text-xs font-mono font-bold uppercase ${
                        dev.status === "Charging" ? "text-prizm-primary" :
                        dev.status === "Discharging" ? "text-prizm-warning" :
                        dev.status === "Faulted" ? "text-prizm-danger" : "text-prizm-text-muted"
                      }`}>{dev.status}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-prizm-text-muted uppercase tracking-tighter">Active Power Flow</p>
                      <p className="text-base font-mono font-bold text-prizm-text leading-tight">
                        {dev.power > 0 ? `+${dev.power}` : dev.power} kW
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-prizm-text-muted uppercase tracking-tighter">Register V / A</p>
                      <p className="text-xs font-mono text-prizm-text-muted leading-tight">
                        {dev.voltage}V / {dev.current}A
                      </p>
                    </div>
                  </div>

                  {/* SoC bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-baseline text-[10px]">
                      <span className="text-prizm-text-muted uppercase tracking-tighter">SOC Allocation</span>
                      <span className="font-mono text-prizm-text font-bold">{dev.soc}%</span>
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
                                ? dev.status === "Faulted" ? "bg-prizm-warning" : "bg-prizm-primary" 
                                : "bg-prizm-bg-muted"
                            }`} 
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Temperature metrics line */}
                  <div className="flex justify-between items-center text-[10px] font-mono border-t border-prizm-border pt-2 text-prizm-text-muted">
                    <span>Temp: <strong className={dev.temperature > 45 ? "text-prizm-danger" : "text-prizm-text"}>{dev.temperature}°C</strong></span>
                    <span>Health (SOH): <strong className="text-prizm-text">{dev.soh}%</strong></span>
                    <span>Cycles: <strong className="text-prizm-text">{dev.cycleCount}</strong></span>
                  </div>

                  {/* Active Register Fault status overlay */}
                  {hasError && (
                    <div className="p-2 bg-prizm-danger/10 border border-prizm-danger/20 text-prizm-danger text-[10px] font-mono rounded leading-normal">
                      ERR MAP: {dev.lastError}
                    </div>
                  )}
                </div>

                {/* Actions row footer */}
                <div className="p-2 bg-prizm-surface-strong border-t border-prizm-border flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {dev.status === "Faulted" ? (
                    <button 
                      onClick={() => onTriggerControl(dev.id, "reset_fault")}
                      className="w-full py-1 text-[10px] font-mono bg-prizm-warning/20 border border-prizm-warning/40 text-prizm-warning-strong hover:bg-prizm-warning hover:text-prizm-text uppercase font-bold rounded cursor-pointer transition-all"
                    >
                      Reset Locked Controller
                    </button>
                  ) : (
                    <>
                      <button 
                        disabled={true}
                        className={`flex-1 py-1 text-[9px] font-mono rounded border uppercase font-bold cursor-not-allowed transition-colors ${
                          dev.status === "Charging" 
                            ? "bg-prizm-primary text-prizm-text border-prizm-primary-strong" 
                            : "bg-prizm-bg-muted border-prizm-border text-prizm-text-muted opacity-50"
                        }`}
                      >
                        Charge
                      </button>
                      <button 
                        disabled={true}
                        className={`flex-1 py-1 text-[9px] font-mono rounded border uppercase font-bold cursor-not-allowed transition-colors ${
                          dev.status === "Discharging" 
                            ? "bg-prizm-primary text-prizm-text border-prizm-primary-strong" 
                            : "bg-prizm-bg-muted border-prizm-border text-prizm-text-muted opacity-50"
                        }`}
                      >
                        Discharge
                      </button>
                      <button 
                        disabled={true}
                        className="flex-1 py-1 text-[9px] font-mono rounded border bg-prizm-bg-muted border-prizm-border text-prizm-text-muted uppercase font-bold cursor-not-allowed transition-colors opacity-50"
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
