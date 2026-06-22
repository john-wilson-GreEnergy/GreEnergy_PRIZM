import React, { useState, useEffect, useMemo } from "react";
import {
  Flame,
  ShieldAlert,
  Wind,
  Thermometer,
  Layers,
  Wifi,
  WifiOff,
  RotateCw,
  Zap,
  Droplet,
  Shield,
  Search,
  Activity,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Cpu,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Sliders,
  Compass,
  Database
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// TypeScript Interfaces
export interface TopologySensorPoint {
  stationCode: string | null;
  blockIndex: number | null;
  sourceEndpoint: string;
  sourcePath: string;
  entityKey: string;
  entityType: string;
  entitySubType: string | null;
  numericId: number | null;
  enclosureIndex: number | null;
  sensorCode: number | null;
  arrayIndex: number | null;
  segmentKind: "CS" | "ES" | "GLOBAL" | "UNKNOWN";
  segmentNumber: number | null;
  displayName: string;
  pointRole: string;
  pointLabel: string;
  statusMessage: string | null;
  communicating: boolean | null;
  enabled: boolean | null;
  ready: boolean | null;
  pointAvailable: boolean;
  availabilityStatus: "Available" | "Offline" | "Disabled" | "Not Ready" | "Unknown";
  activeState: boolean | null;
  activeStateSource: string | null;
  rawValue: unknown;
  pointHealthy: boolean;
  severity: "OK" | "Warning" | "Critical";
  allowFaultReset: boolean | null;
  valueFieldUsed?: string | null;
  labelFromStatusMessage?: string | null;
  raw?: unknown;
}

export interface NormalizedSensorCell {
  applicable: boolean;
  healthy: boolean;
  tripped: boolean | null;
  latched?: boolean;
  value: any;
  status: string;
  displayValue: string;
  friendlyName?: string;
  sensorRole: string;
}

export interface BlockSensorMatrixRow {
  id: string;
  location: {
    enclosureIndex: number | null;
    enclosureType: "CollectionSegment" | "EnergySegment";
    segmentPosition: number | null;
    segmentType: "CollectionSegment" | "EnergySegment";
    lineupId: number | null;
    lineupIndex: number | null;
    siteConnected: boolean;
    segmentCommunicating: boolean;
    displayName: string;
  };
  rowHealthy: boolean;
  actionHealthy?: boolean;
  severity: "OK" | "Warning" | "Critical";
  findings: string[];
  topology: any;
  emergencySensors: {
    moisture: NormalizedSensorCell;
  };
  comStatus: {
    io: NormalizedSensorCell;
    dataCommunications: NormalizedSensorCell;
  };
  doorSensors: {
    acDoors: NormalizedSensorCell;
    dcDoors: NormalizedSensorCell;
    topCapDoors: NormalizedSensorCell;
    batteryDoors: NormalizedSensorCell;
  };
  otherSensors: {
    modbusEStop: NormalizedSensorCell;
    manualVentilation: NormalizedSensorCell;
    envControllerVent: NormalizedSensorCell;
    envControllerLostComms: NormalizedSensorCell;
    upsAlarm: NormalizedSensorCell;
    smoke: NormalizedSensorCell;
    heat: NormalizedSensorCell;
    fire: NormalizedSensorCell;
    fireTrouble: NormalizedSensorCell;
    hydrogen: NormalizedSensorCell;
    hydrogenFault: NormalizedSensorCell;
  };
  thermal: {
    avgCellTemp: number | null;
    maxTemp: number | null;
    minTemp: number | null;
    humidity: number | null;
    ambientTemp: number | null;
    ambientHumidity: number | null;
  } | null;
  unknownSensors: NormalizedSensorCell[];
  raw?: any;
}

export interface TopologySensorSummary {
  success: boolean;
  timestamp: string;
  source: string;
  parserMode: string;
  stationCode: string | null;
  blockIndex: number | null;
  endpoint: string;
  topologyEntityCount: number;
  sensorEntityCount: number;
  openClosedDetectorCount: number;
  humidityTemperatureSensorCount: number;
  pcsEntityCount: number;
  upsOrEStopCount: number;
  groupedEnclosureCount: number;
  activePointCount: number;
  unavailablePointCount: number;
  unknownPointCount: number;
  points: TopologySensorPoint[];
  rows: BlockSensorMatrixRow[];
  debug?: {
    numericIdParseFailedCount?: number;
    globalPointCount?: number;
    sampleGlobalPoints?: Array<{
      entityKey: string | null;
      displayKey: string | null;
      numericId: number | null;
      entityType: string | null;
      entitySubType: string | null;
      pointRole: string;
      displayName: string;
    }>;
    sampleParsedNumericIds?: unknown[];
    sampleNumericIdFailures?: unknown[];
    booleanStateFieldsDiscovered?: string[];
    parserWarnings?: string[];
  };
}

type PointFilterType =
  | "all"
  | "active"
  | "unavailable"
  | "global"
  | "fire"
  | "smoke"
  | "heat"
  | "hydrogen"
  | "doors"
  | "moisture"
  | "upsEstop"
  | "comms"
  | "environment"
  | "unknown";

export default function TopologySensorHealthPanel() {
  const [data, setData] = useState<TopologySensorSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Filter State
  const [activeFilter, setActiveFilter] = useState<PointFilterType>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showDebug, setShowDebug] = useState<boolean>(false);

  // Load Topology Data
  const fetchTopologyData = async (isManual = false) => {
    if (isManual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Direct call to our custom topology endpoint
      const res = await fetch("/api/local/site-sensors/topology?refresh=true&maxAgeMs=0");
      if (!res.ok) {
        throw new Error(`Server returned HTTP state code ${res.status}`);
      }
      const json: TopologySensorSummary = await res.json();
      if (json.success) {
        setData(json);
        setLastUpdated(new Date());
      } else {
        throw new Error("Local responder indicated success state was false");
      }
    } catch (err: any) {
      console.error("Error fetching site-sensors topology:", err);
      setError(err?.message || "Fault encountered while requesting topology information.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTopologyData();

    // Setup 10 seconds background polling
    const timer = setInterval(() => {
      fetchTopologyData(true);
    }, 10000);

    return () => clearInterval(timer);
  }, []);

  // Filter Logic
  const filteredPoints = useMemo(() => {
    if (!data || !data.points) return [];
    return data.points.filter((point) => {
      // 1. Point Filter type matching pointRole or properties
      if (activeFilter === "active" && point.activeState !== true) return false;
      if (activeFilter === "unavailable" && point.pointAvailable) return false;
      if (activeFilter === "global" && point.segmentKind !== "GLOBAL") return false;

      if (activeFilter === "fire" && point.pointRole !== "fire") return false;
      if (activeFilter === "smoke" && point.pointRole !== "smoke") return false;
      if (activeFilter === "heat" && point.pointRole !== "heat") return false;
      if (activeFilter === "hydrogen" && point.pointRole !== "hydrogen" && point.pointRole !== "hydrogenFault") return false;
      if (
        activeFilter === "doors" &&
        point.pointRole !== "acDoors" &&
        point.pointRole !== "dcDoors" &&
        point.pointRole !== "topCapDoors" &&
        point.pointRole !== "batteryDoors"
      ) {
        return false;
      }
      if (activeFilter === "moisture" && point.pointRole !== "moisture") return false;
      if (activeFilter === "upsEstop" && point.pointRole !== "upsAlarm" && point.pointRole !== "modbusEStop") return false;
      if (activeFilter === "comms" && point.pointRole !== "io" && point.pointRole !== "dataCommunications") return false;
      if (activeFilter === "environment" && point.pointRole !== "internalEnvironment" && point.pointRole !== "ambientEnvironment") return false;
      if (activeFilter === "unknown" && point.pointRole !== "unknown") return false;

      // 2. Search box matching key, type, subtype, label, message or displayName
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim();
        const keyMatch = point.entityKey.toLowerCase().includes(query);
        const labelMatch = point.pointLabel.toLowerCase().includes(query);
        const typeMatch = point.entityType.toLowerCase().includes(query);
        const detailsMatch = (point.entitySubType || "").toLowerCase().includes(query);
        const dispNameMatch = point.displayName.toLowerCase().includes(query);
        const msgMatch = (point.statusMessage || "").toLowerCase().includes(query);

        if (!keyMatch && !labelMatch && !typeMatch && !detailsMatch && !dispNameMatch && !msgMatch) {
          return false;
        }
      }

      return true;
    });
  }, [data, activeFilter, searchQuery]);

  // Handle Global Point List
  const globalPoints = useMemo(() => {
    if (!data || !data.points) return [];
    return data.points.filter((point) => point.segmentKind === "GLOBAL");
  }, [data]);

  // Handle Local Physical Rows Formats (Exclude GLOBAL and Array 0 / invalid rows)
  const physicalRows = useMemo(() => {
    if (!data || !data.rows) return [];
    return data.rows.filter((row) => {
      if (!row.location) return false;
      const index = row.location.enclosureIndex;
      if (index === null || index < 1) return false;
      const isCS = row.location.enclosureType === "CollectionSegment";
      const name = row.location.displayName || "";
      // Exclude Array 0 or positions mapped invalidly
      if (name.includes("Array 0") || name.includes("ES-1")) return false;
      return true;
    });
  }, [data]);

  // Overall Severity rollup
  const globalSeverity = useMemo(() => {
    if (!data) return "OK";
    if (data.activePointCount > 0) return "Critical";
    if (
      data.unavailablePointCount > 0 ||
      (data.debug?.numericIdParseFailedCount && data.debug.numericIdParseFailedCount > 0)
    ) {
      return "Warning";
    }
    return "OK";
  }, [data]);

  const severityStyles = {
    Critical: "bg-red-50 text-red-800 border-red-200 shadow-red-50",
    Warning: "bg-amber-50 text-amber-800 border-amber-200 shadow-amber-50",
    OK: "bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-50"
  };

  const getSeverityBadge = (sev: "OK" | "Warning" | "Critical") => {
    switch (sev) {
      case "Critical":
        return <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded border border-red-200 uppercase tracking-wider animate-pulse flex items-center gap-1"><AlertCircle size={12} /> Critical</span>;
      case "Warning":
        return <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 rounded border border-amber-200 uppercase tracking-wider flex items-center gap-1"><AlertTriangle size={12} /> Warning</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-700 rounded border border-emerald-200 uppercase tracking-wider flex items-center gap-1"><CheckCircle2 size={12} /> Connected</span>;
    }
  };

  // Cell status renderer helper
  const renderCellIndicator = (cell: NormalizedSensorCell) => {
    if (!cell || !cell.applicable) {
      return <span className="text-slate-300 font-normal select-none font-mono text-[10px]">-</span>;
    }

    if (cell.tripped === true) {
      return (
        <span
          title={`${cell.friendlyName || "Sensor Tripped"}: ${cell.status}`}
          className="h-5 px-1.5 inline-flex items-center justify-center text-[10px] font-bold rounded bg-red-100 text-red-700 border border-red-200 animate-pulse"
        >
          TRIP
        </span>
      );
    }

    if (!cell.healthy) {
      return (
        <span
          title={`${cell.friendlyName || "Sensor Issue"}: ${cell.status}`}
          className="h-5 px-1.5 inline-flex items-center justify-center text-[10px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-200"
        >
          FAULT
        </span>
      );
    }

    return (
      <span
        title={cell.friendlyName || "Sensor Healthy"}
        className="h-4.5 w-4.5 inline-flex items-center justify-center rounded-full bg-emerald-100 border border-emerald-200"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-600" />
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm flex flex-col items-center justify-center min-h-[300px]">
        <RefreshCw size={32} className="text-slate-400 animate-spin mb-3" />
        <p className="text-slate-600 font-medium">Querying local site sensors topology...</p>
        <p className="text-xs text-slate-400 mt-1 font-mono">GET /api/local/site-sensors/topology</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-white border border-rose-300 rounded-lg p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-rose-50 rounded-lg text-rose-600">
            <AlertCircle size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-rose-900 text-lg">Topology Pipeline Disrupted</h3>
            <p className="text-xs text-rose-700 mt-1 leading-relaxed bg-rose-50/50 p-2.5 rounded border border-rose-100 font-mono select-all">
              {error}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => fetchTopologyData(false)}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-semibold transition-all shadow-sm"
              >
                Retry Active Query
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="topology-sensor-health-submodule">
      {/* 1. Header & Status Strip */}
      <div className={`border rounded-xl p-5 shadow-sm transition-all duration-300 ${severityStyles[globalSeverity]}`}>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className={`p-2 rounded-lg ${globalSeverity === "Critical" ? "bg-red-500 text-white animate-pulse" : "bg-white border border-slate-200 text-slate-800 shadow-sm"}`}>
                <Activity size={20} className="stroke-[2.5]" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold font-sans text-slate-900 tracking-tight leading-none">
                    Topology Sensor Health
                  </h2>
                  <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-white border border-slate-200 text-slate-500 uppercase tracking-widest leading-none">
                    LIVE
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Full schematic scan rendering physical BESS string segments across {data?.groupedEnclosureCount || 0} modular sub-cabinets.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Live details badge */}
            <div className="text-[10px] uppercase font-mono bg-white border border-slate-200 rounded-md p-2 flex items-center gap-3.5 text-slate-600 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${globalSeverity === "Critical" ? "bg-red-500 animate-ping" : "bg-emerald-500"}`} />
                <span>Station: <strong className="text-slate-900">{data?.stationCode || "BHE0020"}</strong></span>
              </div>
              <div className="h-3.5 w-px bg-slate-200" />
              <span>Block: <strong className="text-slate-900">{data?.blockIndex ?? 1}</strong></span>
              <div className="h-3.5 w-px bg-slate-200" />
              <span>Timestamp: <strong className="text-slate-900">{lastUpdated?.toLocaleTimeString()}</strong></span>
            </div>

            <button
              onClick={() => fetchTopologyData(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-1.5 text-xs bg-white text-slate-800 hover:bg-slate-50 transition-colors py-2 px-3.5 rounded-md font-semibold border border-slate-200 shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin text-slate-600" : "text-slate-500"} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Summary Cards Grid */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white border border-slate-200 p-3 h-20 rounded-lg flex flex-col justify-between shadow-sm">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Topology Entities</span>
            <span className="text-lg font-bold text-slate-800 font-mono tracking-tight">
              {data.topologyEntityCount || 0}
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-3 h-20 rounded-lg flex flex-col justify-between shadow-sm">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">OpenClosed Detectors</span>
            <span className="text-lg font-bold text-slate-800 font-mono tracking-tight text-indigo-700">
              {data.openClosedDetectorCount || 0}
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-3 h-20 rounded-lg flex flex-col justify-between shadow-sm">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Temp & Hum Sensors</span>
            <span className="text-lg font-bold text-slate-800 font-mono tracking-tight text-blue-700">
              {data.humidityTemperatureSensorCount || 0}
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-3 h-20 rounded-lg flex flex-col justify-between shadow-sm">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">PCS / UPS / E-Stop</span>
            <span className="text-lg font-bold text-slate-800 font-mono tracking-tight text-amber-700">
              {(data.pcsEntityCount || 0) + (data.upsOrEStopCount || 0)}
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-3 h-20 rounded-lg flex flex-col justify-between shadow-sm">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Warnings</span>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold font-mono tracking-tight ${data.activePointCount > 0 ? "text-red-600 animate-pulse font-extrabold" : "text-emerald-600"}`}>
                {data.activePointCount || 0}
              </span>
              {data.activePointCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-ping inline-block" />}
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-3 h-20 rounded-lg flex flex-col justify-between shadow-sm">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Offline Sensors</span>
            <span className={`text-lg font-bold font-mono tracking-tight ${data.unavailablePointCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {data.unavailablePointCount || 0}
            </span>
          </div>
        </div>
      )}

      {/* 3. Global Block Readiness Section */}
      {data && globalPoints.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-slate-50 border-b border-slate-200 py-3 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1 bg-indigo-50 rounded text-indigo-700">
                <Database size={15} />
              </span>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono">
                Global & Site-Level Readiness Points
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold bg-white border border-slate-200 text-slate-500 rounded px-2 py-0.5 shadow-xs">
              {globalPoints.length} Point{globalPoints.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {globalPoints.map((point) => (
              <div
                key={point.entityKey}
                className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between space-y-3 h-auto"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm tracking-tight">
                      {point.displayName || `Block ${point.stationCode}`}
                    </h4>
                    <p className="text-xs font-bold text-slate-600 mt-0.5">
                      {point.pointLabel}
                    </p>
                  </div>
                  {getSeverityBadge(point.severity)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1 text-slate-500 border-t border-slate-200/60">
                  <div>
                    Availability: <strong className="text-slate-800 block mt-0.5">{point.availabilityStatus}</strong>
                  </div>
                  <div>
                    Active Alarm:{" "}
                    <strong
                      className={`block mt-0.5 ${
                        point.activeState === true
                          ? "text-red-700 font-bold uppercase animate-ping"
                          : point.activeState === false
                          ? "text-emerald-700"
                          : "text-slate-400 font-normal"
                      }`}
                    >
                      {point.activeState === true ? "ACTIVE / TRIPPED" : point.activeState === false ? "CLEAR" : "STATE UNKNOWN"}
                    </strong>
                  </div>
                </div>

                <div className="text-[9px] font-mono text-slate-400 truncate select-all" title={point.entityKey}>
                  Key: {point.entityKey}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Physical Row Matrix (The Core Summary Table) */}
      {data && physicalRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-slate-50 border-b border-slate-200 py-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono flex items-center gap-1.5">
                <Layers size={14} /> Physical Enclosure Matrix Summary
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Each row corresponds to an independent CS (CollectionSegment) or ES (EnergySegment) container.
              </p>
            </div>
            <div className="text-[10px] font-mono text-slate-500 bg-white border border-slate-100 rounded px-2.5 py-1">
              Active Rows: <strong className="text-slate-900">{physicalRows.length}</strong> / 168
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500 font-mono text-[9px] font-bold uppercase tracking-wider select-none">
                  <th className="py-2.5 px-4 font-semibold">Location</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Type</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Severity</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                  <th className="py-2.5 px-2 font-semibold text-center">Comms/IO</th>
                  <th className="py-2.5 px-2 font-semibold text-center">Doors</th>
                  <th className="py-2.5 px-2 font-semibold text-center">Smoke</th>
                  <th className="py-2.5 px-2 font-semibold text-center">Heat</th>
                  <th className="py-2.5 px-2 font-semibold text-center">Moisture</th>
                  <th className="py-2.5 px-2 font-semibold text-center">Hydrogen</th>
                  <th className="py-2.5 px-2 font-semibold text-center">Fire</th>
                  <th className="py-2.5 px-2 font-semibold text-center">USV/UPS</th>
                  <th className="py-2.5 px-4 font-semibold">Sensor Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {physicalRows.map((row) => {
                  const isCS = row.location.enclosureType === "CollectionSegment";
                  // Group Door Indicators
                  const acTripped = row.doorSensors.acDoors?.tripped === true;
                  const dcTripped = row.doorSensors.dcDoors?.tripped === true;
                  const capTripped = row.doorSensors.topCapDoors?.tripped === true;
                  const batTripped = row.doorSensors.batteryDoors?.tripped === true;
                  const doorCellAggregate: NormalizedSensorCell = {
                    applicable:
                      row.doorSensors.acDoors?.applicable ||
                      row.doorSensors.dcDoors?.applicable ||
                      row.doorSensors.topCapDoors?.applicable ||
                      row.doorSensors.batteryDoors?.applicable,
                    healthy:
                      row.doorSensors.acDoors?.healthy &&
                      row.doorSensors.dcDoors?.healthy &&
                      row.doorSensors.topCapDoors?.healthy &&
                      row.doorSensors.batteryDoors?.healthy,
                    tripped: acTripped || dcTripped || capTripped || batTripped,
                    status: acTripped ? "AC Door Open" : dcTripped ? "DC Door Open" : "Doors Closed",
                    displayValue: acTripped || dcTripped ? "Open" : "Closed",
                    value: null,
                    sensorRole: "doors"
                  };

                  // Health Status Badges
                  let healthDisplay = (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      HEALTHY
                    </span>
                  );
                  if (row.severity === "Critical") {
                    healthDisplay = (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200">
                        CRITICAL
                      </span>
                    );
                  } else if (row.severity === "Warning") {
                    healthDisplay = (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        ISSUE
                      </span>
                    );
                  }

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50/70 transition-colors font-mono font-medium text-[11px] text-slate-700"
                    >
                      <td className="py-2.5 px-4 font-bold text-slate-950 font-sans text-xs">
                        {row.location.displayName}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-1.5 py-0.5 text-[9px] rounded font-bold ${isCS ? "bg-indigo-50 text-indigo-700 border border-indigo-100" : "bg-teal-50 text-teal-700 border border-teal-100"}`}>
                          {isCS ? "CS" : "ES"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-[10px] font-bold uppercase ${row.severity === "Critical" ? "text-red-600 font-extrabold animate-pulse" : row.severity === "Warning" ? "text-amber-500" : "text-emerald-600"}`}>
                          {row.severity}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">{healthDisplay}</td>

                      {/* Communications/IO */}
                      <td className="py-1 px-2 text-center select-none">
                        <div className="flex items-center justify-center gap-1">
                          {renderCellIndicator(row.comStatus.dataCommunications)}
                          {renderCellIndicator(row.comStatus.io)}
                        </div>
                      </td>

                      {/* Doors */}
                      <td className="py-1 px-2 text-center select-none">
                        {renderCellIndicator(doorCellAggregate)}
                      </td>

                      {/* Smoke */}
                      <td className="py-1 px-2 text-center select-none">
                        {renderCellIndicator(row.otherSensors.smoke)}
                      </td>

                      {/* Heat */}
                      <td className="py-1 px-2 text-center select-none">
                        {renderCellIndicator(row.otherSensors.heat)}
                      </td>

                      {/* Moisture */}
                      <td className="py-1 px-2 text-center select-none">
                        {renderCellIndicator(row.emergencySensors.moisture)}
                      </td>

                      {/* Hydrogen */}
                      <td className="py-1 px-2 text-center select-none">
                        <div className="flex items-center justify-center gap-1">
                          {renderCellIndicator(row.otherSensors.hydrogen)}
                          {renderCellIndicator(row.otherSensors.hydrogenFault)}
                        </div>
                      </td>

                      {/* Fire */}
                      <td className="py-1 px-2 text-center select-none">
                        {renderCellIndicator(row.otherSensors.fire)}
                      </td>

                      {/* UPS Alarm */}
                      <td className="py-1 px-2 text-center select-none">
                        {isCS ? (
                          renderCellIndicator(row.otherSensors.upsAlarm)
                        ) : (
                          <span className="text-slate-300 font-normal select-none">-</span>
                        )}
                      </td>

                      {/* Findings / Remarks text */}
                      <td className="py-2.5 px-4 font-sans text-slate-500 text-xs">
                        {row.findings && row.findings.length > 0 ? (
                          <div className="space-y-0.5 text-red-600 text-[10px] font-medium leading-none font-sans">
                            {row.findings.map((f, i) => (
                              <div key={i} className="flex items-center gap-1">
                                <span className="h-1 w-1 bg-red-500 rounded-full flex-shrink-0" />
                                <span className="truncate max-w-[200px]" title={f}>{f}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px]">No abnormal remarks</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5 & 6. Point Filtering and Point Table */}
      {data && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-slate-50 border-b border-slate-200 p-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono flex items-center gap-1.5 mb-3.5">
              <Sliders size={14} /> Full Site Telemetry Point Browser
            </h3>

            {/* Quick Status Filters Strip */}
            <div className="flex flex-wrap gap-1.5 mb-3.5">
              {[
                { type: "all", label: "All Points", color: "blue" },
                { type: "active", label: "Active Tripped", color: "red" },
                { type: "unavailable", label: "Unavailable / Offline", color: "amber" },
                { type: "global", label: "Global Level", color: "indigo" },
                { type: "fire", label: "Fire Trigger", color: "rose" },
                { type: "smoke", label: "Smoke", color: "orange" },
                { type: "heat", label: "Thermal Heat", color: "amber" },
                { type: "hydrogen", label: "Hydrogen Detector", color: "yellow" },
                { type: "doors", label: "Doors State", color: "purple" },
                { type: "moisture", label: "Moisture", color: "teal" },
                { type: "upsEstop", label: "UPS / E-stop", color: "red" },
                { type: "comms", label: "Modbus / IO", color: "emerald" },
                { type: "environment", label: "Temp & Humidity Sensors", color: "sky" },
                { type: "unknown", label: "Uncategorized", color: "gray" }
              ].map((btn) => {
                const count = btn.type === "all" ? data.points.length :
                              btn.type === "active" ? data.activePointCount :
                              btn.type === "unavailable" ? data.unavailablePointCount :
                              btn.type === "global" ? globalPoints.length :
                              data.points.filter(p => {
                                if (btn.type === "fire") return p.pointRole === "fire";
                                if (btn.type === "smoke") return p.pointRole === "smoke";
                                if (btn.type === "heat") return p.pointRole === "heat";
                                if (btn.type === "hydrogen") return p.pointRole === "hydrogen" || p.pointRole === "hydrogenFault";
                                if (btn.type === "doors") return ["acDoors", "dcDoors", "topCapDoors", "batteryDoors"].includes(p.pointRole);
                                if (btn.type === "moisture") return p.pointRole === "moisture";
                                if (btn.type === "upsEstop") return p.pointRole === "upsAlarm" || p.pointRole === "modbusEStop";
                                if (btn.type === "comms") return p.pointRole === "io" || p.pointRole === "dataCommunications";
                                if (btn.type === "environment") return p.pointRole === "internalEnvironment" || p.pointRole === "ambientEnvironment";
                                if (btn.type === "unknown") return p.pointRole === "unknown";
                                return false;
                              }).length;

                return (
                  <button
                    key={btn.type}
                    onClick={() => setActiveFilter(btn.type as PointFilterType)}
                    className={`px-3 py-1.5 text-[10px] sm:text-xs font-bold font-sans rounded-md border transition-all flex items-center gap-1.5 ${
                      activeFilter === btn.type
                        ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span>{btn.label}</span>
                    <span className={`px-1.5 py-0.2 text-[9px] font-mono font-bold rounded-lg ${activeFilter === btn.type ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-600"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Keyword Search Field */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 select-none pointer-events-none">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Query telemetry by entityKey, displayKey, segment, or label descriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-slate-950 focus:border-slate-950 shadow-xs"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-400 font-mono text-[9px] font-bold uppercase tracking-wider select-none">
                  <th className="py-2.5 px-4 font-semibold">Location</th>
                  <th className="py-2.5 px-3 font-semibold">Point Category / Role</th>
                  <th className="py-2.5 px-3 font-semibold">Label Description</th>
                  <th className="py-2.5 px-3 font-semibold">Entity Type</th>
                  <th className="py-2.5 px-2 font-semibold">SubType</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Comm Status</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Active State</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Severity</th>
                  <th className="py-2.5 px-4 font-semibold">Entity Key</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[10px] text-slate-700">
                {filteredPoints.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                      No matching topology health points found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredPoints.slice(0, 250).map((point) => {
                    const isGlobal = point.segmentKind === "GLOBAL";

                    return (
                      <tr key={point.entityKey} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2 px-4 font-sans font-bold text-slate-900">
                          {point.displayName}
                        </td>
                        <td className="py-2 px-3 text-slate-800">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 border border-slate-200">
                            {point.pointRole}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-xs font-sans text-slate-600 font-medium">
                          {point.pointLabel}
                        </td>
                        <td className="py-2 px-2 text-slate-500 truncate max-w-[140px]" title={point.entityType}>
                          {point.entityType}
                        </td>
                        <td className="py-2 px-2 text-slate-400">
                          {point.entitySubType || "-"}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {point.pointAvailable ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Available
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                              {point.availabilityStatus}
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-3 text-center">
                          {point.activeState === true ? (
                            <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-red-100 text-red-800 border border-red-300 animate-pulse">
                              ACTIVE
                            </span>
                          ) : point.activeState === false ? (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              CLEAR
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[9px] font-normal text-slate-400 bg-slate-50 border border-slate-100">
                              UNKNOWN
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center select-none">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            point.severity === "Critical" ? "bg-red-500 text-white animate-pulse" :
                            point.severity === "Warning" ? "bg-amber-100 text-amber-900 border border-amber-300" :
                            "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          }`}>
                            {point.severity}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-slate-400 truncate max-w-[180px] select-all" title={point.entityKey}>
                          {point.entityKey}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredPoints.length > 250 && (
            <div className="bg-slate-50 border-t border-slate-200/60 p-3 text-center text-xs text-slate-500">
              Showing first 250 of <strong className="text-slate-800">{filteredPoints.length}</strong> loaded elements. Use the status filters or key filters above to narrow results.
            </div>
          )}
        </div>
      )}

      {/* 7. Collapsible Debug Strip */}
      {data && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="w-full bg-slate-50/50 py-3 px-4 flex items-center justify-between text-left text-xs font-bold text-slate-600 uppercase tracking-widest font-mono hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Cpu size={14} /> Pipeline Debug Telemetry logs
            </div>
            {showDebug ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          <AnimatePresence>
            {showDebug && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-slate-200 p-4 space-y-4 font-mono text-[10px] text-slate-600 bg-slate-50/20"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <h5 className="font-bold text-slate-800 uppercase tracking-wide text-[9px] mb-1">Parser Integrity</h5>
                    <ul className="space-y-1 bg-white border border-slate-200 rounded-lg p-3">
                      <li>Parse Failures: <strong className={data.debug?.numericIdParseFailedCount ? "text-red-600" : "text-emerald-600"}>{data.debug?.numericIdParseFailedCount || 0}</strong></li>
                      <li>Global Points Detected: <strong className="text-indigo-600">{data.debug?.globalPointCount || 0}</strong></li>
                      <li>Discovered Boolean Fields: <span className="text-slate-500 block mt-1 overflow-x-auto">{JSON.stringify(data.debug?.booleanStateFieldsDiscovered || [])}</span></li>
                    </ul>
                  </div>

                  <div className="md:col-span-2">
                    <h5 className="font-bold text-slate-800 uppercase tracking-wide text-[9px] mb-1">Warnings & Assertions</h5>
                    <div className="bg-white border border-slate-200 rounded-lg p-3 max-h-[140px] overflow-y-auto">
                      {data.debug?.parserWarnings && data.debug.parserWarnings.length > 0 ? (
                        <ul className="space-y-1 list-disc list-inside text-amber-700">
                          {data.debug.parserWarnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-400">All entity ID extractions matched clean schema definitions.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="font-bold text-slate-800 uppercase tracking-wide text-[9px] mb-1">Sample Parsed Global Entries</h5>
                  <pre className="bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-[160px] text-[9px] text-slate-700">
                    {JSON.stringify(data.debug?.sampleGlobalPoints || [], null, 2)}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
