import React, { useState, useEffect, useRef } from "react";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Copy, 
  Play, 
  Sparkles, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  X, 
  Download, 
  Upload, 
  Server, 
  Cpu, 
  HelpCircle,
  Database,
  ArrowRight,
  Wifi,
  FileJson
} from "lucide-react";

interface EmsProfile {
  id: string;
  profileName: string;
  siteName: string;
  stationCode: string;
  blockIndex: number;
  emsHost: string;
  emsPort: number;
  turtlePath: string;
  modbusHost: string;
  modbusPort: number;
  arrayCount: number;
  stringsPerArray: number;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string | null;
  lastTestResult?: {
    success: boolean;
    emsUrlTested: string;
    statusEndpointResult?: any;
    turtleVersion?: string;
    stationCode?: string;
    blockIndex?: number;
    error?: string | null;
    durations?: {
      status?: number;
      reportStatus?: number;
      blockviewer?: number;
    }
  } | null;
}

interface ConnectionSettingsProps {
  onProfileChanged?: () => void;
}

export default function ConnectionSettings({ onProfileChanged }: ConnectionSettingsProps) {
  const [profiles, setProfiles] = useState<EmsProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<EmsProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Editorial Form States
  const [showForm, setShowForm] = useState(false);
  const [formProfile, setFormProfile] = useState<Partial<EmsProfile>>({});
  const [formIsNew, setFormIsNew] = useState(true);
  const [formError, setFormError] = useState("");
  
  // Connection Test States
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<EmsProfile["lastTestResult"] | null>(null);
  const [customTestLoading, setCustomTestLoading] = useState(false);
  const [showTestResultModal, setShowTestResultModal] = useState(false);

  // Cache States
  const [cacheStatus, setCacheStatus] = useState<any>(null);
  const [cachePolicy, setCachePolicy] = useState<string>("live-first");
  const [changePolicyLoading, setChangePolicyLoading] = useState(false);

  useEffect(() => {
     fetch('/api/local/cache/status')
        .then(r => r.json())
        .then(setCacheStatus)
        .catch(console.error);
        
     fetch('/api/local/cache/policy')
        .then(r => r.json())
        .then(data => {
            if (data && data.policy) setCachePolicy(data.policy);
        })
        .catch(console.error);
  }, [activeProfile]);
  
  const handlePolicyChange = async (newPolicy: string) => {
      setChangePolicyLoading(true);
      try {
          const res = await fetch('/api/local/cache/policy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ policy: newPolicy })
          });
          if (res.ok) {
              const data = await res.json();
              if (data.success && data.policy) {
                  setCachePolicy(data.policy);
              }
          }
      } catch (e) {
          console.error("Failed to change cache policy", e);
      } finally {
          setChangePolicyLoading(false);
      }
  };

  const handleClearActiveCache = async () => {
      try {
          await fetch('/api/local/cache/clear-active', { method: 'POST' });
          const res = await fetch('/api/local/cache/status');
          setCacheStatus(await res.json());
      } catch(e) {}
  };

  const handleClearAllCache = async () => {
      if (window.confirm('Are you sure you want to clear ALL PRIZM local site caches?')) {
         try {
             await fetch('/api/local/cache/clear-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'CLEAR_ALL_PRIZM_CACHE' }) });
             const res = await fetch('/api/local/cache/status');
             setCacheStatus(await res.json());
         } catch(e) {}
      }
  };

  // File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reload statistics
  const loadProfiles = async () => {
    setLoading(true);
    try {
      const [listRes, activeRes] = await Promise.all([
        fetch("/api/settings/profiles"),
        fetch("/api/settings/active-profile")
      ]);

      if (listRes.ok) {
        const listData = await listRes.json();
        setProfiles(listData);
      }
      if (activeRes.ok) {
        const activeData = await activeRes.json();
        setActiveProfile(activeData);
      }
    } catch (err) {
      console.error("Failed to load connection settings profiles", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const handleActivate = async (id: string) => {
    try {
      const res = await fetch(`/api/settings/profiles/${id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        await loadProfiles();
        await fetch("/api/local/ems/retry-connection", { method: "POST" }).catch(()=>null);
        if (onProfileChanged) {
          onProfileChanged();
        }
      } else {
        const err = await res.json();
        alert(`Failed to activate profile: ${err.error}`);
      }
    } catch (err: any) {
      alert(`Activation error: ${err.message}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete connection profile "${name}"?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/settings/profiles/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await loadProfiles();
        if (onProfileChanged) {
          onProfileChanged();
        }
      } else {
        const err = await res.json();
        alert(err.error || "Failed to delete profile");
      }
    } catch (err: any) {
      alert(`Error deleting profile: ${err.message}`);
    }
  };

  const handleDuplicate = async (profile: EmsProfile) => {
    try {
      const duplicatedData = {
        profileName: `${profile.profileName} (Copy)`,
        siteName: profile.siteName,
        stationCode: profile.stationCode,
        blockIndex: profile.blockIndex,
        emsHost: profile.emsHost,
        emsPort: profile.emsPort,
        turtlePath: profile.turtlePath,
        modbusHost: profile.modbusHost,
        modbusPort: profile.modbusPort,
        arrayCount: profile.arrayCount,
        stringsPerArray: profile.stringsPerArray,
        notes: profile.notes || "",
        activate: false
      };

      const res = await fetch("/api/settings/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(duplicatedData)
      });

      if (res.ok) {
        await loadProfiles();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to duplicate profile");
      }
    } catch (err: any) {
      alert(`Error duplicating profile: ${err.message}`);
    }
  };

  const handleOpenNewForm = () => {
    setFormProfile({
      profileName: "",
      siteName: "",
      stationCode: "BHE",
      blockIndex: 1,
      emsHost: "10.0.0.",
      emsPort: 8080,
      turtlePath: "/turtle",
      modbusHost: "10.0.0.",
      modbusPort: 4502,
      arrayCount: 8,
      stringsPerArray: 40,
      notes: ""
    });
    setFormIsNew(true);
    setFormError("");
    setShowForm(true);
  };

  const handleOpenEditForm = (p: EmsProfile) => {
    setFormProfile(p);
    setFormIsNew(false);
    setFormError("");
    setShowForm(true);
  };

  const validateForm = (): boolean => {
    if (!formProfile.profileName?.trim()) {
      setFormError("Profile Name is required");
      return false;
    }
    if (!formProfile.siteName?.trim()) {
      setFormError("Site Name is required");
      return false;
    }
    if (!formProfile.stationCode?.trim()) {
      setFormError("Station Code is required");
      return false;
    }
    if (!formProfile.emsHost?.trim()) {
      setFormError("EMS Hostname/IP address is required");
      return false;
    }
    if (!formProfile.turtlePath?.trim() || !formProfile.turtlePath.startsWith("/")) {
      setFormError("Turtle API Base Path must start with '/' (e.g. /turtle)");
      return false;
    }
    const emsPortNum = Number(formProfile.emsPort);
    if (isNaN(emsPortNum) || emsPortNum < 1 || emsPortNum > 65535) {
      setFormError("EMS port must be a valid number between 1 and 65535");
      return false;
    }
    if (!formProfile.modbusHost?.trim()) {
      setFormError("Modbus Hostname/IP is required");
      return false;
    }
    const modbusPortNum = Number(formProfile.modbusPort);
    if (isNaN(modbusPortNum) || modbusPortNum < 1 || modbusPortNum > 65535) {
      setFormError("Modbus Port must be in range 1-65535");
      return false;
    }
    const arrayCountNum = Number(formProfile.arrayCount);
    if (isNaN(arrayCountNum) || arrayCountNum < 1) {
      setFormError("Array Count must be a positive integer");
      return false;
    }
    const stringsNum = Number(formProfile.stringsPerArray);
    if (isNaN(stringsNum) || stringsNum < 1) {
      setFormError("Strings per Array must be a positive integer");
      return false;
    }
    return true;
  };

  const handleTestInForm = async () => {
    if (!validateForm()) return;
    setCustomTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formProfile)
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
        setShowTestResultModal(true);
      } else {
        const err = await res.json();
        alert(`Test error: ${err.error}`);
      }
    } catch (err: any) {
      alert(`Network error testing target details: ${err.message}`);
    } finally {
      setCustomTestLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!validateForm()) return;
    setFormError("");

    try {
      const url = formIsNew ? "/api/settings/profiles" : `/api/settings/profiles/${formProfile.id}`;
      const method = formIsNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formProfile)
      });

      if (res.ok) {
        setShowForm(false);
        await loadProfiles();
        if (onProfileChanged) {
          onProfileChanged();
        }
      } else {
        const err = await res.json();
        setFormError(err.error || "Failed to commit settings to server profile store.");
      }
    } catch (err: any) {
      setFormError(`Server rejection: ${err.message}`);
    }
  };

  const handleTestConnectedProfile = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
        setShowTestResultModal(true);
        // recheck list to update tested timers
        const listRes = await fetch("/api/settings/profiles");
        if (listRes.ok) {
          setProfiles(await listRes.json());
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTestingId(null);
    }
  };

  const handleExport = () => {
    window.location.href = "/api/settings/profiles/export";
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result;
        if (typeof text !== "string") return;
        const parsed = JSON.parse(text);

        const res = await fetch("/api/settings/profiles/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed)
        });

        if (res.ok) {
          const result = await res.json();
          alert(`Successfully imported ${result.count} profile target configurations.`);
          await loadProfiles();
          if (onProfileChanged) {
            onProfileChanged();
          }
        } else {
          const err = await res.json();
          alert(`Import issue: ${err.error}`);
        }
      } catch (err: any) {
        alert(`Malformed JSON connection profiles file: ${err.message}`);
      }
    };
    reader.readAsText(file);
    // clear input
    e.target.value = "";
  };

  return (
    <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 font-mono shadow-xl space-y-6">
      
      {/* Top action header and labels */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-prizm-border">
        <div>
          <div className="flex items-center gap-2">
            <Server className="text-prizm-primary" size={16} />
            <span className="text-xs font-bold text-prizm-text uppercase tracking-wider">EMS Base Target Profile Manager</span>
          </div>
          <div className="text-[11px] text-prizm-text-muted mt-1 max-w-xl">
            Configure local LAN gateways and site-specific Modbus layouts. Switch site connectivity instantly without manual `.env` refactoring.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleImportClick}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/5 hover:bg-black/10 text-prizm-text-muted text-[10px] uppercase font-bold rounded border border-prizm-border cursor-pointer transition-all"
          >
            <Upload size={11} />
            Import (.json)
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".json" 
            className="hidden" 
          />
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/5 hover:bg-black/10 text-prizm-text-muted text-[10px] uppercase font-bold rounded border border-prizm-border cursor-pointer transition-all"
          >
            <Download size={11} />
            Export (.json)
          </button>
          <button
            onClick={handleOpenNewForm}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-black text-[10px] uppercase font-bold rounded cursor-pointer transition-all shadow-md active:translate-y-px"
          >
            <Plus size={12} />
            Add Site Profile
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-24 flex items-center justify-center text-prizm-text-muted text-xs">
          <RefreshCw size={18} className="animate-spin text-prizm-primary-strong mr-2" />
          Synchronizing configuration targets...
        </div>
      ) : (
        <div className="space-y-4">
          {profiles.some(p => p.isActive && (p.emsHost.includes("127.0.0.1") || p.emsHost.includes("localhost")) && p.emsPort === 3000) && (
            <div className="bg-prizm-danger/10 border border-prizm-danger p-3 rounded-lg text-prizm-danger text-xs font-bold flex items-center gap-2 mb-4">
              <AlertTriangle size={16} />
              EMS source is pointed at PRIZM itself. Use 10.0.0.3:8080/turtle.
            </div>
          )}
          
          {/* Loop over saved lists */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {profiles.map((p) => {
              const active = p.isActive;
              return (
                <div 
                  key={p.id}
                  className={`border rounded-lg p-4 transition-all relative overflow-hidden flex flex-col justify-between ${
                    active 
                      ? "bg-cyan-500/[0.04] border-prizm-primary text-prizm-text shadow-cyan-950/20 shadow-md" 
                      : "bg-prizm-surface-strong border-prizm-border hover:border-prizm-border text-prizm-text-muted"
                  }`}
                >
                  
                  {/* Active ribbon decoration */}
                  {active && (
                    <div className="absolute top-0 right-0 bg-cyan-500 text-black font-extrabold text-[9px] px-2.5 py-0.5 rounded-bl uppercase tracking-widest">
                      ACTIVE SITE
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="text-prizm-text text-xs font-extrabold tracking-wider flex items-center gap-1.5">
                        <Wifi size={12} className={active ? "text-prizm-primary" : "text-prizm-text-muted"} />
                        {p.profileName}
                      </div>
                      <div className="text-[10px] text-prizm-text-muted uppercase font-medium flex items-center gap-2">
                        <span>SITE: <span className="font-bold text-prizm-text-muted">{p.siteName}</span></span>
                        <span>•</span>
                        <span>CODE: <span className="font-bold text-prizm-text-muted">{p.stationCode}</span></span>
                        <span>•</span>
                        <span>BLOCK: <span className="font-bold text-prizm-primary">{p.blockIndex}</span></span>
                      </div>
                    </div>

                    {/* Network settings matrix */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-prizm-surface-strong rounded p-2.5 text-[10px] border border-white/[0.02]">
                      <div className="flex justify-between">
                        <span className="text-prizm-text-muted">EMS Host:</span>
                        <span className="text-prizm-primary font-bold max-w-[124px] truncate">{p.emsHost}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-prizm-text-muted">EMS Port:</span>
                        <span className="text-prizm-text">{p.emsPort}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-prizm-text-muted">Modbus Host:</span>
                        <span className="text-prizm-primary font-bold max-w-[124px] truncate">{p.modbusHost}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-prizm-text-muted">Modbus Port:</span>
                        <span className="text-prizm-text">{p.modbusPort}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-prizm-text-muted">Base Path:</span>
                        <span className="text-prizm-text-muted">{p.turtlePath}</span>
                      </div>
                      <div className="flex justify-between col-span-2 border-t border-prizm-border pt-1 mt-1 text-[9px] text-prizm-text-muted italic">
                        <span>Arrays: {p.arrayCount} (Strings/Array: {p.stringsPerArray})</span>
                      </div>
                    </div>

                    {p.notes && (
                      <p className="text-[10px] text-prizm-text-muted italic max-h-8 truncate">
                        Note: {p.notes}
                      </p>
                    )}

                    {p.lastTestedAt && (
                      <div className="flex items-center justify-between text-[9px] text-prizm-text-muted border-t border-white/[0.04] pt-2">
                        <span>Last connection audit: {new Date(p.lastTestedAt).toLocaleTimeString()}</span>
                        {p.lastTestResult?.success ? (
                          <span className="text-prizm-primary font-bold flex items-center gap-1">
                            <CheckCircle size={10} /> ACCESS SUCCESS
                          </span>
                        ) : (
                          <span className="text-red-400 font-bold flex items-center gap-1">
                            <AlertTriangle size={10} /> COMM LOSS
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions buttons */}
                  <div className="flex justify-between items-center mt-4 pt-3 border-t border-white/[0.04] gap-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleOpenEditForm(p)}
                        className="p-1 px-2.5 rounded bg-black/5 hover:bg-black/10 text-prizm-text-muted hover:text-prizm-text border border-prizm-border text-[10px] font-bold uppercase transition-all cursor-pointer"
                        title="Edit config"
                      >
                        <Edit size={10} className="inline mr-1" /> Edit
                      </button>
                      <button
                        onClick={() => handleDuplicate(p)}
                        className="p-1 px-2.5 rounded bg-black/5 hover:bg-black/10 text-prizm-text-muted hover:text-prizm-text border border-prizm-border text-[10px] font-bold uppercase transition-all cursor-pointer"
                        title="Duplicate configuration"
                      >
                        <Copy size={10} className="inline mr-1" /> Dup
                      </button>
                      <button
                        onClick={() => handleDelete(p.id, p.profileName)}
                        className="p-1 px-2.5 rounded bg-red-950/10 hover:bg-red-900/20 text-red-400 border border-red-500/10 text-[10px] font-bold uppercase transition-all cursor-pointer"
                        title="Delete profile"
                      >
                        <Trash2 size={10} className="inline mr-1" /> Del
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTestConnectedProfile(p.id)}
                        disabled={testingId === p.id}
                        className="px-2.5 py-1 text-[10px] uppercase font-bold bg-prizm-surface-strong hover:bg-prizm-surface-strong text-prizm-primary hover:text-cyan-300 border border-prizm-primary rounded cursor-pointer transition-all flex items-center gap-1"
                      >
                        {testingId === p.id ? (
                          <>
                            <RefreshCw size={10} className="animate-spin" /> auditing...
                          </>
                        ) : (
                          <>
                            <Wifi size={10} /> Test Audits
                          </>
                        )}
                      </button>

                      {!active && (
                        <button
                          onClick={() => handleActivate(p.id)}
                          className="px-3 py-1 text-[10px] uppercase font-extrabold bg-prizm-info/10 hover:bg-cyan-500 text-prizm-primary hover:text-black border border-prizm-primary rounded cursor-pointer transition-all"
                        >
                          Activate
                        </button>
                      )}
                    </div>

                  </div>

                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* Profile Create/Edit Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-prizm-surface-strong backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-prizm-surface border border-prizm-border rounded-lg w-full max-w-2xl font-mono text-xs overflow-hidden shadow-2xl animate-scale-in">
            
            <div className="bg-prizm-surface-strong p-4 border-b border-prizm-border flex justify-between items-center">
              <span className="text-xs font-bold text-prizm-text uppercase tracking-wider">
                {formIsNew ? "Create New Site Connection Profile" : `Modify Site Profile: ${formProfile.profileName}`}
              </span>
              <button 
                onClick={() => setShowForm(false)}
                className="text-prizm-text-muted hover:text-prizm-text cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              
              {formError && (
                <div className="p-3 bg-red-950/20 border border-red-500/30 text-red-300 rounded text-[11px] flex items-center gap-2">
                  <AlertTriangle size={14} />
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Basic Attributes Group */}
                <div className="space-y-3 md:col-span-2">
                  <div className="text-[10px] text-prizm-primary font-extrabold uppercase tracking-wide border-b border-prizm-border pb-1">Primary Identifiers</div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] text-prizm-text-muted uppercase font-bold">Profile Name *</label>
                  <input 
                    type="text" 
                    value={formProfile.profileName || ""}
                    onChange={e => setFormProfile(prev => ({ ...prev, profileName: e.target.value }))}
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-prizm-text font-bold placeholder-black/20 focus:border-prizm-primary outline-none"
                    placeholder="PRIZM Site Core"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] text-prizm-text-muted uppercase font-bold">BESS Site Name *</label>
                  <input 
                    type="text" 
                    value={formProfile.siteName || ""}
                    onChange={e => setFormProfile(prev => ({ ...prev, siteName: e.target.value }))}
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-prizm-text placeholder-black/20 focus:border-prizm-primary outline-none"
                    placeholder="BHE substation site"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 md:col-span-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] text-prizm-text-muted uppercase font-bold">Station Code *</label>
                    <input 
                      type="text" 
                      value={formProfile.stationCode || ""}
                      onChange={e => setFormProfile(prev => ({ ...prev, stationCode: e.target.value }))}
                      className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-prizm-text placeholder-black/20 focus:border-prizm-primary outline-none"
                      placeholder="BHE0020"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-prizm-text-muted uppercase font-bold">Block Index *</label>
                    <input 
                      type="number" 
                      value={formProfile.blockIndex || 1}
                      onChange={e => setFormProfile(prev => ({ ...prev, blockIndex: Number(e.target.value) }))}
                      className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-prizm-text placeholder-black/20 focus:border-prizm-primary outline-none"
                      min={1}
                    />
                  </div>
                </div>

                {/* Direct LAN target parameters option */}
                <div className="space-y-3 md:col-span-2 pt-2">
                  <div className="text-[10px] text-prizm-primary font-extrabold uppercase tracking-wide border-b border-prizm-border pb-1">EMS LAN Ethernet Settings</div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] text-prizm-text-muted uppercase font-bold">EMS Host / IP Address *</label>
                  <input 
                    type="text" 
                    value={formProfile.emsHost || ""}
                    onChange={e => setFormProfile(prev => ({ ...prev, emsHost: e.target.value }))}
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-prizm-primary font-bold placeholder-white/20 focus:border-prizm-primary outline-none"
                    placeholder="10.0.0.3"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] text-prizm-text-muted uppercase font-bold">EMS Port *</label>
                    <input 
                      type="number" 
                      value={formProfile.emsPort || 8080}
                      onChange={e => setFormProfile(prev => ({ ...prev, emsPort: Number(e.target.value) }))}
                      className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-prizm-text placeholder-white/20 focus:border-prizm-primary outline-none"
                      min={1}
                      max={65535}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-prizm-text-muted uppercase font-bold">Turtle Path *</label>
                    <input 
                      type="text" 
                      value={formProfile.turtlePath || "/turtle"}
                      onChange={e => setFormProfile(prev => ({ ...prev, turtlePath: e.target.value }))}
                      className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-prizm-text placeholder-white/20 focus:border-prizm-primary outline-none animate-none"
                      placeholder="/turtle"
                    />
                  </div>
                </div>

                {/* Modbus Map properties */}
                <div className="space-y-3 md:col-span-2 pt-2">
                  <div className="text-[10px] text-prizm-primary font-extrabold uppercase tracking-wide border-b border-prizm-border pb-1">Modbus Hardware Settings</div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] text-prizm-text-muted uppercase font-bold">Modbus Host IP *</label>
                  <input 
                    type="text" 
                    value={formProfile.modbusHost || ""}
                    onChange={e => setFormProfile(prev => ({ ...prev, modbusHost: e.target.value }))}
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-prizm-primary font-bold placeholder-white/20 focus:border-prizm-primary outline-none"
                    placeholder="10.0.0.3"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] text-prizm-text-muted uppercase font-bold">Modbus Port *</label>
                  <input 
                    type="number" 
                    value={formProfile.modbusPort || 4502}
                    onChange={e => setFormProfile(prev => ({ ...prev, modbusPort: Number(e.target.value) }))}
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-prizm-text placeholder-white/20 focus:border-prizm-primary outline-none"
                    min={1}
                    max={65535}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 md:col-span-2 bg-prizm-surface-strong p-3 rounded border border-white/[0.02]">
                  <div className="space-y-1">
                    <label className="block text-[10px] text-prizm-text-muted uppercase font-bold">Array Count</label>
                    <input 
                      type="number" 
                      value={formProfile.arrayCount || 8}
                      onChange={e => setFormProfile(prev => ({ ...prev, arrayCount: Number(e.target.value) }))}
                      className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-prizm-text focus:border-prizm-primary outline-none"
                      min={1}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-prizm-text-muted uppercase font-bold">Strings Per Array</label>
                    <input 
                      type="number" 
                      value={formProfile.stringsPerArray || 40}
                      onChange={e => setFormProfile(prev => ({ ...prev, stringsPerArray: Number(e.target.value) }))}
                      className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-prizm-text focus:border-prizm-primary outline-none"
                      min={1}
                    />
                  </div>
                </div>

                {/* Additional instructions/Notes */}
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-[10px] text-prizm-text-muted uppercase font-bold">Notes / Site Description</label>
                  <textarea 
                    value={formProfile.notes || ""}
                    onChange={e => setFormProfile(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-prizm-text text-xs placeholder-black/20 h-16 focus:border-prizm-primary outline-none"
                    placeholder="e.g., Local backup substation configuration"
                  />
                </div>

              </div>

            </div>

            <div className="bg-prizm-surface p-4 border-t border-prizm-border flex justify-between items-center bg-prizm-surface-strong">
              <button
                onClick={handleTestInForm}
                disabled={customTestLoading}
                className="px-3.5 py-2 text-xs uppercase font-extrabold bg-black/5 hover:bg-black/10 text-prizm-primary hover:text-cyan-300 border border-prizm-primary rounded cursor-pointer transition-all flex items-center gap-1.5"
              >
                {customTestLoading ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" /> Verifying Connection...
                  </>
                ) : (
                  <>
                    <Wifi size={12} /> Test Connectivity
                  </>
                )}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-xs uppercase font-bold bg-black/5 hover:bg-black/10 text-prizm-text-muted hover:text-prizm-text border border-prizm-border rounded cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProfile}
                  className="px-5 py-2 text-xs uppercase font-extrabold bg-cyan-500 hover:bg-cyan-600 text-black rounded cursor-pointer transition-all active:translate-y-px shadow-lg hover:shadow-cyan-500/20"
                >
                  Save Profile Settings
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* PRIZM Durable Local Cache Orchestration Diagnostics */}
      {cacheStatus && (
        <div className="p-4 border border-prizm-border rounded-lg bg-prizm-surface-strong mt-6">
           <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-prizm-text uppercase tracking-wider flex items-center gap-2">
                 <Database size={14} className="text-cyan-500"/>
                 Local Disk Cache System
              </h3>
              <div className="flex gap-2">
                  <button onClick={handleClearActiveCache} className="px-3 py-1.5 text-[10px] uppercase font-bold border border-red-500/30 text-red-400 rounded hover:bg-red-500/10 transition-colors">
                     Clear Active Cache
                  </button>
                  <button onClick={handleClearAllCache} className="px-3 py-1.5 text-[10px] uppercase font-bold border border-red-500/50 text-red-500 bg-red-500/5 rounded hover:bg-red-500/20 transition-colors">
                     Purge All Disk Caches
                  </button>
              </div>
           </div>
           
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
               <div className="bg-black/20 p-3 rounded border border-white/5">
                  <div className="text-[10px] text-prizm-text-muted uppercase tracking-wider mb-1">Global Cache Policy</div>
                  <select 
                      value={cachePolicy} 
                      onChange={(e) => handlePolicyChange(e.target.value)}
                      disabled={changePolicyLoading}
                      className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-1.5 text-xs text-prizm-text outline-none appearance-none cursor-pointer disabled:opacity-50"
                  >
                     <option value="live-first">Live-First (Default)</option>
                     <option value="cache-first">Cache-First (Offline/Fallback)</option>
                     <option value="live-only">Live-Only (Bypass Cache)</option>
                     <option value="cache-only">Cache-Only (Strict Offline)</option>
                  </select>
               </div>
               <div className="bg-black/20 p-3 rounded border border-white/5">
                  <div className="text-[10px] text-prizm-text-muted uppercase tracking-wider mb-1">Active Site Cache Namespace</div>
                  <div className="text-xs font-bold text-prizm-primary truncate">{cacheStatus.activeSiteCacheKey || 'UNKNOWN'}</div>
               </div>
           </div>

           <div className="space-y-2">
               <div className="text-[11px] uppercase font-bold text-prizm-text mb-2">Available Offline Datasets By Site Namespace:</div>
               {cacheStatus.availableSiteCaches?.length === 0 ? (
                  <div className="text-xs text-prizm-text-muted p-2 bg-black/10 rounded border border-prizm-border/50">No durable cache namespaces discovered locally.</div>
               ) : (
                  cacheStatus.availableSiteCaches?.map((site: any) => (
                      <div key={site.siteCacheKey} className="flex items-center justify-between p-2 rounded bg-black/20 border border-white/5">
                         <div>
                            <div className="text-xs font-bold text-prizm-text">{site.siteCacheKey}</div>
                            <div className="text-[10px] text-prizm-text-muted mt-1">
                               URL MAP: {site.emsBaseUrl} • LST UPDATE: {new Date(site.lastUpdatedAt).toLocaleString()}
                            </div>
                         </div>
                         {site.siteCacheKey === cacheStatus.activeSiteCacheKey && (
                            <div className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-prizm-primary/10 text-prizm-primary border border-prizm-primary/20">ACTIVE</div>
                         )}
                      </div>
                  ))
               )}
           </div>
        </div>
      )}

      {/* Audit Connection Results Diagnostic Modal */}
      {showTestResultModal && testResult && (
        <div className="fixed inset-0 bg-prizm-surface-strong backdrop-blur-sm z-55 flex items-center justify-center p-4">
          <div className="bg-prizm-surface border border-prizm-border rounded-lg w-full max-w-lg font-mono text-xs overflow-hidden shadow-2xl animate-scale-in">
            
            <div className="bg-prizm-surface-strong p-4 border-b border-prizm-border flex justify-between items-center">
              <span className="text-xs font-bold text-prizm-text uppercase tracking-wider flex items-center gap-2">
                <Wifi className={testResult.success ? "text-prizm-primary" : "text-red-400"} size={14} />
                BESS Connection Audit Report
              </span>
              <button 
                onClick={() => setShowTestResultModal(false)}
                className="text-prizm-text-muted hover:text-prizm-text cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              
              <div className="flex flex-col items-center justify-center text-center py-4 bg-prizm-surface-strong rounded-lg border border-white/[0.03]">
                {testResult.success ? (
                  <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-prizm-primary flex items-center justify-center text-prizm-primary mb-2 animate-pulse">
                    <CheckCircle size={28} />
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-2">
                    <AlertTriangle size={28} />
                  </div>
                )}
                <div className="text-sm font-bold text-prizm-text">
                  {testResult.success ? "CONNECTIVITY SECURE" : "COMMUNICATION FAILURE"}
                </div>
                <p className="text-[10px] text-prizm-text-muted mt-1 uppercase tracking-wider max-w-[280px] truncate">
                  {testResult.emsUrlTested}
                </p>
              </div>

              {/* Timing metrics */}
              <div className="space-y-2">
                <div className="text-[10px] text-prizm-text-muted uppercase font-bold">Response Timings Matrix</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-prizm-surface-strong border border-prizm-border p-2 rounded text-center">
                    <div className="text-[9px] text-prizm-text-muted uppercase">/status</div>
                    <div className={`text-xs font-bold mt-1 ${testResult.success ? "text-prizm-text" : "text-prizm-text-muted"}`}>
                      {testResult.durations?.status ? `${testResult.durations.status}ms` : "N/A"}
                    </div>
                  </div>
                  <div className="bg-prizm-surface-strong border border-prizm-border p-2 rounded text-center">
                    <div className="text-[9px] text-prizm-text-muted uppercase">report.json</div>
                    <div className={`text-xs font-bold mt-1 ${testResult.success ? "text-prizm-text" : "text-prizm-text-muted"}`}>
                      {testResult.durations?.reportStatus ? `${testResult.durations.reportStatus}ms` : "N/A"}
                    </div>
                  </div>
                  <div className="bg-prizm-surface-strong border border-prizm-border p-2 rounded text-center">
                    <div className="text-[9px] text-prizm-text-muted uppercase">blockviewer</div>
                    <div className={`text-xs font-bold mt-1 ${testResult.success ? "text-prizm-text" : "text-prizm-text-muted"}`}>
                      {testResult.durations?.blockviewer ? `${testResult.durations.blockviewer}ms` : "N/A"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Decoded Firmware details */}
              <div className="bg-prizm-surface-strong border border-prizm-border p-3 rounded space-y-2">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-prizm-text-muted">Detected Host:</span>
                  <span className="text-prizm-text font-bold">{testResult.emsUrlTested}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-prizm-text-muted">Turtle Version:</span>
                  <span className="text-prizm-primary font-bold">{testResult.turtleVersion || "Unknown"}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-prizm-text-muted">Substation Code:</span>
                  <span className="text-prizm-text">{testResult.stationCode || "BHE0020"}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-prizm-text-muted">EMS Block Index:</span>
                  <span className="text-prizm-primary font-bold">{testResult.blockIndex || 1}</span>
                </div>
              </div>

              {testResult.error && (
                <div className="p-3 bg-red-950/20 border border-red-500/30 text-red-300 rounded text-[11px] leading-relaxed">
                  <span className="font-bold block text-red-400 uppercase text-[9px] mb-1">Diagnostic Exception error:</span>
                  {testResult.error}
                </div>
              )}

            </div>

            <div className="bg-prizm-surface p-4 border-t border-prizm-border flex justify-end bg-prizm-surface-strong">
              <button
                onClick={() => setShowTestResultModal(false)}
                className="px-5 py-2 text-xs uppercase font-extrabold bg-cyan-500 hover:bg-cyan-600 text-black rounded cursor-pointer transition-all shadow-md active:translate-y-px"
              >
                Close Audit Report
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
