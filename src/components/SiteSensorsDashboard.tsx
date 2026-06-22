import React, { useState } from "react";
import SensorsView from "./kobold/SensorsView";
import TopologySensorHealthPanel from "./siteSensors/TopologySensorHealthPanel";
import { Activity, Layers, Sliders } from "lucide-react";

/**
 * Site Sensors Dashboard Component
 * Coordinates the new Live EMS Topology health view and the legacy Sensors & Safety Diagnostics view.
 */
export default function SiteSensorsDashboard() {
  const [activeTab, setActiveTab] = useState<"topology" | "legacy">("topology");

  return (
    <div id="prizm-site-sensors-dashboard" className="space-y-6">
      {/* Tab Switcher Console */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("topology")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
            activeTab === "topology"
              ? "border-slate-900 text-slate-900 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <Activity size={16} className={activeTab === "topology" ? "text-indigo-600 animate-pulse" : "text-slate-400"} />
          <span>EMS Topology Sensor Health</span>
          <span className="px-1.5 py-0.2 text-[9px] font-bold bg-indigo-50 text-indigo-700 rounded-full">
            NEW
          </span>
        </button>

        <button
          onClick={() => setActiveTab("legacy")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
            activeTab === "legacy"
              ? "border-slate-900 text-slate-900 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <Layers size={16} className={activeTab === "legacy" ? "text-slate-800" : "text-slate-400"} />
          <span>Legacy Safety Diagnostics</span>
        </button>
      </div>

      {/* Render Active View Panels */}
      <div className="pt-2">
        {activeTab === "topology" ? (
          <TopologySensorHealthPanel />
        ) : (
          <SensorsView />
        )}
      </div>
    </div>
  );
}

