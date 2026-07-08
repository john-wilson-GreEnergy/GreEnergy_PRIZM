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
  Shield,
  FileText
} from "lucide-react";
import SiteSensorsDashboard from "./SiteSensorsDashboard";
import { useSiteData } from "../context/SiteDataContext";
import ArrayCellHeatmapGrid from "./ArrayCellHeatmapGrid";
import { formatTemperatureF, celsiusToFahrenheit } from "../utils/temperatureScale";
import { jsPDF } from "jspdf";
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
import { SITE_HEALTH_THRESHOLDS } from "../lib/thresholds";

export function normalizeCellVoltageMv(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Values like 3.272 are volts-per-cell and should become 3272 mV.
  if (n > 0 && n < 10) return Math.round(n * 1000);
  // Values like 3272 are already mV.
  if (n >= 1000 && n <= 5000) return Math.round(n);
  // Values like 3272000 are accidentally over-scaled display artifacts.
  // Convert back to mV when clearly over-scaled.
  if (n >= 1000000 && n <= 5000000) return Math.round(n / 1000);
  return Math.round(n);
}

export function formatCellVoltageMv(v: unknown): string {
  const mv = normalizeCellVoltageMv(v);
  return mv === null ? "--" : `${mv} mV`;
}

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
  minCellVoltage?: number;
  maxCellVoltage?: number;
  avgCellVoltage?: number;
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
  stationCode?: string | null;
  blockIndex?: number | null;
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
    soc?: string;
    rowSourceTimestamp?: string | number | null;
    sampleAgeMs?: number | null;
  };
  sourcePath: string;
  minCellVoltage?: number;
  avgCellVoltage?: number;
  maxCellVoltage?: number;
  minCellTempC?: number;
  avgCellTempC?: number;
  maxCellTempC?: number;
  stackVoltage?: number;
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
  const [currentView, setCurrentView] = useState<"distribution" | "sensors" | "heatmap">("distribution");

  // Filters & Settings state
  const [activeTab, setActiveTab] = useState<"voltage" | "temperature" | "heatmap">("voltage");
  const [arrayFilter, setArrayFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [outliersOnly, setOutliersOnly] = useState(false);
  const [tempMetric, setTempMetric] = useState<"max" | "avg">("max");

  // Threshold controls (Interactively adjustable!)
  const [alarmTemp, setAlarmTemp] = useState<number>(SITE_HEALTH_THRESHOLDS.temperatureC.highAlarmMin);
  const [warningTemp, setWarningTemp] = useState<number>(SITE_HEALTH_THRESHOLDS.temperatureC.highWarningMin);
  const [lowTemp, setLowTemp] = useState<number>(SITE_HEALTH_THRESHOLDS.temperatureC.lowWarningMax);
  const [lowAlarmTemp, setLowAlarmTemp] = useState<number>(SITE_HEALTH_THRESHOLDS.temperatureC.lowAlarmMax);

  const [alarmVolt, setAlarmVolt] = useState<number>(SITE_HEALTH_THRESHOLDS.voltageVdc.highAlarmMin);
  const [warningVolt, setWarningVolt] = useState<number>(SITE_HEALTH_THRESHOLDS.voltageVdc.highWarningMin);
  const [lowVolt, setLowVolt] = useState<number>(SITE_HEALTH_THRESHOLDS.voltageVdc.lowWarningMax);
  const [lowAlarmVolt, setLowAlarmVolt] = useState<number>(SITE_HEALTH_THRESHOLDS.voltageVdc.lowAlarmMax);

  // Load graph specific telemetry data
  const loadGraphData = async (refresh = false, useSample = false) => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      let url = "/api/local/site-health/graph";
      const params = new URLSearchParams();
      
      params.append("lowVolt", String(lowVolt));
      params.append("lowAlarmVolt", String(lowAlarmVolt));
      params.append("warningVolt", String(warningVolt));
      params.append("alarmVolt", String(alarmVolt));
      params.append("lowTemp", String(lowTemp));
      params.append("lowAlarmTemp", String(lowAlarmTemp));
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

  const stringListStatusBuckets = snapshot?.rollups?.stringSummary?.buckets || null;
  const stringListStatusRows =
    snapshot?.normalized?.strings ||
    snapshot?.rollups?.stringSummary?.tableRows ||
    strings ||
    [];

  const countStringBucket = (bucket: string): number =>
    stringListStatusRows.filter((row: any) => row?.bucket === bucket).length;

  const stringListStatusCounts = {
    total: Number(stringListStatusBuckets?.online ?? NaN) >= 0
      ? Number(stringListStatusBuckets.online || 0) +
        Number(stringListStatusBuckets.nearline || 0) +
        Number(stringListStatusBuckets.offline || 0) +
        Number(stringListStatusBuckets.notCommunicating || 0) +
        Number(stringListStatusBuckets.unknown || 0)
      : (stringListStatusRows.length || strings.length),
    online: Number(stringListStatusBuckets?.online ?? NaN) >= 0
      ? Number(stringListStatusBuckets.online || 0)
      : countStringBucket('online'),
    nearline: Number(stringListStatusBuckets?.nearline ?? NaN) >= 0
      ? Number(stringListStatusBuckets.nearline || 0)
      : countStringBucket('nearline'),
    offline: Number(stringListStatusBuckets?.offline ?? NaN) >= 0
      ? Number(stringListStatusBuckets.offline || 0)
      : countStringBucket('offline'),
    notCommunicating: Number(stringListStatusBuckets?.notCommunicating ?? NaN) >= 0
      ? Number(stringListStatusBuckets.notCommunicating || 0)
      : countStringBucket('notCommunicating')
  };


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

  const normalizedStrings =
    Array.isArray((data as any)?.strings) ? (data as any).strings :
    [];

  const stringListTopRowSource =
    normalizedStrings ||
    strings ||
    snapshot?.normalized?.strings ||
    snapshot?.rollups?.stringSummary?.tableRows ||
    [];

  const stringListTopRowStatusCounts = {
    total: stringListTopRowSource.length,
    online: stringListTopRowSource.filter((r: any) => r?.bucket === "online").length,
    nearline: stringListTopRowSource.filter((r: any) => r?.bucket === "nearline").length,
    offline: stringListTopRowSource.filter((r: any) => r?.bucket === "offline").length,
    notCommunicating: stringListTopRowSource.filter((r: any) => r?.bucket === "notCommunicating").length
  };

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

  const siteRangeMetrics = useMemo(() => {
    // Voltage: stackVoltage
    const voltValues = filteredStrings.map(s => s.stackVoltage).filter((v): v is number => v !== undefined && v !== null);
    const voltMin = voltValues.length > 0 ? Math.min(...voltValues) : null;
    const voltMax = voltValues.length > 0 ? Math.max(...voltValues) : null;
    const voltAvg = voltValues.length > 0 ? Math.round(voltValues.reduce((a, b) => a + b, 0) / voltValues.length) : null;

    // Temperature: maxCellTempC, minCellTempC, avgCellTempC
    const tempMinValues = filteredStrings.map(s => s.minCellTempC).filter((t): t is number => t !== undefined && t !== null);
    const tempMaxValues = filteredStrings.map(s => s.maxCellTempC).filter((t): t is number => t !== undefined && t !== null);
    const tempAvgValues = filteredStrings.map(s => s.avgCellTempC).filter((t): t is number => t !== undefined && t !== null);

    const tempMin = tempMinValues.length > 0 ? Math.min(...tempMinValues) : null;
    const tempMax = tempMaxValues.length > 0 ? Math.max(...tempMaxValues) : null;
    const tempAvg = tempAvgValues.length > 0 ? Number((tempAvgValues.reduce((a, b) => a + b, 0) / tempAvgValues.length).toFixed(1)) : null;

    // Counts
    const totalCount = strings.length;
    const includedCount = filteredStrings.length;
    const excludedCount = totalCount - includedCount;
    const alarmCount = filteredStrings.filter(s => s.statusColor === "red").length;
    const warningCount = filteredStrings.filter(s => s.statusColor === "amber" || s.statusColor === "yellow").length;
    const idealCount = filteredStrings.filter(s => s.statusColor === "green").length;

    return {
      voltMin,
      voltMax,
      voltAvg,
      tempMin,
      tempMax,
      tempAvg,
      totalCount,
      includedCount,
      excludedCount,
      alarmCount,
      warningCount,
      idealCount
    };
  }, [strings, filteredStrings]);

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

  // PDF Data Export Functionality
  const formatTimestampForFilename = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${year}${month}${day}_${hours}${mins}`;
  };

  const handleExportPdf = () => {
    const doc = new jsPDF();
    const station = data?.stationCode || data?.rows?.[0]?.stationCode || "UNKNOWN_STATION";
    const block = data?.blockIndex || data?.rows?.[0]?.blockIndex || "UNKNOWN_BLOCK";
    const dateStr = new Date().toLocaleDateString();
    const timeStr = new Date().toLocaleTimeString();

    // 1. Page 1: Executive Summary & Legend
    doc.setFillColor(20, 30, 45); // Dark Slate background header
    doc.rect(0, 0, 210, 30, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("Helvetica", "Bold");
    doc.text("GreEnergy PRIZM", 15, 12);
    
    doc.setFontSize(10);
    doc.setFont("Helvetica", "Normal");
    doc.text("SITE HEALTH DIAGNOSTICS & TELEMETRY REPORT", 15, 22);

    doc.setTextColor(100, 110, 120);
    doc.setFontSize(9);
    doc.text(`Station: ${station}  |  Block: ${block}  |  Generated: ${dateStr} ${timeStr}`, 15, 38);
    doc.text(`Selected Chart Spread Mode: ${activeTab.toUpperCase()}`, 15, 43);

    // Divider Line
    doc.setDrawColor(220, 225, 230);
    doc.line(15, 47, 195, 47);

    // Section 1: Site-wide Metrics
    doc.setFontSize(12);
    doc.setTextColor(20, 30, 45);
    doc.setFont("Helvetica", "Bold");
    doc.text("1. EXECUTIVE SUMMARY & RANGE LIMITS", 15, 55);

    // Draw box for site limits
    doc.setFillColor(245, 247, 250);
    doc.rect(15, 60, 180, 40, "F");
    doc.setDrawColor(210, 215, 220);
    doc.rect(15, 60, 180, 40, "D");

    doc.setFontSize(10);
    doc.setTextColor(50, 60, 70);
    doc.setFont("Helvetica", "Bold");
    doc.text("Site-Wide Distribution Range Limits (Filtered Dataset)", 20, 67);

    doc.setFont("Helvetica", "Normal");
    doc.setFontSize(9);
    doc.text(`Total Filtered Strings Listed: ${siteRangeMetrics.includedCount} (of ${siteRangeMetrics.totalCount} total)`, 20, 74);
    
    // Volt / Temp metrics
    doc.text(`Voltage Stack Range: Min: ${siteRangeMetrics.voltMin ?? "--"} Vdc  |  Avg: ${siteRangeMetrics.voltAvg ?? "--"} Vdc  |  Max: ${siteRangeMetrics.voltMax ?? "--"} Vdc`, 20, 81);
    doc.text(`Temperature Celsius: Min: ${siteRangeMetrics.tempMin !== null ? siteRangeMetrics.tempMin.toFixed(1) : "--"} °C  |  Avg: ${siteRangeMetrics.tempAvg !== null ? siteRangeMetrics.tempAvg.toFixed(1) : "--"} °C  |  Max: ${siteRangeMetrics.tempMax !== null ? siteRangeMetrics.tempMax.toFixed(1) : "--"} °C`, 20, 88);
    doc.text(`Temperature Fahrenheit: Min: ${siteRangeMetrics.tempMin !== null ? Math.round(celsiusToFahrenheit(siteRangeMetrics.tempMin)) : "--"} °F  |  Avg: ${siteRangeMetrics.tempAvg !== null ? Math.round(celsiusToFahrenheit(siteRangeMetrics.tempAvg)) : "--"} °F  |  Max: ${siteRangeMetrics.tempMax !== null ? Math.round(celsiusToFahrenheit(siteRangeMetrics.tempMax)) : "--"} °F`, 20, 95);

    // Section 2: Threshold Definitions (Legend)
    doc.setFontSize(12);
    doc.setFont("Helvetica", "Bold");
    doc.setTextColor(20, 30, 45);
    doc.text("2. OPERATIONAL THRESHOLD LEGEND", 15, 112);

    doc.setFontSize(9);
    doc.setFont("Helvetica", "Normal");
    doc.text(`- VOLTAGE BOUNDS (Stack/String):`, 15, 120);
    doc.text(`  • OVERVOLTAGE ALARM: >= ${alarmVolt} Vdc`, 20, 126);
    doc.text(`  • HIGH VOLTAGE WARNING: ${warningVolt} to ${alarmVolt - 1} Vdc`, 20, 131);
    doc.text(`  • IDEAL BAND: ${lowVolt + 1} to ${warningVolt - 1} Vdc`, 20, 136);
    doc.text(`  • LOW VOLTAGE WARNING: ${lowAlarmVolt + 1} to ${lowVolt} Vdc`, 20, 141);
    doc.text(`  • UNDERVOLTAGE ALARM: <= ${lowAlarmVolt} Vdc`, 20, 146);

    doc.text(`- TEMPERATURE BOUNDS (Cell Maximum):`, 110, 120);
    doc.text(`  • HIGH TEMP ALARM: >= ${alarmTemp}°C (${Math.round(celsiusToFahrenheit(alarmTemp))}°F)`, 115, 126);
    doc.text(`  • HIGH TEMP WARNING: ${warningTemp} to ${alarmTemp - 1}°C (${Math.round(celsiusToFahrenheit(warningTemp))}-${Math.round(celsiusToFahrenheit(alarmTemp - 1))}°F)`, 115, 131);
    doc.text(`  • IDEAL BAND: ${lowTemp + 1} to ${warningTemp - 1}°C (${Math.round(celsiusToFahrenheit(lowTemp + 1))}-${Math.round(celsiusToFahrenheit(warningTemp - 1))}°F)`, 115, 136);
    doc.text(`  • LOW TEMP WARNING: ${lowAlarmTemp + 1} to ${lowTemp}°C (${Math.round(celsiusToFahrenheit(lowAlarmTemp + 1))}-${Math.round(celsiusToFahrenheit(lowTemp))}°F)`, 115, 141);
    doc.text(`  • LOW TEMP ALARM: <= ${lowAlarmTemp}°C (${Math.round(celsiusToFahrenheit(lowAlarmTemp))}°F)`, 115, 146);

    // Section 3: Overall Outliers & Counts
    doc.setFontSize(12);
    doc.setFont("Helvetica", "Bold");
    doc.text("3. SITE STRING COUNTS & ANOMALIES", 15, 160);

    // Box for Counts
    doc.setFillColor(250, 251, 252);
    doc.rect(15, 165, 180, 22, "F");
    doc.rect(15, 165, 180, 22, "D");

    doc.setFontSize(9);
    doc.setFont("Helvetica", "Normal");
    doc.setTextColor(50, 60, 70);
    doc.text(`Alarm (Red): ${siteRangeMetrics.alarmCount}   |   Warning (Amber/Yellow): ${siteRangeMetrics.warningCount}   |   Ideal (Green): ${siteRangeMetrics.idealCount}`, 20, 172);
    doc.text(`Communicating Strings: ${strings.filter(s => s.communicating).length}   |   Communications Lost: ${strings.filter(s => !s.communicating).length}  |  Out of Rotation: ${strings.filter(s => !s.inRotation).length}`, 20, 178);

    // Top Outliers table on Page 1
    doc.setFontSize(10);
    doc.setFont("Helvetica", "Bold");
    doc.setTextColor(20, 30, 45);
    doc.text("Top Detected Outliers / Bypassed Strings", 15, 196);

    const outliers = filteredStrings.filter(s => s.statusColor !== "green" || !s.inRotation || !s.communicating).slice(0, 5);
    
    // Draw tiny table header
    doc.setFillColor(235, 240, 245);
    doc.rect(15, 201, 180, 6, "F");
    doc.setFontSize(8);
    doc.text("Device Label", 18, 205);
    doc.text("IP Address", 55, 205);
    doc.text("Stack Volt", 95, 205);
    doc.text("Temp Min/Max/Avg", 125, 205);
    doc.text("Status Category", 165, 205);

    doc.setFont("Helvetica", "Normal");
    let outlierY = 211;
    if (outliers.length === 0) {
      doc.text("All active strings are healthy and operating in the Ideal bands.", 18, 211);
    } else {
      outliers.forEach(ot => {
        doc.text(ot.displayLabel || `--`, 18, outlierY);
        doc.text(ot.ip || `Unknown`, 55, outlierY);
        doc.text(`${ot.stackVoltage ?? "--"} Vdc`, 95, outlierY);
        doc.text(`${ot.minCellTempC ?? "--"}/${ot.maxCellTempC ?? "--"}/${ot.avgCellTempC ?? "--"} C`, 125, outlierY);
        doc.text(ot.statusLabel || `Healthy`, 165, outlierY);
        outlierY += 6;
      });
    }

    // Page footer
    doc.setFontSize(8);
    doc.setTextColor(150, 155, 160);
    doc.text(`GreEnergy PRIZM Site Health Diagnostics  |  Page 1 of 2`, 15, 285);

    // 2. Page 2: Per-Array Summaries & Detailed Tables & Notes
    doc.addPage();
    
    doc.setFillColor(20, 30, 45);
    doc.rect(0, 0, 210, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("Helvetica", "Bold");
    doc.text(`GreEnergy PRIZM - SITE HEALTH DETAILED ARRAY SUMMARIES`, 15, 12);

    doc.setTextColor(20, 30, 45);
    doc.setFontSize(12);
    doc.text("4. PER-ARRAY DETAILED TELEMETRY SUMMARIES", 15, 28);

    // Calculate array summaries
    const arraysMap = new Map<number, any[]>();
    for (const s of strings) {
      const arrIdx = s.arrayIndex;
      if (!arraysMap.has(arrIdx)) {
        arraysMap.set(arrIdx, []);
      }
      arraysMap.get(arrIdx)!.push(s);
    }

    const arraySummaries = Array.from(arraysMap.keys()).sort((a, b) => a - b).map(arrIdx => {
      const arrStrings = arraysMap.get(arrIdx)!;
      
      const volts = arrStrings.map(s => s.stackVoltage).filter((v): v is number => v !== undefined && v !== null);
      const voltMin = volts.length > 0 ? Math.min(...volts) : null;
      const voltMax = volts.length > 0 ? Math.max(...volts) : null;
      const voltAvg = volts.length > 0 ? Math.round(volts.reduce((a, b) => a + b, 0) / volts.length) : null;
      
      const temps = arrStrings.map(s => s.maxCellTempC).filter((t): t is number => t !== undefined && t !== null);
      const tempMin = temps.length > 0 ? Math.min(...temps) : null;
      const tempMax = temps.length > 0 ? Math.max(...temps) : null;
      const tempAvg = temps.length > 0 ? Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)) : null;

      let lowestVoltStr = "--";
      let highestVoltStr = "--";
      if (volts.length > 0) {
        const sortedByVolt = [...arrStrings].filter(s => s.stackVoltage !== undefined && s.stackVoltage !== null)
          .sort((a, b) => (a.stackVoltage || 0) - (b.stackVoltage || 0));
        lowestVoltStr = sortedByVolt[0]?.displayLabel || "--";
        highestVoltStr = sortedByVolt[sortedByVolt.length - 1]?.displayLabel || "--";
      }

      let lowestTempStr = "--";
      let highestTempStr = "--";
      if (temps.length > 0) {
        const sortedByTemp = [...arrStrings].filter(s => s.maxCellTempC !== undefined && s.maxCellTempC !== null)
          .sort((a, b) => (a.maxCellTempC || 0) - (b.maxCellTempC || 0));
        lowestTempStr = sortedByTemp[0]?.displayLabel || "--";
        highestTempStr = sortedByTemp[sortedByTemp.length - 1]?.displayLabel || "--";
      }

      const greenCount = arrStrings.filter(s => s.statusColor === "green").length;
      const yellowCount = arrStrings.filter(s => s.statusColor === "yellow" || s.statusColor === "amber").length;
      const redCount = arrStrings.filter(s => s.statusColor === "red").length;

      return {
        arrayIndex: arrIdx,
        stringCount: arrStrings.length,
        voltMin,
        voltMax,
        voltAvg,
        tempMin,
        tempMax,
        tempAvg,
        lowestVoltStr,
        highestVoltStr,
        lowestTempStr,
        highestTempStr,
        greenCount,
        yellowCount,
        redCount
      };
    });

    // Render Array Summaries Table
    doc.setFillColor(240, 242, 245);
    doc.rect(15, 33, 180, 6, "F");
    doc.setFontSize(8);
    doc.setFont("Helvetica", "Bold");
    doc.text("Arr", 17, 37);
    doc.text("Count", 25, 37);
    doc.text("Volt Range (Min/Avg/Max)", 38, 37);
    doc.text("Temp Range (Min/Avg/Max)", 78, 37);
    doc.text("Highest/Lowest String Key", 118, 37);
    doc.text("Status (I/W/A)", 165, 37);

    doc.setFont("Helvetica", "Normal");
    let arrY = 44;
    arraySummaries.forEach(arr => {
      doc.setFont("Helvetica", "Bold");
      doc.text(`A${arr.arrayIndex}`, 17, arrY);
      doc.setFont("Helvetica", "Normal");
      doc.text(String(arr.stringCount), 25, arrY);
      doc.text(`${arr.voltMin ?? "--"}/${arr.voltAvg ?? "--"}/${arr.voltMax ?? "--"} Vdc`, 38, arrY);
      doc.text(`${arr.tempMin !== null ? arr.tempMin.toFixed(0) : "--"}/${arr.tempAvg !== null ? arr.tempAvg.toFixed(0) : "--"}/${arr.tempMax !== null ? arr.tempMax.toFixed(0) : "--"} C`, 78, arrY);
      doc.text(`V: ${arr.lowestVoltStr} | T: ${arr.highestTempStr}`, 118, arrY);
      doc.text(`G:${arr.greenCount} Y:${arr.yellowCount} R:${arr.redCount}`, 165, arrY);
      
      doc.setDrawColor(240, 242, 245);
      doc.line(15, arrY + 2, 195, arrY + 2);
      arrY += 7;
    });

    // Notes/interpretation section at the bottom
    doc.setFontSize(11);
    doc.setFont("Helvetica", "Bold");
    doc.setTextColor(20, 30, 45);
    doc.text("5. OPERATIONAL RECOMMENDATIONS & INTERPRETATION", 15, 185);

    doc.setFontSize(9);
    doc.setFont("Helvetica", "Normal");
    doc.setTextColor(60, 70, 80);
    
    doc.text("• COMMUNICATIONS VERIFICATION: Inspect strings with lost/inactive communications (gray indicators).", 15, 195);
    doc.text("  Verify that the controller card IP addresses are reachable on the localized site network subnets.", 15, 200);

    doc.text("• VOLTAGE CORRECTION: For strings exhibiting OVERVOLTAGE or UNDERVOLTAGE alarms/warnings, coordinate", 15, 208);
    doc.text("  with field technicians to perform voltage balancing and test contactor engagement states.", 15, 213);

    doc.text("• THERMAL OPTIMIZATION: High temperature values (amber or red alarms) indicate localized hot-spots.", 15, 221);
    doc.text("  Ensure the battery enclosure climate system is cooling properly and check ventilation ducts for blockage.", 15, 226);

    doc.text("• EXPORT COMPLIANCE: This report is certified by the GreEnergy PRIZM diagnostic automation platform.", 15, 234);
    doc.text("  Please store these findings as part of the formal maintenance record for this energy storage facility.", 15, 239);

    // Page footer
    doc.setFontSize(8);
    doc.setTextColor(150, 155, 160);
    doc.text(`GreEnergy PRIZM Site Health Diagnostics  |  Page 2 of 2`, 15, 285);

    // Filename generation
    const formattedTimestamp = formatTimestampForFilename();
    const filename = `GreEnergy_PRIZM_Site_Health_${station}_Block_${block}_${formattedTimestamp}.pdf`;
    
    doc.save(filename);
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
      const value = activeTab === "voltage"
        ? row.voltage
        : (row.temperature !== undefined && row.temperature !== null ? celsiusToFahrenheit(row.temperature) : null);
      return {
        ...row,
        stackVoltage: row.voltage,
        minCellVoltage: row.minCellVoltage,
        avgCellVoltage: row.avgCellVoltage,
        maxCellVoltage: row.maxCellVoltage,
        minCellTempC: row.minCellTempC,
        avgCellTempC: row.avgCellTempC,
        maxCellTempC: row.maxCellTempC,
        xIndex: index + 1,
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

          {activeTab === "voltage" ? (
            <div className="pt-1 grid grid-cols-3 gap-1 text-[9.5px] border-t border-prizm-border/40 my-1">
              <div>
                <span className="text-slate-400 block font-sans">Cell Volt Min:</span>
                <span className="text-cyan-400 font-bold">{d.minCellVoltage !== undefined && d.minCellVoltage !== null ? formatCellVoltageMv(d.minCellVoltage) : "N/A"}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-sans">Cell Volt Avg:</span>
                <span className="text-cyan-400 font-bold">{d.avgCellVoltage !== undefined && d.avgCellVoltage !== null ? formatCellVoltageMv(d.avgCellVoltage) : "N/A"}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-sans">Cell Volt Max:</span>
                <span className="text-cyan-400 font-bold">{d.maxCellVoltage !== undefined && d.maxCellVoltage !== null ? formatCellVoltageMv(d.maxCellVoltage) : "N/A"}</span>
              </div>
            </div>
          ) : (
            <div className="pt-1 grid grid-cols-3 gap-1 text-[9.5px] border-t border-prizm-border/40 my-1">
              <div>
                <span className="text-slate-400 block font-sans">Temp Min:</span>
                <span className="text-orange-400 font-bold">
                  {d.minCellTempC !== undefined && d.minCellTempC !== null 
                    ? `${Math.round(celsiusToFahrenheit(d.minCellTempC))}°F` 
                    : "N/A"}
                </span>
                {d.minCellTempC !== undefined && d.minCellTempC !== null && (
                  <span className="text-slate-400 block text-[9px]">({d.minCellTempC.toFixed(1)}°C)</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block font-sans">Temp Avg:</span>
                <span className="text-yellow-400 font-bold">
                  {d.avgCellTempC !== undefined && d.avgCellTempC !== null 
                    ? `${Math.round(celsiusToFahrenheit(d.avgCellTempC))}°F` 
                    : "N/A"}
                </span>
                {d.avgCellTempC !== undefined && d.avgCellTempC !== null && (
                  <span className="text-slate-400 block text-[9px]">({d.avgCellTempC.toFixed(1)}°C)</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block font-sans">Temp Max:</span>
                <span className="text-orange-400 font-bold">
                  {d.maxCellTempC !== undefined && d.maxCellTempC !== null 
                    ? `${Math.round(celsiusToFahrenheit(d.maxCellTempC))}°F` 
                    : "N/A"}
                </span>
                {d.maxCellTempC !== undefined && d.maxCellTempC !== null && (
                  <span className="text-slate-400 block text-[9px]">({d.maxCellTempC.toFixed(1)}°C)</span>
                )}
              </div>
            </div>
          )}

          <div className="pt-1.5 border-t border-prizm-border flex items-center gap-1.5 font-bold" style={{ color: getStatusColorHex(d.statusColor) }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getStatusColorHex(d.statusColor) }} />
            STATUS: {d.statusLabel}
          </div>

          {d.metricSource && (
            <div className="pt-1.5 border-t border-prizm-border/40 mt-1.5 space-y-0.5 text-[9px] text-slate-400">
              <span className="font-bold text-slate-500 uppercase block tracking-wider font-sans">Metrics Resolution Diagnostics:</span>
              <div className="flex justify-between">
                <span>Voltage Source:</span>
                <span className="text-white font-semibold">{d.metricSource.voltage}</span>
              </div>
              <div className="flex justify-between">
                <span>Temperature Source:</span>
                <span className="text-white font-semibold">{d.metricSource.temperature}</span>
              </div>
              {d.metricSource.soc && (
                <div className="flex justify-between">
                  <span>SOC Source:</span>
                  <span className="text-white font-semibold">{d.metricSource.soc}</span>
                </div>
              )}
              {d.metricSource.sampleAgeMs !== undefined && d.metricSource.sampleAgeMs !== null && (
                <div className="flex justify-between text-yellow-400/90">
                  <span>Sample Age:</span>
                  <span>{(d.metricSource.sampleAgeMs / 1000).toFixed(1)}s</span>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const fmtF = (c: number) => `${Math.round(celsiusToFahrenheit(c))}°F`;
  const tempBandLabels = {
    highAlarm: `HIGH TEMP ALARM (≥${fmtF(alarmTemp)})`,
    highWarning: `HIGH TEMP WARNING (${fmtF(warningTemp)}–${fmtF(alarmTemp)})`,
    lowWarning: `LOW TEMP WARNING (${fmtF(lowAlarmTemp)}–${fmtF(lowTemp)})`,
    lowAlarm: `LOW TEMP ALARM (≤${fmtF(lowAlarmTemp)})`
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
          onClick={() => setCurrentView("heatmap")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-all cursor-pointer ${
            currentView === "heatmap"
              ? "border-prizm-primary text-prizm-primary bg-prizm-info/5 font-extrabold"
              : "border-transparent text-prizm-text-muted hover:text-white"
          }`}
        >
          <Layers size={12} />
          Cell Heatmap
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
          Sensor Health & Open Closed Detectors
        </button>
      </div>

      {currentView === "sensors" ? (
        <div className="animate-fade-in" id="prizm-merged-sensors-view">
          <SiteSensorsDashboard />
        </div>
      ) : currentView === "heatmap" ? (
        <div className="animate-fade-in bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-5" id="prizm-site-heatmap-view">
          <ArrayCellHeatmapGrid arrayDetailsByArray={snapshot?.normalized?.arrayDetailsByArray || {}} />
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-8 gap-3">
          <div className="bg-prizm-surface-strong p-2.5 rounded border border-prizm-border/60">
            <span className="text-[9px] text-prizm-text-muted uppercase block">Total Strings</span>
            <span className="font-bold text-base text-prizm-text">{stringListStatusCounts.total}</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-emerald-500/30 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Online</span>
              <span className="font-bold text-base text-emerald-600">{stringListStatusCounts.online}</span>
            </div>
            <span className="text-[9px] text-emerald-600 leading-tight">STRING STATUS</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-cyan-500/30 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Nearline</span>
              <span className="font-bold text-base text-cyan-600">{stringListStatusCounts.nearline}</span>
            </div>
            <span className="text-[9px] text-cyan-600 leading-tight">STRING STATUS</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-amber-500/30 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Offline</span>
              <span className="font-bold text-base text-amber-500">{stringListStatusCounts.offline}</span>
            </div>
            <span className="text-[9px] text-amber-600 leading-tight">STRING STATUS</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-slate-500/40 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Not Comm</span>
              <span className="font-bold text-base text-slate-500">{stringListStatusCounts.notCommunicating}</span>
            </div>
            <span className="text-[9px] text-slate-500 leading-tight">STRING STATUS</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-prizm-border/60 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Listed Rows</span>
              <span className="font-bold text-base text-prizm-info">{filteredStrings.length}</span>
            </div>
            <span className="text-[9px] text-prizm-text-muted leading-tight">FILTERED VIEW</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-prizm-border/60 flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-prizm-text-muted uppercase block">Warns / Alarms</span>
              <span className="font-bold text-base">
                <span className="text-prizm-warning">{siteRangeMetrics.warningCount}</span>
                <span className="text-prizm-text-muted"> / </span>
                <span className="text-prizm-danger">{siteRangeMetrics.alarmCount}</span>
              </span>
            </div>
            <span className="text-[9px] text-prizm-text-muted leading-tight">FILTERED VIEW</span>
          </div>

          <div className="bg-prizm-surface-strong p-2.5 rounded border border-prizm-border/60 col-span-2 sm:col-span-3 md:col-span-5 xl:col-span-1" id="site-range-limits-panel">
            <span className="text-[9px] text-prizm-text-muted uppercase block font-extrabold border-b border-prizm-border/40 pb-1 mb-1">Range Limits</span>

            <div className="text-[10px] space-y-2 mt-1 text-prizm-text">
              <div className="space-y-0.5">
                <span className="text-[8px] text-prizm-text-muted block uppercase font-bold">Voltage Min/Avg/Max</span>
                <div className="font-mono font-bold text-prizm-info flex justify-between">
                  <span>Vdc:</span>
                  <span>
                    {siteRangeMetrics.voltMin !== null ? siteRangeMetrics.voltMin : '--'} / {siteRangeMetrics.voltAvg !== null ? siteRangeMetrics.voltAvg : '--'} / {siteRangeMetrics.voltMax !== null ? siteRangeMetrics.voltMax : '--'}
                  </span>
                </div>
              </div>

              <div className="space-y-0.5 border-t border-prizm-border/20 pt-1">
                <span className="text-[8px] text-prizm-text-muted block uppercase font-bold font-mono">Temp Min/Avg/Max</span>
                <div className="font-mono font-semibold text-orange-400 flex flex-col gap-0.5">
                  <div className="flex justify-between font-bold">
                    <span>C:</span>
                    <span>
                      {siteRangeMetrics.tempMin !== null ? siteRangeMetrics.tempMin.toFixed(1) : '--'} /{' '}
                      {siteRangeMetrics.tempAvg !== null ? siteRangeMetrics.tempAvg.toFixed(1) : '--'} /{' '}
                      {siteRangeMetrics.tempMax !== null ? siteRangeMetrics.tempMax.toFixed(1) : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[8px] text-prizm-text-muted">
                    <span>F:</span>
                    <span>
                      {siteRangeMetrics.tempMin !== null ? Math.round(celsiusToFahrenheit(siteRangeMetrics.tempMin)) : '--'} /{' '}
                      {siteRangeMetrics.tempAvg !== null ? Math.round(celsiusToFahrenheit(siteRangeMetrics.tempAvg)) : '--'} /{' '}
                      {siteRangeMetrics.tempMax !== null ? Math.round(celsiusToFahrenheit(siteRangeMetrics.tempMax)) : '--'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>      </div>

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
                <option value="max">Max Cell Temperature (°F)</option>
                <option value="avg">Average Cell Temperature (°F)</option>
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


          {/* Complete String Status Summary */}
          <div className="space-y-2 pt-4 border-t border-prizm-border/60">
            <span className="text-[10px] text-prizm-text-muted font-bold uppercase tracking-wider block">
              Complete String Status
            </span>

            <div className="grid grid-cols-5 gap-1.5">
              <div className="rounded border border-prizm-border bg-prizm-surface-strong px-2 py-2 text-center">
                <div className="text-[8px] text-prizm-text-muted font-bold uppercase">Total</div>
                <div className="text-sm font-black text-prizm-text">{stringListTopRowStatusCounts.total}</div>
              </div>

              <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-2 text-center">
                <div className="text-[8px] text-emerald-300 font-bold uppercase">Online</div>
                <div className="text-sm font-black text-emerald-300">{stringListTopRowStatusCounts.online}</div>
              </div>

              <div className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-2 text-center">
                <div className="text-[8px] text-cyan-300 font-bold uppercase">Nearline</div>
                <div className="text-sm font-black text-cyan-300">{stringListTopRowStatusCounts.nearline}</div>
              </div>

              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-center">
                <div className="text-[8px] text-amber-300 font-bold uppercase">Offline</div>
                <div className="text-sm font-black text-amber-300">{stringListTopRowStatusCounts.offline}</div>
              </div>

              <div className="rounded border border-slate-500/40 bg-slate-500/10 px-2 py-2 text-center">
                <div className="text-[8px] text-slate-300 font-bold uppercase">Not Comm</div>
                <div className="text-sm font-black text-slate-300">{stringListTopRowStatusCounts.notCommunicating}</div>
              </div>
            </div>

            <span className="text-[8.5px] text-prizm-text-muted block leading-tight">
              Full site totals. Filters below only affect the displayed rows and exports.
            </span>
          </div>

          {/* DYNAMIC EXPORT CONTROL BLOCK */}
          <div className="space-y-2 pt-4 border-t border-prizm-border/60">
            <span className="text-[10px] text-prizm-text-muted font-bold uppercase block">Export Spread Logs & Reports</span>
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
            <button
              onClick={handleExportPdf}
              disabled={filteredStrings.length === 0}
              className="w-full py-1.5 px-2 bg-prizm-primary/20 hover:bg-prizm-primary/30 text-prizm-primary border border-prizm-primary/40 rounded flex items-center justify-center gap-1.5 font-bold text-[9px] uppercase cursor-pointer disabled:opacity-50 transition"
            >
              <FileText size={10} />
              Export PDF Diagnostic Report
            </button>
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
                    <span className="text-prizm-danger">{formatTemperatureF(alarmTemp, { decimals: 1, showUnit: true, sourceUnit: "C" })}</span>
                  </div>
                  <input
                    type="range"
                    min="45"
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
                    <span className="text-prizm-warning">{formatTemperatureF(warningTemp, { decimals: 1, showUnit: true, sourceUnit: "C" })}</span>
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
                    <span>Low warning temp:</span>
                    <span className="text-prizm-info">{formatTemperatureF(lowTemp, { decimals: 1, showUnit: true, sourceUnit: "C" })}</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="25"
                    step="1"
                    value={lowTemp}
                    onChange={e => setLowTemp(Number(e.target.value))}
                    className="w-full accent-prizm-info h-1 bg-prizm-bg-muted rounded"
                  />
                </div>
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Low alarm temp:</span>
                    <span className="text-prizm-danger">{formatTemperatureF(lowAlarmTemp, { decimals: 1, showUnit: true, sourceUnit: "C" })}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="15"
                    step="1"
                    value={lowAlarmTemp}
                    onChange={e => setLowAlarmTemp(Number(e.target.value))}
                    className="w-full accent-prizm-danger h-1 bg-prizm-bg-muted rounded"
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
                    min="1400"
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
                    min="1200"
                    max="1440"
                    step="10"
                    value={warningVolt}
                    onChange={e => setWarningVolt(Number(e.target.value))}
                    className="w-full accent-prizm-warning h-1 bg-prizm-bg-muted rounded"
                  />
                </div>
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Low warning volt:</span>
                    <span className="text-prizm-info">{lowVolt} Vdc</span>
                  </div>
                  <input
                    type="range"
                    min="1100"
                    max="1300"
                    step="10"
                    value={lowVolt}
                    onChange={e => setLowVolt(Number(e.target.value))}
                    className="w-full accent-prizm-info h-1 bg-prizm-bg-muted rounded"
                  />
                </div>
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>Low alarm volt:</span>
                    <span className="text-prizm-danger">{lowAlarmVolt} Vdc</span>
                  </div>
                  <input
                    type="range"
                    min="900"
                    max="1100"
                    step="10"
                    value={lowAlarmVolt}
                    onChange={e => setLowAlarmVolt(Number(e.target.value))}
                    className="w-full accent-prizm-danger h-1 bg-prizm-bg-muted rounded"
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
                METRIC: <span className="font-extrabold text-prizm-primary">{activeTab === "voltage" ? "Stack Voltage Vdc" : (tempMetric === "max" ? "Max Cell Temperature (°F)" : "Average Cell Temperature (°F)")}</span>
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
                <ArrayCellHeatmapGrid arrayDetailsByArray={snapshot?.normalized?.arrayDetailsByArray || {}} />
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
                        unit="°F"
                        domain={[
                          (dataMin: number) => {
                            const minVal = typeof dataMin === 'number' && Number.isFinite(dataMin) ? dataMin : 68;
                            return Math.floor(Math.min(minVal, celsiusToFahrenheit(lowTemp)) - 5);
                          },
                          (dataMax: number) => {
                            const maxVal = typeof dataMax === 'number' && Number.isFinite(dataMax) ? dataMax : 113;
                            return Math.ceil(Math.max(maxVal, celsiusToFahrenheit(alarmTemp)) + 5);
                          }
                        ]}
                        stroke="#475569"
                        fontSize={10}
                        label={{ value: 'Temperature (°F)', angle: -90, position: 'insideLeft', offset: -5, fontSize: 10, fill: '#64748b' }}
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
                          y={celsiusToFahrenheit(alarmTemp)} 
                          stroke="#EF4444" 
                          strokeDasharray="5 5" 
                          strokeWidth={1.5} 
                          label={{ value: tempBandLabels.highAlarm, fill: "#EF4444", fontSize: 9, fontWeight: "bold", position: "insideTopLeft", offset: 8 }} 
                        />
                        <ReferenceLine 
                          y={celsiusToFahrenheit(warningTemp)} 
                          stroke="#F59E0B" 
                          strokeDasharray="3 3" 
                          strokeWidth={1} 
                          label={{ value: tempBandLabels.highWarning, fill: "#F59E0B", fontSize: 9, fontWeight: "bold", position: "insideTopLeft", offset: 8 }} 
                        />
                        <ReferenceLine 
                          y={celsiusToFahrenheit(lowTemp)} 
                          stroke="#3B82F6" 
                          strokeDasharray="3 3" 
                          strokeWidth={1} 
                          label={{ value: tempBandLabels.lowWarning, fill: "#3B82F6", fontSize: 9, fontWeight: "bold", position: "insideBottomLeft", offset: 8 }} 
                        />
                        <ReferenceLine 
                          y={celsiusToFahrenheit(lowAlarmTemp)} 
                          stroke="#EF4444" 
                          strokeDasharray="5 5" 
                          strokeWidth={1.5} 
                          label={{ value: tempBandLabels.lowAlarm, fill: "#EF4444", fontSize: 9, fontWeight: "bold", position: "insideBottomLeft", offset: 8 }} 
                        />
                      </>
                    ) : (
                      <>
                        <ReferenceLine 
                          y={alarmVolt} 
                          stroke="#EF4444" 
                          strokeDasharray="5 5" 
                          strokeWidth={1.5} 
                          label={{ value: `OVERVOLTAGE ALARM (≥${alarmVolt} Vdc)`, fill: "#EF4444", fontSize: 9, fontWeight: "bold", position: "insideTopLeft", offset: 8 }} 
                        />
                        <ReferenceLine 
                          y={warningVolt} 
                          stroke="#F59E0B" 
                          strokeDasharray="3 3" 
                          strokeWidth={1} 
                          label={{ value: `HIGH VOLTAGE WARNING (${warningVolt}–${alarmVolt - 1} Vdc)`, fill: "#F59E0B", fontSize: 9, fontWeight: "bold", position: "insideTopLeft", offset: 8 }} 
                        />
                        <ReferenceLine 
                          y={lowVolt} 
                          stroke="#3B82F6" 
                          strokeDasharray="3 3" 
                          strokeWidth={1} 
                          label={{ value: `LOW VOLTAGE WARNING (${lowAlarmVolt + 1}–${lowVolt} Vdc)`, fill: "#3B82F6", fontSize: 9, fontWeight: "bold", position: "insideBottomLeft", offset: 8 }} 
                        />
                        <ReferenceLine 
                          y={lowAlarmVolt} 
                          stroke="#EF4444" 
                          strokeDasharray="5 5" 
                          strokeWidth={1.5} 
                          label={{ value: `UNDERVOLTAGE ALARM (≤${lowAlarmVolt} Vdc)`, fill: "#EF4444", fontSize: 9, fontWeight: "bold", position: "insideBottomLeft", offset: 8 }} 
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
                    <th className="p-2 border-r border-prizm-border text-center">Array</th>
                    <th className="p-2 border-r border-prizm-border text-center">String</th>
                    <th className="p-2 border-r border-prizm-border">Label</th>
                    <th className="p-2 border-r border-prizm-border text-right">Voltage Min</th>
                    <th className="p-2 border-r border-prizm-border text-right">Voltage Max</th>
                    <th className="p-2 border-r border-prizm-border text-right">Voltage Avg</th>
                    <th className="p-2 border-r border-prizm-border text-right">Temp Min</th>
                    <th className="p-2 border-r border-prizm-border text-right">Temp Max</th>
                    <th className="p-2 border-r border-prizm-border text-right">Temp Avg</th>
                    <th className="p-2 border-r border-prizm-border">Controller IP</th>
                    <th className="p-2">Status Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-prizm-border/50">
                  {filteredStrings.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-6 text-center text-emerald-600 font-bold bg-emerald-50 text-xs">
                        {outliersOnly 
                          ? "🎉 ALL site controllers are normal. No active threshold breach or off-line rotations detected."
                          : "🔍 No controller strings match your current active filters."}
                      </td>
                    </tr>
                  ) : (
                    filteredStrings.map((s, idx) => {
                      const tempV = getMetricValue(s, "temperature", "max");
                      const voltV = getMetricValue(s, "voltage");
                      
                      const isHighTemp = tempV !== undefined && tempV !== null && tempV >= warningTemp;
                      const isLowTemp = tempV !== undefined && tempV !== null && tempV <= lowTemp;
                      const isHighVolt = voltV !== undefined && voltV !== null && voltV >= warningVolt;
                      const isLowVolt = voltV !== undefined && voltV !== null && voltV <= lowVolt;

                      // Derive Voltage Min, Max, Avg: use stackVoltage if no cell voltage is available
                      const renderVoltMin = s.minCellVoltage !== undefined && s.minCellVoltage !== null
                        ? formatCellVoltageMv(s.minCellVoltage)
                        : s.stackVoltage !== undefined && s.stackVoltage !== null
                          ? `${s.stackVoltage} Vdc`
                          : "--";

                      const renderVoltMax = s.maxCellVoltage !== undefined && s.maxCellVoltage !== null
                        ? formatCellVoltageMv(s.maxCellVoltage)
                        : s.stackVoltage !== undefined && s.stackVoltage !== null
                          ? `${s.stackVoltage} Vdc`
                          : "--";

                      const renderVoltAvg = s.avgCellVoltage !== undefined && s.avgCellVoltage !== null
                        ? formatCellVoltageMv(s.avgCellVoltage)
                        : s.stackVoltage !== undefined && s.stackVoltage !== null
                          ? `${s.stackVoltage} Vdc`
                          : "--";

                      // Derive Temp Min, Max, Avg: if min/max/avg cell temp exist render directly, otherwise fallback to stackTemperatureC
                      const renderTempMin = s.minCellTempC !== undefined && s.minCellTempC !== null
                        ? `${s.minCellTempC.toFixed(1)}°C (${Math.round(celsiusToFahrenheit(s.minCellTempC))}°F)`
                        : s.stackTemperatureC !== undefined && s.stackTemperatureC !== null
                          ? `${s.stackTemperatureC.toFixed(1)}°C (${Math.round(celsiusToFahrenheit(s.stackTemperatureC))}°F)`
                          : "--";

                      const renderTempMax = s.maxCellTempC !== undefined && s.maxCellTempC !== null
                        ? `${s.maxCellTempC.toFixed(1)}°C (${Math.round(celsiusToFahrenheit(s.maxCellTempC))}°F)`
                        : s.stackTemperatureC !== undefined && s.stackTemperatureC !== null
                          ? `${s.stackTemperatureC.toFixed(1)}°C (${Math.round(celsiusToFahrenheit(s.stackTemperatureC))}°F)`
                          : "--";

                      const renderTempAvg = s.avgCellTempC !== undefined && s.avgCellTempC !== null
                        ? `${s.avgCellTempC.toFixed(1)}°C (${Math.round(celsiusToFahrenheit(s.avgCellTempC))}°F)`
                        : s.stackTemperatureC !== undefined && s.stackTemperatureC !== null
                          ? `${s.stackTemperatureC.toFixed(1)}°C (${Math.round(celsiusToFahrenheit(s.stackTemperatureC))}°F)`
                          : "--";

                      return (
                        <tr key={idx} className="bg-prizm-surface hover:bg-prizm-surface-strong divide-x divide-prizm-border/30 transition">
                          <td className="p-2 font-bold text-center text-prizm-text">{s.arrayIndex}</td>
                          <td className="p-2 font-bold text-center text-prizm-text">{s.stringIndex}</td>
                          <td className="p-2 font-bold text-prizm-text-muted">{s.displayLabel}</td>
                          <td className={`p-2 text-right font-bold ${isHighVolt ? 'text-red-500' : isLowVolt ? 'text-cyan-500' : 'text-slate-300'}`}>
                            {renderVoltMin}
                          </td>
                          <td className={`p-2 text-right font-bold ${isHighVolt ? 'text-red-500' : isLowVolt ? 'text-cyan-500' : 'text-slate-300'}`}>
                            {renderVoltMax}
                          </td>
                          <td className={`p-2 text-right font-bold ${isHighVolt ? 'text-red-500' : isLowVolt ? 'text-cyan-500' : 'text-slate-300'}`}>
                            {renderVoltAvg}
                          </td>
                          <td className={`p-2 text-right font-bold ${isHighTemp ? 'text-orange-500' : 'text-slate-300'}`}>
                            {renderTempMin}
                          </td>
                          <td className={`p-2 text-right font-bold ${isHighTemp ? 'text-orange-500' : 'text-slate-300'}`}>
                            {renderTempMax}
                          </td>
                          <td className={`p-2 text-right font-bold ${isHighTemp ? 'text-orange-500' : 'text-slate-300'}`}>
                            {renderTempAvg}
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
