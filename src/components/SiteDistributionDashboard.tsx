import { markPerf } from '../lib/perf';
import React, { useState, useEffect, useMemo } from "react";
import { 
  BarChart3, 
  Cpu, 
  Download, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle,
  Database,
  Search,
  Filter,
  Info,
  Layers,
  Thermometer,
  Zap,
  Sliders,
  Check,
  Shield
} from "lucide-react";
import SiteSensorsDashboard from "./SiteSensorsDashboard";
import { useSiteData } from "../context/SiteDataContext";
import CellTelemetryHeatmap from "./CellTelemetryHeatmap";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine
} from "recharts";

export interface SiteStringDistributionRow {
  stationCode?: string;
  blockIndex?: number;
  arrayIndex: number;
  stringIndex: number;
  ip?: string;
  displayLabel: string;
  stackVoltage?: number;
  stackVoltageVdc?: number;
  dcVoltage?: number;
  maxCellTempC?: number;
  minCellTempC?: number;
  avgCellTempC?: number;
  stackTemperatureC?: number;
  socPct?: number;
  communicating: boolean;
  inRotation: boolean;
  outRotation?: boolean;
  contactorsClosed?: boolean;
  statusColor: "green" | "red" | "yellow" | "gray";
  statusLabel: string;
  sourcePath: string;
  raw?: any;
}

export interface DistributionResponse {
  success: boolean;
  timestamp: string;
  source: string;
  voltageMetric: string;
  temperatureMetric: string;
  rows: SiteStringDistributionRow[];
  rollups: {
    stringCount: number;
    communicatingCount: number;
    outOfRotationCount: number;
    notCommunicatingCount: number;
    voltageMin?: number;
    voltageMax?: number;
    voltageAvg?: number;
    temperatureMin?: number;
    temperatureMax?: number;
    temperatureAvg?: number;
  };
}

export interface SiteHealthGraphPoint {
  id: string;
  arrayIndex: number;
  stringIndex: number;
  displayLabel: string;
  ip?: string;
  voltage?: number;
  temperature?: number;
  socPct?: number;
  communicating: boolean;
  inRotation: boolean;
  statusColor: "green" | "red" | "yellow" | "gray" | "amber";
  statusLabel: string;
  metricSource: {
    voltage: string;
    temperature: string;
  };
  sourcePath: string;
}

export interface SiteHealthGraphResponse {
  success: boolean;
  timestamp: string;
  source: string;
  mode: string;
  points: SiteHealthGraphPoint[];
  metricAvailability: {
    totalRows: number;
    voltageRows: number;
    temperatureRows: number;
    missingVoltageRows: number;
    missingTemperatureRows: number;
  };
  rollups: {
    voltageMin?: number;
    voltageMax?: number;
    voltageAvg?: number;
    temperatureMin?: number;
    temperatureMax?: number;
    temperatureAvg?: number;
  };
  anomalies: {
    voltageHigh: string[];
    voltageLow: string[];
    temperatureHigh: string[];
    temperatureLow: string[];
    offline: string[];
    outOfRotation: string[];
  };
  perf?: {
    durationMs: number;
    cacheHit: boolean;
    liveAttempted: boolean;
  };
}

