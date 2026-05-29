import React, { useState } from "react";
import { 
  Heart, 
  Wind, 
  Thermometer, 
  Settings, 
  Search,
  Check,
  RefreshCw
} from "lucide-react";

export default function HvacsView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");

  const sidebarStats = {
    healthy: 167,
    total: 168
  };

  const hvacs = [
    { index: 1, healthy: true, segment: 1, humidity: 36, airTemp: 21.2, cellTemp: 23.0, coolTo: 22.0, heatTo: 18.0, respondTo: "Air Temp", stage: "Lead Cooling", signals: "cool1_on | fan1_high", unit1: "Operational", unit2: "Standby" },
    { index: 2, healthy: true, segment: 2, humidity: 35, airTemp: 20.9, cellTemp: 22.5, coolTo: 22.0, heatTo: 18.0, respondTo: "Air Temp", stage: "Idle", signals: "fan1_low", unit1: "Standby", unit2: "Standby" },
    { index: 3, healthy: true, segment: 3, humidity: 38, airTemp: 21.0, cellTemp: 23.4, coolTo: 22.0, heatTo: 18.0, respondTo: "Air Temp", stage: "Lead Cooling", signals: "cool1_on | fan1_high", unit1: "Operational", unit2: "Standby" },
    { index: 4, healthy: true, segment: 4, humidity: 37, airTemp: 20.8, cellTemp: 22.9, coolTo: 22.0, heatTo: 18.0, respondTo: "Air Temp", stage: "Idle", signals: "fan1_low", unit1: "Standby", unit2: "Standby" },
    { index: 5, healthy: true, segment: 5, humidity: 39, airTemp: 21.5, cellTemp: 24.1, coolTo: 22.0, heatTo: 18.0, respondTo: "Air Temp", stage: "Lead Cooling", signals: "cool1_on | fan1_high", unit1: "Operational", unit2: "Standby" },
    { index: 6, healthy: true, segment: 6, humidity: 37, airTemp: 20.8, cellTemp: 22.9, coolTo: 22.0, heatTo: 18.0, respondTo: "Air Temp", stage: "Idle", signals: "fan1_low", unit1: "Standby", unit2: "Standby" },
    { index: 7, healthy: true, segment: 7, humidity: 39, airTemp: 21.5, cellTemp: 24.1, coolTo: 22.0, heatTo: 18.0, respondTo: "Air Temp", stage: "Lead Cooling", signals: "cool1_on | fan1_high", unit1: "Operational", unit2: "Standby" },
    { index: 8, healthy: false, segment: 8, humidity: 45, airTemp: 25.4, cellTemp: 29.8, coolTo: 22.0, heatTo: 18.0, respondTo: "Cell Temp", stage: "Stage 2 Lag Cooling", signals: "cool1_on | cool2_on | fan1_high | fan2_high", unit1: "Operational", unit2: "Operational" },
  ];

  const filteredHvacs = hvacs.filter(h => {
    if (searchQuery && h.index.toString() !== searchQuery && h.segment.toString() !== searchQuery) {
      return false;
    }
    if (stageFilter !== "ALL" && h.stage !== stageFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col md:flex-row gap-5 min-h-[600px] bg-[#08090C] text-slate-350 font-mono">
      
      {/* SIDEBAR SENSORS INDEX */}
      <div className="w-full md:w-56 shrink-0 bg-[#0E1017] border border-white/5 rounded p-3 text-[11px] space-y-4 select-none shadow-md">
        <div className="border-b border-white/5 pb-1 flex justify-between items-center bg-white/[0.01] px-1.5 py-0.5 rounded">
          <span className="text-[10px] uppercase font-bold text-slate-400">HVAC PLC Stats</span>
          <span className="text-[9px] text-[#5CF2A5] font-bold">167 Healthy</span>
        </div>

        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">System Status</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Healthy</span>
              <span className="text-emerald-400 font-bold">{sidebarStats.healthy}</span>
            </div>
            <div className="flex justify-between items-baseline text-rose-400">
              <span className="text-slate-400 text-[10px]">Faulted PLC</span>
              <span className="font-bold">1</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Total Devices</span>
              <span className="text-white font-bold">{sidebarStats.total}</span>
            </div>
          </div>
        </div>

        <hr className="border-white/5" />
        <div className="p-2 rounded bg-cyan-500/5 border border-cyan-500/10 text-[9.5px] leading-relaxed text-slate-400">
          <strong>PID Control:</strong> Air Temp sensors serve as physical master setpoints by default. Dynamic switches trigger lag compressor cooling grids if cell temp gradients exceed 5°C bounds.
        </div>
      </div>

      {/* MAIN TARGET CELL */}
      <div className="flex-1 space-y-4">
        
        {/* UPPER CONTROLLER HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#11131A] p-2.5 rounded border border-white/5 text-xs">
          <div className="flex items-center gap-1.5">
            <Wind size={12} className="text-cyan-400" />
            <span className="font-bold text-white text-[11px] uppercase">Centipede HVAC Controllers (168 Units)</span>
          </div>
          <div className="flex items-center gap-2">
            <select 
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="bg-black border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-slate-350 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="ALL">All Stages</option>
              <option value="Lead Cooling">Lead Cooling</option>
              <option value="Stage 2 Lag Cooling">Stage 2 Lag Cooling</option>
              <option value="Idle">Idle</option>
            </select>
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-2 text-white/30" />
              <input 
                type="text" 
                placeholder="Find Index/Segment..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-black border border-white/10 rounded pl-7 pr-2 py-0.5 text-[10px] font-mono text-white placeholder-white/20 focus:outline-none focus:border-cyan-500 w-36"
              />
            </div>
          </div>
        </div>

        {/* HVAC TABLE */}
        <div className="border border-white/5 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-[11px] leading-normal border-collapse min-w-[950px] block-tabular-theme">
            <thead>
              <tr className="bg-[#11131A] text-slate-400 uppercase text-[9px] border-b border-white/10 select-none">
                <th className="p-2 w-10 text-center">Actions</th>
                <th className="p-2 text-center w-12">HVAC Index</th>
                <th className="p-2 w-8 text-center">Sync</th>
                <th className="p-2 w-16 text-center">Segment</th>
                <th className="p-2 text-right">Humidity (%)</th>
                <th className="p-2 text-right">Air Temp (°C)</th>
                <th className="p-2 text-right text-white">Cell Temp (°C)</th>
                <th className="p-2 text-right text-cyan-300 font-bold">Cool To (°C)</th>
                <th className="p-2 text-right text-rose-300">Heat To (°C)</th>
                <th className="p-2">Setpoints Source</th>
                <th className="p-2 text-center font-bold">PID HVAC Stage</th>
                <th className="p-2">Signals Output Matrix</th>
                <th className="p-2 text-center">Redundancy Unit 1</th>
                <th className="p-2 text-center">Redundancy Unit 2</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredHvacs.map((h) => (
                <tr 
                  key={h.index} 
                  className={`hover:bg-cyan-500/[0.01] transition-colors leading-tight ${
                    !h.healthy ? "bg-rose-500/[0.03] text-rose-100 font-bold" : ""
                  }`}
                >
                  <td className="p-2 text-center text-white/30 text-[12px] select-none font-bold cursor-pointer hover:text-cyan-400">•••</td>
                  <td className="p-2 text-center text-white font-bold">{h.index}</td>
                  <td className="p-2 text-center select-none">
                    <span className={`p-0.5 rounded inline-block ${h.healthy ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400 animate-pulse"}`}>
                      <Heart size={10} className={h.healthy ? "fill-emerald-400/25" : "fill-rose-400/25"} />
                    </span>
                  </td>
                  <td className="p-2 text-center font-bold text-cyan-400">{h.segment}</td>
                  <td className="p-2 text-right text-slate-300">{h.humidity}%</td>
                  <td className="p-2 text-right text-slate-300">{h.airTemp}</td>
                  <td className={`p-2 text-right font-black ${!h.healthy ? "text-rose-400 animate-pulse" : "text-emerald-400"}`}>
                    {h.cellTemp}°C
                  </td>
                  <td className="p-2 text-right text-cyan-400 font-semibold">{h.coolTo}</td>
                  <td className="p-2 text-right text-rose-400">{h.heatTo}</td>
                  <td className="p-2 text-slate-400">{h.respondTo}</td>

                  {/* Stage */}
                  <td className="p-2 text-center">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase ${
                      h.stage === "Idle" ? "bg-slate-500/10 text-slate-400" :
                      !h.healthy ? "bg-rose-500/15 text-rose-400 animate-pulse" :
                      "bg-cyan-500/10 text-cyan-400"
                    }`}>
                      {h.stage}
                    </span>
                  </td>

                  <td className="p-2 text-slate-500 text-[10px] truncate max-w-[120px]" title={h.signals}>{h.signals}</td>
                  <td className="p-2 text-center text-emerald-400 font-bold text-[9.5px] select-none">{h.unit1}</td>
                  <td className="p-2 text-center text-emerald-400 font-bold text-[9.5px] select-none">{h.unit2}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
