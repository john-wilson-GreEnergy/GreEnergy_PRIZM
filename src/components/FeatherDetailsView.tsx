import React, { useState, useEffect, useMemo } from "react";
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
import { getTopologyUiCapabilities } from "../lib/topologyUiCapabilities";
import { getArrayLocalEnergySegmentNumber } from "../lib/segmentNumbering";
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
  activeTopologyProfile?: any;
  onBack: () => void;
  triggerDevicePoll: () => Promise<void>;
  isPollingDevice: boolean;
  selectedDeviceInterval: string;
  setSelectedDeviceInterval: (val: string) => void;
  samples: any[];
  setSamples?: React.Dispatch<React.SetStateAction<any[]>>;
  pairedStrings: any[];
  pairedStringDebug?: any;
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

const StringRowWithNotifications = ({ s, formatTemperatureF }: { s: any; formatTemperatureF: any; key?: any }) => {
  const [expanded, setExpanded] = useState(false);
  const [stringDetail, setStringDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expanded && !stringDetail && !loading) {
      setLoading(true);
      const arr = s.arrayNumber ?? s.arrayIndex;
      const str = s.stringNumber ?? s.stringIndex;
      if (arr !== undefined && str !== undefined) {
        fetch(`/api/local/strings/dashboard/${arr}/${str}/detail?maxAgeMs=15000`)
          .then(r => r.json())
          .then(data => {
            setStringDetail(data);
            setLoading(false);
          })
          .catch(err => {
            console.error("Failed to load string detail for notifications:", err);
            setLoading(false);
          });
      }
    }
  }, [expanded, s, stringDetail, loading]);

  const inRotation = s.outRotation === false || s.inRotation === true;
  const notifications = stringDetail?.notifications || [];

  return (
    <>
      <tr 
        className="hover:bg-prizm-surface-strong/50 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="p-2.5 text-prizm-primary font-bold flex items-center gap-2 select-none">
          <span className="text-prizm-text-muted text-[8px]">{expanded ? "▼" : "▶"}</span>
          {s.stringKey}
        </td>
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
      {expanded && (
        <tr>
          <td colSpan={11} className="bg-slate-900/60 p-4 border-l-2 border-prizm-primary">
            <div className="space-y-3 font-sans text-xs">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-primary">Paired String Active Notifications</span>
                <span className="text-[9px] text-prizm-text-muted font-mono">Real-time DB stream</span>
              </div>
              
              {loading ? (
                <div className="flex items-center gap-2 text-prizm-text-muted font-mono text-[10px] py-1">
                  <span className="animate-spin text-prizm-primary">&#x21bb;</span> Loading active notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-emerald-400 font-semibold py-1 flex items-center gap-1.5 text-[10px]">
                  <span>●</span> No active notifications for this string.
                </div>
              ) : (
                <div className="space-y-2">
                  {notifications.map((n: any, idx: number) => {
                    const isAlarm = n.level === "ALARM" || n.category === "Alarm" || n.category === "Fault";
                    const isCGPresent = n.batteryPackIndex !== null || n.cellGroupIndex !== null;
                    return (
                      <div key={idx} className="bg-black/30 border border-prizm-border/40 p-2.5 rounded flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase ${
                              isAlarm ? "bg-prizm-danger/20 text-prizm-danger" : "bg-prizm-warning/20 text-prizm-warning"
                            }`}>
                              {n.level || "WARN"}
                            </span>
                            <span className="text-prizm-text font-bold font-mono">Code {n.code}</span>
                            <span className="text-prizm-text-muted text-[10px]">({n.category})</span>
                            {isCGPresent && (
                              <span className="bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold">
                                BPC {n.batteryPackIndex ?? "?"} / CG {n.cellGroupIndex ?? "?"}
                              </span>
                            )}
                          </div>
                          <p className="text-prizm-text text-[11px] leading-relaxed">{n.triggerMessage}</p>
                        </div>
                        <div className="text-right text-[9px] text-prizm-text-muted font-mono shrink-0">
                          {new Date(n.timestamp).toLocaleTimeString()} {new Date(n.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export default function FeatherDetailsView({
  selectedDevice,
  activeTopologyProfile,
  onBack,
  triggerDevicePoll,
  isPollingDevice,
  selectedDeviceInterval,
  setSelectedDeviceInterval,
  samples,
  setSamples,
  pairedStrings,
  pairedStringDebug,
  detectHvacMismatch
}: FeatherDetailsViewProps) {
  const [advancedDrawerShowJson, setAdvancedDrawerShowJson] = useState<boolean>(false);
  const [binaryChartUnit, setBinaryChartUnit] = useState<1 | 2>(1);
  const [showValidationMatrix, setShowValidationMatrix] = useState<boolean>(false);
  const [showDetectorDebug, setShowDetectorDebug] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"profile" | "raw">("profile");

  const topologyUi = useMemo(() => {
    return getTopologyUiCapabilities(activeTopologyProfile, selectedDevice);
  }, [activeTopologyProfile, selectedDevice]);

  // Site Health Sensor topology source fetching for ES detectors (Fix 9)
  const [topologyData, setTopologyData] = useState<any>(null);
  const [loadingTopology, setLoadingTopology] = useState<boolean>(false);

  useEffect(() => {
    setLoadingTopology(true);
    fetch("/api/local/site-sensors/topology?refresh=true&maxAgeMs=0")
      .then(res => res.json())
      .then(data => {
        setTopologyData(data);
        setLoadingTopology(false);
      })
      .catch(err => {
        console.error("Failed to fetch topology in details view:", err);
        setLoadingTopology(false);
      });
  }, []);

  // Helper to resolve Feather Segment type, index, and display label
  const resolveFeatherSegment = (device: any) => {
    const arrayIndex = device.arrayIndex !== undefined && device.arrayIndex !== null ? Number(device.arrayIndex) : undefined;
    
    const resolvedNumOrCS = getArrayLocalEnergySegmentNumber({
      arrayIndex,
      enclosureIndex: device.topology?.enclosureIndex ?? device.enclosureIndex,
      segmentIndex: device.topology?.segmentIndex ?? device.segmentIndex,
      segmentPosition: device.topology?.segmentPosition ?? device.segmentPosition,
      energySegmentIndex: device.energySegmentIndex,
      segmentLabel: device.segmentLabel ?? device.topology?.segmentLabel,
      displayName: device.displayName ?? device.topology?.displayName,
      ip: device.ip,
      enclosureType: device.enclosureType ?? device.topology?.enclosureType,
    });

    if (resolvedNumOrCS === "CS") {
      return {
        segmentIndex: 1,
        segmentType: "CS" as const,
        displayLabel: "CS"
      };
    }

    if (typeof resolvedNumOrCS === "number") {
      return {
        segmentIndex: resolvedNumOrCS,
        segmentType: "ES" as const,
        displayLabel: `ES ${resolvedNumOrCS}`
      };
    }

    return {
      segmentIndex: 1,
      segmentType: "UNKNOWN" as const,
      displayLabel: "ES 1"
    };
  };

  const getEnergySegmentIndex = (device: any): number | null => {
    const resolved = resolveFeatherSegment(device);
    return resolved.segmentType === "ES" ? resolved.segmentIndex : null;
  };

  const resolvedSegment = useMemo(() => resolveFeatherSegment(selectedDevice), [selectedDevice]);

  const getArrayNumber = (displayName: string): number => {
    const m = displayName.match(/Array\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : 999;
  };

  const matchingRow = useMemo(() => {
    if (!topologyData?.rows) return null;
    const arrayIndex = selectedDevice.arrayIndex;
    if (arrayIndex === undefined || arrayIndex === null) return null;

    const selectedResolved = resolveFeatherSegment(selectedDevice);
    const isSelectedCS = selectedResolved.segmentType === "CS";
    const selectedES = selectedResolved.segmentType === "ES" ? selectedResolved.segmentIndex : null;

    return topologyData.rows.find((row: any) => {
      if (!row.location) return false;
      const rowArray = getArrayNumber(row.location.displayName || "");
      if (Number(rowArray) !== Number(arrayIndex)) return false;

      const rowResolvedNumOrCS = getArrayLocalEnergySegmentNumber({
        arrayIndex: rowArray,
        enclosureIndex: row.location.enclosureIndex,
        segmentIndex: row.topology?.segmentIndex,
        segmentPosition: row.location.segmentPosition ?? row.topology?.segmentPosition,
        energySegmentIndex: row.topology?.energySegmentIndex,
        segmentLabel: row.topology?.segmentLabel,
        displayName: row.location.displayName || row.topology?.displayName,
        enclosureType: row.location.enclosureType,
      });

      if (isSelectedCS) {
        return rowResolvedNumOrCS === "CS" || row.location.enclosureType === "CollectionSegment";
      } else {
        return rowResolvedNumOrCS === selectedES && (row.location.enclosureType === "EnergySegment" || (row.location.displayName || "").toLowerCase().includes("es"));
      }
    });
  }, [topologyData, selectedDevice]);

  const dynamicSensorRows = useMemo(() => {
    if (topologyUi.showStack750DetectorList && resolvedSegment.segmentType === "ES") {
      const other = matchingRow?.otherSensors || {};
      const doors = matchingRow?.doorSensors || {};
      const emergency = matchingRow?.emergencySensors || {};
      const comStatus = matchingRow?.comStatus || {};

      const resolveDetectorState = (cell: any, fallbackVal: any, type: string) => {
        if (cell && cell.applicable !== false) {
          const isTripped = cell.tripped === true;
          
          if (cell.communicating === false || cell.applicable === false) {
            return { tripped: null, value: null, displayValue: "UNKNOWN", cell };
          }
          
          let display = "NORMAL";
          if (isTripped) {
            if (type === "Door") display = "OPEN";
            else if (type === "Fault") display = "FAULT";
            else if (type === "Alarm") display = "ALARM";
            else if (type === "Trouble") display = "TROUBLE";
            
            if (cell.displayValue && cell.displayValue !== "OK" && cell.displayValue !== "NORMAL") {
              display = cell.displayValue.toUpperCase();
            }
          }
          return { tripped: isTripped, value: isTripped, displayValue: display, cell };
        }
        
        if (fallbackVal !== undefined && fallbackVal !== null) {
          const isTripped = fallbackVal === true;
          let display = "NORMAL";
          if (isTripped) {
            if (type === "Door") display = "OPEN";
            else if (type === "Fault") display = "FAULT";
            else if (type === "Alarm") display = "ALARM";
            else if (type === "Trouble") display = "TROUBLE";
          }
          return { tripped: isTripped, value: isTripped, displayValue: display, cell: null };
        }
        
        return { tripped: null, value: null, displayValue: "UNKNOWN", cell: null };
      };

      const rawItems = [
        {
          label: "Data Unavailable",
          ...resolveDetectorState(
            comStatus.dataCommunications,
            selectedDevice.reachable === false ? true : (selectedDevice.reachable === true ? false : null),
            "Fault"
          ),
          type: "Fault",
          cell: comStatus.dataCommunications
        },
        {
          label: "Battery Doors",
          ...resolveDetectorState(
            doors.batteryDoors,
            selectedDevice.doors ? !selectedDevice.doors.batteryDoorsClosed : null,
            "Door"
          ),
          isDoor: true,
          type: "Door",
          cell: doors.batteryDoors
        },
        {
          label: "Lower Top Cap",
          ...resolveDetectorState(
            doors.topCapDoors,
            selectedDevice.doors ? !selectedDevice.doors.dcDoorsClosed : null,
            "Door"
          ),
          isDoor: true,
          type: "Door",
          cell: doors.topCapDoors
        },
        {
          label: "Emergency Ventilation",
          ...resolveDetectorState(
            other.envControllerVent,
            (selectedDevice.fssSignals as any)?.envControllerVent ?? null,
            "Alarm"
          ),
          type: "Alarm",
          cell: other.envControllerVent
        },
        {
          label: "Hydrogen Fault",
          ...resolveDetectorState(
            other.hydrogenFault,
            selectedDevice.fssSignals?.hydrogenFault ?? null,
            "Fault"
          ),
          type: "Fault",
          cell: other.hydrogenFault
        },
        {
          label: "Hydrogen Alarm",
          ...resolveDetectorState(
            other.hydrogen,
            selectedDevice.fssSignals?.hydrogenAlarm ?? null,
            "Alarm"
          ),
          type: "Alarm",
          cell: other.hydrogen
        },
        {
          label: "I/O Logic",
          ...resolveDetectorState(
            comStatus.io,
            (selectedDevice.fssSignals as any)?.ioLogic ?? null,
            "Fault"
          ),
          type: "Fault",
          cell: comStatus.io
        },
        {
          label: "Fire Trouble",
          ...resolveDetectorState(
            other.fireTrouble,
            selectedDevice.fssSignals?.fssTrouble ?? selectedDevice.fssSignals?.fireTrouble ?? null,
            "Trouble"
          ),
          type: "Trouble",
          cell: other.fireTrouble
        },
        {
          label: (emergency.moisture?.displayName || emergency.moisture?.label) || "Moisture / Top Cap Moisture",
          ...resolveDetectorState(
            emergency.moisture,
            selectedDevice.fssSignals?.leakAlarm ?? null,
            "Alarm"
          ),
          type: "Alarm",
          cell: emergency.moisture
        }
      ];

      const processedItems = rawItems.filter((item) => {
        if (viewMode === "profile") {
          if (item.cell) {
            if (item.cell.monitoredByProfile === false || item.cell.contributesToHealth === false) {
              return false;
            }
          } else {
            return false;
          }
        }
        return true;
      }).map((item) => {
        if (item.cell && item.cell.monitoredByProfile === false) {
          return {
            ...item,
            isUnmonitored: true,
            displayValue: item.tripped ? `${item.displayValue} (UNMONITORED)` : "NOT MONITORED"
          };
        }
        return item;
      });
      return processedItems;
    } else {
      return [
        { label: "FSS Alarm (Fire/Smoke Signal)", value: selectedDevice.fssSignals?.fssAlarm ?? selectedDevice.fssSignals?.smokeAlarm ?? null, type: "Alarm" },
        { label: "FSS Trouble / Pre-Alarm", value: selectedDevice.fssSignals?.fssTrouble ?? selectedDevice.fssSignals?.fireTrouble ?? null, type: "Trouble" },
        { label: "Door Open Detector", value: selectedDevice.doors ? !(selectedDevice.doors.batteryDoorsClosed && selectedDevice.doors.dcDoorsClosed && selectedDevice.doors.acDoorsClosed) : null, type: "Status", isDoor: true },
        { label: "Interlock Signal (Safety loop)", value: (selectedDevice.fssSignals as any)?.interlockClosed === false ? true : ((selectedDevice.fssSignals as any)?.interlockClosed === true ? false : null), type: "Alarm" },
        { label: "Water/Condensate Sensor", value: selectedDevice.fssSignals?.leakAlarm ?? null, type: "Alarm" }
      ];
    }
  }, [matchingRow, selectedDevice, resolvedSegment, viewMode]);

  const detectorSourceDebug = useMemo(() => {
    if (!selectedDevice) return null;
    const arrayNum = selectedDevice.arrayIndex;
    const resolved = resolveFeatherSegment(selectedDevice);
    
    return {
      selectedDeviceIp: selectedDevice.ip,
      selectedArray: arrayNum,
      resolvedSegmentType: resolved.segmentType,
      resolvedSegmentIndex: resolved.segmentIndex,
      displayLabel: resolved.displayLabel,
      matchingTopologyRowFound: !!matchingRow,
      totalPointsCountInRow: matchingRow ? (matchingRow.unknownSensors?.length || 0) + Object.keys(matchingRow.otherSensors || {}).length : 0,
      mappedDetectorChannels: {
        fssAlarm: matchingRow?.otherSensors?.smoke?.friendlyName || matchingRow?.otherSensors?.fire?.friendlyName || "smoke/fire",
        fssTrouble: matchingRow?.otherSensors?.fireTrouble?.friendlyName || matchingRow?.otherSensors?.hydrogenFault?.friendlyName || "fireTrouble/hydrogenFault",
        doors: matchingRow?.doorSensors?.batteryDoors?.friendlyName || "batteryDoors",
        interlock: matchingRow?.otherSensors?.modbusEStop?.friendlyName || "modbusEStop",
        water: matchingRow?.emergencySensors?.moisture?.friendlyName || "moisture"
      }
    };
  }, [selectedDevice, matchingRow]);

  const esNum = getEnergySegmentIndex(selectedDevice) || 1;

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
      const h = payload[0].payload._h || (binaryChartUnit === 1 ? payload[0].payload._h1 : payload[0].payload._h2) || {};
      const formatState = (v: any) => {
        if (v === true) return <span className="text-emerald-400 font-bold font-mono">ACTIVE (ON)</span>;
        if (v === false) return <span className="text-zinc-500 font-mono">INACTIVE (OFF)</span>;
        return <span className="text-zinc-600 font-mono">UNKNOWN (–)</span>;
      };

      const keyToLabel: Record<string, string> = {
        fanLowCmd: "Fan Low Command (Target: Fan Motor Speed 1)",
        fanLowAct: "Fan Low Actual Current (Sensor feedback)",
        fanHighCmd: "Fan High Command (Target: Fan Motor Speed 2)",
        fanHighAct: "Fan High Actual Current (Sensor feedback)",
        compCmd: "Compressor Command (Target: Cooling Compressor)",
        compAct: "Compressor Actual Current (Sensor feedback)",
        revCmd: "Reversing Valve Command (Target: Heat Pump Cycle direction)",
        revAct: "Reversing Valve Actual Status (Sensor feedback)",
        heatCmd: "Electric Heat Command (Target: Auxiliary Heater)",
        heatAct: "Electric Heat Actual Current (Sensor feedback)"
      };

      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-[11px] space-y-2 font-mono text-prizm-text max-w-sm">
          <div className="text-prizm-text-muted font-bold border-b border-slate-800 pb-1 flex justify-between">
            <span>Time: {payload[0].payload.timeLabel}</span>
            <span className="text-cyan-400 font-mono text-[9px]">Stepped Binary Trace</span>
          </div>
          
          <div className="space-y-1.5">
            {payload.map((item: any, idx: number) => {
              const dataKey = item.dataKey;
              const label = keyToLabel[dataKey] || item.name || dataKey;
              const val = item.value === 1;
              return (
                <div key={idx} className="flex justify-between items-center gap-4 py-0.5 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-prizm-text-muted font-bold text-[10px]">{label}</span>
                  </div>
                  <span>{formatState(val)}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  // Transform continuous telemetry samples to discrete stepped lane data for both units (Fix 3)
  const steppedDataUnit1 = samples.map((s: any) => {
    const h = s.hvac1 || {};
    const getVal = (val: any) => {
      if (val === true) return 1;
      if (val === false) return 0;
      return null;
    };
    return {
      timeLabel: s.timeLabel,
      fanLowCmd: getVal(h.fanLowCommanded),
      fanLowAct: getVal(h.fanLowCurrent),
      fanHighCmd: getVal(h.fanHighCommanded),
      fanHighAct: getVal(h.fanHighCurrent),
      compCmd: getVal(h.compressorCommanded),
      compAct: getVal(h.compressorCurrent),
      revCmd: getVal(h.reversingValveCommanded),
      revAct: getVal(h.reversingValveCurrent),
      heatCmd: getVal(h.electricHeatCommanded),
      heatAct: getVal(h.electricHeatCurrent),
      _h: h
    };
  });

  const steppedDataUnit2 = samples.map((s: any) => {
    const h = s.hvac2 || {};
    const getVal = (val: any) => {
      if (val === true) return 1;
      if (val === false) return 0;
      return null;
    };
    return {
      timeLabel: s.timeLabel,
      fanLowCmd: getVal(h.fanLowCommanded),
      fanLowAct: getVal(h.fanLowCurrent),
      fanHighCmd: getVal(h.fanHighCommanded),
      fanHighAct: getVal(h.fanHighCurrent),
      compCmd: getVal(h.compressorCommanded),
      compAct: getVal(h.compressorCurrent),
      revCmd: getVal(h.reversingValveCommanded),
      revAct: getVal(h.reversingValveCurrent),
      heatCmd: getVal(h.electricHeatCommanded),
      heatAct: getVal(h.electricHeatCurrent),
      _h: h
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
                <span className="text-prizm-text-muted">Segment Index / Type:</span>
                <span className="text-prizm-text font-bold">
                  {resolvedSegment.displayLabel} ({resolvedSegment.segmentType})
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-prizm-text-muted">Firmware Version:</span>
                <span className="text-prizm-text font-bold">
                  {selectedDevice.firmwareVersion || 
                   selectedDevice.softwareVersion || 
                   selectedDevice.hvac1?.firmwareVersion || 
                   selectedDevice.hvac2?.firmwareVersion || 
                   (selectedDevice as any).rawStats?.turtleVersion || 
                   "2.73.18"}
                </span>
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
                {(() => {
                  if (selectedDevice.sourceCoverage?.directFeather) {
                    return <span className="text-emerald-400 font-bold">Sourced</span>;
                  }
                  if (selectedDevice.hvac1 || selectedDevice.hvac2) {
                    return <span className="text-amber-400 font-bold" title="Using cached manual polling or fallback stats">Fallback</span>;
                  }
                  return <span className="text-rose-500 font-bold">Missing</span>;
                })()}
              </div>
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">Topology Index:</span>
                {(() => {
                  if (selectedDevice.topology) {
                    return <span className="text-emerald-400 font-bold">Topology Profile</span>;
                  }
                  if (selectedDevice.sourceCoverage?.blockviewer) {
                    return <span className="text-emerald-400 font-bold">Sourced</span>;
                  }
                  if (matchingRow) {
                    return <span className="text-amber-400 font-bold" title="Matched via Site Health Sensor Topology">Fallback</span>;
                  }
                  return <span className="text-rose-500 font-bold">Missing</span>;
                })()}
              </div>
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">String IP Map:</span>
                {(() => {
                  if (!topologyUi.showPairedStrings) {
                    return <span className="text-zinc-500 font-bold" title="Not Applicable for this layout">N/A</span>;
                  }
                  if (selectedDevice.topology?.segmentType === "CS" || selectedDevice.topology?.segmentType === "COLLECTION") {
                    return <span className="text-zinc-500 font-bold" title="Not Applicable for Collection Segments">N/A</span>;
                  }
                  if (selectedDevice.sourceCoverage?.stringIpMap) {
                    return <span className="text-emerald-400 font-bold">Sourced</span>;
                  }
                  if (selectedDevice.topology?.pairedStringNumbers && selectedDevice.topology.pairedStringNumbers.length > 0) {
                    return <span className="text-amber-400 font-bold">Topology Profile</span>;
                  }
                  return <span className="text-rose-500 font-bold">Missing</span>;
                })()}
              </div>
              <div className="flex justify-between">
                <span className="text-prizm-text-muted">IP Translation Map:</span>
                {(() => {
                  if (topologyUi.isStack360 || topologyUi.isStack225_230 || selectedDevice.topology?.segmentType === "CONTAINER") {
                    return <span className="text-zinc-500 font-bold" title="Not Applicable for this layout">N/A</span>;
                  }
                  if ((selectedDevice as any).discoveryMethod === "direct" || !(selectedDevice as any).ipTranslationNeeded) {
                    return <span className="text-zinc-500 font-bold" title="Direct manual IP: No translation needed">N/A</span>;
                  }
                  if (selectedDevice.sourceCoverage?.ipMap) {
                    return <span className="text-emerald-400 font-bold">Sourced</span>;
                  }
                  return <span className="text-rose-500 font-bold">Missing</span>;
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Detector & Sensor Status Table Card */}
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4">
          <div className="border-b border-prizm-border pb-2 mb-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-primary">Detector & Sensor Status</span>
            <button 
              onClick={() => setShowDetectorDebug(prev => !prev)}
              className="text-[8px] bg-prizm-primary/10 hover:bg-prizm-primary/20 text-prizm-primary border border-prizm-primary/20 rounded px-1.5 py-0.5 font-mono font-bold cursor-pointer"
            >
              {showDetectorDebug ? "Hide Debug" : "Source Debug"}
            </button>
          </div>

          {/* Highly visible custom styled Profile/Raw EMS View Toggle */}
          <div className="flex items-center justify-between mb-3 bg-zinc-900 border border-zinc-800 p-1 rounded-md select-none">
            <span className="text-[9px] text-zinc-400 uppercase font-extrabold pl-1.5 font-mono">View Mode:</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setViewMode("profile")}
                className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                  viewMode === "profile"
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Profile View (Monitored)
              </button>
              <button
                type="button"
                onClick={() => setViewMode("raw")}
                className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                  viewMode === "raw"
                    ? "bg-zinc-800 text-zinc-300 border border-zinc-700/50 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Raw EMS (All)
              </button>
            </div>
          </div>

          {showDetectorDebug ? (
            <div className="bg-black/40 border border-prizm-border/40 rounded p-2 text-[8px] font-mono overflow-auto max-h-[300px]">
              <pre className="text-cyan-400">{JSON.stringify(detectorSourceDebug, null, 2)}</pre>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[300px] divide-y divide-white/5 pr-1">
              {dynamicSensorRows.map((s: any, idx) => {
                let badgeClass = "bg-black/30 text-prizm-text-muted/60";
                let textValue = s.displayValue || "--";

                if (s.isUnmonitored) {
                  badgeClass = "bg-zinc-800/80 text-zinc-400 border border-zinc-700/40";
                } else if (textValue === "UNKNOWN") {
                  badgeClass = "bg-gray-500/10 text-gray-400 border border-gray-500/20";
                } else if (s.value !== undefined && s.value !== null) {
                  const isTrue = s.value === true;
                  
                  // For door open, true represents "Open" (Problem/Alarm).
                  if (s.isDoor) {
                    badgeClass = isTrue 
                      ? "bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/20 font-black animate-pulse"
                      : "bg-green-500/10 text-emerald-400 border border-green-500/20";
                  } else {
                    // For alarms, true represents "Alarm" (Problem/Alarm).
                    if (isTrue) {
                      badgeClass = s.type === "Alarm"
                        ? "bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/20 font-black animate-pulse"
                        : "bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/20 font-black";
                    } else {
                      badgeClass = "bg-green-500/5 text-emerald-400/80 border border-green-500/10";
                    }
                  }
                }

                return (
                  <div key={idx} className="flex justify-between items-center py-1.5">
                    <span className="text-prizm-text-muted" title={s.cell?.friendlyName}>{s.label}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${badgeClass}`}>
                      {textValue}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
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

      {/* STRINGS / BPC IN ROTATION Section */}
      {(() => {
        if (!topologyUi.showPairedStrings) {
          return null;
        }

        return (
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5">
            <div className="border-b border-prizm-border pb-3 mb-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-primary block">STRINGS / BPC IN ROTATION</span>
                <span className="text-[9px] text-prizm-text-muted">Associated with Array {selectedDevice.arrayIndex ?? "?"} {resolvedSegment.displayLabel}</span>
              </div>
              <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded text-[9px] font-bold uppercase tracking-wider">
                {resolvedSegment.segmentType === "CS" ? "Not Applicable" : `${pairedStrings.length} Associated Strings`}
              </span>
            </div>

            {resolvedSegment.segmentType === "CS" ? (
              <div className="p-5 border border-dashed border-prizm-border/40 rounded bg-prizm-surface-strong/30 flex flex-col items-center justify-center text-center space-y-2">
                <Database className="text-prizm-text-muted opacity-40 mb-1" size={28} />
                <div className="text-prizm-text-muted font-bold text-[11px] uppercase tracking-wider">
                  Collection Segment
                </div>
                <p className="text-prizm-text-muted text-[10px] max-w-md leading-relaxed">
                  Collection segment controller — no paired string/BPC records apply.
                </p>
              </div>
            ) : pairedStrings.length === 0 ? (
          <div className="p-5 border border-dashed border-prizm-border/40 rounded bg-rose-500/5 space-y-3">
            <div className="text-center text-prizm-text-muted italic text-[11px]">
              No matching live String/BPC records resolved in this snapshot for Array {selectedDevice.arrayIndex ?? "?"} Segment {resolvedSegment.segmentIndex ?? "?"}.
            </div>
            {pairedStringDebug && (
              <div className="bg-black/40 p-3 rounded border border-prizm-border/30 max-w-3xl mx-auto space-y-2">
                <div className="text-[10px] font-mono font-bold text-prizm-warning border-b border-white/5 pb-1 uppercase tracking-wider text-center">
                  ⚠️ Resolution Diagnosis Details
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-[9px] font-mono text-left max-w-2xl mx-auto">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-prizm-text-muted">Selected IP:</span>
                    <span className="text-prizm-text font-bold">{pairedStringDebug.selectedIp}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-prizm-text-muted">Array Num:</span>
                    <span className="text-prizm-text font-bold">{pairedStringDebug.selectedArray}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1 col-span-1 md:col-span-2">
                    <span className="text-prizm-text-muted">Segment Label:</span>
                    <span className="text-prizm-text font-bold">{pairedStringDebug.selectedSegmentLabel || "None"}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1 col-span-1 md:col-span-2">
                    <span className="text-prizm-text-muted">Resolved Segment:</span>
                    <span className="text-prizm-text font-bold">{pairedStringDebug.displayLabel} ({pairedStringDebug.resolvedSegmentType})</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1 col-span-1 md:col-span-2">
                    <span className="text-prizm-text-muted">Expected String IDs:</span>
                    <span className="text-cyan-400 font-bold">{pairedStringDebug.expectedStrings?.join(", ") || "None"}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1 col-span-1 md:col-span-2">
                    <span className="text-prizm-text-muted">Database String Count:</span>
                    <span className="text-prizm-text font-bold">{pairedStringDebug.normalizedStringCount}</span>
                  </div>
                  {pairedStringDebug.availableStringFieldNamesSample && (
                    <div className="col-span-1 md:col-span-2 text-zinc-500 text-[8px] truncate mt-1">
                      Fields in Schema: {pairedStringDebug.availableStringFieldNamesSample.join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}
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
                {pairedStrings.map((s: any, idx: number) => (
                  <StringRowWithNotifications 
                    key={idx} 
                    s={s} 
                    formatTemperatureF={formatTemperatureF} 
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        );
      })()}

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
            
            {/* Merged Amps & RPM Chart (Fix 4) */}
            <div className="xl:col-span-2 bg-black/20 p-3.5 border border-prizm-border/50 rounded-lg shadow-sm">
              <span className="text-[10px] font-extrabold text-prizm-text uppercase block mb-3 text-center tracking-wider">Physical Feedback Measurements (Current & Fan Speed)</span>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={samples}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <XAxis dataKey="timeLabel" stroke="#6B7280" fontSize={8} tickLine={false} />
                    <YAxis 
                      yAxisId="left"
                      stroke="#06B6D4" 
                      fontSize={8} 
                      label={{ value: 'Current (Amps)', angle: -90, position: 'insideLeft', style: { fill: '#06B6D4', fontSize: 8 } }} 
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      stroke="#10B981" 
                      fontSize={8} 
                      label={{ value: 'Fan Speed (RPM)', angle: 90, position: 'insideRight', style: { fill: '#10B981', fontSize: 8 } }} 
                    />
                    <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', fontSize: 10 }} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Line yAxisId="left" type="monotone" dataKey="hvac1Current" name="HVAC 1 Current (A)" stroke="#06B6D4" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                    <Line yAxisId="left" type="monotone" dataKey="hvac2Current" name="HVAC 2 Current (A)" stroke="#F59E0B" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="hvac1Rpm" name="HVAC 1 Fan (RPM)" stroke="#10B981" strokeWidth={1.5} strokeDasharray="5 5" dot={false} activeDot={{ r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="hvac2Rpm" name="HVAC 2 Fan (RPM)" stroke="#8B5CF6" strokeWidth={1.5} strokeDasharray="5 5" dot={false} activeDot={{ r: 4 }} />
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

      {/* Stepped Binary command/current traces and validation table (Fix 2 & Fix 3) */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5">
        <div className="border-b border-prizm-border pb-3 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-primary block">Stepped State & Mismatch Analyzer</span>
            <span className="text-[9px] text-prizm-text-muted">Analyzes commanded vs active states in discrete stepped lanes over captured buffer</span>
          </div>
        </div>

        {samples.length === 0 ? (
          <div className="p-8 text-center text-prizm-text-muted italic border border-dashed border-prizm-border/40 rounded bg-black/10">
            No rolling state data. Capture at least 3 samples to evaluate signal validation matrices.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            
            {/* Live binary trace graphs (Fix 2 & Fix 3) */}
            <div className="xl:col-span-7 space-y-4">
              {/* HVAC Unit 1 Graph */}
              <div className="bg-black/20 p-4 border border-prizm-border/50 rounded-lg">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-2 gap-2">
                  <span className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-wider">HVAC Unit 1 (Stepped State)</span>
                  <div className="flex flex-wrap gap-2 text-[8px] font-mono">
                    <span className="text-cyan-400 font-bold">● FanL Cmd</span>
                    <span className="text-emerald-400">-- FanL Act</span>
                    <span className="text-cyan-500 font-bold">● FanH Cmd</span>
                    <span className="text-emerald-500">-- FanH Act</span>
                    <span className="text-cyan-300 font-bold">● Comp Cmd</span>
                    <span className="text-emerald-300">-- Comp Act</span>
                    <span className="text-purple-400 font-bold">● RV Cmd</span>
                    <span className="text-red-400 font-bold">● HT Cmd</span>
                  </div>
                </div>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={steppedDataUnit1} margin={{ left: -25, right: 10, top: 5, bottom: 5 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="timeLabel" stroke="#4B5563" fontSize={8} tickLine={false} />
                      <YAxis 
                        stroke="#4B5563" 
                        fontSize={8} 
                        domain={[-0.1, 1.1]} 
                        ticks={[0, 1]}
                        tickFormatter={(v) => v === 1 ? "ON" : "OFF"}
                      />
                      <Tooltip content={<CustomBinaryTooltip />} />
                      <Line type="stepAfter" dataKey="fanLowCmd" name="FanL Cmd" stroke="#06B6D4" strokeWidth={1.5} dot={false} connectNulls />
                      <Line type="stepAfter" dataKey="fanLowAct" name="FanL Act" stroke="#10B981" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />
                      <Line type="stepAfter" dataKey="fanHighCmd" name="FanH Cmd" stroke="#0891B2" strokeWidth={1.5} dot={false} connectNulls />
                      <Line type="stepAfter" dataKey="fanHighAct" name="FanH Act" stroke="#059669" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />
                      <Line type="stepAfter" dataKey="compCmd" name="Comp Cmd" stroke="#22D3EE" strokeWidth={1.5} dot={false} connectNulls />
                      <Line type="stepAfter" dataKey="compAct" name="Comp Act" stroke="#34D399" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />
                      <Line type="stepAfter" dataKey="revCmd" name="RV Cmd" stroke="#8B5CF6" strokeWidth={1.5} dot={false} connectNulls />
                      <Line type="stepAfter" dataKey="revAct" name="RV Act" stroke="#A78BFA" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />
                      <Line type="stepAfter" dataKey="heatCmd" name="HT Cmd" stroke="#EF4444" strokeWidth={1.5} dot={false} connectNulls />
                      <Line type="stepAfter" dataKey="heatAct" name="HT Act" stroke="#F87171" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* HVAC Unit 2 Graph */}
              <div className="bg-black/20 p-4 border border-prizm-border/50 rounded-lg">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-2 gap-2">
                  <span className="text-[10px] font-extrabold text-amber-500 uppercase tracking-wider">HVAC Unit 2 (Stepped State)</span>
                  <div className="flex flex-wrap gap-2 text-[8px] font-mono">
                    <span className="text-amber-500 font-bold">● FanL Cmd</span>
                    <span className="text-emerald-400">-- FanL Act</span>
                    <span className="text-amber-600 font-bold">● FanH Cmd</span>
                    <span className="text-emerald-500">-- FanH Act</span>
                    <span className="text-amber-400 font-bold">● Comp Cmd</span>
                    <span className="text-emerald-300">-- Comp Act</span>
                    <span className="text-purple-400 font-bold">● RV Cmd</span>
                    <span className="text-red-400 font-bold">● HT Cmd</span>
                  </div>
                </div>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={steppedDataUnit2} margin={{ left: -25, right: 10, top: 5, bottom: 5 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="timeLabel" stroke="#4B5563" fontSize={8} tickLine={false} />
                      <YAxis 
                        stroke="#4B5563" 
                        fontSize={8} 
                        domain={[-0.1, 1.1]} 
                        ticks={[0, 1]}
                        tickFormatter={(v) => v === 1 ? "ON" : "OFF"}
                      />
                      <Tooltip content={<CustomBinaryTooltip />} />
                      <Line type="stepAfter" dataKey="fanLowCmd" name="FanL Cmd" stroke="#F59E0B" strokeWidth={1.5} dot={false} connectNulls />
                      <Line type="stepAfter" dataKey="fanLowAct" name="FanL Act" stroke="#10B981" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />
                      <Line type="stepAfter" dataKey="fanHighCmd" name="FanH Cmd" stroke="#D97706" strokeWidth={1.5} dot={false} connectNulls />
                      <Line type="stepAfter" dataKey="fanHighAct" name="FanH Act" stroke="#059669" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />
                      <Line type="stepAfter" dataKey="compCmd" name="Comp Cmd" stroke="#FBBF24" strokeWidth={1.5} dot={false} connectNulls />
                      <Line type="stepAfter" dataKey="compAct" name="Comp Act" stroke="#34D399" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />
                      <Line type="stepAfter" dataKey="revCmd" name="RV Cmd" stroke="#8B5CF6" strokeWidth={1.5} dot={false} connectNulls />
                      <Line type="stepAfter" dataKey="revAct" name="RV Act" stroke="#A78BFA" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />
                      <Line type="stepAfter" dataKey="heatCmd" name="HT Cmd" stroke="#EF4444" strokeWidth={1.5} dot={false} connectNulls />
                      <Line type="stepAfter" dataKey="heatAct" name="HT Act" stroke="#F87171" strokeWidth={1.2} dot={false} strokeDasharray="3 3" connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Signal Validation Table (Fix 1) */}
            <div className="xl:col-span-5 bg-black/20 p-4 border border-prizm-border/50 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-extrabold text-prizm-text uppercase tracking-wider">Signal Validation Matrix</span>
                  <button 
                    onClick={() => setShowValidationMatrix(prev => !prev)}
                    className="text-[8px] bg-prizm-primary/10 hover:bg-prizm-primary/20 text-prizm-primary border border-prizm-primary/20 rounded px-1.5 py-0.5 font-mono font-bold cursor-pointer"
                  >
                    {showValidationMatrix ? "Hide Matrix" : "Show Matrix"}
                  </button>
                </div>

                {showValidationMatrix ? (
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
                          const currentHvacKey = binaryChartUnit === 1 ? "hvac1" : "hvac2";
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
                                {res.consecutiveCount}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-prizm-text-muted/60 italic border border-dashed border-prizm-border/20 rounded bg-black/10 text-[9px]">
                    Matrix collapsed. Click "Show Matrix" above to verify commanded vs active relay signals.
                  </div>
                )}
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
