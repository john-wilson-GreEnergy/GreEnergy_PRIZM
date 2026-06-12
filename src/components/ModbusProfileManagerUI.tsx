import React, { useState, useEffect } from "react";
import { 
  Database, 
  RefreshCw, 
  ShieldAlert, 
  CheckCircle, 
  Activity, 
  Cpu, 
  Sliders, 
  Search,
  BookOpen, 
  FileText,
  Clock,
  ExternalLink,
  ChevronRight,
  HelpCircle,
  X
} from "lucide-react";

interface TelemetryField {
  value: any;
  displayValue: string;
  unit: string;
  source: "Modbus live" | "JSON fallback" | "Last known good" | "unavailable";
  quality: "Verified" | "Good" | "Cautious" | "Stale" | "Bad" | "None";
  ageMs: number;
  timestamp: string;
  rawEvidence: any;
  fallbackEvidence: any;
  profileId: string | null;
  registerAddress: number | null;
  validationStatus: string;
}

interface TelemetryFieldRef {
  key: string;
  label: string;
  field: TelemetryField;
}

export default function ModbusProfileManagerUI() {
  const [profile, setProfile] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [valLoading, setValLoading] = useState<boolean>(false);
  const [rebuildLoading, setRebuildLoading] = useState<boolean>(false);
  const [showRawTable, setShowRawTable] = useState<boolean>(false);
  const [selectedEvidence, setSelectedEvidence] = useState<TelemetryFieldRef | null>(null);

  // Filters for raw table, in case toggled open
  const [searchQuery, setSearchQuery] = useState("");
  const [rwFilter, setRwFilter] = useState("all");

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const activeRes = await fetch("/api/local/modbus/profile/active");
      if (activeRes.ok) {
        const body = await activeRes.json();
        setProfile(body.activeProfile);
        setReport(body.validationReport);
      }

      const statusRes = await fetch("/api/local/modbus/discovery/status");
      if (statusRes.ok) {
        const body = await statusRes.json();
        setStatus(body);
      }

      const snapRes = await fetch("/api/local/telemetry/snapshot");
      if (snapRes.ok) {
        const body = await snapRes.json();
        setSnapshot(body);
      }
    } catch (err) {
      console.error("[Modbus UI] Error loading telemetry metadata:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData(true);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleRebuild = async () => {
    setRebuildLoading(true);
    try {
      const res = await fetch("/api/local/modbus/profile/rebuild", { method: "POST" });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRebuildLoading(false);
    }
  };

  const handleRevalidate = async () => {
    setValLoading(true);
    try {
      const res = await fetch("/api/local/modbus/profile/revalidate", { method: "POST" });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setValLoading(false);
    }
  };

  // Maps source attributes to tailwind badges
  const renderSourceBadge = (field: TelemetryField) => {
    if (!field) return null;

    if (field.source === "Modbus live") {
      const isVerified = field.quality === "Verified";
      return (
        <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase ${
          isVerified ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "bg-yellow-500/15 text-yellow-400 border border-yellow-500/25"
        }`}>
          {isVerified ? "Modbus Verified" : "Modbus Cautious"}
        </span>
      );
    }

    if (field.source === "JSON fallback") {
      const isStale = field.quality === "Stale";
      return (
        <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase ${
          isStale ? "bg-amber-500/15 text-amber-500 border border-amber-500/25" : "bg-prizm-info/10 text-prizm-primary border border-prizm-primary/20"
        }`}>
          {isStale ? "stale fallback" : "JSON Fallback"}
        </span>
      );
    }

    return (
      <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/20 uppercase">
        Unavailable
      </span>
    );
  };

  // Helper to extract nested snapshot fields safely
  const getFieldVal = (keyPath: string): TelemetryField | null => {
    if (!snapshot) return null;
    try {
      // e.g. "site.socPercent" or "arrays[0].chargeCurrentLimitA"
      if (keyPath.startsWith("site.")) {
        const sub = keyPath.split(".")[1];
        return snapshot.site[sub];
      }
      if (keyPath.startsWith("arrays[")) {
        const match = keyPath.match(/arrays\[(\d+)\]\.(.*)/);
        if (match) {
          const idx = parseInt(match[1]);
          const prop = match[2];
          return snapshot.arrays[idx]?.[prop];
        }
      }
      if (keyPath.startsWith("pcs[")) {
        const match = keyPath.match(/pcs\[(\d+)\]\.(.*)/);
        if (match) {
          const idx = parseInt(match[1]);
          const prop = match[2];
          return snapshot.pcses[idx]?.[prop];
        }
      }
      if (keyPath.startsWith("strings[")) {
        const match = keyPath.match(/strings\[(\d+)\]\.(.*)/);
        if (match) {
          const idx = parseInt(match[1]);
          const prop = match[2];
          return snapshot.strings[idx]?.[prop];
        }
      }
      if (keyPath.startsWith("hvac[")) {
        const match = keyPath.match(/hvac\[(\d+)\]\.(.*)/);
        if (match) {
          const idx = parseInt(match[1]);
          const prop = match[2];
          return snapshot.hvac[idx]?.[prop];
        }
      }
    } catch {}
    return null;
  };

  const renderTelemetryCard = (label: string, keyPath: string) => {
    const field = getFieldVal(keyPath);
    if (!field) {
      return (
        <div className="bg-prizm-surface border border-prizm-border p-3.5 rounded-lg flex flex-col justify-between h-24">
          <span className="text-[10px] uppercase font-mono tracking-wider text-prizm-text-muted">{label}</span>
          <span className="text-sm font-bold font-mono text-prizm-text-muted">Loading...</span>
        </div>
      );
    }

    return (
      <div className="bg-prizm-surface hover:bg-prizm-surface-strong border border-prizm-border hover:border-prizm-primary/30 p-3.5 rounded-lg flex flex-col justify-between h-24 transition-all duration-200 group relative">
        <div className="flex justify-between items-start">
          <span className="text-[10px] uppercase font-mono tracking-wider text-prizm-text-muted font-semibold truncate pr-2 max-w-[85%]">
            {label}
          </span>
          <button 
            onClick={() => setSelectedEvidence({ key: keyPath, label, field })}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded bg-prizm-surface border border-prizm-border text-prizm-primary hover:bg-prizm-primary/10 transition-all cursor-pointer"
            title="Inspect Register Evidence"
          >
            <Search size={10} />
          </button>
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-base sm:text-lg font-bold font-mono text-prizm-primary truncate">
            {field.displayValue || "N/A"}
          </span>
          {renderSourceBadge(field)}
        </div>
      </div>
    );
  };

  const profileStatus = report ? report.validationStatus : "Fallback";
  const confidence = report ? report.confidenceScore : 0;

  return (
    <div className="space-y-6">
      
      {/* 1. STARTUP DISCOVERY DIAGNOSTICS BANNER */}
      {status && (
        <div className={`p-3 rounded-lg border flex flex-col sm:flex-row gap-3 items-center justify-between font-mono text-[11px] select-none ${
          status.success 
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
            : "bg-prizm-info/10 border-prizm-primary/20 text-prizm-text"
        }`}>
          <div className="flex gap-2 items-center">
            {status.success ? (
              <CheckCircle size={14} className="text-emerald-400 shrink-0" />
            ) : (
              <Activity size={14} className="text-prizm-primary animate-pulse shrink-0" />
            )}
            <span className="font-semibold text-center sm:text-left">
              Connected to <strong className="font-bold underline text-prizm-primary">{status.stationCode}</strong>, {status.success ? "verified active profile loaded" : "parsing fallback maps"}, Modbus polling {status.isPollingActive ? "ACTIVE" : "PENDING"}, JSON fallback available.
            </span>
          </div>
          <span className="text-[9px] uppercase tracking-widest bg-black/20 px-2 py-0.5 rounded shrink-0 font-extrabold text-prizm-text">
            Source: {status.activeSourceMode}
          </span>
        </div>
      )}

      {/* 2. CORE METADATA PROFILE MANAGER PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 font-mono">
        <div className="lg:col-span-2 bg-prizm-surface p-4 border border-prizm-border rounded-lg flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Database size={16} className="text-prizm-primary" />
              <h3 className="text-xs uppercase font-extrabold text-prizm-text tracking-widest">Active Modbus Site Profile Schema</h3>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-[11px] py-1">
              <div>
                <span className="text-prizm-text-muted block text-[9px] tracking-wider uppercase">Station Code</span>
                <span className="text-prizm-text font-bold">{profile?.stationCode || status?.stationCode || "BHE0020"}</span>
              </div>
              <div>
                <span className="text-prizm-text-muted block text-[9px] tracking-wider uppercase">Block Identifier</span>
                <span className="text-prizm-text font-bold">{profile?.blockCode || status?.blockCode || "B1"}</span>
              </div>
              <div>
                <span className="text-prizm-text-muted block text-[9px] tracking-wider uppercase">Active Source Mode</span>
                <span className="text-prizm-text font-bold text-prizm-primary">{status?.activeSourceMode || "Fallback"}</span>
              </div>
              <div className="col-span-2 md:col-span-3">
                <span className="text-prizm-text-muted block text-[9px] tracking-wider uppercase">SHA-256 Map Hash</span>
                <span className="text-prizm-text font-mono truncate max-w-[400px] block text-[10px]">
                  {profile?.mapHash || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2.5">
            <button
              onClick={handleRevalidate}
              disabled={valLoading || rebuildLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-prizm-surface-strong border border-prizm-border hover:border-prizm-primary text-[10px] text-prizm-text font-bold uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={12} className={valLoading ? "animate-spin text-prizm-primary" : "text-prizm-primary"} />
              {valLoading ? "Revalidating..." : "Manual Run Validation"}
            </button>
            <button
              onClick={handleRebuild}
              disabled={valLoading || rebuildLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-prizm-primary/10 border border-prizm-primary/30 hover:border-prizm-primary text-[10px] text-prizm-primary font-bold uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50"
            >
              <Database size={12} className={rebuildLoading ? "animate-spin" : ""} />
              {rebuildLoading ? "Discovering..." : "Force Rebuild Discovery"}
            </button>
            <button
              onClick={() => setShowRawTable(!showRawTable)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-prizm-surface-strong border border-prizm-border hover:border-prizm-text text-[10px] text-prizm-text-muted hover:text-prizm-text font-bold uppercase tracking-widest transition-all ml-auto cursor-pointer"
            >
              <FileText size={12} />
              {showRawTable ? "Hide Database Registries" : "Open Server Registers"}
            </button>
          </div>
        </div>

        {/* VALIDATION SCORE CIRCLE CARD */}
        <div className="bg-prizm-surface p-4 border border-prizm-border rounded-lg flex flex-col justify-between items-center text-center">
          <div className="self-start">
            <span className="text-[10px] uppercase font-mono tracking-widest text-prizm-text-muted">Register Validation Rating</span>
          </div>

          <div className="relative flex items-center justify-center my-3">
            <svg className="w-20 h-20 transform -rotate-90">
              <circle cx="40" cy="40" r="34" stroke="#1f2937" strokeWidth="4.5" fill="transparent" />
              <circle 
                cx="40" 
                cy="40" 
                r="34" 
                stroke={confidence >= 80 ? "rgb(52, 211, 153)" : (confidence >= 40 ? "rgb(245, 158, 11)" : "rgb(239, 68, 68)")} 
                strokeWidth="4.5" 
                fill="transparent" 
                strokeDasharray="213.6" 
                strokeDashoffset={213.6 - (213.6 * confidence) / 100} 
                className="transition-all duration-1000"
              />
            </svg>
            <span className="absolute text-lg font-bold font-mono text-prizm-text">
              {confidence || 0}%
            </span>
          </div>

          <div className="text-[10px] uppercase font-mono tracking-wider font-extrabold">
            Status:{" "}
            <span className={profileStatus === "Verified" ? "text-emerald-400" : (profileStatus === "Cautious" ? "text-amber-500" : "text-prizm-danger")}>
              {profileStatus || "JSON Fallback"}
            </span>
          </div>
        </div>
      </div>

      {/* 3. DYNAMIC METRIC SECTION VIEWS (CLEAN INTERPRETED UI) */}
      {!showRawTable ? (
        <div className="space-y-6">
          
          {/* A. SITE LEVEL SUMMARY */}
          <section className="space-y-2.5">
            <h4 className="text-[11px] font-mono tracking-wide uppercase text-prizm-text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-prizm-primary rounded-full"></span>
              Site Telemetry Core Metrics
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {renderTelemetryCard("System State of Charge", "site.socPercent")}
              {renderTelemetryCard("Block Stored Capacity", "site.storedEnergyKwh")}
              {renderTelemetryCard("AGC Active Feedback Command", "site.agcFeedbackKw")}
              {renderTelemetryCard("Max Available AC Charge Power", "site.availableChargePowerKw")}
              {renderTelemetryCard("Max Available AC Discharge Power", "site.availableDischargePowerKw")}
            </div>
          </section>

          {/* B. ARRAYS & PCS INVERTERS OVERVIEW */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <section className="space-y-2.5">
              <h4 className="text-[11px] font-mono tracking-wide uppercase text-prizm-text-muted flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-prizm-warning rounded-full"></span>
                Hardware DC Sub-Array Current Bounds
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {renderTelemetryCard("Array 1 Max Charging Limit", "arrays[0].chargeCurrentLimitA")}
                {renderTelemetryCard("Array 1 Max Discharging Limit", "arrays[0].dischargeCurrentLimitA")}
                {renderTelemetryCard("Array 2 Max Charging Limit", "arrays[1].chargeCurrentLimitA")}
                {renderTelemetryCard("Array 2 Max Discharging Limit", "arrays[1].dischargeCurrentLimitA")}
              </div>
            </section>

            <section className="space-y-2.5">
              <h4 className="text-[11px] font-mono tracking-wide uppercase text-prizm-text-muted flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-prizm-info rounded-full"></span>
                Power Conversion Systems (PCS) Inverters
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {renderTelemetryCard("PCS 1 AC Target Power", "pcs[0].acPowerKw")}
                {renderTelemetryCard("PCS 1 Line Currents A", "pcs[0].acCurrentA")}
                {renderTelemetryCard("PCS 2 AC Target Power", "pcs[1].acPowerKw")}
                {renderTelemetryCard("PCS 2 Line Currents A", "pcs[1].acCurrentA")}
              </div>
            </section>

          </div>

          {/* C. LITHIUM ION STRINGS GRID */}
          <section className="space-y-2.5">
            <h4 className="text-[11px] font-mono tracking-wide uppercase text-prizm-text-muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-prizm-primary rounded-full animate-pulse"></span>
              High-Density Battery Strings Granular Layouts
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 font-mono">
              {Array.from({ length: 8 }).map((_, idx) => {
                const sSoc = getFieldVal(`strings[${idx}].socPercent`);
                const sSoh = getFieldVal(`strings[${idx}].sohPercent`);
                const sCurrent = getFieldVal(`strings[${idx}].currentA`);
                const sVoltage = getFieldVal(`strings[${idx}].voltageV`);
                const sMaxV = getFieldVal(`strings[${idx}].maxCellVoltageV`);
                const sMinV = getFieldVal(`strings[${idx}].minCellVoltageV`);
                const sMaxT = getFieldVal(`strings[${idx}].maxTempC`);
                const sMinT = getFieldVal(`strings[${idx}].minTempC`);

                if (!sSoc) return null;

                return (
                  <div key={idx} className="bg-prizm-surface-strong border border-prizm-border rounded-lg overflow-hidden flex flex-col justify-between">
                    <div className="bg-prizm-surface p-2.5 border-b border-prizm-border flex justify-between items-center text-[10px] uppercase font-extrabold tracking-wider">
                      <span className="text-prizm-primary">STRING {idx + 1}</span>
                      <span className="text-[8px] bg-black/15 px-1.5 py-0.5 rounded text-prizm-text-muted">ARRAY {idx < 4 ? 1 : 2}</span>
                    </div>

                    <div className="p-3 text-[11px] space-y-2 flex-1">
                      <div className="flex justify-between items-baseline border-b border-white/5 pb-1">
                        <span className="text-prizm-text-muted text-[10px]">State of Charge</span>
                        <span className="font-bold text-prizm-text">{sSoc.displayValue}</span>
                      </div>
                      <div className="flex justify-between items-baseline border-b border-white/5 pb-1">
                        <span className="text-prizm-text-muted text-[10px]">State of Health</span>
                        <span className="font-bold text-prizm-text">{sSoh.displayValue}</span>
                      </div>
                      <div className="flex justify-between items-baseline border-b border-white/5 pb-1">
                        <span className="text-prizm-text-muted text-[10px]">Line Current</span>
                        <span className="font-bold text-prizm-text">{sCurrent.displayValue}</span>
                      </div>
                      <div className="flex justify-between items-baseline border-b border-white/5 pb-1">
                        <span className="text-prizm-text-muted text-[10px]">Line Voltage</span>
                        <span className="font-bold text-prizm-text">{sVoltage.displayValue}</span>
                      </div>
                      <div className="flex justify-between items-baseline border-b border-white/5 pb-1">
                        <span className="text-prizm-text-muted text-[10px]">Cell Voltage Range</span>
                        <span className="font-bold text-[10px] text-prizm-text">{sMinV.displayValue} - {sMaxV.displayValue}</span>
                      </div>
                      <div className="flex justify-between items-baseline pb-1">
                        <span className="text-prizm-text-muted text-[10px]">Cell Temp Range</span>
                        <span className="font-bold text-[10px] text-prizm-text">{sMinT.displayValue} - {sMaxT.displayValue}</span>
                      </div>
                    </div>

                    <div className="p-2 border-t border-prizm-border bg-prizm-surface/40 flex justify-between items-center">
                      <span className="text-[9px] text-prizm-text-muted">Source: {sSoc.source}</span>
                      <button 
                        onClick={() => setSelectedEvidence({ key: `strings[${idx}].socPercent`, label: `String ${idx+1} SoC`, field: sSoc })}
                        className="text-[9px] font-bold text-prizm-primary hover:underline cursor-pointer flex items-center gap-0.5"
                      >
                        Inspect
                        <ChevronRight size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        </div>
      ) : (
        
        /* 4. RAW MODBUS SERVER REGISTRIES TABLE BROWSER (TOGGLE) */
        <div className="space-y-4 font-mono select-text">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-2.5 text-prizm-text-muted" />
              <input
                type="text"
                placeholder="Filter loaded register schema tables by address, field name or code..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-8 py-1.5 text-xs text-prizm-text focus:outline-none focus:border-prizm-primary"
              />
            </div>

            <select
              value={rwFilter}
              onChange={e => setRwFilter(e.target.value)}
              className="bg-prizm-surface-strong border border-prizm-border rounded px-3 py-1 text-xs text-prizm-text"
            >
              <option value="all">Access: All Filters</option>
              <option value="R">Read-Only (R)</option>
              <option value="RW">Read / Write (RW)</option>
            </select>
          </div>

          <div className="border border-prizm-border rounded-lg overflow-hidden text-[11px]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead className="bg-prizm-surface border-b border-prizm-border text-prizm-text-muted uppercase tracking-widest text-[8px]">
                  <tr>
                    <th className="p-3">Register</th>
                    <th className="p-3">Field Name / Description</th>
                    <th className="p-3">Data Type</th>
                    <th className="p-3 font-bold text-prizm-primary">Multiplier Scale</th>
                    <th className="p-3">Access</th>
                    <th className="p-3">Measurement Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-prizm-surface-strong">
                  {profile?.registers
                    ?.filter((reg: any) => {
                      const lower = reg.fieldName.toLowerCase();
                      const matchSearch = lower.includes(searchQuery.toLowerCase()) || String(reg.registerAddress).includes(searchQuery);
                      const matchAccess = rwFilter === "all" || reg.rw.toLowerCase() === rwFilter.toLowerCase();
                      return matchSearch && matchAccess;
                    })
                    ?.map((reg: any, idx: number) => (
                      <tr key={idx} className="hover:bg-black/10 transition-colors">
                        <td className="p-3 text-prizm-primary font-bold">{reg.registerAddress}</td>
                        <td className="p-3 text-prizm-text font-semibold">{reg.fieldName}</td>
                        <td className="p-3 text-prizm-text-muted">
                          {reg.dataType.toUpperCase()} ({reg.size} {reg.size > 1 ? "words" : "word"})
                        </td>
                        <td className="p-3 text-prizm-primary font-bold">{reg.scaleFactor}</td>
                        <td className="p-3">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                            reg.rw === "RW" ? "bg-prizm-warning/10 text-prizm-warning" : "bg-prizm-info/10 text-prizm-primary"
                          }`}>
                            {reg.rw}
                          </span>
                        </td>
                        <td className="p-3 text-prizm-text font-bold">{reg.unit || "-"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. COHESIVE EVIDENCE DRAWER (MODAL OVERLAY) */}
      {selectedEvidence && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-prizm-surface border border-prizm-border rounded-xl max-w-lg w-full overflow-hidden font-mono shadow-xl relative animate-in zoom-in-95 duration-200">
            
            <div className="bg-prizm-surface p-4 border-b border-prizm-border flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-prizm-primary" />
                <span className="text-xs font-black uppercase text-prizm-text tracking-widest">Register Evidence Drawer</span>
              </div>
              <button 
                onClick={() => setSelectedEvidence(null)}
                className="text-prizm-text-muted hover:text-prizm-text cursor-pointer p-1 rounded hover:bg-white/5 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <span className="text-[9px] text-prizm-text-muted block uppercase tracking-wider mb-1">Semantic Binding Concept</span>
                <span className="text-sm font-black text-prizm-primary font-mono">{selectedEvidence.key}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-y border-white/5 py-3">
                <div>
                  <span className="text-[9px] text-prizm-text-muted block uppercase tracking-wider">Modbus Mapped Field</span>
                  <span className="text-prizm-text font-bold truncate block">{selectedEvidence.field.profileId ? (profile?.semanticMappings?.[selectedEvidence.key] || "Automatic Link") : "Unmapped"}</span>
                </div>
                <div>
                  <span className="text-[9px] text-prizm-text-muted block uppercase tracking-wider">Register Reference Address</span>
                  <span className="text-prizm-text font-bold block">{selectedEvidence.field.registerAddress ? `${selectedEvidence.field.registerAddress} (Offset: -1)` : "N/A"}</span>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-prizm-text-muted">Modbus Telemetry Quality:</span>
                  <span className="font-extrabold text-prizm-text">{selectedEvidence.field.quality}</span>
                </div>

                <div className="flex justify-between items-baseline">
                  <span className="text-prizm-text-muted font-mono">Modbus Live Value Output:</span>
                  <span className="font-bold text-prizm-primary text-sm">{selectedEvidence.field.rawEvidence !== null ? `${selectedEvidence.field.rawEvidence} ${selectedEvidence.field.unit}` : "N/A"}</span>
                </div>

                <div className="flex justify-between items-baseline">
                  <span className="text-prizm-text-muted">JSON Fallback Comparison:</span>
                  <span className="font-bold text-prizm-text">{selectedEvidence.field.fallbackEvidence !== null ? `${selectedEvidence.field.fallbackEvidence} ${selectedEvidence.field.unit}` : "No offline source comparison available"}</span>
                </div>

                <div className="flex justify-between items-baseline">
                  <span className="text-prizm-text-muted">System Active Source Priority:</span>
                  <span className="text-prizm-text font-mono font-bold uppercase">{selectedEvidence.field.source}</span>
                </div>

                <div className="flex justify-between items-baseline">
                  <span className="text-prizm-text-muted">Transaction Timestamp:</span>
                  <span className="text-[10px] text-prizm-text-muted font-bold truncate max-w-[200px]">{selectedEvidence.field.timestamp}</span>
                </div>
              </div>

              <div className="p-3 bg-black/15 border border-white/5 rounded text-[11px] text-prizm-text-muted">
                <strong>Verification Notes:</strong><br/>
                {selectedEvidence.field.quality === "Verified" ? (
                  <span className="text-emerald-400 font-medium">Verified: This live Modbus sensor value fully matches the secondary EMS JSON/CSV offline feedback value. Zero deviation detected.</span>
                ) : selectedEvidence.field.quality === "Cautious" ? (
                  <span className="text-yellow-400 font-medium font-bold">Hybrid Cautious: Live register results deviate within acceptable bounds but are safe to display. Verify hardware line scaling.</span>
                ) : (
                  <span>Using standard backup telemetry due to lack of real hardware Modbus port interface response.</span>
                )}
              </div>
            </div>

            <div className="p-4 bg-prizm-surface border-t border-prizm-border flex justify-end">
              <button 
                onClick={() => setSelectedEvidence(null)}
                className="px-4 py-1.5 rounded bg-prizm-primary/10 border border-prizm-primary/30 text-[10px] text-prizm-primary font-bold uppercase tracking-wider hover:bg-prizm-primary/20 transition-all cursor-pointer"
              >
                Acknowledge & Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
