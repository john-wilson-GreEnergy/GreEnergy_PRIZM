import React, { useState, useEffect } from "react";
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

export default function FeatherDashboard() {
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
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  const [cacheDetails, setCacheDetails] = useState<{
    createdAt: string | null;
    lastUpdatedAt: string | null;
    activeProfileId: string;
    activeProfileName: string;
    activeEmsBaseUrl: string;
    isStale: boolean;
  }>({
    createdAt: null,
    lastUpdatedAt: null,
    activeProfileId: "",
    activeProfileName: "",
    activeEmsBaseUrl: "",
    isStale: true
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
  const [ipSortDesc, setIpSortDesc] = useState<boolean>(false);

  // Drawer detail selection
  const [selectedDevice, setSelectedDevice] = useState<FeatherHvacDevice | null>(null);
  const [advancedDrawerShowJson, setAdvancedDrawerShowJson] = useState<boolean>(false);

  // Error/Success Toasts or alerts
  const [alertMessage, setAlertMessage] = useState<{ type: "success" | "error" | "warn"; text: string } | null>(null);

  // Load cache on bootstrap
  const loadCache = async (autoDiscoverOnEmpty = false, forceRefresh = false) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const url = forceRefresh ? "/api/feather/devices?refresh=true" : "/api/feather/devices?maxAgeMs=5000";
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        setDevices(prev => {
             // keep old rows around and just update matched keys to prevent jitter
             if (!prev || prev.length === 0) return data.devices || [];
             const map = new Map(prev.map(d => [d.ip, d]));
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
          isStale: !!data.isStale
        });

        if (autoDiscoverOnEmpty && (!data.devices || data.devices.length === 0)) {
          runTopologyDiscovery(true);
        }
        setLastRefreshTime(Date.now());
      }
    } catch (e) {
      console.error("Failed to load feather devices cache", e);
    }
  };

  useEffect(() => {
    loadCache(true, false);
  }, []);

  useEffect(() => {
    if (refreshIntervalSec <= 0) return;
    const intervalId = setInterval(() => {
      loadCache(false, true);
    }, refreshIntervalSec * 1000);
    return () => clearInterval(intervalId);
  }, [refreshIntervalSec]);

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
      const res = await fetch("/api/feather/discover", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        await loadCache();
        if (!silent) {
          setAlertMessage({
            type: "success",
            text: `Successfully discovered and polled ${data.count} candidate devices from active EMS maps.`
          });
        }
      } else {
        if (!silent) setAlertMessage({ type: "error", text: data.error || "Topology discovery failed." });
      }
    } catch (e: any) {
      if (!silent) setAlertMessage({ type: "error", text: e.message || String(e) });
    } finally {
      if (!silent) setLoading(false);
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

    // 8. Discovery Controls overall selection
    if (discoverySource === "topology" && d.discoveryMethod === "manual") return false;
    if (discoverySource === "manual" && d.discoveryMethod !== "manual") return false;

    return true;
  });

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

  return (
    <div className="space-y-6 w-full animate-fade-in text-[#D1D5DB]">
      
      {/* 1. DISCOVERY CONTROLS & MANUAL SCAN PANEL CONFIGS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* DISCOVERY CONTROL CENTER */}
        <div className="lg:col-span-5 bg-prizm-surface border border-prizm-border rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-prizm-border pb-2">
              <Sliders className="text-prizm-primary" size={16} />
              <span className="font-mono text-xs font-bold text-prizm-text uppercase tracking-wider">
                LAN Discovery Controls & Target Profile
              </span>
            </div>

            {/* Target profile metadata dashboard block */}
            <div className="bg-prizm-surface-strong rounded p-3 text-[10px] font-mono grid grid-cols-2 gap-2 border border-prizm-border">
              <div>
                <span className="text-prizm-text-muted block">ACTIVE PROFILE</span>
                <span className="text-prizm-primary font-black truncate block block max-w-44">
                  {cacheDetails.activeProfileName || "PRIZM Core Hardware Bess Profile"}
                </span>
              </div>
              <div>
                <span className="text-prizm-text-muted block">IP BASE TARGET</span>
                <span className="text-prizm-text font-medium block">
                  {cacheDetails.activeEmsBaseUrl || "10.0.0.3:8080"}
                </span>
              </div>
              <div className="col-span-2 border-t border-prizm-border pt-2 mt-1 flex justify-between items-center text-[9px]">
                <span className="text-prizm-text-muted text-[9px]">CACHE OWNERSHIP ATTACHMENT</span>
                <span className={`px-1.5 py-0.2 rounded font-bold uppercase text-[8px] ${cacheDetails.isStale ? "bg-prizm-warning text-prizm-warning" : "bg-emerald-400/10 text-emerald-300"}`}>
                  {cacheDetails.isStale ? "PROFILE SWITCH REQUIRED RESCAN" : "CACHE LOCKED NOMINAL"}
                </span>
              </div>
            </div>

            {/* Discovery source toggler */}
            <div className="space-y-1.5 font-mono text-[11px]">
              <label className="text-prizm-text-muted font-bold block uppercase tracking-wider text-[9px]">Discovery Mode Filter</label>
              <div className="grid grid-cols-3 gap-2 bg-prizm-surface-strong p-1 rounded border border-prizm-border">
                {[
                  { value: "topology", label: "Topology" },
                  { value: "manual", label: "Manual Scan" },
                  { value: "both", label: "Show All" }
                ].map(item => (
                  <button
                    key={item.value}
                    onClick={() => setDiscoverySource(item.value as any)}
                    className={`py-1 text-[10px] font-bold rounded cursor-pointer transition-all uppercase ${
                      discoverySource === item.value 
                        ? "bg-prizm-info/10 text-prizm-primary border border-prizm-primary" 
                        : "text-prizm-text-muted hover:text-prizm-text"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-5 pt-3 border-t border-prizm-border">
            <button
              onClick={() => runTopologyDiscovery(false)}
              disabled={loading}
              className="px-3 py-2 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-prizm-text font-mono text-[10px] font-black rounded uppercase tracking-wider text-center shadow-md shadow-cyan-950/40 cursor-pointer disabled:opacity-40 transition-all"
            >
              Discover Topology
            </button>
            <button
              onClick={() => refreshSelectedTable(filteredDevices.map(d => d.ip))}
              disabled={loading || filteredDevices.length === 0}
              className="px-3 py-2 border border-prizm-border hover:border-prizm-border bg-black/5 hover:bg-black/10 text-prizm-text font-mono text-[10px] font-bold rounded uppercase tracking-wider text-center cursor-pointer transition-all"
            >
              Refresh Filtered ({filteredDevices.length})
            </button>
            <button
              onClick={triggerClearCache}
              className="col-span-2 mt-1 px-3 py-1.5 border border-prizm-danger/20 hover:border-prizm-danger/20 bg-prizm-danger/10 hover:bg-prizm-danger/10 text-prizm-danger font-mono text-[9px] font-bold rounded uppercase tracking-widest text-center cursor-pointer transition-all"
            >
              Clear Cache for active profile
            </button>
          </div>
        </div>

        {/* MANUAL SCAN FORM */}
        <div className="lg:col-span-7 bg-prizm-surface border border-prizm-border rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-prizm-border pb-2">
              <div className="flex items-center gap-2">
                <Settings className="text-prizm-warning" size={16} />
                <span className="font-mono text-xs font-bold text-prizm-text uppercase tracking-wider">
                  Manual Scan Address Shorthands
                </span>
              </div>
              {/* Scan input selector */}
              <div className="flex bg-prizm-surface-strong p-1 rounded font-mono text-[9px] border border-prizm-border">
                {[
                  { value: "cidr", label: "CIDR" },
                  { value: "range", label: "IP Bounds" },
                  { value: "shorthand", label: "Shorthand" }
                ].map(item => (
                  <button
                    key={item.value}
                    onClick={() => setScanMode(item.value as any)}
                    className={`px-2 py-0.5 rounded uppercase font-bold transition-all cursor-pointer ${
                      scanMode === item.value ? "bg-prizm-warning text-prizm-warning" : "text-prizm-text-muted"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* INPUT SWITCH CONTAINER */}
            <div className="bg-prizm-surface-strong p-4 rounded-lg border border-prizm-border font-mono text-[11px] min-h-[95px] flex items-center">
              
              {scanMode === "cidr" && (
                <div className="w-full space-y-1.5">
                  <span className="text-prizm-text-muted block text-[9px] uppercase tracking-wider">CIDR RANGE INPUT</span>
                  <input
                    type="text"
                    value={cidrInput}
                    onChange={e => setCidrInput(e.target.value)}
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-3 py-1.5 font-mono text-xs text-prizm-text focus:outline-none focus:border-amber-400/40"
                    placeholder="e.g. 10.0.1.0/24"
                  />
                  <span className="text-[10px] text-prizm-text-muted block">Scans sub-block range. Default laptop ethernet LAN fallback bounds apply.</span>
                </div>
              )}

              {scanMode === "range" && (
                <div className="w-full grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-prizm-text-muted block text-[9px] uppercase tracking-wider">START IP RANGE BOUND</span>
                    <input
                      type="text"
                      value={startIpInput}
                      onChange={e => setStartIpInput(e.target.value)}
                      className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-2.5 py-1.5 font-mono text-xs text-prizm-text focus:outline-none focus:border-amber-400/40"
                      placeholder="e.g. 10.0.1.3"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-prizm-text-muted block text-[9px] uppercase tracking-wider">END IP RANGE BOUND</span>
                    <input
                      type="text"
                      value={endIpInput}
                      onChange={e => setEndIpInput(e.target.value)}
                      className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-2.5 py-1.5 font-mono text-xs text-prizm-text focus:outline-none focus:border-amber-400/40"
                      placeholder="e.g. 10.0.1.75"
                    />
                  </div>
                </div>
              )}

              {scanMode === "shorthand" && (
                <div className="w-full grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-prizm-text-muted block text-[9px] uppercase tracking-wider">ARRAY RANGES (eg: 1-8)</span>
                    <input
                      type="text"
                      value={arrayRangeInput}
                      onChange={e => setArrayRangeInput(e.target.value)}
                      className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-2.5 py-1.5 font-mono text-xs text-prizm-text focus:outline-none focus:border-amber-400/40"
                      placeholder="e.g. 1-4"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-prizm-text-muted block text-[9px] uppercase tracking-wider">HOST RANGES (eg: 3,10,15)</span>
                    <input
                      type="text"
                      value={hostRangeInput}
                      onChange={e => setHostRangeInput(e.target.value)}
                      className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-2.5 py-1.5 font-mono text-xs text-prizm-text focus:outline-none focus:border-amber-400/40"
                      placeholder="e.g. 3,10,15,20,30-40"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4 pt-3 border-t border-prizm-border font-mono text-[10px]">
            {/* Range validation tracker preview */}
            <div className="text-[11px] space-y-1">
              <div className="flex gap-1.5 items-center">
                <span className="text-prizm-text-muted uppercase">Pre-scan Size:</span>
                <span className={`font-bold ${preview.isValid ? "text-prizm-primary" : "text-prizm-danger"}`}>
                  {preview.count} sequence targets
                </span>
              </div>
              {preview.warningMsg && (
                <span className="text-prizm-danger font-bold block text-[9px] uppercase tracking-tighter">
                  ⚠ {preview.warningMsg}
                </span>
              )}
              {preview.isValid && preview.count > 0 && (
                <span className="text-emerald-400 block text-[9px] font-bold uppercase tracking-widest leading-none">
                  ✔ Boundaries passed Private-IP ethernet Guard Check
                </span>
              )}
            </div>

            <button
              onClick={runManualScan}
              disabled={loading || !preview.isValid || preview.count === 0}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-semibold rounded font-mono text-[11px] shadow-lg shadow-amber-950/20 disabled:opacity-30 cursor-pointer transition-all uppercase tracking-wider"
            >
              Run manual Scan range
            </button>
          </div>
        </div>
      </div>

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
          { label: "IP Candidates", val: stats.total, color: "text-prizm-text" },
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
                  <th className="p-3">Discovery Method</th>
                  <th className="p-3">Arr / Str</th>
                  <th className="p-3">Entity Description</th>
                  <th className="p-3">Ping (ms)</th>
                  <th className="p-3">Fw Version</th>
                  <th className="p-3">State</th>
                  <th className="p-3 text-center">Warn Info</th>
                  <th className="p-3 text-center">Alarm Faults</th>
                  <th className="p-3">HVAC / MIO Sensors Status Summary</th>
                  <th className="p-3">Last Checked success</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-prizm-surface-strong">
                {sortedDevices.map((d, index) => {
                  const isTripped = d.alarmCount > 0;
                  const isWarned = d.warningCount > 0;
                  
                  return (
                    <tr
                      key={d.ip}
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

                      <td className="p-3 text-prizm-text font-bold">{d.ip}</td>

                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-black/5 text-prizm-text-muted text-[9px] uppercase">
                          {d.discoveryMethod}
                        </span>
                      </td>

                      <td className="p-3 text-prizm-text-muted">
                        {(d.arrayIndex !== undefined || d.stringIndex !== undefined) ? 
                          `${d.arrayIndex !== undefined ? `A${d.arrayIndex}` : "A?"} / ${d.stringIndex !== undefined ? `S${d.stringIndex}` : "S?"}` 
                          : "Unmapped"}
                      </td>

                      <td className="p-3 text-prizm-text-muted max-w-44 truncate font-medium title-cell" title={d.entityDescription || "Unmapped"}>
                        {d.entityDescription || "Unmapped"}
                      </td>

                      <td className="p-3 text-prizm-primary">
                        {d.reachable ? `${(d.pingMs || 0)} ms` : "n/a"}
                      </td>

                      <td className="p-3 font-semibold text-prizm-text-muted">
                        {d.firmwareVersion || d.softwareVersion || "Not reported"}
                      </td>

                      {/* Operational state */}
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          d.reachable && d.deviceState === "NORMAL"
                            ? "bg-green-500/5 text-green-400 border border-green-500/10"
                            : d.reachable && d.deviceState === "ALARM"
                            ? "bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/20"
                            : d.reachable && d.deviceState === "WARNING"
                            ? "bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/20"
                            : !d.reachable && d.sourceCoverage.directFeather 
                            ? "bg-black/40 text-prizm-text-muted border border-prizm-border" 
                            : "bg-prizm-surface-strong text-prizm-text-muted"
                        }`}>
                          {d.reachable ? (d.deviceState || "NORMAL") : (d.sourceCoverage.directFeather ? 'OFFLINE' : 'Not reporting')}
                        </span>
                      </td>

                      <td className="p-3 text-center">
                        {isWarned && d.warnInfo && d.warnInfo.length > 0 ? (
                           <div className="flex flex-col gap-1 items-center">
                             {d.warnInfo.map((n, i) => (
                               <span key={i} className="px-1.5 py-0.5 bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/20 rounded font-black text-[9px] whitespace-nowrap">
                                 {n}
                               </span>
                             ))}
                           </div>
                        ) : (
                          <span className="text-prizm-text-muted">-</span>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        {isTripped && d.alarmFaults && d.alarmFaults.length > 0 ? (
                           <div className="flex flex-col gap-1 items-center">
                               {d.alarmFaults.map((f, i) => (
                                 <span key={i} className="px-1.5 py-0.5 bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/20 rounded font-extrabold text-[9px] animate-pulse whitespace-nowrap">
                                   {f}
                                 </span>
                               ))}
                           </div>
                        ) : (
                          <span className="text-prizm-text-muted">-</span>
                        )}
                      </td>

                      {/* HVAC/MIO inputs Summary */}
                      <td className="p-3 text-prizm-text-muted max-w-[280px] truncate leading-normal">
                        {d.reachable ? (
                          <div className="flex flex-col gap-1.5 text-[10px]">
                            <div className="flex items-center gap-1.5 text-blue-300">
                              <Thermometer size={10} />
                              <span>S: {d.temperatureSupplyC !== undefined && d.temperatureSupplyC !== null ? d.temperatureSupplyC : "?"}°C</span>
                              <span className="text-prizm-text-muted">/</span>
                              <span className="text-orange-300">C: {d.temperatureCellC !== undefined && d.temperatureCellC !== null ? d.temperatureCellC : "?"}°C</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-prizm-primary font-bold">{d.hvacMode || "IDLE"}</span>
                              <span className="text-prizm-text-muted border-l border-prizm-border pl-1.5 ml-1">MIO: {d.mioSensorSummary || "N/A"}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-prizm-text-muted">-</span>
                        )}
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

      {/* 4. DETAIL DRAWER SIDE VIEW DIALOG */}
      {selectedDevice && (
        <div className="fixed inset-0 bg-prizm-surface-strong backdrop-blur-xs z-50 flex justify-end animate-fade-in font-mono">
          <div className="w-full max-w-lg bg-prizm-surface border-l border-prizm-border h-full p-6 flex flex-col justify-between overflow-y-auto shadow-2xl relative">
            
            <div className="space-y-6">
              {/* Drawer header */}
              <div className="flex justify-between items-start border-b border-prizm-border pb-4">
                <div>
                  <span className="text-prizm-text-muted uppercase text-[9px] tracking-widest block mb-1">
                    Enriched Device Diagnostic Profile
                  </span>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-prizm-text tracking-tighter">
                      {selectedDevice.ip}
                    </h2>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      selectedDevice.reachable ? "bg-emerald-400/10 text-emerald-400" : "bg-rose-500/10 text-rose-500"
                    }`}>
                      {selectedDevice.reachable ? "ONLINE" : "OFFLINE"}
                    </span>
                  </div>
                  <span className="text-prizm-primary font-bold text-[10px] block mt-1">
                    {selectedDevice.entityDescription}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedDevice(null)}
                  className="p-1 rounded hover:bg-prizm-surface-strong text-prizm-text-muted hover:text-prizm-text cursor-pointer transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Status and Merged Identifiers */}
              <div className="space-y-3">
                <div className="bg-prizm-surface-strong border border-prizm-border p-3 rounded space-y-1.5 text-[10px]">
                  <span className="text-prizm-text-muted uppercase text-[8px] block mb-1">Merged Source Identity Data</span>
                  <div className="flex justify-between">
                    <span className="text-prizm-text-muted">Entity Description:</span>
                    <span className="text-prizm-text font-semibold">{selectedDevice.entityDescription || "Unmapped"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-prizm-text-muted">Array Index:</span>
                    <span className="text-prizm-text font-bold">{selectedDevice.arrayIndex !== undefined ? selectedDevice.arrayIndex : "Unmapped"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-prizm-text-muted">String Index:</span>
                    <span className="text-prizm-text font-bold">{selectedDevice.stringIndex !== undefined ? selectedDevice.stringIndex : "Unmapped"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-prizm-text-muted">Device Status / Firmware:</span>
                    <span className="text-prizm-text font-bold">{selectedDevice.firmwareVersion || selectedDevice.softwareVersion || "Not reported"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-prizm-text-muted">Operational State:</span>
                    <span className="text-prizm-primary font-black uppercase">{selectedDevice.deviceState || "Normal"}</span>
                  </div>
                </div>

                {/* Source contributions */}
                <div className="bg-prizm-surface-strong border border-prizm-border p-3 rounded col-span-2 space-y-2">
                  <span className="text-prizm-text-muted uppercase text-[8px] block w-full border-b border-prizm-border pb-1 mb-1">Source Coverage / Pipeline Diagnostics</span>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-prizm-text-muted">Direct Feather:</span>
                      <span className={`font-bold ${selectedDevice.sourceCoverage?.directFeather ? "text-emerald-400" : "text-prizm-text-muted"}`}>
                        {selectedDevice.sourceCoverage?.directFeather ? "Sourced" : "Failed/Unreachable"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-prizm-text-muted">BlockViewer Topology:</span>
                      <span className={`font-bold ${selectedDevice.sourceCoverage?.blockviewer ? "text-emerald-400" : "text-prizm-text-muted"}`}>
                        {selectedDevice.sourceCoverage?.blockviewer ? "Sourced" : "Missing"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-prizm-text-muted">String IP Map:</span>
                      <span className={`font-bold ${selectedDevice.sourceCoverage?.stringIpMap ? "text-emerald-400" : "text-prizm-text-muted"}`}>
                        {selectedDevice.sourceCoverage?.stringIpMap ? "Sourced" : "Missing"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-prizm-text-muted">IP Map:</span>
                      <span className={`font-bold ${selectedDevice.sourceCoverage?.ipMap ? "text-emerald-400" : "text-prizm-text-muted"}`}>
                        {selectedDevice.sourceCoverage?.ipMap ? "Sourced" : "Missing"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-prizm-text-muted">Last Call (BMS):</span>
                      <span className={`font-bold ${selectedDevice.sourceCoverage?.lastCall ? "text-emerald-400" : "text-prizm-text-muted"}`}>
                        {selectedDevice.sourceCoverage?.lastCall ? "Sourced" : "Missing"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-prizm-text-muted">1st Responder / HVAC:</span>
                      <span className={`font-bold ${selectedDevice.sourceCoverage?.firstResponder ? "text-emerald-400" : "text-prizm-text-muted"}`}>
                        {selectedDevice.sourceCoverage?.firstResponder ? "Sourced" : "Missing"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Warnings / Alarms log */}
                {selectedDevice.warningCount !== undefined && selectedDevice.warningCount > 0 && (
                  <div className="bg-prizm-warning/10 border border-prizm-warning/20 p-3 rounded">
                    <span className="text-prizm-warning uppercase text-[10px] font-black tracking-widest block mb-2">
                       Active Warning Interlocks ({selectedDevice.warningCount})
                    </span>
                    <ul className="list-disc pl-4 space-y-1 text-prizm-text text-[10px]">
                      {(selectedDevice.warnInfo || []).map((w, idx) => (
                         <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedDevice.alarmCount !== undefined && selectedDevice.alarmCount > 0 && (
                  <div className="bg-prizm-danger/10 border border-prizm-danger/20 p-3 rounded">
                    <span className="text-prizm-danger uppercase text-[10px] font-black tracking-widest block mb-2">
                       Active TRIP / Fault Log ({selectedDevice.alarmCount})
                    </span>
                    <ul className="list-disc pl-4 space-y-1 text-prizm-text text-[10px]">
                      {(selectedDevice.alarmFaults || []).map((a, idx) => (
                         <li key={idx}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {selectedDevice.hvacSummary || selectedDevice.temperatureCellC !== undefined || selectedDevice.temperatureSupplyC !== undefined ? (
                    <div className="bg-prizm-surface-strong border border-prizm-border p-3 rounded space-y-1 text-[10px]">
                        <span className="text-prizm-text-muted uppercase text-[8px] block mb-1">MIO / HVAC Details</span>
                        {selectedDevice.hvacSummary && <div className="text-prizm-primary font-bold mb-1">{selectedDevice.hvacSummary}</div>}
                        <div className="flex justify-between">
                            <span className="text-prizm-text-muted">Space Temp (Supply):</span>
                            <span className="text-prizm-text font-bold">{selectedDevice.temperatureSupplyC !== undefined ? `${selectedDevice.temperatureSupplyC}°C` : "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-prizm-text-muted">Cell Temp:</span>
                            <span className="text-prizm-text font-bold">{selectedDevice.temperatureCellC !== undefined ? `${selectedDevice.temperatureCellC}°C` : "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-prizm-text-muted">HVAC Mode/Stage:</span>
                            <span className="text-prizm-text font-bold">{selectedDevice.hvacMode || "N/A"}</span>
                        </div>
                    </div>
                ): null}

              </div>

              {/* Advanced toggle for raw json */}
              <div className="space-y-2 border-t border-prizm-border pt-4">
                <div className="flex justify-between items-center bg-prizm-surface-strong p-2 rounded border border-prizm-border">
                  <div className="flex flex-col">
                    <span className="text-prizm-text-muted text-[10px] uppercase font-bold">Direct JSON Source</span>
                    <a href={`http://${selectedDevice.ip}:8080/feather/status/report.json`} target="_blank" rel="noreferrer" className="text-prizm-primary hover:text-cyan-400 text-[10px] underline leading-tight mt-1">
                      http://{selectedDevice.ip}:8080/feather/status/report.json
                    </a>
                  </div>
                  <button
                    onClick={() => setAdvancedDrawerShowJson(!advancedDrawerShowJson)}
                    className="px-2 py-1 bg-black/20 hover:bg-black/40 rounded font-bold text-[9px] text-prizm-text cursor-pointer border border-prizm-border transition-colors"
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
          </div>
        </div>
      )}
    </div>
  );
}