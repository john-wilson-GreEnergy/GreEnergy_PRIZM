import React from "react";
import SensorsView from "./kobold/SensorsView";

/**
 * Site Sensors Dashboard Component
 * Wires the All Sensors telemetry view under "/api/local/site-sensors/summary"
 */
export default function SiteSensorsDashboard() {
  return (
    <div id="prizm-site-sensors-dashboard">
      <SensorsView />
    </div>
  );
}
