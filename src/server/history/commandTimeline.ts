import {randomUUID} from "node:crypto";
import {operationalTimeline, type OperationalTimeline} from "./operationalTimeline";
type Target = {array: number; string?: number; allStrings?: boolean; pcs?: number; allPcs?: boolean; scope?: "block"; blockIndex?: number; stationCode?: string};
type Result = {accepted?: boolean; readbackConfirmed?: boolean | null};
// Allowlisted summaries only: never persist request bodies, credentials, response text, or operator notes here.
export function beginTimelineCommand(base: string, target: Target, action: string, recorder: OperationalTimeline = operationalTimeline()) {
  const id = randomUUID();
  let site = recorder.captureSite(base);
  if (site && target.scope === "block") {
    try {const [station, block] = JSON.parse(site.id); if (station !== target.stationCode || Number(block) !== target.blockIndex) site = null;} catch {site = null;}
  }
  const string = target.allStrings ? undefined : target.string;
  const label = target.scope === "block" ? `Block ${target.blockIndex} · All arrays` : `Array ${target.array} · ${target.allStrings ? "All strings" : string ? `String ${string}` : target.pcs ? `PCS ${target.pcs}` : "All PCS"}`;
  const record = (phase: string, summary: string) => {
    try {
      const at = Date.now();
      recorder.recordCommand(site, {entity: `command:${id}:${phase}`, array: target.scope === "block" ? 0 : Number(target.array), scope: target.scope, string, label, stream: "command", source: "PRIZM command service",
        observedAt: at, sourceAt: at, quality: "live", values: {commandId: id, Summary: `${action} · ${summary}`}});
    } catch { /* History must never alter command execution or its returned result. */ }
  };
  record("requested", "REQUEST RECORDED — dispatch attempted; delivery and equipment response not yet confirmed");
  return {
    result(result: Result) {
      const delivery = result.accepted === true ? "accepted" : result.accepted === false ? "not accepted" : "unknown";
      const readback = result.readbackConfirmed === true ? "confirmed by command service" : result.readbackConfirmed === false ? "not confirmed by command service" : "unavailable";
      record("result", `RESULT — delivery: ${delivery}; readback: ${readback}. Compare with observed telemetry; acceptance alone is not actuation.`);
    },
    persistence(status: "persisted" | "changed" | "mismatch" | "unavailable") {record("persistence", `LATER SETTINGS CHECK — ${status}; not proof of active balancing`);}
  };
}
export function beginBlockTimelineCommand(base: string, identity: {stationCode: string; blockIndex: number}, action: string, recorder: OperationalTimeline = operationalTimeline()) {
  return beginTimelineCommand(base, {array: 0, scope: "block", ...identity}, action, recorder);
}
