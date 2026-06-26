import React from "react";
import TopologySensorHealthPanel from "./siteSensors/TopologySensorHealthPanel";

/**
 * Site Sensors Dashboard Component
 * Renders the Sensor Health & Open Closed Detectors panel.
 */
export default function SiteSensorsDashboard() {
  return (
    <div id="prizm-site-sensors-dashboard" className="space-y-6">
      <div className="border-b border-prizm-border/40 pb-3">
        <h2 className="text-prizm-text font-bold text-sm uppercase tracking-wider">
          Sensor Health & Open Closed Detectors
        </h2>
      </div>
      <div className="pt-2 animate-fade-in">
        <TopologySensorHealthPanel />
      </div>
    </div>
  );
}
