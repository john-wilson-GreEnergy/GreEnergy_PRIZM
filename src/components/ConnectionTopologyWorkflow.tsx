import React, { useState, useEffect } from "react";
import {
  Server,
  Cpu,
  Sliders,
  Network,
  Activity,
  CheckCircle,
  AlertTriangle,
  Play,
  ArrowRight,
  ArrowLeft,
  Settings,
  Database,
  Terminal,
  Save,
  Clock,
  ShieldCheck,
  RefreshCw,
  Info,
  Search,
  Filter,
  Trash2,
  Plus,
  Zap,
  Globe,
  Settings2,
  HardDrive
} from "lucide-react";

interface SiteTopologyDevice {
  id: string;
  ip: string;
  port?: number;
  protocol?: "http" | "modbus-tcp" | "tcp" | "unknown";
  deviceType: "ems" | "array" | "pcs" | "cs" | "es" | "string-controller" | "feather" | "hvac" | "modbus-device" | "unknown";
  arrayIndex?: number;
  stringIndex?: number;
  pcsIndex?: number;
  calloutLabel: string;
  displayLabel: string;
  source: string;
  confidence: number;
  reachable?: boolean;
  lastSeen?: string;
  raw?: any;
}

interface SiteTopologyProfile {
  id: string;
  profileName: string;
  stationCode?: string;
  blockIndex?: number;
  ems: {
    host: string;
    port: number;
    turtlePath: string;
    baseUrl: string;
  };
  ipTopologyMode: "ems-derived" | "formula" | "explicit-map" | "scan-discovered" | "hybrid";
  allowedScanRanges: Array<{
    cidr?: string;
    startIp?: string;
    endIp?: string;
    label?: string;
    enabled: boolean;
  }>;
  formula?: {
    basePrefix?: string;
    arrayIndexMode?: "third-octet" | "range-block" | "explicit-array-map" | "custom";
    arrayOctetIndex?: number;
    hostOctetIndex?: number;
    arrayStart?: number;
    arrayEnd?: number;
    arrayIndexOffset?: number;
    csHostOctets?: number[];
    esStartHostOctet?: number;
    esHostStep?: number;
    esCountPerArray?: number;
    pcsHostOctets?: number[];
    customArrayMap?: Record<string, {
      arrayIndex: number;
      subnet?: string;
      thirdOctet?: number;
      label?: string;
    }>;
  };
  explicitDevices: SiteTopologyDevice[];
  discoveryOptions: {
    scanEMS: boolean;
    scanFeathers: boolean;
    scanStrings: boolean;
    scanPCS: boolean;
    scanModbus: boolean;
    scanHttp: boolean;
    scanPorts: number[];
    timeoutMs: number;
    concurrency: number;
    requireUserConfirmationBeforeWideScan: boolean;
  };
}

