import React, { useState, useEffect, useMemo, useRef } from "react";
import { ServerOff, Search, ChevronRight, Download, RefreshCw, Layers, Lock, Unlock, CheckCircle2, XCircle, TriangleAlert, Activity, X } from "lucide-react";
import StringDetailDashboard from "./StringDetailDashboard";
import StringCommunicationIndicator from "./StringCommunicationIndicator";
import { formatTemperatureF } from "../utils/temperatureScale";

import { formatPrizmUtcTimestamp } from '../lib/timeFormat';
import { normalizeVoltage, normalizeDeltaVoltage } from '../lib/voltageNormalizer';
import type { RotationTarget } from './RotationModal';
import BalancingModal from './BalancingModal';
import BalancingVerificationPanel from './BalancingVerificationPanel';
import {observeBalancingVerification, type VerificationView} from '../lib/balancingVerificationClient';
import { useSiteData } from '../context/SiteDataContext';

function getContactorVisualState(row: any) {
  const pos = row.positiveContactorClosed;
  const neg = row.negativeContactorClosed;
  const both = row.bothContactorsClosed;
  const commandedClosed = row.contactorsCloseExpected === true;
  const commandedOpen = row.contactorsCloseExpected === false;
  const matchesCommand = row.commandMatchesContactors;

  let actualLabel = "Unknown";
  let actualDotColor = "amber";

  if (pos === true && neg === true) {
    actualLabel = "Closed";
    actualDotColor = "blue";
  } else if (pos === false && neg === false) {
    actualLabel = "Open";
    actualDotColor = "gray";
  } else if (pos === true && neg === false) {
    actualLabel = "Partial / Mismatch";
    actualDotColor = "red";
  } else if (pos === false && neg === true) {
    actualLabel = "Partial / Mismatch";
    actualDotColor = "red";
  } else if ((pos === false && neg === null) || (pos === null && neg === false)) {
    actualLabel = "Open (incomplete feedback)";
    actualDotColor = "gray";
  } else if ((pos === true && neg === null) || (pos === null && neg === true)) {
    actualLabel = "Partial (incomplete feedback)";
    actualDotColor = "amber";
  } else if (pos === null && neg === null) {
    actualLabel = "Unknown";
    actualDotColor = "amber";
  }

  function getIndividualContactorDotColor(value: any) {
    if (value === true) return "blue";
    if (value === false) return "gray";
    return "amber";
  }

  const positiveDotColor = getIndividualContactorDotColor(pos);
  const negativeDotColor = getIndividualContactorDotColor(neg);

  // Command mismatch logic
  let matchLabel = "Command unknown / pending";
  let matchDotColor = "amber";

  if (pos === null && neg === null) {
    matchLabel = "Readback unknown";
    matchDotColor = "amber";
  } else {
    if (matchesCommand === true) {
      matchLabel = "Command matched";
      matchDotColor = "green";
    } else if (matchesCommand === false) {
      matchLabel = "Command mismatch";
      matchDotColor = "red";
    } else {
      matchLabel = "Command unknown / pending";
      matchDotColor = "amber";
    }
  }

  return {
    actualDotColor,
    positiveDotColor,
    negativeDotColor,
    matchDotColor,
    actualLabel,
    matchLabel
  };
}

function getTailwindClasses(color: string) {
  switch (color) {
    case "blue":
      return "bg-blue-400 shadow-[0_0_5px_rgba(96,165,250,0.5)]";
    case "gray":
      return "bg-prizm-text-muted/30";
    case "green":
      return "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]";
    case "red":
      return "bg-prizm-danger shadow-[0_0_5px_rgba(255,51,102,0.5)]";
    case "amber":
    case "yellow":
      return "bg-prizm-warning shadow-[0_0_5px_rgba(255,204,0,0.5)]";
    default:
      return "bg-prizm-text-muted/30";
  }
}

interface StringDetailErrorBoundaryProps {
  children: React.ReactNode;
  onBack?: () => void;
}

interface StringDetailErrorBoundaryState {
  error: any;
}

class StringDetailErrorBoundary extends React.Component<StringDetailErrorBoundaryProps, StringDetailErrorBoundaryState> {
  props!: StringDetailErrorBoundaryProps;
  state: StringDetailErrorBoundaryState = { error: null };

