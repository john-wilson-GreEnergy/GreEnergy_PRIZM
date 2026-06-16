import React, { useState, useMemo } from "react";
import { 
  Flame, 
  ShieldAlert, 
  Wind, 
  Thermometer, 
  Layers, 
  Cpu, 
  Wifi, 
  DoorOpen, 
  DoorClosed, 
  RotateCw, 
  Search,
  Activity,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle,
  HelpCircle
} from "lucide-react";

// --- Category definitions with icons, descriptions, and keys ---
interface CategoryInfo {
  id: keyof SensorStatuses;
  name: string;
  shortLabel: string;
  icon: React.ComponentType<any>;
}

const CATEGORIES: CategoryInfo[] = [
  { id: "fire", name: "FIRE", shortLabel: "FIRE", icon: Flame },
  { id: "fireTrouble", name: "FIRE TROUBLE", shortLabel: "F-TRB", icon: ShieldAlert },
  { id: "smoke", name: "SMOKE", shortLabel: "SMK", icon: Wind },
  { id: "heat", name: "HEAT", shortLabel: "HEAT", icon: Thermometer },
  { id: "hydrogen", name: "HYDROGEN", shortLabel: "H2", icon: Layers },
  { id: "hydrogenFault", name: "HYDROGEN FAULT", shortLabel: "H2-FLT", icon: AlertTriangle },
  { id: "dataComms", name: "DATA COMMUNICATIONS", shortLabel: "D-COM", icon: Wifi },
  { id: "ioComms", name: "IO COMMUNICATIONS", shortLabel: "I-COM", icon: Cpu },
  { id: "acDoors", name: "AC DOORS", shortLabel: "AC-DR", icon: DoorOpen },
  { id: "dcDoors", name: "DC DOORS", shortLabel: "DC-DR", icon: DoorOpen },
  { id: "topCapDoor", name: "TOP CAP DOOR", shortLabel: "TC-DR", icon: Layers },
  { id: "batteryDoors", name: "BATTERY DOORS", shortLabel: "BT-DR", icon: DoorClosed },
  { id: "manualVentilation", name: "MANUAL VENTILATION", shortLabel: "M-VNT", icon: RotateCw }
];

export interface SensorStatuses {
  fire: "OK" | "ALARM";
  fireTrouble: "OK" | "TROUBLE";
  smoke: "OK" | "ALARM";
  heat: "NORMAL" | "WARNING" | "CRITICAL";
  hydrogen: "OK" | "WARNING" | "CRITICAL";
  hydrogenFault: "OK" | "FAULT";
  dataComms: "OK" | "WARNING" | "ERROR";
  ioComms: "OK" | "WARNING" | "ERROR";
  acDoors: "Closed" | "Open";
  dcDoors: "Closed" | "Open";
  topCapDoor: "Closed" | "Open";
  batteryDoors: "Closed" | "Open";
  manualVentilation: "Inactive" | "Active";
}

export interface SegmentInfo {
  id: string;
  name: string;
  topologySegment: "Site-wide" | "CS / collection segment" | "String/segment rows";
  segmentNum?: number;
  lineupId?: string;
  cabinetPos?: string;
  arrayIndex?: number;
  metadata?: any;
  statuses: SensorStatuses;
}

