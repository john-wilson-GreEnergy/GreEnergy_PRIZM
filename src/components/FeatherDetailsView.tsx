import React, { useState } from "react";
import {
  ChevronLeft,
  RefreshCw,
  Activity,
  AlertTriangle,
  Flame,
  CheckCircle2,
  XCircle,
  Database
} from "lucide-react";
import { FeatherHvacDevice } from "../server/feather/deviceEnrichment";
import { formatTemperatureF } from "../utils/temperatureScale";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from "recharts";

interface FeatherDetailsViewProps {
  selectedDevice: FeatherHvacDevice;
  onBack: () => void;
  triggerDevicePoll: () => Promise<void>;
  isPollingDevice: boolean;
  selectedDeviceInterval: string;
  setSelectedDeviceInterval: (val: string) => void;
  samples: Array<{
    timestamp: string;
    timeLabel: string;
    hvac1Current: number;
    hvac2Current: number;
    hvac1Rpm: number;
    hvac2Rpm: number;
    spaceTemp: number;
    cellTemp: number;
  }>;
  pairedStrings: any[];
  detectHvacMismatch: (device: any) => { isMismatched: boolean; mismatchType: string; description: string };
}

export default function FeatherDetailsView({
  selectedDevice,
  onBack,
  triggerDevicePoll,
  isPollingDevice,
  selectedDeviceInterval,
  setSelectedDeviceInterval,
  samples,
  pairedStrings,
  detectHvacMismatch
}: FeatherDetailsViewProps) {
  const [advancedDrawerShowJson, setAdvancedDrawerShowJson] = useState<boolean>(false);

  const sensorRows = [
    { label: "Heat Sensor", value: selectedDevice.fssSignals?.heatSensor, type: "Alarm" },
    { label: "Smoke Alarm", value: selectedDevice.fssSignals?.smokeAlarm, type: "Alarm" },
    { label: "Fire Trouble", value: selectedDevice.fssSignals?.fireTrouble, type: "Trouble" },
    { label: "Hydrogen Alarm", value: selectedDevice.fssSignals?.hydrogenAlarm, type: "Alarm" },
    { label: "Hydrogen Fault", value: selectedDevice.fssSignals?.hydrogenFault, type: "Fault" },
    { label: "Moisture / Leak Alarm", value: selectedDevice.fssSignals?.leakAlarm, type: "Alarm" },
    { label: "FSS Alarm", value: selectedDevice.fssSignals?.fssAlarm, type: "Alarm" },
    { label: "FSS Trouble", value: selectedDevice.fssSignals?.fssTrouble, type: "Trouble" },
    { label: "StatX Release", value: selectedDevice.fssSignals?.statXRelease, type: "Release" },
    { label: "Louver/Vent Open", value: selectedDevice.fssSignals?.louverOpen, type: "Status" },
    { label: "Battery Doors Closed", value: selectedDevice.doors?.batteryDoorsClosed, type: "Status" },
    { label: "Top Cap Doors Closed", value: selectedDevice.doors?.lowerTopcapClosed, type: "Status" },
    { label: "DC Doors Closed", value: selectedDevice.doors?.dcDoorsClosed, type: "Status" },
    { label: "AC Doors Closed", value: selectedDevice.doors?.acDoorsClosed, type: "Status" },
  ];

  const esNum = selectedDevice.stringIndex ? Math.ceil(Number(selectedDevice.stringIndex) / 2) : 1;

  // Detect mismatch for detailed cards
  const mismatch1 = detectHvacMismatch({ hvac1: selectedDevice.hvac1 });
  const mismatch2 = detectHvacMismatch({ hvac2: selectedDevice.hvac2 });

  return (
    <div className="space-y-6 w-full animate-fade-in text-[#D1D5DB] font-mono text-[11px]">
      {/* Back breadcrumb and Action toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-prizm-surface border border-prizm-border rounded-lg p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 bg-black/30 hover:bg-black/50 border border-prizm-border rounded text-prizm-primary font-bold cursor-pointer transition-colors text-[10px]"
          >
            <ChevronLeft size={14} /> BACK TO LIST
          </button>
          <div className="h-6 w-[1px] bg-prizm-border" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-prizm-text-muted font-bold">FEATHER DEVICE DIAGNOSTICS</span>
              <span className={`h-2 w-2 rounded-full ${selectedDevice.reachable ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
            </div>
            <h1 className="text-base font-bold text-prizm-text tracking-tight mt-0.5">
              {selectedDevice.ip} — {selectedDevice.entityDescription || "Unmapped Enclosure Controller"}
            </h1>
          </div>
        </div>

        {/* Polling Selection & Manual Poll button */}
        <div className="flex flex-wrap items-center gap-3 bg-black/20 p-2 border border-prizm-border/60 rounded">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase font-bold text-prizm-text-muted">Targeted Polling Interval:</span>
            <select
              value={selectedDeviceInterval}
              onChange={(e) => setSelectedDeviceInterval(e.target.value)}
              className="bg-prizm-surface-strong border border-prizm-border rounded px-2 py-1 text-[10px] text-prizm-text focus:outline-none font-mono"
            >
              <option value="Pause">PAUSED / MANUAL ONLY</option>
              <option value="2000">2s Interval</option>
              <option value="5000">5s Interval</option>
              <option value="10000">10s Interval</option>
              <option value="30000">30s Interval</option>
            </select>
          </div>
          
          <button
            onClick={triggerDevicePoll}
            disabled={isPollingDevice}
            className="flex items-center gap-1.5 px-3 py-1 bg-prizm-primary text-black font-black uppercase tracking-wider rounded hover:bg-cyan-400 disabled:opacity-50 transition-colors text-[10px] cursor-pointer"
          >
            <RefreshCw size={11} className={isPollingDevice ? "animate-spin" : ""} />
            {isPollingDevice ? "Polling..." : "Manual Poll"}
          </button>
        </div>
      </div>

      {/* 3-Column Diagnostic Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Identity & Metadata Card */}
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="border-b border-prizm-border pb-2 mb-3 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-primary">System Identity</span>
              <span className="text-[9px] text-prizm-text-muted">IP Mode: static</span>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-prizm-text-muted">Direct IP Address:</span>
                <span className="text-prizm-text font-bold">{selectedDevice.ip}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-prizm-text-muted">Entity Name:</span>
                <span className="text-prizm-text font-bold text-right">{selectedDevice.entityDescription || "Unmapped"}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-prizm-text-muted">Hardware Slot / Array:</span>
                <span className="text-prizm-text font-bold">Array {selectedDevice.arrayIndex ?? "?"}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-prizm-text-muted">String Index / Segment:</span>
                <span className="text-prizm-text font-bold">String {selectedDevice.stringIndex ?? "?"} ({selectedDevice.segmentLabel || "No Label"})</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-prizm-text-muted">Firmware Version:</span>
                <span className="text-prizm-text font-bold">{selectedDevice.firmwareVersion || selectedDevice.softwareVersion || "Not reported"}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-prizm-text-muted">Reachability Response:</span>
                <span className={`font-black uppercase ${selectedDevice.reachable ? "text-emerald-400" : "text-prizm-danger"}`}>
                  {selectedDevice.reachable ? `ONLINE (${selectedDevice.pingMs ?? 0} ms)` : "OFFLINE / UNREACHABLE"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-prizm-text-muted">Discovery Method:</span>
                <span className="text-prizm-text font-bold uppercase">{selectedDevice.discoveryMethod || "manual"}</span>
              </div>
            </div>
          </div>

          {/* Pipeline Diagnostics */}
          <div className="bg-prizm-surface-strong border border-prizm-border/40 p-3 rounded mt-4">
            <span className="text-[9px] uppercase tracking-wider text-prizm-text-muted font-bold block mb-2">SOURCE PIPELINE COVERAGE</span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[9px]">
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">Direct Feather:</span>
                <span className={selectedDevice.sourceCoverage?.directFeather ? "text-emerald-400 font-bold" : "text-prizm-text-muted"}>
                  {selectedDevice.sourceCoverage?.directFeather ? "Sourced" : "Failed"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">Topology Index:</span>
                <span className={selectedDevice.sourceCoverage?.blockviewer ? "text-emerald-400 font-bold" : "text-prizm-text-muted"}>
                  {selectedDevice.sourceCoverage?.blockviewer ? "Sourced" : "Missing"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">String IP Map:</span>
                <span className={selectedDevice.sourceCoverage?.stringIpMap ? "text-emerald-400 font-bold" : "text-prizm-text-muted"}>
                  {selectedDevice.sourceCoverage?.stringIpMap ? "Sourced" : "Missing"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">IP Translation Map:</span>
                <span className={selectedDevice.sourceCoverage?.ipMap ? "text-emerald-400 font-bold" : "text-prizm-text-muted"}>
                  {selectedDevice.sourceCoverage?.ipMap ? "Sourced" : "Missing"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Detector & Sensor Status Table Card */}
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4">
          <div className="border-b border-prizm-border pb-2 mb-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-primary">Detector & Sensor Status</span>
            <span className="text-[9px] text-prizm-text-muted">MIO Board: Active</span>
          </div>
          <div className="overflow-y-auto max-h-[300px] divide-y divide-white/5 pr-1">
            {sensorRows.map((s, idx) => {
              let badgeClass = "bg-black/30 text-prizm-text-muted/60";
              let textValue = "--";

              if (s.value !== undefined && s.value !== null) {
                const isTrue = s.value === true;
                
                // For doors, "closed" is the true state and represents Normal (green).
                if (s.label.includes("Closed")) {
                  textValue = isTrue ? "CLOSED" : "OPEN";
                  badgeClass = isTrue 
                    ? "bg-green-500/10 text-emerald-400 border border-green-500/20" 
                    : "bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/20 font-black animate-pulse";
                } else {
                  // For alarms, "true" is active Alarm (red).
                  textValue = isTrue ? "ACTIVE / FAULT" : "NORMAL";
                  if (isTrue) {
                    badgeClass = s.type === "Alarm" || s.type === "Release"
                      ? "bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/20 font-black animate-pulse"
                      : "bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/20 font-black";
                  } else {
                    badgeClass = "bg-green-500/5 text-emerald-400/80 border border-green-500/10";
                  }
                }
              }

              return (
                <div key={idx} className="flex justify-between items-center py-1.5">
                  <span className="text-prizm-text-muted">{s.label}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${badgeClass}`}>
                    {textValue}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* HVAC Controller Commands & Physical Feedback */}
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 space-y-4">
          <div className="border-b border-prizm-border pb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-primary">HVAC Command vs Feedback</span>
            <span className="text-[9px] text-prizm-text-muted">Model: Dual Stage Simulation</span>
          </div>

          {/* HVAC 1 Card */}
          <div className="bg-black/25 border border-prizm-border/40 p-3 rounded space-y-2">
            <div className="flex justify-between items-center border-b border-white/5 pb-1">
              <span className="text-[10px] font-extrabold text-cyan-400">HVAC UNIT 1</span>
              {mismatch1.isMismatched ? (
                <span className="px-1 py-0.2 bg-prizm-warning/15 text-prizm-warning border border-prizm-warning/20 rounded font-bold text-[8px] animate-pulse">
                  ⚠️ MISMATCH
                </span>
              ) : (
                <span className="text-[8px] text-emerald-400/70 font-bold">✓ FEEDBACK OK</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <span className="text-prizm-text-muted block text-[8px]">COMMANDS</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span className={`px-1 rounded text-[9px] ${selectedDevice.hvac1?.fanLowOn ? "bg-cyan-500/20 text-cyan-400 font-bold" : "text-prizm-text-muted/40"}`}>FL</span>
                  <span className={`px-1 rounded text-[9px] ${selectedDevice.hvac1?.fanHighOn ? "bg-cyan-500/20 text-cyan-400 font-bold" : "text-prizm-text-muted/40"}`}>FH</span>
                  <span className={`px-1 rounded text-[9px] ${selectedDevice.hvac1?.compressorOn ? "bg-cyan-500/20 text-cyan-400 font-bold" : "text-prizm-text-muted/40"}`}>CP</span>
                  <span className={`px-1 rounded text-[9px] ${selectedDevice.hvac1?.reversingValveOn ? "bg-cyan-500/20 text-cyan-400 font-bold" : "text-prizm-text-muted/40"}`}>RV</span>
                  <span className={`px-1 rounded text-[9px] ${selectedDevice.hvac1?.electricHeatOn ? "bg-cyan-500/20 text-cyan-400 font-bold" : "text-prizm-text-muted/40"}`}>EH</span>
                </div>
              </div>
              <div className="border-l border-white/5 pl-2">
                <span className="text-prizm-text-muted block text-[8px]">FEEDBACK</span>
                <div className="mt-1 space-y-0.5 font-bold">
                  <div className="flex justify-between">
                    <span>Current:</span>
                    <span className="text-prizm-text">{(selectedDevice.hvac1?.currentA || 0).toFixed(2)} A</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fan RPM:</span>
                    <span className="text-prizm-text">{selectedDevice.hvac1?.fanSpeedRpm || 0} RPM</span>
                  </div>
                </div>
              </div>
            </div>
            {mismatch1.isMismatched && (
              <div className="text-[8px] text-prizm-warning/90 mt-1 leading-tight font-medium">
                {mismatch1.description}
              </div>
            )}
          </div>

          {/* HVAC 2 Card */}
          <div className="bg-black/25 border border-prizm-border/40 p-3 rounded space-y-2">
            <div className="flex justify-between items-center border-b border-white/5 pb-1">
              <span className="text-[10px] font-extrabold text-amber-400">HVAC UNIT 2</span>
              {mismatch2.isMismatched ? (
                <span className="px-1 py-0.2 bg-prizm-warning/15 text-prizm-warning border border-prizm-warning/20 rounded font-bold text-[8px] animate-pulse">
                  ⚠️ MISMATCH
                </span>
              ) : (
                <span className="text-[8px] text-emerald-400/70 font-bold">✓ FEEDBACK OK</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <span className="text-prizm-text-muted block text-[8px]">COMMANDS</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span className={`px-1 rounded text-[9px] ${selectedDevice.hvac2?.fanLowOn ? "bg-amber-500/20 text-amber-400 font-bold" : "text-prizm-text-muted/40"}`}>FL</span>
                  <span className={`px-1 rounded text-[9px] ${selectedDevice.hvac2?.fanHighOn ? "bg-amber-500/20 text-amber-400 font-bold" : "text-prizm-text-muted/40"}`}>FH</span>
                  <span className={`px-1 rounded text-[9px] ${selectedDevice.hvac2?.compressorOn ? "bg-amber-500/20 text-amber-400 font-bold" : "text-prizm-text-muted/40"}`}>CP</span>
                  <span className={`px-1 rounded text-[9px] ${selectedDevice.hvac2?.reversingValveOn ? "bg-amber-500/20 text-amber-400 font-bold" : "text-prizm-text-muted/40"}`}>RV</span>
                  <span className={`px-1 rounded text-[9px] ${selectedDevice.hvac2?.electricHeatOn ? "bg-amber-500/20 text-amber-400 font-bold" : "text-prizm-text-muted/40"}`}>EH</span>
                </div>
              </div>
              <div className="border-l border-white/5 pl-2">
                <span className="text-prizm-text-muted block text-[8px]">FEEDBACK</span>
                <div className="mt-1 space-y-0.5 font-bold">
                  <div className="flex justify-between">
                    <span>Current:</span>
                    <span className="text-prizm-text">{(selectedDevice.hvac2?.currentA || 0).toFixed(2)} A</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fan RPM:</span>
                    <span className="text-prizm-text">{selectedDevice.hvac2?.fanSpeedRpm || 0} RPM</span>
                  </div>
                </div>
              </div>
            </div>
            {mismatch2.isMismatched && (
              <div className="text-[8px] text-prizm-warning/90 mt-1 leading-tight font-medium">
                {mismatch2.description}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Strings Associated with this Feather / ES Pair */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5">
        <div className="border-b border-prizm-border pb-3 mb-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-primary block">STRINGS / BPC IN ROTATION</span>
            <span className="text-[9px] text-prizm-text-muted">Associated with Array {selectedDevice.arrayIndex ?? "?"} ES {esNum} (Paired String IDs)</span>
          </div>
          <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded text-[9px] font-bold uppercase tracking-wider">
            {pairedStrings.length} Associated Strings
          </span>
        </div>

        {pairedStrings.length === 0 ? (
          <div className="p-6 text-center text-prizm-text-muted italic border border-dashed border-prizm-border/40 rounded">
            No matching live String/BPC records resolved in this snapshot for Array {selectedDevice.arrayIndex ?? "?"} segment {selectedDevice.stringIndex ?? "?"}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-prizm-surface-strong text-prizm-text-muted text-[9px] uppercase tracking-wider">
                <tr className="border-b border-prizm-border">
                  <th className="p-2.5">String Key</th>
                  <th className="p-2.5">Array</th>
                  <th className="p-2.5">String #</th>
                  <th className="p-2.5 text-center">In Rotation</th>
                  <th className="p-2.5 text-center">Recloses</th>
                  <th className="p-2.5 text-right">Voltage</th>
                  <th className="p-2.5 text-right">Current / kW</th>
                  <th className="p-2.5 text-right">SOC %</th>
                  <th className="p-2.5 text-right">Cell Volt (Min/Avg/Max)</th>
                  <th className="p-2.5 text-right">Cell Temp (Min/Avg/Max)</th>
                  <th className="p-2.5 text-center">Balancing Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium">
                {pairedStrings.map((s: any, idx: number) => {
                  const inRotation = s.outRotation === false || s.inRotation === true;
                  return (
                    <tr key={idx} className="hover:bg-prizm-surface-strong/50 transition-colors">
                      <td className="p-2.5 text-prizm-primary font-bold">{s.stringKey}</td>
                      <td className="p-2.5">{s.arrayNumber ?? "--"}</td>
                      <td className="p-2.5">{s.stringNumber ?? "--"}</td>
                      <td className="p-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          inRotation ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/20"
                        }`}>
                          {inRotation ? "IN" : "OUT"}
                        </span>
                      </td>
                      <td className="p-2.5 text-center font-bold">{s.recloseCount ?? 0}</td>
                      <td className="p-2.5 text-right text-prizm-text font-bold">
                        {s.measuredVoltage !== undefined && s.measuredVoltage !== null 
                          ? `${(s.measuredVoltage / 1000).toFixed(1)} V` 
                          : "--"}
                      </td>
                      <td className="p-2.5 text-right">
                        <span className="text-prizm-text font-bold">{s.amps?.toFixed(1) ?? "0.0"} A</span>
                        <span className="text-prizm-text-muted mx-1">/</span>
                        <span className="text-prizm-primary font-bold">{s.kw?.toFixed(1) ?? "0.0"} kW</span>
                      </td>
                      <td className="p-2.5 text-right text-emerald-400 font-bold">{s.socPct?.toFixed(1) ?? "0.0"}%</td>
                      <td className="p-2.5 text-right text-prizm-text-muted font-mono text-[10px]">
                        <span className="text-prizm-text font-bold">{s.minCellVoltage ?? "--"}</span>
                        <span className="mx-1">/</span>
                        <span className="text-prizm-text">{s.avgCellVoltage ?? "--"}</span>
                        <span className="mx-1">/</span>
                        <span className="text-prizm-text font-bold">{s.maxCellVoltage ?? "--"}</span>
                        <span className="text-[9px] text-prizm-text-muted ml-1 font-sans">mV</span>
                      </td>
                      <td className="p-2.5 text-right text-prizm-text-muted font-mono text-[10px]">
                        <span className="text-prizm-text font-bold">{s.minCellTemperature !== undefined && s.minCellTemperature !== null ? formatTemperatureF(s.minCellTemperature, { decimals: 0, showUnit: false, sourceUnit: "C" }) : "--"}</span>
                        <span className="mx-1">/</span>
                        <span>{s.avgCellTemperature !== undefined && s.avgCellTemperature !== null ? formatTemperatureF(s.avgCellTemperature, { decimals: 0, showUnit: false, sourceUnit: "C" }) : "--"}</span>
                        <span className="mx-1">/</span>
                        <span className="text-prizm-text font-bold">{s.maxCellTemperature !== undefined && s.maxCellTemperature !== null ? formatTemperatureF(s.maxCellTemperature, { decimals: 0, showUnit: false, sourceUnit: "C" }) : "--"}</span>
                        <span className="text-[9px] text-prizm-text-muted ml-1 font-sans">°F</span>
                      </td>
                      <td className="p-2.5 text-center uppercase font-bold text-prizm-text-muted">
                        {s.balancingActive ? (
                          <span className="text-cyan-400 animate-pulse font-black">ACTIVE</span>
                        ) : "OFF"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom Section: Live Graphs & Diagnostics */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5">
        <div className="border-b border-prizm-border pb-3 mb-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-primary block">Real-Time Polling Trends</span>
            <span className="text-[9px] text-prizm-text-muted">Captured polling samples (Max 50 rolling samples)</span>
          </div>
          {samples.length > 0 && (
            <span className="text-[9px] text-prizm-text-muted font-bold">
              {samples.length} Samples Logged
            </span>
          )}
        </div>

        {samples.length === 0 ? (
          <div className="p-8 text-center text-prizm-text-muted italic border border-dashed border-prizm-border/40 rounded bg-black/10">
            <Activity className="mx-auto text-prizm-text-muted/30 mb-2" size={24} />
            No manual polling samples captured yet. Choose an interval or click "Manual Poll" to begin plotting live HVAC telemetry curves.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* Amps Chart */}
            <div className="bg-black/20 p-3 border border-prizm-border/50 rounded-lg">
              <span className="text-[10px] font-extrabold text-prizm-text uppercase block mb-3 text-center">Physical Current (Amps)</span>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={samples}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={8} tickLine={false} />
                    <YAxis stroke="#6B7280" fontSize={8} label={{ value: 'Amps', angle: -90, position: 'insideLeft', style: { fill: '#6B7280', fontSize: 8 } }} />
                    <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', fontSize: 10 }} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Line type="monotone" dataKey="hvac1Current" name="HVAC 1" stroke="#06B6D4" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="hvac2Current" name="HVAC 2" stroke="#F59E0B" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Fan RPM Chart */}
            <div className="bg-black/20 p-3 border border-prizm-border/50 rounded-lg">
              <span className="text-[10px] font-extrabold text-prizm-text uppercase block mb-3 text-center">Fan Speed (RPM)</span>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={samples}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={8} tickLine={false} />
                    <YAxis stroke="#6B7280" fontSize={8} label={{ value: 'RPM', angle: -90, position: 'insideLeft', style: { fill: '#6B7280', fontSize: 8 } }} />
                    <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', fontSize: 10 }} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Line type="monotone" dataKey="hvac1Rpm" name="HVAC 1" stroke="#10B981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="hvac2Rpm" name="HVAC 2" stroke="#8B5CF6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Temp °F Chart */}
            <div className="bg-black/20 p-3 border border-prizm-border/50 rounded-lg">
              <span className="text-[10px] font-extrabold text-prizm-text uppercase block mb-3 text-center">Temperatures (°F)</span>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={samples}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={8} tickLine={false} />
                    <YAxis stroke="#6B7280" fontSize={8} label={{ value: '°F', angle: -90, position: 'insideLeft', style: { fill: '#6B7280', fontSize: 8 } }} />
                    <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', fontSize: 10 }} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Line type="monotone" dataKey="spaceTemp" name="Supply Air" stroke="#38BDF8" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="cellTemp" name="Cell Temp" stroke="#F43F5E" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Direct JSON Source panel */}
      <div className="space-y-2 border-t border-prizm-border pt-4">
        <div className="flex justify-between items-center bg-prizm-surface p-3 rounded border border-prizm-border">
          <div className="flex flex-col">
            <span className="text-prizm-text-muted text-[10px] uppercase font-bold">Direct JSON Source</span>
            <a href={`http://${selectedDevice.ip}:8080/feather/status/report.json`} target="_blank" rel="noreferrer" className="text-prizm-primary hover:text-cyan-400 text-[10px] underline leading-tight mt-1">
              http://{selectedDevice.ip}:8080/feather/status/report.json
            </a>
          </div>
          <button
            onClick={() => setAdvancedDrawerShowJson(!advancedDrawerShowJson)}
            className="px-2.5 py-1.5 bg-black/30 hover:bg-black/50 border border-prizm-border rounded font-bold text-[9px] text-prizm-text cursor-pointer transition-colors"
          >
            {advancedDrawerShowJson ? "Hide Processed Payload" : "Show Processed Payload"}
          </button>
        </div>

        {advancedDrawerShowJson && (
          <div className="bg-black border border-prizm-border p-3 rounded font-mono text-[9px] text-emerald-500/80 select-text overflow-x-auto max-h-[300px]">
            <pre className="whitespace-pre">{JSON.stringify(selectedDevice.raw?.directFeather?.rawResponse || selectedDevice.raw || {}, null, 2)}</pre>
          </div>
        )}
      </div>

    </div>
  );
}
