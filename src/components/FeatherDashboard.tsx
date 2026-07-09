import React, { useState, useEffect, useMemo } from "react";
import { formatFeatherDiagnosticValue } from "../lib/featherErrorFormatter";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  Filter,
  RefreshCw,
  Search,
  Sliders,
  Thermometer,
  Wind,
  Info,
  ChevronRight,
  ChevronLeft,
  Database,
  Grid,
  ShieldCheck,
  Flame,
  DoorOpen,
  Settings
} from "lucide-react";
import { ManualScanConfig } from "../server/feather/featherTypes";
import { FeatherHvacDevice } from "../server/feather/deviceEnrichment";
import { sortByIPv4 } from "../lib/ipUtils";
import { useSiteData } from '../context/SiteDataContext';
import { formatTemperatureF } from "../utils/temperatureScale";
import { normalizeVoltage } from "../lib/voltageNormalizer";
import { getArrayLocalEnergySegmentNumber } from "../lib/segmentNumbering";
import FeatherDetailsView from "./FeatherDetailsView";
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

export default function FeatherDashboard({ active = true }: { active?: boolean }) {
  const { snapshot, activeTopologyProfile, isInitialLoading, refreshNow } = useSiteData();
  
  // Extract feather data locally to maintain backwards compatibility
  const featherData = useMemo(() => {
     if (!snapshot) return null;
     return {
        devices: snapshot.normalized?.feather || [],
        summary: snapshot.rollups?.featherSummary || {},
        cache: snapshot.liveStatus ? {
           lastUpdatedAt: snapshot.liveStatus.lastUpdated,
           isStale: snapshot.liveStatus.state === 'PARTIAL' || snapshot.liveStatus.stale === true
        } : null
     };
  }, [snapshot]);

  // Navigation & Form Selection States
  const [discoverySource, setDiscoverySource] = useState<"topology" | "manual" | "both">("both");
  const [scanMode, setScanMode] = useState<"cidr" | "range" | "shorthand">("shorthand");

  // Form Inputs
  const [cidrInput, setCidrInput] = useState<string>("10.0.1.0/24");
  const [startIpInput, setStartIpInput] = useState<string>("10.0.1.3");
  const [endIpInput, setEndIpInput] = useState<string>("10.0.1.75");
  const [arrayRangeInput, setArrayRangeInput] = useState<string>("1-4");
  const [hostRangeInput, setHostRangeInput] = useState<string>("3,10,15,20");

  // Telemetry list from server
  const [devices, setDevices] = useState<FeatherHvacDevice[]>([]);
  const [concurrency, setConcurrency] = useState<number>(16);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  const [cacheDetails, setCacheDetails] = useState<{
    createdAt: string | null;
    lastUpdatedAt: string | null;
    activeProfileId: string;
    activeProfileName: string;
    activeEmsBaseUrl: string;
    isStale: boolean;
    candidateCount: number;
    rejectedCandidateCount: number;
    total: number;
  }>({
    createdAt: null,
    lastUpdatedAt: null,
    activeProfileId: "",
    activeProfileName: "",
    activeEmsBaseUrl: "",
    isStale: true,
    candidateCount: 0,
    rejectedCandidateCount: 0,
    total: 0
  });

  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(5);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(Date.now());

  // Table Filters
  const [ipSearchParams, setIpSearchParams] = useState<string>("");
  const [entitySearchParams, setEntitySearchParams] = useState<string>("");
  const [reachabilityFilter, setReachabilityFilter] = useState<"all" | "reachable" | "unreachable">("all");
  const [methodFilter, setMethodFilter] = useState<"all" | "string-ip-map" | "ip-map" | "blockviewer" | "manual">("all");
  const [arrayFilter, setArrayFilter] = useState<string>("all");
  const [stringFilter, setStringFilter] = useState<string>("all");
  const [issueFilter, setIssueFilter] = useState<"all" | "warnings" | "alarms" | "any">("all");
  const [hvacFilter, setHvacFilter] = useState<
    "all" |
    "mismatch" |
    "hvac1-mismatch" |
    "hvac2-mismatch" |
    "commanded-no-current" |
    "current-no-command"
  >("all");
  const [ipSortDesc, setIpSortDesc] = useState<boolean>(false);

  // Drawer detail selection
  const [selectedDevice, setSelectedDevice] = useState<FeatherHvacDevice | null>(null);
  const [advancedDrawerShowJson, setAdvancedDrawerShowJson] = useState<boolean>(false);

  // Manual Polling & Sample states for Selected Device
  const [selectedDeviceInterval, setSelectedDeviceInterval] = useState<string>("Pause");
  const [samples, setSamples] = useState<Array<{
    timestamp: string;
    timeLabel: string;
    deviceIp?: string;
    reachable?: boolean;
    hvac1Current: number;
    hvac2Current: number;
    hvac1Rpm: number;
    hvac2Rpm: number;
    spaceTemp: number;
    cellTemp: number;
    hvac1?: any;
    hvac2?: any;
    temperatures?: {
      spaceTempC: number | null;
      cellTempC: number | null;
      supplyAirTempC: number | null;
      returnAirTempC: number | null;
    };
    sensors?: any;
    raw?: any;
  }>>([]);
  const [isPollingDevice, setIsPollingDevice] = useState<boolean>(false);

  // Error/Success Toasts or alerts
  const [alertMessage, setAlertMessage] = useState<{ type: "success" | "error" | "warn"; text: string } | null>(null);

  useEffect(() => {
      if (isInitialLoading) return;
      
      if (featherData) {
          setDevices(featherData.devices);
          setCacheDetails(prev => ({
             ...prev,
             lastUpdatedAt: featherData.cache?.lastUpdatedAt || prev.lastUpdatedAt,
             isStale: featherData.cache?.isStale || false,
             total: featherData.devices.length
          }));
          setLastRefreshTime(Date.now());
      }
      setLoading(false);
      setLoadingStatus("");
  }, [featherData, isInitialLoading]);

  useEffect(() => {
    if (active) {
      const targetIp = localStorage.getItem("prizm_selected_feather_ip");
      const targetArray = localStorage.getItem("prizm_selected_feather_array");
      const targetString = localStorage.getItem("prizm_selected_feather_string");
      if (targetIp) {
        setIpSearchParams(targetIp);
        if (devices && devices.length > 0) {
          const dev = devices.find(d => d.ip === targetIp || d.deviceIp === targetIp);
          if (dev) {
            setSelectedDevice(dev);
          }
        }
        localStorage.removeItem("prizm_selected_feather_ip");
      }
      if (targetArray) {
        setArrayFilter(targetArray);
        localStorage.removeItem("prizm_selected_feather_array");
      }
      if (targetString) {
        setStringFilter(targetString);
        localStorage.removeItem("prizm_selected_feather_string");
      }
    }
  }, [active, devices]);

  // Keep loadCache for manual refresh or background polling fallback if needed
  const loadCache = async (autoDiscoverOnEmpty = false, forceRefresh = false) => {
    try {
      if (forceRefresh) {
         await refreshNow(true);
      }
    } catch (e: any) {
      console.error("Failed to load feather devices cache", e);
    }
  };

  useEffect(() => {
    // Only fetch if interval is enabled and we are actively on the tab
    if (!active || refreshIntervalSec <= 0) return;
    const intervalId = setInterval(() => {
        refreshNow(false);
    }, refreshIntervalSec * 1000);
    return () => clearInterval(intervalId);
  }, [refreshIntervalSec, active, refreshNow]);

// Merges direct poll results into existing enriched device
function mergeFeatherDeviceForDetails(prev: any, incoming: any, fallbackIp: string) {
  if (!prev && !incoming) return null;

  return {
    ...(prev || {}),
    ...(incoming || {}),

    ip: incoming?.ip || prev?.ip || fallbackIp,
    deviceIp: incoming?.deviceIp || prev?.deviceIp || fallbackIp,
    arrayIndex: incoming?.arrayIndex !== undefined && incoming?.arrayIndex !== null ? incoming.arrayIndex : prev?.arrayIndex,
    stringIndex: incoming?.stringIndex !== undefined && incoming?.stringIndex !== null ? incoming.stringIndex : prev?.stringIndex,
    segmentLabel: incoming?.segmentLabel !== undefined && incoming?.segmentLabel !== null ? incoming.segmentLabel : prev?.segmentLabel,
    entityDescription: incoming?.entityDescription !== undefined && incoming?.entityDescription !== null ? incoming.entityDescription : prev?.entityDescription,
    entityKey: incoming?.entityKey !== undefined && incoming?.entityKey !== null ? incoming.entityKey : prev?.entityKey,
    entityKeyToken: incoming?.entityKeyToken !== undefined && incoming?.entityKeyToken !== null ? incoming.entityKeyToken : prev?.entityKeyToken,
    displayKey: incoming?.displayKey !== undefined && incoming?.displayKey !== null ? incoming.displayKey : prev?.displayKey,
    firmwareVersion: incoming?.firmwareVersion !== undefined && incoming?.firmwareVersion !== null ? incoming.firmwareVersion : prev?.firmwareVersion,
    softwareVersion: incoming?.softwareVersion !== undefined && incoming?.softwareVersion !== null ? incoming.softwareVersion : prev?.softwareVersion,
    sourceCoverage: {
      ...(prev?.sourceCoverage || {}),
      ...(incoming?.sourceCoverage || {})
    },
    doorApplicability: {
      ...(prev?.doorApplicability || {}),
      ...(incoming?.doorApplicability || {})
    },
    doors: incoming?.doors !== undefined && incoming?.doors !== null ? incoming.doors : prev?.doors,
    fssSignals: incoming?.fssSignals !== undefined && incoming?.fssSignals !== null ? incoming.fssSignals : prev?.fssSignals,
    hvac1: incoming?.hvac1 !== undefined && incoming?.hvac1 !== null ? incoming.hvac1 : prev?.hvac1,
    hvac2: incoming?.hvac2 !== undefined && incoming?.hvac2 !== null ? incoming.hvac2 : prev?.hvac2,
    raw: {
      ...(prev?.raw || {}),
      directPoll: incoming?.raw || incoming
    }
  };
}

// Extract command vs feedback states for sampling
function getHvacSampleDetails(hvac: any) {
  if (!hvac) return {
    fanLowCommanded: null, fanLowCurrent: null,
    fanHighCommanded: null, fanHighCurrent: null,
    compressorCommanded: null, compressorCurrent: null,
    reversingValveCommanded: null, reversingValveCurrent: null,
    electricHeatCommanded: null, electricHeatCurrent: null,
    currentA: null, fanSpeedRpm: null, mode: null, responding: false
  };

  const hasCmd = !!(hvac.fanLowOn || hvac.fanHighOn || hvac.compressorOn || hvac.electricHeatOn || hvac.reversingValveOn);
  const hasAct = !!((hvac.currentA && hvac.currentA > 0.2) || (hvac.fanSpeedRpm && hvac.fanSpeedRpm > 0));

  return {
    fanLowCommanded: hvac.fanLowOn ?? null,
    fanLowCurrent: hvac.fanLowOn !== undefined && hvac.fanLowOn !== null
      ? (hvac.fanLowOn ? hasAct : (hasAct && !hasCmd))
      : null,

    fanHighCommanded: hvac.fanHighOn ?? null,
    fanHighCurrent: hvac.fanHighOn !== undefined && hvac.fanHighOn !== null
      ? (hvac.fanHighOn ? hasAct : (hasAct && !hasCmd))
      : null,

    compressorCommanded: hvac.compressorOn ?? null,
    compressorCurrent: hvac.compressorOn !== undefined && hvac.compressorOn !== null
      ? (hvac.compressorOn ? (hvac.currentA > 8.0) : (hasAct && !hasCmd))
      : null,

    reversingValveCommanded: hvac.reversingValveOn ?? null,
    reversingValveCurrent: hvac.reversingValveOn !== undefined && hvac.reversingValveOn !== null
      ? (hvac.reversingValveOn ? hasAct : (hasAct && !hasCmd))
      : null,

    electricHeatCommanded: hvac.electricHeatOn ?? null,
    electricHeatCurrent: hvac.electricHeatOn !== undefined && hvac.electricHeatOn !== null
      ? (hvac.electricHeatOn ? hasAct : (hasAct && !hasCmd))
      : null,

    currentA: hvac.currentA ?? null,
    fanSpeedRpm: hvac.fanSpeedRpm ?? null,
    mode: hvac.mode ?? null,
    responding: hvac.dataValid ?? false
  };
}

  // Trigger single device manual poll
  const triggerDevicePoll = async () => {
    if (!selectedDevice || isPollingDevice) return;
    setIsPollingDevice(true);
    try {
      const res = await fetch(`/api/feather/devices/${selectedDevice.ip}/status?source=manual`);
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const data = await res.json();
      if (data.success && data.device) {
        setSelectedDevice(prev => mergeFeatherDeviceForDetails(prev, data.device, selectedDevice.ip || selectedDevice.deviceIp));
        
        const now = new Date();
        const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        const h1 = data.device.hvac1 || {};
        const h2 = data.device.hvac2 || {};
        
        const tSpace = data.device.spaceTemperatureC !== undefined && data.device.spaceTemperatureC !== null
          ? data.device.spaceTemperatureC
          : (data.device.thermal?.spaceTemperature !== undefined && data.device.thermal?.spaceTemperature !== null
              ? data.device.thermal.spaceTemperature
              : null);

        const tCell = data.device.avgCellTemperatureC !== undefined && data.device.avgCellTemperatureC !== null
          ? data.device.avgCellTemperatureC
          : (data.device.temperatureCellC !== undefined && data.device.temperatureCellC !== null
              ? data.device.temperatureCellC
              : (data.device.thermal?.avgCellTemperature !== undefined && data.device.thermal?.avgCellTemperature !== null
                  ? data.device.thermal.avgCellTemperature
                  : null));

        const tSupply = data.device.supplyAirTempC !== undefined && data.device.supplyAirTempC !== null
          ? data.device.supplyAirTempC
          : (data.device.temperatureSupplyC !== undefined && data.device.temperatureSupplyC !== null
              ? data.device.temperatureSupplyC
              : (data.device.thermal?.supplyAirTemp !== undefined && data.device.thermal?.supplyAirTemp !== null
                  ? data.device.thermal.supplyAirTemp
                  : null));

        const tReturn = data.device.returnAirTempC !== undefined && data.device.returnAirTempC !== null
          ? data.device.returnAirTempC
          : (data.device.temperatureReturnC !== undefined && data.device.temperatureReturnC !== null
              ? data.device.temperatureReturnC
              : (data.device.thermal?.returnAirTemp !== undefined && data.device.thermal?.returnAirTemp !== null
                  ? data.device.thermal.returnAirTemp
                  : null));

        const tOutside = data.device.outsideTemperatureC !== undefined && data.device.outsideTemperatureC !== null
          ? data.device.outsideTemperatureC
          : (data.device.thermal?.outsideTemperature !== undefined && data.device.thermal?.outsideTemperature !== null
              ? data.device.thermal.outsideTemperature
              : null);

        const toF = (c: number | null) => {
          if (c === null || c === undefined) return null;
          return c * 1.8 + 32;
        };

        const getSourceDebug = (val: any, fieldName: string) => {
          if (val !== undefined && val !== null) return fieldName;
          return null;
        };

        const spaceSource = getSourceDebug(data.device.spaceTemperatureC, "device.spaceTemperatureC") ||
                            getSourceDebug(data.device.thermal?.spaceTemperature, "thermal.spaceTemperature") || "missing";

        const cellSource = getSourceDebug(data.device.avgCellTemperatureC, "device.avgCellTemperatureC") ||
                           getSourceDebug(data.device.temperatureCellC, "device.temperatureCellC") ||
                           getSourceDebug(data.device.thermal?.avgCellTemperature, "thermal.avgCellTemperature") || "missing";

        const supplySource = getSourceDebug(data.device.supplyAirTempC, "device.supplyAirTempC") ||
                             getSourceDebug(data.device.temperatureSupplyC, "device.temperatureSupplyC") ||
                             getSourceDebug(data.device.thermal?.supplyAirTemp, "thermal.supplyAirTemp") || "missing";

        const returnSource = getSourceDebug(data.device.returnAirTempC, "device.returnAirTempC") ||
                             getSourceDebug(data.device.temperatureReturnC, "device.temperatureReturnC") ||
                             getSourceDebug(data.device.thermal?.returnAirTemp, "thermal.returnAirTemp") || "missing";

        const outsideSource = getSourceDebug(data.device.outsideTemperatureC, "device.outsideTemperatureC") ||
                              getSourceDebug(data.device.thermal?.outsideTemperature, "thermal.outsideTemperature") || "missing";

        const rawThermalKeys = data.device.thermal ? Object.keys(data.device.thermal) : [];
         
        const newSample = {
          timestamp: now.toISOString(),
          timeLabel,
          deviceIp: data.device.ip || data.device.deviceIp || selectedDevice.ip,
          reachable: !!data.device.reachable,
          hvac1Current: h1.currentA ?? 0,
          hvac2Current: h2.currentA ?? 0,
          hvac1Rpm: h1.fanSpeedRpm ?? 0,
          hvac2Rpm: h2.fanSpeedRpm ?? 0,
          spaceTemp: toF(tSpace),
          cellTemp: toF(tCell),
          supplyTemp: toF(tSupply),
          returnTemp: toF(tReturn),
          outsideTemp: toF(tOutside),
          hvac1: getHvacSampleDetails(data.device.hvac1),
          hvac2: getHvacSampleDetails(data.device.hvac2),
          temperatures: {
            spaceTempC: tSpace,
            cellTempC: tCell,
            supplyAirTempC: tSupply,
            returnAirTempC: tReturn,
            outsideTempC: tOutside,
            raw: data.device.thermal || null
          },
          temperatureSourceDebug: {
            spaceTempCSource: spaceSource,
            cellTempCSource: cellSource,
            supplyAirTempCSource: supplySource,
            returnAirTempCSource: returnSource,
            outsideTempCSource: outsideSource,
            rawThermalKeys
          },
          sensors: {
            doors: data.device.doors ?? null,
            fssSignals: data.device.fssSignals ?? null
          },
          raw: data.device.raw ?? null
        };
        
        setSamples(prev => {
          const next = [...prev, newSample];
          if (next.length > 300) return next.slice(-300);
          return next;
        });
      }
    } catch (err: any) {
      console.error("Single device poll failed:", err);
      setAlertMessage({ type: "error", text: `Manual Poll failed for ${selectedDevice.ip}: ${err.message || err}` });
    } finally {
      setIsPollingDevice(false);
    }
  };

  // Reset samples and interval when device changes
  useEffect(() => {
    setSamples([]);
    setIsPollingDevice(false);
    setSelectedDeviceInterval("Pause");
  }, [selectedDevice?.ip]);

  // Polling effect for selected device
  useEffect(() => {
    if (!selectedDevice || selectedDeviceInterval === "Pause") return;
    
    const intervalMs = parseInt(selectedDeviceInterval, 10);
    if (isNaN(intervalMs) || intervalMs <= 0) return;
    
    // First, do an immediate poll if we have no samples yet
    if (samples.length === 0) {
      triggerDevicePoll();
    }
    
    const timer = setInterval(() => {
      triggerDevicePoll();
    }, intervalMs);
    
    return () => clearInterval(timer);
  }, [selectedDevice?.ip, selectedDeviceInterval, samples.length]);

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

  const canHavePairedStrings = (device: any): boolean => {
    const resolved = resolveFeatherSegment(device);
    return resolved.segmentType === "ES";
  };

  // Map strings associated with this feather / ES
  const pairedStrings = useMemo(() => {
    if (!selectedDevice || !snapshot?.normalized?.strings) return [];
    if (!canHavePairedStrings(selectedDevice)) return [];
    
    const arrayNum = selectedDevice.arrayIndex;
    if (arrayNum === undefined) return [];
    
    const stringsInArray = snapshot.normalized.strings.filter((s: any) => {
      const aNum = s.arrayNumber !== undefined ? s.arrayNumber : s.arrayIndex;
      return Number(aNum) === Number(arrayNum);
    });
    
    const energySegmentIndex = getEnergySegmentIndex(selectedDevice);
    if (energySegmentIndex === null) return [];
    
    const strA = (energySegmentIndex - 1) * 2 + 1;
    const strB = strA + 1;
    
    return stringsInArray.filter((s: any) => {
      const sNum = s.stringNumber !== undefined ? s.stringNumber : s.stringIndex;
      if (sNum === undefined || sNum === null) return false;
      const num = Number(sNum);
      return num === strA || num === strB;
    });
  }, [selectedDevice, snapshot?.normalized?.strings]);

  const pairedStringDebug = useMemo(() => {
    if (!selectedDevice) return null;
    const arrayNum = selectedDevice.arrayIndex;
    const resolved = resolveFeatherSegment(selectedDevice);
    const energySegmentIndex = resolved.segmentType === "ES" ? resolved.segmentIndex : null;
    const strA = energySegmentIndex ? (energySegmentIndex * 2 - 1) : null;
    const strB = energySegmentIndex ? (energySegmentIndex * 2) : null;
    const allStrings = snapshot?.normalized?.strings || [];
    const sampleString = allStrings[0] || {};
    
    return {
      selectedIp: selectedDevice.ip,
      selectedArray: arrayNum,
      selectedSegmentLabel: selectedDevice.segmentLabel,
      resolvedSegmentType: resolved.segmentType,
      resolvedSegmentIndex: resolved.segmentIndex,
      displayLabel: resolved.displayLabel,
      expectedStrings: strA && strB ? [`A${arrayNum}-S${strA}`, `A${arrayNum}-S${strB}`] : [],
      normalizedStringCount: allStrings.length,
      matchingRowsFound: pairedStrings.length,
      availableStringFieldNamesSample: Object.keys(sampleString)
    };
  }, [selectedDevice, snapshot?.normalized?.strings, pairedStrings]);

  // HVAC mismatch logic helper
  const detectHvacMismatch = (device: any) => {
    const hvac1 = device.hvac1 || {};
    const hvac2 = device.hvac2 || {};
    
    const hvac1Cmd = !!(hvac1.fanLowOn || hvac1.fanHighOn || hvac1.compressorOn || hvac1.electricHeatOn);
    const hvac1Act = !!((hvac1.currentA && hvac1.currentA > 0.2) || (hvac1.fanSpeedRpm && hvac1.fanSpeedRpm > 0));
    
    const hvac2Cmd = !!(hvac2.fanLowOn || hvac2.fanHighOn || hvac2.compressorOn || hvac2.electricHeatOn);
    const hvac2Act = !!((hvac2.currentA && hvac2.currentA > 0.2) || (hvac2.fanSpeedRpm && hvac2.fanSpeedRpm > 0));
    
    let mismatchType: "none" | "commanded_not_active" | "active_not_commanded" = "none";
    let description = "";
    
    if ((hvac1Cmd && !hvac1Act) || (hvac2Cmd && !hvac2Act)) {
      mismatchType = "commanded_not_active";
      description = "HVAC commanded but no active current/RPM feedback detected.";
    } else if ((!hvac1Cmd && hvac1Act) || (!hvac2Cmd && hvac2Act)) {
      mismatchType = "active_not_commanded";
      description = "HVAC active feedback detected without any command.";
    }
    
    return {
      isMismatched: mismatchType !== "none",
      mismatchType,
      description
    };
  };

  const getSingleHvacMismatchState = (hvac: any) => {
    const unit = hvac || {};
    const commanded = !!(
      unit.fanLowOn ||
      unit.fanHighOn ||
      unit.compressorOn ||
      unit.electricHeatOn ||
      unit.reversingValveOn
    );

    const active = !!(
      (Number(unit.currentA || 0) > 0.2) ||
      (Number(unit.fanSpeedRpm || 0) > 0)
    );

    let mismatchType: "none" | "commanded_not_active" | "active_not_commanded" = "none";

    if (commanded && !active) mismatchType = "commanded_not_active";
    else if (!commanded && active) mismatchType = "active_not_commanded";

    return {
      commanded,
      active,
      isMismatched: mismatchType !== "none",
      mismatchType
    };
  };

  const deviceMatchesHvacFilter = (device: any): boolean => {
    if (hvacFilter === "all") return true;

    const hvac1 = getSingleHvacMismatchState(device?.hvac1);
    const hvac2 = getSingleHvacMismatchState(device?.hvac2);

    if (hvacFilter === "mismatch") {
      return hvac1.isMismatched || hvac2.isMismatched;
    }

    if (hvacFilter === "hvac1-mismatch") {
      return hvac1.isMismatched;
    }

    if (hvacFilter === "hvac2-mismatch") {
      return hvac2.isMismatched;
    }

    if (hvacFilter === "commanded-no-current") {
      return hvac1.mismatchType === "commanded_not_active" || hvac2.mismatchType === "commanded_not_active";
    }

    if (hvacFilter === "current-no-command") {
      return hvac1.mismatchType === "active_not_commanded" || hvac2.mismatchType === "active_not_commanded";
    }

    return true;
  };

  // Utility to calculate target count preview
  const getTargetCountPreview = (): { count: number; isValid: boolean; warningMsg: string | null } => {
    if (scanMode === "cidr") {
      const match = cidrInput.trim().match(/\/(\d{1,2})$/);
      if (!match) return { count: 0, isValid: false, warningMsg: "Invalid CIDR format (must be x.x.x.x/mask)" };
      const mask = parseInt(match[1], 10);
      if (isNaN(mask) || mask < 0 || mask > 32) return { count: 0, isValid: false, warningMsg: "Mask must be between 0 and 32" };
      const size = Math.pow(2, 32 - mask);
      if (size > 512) {
        return { count: size, isValid: false, warningMsg: "Target block exceeds FEATHER_MAX_SCAN_TARGETS limit (512)" };
      }
      return { count: size, isValid: true, warningMsg: null };
    }

    if (scanMode === "range") {
      const lToLong = (ip: string): number | null => {
        const parts = ip.split(".").map(Number);
        if (parts.length !== 4 || parts.some(isNaN)) return null;
        return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
      };
      const sLong = lToLong(startIpInput);
      const eLong = lToLong(endIpInput);
      if (sLong === null || eLong === null) return { count: 0, isValid: false, warningMsg: "Invalid Start or End IP boundary expression" };
      const size = Math.abs(eLong - sLong) + 1;
      if (size > 512) {
        return { count: size, isValid: false, warningMsg: "Target IP scope exceeds maximum limit (512)" };
      }
      return { count: size, isValid: true, warningMsg: null };
    }

    if (scanMode === "shorthand") {
      const parseRange = (str: string): number[] => {
        const out: number[] = [];
        str.split(",").forEach(part => {
          const trimmed = part.trim();
          if (!trimmed) return;
          if (trimmed.includes("-")) {
            const bounds = trimmed.split("-").map(s => parseInt(s.trim(), 10));
            if (bounds.length === 2 && !isNaN(bounds[0]) && !isNaN(bounds[1])) {
              const mi = Math.min(bounds[0], bounds[1]);
              const ma = Math.max(bounds[0], bounds[1]);
              for (let i = mi; i <= ma; i++) out.push(i);
            }
          } else {
            const v = parseInt(trimmed, 10);
            if (!isNaN(v)) out.push(v);
          }
        });
        return out;
      };

      try {
        const arrs = parseRange(arrayRangeInput).length;
        const hosts = parseRange(hostRangeInput).length;
        const total = arrs * hosts;
        if (total > 512) {
          return { count: total, isValid: false, warningMsg: "Total shorthand combinations exceed limit (512)" };
        }
        if (total === 0) return { count: 0, isValid: false, warningMsg: "Provide valid comma-divided arrays and hosts ranges" };
        return { count: total, isValid: true, warningMsg: null };
      } catch (e) {
        return { count: 0, isValid: false, warningMsg: "Failed to parse range inputs" };
      }
    }

    return { count: 0, isValid: false, warningMsg: null };
  };

  const preview = getTargetCountPreview();

  // 1. Discover from topology
  const runTopologyDiscovery = async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadingStatus("Exploring site LAN topology charts and pinging candidate controller interfaces...");
      setAlertMessage(null);
    }
    try {
      const res = await fetch(silent ? "/api/feather/devices?refresh=true" : "/api/feather/discover", { method: silent ? "GET" : "POST" });
      const data = await res.json();
      if (res.ok) {
        setDevices(prev => {
             const map = new Map((prev || []).map(d => [d.ip, d]));
             (data.devices || []).forEach((d: FeatherHvacDevice) => {
                  map.set(d.ip, d);
             });
             return Array.from(map.values());
        });
        setCacheDetails({
          createdAt: data.createdAt || data.generatedAt,
          lastUpdatedAt: data.lastUpdatedAt || data.scanCompletedAt || data.generatedAt,
          activeProfileId: data.activeProfileId || data.profileId,
          activeProfileName: data.activeProfileName || "Active Profile",
          activeEmsBaseUrl: data.activeEmsBaseUrl || data.emsBaseUrl,
          isStale: !!data.isStale,
          candidateCount: data.count || data.candidateCount || 0,
          rejectedCandidateCount: data.rejectedCount || data.rejectedCandidateCount || 0,
          total: data.devices?.length || data.total || 0
        });
        if (!silent) {
          setAlertMessage({
            type: "success",
            text: `Successfully discovered and polled ${data.count || data.devices?.length || 0} candidate devices from active EMS maps.`
          });
        }
      } else {
        if (!silent) setAlertMessage({ type: "error", text: data.error || "Topology discovery failed." });
      }
    } catch (e: any) {
      if (!silent) setAlertMessage({ type: "error", text: e.message || String(e) });
    } finally {
      if (!silent) {
        setLoading(false);
        setLoadingStatus("");
        setLastRefreshTime(Date.now());
      }
    }
  };

  // 2. Run Manual Scan Range
  const runManualScan = async () => {
    if (!preview.isValid) {
      setAlertMessage({ type: "error", text: preview.warningMsg || "Please fix manual scan input form errors." });
      return;
    }

    setLoading(true);
    setLoadingStatus(`Polling ${preview.count} sequence IPs on TCP socket Port 8080. Please stand by...`);
    setAlertMessage(null);

    const config: ManualScanConfig = {};
    if (scanMode === "cidr") config.cidr = cidrInput;
    else if (scanMode === "range") {
      config.startIp = startIpInput;
      config.endIp = endIpInput;
    } else if (scanMode === "shorthand") {
      config.arrayRanges = arrayRangeInput;
      config.hostRanges = hostRangeInput;
    }

    try {
      const res = await fetch("/api/feather/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await loadCache();
        let txt = `Completed scan block. ${data.count} port nodes logged.`;
        if (data.warnings && data.warnings.length > 0) {
          txt += ` (Security Watch: ${data.warnings[0]})`;
        }
        setAlertMessage({ type: "success", text: txt });
      } else {
        setAlertMessage({ type: "error", text: data.error || "Manual network scan failed." });
      }
    } catch (e: any) {
      setAlertMessage({ type: "error", text: e.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  // 3. Refresh a single device in real-time
  const refreshSingleDevice = async (ip: string, source: string) => {
    setLoading(true);
    setLoadingStatus(`Refreshing direct status telemetry for ${ip}...`);
    try {
      const res = await fetch(`/api/feather/devices/${ip}/status?source=${source}`);
      if (res.ok) {
        await loadCache();
        const data = await res.json();
        if (data.success) {
          // Update details drawer if currently open
          if (selectedDevice && selectedDevice.ip === ip) {
            setSelectedDevice(data.device);
          }
          setAlertMessage({ type: "success", text: `Refreshed telemetry for ${ip} successfully.` });
        }
      } else {
        setAlertMessage({ type: "error", text: `Failed to fetch device status for ${ip}` });
      }
    } catch (e: any) {
      setAlertMessage({ type: "error", text: e.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  // 4. Refresh selected / all devices currently in table view
  const refreshSelectedTable = async (ipsToRefresh: string[]) => {
    if (ipsToRefresh.length === 0) {
      setAlertMessage({ type: "warn", text: "No filtered devices to refresh." });
      return;
    }
    setLoading(true);
    setLoadingStatus(`Re-pinging ${ipsToRefresh.length} selected table nodes concurrently...`);
    try {
      const res = await fetch("/api/feather/devices/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceIps: ipsToRefresh })
      });
      if (res.ok) {
        await loadCache();
        setAlertMessage({ type: "success", text: `Successfully updated bulk status for ${ipsToRefresh.length} nodes.` });
      } else {
        setAlertMessage({ type: "error", text: "Failed to perform bulk refresh." });
      }
    } catch (e: any) {
      setAlertMessage({ type: "error", text: e.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  // 5. Clear cache
  const triggerClearCache = async () => {
    try {
      const res = await fetch("/api/feather/clear-cache", { method: "POST" });
      if (res.ok) {
        setDevices([]);
        setCacheDetails(prev => ({ ...prev, createdAt: null, lastUpdatedAt: null }));
        setAlertMessage({ type: "success", text: "In-memory Feather diagnostics cache flushed successfully." });
      }
    } catch (e: any) {
      setAlertMessage({ type: "error", text: e.message || "Failed to flush cache." });
    }
  };

  // 6. Exporters
  const exportNormalizedCSV = () => {
    if (filteredDevices.length === 0) {
      setAlertMessage({ type: "warn", text: "No rows available to export." });
      return;
    }

    const headers = [
      "Device IP",
      "Comm State",
      "Discovery Source",
      "Array",
      "String",
      "Entity Name",
      "Duration (ms)",
      "Firmware",
      "Warnings Count",
      "Alarms Count",
      "Operational State",
      "Space Temp (C)",
      "Cell Temp (C)",
      "Supply Air Temp (C)",
      "Hydrogen Gas (PPM)",
      "Lost Comms Log"
    ];

    const rows = filteredDevices.map(d => [
      d.ip,
      d.reachable ? "ONLINE" : "OFFLINE",
      d.discoveryMethod,
      d.arrayIndex || "N/A",
      d.stringIndex || "N/A",
      d.entityDescription ?? "Unknown Node",
      (d.pingMs || 0),
      d.firmwareVersion || "N/A",
      d.warningCount,
      d.alarmCount,
      (d.reachable ? (d.alarmCount ? 'ALARM' : d.warningCount ? 'WARNING' : 'NORMAL') : (d.sourceCoverage?.directFeather ? 'OFFLINE' : 'Not reporting')),
      d.temperatureSupplyC || "N/A",
      d.temperatureCellC || "N/A",
      d.supplyAirTemp || "N/A",
      (d.raw?.directFeather as any)?.hydrogen1PPM || "N/A",
      (d.raw?.directFeather as any)?.lostComms ?? "none"
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `PRIZM_Feather_Report_${cacheDetails.activeProfileId || "active"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportFullJSON = () => {
    if (devices.length === 0) {
      setAlertMessage({ type: "warn", text: "No cache data to export." });
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(devices, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `PRIZM_Feather_FullCache_${cacheDetails.activeProfileId || "active"}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
  };

  // Filter computation
  const filteredDevices = devices.filter(d => {
    // 1. IP search
    if (ipSearchParams && !d.ip.includes(ipSearchParams.trim())) return false;

    // 2. Entity search
    if (entitySearchParams) {
      const searchLower = entitySearchParams.toLowerCase();
      const matchName = d.entityDescription?.toLowerCase().includes(searchLower);
      const matchToken = d.entityKeyToken?.toLowerCase().includes(searchLower);
      const matchFw = d.firmwareVersion?.toLowerCase().includes(searchLower);
      if (!matchName && !matchToken && !matchFw) return false;
    }

    // 3. Reachability
    if (reachabilityFilter === "reachable" && !d.reachable) return false;
    if (reachabilityFilter === "unreachable" && d.reachable) return false;

    // 4. Source discovery method
    if (methodFilter !== "all" && d.discoveryMethod !== methodFilter) return false;

    // 5. Array filter
    if (arrayFilter !== "all") {
      if (d.arrayIndex !== parseInt(arrayFilter, 10)) return false;
    }

    // 6. String filter
    if (stringFilter !== "all") {
      if (d.stringIndex !== parseInt(stringFilter, 10)) return false;
    }

    // 7. Issue checklist
    if (issueFilter === "warnings" && d.warningCount === 0) return false;
    if (issueFilter === "alarms" && d.alarmCount === 0) return false;
    if (issueFilter === "any" && d.warningCount === 0 && d.alarmCount === 0) return false;

    // 8. HVAC command/feedback mismatch filter
    if (!deviceMatchesHvacFilter(d)) return false;

    // 9. Discovery Controls overall selection
    if (discoverySource === "topology" && d.discoveryMethod === "manual") return false;
    if (discoverySource === "manual" && d.discoveryMethod !== "manual") return false;

    return true;
  });

  // Compact HVAC rendering for Main Table
  const renderHvacCompact = (hvac: any, hvacId: string) => {
    if (!hvac) return <span className="text-prizm-text-muted">--</span>;
    
    const relays = [
      { key: "fanLowOn", label: "FanL" },
      { key: "fanHighOn", label: "FanH" },
      { key: "compressorOn", label: "Comp" },
      { key: "reversingValveOn", label: "Rev.V" },
      { key: "electricHeatOn", label: "HT" }
    ];
    
    return (
      <div className="flex flex-col gap-1 text-[10px]">
        <div className="flex items-center gap-1">
          {relays.map(r => {
            const val = hvac[r.key];
            if (val === undefined || val === null) {
              return <span key={r.key} className="text-prizm-text-muted">--</span>;
            }
            return (
              <span
                key={r.key}
                title={`${r.label}: ${val ? "Commanded ON" : "Commanded OFF"}`}
                className={`px-1 rounded text-[9px] font-bold ${
                  val 
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" 
                    : "bg-black/20 text-prizm-text-muted/40 border border-prizm-border/10"
                }`}
              >
                {r.label}
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-[9px] text-prizm-text-muted font-medium">
          <span>{(hvac.currentA || 0).toFixed(1)}A</span>
          <span>•</span>
          <span>{hvac.fanSpeedRpm || 0} RPM</span>
        </div>
      </div>
    );
  };

  // Mismatch badge indicator
  const renderHvacMismatchBadge = (d: any) => {
    const mismatch1 = detectHvacMismatch({ hvac1: d.hvac1 });
    const mismatch2 = detectHvacMismatch({ hvac2: d.hvac2 });
    
    if (mismatch1.isMismatched || mismatch2.isMismatched) {
      return (
        <span 
          title={`${mismatch1.isMismatched ? "HVAC1: " + mismatch1.description : ""} ${mismatch2.isMismatched ? "HVAC2: " + mismatch2.description : ""}`}
          className="px-1 py-0.5 bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/20 rounded font-bold text-[8px] animate-pulse whitespace-nowrap"
        >
          ⚠️ MISMATCH
        </span>
      );
    }
    return null;
  };

  const getSensorBadgeState = (d: any, type: 'FSS' | 'LeakDet' | 'TopCap' | 'BattDoor' | 'AcDoor' | 'DcDoor') => {
    const fss = d.fssSignals;
    const doors = d.doors;

    if (type === 'FSS') {
      if (!fss || fss.valid === false) return 'unavailable';
      const problem = !!(
        fss.fssAlarm ||
        fss.fssTrouble ||
        fss.fssAlarmOrTrouble ||
        fss.fireAlarm ||
        fss.fireTrouble ||
        fss.smokeAlarm ||
        fss.smokeAlarmTrouble ||
        fss.heatSensor ||
        fss.hydrogenAlarm ||
        fss.hydrogenFault ||
        fss.statXRelease
      );
      return problem ? 'problem' : 'normal';
    }

    if (type === 'LeakDet') {
      if (!fss) return 'unavailable';
      if (fss.leakAlarm === true) return 'problem';
      if (fss.leakAlarm === false) return 'normal';
      return 'unavailable';
    }

    if (type === 'TopCap') {
      if (d.doorApplicability?.monitorsTopCap === false) return 'hidden';
      if (!doors) return 'unavailable';
      if (doors.lowerTopcapClosed === true) return 'normal';
      if (doors.lowerTopcapClosed === false) return 'problem';
      return 'unavailable';
    }

    if (type === 'BattDoor') {
      if (d.doorApplicability?.monitorsBatteryDoors !== true) return 'hidden';
      if (!doors) return 'unavailable';
      if (doors.batteryDoorsClosed === true) return 'normal';
      if (doors.batteryDoorsClosed === false) return 'problem';
      return 'unavailable';
    }

    if (type === 'AcDoor') {
      if (d.doorApplicability?.monitorsAcDoors !== true) return 'hidden';
      if (!doors) return 'unavailable';
      if (doors.acDoorsClosed === true) return 'normal';
      if (doors.acDoorsClosed === false) return 'problem';
      return 'unavailable';
    }

    if (type === 'DcDoor') {
      if (d.doorApplicability?.monitorsDcDoors !== true) return 'hidden';
      if (!doors) return 'unavailable';
      if (doors.dcDoorsClosed === true) return 'normal';
      if (doors.dcDoorsClosed === false) return 'problem';
      return 'unavailable';
    }

    return 'unavailable';
  };

  // Compact sensor status badges
  const renderSensorsCompact = (d: any) => {
    const types: ('FSS' | 'LeakDet' | 'TopCap' | 'BattDoor' | 'AcDoor' | 'DcDoor')[] = [
      'FSS', 'LeakDet', 'TopCap', 'BattDoor', 'AcDoor', 'DcDoor'
    ];

    return (
      <div className="flex flex-wrap items-center gap-1 text-[9px]">
        {types.map(t => {
          const state = getSensorBadgeState(d, t);
          if (state === 'hidden') return null;

          let colorClass = "bg-zinc-800/50 text-zinc-500 border border-zinc-700/30";
          if (state === 'normal') {
            colorClass = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
          } else if (state === 'problem') {
            colorClass = "bg-rose-500/10 text-rose-500 border border-rose-500/20";
          }

          return (
            <span
              key={t}
              className={`px-1 py-0.5 rounded font-bold uppercase tracking-wider text-[8px] border ${colorClass}`}
              title={`${t}: State is ${state}`}
            >
              {t}
            </span>
          );
        })}
      </div>
    );
  };

  const sortedDevices = sortByIPv4<FeatherHvacDevice>(filteredDevices, d => d.ip, ipSortDesc ? "desc" : "asc");

  // Derived Statistics Cards
  const stats = {
    total: filteredDevices.length,
    reachable: filteredDevices.filter(d => d.reachable).length,
    unreachable: filteredDevices.filter(d => !d.reachable).length,
    warnings: filteredDevices.filter(d => d.warningCount > 0).length,
    alarms: filteredDevices.filter(d => d.alarmCount > 0).length,
    avgDuration: filteredDevices.filter(d => d.reachable).reduce((acc, current) => acc + (current.pingMs || 0), 0) / 
                 (filteredDevices.filter(d => d.reachable).length || 1)
  };

  if (selectedDevice) {
    return (
      <FeatherDetailsView
        selectedDevice={selectedDevice}
        activeTopologyProfile={activeTopologyProfile}
        onBack={() => setSelectedDevice(null)}
        triggerDevicePoll={triggerDevicePoll}
        isPollingDevice={isPollingDevice}
        selectedDeviceInterval={selectedDeviceInterval}
        setSelectedDeviceInterval={setSelectedDeviceInterval}
        samples={samples}
        setSamples={setSamples}
        pairedStrings={pairedStrings}
        pairedStringDebug={pairedStringDebug}
        detectHvacMismatch={detectHvacMismatch}
      />
    );
  }

  return (
    <div className="space-y-6 w-full animate-fade-in text-[#D1D5DB]">
      
      {/* DISCOVERY CONTROLS MOVED TO EMS HEALTH TAB */}
      {/* LOADING STATUS OR ALERTS NOTIFIER */}
      {loading && (
        <div className="bg-prizm-info/10 border border-prizm-primary rounded-lg p-4 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3 font-mono text-xs text-prizm-primary">
            <RefreshCw className="animate-spin text-prizm-primary" size={16} />
            <div>
              <span className="font-bold uppercase tracking-wider block">Scanning Network Subnets</span>
              <p className="text-[11px] text-prizm-text-muted">{loadingStatus}</p>
            </div>
          </div>
        </div>
      )}

      {alertMessage && (
        <div className={`border rounded-lg p-4 flex items-center justify-between ${
          alertMessage.type === "success" 
            ? "bg-green-500/10 border-green-500/25 text-prizm-primary" 
            : alertMessage.type === "error" 
            ? "bg-prizm-danger/10 border-prizm-danger/20 text-prizm-danger" 
            : "bg-prizm-warning/10 border-prizm-warning/20 text-prizm-warning"
        }`}>
          <div className="flex items-center gap-2.5 font-mono text-xs">
            {alertMessage.type === "success" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            <span>{alertMessage.text}</span>
          </div>
          <button onClick={() => setAlertMessage(null)} className="text-[10px] font-black font-mono cursor-pointer uppercase opacity-40 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* 2. SUMMARY TELEMETRY CARDS & LIVE REFRESH CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-prizm-surface border border-prizm-border rounded-lg p-3 font-mono text-xs">
        <div className="flex items-center gap-4">
          <RefreshCw className={`text-prizm-primary ${refreshIntervalSec > 0 ? "animate-spin" : ""}`} size={16} />
          <div>
             <span className="block font-bold">LIVE TELEMETRY POLLING</span>
             <span className="block text-[10px] text-prizm-text-muted">
                {refreshIntervalSec > 0 ? `Active - Auto Refreshing every ${refreshIntervalSec}s (Targeting Direct Feather nodes)` : "Paused. System idle."}
             </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 md:mt-0">
          <span className="text-[9px] uppercase tracking-wider text-prizm-text-muted">Interval:</span>
          <div className="flex bg-prizm-surface-strong p-1 rounded border border-prizm-border text-[10px]">
             {[0, 2, 5, 10, 30].map(val => (
               <button
                  key={val}
                  onClick={() => setRefreshIntervalSec(val)}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    refreshIntervalSec === val ? "bg-prizm-warning text-prizm-warning" : "text-prizm-text-muted hover:text-prizm-text"
                  }`}
               >
                 {val === 0 ? "PAUSED" : `${val}s`}
               </button>
             ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 font-mono text-[11px]">
        {[
          { label: "IP Candidates", val: cacheDetails.candidateCount > 0 ? cacheDetails.candidateCount : stats.total, color: "text-prizm-text", extra: cacheDetails.rejectedCandidateCount > 0 ? `${cacheDetails.rejectedCandidateCount} rejected` : "" },
          { label: "Reachable Nodes", val: stats.reachable, color: "text-prizm-primary" , extra: `${stats.unreachable} offline` },
          { label: "Avg Latency", val: stats.avgDuration > 0 ? `${stats.avgDuration.toFixed(0)} ms` : "0 ms", color: "text-prizm-primary" },
          { label: "Warnings Active", val: stats.warnings, color: stats.warnings > 0 ? "text-prizm-warning font-black bg-prizm-warning/10 rounded px-1.5 inline-block py-0.2" : "text-prizm-text-muted" },
          { label: "TRIPS / ALARMS", val: stats.alarms, color: stats.alarms > 0 ? "text-prizm-danger font-extrabold bg-prizm-danger/10 rounded px-1.5 inline-block py-0.5 animate-pulse" : "text-prizm-text-muted" },
          { label: "Last Scan Log", val: cacheDetails.lastUpdatedAt ? cacheDetails.lastUpdatedAt.slice(11, 19) : "Never", color: "text-prizm-text-muted", extra: "UTC Telemetry" }
        ].map((c, i) => (
          <div key={i} className="bg-prizm-surface border border-prizm-border p-3.5 rounded-lg flex flex-col justify-between">
            <span className="text-prizm-text-muted uppercase text-[9px] tracking-widest">{c.label}</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-xl font-light ${c.color}`}>{c.val}</span>
              {c.extra && <span className="text-[8px] text-prizm-text-muted block font-normal">{c.extra}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* 3. DEVICE GRID TABLE & FILTER ROW */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-4">
        
        {/* Sub-Filters Grid */}
        <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center justify-between border-b border-prizm-border pb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2 w-full font-mono text-[10px]">
            
            {/* IP search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 text-prizm-text-muted w-3 h-3" />
              <input
                type="text"
                placeholder="Search IP address..."
                value={ipSearchParams}
                onChange={e => setIpSearchParams(e.target.value)}
                className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-7 py-1.5 text-xs text-prizm-text focus:outline-none"
              />
            </div>

            {/* Entity/Fw search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 text-prizm-text-muted w-3 h-3" />
              <input
                type="text"
                value={entitySearchParams}
                onChange={e => setEntitySearchParams(e.target.value)}
                placeholder="Search name or firmware..."
                className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-7 py-1.5 text-xs text-prizm-text focus:outline-none"
              />
            </div>

            {/* Reachability drop */}
            <select
              value={reachabilityFilter}
              onChange={e => setReachabilityFilter(e.target.value as any)}
              className="bg-prizm-surface-strong border border-prizm-border rounded px-2 py-1.5 text-xs text-prizm-text focus:outline-none"
            >
              <option value="all">Status: All</option>
              <option value="reachable">Reachable (Live)</option>
              <option value="unreachable">Unreachable (Offline)</option>
            </select>

            {/* Discovery source filtration */}
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value as any)}
              className="bg-prizm-surface-strong border border-prizm-border rounded px-2 py-1.5 text-xs text-prizm-text focus:outline-none"
            >
              <option value="all">Discovery: All</option>
              <option value="string-ip-map">String IP Map</option>
              <option value="ip-map">IP Map</option>
              <option value="blockviewer">BlockViewer</option>
              <option value="manual">Manual Scanned</option>
            </select>

            {/* Array & String values mappings */}
            <select
              value={arrayFilter}
              onChange={e => setArrayFilter(e.target.value)}
              className="bg-prizm-surface-strong border border-prizm-border rounded px-2 py-1.5 text-xs text-prizm-text focus:outline-none"
            >
              <option value="all">Array: All</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(a => (
                <option key={a} value={a}>Array {a}</option>
              ))}
            </select>

            <select
              value={issueFilter}
              onChange={e => setIssueFilter(e.target.value as any)}
              className="bg-prizm-surface-strong border border-prizm-border rounded px-2 py-1.5 text-xs text-prizm-warning focus:outline-none"
            >
              <option value="all" className="text-prizm-text">Issues: All</option>
              <option value="warnings" className="text-prizm-warning">Warnings Active</option>
              <option value="alarms" className="text-prizm-danger">TRIPS / Alarms Active</option>
              <option value="any" className="text-orange-400">Any Faults Present</option>
            </select>

            <select
              value={hvacFilter}
              onChange={e => setHvacFilter(e.target.value as any)}
              className="bg-prizm-surface-strong border border-prizm-border rounded px-2 py-1.5 text-xs text-prizm-primary focus:outline-none"
            >
              <option value="all" className="text-prizm-text">HVAC: All</option>
              <option value="mismatch" className="text-prizm-warning">HVAC: Any Mismatch</option>
              <option value="hvac1-mismatch" className="text-prizm-warning">HVAC 1 Mismatch</option>
              <option value="hvac2-mismatch" className="text-prizm-warning">HVAC 2 Mismatch</option>
              <option value="commanded-no-current" className="text-prizm-danger">Commanded / No Current</option>
              <option value="current-no-command" className="text-prizm-danger">Current / No Command</option>
            </select>

          </div>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={exportNormalizedCSV}
              className="px-3 py-1.5 border border-prizm-border hover:border-prizm-border hover:bg-black/5 rounded text-prizm-text font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={11} />
              Export CSV
            </button>
            <button
              onClick={exportFullJSON}
              className="px-3 py-1.5 border border-prizm-border hover:border-prizm-border hover:bg-black/5 rounded text-prizm-text font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Database size={11} />
              Export Full JSON
            </button>
          </div>
        </div>

        {/* HIGH DENSITY RESPONSIVE DEVICE TELEMETRY TABLE */}
        <div className="border border-prizm-border rounded-lg overflow-hidden font-mono text-[11px] shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead className="bg-prizm-surface-strong border-b border-prizm-border text-prizm-text-muted uppercase tracking-widest text-[8px]">
                <tr>
                  <th className="p-3 w-10 text-center">Status</th>
                  <th className="p-3 cursor-pointer hover:text-prizm-primary select-none flex gap-2 items-center" onClick={() => setIpSortDesc(!ipSortDesc)}>Device IP {ipSortDesc ? "▼" : "▲"}</th>
                  <th className="p-3">ARRAY / SEGMENT</th>
                  <th className="p-3">Entity Description</th>
                  <th className="p-3">State / Ping</th>
                  <th className="p-3">Stage</th>
                  <th className="p-3">HVAC Unit 1</th>
                  <th className="p-3">HVAC Unit 2</th>
                  <th className="p-3">Sensors Summary</th>
                  <th className="p-3">Last Checked success</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-prizm-surface-strong">
                {sortedDevices.map((d, index) => {
                  return (
                    <tr
                      key={`${d.ip || "unspecified"}-${index}`}
                      onClick={() => {
                        setSelectedDevice(d);
                        setAdvancedDrawerShowJson(false);
                      }}
                      className="hover:bg-prizm-surface-strong transition-colors cursor-pointer"
                    >
                      {/* Reachable status node indicator */}
                      <td className="p-3 text-center">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                          d.reachable ? "bg-emerald-400 shadow-sm shadow-emerald-500/20" : "bg-rose-500"
                        }`} />
                      </td>

                      <td className="p-3 text-prizm-text font-bold whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{d.ip}</span>
                          <span className="text-[9px] text-prizm-text-muted font-normal">{d.firmwareVersion || d.softwareVersion || "No Fw"}</span>
                        </div>
                      </td>

                      <td className="p-3 text-prizm-text-muted leading-tight whitespace-nowrap">
                        <span className="block font-bold">Array {d.arrayIndex ?? "?"}</span>
                        <span className="block text-[9px]">{d.segmentLabel ?? ""}</span>
                      </td>

                      <td className="p-3 text-prizm-text-muted max-w-44 truncate font-medium title-cell" title={d.entityDescription || "Unmapped"}>
                        {d.entityDescription || "Unmapped"}
                      </td>

                      {/* State / Ping */}
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              d.reachable && d.deviceState === "NORMAL"
                                ? "bg-green-500/5 text-green-400 border border-green-500/10"
                                : d.reachable && d.deviceState === "ALARM"
                                ? "bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/20"
                                : d.reachable && d.deviceState === "WARNING"
                                ? "bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/20"
                                : !d.reachable && d.sourceCoverage?.directFeather 
                                ? "bg-black/40 text-prizm-text-muted border border-prizm-border" 
                                : "bg-prizm-surface-strong text-prizm-text-muted"
                            }`}>
                              {d.reachable ? (d.deviceState || "NORMAL") : (d.sourceCoverage?.directFeather ? 'OFFLINE' : 'Not reporting')}
                            </span>
                            {renderHvacMismatchBadge(d)}
                          </div>
                          <span className="text-[9px] text-prizm-primary font-bold">
                            {d.reachable ? `${(d.pingMs || 0)} ms` : "n/a"}
                          </span>
                        </div>
                      </td>

                      {/* Stage column */}
                      <td className="p-3 whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded bg-prizm-surface-strong border border-prizm-border text-[9px] font-bold text-prizm-primary uppercase">
                          {d.thermostatStage || d.hvacRuntimeState || d.hvacMode || d.hvacStatus || "–"}
                        </span>
                      </td>

                      {/* HVAC Unit 1 */}
                      <td className="p-3">
                        {renderHvacCompact(d.hvac1, "hvac1")}
                      </td>

                      {/* HVAC Unit 2 */}
                      <td className="p-3">
                        {renderHvacCompact(d.hvac2, "hvac2")}
                      </td>

                      {/* Sensors Summary */}
                      <td className="p-3">
                        {renderSensorsCompact(d)}
                      </td>

                      <td className="p-3 text-prizm-text-muted">
                        {d.lastSuccessUtc ? d.lastSuccessUtc.slice(11, 19) + " UTC" : "N/A"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredDevices.length === 0 && (
            <div className="p-8 text-center text-prizm-text-muted italic font-mono">
              No matching Feather device logs discovered. Make sure dynamic demo toggle is on, or run "Discover Topology" above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}