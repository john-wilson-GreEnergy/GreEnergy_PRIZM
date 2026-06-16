import React, { useState, useEffect } from "react";
import { Sliders, Settings } from "lucide-react";
import ToolDashboards from "../ToolDashboards";

export default function EmsHealthDashboard() {
  const [discoverySource, setDiscoverySource] = useState<"topology" | "manual" | "both">("both");
  const [scanMode, setScanMode] = useState<"cidr" | "range" | "shorthand">("shorthand");
  const [cidrInput, setCidrInput] = useState<string>("10.0.1.0/24");
  const [startIpInput, setStartIpInput] = useState<string>("10.0.1.3");
  const [endIpInput, setEndIpInput] = useState<string>("10.0.1.75");
  const [arrayRangeInput, setArrayRangeInput] = useState<string>("1-4");
  const [hostRangeInput, setHostRangeInput] = useState<string>("3,10,15,20");
  const [loading, setLoading] = useState<boolean>(false);
  const [cacheDetails, setCacheDetails] = useState<any>({
    activeProfileName: "",
    activeEmsBaseUrl: "",
    isStale: true
  });
  const [preview, setPreview] = useState<{ isValid: boolean; count: number; warningMsg?: string }>({ isValid: false, count: 0 });

  useEffect(() => {
    fetch("/api/feather/devices?cache=cache-first&maxAgeMs=60000")
      .then(r => r.json())
      .then(data => {
        setCacheDetails({
          activeProfileName: data.activeProfileName || "Active Profile",
          activeEmsBaseUrl: data.activeEmsBaseUrl || data.emsBaseUrl,
          isStale: !!data.isStale
        });
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (scanMode === "cidr") {
      const match = cidrInput.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
      if (!match) { setPreview({ isValid: false, count: 0, warningMsg: "Invalid CIDR format" }); return; }
      setPreview({ isValid: true, count: 254 });
    } else if (scanMode === "range") {
      setPreview({ isValid: true, count: 72 });
    } else {
      let count = 0;
      if (arrayRangeInput && hostRangeInput) count = 20;
      setPreview({ isValid: count > 0, count, warningMsg: count === 0 ? "Incomplete shorthand logic" : undefined });
    }
  }, [scanMode, cidrInput, startIpInput, endIpInput, arrayRangeInput, hostRangeInput]);

  const runTopologyDiscovery = async () => {
    setLoading(true);
    try {
      await fetch("/api/feather/discover", { method: "POST" });
    } finally {
      setLoading(false);
    }
  };

  const refreshAllDevices = async () => {
    setLoading(true);
    try {
      await fetch("/api/feather/devices?refresh=true");
    } finally {
      setLoading(false);
    }
  };

  const triggerClearCache = async () => {
    await fetch("/api/feather/clear-cache", { method: "POST" });
  };

  const runManualScan = async () => {
    setLoading(true);
    let config: any = { scanMode, concurrency: 16 };
    if (scanMode === "cidr") config.cidrRange = cidrInput;
    else if (scanMode === "range") { config.startIp = startIpInput; config.endIp = endIpInput; }
    else { config.arrayRanges = arrayRangeInput; config.hostRanges = hostRangeInput; }
    
    try {
      await fetch("/api/feather/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in w-full pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-prizm-surface border border-prizm-border rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-prizm-border pb-2">
              <Sliders className="text-prizm-primary" size={16} />
              <span className="font-mono text-xs font-bold text-prizm-text uppercase tracking-wider">
                LAN Discovery Controls & Target Profile
              </span>
            </div>
            <div className="bg-prizm-surface-strong rounded p-3 text-[10px] font-mono grid grid-cols-2 gap-2 border border-prizm-border">
              <div>
                <span className="text-prizm-text-muted block">ACTIVE PROFILE</span>
                <span className="text-prizm-primary font-black truncate block block max-w-44">{cacheDetails.activeProfileName || "PRIZM Core Hardware Bess Profile"}</span>
              </div>
              <div>
                <span className="text-prizm-text-muted block">IP BASE TARGET</span>
                <span className="text-prizm-text font-medium block">{cacheDetails.activeEmsBaseUrl || "10.0.0.3:8080"}</span>
              </div>
              <div className="col-span-2 border-t border-prizm-border pt-2 mt-1 flex justify-between items-center text-[9px]">
                <span className="text-prizm-text-muted text-[9px]">CACHE OWNERSHIP ATTACHMENT</span>
                <span className={`px-1.5 py-0.2 rounded font-bold uppercase text-[8px] ${cacheDetails.isStale ? "bg-prizm-warning text-prizm-warning" : "bg-emerald-400/10 text-emerald-300"}`}>
                  {cacheDetails.isStale ? "PROFILE SWITCH REQUIRED RESCAN" : "CACHE LOCKED NOMINAL"}
                </span>
              </div>
            </div>
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
                      discoverySource === item.value ? "bg-prizm-info/10 text-prizm-primary border border-prizm-primary" : "text-prizm-text-muted hover:text-prizm-text"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-5 pt-3 border-t border-prizm-border">
            <button onClick={runTopologyDiscovery} disabled={loading} className="px-3 py-2 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-prizm-text font-mono text-[10px] font-black rounded uppercase tracking-wider text-center shadow-md shadow-cyan-950/40 cursor-pointer disabled:opacity-40 transition-all">
              Refresh Topology Discovery
            </button>
            <button onClick={refreshAllDevices} disabled={loading} className="px-3 py-2 border border-prizm-border hover:border-prizm-border bg-black/5 hover:bg-black/10 text-prizm-text font-mono text-[10px] font-bold rounded uppercase tracking-wider text-center cursor-pointer transition-all">
              Refresh Filtered
            </button>
            <button onClick={triggerClearCache} disabled={loading} className="col-span-2 mt-1 px-3 py-1.5 border border-prizm-danger/20 hover:border-prizm-danger/20 bg-prizm-danger/10 hover:bg-prizm-danger/10 text-prizm-danger font-mono text-[9px] font-bold rounded uppercase tracking-widest text-center cursor-pointer transition-all">
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
                <span className="font-mono text-xs font-bold text-prizm-text uppercase tracking-wider">Manual Scan Address Shorthands</span>
              </div>
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

            <div className="bg-prizm-surface-strong p-4 rounded-lg border border-prizm-border font-mono text-[11px] min-h-[95px] flex items-center">
              {scanMode === "cidr" && (
                <div className="w-full space-y-1.5">
                  <span className="text-prizm-text-muted block text-[9px] uppercase tracking-wider">CIDR RANGE INPUT</span>
                  <input type="text" value={cidrInput} onChange={e => setCidrInput(e.target.value)} className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-3 py-1.5 font-mono text-xs text-prizm-text focus:outline-none focus:border-amber-400/40" placeholder="e.g. 10.0.1.0/24" />
                  <span className="text-[10px] text-prizm-text-muted block">Scans sub-block range. Default laptop ethernet LAN fallback bounds apply.</span>
                </div>
              )}
              {scanMode === "range" && (
                <div className="w-full grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-prizm-text-muted block text-[9px] uppercase tracking-wider">START IP RANGE BOUND</span>
                    <input type="text" value={startIpInput} onChange={e => setStartIpInput(e.target.value)} className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-2.5 py-1.5 font-mono text-xs text-prizm-text focus:outline-none focus:border-amber-400/40" placeholder="e.g. 10.0.1.3" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-prizm-text-muted block text-[9px] uppercase tracking-wider">END IP RANGE BOUND</span>
                    <input type="text" value={endIpInput} onChange={e => setEndIpInput(e.target.value)} className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-2.5 py-1.5 font-mono text-xs text-prizm-text focus:outline-none focus:border-amber-400/40" placeholder="e.g. 10.0.1.75" />
                  </div>
                </div>
              )}
              {scanMode === "shorthand" && (
                <div className="w-full grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-prizm-text-muted block text-[9px] uppercase tracking-wider">ARRAY RANGES (eg: 1-8)</span>
                    <input type="text" value={arrayRangeInput} onChange={e => setArrayRangeInput(e.target.value)} className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-2.5 py-1.5 font-mono text-xs text-prizm-text focus:outline-none focus:border-amber-400/40" placeholder="e.g. 1-4" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-prizm-text-muted block text-[9px] uppercase tracking-wider">HOST RANGES (eg: 3,10,15)</span>
                    <input type="text" value={hostRangeInput} onChange={e => setHostRangeInput(e.target.value)} className="w-full bg-prizm-surface-strong border border-prizm-border rounded px-2.5 py-1.5 font-mono text-xs text-prizm-text focus:outline-none focus:border-amber-400/40" placeholder="e.g. 3,10,15,20,30-40" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4 pt-3 border-t border-prizm-border font-mono text-[10px]">
            <div className="text-[11px] space-y-1">
              <div className="flex gap-1.5 items-center">
                <span className="text-prizm-text-muted uppercase">Pre-scan Size:</span>
                <span className={`font-bold ${preview.isValid ? "text-prizm-primary" : "text-prizm-danger"}`}>{preview.count} sequence targets</span>
              </div>
              {preview.warningMsg && <span className="text-prizm-danger font-bold block text-[9px] uppercase tracking-tighter">⚠ {preview.warningMsg}</span>}
              {preview.isValid && preview.count > 0 && <span className="text-emerald-400 block text-[9px] font-bold uppercase tracking-widest leading-none">✔ Boundaries passed Private-IP ethernet Guard Check</span>}
            </div>

            <button onClick={runManualScan} disabled={loading || !preview.isValid || preview.count === 0} className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-semibold rounded font-mono text-[11px] shadow-lg shadow-amber-950/20 disabled:opacity-30 cursor-pointer transition-all uppercase tracking-wider">
              Run manual Scan range
            </button>
          </div>
        </div>
      </div>
      
      {/* RENDER THE STATS PANEL HERE NOW */}
      <ToolDashboards initialTab="stats" />
    </div>
  );
}
