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
  Settings,
  Database,
  Save,
  Clock,
  RefreshCw,
  Info,
  Search,
  Plus,
  Trash2,
  FileDown,
  FileUp,
  AlertCircle,
  Check,
  ChevronRight,
  Monitor,
  ToggleLeft
} from "lucide-react";

interface SiteTopologyDevice {
  id: string;
  ip: string;
  deviceType: "feather" | "cs" | "es" | "pcs" | "ups" | "moxa" | "switch" | "plc" | "custom";
  calloutLabel: string;
  displayLabel: string;
  arrayIndex?: number;
  containerIndex?: number;
  stackIndex?: number;
  segmentType?: "collection" | "energy";
  capabilities?: {
    hasHvacSimulation?: boolean;
    hasOpenClosedDetectors?: boolean;
    hasStringsTelemetry?: boolean;
    hasPcsControls?: boolean;
  };
  confidence: number;
  source: string;
  liveStatus?: "online" | "offline" | "mismatch";
}

interface SiteTopologyProfile {
  id: string;
  profileName: string;
  layoutFamily: "stack750" | "stack360" | "custom";
  uiMode: "stack750" | "stack360" | "custom";
  ipPlan: {
    subnets: string[];
    arrayStart?: number;
    arrayEnd?: number;
    esCountPerArray?: number;
    containerStart?: number;
    containerEnd?: number;
    stacksPerContainer?: number;
    esCountPerStack?: number;
    customDevices?: SiteTopologyDevice[];
  };
  version: number;
  lastModifiedAt: string;
  isActive?: boolean;
}

