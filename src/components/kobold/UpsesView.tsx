import React, { useState } from "react";
import { 
  Zap, 
  Battery, 
  Heart, 
  Shield, 
  ShieldAlert, 
  AlertTriangle, 
  Check, 
  RefreshCw,
  Search
} from "lucide-react";

export default function UpsesView() {
  const [searchQuery, setSearchQuery] = useState("");

  const sidebarStats = {
    online: 24,
    off: 1, // one offline/fail
    total: 32
  };

  const upses = [
    { id: 101, isOnline: true, lineup: "Lineup 1", pos: "Cabinet 1", array: 1, soc: 100, statusState: "OnLineMode", cause: "AcceptableInput", hasFault: false, desc: "Normal Sequence" },
    { id: 102, isOnline: true, lineup: "Lineup 1", pos: "Cabinet 2", array: 1, soc: 100, statusState: "OnLineMode", cause: "AcceptableInput", hasFault: false, desc: "Normal Sequence" },
    { id: 103, isOnline: true, lineup: "Lineup 2", pos: "Cabinet 1", array: 2, soc: 100, statusState: "OnLineMode", cause: "AcceptableInput", hasFault: false, desc: "Normal Sequence" },
    { id: 104, isOnline: true, lineup: "Lineup 2", pos: "Cabinet 2", array: 2, soc: 98, statusState: "OnLineMode", cause: "AcceptableInput", hasFault: false, desc: "Normal Sequence" },
    { id: 2201, isOnline: true, lineup: "Lineup 3", pos: "Cabinet 1", array: 3, soc: 100, statusState: "OnLineMode", cause: "AcceptableInput", hasFault: false, desc: "Normal Sequence" },
    { id: 2202, isOnline: false, lineup: "Lineup 3", pos: "Cabinet 2", array: 3, soc: 0, statusState: "NoLineInMode", cause: "DisconnectedFrame", hasFault: true, desc: "DisconnectedFrame: Indicates that the secondary auxiliary power cable failed continuity check or is physically disabled." },
    { id: 3401, isOnline: true, lineup: "Lineup 4", pos: "Cabinet 1", array: 4, soc: 100, statusState: "OnLineMode", cause: "AcceptableInput", hasFault: false, desc: "Normal Sequence" },
    { id: 3402, isOnline: true, lineup: "Lineup 4", pos: "Cabinet 2", array: 4, soc: 100, statusState: "OnLineMode", cause: "AcceptableInput", hasFault: false, desc: "Normal Sequence" },
  ];

  const filteredUps = upses.filter(u => {
    if (searchQuery) {
      return u.id.toString().includes(searchQuery) || u.lineup.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <div className="flex flex-col md:flex-row gap-5 min-h-[600px] bg-[#08090C] text-slate-350 font-mono">
      
      {/* SIDEBAR SENSORS INDEX */}
      <div className="w-full md:w-56 shrink-0 bg-[#0E1017] border border-white/5 rounded p-3 text-[11px] space-y-4 select-none shadow-md">
        <div className="border-b border-white/5 pb-1 flex justify-between items-center bg-white/[0.01] px-1.5 py-0.5 rounded">
          <span className="text-[10px] uppercase font-bold text-slate-400">UPS Battery Status</span>
          <span className="text-[9px] text-[#5CF2A5] font-bold">Grid Fed</span>
        </div>

        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Backup Units</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Active Online</span>
              <span className="text-emerald-400 font-bold">{sidebarStats.online} Units</span>
            </div>
            <div className="flex justify-between items-baseline text-rose-450">
              <span className="text-slate-400 text-[10px]">Offline Alarms</span>
              <span className="font-bold">{sidebarStats.off} Unit</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Total Monitored</span>
              <span className="text-white font-bold">{sidebarStats.total} Channels</span>
            </div>
          </div>
        </div>

        <hr className="border-white/5" />
        <div className="p-2 rounded bg-cyan-500/5 border border-cyan-500/10 text-[9.5px] leading-relaxed text-slate-450">
          <strong>UPS Power Grid:</strong> Direct-current control loops execute fallback battery loops to maintain SBC communications if the primary AC breaker trips open.
        </div>
      </div>

      {/* RIGHT MAIN PANEL */}
      <div className="flex-1 space-y-4">
        
        {/* HEADER CONTROLS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#11131A] p-2.5 rounded border border-white/5 text-xs select-none">
          <div className="flex items-center gap-1.5">
            <Battery size={13} className="text-cyan-400" />
            <span className="font-bold text-white text-[11px] uppercase">Uninterruptible Power Supplies (UPSes)</span>
          </div>
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-2 text-white/30" />
            <input 
              type="text" 
              placeholder="Search ID/Lineup..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-black border border-white/10 rounded pl-7 pr-2 py-0.5 text-[10px] font-mono text-white placeholder-white/20 focus:outline-none focus:border-cyan-500 w-36"
            />
          </div>
        </div>

        {/* DATA TABLE */}
        <div className="border border-white/5 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-[11px] leading-normal border-collapse min-w-[950px] block-tabular-theme">
            <thead>
              <tr className="bg-[#11131A] text-slate-400 uppercase text-[9px] border-b border-white/10 select-none">
                <th className="p-2 w-10 text-center">Actions</th>
                <th className="p-2 text-center w-12">UPS ID</th>
                <th className="p-2 text-center w-8">Sync</th>
                <th className="p-2 text-center w-16">Online State</th>
                
                {/* Topology */}
                <th className="p-2">Lineup ID</th>
                <th className="p-2 text-center w-12">Cabinet</th>
                <th className="p-2 text-center w-10">Array</th>

                {/* Battery SOC */}
                <th className="p-2 text-center w-16">Battery SOC</th>
                
                {/* Status states */}
                <th className="p-2">Power Mode</th>
                <th className="p-2">Input Transition Cause</th>
                <th className="p-2 text-center w-10">Fault</th>
                <th className="p-2">System Diagnostic Logs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUps.map((u) => (
                <tr 
                  key={u.id} 
                  className={`hover:bg-cyan-500/[0.01] transition-colors leading-tight ${
                    !u.isOnline ? "bg-rose-500/[0.03] text-rose-100 font-bold" : ""
                  }`}
                >
                  <td className="p-2 text-center text-white/30 text-[12px] font-bold cursor-pointer hover:text-cyan-400 select-none">•••</td>
                  <td className="p-2 text-center text-white font-bold">{u.id}</td>
                  <td className="p-2 text-center select-none">
                    <span className={`p-0.5 rounded inline-block ${u.isOnline ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400 animate-pulse"}`}>
                      <Heart size={10} className={u.isOnline ? "fill-emerald-400/25" : "fill-rose-400/25"} />
                    </span>
                  </td>

                  {/* Toggle toggle text */}
                  <td className="p-2 text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                      u.isOnline ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                    }`}>
                      {u.isOnline ? "ONLINE" : "OFFLINE"}
                    </span>
                  </td>

                  {/* Topology */}
                  <td className="p-2 font-bold text-slate-300">{u.lineup}</td>
                  <td className="p-2 text-center text-slate-450">{u.pos}</td>
                  <td className="p-2 text-center text-cyan-400 font-bold">{u.array}</td>

                  {/* SOC */}
                  <td className="p-2 text-center font-bold">
                    <span className={u.soc < 20 ? "text-rose-400 animate-pulse" : "text-cyan-300"}>
                      {u.soc}%
                    </span>
                  </td>

                  {/* Modes */}
                  <td className={`p-2 font-mono text-[10px] ${u.isOnline ? "text-emerald-405" : "text-rose-405 font-bold"}`}>
                    {u.statusState}
                  </td>
                  <td className="p-2 text-slate-400 text-[10px]">{u.cause}</td>

                  {/* Fault Shield indicator */}
                  <td className="p-2 text-center">
                    <span className={`inline-block p-0.5 rounded ${u.hasFault ? "text-rose-400 bg-rose-500/10 animate-ping" : "text-emerald-400 bg-emerald-500/10"}`}>
                      {u.hasFault ? <ShieldAlert size={11} /> : <Shield size={11} />}
                    </span>
                  </td>

                  {/* Log diagnostic */}
                  <td className="p-2 text-[10px] text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis max-w-xs" title={u.desc}>
                    {u.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