// Initial default SCADA telemetry rows structured exactly by topology segment
const INITIAL_SEGMENTS: SegmentInfo[] = [
  // Site-wide Segment Rows
  {
    id: "SITE-SW-01",
    name: "Site Fire Safety Node Desk (FC-200)",
    topologySegment: "Site-wide",
    statuses: {
      fire: "OK",
      fireTrouble: "OK",
      smoke: "OK",
      heat: "NORMAL",
      hydrogen: "OK",
      hydrogenFault: "OK",
      dataComms: "OK",
      ioComms: "OK",
      acDoors: "Closed",
      dcDoors: "Closed",
      topCapDoor: "Closed",
      batteryDoors: "Closed",
      manualVentilation: "Inactive"
    }
  },
  {
    id: "SITE-SW-02",
    name: "Site Main Power Quality Gateway RTU (RTU-S01)",
    topologySegment: "Site-wide",
    statuses: {
      fire: "OK",
      fireTrouble: "OK",
      smoke: "OK",
      heat: "NORMAL",
      hydrogen: "OK",
      hydrogenFault: "OK",
      dataComms: "OK",
      ioComms: "OK",
      acDoors: "Closed",
      dcDoors: "Closed",
      topCapDoor: "Closed",
      batteryDoors: "Closed",
      manualVentilation: "Inactive"
    }
  },

  // CS / Collection Segment Rows
  {
    id: "CS-LINEUP-1",
    name: "Collection Segment 1 Lineup Node",
    topologySegment: "CS / collection segment",
    lineupId: "Lineup 1",
    statuses: {
      fire: "OK",
      fireTrouble: "OK",
      smoke: "OK",
      heat: "NORMAL",
      hydrogen: "OK",
      hydrogenFault: "OK",
      dataComms: "OK",
      ioComms: "OK",
      acDoors: "Closed",
      dcDoors: "Closed",
      topCapDoor: "Closed",
      batteryDoors: "Closed",
      manualVentilation: "Inactive"
    }
  },
  {
    id: "CS-LINEUP-2",
    name: "Collection Segment 2 Lineup Node (CS-2 Hub)",
    topologySegment: "CS / collection segment",
    lineupId: "Lineup 2",
    statuses: {
      fire: "OK",
      fireTrouble: "TROUBLE", // Warning
      smoke: "OK",
      heat: "NORMAL",
      hydrogen: "OK",
      hydrogenFault: "OK",
      dataComms: "WARNING", // Warning
      ioComms: "OK",
      acDoors: "Open", // Warning
      dcDoors: "Closed",
      topCapDoor: "Closed",
      batteryDoors: "Closed",
      manualVentilation: "Active" // Highlighted
    }
  },
  {
    id: "CS-LINEUP-3",
    name: "Collection Segment 3 Lineup Node",
    topologySegment: "CS / collection segment",
    lineupId: "Lineup 3",
    statuses: {
      fire: "OK",
      fireTrouble: "OK",
      smoke: "OK",
      heat: "NORMAL",
      hydrogen: "OK",
      hydrogenFault: "OK",
      dataComms: "OK",
      ioComms: "OK",
      acDoors: "Closed",
      dcDoors: "Closed",
      topCapDoor: "Closed",
      batteryDoors: "Closed",
      manualVentilation: "Inactive"
    }
  },
  {
    id: "CS-LINEUP-4",
    name: "Collection Segment 4 Lineup Node (CS-4 Hub)",
    topologySegment: "CS / collection segment",
    lineupId: "Lineup 4",
    statuses: {
      fire: "OK",
      fireTrouble: "OK",
      smoke: "OK",
      heat: "NORMAL",
      hydrogen: "OK",
      hydrogenFault: "OK",
      dataComms: "OK",
      ioComms: "ERROR", // Alarm/Critical
      acDoors: "Closed",
      dcDoors: "Closed",
      topCapDoor: "Closed",
      batteryDoors: "Closed",
      manualVentilation: "Inactive"
    }
  },

  // String / Segment Rows
  {
    id: "STR-SEG-12",
    name: "String Segment 12 Unit",
    topologySegment: "String/segment rows",
    segmentNum: 12,
    lineupId: "Lineup 1",
    cabinetPos: "P1",
    arrayIndex: 1,
    statuses: {
      fire: "OK",
      fireTrouble: "OK",
      smoke: "OK",
      heat: "NORMAL",
      hydrogen: "OK",
      hydrogenFault: "OK",
      dataComms: "OK",
      ioComms: "OK",
      acDoors: "Closed",
      dcDoors: "Closed",
      topCapDoor: "Closed",
      batteryDoors: "Closed",
      manualVentilation: "Inactive"
    }
  },
  {
    id: "STR-SEG-38",
    name: "String Segment 38 Unit",
    topologySegment: "String/segment rows",
    segmentNum: 38,
    lineupId: "Lineup 1",
    cabinetPos: "P2",
    arrayIndex: 1,
    statuses: {
      fire: "OK",
      fireTrouble: "OK",
      smoke: "OK",
      heat: "NORMAL",
      hydrogen: "OK",
      hydrogenFault: "OK",
      dataComms: "OK",
      ioComms: "OK",
      acDoors: "Closed",
      dcDoors: "Closed",
      topCapDoor: "Closed",
      batteryDoors: "Closed",
      manualVentilation: "Inactive"
    }
  },
  {
    id: "STR-SEG-41",
    name: "String Segment 41 Unit",
    topologySegment: "String/segment rows",
    segmentNum: 41,
    lineupId: "Lineup 2",
    cabinetPos: "P1",
    arrayIndex: 2,
    statuses: {
      fire: "OK",
      fireTrouble: "OK",
      smoke: "OK",
      heat: "NORMAL",
      hydrogen: "OK",
      hydrogenFault: "OK",
      dataComms: "OK",
      ioComms: "OK",
      acDoors: "Closed",
      dcDoors: "Closed",
      topCapDoor: "Closed",
      batteryDoors: "Closed",
      manualVentilation: "Inactive"
    }
  },
  {
    id: "STR-SEG-44",
    name: "String Segment 44 Unit (Fault Block)",
    topologySegment: "String/segment rows",
    segmentNum: 44,
    lineupId: "Lineup 2",
    cabinetPos: "P2",
    arrayIndex: 2,
    statuses: {
      fire: "OK",
      fireTrouble: "OK",
      smoke: "OK",
      heat: "NORMAL",
      hydrogen: "OK",
      hydrogenFault: "OK",
      dataComms: "OK",
      ioComms: "OK",
      acDoors: "Closed",
      dcDoors: "Open", // Alarm / Open State
      topCapDoor: "Closed",
      batteryDoors: "Open", // Alarm / Open State
      manualVentilation: "Inactive"
    }
  },
  {
    id: "STR-SEG-85",
    name: "String Segment 85 Unit",
    topologySegment: "String/segment rows",
    segmentNum: 85,
    lineupId: "Lineup 3",
    cabinetPos: "P1",
    arrayIndex: 3,
    statuses: {
      fire: "OK",
      fireTrouble: "OK",
      smoke: "OK",
      heat: "NORMAL",
      hydrogen: "OK",
      hydrogenFault: "OK",
      dataComms: "OK",
      ioComms: "OK",
      acDoors: "Closed",
      dcDoors: "Closed",
      topCapDoor: "Closed",
      batteryDoors: "Closed",
      manualVentilation: "Inactive"
    }
  },
  {
    id: "STR-SEG-92",
    name: "String Segment 92 Unit",
    topologySegment: "String/segment rows",
    segmentNum: 92,
    lineupId: "Lineup 3",
    cabinetPos: "P2",
    arrayIndex: 3,
    statuses: {
      fire: "OK",
      fireTrouble: "OK",
      smoke: "OK",
      heat: "NORMAL",
      hydrogen: "OK",
      hydrogenFault: "OK",
      dataComms: "OK",
      ioComms: "OK",
      acDoors: "Closed",
      dcDoors: "Closed",
      topCapDoor: "Closed",
      batteryDoors: "Closed",
      manualVentilation: "Inactive"
    }
  },
  {
    id: "STR-SEG-110",
    name: "String Segment 110 Unit",
    topologySegment: "String/segment rows",
    segmentNum: 110,
    lineupId: "Lineup 4",
    cabinetPos: "P1",
    arrayIndex: 4,
    statuses: {
      fire: "OK",
      fireTrouble: "OK",
      smoke: "OK",
      heat: "NORMAL",
      hydrogen: "OK",
      hydrogenFault: "OK",
      dataComms: "OK",
      ioComms: "OK",
      acDoors: "Closed",
      dcDoors: "Closed",
      topCapDoor: "Closed",
      batteryDoors: "Closed",
      manualVentilation: "Inactive"
    }
  },
  {
    id: "STR-SEG-147",
    name: "String Segment 147 Unit (Overheat Warning)",
    topologySegment: "String/segment rows",
    segmentNum: 147,
    lineupId: "Lineup 4",
    cabinetPos: "P2",
    arrayIndex: 4,
    statuses: {
      fire: "OK",
      fireTrouble: "OK",
      smoke: "OK",
      heat: "WARNING", // Warning
      hydrogen: "WARNING", // Warning
      hydrogenFault: "OK",
      dataComms: "OK",
      ioComms: "OK",
      acDoors: "Closed",
      dcDoors: "Closed",
      topCapDoor: "Closed",
      batteryDoors: "Closed",
      manualVentilation: "Inactive"
    }
  }
];