export default function ConnectionTopologyWorkflow() {
  const [profiles, setProfiles] = useState<SiteTopologyProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<SiteTopologyProfile | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"profiles" | "preview" | "validate">("profiles");

  // Form States for creating/editing profile
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [layoutFamily, setLayoutFamily] = useState<"stack750" | "stack360" | "custom">("stack750");
  const [subnets, setSubnets] = useState("10.0.0.0/16");
  const [arrayStart, setArrayStart] = useState(1);
  const [arrayEnd, setArrayEnd] = useState(8);
  const [esCountPerArray, setEsCountPerArray] = useState(20);
  const [containerStart, setContainerStart] = useState(1);
  const [containerEnd, setContainerEnd] = useState(4);
  const [stacksPerContainer, setStacksPerContainer] = useState(2);
  const [esCountPerStack, setEsCountPerStack] = useState(12);

  // Preview & Validation state
  const [previewDevices, setPreviewDevices] = useState<SiteTopologyDevice[]>([]);
  const [previewFilterType, setPreviewFilterType] = useState<string>("all");
  const [validationResult, setValidationResult] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);

  // General state
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: "", type: "info" as "info" | "success" | "error" });
  const [dragActive, setDragActive] = useState(false);

  // Fetch profiles on load
  useEffect(() => {
    fetchProfiles();
    fetchActiveProfile();
  }, []);

  const fetchProfiles = async () => {
    try {
      const res = await fetch("/api/local/topology/profiles");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setProfiles(data.profiles || []);
        }
      }
    } catch (err) {
      console.error("Error fetching profiles:", err);
    }
  };

  const fetchActiveProfile = async () => {
    try {
      const res = await fetch("/api/local/topology/active");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.profile) {
          setActiveProfile(data.profile);
          setSelectedProfileId(data.profile.id);
        }
      }
    } catch (err) {
      console.error("Error fetching active profile:", err);
    }
  };

  const showMsg = (text: string, type: "info" | "success" | "error" = "info") => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg({ text: "", type: "info" }), 5000);
  };

  const handleCreateNew = () => {
    setIsEditing(true);
    setEditId(null);
    setProfileName("New BESS Topology Profile");
    setLayoutFamily("stack750");
    setSubnets("10.0.0.0/16");
    setArrayStart(1);
    setArrayEnd(8);
    setEsCountPerArray(20);
    setContainerStart(1);
    setContainerEnd(4);
    setStacksPerContainer(2);
    setEsCountPerStack(12);
  };

  const handleEdit = (prof: SiteTopologyProfile) => {
    setIsEditing(true);
    setEditId(prof.id);
    setProfileName(prof.profileName);
    setLayoutFamily(prof.layoutFamily);
    setSubnets(prof.ipPlan.subnets.join(", "));
    setArrayStart(prof.ipPlan.arrayStart || 1);
    setArrayEnd(prof.ipPlan.arrayEnd || 8);
    setEsCountPerArray(prof.ipPlan.esCountPerArray || 20);
    setContainerStart(prof.ipPlan.containerStart || 1);
    setContainerEnd(prof.ipPlan.containerEnd || 4);
    setStacksPerContainer(prof.ipPlan.stacksPerContainer || 2);
    setEsCountPerStack(prof.ipPlan.esCountPerStack || 12);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditId(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      showMsg("Profile Name is required", "error");
      return;
    }

    const subnetList = subnets.split(",").map(s => s.trim()).filter(Boolean);

    const profilePayload: Partial<SiteTopologyProfile> = {
      profileName,
      layoutFamily,
      uiMode: layoutFamily,
      ipPlan: {
        subnets: subnetList,
        arrayStart: layoutFamily === "stack750" ? arrayStart : undefined,
        arrayEnd: layoutFamily === "stack750" ? arrayEnd : undefined,
        esCountPerArray: layoutFamily === "stack750" ? esCountPerArray : undefined,
        containerStart: layoutFamily === "stack360" ? containerStart : undefined,
        containerEnd: layoutFamily === "stack360" ? containerEnd : undefined,
        stacksPerContainer: layoutFamily === "stack360" ? stacksPerContainer : undefined,
        esCountPerStack: layoutFamily === "stack360" ? esCountPerStack : undefined,
        customDevices: editId ? profiles.find(p => p.id === editId)?.ipPlan.customDevices || [] : []
      }
    };

    try {
      const url = editId ? `/api/local/topology/profiles/${editId}` : "/api/local/topology/profiles";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profilePayload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          showMsg(editId ? "Profile updated successfully" : "Profile created successfully", "success");
          setIsEditing(false);
          setEditId(null);
          fetchProfiles();
          if (data.profile.isActive) {
            setActiveProfile(data.profile);
          }
        } else {
          showMsg(data.error || "Failed to save profile", "error");
        }
      }
    } catch (err: any) {
      showMsg(err.message || "Failed to save profile", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this topology profile? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/local/topology/profiles/${id}`, { method: "DELETE" });
      if (res.ok) {
        showMsg("Profile deleted successfully", "success");
        fetchProfiles();
        if (activeProfile?.id === id) {
          setActiveProfile(null);
        }
      }
    } catch (err) {
      console.error("Error deleting profile:", err);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      const res = await fetch(`/api/local/topology/profiles/${id}/activate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          showMsg(`Activated profile: ${data.profile.profileName}`, "success");
          fetchActiveProfile();
          fetchProfiles();
        }
      }
    } catch (err) {
      console.error("Error activating profile:", err);
    }
  };

  const handleExport = (id: string) => {
    window.open(`/api/local/topology/profiles/${id}/export`, "_blank");
  };

  // Drag and drop handlers for Importing
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileImport(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileImport(e.target.files[0]);
    }
  };

  const handleFileImport = async (file: File) => {
    if (file.name.endsWith(".gsheet")) {
      showMsg("Google Sheets shortcut files cannot be imported directly. Export the sheet as .xlsx or .csv, then upload that file.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Content = (e.target?.result as string).split(",")[1];
      try {
        const res = await fetch("/api/local/topology/profiles/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileContentBase64: base64Content
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            showMsg(`Successfully imported layout from ${file.name}!`, "success");
            fetchProfiles();
          } else {
            showMsg(data.error || "Failed to import profile", "error");
          }
        } else {
          const data = await res.json();
          showMsg(data.error || "Import failed", "error");
        }
      } catch (err: any) {
        showMsg(err.message || "Failed to parse and import layout profile", "error");
      }
    };
    reader.readAsDataURL(file);
  };

  // Generate Expected Topology Devices Preview
  const handleGeneratePreview = async (prof: SiteTopologyProfile) => {
    setLoading(true);
    try {
      const res = await fetch("/api/local/topology/generate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prof)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPreviewDevices(data.devices || []);
          setActiveTab("preview");
        }
      }
    } catch (err) {
      console.error("Error generating expected preview:", err);
    } finally {
      setLoading(false);
    }
  };

  // Validate Active LAN Topology
  const handleValidateLan = async () => {
    setIsValidating(true);
    try {
      const res = await fetch("/api/local/topology/active/validate", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setValidationResult(data);
        setActiveTab("validate");
        showMsg("Live LAN Topology validation finished successfully", "success");
      }
    } catch (err: any) {
      showMsg(err.message || "Validation scan failed", "error");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-6 font-mono text-slate-200">
      {/* Dynamic alert status message */}
      {statusMsg.text && (
        <div className={`p-4 rounded-lg flex items-center gap-3 border text-xs uppercase tracking-wider animate-fade-in ${
          statusMsg.type === "success" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
          statusMsg.type === "error" ? "bg-red-500/10 border-red-500/30 text-red-400 font-bold" :
          "bg-prizm-info/10 border-prizm-primary/30 text-cyan-400"
        }`}>
          <AlertCircle size={16} />
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Title & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h2 className="text-sm font-black uppercase text-prizm-primary flex items-center gap-2">
            <Network size={18} className="text-prizm-primary animate-pulse" />
            BESS Site Topology Engine
          </h2>
          <p className="text-[10px] text-prizm-text-muted uppercase mt-1">
            Dynamic profile assembler, deterministic expected topology maps, and real-time LAN discovery validation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleValidateLan}
            disabled={isValidating || !activeProfile}
            className="px-4 py-2 bg-prizm-primary text-black hover:bg-cyan-400 text-[10px] font-extrabold rounded uppercase cursor-pointer disabled:opacity-40 flex items-center gap-2"
          >
            {isValidating ? <RefreshCw className="animate-spin" size={12} /> : <Activity size={12} />}
            Validate LAN Active Status
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-px text-[10px] uppercase tracking-wider font-extrabold">
        <button
          onClick={() => setActiveTab("profiles")}
          className={`px-4 py-2 border-b-2 cursor-pointer transition-all ${
            activeTab === "profiles" ? "border-prizm-primary text-prizm-primary bg-prizm-primary/5" : "border-transparent text-prizm-text-muted hover:text-slate-200"
          }`}
        >
          <Settings size={12} className="inline mr-2" />
          Profiles Manager
        </button>
        <button
          onClick={() => activeProfile && handleGeneratePreview(activeProfile)}
          disabled={!activeProfile}
          className={`px-4 py-2 border-b-2 cursor-pointer transition-all disabled:opacity-40 ${
            activeTab === "preview" ? "border-prizm-primary text-prizm-primary bg-prizm-primary/5" : "border-transparent text-prizm-text-muted hover:text-slate-200"
          }`}
        >
          <Cpu size={12} className="inline mr-2" />
          Expected Preview
        </button>
        <button
          onClick={() => activeTab === "validate" || handleValidateLan()}
          disabled={!activeProfile}
          className={`px-4 py-2 border-b-2 cursor-pointer transition-all disabled:opacity-40 ${
            activeTab === "validate" ? "border-prizm-primary text-prizm-primary bg-prizm-primary/5" : "border-transparent text-prizm-text-muted hover:text-slate-200"
          }`}
        >
          <Activity size={12} className="inline mr-2" />
          Live LAN Audit
        </button>
      </div>

      {/* Content Panels */}
      {activeTab === "profiles" && (
        <div className="space-y-6">
          {/* Editor Form */}
          {isEditing ? (
            <form onSubmit={handleSave} className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-xs font-bold text-prizm-primary uppercase">
                  {editId ? "Modify Topology Profile" : "Create New Topology Profile"}
                </span>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-[10px] text-prizm-text-muted hover:text-slate-200 uppercase"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase block font-bold">Profile Name</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={e => setProfileName(e.target.value)}
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-cyan-400 font-extrabold focus:outline-none"
                    placeholder="e.g. Centipede Stack 750 Layout"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-prizm-text-muted uppercase block font-bold">Equipment Layout Family</label>
                  <select
                    value={layoutFamily}
                    onChange={e => setLayoutFamily(e.target.value as any)}
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-slate-200 focus:outline-none font-extrabold"
                  >
                    <option value="stack750">Stack 750 / Centipede Layout</option>
                    <option value="stack360">Stack 360 / Containerized Layout</option>
                    <option value="custom">Custom IP Plan Layout</option>
                  </select>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-prizm-text-muted uppercase block font-bold">Active Subnets (Comma Separated CIDR)</label>
                  <input
                    type="text"
                    value={subnets}
                    onChange={e => setSubnets(e.target.value)}
                    className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-slate-200 focus:outline-none"
                    placeholder="e.g. 10.0.0.0/16, 172.16.0.0/12"
                  />
                </div>

                {layoutFamily === "stack750" && (
                  <>
                    <div className="space-y-1">
                      <label className="text-prizm-text-muted uppercase block font-bold">Array Start Index</label>
                      <input
                        type="number"
                        value={arrayStart}
                        onChange={e => setArrayStart(parseInt(e.target.value) || 1)}
                        className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-slate-200"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-prizm-text-muted uppercase block font-bold">Array End Index</label>
                      <input
                        type="number"
                        value={arrayEnd}
                        onChange={e => setArrayEnd(parseInt(e.target.value) || 1)}
                        className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-slate-200"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-prizm-text-muted uppercase block font-bold">ES Strings Per Array</label>
                      <input
                        type="number"
                        value={esCountPerArray}
                        onChange={e => setEsCountPerArray(parseInt(e.target.value) || 1)}
                        className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-slate-200"
                      />
                    </div>
                  </>
                )}

                {layoutFamily === "stack360" && (
                  <>
                    <div className="space-y-1">
                      <label className="text-prizm-text-muted uppercase block font-bold">Container Start Index</label>
                      <input
                        type="number"
                        value={containerStart}
                        onChange={e => setContainerStart(parseInt(e.target.value) || 1)}
                        className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-slate-200"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-prizm-text-muted uppercase block font-bold">Container End Index</label>
                      <input
                        type="number"
                        value={containerEnd}
                        onChange={e => setContainerEnd(parseInt(e.target.value) || 1)}
                        className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-slate-200"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-prizm-text-muted uppercase block font-bold">Stacks Per Container</label>
                      <input
                        type="number"
                        value={stacksPerContainer}
                        onChange={e => setStacksPerContainer(parseInt(e.target.value) || 1)}
                        className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-slate-200"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-prizm-text-muted uppercase block font-bold">ES Strings Per Stack</label>
                      <input
                        type="number"
                        value={esCountPerStack}
                        onChange={e => setEsCountPerStack(parseInt(e.target.value) || 1)}
                        className="w-full bg-prizm-surface-strong border border-prizm-border rounded p-2 text-slate-200"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 border border-white/10 rounded uppercase text-[10px] font-bold cursor-pointer hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-prizm-primary text-black rounded uppercase text-[10px] font-black cursor-pointer hover:bg-cyan-400 flex items-center gap-1.5"
                >
                  <Save size={12} />
                  Save Configuration
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Profile List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Configured Layout Profiles</span>
                  <button
                    onClick={handleCreateNew}
                    className="px-3 py-1.5 bg-prizm-primary/10 border border-prizm-primary/30 text-prizm-primary text-[10px] font-extrabold uppercase rounded hover:bg-prizm-primary/20 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} />
                    New Profile
                  </button>
                </div>

                <div className="space-y-3">
                  {profiles.length === 0 ? (
                    <div className="p-8 border border-dashed border-prizm-border rounded-lg text-center text-[11px] text-prizm-text-muted uppercase">
                      No topology profiles configured yet. Click New Profile or use the importer to begin.
                    </div>
                  ) : (
                    profiles.map(prof => {
                      const isActive = activeProfile?.id === prof.id;
                      return (
                        <div
                          key={prof.id}
                          className={`p-4 rounded-lg border font-mono text-[11px] transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                            isActive
                              ? "bg-prizm-primary/5 border-prizm-primary"
                              : "bg-prizm-surface border-prizm-border hover:border-slate-500"
                          }`}
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-xs text-slate-100 truncate block">{prof.profileName}</span>
                              {isActive && (
                                <span className="px-2 py-0.5 rounded text-[8px] uppercase font-black bg-prizm-primary/20 text-prizm-primary tracking-widest border border-prizm-primary/30">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-prizm-text-muted uppercase">
                              <span>Family: <strong className="text-slate-300">{prof.layoutFamily}</strong></span>
                              <span>Subnets: <strong className="text-slate-300">{prof.ipPlan.subnets.join(", ")}</strong></span>
                              {prof.layoutFamily === "stack750" && (
                                <span>Arrays: <strong className="text-slate-300">{prof.ipPlan.arrayStart}-{prof.ipPlan.arrayEnd} ({prof.ipPlan.esCountPerArray} ES/array)</strong></span>
                              )}
                              {prof.layoutFamily === "stack360" && (
                                <span>Containers: <strong className="text-slate-300">{prof.ipPlan.containerStart}-{prof.ipPlan.containerEnd} ({prof.ipPlan.esCountPerStack} ES/stack)</strong></span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isActive && (
                              <button
                                onClick={() => handleActivate(prof.id)}
                                className="px-2.5 py-1.5 bg-prizm-primary text-black font-extrabold text-[9px] uppercase rounded hover:bg-cyan-400 cursor-pointer"
                                title="Activate Profile"
                              >
                                Activate
                              </button>
                            )}
                            <button
                              onClick={() => handleGeneratePreview(prof)}
                              className="px-2.5 py-1.5 border border-white/10 hover:bg-white/5 text-slate-300 text-[9px] uppercase rounded cursor-pointer"
                              title="Preview Devices"
                            >
                              Preview
                            </button>
                            <button
                              onClick={() => handleEdit(prof)}
                              className="p-1.5 border border-white/10 hover:bg-white/5 text-slate-400 hover:text-slate-200 rounded cursor-pointer"
                              title="Edit Settings"
                            >
                              <Settings size={13} />
                            </button>
                            <button
                              onClick={() => handleExport(prof.id)}
                              className="p-1.5 border border-white/10 hover:bg-white/5 text-slate-400 hover:text-slate-200 rounded cursor-pointer"
                              title="Export Layout Profile"
                            >
                              <FileDown size={13} />
                            </button>
                            {!isActive && (
                              <button
                                onClick={() => handleDelete(prof.id)}
                                className="p-1.5 border border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded cursor-pointer"
                                title="Delete Profile"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Import Area */}
              <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-4">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">Import Saved Layouts</span>
                <p className="text-[10px] text-prizm-text-muted leading-relaxed uppercase">
                  Upload previously saved JSON topology profiles, CSV tables, or XLSX exported spreadsheets.
                </p>

                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                    dragActive
                      ? "border-prizm-primary bg-prizm-primary/5"
                      : "border-white/10 hover:border-white/20 bg-prizm-surface-strong/30"
                  }`}
                >
                  <input
                    type="file"
                    id="file-upload-input"
                    className="hidden"
                    accept=".json,.csv,.xlsx,.gsheet"
                    onChange={handleFileInput}
                  />
                  <label htmlFor="file-upload-input" className="cursor-pointer space-y-2 block">
                    <FileUp size={24} className="mx-auto text-prizm-primary" />
                    <span className="block text-[11px] font-bold text-slate-200 uppercase">Drag & Drop file here</span>
                    <span className="block text-[9px] text-prizm-text-muted uppercase">or click to browse local files</span>
                  </label>
                </div>

                <div className="bg-prizm-surface-strong p-3.5 rounded border border-white/5 text-[10px] space-y-1.5 text-prizm-text-muted">
                  <div className="flex items-start gap-1.5">
                    <Info size={12} className="text-cyan-400 shrink-0 mt-0.5" />
                    <span>Google Sheets shortcuts (.gsheet) cannot be imported directly. Export from Sheets as Excel (.xlsx) or CSV, then drop it.</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "preview" && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-2">
            <div>
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">Expected Topology Devices Preview</span>
              <span className="text-[10px] text-prizm-text-muted uppercase">
                Showing deterministic layout maps generated by active layout rules ({previewDevices.length} expected devices).
              </span>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
              {["all", "cs", "es", "pcs", "feather"].map(t => (
                <button
                  key={t}
                  onClick={() => setPreviewFilterType(t)}
                  className={`px-2.5 py-1 rounded text-[9px] font-extrabold uppercase tracking-wide cursor-pointer border ${
                    previewFilterType === t
                      ? "bg-prizm-primary/10 border-prizm-primary text-prizm-primary"
                      : "border-white/5 hover:border-white/10 text-prizm-text-muted hover:text-slate-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto no-scrollbar pr-1">
            {previewDevices
              .filter(d => previewFilterType === "all" || d.deviceType === previewFilterType)
              .map(d => (
                <div key={d.id} className="p-3 bg-prizm-surface border border-prizm-border/60 rounded-md font-mono text-[10.5px] space-y-2 relative">
                  <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                    <span className="font-extrabold text-slate-200 truncate pr-2">{d.calloutLabel}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold ${
                      d.deviceType === "cs" ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20" :
                      d.deviceType === "es" ? "bg-amber-400/10 text-amber-400 border border-amber-400/20" :
                      d.deviceType === "pcs" ? "bg-cyan-400/10 text-cyan-400 border border-cyan-400/20" :
                      "bg-blue-400/10 text-blue-400 border border-blue-400/20"
                    }`}>
                      {d.deviceType}
                    </span>
                  </div>

                  <div className="space-y-1 text-prizm-text-muted">
                    <div className="flex justify-between">
                      <span>IP Address:</span>
                      <strong className="text-slate-200">{d.ip}</strong>
                    </div>
                    {d.arrayIndex !== undefined && (
                      <div className="flex justify-between">
                        <span>Array/Section:</span>
                        <span>Array {d.arrayIndex}</span>
                      </div>
                    )}
                    {d.containerIndex !== undefined && (
                      <div className="flex justify-between">
                        <span>Container Index:</span>
                        <span>Cont {d.containerIndex}</span>
                      </div>
                    )}
                    {d.stackIndex !== undefined && (
                      <div className="flex justify-between">
                        <span>Stack Index:</span>
                        <span>Stack {d.stackIndex}</span>
                      </div>
                    )}
                    {d.segmentType && (
                      <div className="flex justify-between">
                        <span>Segment Class:</span>
                        <span className="lowercase">{d.segmentType}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {activeTab === "validate" && (
        <div className="space-y-6 animate-fade-in text-[11px]">
          {validationResult ? (
            <div className="space-y-6">
              {/* Validation Summary Card */}
              <div className="p-5 bg-prizm-surface border border-prizm-border rounded-lg flex flex-col md:flex-row items-stretch justify-between gap-5 font-mono">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="text-prizm-primary animate-pulse" size={16} />
                    <span className="text-xs font-bold uppercase text-slate-100">Live LAN Validation Report</span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 uppercase text-[10px] text-prizm-text-muted">
                    <div>Expected Devices: <strong className="text-slate-200">{validationResult.summary?.expectedCount || 0}</strong></div>
                    <div>Responsive/Online: <strong className="text-emerald-400">{validationResult.summary?.onlineCount || 0}</strong></div>
                    <div>Offline/Unresponsive: <strong className="text-red-400">{validationResult.summary?.offlineCount || 0}</strong></div>
                    <div>Unexpected/Rogue: <strong className="text-amber-400">{validationResult.summary?.unmappedCount || 0}</strong></div>
                  </div>
                </div>

                <div className="border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6 flex flex-col justify-center text-center">
                  <span className="text-[9px] text-prizm-text-muted uppercase">Site Integrity Index</span>
                  <span className={`text-3xl font-black mt-1 ${
                    (validationResult.summary?.integrityScore || 100) > 90 ? "text-emerald-400" :
                    (validationResult.summary?.integrityScore || 100) > 70 ? "text-amber-400" : "text-red-400"
                  }`}>
                    {validationResult.summary?.integrityScore || 100}%
                  </span>
                  <span className="text-[8px] text-prizm-text/50 uppercase mt-0.5">Scada Match rate</span>
                </div>
              </div>

              {/* Mismatch Groupings */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Unresponsive expected devices */}
                <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-extrabold uppercase text-red-400 flex items-center gap-1.5">
                      <AlertCircle size={14} className="text-red-400" />
                      Expected but Unresponsive ({(validationResult.validation?.unresponsive || []).length})
                    </span>
                    <span className="text-[8px] bg-red-400/10 text-red-400 border border-red-400/20 rounded p-0.5 px-1.5">OFFLINE</span>
                  </div>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto no-scrollbar">
                    {(validationResult.validation?.unresponsive || []).length === 0 ? (
                      <div className="p-6 text-center text-[10px] text-prizm-text-muted italic uppercase">
                        No missing devices. All expected equipment is responsive on LAN!
                      </div>
                    ) : (
                      validationResult.validation.unresponsive.map((d: any) => (
                        <div key={d.ip} className="p-2.5 bg-prizm-surface-strong rounded border border-white/5 flex justify-between items-center">
                          <div>
                            <strong className="text-slate-200">{d.calloutLabel}</strong>
                            <span className="text-[9px] text-prizm-text-muted block mt-0.5">IP: {d.ip} — ROLE: {d.deviceType?.toUpperCase()}</span>
                          </div>
                          <span className="text-[9px] text-red-400 font-extrabold">NO REPLY</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 2. Unexpected / Rogue Devices */}
                <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-extrabold uppercase text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-amber-400" />
                      Unexpected / Rogue on Site LAN ({(validationResult.validation?.rogue || []).length})
                    </span>
                    <span className="text-[8px] bg-amber-400/10 text-amber-400 border border-amber-400/20 rounded p-0.5 px-1.5 font-bold">UNMAPPED</span>
                  </div>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto no-scrollbar">
                    {(validationResult.validation?.rogue || []).length === 0 ? (
                      <div className="p-6 text-center text-[10px] text-prizm-text-muted italic uppercase">
                        No rogue devices found. Network layout perfectly matches layout profile!
                      </div>
                    ) : (
                      validationResult.validation.rogue.map((d: any) => (
                        <div key={d.ip} className="p-2.5 bg-prizm-surface-strong rounded border border-white/5 flex justify-between items-center">
                          <div>
                            <strong className="text-slate-200">{d.calloutLabel || "Unknown Host"}</strong>
                            <span className="text-[9px] text-prizm-text-muted block mt-0.5">IP Address: {d.ip}</span>
                          </div>
                          <span className="text-[9px] text-amber-400 font-bold">ACTIVE ROUTE</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 3. Type/Role Mismatch */}
                <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-extrabold uppercase text-orange-400 flex items-center gap-1.5">
                      <Sliders size={14} className="text-orange-400" />
                      Type & Role Overlaps / Mismatches ({(validationResult.validation?.typeMismatches || []).length})
                    </span>
                    <span className="text-[8px] bg-orange-400/10 text-orange-400 border border-orange-400/20 rounded p-0.5 px-1.5 font-bold">CONFLICT</span>
                  </div>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto no-scrollbar">
                    {(validationResult.validation?.typeMismatches || []).length === 0 ? (
                      <div className="p-6 text-center text-[10px] text-prizm-text-muted italic uppercase">
                        No type mismatch conflicts found. Equipment roles are validated.
                      </div>
                    ) : (
                      validationResult.validation.typeMismatches.map((m: any) => (
                        <div key={m.ip} className="p-2.5 bg-prizm-surface-strong rounded border border-white/5 space-y-1">
                          <div className="flex justify-between">
                            <strong className="text-slate-200">Device {m.ip}</strong>
                            <span className="text-[9px] text-orange-400 font-black">ROLE MATCH FAIL</span>
                          </div>
                          <p className="text-[10px] text-prizm-text-muted leading-relaxed">
                            Profile expects type <strong className="text-slate-200">{m.expected}</strong> but live discovery signature matches <strong className="text-cyan-400">{m.actual}</strong>.
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 4. Segment Indexing Errors */}
                <div className="bg-prizm-surface border border-prizm-border rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-extrabold uppercase text-purple-400 flex items-center gap-1.5">
                      <Database size={14} className="text-purple-400" />
                      Segment Indexing Errors ({(validationResult.validation?.indexingErrors || []).length})
                    </span>
                    <span className="text-[8px] bg-purple-400/10 text-purple-400 border border-purple-400/20 rounded p-0.5 px-1.5 font-bold">STRUCTURE</span>
                  </div>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto no-scrollbar">
                    {(validationResult.validation?.indexingErrors || []).length === 0 ? (
                      <div className="p-6 text-center text-[10px] text-prizm-text-muted italic uppercase">
                        No segment indexing errors found. Physical hierarchies mapped perfectly.
                      </div>
                    ) : (
                      validationResult.validation.indexingErrors.map((err: any, idx: number) => (
                        <div key={idx} className="p-2.5 bg-prizm-surface-strong rounded border border-white/5 space-y-1">
                          <div className="flex justify-between">
                            <strong className="text-slate-200">{err.id || "Segment Audit"}</strong>
                            <span className="text-[9px] text-purple-400 font-black">INDEXING FAIL</span>
                          </div>
                          <p className="text-[10px] text-prizm-text-muted leading-relaxed">
                            {err.message || `Expected segment elements count mismatch at index.`}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 border border-dashed border-prizm-border rounded-lg text-center space-y-4 font-mono">
              <Activity className="mx-auto text-prizm-text-muted animate-pulse" size={24} />
              <div className="space-y-1">
                <span className="block text-[11px] font-bold text-slate-200 uppercase">Validate Active Site Topology</span>
                <span className="block text-[9px] text-prizm-text-muted uppercase max-w-md mx-auto">
                  Scan active LAN nodes and cross-reference them against expected profile rules to detect mismatches.
                </span>
              </div>
              <button
                onClick={handleValidateLan}
                className="px-4 py-2 bg-prizm-primary text-black font-extrabold text-[10px] uppercase rounded cursor-pointer hover:bg-cyan-400"
              >
                Start Active Validation Scan
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
