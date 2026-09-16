import React from "react";
import TopologySensorHealthPanel from "./siteSensors/TopologySensorHealthPanel";

/**
 * Site Sensors Dashboard Component
 * Renders the Sensor Health & Open Closed Detectors panel.
 */
export default function SiteSensorsDashboard() {
  return (
    <div id="prizm-site-sensors-dashboard">
      <div className="animate-fade-in">
        <TopologySensorHealthPanel />
      </div>
    </div>
  );
}
