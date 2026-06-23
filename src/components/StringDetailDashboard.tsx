import { markPerf } from '../lib/perf';
import React, { useState, useEffect, useMemo } from "react";
import { ArrowLeft, RefreshCw, Download, AlertTriangle, Layers, Cpu, Zap, Activity, Thermometer } from "lucide-react";
import { formatPrizmUtcTimestamp } from '../lib/timeFormat';
import { useSiteData } from "../context/SiteDataContext";
import CellTelemetryHeatmap from "./CellTelemetryHeatmap";
import PhysicalEnergySegmentHeatmap from "./PhysicalEnergySegmentHeatmap";
import { buildPhysicalSlotsFromRichDetail } from "../lib/physicalEnergySegmentLayout";
import { cToF } from "../lib/temperatureUnits";
import { formatTemperatureF } from "../utils/temperatureScale";

export default function StringDetailDashboard({ stringData, onBack }: { stringData: any, onBack: () => void }) {
  const { snapshot } = useSiteData();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [heatmapLayoutMode, setHeatmapLayoutMode] = useState<"physical" | "raw">("physical");

  const stringDataArrayNumber = Number(stringData?.arrayNumber);
  const stringDataStringNumber = Number(stringData?.stringNumber);

  useEffect(() => {
    if (!stringDataArrayNumber || !stringDataStringNumber) return;
    let unmounted = false;
    const fetchDetail = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch(`/api/local/strings/dashboard/${stringDataArrayNumber}/${stringDataStringNumber}/detail?captureHistory=true`);
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
          throw new Error("Server is restarting or unreachable");
        }
        if (res.ok && !unmounted) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to fetch string detail", err);
      } finally {
        if (!unmounted) setLoading(false);
        markPerf('StringDetail Refresh', t0);
      }
    };
    fetchDetail();
    // Detail could also auto-refresh, but we'll leave it as one-off or simple interval
    const interval = window.setInterval(fetchDetail, 15000);
    return () => {
      unmounted = true;
      window.clearInterval(interval);
    };
  }, [stringDataArrayNumber, stringDataStringNumber]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/local/strings/dashboard/${stringDataArrayNumber}/${stringDataStringNumber}/detail?refresh=true&captureHistory=true`);
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        throw new Error("Server is restarting or unreachable");
      }
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to refresh detail manually", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const s = {
    ...stringData,
    ...(data?.summary || {}),
    ...(data || {}),
    contactorStatus: data?.positiveContactorClosed !== undefined ? (data.positiveContactorClosed ? "CLOSED" : "OPEN") : stringData?.contactorStatus,
    rotationStatus: data?.outRotation !== undefined ? (data.outRotation ? "OUT" : "IN") : stringData?.rotationStatus,
  };

  const { voltageMatrix = [], temperatureMatrix = [], notificationMatrix = [], balancingDetails = [], balancingDebugKeys = [], notificationDebugKeys = [], notifications = [], eventLogs = [], bpcs = [], sourceHealth = {}, hasBalancingMap = false } = data || {};

  const safeArray = (value: any): any[] => Array.isArray(value) ? value : [];
  const safeObject = (value: any): Record<string, any> => {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  };
  const safeText = (value: any, fallback = "--"): string => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : fallback;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return fallback;
  };
  const finite = (value: any): number | null => {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const safeMatrix = (value: any): any[][] => {
    if (!Array.isArray(value)) return [];
    return value.filter((row: any) => Array.isArray(row));
  };

  const safeVoltageMatrix = safeMatrix(voltageMatrix);
  const safeTemperatureMatrix = safeMatrix(temperatureMatrix);
  const safeNotificationMatrix = safeMatrix(notificationMatrix);
  const safeBpcs = safeArray(bpcs);
  const safeBalancingDetails = safeArray(balancingDetails);
  const safeNotifications = safeArray(notifications);
  const safeEventLogs = safeArray(eventLogs);
  const safeSourceHealth = safeObject(sourceHealth);
  const safeStringViewerReportHealth = safeObject(safeSourceHealth.stringviewerReport);
  const safeStringViewerMonitorHealth = safeObject(safeSourceHealth.stringviewerMonitor);
  const legacyStringViewerHealth = safeObject(safeSourceHealth.stringviewer);

  const stringNum = finite(s.stringNumber ?? s.stringIndex ?? s.StringIndex);
  const energySegmentNumber =
    stringNum !== null
      ? Math.ceil(stringNum / 2)
      : null;
  const containerNumber = energySegmentNumber;
  const containerLabel =
    energySegmentNumber !== null
      ? `ES ${energySegmentNumber}`
      : "--";

  const measuredStringVoltage =
    finite(s.measuredStringVoltage) ??
    finite(s.measuredVoltage) ??
    (s.stringData && finite(s.stringData.measuredStringVoltage));
  const calculatedStringVoltage =
    finite(s.calculatedStringVoltage) ??
    finite(s.calculatedVoltage) ??
    (s.stringData && finite(s.stringData.calculatedStringVoltage));
  const preciseCalculatedStringVoltage =
    finite(s.preciseCalculatedStringVoltage) ??
    (s.stringData && finite(s.stringData.preciseCalculatedStringVoltage));

  const formatStringVolts = (value: any): string => {
    const n = finite(value);
    return n === null ? "--" : `${Math.round(n)}V`;
  };

  const matrixValues = (matrix: any): number[] => {
    const rows = safeMatrix(matrix);
    return rows
      .flatMap((row: any[]) => row)
      .map(finite)
      .filter((n): n is number => n !== null);
  };
  const matrixMin = (matrix: any): number | null => {
    const values = matrixValues(matrix);
    return values.length ? Math.min(...values) : null;
  };
  const matrixMax = (matrix: any): number | null => {
    const values = matrixValues(matrix);
    return values.length ? Math.max(...values) : null;
  };
  const matrixAvg = (matrix: any): number | null => {
    const values = matrixValues(matrix);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };

  const cellVoltageMin =
    finite(s.cellVoltageMin) ??
    finite(s.minCellVoltage) ??
    (s.stringData && finite(s.stringData.minCellGroupVoltage)) ??
    matrixMin(safeVoltageMatrix);
  const cellVoltageMax =
    finite(s.cellVoltageMax) ??
    finite(s.maxCellVoltage) ??
    (s.stringData && finite(s.stringData.maxCellGroupVoltage)) ??
    matrixMax(safeVoltageMatrix);
  const cellVoltageAvg =
    finite(s.cellVoltageAvg) ??
    finite(s.avgCellVoltage) ??
    (s.stringData && finite(s.stringData.avgCellGroupVoltage)) ??
    matrixAvg(safeVoltageMatrix);
  const cellVoltageDelta =
    finite(s.cellVoltageDelta) ??
    finite(s.cellVoltageMaxDelta) ??
    (
      cellVoltageMax !== null && cellVoltageMin !== null
        ? cellVoltageMax - cellVoltageMin
        : null
    );

  const normalizeTempC = (value: any): number | null => {
    const n = finite(value);
    if (n === null) return null;
    // EMS sometimes reports deci-Celsius values like 270 = 27.0°C.
    if (Math.abs(n) > 100) return n / 10;
    return n;
  };

  const cellTempMin =
    normalizeTempC(s.cellTempMin) ??
    normalizeTempC(s.minCellTemperature) ??
    (s.stringData && normalizeTempC(s.stringData.minCellGroupTemp)) ??
    matrixMin(safeTemperatureMatrix);
  const cellTempMax =
    normalizeTempC(s.cellTempMax) ??
    normalizeTempC(s.maxCellTemperature) ??
    (s.stringData && normalizeTempC(s.stringData.maxCellGroupTemp)) ??
    matrixMax(safeTemperatureMatrix);
  const cellTempAvg =
    normalizeTempC(s.cellTempAvg) ??
    normalizeTempC(s.avgCellTemperature) ??
    (s.stringData && normalizeTempC(s.stringData.avgCellGroupTemp)) ??
    matrixAvg(safeTemperatureMatrix);
  const cellTempDelta =
    finite(s.cellTempDelta) ??
    finite(s.cellTemperatureDelta) ??
    (
      cellTempMax !== null && cellTempMin !== null
        ? cellTempMax - cellTempMin
        : null
    );

  const cellTempMinF = cellTempMin !== null ? cToF(cellTempMin) : null;
  const cellTempMaxF = cellTempMax !== null ? cToF(cellTempMax) : null;
  const cellTempAvgF = cellTempAvg !== null ? cToF(cellTempAvg) : null;
  const cellTempDeltaF = cellTempDelta !== null ? cellTempDelta * 9 / 5 : null;

  const bpcCount =
    finite(s.bpcCount) ??
    finite(s.batteryPackCount) ??
    (Array.isArray(s.batteryPacks) ? s.batteryPacks.length : null) ??
    (Array.isArray(s.balanceDetails) ? s.balanceDetails.length : null) ??
    (safeVoltageMatrix.length > 0 ? safeVoltageMatrix.length : null);

  const formatMv = (value: any): string => {
    const n = finite(value);
    return n === null ? "--" : `${Math.round(n)} mV`;
  };
  const formatTemp = (value: any): string => {
    const n = finite(value);
    if (n === null) return "--";
    return formatTemperatureF(n, { decimals: 1, showUnit: true, sourceUnit: "C" });
  };
  const formatTempF = (valueF: number | null, valueC: number | null): string => {
    if (valueC !== null) {
      return formatTemperatureF(valueC, { decimals: 1, showUnit: true, sourceUnit: "C" });
    }
    if (valueF !== null) {
      return formatTemperatureF(valueF, { decimals: 1, showUnit: true, sourceUnit: "F" });
    }
    return "--";
  };
  const formatDeltaMv = (value: any): string => {
    const n = finite(value);
    return n === null ? "Δ --" : `Δ ${Math.round(n)} mV`;
  };
  const formatDeltaTemp = (value: any): string => {
    const n = finite(value);
    if (n === null) return "Δ --";
    return `Δ ${(n * 1.8).toFixed(1)}°F`;
  };
  const formatDeltaTempF = (valueF: number | null, valueC: number | null): string => {
    if (valueC !== null) {
      return `Δ ${(valueC * 1.8).toFixed(1)}°F`;
    }
    if (valueF !== null) {
      return `Δ ${valueF.toFixed(1)}°F`;
    }
    return "Δ --";
  };

  const downloadMatrixCsv = (matrix: any, name: string) => {
    const safeRows = safeMatrix(matrix);
    if (safeRows.length === 0) return;
    const colCount = safeRows[0]?.length || 0;
    const csvRows = [];
    csvRows.push(["BPC Index", ...Array.from({ length: colCount }, (_, i) => `Cell ${i + 1}`)].join(","));
    safeRows.forEach((row, rIdx) => {
      csvRows.push([`BPC ${rIdx + 1}`, ...row.map((v: any) => v ?? "")].join(","));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeText(stringData.stringKey, "Array_String")}_${name}_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasBpcCellGroups = safeBpcs.some((bpc: any) => bpc && Array.isArray(bpc.cellGroups) && bpc.cellGroups.length > 0);
  const hasVoltageMatrix = hasBpcCellGroups || (safeVoltageMatrix.length > 0 && safeVoltageMatrix.some(r => Array.isArray(r) && r.length > 0));
  const hasTempMatrix = hasBpcCellGroups || (safeTemperatureMatrix.length > 0 && safeTemperatureMatrix.some(r => Array.isArray(r) && r.length > 0));
  const hasNotifMatrix = safeNotificationMatrix.some((r: any) => Array.isArray(r) && r.length > 0);

  const finalBpcCount = data?.summary?.bpcCount ?? safeBpcs.length ?? s.bpcCount ?? 0;

  const heatmapData = useMemo(() => {
    let volts: (number | null)[] = [];
    let temps: (number | null)[] = [];
    let isCompact = false;

    // Priority 1: bpcs cellGroups
    if (hasBpcCellGroups) {
      safeBpcs.forEach((b: any) => {
        safeArray(b?.cellGroups).forEach((cg: any) => {
          volts.push(finite(cg?.voltage));
          temps.push(finite(cg?.temperature));
        });
      });
    }

    // Priority 2: Flat map of existing matrix arrays
    if (volts.length === 0 && safeVoltageMatrix.length > 0) {
      volts = safeVoltageMatrix.flat().map((v: any) => finite(v));
    }
    if (temps.length === 0 && safeTemperatureMatrix.length > 0) {
      temps = safeTemperatureMatrix.flat().map((t: any) => finite(t));
    }

    // Priority 3: Fallback from cache strings if still empty (Compact EMS reported values)
    if (volts.length === 0 || temps.length === 0) {
      const arrD = snapshot?.normalized?.arrayDetailsByArray?.[String(s.arrayNumber)] ??
                   snapshot?.normalized?.arrayDetailsByArray?.[s.arrayNumber];
      const arrStrings = Array.isArray(arrD?.strings) ? arrD.strings : [];
      const strD = arrStrings.find((st: any) => 
        Number(st.stringNumber ?? st.stringIndex) === Number(s.stringNumber ?? s.stringIndex)
      );
      if (strD) {
        if (volts.length === 0 && Array.isArray(strD.millivolts) && strD.millivolts.length > 0) {
          volts = strD.millivolts.map((v: any) => finite(v));
          isCompact = true;
        }
        if (temps.length === 0 && Array.isArray(strD.temperatures) && strD.temperatures.length > 0) {
          temps = strD.temperatures.map((t: any) => finite(t));
          isCompact = true;
        }
      }
    }

    return {
      voltages: volts,
      temperatures: temps,
      isCompact
    };
  }, [safeBpcs, safeVoltageMatrix, safeTemperatureMatrix, snapshot, s.arrayNumber, s.stringNumber, s.stringIndex]);

  const heatmapGridColumns =
    safeArray(safeBpcs?.[0]?.cellGroups).length ||
    safeVoltageMatrix?.[0]?.length ||
    30;

  const physicalLayout = useMemo(() => {
    return buildPhysicalSlotsFromRichDetail(data);
  }, [data]);

  if (!data && loading) {
    return (
       <div className="flex-1 flex flex-col h-full bg-prizm-bg p-6">
         <button onClick={onBack} className="text-prizm-text-muted hover:text-prizm-text flex items-center gap-2 font-mono text-xs mb-6 w-fit">
            <ArrowLeft size={14} /> BACK TO STRINGS
         </button>
         <div className="flex-1 flex flex-col items-center justify-center p-8 text-prizm-text-muted font-mono">
            <RefreshCw className="animate-spin mb-4 text-prizm-primary" size={32} />
            <span className="text-xs font-bold tracking-widest uppercase">Fetching detail for {stringData.stringKey}...</span>
         </div>
       </div>
    );
  }

  const getVoltageColor = (v: number | null | undefined) => {
       if (v === null || v === undefined) return "bg-white/5 border-white/10 text-prizm-text-muted";
       if (v > 3600) return "bg-red-500/20 border-red-500/40 text-red-100 font-bold animate-pulse";
       if (v > 3500) return "bg-amber-400/20 border-amber-400/40 text-amber-100 font-bold";
       if (v < 2800) return "bg-red-500/20 border-red-500/40 text-red-100 font-bold animate-pulse";
       if (v < 3000) return "bg-amber-400/20 border-amber-400/40 text-amber-100 font-bold";
       if (v > 0) return "bg-emerald-500/10 border-emerald-500/20 text-prizm-text";
       return "bg-white/5 border-white/10 text-prizm-text-muted";
  };

  const getTempColor = (t: number | null | undefined) => {
       if (t === null || t === undefined) return "bg-white/5 border-white/10 text-prizm-text-muted";
       if (t > 45) return "bg-red-500/20 border-red-500/40 text-red-100 font-bold animate-pulse";
       if (t > 40) return "bg-amber-400/20 border-amber-400/40 text-amber-100 font-bold";
       if (t < 5) return "bg-blue-500/20 border-blue-500/40 text-blue-100 font-bold";
       if (t !== undefined && !Number.isNaN(t)) return "bg-amber-500/10 border-amber-500/20 text-prizm-text";
       return "bg-white/5 border-white/10 text-prizm-text-muted";
  };

  return (
    <div className="flex-1 flex overflow-hidden flex-col font-sans transition-all h-full bg-prizm-bg">
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 pb-20" id="string-detail-scroll">
          <div className="flex justify-between items-center mb-6 shrink-0 font-mono">
            <button onClick={onBack} className="text-prizm-text-muted hover:text-prizm-text flex items-center gap-2 text-xs font-bold transition-colors">
                <ArrowLeft size={14} /> BACK TO STRINGS
            </button>
            <div className="text-xs text-prizm-text-muted flex gap-4 items-center">
                <button
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-3 py-1 bg-prizm-surface border border-prizm-border rounded hover:bg-prizm-surface-strong transition-colors text-prizm-primary font-bold mr-4"
                >
                    <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} /> REFRESH LIVE
                </button>
                <span>{s.stringControllerIp}</span>
                <span>FW: {s.stringControllerFirmware || "Unknown"}</span>
            </div>
          </div>

          {!data && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-500 p-3 rounded text-[11px] font-mono mb-4 flex items-center justify-between">
              <span>⚠ Detail data unavailable for A{s.arrayNumber}-S{s.stringNumber}. Showing cached summary only.</span>
            </div>
          )}

          {/* Top summary strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6 shrink-0 text-center font-mono select-none">
            <div className="bg-prizm-surface-strong border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase">Array / String</span>
              <span className="text-sm font-bold text-prizm-text">{s.arrayNumber} / {s.stringNumber}</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase">Contact / Rot</span>
              <span className="text-[11px] font-bold text-prizm-text mt-0.5"><span className={s.contactorStatus === "CLOSED" ? "text-emerald-400" : "text-prizm-text-muted"}>{s.contactorStatus === "CLOSED" ? "CLOSED" : "OPEN"}</span> | <span className={s.rotationStatus === "IN" ? "text-emerald-400" : "text-prizm-warning"}>{s.rotationStatus === "IN" ? "IN" : "OUT"}</span></span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase">SOC / Energy</span>
              <span className="text-[11px] font-bold text-prizm-info mt-0.5">{s.socPct ?? s.soc}% | {s.kwh ?? '--'}kWh</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase">Power / Amps</span>
              <span className="text-[11px] font-bold text-prizm-text mt-0.5">{s.kw ?? '--'}kW | {s.amps ?? '--'}A</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase leading-tight font-bold">VOLTAGES (MEAS/CALC)</span>
               <span className="text-[11px] font-bold text-prizm-text mt-0.5">{formatStringVolts(measuredStringVoltage)} / {formatStringVolts(calculatedStringVoltage)}</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center min-h-[64px]">
              <span className="text-[9px] text-prizm-text-muted uppercase leading-tight font-bold">CELL VOLTAGE</span>
              <span className="text-[10px] font-bold text-prizm-text mt-0.5">Min {formatMv(cellVoltageMin)} | Max {formatMv(cellVoltageMax)}</span>
              <span className="text-[9px] text-prizm-text-muted mt-0.5 font-semibold">Avg {formatMv(cellVoltageAvg)} | {formatDeltaMv(cellVoltageDelta)}</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center min-h-[64px]" title={`Celsius: Min ${formatTemp(cellTempMin)} | Max ${formatTemp(cellTempMax)} | Avg ${formatTemp(cellTempAvg)}`}>
               <span className="text-[9px] text-prizm-text-muted uppercase leading-tight font-bold">CELL TEMP</span>
               <span className="text-[10px] font-bold text-prizm-text mt-0.5">Min {formatTempF(cellTempMinF, cellTempMin)} | Max {formatTempF(cellTempMaxF, cellTempMax)}</span>
               <span className="text-[9px] text-prizm-text-muted mt-0.5 font-semibold">Avg {formatTempF(cellTempAvgF, cellTempAvg)} | {formatDeltaTempF(cellTempDeltaF, cellTempDelta)}</span>
            </div>
            <div className="bg-prizm-surface border border-prizm-border rounded p-2 flex flex-col justify-center">
              <span className="text-[9px] text-prizm-text-muted uppercase leading-tight font-bold">ENERGY SEGMENT / BPCS</span>
              <span className="text-[11px] font-bold text-prizm-text mt-0.5">{containerLabel} | {bpcCount !== null ? bpcCount : "--"} BPCs</span>
            </div>
          </div>

          {/* Details / Debug */}
          <details className="mb-6 bg-prizm-surface border border-prizm-border rounded-lg text-xs font-mono group">
            <summary className="p-3 cursor-pointer text-prizm-text-muted hover:text-prizm-text transition-colors select-none outline-none font-bold tracking-wider">
               Local EMS Data Binding Details
            </summary>
            <div className="p-3 border-t border-prizm-border bg-black/20 overflow-x-auto no-scrollbar space-y-2">
                <div className="flex gap-4 items-center">
                    <span className={`px-1.5 py-0.5 rounded font-bold ${data ? 'bg-emerald-500/20 text-emerald-400' : 'bg-prizm-danger/20 text-prizm-danger'}`}>
                        Detail endpoint loaded: {data ? 'true' : 'false'}
                    </span>
                    <span className="text-prizm-text-muted">sourceViewerUsed: {data?.sourceViewerUsed ? 'true' : 'false'}</span>
                    <span className="text-prizm-text-muted">bpcs: {safeBpcs.length || 0}</span>
                    <span className="text-prizm-text-muted">firstBpcCellGroups: {safeArray(safeBpcs?.[0]?.cellGroups).length || 0}</span>
                    <span className="text-prizm-text-muted">voltageRows: {safeVoltageMatrix.length || 0}</span>
                    <span className="text-prizm-text-muted">temperatureRows: {safeTemperatureMatrix.length || 0}</span>
                    <span className="text-prizm-text-muted">balancingDetails: {safeBalancingDetails.length || 0}</span>
                    <span className="text-prizm-text-muted">notifications: {safeNotifications.length || 0}</span>
                </div>
                {balancingDebugKeys && balancingDebugKeys.length > 0 && (
                     <div className="bg-black/30 p-2 rounded text-[9px] font-mono text-prizm-text-muted mt-2 border border-prizm-border/50 max-h-[150px] overflow-y-auto">
                         <div className="font-bold text-prizm-primary mb-1">Detected Balancing Keys from Raw Data:</div>
                         {balancingDebugKeys.map((k: string, i: number) => <div key={i}>{k}</div>)}
                     </div>
                )}
                {notificationDebugKeys && notificationDebugKeys.length > 0 && (
                     <div className="bg-black/30 p-2 rounded text-[9px] font-mono text-prizm-text-muted mt-2 border border-prizm-border/50 max-h-[150px] overflow-y-auto">
                         <div className="font-bold text-prizm-primary mb-1">Detected Notification Keys from Raw Data:</div>
                         {notificationDebugKeys.map((k: string, i: number) => <div key={i}>{k}</div>)}
                     </div>
                )}
                {Object.keys(safeStringViewerReportHealth).length > 0 && (
                    <div className="flex gap-4 items-center bg-black/20 p-2 rounded">
                        <span className={`px-1.5 py-0.5 rounded font-bold ${safeStringViewerReportHealth.ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-prizm-danger/20 text-prizm-danger'}`}>
                            Report source {safeStringViewerReportHealth.ok ? 'OK' : 'FAIL'}
                        </span>
                        <span className="text-prizm-text-muted">HTTP {safeStringViewerReportHealth.httpStatus || '--'}</span>
                        <span className="text-prizm-text-muted">{safeStringViewerReportHealth.durationMs ? `${safeStringViewerReportHealth.durationMs}ms` : '-- ms'}</span>
                        <span className="text-prizm-text-muted break-all">{safeStringViewerReportHealth.endpoint || safeStringViewerReportHealth.url || '--'}</span>
                        {!safeStringViewerReportHealth.ok && safeStringViewerReportHealth.error && (
                            <span className="text-prizm-danger ml-auto">Error: {safeStringViewerReportHealth.error}</span>
                        )}
                    </div>
                )}
                {Object.keys(safeStringViewerMonitorHealth).length > 0 && (
                    <div className="flex gap-4 items-center bg-black/20 p-2 rounded">
                        <span className={`px-1.5 py-0.5 rounded font-bold ${safeStringViewerMonitorHealth.ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-prizm-danger/20 text-prizm-danger'}`}>
                            Monitor source {safeStringViewerMonitorHealth.ok ? 'OK' : 'FAIL'}
                        </span>
                        <span className="text-prizm-text-muted">HTTP {safeStringViewerMonitorHealth.httpStatus || '--'}</span>
                        <span className="text-prizm-text-muted">{safeStringViewerMonitorHealth.durationMs ? `${safeStringViewerMonitorHealth.durationMs}ms` : '-- ms'}</span>
                        <span className="text-prizm-text-muted break-all">{safeStringViewerMonitorHealth.endpoint || safeStringViewerMonitorHealth.url || '--'}</span>
                        {!safeStringViewerMonitorHealth.ok && safeStringViewerMonitorHealth.error && (
                            <span className="text-prizm-danger ml-auto">Error: {safeStringViewerMonitorHealth.error}</span>
                        )}
                    </div>
                )}
                {Object.keys(legacyStringViewerHealth).length > 0 && (
                    <div className="flex gap-4 items-center bg-black/20 p-2 rounded">
                        <span className={`px-1.5 py-0.5 rounded font-bold ${legacyStringViewerHealth.ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-prizm-danger/20 text-prizm-danger'}`}>
                            Legacy source {legacyStringViewerHealth.ok ? 'OK' : 'FAIL'}
                        </span>
                        <span className="text-prizm-text-muted">HTTP {legacyStringViewerHealth.httpStatus || '--'}</span>
                        <span className="text-prizm-text-muted">{legacyStringViewerHealth.durationMs ? `${legacyStringViewerHealth.durationMs}ms` : '-- ms'}</span>
                        <span className="text-prizm-text-muted break-all">{legacyStringViewerHealth.endpoint || legacyStringViewerHealth.url || '--'}</span>
                        {!legacyStringViewerHealth.ok && legacyStringViewerHealth.error && (
                            <span className="text-prizm-danger ml-auto">Error: {legacyStringViewerHealth.error}</span>
                        )}
                    </div>
                )}
            </div>
          </details>

          <div className="flex flex-col gap-6 mb-6 font-semibold">
              {physicalLayout.available ? (
                  <div className="space-y-6">
                    <PhysicalEnergySegmentHeatmap
                      slots={physicalLayout.slots}
                      arrayNumber={s.arrayNumber}
                      stringNumber={s.stringNumber}
                      mode="temperature"
                      hideToggle={true}
                      title="Temperature Physical Layout"
                    />
                    <PhysicalEnergySegmentHeatmap
                      slots={physicalLayout.slots}
                      arrayNumber={s.arrayNumber}
                      stringNumber={s.stringNumber}
                      mode="voltage"
                      hideToggle={true}
                      title="Voltage Physical Layout"
                    />
                  </div>
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-xs font-mono border border-dashed border-prizm-border/50 rounded bg-black/10 py-12 text-center text-prizm-text-muted">
                      <AlertTriangle className="mb-2 text-prizm-warning" size={24} />
                      <span className="mb-2 font-bold text-prizm-text">Physical cell layout requires rich string detail telemetry.</span>
                      <span>Required source: <br /> <span className="text-[10px] text-prizm-primary bg-black/30 px-1 py-0.5 mt-1 inline-block rounded">/tools/report/ems/array/{"{array}"}/string/{"{string}"}/report.json</span></span>
                      <span className="mt-2 text-[10px]">{physicalLayout.reason || "Individual BPC/cell-group voltage and temperature telemetry was not returned for this string."}</span>
                  </div>
              )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
             {/* Balancing */}
             <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 flex flex-col">
                 <h3 className="font-mono text-xs font-bold text-prizm-info flex items-center gap-2 mb-4 uppercase tracking-wide">
                    <Activity size={14} /> Array {s.arrayNumber} - String {s.stringNumber} - Balancing Details
                 </h3>
                 {balancingDetails.length > 0 ? (
                     <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
                           <thead className="bg-black/20 text-prizm-text-muted">
                              <tr>
                                 <th className="p-2 border-b border-prizm-border font-bold">BPC</th>
                                 <th className="p-2 border-b border-prizm-border font-bold">MODE</th>
                                 <th className="p-2 border-b border-prizm-border font-bold">STATE</th>
                                 <th className="p-2 border-b border-prizm-border font-bold">BAL CG</th>
                                 <th className="p-2 border-b border-prizm-border font-bold">TARGET V</th>
                                 <th className="p-2 border-b border-prizm-border font-bold">SOURCE</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-prizm-border/20">
                               {balancingDetails.map((b: any, i: number) => {
                                   let stateStr = "Off";
                                   if (b.state === true || b.state === "true" || b.balancingActive) {
                                       stateStr = typeof b.state === 'string' ? b.state : "Active";
                                    } else if (b.state === false || b.state === "false") {
                                       stateStr = "Off";
                                   } else if (b.state) {
                                       stateStr = String(b.state);
                                   }

                                   let stateColorClass = "text-prizm-text-muted";
                                   if (stateStr === "Charging") {
                                       stateColorClass = "text-cyan-400 font-bold animate-pulse";
                                   } else if (stateStr === "Discharging") {
                                       stateColorClass = "text-amber-400 font-semibold animate-pulse";
                                   } else if (stateStr === "Active") {
                                       stateColorClass = "text-emerald-400 font-bold animate-pulse";
                                   } else if (stateStr !== "Off") {
                                       stateColorClass = "text-emerald-400";
                                   }

                                   return (
                                   <tr key={i} className="hover:bg-black/10 transition-colors">
                                       <td className="p-2 font-bold text-prizm-text-muted">BPC{b.bpcNumber ?? b.index ?? (i+1)}</td>
                                       <td className="p-2">{b.displayMode !== undefined && b.displayMode !== null ? b.displayMode : (b.mode !== undefined && b.mode !== null ? b.mode : "--")}</td>
                                       <td className="p-2">
                                           <span className={stateColorClass}>{stateStr}</span>
                                       </td>
                                       <td className="p-2 font-mono text-prizm-warning">{b.balancingCellGroupIndex !== null && b.balancingCellGroupIndex !== undefined ? b.balancingCellGroupIndex : (b.targetCellGroup !== undefined ? b.targetCellGroup : "--")}</td>
                                       <td className="p-2 text-prizm-info font-bold font-mono">{b.targetVoltage !== undefined && b.targetVoltage !== null ? b.targetVoltage : "--"}</td>
                                       <td className="p-2 font-mono text-[9px] text-[#B2C6FF]/80 select-all truncate max-w-[200px]" title={b.sourcePath}>{b.sourcePath || "--"}</td>
                                    </tr>
                               )})}
                           </tbody>
                        </table>
                     </div>
                 ) : (
                     <div className="flex-1 flex flex-col items-center justify-center text-xs font-mono text-prizm-text-muted border border-dashed border-prizm-border/50 rounded bg-black/10 py-12 px-4 text-center">
                           {hasBalancingMap ? (
                              <>
                                <span className="text-prizm-warning font-bold uppercase tracking-wider mb-1 animate-pulse">Balancing map detected</span>
                                <span className="text-[11px] text-prizm-text-muted">but no rows were normalized.</span>
                              </>
                           ) : (
                              "No balancing data available from current local EMS source."
                           )}
                     </div>
                 )}
             </div>

             {/* Notifications */}
             <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 flex flex-col">
                 <h3 className="font-mono text-xs font-bold text-prizm-danger flex items-center gap-2 mb-4 uppercase tracking-wide">
                    <AlertTriangle size={14} /> Array {s.arrayNumber} - String {s.stringNumber} - Notification List
                 </h3>
                 {notifications.length > 0 ? (
                     <div className="overflow-x-auto no-scrollbar max-h-[300px]">
                        <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
                           <thead className="bg-black/20 text-prizm-text-muted sticky top-0">
                              <tr>
                                 <th className="p-2 border-b border-prizm-border">Code/Level</th>
                                 <th className="p-2 border-b border-prizm-border">Message</th>
                                 <th className="p-2 border-b border-prizm-border">Timestamp</th>
                                 <th className="p-2 border-b border-prizm-border">Trigger</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-prizm-border/20">
                               {notifications.map((n: any, i: number) => {
                                   const isAlarm = n.level === 'ALARM';
                                   return (
                                   <tr key={i} className="hover:bg-black/10">
                                       <td className="p-2">
                                           <div className="flex items-center gap-2">
                                                <span className={`px-1.5 py-0.5 rounded font-bold ${isAlarm ? 'bg-prizm-danger/20 text-prizm-danger' : 'bg-prizm-warning/20 text-prizm-warning'}`}>
                                                    {n.level || "WARN"}
                                                </span>
                                                {n.code && <span className="text-prizm-text ml-1 opacity-80">{n.code}</span>}
                                           </div>
                                       </td>
                                       <td className="p-2 whitespace-normal break-words text-prizm-text">{n.displayText || n.message || n.text || String(n)}</td>
                                       <td className="p-2 text-prizm-text-muted">{formatPrizmUtcTimestamp(n.timestamp || s.timestampUtc)}</td>
                                       <td className="p-2 text-prizm-text-muted font-bold">{n.trigger !== undefined ? n.trigger : "--"}</td>
                                   </tr>
                               )})}
                           </tbody>
                        </table>
                     </div>
                 ) : (
                     <div className="flex-1 flex flex-col items-center justify-center text-xs font-mono text-prizm-text-muted border border-dashed border-emerald-500/30 rounded bg-emerald-500/5 py-12">
                          <span className="text-emerald-400 font-bold mb-2 text-lg">●</span>
                          No active notifications or faults.
                     </div>
                 )}
             </div>
          </div>

          {/* Event Logs */}
          <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 flex flex-col">
              <h3 className="font-mono text-xs font-bold text-prizm-text flex items-center gap-2 mb-4 uppercase tracking-wide">
                <Layers size={14} className="text-prizm-text-muted" /> Array {s.arrayNumber} - String {s.stringNumber} - Event Logs
              </h3>
              {eventLogs.length > 0 ? (
                  <div className="overflow-x-auto no-scrollbar max-h-[300px]">
                        <table className="w-full text-left text-[10px] font-mono whitespace-nowrap">
                           <thead className="bg-black/20 text-prizm-text-muted sticky top-0">
                              <tr>
                                 <th className="p-2 border-b border-prizm-border">Category</th>
                                 <th className="p-2 border-b border-prizm-border">Message</th>
                                 <th className="p-2 border-b border-prizm-border">Timestamp</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-prizm-border/20">
                               {eventLogs.map((e: any, i: number) => (
                                   <tr key={i} className="hover:bg-black/10">
                                       <td className="p-2 text-prizm-text-muted">{e.category || "General"}</td>
                                       <td className="p-2">{e.message || e.text || "Unknown Event"}</td>
                                       <td className="p-2 text-prizm-text-muted">{formatPrizmUtcTimestamp(e.timestamp || s.timestampUtc)}</td>
                                   </tr>
                               ))}
                           </tbody>
                        </table>
                     </div>
              ) : (
                  <div className="flex-1 flex items-center justify-center text-xs font-mono text-prizm-text-muted border border-dashed border-prizm-border/50 rounded bg-black/10 py-12">
                       No event logs available from current local EMS sources.
                  </div>
              )}
          </div>
      </div>
      
      <button
        className="fixed bottom-6 right-6 z-50 bg-prizm-surface-strong text-prizm-primary border border-prizm-primary/50 hover:bg-prizm-primary hover:text-prizm-bg px-4 py-2 rounded-full font-bold shadow-lg shadow-prizm-primary/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer outline-none"
        onClick={() => document.getElementById('string-detail-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <span className="text-xl leading-none">&uarr;</span> TOP
      </button>
    </div>
  );
}
