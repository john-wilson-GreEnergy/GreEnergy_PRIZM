import React, { useEffect, useState } from "react";
import { Database, Map, Network, Pencil, RefreshCw, Save, Settings, X } from "lucide-react";
import ConnectionSettings from "./ConnectionSettings";
import SiteProfileDiscoveryPanel from "./SiteProfileDiscoveryPanel";
import SitePhysicalLayoutEditor from "./SitePhysicalLayoutEditor";

type SubTabId = "automatic" | "physical-layout" | "manual" | "local-data";

export default function SiteConfigurationDashboard() {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>("automatic");
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingSiteName, setEditingSiteName] = useState(false);
  const [siteNameDraft, setSiteNameDraft] = useState("");
  const [siteNameError, setSiteNameError] = useState("");
  const [savingSiteName, setSavingSiteName] = useState(false);

  const fetchConfigData = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/local/ems/connection-status");
      if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
        setConnectionStatus(await response.json());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfigData().catch(() => setLoading(false)); }, []);

  const hasActiveProfile = !!connectionStatus?.activeProfileName;
  const activeProfileName = connectionStatus?.activeProfileName || "No active profile";
  const siteName = connectionStatus?.siteName || activeProfileName;
  const isReachable = !!connectionStatus?.reachable;

  const beginSiteNameEdit = () => {
    setSiteNameDraft(siteName === "No active profile" ? "" : siteName);
    setSiteNameError("");
    setEditingSiteName(true);
  };

  const saveSiteName = async () => {
    const profileId = connectionStatus?.activeProfileId;
    const nextName = siteNameDraft.trim();
    if (!profileId) return setSiteNameError("Activate a site profile first.");
    if (!nextName) return setSiteNameError("Site name is required.");
    setSavingSiteName(true);
    setSiteNameError("");
    try {
      const response = await fetch(`/api/settings/profiles/${profileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteName: nextName })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to save the site name.");
      setEditingSiteName(false);
      await fetchConfigData();
    } catch (error: any) {
      setSiteNameError(error?.message || "Unable to save the site name.");
    } finally {
      setSavingSiteName(false);
    }
  };

  const tabs: Array<{ id: SubTabId; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: "automatic", label: "Automatic Setup", icon: Network },
    { id: "physical-layout", label: "Physical Layout & Labels", icon: Map },
    { id: "manual", label: "EMS Connections", icon: Settings },
    { id: "local-data", label: "Local Storage", icon: Database }
  ];

  return (
    <div className="w-full space-y-5 pb-8 text-slate-800 animate-fade-in">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider">Site Configuration</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
              PRIZM builds the site layout from telemetry it already collects. Review and activate the discovered layout here; use manual adjustments only when field evidence needs correction.
            </p>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-3 xl:max-w-3xl">
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase text-slate-400">Site</span>
              {editingSiteName ? (
                <div className="mt-1">
                  <div className="flex items-center gap-1">
                    <input autoFocus aria-label="Site name" value={siteNameDraft} onChange={event => setSiteNameDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") saveSiteName(); if (event.key === "Escape") setEditingSiteName(false); }} className="min-w-0 flex-1 rounded border border-emerald-400 bg-white px-2 py-1 font-bold outline-none focus:ring-2 focus:ring-emerald-200" />
                    <button aria-label="Save site name" title="Save site name" onClick={saveSiteName} disabled={savingSiteName} className="rounded p-1 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">{savingSiteName ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}</button>
                    <button aria-label="Cancel" title="Cancel" onClick={() => setEditingSiteName(false)} className="rounded p-1 text-slate-500 hover:bg-slate-200"><X size={14} /></button>
                  </div>
                  {siteNameError && <span className="mt-1 block text-[10px] text-red-600">{siteNameError}</span>}
                </div>
              ) : (
                <div className="mt-1 flex min-w-0 items-center gap-1">
                  <strong className="truncate" title={siteName}>{loading ? "Loading…" : siteName}</strong>
                  {hasActiveProfile && <button aria-label="Edit site name" title="Edit site name" onClick={beginSiteNameEdit} className="shrink-0 rounded p-1 text-slate-400 hover:bg-emerald-100 hover:text-emerald-700"><Pencil size={12} /></button>}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase text-slate-400">Active Profile</span>
              <strong className="mt-1 block truncate" title={activeProfileName}>{activeProfileName}</strong>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">EMS Connection</span>
              <div className="mt-1 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${isReachable ? "bg-emerald-500" : "bg-amber-500"}`} />
                <strong className={isReachable ? "text-emerald-700" : "text-amber-700"}>{isReachable ? "Connected" : "Needs attention"}</strong>
                <button onClick={() => fetchConfigData()} disabled={loading} aria-label="Refresh connection summary" title="Refresh connection summary" className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /></button>
              </div>
            </div>
          </div>
        </div>

        <nav className="mt-5 flex overflow-x-auto border-b border-slate-200" aria-label="Site configuration sections">
          {tabs.map(item => {
            const Icon = item.icon;
            const active = activeSubTab === item.id;
            return <button key={item.id} onClick={() => setActiveSubTab(item.id)} className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-bold uppercase tracking-wider ${active ? "border-emerald-500 bg-emerald-50/50 text-emerald-700" : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}><Icon size={14} />{item.label}</button>;
          })}
        </nav>
      </header>

      <section className="animate-fade-in">
        <div hidden={activeSubTab !== "automatic"}><SiteProfileDiscoveryPanel onActivated={fetchConfigData} /></div>
        <div hidden={activeSubTab !== "physical-layout"}><SitePhysicalLayoutEditor /></div>
        <div hidden={activeSubTab !== "manual"}><ConnectionSettings mode="profile" onProfileChanged={fetchConfigData} /></div>
        <div hidden={activeSubTab !== "local-data"}><ConnectionSettings mode="cache" /></div>
      </section>
    </div>
  );
}