  constructor(props: StringDetailErrorBoundaryProps) {
    super(props);
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    console.error("[StringDetailErrorBoundary]", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 bg-prizm-bg text-prizm-text font-mono h-full overflow-y-auto w-full">
          <button
            onClick={this.props.onBack}
            className="mb-4 px-3 py-1 border border-prizm-border rounded text-prizm-primary font-bold hover:bg-prizm-surface"
          >
            Back to String List
          </button>
          <div className="bg-prizm-surface border border-prizm-danger/40 rounded p-4 w-full">
            <div className="text-prizm-danger font-bold uppercase text-xs mb-2">
              String Detail Render Error
            </div>
            <pre className="text-[10px] whitespace-pre-wrap text-prizm-text-muted">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function StringDashboard({ active = true }: { active?: boolean }) {
  const { snapshot, isInitialLoading, refreshNow } = useSiteData();
  const [fastStringsView, setFastStringsView] = useState<any | null>(null);
  const [contactorOverlays, setContactorOverlays] = useState<Map<string, any>>(() => new Map());

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let inFlight = false;

    const load = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/local/site-data/strings-fast", { cache: "no-store" });
        if (!response.ok) return;
        const next = await response.json();
        if (!cancelled && Array.isArray(next?.strings) && next.strings.length > 0) {
          setFastStringsView((previous: any) => previous?.cycleId === next.cycleId ? previous : next);
        }
      } catch {
        // Preserve the last known good fast publication.
      } finally {
        inFlight = false;
      }
    };

    void load();
    // Stream changed rows while this page is visible. The slower GET remains a
    // recovery/snapshot path rather than forcing a 320-row render every 1.5s.
    const stream = new EventSource("/api/local/site-data/strings-stream");
    stream.addEventListener("strings", (event) => {
      try {
        const publication = JSON.parse((event as MessageEvent).data);
        const changes = Array.isArray(publication?.changes) ? publication.changes : [];
        if (!changes.length) return;
        setFastStringsView((previous: any) => {
          if (!previous || !Array.isArray(previous.strings)) return previous;
          const byKey = new Map(previous.strings.map((row: any) => [
            `${Number(row.arrayNumber ?? row.arrayIndex)}:${Number(row.stringNumber ?? row.stringIndex)}`,
            row
          ]));
          for (const change of changes) byKey.set(change.key, change.row);
          return { ...previous, brokerVersion: publication.version, capturedAt: publication.capturedAt, strings: [...byKey.values()] };
        });
      } catch {
        // The periodic snapshot request below repairs malformed/lost events.
      }
    });
    const timer = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      stream.close();
    };
  }, [active]);
  
  const data = useMemo(() => {
    if (!snapshot && !fastStringsView) return null;
    const stringSummary = snapshot?.rollups?.stringSummary || {};
    const stringSummarySummary = stringSummary.summary || {};
    const stringSummaryRollups = stringSummary.rollups || {};
    const snapshotRows = snapshot?.normalized?.strings || [];
    const fastRows = Array.isArray(fastStringsView?.strings) ? fastStringsView.strings : [];
    const snapshotByIdentity = new Map(
      snapshotRows.map((row: any) => [
        `${Number(row.arrayNumber ?? row.arrayIndex)}:${Number(row.stringNumber ?? row.stringIndex)}`,
        row
      ])
    );
    const baseRows = fastRows.length
      ? fastRows.map((row: any) => {
          const snapshotRow: any = snapshotByIdentity.get(
            `${Number(row.arrayNumber ?? row.arrayIndex)}:${Number(row.stringNumber ?? row.stringIndex)}`
          ) || {};
          const merged = { ...snapshotRow, ...row };

          // The fast lane arrives before the richer battery-pack report. Keep
          // the newest fast electrical values while retaining authoritative
          // balancing enrichment from the completed snapshot.
          if (row.balanceTelemetryAvailable !== true && snapshotRow.balanceTelemetryAvailable === true) {
            merged.balanceTelemetryAvailable = true;
            merged.balanceCount = snapshotRow.balanceCount;
            merged.balanceActivity = snapshotRow.balanceActivity;
            merged.balanceMode = snapshotRow.balanceMode;
            merged.balanceModeRaw = snapshotRow.balanceModeRaw;
            merged.balanceProvidedVoltageTarget = snapshotRow.balanceProvidedVoltageTarget;
            merged.balanceDetails = snapshotRow.balanceDetails;
          }
          return merged;
        })
      : snapshotRows;
    // A targeted post-command StringViewer reading is newer than the periodic
    // full-site publication. Keep it overlaid briefly so an older coordinator
    // cycle cannot visually reverse a contactor that has already moved.
    const rows = baseRows.map((row: any) => {
      const key = `${Number(row.arrayNumber ?? row.arrayIndex)}:${Number(row.stringNumber ?? row.stringIndex)}`;
      const state = contactorOverlays.get(key);
      if (!state) return row;
      const closed = state.positiveContactorClosed === true && state.negativeContactorClosed === true;
      const open = state.positiveContactorClosed === false && state.negativeContactorClosed === false;
      return {
        ...row,
        contactor: state,
        positiveContactorClosed: state.positiveContactorClosed,
        negativeContactorClosed: state.negativeContactorClosed,
        contactorsCloseExpected: state.contactorsCloseExpected,
        dcBusVoltage: state.dcBusVoltage,
        busVoltage: state.dcBusVoltage,
        busVoltageVdc: state.dcBusVoltage,
        bothContactorsClosed: closed ? true : open ? false : null,
        contactorStatus: closed ? "CLOSED" : open ? "OPEN" : "PARTIAL",
        contactorState: closed ? "CLOSED" : open ? "OPEN" : "PARTIAL",
        stringContactorState: closed ? "CLOSED" : open ? "OPEN" : "PARTIAL",
        actualContactorStateSource: "post-command-stringviewer"
      };
    });
    const fastSummary = fastStringsView?.summary || {};
    const fastRollups = fastStringsView?.rollups || {};
    const mergedFastSummary = {
      ...stringSummarySummary,
      ...fastSummary,
      knownBpcCount: fastSummary.knownBpcCount || stringSummarySummary.knownBpcCount,
      totalBpcs: fastSummary.totalBpcs || stringSummarySummary.totalBpcs,
      expectedBpcCount: fastSummary.expectedBpcCount || stringSummarySummary.expectedBpcCount,
      warningBpcs: fastSummary.warningBpcs || stringSummarySummary.warningBpcs,
      alarmBpcs: fastSummary.alarmBpcs || stringSummarySummary.alarmBpcs
    };
    const mergedFastRollups = {
      ...stringSummaryRollups,
      ...fastRollups,
      knownBpcCount: fastRollups.knownBpcCount || stringSummaryRollups.knownBpcCount,
      expectedBpcCount: fastRollups.expectedBpcCount || stringSummaryRollups.expectedBpcCount,
      warningBpcs: fastRollups.warningBpcs || stringSummaryRollups.warningBpcs,
      alarmBpcs: fastRollups.alarmBpcs || stringSummaryRollups.alarmBpcs
    };
    return {
      strings: rows,
      summary: fastRows.length ? mergedFastSummary : stringSummarySummary,
      rollups: fastRows.length ? mergedFastRollups : stringSummaryRollups,
      buckets: fastRows.length ? (fastStringsView.buckets || {}) : (stringSummary.buckets || {}),
      sourceHealth: fastRows.length ? (fastStringsView.sourceHealth || []) : (stringSummary.sourceHealth || snapshot?.rollups?.sourceHealth || []),
      emsBaseUrl: snapshot?.siteIdentity?.emsBaseUrl || "",
      durationMs: fastRows.length ? (fastStringsView.durationMs || 0) : (snapshot?.debug?.lastPollDurationMs || 0),
      stationCode: snapshot?.siteIdentity?.stationCode || "",
      blockIndex: snapshot?.siteIdentity?.blockIndex || 1,
      cache: snapshot?.liveStatus ? {
        sourceOk: snapshot.liveStatus.state !== "OFFLINE",
        isStale: snapshot.liveStatus.state === "PARTIAL" || snapshot.liveStatus.stale === true,
        lastUpdatedAt: snapshot.liveStatus.lastUpdated
      } : null
    };
  }, [snapshot, fastStringsView, contactorOverlays]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [arrayFilter, setArrayFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [contactorFilter, setContactorFilter] = useState<"all" | "abnormal" | "open" | "partial" | "closed" | "unknown">("all");
  
  const cacheTtlMs = 15000;
  const [selectedString, setSelectedString] = useState<any | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [rotationCapabilities, setRotationCapabilities] = useState<any>(null);
  const [commandPending, setCommandPending] = useState<string | null>(null);
  // State updates are asynchronous. Keep an immediate lock as well so a
  // double-click cannot publish the same equipment command twice before the
  // pending-state render disables the controls.
  const commandPendingRef = useRef(false);
  const [commandNotice, setCommandNotice] = useState<{ status: "success" | "warning" | "error"; title: string; detail: string } | null>(null);
  
  const [balancingModalOpen, setBalancingModalOpen] = useState(false);
  const [balancingVerificationId, setBalancingVerificationId] = useState(() => sessionStorage.getItem("prizm-balancing-verification"));
  const [balancingVerification, setBalancingVerification] = useState<VerificationView | null>(null);
  const [balancingVerificationError, setBalancingVerificationError] = useState("");
  useEffect(() => {
    if (!balancingVerificationId) return;
    return observeBalancingVerification(balancingVerificationId, job => {
      setBalancingVerification(job); setBalancingVerificationError("");
    }, setBalancingVerificationError);
  }, [balancingVerificationId]);

  const [isAdvancedMode, setIsAdvancedMode] = useState(() => localStorage.getItem("prizm_advanced_mode") === "true");
  useEffect(() => {
    localStorage.setItem("prizm_advanced_mode", isAdvancedMode ? "true" : "false");
  }, [isAdvancedMode]);

  useEffect(() => { fetch('/api/local/capabilities').then(r => r.json()).then(setRotationCapabilities).catch(()=>{}); }, []);

  useEffect(() => {
    if (!isInitialLoading || fastStringsView?.strings?.length > 0) setLoading(false);
  }, [isInitialLoading, fastStringsView]);

  useEffect(() => {
    if (active) {
      const targetArray = localStorage.getItem("prizm_selected_array");
      const targetString = localStorage.getItem("prizm_selected_string");
      if (targetArray) {
        setArrayFilter(targetArray);
        localStorage.removeItem("prizm_selected_array");
      }
      if (targetString) {
        setSearch(`string ${targetString}`);
        localStorage.removeItem("prizm_selected_string");
      }
    }
  }, [active]);

  // Update selected string reference to get fresh data when snapshot updates
  useEffect(() => {
    if (selectedString && data?.strings) {
       const updated = data.strings.find((s:any) => s.id === selectedString.id);
       if (updated) setSelectedString(updated);
    }
  }, [data?.strings]); // Intentionally omitting selectedString to avoid infinite loop on update

  useEffect(() => {
    if (!commandNotice) return;
    const timer = window.setTimeout(() => setCommandNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [commandNotice]);

  const handleBalancingPreflight = async (req: any) => {
      const res = await fetch("/api/local/balancing/preflight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to execute balancing preflight");
      }
      return res.json();
  };

  const handleBalancingConfirm = async (req: any) => {
      const res = await fetch("/api/local/balancing/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to execute balancing");
      }
      const result = await res.json();
      // Do not leave a submitted command in a dialog that invites resending.
      if (result?.verificationId) {
          sessionStorage.setItem("prizm-balancing-verification", result.verificationId);
          setBalancingVerification(result.verification ?? null);
          setBalancingVerificationError("");
          setBalancingVerificationId(result.verificationId);
      } else {
          setCommandNotice({
              status: result?.readbackConfirmed === true ? "success" : "warning",
              title: result?.readbackConfirmed === true ? "Balancing stop verified" : "Balancing command unverified",
              detail: (result?.results ?? []).map((item: any) => item.error || item.readbackStatus || "EMS acceptance not confirmed").join("; ") + ". No command was automatically retried."
          });
      }
      setBalancingModalOpen(false);
      setSelectedIds(new Set());
      void handleManualRefresh();
      return result;
  };

  const getSelectedTargets = () => {
    // Array optimization
    const targets: RotationTarget[] = [];
    const grouped = new Map<number, number[]>();
    for (const id of selectedIds) {
        const s = strings.find((st:any) => st.id === id);
        const arrayNumber = Number(s?.arrayNumber ?? s?.arrayIndex);
        const stringNumber = Number(s?.stringNumber ?? s?.stringIndex);
        if (Number.isInteger(arrayNumber) && arrayNumber > 0 && Number.isInteger(stringNumber) && stringNumber > 0) {
           if (!grouped.has(arrayNumber)) grouped.set(arrayNumber, []);
           grouped.get(arrayNumber)!.push(stringNumber);
        }
    }
    for (const [arr, strs] of grouped.entries()) {
        const configuredStringsPerArray = Number(data?.profile?.stringsPerArray ?? data?.stringsPerArray) || 40;
        const uniqueStrings = [...new Set(strs)].sort((a, b) => a - b);
        if (uniqueStrings.length >= configuredStringsPerArray) {
             targets.push({ array: arr, allStrings: true });
        } else {
             uniqueStrings.forEach((st:any) => targets.push({ array: arr, string: st }));
        }
    }
    return targets;
  };

  const sendOneClickCommand = async (kind: "rotation" | "contactors", action: "in" | "out" | "open" | "close") => {
    const targets = getSelectedTargets();
    if (!targets.length || commandPending || commandPendingRef.current) return;
    commandPendingRef.current = true;
    const commandKey = `${kind}-${action}`;
    const targetCount = selectedIds.size;
    setCommandPending(commandKey);
    setCommandNotice(null);
    try {
      const commandId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const body = kind === "rotation"
        ? { commandId, targets, action, reason: "Technician one-click operation", note: "Sent from String List quick controls", confirmed: true }
        : { commandId, targets, action, ignoreLowCgVoltAlarm: false, ignoreHighCgVoltAlarm: false, confirmed: true, reason: "Technician one-click operation", note: "Sent from String List quick controls" };
      const response = await fetch(`/api/local/strings/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || result?.message || "Command was not accepted");
      const commandResults = Array.isArray(result?.results) ? result.results : [];
      const rejectedCount = commandResults.filter((item: any) => item?.accepted === false || item?.success === false).length;
      const targetLabel = (item: any) => item?.target?.allStrings
        ? `Array ${item.target.array}`
        : `Array ${item?.target?.array ?? "?"} / String ${item?.target?.string ?? "?"}`;
      if (rejectedCount > 0) {
        const rejected = commandResults.find((item: any) => item?.accepted === false || item?.success === false);
        throw new Error(`${targetLabel(rejected)} was not accepted: ${rejected?.error || rejected?.responseText || "controller request failed"}`);
      }
      if (result?.success !== true) {
        const failedReadbacks = commandResults
          .filter((item: any) => item?.readbackConfirmed !== true)
          .map((item: any) => `${targetLabel(item)}: ${item?.readbackStatus || "requested state was not verified"}`);
        setCommandNotice({
          status: "warning",
          title: "Command accepted — verification incomplete",
          detail: failedReadbacks.join("; ") || "EMS accepted the command, but fresh physical feedback has not fully confirmed it yet."
        });
        return;
      }
      if (kind === "contactors") {
        const next = new Map(contactorOverlays);
        for (const item of commandResults) {
          const state = item?.readbackState;
          if (state && item?.readbackConfirmed === true) {
            next.set(`${Number(state.arrayNumber)}:${Number(state.stringNumber)}`, state);
          }
        }
        setContactorOverlays(next);
        window.setTimeout(() => setContactorOverlays(new Map()), 10_000);
      }
      const label = kind === "rotation" ? `Rotation ${action.toUpperCase()}` : `${action === "open" ? "Open" : "Close"} contactors`;
      setCommandNotice({ status: "success", title: "Command sent successfully", detail: `${label} sent for ${targetCount} selected string${targetCount === 1 ? "" : "s"}.` });
      setSelectedIds(new Set());
      // The verified targeted row is rendered immediately above. Reconcile the
      // rest of the site without blocking the command confirmation.
      void refreshNow(true).catch(() => undefined);
    } catch (error: any) {
      setCommandNotice({ status: "error", title: "Command failed", detail: error?.message || "The command could not be sent." });
    } finally {
      commandPendingRef.current = false;
      setCommandPending(null);
    }
  };

const handleManualRefresh = async () => {
      setIsRefreshing(true);
      try {
        await refreshNow(true);
      } catch (err) {
        console.error("Failed to fetch dashboard strings", err);
      } finally {
        setIsRefreshing(false);
      }
  };

  // The coordinator snapshot is the sole authority for rows and rollups. Mixing
  // the legacy dashboard route with a different snapshot cycle caused visibly
  // incorrect rows and summary totals.
  const strings = data?.strings || [];
  const stringRowsAreWarming = false;

  const getStringContactorClosedState = (row: any): boolean | null => {
    const positiveFeedback =
      row?.positiveContactorClosed === true ? true :
      row?.positiveContactorClosed === false ? false :
      null;

    const negativeFeedback =
      row?.negativeContactorClosed === true ? true :
      row?.negativeContactorClosed === false ? false :
      null;

    if (positiveFeedback === true && negativeFeedback === true) return true;
    if (positiveFeedback === false && negativeFeedback === false) return false;
    if (positiveFeedback !== null || negativeFeedback !== null) return null;

    const statusText = String(
      row?.contactorStatus ||
      row?.contactStatus ||
      row?.contactState ||
      row?.contactorState ||
      row?.stringContactorState ||
      row?.contactorsState ||
      row?.contactors?.status ||
      row?.contactors?.state ||
      ""
    ).trim().toUpperCase();

    const codeText = String(
      row?.contactorCode ??
      row?.stringContactorCode ??
      row?.contactCode ??
      row?.rawContactorState ??
      ""
    ).trim().toUpperCase();

    if (
      statusText === "CLOSED" ||
      statusText === "CLOSE" ||
      statusText.includes("CLOSED") ||
      codeText === "5"
    ) return true;

    if (
      statusText === "OPEN" ||
      statusText === "OPENED" ||
      statusText.includes("OPEN") ||
      codeText === "6"
    ) return false;

    return null;
  };

  const contactorClosedCount = strings.filter((row: any) => getStringContactorClosedState(row) === true).length;
  const contactorOpenCount = strings.filter((row: any) => getStringContactorClosedState(row) === false).length;
  const contactorUnknownCount = strings.filter((row: any) => getStringContactorClosedState(row) === null).length;

  const getStringContactorFilterState = (row: any): "open" | "partial" | "closed" | "unknown" => {
    const actualState = String(row?.contactor?.actualState ?? row?.contactorStatus ?? "").trim().toLowerCase();

    if (actualState === "open") return "open";
    if (actualState === "partial" || actualState === "mismatch") return "partial";
    if (actualState === "closed") return "closed";

    const pos = row?.positiveContactorClosed;
    const neg = row?.negativeContactorClosed;

    if (pos === true && neg === true) return "closed";
    if (pos === false && neg === false) return "open";
    if (pos !== null && pos !== undefined && neg !== null && neg !== undefined && pos !== neg) return "partial";

    return "unknown";
  };

  const stringMatchesContactorFilter = (row: any): boolean => {
    if (contactorFilter === "all") return true;
    const state = getStringContactorFilterState(row);

    if (contactorFilter === "abnormal") {
      return state === "open" || state === "partial";
    }

    return state === contactorFilter;
  };

  const contactorPartialCount = strings.filter((row: any) => getStringContactorFilterState(row) === "partial").length;
  const contactorAbnormalCount = contactorOpenCount + contactorPartialCount;

  const countOf = (value:any): number | null => {
    if (typeof value === "number") return value;
    if (value && typeof value.count === "number") return value.count;
    return null;
  };
  const formatNumber = (value:any, decimals = 2) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(decimals) : "--";
  };
  const formatMaybeInt = (value:any) => {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n)) : "--";
  };

  const { summary } = data || { summary: {} };

  const totalStrings =
    data?.rollups?.totalStrings ??
    summary?.totalStrings ??
    strings.length;
  const bucketCount = (bucket: string) =>
    strings.filter((s: any) => s.bucket === bucket).length;

  const rowsHaveBuckets = strings.some((s: any) =>
    s?.bucket === "online" ||
    s?.bucket === "nearline" ||
    s?.bucket === "offline" ||
    s?.bucket === "notCommunicating"
  );

  const onlineCount = rowsHaveBuckets
    ? bucketCount("online")
    : (
        summary?.normalStrings ??
        countOf(data?.rollups?.online) ??
        countOf(data?.rollups?.normal) ??
        0
      );

  const nearlineCount = rowsHaveBuckets
    ? bucketCount("nearline")
    : (
        summary?.nearlineStrings ??
        countOf(data?.rollups?.nearline) ??
        0
      );

  const offlineCount = rowsHaveBuckets
    ? bucketCount("offline")
    : (
        summary?.offlineStrings ??
        countOf(data?.rollups?.offline) ??
        0
      );

  const notCommunicatingCount = rowsHaveBuckets
    ? bucketCount("notCommunicating")
    : (
        summary?.notCommunicatingStrings ??
        countOf(data?.rollups?.notCommunicating) ??
        0
      );

  const liveKnownBpcCount =
    strings.reduce((sum: number, row: any) => sum + (Number(row?.balCt ?? row?.balancingCount ?? row?.knownBpcCount ?? 0) || 0), 0) ||
    countOf(data?.rollups?.knownBpcCount) ||
    summary?.knownBpcCount ||
    summary?.totalBpcs ||
    0;

  const liveExpectedBpcCount =
    countOf(data?.rollups?.expectedBpcCount) ??
    summary?.expectedBpcCount ??
    (totalStrings ? totalStrings * 14 : null);

  const liveWarningBpcCount =
    strings.reduce((sum: number, row: any) => sum + (Number(row?.warningCount ?? 0) || 0), 0) ||
    countOf(data?.rollups?.warningBpcs) ||
    summary?.warningBpcs ||
    0;

  const liveAlarmBpcCount =
    strings.reduce((sum: number, row: any) => sum + (Number(row?.alarmCount ?? 0) || 0), 0) ||
    countOf(data?.rollups?.alarmBpcs) ||
    summary?.alarmBpcs ||
    0;

  const warningCount =
    countOf(data?.rollups?.warnings) ??
    summary?.warningStrings ??
    strings.reduce((sum:number, s:any) => sum + (Number(s.warningCount) || 0), 0);
  const alarmCount =
    countOf(data?.rollups?.alarms) ??
    summary?.alarmStrings ??
    strings.reduce((sum:number, s:any) => sum + (Number(s.alarmCount) || 0), 0);
  const fleetAvgCellVoltage =
    data?.rollups?.fleetAvgCellVoltage ??
    data?.rollups?.nearline?.avgCellVoltageMv ??
    summary?.avgCellVoltage ??
    null;
  const fleetMaxCellVoltageDelta =
    data?.rollups?.fleetMaxCellVoltageDelta ??
    data?.rollups?.nearline?.maxCellVoltageDeltaMv ??
    summary?.maxCellVoltageDelta ??
    null;
  const fleetAvgCellTemp =
    data?.rollups?.fleetAvgCellTemp ??
    data?.rollups?.nearline?.avgCellTempC ??
    summary?.avgCellTemperature ??
    null;
  const fleetMaxCellTempDelta =
    data?.rollups?.fleetMaxCellTemp ??
    data?.rollups?.nearline?.maxCellTempDeltaC ??
    summary?.maxCellTemperatureDelta ??
    null;

  const sourceHealthRows = useMemo(() => {
    if (!data?.sourceHealth) return [];
    if (Array.isArray(data.sourceHealth)) {
      return data.sourceHealth.map((h:any) => ({
        key: h.name || h.endpoint || "source",
        ok: h.ok ?? h.success,
        httpStatus: h.httpStatus ?? h.statusCode ?? h.lastStatusCode,
        durationMs: h.durationMs ?? h.lastDurationMs,
        url: h.url ?? h.endpoint,
        error: h.error ?? (h.lastError === "NONE" ? null : h.lastError)
      }));
    }
    return Object.entries(data.sourceHealth).map(([key, h]: [string, any]) => ({
      key,
      ok: h.ok ?? h.success,
      httpStatus: h.httpStatus ?? h.statusCode ?? h.lastStatusCode,
      durationMs: h.durationMs ?? h.lastDurationMs,
      url: h.url ?? h.endpoint,
      error: h.error ?? (h.lastError === "NONE" ? null : h.lastError)
    }));
  }, [data?.sourceHealth]);

  const arrays = useMemo(() => {
    const list = Array.from(new Set(strings.map((s:any) => s.arrayNumber)));
    return list.sort((a, b) => Number(a) - Number(b));
  }, [strings]);

  const filtered = useMemo(() => {
    return strings.filter((s:any) => {
      if (arrayFilter !== "all" && String(s.arrayNumber) !== arrayFilter) return false;
      if (stateFilter !== "all") {
        const canonicalBucket = s.bucket || s.operationalBucket || s.operationalState || "";
        if (stateFilter.toLowerCase() !== canonicalBucket.toLowerCase()) return false;
      }
      if (healthFilter !== "all") {
        if (healthFilter === "alarms" && s.alarmCount <= 0) return false;
        if (healthFilter === "warnings" && s.warningCount <= 0) return false;
      }
      if (contactorFilter !== "all" && !stringMatchesContactorFilter(s)) return false;
      if (search) {
        const sq = search.toLowerCase();
        if (!s.stringKey.toLowerCase().includes(sq) && !s.stringControllerIp?.toLowerCase().includes(sq)) return false;
      }
      return true;
    });
  }, [strings, arrayFilter, stateFilter, healthFilter, contactorFilter, search]);

  const filteredByArray = useMemo(() => {
    const grouped = new Map<number, any[]>();
    for (const row of filtered) {
      const arrayNumber = Number(row.arrayNumber ?? row.arrayIndex);
      const rows = grouped.get(arrayNumber);
      if (rows) rows.push(row);
      else grouped.set(arrayNumber, [row]);
    }
    return grouped;
  }, [filtered]);

  // Keep selection accounting linear in the number of displayed strings.
  // The legacy path remains available while render parity is validated.
  const fastSelectionAccounting = new URLSearchParams(window.location.search).get("fastStringRender") !== "off";
  const selectedCountByArray = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of filtered) {
      if (!selectedIds.has(row.id)) continue;
      const arrayNumber = Number(row.arrayNumber ?? row.arrayIndex);
      counts.set(arrayNumber, (counts.get(arrayNumber) || 0) + 1);
    }
    return counts;
  }, [filtered, selectedIds]);

  const filteredSelectedCount = filtered.reduce(
    (count: number, row: any) => count + (selectedIds.has(row.id) ? 1 : 0),
    0
  );
  const areAllFilteredSelected = filtered.length > 0 && filteredSelectedCount === filtered.length;
  const areSomeFilteredSelected = filteredSelectedCount > 0 && !areAllFilteredSelected;

  const toggleAllFilteredStrings = () => {
    const next = new Set(selectedIds);
    if (areAllFilteredSelected) filtered.forEach((row: any) => next.delete(row.id));
    else filtered.forEach((row: any) => next.add(row.id));
    setSelectedIds(next);
  };

  const downloadCsv = () => {
    if (filtered.length === 0) return;
    const headers = ["stringKey", "arrayNumber", "stringNumber", "operationalState", "measuredVoltage", "amps", "socPct", "kw", "stringControllerIp", "minCellVoltage", "maxCellVoltage", "minCellTemperature", "maxCellTemperature"];
    const csvRows = [];
    csvRows.push(headers.join(','));
    for (const row of filtered) {
      const values = headers.map(header => {
        const val = row[header];
        const str = (val === null || val === undefined) ? "" : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }
    const csvString = csvRows.join('\\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EMS_Strings_Export_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJson = () => {
      if (!data) return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EMS_Strings_Dashboard_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (selectedString) {
    return (
      <StringDetailErrorBoundary onBack={() => setSelectedString(null)}>
        <StringDetailDashboard 
          stringData={selectedString} 
          onBack={() => setSelectedString(null)} 
        />
      </StringDetailErrorBoundary>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-prizm-text-muted font-mono">
        <RefreshCw className="animate-spin mb-4 text-prizm-primary" size={32} />
        <span className="text-xs font-bold tracking-widest text-prizm-primary">LOADING STRINGS DATA</span>
      </div>
    );
  }

  if (!data || data.summary.totalStrings === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-prizm-text-muted font-mono">
        <ServerOff size={48} className="mb-4 opacity-50" />
        <h2 className="text-xl font-bold uppercase tracking-widest text-prizm-danger mb-2">OFFLINE / NO LOCAL DATA</h2>
        <p className="text-xs max-w-md mx-auto">PRIZM Local EMS source failed to resolve strings data.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col font-sans transition-all bg-transparent pb-24">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0 mb-6 font-mono">
        <div>
          <span className="text-[10px] text-prizm-primary font-bold uppercase tracking-wider block">Batteries</span>
          <h1 className="text-lg font-bold text-prizm-text tracking-wide flex items-center gap-2">
            STRINGS / BPC DASHBOARD
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold">
           <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1 bg-prizm-surface border border-prizm-border rounded hover:bg-prizm-surface-strong transition-colors text-prizm-primary mr-2 disabled:opacity-50"
           >
              <RefreshCw size={10} className={isRefreshing ? "animate-spin" : ""} /> REFRESH LIVE
           </button>
           <div className={`p-1.5 border rounded flex items-center gap-1.5 ${
                (!data.cache || !data.cache.sourceOk) ? 'bg-prizm-danger/10 border-prizm-danger/30 text-prizm-danger' : 
                isRefreshing ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' :
                (data.cache.isStale ? 'bg-prizm-warning/10 border-prizm-warning/30 text-prizm-warning' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold')
           }`}>
                {(() => {
                    if (!data.cache || !data.cache.sourceOk) return <><span className="h-1.5 w-1.5 rounded-full bg-prizm-danger"></span>Offline</>;
                    if (isRefreshing) return <><span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse"></span>Refreshing Live</>;
                    if (data.cache.isStale) return <><span className="h-1.5 w-1.5 rounded-full bg-prizm-warning"></span>Connection Partial</>;
                    return <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>Connection Live</>;
                })()}
           </div>
           <div className="bg-prizm-surface p-1.5 border border-prizm-border rounded text-prizm-text-muted hidden sm:block">
              SRC: <span className="text-prizm-text">{data.emsBaseUrl}</span>
           </div>
           <div className="bg-prizm-surface p-1.5 border border-prizm-border rounded text-prizm-text-muted hidden sm:block">
              LATENCY: <span className="text-prizm-text">{data.durationMs}ms</span>
           </div>
        </div>
      </div>

      {/* Source Debug Panel */}
      <BalancingVerificationPanel job={balancingVerification} error={balancingVerificationError} onDismiss={() => {
        sessionStorage.removeItem("prizm-balancing-verification"); setBalancingVerificationId(null);
        setBalancingVerification(null); setBalancingVerificationError("");
      }}/>
      <details className="mb-6 bg-prizm-surface border border-prizm-border rounded-lg text-xs font-mono group">
        <summary className="p-3 cursor-pointer text-prizm-text-muted hover:text-prizm-text transition-colors select-none outline-none font-bold uppercase tracking-wider">
           Source Debug Information
        </summary>
        <div className="p-3 border-t border-prizm-border bg-black/20 overflow-x-auto no-scrollbar">
           <table className="w-full text-left whitespace-nowrap text-[10px]">
              <thead className="text-prizm-text-muted">
                 <tr>
                    <th className="pr-4 pb-2">Key</th>
                    <th className="pr-4 pb-2">Status</th>
                    <th className="pr-4 pb-2">HTTP Code</th>
                    <th className="pr-4 pb-2">Ping (ms)</th>
                    <th className="pr-4 pb-2">URL</th>
                    <th className="pb-2">Error</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-prizm-border/10">
                 {sourceHealthRows.length === 0 ? (
                    <tr>
                       <td colSpan={6} className="py-4 text-center text-prizm-text-muted">
                          No source health telemetry published for this snapshot.
                       </td>
                    </tr>
                 ) : (
                    sourceHealthRows.map((row: any) => (
                       <tr key={row.key}>
                          <td className="pr-4 py-1.5 text-prizm-primary font-bold">{row.key}</td>
                          <td className="pr-4 py-1.5">
                             <span className={`px-1.5 py-0.5 rounded text-white ${row.ok ? 'bg-emerald-500/50' : 'bg-prizm-danger/50'}`}>
                                 {row.ok ? 'OK' : 'FAIL'}
                             </span>
                          </td>
                          <td className="pr-4 py-1.5 text-prizm-text">{row.httpStatus || '--'}</td>
                          <td className="pr-4 py-1.5 text-prizm-text-muted">{row.durationMs !== null && row.durationMs !== undefined ? `${row.durationMs}ms` : '--'}</td>
                          <td className="pr-4 py-1.5 text-prizm-text-muted opacity-80">{row.url || '--'}</td>
                          <td className="py-1.5 text-prizm-danger/80">{row.error || '--'}</td>
                       </tr>
                    ))
                 )}
              </tbody>
           </table>
        </div>
      </details>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-11 gap-2 mb-4 shrink-0 text-center font-mono select-none">
        <div className="bg-prizm-surface-strong border border-prizm-border rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide">Total Strings</span>
          <span className="text-[12px] font-bold text-prizm-text">{formatMaybeInt(totalStrings)}</span>
        </div>
        <button
          type="button"
          onClick={() => setContactorFilter(contactorFilter === "abnormal" ? "all" : "abnormal")}
          title="Show open or mismatched contactors"
          className={`bg-prizm-surface border border-prizm-border border-b-2 rounded px-2 py-1.5 flex flex-col justify-center text-left transition-colors ${
            contactorFilter === "abnormal"
              ? "border-b-prizm-warning bg-prizm-warning/10"
              : "border-b-prizm-warning/60 hover:bg-prizm-surface-strong"
          }`}
        >
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide leading-tight">Contactor Abnormal</span>
          <span className={contactorOpenCount > 0 ? "text-[12px] font-bold text-prizm-warning" : "text-[12px] font-bold text-emerald-400"}>
            {formatMaybeInt(contactorAbnormalCount)}
            <span className="text-prizm-text-muted mx-1">/</span>
            <span className="text-prizm-text">{formatMaybeInt(totalStrings)}</span>
          </span>
          <span className="text-[8px] text-prizm-text-muted mt-0.5">
            OPEN {formatMaybeInt(contactorOpenCount)} | PARTIAL {formatMaybeInt(contactorPartialCount)}
            {contactorUnknownCount > 0 ? ` | UNK ${formatMaybeInt(contactorUnknownCount)}` : ""}
          </span>
        </button>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-emerald-500/50 rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide">Online</span>
          <span className="text-[12px] font-bold text-emerald-400">{formatMaybeInt(onlineCount)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-cyan-500/50 rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide">Nearline</span>
          <span className={nearlineCount > 0 ? "text-[12px] font-bold text-cyan-400" : "text-[12px] font-bold text-prizm-text"}>{formatMaybeInt(nearlineCount)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-prizm-danger/50 rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide">Offline</span>
          <span className={offlineCount > 0 ? "text-[12px] font-bold text-prizm-danger" : "text-[12px] font-bold text-prizm-text"}>{formatMaybeInt(offlineCount)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border border-b-2 border-b-slate-500/60 rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide">Not Comm</span>
          <span className={notCommunicatingCount > 0 ? "text-[12px] font-bold text-slate-400" : "text-[12px] font-bold text-prizm-text"}>{formatMaybeInt(notCommunicatingCount)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide">Warns / Alarms</span>
          <span className="text-[12px] font-bold text-prizm-warning">{formatMaybeInt(warningCount)} <span className="text-prizm-text-muted mx-1">/</span> <span className="text-prizm-danger">{formatMaybeInt(alarmCount)}</span></span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide leading-tight">Total BPCs</span>
          <span className="text-[10px] font-bold text-prizm-text mt-0.5">Known {formatMaybeInt(liveKnownBpcCount)} <span className="text-prizm-text-muted font-normal mx-0.5">/</span> {formatMaybeInt(liveExpectedBpcCount)}</span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide leading-tight">BPC Alerts</span>
          <span className="text-[12px] font-bold text-prizm-warning">{formatMaybeInt(liveWarningBpcCount)} <span className="text-prizm-text-muted mx-1">/</span> <span className="text-prizm-danger">{formatMaybeInt(liveAlarmBpcCount)}</span></span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide leading-tight">Fleet Avg Cell / V Delta</span>
          <span className="text-[10px] font-bold text-prizm-text mt-0.5">
            {fleetAvgCellVoltage !== null && normalizeVoltage(fleetAvgCellVoltage) !== null
              ? `${normalizeVoltage(fleetAvgCellVoltage)!.toFixed(1)} mV`
              : "--"}
            <span className="text-prizm-text-muted mx-1">|</span>
            {fleetMaxCellVoltageDelta !== null && normalizeDeltaVoltage(fleetMaxCellVoltageDelta) !== null
              ? `\u0394 ${normalizeDeltaVoltage(fleetMaxCellVoltageDelta)!.toFixed(0)} mV`
              : "--"}
          </span>
        </div>
        <div className="bg-prizm-surface border border-prizm-border rounded px-2 py-1.5 flex flex-col justify-center">
          <span className="text-[8px] text-prizm-text-muted uppercase tracking-wide leading-tight">Fleet Avg Temp / Max &Delta;</span>
          <span className="text-[10px] font-bold text-prizm-text mt-0.5">
            {fleetAvgCellTemp != null ? formatTemperatureF(fleetAvgCellTemp, { decimals: 1, showUnit: true, sourceUnit: "C" }) : "--"}
            <span className="text-prizm-text-muted mx-1">|</span>
            {fleetMaxCellTempDelta != null ? "\u0394" + (fleetMaxCellTempDelta * 1.8).toFixed(1) + "°F" : "--"}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-prizm-surface-strong p-3 rounded-t-lg border border-prizm-border shrink-0">
        <div className="relative flex-1 w-full flex items-center">
          <Search size={14} className="absolute left-3 text-prizm-text-muted" />
          <input
            type="text"
            placeholder="Search String Key or IP..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-black/20 border border-prizm-border rounded pl-9 pr-3 py-1.5 text-xs text-prizm-text font-mono placeholder-black/40 focus:border-prizm-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <select value={arrayFilter} onChange={e => setArrayFilter(e.target.value)} className="bg-black/20 border border-prizm-border rounded px-1.5 py-0.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer">
            <option value="all">Array: All</option>
            {arrays.map(a => <option key={String(a)} value={String(a)}>Array {a}</option>)}
          </select>
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className="bg-black/20 border border-prizm-border rounded px-1.5 py-0.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer">
            <option value="all">State: All</option>
            <option value="online">Online</option>
            <option value="nearline">Nearline</option>
            <option value="offline">Offline</option>
            <option value="notCommunicating">Not Communicating</option>
            <option value="unknown">Unknown</option>
          </select>
          <select value={contactorFilter} onChange={e => setContactorFilter(e.target.value as any)} className="bg-black/20 border border-prizm-border rounded px-1.5 py-0.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer">
            <option value="all">Contactors: All</option>
            <option value="abnormal">Contactors: Abnormal</option>
            <option value="open">Contactors: Open Only</option>
            <option value="partial">Contactors: Partial / Mismatch</option>
            <option value="closed">Contactors: Closed</option>
            <option value="unknown">Contactors: Unknown</option>
          </select>
          <select value={healthFilter} onChange={e => setHealthFilter(e.target.value)} className="bg-black/20 border border-prizm-border rounded px-1.5 py-0.5 text-[10px] uppercase font-mono text-prizm-text focus:outline-none focus:border-prizm-primary cursor-pointer">
            <option value="all">Health: All</option>
            <option value="warnings">Warnings</option>
            <option value="alarms">Alarms</option>
          </select>
          <button onClick={downloadCsv} title="Export CSV" className="bg-white/5 hover:bg-white/10 text-prizm-text border border-prizm-border px-1.5 py-0.5 rounded transition-colors cursor-pointer shrink-0">
            <Download size={14} />
          </button>
          <button onClick={downloadJson} title="Export API JSON" className="bg-white/5 hover:bg-white/10 text-prizm-info border border-prizm-border px-1.5 py-0.5 rounded transition-colors cursor-pointer shrink-0">
            <Layers size={14} />
          </button>
          <button
            onClick={() => setIsAdvancedMode(!isAdvancedMode)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded border transition-colors cursor-pointer shrink-0 ${
              isAdvancedMode
                ? "bg-amber-500/15 border-amber-500/50 text-amber-500 hover:bg-amber-500/25"
                : "bg-white/5 border-prizm-border text-prizm-text hover:bg-white/10"
            }`}
            title={isAdvancedMode ? "Advanced Controls Unlocked" : "Unlock Advanced Controls"}
          >
            {isAdvancedMode ? <Unlock size={12} className="text-amber-500 animate-pulse" /> : <Lock size={12} className="text-prizm-text-muted" />}
            {isAdvancedMode ? "Advanced" : "Unlock"}
          </button>
        

</div>
      </div>
      <div className="sticky top-[64px] flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 bg-[#001a1a]/95 text-slate-100 backdrop-blur border-x border-b border-teal-700 shadow-md z-[75] saturate-150">
           <div className="flex flex-wrap items-center gap-3">
              <span className={`text-xs font-mono font-bold uppercase tracking-widest ${selectedIds.size > 0 ? "text-emerald-300" : "text-slate-100"}`}>
                {selectedIds.size > 0 ? `${selectedIds.size} Selected` : "Select strings to control"}
              </span>
              <button
                onClick={() => setSelectedIds(new Set(filtered.map((row: any) => row.id)))}
                disabled={filtered.length === 0}
                className="text-[10px] text-cyan-300 hover:text-white uppercase tracking-widest underline decoration-cyan-300/50 underline-offset-4 transition-colors disabled:opacity-60"
              >
                Select Visible ({filtered.length})
              </button>
              <button 
                 onClick={() => setSelectedIds(new Set())}
                 disabled={selectedIds.size === 0}
                 className="text-[10px] text-slate-200 hover:text-white uppercase tracking-widest underline decoration-slate-300/50 underline-offset-4 transition-colors disabled:opacity-60"
              >
                 Clear
              </button>
           </div>
           <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] uppercase tracking-widest text-slate-100 font-bold">Rotation</span>
              <button
                  disabled={selectedIds.size === 0 || !rotationCapabilities?.strings?.single || !!commandPending}
                  title={!rotationCapabilities?.strings?.single ? "String rotation capability is not verified on this EMS" : "Place selected strings in rotation"}
                  onClick={() => sendOneClickCommand("rotation", "in")}
                  className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30 rounded text-[10px] uppercase font-bold tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                  {commandPending === "rotation-in" ? <><Activity size={11} className="mr-1 inline animate-spin"/>Sending</> : "Set In Rotation"}
              </button>
              <button
                  disabled={selectedIds.size === 0 || !rotationCapabilities?.strings?.single || !!commandPending}
                  title={!rotationCapabilities?.strings?.single ? "String rotation capability is not verified on this EMS" : "Take selected strings out of rotation"}
                  onClick={() => sendOneClickCommand("rotation", "out")}
                  className="px-3 py-1 bg-slate-500/20 text-slate-300 border border-slate-500/50 hover:bg-slate-500/30 rounded text-[10px] uppercase font-bold tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                  {commandPending === "rotation-out" ? <><Activity size={11} className="mr-1 inline animate-spin"/>Sending</> : "Set Out Rotation"}
              </button>
              <span className="h-5 w-px bg-prizm-border mx-1" />
              <span className="text-[9px] uppercase tracking-widest text-slate-100 font-bold">Contactors</span>
              <button
                  disabled={selectedIds.size === 0 || !!commandPending}
                  onClick={() => sendOneClickCommand("contactors", "open")}
                  className="px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500/30 rounded text-[10px] uppercase font-bold tracking-widest transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Open selected string contactors through Phoenix BMS"
              >
                  {commandPending === "contactors-open" ? <><Activity size={11} className="mr-1 inline animate-spin"/>Sending</> : "Open Contactors"}
              </button>
              <button
                  disabled={selectedIds.size === 0 || !!commandPending}
                  onClick={() => sendOneClickCommand("contactors", "close")}
                  className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/30 rounded text-[10px] uppercase font-bold tracking-widest transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Close selected string contactors through Phoenix BMS"
              >
                  {commandPending === "contactors-close" ? <><Activity size={11} className="mr-1 inline animate-spin"/>Sending</> : "Close Contactors"}
              </button>
              <span className="h-5 w-px bg-prizm-border mx-1" />
              <button
                  disabled={selectedIds.size === 0}
                  onClick={() => setBalancingModalOpen(true)}
                  className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/30 rounded text-[10px] uppercase font-bold tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                  Set Balancing
              </button>
           </div>
      </div>
      {/* Main Strings Table Engine */}
      <div className="flex-1 bg-prizm-surface border-x border-b border-prizm-border rounded-b-lg relative pb-12" id="strings-dashboard-scroll">
         <table className="w-full text-left text-[9px] font-mono whitespace-nowrap border-collapse">
             <thead className="sticky top-[102px] z-[70] bg-prizm-surface-strong shadow-sm">
                <tr className="text-prizm-text-muted uppercase tracking-wider">
                  <th className="px-1 py-0.5 border-b border-prizm-border sticky top-[102px] left-0 bg-prizm-surface-strong z-[80] w-[30px]"></th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border font-bold sticky top-[102px] left-[30px] bg-prizm-surface-strong z-[80] whitespace-nowrap min-w-[54px] sm:min-w-[64px]">ARR</th>
                  <th className="px-1 py-0.5 border-b border-prizm-border sticky top-[102px] left-[84px] sm:left-[94px] bg-prizm-surface-strong z-[80] w-[30px] text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all displayed strings"
                      title={areAllFilteredSelected ? "Clear all displayed strings" : `Select all ${filtered.length} displayed strings`}
                      className="accent-prizm-primary w-3 h-3 cursor-pointer"
                      checked={areAllFilteredSelected}
                      disabled={filtered.length === 0}
                      ref={el => { if (el) el.indeterminate = areSomeFilteredSelected; }}
                      onChange={toggleAllFilteredStrings}
                    />
                  </th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border font-bold sticky top-[102px] left-[114px] sm:left-[124px] bg-prizm-surface-strong z-[80] whitespace-nowrap min-w-[48px]">STR</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Contactors</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Rotation</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Meas V</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Calc V</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Bus V</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Amps</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">kW</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">SOC %</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Ah</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Min Cell V</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Max Cell V</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Δ Cell V</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Min Temp (°F)</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Max Temp (°F)</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Δ Temp (°F)</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">BAL CT</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">BAL ACTIVITY</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">CONFIG MODE</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Location</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border sticky top-[102px] bg-prizm-surface-strong z-[50]">Fans</th>
                  <th className="px-1.5 py-0.5 border-b border-prizm-border text-right sticky top-[102px] bg-prizm-surface-strong z-[50]">Timestamp</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-prizm-border/20">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-prizm-text-muted font-bold tracking-widest text-xs">NO STRINGS MATCHING FILTERS</td>
                </tr>
              ) : (
                filtered.map((s:any, idx: number) => {
                  const isArrFirst = idx === 0 || filtered[idx-1].arrayNumber !== s.arrayNumber;
                  const arrStrings = filteredByArray.get(Number(s.arrayNumber ?? s.arrayIndex)) || [];
                  const arrSelectedCount = fastSelectionAccounting
                    ? (selectedCountByArray.get(Number(s.arrayNumber ?? s.arrayIndex)) || 0)
                    : arrStrings.filter((fs:any) => selectedIds.has(fs.id)).length;
                  const isArrAllSelected = arrSelectedCount > 0 && arrSelectedCount === arrStrings.length;
                  const isArrIndeterminate = arrSelectedCount > 0 && arrSelectedCount < arrStrings.length;
                  
                  const rowWarnings = [
                    ...(Array.isArray(s.warnings) ? s.warnings : []),
                    ...(Array.isArray(s.notificationList) ? s.notificationList : []),
                    ...(Array.isArray(s.activeNotifications) ? s.activeNotifications : []),
                    ...(Array.isArray(s.faults) ? s.faults : [])
                  ];

                  const rowAlarms = Array.isArray(s.alarms) ? s.alarms : [];

                  const rowBucket = String(s.bucket || "").toLowerCase();

                  // Reference legend: dot 1 in rotation group is communication timestamp.
                  const sampleAgeMs = Number(s.sampleAgeMs ?? 0);
                  const rowTimestampMs = s.timestampUtc ? new Date(s.timestampUtc).getTime() : 0;
                  const timestampAgeMs = rowTimestampMs > 0 ? Date.now() - rowTimestampMs : Number.POSITIVE_INFINITY;

                  const commState =
                    s.bucket === "notCommunicating" || s.communicating === false || rowBucket === "notcommunicating"
                      ? "lost"
                      : s.stale === true || s.badReport === true || sampleAgeMs > 120000 || timestampAgeMs > 300000
                        ? "delayed"
                        : "fresh";

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
                  <tr key={s.id} onClick={() => setSelectedString(s)} className="group hover:bg-prizm-primary/5 cursor-pointer transition-colors relative">
<td className={"px-1.5 py-0.5 border-r border-prizm-border/10 sticky left-0 group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 text-center " + borderClass}>
   {isArrFirst ? (
     <input type="checkbox" className="accent-prizm-primary w-3 h-3 cursor-pointer" 
       checked={isArrAllSelected}
       ref={el => { if(el) el.indeterminate = isArrIndeterminate; }}
       onChange={() => {}}
       onClick={(e) => {
         e.stopPropagation();
         const arrStrings = filtered.filter((fs:any) => fs.arrayNumber === s.arrayNumber);
         const allSelected = arrStrings.every((fs:any) => selectedIds.has(fs.id));
         const next = new Set(selectedIds);
         if (allSelected) {
             arrStrings.forEach((fs:any) => next.delete(fs.id));
         } else {
             arrStrings.forEach((fs:any) => next.add(fs.id));
         }
         setSelectedIds(next);
       }} 
     />
   ) : null}
</td>
<td className="px-1.5 py-0.5 border-r border-prizm-border/20 sticky left-[30px] group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 min-w-[54px] sm:min-w-[64px]" title={s.warningCount > 0 || s.alarmCount > 0 ? `Warnings: ${(s.warnings||[]).join(", ")} | Alarms: ${(s.alarms||[]).join(", ")}` : ""}>
   {isArrFirst ? <span className="text-prizm-primary font-mono font-bold">{s.arrayNumber}</span> : null}
</td>
<td className="px-1.5 py-0.5 border-r border-prizm-border/10 sticky left-[84px] sm:left-[94px] group-hover:bg-prizm-surface-strong bg-prizm-surface z-20 text-center">
   <input type="checkbox" className="accent-prizm-primary w-3 h-3 cursor-pointer" 
     checked={selectedIds.has(s.id)}
     onChange={() => {}}
     onClick={(e) => {
       e.stopPropagation();
       const next = new Set(selectedIds);
       if (next.has(s.id)) next.delete(s.id);
       else next.add(s.id);
       setSelectedIds(next);
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
                  )})
              )}
            </tbody>
         </table>
      </div>

      <button
        className="fixed bottom-6 right-6 z-50 bg-prizm-surface-strong text-prizm-primary border border-prizm-primary/50 hover:bg-prizm-primary hover:text-prizm-bg px-4 py-2 rounded-full font-bold shadow-lg shadow-prizm-primary/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer outline-none"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <span className="text-xl leading-none">&uarr;</span> TOP
      </button>

      {commandNotice && (
        <div role="status" aria-live="polite" className={`fixed right-5 top-24 z-[120] w-[min(360px,calc(100vw-2.5rem))] rounded-xl border-2 bg-prizm-surface p-4 shadow-2xl ${commandNotice.status === "success" ? "border-emerald-500" : commandNotice.status === "warning" ? "border-amber-500" : "border-red-500"}`}>
          <div className="flex items-start gap-3">
            {commandNotice.status === "success" ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={20}/> : commandNotice.status === "warning" ? <TriangleAlert className="mt-0.5 shrink-0 text-amber-500" size={20}/> : <XCircle className="mt-0.5 shrink-0 text-red-500" size={20}/>}
            <div className="min-w-0 flex-1"><strong className="block text-xs font-black uppercase tracking-wide text-prizm-text">{commandNotice.title}</strong><span className="mt-1 block text-[11px] leading-relaxed text-prizm-text-muted">{commandNotice.detail}</span></div>
            <button type="button" onClick={() => setCommandNotice(null)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-prizm-border text-prizm-text-muted hover:bg-prizm-surface-strong" aria-label="Dismiss command confirmation"><X size={13}/></button>
          </div>
        </div>
      )}

      <BalancingModal
        isOpen={balancingModalOpen}
        onClose={() => setBalancingModalOpen(false)}
        onPreflight={handleBalancingPreflight}
        onConfirm={handleBalancingConfirm}
        targets={getSelectedTargets()}
        targetType="string"
      />

    </div>
  );
}
