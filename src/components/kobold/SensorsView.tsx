import React, { useState } from "react";
import { 
  Flame, 
  DoorOpen, 
  Droplet, 
  ShieldAlert, 
  Wifi, 
  HelpCircle,
  Activity,
  AlertTriangle,
  Search
} from "lucide-react";

interface SensorsViewProps {
  lateralSensors?: {
    name: string;
    status: string;
    color: string;
  }[];
  sensorRows?: {
    segment: number;
    lineup: string;
    pos: string;
    array: number;
    moisture: string;
    ioCom: string;
    acDoors: string;
    dcDoors: string;
    topCap: string;
    batteryDoors: string;
    eStop: string;
    hasAlarm?: boolean;
  }[];
}

export default function SensorsView({ lateralSensors: propLateralSensors, sensorRows: propSensorRows }: SensorsViewProps = {}) {
  const [searchQuery, setSearchQuery] = useState("");

  const lateralSensors = propLateralSensors || [
    { name: "Fire Sensor Panel", status: "Untripped", color: "text-emerald-400" },
    { name: "Smoke Optical Matrix", status: "Untripped", color: "text-emerald-400" },
    { name: "Heat Thermistors", status: "Untripped", color: "text-emerald-400" },
    { name: "Hydrogen Gas sensor", status: "Untripped", color: "text-emerald-400" },
    { name: "Hydrogen Fault monitor", status: "Untripped", color: "text-emerald-400" },
    { name: "Data Aux Communication", status: "Stable", color: "text-emerald-400" },
    { name: "IO Board Communication", status: "Stable", color: "text-emerald-400" },
    { name: "AC Cabinet Doors", status: "All Closed", color: "text-emerald-400" },
    { name: "DC Battery Doors", status: "1 Open Triggered", color: "text-rose-400 animate-pulse" },
    { name: "Top Cap Enclosure Lid", status: "All Closed", color: "text-emerald-400" },
    { name: "Manual Ventilation Stage", status: "Resting", color: "text-slate-400" }
  ];

  const sensorRows = propSensorRows || [
    { segment: 12, lineup: "Lineup 1", pos: "P1", array: 1, moisture: "Untripped", ioCom: "Online", acDoors: "Closed", dcDoors: "Closed", topCap: "Closed", batteryDoors: "Closed", eStop: "Untripped" },
    { segment: 38, lineup: "Lineup 1", pos: "P2", array: 1, moisture: "Untripped", ioCom: "Online", acDoors: "Closed", dcDoors: "Closed", topCap: "Closed", batteryDoors: "Closed", eStop: "Untripped" },
    { segment: 41, lineup: "Lineup 2", pos: "P1", array: 2, moisture: "Untripped", ioCom: "Online", acDoors: "Closed", dcDoors: "Closed", topCap: "Closed", batteryDoors: "Closed", eStop: "Untripped" },
    { segment: 44, lineup: "Lineup 2", pos: "P2", array: 2, moisture: "Untripped", ioCom: "Online", acDoors: "Closed", dcDoors: "OPEN TRIPPED", topCap: "Closed", batteryDoors: "Closed", eStop: "Untripped", hasAlarm: true },
    { segment: 85, lineup: "Lineup 3", pos: "P1", array: 3, moisture: "Untripped", ioCom: "Online", acDoors: "Closed", dcDoors: "Closed", topCap: "Closed", batteryDoors: "Closed", eStop: "Untripped" },
    { segment: 92, lineup: "Lineup 3", pos: "P2", array: 3, moisture: "Untripped", ioCom: "Online", acDoors: "Closed", dcDoors: "Closed", topCap: "Closed", batteryDoors: "Closed", eStop: "Untripped" },
    { segment: 110, lineup: "Lineup 4", pos: "P1", array: 4, moisture: "Untripped", ioCom: "Online", acDoors: "Closed", dcDoors: "Closed", topCap: "Closed", batteryDoors: "Closed", eStop: "Untripped" },
    { segment: 147, lineup: "Lineup 4", pos: "P2", array: 4, moisture: "Untripped", ioCom: "Online", acDoors: "Closed", dcDoors: "Closed", topCap: "Closed", batteryDoors: "Closed", eStop: "Untripped" },
  ];

  const filteredRows = sensorRows.filter(row => {
    if (searchQuery) {
      return row.segment.toString().includes(searchQuery) || row.lineup.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <div className="flex flex-col md:flex-row gap-5 min-h-[600px] bg-[#08090C] text-slate-350 font-mono">
      
      {/* SIDEBAR SENSORS INDEX */}
      <div className="w-full md:w-56 shrink-0 bg-[#0E1017] border border-white/5 rounded p-3 text-[11px] space-y-4 select-none shadow-md">
        <div className="border-b border-white/5 pb-1 flex justify-between items-center bg-white/[0.01] px-1.5 py-0.5 rounded">
          <span className="text-[10px] uppercase font-bold text-slate-400">Safety Index</span>
          <span className="text-[9px] text-rose-400 font-bold">1 Alarm</span>
        </div>

        <div className="space-y-2.5 pl-1">
          {lateralSensors.map((sen, idx) => (
            <div key={idx} className="flex justify-between items-center border-b border-white/[0.02] pb-1">
              <span className="text-slate-400 text-[10px] uppercase">{sen.name}</span>
              <span className={`font-bold text-[10px] ${sen.color}`}>{sen.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN TARGET CELL */}
      <div className="flex-1 space-y-4">
        
        {/* UPPER CONTROLLER HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#11131A] p-2.5 rounded border border-white/5 text-xs">
          <div className="flex items-center gap-1.5">
            <ShieldAlert size={12} className="text-cyan-400" />
            <span className="font-bold text-white text-[11px] uppercase">Discrete Sensors Status (1,840 Active Transducers)</span>
          </div>
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-2 text-white/30" />
            <input 
              type="text" 
              placeholder="Search segment..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-black border border-white/10 rounded pl-7 pr-2 py-1 text-[10px] font-mono text-white placeholder-white/20 focus:outline-none focus:border-cyan-500 w-36"
            />
          </div>
        </div>

        {/* MAIN SENSORS TABLE DATA STREAM */}
        <div className="border border-white/5 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-[11px] leading-normal border-collapse min-w-[950px] block-tabular-theme">
            <thead>
              {/* GROUPS */}
              <tr className="bg-black/30 border-b border-white/[0.03] select-none text-slate-500 text-[9px] uppercase font-bold">
                <th colSpan={1} className="p-1 px-2 border-r border-white/5">Index</th>
                <th colSpan={4} className="p-1 px-2 border-r border-white/5">Topology Address</th>
                <th colSpan={1} className="p-1 px-2 border-r border-white/5">Safety Sensor</th>
                <th colSpan={1} className="p-1 px-2 border-r border-white/5">Comms</th>
                <th colSpan={4} className="p-1 px-2 border-r border-white/5">Enclosure Door Enclosures</th>
                <th colSpan={1} className="p-1 px-2">E-Stop</th>
              </tr>

              <tr className="bg-[#11131A] text-slate-400 uppercase text-[9px] border-b border-white/10 select-none">
                <th className="p-2 w-10 text-center">Actions</th>
                <th className="p-2 text-center w-12">Segment</th>
                <th className="p-2">Lineup ID</th>
                <th className="p-2 text-center w-10">Cabinet</th>
                <th className="p-2 text-center w-12">Array</th>

                {/* Moisture */}
                <th className="p-2 text-center">Moisture Alarm</th>

                {/* IO */}
                <th className="p-2 text-center">Aux IO Port</th>

                {/* Doors */}
                <th className="p-2 text-center">AC Door</th>
                <th className="p-2 text-center">DC Door</th>
                <th className="p-2 text-center">Lid Open</th>
                <th className="p-2 text-center">Aux Door</th>

                {/* EStop */}
                <th className="p-2 text-center">Modbus E-Stop</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredRows.map((row) => (
                <tr 
                  key={row.segment} 
                  className={`hover:bg-cyan-500/[0.01] transition-colors leading-tight ${
                    row.hasAlarm ? "bg-rose-500/[0.03] text-rose-100 font-bold" : ""
                  }`}
                >
                  <td className="p-2 text-center text-white/30 text-[12px] select-none font-bold cursor-pointer hover:text-cyan-400">•••</td>
                  <td className="p-2 text-center text-white font-bold">{row.segment}</td>
                  <td className="p-2 font-bold text-slate-350">{row.lineup}</td>
                  <td className="p-2 text-center text-slate-450">{row.pos}</td>
                  <td className="p-2 text-center text-cyan-400 font-bold">{row.array}</td>

                  {/* Moisture */}
                  <td className="p-2 text-center">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/10">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      {row.moisture}
                    </span>
                  </td>

                  {/* IO comms */}
                  <td className="p-2 text-center">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/10">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      {row.ioCom}
                    </span>
                  </td>

                  {/* AC Door */}
                  <td className="p-2 text-center text-slate-400">{row.acDoors}</td>

                  {/* DC Door */}
                  <td className="p-2 text-center">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      row.dcDoors === "Closed" 
                        ? "bg-slate-500/10 text-slate-400" 
                        : "bg-rose-550/15 text-rose-400 border border-rose-500/20 animate-pulse"
                    }`}>
                      {row.dcDoors}
                    </span>
                  </td>

                  {/* Lid open */}
                  <td className="p-2 text-center text-slate-400">{row.topCap}</td>

                  {/* Battery doors */}
                  <td className="p-2 text-center text-slate-400">{row.batteryDoors}</td>

                  {/* Estop */}
                  <td className="p-2 text-center">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/10">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      {row.eStop}
                    </span>
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