export default function ConnectionTopologyWorkflow() {
  const [activeTab, setActiveTab] = useState<"overview" | "profiler" | "discovery" | "sitemap" | "validation">("overview");
  
  // Profiles State
  const [profilesList, setProfilesList] = useState<any[]>([]);
  const [activeEmsProfileId, setActiveEmsProfileId] = useState<string>("");
  const [activeProfile, setActiveProfile] = useState<SiteTopologyProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Form/Profiler States (for activeProfile editing)
  const [profileName, setProfileName] = useState<string>("");
  const [ipTopologyMode, setIpTopologyMode] = useState<string>("formula");
  const [basePrefix, setBasePrefix] = useState<string>("10.0");
  const [arrayStart, setArrayStart] = useState<number>(1);
  const [arrayEnd, setArrayEnd] = useState<number>(8);
  const [csOctetsStr, setCsOctetsStr] = useState<string>("3");
  const [pcsOctetsStr, setPcsOctetsStr] = useState<string>("1");
  const [esStart, setEsStart] = useState<number>(10);
  const [esStep, setEsStep] = useState<number>(5);
  const [esCount, setEsCount] = useState<number>(20);
  const [allowedScanRangesList, setAllowedScanRangesList] = useState<any[]>([]);
  
  // Custom Devices Overrides
  const [newExplicitIp, setNewExplicitIp] = useState<string>("");
  const [newExplicitLabel, setNewExplicitLabel] = useState<string>("");
  const [newExplicitType, setNewExplicitType] = useState<string>("cs");
  const [newExplicitArray, setNewExplicitArray] = useState<number>(1);
  const [newExplicitString, setNewExplicitString] = useState<number>(1);
  const [newExplicitPcs, setNewExplicitPcs] = useState<number>(1);

  // Discovery Page States
  const [discoveryLogs, setDiscoveryLogs] = useState<string[]>([]);
  const [discoveredDevices, setDiscoveredDevices] = useState<SiteTopologyDevice[]>([]);
  const [confirmedNewDevicesCount, setConfirmedNewDevicesCount] = useState<number>(0);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [activeScanType, setActiveScanType] = useState<"all" | "ems" | "scan">("all");
  
  // Site Map / Resolved Devices States
  const [resolvedDevices, setResolvedDevices] = useState<SiteTopologyDevice[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedDeviceForOverride, setSelectedDeviceForOverride] = useState<SiteTopologyDevice | null>(null);
  const [overrideType, setOverrideType] = useState<string>("cs");
  const [overrideLabel, setOverrideLabel] = useState<string>("");
  const [overrideArray, setOverrideArray] = useState<number>(1);
  const [overrideString, setOverrideString] = useState<number>(1);
  const [overridePcs, setOverridePcs] = useState<number>(1);

  // Validation / Auditing States
  const [validationErrors, setValidationErrors] = useState<any[]>([]);
  const [validationOk, setValidationOk] = useState<boolean>(true);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  
  // Visual Network Map Interactive States
  const [selectedNetworkArray, setSelectedNetworkArray] = useState<number | null>(1);

  // Load profile and standard variables
  const loadTopologyProfile = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/local/topology/profile");
      if (res.ok) {
        const data = await res.json();
        setProfilesList(data.emsProfiles || []);
        setActiveEmsProfileId(data.activeEmsProfileId || "");
        
        if (data.activeProfile) {
          const prof = data.activeProfile as SiteTopologyProfile;
          setActiveProfile(prof);
          
          // Form setups
          setProfileName(prof.profileName || "");
          setIpTopologyMode(prof.ipTopologyMode || "formula");
          setAllowedScanRangesList(prof.allowedScanRanges || []);
          
          if (prof.formula) {
            setBasePrefix(prof.formula.basePrefix || "10.0");
            setArrayStart(prof.formula.arrayStart || 1);
            setArrayEnd(prof.formula.arrayEnd || 8);
            setCsOctetsStr(prof.formula.csHostOctets?.join(",") || "3");
            setPcsOctetsStr(prof.formula.pcsHostOctets?.join(",") || "1");
            setEsStart(prof.formula.esStartHostOctet || 10);
            setEsStep(prof.formula.esHostStep || 5);
            setEsCount(prof.formula.esCountPerArray || 20);
          }
        }
      }
    } catch (e) {
      console.error("Error loading topology profile:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch resolved devices map
  const fetchResolvedDevices = async () => {
    try {
      const res = await fetch("/api/local/topology/resolved-devices");
      if (res.ok) {
        const data = await res.json();
        setResolvedDevices(data.devices || []);
      }
    } catch (e) {
      console.error("Error loading resolved devices:", e);
    }
  };

  // Fetch validation report
  const fetchValidationReport = async () => {
    setIsValidating(true);
    try {
      const res = await fetch("/api/local/topology/validation");
      if (res.ok) {
        const data = await res.json();
        setValidationErrors(data.errors || []);
        setValidationOk(data.ok === true);
      }
    } catch (e) {
      console.error("Error generating validation diagnostics:", e);
    } finally {
      setIsValidating(false);
    }
  };

  useEffect(() => {
    loadTopologyProfile();
    fetchResolvedDevices();
    fetchValidationReport();
  }, []);

  const handleSaveProfile = async (silent: boolean = false) => {
    if (!activeProfile) return;
    
    const csHosts = csOctetsStr.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    const pcsHosts = pcsOctetsStr.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));

    const updatedProfile: SiteTopologyProfile = {
      ...activeProfile,
      profileName,
      ipTopologyMode: ipTopologyMode as any,
      allowedScanRanges: allowedScanRangesList,
      formula: {
        basePrefix,
        arrayIndexMode: "third-octet",
        arrayOctetIndex: 2,
        hostOctetIndex: 3,
        arrayStart,
        arrayEnd,
        arrayIndexOffset: 0,
        csHostOctets: csHosts.length > 0 ? csHosts : [3],
        pcsHostOctets: pcsHosts.length > 0 ? pcsHosts : [1],
        esStartHostOctet: esStart,
        esHostStep: esStep,
        esCountPerArray: esCount
      }
    };

    try {
      const res = await fetch("/api/local/topology/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProfile)
      });
      if (res.ok) {
        const result = await res.json();
        setActiveProfile(result.profile);
        if (!silent) {
          alert("Subnet formula profile stored and updated successfully to flash!");
        }
        fetchResolvedDevices();
        fetchValidationReport();
      }
    } catch (e) {
      console.error("Error saving profile:", e);
      alert("Error saving profile changes as a baseline template: " + String(e));
    }
  };

  // Add explicit route override map
  const handleAddExplicitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile || !newExplicitIp) return;

    const newDevice: SiteTopologyDevice = {
      id: `dev_${Date.now()}`,
      ip: newExplicitIp.trim(),
      deviceType: newExplicitType as any,
      calloutLabel: newExplicitLabel || `${newExplicitType.toUpperCase()} Overridden`,
      displayLabel: `${newExplicitLabel || newExplicitType.toUpperCase()} Overridden — ${newExplicitIp.trim()}`,
      arrayIndex: newExplicitArray,
      stringIndex: newExplicitType === "es" ? newExplicitString : undefined,
      pcsIndex: newExplicitType === "pcs" ? newExplicitPcs : undefined,
      source: "manual",
      confidence: 100
    };

    const updatedProfile: SiteTopologyProfile = {
      ...activeProfile,
      explicitDevices: [...(activeProfile.explicitDevices || []), newDevice]
    };

    try {
      const res = await fetch("/api/local/topology/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProfile)
      });
      if (res.ok) {
        const result = await res.json();
        setActiveProfile(result.profile);
        setNewExplicitIp("");
        setNewExplicitLabel("");
        fetchResolvedDevices();
        fetchValidationReport();
      }
    } catch (e) {
      console.error("Error adding override:", e);
    }
  };

  // Remove explicit route override
  const handleRemoveExplicitOverride = async (deviceId: string) => {
    if (!activeProfile) return;

    const updatedProfile: SiteTopologyProfile = {
      ...activeProfile,
      explicitDevices: (activeProfile.explicitDevices || []).filter(d => d.id !== deviceId)
    };

    try {
      const res = await fetch("/api/local/topology/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProfile)
      });
      if (res.ok) {
        const result = await res.json();
        setActiveProfile(result.profile);
        fetchResolvedDevices();
        fetchValidationReport();
      }
    } catch (e) {
      console.error("Error removing override:", e);
    }
  };

  // Run discovery orchestration scans
  const runDiscoveryScan = async (type: "all" | "ems" | "scan") => {
    if (!window.confirm(`CONFIRM TOPOLOGY DISCOVERY: Are you sure you want to trigger a ${type === 'all' ? 'unified full' : type === 'ems' ? 'EMS map scrape' : 'allowed range sweep'} scan? This will intensely query network interfaces and might cause temporary structural overhead or network congestion.`)) return;
    setIsScanning(true);
    setActiveScanType(type);
    setDiscoveryLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Triggering discovery scan: sequence=${type}`]);
    
    const endpoint = type === "all" ? "/api/local/topology/discover"
                   : type === "ems" ? "/api/local/topology/discover/ems"
                   : "/api/local/topology/discover/scan";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        const data = await res.json();
        setDiscoveredDevices(data.devices || []);
        setDiscoveryLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] Discovery scan complete!`,
          `  - Found: ${data.count || 0} active, unique devices on site LAN.`,
          `  - Resolving network interfaces into routing table...`
        ]);
      } else {
        const errData = await res.json();
        setDiscoveryLogs(prev => [...prev, `[ERROR] Scan sequence failed: ${errData.error || "Unknown response"}`]);
      }
    } catch (e) {
      setDiscoveryLogs(prev => [...prev, `[ERROR] Connection failure executing scan: ${String(e)}`]);
    } finally {
      setIsScanning(false);
    }
  };

  // Save discovered array assets to flash profile
  const handlePromoteDiscoveredToProfile = async () => {
    if (discoveredDevices.length === 0) return;
    try {
      const res = await fetch("/api/local/topology/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devices: discoveredDevices })
      });
      if (res.ok) {
        const data = await res.json();
        setConfirmedNewDevicesCount(discoveredDevices.length);
        if (data.profile) {
          setActiveProfile(data.profile);
        }
        alert(`Successfully promoted ${discoveredDevices.length} discovered devices as permanent overrides!`);
        fetchResolvedDevices();
        fetchValidationReport();
      }
    } catch (e) {
      console.error("Error confirming discovered devices:", e);
    }
  };

  // Custom resolved device override drawer form
  const handleOpenOverrideModal = (dev: SiteTopologyDevice) => {
    setSelectedDeviceForOverride(dev);
    setOverrideType(dev.deviceType);
    setOverrideLabel(dev.calloutLabel);
    setOverrideArray(dev.arrayIndex || 1);
    setOverrideString(dev.stringIndex || 1);
    setOverridePcs(dev.pcsIndex || 1);
  };

  const handleApplyOverrideOnSitemap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile || !selectedDeviceForOverride) return;

    const newOverride: SiteTopologyDevice = {
      id: `dev_${Date.now()}`,
      ip: selectedDeviceForOverride.ip,
      deviceType: overrideType as any,
      calloutLabel: overrideLabel || `${overrideType.toUpperCase()} Overridden`,
      displayLabel: `${overrideLabel || overrideType.toUpperCase()} Overridden — ${selectedDeviceForOverride.ip}`,
      arrayIndex: overrideArray,
      stringIndex: overrideType === "es" ? overrideString : undefined,
      pcsIndex: overrideType === "pcs" ? overridePcs : undefined,
      source: "manual",
      confidence: 100
    };

    // Filter existing overrides for same IP if any
    const cleanExplicit = (activeProfile.explicitDevices || []).filter(
      d => d.ip !== selectedDeviceForOverride.ip
    );

    const updatedProfile: SiteTopologyProfile = {
      ...activeProfile,
      explicitDevices: [...cleanExplicit, newOverride]
    };

    try {
      const res = await fetch("/api/local/topology/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProfile)
      });
      if (res.ok) {
        const result = await res.json();
        setActiveProfile(result.profile);
        setSelectedDeviceForOverride(null);
        fetchResolvedDevices();
        fetchValidationReport();
      }
    } catch (e) {
      console.error("Error setting device override:", e);
    }
  };

  // Apply auto-fix recommendations from report audit
  const applyAutoFixRecommendation = async (errorType: string) => {
    if (!activeProfile) return;
    
    let updatedProfile = { ...activeProfile };

    if (errorType === "PCS_MAPPED_TO_SYNTHETIC") {
      // Direct update to map pcs host index 1 to resolve correctly
      if (updatedProfile.formula) {
        updatedProfile.formula.pcsHostOctets = [1];
      }
    } else if (errorType === "EMS_HOST_NOT_IN_SUBNET") {
      // Match basePrefix to match first two octets of active EMS client
      if (updatedProfile.formula && updatedProfile.ems.host) {
        const parts = updatedProfile.ems.host.split(".");
        if (parts.length >= 2) {
          updatedProfile.formula.basePrefix = `${parts[0]}.${parts[1]}`;
        }
      }
    }

    try {
      const res = await fetch("/api/local/topology/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProfile)
      });
      if (res.ok) {
        const result = await res.json();
        setActiveProfile(result.profile);
        alert("Applied alignment rule. Profiler synchronized!");
        fetchResolvedDevices();
        fetchValidationReport();
      }
    } catch (e) {
      console.error("Exception applying fix:", e);
    }
  };

  // Search/Filter helper on resolved sitemap list
  const filteredDevicesList = resolvedDevices.filter(dev => {
    const matchesSearch = dev.ip.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          dev.calloutLabel.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          dev.displayLabel.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || dev.deviceType === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6" id="topology-engine-dashboard">
      
      {/* HEADER BANNER */}
      <div className="bg-prizm-surface-strong border border-prizm-border p-5 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Network className="text-cyan-400" size={20} />
            <h1 className="text-md font-bold font-mono tracking-widest text-prizm-text uppercase">Site Topology Engine</h1>
          </div>
          <p className="text-[11px] font-sans text-prizm-text-muted mt-1 max-w-4xl">
            Single Source of Truth for unified IP address resolution. Orchestrate active ping sweeps, crawl EMS JSON network configurations,
            audit alignment errors, and manage explicit device override maps across all dashboard tables.
          </p>
        </div>

        {/* TEMPLATE SUMMARY */}
        <div className="shrink-0 flex items-center gap-3 bg-prizm-bg px-3 py-2 rounded border border-prizm-border select-none">
          <Globe className="text-cyan-400" size={14} />
          <div className="font-mono text-[10px]">
            <span className="text-prizm-text-muted">ACTIVE EMS CONTROLLER: </span>
            <span className="text-cyan-400 font-bold">{activeProfile?.ems.host || "Unconfigured"}</span>
          </div>
        </div>
      </div>

      {/* METRICS ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 font-mono">
          <span className="text-[9px] text-prizm-text-muted uppercase block">RESOLVED DEVICES</span>
          <span className="text-2xl font-bold text-cyan-400 mt-1 block">{resolvedDevices.length}</span>
          <span className="text-[9px] text-prizm-text/60 mt-1 block">Live Routing Records</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 font-mono">
          <span className="text-[9px] text-prizm-text-muted uppercase block">OVERRIDE DEFINITIONS</span>
          <span className="text-2xl font-bold text-amber-500 mt-1 block">{(activeProfile?.explicitDevices || []).length}</span>
          <span className="text-[9px] text-prizm-text/60 mt-1 block">Explicit Device Matches</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 font-mono">
          <span className="text-[9px] text-prizm-text-muted uppercase block">NETWORK ALIGNMENT</span>
          <span className={`${validationOk ? "text-emerald-400" : "text-amber-500"} text-lg font-bold mt-1 block`}>
            {validationOk ? "HEALTHY" : `${validationErrors.length} RECOMMS`}
          </span>
          <span className="text-[9px] text-prizm-text/60 mt-1 block">Integrity Diagnostics Check</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded-lg p-4 font-mono">
          <span className="text-[9px] text-prizm-text-muted uppercase block">RESOLUTION BASE</span>
          <span className="text-sm font-bold text-prizm-text mt-1.5 block">
            {activeProfile?.formula?.basePrefix || "10.0"}.x.x/16
          </span>
          <span className="text-[9px] text-prizm-text/60 mt-0.5 block">Subnet Mask Pattern</span>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex border-b border-prizm-border select-none font-mono text-[10.5px]">
        {[
          { id: "overview", label: "Overview Map", icon: Network },
          { id: "profiler", label: "Formula Profiler", icon: Sliders },
          { id: "discovery", label: "Discovery Studio", icon: Activity },
          { id: "sitemap", label: "Resolved Site Map", icon: Database },
          { id: "validation", label: "Validation & Alignment", icon: ShieldCheck }
        ].map(t => {
          const Icon = t.icon;
          const isSelected = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold cursor-pointer transition-all ${
                isSelected 
                  ? "border-cyan-400 text-cyan-400 bg-cyan-400/5" 
                  : "border-transparent text-prizm-text-muted hover:text-prizm-text"
              }`}
            >
              <Icon size={13} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* WORKSPACE CENTRAL SECTIONS */}
      <div className="bg-prizm-surface p-5 border border-prizm-border rounded-lg shadow-sm">
        
        {/* TAB 1: OVERVIEW & SCHEMATIC MAP */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-sm font-bold font-mono tracking-wider text-prizm-text uppercase">BESS Unified Topology Schematic</h3>
                <p className="text-[10px] text-prizm-text-muted mt-1">
                  Technician visual trace map representing arrays derived through Active Subnet formula: <strong className="text-prizm-text">{basePrefix}.arrayIndex.suffix</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-prizm-text-muted">Interactive Filter array:</span>
                <select
                  className="bg-prizm-bg text-[10px] text-cyan-400 font-mono font-bold border border-prizm-border p-1 rounded"
                  value={selectedNetworkArray || ""}
                  onChange={e => setSelectedNetworkArray(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">All Arrays</option>
                  {Array.from({ length: arrayEnd - arrayStart + 1 }, (_, i) => arrayStart + i).map(num => (
                    <option key={num} value={num}>Array {num}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* FULL DIAGRAM GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* PRIMARY SCADA CORE GATWAY */}
              <div className="lg:col-span-3 bg-prizm-bg p-5 rounded-lg border border-prizm-border flex flex-col justify-between min-h-[300px]">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-prizm-border pb-2.5">
                    <Server className="text-cyan-400" size={16} />
                    <span className="font-mono text-xs font-bold text-prizm-text uppercase">EMS LAN CORE</span>
                  </div>

                  <div className="space-y-3 font-mono text-[10px]">
                    <div className="bg-prizm-surface p-2.5 rounded border border-prizm-border">
                      <span className="text-prizm-text-muted uppercase block text-[9px]">IP Gateway</span>
                      <strong className="text-cyan-400 text-xs block mt-0.5">{activeProfile?.ems.host || "10.0.0.3"}</strong>
                    </div>

                    <div className="bg-prizm-surface p-2.5 rounded border border-prizm-border">
                      <span className="text-prizm-text-muted uppercase block text-[9px]">Port Routes</span>
                      <span className="text-prizm-text mt-0.5 block">{activeProfile?.ems.port || 8080} (HTTP) / {activeProfile?.discoveryOptions.scanPorts.join(", ")} (TCP)</span>
                    </div>

                    <div className="bg-prizm-surface p-2.5 rounded border border-prizm-border">
                      <span className="text-prizm-text-muted uppercase block text-[9px]">Subnet Resolution mode</span>
                      <span className="text-amber-400 font-bold mt-0.5 block uppercase">{activeProfile?.ipTopologyMode || "formula"}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-prizm-surface p-2.5 rounded border border-prizm-border/80 text-[10px] font-sans text-prizm-text-muted">
                  <div className="text-cyan-400 font-mono font-bold text-[9px] uppercase tracking-wider mb-0.5">Topology Feed:</div>
                  All queries on other dashboards trace back to this configuration. Changes here alter mapping globally instantly.
                </div>
              </div>

              {/* DYNAMIC SCATTER SCHEMATIC CONNECTOR AREA */}
              <div className="lg:col-span-9 bg-prizm-bg p-5 rounded-lg border border-prizm-border flex flex-col justify-between min-h-[400px]">
                <div className="space-y-4">
                  <span className="font-mono text-xs font-bold text-prizm-text-muted uppercase block">
                    Array Segment Map: {selectedNetworkArray ? `ARRAY ${selectedNetworkArray}` : "ALL BESS ARRAYS"}
                  </span>

                  {/* VIRTUAL NODES PLOT */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1 select-none">
                    {Array.from({ length: arrayEnd - arrayStart + 1 }, (_, i) => arrayStart + i)
                      .filter(num => selectedNetworkArray === null || selectedNetworkArray === num)
                      .map(arrIndex => {
                        // Gather devices for this array
                        const arrDevices = resolvedDevices.filter(d => d.arrayIndex === arrIndex);
                        const csDev = arrDevices.find(d => d.deviceType === "cs");
                        const pcsDev = arrDevices.find(d => d.deviceType === "pcs");
                        const esDevs = arrDevices.filter(d => d.deviceType === "es" || d.deviceType === "string-controller");
                        const otherDevs = arrDevices.filter(d => d.deviceType !== "cs" && d.deviceType !== "pcs" && d.deviceType !== "es" && d.deviceType !== "string-controller");

                        return (
                          <div key={arrIndex} className="bg-prizm-surface p-4 rounded-md border border-prizm-border/60 space-y-3 font-mono relative hover:border-cyan-400 transition-colors">
                            <div className="flex justify-between items-center border-b border-prizm-border/40 pb-2">
                              <span className="text-xs font-bold text-cyan-400">Array {arrIndex}</span>
                              <span className="text-[8px] px-1.5 py-0.5 bg-black/30 rounded text-prizm-text-muted">
                                {arrDevices.length} Devs
                              </span>
                            </div>

                            {/* Node blocks */}
                            <div className="space-y-1.5 text-[9.5px]">
                              {/* CS Block */}
                              <div className={`p-1 px-2 rounded flex justify-between ${csDev ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-400" : "bg-black/20 text-prizm-text-muted border border-transparent"}`}>
                                <span>CS Server</span>
                                <span className="font-semibold">{csDev ? `.${csDev.ip.split('.').pop()}` : "Empty"}</span>
                              </div>

                              {/* PCS Block */}
                              <div className={`p-1 px-2 rounded flex justify-between ${pcsDev ? "bg-cyan-500/10 border border-cyan-500/25 text-cyan-400" : "bg-black/20 text-prizm-text-muted border border-transparent"}`}>
                                <span>PCS Block</span>
                                <span className="font-semibold">{pcsDev ? `.${pcsDev.ip.split('.').pop()}` : "Empty"}</span>
                              </div>

                              {/* ES String Block counts */}
                              <div className={`p-1 px-2 rounded flex justify-between ${esDevs.length > 0 ? "bg-amber-500/10 border border-amber-500/25 text-amber-400" : "bg-black/20 text-prizm-text-muted border border-transparent"}`}>
                                <span>Strings ({esDevs.length})</span>
                                <span className="font-semibold">
                                  {esDevs.length > 0 ? "Mapped" : "None"}
                                </span>
                              </div>

                              {/* Others / HVAC Block */}
                              {otherDevs.length > 0 && (
                                <div className="p-1 px-2 rounded bg-blue-500/10 border border-blue-500/25 text-blue-400 flex justify-between">
                                  <span>Feather/HVAC</span>
                                  <span className="font-semibold">{otherDevs.length}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div className="pt-4 border-t border-prizm-border/40 flex items-center justify-between font-mono text-[9.5px] text-prizm-text-muted">
                  <div className="flex gap-4">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />Collection (CS)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-400" />Power Unit (PCS)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Strings (ES)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />Feather link</span>
                  </div>
                  <span>Diagram dynamically loaded from Active Subnet resolution definitions.</span>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: PROFILER EDITING ENGINE */}
        {activeTab === "profiler" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold font-mono tracking-wider text-prizm-text uppercase">IP Model Profile Configurator</h3>
              <p className="text-[10px] text-prizm-text-muted mt-1">
                Customize network base ranges, host step-multipliers, CS controller indices, and specify custom IP address lookup mappings.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start font-mono text-[11px]">
              
              {/* PRIMARY PROFILER FORM */}
              <div className="lg:col-span-8 bg-prizm-bg p-5 rounded-lg border border-prizm-border space-y-4">
                <div className="border-b border-prizm-border pb-2">
                  <h4 className="text-xs font-bold text-prizm-text uppercase">Topology Profile Setup</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-prizm-text-muted uppercase font-bold block">Profile Name</label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                      className="w-full bg-prizm-surface border border-prizm-border rounded p-2 text-cyan-400 font-bold focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-prizm-text-muted uppercase font-bold block">Resolution Mode</label>
                    <select
                      className="w-full bg-prizm-surface border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500 font-bold"
                      value={ipTopologyMode}
                      onChange={e => setIpTopologyMode(e.target.value)}
                    >
                      <option value="formula">Subnet Indexed Formula (Default Solar Star)</option>
                      <option value="ems-derived">EMS Controller Derived Layout Maps</option>
                      <option value="explicit-map">Manual Override Array Matches ONLY</option>
                      <option value="hybrid">Hybrid (Crawl EMS + Formulas Fallback)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-cyan-400 uppercase font-bold block">IP Address Prefix (Octets A.B)</label>
                    <input
                      type="text"
                      value={basePrefix}
                      onChange={e => setBasePrefix(e.target.value)}
                      className="w-full bg-prizm-surface border border-prizm-border rounded p-2 text-cyan-400 font-bold focus:outline-none"
                      placeholder="e.g. 10.0"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-prizm-text-muted uppercase font-bold block">Array Min</label>
                      <input
                        type="number"
                        value={arrayStart}
                        onChange={e => setArrayStart(parseInt(e.target.value) || 1)}
                        className="w-full bg-prizm-surface border border-prizm-border rounded p-2 text-prizm-text"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-prizm-text-muted uppercase font-bold block">Array Max</label>
                      <input
                        type="number"
                        value={arrayEnd}
                        onChange={e => setArrayEnd(parseInt(e.target.value) || 8)}
                        className="w-full bg-prizm-surface border border-prizm-border rounded p-2 text-prizm-text font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-prizm-text-muted uppercase font-bold block">CS Host Suffixes</label>
                      <input
                        type="text"
                        value={csOctetsStr}
                        onChange={e => setCsOctetsStr(e.target.value)}
                        className="w-full bg-prizm-surface border border-prizm-border rounded p-2 text-prizm-text"
                        placeholder="3"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-prizm-text-muted uppercase font-bold block">PCS Host Suffixes</label>
                      <input
                        type="text"
                        value={pcsOctetsStr}
                        onChange={e => setPcsOctetsStr(e.target.value)}
                        className="w-full bg-prizm-surface border border-prizm-border rounded p-2 text-cyan-400 font-bold"
                        placeholder="1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1 col-span-1">
                      <label className="text-prizm-text-muted uppercase font-bold block">ES Start Index</label>
                      <input
                        type="number"
                        value={esStart}
                        onChange={e => setEsStart(parseInt(e.target.value) || 10)}
                        className="w-full bg-prizm-surface border border-prizm-border rounded p-2 text-prizm-text"
                      />
                    </div>
                    <div className="space-y-1 col-span-1">
                      <label className="text-prizm-text-muted uppercase font-bold block">ES Multip Step</label>
                      <input
                        type="number"
                        value={esStep}
                        onChange={e => setEsStep(parseInt(e.target.value) || 5)}
                        className="w-full bg-prizm-surface border border-prizm-border rounded p-2 text-prizm-text col-span-1"
                      />
                    </div>
                    <div className="space-y-1 col-span-1">
                      <label className="text-prizm-text-muted uppercase font-bold block">ES String Count</label>
                      <input
                        type="number"
                        value={esCount}
                        onChange={e => setEsCount(parseInt(e.target.value) || 20)}
                        className="w-full bg-prizm-surface border border-prizm-border rounded p-2 text-prizm-text font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    onClick={() => handleSaveProfile()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-cyan-400 hover:bg-cyan-500 text-black rounded font-bold uppercase cursor-pointer"
                  >
                    <Save size={14} />
                    <span>Save & Deploy Model</span>
                  </button>
                </div>
              </div>

              {/* MANUAL EXPLICIT OVERRIDES SIDE PANEL */}
              <div className="lg:col-span-4 bg-prizm-bg p-5 rounded-lg border border-prizm-border space-y-4">
                <div className="border-b border-prizm-border pb-2 flex justify-between items-center">
                  <h4 className="text-xs font-bold text-prizm-text uppercase">Manual IP Matches</h4>
                  <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded border border-amber-500/25">Override Rules</span>
                </div>

                {/* ADD NEW MANUAL RECORD */}
                <form onSubmit={handleAddExplicitOverride} className="space-y-3 bg-prizm-surface p-3.5 rounded border border-prizm-border text-[10px]">
                  <span className="text-prizm-text font-bold block uppercase tracking-wider">Fast-Add Custom Device IP</span>
                  
                  <div className="space-y-1">
                    <label className="text-prizm-text-muted block font-bold">IP Address</label>
                    <input
                      type="text"
                      className="w-full bg-prizm-bg border border-prizm-border rounded p-1.5 text-cyan-400 font-bold focus:outline-none font-mono"
                      value={newExplicitIp}
                      onChange={e => setNewExplicitIp(e.target.value)}
                      placeholder="e.g. 172.16.55.12"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-prizm-text-muted block font-bold">Unique Display Label</label>
                    <input
                      type="text"
                      className="w-full bg-prizm-bg border border-prizm-border rounded p-1.5 text-prizm-text"
                      value={newExplicitLabel}
                      onChange={e => setNewExplicitLabel(e.target.value)}
                      placeholder="e.g. Test Lab HVAC"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-prizm-text-muted block font-bold">Classification</label>
                      <select
                        className="w-full bg-prizm-bg border border-prizm-border rounded p-1 text-prizm-text"
                        value={newExplicitType}
                        onChange={e => setNewExplicitType(e.target.value)}
                      >
                        <option value="cs">CS Server</option>
                        <option value="es">ES String Ctrl</option>
                        <option value="pcs">PCS Block</option>
                        <option value="feather">Feather / Node</option>
                        <option value="hvac">HVAC System</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-prizm-text-muted block font-bold">Array Index</label>
                      <input
                        type="number"
                        className="w-full bg-prizm-bg border border-prizm-border rounded p-1 text-prizm-text"
                        value={newExplicitArray}
                        onChange={e => setNewExplicitArray(parseInt(e.target.value) || 1)}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full p-2 bg-prizm-border hover:bg-prizm-border-strong text-prizm-text font-bold uppercase rounded cursor-pointer mt-1"
                  >
                    Insert Rule Match
                  </button>
                </form>

                {/* CURRENT LIST */}
                <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
                  <span className="text-[10px] text-prizm-text-muted uppercase font-bold block">Registered Explicit Devices ({(activeProfile?.explicitDevices || []).length})</span>
                  {(activeProfile?.explicitDevices || []).length === 0 ? (
                    <span className="text-[10px] text-prizm-text-muted block italic text-center py-4">No manual rules stored. All devices resolve from formulas.</span>
                  ) : (
                    (activeProfile?.explicitDevices || []).map(d => (
                      <div key={d.id} className="bg-prizm-surface p-2.5 rounded border border-prizm-border/60 flex justify-between items-center text-[10px]">
                        <div>
                          <strong className="text-prizm-text">{d.calloutLabel}</strong>
                          <span className="text-cyan-400 font-mono block mt-0.5">{d.ip} ({d.deviceType.toUpperCase()})</span>
                        </div>
                        <button
                          onClick={() => handleRemoveExplicitOverride(d.id)}
                          className="p-1 px-1.5 bg-prizm-danger/10 text-prizm-danger hover:bg-prizm-danger hover:text-black rounded transition-colors cursor-pointer"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

              </div>

            </div>
          </div>
        )}

        {/* TAB 3: DISCOVERY STUDIO */}
        {activeTab === "discovery" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold font-mono tracking-wider text-prizm-text uppercase">BESS LAN DISCOVERY STUDIO</h3>
                <p className="text-[10px] text-prizm-text-muted mt-1">
                  Query active endpoints, trigger wide TCP ping sweeps against defined allowedScanRanges to reconcile actual online field hardware.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => runDiscoveryScan("ems")}
                  disabled={isScanning}
                  className="px-4 py-2 bg-prizm-border hover:bg-prizm-border-strong rounded font-mono text-[10.5px] font-bold text-prizm-text cursor-pointer select-none"
                >
                  EMS Map Scrape
                </button>
                <button
                  onClick={() => runDiscoveryScan("scan")}
                  disabled={isScanning}
                  className="px-4 py-2 bg-prizm-border hover:bg-prizm-border-strong rounded font-mono text-[10.5px] font-bold text-prizm-text cursor-pointer select-none"
                >
                  Allowed Range Sweep
                </button>
                <button
                  onClick={() => runDiscoveryScan("all")}
                  disabled={isScanning}
                  className="px-4 py-2 bg-cyan-400 hover:bg-cyan-500 text-black rounded font-mono text-[10.5px] font-bold cursor-pointer select-none"
                >
                  Unified Full Discovery
                </button>
              </div>
            </div>

            {/* LIVE CONSOLE AND SCREEN */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* VIRTUAL TERMINAL */}
              <div className="lg:col-span-6 bg-black p-4 rounded-lg border border-prizm-border font-mono text-[11px] h-[360px] flex flex-col justify-between">
                <div className="flex justify-between items-center border-b border-prizm-border/60 pb-2 mb-2 text-[10px] text-prizm-text-muted">
                  <span className="flex items-center gap-1.5"><Terminal size={12} className="text-cyan-400" />PRIZN CONSOLE</span>
                  <span>{isScanning ? "SEQUENCE RUNNING..." : "IDLE"}</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 no-scrollbar text-prizm-text-muted">
                  {discoveryLogs.length === 0 ? (
                    <span className="text-cyan-400/40 block italic text-center py-10 select-none">Awaiting technician trigger... Click "Unified Full Discovery" above to begin.</span>
                  ) : (
                    discoveryLogs.map((log, idx) => (
                      <div key={idx} className={log.includes("[ERROR]") ? "text-prizm-danger" : log.includes("Complete!") ? "text-emerald-400" : "text-prizm-text"}>
                        {log}
                      </div>
                    ))
                  )}
                  {isScanning && (
                    <div className="text-cyan-400 animate-pulse block">Scanning segment subnet and sniffing Modbus responses... [Wait]</div>
                  )}
                </div>

                <div className="border-t border-prizm-border/60 pt-2.5 mt-2 flex justify-between items-center text-[10px] text-prizm-text-muted">
                  <span>Threads: 10 concurrency | Timeout: 1500ms</span>
                  <button onClick={() => setDiscoveryLogs([])} className="text-[9px] text-cyan-400 underline cursor-pointer">Clear Logs</button>
                </div>
              </div>

              {/* DISCOVERED DEVICE CANDIDATES */}
              <div className="lg:col-span-6 bg-prizm-bg p-4 rounded-lg border border-prizm-border flex flex-col justify-between h-[360px]">
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b border-prizm-border/60 pb-2">
                    <span className="font-mono text-xs font-bold text-prizm-text uppercase">Discovery candidates list ({discoveredDevices.length})</span>
                    {discoveredDevices.length > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded">Ready to Promote</span>
                    )}
                  </div>

                  <div className="overflow-y-auto max-h-56 divide-y divide-prizm-border/40 text-[11px] no-scrollbar">
                    {discoveredDevices.length === 0 ? (
                      <span className="block text-center py-10 font-mono text-prizm-text-muted italic">No newly scanned devices logged in target lists yet.</span>
                    ) : (
                      discoveredDevices.map(d => (
                        <div key={d.id} className="p-2 hover:bg-prizm-surface transition-colors flex justify-between items-center font-mono">
                          <div>
                            <span className="text-prizm-text font-bold block">{d.calloutLabel}</span>
                            <span className="text-cyan-400 text-[10px] block mt-0.5">{d.ip} — Confidence {d.confidence}% via {d.source}</span>
                          </div>
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 bg-prizm-surface-strong rounded border border-prizm-border ml-2 text-amber-500">
                            {d.deviceType.toUpperCase()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {discoveredDevices.length > 0 && (
                  <button
                    onClick={handlePromoteDiscoveredToProfile}
                    className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 font-mono font-bold text-black uppercase rounded block tracking-wider text-[11px] text-center cursor-pointer select-none"
                  >
                    Promote All Discovered to Permanent Subnet Overrides
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 4: SITE MAP & RESOLVED SITE DEVICES TABLE */}
        {activeTab === "sitemap" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-sm font-bold font-mono tracking-wider text-prizm-text uppercase">Unified Site Routing Table</h3>
                <p className="text-[10px] text-prizm-text-muted mt-1">
                  Active directory of all computed devices on site. Integrates formula-based layout rules together with manual technician override filters.
                </p>
              </div>

              {/* SEARCH FILTERS */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative font-mono text-[10.5px]">
                  <Search size={12} className="absolute left-2.5 top-2.5 text-prizm-text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search IP or label"
                    className="bg-prizm-bg border border-prizm-border rounded pl-8 pr-3 py-1.5 text-prizm-text focus:outline-none focus:border-cyan-500 w-44"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-prizm-bg border border-prizm-border rounded p-1.5 font-mono text-[10.5px]">
                  <Filter size={11} className="text-prizm-text-muted" />
                  <select
                    className="bg-transparent text-cyan-400 focus:outline-none font-bold"
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                  >
                    <option value="all">All Types</option>
                    <option value="cs">CS Collection</option>
                    <option value="es">ES String Ctrl</option>
                    <option value="pcs">PCS Block</option>
                    <option value="feather">Feathers</option>
                    <option value="hvac">HVAC System</option>
                  </select>
                </div>
              </div>
            </div>

            {/* MAIN DATA GRID */}
            <div className="overflow-x-auto border border-prizm-border bg-prizm-bg rounded max-h-96 no-scrollbar">
              <table className="w-full text-left font-mono text-[10px] whitespace-nowrap">
                <thead className="bg-prizm-surface-strong text-prizm-text-muted border-b border-prizm-border select-none">
                  <tr>
                    <th className="p-3 font-bold">IP Address</th>
                    <th className="p-3 font-bold">Calculated Callout Label</th>
                    <th className="p-3 font-bold">Classification</th>
                    <th className="p-3 font-bold">Subnet Match Type</th>
                    <th className="p-3 font-bold">Reachability</th>
                    <th className="p-3 font-bold">Source origin</th>
                    <th className="p-3 font-bold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-prizm-border/60">
                  {filteredDevicesList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center italic text-prizm-text-muted select-none">No resolved devices matched search parameters.</td>
                    </tr>
                  ) : (
                    filteredDevicesList.map((dev, idx) => {
                      const badgeColor = dev.deviceType === "cs" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                                       : dev.deviceType === "pcs" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/25"
                                       : dev.deviceType === "es" ? "bg-amber-500/10 text-amber-400 border border-amber-500/25"
                                       : "bg-blue-500/10 text-blue-400 border border-blue-500/25";
                      return (
                        <tr key={idx} className="hover:bg-prizm-surface">
                          <td className="p-3 font-bold text-prizm-text">{dev.ip}</td>
                          <td className="p-3 font-bold text-cyan-400">{dev.calloutLabel}</td>
                          <td className="p-3 font-semibold">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${badgeColor}`}>
                              {dev.deviceType.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 text-prizm-text-muted">Array Index: {dev.arrayIndex ?? "N/A"}</td>
                          <td className="p-3 font-bold">
                            <span className={dev.reachable !== false ? "text-emerald-400" : "text-prizm-danger"}>
                              {dev.reachable !== false ? "● ONLINE" : "■ TIMEOUT"}
                            </span>
                          </td>
                          <td className="p-3 text-prizm-text/80">{dev.source === "manual" ? "Technician Override" : "Scada Formula"}</td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleOpenOverrideModal(dev)}
                              className="px-2 py-1 bg-prizm-border hover:bg-cyan-500 hover:text-black rounded text-[9.5px] font-bold transition-all cursor-pointer"
                            >
                              Class Override
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* OVERRIDE RECORD MODAL / DRAWER */}
            {selectedDeviceForOverride && (
              <div className="bg-prizm-surface border border-cyan-400/50 p-5 rounded-lg space-y-4 font-mono text-[11px] max-w-lg">
                <div className="border-b border-cyan-400/20 pb-2.5 flex justify-between items-center">
                  <span className="text-cyan-400 font-bold block uppercase tracking-wider">Classify Target IP Interface: {selectedDeviceForOverride.ip}</span>
                  <button onClick={() => setSelectedDeviceForOverride(null)} className="text-prizm-text-muted underline cursor-pointer">Cancel</button>
                </div>

                <form onSubmit={handleApplyOverrideOnSitemap} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-prizm-text-muted uppercase block font-bold">Target Device Suffix Label</label>
                      <input
                        type="text"
                        className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text"
                        value={overrideLabel}
                        onChange={e => setOverrideLabel(e.target.value)}
                        placeholder="e.g. Override Test Array CS"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-prizm-text-muted uppercase block font-bold">Device Classification</label>
                      <select
                        className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-cyan-400 font-bold"
                        value={overrideType}
                        onChange={e => setOverrideType(e.target.value)}
                      >
                        <option value="cs">CS Collection Server</option>
                        <option value="es">ES String Controller</option>
                        <option value="pcs">PCS Converter Unit</option>
                        <option value="feather">Feather Module Node</option>
                        <option value="hvac">HVAC System Unit</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-prizm-text-muted uppercase block font-bold">Array Sector Index</label>
                      <input
                        type="number"
                        className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text"
                        value={overrideArray}
                        onChange={e => setOverrideArray(parseInt(e.target.value) || 1)}
                      />
                    </div>

                    {overrideType === "es" && (
                      <div className="space-y-1">
                        <label className="text-prizm-text-muted uppercase block font-bold">String String index</label>
                        <input
                          type="number"
                          className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text"
                          value={overrideString}
                          onChange={e => setOverrideString(parseInt(e.target.value) || 1)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-cyan-400 hover:bg-cyan-500 text-black rounded font-bold uppercase cursor-pointer"
                    >
                      Commit Overlay Override
                    </button>
                  </div>
                </form>
              </div>
            )}

          </div>
        )}

        {/* TAB 5: ALIGNMENT & VALIDATION REPORT AUDIT */}
        {activeTab === "validation" && (
          <div className="space-y-6 font-mono text-[11px]">
            <div className="flex justify-between items-center pb-2 border-b border-prizm-border/60">
              <div>
                <h3 className="text-sm font-bold tracking-wider text-prizm-text uppercase">System Integrity & Validation Engine</h3>
                <p className="text-[10px] text-prizm-text-muted mt-1">
                  Automated scan of physical layout definitions. Audits configuration matching against live Scada server caches to expose unreachable strings or collision errors.
                </p>
              </div>
              <button
                onClick={fetchValidationReport}
                disabled={isValidating}
                className="px-4 py-2 bg-prizm-border hover:bg-prizm-border-strong rounded font-bold text-prizm-text cursor-pointer transition select-none flex items-center gap-2"
              >
                <RefreshCw size={12} className={isValidating ? "animate-spin" : ""} />
                <span>Re-Audit Site</span>
              </button>
            </div>

            {/* RESULTS STATE */}
            {isValidating ? (
              <div className="py-20 text-center space-y-3">
                <RefreshCw size={24} className="text-cyan-400 animate-spin mx-auto" />
                <span className="text-[11px] block text-prizm-text-muted">Performing recursive scan sweeps & address collision checks...</span>
              </div>
            ) : validationOk ? (
              <div className="bg-emerald-500/10 border border-emerald-500/25 rounded p-5 space-y-3 text-emerald-400">
                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
                  <CheckCircle size={16} />
                  <span>ALL INTEGRITY AUDITS PASSED HEALTHY!</span>
                </div>
                <p className="text-[10.5px] text-emerald-400/80 leading-relaxed">
                  No overlapping IP subnet mapping collisions detected. PCS dashboard queries correctly resolve to physical IP address metrics list.
                  All local segment controller indices successfully adhere to active standard formula structures.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-amber-500/10 border border-amber-500/25 rounded p-4 flex items-center gap-2 text-amber-500">
                  <AlertTriangle size={15} />
                  <div>
                    <span className="font-bold text-xs uppercase tracking-wider block">INTEGRITY ALIGNMENT RECOMS ACTIVE</span>
                    <span className="text-[10px] block mt-0.5 text-prizm-text-muted">The auditing tool detected anomalies that may disrupt graph summaries or dashboard tables.</span>
                  </div>
                </div>

                {/* ERROR DETAILED BLOCKS */}
                <div className="space-y-3">
                  {validationErrors.map((err, idx) => (
                    <div key={idx} className="bg-prizm-bg p-4 rounded-lg border border-prizm-border flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`${err.level === "error" ? "bg-prizm-danger/10 text-prizm-danger" : "bg-amber-500/10 text-amber-500"} text-[8px] font-bold px-1.5 py-0.5 rounded uppercase font-mono`}>
                            {err.level.toUpperCase()}
                          </span>
                          <strong className="text-prizm-text text-[11.5px]">{err.type}</strong>
                        </div>
                        <p className="text-[10px] text-prizm-text-muted mt-1.5 leading-relaxed">{err.message}</p>
                      </div>

                      {/* FIX ACTION ATTACHMENT */}
                      {err.type === "PCS_MAPPED_TO_SYNTHETIC" && (
                        <button
                          onClick={() => applyAutoFixRecommendation(err.type)}
                          className="shrink-0 px-3 py-1.5 bg-cyan-400 hover:bg-cyan-500 text-black text-[10px] font-bold uppercase rounded cursor-pointer self-center"
                        >
                          Auto-Align PCS
                        </button>
                      )}
                      {err.type === "EMS_HOST_NOT_IN_SUBNET" && (
                        <button
                          onClick={() => applyAutoFixRecommendation(err.type)}
                          className="shrink-0 px-3 py-1.5 bg-cyan-400 hover:bg-cyan-500 text-black text-[10px] font-bold uppercase rounded cursor-pointer self-center"
                        >
                          Auto-Sync Prefix
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AUDITOR METADATA SPECIFICATIONS */}
            <div className="bg-prizm-bg/50 p-4 rounded border border-prizm-border text-[9.5px] text-prizm-text-muted leading-relaxed space-y-1.5">
              <span className="text-cyan-400 font-bold block uppercase tracking-wider">Engine Diagnostic Specs:</span>
              <div>A. Subnet Mask check bounds: <span className="text-prizm-text">{basePrefix}.x.x/16</span> for target segmentation.</div>
              <div>B. Modbus-TCP port collision listener checks: ports 502, 4502 active on core sector LAN networks.</div>
              <div>C. PcsDashboard dependency trace: references resolved IP targets to feed real telemetry rows.</div>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