export default function SiteDistributionDashboard({ active = true }: { active?: boolean }) {
  const { snapshot } = useSiteData();

  const siteHeatmapData = useMemo(() => {
    let siteVolts: (number | null)[] = [];
    let siteTemps: (number | null)[] = [];

    const arrayDetails = snapshot?.normalized?.arrayDetailsByArray || {};
    Object.keys(arrayDetails).sort((a,b) => Number(a) - Number(b)).forEach((arrKey) => {
      const arr = arrayDetails[arrKey];
      if (arr && Array.isArray(arr.strings)) {
        arr.strings.forEach((str: any) => {
          if (Array.isArray(str.millivolts)) {
            str.millivolts.forEach((mv: any) => {
              if (mv !== undefined && mv !== null) siteVolts.push(Number(mv));
            });
          }
          if (Array.isArray(str.temperatures)) {
            str.temperatures.forEach((t: any) => {
              if (t !== undefined && t !== null) siteTemps.push(Number(t));
            });
          }
        });
      }
    });

    return {
      voltages: siteVolts,
      temperatures: siteTemps
    };
  }, [snapshot]);

  const [data, setData] = useState<DistributionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Site Health Anomaly Graph States
  const [graphData, setGraphData] = useState<SiteHealthGraphResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  // Sub-tab selection state
  const [currentView, setCurrentView] = useState<"distribution" | "sensors">("distribution");

  // Filters & Settings state
  const [activeTab, setActiveTab] = useState<"voltage" | "temperature" | "heatmap">("voltage");
  const [arrayFilter, setArrayFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [outliersOnly, setOutliersOnly] = useState(false);
  const [tempMetric, setTempMetric] = useState<"max" | "avg">("max");

  // Threshold controls (Interactively adjustable!)
  const [warningTemp, setWarningTemp] = useState<number>(45);
  const [alarmTemp, setAlarmTemp] = useState<number>(55);
  const [lowTemp, setLowTemp] = useState<number>(5);

  const [warningVolt, setWarningVolt] = useState<number>(1200);
  const [alarmVolt, setAlarmVolt] = useState<number>(1400);
  const [lowVolt, setLowVolt] = useState<number>(900);

  // Load graph specific telemetry data
  const loadGraphData = async (refresh = false, useSample = false) => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      let url = "/api/local/site-health/graph";
      const params = new URLSearchParams();
      
      params.append("lowVolt", String(lowVolt));
      params.append("warningVolt", String(warningVolt));
      params.append("alarmVolt", String(alarmVolt));
      params.append("lowTemp", String(lowTemp));
      params.append("warningTemp", String(warningTemp));
      params.append("alarmTemp", String(alarmTemp));
      
      if (refresh) {
        params.append("refresh", "true");
      }
      if (useSample) {
        params.append("sample", "true");
        params.append("sampleLimit", "40");
      }
      
      url += "?" + params.toString();
      
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status}`);
      }
      const json: SiteHealthGraphResponse = await res.json();
      if (json.success) {
        setGraphData(json);
      } else {
        throw new Error("Failed to load valid graph points");
      }
    } catch (err: any) {
      console.error(err);
      setGraphError(`Failed to connect to Site Health anomaly graph service: ${err.message}`);
    } finally {
      setGraphLoading(false);
    }
  };

  // Load string distribution data
  const loadData = async (refresh = false) => {
    const t0 = performance.now();
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setErrorMsg(null);
    try {
      const url = refresh 
        ? "/api/local/site-distribution/strings?refresh=true" 
        : "/api/local/site-distribution/strings";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status}`);
      }
      const json: DistributionResponse = await res.json();
      if (json.success) {
        setData(json);
        if (refresh) {
          setSuccessMsg("Site distribution data refreshed successfully.");
          setTimeout(() => setSuccessMsg(null), 3500);
        }
      } else {
        throw new Error("Failed to load valid distribution rows");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Failed to connect to Site Distribution telemetry service: ${err.message}`);
    } finally {
      setLoading(false);
    }

    // Trigger graph data load concurrently
    loadGraphData(refresh);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Helper for status HEX
  const getStatusColorHex = (color: string) => {
    switch (color) {
      case "green": return "#16A34A"; // Connected & In Rotation
      case "red": return "#EF4444"; // Disconnected & In Rotation
      case "yellow": return "#F59E0B"; // Out of rotation
      case "amber": return "#D97706"; // Warning/anomaly
      case "gray":
      default:
        return "#94A3B8"; // Not Communicating
    }
  };

  const strings = data?.rows || [];

  // Generate Array options lists
  const arrayOptions = useMemo(() => {
    const list: number[] = Array.from(new Set(strings.map(s => Number(s.arrayIndex))));
    return list.sort((a, b) => a - b);
  }, [strings]);

  // Normalization value based on active chart
  const getMetricValue = (row: SiteStringDistributionRow, chartType: "voltage" | "temperature", metricType: "max" | "avg" = "max") => {
    if (chartType === "voltage") {
      return row.stackVoltage ?? row.stackVoltageVdc ?? row.dcVoltage;
    } else {
      return metricType === "max" 
        ? (row.maxCellTempC ?? row.stackTemperatureC) 
        : (row.avgCellTempC ?? row.stackTemperatureC);
    }
  };

  // Filter application
  const filteredStrings = useMemo(() => {
    return strings.filter(s => {
      // 1. Array Index selection
      if (arrayFilter !== "all" && String(s.arrayIndex) !== arrayFilter) return false;

      // 2. Status match
      if (statusFilter !== "all" && s.statusColor !== statusFilter) return false;

      // 3. Outlier filter logic
      if (outliersOnly) {
        const val = getMetricValue(s, activeTab === "heatmap" ? "voltage" : activeTab, tempMetric);
        const hasIssue = s.statusColor !== "green";
        let isValOutlier = false;
        
        if (val !== undefined && val !== null) {
          if (activeTab === "temperature") {
            isValOutlier = val >= warningTemp || val >= alarmTemp || val <= lowTemp;
          } else {
            isValOutlier = val >= warningVolt || val >= alarmVolt || val <= lowVolt;
          }
        }
        if (!hasIssue && !isValOutlier) return false;
      }

      // 4. Search text box query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchesLabel = s.displayLabel.toLowerCase().includes(q);
        const matchesIp = s.ip ? s.ip.toLowerCase().includes(q) : false;
        const matchesStatus = s.statusLabel.toLowerCase().includes(q);
        if (!matchesLabel && !matchesIp && !matchesStatus) return false;
      }

      return true;
    });
  }, [strings, arrayFilter, statusFilter, outliersOnly, searchQuery, activeTab, tempMetric, warningTemp, alarmTemp, lowTemp, warningVolt, alarmVolt, lowVolt]);

  // Outlier strings specifically for the outliers grid
  const flaggedCount = useMemo(() => {
    return filteredStrings.filter(s => {
      const isNotGreen = s.statusColor !== "green";
      const v = getMetricValue(s, activeTab === "heatmap" ? "voltage" : activeTab, tempMetric);
      
      let isThresholdOutlier = false;
      if (v !== undefined && v !== null) {
        if (activeTab === "temperature") {
          isThresholdOutlier = v >= warningTemp || v <= lowTemp;
        } else {
          isThresholdOutlier = v >= warningVolt || v <= lowVolt;
        }
      }

      return isNotGreen || isThresholdOutlier;
    }).length;
  }, [filteredStrings, activeTab, tempMetric, warningTemp, lowTemp, warningVolt, lowVolt]);

  // CSV Data Export functionality
  const handleExportCsv = () => {
    if (filteredStrings.length === 0) return;
    
    const headers = [
      "stationCode", "blockIndex", "arrayIndex", "stringIndex", "displayLabel", "ip", 
      "stackVoltage", "temperatureC", "socPct", "communicating", "inRotation", "statusLabel", "sourcePath"
    ];
    
    const csvContent = [
      headers.join(","),
      ...filteredStrings.map(row => {
        const tVal = tempMetric === "max" 
          ? (row.maxCellTempC ?? row.stackTemperatureC ?? "") 
          : (row.avgCellTempC ?? row.stackTemperatureC ?? "");
        
        return [
          `"${row.stationCode || ""}"`,
          row.blockIndex ?? "1",
          row.arrayIndex ?? "",
          row.stringIndex ?? "",
          `"${row.displayLabel || ""}"`,
          `"${row.ip || ""}"`,
          row.stackVoltage ?? "",
          tVal ?? "",
          row.socPct ?? "",
          row.communicating ? "true" : "false",
          row.inRotation ? "true" : "false",
          `"${row.statusLabel || ""}"`,
          `"${row.sourcePath || ""}"`
        ].join(",");
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `prizm_${activeTab}_spread_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // JSON Data Export function
  const handleExportJson = () => {
    if (!data) return;

    const exportObj = {
      success: true,
      timestamp: data.timestamp || new Date().toISOString(),
      source: data.source,
      voltageMetric: data.voltageMetric,
      temperatureMetric: data.temperatureMetric,
      rows: filteredStrings,
      rollups: data.rollups
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `prizm_site_distribution_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Site Health Anomaly Graph points filtered according to selected UI controls
  const graphPoints = graphData?.points || [];

  const filteredGraphPoints = useMemo(() => {
    return graphPoints.filter((s: any) => {
      // 1. Array Index selection
      if (arrayFilter !== "all" && String(s.arrayIndex) !== arrayFilter) return false;

      // 2. Status match
      if (statusFilter !== "all" && s.statusColor !== statusFilter) return false;

      // 3. Outlier filter logic
      if (outliersOnly) {
        const val = activeTab === "voltage" ? s.voltage : s.temperature;
        const hasIssue = s.statusColor !== "green";
        let isValOutlier = false;
        
        if (val !== undefined && val !== null) {
          if (activeTab === "temperature") {
            isValOutlier = val >= warningTemp || val >= alarmTemp || val <= lowTemp;
          } else {
            isValOutlier = val >= warningVolt || val >= alarmVolt || val <= lowVolt;
          }
        }
        if (!hasIssue && !isValOutlier) return false;
      }

      // 4. Search text box query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchesLabel = s.displayLabel.toLowerCase().includes(q);
        const matchesIp = s.ip ? s.ip.toLowerCase().includes(q) : false;
        const matchesStatus = s.statusLabel.toLowerCase().includes(q);
        if (!matchesLabel && !matchesIp && !matchesStatus) return false;
      }

      return true;
    });
  }, [graphPoints, arrayFilter, statusFilter, outliersOnly, searchQuery, activeTab, warningTemp, alarmTemp, lowTemp, warningVolt, alarmVolt, lowVolt]);

  // Recharts scatter chart formatter: x coordinate, y coordinates, raw point values
  const chartDataPoints = useMemo(() => {
    // We sort geografically by arrayIndex then stringIndex
    const sorted = [...filteredGraphPoints].sort((a, b) => {
      if (a.arrayIndex !== b.arrayIndex) {
        return a.arrayIndex - b.arrayIndex;
      }
      return a.stringIndex - b.stringIndex;
    });

    return sorted.map((row, index) => {
      const value = activeTab === "voltage" ? row.voltage : row.temperature;
      return {
        ...row,
        stackVoltage: row.voltage, // mapped for tooltip
        maxCellTempC: row.temperature, // mapped for tooltip
        avgCellTempC: row.temperature, // mapped for tooltip
        xIndex: index + 1, // continuous ordered X sequence
        metricVal: value,
        name: row.displayLabel
      };
    }).filter(d => d.metricVal !== undefined && d.metricVal !== null);
  }, [filteredGraphPoints, activeTab]);

  // Beautiful Tooltip for Custom scatter plot points
  const CustomScatterTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d: any = payload[0].payload;
      return (
        <div className="bg-prizm-surface border border-prizm-border p-3 rounded-md text-[11px] text-prizm-text font-mono shadow-2xl space-y-1 z-50">
          <div className="text-cyan-400 font-bold border-b border-prizm-border pb-1 flex justify-between gap-4">
            <span>UNIT: {d.displayLabel}</span>
            <span>#{d.xIndex}</span>
          </div>
          <div>Array: <span className="text-white font-bold">{d.arrayIndex}</span> | String: <span className="text-white font-bold">{d.stringIndex}</span></div>
          <div>IP Address: <span className="text-white">{d.ip || "N/A"}</span></div>
          
          <div className="pt-1.5 grid grid-cols-2 gap-2 text-[10.5px]">
            <div>
              <span className="text-slate-400 block font-sans">Stack Voltage:</span>
              <span className="text-emerald-400 font-bold text-xs">{d.stackVoltage !== undefined && d.stackVoltage !== null ? `${d.stackVoltage} Vdc` : "N/A"}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-sans">SoC Percent:</span>
              <span className="text-amber-400 font-bold text-xs">{d.socPct !== undefined && d.socPct !== null ? `${d.socPct}%` : "N/A"}</span>
            </div>
          </div>

          <div className="pt-1 grid grid-cols-2 gap-2 text-[10.5px]">
            <div>
              <span className="text-slate-400 block font-sans">Max Cell Temp:</span>
              <span className="text-orange-400 font-bold text-xs">{d.maxCellTempC !== undefined && d.maxCellTempC !== null ? `${d.maxCellTempC}°C` : "N/A"}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-sans">Avg Cell Temp:</span>
              <span className="text-yellow-400 font-bold text-xs">{d.avgCellTempC !== undefined && d.avgCellTempC !== null ? `${d.avgCellTempC}°C` : "N/A"}</span>
            </div>
          </div>

          <div className="pt-1.5 border-t border-prizm-border flex items-center gap-1.5 font-bold" style={{ color: getStatusColorHex(d.statusColor) }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getStatusColorHex(d.statusColor) }} />
            STATUS: {d.statusLabel}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4" id="prizm-site-distribution-panel">
      {/* Primary Sub-Tab Switcher for Site Health */}
      <div className="flex border-b border-prizm-border font-mono text-[10px] uppercase font-bold tracking-widest bg-prizm-surface p-1 rounded-t-lg space-x-1 shadow-sm">
        <button
          onClick={() => setCurrentView("distribution")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-all cursor-pointer ${
            currentView === "distribution"
              ? "border-prizm-primary text-prizm-primary bg-prizm-info/5 font-extrabold"
              : "border-transparent text-prizm-text-muted hover:text-white"
          }`}
        >
          <BarChart3 size={12} />
          Voltage & Temp Spreads
        </button>
        <button
          onClick={() => setCurrentView("sensors")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-all cursor-pointer ${
            currentView === "sensors"
              ? "border-prizm-primary text-prizm-primary bg-prizm-info/5 font-extrabold"
              : "border-transparent text-prizm-text-muted hover:text-white"
          }`}
        >
          <Shield size={12} />
          Sensors & Safety Health
        </button>
      </div>

      {currentView === "sensors" ? (
        <div className="animate-fade-in" id="prizm-merged-sensors-view">
          <SiteSensorsDashboard />
        </div>
      ) : (
        <>
          {/* Messages */}
          {errorMsg && (
            <div className="bg-red-50 border-l-4 border-prizm-danger text-red-700 p-3 rounded font-mono text-xs flex justify-between items-center">
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="font-sans text-xs hover:underline">Dismiss</button>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border-l-4 border-prizm-primary text-emerald-800 p-3 rounded font-mono text-xs flex justify-between items-center animate-fade-in">
              <span className="flex items-center gap-2"><Check size={14} className="text-prizm-primary" /> {successMsg}</span>
            </div>
          )}

          {/* DASHBOARD HEADER & STAT CARDS */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg shadow-sm p-4 font-mono space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-prizm-border pb-3">
          <div>
            <h1 className="text-lg font-bold text-prizm-text tracking-tight uppercase flex items-center gap-2">
              <BarChart3 className="text-prizm-info" size={20} />
              Site String Distribution View
            </h1>
            <p className="text-[11px] text-prizm-text-muted mt-0.5 font-sans">
              Geographical voltage and temperature spreads mapped across active EMS string controller cards.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <div className="bg-prizm-surface-strong px-2 py-1 rounded border border-prizm-border flex items-center gap-2 max-w-full">
              <span className="text-prizm-text-muted">SOURCE:</span> 
              <span className="text-prizm-info uppercase font-extrabold">{data?.source || "Gathering..."}</span>
            </div>
            <div className="bg-prizm-surface-strong px-2 py-1 rounded border border-prizm-border flex items-center gap-1.5">
              <span className="text-prizm-text-muted">UPDATED:</span>
              <span className="text-prizm-text font-bold truncate">
                {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : "--:--:--"}
              </span>
            </div>
            <button 
              onClick={() => loadData(true)} 
              disabled={loading}
              className="px-3 py-1 bg-prizm-info text-white hover:bg-prizm-info/90 rounded border border-prizm-border flex items-center gap-1 font-bold font-mono text-[10px] uppercase cursor-pointer disabled:opacity-55"
            >
              {(refreshing || loading) ? <RefreshCw size={10} className="animate-spin" /> : <RefreshCw size={10} />}
              Refresh
            </button>
          </div>
        </div>

        {/* ROLLUPS KEY-PERFORMANCE INDICATORS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-prizm-surface-strong p-2.5 rounded border border-prizm-border/60">
            <span className="text-[9px] text-prizm-text-muted uppercase block">Total Strings</span>
            <span className="font-bold text-base text-prizm-text">{data?.rollups?.stringCount ?? strings.length}</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-prizm-border/60 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Active Comms</span>
              <span className="font-bold text-base text-emerald-600">
                {data?.rollups?.communicatingCount ?? strings.filter(s => s.communicating).length}
              </span>
            </div>
            <span className="text-[9px] text-emerald-600 leading-tight">ONLINE COMPLIANT</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-prizm-border/60 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Out of Rotation</span>
              <span className="font-bold text-base text-amber-500">
                {data?.rollups?.outOfRotationCount ?? strings.filter(s => !s.inRotation).length}
              </span>
            </div>
            <span className="text-[9px] text-amber-600 leading-tight">OFFLINE / BYPASSED</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-prizm-border/60 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Comms Lost</span>
              <span className="font-bold text-base text-slate-500">
                {data?.rollups?.notCommunicatingCount ?? strings.filter(s => !s.communicating).length}
              </span>
            </div>
            <span className="text-[9px] text-slate-500 leading-tight">NOT RESPONDING</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-prizm-border/60 col-span-2 md:col-span-1">
            <span className="text-[9px] text-prizm-text-muted uppercase block">Site Range Limits</span>
            <div className="text-[10px] space-y-0.5 mt-1 font-bold text-prizm-text">
              <div className="flex justify-between">
                <span>VOLT:</span>
                <span className="text-prizm-info">
                  {data?.rollups?.voltageMin ?? "0"}-{data?.rollups?.voltageMax ?? "0"} V
                </span>
              </div>
              <div className="flex justify-between">
                <span>TEMP:</span>
                <span className="text-orange-600 font-extrabold">
                  {data?.rollups?.temperatureMin ?? "0"}-{data?.rollups?.temperatureMax ?? "0"} °C
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WORKSPACE PANELS MATRIX */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* INTERACTIVE CONTROLS / FILTERS SLIDER SIDEBAR (1 Col on Desktop) */}
        <div className="xl:col-span-1 bg-prizm-surface border border-prizm-border rounded-lg shadow-sm p-4 font-mono space-y-5">
          {/* API & Source Health Card */}
          <div className="bg-prizm-surface-strong/60 p-3 rounded-lg border border-prizm-border/80 space-y-2" id="prizm-api-source-health-card">
            <div className="flex items-center gap-1.5 border-b border-prizm-border pb-1.5">
              <Shield className="text-prizm-primary animate-pulse" size={14} />
              <span className="font-extrabold text-[10px] text-prizm-text uppercase tracking-wider">API / Source Health</span>
            </div>
            <div className="text-[10px] space-y-1 text-prizm-text-muted leading-relaxed">
              <div className="flex justify-between">
                <span>Source:</span>
                <span className="text-prizm-info uppercase font-extrabold">{data?.source || "hybrid"}</span>
              </div>
              <div className="flex justify-between">
                <span>Rows:</span>
                <span className="font-bold text-prizm-text">{data?.rows?.length ?? 0}</span>
              </div>
              <div className="flex flex-col pt-0.5 border-t border-prizm-border/40 gap-0.5">
                <span className="text-[8.5px] text-prizm-text-muted">VOLTAGE METRIC:</span>
                <span className="font-bold text-prizm-text pl-1">{data?.voltageMetric || "Stack Voltage Vdc"}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[8.5px] text-prizm-text-muted">TEMPERATURE METRIC:</span>
                <span className="font-semibold text-orange-400 pl-1">{data?.temperatureMetric || "Max Cell Temperature C"}</span>
              </div>
              <div className="flex flex-col pt-1 border-t border-prizm-border/40 gap-0.5">
                <span className="text-[8.5px] text-prizm-text-muted">LAST UPDATED:</span>
                <span className="font-mono text-[9px] text-prizm-text truncate pl-1">
                  {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : "--:--:--"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-b border-prizm-border pb-2">
            <Sliders className="text-prizm-info" size={15} />
            <span className="font-bold text-xs text-prizm-text uppercase">Distribution Settings</span>
          </div>

          {/* SPREAD TYPE RADIO PILLS */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-prizm-text-muted font-bold uppercase tracking-wider block">Chart Spread View</label>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => setActiveTab("voltage")}
                className={`py-2 px-1 text-[9px] font-bold text-center border rounded transition-all uppercase cursor-pointer truncate ${
                  activeTab === "voltage"
                    ? "bg-emerald-600/15 border-prizm-primary text-emerald-700"
                    : "bg-prizm-surface hover:bg-prizm-surface-strong border-prizm-border text-prizm-text-muted"
                }`}
              >
                Volt Spread
              </button>
              <button
                onClick={() => setActiveTab("temperature")}
                className={`py-2 px-1 text-[9px] font-bold text-center border rounded transition-all uppercase cursor-pointer truncate ${
                  activeTab === "temperature"
                    ? "bg-orange-600/15 border-orange-500 text-orange-700"
                    : "bg-prizm-surface hover:bg-prizm-surface-strong border-prizm-border text-prizm-text-muted"
                }`}
              >
                Temp Spread
              </button>
              <button
                onClick={() => setActiveTab("heatmap")}
                className={`py-2 px-1 text-[9px] font-bold text-center border rounded transition-all uppercase cursor-pointer truncate ${
                  activeTab === "heatmap"
                    ? "bg-[#10b981]/15 border-[#10b981] text-[#10b981]"
                    : "bg-prizm-surface hover:bg-prizm-surface-strong border-prizm-border text-prizm-text-muted"
                }`}
              >
                Heatmap
              </button>
            </div>
          </div>

          {/* DYNAMIC METRIC SELECTION (ONLY TEMP SPREAD ACTIVE) */}
          {activeTab === "temperature" && (
            <div className="space-y-1.5 animate-fade-in">
              <label className="text-[10px] text-prizm-text-muted font-bold uppercase tracking-wider block">Temperature Source Metric</label>
              <select
                value={tempMetric}
                onChange={e => setTempMetric(e.target.value as "max" | "avg")}
                className="w-full bg-prizm-surface border border-prizm-border text-prizm-text text-[11px] rounded p-1.5"
              >
                <option value="max">Max Cell Temperature C</option>
                <option value="avg">Average Cell Temperature C</option>
              </select>
            </div>
          )}

          {/* SELECTION FILTERS BLOCK */}
          <div className="space-y-3 pt-2 border-t border-prizm-border/60">
            {/* Array selector */}
            <div className="space-y-1">
              <label className="text-[10px] text-prizm-text-muted font-bold uppercase block">Filter Array</label>
              <select
                value={arrayFilter}
                onChange={e => setArrayFilter(e.target.value)}
                className="w-full bg-prizm-surface border border-prizm-border text-prizm-text text-[11px] p-1.5 rounded"
              >
                <option value="all">ANY ARRAY (ALL)</option>
                {arrayOptions.map(arrIndex => (
                  <option key={arrIndex} value={String(arrIndex)}>ARRAY {arrIndex}</option>
                ))}
              </select>
            </div>

            {/* Status selector */}
            <div className="space-y-1">
              <label className="text-[10px] text-prizm-text-muted font-bold uppercase block">Filter Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full bg-prizm-surface border border-prizm-border text-prizm-text text-[11px] p-1.5 rounded"
              >
                <option value="all">ANY STATUS (ALL)</option>
                <option value="green">CONNECTED & IN ROTATION (GREEN)</option>
                <option value="red">DISCONNECTED & IN ROTATION (RED)</option>
                <option value="yellow">OUT OF ROTATION (YELLOW)</option>
                <option value="gray">NOT COMMUNICATING (GRAY)</option>
              </select>
            </div>

            {/* Search filter keyword */}
            <div className="space-y-1">
              <label className="text-[10px] text-prizm-text-muted font-bold uppercase block">Search String IP / Label</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. A1-S3..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-prizm-surface border border-prizm-border text-prizm-text text-[11px] pl-7 pr-2 py-1.5 rounded"
                />
                <Search className="absolute left-2.5 top-2.5 text-prizm-text-muted" size={11} />
              </div>
            </div>

            {/* Outliers focus filter switch */}
            <div className="pt-1">
              <label className="flex items-center gap-2 text-[10.5px] cursor-pointer text-prizm-text font-bold">
                <input
                  type="checkbox"
                  checked={outliersOnly}
                  onChange={e => setOutliersOnly(e.target.checked)}
                  className="rounded border-prizm-border text-prizm-info focus:ring-prizm-info h-3.5 w-3.5 cursor-pointer"
                />
                Show Outliers Only
              </label>
              <span className="text-[9px] text-prizm-text-muted leading-tight block mt-1">
                Refilters to units with bad stats or threshold violations.
              </span>
            </div>
          </div>

          {/* DYNAMIC EXPORT CONTROL BLOCK */}
          <div className="space-y-2 pt-4 border-t border-prizm-border/60">
            <span className="text-[10px] text-prizm-text-muted font-bold uppercase block">Export Spread Logs</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleExportCsv}
                disabled={filteredStrings.length === 0}
                className="py-1.5 px-2 bg-prizm-surface-strong hover:bg-prizm-bg-muted text-prizm-text border border-prizm-border rounded flex items-center justify-center gap-1 font-bold text-[9px] uppercase cursor-pointer disabled:opacity-50"
              >
                <Download size={10} />
                Export CSV
              </button>
              <button
                onClick={handleExportJson}
                disabled={filteredStrings.length === 0}
                className="py-1.5 px-2 bg-prizm-surface-strong hover:bg-prizm-bg-muted text-prizm-text border border-prizm-border rounded flex items-center justify-center gap-1 font-bold text-[9px] uppercase cursor-pointer disabled:opacity-50"
              >
                <Database size={10} />
                Export JSON
              </button>
            </div>
            <span className="text-[8.5px] text-prizm-text-muted text-center block leading-tight">
              Downloads current filtered dataset ({filteredStrings.length} keys).
            </span>
          </div>

          {/* INTERACTIVE THRESHOLD SLIDERS */}
          <div className="space-y-3 pt-4 border-t border-prizm-border/60">
            <span className="text-[10px] text-prizm-text-muted font-bold uppercase tracking-wider block">Set Visual Alarm Levels</span>
            
            {activeTab === "temperature" ? (
              <div className="space-y-2.5 text-[10px]">
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Alarm high temp:</span>
                    <span className="text-prizm-danger">{alarmTemp} °C</span>
                  </div>
                  <input
                    type="range"
                    min="35"
                    max="75"
                    step="1"
                    value={alarmTemp}
                    onChange={e => setAlarmTemp(Number(e.target.value))}
                    className="w-full accent-prizm-danger h-1 bg-prizm-bg-muted rounded"
                  />
                </div>
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Warning high temp:</span>
                    <span className="text-prizm-warning">{warningTemp} °C</span>
                  </div>
                  <input
                    type="range"
                    min="25"
                    max="50"
                    step="1"
                    value={warningTemp}
                    onChange={e => setWarningTemp(Number(e.target.value))}
                    className="w-full accent-prizm-warning h-1 bg-prizm-bg-muted rounded"
                  />
                </div>
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Low threshold temp:</span>
                    <span className="text-prizm-info">{lowTemp} °C</span>
                  </div>
                  <input
                    type="range"
                    min="-10"
                    max="20"
                    step="1"
                    value={lowTemp}
                    onChange={e => setLowTemp(Number(e.target.value))}
                    className="w-full accent-prizm-info h-1 bg-prizm-bg-muted rounded"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 text-[10px]">
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Alarm high volt:</span>
                    <span className="text-prizm-danger">{alarmVolt} Vdc</span>
                  </div>
                  <input
                    type="range"
                    min="1100"
                    max="1600"
                    step="10"
                    value={alarmVolt}
                    onChange={e => setAlarmVolt(Number(e.target.value))}
                    className="w-full accent-prizm-danger h-1 bg-prizm-bg-muted rounded"
                  />
                </div>
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Warning high volt:</span>
                    <span className="text-prizm-warning">{warningVolt} Vdc</span>
                  </div>
                  <input
                    type="range"
                    min="1000"
                    max="1400"
                    step="10"
                    value={warningVolt}
                    onChange={e => setWarningVolt(Number(e.target.value))}
                    className="w-full accent-prizm-warning h-1 bg-prizm-bg-muted rounded"
                  />
                </div>
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Low threshold volt:</span>
                    <span className="text-prizm-info">{lowVolt} Vdc</span>
                  </div>
                  <input
                    type="range"
                    min="700"
                    max="1100"
                    step="10"
                    value={lowVolt}
                    onChange={e => setLowVolt(Number(e.target.value))}
                    className="w-full accent-prizm-info h-1 bg-prizm-bg-muted rounded"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PRIMARY SPREAD GRAPH PLOTTER (3 Cols on Desktop) */}
        <div className="xl:col-span-3 space-y-4">
          <div className="bg-prizm-surface border border-prizm-border rounded-lg shadow-sm p-4 font-mono space-y-3">
            <div className="flex items-center justify-between border-b border-prizm-border pb-2 text-xs">
              <span className="font-bold text-prizm-text uppercase tracking-widest block text-xs">
                {activeTab === "voltage" ? "Stack Voltage Site Spread Map" : "Stack Temperature Site Spread Map"}
              </span>
              <span className="text-[10px] bg-prizm-surface-strong px-2 py-0.5 rounded border border-prizm-border text-prizm-text-muted">
                METRIC: <span className="font-extrabold text-prizm-primary">{activeTab === "voltage" ? "Stack Voltage Vdc" : (tempMetric === "max" ? "Max Cell Temperature C" : "Average Cell Temperature C")}</span>
              </span>
            </div>

            {/* COLOR KEY STATUTORY LEGEND */}
            <div className="p-2.5 rounded border border-prizm-border/40 bg-prizm-surface-strong shadow-inner flex flex-wrap gap-x-4 gap-y-1.5 text-[9.5px]">
              <span className="text-prizm-text-muted uppercase font-bold tracking-wider mr-1">Rotation Status Legend:</span>
              <span className="flex items-center gap-1.5 font-bold text-[#16A34A]">
                <span className="w-2.5 h-2.5 rounded bg-[#16A34A] border border-black/10 inline-block" />
                Green = Connected and In Rotation
              </span>
              <span className="flex items-center gap-1.5 font-bold text-[#EF4444]">
                <span className="w-2.5 h-2.5 rounded bg-[#EF4444] border border-black/10 inline-block" />
                Red = Disconnected and In Rotation
              </span>
              <span className="flex items-center gap-1.5 font-bold text-[#F59E0B]">
                <span className="w-2.5 h-2.5 rounded bg-[#F59E0B] border border-black/10 inline-block" />
                Yellow = Out of Rotation
              </span>
              <span className="flex items-center gap-1.5 font-bold text-slate-500">
                <span className="w-2.5 h-2.5 rounded bg-[#94A3B8] border border-black/10 inline-block" />
                Gray = Not Communicating
              </span>
            </div>

            {/* SOURCE STATUS BAR */}
            <div className="p-2.5 rounded border border-prizm-border/40 bg-prizm-surface-strong/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-2.5 text-[10px] font-mono text-prizm-text-muted">
              <div>
                {graphLoading ? (
                  <span className="flex items-center gap-1.5 font-bold">
                    <RefreshCw className="animate-spin text-prizm-info" size={12} />
                    Loading Site Health graph data...
                  </span>
                ) : graphError ? (
                  <span className="text-red-400 font-bold">Error: {graphError}</span>
                ) : graphData ? (
                  <span className="text-prizm-text font-bold">
                    {graphData.points.some((p: any) => p.metricSource.voltage.includes("sampled") || p.metricSource.temperature.includes("sampled")) ? (
                      `Showing sampled live stringviewer metrics: ${graphData.points.filter((p: any) => p.voltage !== undefined || p.temperature !== undefined).length} / ${graphData.points.length} strings.`
                    ) : (
                      `Showing full-site graph metrics: ${graphData.points.filter((p: any) => p.voltage !== undefined || p.temperature !== undefined).length} / ${graphData.points.length} strings.`
                    )}
                  </span>
                ) : (
                  <span>No graph data load attempted yet.</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => loadGraphData(true, true)}
                  disabled={graphLoading}
                  className="px-2.5 py-1 bg-prizm-info/10 text-prizm-info hover:bg-prizm-info/20 border border-prizm-info/30 text-[9.5px] font-bold rounded uppercase flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                  title="Force a high precision bounded stringviewer telemetry sample map across arrays"
                >
                  <Cpu size={10} />
                  Sample Live Stringviewer
                </button>
                <button
                  onClick={() => loadGraphData(true, false)}
                  disabled={graphLoading}
                  className="px-2.5 py-1 bg-prizm-surface border border-prizm-border hover:bg-prizm-surface-strong text-[9.5px] font-bold rounded uppercase flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                  title="Reload from latest dev cache"
                >
                  <RefreshCw size={10} className={graphLoading ? "animate-spin" : ""} />
                  Reload Graph Cache
                </button>
              </div>
            </div>

            {/* REAL RECHARTS PLOT FRAME */}
            {activeTab === "heatmap" ? (
              <div className="w-full">
                <CellTelemetryHeatmap 
                  mode="site-overview"
                  voltages={siteHeatmapData.voltages}
                  temperatures={siteHeatmapData.temperatures}
                  title="Full-Site Cell Group Distribution Heatmap"
                  gridColumns={48}
                />
              </div>
            ) : (!data && loading) ? (
              <div className="h-[300px] sm:h-[350px] flex flex-col items-center justify-center border border-dashed border-prizm-border/40 rounded bg-prizm-surface-strong">
                <RefreshCw className="animate-spin text-prizm-info mb-2" size={24} />
                <span className="text-xs text-prizm-text-muted">Loading telemetry distribution coordinates...</span>
              </div>
            ) : chartDataPoints.length === 0 ? (
              <div className="h-[300px] sm:h-[350px] flex flex-col items-center justify-center border border-dashed border-prizm-border/45 rounded bg-prizm-surface-strong text-prizm-text-muted p-4 text-center">
                <Info size={28} className="mb-2 text-prizm-border" />
                <span className="max-w-md block">
                  {strings.length === 0 ? (
                    "No string distribution rows are available from the EMS source."
                  ) : filteredGraphPoints.length === 0 ? (
                    "No strings in the graph match your current active query filters."
                  ) : (
                    `${strings.length} strings are mapped, but no voltage/temperature graph metrics are available from the current cached EMS source.`
                  )}
                </span>
                {(strings.length > 0 && filteredGraphPoints.length === 0) ? (
                  <button onClick={() => { setArrayFilter("all"); setStatusFilter("all"); setSearchQuery(""); setOutliersOnly(false); }} className="mt-2 text-[10.5px] font-bold text-prizm-info hover:underline uppercase">reset query filter</button>
                ) : strings.length > 0 ? (
                  <button
                    onClick={() => loadGraphData(true, true)}
                    disabled={graphLoading}
                    className="mt-4 px-4 py-2 bg-prizm-info hover:bg-cyan-600 text-white text-[10px] font-bold rounded uppercase flex items-center gap-1.5 focus:outline-none transition shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {graphLoading ? (
                      <RefreshCw className="animate-spin text-white" size={13} />
                    ) : (
                      <Cpu size={13} />
                    )}
                    Sample {strings.length} Strings via Stringviewer
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="h-[300px] sm:h-[350px] w-full bg-prizm-surface pr-1.5">
                <ResponsiveContainer width="100%" height="100%" key={`${active}-${activeTab}`}>
                  <ScatterChart
                    margin={{ top: 15, right: 15, bottom: 20, left: 15 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    
                    <XAxis 
                      type="number" 
                      dataKey="xIndex" 
                      name="Site Location" 
                      unit="" 
                      domain={['auto', 'auto']}
                      stroke="#475569"
                      fontSize={10}
                      tickFormatter={(v) => v}
                      label={{ value: 'Geographic String Site Index', position: 'bottom', offset: 5, fontSize: 10, fill: '#64748b' }}
                    />

                    {activeTab === "temperature" ? (
                      <YAxis 
                        type="number" 
                        dataKey="metricVal" 
                        name="Temperature" 
                        unit="°C"
                        domain={[
                          (dataMin: number) => {
                            const minVal = typeof dataMin === 'number' && Number.isFinite(dataMin) ? dataMin : 20;
                            return Math.floor(Math.min(minVal, lowTemp) - 5);
                          },
                          (dataMax: number) => {
                            const maxVal = typeof dataMax === 'number' && Number.isFinite(dataMax) ? dataMax : 45;
                            return Math.ceil(Math.max(maxVal, alarmTemp) + 5);
                          }
                        ]}
                        stroke="#475569"
                        fontSize={10}
                        label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', offset: -5, fontSize: 10, fill: '#64748b' }}
                      />
                    ) : (
                      <YAxis 
                        type="number" 
                        dataKey="metricVal" 
                        name="Stack Voltage" 
                        unit="V"
                        domain={[
                          (dataMin: number) => {
                            const minVal = typeof dataMin === 'number' && Number.isFinite(dataMin) ? dataMin : 950;
                            return Math.floor(Math.min(minVal, lowVolt) - 50);
                          },
                          (dataMax: number) => {
                            const maxVal = typeof dataMax === 'number' && Number.isFinite(dataMax) ? dataMax : 1350;
                            return Math.ceil(Math.max(maxVal, alarmVolt) + 50);
                          }
                        ]}
                        stroke="#475569"
                        fontSize={10}
                        label={{ value: 'Voltage (Vdc)', angle: -90, position: 'insideLeft', offset: -5, fontSize:10, fill: '#64748b' }}
                      />
                    )}

                    <ZAxis type="number" range={[60, 60]} />

                    <Tooltip content={<CustomScatterTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#cbd5e1' }} />

                    {/* REFERENCE THRESHOLD BOUNDS */}
                    {activeTab === "temperature" ? (
                      <>
                        <ReferenceLine 
                          y={alarmTemp} 
                          stroke="#EF4444" 
                          strokeDasharray="5 5" 
                          strokeWidth={1.5} 
                          label={{ value: `HIGH ALARM (${alarmTemp}°C)`, fill: "#EF4444", fontSize: 9, fontWeight: "bold", position: "insideTopLeft", offset: 8 }} 
                        />
                        <ReferenceLine 
                          y={warningTemp} 
                          stroke="#F59E0B" 
                          strokeDasharray="3 3" 
                          strokeWidth={1} 
                          label={{ value: `HIGH WARNING (${warningTemp}°C)`, fill: "#F59E0B", fontSize: 9, fontWeight: "bold", position: "insideTopLeft", offset: 8 }} 
                        />
                        <ReferenceLine 
                          y={lowTemp} 
                          stroke="#0284C7" 
                          strokeDasharray="4 4" 
                          strokeWidth={1} 
                          label={{ value: `LOW CRITICAL (${lowTemp}°C)`, fill: "#0284C7", fontSize: 9, fontWeight: "bold", position: "insideBottomLeft", offset: 8 }} 
                        />
                      </>
                    ) : (
                      <>
                        <ReferenceLine 
                          y={alarmVolt} 
                          stroke="#EF4444" 
                          strokeDasharray="5 5" 
                          strokeWidth={1.5} 
                          label={{ value: `OVERVOLTAGE ALARM (${alarmVolt}V)`, fill: "#EF4444", fontSize: 9, fontWeight: "bold", position: "insideTopLeft", offset: 8 }} 
                        />
                        <ReferenceLine 
                          y={warningVolt} 
                          stroke="#F59E0B" 
                          strokeDasharray="3 3" 
                          strokeWidth={1} 
                          label={{ value: `CELL HIGH WARNING (${warningVolt}V)`, fill: "#F59E0B", fontSize: 9, fontWeight: "bold", position: "insideTopLeft", offset: 8 }} 
                        />
                        <ReferenceLine 
                          y={lowVolt} 
                          stroke="#0284C7" 
                          strokeDasharray="4 4" 
                          strokeWidth={1} 
                          label={{ value: `UNDERVOLTAGE LIMIT (${lowVolt}V)`, fill: "#0284C7", fontSize: 9, fontWeight: "bold", position: "insideBottomLeft", offset: 8 }} 
                        />
                      </>
                    )}

                    <Scatter name="Battery Controller Strings" data={chartDataPoints}>
                      {chartDataPoints.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getStatusColorHex(entry.statusColor)} stroke="#ffffff" strokeWidth={0.5} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* OUTLIERS / ABNORMAL STRING DEVICE GRID */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg shadow-sm p-4 font-mono space-y-3">
            <div className="flex items-center justify-between border-b border-prizm-border pb-2">
              <span className="font-bold text-xs text-prizm-text uppercase flex items-center gap-1.5">
                <AlertTriangle className={flaggedCount > 0 ? "text-prizm-warning animate-pulse" : "text-prizm-primary"} size={14} />
                {outliersOnly ? "Identified Site Outliers" : "Telemetry Data Grid"} ({filteredStrings.length} listed, {flaggedCount} flagged)
              </span>
              <span className="text-[9px] text-prizm-text-muted">
                DEFINED AS: NON-GREEN STATE OR THRESHOLD BREACHES
              </span>
            </div>

            <div className="overflow-x-auto border border-prizm-border rounded bg-prizm-bg max-h-[220px]">
              <table className="w-full text-left border-collapse text-[10.5px]">
                <thead>
                  <tr className="bg-prizm-surface-strong border-b border-prizm-border text-prizm-text-muted font-bold text-[9.5px]">
                    <th className="p-2 border-r border-prizm-border">Array</th>
                    <th className="p-2 border-r border-prizm-border">String</th>
                    <th className="p-2 border-r border-prizm-border">Label</th>
                    <th className="p-2 border-r border-prizm-border text-right">Voltage</th>
                    <th className="p-2 border-r border-prizm-border text-right">Max Cell Temp</th>
                    <th className="p-2 border-r border-prizm-border text-right">Avg Cell Temp</th>
                    <th className="p-2 border-r border-prizm-border">Controller IP</th>
                    <th className="p-2 border-r border-prizm-border">Status Category</th>
                    <th className="p-2">Data Source File</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-prizm-border/50">
                  {filteredStrings.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-emerald-600 font-bold bg-emerald-50 text-xs">
                        {outliersOnly 
                          ? "🎉 ALL site controllers are normal. No active threshold breach or off-line rotations detected."
                          : "🔍 No controller strings match your current active filters."}
                      </td>
                    </tr>
                  ) : (
                    filteredStrings.map((s, idx) => {
                      const tempV = getMetricValue(s, "temperature", "max");
                      const voltV = getMetricValue(s, "voltage");
                      
                      const isHighTemp = tempV !== undefined && tempV >= warningTemp;
                      const isLowTemp = tempV !== undefined && tempV <= lowTemp;
                      const isHighVolt = voltV !== undefined && voltV >= warningVolt;
                      const isLowVolt = voltV !== undefined && voltV <= lowVolt;

                      return (
                        <tr key={idx} className="bg-prizm-surface hover:bg-prizm-surface-strong divide-x divide-prizm-border/30 transition">
                          <td className="p-2 font-bold text-center text-prizm-text">{s.arrayIndex}</td>
                          <td className="p-2 font-bold text-center text-prizm-text">{s.stringIndex}</td>
                          <td className="p-2 font-bold text-prizm-text-muted">{s.displayLabel}</td>
                          <td className={`p-2 text-right font-bold ${isHighVolt ? 'text-red-500' : isLowVolt ? 'text-cyan-500' : 'text-slate-500'}`}>
                            {s.stackVoltage !== undefined && s.stackVoltage !== null ? `${s.stackVoltage} V` : "--"}
                          </td>
                          <td className={`p-2 text-right font-bold ${isHighTemp ? 'text-orange-500' : 'text-slate-500'}`}>
                            {s.maxCellTempC !== undefined && s.maxCellTempC !== null ? `${s.maxCellTempC} °C` : "--"}
                          </td>
                          <td className="p-2 text-right text-prizm-text-muted">
                            {s.avgCellTempC !== undefined && s.avgCellTempC !== null ? `${s.avgCellTempC} °C` : "--"}
                          </td>
                          <td className="p-2 text-prizm-text truncate" title={s.ip}>{s.ip || "Unknown"}</td>
                          <td className="p-2">
                            <span 
                              className="px-1.5 py-0.5 rounded text-[9px] font-extrabold flex items-center gap-1 w-fit" 
                              style={{ 
                                backgroundColor: getStatusColorHex(s.statusColor) + "12",
                                color: getStatusColorHex(s.statusColor),
                                border: `1px solid ${getStatusColorHex(s.statusColor)}30`
                              }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getStatusColorHex(s.statusColor) }} />
                              {s.statusLabel}
                            </span>
                          </td>
                          <td className="p-2 text-[9px] text-prizm-text-muted font-sans truncate max-w-[120px]" title={s.sourcePath}>
                            {s.sourcePath.split("/").pop()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
