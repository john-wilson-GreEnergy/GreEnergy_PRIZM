import React, { useState } from "react";
import { 
  Check, 
  Heart, 
  Activity, 
  AlertTriangle, 
  Wind, 
  Thermometer, 
  ShieldAlert, 
  Sliders, 
  Search,
  Filter
} from "lucide-react";

export default function SegmentsView() {
  const [arrayFilter, setArrayFilter] = useState("ALL");
  const [hideHealthy, setHideHealthy] = useState(false);

  const environmentStats = {
    airTempMin: "18.1 °C",
    airTempMax: "23.4 °C",
    airTempAvg: "21.1 °C",
    humidityMin: "34.0 %",
    humidityMax: "44.5 %",
    humidityAvg: "38.2 %"
  };

  const sensorCounters = [
    { name: "Heat Sensors", status: "480 / 480 Untripped" },
    { name: "Env Ventilation", status: "160 / 160 Untripped" },
    { name: "Door Sensors", status: "344 / 344 Untripped" },
    { name: "Gas Sensors", status: "320 / 320 Untripped" },
    { name: "HVAC PLC Modules", status: "158 / 160 Healthy" }
  ];

  // Energy segments with detailed topology matching Screenshot 4 structure
  const segments = [
    { index: 12, healthy: true, lineup: "Lineup 1", pos: 1, array: 1, strings: "1::1 - 1::2", envCtrls: "EC-12", fireTrouble: "ok", moisture: "ok", data: "ok", io: "ok", topCapDoors: "closed", batDoors: "closed", hvacHealthy: true, hvacHumidity: 38, hvacAirTemp: 21.0, hvacCellTemp: 23.4, hvacCoolTo: 22.0, hvacHeatTo: 18.0, hvacRespondTo: "Air Temp", hvacStage: "Lead Cooling", hvacSignals: "cool1_on | fan1_high" },
    { index: 38, healthy: true, lineup: "Lineup 1", pos: 2, array: 1, strings: "1::3 - 1::4", envCtrls: "EC-38", fireTrouble: "ok", moisture: "ok", data: "ok", io: "ok", topCapDoors: "closed", batDoors: "closed", hvacHealthy: true, hvacHumidity: 37, hvacAirTemp: 20.8, hvacCellTemp: 22.9, hvacCoolTo: 22.0, hvacHeatTo: 18.0, hvacRespondTo: "Air Temp", hvacStage: "Idle", hvacSignals: "fan1_low" },
    { index: 41, healthy: true, lineup: "Lineup 2", pos: 1, array: 2, strings: "2::1 - 2::2", envCtrls: "EC-41", fireTrouble: "ok", moisture: "ok", data: "ok", io: "ok", topCapDoors: "closed", batDoors: "closed", hvacHealthy: true, hvacHumidity: 39, hvacAirTemp: 21.5, hvacCellTemp: 24.1, hvacCoolTo: 22.0, hvacHeatTo: 18.0, hvacRespondTo: "Air Temp", hvacStage: "Lead Cooling", hvacSignals: "cool1_on | fan1_high" },
    { index: 44, healthy: true, lineup: "Lineup 2", pos: 2, array: 2, strings: "2::3 - 2::4", envCtrls: "EC-44", fireTrouble: "ok", moisture: "ok", data: "ok", io: "ok", topCapDoors: "closed", batDoors: "closed", hvacHealthy: false, hvacHumidity: 45, hvacAirTemp: 25.4, hvacCellTemp: 29.8, hvacCoolTo: 22.0, hvacHeatTo: 18.0, hvacRespondTo: "Cell Temp", hvacStage: "High Cooling Stage 2", hvacSignals: "cool1_on | cool2_on | fan1_high", hasTrippedSensor: true },
    { index: 85, healthy: true, lineup: "Lineup 3", pos: 1, array: 3, strings: "3::1 - 3::2", envCtrls: "EC-85", fireTrouble: "ok", moisture: "ok", data: "ok", io: "ok", topCapDoors: "closed", batDoors: "closed", hvacHealthy: true, hvacHumidity: 38, hvacAirTemp: 21.0, hvacCellTemp: 23.4, hvacCoolTo: 22.0, hvacHeatTo: 18.0, hvacRespondTo: "Air Temp", hvacStage: "Lead Cooling", hvacSignals: "cool1_on | fan1_high" },
    { index: 92, healthy: true, lineup: "Lineup 3", pos: 2, array: 3, strings: "3::3 - 3::4", envCtrls: "EC-92", fireTrouble: "ok", moisture: "ok", data: "ok", io: "ok", topCapDoors: "closed", batDoors: "closed", hvacHealthy: true, hvacHumidity: 37, hvacAirTemp: 20.8, hvacCellTemp: 22.9, hvacCoolTo: 22.0, hvacHeatTo: 18.0, hvacRespondTo: "Air Temp", hvacStage: "Idle", hvacSignals: "fan1_low" },
    { index: 110, healthy: true, lineup: "Lineup 4", pos: 1, array: 4, strings: "4::1 - 4::2", envCtrls: "EC-110", fireTrouble: "ok", moisture: "ok", data: "ok", io: "ok", topCapDoors: "closed", batDoors: "closed", hvacHealthy: true, hvacHumidity: 39, hvacAirTemp: 21.5, hvacCellTemp: 24.1, hvacCoolTo: 22.0, hvacHeatTo: 18.0, hvacRespondTo: "Air Temp", hvacStage: "Lead Cooling", hvacSignals: "cool1_on | fan1_high" },
    { index: 147, healthy: true, lineup: "Lineup 4", pos: 2, array: 4, strings: "4::3 - 4::4", envCtrls: "EC-147", fireTrouble: "ok", moisture: "ok", data: "ok", io: "ok", topCapDoors: "closed", batDoors: "closed", hvacHealthy: true, hvacHumidity: 37, hvacAirTemp: 20.8, hvacCellTemp: 22.9, hvacCoolTo: 22.0, hvacHeatTo: 18.0, hvacRespondTo: "Air Temp", hvacStage: "Idle", hvacSignals: "fan1_low" },
  ];

  const filteredSegments = segments.filter(seg => {
    if (arrayFilter !== "ALL" && seg.array.toString() !== arrayFilter) {
      return false;
    }
    if (hideHealthy && !seg.hasTrippedSensor && seg.hvacHealthy) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col md:flex-row gap-5 min-h-[600px] bg-[#08090C] text-slate-350 font-mono">
      
      {/* HIGH DENSITY SIDE PANEL */}
      <div className="w-full md:w-56 shrink-0 bg-[#0E1017] border border-white/5 rounded p-3 text-[11px] space-y-4 select-none shadow-md">
        <div className="border-b border-white/5 pb-1 flex justify-between items-center bg-white/[0.01] px-1.5 py-0.5 rounded">
          <span className="text-[10px] uppercase font-bold text-slate-400">Environment</span>
          <span className="text-[9px] text-[#5CF2A5] font-bold">PLCs Online</span>
        </div>

        {/* CLIMATE BOUNDS */}
        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Air Temperature</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Min Bounds</span>
              <span className="text-[#38BDF8] font-bold">{environmentStats.airTempMin}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Max Bounds</span>
              <span className="text-rose-400 font-bold">{environmentStats.airTempMax}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Site Average</span>
              <span className="text-white font-bold">{environmentStats.airTempAvg}</span>
            </div>
          </div>
        </div>

        {/* HUMIDITY INDEX */}
        <hr className="border-white/5" />
        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Enclosure Humidity</div>
          <div className="space-y-1.5 pl-1.5 pr-1">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Min Humidity</span>
              <span className="text-slate-300">{environmentStats.humidityMin}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Max Humidity</span>
              <span className="text-slate-300">{environmentStats.humidityMax}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px]">Site Average</span>
              <span className="text-white font-bold">{environmentStats.humidityAvg}</span>
            </div>
          </div>
        </div>

        {/* HARDWARE SENSORS FEED */}
        <hr className="border-white/5" />
        <div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Sensor Array Status</div>
          <div className="space-y-2 pl-1">
            {sensorCounters.map((sen, idx) => (
              <div key={idx} className="flex flex-col gap-0.5">
                <span className="text-slate-400 text-[10px] uppercase font-semibold leading-none">{sen.name}</span>
                <span className="text-emerald-400 font-bold text-[9px] tracking-tight">{sen.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT MAIN LAYOUT GRID */}
      <div className="flex-1 space-y-4">
        
        {/* TAB CONTROLLERS AND PLIERS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#11131A] p-2.5 rounded border border-white/5 text-xs">
          <div className="flex items-center gap-1.5">
            <Wind size={12} className="text-cyan-400" />
            <span className="font-bold text-white text-[11px] uppercase">Energy Segments (160 Zones)</span>
          </div>
          <div className="flex gap-2 font-mono text-[10px]">
            <select 
              value={arrayFilter}
              onChange={(e) => setArrayFilter(e.target.value)}
              className="bg-black border border-white/10 rounded px-1.5 py-0.5 text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="ALL">All Arrays</option>
              <option value="1">Array 1</option>
              <option value="2">Array 2</option>
              <option value="3">Array 3</option>
              <option value="4">Array 4</option>
            </select>
            <label className="flex items-center gap-1 cursor-pointer font-bold uppercase text-white/60 hover:text-white select-none">
              <input 
                type="checkbox" 
                checked={hideHealthy}
                onChange={() => setHideHealthy(!hideHealthy)}
                className="rounded border-white/10 accent-cyan-500 bg-black cursor-pointer"
              />
              Show Anomalies Only
            </label>
          </div>
        </div>

        {/* DATA TABLE GRAPH */}
        <div className="border border-white/5 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-[10px] leading-normal border-collapse min-w-[1250px] block-tabular-theme">
            <thead>
              {/* GROUPED LABELS */}
              <tr className="bg-black/30 border-b border-white/[0.03] select-none text-slate-500 text-[9px] uppercase font-bold">
                <th colSpan={3} className="p-1 px-2 border-r border-white/5">Segment</th>
                <th colSpan={5} className="p-1 px-2 border-r border-white/5">Topology Addresses</th>
                <th colSpan={6} className="p-1 px-2 border-r border-white/5">Discrete Sensors (BESS Enclosure Lines)</th>
                <th colSpan={10} className="p-1 px-2">Embedded HVAC / Centipede Controllers</th>
              </tr>

              <tr className="bg-[#11131A] text-slate-400 uppercase text-[9px] border-b border-white/10 select-none">
                <th className="p-2 w-10 text-center">Actions</th>
                <th className="p-2 w-10 text-center">Index</th>
                <th className="p-2 w-8 text-center">Sync</th>

                {/* Topology */}
                <th className="p-2">Lineup</th>
                <th className="p-2 text-center w-10">Cabinet</th>
                <th className="p-2 text-center w-8">Array</th>
                <th className="p-2 text-center">String Series</th>
                <th className="p-2 text-center">Env Ctrl</th>

                {/* Discrete Sensors */}
                <th className="p-2 text-center w-12">Fire Svs</th>
                <th className="p-2 text-center w-12">Moist Svs</th>
                <th className="p-2 text-center w-12">Data Link</th>
                <th className="p-2 text-center w-12">IO Link</th>
                <th className="p-2 text-center w-12">Cap Door</th>
                <th className="p-2 text-center w-12">Base Door</th>

                {/* HVAC parameters */}
                <th className="p-2 text-center w-8">Sync</th>
                <th className="p-2 text-right">Humid%</th>
                <th className="p-2 text-right">AirT°C</th>
                <th className="p-2 text-right text-white">CellT°C</th>
                <th className="p-2 text-right">CoolTo</th>
                <th className="p-2 text-right">HeatTo</th>
                <th className="p-2">PID Source</th>
                <th className="p-2 font-bold text-center">HVAC Stage</th>
                <th className="p-2">Signals Output Matrix</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredSegments.map((seg) => (
                <tr 
                  key={seg.index} 
                  className={`hover:bg-cyan-500/[0.01] transition-colors leading-tight ${
                    !seg.hvacHealthy ? "bg-rose-500/[0.03] text-rose-100" : ""
                  }`}
                >
                  <td className="p-2 text-center text-white/30 text-[12px] font-bold cursor-pointer hover:text-cyan-400 select-none">•••</td>
                  <td className="p-2 text-center text-white font-bold">{seg.index}</td>
                  <td className="p-2 text-center select-none">
                    <span className="p-0.5 bg-emerald-500/10 text-emerald-400 rounded inline-block">
                      <Heart size={10} className="fill-emerald-400/25" />
                    </span>
                  </td>

                  {/* Topology */}
                  <td className="p-2 font-bold text-slate-300">{seg.lineup}</td>
                  <td className="p-2 text-center text-slate-400">P{seg.pos}</td>
                  <td className="p-2 text-center text-cyan-400 font-bold">{seg.array}</td>
                  <td className="p-2 text-center text-slate-350">{seg.strings}</td>
                  <td className="p-2 text-center font-bold text-cyan-300">{seg.envCtrls}</td>

                  {/* Discrete Sensors (LED dots) */}
                  <td className="p-2 text-center">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" title="Fire Untripped"></span>
                  </td>
                  <td className="p-2 text-center">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" title="Moisture Untripped"></span>
                  </td>
                  <td className="p-2 text-center">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" title="Modbus Data Link Online"></span>
                  </td>
                  <td className="p-2 text-center">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" title="Aux IO Board Online"></span>
                  </td>
                  <td className="p-2 text-center">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" title="Cap Door Closed"></span>
                  </td>
                  <td className="p-2 text-center">
                    <span className={`h-2 w-2 rounded-full inline-block ${seg.hasTrippedSensor ? "bg-rose-500 animate-ping" : "bg-emerald-500"}`} title={seg.hasTrippedSensor ? "DC Door Open Alert!" : "DC Door Closed"}></span>
                  </td>

                  {/* Embedded HVAC values */}
                  <td className="p-2 text-center select-none">
                    <span className={`p-0.5 rounded inline-block ${seg.hvacHealthy ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400 animate-pulse"}`}>
                      <Heart size={10} className={seg.hvacHealthy ? "fill-emerald-400/25" : "fill-rose-400/25"} />
                    </span>
                  </td>
                  <td className="p-2 text-right">{seg.hvacHumidity}%</td>
                  <td className="p-2 text-right">{seg.hvacAirTemp}°C</td>
                  <td className={`p-2 text-right font-black ${!seg.hvacHealthy ? "text-rose-400 animate-pulse" : "text-emerald-400"}`}>
                    {seg.hvacCellTemp}°C
                  </td>
                  <td className="p-2 text-right text-cyan-400">{seg.hvacCoolTo}°C</td>
                  <td className="p-2 text-right text-rose-400">{seg.hvacHeatTo}°C</td>
                  <td className="p-2 text-slate-400">{seg.hvacRespondTo}</td>
                  
                  {/* HVAC Status Stages */}
                  <td className="p-2 text-center">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase ${
                      seg.hvacStage === "Idle" ? "bg-slate-500/10 text-slate-400 border border-slate-550/10" :
                      seg.hvacStage.includes("High") ? "bg-rose-500/15 text-rose-405 border border-rose-500/10" :
                      "bg-cyan-500/10 text-cyan-400 border border-cyan-550/10"
                    }`}>
                      {seg.hvacStage}
                    </span>
                  </td>
                  <td className="p-2 text-slate-500 text-[9.5px] whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]" title={seg.hvacSignals}>
                    {seg.hvacSignals}
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
