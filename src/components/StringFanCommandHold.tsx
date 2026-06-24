import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Sliders,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  AlertOctagon,
  Power,
  Play,
  StopCircle,
  Timer,
  ShieldAlert,
  Flame,
  Gauge,
  Activity,
  History,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Download,
  Search,
  Filter,
  Check
} from "lucide-react";
import { stringNumberToEnergySegment, formatStringEsLabel } from "../lib/stringToEsMapper";

interface Capabilities {
  turtleFanEndpointSupported: boolean;
  nativeDurationSupported: boolean;
  holdSchedulerSupported: boolean;
  controllers: string[];
  message: string;
}

interface FanCommandTarget {
  controller: "ems" | "bms";
  arrayNumber: number;
  stringNumber: number;
  energySegmentNumber?: number;
}

interface FanCommandTargetStatus {
  targetId: string;
  controller: "ems" | "bms";
  arrayNumber: number;
  stringNumber: number;
  energySegmentNumber: number | null;
  label: string;
  lastCommandAt: string | null;
  lastCommandOk: boolean;
  lastCommandStatus: number | null;
  lastCommandResponse: string | null;
  errorCount: number;
  consecutiveErrorCount?: number;
  state: "RUNNING" | "STOPPED" | "FAILED";
}

interface ActiveHold {
  holdId: string;
  controller: "ems" | "bms";
  arrayNumber: number;
  stringNumber: number;
  fanSpeedPercent: number;
  startedAt: string;
  expiresAt: string;
  repeatIntervalSeconds: number;
  lastCommandAt: string | null;
  nextCommandAt: string | null;
  commandCount: number;
  lastCommandOk: boolean;
  lastCommandStatus: number | null;
  lastCommandResponse: string | null;
  errorCount: number;
  state: "RUNNING" | "ENDING" | "STOPPED" | "FAILED";
  targets: FanCommandTargetStatus[];
}

interface FanCommandVerificationRow {
  holdId: string;
  targetId: string;
  controller: "ems" | "bms";
  arrayNumber: number;
  stringNumber: number;
  energySegmentNumber: number | null;
  label: string;
  commandedSpeedPercent: number;
  commandedState: "OFF" | "ON";
  actualFanState?: "OFF" | "ON" | "UNKNOWN";
  actualFanSpeedPercent?: number | null;
  actualFanRpm?: number | null;
  actualFanRpmByFan?: number[] | null;
  feedbackTimestamp?: string | null;
  telemetryAgeMs?: number | null;
  result: "PASS" | "WARN_ZERO_RPM" | "FAIL_NO_RESPONSE" | "WARN_UNDER_COMMAND" | "WARN_OVER_COMMAND" | "FAIL_STALE_TELEMETRY" | "UNKNOWN_NO_TELEMETRY";
  notes: string[];
}

