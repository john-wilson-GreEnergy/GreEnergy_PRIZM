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
  samples: any[];
  setSamples?: React.Dispatch<React.SetStateAction<any[]>>;
  pairedStrings: any[];
  detectHvacMismatch: (device: any) => { isMismatched: boolean; mismatchType: string; description: string };
}

interface MismatchResult {
  status: "MATCH" | "COMMANDE_NOT_ACTIVE" | "ACTIVE_NOT_COMMANDE" | "PENDING" | "UNKNOWN";
  consecutiveCount: number;
}

// Compute the consecutive status of a signal over the rolling samples buffer (3 samples check)
const checkSignalMismatch = (
  samplesList: any[],
  hvacKey: "hvac1" | "hvac2",
  cmdField: string,
  actField: string
): MismatchResult => {
  if (!samplesList || samplesList.length === 0) {
    return { status: "UNKNOWN", consecutiveCount: 0 };
  }

  const n = samplesList.length;
  const latestSample = samplesList[n - 1];
  const hLatest = latestSample[hvacKey];
  if (!hLatest) {
    return { status: "UNKNOWN", consecutiveCount: 0 };
  }

  const latestCmd = hLatest[cmdField];
  const latestAct = hLatest[actField];

  if (latestCmd === null || latestAct === null) {
    return { status: "UNKNOWN", consecutiveCount: 0 };
  }

  const isMatch = latestCmd === latestAct;
  
  let consecutiveCount = 1;
  for (let i = n - 2; i >= 0; i--) {
    const s = samplesList[i];
    const h = s[hvacKey];
    if (!h) break;
    const cmd = h[cmdField];
    const act = h[actField];

    if (cmd === null || act === null) break;

    const currentIsMatch = cmd === act;
    // We only increment consecutive count if it continues the exact state pair (e.g. both true, or both false, or same mismatch type)
    if (isMatch === currentIsMatch && (latestCmd === cmd) && (latestAct === act)) {
      consecutiveCount++;
    } else {
      break;
    }
  }

  if (n < 3) {
    return { status: "PENDING", consecutiveCount };
  }

  if (!isMatch) {
    if (latestCmd === true && latestAct === false) {
      if (consecutiveCount >= 3) {
        return { status: "COMMANDE_NOT_ACTIVE", consecutiveCount };
      }
      return { status: "PENDING", consecutiveCount };
    }
    if (latestCmd === false && latestAct === true) {
      if (consecutiveCount >= 3) {
        return { status: "ACTIVE_NOT_COMMANDE", consecutiveCount };
      }
      return { status: "PENDING", consecutiveCount };
    }
  }

  return { status: "MATCH", consecutiveCount };
};

