import React, { useState } from "react";
import { 
  Network, 
  Battery, 
  Zap, 
  Bolt, 
  Heart, 
  ShieldCheck, 
  AlertTriangle,
  RefreshCw,
  Search,
  ExternalLink
} from "lucide-react";

export default function ArraysView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "active" | "standby">("all");

  const sidebarStats = {
    communicating: 8,
    total: 8,
    onlineEnergy: "0.0 kWh",
    energyCapacity: "118,800.0 kWh",
    onlineSoc: "0.0%",
    dcChargeLimit: "0 A",
    dcDischargeLimit: "0 A"
  };

  // 8 physical arrays with precise telemetry from screenshot 2
  const arrays = [
    { id: 1, online: false, onlineEnergy: "0", nearlineEnergy: "0", offlineEnergy: "14,850", capacity: "14,850.00", chargeLimit: "Manager Disabled", dcPower: "0.00", dcVoltage: "0.00", dcCurrent: "0.00", maxCharge: "0", maxDischarge: "0", stringStatus: "offline" },
    { id: 2, online: false, onlineEnergy: "0", nearlineEnergy: "0", offlineEnergy: "14,850", capacity: "14,850.00", chargeLimit: "Manager Disabled", dcPower: "0.00", dcVoltage: "0.00", dcCurrent: "0.00", maxCharge: "0", maxDischarge: "0", stringStatus: "offline" },
    { id: 3, online: false, onlineEnergy: "0", nearlineEnergy: "0", offlineEnergy: "14,850", capacity: "14,850.00", chargeLimit: "Manager Disabled", dcPower: "0.00", dcVoltage: "0.00", dcCurrent: "0.00", maxCharge: "0", maxDischarge: "0", stringStatus: "offline" },
    { id: 4, online: false, onlineEnergy: "0", nearlineEnergy: "0", offlineEnergy: "14,850", capacity: "14,850.00", chargeLimit: "Manager Disabled", dcPower: "0.00", dcVoltage: "0.00", dcCurrent: "0.00", maxCharge: "0", maxDischarge: "0", stringStatus: "offline" },
    { id: 5, online: false, onlineEnergy: "0", nearlineEnergy: "0", offlineEnergy: "14,850", capacity: "14,850.00", chargeLimit: "Manager Disabled", dcPower: "0.00", dcVoltage: "0.00", dcCurrent: "0.00", maxCharge: "0", maxDischarge: "0", stringStatus: "offline" },
    { id: 6, online: false, onlineEnergy: "0", nearlineEnergy: "0", offlineEnergy: "14,850", capacity: "14,850.00", chargeLimit: "Manager Disabled", dcPower: "0.00", dcVoltage: "0.00", dcCurrent: "0.00", maxCharge: "0", maxDischarge: "0", stringStatus: "offline" },
    { id: 7, online: false, onlineEnergy: "0", nearlineEnergy: "0", offlineEnergy: "14,850", capacity: "14,850.00", chargeLimit: "Manager Disabled", dcPower: "0.00", dcVoltage: "0.00", dcCurrent: "0.00", maxCharge: "0", maxDischarge: "0", stringStatus: "offline" },
    { id: 8, online: false, onlineEnergy: "0", nearlineEnergy: "0", offlineEnergy: "14,850", capacity: "14,850.00", chargeLimit: "Manager Disabled", dcPower: "0.00", dcVoltage: "0.00", dcCurrent: "0.00", maxCharge: "0", maxDischarge: "0", stringStatus: "offline" },
  ];

  const filteredArrays = arrays.filter(arr => {
    if (searchQuery) {
      return arr.id.toString() === searchQuery;
    }
    return true;
  });

  return (
    <div className="flex flex-col md:flex-row gap-5 min-h-[600px] bg-[#08090C] text-slate-300 font-mono">
      
      {/* SIDEBAR PANE */}
      <div className="w-full md:w-56 shrink-0 bg-[#0E1017] border border-white/5 rounded p-3 text-xs space-y-4 select-none shadow-md">
        <div className="border-b border-white/5 pb-1 flex justify-between items-center">
          <span className="text-[10px] uppercase font-bold text-slate-400">Arrays Overview</span>
          <span className="text-[9px] text-[#5CF2A5] font-bold">8 Communicating</span>
        </div>

        {/* STATUS COUNTERS */}
        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Status</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Communicating</span>
              <span className="text-emerald-400 font-bold">{sidebarStats.communicating}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Not Communicating</span>
              <span className="text-white/30 font-bold">0</span>
            </div>
          </div>
        </div>

        {/* ENERGY CAPACITY */}
        <hr className="border-white/5" />
        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Availability</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Online Energy</span>
              <span className="text-white font-bold">{sidebarStats.onlineEnergy}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Energy Capacity</span>
              <span className="text-cyan-400 font-bold">{sidebarStats.energyCapacity}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Online SoC</span>
              <span className="text-white font-bold">{sidebarStats.onlineSoc}</span>
            </div>
          </div>
        </div>

        {/* LIMITS */}
        <hr className="border-white/5" />
        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">DC Limits</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Charge Allow</span>
              <span className="text-[#EF4444] font-bold">{sidebarStats.dcChargeLimit}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Discharge Allow</span>
              <span className="text-[#EF4444] font-bold">{sidebarStats.dcDischargeLimit}</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT MAIN PANEL */}
      <div className="flex-1 space-y-4">
        
        {/* INTERACTIVE CONTROLS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#11131A] p-2 px-3 rounded text-xs">
          <div className="flex items-center gap-1.5">
            <Bolt size={12} className="text-cyan-400" />
            <span className="font-bold text-white text-[11px] uppercase tracking-wider">Arrays</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-2 text-white/30" />
              <input 
                type="search" 
                placeholder="Find Array ID..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-black border border-white/10 rounded font-mono text-[10px] pl-6 pr-2 py-1 focus:outline-none focus:border-cyan-500 w-28"
              />
            </div>
            <button className="flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/15 px-2 py-1 rounded text-[10px] uppercase font-bold transition-all text-white/80">
              <RefreshCw size={10} />
              Re-scan Arrays
            </button>
          </div>
        </div>

        {/* MAIN ARRAYS TABLE */}
        <div className="border border-white/5 rounded overflow-x-auto">
          <table className="w-full text-left text-[11px] leading-normal border-collapse min-w-[950px] block-tabular-theme">
            <thead>
              <tr className="bg-[#11131A] text-slate-400 uppercase text-[9px] border-b border-white/10">
                <th className="p-2 sm:p-2.5 text-center w-14">Actions</th>
                <th className="p-2 sm:p-2.5 text-center w-10">ID</th>
                <th className="p-2 sm:p-2.5 text-center w-10">Sync</th>
                <th className="p-2 sm:p-2.5 w-32 text-center">Strings status bar</th>
                <th className="p-2 sm:p-2.5 text-right">Online (kWh)</th>
                <th className="p-2 sm:p-2.5 text-right font-light">Nearline (kWh)</th>
                <th className="p-2 sm:p-2.5 text-right font-light">Offline (kWh)</th>
                <th className="p-2 sm:p-2.5 text-right">Total Capacity</th>
                <th className="p-2 sm:p-2.5 text-center">Pref. Charge Current</th>
                <th className="p-2 sm:p-2.5 text-right">DC kW</th>
                <th className="p-2 sm:p-2.5 text-right">DC Volt (V)</th>
                <th className="p-2 sm:p-2.5 text-right">DC Curr (A)</th>
                <th className="p-2 sm:p-2.5 text-right">Max Chg (A)</th>
                <th className="p-2 sm:p-2.5 text-right">Max Dischg (A)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredArrays.length === 0 ? (
                <tr>
                  <td colSpan={14} className="p-10 text-center text-white/20 text-xs">
                    No physical arrays match selection.
                  </td>
                </tr>
              ) : (
                filteredArrays.map((arr) => (
                  <tr key={arr.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-2 text-center text-white/30 select-none text-[12px] font-bold cursor-pointer hover:text-cyan-400">•••</td>
                    <td className="p-2 text-center font-bold text-white text-[11px]">{arr.id}</td>
                    <td className="p-2 text-center select-none">
                      <span className="inline-block p-0.5 bg-emerald-500/10 rounded text-emerald-400">
                        <Heart size={10} className="fill-emerald-500/30" />
                      </span>
                    </td>
                    
                    {/* High-fidelity visual String grid status strip */}
                    <td className="p-2 text-center vertical-align-middle">
                      <div className="flex h-3 w-28 bg-rose-950/40 border border-rose-900/40 rounded-sm overflow-hidden" title="40 Offline strings in Array">
                        <div className="bg-repeating-stripes-red h-full w-full"></div>
                      </div>
                    </td>

                    <td className="p-2 text-right font-semibold text-white/40">{arr.onlineEnergy}</td>
                    <td className="p-2 text-right text-white/40">{arr.nearlineEnergy}</td>
                    <td className="p-2 text-right text-emerald-400/90 font-bold">{arr.offlineEnergy}</td>
                    <td className="p-2 text-right text-white">{arr.capacity}</td>
                    
                    {/* Throttled status indicator */}
                    <td className="p-2 text-center">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-rose-500/10 border border-rose-900/30 text-rose-400 font-bold">
                        {arr.chargeLimit}
                      </span>
                    </td>

                    <td className="p-2 text-right font-bold text-white">{arr.dcPower}</td>
                    <td className="p-2 text-right text-slate-300">{arr.dcVoltage}</td>
                    <td className="p-2 text-right text-slate-300">{arr.dcCurrent}</td>
                    <td className="p-2 text-right text-slate-300/60 font-semibold">{arr.maxCharge}</td>
                    <td className="p-2 text-right text-slate-300/60 font-semibold">{arr.maxDischarge}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
