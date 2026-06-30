import React, { useState, useMemo, useRef } from "react";
import { 
  Activity, 
  Flame, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  Info,
  ChevronRight,
  Sparkles,
  ArrowRight
} from "lucide-react";
import { BlockSensorMatrixRow, NormalizedSensorCell, isPhysicalSensorEnclosureRow } from "./topologyUtils";
import { getArrayLocalEnergySegmentNumber } from "../../lib/segmentNumbering";
import { normalizeSegmentIdentity } from "../../lib/segmentIdentity";

function formatResolvedSensorState(cell: any) {
  if (!cell) return "UNKNOWN";
  if (cell.displayState === "normal") return "CLEAR";
  if (cell.displayState === "open") return "OPEN";
  if (cell.displayState === "alarm") return "ALARM";
  if (cell.displayState === "fault") return "FAULT";
  if (cell.displayState === "warning") return "WARNING";
  if (cell.displayState === "unavailable") return "UNAVAILABLE";
  if (cell.displayState === "not-monitored") return "NOT MONITORED";
  if (cell.rawState && cell.rawState !== "UNKNOWN") return cell.rawState;
  if (cell.displayValue && cell.displayValue !== "Unknown") return cell.displayValue;
  if (cell.healthy === true && cell.tripped !== true) return "CLEAR";
  return "UNKNOWN";
}

interface SiteOverheadSensorMapProps {
  rows: BlockSensorMatrixRow[];
  selectedRow: BlockSensorMatrixRow | null;
  onSelectRow: (row: BlockSensorMatrixRow) => void;
}


interface SegmentSummary {
  arrayIndex: number;
  segmentType: "CS" | "ES";
  segmentNumber: number;
  label: string;
  monitoredSensorCount: number;
  healthySensorCount: number;
  warningSensorCount: number;
  faultedSensorCount: number;
  unavailableSensorCount: number;
  operationalState: "healthy" | "warning" | "faulted" | "unavailable" | "not-configured";
  row: BlockSensorMatrixRow;
  monitoredSensors: {
    key: string;
    label: string;
    displayState: string;
    healthy: boolean;
    tripped: boolean;
    displayValue: string;
    category: string;
  }[];
  unmonitoredActiveCount: number;
}

