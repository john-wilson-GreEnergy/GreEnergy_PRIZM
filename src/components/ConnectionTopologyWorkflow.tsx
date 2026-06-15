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
  Info
} from "lucide-react";

interface TopologyModel {
  type: "standard-array-segment" | "custom-manual";
  basePrefix: string;
  arrayOctet: number;
  segmentOctet: number;
  arrayStart: number;
  arrayEnd: number;
  segmentStart: number;
  segmentEnd: number;
  csSegment: number;
  esSegmentStart: number;
  esSegmentStep: number;
  esCountPerArray: number;
}

interface EmsProfile {
  id?: string;
  profileName: string;
  siteName: string;
  stationCode: string;
  blockIndex: number;
  emsHost: string;
  emsPort: number;
  turtlePath: string;
  modbusHost: string;
  modbusPort: number;
  modbusUnitId: number;
  arrayCount: number;
  stringsPerArray: number;
  notes: string;
  isActive?: boolean;
  topologyModel: TopologyModel;
}

export default function ConnectionTopologyWorkflow() {
  // Profiles list
  const [profiles, setProfiles] = useState<EmsProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  // Active step (1 to 6)
  const [step, setStep] = useState<number>(1);

  // Form Fields States
  const [profileName, setProfileName] = useState("SS4 Local EMS");
  const [siteName, setSiteName] = useState("Solar Star 4");
  const [stationCode, setStationCode] = useState("BHE0021");
  const [blockIndex, setBlockIndex] = useState(1);
  const [notes, setNotes] = useState("Technician generated subnet topology profile");

  // Step 2 Fields
  const [emsHost, setEmsHost] = useState("10.0.0.3");
  const [emsPort, setEmsPort] = useState(8080);
  const [turtlePath, setTurtlePath] = useState("/turtle");
  const [modbusHost, setModbusHost] = useState("10.0.0.3");
  const [modbusPort, setModbusPort] = useState(4502);
  const [modbusUnitId, setModbusUnitId] = useState(1);

  // Step 3 Fields
  const [topologyType, setTopologyType] = useState<"standard-array-segment" | "custom-manual">("standard-array-segment");
  const [basePrefix, setBasePrefix] = useState("10.0");
  const [arrayStart, setArrayStart] = useState(1);
  const [arrayEnd, setArrayEnd] = useState(8);
  const [segmentStart, setSegmentStart] = useState(3);
  const [segmentEnd, setSegmentEnd] = useState(110);

  // Step 4 Fields
  const [arrayCount, setArrayCount] = useState(8);
  const [stringsPerArray, setStringsPerArray] = useState(40);
  const [csSegment, setCsSegment] = useState(3);
  const [esSegmentStart, setEsSegmentStart] = useState(10);
  const [esSegmentStep, setEsSegmentStep] = useState(5);
  const [esCountPerArray, setEsCountPerArray] = useState(20);

  // Safe Network Guard & Validation state
  const [promptOnMismatch, setPromptOnMismatch] = useState(true);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [savedProfile, setSavedProfile] = useState<any>(null);

  // Terminal actions log state
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "PRIZM diagnostic terminal ready.",
    "Awaiting technician connection/topology actions..."
  ]);
  const [testing, setTesting] = useState(false);

  // Sync / Load existing profiles
  const fetchProfiles = async () => {
    setLoadingProfiles(true);
    try {
      const res = await fetch("/api/settings/profiles");
      if (res.ok) {
        const data = await res.json();
        setProfiles(data);
        // Prepopulate form if active profile exists
        const active = data.find((p: any) => p.isActive) || data[0];
        if (active) {
          loadProfileIntoForm(active);
        }
      }
    } catch (e) {
      logToTerminal("System failure loading profiles registry database: " + String(e));
    } finally {
      setLoadingProfiles(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const loadProfileIntoForm = (p: EmsProfile) => {
    setProfileName(p.profileName || "SS4 Local EMS");
    setSiteName(p.siteName || "Solar Star 4");
    setStationCode(p.stationCode || "BHE0021");
    setBlockIndex(p.blockIndex || 1);
    setNotes(p.notes || "");
    setEmsHost(p.emsHost || "10.0.0.3");
    setEmsPort(p.emsPort || 8080);
    setTurtlePath(p.turtlePath || "/turtle");
    setModbusHost(p.modbusHost || "10.0.0.3");
    setModbusPort(p.modbusPort || 4502);
    setModbusUnitId(p.modbusUnitId || 1);

    if (p.topologyModel) {
      setTopologyType(p.topologyModel.type || "standard-array-segment");
      setBasePrefix(p.topologyModel.basePrefix || "10.0");
      setArrayStart(p.topologyModel.arrayStart || 1);
      setArrayEnd(p.topologyModel.arrayEnd || 8);
      setSegmentStart(p.topologyModel.segmentStart || 3);
      setSegmentEnd(p.topologyModel.segmentEnd || 75);
      setCsSegment(p.topologyModel.csSegment || 3);
      setEsSegmentStart(p.topologyModel.esSegmentStart || 10);
      setEsSegmentStep(p.topologyModel.esSegmentStep || 5);
      setEsCountPerArray(p.topologyModel.esCountPerArray || 20);
    }

    setArrayCount(p.arrayCount || 8);
    setStringsPerArray(p.stringsPerArray || 40);

    logToTerminal(`Loaded template profile: "${p.profileName || "Default"}" into active workspace memory.`);
  };

  const logToTerminal = (msg: string) => {
    const timestamp = new Date().toISOString().slice(11, 19);
    setTerminalLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
  };

  const handleUseEmsForModbus = () => {
    setModbusHost(emsHost);
    logToTerminal("Copied EMS target address host directly over Modbus target host address.");
  };

  // Run read-only action
  const runTestAction = async (action: string, extraParams: any = {}) => {
    setTesting(true);
    logToTerminal(`Initiating safe diagnostics action: ${action.toUpperCase()}`);

    const payload = {
      action,
      ip: extraParams.ip,
      host: emsHost,
      port: action === "tcp-connect" ? emsPort : modbusPort,
      profile: {
        profileName,
        siteName,
        stationCode,
        blockIndex,
        emsHost,
        emsPort,
        turtlePath,
        modbusHost,
        modbusPort,
        modbusUnitId,
        arrayCount,
        stringsPerArray,
        topologyModel: {
          type: topologyType,
          basePrefix,
          arrayOctet: 3,
          segmentOctet: 4,
          arrayStart,
          arrayEnd,
          segmentStart,
          segmentEnd,
          csSegment,
          esSegmentStart,
          esSegmentStep,
          esCountPerArray
        }
      }
    };

    try {
      const res = await fetch("/api/settings/profiles/test-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const result = await res.json();
        logToTerminal(result.message);
      } else {
        const errData = await res.json();
        logToTerminal(`Test failed: ${errData.error || "Unknown network error"}`);
      }
    } catch (err: any) {
      logToTerminal(`Network failure contacting loop diagnostics: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  // Client side validation rules
  const validateCurrentState = (): string[] => {
    const errs: string[] = [];
    if (!profileName.trim()) errs.push("Profile Name cannot be blank");
    if (!siteName.trim()) errs.push("Site Name cannot be blank");
    if (!stationCode.trim()) errs.push("Station Code cannot be blank");

    const ePort = Number(emsPort);
    if (isNaN(ePort) || ePort < 1 || ePort > 65535) errs.push("EMS HTTP port must be between 1 and 65535");

    const mPort = Number(modbusPort);
    if (isNaN(mPort) || mPort < 1 || mPort > 65535) errs.push("Modbus TCP port must be between 1 and 65535");

    if (!turtlePath.startsWith("/")) errs.push("Turtle path endpoint route must start with '/'");

    if (topologyType === "standard-array-segment") {
      const prefix = basePrefix.trim();
      const parts = prefix.split(".");
      if (parts.length !== 2 || parts.some(p => {
        const num = Number(p);
        return isNaN(num) || num < 0 || num > 255 || p === "";
      })) {
        errs.push("Base Subnet Prefix must contain exactly two valid IPv4 octets (e.g. '10.0' or '172.16')");
      }

      const arrStart = Number(arrayStart);
      const arrEnd = Number(arrayEnd);
      if (isNaN(arrStart) || arrStart < 1 || arrStart > 254) errs.push("Topology Array Start range must be 1 to 254");
      if (isNaN(arrEnd) || arrEnd < 1 || arrEnd > 254) errs.push("Topology Array End range must be 1 to 254");
      if (arrStart > arrEnd) errs.push("Array Start cannot be greater than Array End");

      const segMin = Number(segmentStart);
      const segMax = Number(segmentEnd);
      if (isNaN(segMin) || segMin < 1 || segMin > 254) errs.push("Min scan segment must be between 1 and 254");
      if (isNaN(segMax) || segMax < 1 || segMax > 254) errs.push("Max scan segment must be between 1 and 254");
      if (segMin > segMax) errs.push("Min scan segment cannot be greater than Max scan segment");

      const csSeg = Number(csSegment);
      if (isNaN(csSeg) || csSeg < segMin || csSeg > segMax) {
        errs.push(`CS Segment suffix (${csSeg}) must reside inside the scan range bounds [${segMin} to ${segMax}]`);
      }

      const esStart = Number(esSegmentStart);
      if (isNaN(esStart) || esStart < segMin || esStart > segMax) {
        errs.push(`ES Segment Start suffix (${esStart}) must reside inside the scan range bounds [${segMin} to ${segMax}]`);
      }

      const count = Number(esCountPerArray);
      const step = Number(esSegmentStep);
      if (isNaN(count) || count < 1) errs.push("ES Count Per Array must be at least 1");
      if (isNaN(step) || step < 1) errs.push("ES Segment address step multiplier must be at least 1");

      const maxEsSeg = esStart + (count - 1) * step;
      if (maxEsSeg > segMax) {
        errs.push(`Calculated ES segment suffix (${maxEsSeg}) would exceed your specified scan limit: ${segMax}`);
      }
    }

    return errs;
  };

  // Preview data generation block
  const previewRows = (() => {
    try {
      const rows = [];
      const arrStart = Number(arrayStart) || 1;
      const arrEnd = Number(arrayEnd) || 8;
      const csSeg = Number(csSegment) || 3;
      const esStart = Number(esSegmentStart) || 10;
      const esStep = Number(esSegmentStep) || 5;
      const esCount = Number(esCountPerArray) || 20;
      const prefix = basePrefix.trim() || "10.0";

      // Limit rows generated count to avoid visual browser lockup
      const loopEnd = Math.min(arrEnd, arrStart + 3);

      for (let array = arrStart; array <= loopEnd; array++) {
        rows.push({
          array,
          device: "CS",
          segment: csSeg,
          ipAddress: `${prefix}.${array}.${csSeg}`,
          purpose: `Collection Segment ${array}`
        });

        for (let c = 0; c < Math.min(esCount, 4); c++) {
          const segment = esStart + c * esStep;
          rows.push({
            array,
            device: `ES${c + 1}`,
            segment,
            ipAddress: `${prefix}.${array}.${segment}`,
            purpose: `Energy Segment ${c + 1}`
          });
        }
        if (esCount > 4) {
          rows.push({
            array,
            device: `ES${5}...ES${esCount}`,
            segment: esStart + 4 * esStep,
            ipAddress: `${prefix}.${array}.[Many]`,
            purpose: `Segment sequence up to ES${esCount}`
          });
        }
      }

      if (arrEnd > loopEnd) {
        rows.push({
          array: arrEnd,
          device: "ALL ARRAYS",
          segment: 0,
          ipAddress: `${prefix}.[${loopEnd + 1}..${arrEnd}].[All]`,
          purpose: `Additional ${arrEnd - loopEnd} arrays not shown in preview list`
        });
      }

      return rows;
    } catch (e) {
      return [];
    }
  })();

  const handleNextStep = () => {
    const errs = validateCurrentState();
    if (errs.length > 0 && step < 5) {
      setValidationErrors(errs);
      logToTerminal(`Validation failed: ${errs[0]} (and ${errs.length - 1} other warning flags)`);
      return;
    }
    setValidationErrors([]);
    setStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setStep(prev => prev - 1);
  };

  const handleSaveAndActivate = async (activate: boolean) => {
    const errs = validateCurrentState();
    if (errs.length > 0) {
      setValidationErrors(errs);
      return;
    }

    setTesting(true);
    logToTerminal(`Saving configuration profile profileName="${profileName}"`);

    const payloadProfile = {
      profileName,
      siteName,
      stationCode,
      blockIndex: Number(blockIndex),
      emsHost,
      emsPort: Number(emsPort),
      turtlePath,
      modbusHost,
      modbusPort: Number(modbusPort),
      modbusUnitId: Number(modbusUnitId),
      arrayCount: Number(arrayCount),
      stringsPerArray: Number(stringsPerArray),
      notes,
      activate,
      topologyModel: {
        type: topologyType,
        basePrefix: basePrefix.trim(),
        arrayOctet: 3,
        segmentOctet: 4,
        arrayStart: Number(arrayStart),
        arrayEnd: Number(arrayEnd),
        segmentStart: Number(segmentStart),
        segmentEnd: Number(segmentEnd),
        csSegment: Number(csSegment),
        esSegmentStart: Number(esSegmentStart),
        esSegmentStep: Number(esSegmentStep),
        esCountPerArray: Number(esCountPerArray)
      }
    };

    try {
      // Check if we can overwrite an existing profile ID
      // To do this elegantly, we see if we can perform POST to /profiles
      const res = await fetch("/api/settings/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadProfile)
      });

      if (res.ok) {
        const result = await res.json();
        setSavedProfile(result);
        logToTerminal(`Successfully stored connection & topology profile to persistent flash registry!`);
        if (activate) {
          logToTerminal(`Activated profile as main active system gateway!`);
          if (promptOnMismatch) {
            logToTerminal(`[SAFEGUARD] Technician network safeguard prompt initialized. Netmask discrepancy audits enabled.`);
          }
        }
        setStep(6);
        fetchProfiles();
      } else {
        const errData = await res.json();
        logToTerminal(`Save error response: ${errData.error || "Access Denied"}`);
        setValidationErrors([errData.error || "Failed saving profile settings."]);
      }
    } catch (err: any) {
      logToTerminal(`Profile store write command interrupted: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* HEADER DESCRIPTION CARD */}
      <div className="bg-prizm-surface-strong border border-prizm-border p-5 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Network className="text-cyan-400" size={18} />
            <h2 className="text-sm font-bold font-mono tracking-widest text-prizm-text uppercase">IP Topology Configuration</h2>
          </div>
          <p className="text-[11px] font-sans text-prizm-text-muted mt-1 max-w-2xl">
            Technician-friendly network mapping workflow. Directly configure EMS routes, Modbus unit boundaries, 
            and standard BESS subnets. Modifies first two octets of device IPs while auto-calculating hardware third & fourth octet segments.
          </p>
        </div>
        
        {/* TEMPLATE DROP DOWN */}
        <div className="shrink-0 flex items-center gap-2 bg-prizm-bg p-2 rounded border border-prizm-border select-none">
          <Terminal size={12} className="text-prizm-text-muted" />
          <span className="text-[10px] font-mono font-bold text-prizm-text-muted">TEMPLATE PROFILE:</span>
          {loadingProfiles ? (
            <span className="text-[10px] font-mono text-cyan-400 animate-pulse">Scanning...</span>
          ) : (
            <select
              className="bg-transparent text-[10px] text-cyan-400 font-mono font-bold focus:outline-none cursor-pointer"
              onChange={(e) => {
                const found = profiles.find(f => f.id === e.target.value);
                if (found) loadProfileIntoForm(found);
              }}
              defaultValue=""
            >
              <option value="" disabled>-- Use Saved Template --</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id} className="bg-prizm-surface-strong text-prizm-text">
                  {p.profileName} {p.isActive ? "[ACTIVE]" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* STEP PROGRESS TRACKER */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center select-none font-mono text-[10px]">
        {[
          { num: 1, label: "Site Identity" },
          { num: 2, label: "EMS / Modbus" },
          { num: 3, label: "IP Topology" },
          { num: 4, label: "Arrays Count" },
          { num: 5, label: "Test / Preview" },
          { num: 6, label: "Done" }
        ].map((s) => {
          const isActive = step === s.num;
          const isDone = step > s.num;
          return (
            <div
              key={s.num}
              className={`p-2.5 rounded border transition-all ${
                isActive
                  ? "bg-cyan-500/10 border-cyan-400 text-cyan-400 font-bold"
                  : isDone
                  ? "bg-prizm-surface-strong border-prizm-border text-emerald-400"
                  : "bg-prizm-surface/40 border-prizm-border/40 text-prizm-text-muted"
              }`}
            >
              <div className="font-semibold block uppercase">Step {s.num}</div>
              <div className="truncate mt-0.5">{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* VALIDATION ERROR INDICATOR */}
      {validationErrors.length > 0 && (
        <div className="bg-prizm-danger/10 border border-prizm-danger text-prizm-danger text-xs font-mono p-3 rounded-md space-y-2">
          <div className="flex items-center gap-1.5 font-bold uppercase">
            <AlertTriangle size={14} />
            <span>Workflow Interrupted: Field Validation Errors</span>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] opacity-90">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
          {validationErrors.some(e => e.includes("exceed your specified scan limit") || e.includes("will exceed the Scan Segment Max")) && (
            <div className="mt-2.5 pt-2 border-t border-prizm-danger/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[10px] text-prizm-text-muted">
                Quick-fix: Dynamic segment count overlaps scan frame. Auto-expand scan limits?
              </span>
              <button
                type="button"
                onClick={() => {
                  const computedMax = Number(esSegmentStart) + (Number(esCountPerArray) - 1) * Number(esSegmentStep);
                  setSegmentEnd(computedMax);
                  setValidationErrors([]);
                  logToTerminal(`System-Auto-Adjusted Scan Segment Max to ${computedMax} to satisfy topology bounds.`);
                }}
                className="px-3 py-1 bg-cyan-500 hover:bg-cyan-600 text-black rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer self-start sm:self-center"
              >
                Auto-Adjust Scan Max to {Number(esSegmentStart) + (Number(esCountPerArray) - 1) * Number(esSegmentStep)}
              </button>
            </div>
          )}
        </div>
      )}

      {/* WORKSPACE CENTRAL FORM BODY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* VIEW AREA */}
        <div className="lg:col-span-8 bg-prizm-surface border border-prizm-border rounded-lg p-5 min-h-[380px] flex flex-col justify-between">
          
          {/* STEP 1: SITE IDENTITY */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="border-b border-prizm-border pb-2">
                <h3 className="text-xs font-bold font-mono tracking-wider text-prizm-text uppercase">Step 1 — Site Identity</h3>
                <span className="text-[10px] text-prizm-text-muted font-mono block">Provide basic BESS station identity tags for reports branding.</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-[11px]">
                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">Profile Name</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-cyan-400 focus:outline-none focus:border-cyan-500 font-bold"
                    placeholder="e.g. SS4 Local EMS"
                  />
                  <span className="text-[9px] text-prizm-text-muted block">A unique technician label for selection.</span>
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">Site Name</label>
                  <input
                    type="text"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                    placeholder="e.g. Solar Star 4"
                  />
                  <span className="text-[9px] text-prizm-text-muted block">The descriptive utility asset site label.</span>
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">Station Code</label>
                  <input
                    type="text"
                    value={stationCode}
                    onChange={(e) => setStationCode(e.target.value)}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500 uppercase font-bold"
                    placeholder="e.g. BHE0021"
                  />
                  <span className="text-[9px] text-prizm-text-muted block">Substation contract identifier lookup code.</span>
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">Block Index</label>
                  <input
                    type="number"
                    value={blockIndex}
                    onChange={(e) => setBlockIndex(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[9px] text-prizm-text-muted block">BESS segment cell container index.</span>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">Substation Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                    placeholder="Add notes..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: EMS / MODBUS */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="border-b border-prizm-border pb-2">
                <h3 className="text-xs font-bold font-mono tracking-wider text-prizm-text uppercase">Step 2 — EMS & Modbus Configurations</h3>
                <span className="text-[10px] text-prizm-text-muted font-mono block">Configure LAN integration parameters for SCADA.</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-[11px]">
                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">EMS Host / IP</label>
                  <input
                    type="text"
                    value={emsHost}
                    onChange={(e) => setEmsHost(e.target.value)}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-cyan-400 focus:outline-none focus:border-cyan-500 font-bold"
                  />
                  <span className="text-[9px] text-prizm-text-muted block">Default: 10.0.0.3</span>
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">EMS HTTP Port</label>
                  <input
                    type="number"
                    value={emsPort}
                    onChange={(e) => setEmsPort(parseInt(e.target.value, 10) || 8080)}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[9px] text-prizm-text-muted block">Default: 8080</span>
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">Turtle Path</label>
                  <input
                    type="text"
                    value={turtlePath}
                    onChange={(e) => setTurtlePath(e.target.value)}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[9px] text-prizm-text-muted block">Default: /turtle</span>
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">Modbus Host / IP</label>
                  <input
                    type="text"
                    value={modbusHost}
                    onChange={(e) => setModbusHost(e.target.value)}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-cyan-400 focus:outline-none focus:border-cyan-500 font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">Modbus TCP Port</label>
                  <input
                    type="number"
                    value={modbusPort}
                    onChange={(e) => setModbusPort(parseInt(e.target.value, 10) || 4502)}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">Modbus Unit ID</label>
                  <input
                    type="number"
                    value={modbusUnitId}
                    onChange={(e) => setModbusUnitId(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500 font-bold"
                  />
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex flex-wrap gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => runTestAction("tcp-connect")}
                  className="px-3 py-1.5 bg-black/20 hover:bg-black/35 border border-prizm-border rounded text-[10px] text-prizm-text hover:text-cyan-400 font-mono font-bold uppercase cursor-pointer"
                >
                  Test EMS HTTP
                </button>
                <button
                  type="button"
                  onClick={() => runTestAction("modbus-test")}
                  className="px-3 py-1.5 bg-black/20 hover:bg-black/35 border border-prizm-border rounded text-[10px] text-prizm-text hover:text-cyan-400 font-mono font-bold uppercase cursor-pointer"
                >
                  Test Modbus TCP
                </button>
                <button
                  type="button"
                  onClick={handleUseEmsForModbus}
                  className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-black rounded text-[10px] font-mono font-bold uppercase cursor-pointer ms-auto"
                >
                  Use EMS Host for Modbus Host
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: IP TOPOLOGY */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="border-b border-prizm-border pb-2">
                <h3 className="text-xs font-bold font-mono tracking-wider text-prizm-text uppercase">Step 3 — IP Topology Model</h3>
                <span className="text-[10px] text-prizm-text-muted font-mono block">Enforce structure for standard field IP models.</span>
              </div>

              <div className="space-y-3 font-mono text-[11px]">
                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">Topology Model Selection</label>
                  <select
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500 font-bold"
                    value={topologyType}
                    onChange={(e) => setTopologyType(e.target.value as any)}
                  >
                    <option value="standard-array-segment">Standard PRIZM Array/Segment Model</option>
                    <option value="custom-manual">Custom Manual Topology</option>
                  </select>
                </div>

                {topologyType === "standard-array-segment" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1">
                      <label className="text-cyan-400 font-bold uppercase block">Base Subnet Prefix (A.B)</label>
                      <input
                        type="text"
                        value={basePrefix}
                        onChange={(e) => setBasePrefix(e.target.value)}
                        className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-cyan-400 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                        placeholder="e.g. 10.0"
                      />
                      <span className="text-[9px] text-prizm-text-muted block">Change only first two octets. Last two auto-filled.</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-prizm-text-muted uppercase font-bold block">Array Octet</label>
                        <div className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text-muted font-bold cursor-not-allowed">
                          3rd Octet
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-prizm-text-muted uppercase font-bold block">Segment Octet</label>
                        <div className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text-muted font-bold cursor-not-allowed">
                          4th Octet
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-prizm-text-muted uppercase font-bold block">Array Start</label>
                        <input
                          type="number"
                          value={arrayStart}
                          onChange={(e) => setArrayStart(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-prizm-text-muted uppercase font-bold block">Array End</label>
                        <input
                          type="number"
                          value={arrayEnd}
                          onChange={(e) => setArrayEnd(Math.max(1, parseInt(e.target.value, 10) || 8))}
                          className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500 font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-prizm-text-muted uppercase font-bold block">Scan Segment Min</label>
                        <input
                          type="number"
                          value={segmentStart}
                          onChange={(e) => setSegmentStart(Math.max(1, parseInt(e.target.value, 10) || 3))}
                          className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-prizm-text-muted uppercase font-bold block">Scan Segment Max</label>
                        <input
                          type="number"
                          value={segmentEnd}
                          onChange={(e) => setSegmentEnd(Math.max(1, parseInt(e.target.value, 10) || 75))}
                          className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500 font-bold"
                        />
                      </div>
                    </div>

                    {/* LIVE EXAMPLES ACCENT LINE */}
                    <div className="sm:col-span-2 bg-prizm-bg p-3 rounded border border-prizm-border/60">
                      <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest mb-1.5">Live Generation Examples:</div>
                      <div className="space-y-1 text-[10px] text-prizm-text opacity-95">
                        <div className="flex justify-between"><span>Array 1 / CS</span> <span className="text-emerald-400 font-bold">➔ {basePrefix || "10.0"}.1.3</span></div>
                        <div className="flex justify-between"><span>Array 1 / ES1 (Segment 10)</span> <span className="text-emerald-400 font-bold">➔ {basePrefix || "10.0"}.1.10</span></div>
                        <div className="flex justify-between"><span>Array 1 / ES2 (Segment 15)</span> <span className="text-emerald-400 font-bold">➔ {basePrefix || "10.0"}.1.15</span></div>
                        <div className="flex justify-between"><span>Array 2 / CS</span> <span className="text-emerald-400 font-bold">➔ {basePrefix || "10.0"}.2.3</span></div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-prizm-bg p-4 rounded border border-prizm-border text-prizm-text-muted text-[10.5px]">
                    <div className="font-bold flex items-center gap-1.5 text-prizm-warning mb-2 uppercase">
                      <AlertTriangle size={14} />
                      <span>Custom Manual Topology Model Activated</span>
                    </div>
                    Manual settings dictate IP ranges are fetched by checking individual static records and direct router ARP lookup maps.
                    The wizard will not auto-populate BESS blocks by incrementing subnets. Save is fully permissible.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: ARRAYS & SEGMENTS COUNT */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="border-b border-prizm-border pb-2">
                <h3 className="text-xs font-bold font-mono tracking-wider text-prizm-text uppercase">Step 4 — Arrays & Segment Hardware Mapping</h3>
                <span className="text-[10px] text-prizm-text-muted font-mono block">Declare battery string quantities and specific suffix IDs.</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-[11px]">
                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">Array Count</label>
                  <input
                    type="number"
                    value={arrayCount}
                    onChange={(e) => setArrayCount(Math.max(1, parseInt(e.target.value, 10) || 8))}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-cyan-400 focus:outline-none focus:border-cyan-500 font-bold"
                  />
                  <span className="text-[9px] text-prizm-text-muted block">Default: 8</span>
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">Strings Per Array</label>
                  <input
                    type="number"
                    value={stringsPerArray}
                    onChange={(e) => setStringsPerArray(Math.max(1, parseInt(e.target.value, 10) || 40))}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[9px] text-prizm-text-muted block">Default: 40</span>
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">CS Segment ID</label>
                  <input
                    type="number"
                    value={csSegment}
                    onChange={(e) => setCsSegment(Math.max(1, parseInt(e.target.value, 10) || 3))}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[9px] text-prizm-text-muted block">Octet 4 value (Default 3)</span>
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">ES Segment Start</label>
                  <input
                    type="number"
                    value={esSegmentStart}
                    onChange={(e) => setEsSegmentStart(Math.max(1, parseInt(e.target.value, 10) || 10))}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">ES Segment Step</label>
                  <input
                    type="number"
                    value={esSegmentStep}
                    onChange={(e) => setEsSegmentStep(Math.max(1, parseInt(e.target.value, 10) || 5))}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase font-bold block">ES Count Per Array</label>
                  <input
                    type="number"
                    value={esCountPerArray}
                    onChange={(e) => setEsCountPerArray(Math.max(1, parseInt(e.target.value, 10) || 20))}
                    className="w-full bg-prizm-bg border border-prizm-border rounded p-2 text-prizm-text focus:outline-none focus:border-cyan-500 font-bold"
                  />
                </div>
              </div>

              {/* AUTOMATED TEXT BOX */}
              <div className="bg-prizm-bg p-3.5 rounded border border-prizm-border text-[9.5px] font-mono text-prizm-text-muted">
                <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest mb-1">Generated IP Sequence Preview:</div>
                CS device maps to <span className="text-yellow-400">{basePrefix}.array.{csSegment}</span>.<br />
                ES devices map sequence: <span className="text-cyan-400">ES1➔{basePrefix}.array.{esSegmentStart}</span>, <span className="text-cyan-400">ES2➔{basePrefix}.array.{esSegmentStart + esSegmentStep}</span>, <span className="text-cyan-400">ES3➔{basePrefix}.array.{esSegmentStart + esSegmentStep*2}</span> up to {esCountPerArray} ES segments.
              </div>
            </div>
          )}

          {/* STEP 5: PREVIEW & VERIFY */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="border-b border-prizm-border pb-2 flex justify-between items-end">
                <div>
                  <h3 className="text-xs font-bold font-mono tracking-wider text-prizm-text uppercase">Step 5 — Preview & Validate Topology</h3>
                  <span className="text-[10px] text-prizm-text-muted font-mono block">Review generated subnet assignments before committing changes to memory.</span>
                </div>
              </div>

              {/* TABLE CONTAINER */}
              <div className="overflow-x-auto border border-prizm-border bg-prizm-bg rounded max-h-56 no-scrollbar">
                <table className="w-full text-left font-mono text-[10px] whitespace-nowrap">
                  <thead className="bg-prizm-surface-strong text-prizm-text-muted border-b border-prizm-border">
                    <tr>
                      <th className="p-2 font-bold">Array</th>
                      <th className="p-2 font-bold">Device</th>
                      <th className="p-2 font-bold">Segment</th>
                      <th className="p-2 font-bold">IP Address</th>
                      <th className="p-2 font-bold">Purpose</th>
                      <th className="p-2 font-bold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-prizm-border/60">
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-prizm-surface p-1">
                        <td className="p-2 text-cyan-400 font-bold">{row.array}</td>
                        <td className="p-2 font-bold">{row.device}</td>
                        <td className="p-2 font-semibold text-prizm-text-muted">{row.segment}</td>
                        <td className="p-2 font-bold text-emerald-400">{row.ipAddress}</td>
                        <td className="p-2 text-[9px] text-prizm-text-muted truncate max-w-44">{row.purpose}</td>
                        <td className="p-1 text-center">
                          {row.segment > 0 && (
                            <button
                              type="button"
                              onClick={() => runTestAction("ping", { ip: row.ipAddress })}
                              className="px-2 py-0.5 text-[8px] bg-black/30 border border-prizm-border rounded hover:text-cyan-400 font-bold uppercase tracking-wider cursor-pointer font-mono"
                            >
                              Ping
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* SAFEGUARD CONTROL SWITCH */}
              <div className="bg-prizm-bg p-3 rounded border border-prizm-border flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono text-[10.5px]">
                  <ShieldCheck size={16} className="text-cyan-400" />
                  <div>
                    <span className="font-bold text-prizm-text block uppercase">Safety Network Audit Prompt</span>
                    <span className="text-[9px] text-prizm-text-muted">Prompt technician for verification if active network IP mismatch is audited later.</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={promptOnMismatch}
                  onChange={(e) => setPromptOnMismatch(e.target.checked)}
                  className="rounded bg-prizm-bg border-prizm-border text-cyan-400 focus:ring-cyan-500 h-4 w-4 cursor-pointer"
                />
              </div>

              {/* ACTIONS PANEL */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-prizm-border">
                <button
                  type="button"
                  onClick={() => runTestAction("tcp-connect")}
                  className="px-2.5 py-1.5 bg-black/15 hover:bg-black/25 border border-prizm-border rounded text-[9.5px] font-mono font-bold uppercase cursor-pointer"
                >
                  Test EMS
                </button>
                <button
                  type="button"
                  onClick={() => runTestAction("modbus-test")}
                  className="px-2.5 py-1.5 bg-black/15 hover:bg-black/25 border border-prizm-border rounded text-[9.5px] font-mono font-bold uppercase cursor-pointer"
                >
                  Test Modbus
                </button>
                <button
                  type="button"
                  onClick={() => runTestAction("ping", { ip: `${basePrefix}.1.${csSegment}` })}
                  className="px-2.5 py-1.5 bg-black/15 hover:bg-black/25 border border-prizm-border rounded text-[9.5px] font-mono font-bold uppercase cursor-pointer"
                >
                  Ping Sample Devices
                </button>
                <button
                  type="button"
                  onClick={() => runTestAction("scan-topology")}
                  className="px-2.5 py-1.5 bg-black/15 hover:bg-black/25 border border-prizm-border rounded text-[9.5px] font-mono font-bold uppercase cursor-pointer"
                >
                  Scan Topology
                </button>
                
                <button
                  type="button"
                  onClick={() => handleSaveAndActivate(false)}
                  disabled={testing}
                  className="px-3.5 py-1.5 bg-prizm-surface-strong hover:bg-prizm-surface border border-cyan-400/40 hover:border-cyan-400 text-cyan-400 rounded text-[9.5px] font-mono font-bold uppercase cursor-pointer ms-auto"
                >
                  Save Profile
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveAndActivate(true)}
                  disabled={testing}
                  className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-black rounded text-[9.5px] font-mono font-bold uppercase cursor-pointer"
                >
                  Save and Activate
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: DONE / COMPLETED */}
          {step === 6 && (
            <div className="space-y-6 text-center py-10 font-mono">
              <div className="inline-flex items-center justify-center h-16 w-16 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/30 mb-2">
                <CheckCircle size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-bold text-emerald-400 uppercase tracking-widest">Profile Saved & Synchronized!</h3>
                <p className="text-[11px] text-prizm-text-muted max-w-md mx-auto">
                  The connection profile <span className="text-cyan-400 font-bold">"{profileName}"</span> was written safely to persistent storage data/prizm_connection_profiles.json.
                </p>
              </div>

              {/* GENERATED INFO OVERVIEW */}
              <div className="bg-prizm-bg p-4 rounded border border-prizm-border max-w-lg mx-auto text-left text-[10px] space-y-2">
                <div className="font-bold text-center border-b border-prizm-border pb-1 text-cyan-400 uppercase">ACTIVE CONFIGURATION REPORT</div>
                <div className="flex justify-between"><span>Site Assigned:</span> <span className="text-prizm-text font-bold">{siteName}</span></div>
                <div className="flex justify-between"><span>Station Identifier Code:</span> <span className="text-prizm-text font-bold uppercase">{stationCode}</span></div>
                <div className="flex justify-between"><span>EMS Gateway Server:</span> <span className="text-prizm-text font-semibold">{emsHost}:{emsPort}</span></div>
                <div className="flex justify-between font-bold"><span>Subnet Topology Prefix:</span> <span className="text-emerald-400">{basePrefix}.*</span></div>
                <div className="flex justify-between"><span>Live Discovery Arrays:</span> <span className="text-prizm-text">{arrayCount} active racks</span></div>
                <div className="flex justify-between"><span>Network Mismatch Audit:</span> <span className={promptOnMismatch ? "text-cyan-400 font-bold" : "text-prizm-text-muted"}>{promptOnMismatch ? "ENABLED / PROMPT ON CHANGE" : "DISABLED / BYPASS"}</span></div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-prizm-border hover:border-prizm-border bg-black/10 hover:bg-black/20 text-prizm-text text-[10px] uppercase font-bold tracking-widest rounded transition cursor-pointer"
                >
                  Configure Another Subnet
                </button>
              </div>
            </div>
          )}

          {/* BACKBOARD NAVIGATION BUTTON PANEL */}
          {step < 6 && (
            <div className="flex justify-between border-t border-prizm-border pt-4 mt-6">
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={step === 1}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-black/10 hover:bg-black/20 border border-prizm-border rounded text-[10px] font-mono font-bold uppercase tracking-wider text-prizm-text-muted hover:text-prizm-text disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
              >
                <ArrowLeft size={12} />
                Back
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                disabled={step === 5}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-black rounded text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
              >
                Next
                <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>

        {/* COMPACT DIAGNOSTICS TERMINAL SIDE LOGGING PANEL */}
        <div className="lg:col-span-4 bg-prizm-surface border border-prizm-border rounded-lg p-4 flex flex-col justify-between">
          <div className="space-y-3 font-mono">
            
            <div className="flex items-center justify-between border-b border-prizm-border pb-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <Terminal size={14} className="text-cyan-400" />
                <span className="text-[10px] font-bold text-prizm-text uppercase tracking-widest">Audit Console</span>
              </div>
              <button
                type="button"
                onClick={() => setTerminalLogs(["Terminal log cleared."])}
                className="text-[8px] opacity-60 hover:opacity-100 hover:text-cyan-400 uppercase tracking-widest font-bold cursor-pointer"
              >
                Clear
              </button>
            </div>

            {/* LOG LINES BOX */}
            <div className="bg-black/45 border border-prizm-border/60 p-2.5 rounded h-[380px] overflow-y-auto space-y-1.5 font-mono text-[9px] text-[#A6E22E] scrollbar-thin">
              {terminalLogs.map((log, idx) => (
                <div key={idx} className="leading-normal whitespace-pre-wrap break-all select-all selection:bg-cyan-500/30">
                  {log}
                </div>
              ))}
              {testing && (
                <div className="text-cyan-400 flex items-center gap-1.5 animate-pulse">
                  <RefreshCw size={8} className="animate-spin" />
                  <span>EXECUTING READ-ONLY PROBE...</span>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
