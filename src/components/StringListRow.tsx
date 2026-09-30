import React from "react";
import { ChevronRight } from "lucide-react";
import StringCommunicationIndicator from "./StringCommunicationIndicator";
import { formatTemperatureF } from "../utils/temperatureScale";
import { formatPrizmUtcTimestamp } from "../lib/timeFormat";
import { normalizeVoltage, normalizeDeltaVoltage } from "../lib/voltageNormalizer";
import type { CanonicalStringSnapshotResult } from "../server/normalizers/canonicalStringSnapshot";

export type StringListRecord = CanonicalStringSnapshotResult["strings"][number];
export function rowCommunicationState(s: StringListRecord, now = Date.now()) {
                  const rowBucket = String(s.bucket || "").toLowerCase();

                  // Reference legend: dot 1 in rotation group is communication timestamp.
                  const sampleAgeMs = Number(s.sampleAgeMs ?? 0);
                  const rowTimestampMs = s.timestampUtc ? new Date(s.timestampUtc).getTime() : 0;
                  const timestampAgeMs = rowTimestampMs > 0 ? now - rowTimestampMs : Number.POSITIVE_INFINITY;

                  const commState =
                    s.bucket === "notCommunicating" || s.communicating === false || rowBucket === "notcommunicating"
                      ? "lost"
                      : s.stale === true || s.badReport === true || sampleAgeMs > 120000 || timestampAgeMs > 300000
                        ? "delayed"
                        : "fresh";


  return commState;
}
export interface StringListRowProps {
  s: StringListRecord;
  isArrFirst: boolean;
  isArrAllSelected: boolean;
  isArrIndeterminate: boolean;
  selected: boolean;
  arraySelectionIds: string;
  commState: ReturnType<typeof rowCommunicationState>;
  onOpen: (row: StringListRecord) => void;
  onToggleRow: (id: string) => void;
  onToggleArray: (ids: string[]) => void;
}
const formatNumber = (value: unknown, decimals = 2) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(decimals) : "--";
};
/** Presentation extracted unchanged; source authority remains upstream. */
export function StringListRow({s, isArrFirst, isArrAllSelected, isArrIndeterminate,
  selected, arraySelectionIds, commState, onOpen, onToggleRow, onToggleArray}: StringListRowProps) {
                  const rowWarnings = [
                    ...(Array.isArray(s.warnings) ? s.warnings : []),
                    ...(Array.isArray(s.notificationList) ? s.notificationList : []),
                    ...(Array.isArray(s.activeNotifications) ? s.activeNotifications : []),
                    ...(Array.isArray(s.faults) ? s.faults : [])
                  ];

                  const rowAlarms = Array.isArray(s.alarms) ? s.alarms : [];

                  // Rotation is an independent controller state. Do not derive it
                  // from balancing mode, contactors, alerts, or operational bucket.
                  const rotationText = String(
                    s.rotationStatus ??
                    s.rotationState ??
                    s.stringRotationState ??
                    ""
                  ).trim().toUpperCase();
                  let rotationDisplayState: "IN" | "OUT" | "UNKNOWN" = "UNKNOWN";
                  if (rotationText === "OUT" || rotationText === "OUT_OF_ROTATION" || rotationText === "OUT OF ROTATION") {
                    rotationDisplayState = "OUT";
                  } else if (rotationText === "IN" || rotationText === "IN_ROTATION" || rotationText === "IN ROTATION") {
                    rotationDisplayState = "IN";
                  } else if (s.outRotation === true || s.inRotation === false) {
                    rotationDisplayState = "OUT";
                  } else if (s.inRotation === true || s.outRotation === false) {
                    rotationDisplayState = "IN";
                  } else {
                    const nestedRotationText = String(s.rotation?.displayState ?? "").trim().toUpperCase();
                    if (nestedRotationText === "OUT" || s.rotation?.outOfRotation === true || s.rotation?.inRotation === false) {
                      rotationDisplayState = "OUT";
                    } else if (nestedRotationText === "IN" || s.rotation?.inRotation === true || s.rotation?.outOfRotation === false) {
                      rotationDisplayState = "IN";
                    }
                  }

                  // Reference legend: dot 3 in rotation group is notification severity.
                  // Counts and lists are alternate representations of the same
                  // canonical alerts, not additive sources.
                  const warningTotal = Math.max(
                    Number(s.warningCount || 0),
                    Number(s.uniqueWarningCount || 0),
                    rowWarnings.length,
                    0
                  );

                  const alarmTotal = Math.max(
                    Number(s.alarmCount || 0),
                    Number(s.uniqueAlarmCount || 0),
                    rowAlarms.length
                  );

                  const alertsState = alarmTotal > 0 ? "alarm" : warningTotal > 0 ? "warning" : "ok";

                  const rotDot1 =
                    commState === "lost"
                      ? "bg-prizm-danger border border-prizm-danger shadow-[0_0_5px_rgba(255,51,102,0.5)]"
                      : commState === "delayed"
                        ? "bg-prizm-warning border border-prizm-warning shadow-[0_0_5px_rgba(255,204,0,0.5)]"
                        : "bg-emerald-500 border border-emerald-600 shadow-[0_0_5px_rgba(16,185,129,0.5)]";

                  const rotDot2 = rotationDisplayState === "IN"
                    ? "bg-emerald-500 border border-emerald-600 shadow-[0_0_5px_rgba(16,185,129,0.5)]"
                    : rotationDisplayState === "OUT"
                      ? "bg-black border border-slate-500"
                      : "bg-slate-500 border border-slate-400";

                  const rotDot3 =
                    alertsState === "alarm"
                      ? "bg-prizm-danger border border-prizm-danger shadow-[0_0_5px_rgba(255,51,102,0.5)]"
                      : alertsState === "warning"
                        ? "bg-prizm-warning border border-prizm-warning shadow-[0_0_5px_rgba(255,204,0,0.5)]"
                        : "bg-emerald-500 border border-emerald-600 shadow-[0_0_5px_rgba(16,185,129,0.5)]";

                  // Reference legend: contactor group dots.
                  //
                  // The backend endpoint now publishes authoritative actual contactor state
                  // from stringviewer-live. Do not infer from requested state, connection
                  // permitted, stale aggregate values, or reclose count.
                  //
                  // Dot 1 = actual contactor state
                  // Dot 2 = positive feedback matches actual state
                  // Dot 3 = negative feedback matches actual state
                  const statusText = String(s.contactorStatus ?? "").trim().toUpperCase();

                  const interpretedClosed =
                    statusText === "CLOSED" ? true :
                    statusText === "OPEN" ? false :
                    null;

                  // Contactor dots compare actual feedback against requested state.
                  //
                  // green = this contactor matches requested open/closed state
                  // red   = this contactor does not match requested state
                  //
                  // Example:
                  // requested OPEN + positive open / negative open = both green
                  // requested OPEN + positive closed / negative open = positive red, negative green
                  // requested CLOSED + positive closed / negative open = positive green, negative red
                  const positiveClosed =
                    s.positiveContactorClosed === true ? true :
                    s.positiveContactorClosed === false ? false :
                    null;

                  const negativeClosed =
                    s.negativeContactorClosed === true ? true :
                    s.negativeContactorClosed === false ? false :
                    null;

                  const expectedClosed =
                    s.contactor?.contactorsCloseExpected === true ? true :
                    s.contactor?.contactorsCloseExpected === false ? false :
                    s.contactorsCloseExpected === true ? true :
                    s.contactorsCloseExpected === false ? false :
                    s.requestedContactorState === "closed" ? true :
                    s.requestedContactorState === "open" ? false :
                    null;

                  const requestedClosed = expectedClosed === true;

                  const positiveMatchesRequest =
                    expectedClosed === null || positiveClosed === null
                      ? false
                      : positiveClosed === expectedClosed;

                  const negativeMatchesRequest =
                    expectedClosed === null || negativeClosed === null
                      ? false
                      : negativeClosed === expectedClosed;

                  const contDot1 = requestedClosed
                    ? "bg-blue-500 border border-blue-600 shadow-[0_0_5px_rgba(59,130,246,0.5)]"
                    : "bg-white border border-slate-500";

                  const contDot2 = positiveMatchesRequest
                    ? "bg-emerald-500 border border-emerald-600 shadow-[0_0_5px_rgba(16,185,129,0.5)]"
                    : "bg-prizm-danger border border-prizm-danger shadow-[0_0_5px_rgba(255,51,102,0.5)]";

                  const contDot3 = negativeMatchesRequest
                    ? "bg-emerald-500 border border-emerald-600 shadow-[0_0_5px_rgba(16,185,129,0.5)]"
                    : "bg-prizm-danger border border-prizm-danger shadow-[0_0_5px_rgba(255,51,102,0.5)]";
                  
                  // Fans logic & color mapping
                  const MAX_FAN_RPM = 7500;
                  const FAN_MATCH_TOLERANCE_PERCENT = 5;

                  const toFiniteNumber = (value: any): number | null => {
                    const n = Number(value);
                    return Number.isFinite(n) ? n : null;
                  };

                  const formatPercent = (value: any): string => {
                    const n = toFiniteNumber(value);
                    return n === null ? "--" : `${Math.round(n)}%`;
                  };

                  const formatRpm = (value: any): string => {
                    const n = toFiniteNumber(value);
                    return n === null ? "--" : `${Math.round(n)} RPM`;
                  };

                  const formatFanCount = (value: any): string => {
                    const n = toFiniteNumber(value);
                    return n === null ? "--" : `${Math.round(n)}`;
                  };

                  const commandPct = toFiniteNumber(s.fanCommandPercent);
                  const settingPct = toFiniteNumber(s.fanSettingPercent);
                  const actualPct = toFiniteNumber(s.fanStatusPercent);
                  const avgRpm = toFiniteNumber(s.fanStatusAvgRpm);
                  const ratedRpm = toFiniteNumber(s.fanRatedRpm) ?? 7500;
                  const fanCountValue = toFiniteNumber(s.fanCount);
                  const fanState = String(s.fanState || "no-command").toLowerCase();
                  const fanTimeText = s.fanLastCommandTime || s.lastFanCommandTime || "--";

                  const fanDotClass =
                    fanState === "match"
                      ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"
                      : fanState === "mismatch"
                        ? "bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,0.5)]"
                        : "bg-black border border-neutral-700";

                  const fanRpmValues = Array.isArray(s.fanStatusRpmValues)
                    ? s.fanStatusRpmValues
                        .map((v: any) => toFiniteNumber(v))
                        .filter((v: number | null): v is number => v !== null)
                    : [];

                  const fanRpmLines =
                    fanRpmValues.length > 0
                      ? fanRpmValues.map((rpm: number, fanIdx: number) => `Fan ${fanIdx + 1} RPM: ${formatRpm(rpm)}`)
                      : [`Fan RPMs: --`];

                  const stateLabel =
                    fanState === "match" ? "Match" :
                    fanState === "mismatch" ? "Mismatch" :
                    fanState === "unknown" ? "Unknown" :
                    "No Command";

                  const fanTooltip = [
                    `Command: ${formatPercent(commandPct)}`,
                    `Actual: ${formatPercent(actualPct)}`,
                    `Setting: ${formatPercent(settingPct)}`,
                    `Avg RPM: ${formatRpm(avgRpm)}`,
                    `Rated RPM: ${formatRpm(ratedRpm)}`,
                    `Fans: ${formatFanCount(fanCountValue)}`,
                    ...fanRpmLines,
                    `Tolerance: ±5%`,
                    `State: ${stateLabel}`,
                    `Last Command Time: ${fanTimeText || "--"}`
                  ].join("\n");

                  const safeText = (value: any, fallback = "--"): string => {
                    if (value === null || value === undefined) return fallback;
                    if (typeof value === "string") {
                      const trimmed = value.trim();
                      return trimmed.length ? trimmed : fallback;
                    }
                    if (typeof value === "number" || typeof value === "boolean") {
                      return String(value);
                    }
                    return fallback;
                  };

                  const locStr = safeText(s.location, "") || safeText(s.container, "") || "--";

                  const telemetryAvailable = s.balanceTelemetryAvailable === true || (Array.isArray(s.balanceDetails) && s.balanceDetails.length > 0);
                  let balanceTooltip = "Balance telemetry not reported by current EMS source.";
                  let balCountToShow = "--";
                  let balActivityToShow = "Unknown";
                  let balModeToShow = "Not Reported";

                  if (telemetryAvailable) {
                      balCountToShow = String(s.balanceCount ?? 0);
                      balActivityToShow = s.balanceActivity || "Unknown";
                      balModeToShow = s.balanceMode && s.balanceMode !== "--" ? s.balanceMode : "Not Reported";

                      const details = Array.isArray(s.balanceDetails) ? s.balanceDetails : [];
                      const totalBpcs = details.length || 14;
                      const activeCount =
                        toFiniteNumber(s.balanceCount) ??
                        details.filter((b: any) => b.isActive === true).length;
                      const reportedCount = details.filter((b: any) =>
                        b.balanceTelemetryPresent === true && b.missingFromSource !== true
                      ).length;
                      const lines = details.map((b: any, bIdx: number) => {
                        const idx = b.bpIndex ?? b.bpcNumber ?? (bIdx + 1);
                        const modeStr = b.mode || "--";
                        const stateStr =
                          b.displayState ||
                          b.state ||
                          (b.missingFromSource ? "Not Reported" : "Off");
                        const cgStr =
                          b.balancingCellGroup !== null && b.balancingCellGroup !== undefined
                            ? `CG ${b.balancingCellGroup}`
                            : "CG --";
                        return `BPC ${idx}: ${modeStr} | ${stateStr} | ${cgStr}`;
                      });
                      balanceTooltip = [
                        `Activity: ${balActivityToShow}`,
                        `Configured mode: ${balModeToShow}`,
                        `Active: ${activeCount} / ${totalBpcs}`,
                        `Telemetry: ${reportedCount} / ${totalBpcs}`,
                        "",
                        ...lines
                      ].join("\n");
                  }
                  
                  let borderClass = "";
                  if (s.alarmCount > 0) borderClass = "border-l-[3px] border-l-prizm-danger/60";
                  else if (s.warningCount > 0) borderClass = "border-l-[3px] border-l-prizm-warning/60";
                  else borderClass = "border-l-[3px] border-l-transparent";

                  return (
                  <tr key={s.id} onClick={() => onOpen(s)} className="group hover:bg-prizm-primary/5 cursor-pointer transition-colors relative">
<td className={"px-1.5 py-0.5 border-r border-prizm-border/10 sticky left-0 group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 text-center " + borderClass}>
   {isArrFirst ? (
     <input type="checkbox" className="accent-prizm-primary w-3 h-3 cursor-pointer" 
       checked={isArrAllSelected}
       ref={el => { if(el) el.indeterminate = isArrIndeterminate; }}
       onChange={() => {}}
       onClick={(e) => {
         e.stopPropagation();
         onToggleArray(JSON.parse(arraySelectionIds));
       }} 
     />
   ) : null}
</td>
<td className="px-1.5 py-0.5 border-r border-prizm-border/20 sticky left-[30px] group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 min-w-[54px] sm:min-w-[64px]" title={s.warningCount > 0 || s.alarmCount > 0 ? `Warnings: ${(s.warnings||[]).join(", ")} | Alarms: ${(s.alarms||[]).join(", ")}` : ""}>
   {isArrFirst ? <span className="text-prizm-primary font-mono font-bold">{s.arrayNumber}</span> : null}
</td>
<td className="px-1.5 py-0.5 border-r border-prizm-border/10 sticky left-[84px] sm:left-[94px] group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 text-center">
   <input type="checkbox" className="accent-prizm-primary w-3 h-3 cursor-pointer" 
     checked={selected}
     onChange={() => {}}
     onClick={(e) => {
       e.stopPropagation();
       onToggleRow(s.id);
     }} 
   />
</td>
<td className="px-1.5 py-0.5 border-r border-prizm-border/20 sticky left-[114px] sm:left-[124px] group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 font-bold text-prizm-primary font-mono text-center min-w-[48px]">
   {s.stringNumber}
   <StringCommunicationIndicator row={s}/>
</td>
<td className="px-1.5 py-0.5">
                       <div 
                         className="flex items-center gap-1 cursor-help"
                         title={`Request: ${requestedClosed ? "CLOSED" : "OPEN"} | Positive actual: ${positiveClosed ? "CLOSED" : "OPEN"} (${positiveMatchesRequest ? "matches" : "does not match"}) | Negative actual: ${negativeClosed ? "CLOSED" : "OPEN"} (${negativeMatchesRequest ? "matches" : "does not match"}) | Reclose Count: ${s.recloseCount ?? "--"}`}
                       >
                           <div className={`w-2 h-2 rounded-full ${contDot1}`}></div>
                           <div className={`w-2 h-2 rounded-full ${contDot2}`}></div>
                           <div className={`w-2 h-2 rounded-full ${contDot3}`}></div>
                           <span className="ml-1 text-[9px] text-prizm-text-muted">R:{s.recloseCount ?? "--"}</span>
                       </div>
                    </td>
                    <td className="px-1.5 py-0.5">
                       <div 
                         className="flex items-center gap-1 cursor-help"
                         title={`Comm: ${commState.toUpperCase()} | Rotation: ${rotationDisplayState} | Notification: ${alertsState.toUpperCase()}`}
                       >
                          <div className={`w-2 h-2 rounded-full ${rotDot1}`}></div>
                          <div className={`w-2 h-2 rounded-full ${rotDot2}`}></div>
                          <div className={`w-2 h-2 rounded-full ${rotDot3}`}></div>
                       </div>
                    </td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-emerald-400">{s.measuredVoltage !== null ? s.measuredVoltage : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-info">{s.calculatedVoltage !== null ? s.calculatedVoltage : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.busVoltage !== null && s.busVoltage !== undefined ? s.busVoltage : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text">{s.amps !== null ? s.amps : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text">{s.kw !== null ? s.kw : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs font-bold">
                        {s.socPct !== null && s.socPct !== undefined && Number.isFinite(Number(s.socPct)) ? (() => {
                            const soc = Math.max(0, Math.min(100, Number(s.socPct)));
                            const fillClass = soc < 20 ? "bg-red-500" : soc < 50 ? "bg-amber-400" : "bg-emerald-500";
                            return (
                                <div className="flex items-center" title={`State of charge: ${Number(s.socPct).toFixed(1)}%`}>
                                    <div className="relative h-4 w-12 overflow-hidden rounded-[3px] border border-prizm-border bg-prizm-surface-strong shadow-inner">
                                        <div className={`absolute inset-y-0 left-0 ${fillClass} opacity-70 transition-[width] duration-300`} style={{ width: `${soc}%` }} />
                                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-extrabold text-prizm-text drop-shadow-[0_1px_0_rgba(255,255,255,0.75)]">
                                            {Number(s.socPct).toFixed(Number(s.socPct) % 1 === 0 ? 0 : 1)}%
                                        </span>
                                    </div>
                                    <span className="h-2 w-0.5 rounded-r bg-prizm-border" aria-hidden="true" />
                                </div>
                            );
                        })() : <span className="text-prizm-text-muted">--</span>}
                    </td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{formatNumber(s.ah, 2)}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.minCellVoltage !== null && normalizeVoltage(s.minCellVoltage) !== null ? normalizeVoltage(s.minCellVoltage) : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.maxCellVoltage !== null && normalizeVoltage(s.maxCellVoltage) !== null ? normalizeVoltage(s.maxCellVoltage) : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-warning">{s.cellVoltageDelta !== null && normalizeDeltaVoltage(s.cellVoltageDelta) !== null ? normalizeDeltaVoltage(s.cellVoltageDelta) : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.minCellTemperature != null ? formatTemperatureF(s.minCellTemperature, { decimals: 1, showUnit: false, sourceUnit: "C" }) : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted">{s.maxCellTemperature != null ? formatTemperatureF(s.maxCellTemperature, { decimals: 1, showUnit: false, sourceUnit: "C" }) : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-warning">{s.cellTemperatureDelta != null ? (s.cellTemperatureDelta * 1.8).toFixed(1) : "--"}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text-muted cursor-help" title={balanceTooltip}>{balCountToShow}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text cursor-help" title={balanceTooltip}>{balActivityToShow}</td>
                    <td className="px-1.5 py-0.5 font-mono text-xs text-prizm-text truncate max-w-[100px] cursor-help" title={balanceTooltip}>{balModeToShow}</td>
                    <td className="px-1.5 py-0.5 font-bold text-prizm-text-muted text-xs">
                        {locStr}
                    </td>
                    <td className="px-1.5 py-0.5">
                       <div 
                           title={fanTooltip}
                           className={`w-2.5 h-2.5 rounded-full cursor-help ${fanDotClass}`}
                       ></div>
                    </td>
                    <td className="px-1.5 py-0.5 text-right font-mono text-prizm-text-muted text-[10px]">
                       <div className="flex items-center justify-end gap-2">
                           <span>{s.rawTimestamp || s.timestampDisplay || formatPrizmUtcTimestamp(s.timestampUtc || 0)}</span>
                           <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-prizm-primary" />
                       </div>
                    </td>
                  </tr>
                  );

}
export const MemoStringListRow = React.memo(StringListRow);

