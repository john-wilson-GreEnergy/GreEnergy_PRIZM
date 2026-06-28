import { SiteTopologyProfile, SiteTopologyDevice } from "../server/topology/siteTopologyEngine";

export function getTopologyUiCapabilities(
  profile?: SiteTopologyProfile | null,
  device?: SiteTopologyDevice | any | null
) {
  // Safe defaults (Stack 750 / Solar Star assumption for backward compatibility)
  const family = profile?.layoutFamily || "stack750_800";
  const uiMode = profile?.uiMode || "lineup";

  const is750 = family === "stack750_800";
  const is360 = family === "stack360";
  const is225 = family === "stack225_230";
  const isCustom = family === "custom";

  return {
    uiMode,
    isStack750_800: is750,
    isStack360: is360,
    isStack225_230: is225,
    isCustom,

    showLineupViews: is750 || uiMode === "lineup",
    showContainerViews: is360 || uiMode === "container",
    showDistributedEnvironmentalViews: is225 || uiMode === "distributed-environmental",

    // Common Core Views (generally visible across all site configs)
    showStringSummary: true,
    showCellMetrics: true,
    showFleetCapacity: true,
    showCorrectiveActions: true,
    showPcsDashboard: true,
    showSiteHealth: true,
    showCellHeatmap: true,
    showSensorHealth: true,

    showFeatherHvacPage: true, 
    showEnvironmentalControllerPage: true,

    // Device-specific / Profile-specific UI gating
    showCsEsTerminology: is750 || (device?.topology?.segmentType === "CS" || device?.topology?.segmentType === "ES"),
    
    showPairedStrings: (() => {
      // For Stack 750, we want to show this block even for CS so the placeholder renders
      if (is750) return true;
      return !!(device?.topology?.pairedStringNumbers && device.topology.pairedStringNumbers.length > 0);
    })(),

    showStringBpcTable: (() => {
      if (is750) return device?.topology?.segmentType === "ES" || device?.segmentType === "ES" || (device?.topology?.segmentType !== "CS" && device?.segmentType !== "CS");
      return !!(device?.topology?.pairedStringNumbers && device.topology.pairedStringNumbers.length > 0);
    })(),

    showCellVoltage: (() => {
       if (is750) return device?.topology?.segmentType === "ES" || device?.segmentType === "ES" || (device?.topology?.segmentType !== "CS" && device?.segmentType !== "CS");
       return device?.topology?.capabilities?.hasCellVoltage || false;
    })(),

    showCellTemperature: (() => {
       if (is750) return device?.topology?.segmentType === "ES" || device?.segmentType === "ES" || (device?.topology?.segmentType !== "CS" && device?.segmentType !== "CS");
       return device?.topology?.capabilities?.hasCellTemperature || false;
    })(),

    showStack750DetectorList: is750,
    showContainerDetectorList: is360 || is225 || uiMode === "container" || uiMode === "distributed-environmental",
    showDistributedEnvDetectorList: is225 || uiMode === "distributed-environmental",
  };
}