export default function SiteOverheadSensorMap({
  rows,
  selectedRow,
  onSelectRow
}: SiteOverheadSensorMapProps) {
  const [hoveredSegment, setHoveredSegment] = useState<SegmentSummary | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Helper to extract Array number
  const getArrayNumber = (displayName: string): number => {
    const m = displayName.match(/Array\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : 999;
  };

  // Helper to collect monitored sensors and determine states
  const getSegmentSummary = (row: BlockSensorMatrixRow): SegmentSummary => {
    const name = row.location?.displayName || "";
    const arrayIndex = getArrayNumber(name);

    const ident = normalizeSegmentIdentity({
      arrayNumber: arrayIndex,
      stringNumber: row.topology?.segmentIndex,
      localEsNumber: row.topology?.energySegmentIndex,
      enclosureType: row.location?.enclosureType,
      displayLabel: row.topology?.segmentLabel ?? row.location?.displayName ?? row.topology?.displayName,
      enclosureIndex: row.location?.enclosureIndex,
      segmentPosition: row.location?.segmentPosition
    });

    const isCS = ident.enclosureType === "CS" || ident.enclosureType === "CollectionSegment" || ident.displayLabel.includes("CS");
    const segmentType = isCS ? "CS" : "ES";
    const segmentNumber = ident.localEsNumber ?? 0;
    const label = ident.displayLabel;

    const monitoredSensors: any[] = [];
    let unmonitoredActiveCount = 0;

    const addCell = (key: string, label: string, category: string, cell: any) => {
      if (!cell) return;
      
      const isMonitored = cell.monitoredByProfile === true && cell.contributesToHealth === true;
      const isTripped = cell.tripped === true || ["alarm", "fault", "open"].includes(cell.displayState || "");

      if (isMonitored) {
        monitoredSensors.push({
          key,
          label,
          displayState: cell.displayState || "unknown",
          healthy: cell.healthy ?? true,
          tripped: isTripped,
          displayValue: formatResolvedSensorState(cell),
          category
        });
      } else {
        // Count unmonitored raw active faults
        if (isTripped) {
          unmonitoredActiveCount++;
        }
      }
    };

    // Parse emergencySensors
    if (row.emergencySensors) {
      addCell("moisture", "Water/Condensate Sensor", "Emergency", row.emergencySensors.moisture);
    }
    // Parse comStatus
    if (row.comStatus) {
      addCell("io", "IO Communications", "Communications", row.comStatus.io);
      addCell("dataCommunications", "Data Communications", "Communications", row.comStatus.dataCommunications);
    }
    // Parse doorSensors
    if (row.doorSensors) {
      addCell("acDoors", "AC Doors", "Doors", row.doorSensors.acDoors);
      addCell("dcDoors", "DC Doors", "Doors", row.doorSensors.dcDoors);
      addCell("topCapDoors", "Top Cap Doors", "Doors", row.doorSensors.topCapDoors);
      addCell("batteryDoors", "Battery Doors", "Doors", row.doorSensors.batteryDoors);
    }
    // Parse otherSensors
    if (row.otherSensors) {
      addCell("modbusEStop", "Modbus E-Stop", "Safety", row.otherSensors.modbusEStop);
      addCell("manualVentilation", "Manual Ventilation", "Ventilation", row.otherSensors.manualVentilation);
      addCell("envControllerVent", "Environment Controller Ventilation", "Ventilation", row.otherSensors.envControllerVent);
      addCell("envControllerLostComms", "Environment Controller Comms Loss", "Communications", row.otherSensors.envControllerLostComms);
      addCell("upsAlarm", "UPS Alarm", "Power", row.otherSensors.upsAlarm);
      addCell("smoke", "Smoke Signal", "Fire", row.otherSensors.smoke);
      addCell("heat", "Heat Sensor", "Fire", row.otherSensors.heat);
      addCell("fire", "FSS Fire/Smoke Signal", "Fire", row.otherSensors.fire);
      addCell("fireTrouble", "FSS Fire Trouble Signal", "Fire", row.otherSensors.fireTrouble);
      addCell("hydrogen", "Hydrogen Sensor", "Gas", row.otherSensors.hydrogen);
      addCell("hydrogenFault", "Hydrogen Fault Signal", "Gas", row.otherSensors.hydrogenFault);
    }

    const monitoredSensorCount = monitoredSensors.length;
    let faultedSensorCount = 0;
    let unavailableSensorCount = 0;
    let healthySensorCount = 0;

    monitoredSensors.forEach((s) => {
      if (s.tripped) {
        faultedSensorCount++;
      } else if (s.displayState === "unavailable" || s.displayState === "warning" || !s.healthy) {
        unavailableSensorCount++;
      } else {
        healthySensorCount++;
      }
    });

    let operationalState: "healthy" | "warning" | "faulted" | "unavailable" | "not-configured" = "healthy";
    if (monitoredSensorCount === 0) {
      operationalState = "not-configured";
    } else if (faultedSensorCount > 0) {
      operationalState = "faulted";
    } else if (unavailableSensorCount > 0) {
      operationalState = "unavailable";
    }

    return {
      arrayIndex,
      segmentType,
      segmentNumber,
      label,
      monitoredSensorCount,
      healthySensorCount,
      warningSensorCount: unavailableSensorCount, // Map to warning category
      faultedSensorCount,
      unavailableSensorCount,
      operationalState,
      row,
      monitoredSensors,
      unmonitoredActiveCount
    };
  };

  // Group rows into arrays
  const arrayGroups = useMemo(() => {
    const groups: Record<number, SegmentSummary[]> = {};
    rows.forEach((row) => {
      if (!isPhysicalSensorEnclosureRow(row)) return;
      if (!row.location) return;
      
      const summary = getSegmentSummary(row);
      const arrNum = summary.arrayIndex;
      if (arrNum === 999) return;

      if (!groups[arrNum]) {
        groups[arrNum] = [];
      }
      groups[arrNum].push(summary);
    });

    // Sort segments in each array: CS first, then ES segments sorted by ES number
    const sortedArrays: { arrayIndex: number; segments: SegmentSummary[] }[] = [];
    Object.keys(groups).forEach((key) => {
      const idx = parseInt(key, 10);
      const segs = groups[idx];
      segs.sort((a, b) => {
        if (a.segmentType === "CS" && b.segmentType !== "CS") return -1;
        if (a.segmentType !== "CS" && b.segmentType === "CS") return 1;
        return a.segmentNumber - b.segmentNumber;
      });
      sortedArrays.push({
        arrayIndex: idx,
        segments: segs
      });
    });

    // Sort array rows by arrayIndex
    sortedArrays.sort((a, b) => a.arrayIndex - b.arrayIndex);
    return sortedArrays;
  }, [rows]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({
        x: e.clientX - rect.left + 15,
        y: e.clientY - rect.top + 15
      });
    }
  };

  const handleTileClick = (summary: SegmentSummary) => {
    onSelectRow(summary.row);
    // Smoothly scroll the corresponding physical matrix row into view
    setTimeout(() => {
      const element = document.getElementById(`row-${summary.row.id}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  };

  return (
    <div 
      ref={containerRef}
      className="relative bg-white border border-slate-200 rounded-xl p-4 shadow-2xs mb-5 font-sans"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
        <div>
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest font-mono flex items-center gap-1.5">
            <Activity className="text-emerald-600 animate-pulse" size={14} /> 
            Site Overhead Sensor Map
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Horizontally scrollable live layout. Green indicates all active profile-monitored sensors are normal. Click tiles to highlight details.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-slate-50 border border-slate-200/60 rounded px-2.5 py-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500 border border-emerald-600/20" />
            <span className="text-slate-650">Healthy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-500 border border-amber-600/20" />
            <span className="text-slate-650">Warning/Comms Lost</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-red-500 border border-red-600/20 animate-pulse" />
            <span className="text-slate-650">Faulted/Tripped</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-slate-300 border border-slate-400/20" />
            <span className="text-slate-650">Not Configured</span>
          </div>
        </div>
      </div>

      {arrayGroups.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-450 border border-dashed border-slate-200 rounded-lg">
          No BESS site arrays configured in current data scope.
        </div>
      ) : (
        <div className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200">
          <div className="min-w-max space-y-2">
            {arrayGroups.map((group) => (
              <div 
                key={group.arrayIndex} 
                className="flex items-center gap-1 bg-slate-50/50 p-1 rounded-lg border border-slate-100 hover:border-slate-200 transition-all"
              >
                {/* Sticky Left Label */}
                <div className="sticky left-0 bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[9px] font-extrabold rounded px-2.5 py-1.5 w-20 text-center uppercase tracking-wider select-none z-10 shadow-xs">
                  Array {group.arrayIndex}
                </div>

                {/* CS Enclosure Tile */}
                <div className="flex gap-1 pl-1">
                  {group.segments.map((summary) => {
                    const isCS = summary.segmentType === "CS";
                    const isSelected = selectedRow?.id === summary.row.id;

                    let tileClass = "border bg-slate-100 text-slate-400 border-slate-200";
                    let stateLabel = "Not Configured";

                    if (summary.operationalState === "healthy") {
                      tileClass = `bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-300/60 ${isSelected ? "ring-2 ring-emerald-500 ring-offset-1" : ""}`;
                      stateLabel = "HEALTHY";
                    } else if (summary.operationalState === "warning") {
                      tileClass = `bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-300/60 ${isSelected ? "ring-2 ring-amber-500 ring-offset-1" : ""}`;
                      stateLabel = "WARNING";
                    } else if (summary.operationalState === "faulted") {
                      tileClass = `bg-red-50 text-red-700 hover:bg-red-100 border-red-300/60 animate-pulse ${isSelected ? "ring-2 ring-red-500 ring-offset-1" : ""}`;
                      stateLabel = "FAULTED";
                    }

                    // CS has slightly distinct styling
                    const designClass = isCS 
                      ? "rounded-md border-2 font-black px-3.5 py-1 text-[11px] min-w-[70px]" 
                      : "rounded border px-2 py-1 text-[10px] min-w-[55px]";

                    return (
                      <button
                        key={summary.row.id}
                        type="button"
                        onClick={() => handleTileClick(summary)}
                        onMouseEnter={(e) => {
                          setHoveredSegment(summary);
                          handleMouseMove(e);
                        }}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={() => setHoveredSegment(null)}
                        className={`flex flex-col items-center justify-center transition-all cursor-pointer font-mono font-bold text-center uppercase h-10 shadow-3xs ${tileClass} ${designClass}`}
                      >
                        <span className="leading-tight">{summary.label}</span>
                        {summary.monitoredSensorCount > 0 ? (
                          <span className="text-[7.5px] font-extrabold opacity-75 leading-none mt-0.5">
                            {summary.faultedSensorCount > 0 ? `${summary.faultedSensorCount} F` : `${summary.monitoredSensorCount} M`}
                          </span>
                        ) : (
                          <span className="text-[7px] opacity-50 leading-none mt-0.5">--</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating Detailed Hover Popover */}
      {hoveredSegment && tooltipPos && (
        <div 
          style={{ 
            top: tooltipPos.y, 
            left: tooltipPos.x,
            maxWidth: "340px",
            minWidth: "250px"
          }}
          className="absolute bg-slate-900 text-white rounded-lg p-3.5 shadow-xl border border-slate-800 z-50 text-[11px] font-sans pointer-events-none select-none transition-opacity duration-150"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 font-mono">
            <span className="font-extrabold text-xs text-indigo-400">
              Array {hoveredSegment.arrayIndex} - {hoveredSegment.label}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest ${
              hoveredSegment.operationalState === "healthy" 
                ? "bg-emerald-950 text-emerald-400 border border-emerald-800/40" 
                : hoveredSegment.operationalState === "warning" 
                ? "bg-amber-950 text-amber-400 border border-amber-800/40" 
                : "bg-red-950 text-red-400 border border-red-800/40"
            }`}>
              {hoveredSegment.operationalState}
            </span>
          </div>

          <div className="space-y-1 text-slate-350">
            <div className="flex justify-between">
              <span>Segment Type:</span>
              <strong className="text-white font-mono">{hoveredSegment.segmentType === "CS" ? "Collection Segment" : "Energy Segment"}</strong>
            </div>
            <div className="flex justify-between">
              <span>Monitored Sensors:</span>
              <strong className="text-white font-mono">{hoveredSegment.monitoredSensorCount}</strong>
            </div>
            <div className="flex justify-between text-emerald-400">
              <span>Healthy:</span>
              <strong className="font-mono">{hoveredSegment.healthySensorCount}</strong>
            </div>
            <div className="flex justify-between text-red-400">
              <span>Faulted:</span>
              <strong className="font-mono">{hoveredSegment.faultedSensorCount}</strong>
            </div>
            {hoveredSegment.unavailableSensorCount > 0 && (
              <div className="flex justify-between text-amber-400">
                <span>Unavailable:</span>
                <strong className="font-mono">{hoveredSegment.unavailableSensorCount}</strong>
              </div>
            )}
          </div>

          {/* Granular list of monitored sensors */}
          {hoveredSegment.monitoredSensors.length > 0 && (
            <div className="border-t border-slate-800/60 pt-2 mt-2 space-y-1">
              <span className="text-[9px] uppercase font-bold tracking-wider text-slate-450 block font-mono">Monitored Points Scope:</span>
              <div className="space-y-0.5 max-h-[160px] overflow-y-auto pr-1">
                {hoveredSegment.monitoredSensors.map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-2 py-0.5 border-b border-slate-800/30 text-[10px]">
                    <div className="flex items-center gap-1.5 truncate">
                      {s.tripped ? (
                        <Flame size={10} className="text-red-500 animate-pulse shrink-0" />
                      ) : !s.healthy || s.displayState === "unavailable" ? (
                        <AlertTriangle size={10} className="text-amber-500 shrink-0" />
                      ) : (
                        <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                      )}
                      <span className="truncate text-slate-200 font-medium">{s.label}</span>
                    </div>
                    <span className={`font-mono text-[9px] shrink-0 font-bold ${
                      s.tripped 
                        ? "text-red-400" 
                        : !s.healthy || s.displayState === "unavailable" 
                        ? "text-amber-400" 
                        : "text-emerald-400"
                    }`}>
                      {s.displayValue}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hoveredSegment.monitoredSensorCount === 0 && (
            <p className="text-[9px] italic text-slate-400 mt-2">
              No active sensors monitored under current profile configuration.
            </p>
          )}

          {hoveredSegment.faultedSensorCount === 0 && hoveredSegment.monitoredSensorCount > 0 && (
            <div className="text-[9px] text-emerald-400 mt-2 bg-emerald-950/40 p-1.5 rounded border border-emerald-900/30 font-semibold text-center">
              ✓ No monitored sensor faults.
            </div>
          )}

          {hoveredSegment.unmonitoredActiveCount > 0 && (
            <div className="text-[8.5px] text-slate-400 mt-2 bg-slate-800/50 p-1 rounded border border-slate-700/30 text-center">
              ℹ {hoveredSegment.unmonitoredActiveCount} unmonitored raw signals active. Check Raw EMS View.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
