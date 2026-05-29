import React from "react";
import { 
  Cpu, 
  Heart, 
  Terminal, 
  Layers,
  Database,
  Lock,
  RefreshCw
} from "lucide-react";

export default function StackManagersView() {
  const managers = [
    { id: 1, active: true, ip: "10.0.1.10", version: "2.73.42", hdTotal: "29.1 GB", hdAvail: "17.4 GB", memTotal: "7.7 GB", memAvail: "3.2 GB", memFree: "2.1 GB", swapTotal: "2.0 GB", swapAvail: "1.9 GB", jvmTotal: "1.9 GB", jvmAvail: "1.1 GB", procs: 4, load1: "0.14", load5: "0.19", load15: "0.15", uptime: "24 days, 14h" },
    { id: 2, active: true, ip: "10.0.1.15", version: "2.73.42", hdTotal: "29.1 GB", hdAvail: "17.8 GB", memTotal: "7.7 GB", memAvail: "3.5 GB", memFree: "2.3 GB", swapTotal: "2.0 GB", swapAvail: "2.0 GB", jvmTotal: "1.9 GB", jvmAvail: "1.2 GB", procs: 4, load1: "0.08", load5: "0.11", load15: "0.12", uptime: "24 days, 14h" },
    { id: 3, active: true, ip: "10.0.3.10", version: "2.73.42", hdTotal: "29.1 GB", hdAvail: "16.1 GB", memTotal: "7.7 GB", memAvail: "2.8 GB", memFree: "1.4 GB", swapTotal: "2.0 GB", swapAvail: "1.5 GB", jvmTotal: "1.9 GB", jvmAvail: "0.8 GB", procs: 4, load1: "0.45", load5: "0.38", load15: "0.29", uptime: "12 days, 03h" },
    { id: 4, active: true, ip: "10.0.3.15", version: "2.73.42", hdTotal: "29.1 GB", hdAvail: "18.0 GB", memTotal: "7.7 GB", memAvail: "4.1 GB", memFree: "2.9 GB", swapTotal: "2.0 GB", swapAvail: "2.0 GB", jvmTotal: "1.9 GB", jvmAvail: "1.4 GB", procs: 4, load1: "0.05", load5: "0.08", load15: "0.10", uptime: "24 days, 14h" },
    { id: 5, active: true, ip: "10.0.5.10", version: "2.73.42", hdTotal: "29.1 GB", hdAvail: "17.2 GB", memTotal: "7.7 GB", memAvail: "3.1 GB", memFree: "1.9 GB", swapTotal: "2.0 GB", swapAvail: "1.9 GB", jvmTotal: "1.9 GB", jvmAvail: "1.0 GB", procs: 4, load1: "0.18", load5: "0.22", load15: "0.18", uptime: "24 days, 13h" },
    { id: 6, active: true, ip: "10.0.5.15", version: "2.73.42", hdTotal: "29.1 GB", hdAvail: "17.3 GB", memTotal: "7.7 GB", memAvail: "3.3 GB", memFree: "2.0 GB", swapTotal: "2.0 GB", swapAvail: "1.9 GB", jvmTotal: "1.9 GB", jvmAvail: "1.1 GB", procs: 4, load1: "0.12", load5: "0.14", load15: "0.14", uptime: "24 days, 13h" },
    { id: 7, active: true, ip: "10.0.7.10", version: "2.73.42", hdTotal: "29.1 GB", hdAvail: "17.6 GB", memTotal: "7.7 GB", memAvail: "3.4 GB", memFree: "2.2 GB", swapTotal: "2.0 GB", swapAvail: "2.0 GB", jvmTotal: "1.9 GB", jvmAvail: "1.1 GB", procs: 4, load1: "0.11", load5: "0.13", load15: "0.13", uptime: "24 days, 13h" },
    { id: 8, active: true, ip: "10.0.7.15", version: "2.73.42", hdTotal: "29.1 GB", hdAvail: "17.1 GB", memTotal: "7.7 GB", memAvail: "3.0 GB", memFree: "1.8 GB", swapTotal: "2.0 GB", swapAvail: "1.9 GB", jvmTotal: "1.9 GB", jvmAvail: "0.9 GB", procs: 4, load1: "0.20", load5: "0.24", load15: "0.19", uptime: "24 days, 13h" },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-5 min-h-[600px] bg-[#08090C] text-slate-350 font-mono">
      
      {/* SIDEBAR SENSORS INDEX */}
      <div className="w-full md:w-56 shrink-0 bg-[#0E1017] border border-white/5 rounded p-3 text-[11px] space-y-4 select-none shadow-md">
        <div className="border-b border-white/5 pb-1 flex justify-between items-center bg-white/[0.01] px-1.5 py-0.5 rounded">
          <span className="text-[10px] uppercase font-bold text-slate-400">StackOS Managers</span>
          <span className="text-[9px] text-[#5CF2A5] font-bold">8 Active</span>
        </div>

        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Kernel Fleet</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Healthy</span>
              <span className="text-emerald-400 font-bold">8</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Active Threads</span>
              <span className="text-white font-bold">32 Tasks</span>
            </div>
          </div>
        </div>

        <hr className="border-white/5" />
        <div className="p-2 rounded bg-cyan-500/5 border border-cyan-500/10 text-[9.5px] leading-relaxed text-slate-400 space-y-1">
          <span className="font-bold block text-cyan-300">SYSTEM ARCHITECTURE</span>
          <span>Each enclosure lineup mounts an individual Linux-hardened SBC stack controller executing microtransactions in real-time.</span>
        </div>
      </div>

      {/* RIGHT MAIN PANEL */}
      <div className="flex-1 space-y-4">
        
        {/* HEADER CONTROLS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#11131A] p-2.5 rounded border border-white/5 text-xs select-none">
          <div className="flex items-center gap-1.5">
            <Cpu size={12} className="text-cyan-400" />
            <span className="font-bold text-white text-[11px] uppercase">Kernel Stack Controllers</span>
          </div>
          <button className="flex items-center gap-1 px-2 py-0.5 border border-white/10 rounded uppercase font-bold text-[9.5px] bg-white/5 hover:bg-white/10 text-white transition-all text-xs">
            <RefreshCw size={10} />
            Diagnostics Poll
          </button>
        </div>

        {/* DATA TABLE */}
        <div className="border border-white/5 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-[11px] leading-normal border-collapse min-w-[1050px] block-tabular-theme">
            <thead>
              {/* GROUPS */}
              <tr className="bg-black/30 border-b border-white/[0.03] select-none text-slate-500 text-[9px] uppercase font-bold">
                <th colSpan={4} className="p-1 px-2 border-r border-white/5">Device Info</th>
                <th colSpan={2} className="p-1 px-2 border-r border-white/5">Storage HD</th>
                <th colSpan={3} className="p-1 px-2 border-r border-white/5">Physical RAM Memory Allocation</th>
                <th colSpan={2} className="p-1 px-2 border-r border-white/5">Virtual Swap</th>
                <th colSpan={2} className="p-1 px-2 border-r border-white/5">SBC JVM Heap</th>
                <th colSpan={4} className="p-1 px-2 border-r border-white/5">Processor Core Loads</th>
                <th colSpan={1} className="p-1 px-2">Runtime</th>
              </tr>

              <tr className="bg-[#11131A] text-slate-400 uppercase text-[9px] border-b border-white/10 select-none">
                <th className="p-2 w-10 text-center">Actions</th>
                <th className="p-2 text-center w-8">ID</th>
                <th className="p-2 w-8 text-center">Sync</th>
                <th className="p-2">IP Address</th>
                <th className="p-2">StackOS Version</th>

                {/* Storage */}
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-right">Avail</th>

                {/* RAM */}
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-right">Avail</th>
                <th className="p-2 text-right">Free</th>

                {/* Swap */}
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-right">Avail</th>

                {/* JVM */}
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-right">Avail</th>

                {/* Loads */}
                <th className="p-2 text-center w-8">Procs</th>
                <th className="p-2 text-right">1m Avg</th>
                <th className="p-2 text-right">5m Avg</th>
                <th className="p-2 text-right">15m Avg</th>

                {/* Uptime */}
                <th className="p-2 text-right">Uptime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {managers.map((m) => (
                <tr key={m.id} className="hover:bg-cyan-500/[0.01] transition-colors leading-tight">
                  <td className="p-2 text-center text-white/30 text-[12px] select-none font-bold cursor-pointer hover:text-cyan-400">•••</td>
                  <td className="p-2 text-center font-bold text-white">{m.id}</td>
                  <td className="p-2 text-center select-none">
                    <span className="p-0.5 bg-emerald-500/10 text-emerald-400 rounded inline-block">
                      <Heart size={10} className="fill-emerald-400/25" />
                    </span>
                  </td>
                  <td className="p-2 font-bold text-cyan-350 select-all">{m.ip}</td>
                  <td className="p-2 text-slate-300 font-semibold">{m.version}</td>

                  {/* Storage */}
                  <td className="p-2 text-right text-slate-400">{m.hdTotal}</td>
                  <td className="p-2 text-right text-slate-300 font-semibold">{m.hdAvail}</td>

                  {/* RAM */}
                  <td className="p-2 text-right text-slate-400">{m.memTotal}</td>
                  <td className="p-2 text-right text-slate-300 font-semibold">{m.memAvail}</td>
                  <td className="p-2 text-right text-slate-400">{m.memFree}</td>

                  {/* Swap */}
                  <td className="p-2 text-right text-slate-400">{m.swapTotal}</td>
                  <td className="p-2 text-right text-slate-400">{m.swapAvail}</td>

                  {/* JVM */}
                  <td className="p-2 text-right text-slate-400">{m.jvmTotal}</td>
                  <td className="p-2 text-right text-slate-400">{m.jvmAvail}</td>

                  {/* CPU / loads */}
                  <td className="p-2 text-center text-slate-400 font-bold">{m.procs}</td>
                  <td className="p-2 text-right text-emerald-400 font-bold">{m.load1}</td>
                  <td className="p-2 text-right text-slate-350">{m.load5}</td>
                  <td className="p-2 text-right text-slate-350">{m.load15}</td>

                  {/* Runtime */}
                  <td className="p-2 text-right font-semibold text-white/80">{m.uptime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
