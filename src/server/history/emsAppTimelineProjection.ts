import {DRAGON_APP_CODE_NAME_MAP} from "../ems/emsAppInteractionRegistry";
import {finiteReading, type TimelineObservation} from "./operationalTimelineModel";
type App = {
  appCode?: string; priority?: number; enabledRaw?: unknown; stalePreserved?: boolean;
  sourceTimestampUtc?: string | null; sourceBaseUrl?: string | null; sourceLive?: boolean;
  powerControlSetpoints?: {realPowerkW: number | null; reactivePowerkVAr: number | null};
};
export function projectEmsAppTimeline(apps: App[], baseUrl: string | null, block: number | null, observedAt: number): TimelineObservation[] {
  if (!Number.isInteger(block) || block! < 1) return [];
  return apps.slice(0, 128).flatMap(app => {
    if (!app.appCode || !/^[A-Z0-9_-]{1,32}$/.test(app.appCode) || !Number.isInteger(app.priority)) return [];
    let matches = false;
    try {matches = new URL(app.sourceBaseUrl!).href.replace(/\/$/, "") === new URL(baseUrl!).href.replace(/\/$/, "");} catch {}
    const sourceAt = app.sourceTimestampUtc ? Date.parse(app.sourceTimestampUtc) : NaN;
    const values: TimelineObservation["values"] = {"Reported enabled": app.enabledRaw === true ? "ENABLED" : app.enabledRaw === false ? "DISABLED" : null};
    if (app.appCode === "PC00001") {
      values["Reported setpoint kW"] = finiteReading(app.powerControlSetpoints?.realPowerkW);
      values["Reported setpoint kVAR"] = finiteReading(app.powerControlSetpoints?.reactivePowerkVAr);
    }
    return [{entity: `ems-app:${app.appCode}:${app.priority}`, scope: "block", array: 0, label: `Block ${block} · ${DRAGON_APP_CODE_NAME_MAP[app.appCode] || app.appCode} [${app.appCode}/${app.priority}]`,
      stream: "ems-app", source: "EMS BlockViewer app report", sourceAt: Number.isFinite(sourceAt) ? sourceAt : null, observedAt,
      quality: matches && app.sourceLive === true && !app.stalePreserved ? "live" : "unavailable", values}];
  });
}