export default function FeatherDetailsView({
  selectedDevice,
  onBack,
  triggerDevicePoll,
  isPollingDevice,
  selectedDeviceInterval,
  setSelectedDeviceInterval,
  samples,
  setSamples,
  pairedStrings,
  detectHvacMismatch
}: FeatherDetailsViewProps) {
  const [advancedDrawerShowJson, setAdvancedDrawerShowJson] = useState<boolean>(false);
  const [binaryChartUnit, setBinaryChartUnit] = useState<1 | 2>(1);

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

  // Render upgraded high-contrast HVAC unit card with strict ON/OFF styling and custom labels
  const renderDetailHvacCard = (hvac: any, unitNum: number, mismatch: any, activeBgColor: string, activeTextColor: string) => {
    if (!hvac) {
      return (
        <div className="bg-prizm-surface-strong border border-prizm-border p-4 rounded-lg space-y-2">
          <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
            <span className={`text-[11px] font-bold ${activeTextColor}`}>HVAC UNIT {unitNum}</span>
            <span className="text-[9px] text-zinc-500 font-bold uppercase">Unavailable</span>
          </div>
          <div className="text-center py-6 text-prizm-text-muted italic">
            No telemetry reported for HVAC Unit {unitNum}
          </div>
        </div>
      );
    }

    const relays = [
      { key: "fanLowOn", label: "FanL" },
      { key: "fanHighOn", label: "FanH" },
      { key: "compressorOn", label: "Comp" },
      { key: "reversingValveOn", label: "Rev.V" },
      { key: "electricHeatOn", label: "HT" }
    ];

    return (
      <div className="bg-prizm-surface-strong border border-prizm-border p-4 rounded-lg space-y-3.5">
        <div className="flex justify-between items-center border-b border-prizm-border pb-2">
          <span className={`text-[11px] font-bold ${activeTextColor}`}>HVAC UNIT {unitNum}</span>
          {mismatch.isMismatched ? (
            <span className="px-1.5 py-0.5 bg-prizm-warning/15 text-prizm-warning border border-prizm-warning/20 rounded font-bold text-[8px] animate-pulse">
              ⚠️ MISMATCH DETECTED
            </span>
          ) : (
            <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">✓ FEEDBACK OK</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Commanded States */}
          <div className="space-y-1.5">
            <span className="text-prizm-text-muted block text-[9px] uppercase tracking-wider font-semibold">Commands</span>
            <div className="flex flex-col gap-1.5 mt-1">
              {relays.map(r => {
                const val = hvac[r.key];
                let badgeStyle = "bg-zinc-850/40 text-zinc-600 border border-zinc-800/20";
                let valLabel = "OFF";

                if (val === undefined || val === null) {
                  badgeStyle = "bg-zinc-900/40 text-zinc-500 border border-dashed border-zinc-700/20";
                  valLabel = "–";
                } else if (val === true) {
                  badgeStyle = `${activeBgColor} ${activeTextColor} font-extrabold`;
                  valLabel = "ON";
                }

                return (
                  <div key={r.key} className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-prizm-text-muted font-medium">{r.label}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all ${badgeStyle}`}>
                      {valLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Physical Feedback measurements */}
          <div className="border-l border-prizm-border pl-4 space-y-2">
            <span className="text-prizm-text-muted block text-[9px] uppercase tracking-wider font-semibold">Feedback</span>
            <div className="mt-2.5 space-y-3 font-bold text-[11px]">
              <div className="flex flex-col">
                <span className="text-[8px] text-prizm-text-muted font-normal uppercase">Current Draw</span>
                <span className="text-prizm-text text-sm font-extrabold tracking-tight mt-0.5">
                  {(hvac.currentA || 0).toFixed(2)} <span className="text-[10px] text-prizm-text-muted font-normal font-sans">Amps</span>
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[8px] text-prizm-text-muted font-normal uppercase">Fan Speed</span>
                <span className="text-prizm-text text-sm font-extrabold tracking-tight mt-0.5">
                  {hvac.fanSpeedRpm || 0} <span className="text-[10px] text-prizm-text-muted font-normal font-sans">RPM</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {mismatch.isMismatched && (
          <div className="bg-prizm-warning/10 border border-prizm-warning/20 rounded p-2 text-[9px] text-prizm-warning leading-normal font-medium flex items-start gap-1.5 mt-1">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            <span>{mismatch.description}</span>
          </div>
        )}
      </div>
    );
  };

  // Upgraded custom tooltip for stepped binary traces
  const CustomBinaryTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const h = binaryChartUnit === 1 ? (payload[0].payload._h1 || {}) : (payload[0].payload._h2 || {});
      const formatState = (v: any) => {
        if (v === true) return <span className="text-emerald-400 font-bold font-mono">ACTIVE (ON)</span>;
        if (v === false) return <span className="text-zinc-500 font-mono">INACTIVE (OFF)</span>;
        return <span className="text-zinc-600 font-mono">UNKNOWN (–)</span>;
      };

      return (
        <div className="bg-slate-900 border border-slate-700 p-2.5 rounded shadow-lg text-[10px] space-y-1 font-mono text-prizm-text">
          <div className="text-prizm-text-muted font-bold border-b border-slate-800 pb-1 mb-1">Time: {payload[0].payload.timeLabel}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span>Fan Low Cmd:</span> {formatState(h.fanLowCommanded)}
            <span>Fan Low Act:</span> {formatState(h.fanLowCurrent)}
            <span>Fan High Cmd:</span> {formatState(h.fanHighCommanded)}
            <span>Fan High Act:</span> {formatState(h.fanHighCurrent)}
            <span>Comp Cmd:</span> {formatState(h.compressorCommanded)}
            <span>Comp Act:</span> {formatState(h.compressorCurrent)}
            <span>Rev. Valve Cmd:</span> {formatState(h.reversingValveCommanded)}
            <span>Rev. Valve Act:</span> {formatState(h.reversingValveCurrent)}
            <span>Heat Cmd:</span> {formatState(h.electricHeatCommanded)}
            <span>Heat Act:</span> {formatState(h.electricHeatCurrent)}
          </div>
        </div>
      );
    }
    return null;
  };

  // Transform continuous telemetry samples to discrete stepped lane data for selected unit
  const steppedData = samples.map((s: any) => {
    const h = binaryChartUnit === 1 ? (s.hvac1 || {}) : (s.hvac2 || {});

    const getVal = (val: any, laneOffset: number) => {
      if (val === true) return laneOffset + 0.8;
      if (val === false) return laneOffset + 0.1;
      return laneOffset; // null/undefined
    };

    return {
      timeLabel: s.timeLabel,
      fanLowCmd: getVal(h.fanLowCommanded, 8),
      fanLowAct: getVal(h.fanLowCurrent, 7),
      fanHighCmd: getVal(h.fanHighCommanded, 6),
      fanHighAct: getVal(h.fanHighCurrent, 5),
      compCmd: getVal(h.compressorCommanded, 4),
      compAct: getVal(h.compressorCurrent, 3),
      revCmd: getVal(h.reversingValveCommanded, 2),
      revAct: getVal(h.reversingValveCurrent, 1),
      heatCmd: getVal(h.electricHeatCommanded, 0),
      heatAct: getVal(h.electricHeatCurrent, -1),
      _h1: s.hvac1,
      _h2: s.hvac2
    };
  });

  const signalsToCheck = [
    { label: "Fan Low Signal", cmdKey: "fanLowCommanded", actKey: "fanLowCurrent" },
    { label: "Fan High Signal", cmdKey: "fanHighCommanded", actKey: "fanHighCurrent" },
    { label: "Compressor Signal", cmdKey: "compressorCommanded", actKey: "compressorCurrent" },
    { label: "Reversing Valve", cmdKey: "reversingValveCommanded", actKey: "reversingValveCurrent" },
    { label: "Electric Heat", cmdKey: "electricHeatCommanded", actKey: "electricHeatCurrent" },
  ];

  const currentHvacKey = binaryChartUnit === 1 ? "hvac1" : "hvac2";

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

        {/* Top toolbar status indicator */}
        <div className="text-[10px] text-prizm-text-muted">
          Active Mode: <span className="text-prizm-primary font-bold">Direct Diagnostics</span>
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

        {/* HVAC Unit 1 and Unit 2 Cards (Fix 6) */}
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 space-y-4">
          <div className="border-b border-prizm-border pb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-primary">HVAC Controller Diagnostics</span>
            <span className="text-[9px] text-prizm-text-muted">Model: Dual Stage Simulation</span>
          </div>

          {/* HVAC UNIT 1 - Cyan theme */}
          {renderDetailHvacCard(
            selectedDevice.hvac1,
            1,
            mismatch1,
            "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25",
            "text-cyan-400"
          )}

          {/* HVAC UNIT 2 - Amber theme */}
          {renderDetailHvacCard(
            selectedDevice.hvac2,
            2,
            mismatch2,
            "bg-amber-500/15 text-amber-400 border border-amber-500/25",
            "text-amber-400"
          )}
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

      {/* Explicit Targeted Polling controls and continuous charts (Fix 8) */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5">
        <div className="border-b border-prizm-border pb-3 mb-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-primary block">Real-Time Polling Trends</span>
            <span className="text-[9px] text-prizm-text-muted">Captured physical telemetry samples (Max 300 rolling samples)</span>
          </div>

          {/* Polling Control Toolbar */}
          <div className="flex flex-wrap items-center gap-2 bg-prizm-surface-strong p-2 border border-prizm-border rounded text-[10px] shadow-inner font-mono">
            {/* Start/Stop Polling */}
            <button
              onClick={() => {
                if (selectedDeviceInterval === "Pause") {
                  setSelectedDeviceInterval("5000"); // default to 5s
                } else {
                  setSelectedDeviceInterval("Pause");
                }
              }}
              className={`px-3 py-1 rounded font-bold uppercase cursor-pointer transition-colors text-[9px] ${
                selectedDeviceInterval !== "Pause"
                  ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30"
                  : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30"
              }`}
            >
              {selectedDeviceInterval !== "Pause" ? "Stop Polling" : "Start Polling"}
            </button>

            {/* Poll Once */}
            <button
              onClick={triggerDevicePoll}
              disabled={isPollingDevice}
              className="px-3 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/25 rounded font-bold uppercase disabled:opacity-40 cursor-pointer transition-colors text-[9px]"
            >
              {isPollingDevice ? "Polling..." : "Poll Once"}
            </button>

            {/* Interval dropdown */}
            <select
              value={selectedDeviceInterval}
              onChange={(e) => setSelectedDeviceInterval(e.target.value)}
              className="bg-black/40 border border-prizm-border rounded px-1.5 py-1 text-[9px] text-prizm-text focus:outline-none font-mono font-bold"
            >
              <option value="Pause">Paused</option>
              <option value="2000">2s Interval</option>
              <option value="5000">5s Interval</option>
              <option value="10000">10s Interval</option>
              <option value="30000">30s Interval</option>
            </select>

            {/* Clear samples */}
            <button
              onClick={() => {
                if (typeof setSamples === "function") {
                  setSamples([]);
                }
              }}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50 rounded font-bold uppercase cursor-pointer transition-colors text-[9px]"
            >
              Clear Samples
            </button>

            {samples.length > 0 && (
              <span className="text-[9px] text-prizm-text-muted font-bold px-2 ml-1 border-l border-prizm-border">
                {samples.length} Samples
              </span>
            )}
          </div>
        </div>

        {samples.length === 0 ? (
          <div className="p-12 text-center text-prizm-text-muted italic border border-dashed border-prizm-border/40 rounded bg-black/10">
            <Activity className="mx-auto text-prizm-text-muted/30 mb-2 animate-pulse" size={24} />
            No manual polling samples captured yet. Click "Start Polling" or "Poll Once" above to begin plotting live HVAC telemetry curves.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* Amps Chart */}
            <div className="bg-black/20 p-3.5 border border-prizm-border/50 rounded-lg shadow-sm">
              <span className="text-[10px] font-extrabold text-prizm-text uppercase block mb-3 text-center tracking-wider">Physical Current (Amps)</span>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={samples}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={8} tickLine={false} />
                    <YAxis stroke="#6B7280" fontSize={8} label={{ value: 'Amps', angle: -90, position: 'insideLeft', style: { fill: '#6B7280', fontSize: 8 } }} />
                    <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', fontSize: 10 }} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Line type="monotone" dataKey="hvac1Current" name="HVAC 1" stroke="#06B6D4" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="hvac2Current" name="HVAC 2" stroke="#F59E0B" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Fan RPM Chart */}
            <div className="bg-black/20 p-3.5 border border-prizm-border/50 rounded-lg shadow-sm">
              <span className="text-[10px] font-extrabold text-prizm-text uppercase block mb-3 text-center tracking-wider">Fan Speed (RPM)</span>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={samples}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={8} tickLine={false} />
                    <YAxis stroke="#6B7280" fontSize={8} label={{ value: 'RPM', angle: -90, position: 'insideLeft', style: { fill: '#6B7280', fontSize: 8 } }} />
                    <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', fontSize: 10 }} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Line type="monotone" dataKey="hvac1Rpm" name="HVAC 1" stroke="#10B981" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="hvac2Rpm" name="HVAC 2" stroke="#8B5CF6" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Temp °F Chart */}
            <div className="bg-black/20 p-3.5 border border-prizm-border/50 rounded-lg shadow-sm">
              <span className="text-[10px] font-extrabold text-prizm-text uppercase block mb-3 text-center tracking-wider">Temperatures (°F)</span>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={samples}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={8} tickLine={false} />
                    <YAxis stroke="#6B7280" fontSize={8} label={{ value: '°F', angle: -90, position: 'insideLeft', style: { fill: '#6B7280', fontSize: 8 } }} />
                    <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', fontSize: 10 }} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Line type="monotone" dataKey="spaceTemp" name="Supply Air" stroke="#38BDF8" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="cellTemp" name="Cell Temp" stroke="#F43F5E" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Stepped Binary command/current traces and validation table (Fix 10 and Fix 11) */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5">
        <div className="border-b border-prizm-border pb-3 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-primary block">Stepped State & Mismatch Analyzer</span>
            <span className="text-[9px] text-prizm-text-muted">Analyzes commanded vs active states in discrete stepped lanes over captured buffer</span>
          </div>

          {/* Tab toggles for HVAC Unit 1 / HVAC Unit 2 */}
          <div className="flex bg-black/40 border border-prizm-border p-1 rounded gap-1 font-mono text-[9px] uppercase font-bold select-none shrink-0">
            <button
              onClick={() => setBinaryChartUnit(1)}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                binaryChartUnit === 1 ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25" : "text-prizm-text-muted hover:text-prizm-text"
              }`}
            >
              HVAC UNIT 1 (Cyan)
            </button>
            <button
              onClick={() => setBinaryChartUnit(2)}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                binaryChartUnit === 2 ? "bg-amber-500/15 text-amber-400 border border-amber-500/25" : "text-prizm-text-muted hover:text-prizm-text"
              }`}
            >
              HVAC UNIT 2 (Amber)
            </button>
          </div>
        </div>

        {samples.length === 0 ? (
          <div className="p-8 text-center text-prizm-text-muted italic border border-dashed border-prizm-border/40 rounded bg-black/10">
            No rolling state data. Capture at least 3 samples to evaluate signal validation matrices.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            
            {/* Live binary trace graph (Fix 10) */}
            <div className="xl:col-span-7 bg-black/20 p-4 border border-prizm-border/50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-extrabold text-prizm-text uppercase tracking-wider">Stepped Signal Lanes (Unit {binaryChartUnit})</span>
                <span className="text-[8px] text-prizm-text-muted font-bold font-mono">STEP_AFTER GRAPH CONNECTIVITY</span>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={steppedData} margin={{ left: -15, right: 10 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="timeLabel" stroke="#4B5563" fontSize={8} tickLine={false} />
                    <YAxis 
                      stroke="#4B5563" 
                      fontSize={8} 
                      domain={[-1.5, 9.5]} 
                      ticks={[-0.5, 0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5]}
                      tickFormatter={(v) => {
                        if (v === -0.5) return "Heat Act";
                        if (v === 0.5) return "Heat Cmd";
                        if (v === 1.5) return "RV Act";
                        if (v === 2.5) return "RV Cmd";
                        if (v === 3.5) return "Comp Act";
                        if (v === 4.5) return "Comp Cmd";
                        if (v === 5.5) return "FanH Act";
                        if (v === 6.5) return "FanH Cmd";
                        if (v === 7.5) return "FanL Act";
                        if (v === 8.5) return "FanL Cmd";
                        return "";
                      }}
                    />
                    <Tooltip content={<CustomBinaryTooltip />} />
                    <Line type="stepAfter" dataKey="fanLowCmd" name="FanL Cmd" stroke={binaryChartUnit === 1 ? "#06B6D4" : "#F59E0B"} strokeWidth={1.5} dot={false} connectNulls />
                    <Line type="stepAfter" dataKey="fanLowAct" name="FanL Act" stroke="#10B981" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />
                    
                    <Line type="stepAfter" dataKey="fanHighCmd" name="FanH Cmd" stroke={binaryChartUnit === 1 ? "#0891B2" : "#D97706"} strokeWidth={1.5} dot={false} connectNulls />
                    <Line type="stepAfter" dataKey="fanHighAct" name="FanH Act" stroke="#059669" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />
                    
                    <Line type="stepAfter" dataKey="compCmd" name="Comp Cmd" stroke={binaryChartUnit === 1 ? "#22D3EE" : "#FBBF24"} strokeWidth={1.5} dot={false} connectNulls />
                    <Line type="stepAfter" dataKey="compAct" name="Comp Act" stroke="#34D399" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />

                    <Line type="stepAfter" dataKey="revCmd" name="RV Cmd" stroke="#8B5CF6" strokeWidth={1.5} dot={false} connectNulls />
                    <Line type="stepAfter" dataKey="revAct" name="RV Act" stroke="#A78BFA" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />

                    <Line type="stepAfter" dataKey="heatCmd" name="HT Cmd" stroke="#EF4444" strokeWidth={1.5} dot={false} connectNulls />
                    <Line type="stepAfter" dataKey="heatAct" name="HT Act" stroke="#F87171" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Signal Validation Table (Fix 11) */}
            <div className="xl:col-span-5 bg-black/20 p-4 border border-prizm-border/50 rounded-lg flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-extrabold text-prizm-text uppercase block mb-3 tracking-wider">Signal Validation Matrix</span>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] text-left border-collapse font-mono">
                    <thead>
                      <tr className="border-b border-prizm-border text-prizm-text-muted text-[8px] uppercase tracking-wider">
                        <th className="pb-2">Signal</th>
                        <th className="pb-2 text-center">Cmd</th>
                        <th className="pb-2 text-center">Act</th>
                        <th className="pb-2 text-center">Status</th>
                        <th className="pb-2 text-right">Consecutive</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-semibold">
                      {signalsToCheck.map((sig, sIdx) => {
                        const res = checkSignalMismatch(samples, currentHvacKey, sig.cmdKey, sig.actKey);
                        
                        let cmdLabel = "–";
                        const latestHvac = samples[samples.length - 1]?.[currentHvacKey] || {};
                        if (latestHvac[sig.cmdKey] === true) cmdLabel = "ON";
                        if (latestHvac[sig.cmdKey] === false) cmdLabel = "OFF";

                        let actLabel = "–";
                        if (latestHvac[sig.actKey] === true) actLabel = "ON";
                        if (latestHvac[sig.actKey] === false) actLabel = "OFF";

                        let statusLabel = "UNKNOWN";
                        let statusColor = "text-zinc-500 bg-zinc-800/10 border-zinc-700/25";

                        if (res.status === "MATCH") {
                          statusLabel = "VALID";
                          statusColor = "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
                        } else if (res.status === "COMMANDE_NOT_ACTIVE") {
                          statusLabel = "CMD NO ACT";
                          statusColor = "text-rose-400 bg-rose-500/10 border border-rose-500/20 animate-pulse";
                        } else if (res.status === "ACTIVE_NOT_COMMANDE") {
                          statusLabel = "ACT NO CMD";
                          statusColor = "text-amber-400 bg-amber-500/10 border border-amber-500/20 animate-pulse";
                        } else if (res.status === "PENDING") {
                          statusLabel = "VALIDATING";
                          statusColor = "text-prizm-primary bg-prizm-primary/10 border border-prizm-primary/20";
                        }

                        return (
                          <tr key={sIdx} className="hover:bg-white/5">
                            <td className="py-2 text-prizm-text-muted">{sig.label}</td>
                            <td className="py-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                latestHvac[sig.cmdKey] === true 
                                  ? "bg-cyan-500/10 text-cyan-400" 
                                  : latestHvac[sig.cmdKey] === false 
                                  ? "bg-zinc-800 text-zinc-500" 
                                  : "text-zinc-600 border-dashed"
                              }`}>
                                {cmdLabel}
                              </span>
                            </td>
                            <td className="py-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                latestHvac[sig.actKey] === true 
                                  ? "bg-emerald-500/10 text-emerald-400" 
                                  : latestHvac[sig.actKey] === false 
                                  ? "bg-zinc-800 text-zinc-500" 
                                  : "text-zinc-600 border-dashed"
                              }`}>
                                {actLabel}
                              </span>
                            </td>
                            <td className="py-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${statusColor}`}>
                                {statusLabel}
                              </span>
                            </td>
                            <td className="py-2 text-right text-prizm-text font-bold">
                              {res.consecutiveCount} samples
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Explanatory footer notes */}
              <div className="bg-prizm-surface-strong border border-prizm-border/40 p-2.5 rounded text-[9px] text-prizm-text-muted mt-4 leading-normal">
                <span className="font-extrabold text-prizm-primary block uppercase mb-1">State Machine Rules</span>
                Signals are flagged as active mismatches ONLY after 3 consecutive matching sample states are registered to prevent noise on transition delays. Mismatches show either <span className="text-rose-400">CMD NO ACT</span> (commanded but not running) or <span className="text-amber-400">ACT NO CMD</span> (feedback current running without command).
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