export default function StringFanCommandHold({ active = true }: { active?: boolean }) {
  // Config & Capabilities
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  
  // Active Holds list
  const [activeHolds, setActiveHolds] = useState<ActiveHold[]>([]);
  const [verificationRows, setVerificationRows] = useState<FanCommandVerificationRow[]>([]);
  const [loadingHolds, setLoadingHolds] = useState(false);
  
  // Timer state to trigger 1-second ticks for countdowns
  const [now, setNow] = useState(Date.now());

  // Form State
  const [controller, setController] = useState<"ems" | "bms">("ems");
  const [targetScope, setTargetScope] = useState<"site" | "arrays" | "strings" | "individual">("arrays");
  
  // Selection States
  const [selectedArrays, setSelectedArrays] = useState<number[]>([1]);
  const [stringRangeStart, setStringRangeStart] = useState<number>(1);
  const [stringRangeEnd, setStringRangeEnd] = useState<number>(40);
  const [individualTargets, setIndividualTargets] = useState<{ controller: "ems" | "bms"; arrayNumber: number; stringNumber: number }[]>([
    { controller: "ems", arrayNumber: 1, stringNumber: 5 }
  ]);
  
  // Helpers for adding individual target in form
  const [indivArray, setIndivArray] = useState(1);
  const [indivString, setIndivString] = useState(1);

  const [fanSpeedPercent, setFanSpeedPercent] = useState(50);
  const [durationPreset, setDurationPreset] = useState<string>("300"); // '300' is 5 min, 'custom' for custom input
  const [customDuration, setCustomDuration] = useState(300);
  const [repeatIntervalSeconds, setRepeatIntervalSeconds] = useState(30);
  const [sendStopAtEnd, setSendStopAtEnd] = useState(true);
  const [confirmationPhrase, setConfirmationPhrase] = useState("HOLD FAN SPEED");
  
  // UI Expandable Holds State
  const [expandedHolds, setExpandedHolds] = useState<Record<string, boolean>>({});

  // Verification Settings & Filter
  const [verifyFilter, setVerifyFilter] = useState<string>("ALL");
  const [verifySearch, setVerifySearch] = useState<string>("");
  const [verifyWarmup, setVerifyWarmup] = useState<number>(30);
  const [verifyTolerance, setVerifyTolerance] = useState<number>(15);
  const [verifyRequireAllRunning, setVerifyRequireAllRunning] = useState<boolean>(false);

  // Saved Runs state
  const [savedRuns, setSavedRuns] = useState<any[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // Actions State
  const [submitting, setSubmitting] = useState(false);
  const [actionResult, setActionResult] = useState<{
    success: boolean;
    message: string;
    holdId?: string;
    auditId?: string;
  } | null>(null);

  // Fetch capabilities on mount
  useEffect(() => {
    fetch("/api/local/fan-control/capabilities")
      .then((res) => res.json())
      .then((data) => setCapabilities(data))
      .catch((err) => console.error("Failed to load fan capabilities:", err));
  }, []);

  // Fetch active holds & verification
  const fetchHoldsAndVerification = useCallback(async () => {
    setLoadingHolds(true);
    try {
      const queryParams = new URLSearchParams({
        warmupSeconds: String(verifyWarmup),
        tolerancePercent: String(verifyTolerance),
        requireAllFansRunning: String(verifyRequireAllRunning)
      });
      const res = await fetch(`/api/local/fan-control/hold/status?${queryParams.toString()}`);
      const data = await res.json();
      if (data) {
        if (Array.isArray(data.activeHolds)) {
          setActiveHolds(data.activeHolds);
        }
        if (Array.isArray(data.verification)) {
          setVerificationRows(data.verification);
        }
      }
    } catch (err) {
      console.error("Failed to fetch active fan holds and verification:", err);
    } finally {
      setLoadingHolds(false);
    }
  }, [verifyWarmup, verifyTolerance, verifyRequireAllRunning]);

  const fetchSavedRuns = useCallback(async () => {
    setLoadingRuns(true);
    try {
      const res = await fetch("/api/local/fan-control/runs");
      if (res.ok) {
        const data = await res.json();
        setSavedRuns(data);
      }
    } catch (err) {
      console.error("Failed to fetch saved runs:", err);
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  const handleDeleteRun = async (runId: string) => {
    try {
      const res = await fetch(`/api/local/fan-control/runs/${runId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await fetchSavedRuns();
      } else {
        alert("Failed to delete saved run.");
      }
    } catch (err) {
      console.error("Error deleting run:", err);
    }
  };

  const handleClearAllRuns = async () => {
    if (!window.confirm("Are you sure you want to clear all saved fan test runs?")) return;
    try {
      const res = await fetch("/api/local/fan-control/runs/clear", {
        method: "POST"
      });
      if (res.ok) {
        await fetchSavedRuns();
      } else {
        alert("Failed to clear saved runs.");
      }
    } catch (err) {
      console.error("Error clearing runs:", err);
    }
  };

  const handleExportPDF = (run: any) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to export PDF reports.");
      return;
    }
    
    const rows = run.verificationResults || [];
    const passCount = rows.filter((r: any) => r.result === "PASS").length;
    const warnCount = rows.filter((r: any) => r.result.startsWith("WARN_")).length;
    const failCount = rows.filter((r: any) => r.result.startsWith("FAIL_")).length;
    const unknownCount = rows.filter((r: any) => r.result === "UNKNOWN_NO_TELEMETRY").length;

    const targetsWithFans = rows.filter((r: any) => Array.isArray(r.actualFanRpmByFan) && r.actualFanRpmByFan.length > 0);

    const htmlContent = `
      <html>
        <head>
          <title>GreEnergy PRIZM - Fan Hold Test Report</title>
          <style>
            body { font-family: 'Inter', system-ui, sans-serif; color: #1e293b; padding: 40px; margin: 0; background: #ffffff; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.05em; }
            .title { font-size: 14px; font-weight: 600; text-transform: uppercase; color: #10b981; letter-spacing: 0.1em; }
            
            .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
            .meta-item { border: 1px solid #e2e8f0; border-top: 3px solid #10b981; padding: 12px; border-radius: 6px; background: #f8fafc; }
            .meta-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
            .meta-value { font-size: 13px; font-weight: 600; }
            
            .counts-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
            .count-card { border: 1px solid #e2e8f0; padding: 10px 15px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
            .count-card.pass { border-left: 4px solid #10b981; }
            .count-card.warn { border-left: 4px solid #f59e0b; }
            .count-card.fail { border-left: 4px solid #ef4444; }
            .count-card.unknown { border-left: 4px solid #64748b; }
            .count-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #475569; }
            .count-value { font-size: 18px; font-weight: 800; }

            h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; color: #1e293b; margin-top: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; padding: 10px; text-align: left; font-weight: 700; text-transform: uppercase; color: #475569; }
            td { border-bottom: 1px solid #e2e8f0; padding: 10px; vertical-align: top; }
            
            .badge { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; border: 1px solid currentColor; display: inline-block; text-align: center; }
            .badge.pass { background-color: #f0fdf4; color: #166534; }
            .badge.warn { background-color: #fffbeb; color: #b45309; }
            .badge.fail { background-color: #fef2f2; color: #b91c1c; }
            .badge.unknown { background-color: #f1f5f9; color: #475569; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo"><span style="color: #10b981;">Gre</span><span style="color: #f59e0b;">Energy</span> <span style="color: #1e293b; font-weight: 500;">PRIZM</span></div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 500;">Dynamic Fan Verification Audit</div>
            </div>
            <div style="text-align: right;">
              <div class="title">FAN HOLD RUN REPORT</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Run ID: ${run.runId}</div>
            </div>
          </div>
          
          <div class="meta-grid">
            <div class="meta-item">
              <div class="meta-label">Timestamp</div>
              <div class="meta-value">${new Date(run.timestamp).toLocaleString()}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Operator</div>
              <div class="meta-value">${run.operator}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Commanded Speed</div>
              <div class="meta-value">${run.fanSpeedPercent}%</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Test Duration / Status</div>
              <div class="meta-value">${run.durationSeconds}s (${run.state})</div>
            </div>
          </div>

          <div class="counts-grid">
            <div class="count-card pass">
              <span class="count-label" style="color: #166534;">Passing</span>
              <span class="count-value" style="color: #166534;">${passCount}</span>
            </div>
            <div class="count-card warn">
              <span class="count-label" style="color: #b45309;">Warning</span>
              <span class="count-value" style="color: #b45309;">${warnCount}</span>
            </div>
            <div class="count-card fail">
              <span class="count-label" style="color: #b91c1c;">Failure</span>
              <span class="count-value" style="color: #b91c1c;">${failCount}</span>
            </div>
            <div class="count-card unknown">
              <span class="count-label" style="color: #475569;">Unknown</span>
              <span class="count-value" style="color: #475569;">${unknownCount}</span>
            </div>
          </div>

          <h3>Verification Results Summary (${run.targetsCount} Targets)</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 15%;">Target</th>
                <th style="width: 12%;">Commanded</th>
                <th style="width: 12%;">Actual State</th>
                <th style="width: 15%;">Avg Speed / RPM</th>
                <th style="width: 20%;">Individual Fan Speeds</th>
                <th style="width: 10%;">Result</th>
                <th style="width: 16%;">Diagnostic Notes</th>
              </tr>
            </thead>
            <tbody>
              ${(run.verificationResults || []).map((row: any) => {
                const badgeClass = row.result === "PASS" ? "pass" : row.result.startsWith("WARN") ? "warn" : row.result.startsWith("FAIL") ? "fail" : "unknown";
                
                const hasIndividual = Array.isArray(row.actualFanRpmByFan) && row.actualFanRpmByFan.length > 0;
                const individualHtml = hasIndividual
                  ? row.actualFanRpmByFan.map((rpm: number, i: number) => {
                      const pct = Array.isArray(row.actualFanPercentByFan) && row.actualFanPercentByFan[i] !== undefined
                        ? row.actualFanPercentByFan[i] + '%'
                        : '--';
                      return `<div style="white-space: nowrap;"><strong>F${i + 1}:</strong> ${rpm} RPM / ${pct}</div>`;
                    }).join("")
                  : `<span style="color: #94a3b8; font-style: italic;">Individual fan telemetry unavailable</span>`;

                const telemetryAgeText = row.telemetryAgeMs !== null && row.telemetryAgeMs !== undefined 
                  ? Math.round(row.telemetryAgeMs / 1000) + 's ago' 
                  : 'No feedback';

                return `
                  <tr>
                    <td><strong>${row.controller.toUpperCase()} ${row.label}</strong></td>
                    <td>${row.commandedSpeedPercent}% (${row.commandedState})</td>
                    <td>${row.actualFanState || "UNKNOWN"}</td>
                    <td>
                      ${row.actualFanSpeedPercent !== null ? row.actualFanSpeedPercent + '%' : '--'} 
                      ${row.actualFanRpm ? '(' + row.actualFanRpm + ' RPM)' : ''}
                      <div style="font-size: 9px; color: #64748b; margin-top: 4px;">Age: ${telemetryAgeText}</div>
                    </td>
                    <td>
                      ${individualHtml}
                      ${hasIndividual ? `<div style="font-size: 8px; color: #64748b; margin-top: 4px;">${row.actualFanRpmByFan.length} fan readings captured</div>` : ''}
                    </td>
                    <td><span class="badge ${badgeClass}">${row.result}</span></td>
                    <td>
                      ${(() => {
                        const mainNotes = row.notes.filter((note: string) => !(/^Fan \d+ /i.test(note)));
                        if (mainNotes.length > 0) {
                          const hasFanAnomalies = row.notes.some((note: string) => /^Fan \d+ /i.test(note));
                          return mainNotes.join("; ") + (hasFanAnomalies ? " <br/><span style='font-size: 8px; color: #64748b; font-style: italic;'>(See individual fans / appendix)</span>" : "");
                        }
                        return row.notes.join("; ");
                      })()}
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
          
          ${targetsWithFans.length > 0 ? `
            <h3>Appendix: Target Fan Detail</h3>
            <table>
              <thead>
                <tr>
                  <th style="width: 25%;">Target</th>
                  <th style="width: 10%;">Fan #</th>
                  <th style="width: 15%;">RPM</th>
                  <th style="width: 15%;">Percent</th>
                  <th style="width: 15%;">Status</th>
                  <th style="width: 20%;">Notes</th>
                </tr>
              </thead>
              <tbody>
                ${targetsWithFans.map((row: any) => {
                  return (row.actualFanRpmByFan || []).map((rpm: number, i: number) => {
                    const pct = Array.isArray(row.actualFanPercentByFan) && row.actualFanPercentByFan[i] !== undefined
                      ? row.actualFanPercentByFan[i] + '%'
                      : '--';
                    
                    const isZero = rpm === 0;
                    const isBelow = pct !== '--' && parseInt(pct) < row.commandedSpeedPercent - 15;
                    const isAbove = pct !== '--' && parseInt(pct) > row.commandedSpeedPercent + 15;
                    
                    let statusText = "PASS";
                    let badgeClass = "pass";
                    let fanNote = "Within tolerance";
                    
                    if (isZero && row.commandedSpeedPercent > 0) {
                      statusText = "ZERO RPM";
                      badgeClass = "warn";
                      fanNote = "Fan stopped";
                    } else if (isBelow) {
                      statusText = "UNDER SPEED";
                      badgeClass = "warn";
                      fanNote = `Below command by ${Math.abs(parseInt(pct) - row.commandedSpeedPercent)}%`;
                    } else if (isAbove) {
                      statusText = "OVER SPEED";
                      badgeClass = "warn";
                      fanNote = `Above command by ${Math.abs(parseInt(pct) - row.commandedSpeedPercent)}%`;
                    }

                    return `
                      <tr>
                        <td><strong>${row.controller.toUpperCase()} ${row.label}</strong></td>
                        <td>Fan ${i + 1}</td>
                        <td>${rpm} RPM</td>
                        <td>${pct}</td>
                        <td><span class="badge ${badgeClass}">${statusText}</span></td>
                        <td>${fanNote}</td>
                      </tr>
                    `;
                  }).join("");
                }).join("")}
              </tbody>
            </table>
          ` : ''}

          <div style="margin-top: 50px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #10b981; padding-top: 20px;">
            Generated by GreEnergy PRIZM &bull; Run ID: ${run.runId} &bull; Created: ${new Date(run.timestamp).toISOString()}
          </div>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Initial load and fast polling loop
  useEffect(() => {
    if (!active) return;
    fetchHoldsAndVerification();
    fetchSavedRuns();

    const interval = setInterval(() => {
      fetchHoldsAndVerification();
      fetchSavedRuns();
    }, 3000);

    return () => clearInterval(interval);
  }, [active, fetchHoldsAndVerification, fetchSavedRuns]);

  // Fast countdown timer loop (runs every 1 second)
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);

  // Dynamic list of targets based on form selection
  const resolvedTargets = useMemo((): FanCommandTarget[] => {
    const list: FanCommandTarget[] = [];
    if (targetScope === "site") {
      for (let a = 1; a <= 8; a++) {
        for (let s = 1; s <= 40; s++) {
          list.push({ controller, arrayNumber: a, stringNumber: s });
        }
      }
    } else if (targetScope === "arrays") {
      for (const a of selectedArrays) {
        for (let s = 1; s <= 40; s++) {
          list.push({ controller, arrayNumber: a, stringNumber: s });
        }
      }
    } else if (targetScope === "strings") {
      const arrs = selectedArrays.length > 0 ? selectedArrays : [1, 2, 3, 4, 5, 6, 7, 8];
      const startS = Math.min(stringRangeStart, stringRangeEnd);
      const endS = Math.max(stringRangeStart, stringRangeEnd);
      for (const a of arrs) {
        for (let s = startS; s <= endS; s++) {
          list.push({ controller, arrayNumber: a, stringNumber: s });
        }
      }
    } else if (targetScope === "individual") {
      list.push(...individualTargets.map(t => ({ ...t, controller })));
    }
    return list;
  }, [targetScope, controller, selectedArrays, stringRangeStart, stringRangeEnd, individualTargets]);

  const getSelectedDuration = (): number => {
    if (durationPreset === "custom") {
      return customDuration;
    }
    return Number(durationPreset);
  };

  const handleArrayToggle = (arrNum: number) => {
    if (selectedArrays.includes(arrNum)) {
      setSelectedArrays(selectedArrays.filter(a => a !== arrNum));
    } else {
      setSelectedArrays([...selectedArrays, arrNum].sort((a, b) => a - b));
    }
  };

  const addIndividualTarget = () => {
    const exists = individualTargets.some(t => t.arrayNumber === indivArray && t.stringNumber === indivString);
    if (!exists) {
      setIndividualTargets([...individualTargets, { controller, arrayNumber: indivArray, stringNumber: indivString }]);
    }
  };

  const removeIndividualTarget = (index: number) => {
    setIndividualTargets(individualTargets.filter((_, i) => i !== index));
  };

  // Handle Deploy Trigger
  const handleStartHold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resolvedTargets.length === 0) {
      alert("Error: Resolved targets list cannot be empty.");
      return;
    }

    setSubmitting(true);
    setActionResult(null);

    const duration = getSelectedDuration();

    try {
      const res = await fetch("/api/local/fan-control/hold/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targets: resolvedTargets,
          fanSpeedPercent,
          durationSeconds: duration,
          repeatIntervalSeconds,
          sendStopAtEnd,
          confirmationPhrase,
          operator: "PRIZM Dashboard Operator"
        })
      });

      const data = await res.json();
      if (res.ok && data.accepted) {
        setActionResult({
          success: true,
          message: data.message || `Fan hold successfully scheduled for ${resolvedTargets.length} targets!`,
          holdId: data.holdId,
          auditId: data.auditId
        });
        if (data.holdId) {
          setExpandedHolds(prev => ({ ...prev, [data.holdId]: true }));
        }
        await fetchHoldsAndVerification();
        await fetchSavedRuns();
      } else {
        setActionResult({
          success: false,
          message: data.message || "Failed to initiate fan hold. Validation rejected."
        });
      }
    } catch (err: any) {
      console.error("Error starting fan hold:", err);
      setActionResult({
        success: false,
        message: err.message || "Network error. Failed to dispatch fan command hold request."
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Stop Trigger (hold-wide or single target)
  const handleStopHold = async (holdId: string, sendStop: boolean, targetId?: string) => {
    try {
      const res = await fetch("/api/local/fan-control/hold/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdId,
          targetId,
          sendStopCommand: sendStop,
          operator: "PRIZM Dashboard Operator"
        })
      });
      if (res.ok) {
        await fetchHoldsAndVerification();
        await fetchSavedRuns();
      } else {
        const errData = await res.json();
        alert(`Stop action rejected: ${errData.message}`);
      }
    } catch (err) {
      console.error("Failed to terminate hold:", err);
    }
  };

  // Trigger Emergency Stop for all active/running holds
  const handleEmergencyStopAll = async () => {
    const running = activeHolds.filter((h) => h.state === "RUNNING");
    if (running.length === 0) {
      // Just send immediate stop 0% to the selected strings as an overrides helper
      if (resolvedTargets.length === 0) {
        alert("No active holds and no target selected to force STOP command.");
        return;
      }
      try {
        const promises = resolvedTargets.map(t => 
          fetch("/api/local/fan-control/hold/stop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              controller: t.controller,
              arrayNumber: t.arrayNumber,
              stringNumber: t.stringNumber,
              sendStopCommand: true,
              operator: "EMERGENCY OVERRIDE 0%"
            })
          })
        );
        await Promise.all(promises);
        alert(`Dispatched manual stop command (fanSpeed: 0%) directly to ${resolvedTargets.length} targets.`);
      } catch (err) {
        console.error("EMERGENCY DIRECT OVERRIDE FAILED:", err);
      }
      return;
    }

    let successCount = 0;
    for (const h of running) {
      try {
        const res = await fetch("/api/local/fan-control/hold/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holdId: h.holdId,
            sendStopCommand: true,
            operator: "EMERGENCY ALL STOP"
          })
        });
        if (res.ok) successCount++;
      } catch (e) {
        console.error(e);
      }
    }
    alert(`Emergency Terminate: successfully stopped ${successCount} of ${running.length} active fan hold loops.`);
    await fetchHoldsAndVerification();
    await fetchSavedRuns();
  };

  // Toggle expandable hold rows
  const toggleHoldExpand = (holdId: string) => {
    setExpandedHolds(prev => ({ ...prev, [holdId]: !prev[holdId] }));
  };

  // Filtered Verification rows
  const filteredVerification = useMemo(() => {
    return verificationRows.filter((r) => {
      // Search filter
      if (verifySearch) {
        const searchLower = verifySearch.toLowerCase();
        const matchesLabel = r.label.toLowerCase().includes(searchLower);
        const matchesResult = r.result.toLowerCase().includes(searchLower);
        const matchesNotes = r.notes.some(n => n.toLowerCase().includes(searchLower));
        if (!matchesLabel && !matchesResult && !matchesNotes) {
          return false;
        }
      }

      // Dropdown filter
      if (verifyFilter === "ALL") return true;
      if (verifyFilter === "PASS" && r.result === "PASS") return true;
      if (verifyFilter === "WARN" && r.result.startsWith("WARN_")) return true;
      if (verifyFilter === "FAIL" && r.result.startsWith("FAIL_")) return true;
      if (verifyFilter === "UNKNOWN" && r.result === "UNKNOWN_NO_TELEMETRY") return true;
      
      return false;
    });
  }, [verificationRows, verifyFilter, verifySearch]);

  // Export functions
  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Status,Hold ID,Target ID,Controller,Array,ES,String,Commanded Speed,Actual State,Actual RPM,Feedback Age,Notes,Fan Count,Fan Rated RPM,Fan Status Avg RPM,Actual Fan RPM By Fan,Actual Fan Percent By Fan,Individual Fan Notes\r\n";
    
    for (const r of filteredVerification) {
      const notesStr = r.notes.join("; ").replace(/"/g, '""');
      const ageStr = r.telemetryAgeMs !== null && r.telemetryAgeMs !== undefined 
        ? `${Math.round(r.telemetryAgeMs / 1000)}s` 
        : "--";
      
      const fanCountVal = r.fanCount !== null && r.fanCount !== undefined ? r.fanCount : "";
      const fanRatedRpmVal = r.fanRatedRpm !== null && r.fanRatedRpm !== undefined ? r.fanRatedRpm : "";
      const fanStatusAvgRpmVal = r.fanStatusAvgRpm !== null && r.fanStatusAvgRpm !== undefined ? r.fanStatusAvgRpm : "";
      const actualFanRpmByFanVal = Array.isArray(r.actualFanRpmByFan) ? r.actualFanRpmByFan.join(";") : "";
      const actualFanPercentByFanVal = Array.isArray(r.actualFanPercentByFan) ? r.actualFanPercentByFan.join(";") : "";
      const individualFanNotesVal = r.notes
        .filter((note: string) => note.startsWith("Fan ") || note.toLowerCase().includes("individual"))
        .join("; ")
        .replace(/"/g, '""');

      csvContent += `"${r.result}","${r.holdId}","${r.targetId}","${r.controller}","${r.arrayNumber}","ES${r.energySegmentNumber ?? ""}","String ${r.stringNumber}","${r.commandedSpeedPercent}%","${r.actualFanState || ""}","${r.actualFanRpm || ""}","${ageStr}","${notesStr}","${fanCountVal}","${fanRatedRpmVal}","${fanStatusAvgRpmVal}","${actualFanRpmByFanVal}","${actualFanPercentByFanVal}","${individualFanNotesVal}"\r\n`;
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `fan_verification_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredVerification, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `fan_verification_report_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Counters for Verification Summary Cards
  const summaryCounts = useMemo(() => {
    let total = verificationRows.length;
    let passing = 0;
    let warning = 0;
    let failed = 0;
    let unknown = 0;

    for (const r of verificationRows) {
      if (r.result === "PASS") passing++;
      else if (r.result.startsWith("WARN_")) warning++;
      else if (r.result.startsWith("FAIL_")) failed++;
      else unknown++;
    }

    return { total, passing, warning, failed, unknown };
  }, [verificationRows]);

  return (
    <div className="space-y-4">
      {/* 1. Header & Configuration Status */}
      <div className="bg-prizm-surface p-4 rounded-md border border-prizm-border flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-prizm-text uppercase font-sans">
            String Fan Command Hold Tool
          </h2>
          <p className="text-[11px] text-prizm-text-muted font-mono mt-0.5">
            Command rack extraction/stack fan speeds for an exact duration across single, multiple, or site-wide string targets.
          </p>
        </div>

        {capabilities && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase bg-prizm-surface-strong border border-prizm-border px-2 py-1 rounded text-prizm-text-muted">
              Scheduler: <span className="font-bold text-prizm-primary">Active (PRIZM Engine)</span>
            </span>
            <span className={`text-[10px] font-mono uppercase border px-2 py-1 rounded ${
              capabilities.turtleFanEndpointSupported 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                : "bg-rose-50 text-rose-700 border-rose-200"
            }`}>
              Turtle URL: {capabilities.turtleFanEndpointSupported ? "Connected" : "Unreachable"}
            </span>
          </div>
        )}
      </div>

      {/* 2. Critical Safety Warning */}
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-3 text-amber-800 text-xs font-sans">
        <AlertTriangle size={16} className="shrink-0 text-amber-600 mt-0.5" />
        <div>
          <span className="font-bold">CRITICAL WARNING & GUIDELINES:</span>
          <p className="mt-0.5 text-[11px] text-amber-700 font-medium">
            This tool repeatedly sends string fan commands to maintain duty-cycles across the selected target set. 
            Keep confirmation phrase checks secure to prevent accidental thermal stalls or excessive negative pressure gradients.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: Controls Form */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-prizm-surface border border-prizm-border rounded-md shadow-sm overflow-hidden">
            <div className="bg-prizm-surface-strong px-4 py-2.5 border-b border-prizm-border flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-prizm-text">
                Deployment Parameters
              </span>
              <Sliders size={13} className="text-prizm-text-muted" />
            </div>

            <form onSubmit={handleStartHold} className="p-4 space-y-3.5">
              {/* Controller Select */}
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-prizm-text-muted mb-1">
                  Target Controller Unit
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setController("ems")}
                    className={`p-1.5 font-mono text-xs uppercase rounded border transition-all cursor-pointer ${
                      controller === "ems"
                        ? "bg-prizm-primary/10 text-prizm-primary-strong border-prizm-primary/30 font-bold"
                        : "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border hover:bg-prizm-border/40"
                    }`}
                  >
                    EMS Controller
                  </button>
                  <button
                    type="button"
                    onClick={() => setController("bms")}
                    className={`p-1.5 font-mono text-xs uppercase rounded border transition-all cursor-pointer ${
                      controller === "bms"
                        ? "bg-prizm-primary/10 text-prizm-primary-strong border-prizm-primary/30 font-bold"
                        : "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border hover:bg-prizm-border/40"
                    }`}
                  >
                    BMS Controller
                  </button>
                </div>
              </div>

              {/* Target Scope Dropdown */}
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-prizm-text-muted mb-1">
                  Target Deployment Scope
                </label>
                <select
                  value={targetScope}
                  onChange={(e) => setTargetScope(e.target.value as any)}
                  className="w-full text-xs font-mono p-1.5 rounded border border-prizm-border bg-prizm-surface text-prizm-text focus:outline-none focus:border-prizm-primary"
                >
                  <option value="site">Entire Site (320 Strings, A1-A8 S1-S40)</option>
                  <option value="arrays">Selected Arrays (All Strings in selected Arrays)</option>
                  <option value="strings">Specific String Range across Selected Arrays</option>
                  <option value="individual">Custom Target Combinations List</option>
                </select>
              </div>

              {/* Multi-Array Checkbox Grid (Array Scope) */}
              {(targetScope === "arrays" || targetScope === "strings") && (
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-prizm-text-muted mb-1.5">
                    Select Arrays
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((arrNum) => {
                      const isSelected = selectedArrays.includes(arrNum);
                      return (
                        <button
                          type="button"
                          key={arrNum}
                          onClick={() => handleArrayToggle(arrNum)}
                          className={`p-1.5 font-mono text-xs rounded border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            isSelected
                              ? "bg-prizm-primary/15 text-prizm-primary-strong border-prizm-primary/40 font-bold"
                              : "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border hover:bg-prizm-border/40"
                          }`}
                        >
                          {isSelected && <Check size={11} />}
                          A{arrNum}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* String Range Selector (String Scope) */}
              {targetScope === "strings" && (
                <div className="space-y-2 border-t border-prizm-border/20 pt-2.5">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-prizm-text-muted">
                    String Number Range
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-mono text-prizm-text-muted mb-0.5">FROM</label>
                      <input
                        type="number"
                        min="1"
                        max="40"
                        value={stringRangeStart}
                        onChange={(e) => setStringRangeStart(Math.max(1, Math.min(40, Number(e.target.value))))}
                        className="w-full text-xs font-mono p-1 rounded border border-prizm-border bg-prizm-surface text-prizm-text"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono text-prizm-text-muted mb-0.5">TO</label>
                      <input
                        type="number"
                        min="1"
                        max="40"
                        value={stringRangeEnd}
                        onChange={(e) => setStringRangeEnd(Math.max(1, Math.min(40, Number(e.target.value))))}
                        className="w-full text-xs font-mono p-1 rounded border border-prizm-border bg-prizm-surface text-prizm-text"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Individual Custom Target Selection */}
              {targetScope === "individual" && (
                <div className="space-y-2 border-t border-prizm-border/20 pt-2.5">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-prizm-text-muted">
                    Configure Individual Targets List
                  </span>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-[8px] font-mono text-prizm-text-muted">ARRAY</label>
                      <select
                        value={indivArray}
                        onChange={(e) => setIndivArray(Number(e.target.value))}
                        className="w-full text-xs font-mono p-1 rounded border border-prizm-border bg-prizm-surface text-prizm-text"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(a => <option key={a} value={a}>Array {a}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[8px] font-mono text-prizm-text-muted">STRING</label>
                      <select
                        value={indivString}
                        onChange={(e) => setIndivString(Number(e.target.value))}
                        className="w-full text-xs font-mono p-1 rounded border border-prizm-border bg-prizm-surface text-prizm-text"
                      >
                        {Array.from({ length: 40 }, (_, i) => i + 1).map(s => <option key={s} value={s}>String {s}</option>)}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={addIndividualTarget}
                      className="p-1.5 bg-prizm-surface border border-prizm-border text-prizm-primary hover:bg-prizm-primary hover:text-white rounded transition-all cursor-pointer flex items-center justify-center"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {/* List of custom targets */}
                  <div className="border border-prizm-border bg-prizm-surface-strong/30 rounded p-2 max-h-[140px] overflow-y-auto space-y-1 divide-y divide-prizm-border/40 font-mono text-[10px]">
                    {individualTargets.length === 0 ? (
                      <div className="text-center text-prizm-text-muted py-2">No individual targets configured.</div>
                    ) : (
                      individualTargets.map((t, idx) => (
                        <div key={idx} className="flex items-center justify-between pt-1 first:pt-0">
                          <span>{t.controller.toUpperCase()} A{t.arrayNumber}-S{t.stringNumber} (ES{stringNumberToEnergySegment(t.stringNumber)})</span>
                          <button
                            type="button"
                            onClick={() => removeIndividualTarget(idx)}
                            className="text-prizm-danger hover:text-red-700 transition-all cursor-pointer"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* resolved targets count preview */}
              <div className="bg-prizm-surface-strong p-2 rounded border border-prizm-border/50 text-[10px] font-mono text-prizm-text flex items-center justify-between">
                <span>Targets Count:</span>
                <span className="font-black text-prizm-primary bg-prizm-primary/10 px-1.5 py-0.5 rounded">
                  {resolvedTargets.length} String{resolvedTargets.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Fan Speed Slider */}
              <div>
                <div className="flex items-center justify-between mb-1 font-mono text-[10px]">
                  <span className="uppercase text-prizm-text-muted">Command Speed Duty Cycle</span>
                  <span className="font-extrabold text-prizm-primary text-xs bg-prizm-primary/10 px-1.5 py-0.5 rounded">
                    {fanSpeedPercent}%
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={fanSpeedPercent}
                    onChange={(e) => setFanSpeedPercent(Number(e.target.value))}
                    className="w-full accent-prizm-primary"
                  />
                </div>
                <div className="flex justify-between font-mono text-[8px] text-prizm-text-muted mt-1">
                  <span>0% (STOP)</span>
                  <span>25%</span>
                  <span>50% (MED)</span>
                  <span>75%</span>
                  <span>100% (MAX)</span>
                </div>
              </div>

              {/* Duration Config */}
              <div className="space-y-2 border-t border-prizm-border/40 pt-3">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-prizm-text-muted">
                  Hold Duration
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { label: "30s", val: "30" },
                    { label: "1 min", val: "60" },
                    { label: "5 min", val: "300" },
                    { label: "10 min", val: "600" },
                    { label: "15 min", val: "900" },
                    { label: "30 min", val: "1800" }
                  ].map((preset) => (
                    <button
                      type="button"
                      key={preset.val}
                      onClick={() => {
                        setDurationPreset(preset.val);
                      }}
                      className={`p-1.5 font-mono text-[10px] rounded border transition-all cursor-pointer ${
                        durationPreset === preset.val
                          ? "bg-prizm-primary/10 text-prizm-primary-strong border-prizm-primary/40 font-bold"
                          : "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border hover:bg-prizm-border/40"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setDurationPreset("custom");
                    }}
                    className={`col-span-3 p-1.5 font-mono text-[10px] rounded border transition-all cursor-pointer ${
                      durationPreset === "custom"
                        ? "bg-prizm-primary/10 text-prizm-primary-strong border-prizm-primary/40 font-bold"
                        : "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border hover:bg-prizm-border/40"
                    }`}
                  >
                    Custom Seconds Input
                  </button>
                </div>

                {durationPreset === "custom" && (
                  <div className="mt-2">
                    <label className="block text-[9px] font-mono text-prizm-text-muted uppercase mb-1">
                      Enter seconds (10 to 1800s max):
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="1800"
                      value={customDuration}
                      onChange={(e) => setCustomDuration(Math.max(10, Math.min(1800, Number(e.target.value))))}
                      className="w-full text-xs font-mono p-1.5 rounded border border-prizm-border bg-prizm-surface text-prizm-text focus:outline-none focus:border-prizm-primary"
                    />
                  </div>
                )}
              </div>

              {/* Re-command Interval */}
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-prizm-text-muted mb-1">
                  Re-Command Interval
                </label>
                <select
                  value={repeatIntervalSeconds}
                  onChange={(e) => setRepeatIntervalSeconds(Number(e.target.value))}
                  className="w-full text-xs font-mono p-1.5 rounded border border-prizm-border bg-prizm-surface text-prizm-text focus:outline-none focus:border-prizm-primary"
                >
                  <option value={5}>Every 5 Seconds (Fast Telemetry Bypass)</option>
                  <option value={10}>Every 10 Seconds</option>
                  <option value={20}>Every 20 Seconds</option>
                  <option value={30}>Every 30 Seconds (Default Grid Balancing)</option>
                  <option value={60}>Every 60 Seconds (1 Minute Interval)</option>
                </select>
              </div>

              {/* Send Stop command at end checkbox */}
              <div className="flex items-center gap-2 border-t border-prizm-border/40 pt-3">
                <input
                  type="checkbox"
                  id="sendStopAtEnd"
                  checked={sendStopAtEnd}
                  onChange={(e) => setSendStopAtEnd(e.target.checked)}
                  className="rounded text-prizm-primary focus:ring-prizm-primary h-3.5 w-3.5"
                />
                <label htmlFor="sendStopAtEnd" className="font-mono text-[10px] text-prizm-text-muted uppercase cursor-pointer select-none">
                  Reset speed to 0% on duration expiration
                </label>
              </div>

              {/* Confirmation phrase */}
              <div className="border-t border-prizm-border/40 pt-3">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-emerald-500 font-extrabold mb-1">
                  Authorization Status
                </label>
                <div className="text-xs font-mono p-2 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-600 font-bold flex items-center gap-1.5">
                  <CheckCircle size={13} className="shrink-0" />
                  Unlocked (Auto-Auth)
                </div>
              </div>

              {/* Trigger buttons */}
              <div className="space-y-2 pt-1.5">
                <button
                  type="submit"
                  disabled={submitting || resolvedTargets.length === 0}
                  className={`w-full font-mono text-xs font-extrabold py-2 px-4 rounded transition-all flex items-center justify-center gap-2 border uppercase cursor-pointer ${
                    !submitting && resolvedTargets.length > 0
                      ? "bg-prizm-primary text-white border-prizm-primary hover:bg-prizm-primary-strong hover:border-prizm-primary-strong shadow-sm"
                      : "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border opacity-50 cursor-not-allowed"
                  }`}
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Starting Hold...
                    </>
                  ) : (
                    <>
                      <Play size={13} />
                      Start Fan Speed Hold ({resolvedTargets.length} Targets)
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleEmergencyStopAll}
                  className="w-full font-mono text-xs font-bold py-2 px-4 rounded transition-all flex items-center justify-center gap-2 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 uppercase cursor-pointer"
                >
                  <Power size={13} />
                  Emergency Direct Override (0% Stop)
                </button>
              </div>
            </form>

            {/* Action Result Info Box */}
            {actionResult && (
              <div className={`p-4 border-t font-mono text-[11px] space-y-1.5 ${
                actionResult.success 
                  ? "bg-emerald-50 text-emerald-800 border-emerald-100" 
                  : "bg-rose-50 text-rose-800 border-rose-100"
              }`}>
                <div className="flex items-start gap-2">
                  {actionResult.success ? (
                    <CheckCircle size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertOctagon size={15} className="text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-bold uppercase tracking-wider">
                      {actionResult.success ? "Request Scheduled" : "Request Rejected"}
                    </span>
                    <p className="mt-0.5">{actionResult.message}</p>
                  </div>
                </div>
                {actionResult.success && (
                  <div className="grid grid-cols-2 text-[9px] text-prizm-text-muted border-t border-prizm-border/20 pt-1.5 mt-1.5">
                    <div>Hold ID: {actionResult.holdId?.substring(0, 12)}...</div>
                    <div>Audit ID: {actionResult.auditId?.substring(0, 12)}...</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Active Holds Grid & Telemetry Status */}
        <div className="lg:col-span-7 space-y-4">
          {/* Active Holds Table */}
          <div className="bg-prizm-surface border border-prizm-border rounded-md shadow-sm overflow-hidden">
            <div className="bg-prizm-surface-strong px-4 py-2.5 border-b border-prizm-border flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-prizm-text flex items-center gap-2">
                <Activity size={14} className="text-prizm-primary animate-pulse" />
                Active Hold Sessions ({activeHolds.filter(h => h.state === "RUNNING").length})
              </span>
              <button
                type="button"
                onClick={fetchHoldsAndVerification}
                disabled={loadingHolds}
                className="p-1 rounded hover:bg-prizm-border/40 text-prizm-text-muted hover:text-prizm-text transition-all cursor-pointer"
              >
                <RefreshCw size={12} className={loadingHolds ? "animate-spin" : ""} />
              </button>
            </div>

            <div className="divide-y divide-prizm-border max-h-[500px] overflow-y-auto no-scrollbar">
              {activeHolds.length === 0 ? (
                <div className="p-8 text-center text-prizm-text-muted font-mono text-xs">
                  <Timer size={24} className="mx-auto text-prizm-border mb-2 stroke-[1.5]" />
                  No string fan holds are currently configured in memory.
                </div>
              ) : (
                activeHolds.map((hold) => {
                  const isExpanded = !!expandedHolds[hold.holdId];
                  const expiresTime = new Date(hold.expiresAt).getTime();
                  const remainingSec = Math.max(0, Math.round((expiresTime - now) / 1000));
                  
                  let nextTickSec = 0;
                  if (hold.nextCommandAt) {
                    nextTickSec = Math.max(0, Math.round((new Date(hold.nextCommandAt).getTime() - now) / 1000));
                  }

                  const durationTotal = Math.round((expiresTime - new Date(hold.startedAt).getTime()) / 1000);
                  const progressPct = durationTotal > 0 ? Math.min(100, Math.max(0, ((durationTotal - remainingSec) / durationTotal) * 100)) : 100;

                  return (
                    <div key={hold.holdId} className="p-4 space-y-3 hover:bg-prizm-surface-strong/30 transition-all">
                      {/* Session Info */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-xs font-bold text-prizm-text bg-prizm-surface-strong px-2 py-0.5 rounded border border-prizm-border/40">
                            SESSION: {hold.targets.length} Target{hold.targets.length !== 1 ? "s" : ""} @ {hold.fanSpeedPercent}%
                          </span>
                          <span className="text-[9px] text-prizm-text-muted uppercase">ID: {hold.holdId.substring(0, 8)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] uppercase font-mono px-2 py-0.5 rounded border font-extrabold ${
                            hold.state === "RUNNING"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse"
                              : hold.state === "FAILED"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border"
                          }`}>
                            {hold.state}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleHoldExpand(hold.holdId)}
                            className="p-1 rounded hover:bg-prizm-border/50 text-prizm-text-muted cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </div>

                      {/* Parent Progress / Countdown */}
                      {hold.state === "RUNNING" && (
                        <div className="space-y-1.5 font-mono text-[10px]">
                          <div className="flex items-center justify-between text-prizm-text-muted">
                            <span className="flex items-center gap-1 uppercase">
                              <Timer size={12} className="text-prizm-primary" />
                              Remaining Loop Time: <span className="font-extrabold text-prizm-text">{remainingSec}s</span>
                            </span>
                            <span className="uppercase text-prizm-info">
                              Next Pulse: <span className="font-extrabold">{nextTickSec}s</span>
                            </span>
                          </div>
                          <div className="w-full bg-prizm-surface-strong h-1.5 rounded-full overflow-hidden border border-prizm-border/30">
                            <div
                              className="bg-prizm-primary h-full transition-all duration-1000"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Parent actions */}
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <div className="text-prizm-text-muted">
                          Pulses: <span className="font-bold text-prizm-text">{hold.commandCount}</span> | Errors: <span className="font-bold text-prizm-text">{hold.errorCount}</span>
                        </div>
                        {hold.state === "RUNNING" && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleStopHold(hold.holdId, false)}
                              className="px-2 py-0.5 font-mono text-[9px] uppercase border border-prizm-border bg-prizm-surface text-prizm-text hover:bg-prizm-surface-strong rounded cursor-pointer"
                            >
                              Stop Loop Only
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStopHold(hold.holdId, true)}
                              className="px-2.5 py-0.5 font-mono text-[9px] uppercase bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 font-bold rounded flex items-center gap-1 cursor-pointer"
                            >
                              <StopCircle size={10} />
                              Stop & Reset Fans to 0%
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Expandable Individual Targets Status table */}
                      {isExpanded && (
                        <div className="border border-prizm-border/60 rounded bg-prizm-surface-strong/20 p-2 text-[10px] font-mono space-y-1.5 mt-2 transition-all">
                          <span className="font-bold uppercase text-[9px] text-prizm-text-muted">Targeted Racks Status list</span>
                          <div className="max-h-[220px] overflow-y-auto space-y-1 divide-y divide-prizm-border/30">
                            {hold.targets.map((t) => (
                              <div key={t.targetId} className="flex items-center justify-between pt-1 first:pt-0">
                                <div className="flex flex-col">
                                  <span className="font-bold text-prizm-text">{t.controller.toUpperCase()} {t.label}</span>
                                  <span className="text-[8px] text-prizm-text-muted">
                                    Last command: {t.lastCommandAt ? new Date(t.lastCommandAt).toLocaleTimeString() : "Never"} | Status: {t.lastCommandStatus ?? "--"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[8px] font-bold px-1 rounded ${
                                    t.state === "RUNNING" 
                                      ? "bg-emerald-100 text-emerald-800" 
                                      : t.state === "FAILED" 
                                        ? "bg-rose-100 text-rose-800" 
                                        : "bg-gray-100 text-gray-800"
                                  }`}>
                                    {t.state}
                                  </span>
                                  {t.state === "RUNNING" && (
                                    <button
                                      type="button"
                                      onClick={() => handleStopHold(hold.holdId, true, t.targetId)}
                                      className="text-prizm-danger hover:text-red-700 font-bold text-[9px] transition-all cursor-pointer"
                                    >
                                      Stop Target
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Command Verification Results Section */}
      <div className="bg-prizm-surface border border-prizm-border rounded-md shadow-sm overflow-hidden mt-6">
        <div className="bg-prizm-surface-strong px-4 py-3 border-b border-prizm-border flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-prizm-text font-mono flex items-center gap-1.5">
              <ShieldAlert size={14} className="text-prizm-primary" />
              Command Verification & Feedback Logs
            </h3>
            <p className="text-[10px] font-mono text-prizm-text-muted mt-0.5">
              Compare commanded fan state/speed against live string report feedback values from the array.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Verify settings */}
            <div className="flex items-center gap-1 bg-prizm-surface border border-prizm-border rounded p-1 text-[9px] font-mono">
              <span className="text-prizm-text-muted uppercase">Warmup:</span>
              <input
                type="number"
                value={verifyWarmup}
                onChange={e => setVerifyWarmup(Number(e.target.value))}
                className="w-10 bg-transparent text-prizm-text font-bold text-center focus:outline-none"
              />
              <span className="text-prizm-text-muted">s</span>
            </div>

            <div className="flex items-center gap-1 bg-prizm-surface border border-prizm-border rounded p-1 text-[9px] font-mono">
              <span className="text-prizm-text-muted uppercase">Tol:</span>
              <input
                type="number"
                value={verifyTolerance}
                onChange={e => setVerifyTolerance(Number(e.target.value))}
                className="w-10 bg-transparent text-prizm-text font-bold text-center focus:outline-none"
              />
              <span className="text-prizm-text-muted">%</span>
            </div>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-2.5 py-1 text-[10px] font-mono uppercase bg-prizm-surface border border-prizm-border hover:bg-prizm-surface-strong text-prizm-text rounded transition-all cursor-pointer flex items-center gap-1"
            >
              <Download size={11} />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleExportJSON}
              className="px-2.5 py-1 text-[10px] font-mono uppercase bg-prizm-surface border border-prizm-border hover:bg-prizm-surface-strong text-prizm-text rounded transition-all cursor-pointer flex items-center gap-1"
            >
              <Download size={11} />
              JSON
            </button>
            <button
              type="button"
              onClick={() => {
                const mockRun = {
                  runId: "live-snapshot-" + Date.now(),
                  timestamp: new Date().toISOString(),
                  fanSpeedPercent: fanSpeedPercent,
                  durationSeconds: getSelectedDuration(),
                  operator: "PRIZM Dashboard Operator",
                  targetsCount: filteredVerification.length,
                  state: "ACTIVE SNAPSHOT",
                  verificationResults: filteredVerification
                };
                handleExportPDF(mockRun);
              }}
              className="px-2.5 py-1 text-[10px] font-mono uppercase bg-prizm-surface border border-prizm-border hover:bg-prizm-surface-strong text-prizm-text rounded transition-all cursor-pointer flex items-center gap-1"
            >
              <Download size={11} />
              PDF Report
            </button>
          </div>
        </div>

        {/* 4. Verification Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-prizm-border border-b border-prizm-border text-center font-mono py-2.5 bg-prizm-surface-strong/20">
          <div className="py-1">
            <span className="block text-[9px] text-prizm-text-muted uppercase">Targets Active</span>
            <span className="text-base font-black text-prizm-text">{summaryCounts.total}</span>
          </div>
          <div className="py-1">
            <span className="block text-[9px] text-emerald-600 uppercase">Passing (Verified)</span>
            <span className="text-base font-black text-emerald-700">{summaryCounts.passing}</span>
          </div>
          <div className="py-1">
            <span className="block text-[9px] text-amber-600 uppercase">Warnings (Deviation)</span>
            <span className="text-base font-black text-amber-700">{summaryCounts.warning}</span>
          </div>
          <div className="py-1">
            <span className="block text-[9px] text-rose-600 uppercase">Failed (No Feedback)</span>
            <span className="text-base font-black text-rose-700">{summaryCounts.failed}</span>
          </div>
          <div className="py-1 col-span-2 sm:col-span-1">
            <span className="block text-[9px] text-prizm-text-muted uppercase">Unknown/No Telemetry</span>
            <span className="text-base font-black text-prizm-text-muted">{summaryCounts.unknown}</span>
          </div>
        </div>

        {/* 5. Filter & Search Bar */}
        <div className="bg-prizm-surface p-3 border-b border-prizm-border flex flex-col md:flex-row items-stretch md:items-center gap-3 font-mono text-xs">
          {/* Status filters */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "All", filter: "ALL" },
              { label: "Passing", filter: "PASS" },
              { label: "Warnings", filter: "WARN" },
              { label: "Failed", filter: "FAIL" },
              { label: "Unknown", filter: "UNKNOWN" }
            ].map((f) => (
              <button
                type="button"
                key={f.filter}
                onClick={() => setVerifyFilter(f.filter)}
                className={`px-2 py-1 border rounded text-[10px] uppercase transition-all cursor-pointer ${
                  verifyFilter === f.filter
                    ? "bg-prizm-primary/10 border-prizm-primary/40 text-prizm-primary font-bold shadow-xs"
                    : "bg-prizm-surface text-prizm-text-muted border-prizm-border hover:bg-prizm-surface-strong"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex-1 flex gap-2">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-prizm-text-muted" size={13} />
              <input
                type="text"
                placeholder="Search by Array, ES, String or result notes..."
                value={verifySearch}
                onChange={e => setVerifySearch(e.target.value)}
                className="w-full text-xs font-mono p-1.5 pl-8 rounded border border-prizm-border bg-prizm-surface text-prizm-text placeholder:text-prizm-text-muted/30 focus:outline-none focus:border-prizm-primary"
              />
            </div>
            {/* Require all running check */}
            <label className="flex items-center gap-1.5 select-none text-[10px] text-prizm-text-muted uppercase shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={verifyRequireAllRunning}
                onChange={e => setVerifyRequireAllRunning(e.target.checked)}
                className="rounded text-prizm-primary focus:ring-prizm-primary h-3.5 w-3.5"
              />
              Strict All Fans Running
            </label>
          </div>
        </div>

        {/* 6. Verification Results Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[10px] border-collapse">
            <thead className="bg-prizm-surface-strong/40 border-b border-prizm-border text-prizm-text-muted uppercase tracking-wider text-[9px]">
              <tr>
                <th className="p-2 border-r border-prizm-border/40 text-center w-12">Result</th>
                <th className="p-2 border-r border-prizm-border/40">Target Label</th>
                <th className="p-2 border-r border-prizm-border/40 text-center w-20">Commanded</th>
                <th className="p-2 border-r border-prizm-border/40 text-center w-20">Actual State</th>
                <th className="p-2 border-r border-prizm-border/40 text-center w-24">Actual RPM / Speed</th>
                <th className="p-2 border-r border-prizm-border/40 text-center w-36">Individual Fans</th>
                <th className="p-2 border-r border-prizm-border/40 text-center w-24">Telemetry Age</th>
                <th className="p-2">Diagnostic Notes & Tolerance Checks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-prizm-border">
              {filteredVerification.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-prizm-text-muted font-mono text-xs">
                    No matching fan command verification feedback rows available.
                  </td>
                </tr>
              ) : (
                filteredVerification.map((r, idx) => {
                  const resultConfig = {
                    PASS: { color: "bg-emerald-50 text-emerald-800 border-emerald-200", label: "PASS" },
                    WARN_ZERO_RPM: { color: "bg-amber-50 text-amber-800 border-amber-200", label: "WARN" },
                    WARN_UNDER_COMMAND: { color: "bg-amber-50 text-amber-800 border-amber-200", label: "WARN" },
                    WARN_OVER_COMMAND: { color: "bg-amber-50 text-amber-800 border-amber-200", label: "WARN" },
                    FAIL_NO_RESPONSE: { color: "bg-rose-50 text-rose-800 border-rose-200", label: "FAIL" },
                    FAIL_STALE_TELEMETRY: { color: "bg-rose-50 text-rose-800 border-rose-200", label: "FAIL" },
                    UNKNOWN_NO_TELEMETRY: { color: "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border", label: "UNKNOWN" }
                  }[r.result] || { color: "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border", label: "UNKNOWN" };

                  const ageSec = r.telemetryAgeMs !== null && r.telemetryAgeMs !== undefined
                    ? Math.round(r.telemetryAgeMs / 1000)
                    : null;

                  return (
                    <tr key={idx} className="hover:bg-prizm-surface-strong/20 transition-all">
                      <td className="p-2 border-r border-prizm-border/40 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${resultConfig.color}`}>
                          {resultConfig.label}
                        </span>
                      </td>
                      <td className="p-2 border-r border-prizm-border/40 font-bold text-prizm-text">
                        {r.controller.toUpperCase()} {r.label}
                      </td>
                      <td className="p-2 border-r border-prizm-border/40 text-center text-prizm-text">
                        {r.commandedSpeedPercent}% ({r.commandedState})
                      </td>
                      <td className="p-2 border-r border-prizm-border/40 text-center">
                        <span className={`px-1 rounded text-[9px] font-semibold ${
                          r.actualFanState === "ON" 
                            ? "bg-emerald-50 text-emerald-700" 
                            : r.actualFanState === "OFF" 
                              ? "bg-gray-100 text-gray-700" 
                              : "bg-yellow-50 text-yellow-700"
                        }`}>
                          {r.actualFanState || "UNKNOWN"}
                        </span>
                      </td>
                      <td className="p-2 border-r border-prizm-border/40 text-center font-bold text-prizm-text">
                        {r.actualFanSpeedPercent !== null && r.actualFanSpeedPercent !== undefined 
                          ? `${r.actualFanSpeedPercent}%` 
                          : "--"}
                        {r.actualFanRpm !== null && r.actualFanRpm !== undefined && (
                          <span className="text-[9px] font-normal text-prizm-text-muted block mt-0.5">
                            {r.actualFanRpm} RPM
                          </span>
                        )}
                      </td>
                      <td className="p-2 border-r border-prizm-border/40">
                        {Array.isArray(r.actualFanRpmByFan) && r.actualFanRpmByFan.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {r.actualFanRpmByFan.map((rpm: number, i: number) => {
                              const pct = Array.isArray(r.actualFanPercentByFan) && r.actualFanPercentByFan[i] !== undefined
                                ? `${r.actualFanPercentByFan[i]}%`
                                : "--";
                              return (
                                <div key={i} className="flex items-center justify-between gap-2 bg-prizm-surface-strong/40 border border-prizm-border/30 rounded px-1.5 py-0.5 text-[9px] font-mono leading-none">
                                  <span className="text-prizm-text-muted font-bold">F{i + 1}:</span>
                                  <span className="text-prizm-text font-semibold">{rpm} RPM / {pct}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-[9px] text-prizm-text-muted italic block text-center">
                            Individual fan telemetry unavailable
                          </span>
                        )}
                      </td>
                      <td className={`p-2 border-r border-prizm-border/40 text-center font-bold ${
                        ageSec !== null && ageSec > 60 ? "text-amber-600" : "text-prizm-text"
                      }`}>
                        {ageSec !== null ? `${ageSec}s ago` : "No feedback"}
                      </td>
                      <td className="p-2 text-prizm-text-muted text-[10px] leading-relaxed">
                        <div className="space-y-0.5">
                          {r.notes.map((note, nIdx) => (
                            <div key={nIdx} className="flex items-center gap-1.5">
                              <span className="inline-block w-1 h-1 rounded-full bg-prizm-primary shrink-0" />
                              <span>{note}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SAVED RUNS HISTORY SECTION */}
      <div className="bg-prizm-surface border border-prizm-border rounded-md shadow-sm overflow-hidden mt-4">
        <div className="bg-prizm-surface-strong px-4 py-3 border-b border-prizm-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={14} className="text-prizm-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-prizm-text">
              Saved Fan Speed Test Runs ({savedRuns.length})
            </span>
          </div>
          {savedRuns.length > 0 && (
            <button
              type="button"
              onClick={handleClearAllRuns}
              className="px-2.5 py-1 text-[9px] font-mono uppercase bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded transition-all cursor-pointer flex items-center gap-1"
            >
              <Trash2 size={11} />
              Clear All Runs
            </button>
          )}
        </div>

        <div className="divide-y divide-prizm-border max-h-[600px] overflow-y-auto no-scrollbar">
          {savedRuns.length === 0 ? (
            <div className="p-8 text-center text-prizm-text-muted font-mono text-xs">
              <History size={24} className="mx-auto text-prizm-border mb-2 stroke-[1.5]" />
              No saved fan test runs found in cache file.
            </div>
          ) : (
            savedRuns.map((run) => {
              const isExpanded = expandedRunId === run.runId;
              const timestampLocal = new Date(run.timestamp).toLocaleString();
              
              const statusClass = {
                COMPLETED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                STOPPED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                FAILED: "bg-rose-500/10 text-rose-400 border-rose-500/20"
              }[run.state] || "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border/40";

              return (
                <div key={run.runId} className="p-4 space-y-3 hover:bg-prizm-surface-strong/20 transition-all font-mono text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${statusClass}`}>
                          {run.state}
                        </span>
                        <span className="font-bold text-prizm-text text-[11px]">
                          Speed: {run.fanSpeedPercent}% | Duration: {run.durationSeconds}s | Targets: {run.targetsCount}
                        </span>
                      </div>
                      <div className="text-[10px] text-prizm-text-muted">
                        Executed: {timestampLocal} | Operator: {run.operator}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => setExpandedRunId(isExpanded ? null : run.runId)}
                        className="px-2 py-1 text-[10px] font-mono bg-prizm-surface border border-prizm-border hover:bg-prizm-surface-strong text-prizm-text rounded transition-all cursor-pointer flex items-center gap-1"
                      >
                        {isExpanded ? "Hide Details" : "Show Details"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportPDF(run)}
                        className="px-2 py-1 text-[10px] font-mono bg-prizm-surface border border-prizm-border hover:bg-prizm-surface-strong text-prizm-text rounded transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Download size={11} />
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(run, null, 2));
                          const link = document.createElement("a");
                          link.setAttribute("href", dataStr);
                          link.setAttribute("download", `fan_run_${run.runId}.json`);
                          link.click();
                        }}
                        className="px-2 py-1 text-[10px] font-mono bg-prizm-surface border border-prizm-border hover:bg-prizm-surface-strong text-prizm-text rounded transition-all cursor-pointer flex items-center gap-1"
                      >
                        JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRun(run.runId)}
                        className="p-1.5 text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-all cursor-pointer"
                        title="Delete Run"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail table */}
                  {isExpanded && (
                    <div className="border border-prizm-border/60 bg-prizm-surface-strong/20 rounded overflow-hidden mt-2">
                      <table className="w-full text-left text-[9px] border-collapse">
                        <thead className="bg-prizm-surface-strong/60 border-b border-prizm-border text-prizm-text-muted uppercase">
                          <tr>
                            <th className="p-1.5 text-center w-12">Result</th>
                            <th className="p-1.5">Target</th>
                            <th className="p-1.5 text-center w-16">Commanded</th>
                            <th className="p-1.5 text-center w-20">Actual Speed</th>
                            <th className="p-1.5">Diagnostic Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-prizm-border/40">
                          {(run.verificationResults || []).map((row: any, rIdx: number) => {
                            const badge = row.result === "PASS" 
                              ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" 
                              : row.result.startsWith("WARN") 
                                ? "text-amber-500 bg-amber-500/10 border-amber-500/20" 
                                : "text-rose-500 bg-rose-500/10 border-rose-500/20";
                            return (
                              <tr key={rIdx} className="hover:bg-prizm-surface-strong/40">
                                <td className="p-1.5 text-center">
                                  <span className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase border ${badge}`}>
                                    {row.result}
                                  </span>
                                </td>
                                <td className="p-1.5 font-bold text-prizm-text">
                                  {row.controller.toUpperCase()} {row.label}
                                </td>
                                <td className="p-1.5 text-center text-prizm-text">
                                  {row.commandedSpeedPercent}%
                                </td>
                                <td className="p-1.5 text-center font-bold text-prizm-text">
                                  {row.actualFanSpeedPercent !== null ? `${row.actualFanSpeedPercent}%` : "--"}
                                </td>
                                <td className="p-1.5 text-prizm-text-muted text-[8px]">
                                  {row.notes.join("; ")}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