export default function SensorsView() {
  const [dataRows, setDataRows] = useState<SegmentInfo[]>(INITIAL_SEGMENTS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<keyof SensorStatuses | null>(null);
  const [activeOutliersOnly, setActiveOutliersOnly] = useState(false);

  // Simulation state controls
  const [simTargetNode, setSimTargetNode] = useState<string>("STR-SEG-44");
  const [simTargetCategory, setSimTargetCategory] = useState<keyof SensorStatuses>("fire");
  const [simValue, setSimValue] = useState<string>("ALARM");

  // Helper function to check if a status is considered an Alarm, Warning, or Normal
  const evaluateStatusState = (catId: keyof SensorStatuses, value: string): "alarm" | "warning" | "ok" => {
    switch (catId) {
      case "fire":
        return value === "ALARM" ? "alarm" : "ok";
      case "fireTrouble":
        return value === "TROUBLE" ? "warning" : "ok";
      case "smoke":
        return value === "ALARM" ? "alarm" : "ok";
      case "heat":
        if (value === "CRITICAL") return "alarm";
        if (value === "WARNING") return "warning";
        return "ok";
      case "hydrogen":
        if (value === "CRITICAL") return "alarm";
        if (value === "WARNING") return "warning";
        return "ok";
      case "hydrogenFault":
        return value === "FAULT" ? "alarm" : "ok";
      case "dataComms":
        if (value === "ERROR") return "alarm";
        if (value === "WARNING") return "warning";
        return "ok";
      case "ioComms":
        if (value === "ERROR") return "alarm";
        if (value === "WARNING") return "warning";
        return "ok";
      case "acDoors":
        return value === "Open" ? "warning" : "ok";
      case "dcDoors":
        return value === "Open" ? "alarm" : "ok";
      case "topCapDoor":
        return value === "Open" ? "warning" : "ok";
      case "batteryDoors":
        return value === "Open" ? "alarm" : "ok";
      case "manualVentilation":
        return value === "Active" ? "warning" : "ok";
      default:
        return "ok";
    }
  };

  // Get options for simulated value depend on Category ID
  const getSimValueOptions = (catId: keyof SensorStatuses) => {
    switch (catId) {
      case "fire":
      case "smoke":
        return ["OK", "ALARM"];
      case "fireTrouble":
        return ["OK", "TROUBLE"];
      case "heat":
      case "hydrogen":
        return ["NORMAL", "WARNING", "CRITICAL"];
      case "hydrogenFault":
        return ["OK", "FAULT"];
      case "dataComms":
      case "ioComms":
        return ["OK", "WARNING", "ERROR"];
      case "acDoors":
      case "dcDoors":
      case "topCapDoor":
      case "batteryDoors":
        return ["Closed", "Open"];
      case "manualVentilation":
        return ["Inactive", "Active"];
      default:
        return ["OK"];
    }
  };

  // Trigger telemetry change simulation inject
  const handleSimulationInject = () => {
    setDataRows(prev => prev.map(row => {
      if (row.id === simTargetNode) {
        return {
          ...row,
          statuses: {
            ...row.statuses,
            [simTargetCategory]: simValue as any
          }
        };
      }
      return row;
    }));
  };

  // Reset to original SCADA values
  const handleResetSimulation = () => {
    setDataRows(INITIAL_SEGMENTS);
    setSelectedCategory(null);
    setSearchQuery("");
    setActiveOutliersOnly(false);
  };

  // Rollups computation is run dynamically over active dataRows
  const rollups = useMemo(() => {
    const counts: Record<keyof SensorStatuses, { ok: number; warning: number; alarm: number }> = {} as any;
    
    // Initialize record fields
    CATEGORIES.forEach(cat => {
      counts[cat.id] = { ok: 0, warning: 0, alarm: 0 };
    });

    dataRows.forEach(row => {
      CATEGORIES.forEach(cat => {
        const val = row.statuses[cat.id];
        const state = evaluateStatusState(cat.id, val);
        counts[cat.id][state]++;
      });
    });

    return counts;
  }, [dataRows]);

  // Overall totals across the entire platform
  const overallAlarms = useMemo(() => {
    let total = 0;
    dataRows.forEach(row => {
      CATEGORIES.forEach(cat => {
        if (evaluateStatusState(cat.id, row.statuses[cat.id]) === "alarm") {
          total++;
        }
      });
    });
    return total;
  }, [dataRows]);

  const overallWarnings = useMemo(() => {
    let total = 0;
    dataRows.forEach(row => {
      CATEGORIES.forEach(cat => {
        if (evaluateStatusState(cat.id, row.statuses[cat.id]) === "warning") {
          total++;
        }
      });
    });
    return total;
  }, [dataRows]);

  // Filters application with live states
  const filteredRows = useMemo(() => {
    return dataRows.filter(row => {
      // Search Box filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchName = row.name.toLowerCase().includes(query);
        const matchLineup = row.lineupId?.toLowerCase().includes(query) || false;
        const matchSeg = row.segmentNum?.toString().includes(query) || false;
        const matchId = row.id.toLowerCase().includes(query);
        if (!matchName && !matchLineup && !matchSeg && !matchId) return false;
      }

      // Outliers focus filter (Only show rows with any active Alarms or Warnings)
      if (activeOutliersOnly) {
        const hasOutlier = CATEGORIES.some(cat => 
          evaluateStatusState(cat.id, row.statuses[cat.id]) !== "ok"
        );
        if (!hasOutlier) return false;
      }

      // Active category selection filter highlights and focuses
      if (selectedCategory) {
        // If sidebar category is selected, let's show rows that are NOT 'ok' in that category
        const targetState = evaluateStatusState(selectedCategory, row.statuses[selectedCategory]);
        if (targetState === "ok" && (activeOutliersOnly || searchQuery)) {
          // Keep it if they wanted search results, otherwise filter
        }
      }

      return true;
    });
  }, [dataRows, searchQuery, selectedCategory, activeOutliersOnly]);

  // Segment groups computed over final layout
  const groupedRows = useMemo(() => {
    const siteWide = filteredRows.filter(row => row.topologySegment === "Site-wide");
    const csSegment = filteredRows.filter(row => row.topologySegment === "CS / collection segment");
    const stringSegment = filteredRows.filter(row => row.topologySegment === "String/segment rows");

    return {
      siteWide,
      csSegment,
      stringSegment
    };
  }, [filteredRows]);

  // Render cellular badges for compact column statuses
  const renderCellStatus = (catId: keyof SensorStatuses, value: string) => {
    const type = evaluateStatusState(catId, value);
    if (type === "alarm") {
      return (
        <span 
          className="inline-flex items-center justify-center w-12 py-1 tracking-wider font-extrabold uppercase text-[9px] bg-red-950/40 text-red-400 border border-red-500/30 rounded animate-pulse shadow-sm shadow-red-900/10 cursor-help"
          title={`${catId.toUpperCase()}: ${value} (Active Critical Fault)`}
        >
          {value.substring(0, 3)}
        </span>
      );
    }
    if (type === "warning") {
      return (
        <span 
          className="inline-flex items-center justify-center w-12 py-1 tracking-wider font-bold uppercase text-[9px] bg-amber-950/30 text-amber-500 border border-amber-600/20 rounded cursor-help"
          title={`${catId.toUpperCase()}: ${value} (Operational Warning)`}
        >
          {value.substring(0, 3)}
        </span>
      );
    }
    return (
      <span 
        className="inline-flex items-center justify-center w-12 py-1 tracking-wider text-[9px] bg-neutral-900/60 text-emerald-400/90 border border-emerald-500/10 rounded cursor-help"
        title={`${catId.toUpperCase()}: ${value} (Active System Safe)`}
      >
        {value.substring(0, 3)}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-4 bg-[#08090C] text-slate-300 font-mono p-1">
      
      {/* SCADA INTERACTIVE SIMULATION OVERLAY BOX */}
      <div className="bg-[#0E1017] border border-cyan-500/15 p-3 rounded-lg flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-cyan-400 animate-pulse" />
            <span className="font-extrabold text-xs text-white uppercase tracking-wider">Prizm SCADA Sensor Signal Injector</span>
            <span className="bg-cyan-500/5 border border-cyan-500/25 text-[8.5px] px-1.5 py-0.5 rounded text-cyan-400 font-bold">DEVELOPER TOOLS</span>
          </div>
          <p className="text-[10px] text-slate-400 font-sans">
            Manually trigger and simulated safety state transitions. Live rollups are updated instantly.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Target Nodes */}
          <div className="flex flex-col gap-1">
            <label className="text-[8.5px] text-slate-400 font-bold uppercase">Target Hardware Node</label>
            <select
              value={simTargetNode}
              onChange={(e) => setSimTargetNode(e.target.value)}
              className="bg-black text-slate-100 text-[10.5px] border border-white/10 rounded px-2 py-1 font-mono focus:outline-none focus:border-cyan-500 min-w-[150px]"
            >
              {dataRows.map(row => (
                <option key={row.id} value={row.id}>
                  [{row.topologySegment.substring(0, 4)}] {row.name.split(" Node")[0].replace(" Segment", " Seg")}
                </option>
              ))}
            </select>
          </div>

          {/* Sensor Column Category Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[8.5px] text-slate-400 font-bold uppercase">Sensor Category</label>
            <select
              value={simTargetCategory}
              onChange={(e) => {
                const newCat = e.target.value as keyof SensorStatuses;
                setSimTargetCategory(newCat);
                // Also reset default values
                const opts = getSimValueOptions(newCat);
                setSimValue(opts[opts.length - 1]); // Set warning/alarm state usually last
              }}
              className="bg-black text-slate-100 text-[10.5px] border border-white/10 rounded px-2 py-1 font-mono focus:outline-none focus:border-cyan-500 min-w-[140px]"
            >
              {CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* New target state value */}
          <div className="flex flex-col gap-1">
            <label className="text-[8.5px] text-slate-400 font-bold uppercase">New Signal State</label>
            <select
              value={simValue}
              onChange={(e) => setSimValue(e.target.value)}
              className="bg-black text-slate-100 text-[10.5px] border border-white/10 rounded px-2 py-1 font-mono focus:outline-none focus:border-cyan-500"
            >
              {getSimValueOptions(simTargetCategory).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Simulation action block */}
          <div className="flex items-end self-end gap-1.5 pt-2 xl:pt-0">
            <button
              onClick={handleSimulationInject}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[10.5px] px-3.5 py-1.5 rounded flex items-center gap-1 cursor-pointer transition uppercase"
            >
              <Play size={10} />
              Inject Signal
            </button>
            <button
              onClick={handleResetSimulation}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 font-bold text-[10.5px] px-3.5 py-1.5 rounded flex items-center gap-1 cursor-pointer transition uppercase"
              title="Reset configuration to original defaults"
            >
              <RotateCcw size={10} />
              Reset defaults
            </button>
          </div>
        </div>
      </div>

      {/* THREE ZONE CONTENT GRID */}
      <div className="flex flex-col lg:flex-row gap-4 min-h-[580px]">
        
        {/* SIDEBAR SENSORS INDEX & ROLLUPS (Requirement 1) */}
        <div className="w-full lg:w-64 shrink-0 bg-[#0E1017] border border-white/5 rounded-lg p-3 text-[11px] space-y-4 shadow-md">
          <div className="border-b border-white/10 pb-2 flex justify-between items-center px-1">
            <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Sensor Categories</span>
            <div className="flex items-center gap-1.5 text-[9px]">
              {overallAlarms > 0 && (
                <span className="bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-extrabold border border-red-500/20 max-w-fit flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block animate-pulse" />
                  {overallAlarms}
                </span>
              )}
              {overallWarnings > 0 && (
                <span className="bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-bold border border-amber-500/20 max-w-fit">
                  {overallWarnings} W
                </span>
              )}
              {overallAlarms === 0 && overallWarnings === 0 && (
                <span className="bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-bold border border-emerald-500/20">
                  HEALTHY
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`w-full flex items-center justify-between p-2 rounded text-[10px] font-bold uppercase transition ${
                selectedCategory === null 
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm"
                  : "bg-black/20 text-slate-400 border border-transparent hover:bg-white/[0.02]"
              }`}
            >
              <span>Show All Columns</span>
              <CheckCircle size={10} />
            </button>
            <div className="h-px bg-white/5 my-2" />

            <div className="space-y-1.5 max-h-[540px] overflow-y-auto pr-0.5 scrollbar-thin">
              {CATEGORIES.map((cat) => {
                const stats = rollups[cat.id] || { ok: 0, warning: 0, alarm: 0 };
                const isSelected = selectedCategory === cat.id;

                let categoryStatusColor = "text-emerald-400 bg-emerald-500/[0.03]";
                let categoryLabel = "OK";
                if (stats.alarm > 0) {
                  categoryStatusColor = "text-red-400 bg-red-500/[0.04] border-red-500/20 animate-pulse";
                  categoryLabel = `${stats.alarm} Alarm${stats.alarm > 1 ? "s" : ""}`;
                } else if (stats.warning > 0) {
                  categoryStatusColor = "text-amber-500 bg-amber-500/[0.03] border-amber-500/15";
                  categoryLabel = `${stats.warning} Warn`;
                }

                const CategoryIcon = cat.icon;

                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(isSelected ? null : cat.id)}
                    className={`w-full text-left p-2 rounded transition-all border text-[10px] uppercase flex flex-col gap-1 cursor-pointer ${
                      isSelected
                        ? "bg-cyan-950/40 border-cyan-500 text-white"
                        : "bg-black/35 border-white/[0.03] hover:border-white/10 hover:bg-black/50"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold flex items-center gap-1.5 tracking-tight text-white/95">
                        <CategoryIcon size={12} className={isSelected ? "text-cyan-400" : "text-slate-400"} />
                        {cat.name}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-extrabold border leading-none ${categoryStatusColor}`}>
                        {categoryLabel}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[9px] text-slate-500 mt-1">
                      <span>Safe/All Count:</span>
                      <span className="font-bold font-mono text-slate-400">
                        {stats.ok} / {dataRows.length}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* MAIN PANEL AREA: TOPOLOGY SEGMENT TABLES (Requirement 2) */}
        <div className="flex-1 space-y-4">
          
          {/* HEADER AND TOOL PANEL CONTROLS */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#11131A] p-3 rounded-lg border border-white/5 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="font-extrabold text-white text-[11px] uppercase tracking-wider">
                Platform Safety Topology Matrix (1,840 Active Transducers)
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Outliers switcher check */}
              <label className="flex items-center gap-1.5 text-[10px] text-slate-300 font-bold uppercase cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={activeOutliersOnly}
                  onChange={(e) => setActiveOutliersOnly(e.target.checked)}
                  className="rounded border-white/15 bg-black text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer"
                />
                Outliers Only
              </label>

              {/* Search text box input */}
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-2.5 text-white/30" />
                <input 
                  type="text" 
                  placeholder="Filter node or lineup..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-black border border-white/10 rounded pl-7 pr-2 py-1.5 text-[10px] font-mono text-white placeholder-white/20 focus:outline-none focus:border-cyan-500 w-44"
                />
              </div>
            </div>
          </div>

          {/* SUMMARY INFORMATIVE CARD */}
          {selectedCategory && (
            <div className="bg-cyan-950/20 border border-cyan-500/20 p-2.5 rounded-lg text-[10.5px] flex items-center justify-between text-slate-300 animate-fade-in font-sans">
              <div className="flex items-center gap-2 font-mono">
                <span className="p-1 rounded bg-cyan-500/10 text-cyan-400">
                  {React.createElement(CATEGORIES.find(c => c.id === selectedCategory)?.icon || HelpCircle, { size: 13 })}
                </span>
                <span>
                  Currently highlighting <strong>{CATEGORIES.find(c => c.id === selectedCategory)?.name}</strong> column spread. Click any category sidebar block to clear or swap columns.
                </span>
              </div>
              <button 
                onClick={() => setSelectedCategory(null)}
                className="text-[9.5px] uppercase font-bold text-cyan-400 hover:underline cursor-pointer font-mono"
              >
                Clear Column Focus
              </button>
            </div>
          )}

          {/* TOPOLOGY COLLAPSIBLE ZONE SEGMENTS DATA STREAM */}
          <div className="border border-white/5 rounded-lg overflow-x-auto bg-[#090B10] shadow-xl">
            <table className="w-full text-left text-[11px] leading-normal border-collapse min-w-[1250px]">
              
              {/* PRIMARY TABLE HEADER */}
              <thead>
                <tr className="bg-black/55 border-b border-white/[0.04] text-slate-500 text-[9px] uppercase font-extrabold select-none">
                  <th className="p-2.5 pl-3 border-r border-white/5 w-16">Segment</th>
                  <th className="p-2.5 border-r border-white/5 w-[190px]">Topology Node Address</th>
                  <th className="p-2.5 border-r border-white/5 w-14 text-center">Array No.</th>
                  <th className="p-2.5 border-r border-white/5 w-14 text-center">Cabinet</th>
                  <th colSpan={13} className="p-2 border-b border-white/5 text-center text-slate-400 bg-white/[0.01]">
                    Sensor Statuses by Individual Categories (13 Channels)
                  </th>
                </tr>

                <tr className="bg-[#11131E] text-slate-400 uppercase text-[9.5px] border-b border-white/10 select-none">
                  <th className="p-2 pl-3">ZONE</th>
                  <th className="p-2 truncate">Controller Location Unit</th>
                  <th className="p-2 text-center">AY</th>
                  <th className="p-2 text-center">POS</th>
                  
                  {/* Category Status Columns */}
                  {CATEGORIES.map((cat) => {
                    const isFocussed = selectedCategory === cat.id;
                    return (
                      <th 
                        key={cat.id} 
                        className={`p-2 w-14 text-center transition-all ${
                          isFocussed ? "bg-cyan-500/10 text-cyan-300 font-extrabold" : "text-slate-400"
                        }`}
                      >
                        <span className="block text-[8px] tracking-tight truncate" title={cat.name}>
                          {cat.shortLabel}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* TABLE BODY SEGMENTS */}
              <tbody className="divide-y divide-white/5">

                {/* ZONE 1: SITE-WIDE */}
                <tr className="bg-slate-900/40 border-y border-white/[0.04] select-none">
                  <td colSpan={17} className="py-2 px-3 text-[9.5px] font-extrabold text-[#7DD3FC] tracking-widest uppercase">
                    Topology Level 1: Site-Wide Segment Nodes ({groupedRows.siteWide.length} systems)
                  </td>
                </tr>

                {groupedRows.siteWide.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="p-3 text-center text-slate-500 text-[10px] italic">No matching Site-wide segment registers found.</td>
                  </tr>
                ) : (
                  groupedRows.siteWide.map((row) => (
                    <tr key={row.id} className="hover:bg-cyan-500/[0.01] transition-colors leading-tight">
                      <td className="p-2 pl-3 text-slate-500 text-[9.5px] font-bold">SITE-W</td>
                      <td className="p-2 font-semibold text-slate-200">{row.name}</td>
                      <td className="p-2 text-center text-slate-500">All</td>
                      <td className="p-2 text-center text-slate-500">MSTR</td>

                      {/* Render status cells */}
                      {CATEGORIES.map((cat) => {
                        const cellVal = row.statuses[cat.id];
                        return (
                          <td 
                            key={cat.id} 
                            className={`p-1.5 text-center transition-all ${
                              selectedCategory === cat.id ? "bg-cyan-500/[0.02]" : ""
                            }`}
                          >
                            {renderCellStatus(cat.id, cellVal)}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}

                {/* ZONE 2: CS / COLLECTION SEGMENTS */}
                <tr className="bg-slate-900/40 border-y border-white/[0.04] select-none mt-4">
                  <td colSpan={17} className="py-2 px-3 text-[9.5px] font-extrabold text-[#F0ABFC] tracking-widest uppercase">
                    Topology Level 2: Lineup Collector Segment Nodes ({groupedRows.csSegment.length} structures)
                  </td>
                </tr>

                {groupedRows.csSegment.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="p-3 text-center text-slate-500 text-[10px] italic">No matching CS/Collection segment registers found.</td>
                  </tr>
                ) : (
                  groupedRows.csSegment.map((row) => (
                    <tr key={row.id} className="hover:bg-cyan-500/[0.01] transition-colors leading-tight">
                      <td className="p-2 pl-3 text-magenta-300 text-[9.5px] font-bold">CS-SEG</td>
                      <td className="p-2 font-semibold text-slate-200">{row.name}</td>
                      <td className="p-2 text-center text-slate-500">--</td>
                      <td className="p-2 text-center text-purple-400 font-bold">{row.lineupId?.replace("Lineup ", "L")}</td>

                      {/* Render status cells */}
                      {CATEGORIES.map((cat) => {
                        const cellVal = row.statuses[cat.id];
                        return (
                          <td 
                            key={cat.id} 
                            className={`p-1.5 text-center transition-all ${
                              selectedCategory === cat.id ? "bg-cyan-500/[0.02]" : ""
                            }`}
                          >
                            {renderCellStatus(cat.id, cellVal)}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}

                {/* ZONE 3: STRING/SEGMENT ROWS */}
                <tr className="bg-slate-900/40 border-y border-white/[0.04] select-none mt-4">
                  <td colSpan={17} className="py-2 px-3 text-[9.5px] font-extrabold text-[#34D399] tracking-widest uppercase">
                    Topology Level 3: Individual String / Segment Active Transducers ({groupedRows.stringSegment.length} Strings)
                  </td>
                </tr>

                {groupedRows.stringSegment.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="p-3 text-center text-slate-500 text-[10px] italic">No matching individual string/segment registers found.</td>
                  </tr>
                ) : (
                  groupedRows.stringSegment.map((row) => {
                    const rowHasAlarm = CATEGORIES.some(cat => evaluateStatusState(cat.id, row.statuses[cat.id]) === "alarm");
                    return (
                      <tr 
                        key={row.id} 
                        className={`hover:bg-cyan-500/[0.01] transition-colors leading-tight ${
                          rowHasAlarm ? "bg-red-500/[0.02] text-red-100 font-bold" : ""
                        }`}
                      >
                        <td className="p-2 pl-3 text-emerald-400 font-bold">SEG-{row.segmentNum}</td>
                        <td className="p-2 text-slate-300 font-medium">Segment {row.segmentNum} active array card</td>
                        <td className="p-2 text-center text-cyan-400 font-bold">{row.arrayIndex ?? "--"}</td>
                        <td className="p-2 text-center text-amber-500 font-semibold">{row.cabinetPos ?? "--"}</td>

                        {/* Render status cells */}
                        {CATEGORIES.map((cat) => {
                          const cellVal = row.statuses[cat.id];
                          return (
                            <td 
                              key={cat.id} 
                              className={`p-1.5 text-center transition-all ${
                                selectedCategory === cat.id ? "bg-cyan-500/[0.02]" : ""
                              }`}
                            >
                              {renderCellStatus(cat.id, cellVal)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}

              </tbody>
            </table>
          </div>

          {/* TELEMETRY EMPTY STATE ACTION RECOGNITION */}
          {filteredRows.length === 0 && (
            <div className="bg-[#0E1017] border border-dashed border-white/10 rounded-lg p-8 text-center space-y-2">
              <AlertTriangle className="mx-auto text-amber-500 animate-bounce" size={24} />
              <p className="text-slate-200 text-xs font-bold font-mono">NO ACTIVE DISCRETE TRANSDUCERS FOUND</p>
              <p className="text-slate-500 text-[10px] max-w-sm mx-auto font-sans">
                The current telemetry list is empty based on the active search keyword (<span className="text-cyan-400 font-mono">"{searchQuery}"</span>) and Outlier filters.
              </p>
              <button
                onClick={handleResetSimulation}
                className="bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 font-bold text-[10px] px-3.5 py-1.5 rounded uppercase hover:bg-cyan-500/10 cursor-pointer transition mt-2 font-mono"
              >
                Reset Search Filters
              </button>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
