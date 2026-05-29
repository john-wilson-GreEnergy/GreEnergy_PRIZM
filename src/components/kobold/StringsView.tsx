import React, { useState, useMemo } from "react";
import { 
  Eye, 
  Heart, 
  Activity, 
  ArrowRightLeft, 
  AlertTriangle, 
  Search, 
  Filter, 
  Check, 
  Clock,
  ChevronDown
} from "lucide-react";

export default function StringsView() {
  const [arrayFilter, setArrayFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const sidebarStats = {
    communicating: 320,
    total: 320,
    onlineCount: 0,
    nearlineCount: 0,
    offlineCount: 320,
    offlineSoc: "24.3%",
    offlineCap: "118,800.0 kWh",
    offlineAvail: "34,062.2 kWh"
  };

  // Generate mock entries matching Screenshot 3 values
  const stringTelemetryList = useMemo(() => {
    const list = [];
    let count = 1;
    // Arrays 1 through 8
    for (let arr = 1; arr <= 8; arr++) {
      // 40 strings per Array
      for (let str = 1; str <= 40; str++) {
        // e.g. lineup ID, segment position
        const lineup = `L${arr}`;
        const segmentPos = str <= 20 ? 1 : 2;
        const segmentIdx = (arr - 1) * 2 + segmentPos;
        
        // Generate realistic offline parameters matching the screen capture:
        // Measured voltage ~ 1030-1045V when offline, bus voltage ~ 0V when contactor open, delta ~ 1030V
        const measVolt = 1045.2 - (Math.random() * 5);
        const calcVolt = measVolt;
        const busVolt = 0.0;
        const deltaVolt = measVolt;
        const current = 0.0;
        const kw = 0.0;
        const soc = parseFloat((23.5 + Math.sin(count / 10) * 4).toFixed(1));
        const kwh = parseFloat((14850 * (soc / 100) / 40).toFixed(1)); // capacity is 14850 per array, so ~ 371 kWh per string

        // Cell voltages ~ 3240mV min, 3270mV max, avg 3255mV, delta ~ 30mV
        const cellMin = Math.round(3235 + Math.sin(count / 5) * 12);
        const cellMax = Math.round(3268 + Math.cos(count / 4) * 8);
        const cellAvg = Math.round((cellMin + cellMax) / 2);
        const cellDelta = cellMax - cellMin;

        // Temperatures in Celsius ~ 19.5 to 22.8
        const tempMin = parseFloat((19.5 + Math.sin(count / 15) * 1.5).toFixed(1));
        const tempMax = parseFloat((22.0 + Math.cos(count / 12) * 1.2).toFixed(1));
        const tempAvg = parseFloat(((tempMin + tempMax) / 2).toFixed(1));
        const tempDelta = parseFloat((tempMax - tempMin).toFixed(1));

        const balanceMode = count % 7 === 0 ? "Passive" : "Idle";
        const chargeDb = 35;

        list.push({
          id: `${arr}::${str}`,
          array: arr,
          string: str,
          eyeStatus: "closed", // all off/contactor open
          communicating: true,
          contact: "open", // off
          inRot: "ok", // normal
          recloseCount: 1, // standard
          segmentIdx,
          lineupId: lineup,
          segmentPos,
          measVolt: measVolt.toFixed(2),
          calcVolt: calcVolt.toFixed(2),
          busVolt: busVolt.toFixed(2),
          deltaVolt: deltaVolt.toFixed(2),
          current: current.toFixed(2),
          kw: kw.toFixed(2),
          soc,
          kwh,
          cellMin,
          cellMax,
          cellAvg,
          cellDelta,
          tempMin,
          tempMax,
          tempAvg,
          tempDelta,
          balanceMode,
          chargeDb,
          timestamp: "2026-05-29 17:28:44"
        });
        count++;
      }
    }
    return list;
  }, []);

  // Filter list
  const filteredStrings = useMemo(() => {
    return stringTelemetryList.filter(s => {
      if (arrayFilter !== "ALL" && s.array.toString() !== arrayFilter) {
        return false;
      }
      if (statusFilter === "FAULTED") {
        return s.cellDelta > 35; // mock faulted threshold check
      }
      if (searchQuery) {
        return s.id.includes(searchQuery) || s.lineupId.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [stringTelemetryList, arrayFilter, statusFilter, searchQuery]);

  // Paginated elements
  const displayedStrings = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredStrings.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredStrings, currentPage]);

  const totalPages = Math.ceil(filteredStrings.length / itemsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-5 min-h-[600px] bg-[#08090C] text-slate-350 font-mono">
      
      {/* HIGH PROFILE SIDEBAR */}
      <div className="w-full md:w-56 shrink-0 bg-[#0E1017] border border-white/5 rounded p-3 text-[11px] space-y-4 select-none shadow-md">
        <div className="border-b border-white/5 pb-1 flex justify-between items-center bg-white/[0.01] px-1.5 py-0.5 rounded">
          <span className="text-[10px] uppercase font-bold text-slate-400">Strings Diagnostics</span>
          <span className="text-[9px] text-[#5CF2A5] font-bold">320 Configured</span>
        </div>

        {/* STATUS PANEL */}
        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Overview</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Communicating</span>
              <span className="text-emerald-400 font-bold">{sidebarStats.communicating}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Not Comm Link</span>
              <span className="text-white/30 font-bold">0</span>
            </div>
          </div>
        </div>

        {/* DETAILS FOR OFFLINE STATE */}
        <hr className="border-white/5" />
        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Offline Strings</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Active Count</span>
              <span className="text-white font-bold">{sidebarStats.offlineCount}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Online SoC</span>
              <span className="text-white/40">{sidebarStats.offlineSoc}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Energy Capacity</span>
              <span className="text-cyan-400 font-bold">{sidebarStats.offlineCap}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Avail Capacity</span>
              <span className="text-emerald-400 font-bold">{sidebarStats.offlineAvail}</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT MAIN PANEL DATA CONTAINER */}
      <div className="flex-1 space-y-4">
        
        {/* FILTERS TOOLBAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#11131A] p-2.5 rounded border border-white/5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Filter size={12} className="text-cyan-400" />
              <span className="text-white font-bold text-[10px] uppercase">Enclosure Array</span>
              <select 
                value={arrayFilter}
                onChange={(e) => { setArrayFilter(e.target.value); setCurrentPage(1); }}
                className="bg-black border border-white/10 rounded px-2 py-1 text-slate-300 font-mono text-[10px] focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="ALL">All Arrays (1-8)</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(a => (
                  <option key={a} value={a}>Array {a}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-white font-bold text-[10px] uppercase">Alarm Filter</span>
              <select 
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="bg-black border border-white/10 rounded px-2 py-1 text-slate-300 font-mono text-[10px] focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="ALL">All Strings</option>
                <option value="FAULTED">Imbalances (&gt; 30mV)</option>
              </select>
            </div>
          </div>

          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-2 text-white/30" />
            <input 
              type="text" 
              placeholder="Search String, e.g. 1::14..." 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="bg-black border border-white/10 rounded pl-7 pr-2 py-1 text-[10px] font-mono text-white placeholder-white/20 focus:outline-none focus:border-cyan-500 w-44"
            />
          </div>
        </div>

        {/* HIGH-DENSITY GRID TABLE CONTAINER */}
        <div className="border border-white/5 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-[10px] leading-normal border-collapse min-w-[1300px] block-tabular-theme">
            <thead>
              {/* GROUPED META HEADERS */}
              <tr className="bg-black/30 border-b border-white/[0.03] select-none text-slate-500 text-[9px] uppercase font-bold">
                <th colSpan={4} className="p-1 px-2 border-r border-white/5">Device Info</th>
                <th colSpan={4} className="p-1 px-2 border-r border-white/5">Rack Topology Address</th>
                <th colSpan={4} className="p-1 px-2 border-r border-white/5">Voltages (VDC)</th>
                <th colSpan={2} className="p-1 px-2 border-r border-white/5">Loads</th>
                <th colSpan={2} className="p-1 px-2 border-r border-white/5">Energy</th>
                <th colSpan={4} className="p-1 px-2 border-r border-white/5">Cell Voltages (mV)</th>
                <th colSpan={4} className="p-1 px-2 border-r border-white/5">Cell Temperatures (°C)</th>
                <th colSpan={2} className="p-1 px-2">Balancing Schema</th>
              </tr>

              <tr className="bg-[#11131A] text-slate-400 uppercase text-[9px] border-b border-white/10 select-none">
                <th className="p-2 text-center w-12">Actions</th>
                <th className="p-2 text-center w-14">String ID</th>
                <th className="p-2 text-center w-8">Link</th>
                <th className="p-2 text-center w-8">Sync</th>
                
                {/* Topology */}
                <th className="p-2 text-center w-10">Seg Idx</th>
                <th className="p-2 w-14">Lineup</th>
                <th className="p-2 text-center w-10">Cabinet</th>
                <th className="p-2 text-center w-10">Arr</th>

                {/* Voltage */}
                <th className="p-2 text-right">Meas.</th>
                <th className="p-2 text-right text-slate-400">Calc.</th>
                <th className="p-2 text-right text-slate-400">Bus</th>
                <th className="p-2 text-right text-slate-400 font-bold">Delta</th>

                {/* Power */}
                <th className="p-2 text-right">Amps (A)</th>
                <th className="p-2 text-right text-cyan-400 font-bold">kW</th>

                {/* Energy */}
                <th className="p-2 text-right text-cyan-400">SoC %</th>
                <th className="p-2 text-right">kWh</th>

                {/* Cell Voltage */}
                <th className="p-2 text-right">Min</th>
                <th className="p-2 text-right text-white">Max</th>
                <th className="p-2 text-right">Avg</th>
                <th className="p-2 text-right font-black text-cyan-300">Delta</th>

                {/* Cell Temp */}
                <th className="p-2 text-right">Min</th>
                <th className="p-2 text-right text-white">Max</th>
                <th className="p-2 text-right">Avg</th>
                <th className="p-2 text-right font-semibold text-emerald-400">Delta</th>

                {/* Balance */}
                <th className="p-2">Mode</th>
                <th className="p-2 text-right">Db</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {displayedStrings.length === 0 ? (
                <tr>
                  <td colSpan={26} className="p-10 text-center text-white/20 text-xs">
                    No string-level nodes match selection.
                  </td>
                </tr>
              ) : (
                displayedStrings.map((s, idx) => {
                  const hasAlarm = s.cellDelta > 30;
                  return (
                    <tr 
                      key={idx} 
                      className={`hover:bg-cyan-500/[0.01] transition-colors leading-tight ${hasAlarm ? "bg-amber-500/[0.02]" : ""}`}
                    >
                      <td className="p-2 text-center text-white/30 text-[12px] select-none font-bold cursor-pointer hover:text-cyan-400">•••</td>
                      <td className="p-2 text-center text-white font-bold">{s.id}</td>
                      <td className="p-2 text-center select-none">
                        <span className="p-0.5 bg-emerald-500/10 text-emerald-400 rounded inline-block">
                          <Eye size={10} className="stroke-[2.5]" />
                        </span>
                      </td>
                      <td className="p-2 text-center select-none">
                        <span className="p-0.5 bg-emerald-500/10 text-emerald-400 rounded inline-block">
                          <Heart size={10} className="fill-emerald-400/25" />
                        </span>
                      </td>
                      
                      {/* Topology Address */}
                      <td className="p-2 text-center text-cyan-400 font-bold">{s.segmentIdx}</td>
                      <td className="p-2 font-semibold text-slate-300">{s.lineupId}</td>
                      <td className="p-2 text-center text-slate-400">P{s.segmentPos}</td>
                      <td className="p-2 text-center text-cyan-300">{s.array}</td>

                      {/* Voltages */}
                      <td className="p-2 text-right text-emerald-400 font-bold">{s.measVolt}</td>
                      <td className="p-2 text-right text-slate-400/70">{s.calcVolt}</td>
                      <td className="p-2 text-right text-slate-400/70">{s.busVolt}</td>
                      <td className="p-2 text-right text-cyan-400 font-bold">{s.deltaVolt}</td>

                      {/* Power */}
                      <td className="p-2 text-right text-slate-300">{s.current}</td>
                      <td className="p-2 text-right text-white font-bold">{s.kw}</td>

                      {/* Energy */}
                      <td className="p-2 text-right text-cyan-400 font-bold">{s.soc}%</td>
                      <td className="p-2 text-right text-slate-300">{s.kwh}</td>

                      {/* Cell Voltages */}
                      <td className="p-2 text-right text-slate-400">{s.cellMin}</td>
                      <td className="p-2 text-right text-white font-semibold">{s.cellMax}</td>
                      <td className="p-2 text-right text-slate-400">{s.cellAvg}</td>
                      <td className={`p-2 text-right font-black ${hasAlarm ? "text-amber-400 animate-pulse" : "text-cyan-400"}`}>{s.cellDelta}</td>

                      {/* Cell Temperatures */}
                      <td className="p-2 text-right text-emerald-500">{s.tempMin}</td>
                      <td className="p-2 text-right text-white font-semibold">{s.tempMax}</td>
                      <td className="p-2 text-right text-slate-450">{s.tempAvg}</td>
                      <td className="p-2 text-right font-bold text-emerald-400">{s.tempDelta}</td>

                      {/* Balance schema */}
                      <td className={`p-2 font-bold ${s.balanceMode === "Passive" ? "text-cyan-400" : "text-slate-400/40"}`}>{s.balanceMode}</td>
                      <td className="p-2 text-right text-slate-400">{s.chargeDb}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROL ROW */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center bg-[#0C0D12] border border-white/5 p-2 px-3 rounded-md text-xs">
            <span className="text-white/40 font-mono text-[10px]">
              Showing {currentPage * itemsPerPage - itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredStrings.length)} of {filteredStrings.length} Racks
            </span>
            <div className="flex gap-1.5 font-mono text-[10px]">
              <button 
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-2.5 py-1 bg-white/[0.02] hover:bg-white/5 border border-white/10 rounded cursor-pointer text-white disabled:opacity-35 disabled:cursor-not-allowed uppercase font-bold"
              >
                Prev
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-2.5 py-1 rounded font-bold cursor-pointer font-mono ${
                      currentPage === pageNum 
                        ? "bg-cyan-500 text-black border border-cyan-400" 
                        : "bg-white/[0.02] border border-white/10 hover:bg-white/5 text-white"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button 
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 bg-white/[0.02] hover:bg-white/5 border border-white/10 rounded cursor-pointer text-white disabled:opacity-35 disabled:cursor-not-allowed uppercase font-bold"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
