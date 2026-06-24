import React, { useState, useEffect, useCallback } from "react";
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
  History
} from "lucide-react";

interface Capabilities {
  turtleFanEndpointSupported: boolean;
  nativeDurationSupported: boolean;
  holdSchedulerSupported: boolean;
  controllers: string[];
  message: string;
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
}

interface TelemetryRow {
  arrayIndex: number;
  stringIndex: number;
  fanStatusPercent: number | null;
  fanStatusAvgRpm: number | null;
  lastFanCommand: string | null;
}

export default function StringFanCommandHold({ active = true }: { active?: boolean }) {
  // Config & Capabilities
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  
  // Active Holds list
  const [activeHolds, setActiveHolds] = useState<ActiveHold[]>([]);
  const [loadingHolds, setLoadingHolds] = useState(false);
  
  // Strings telemetry from `/api/local/strings`
  const [stringsTelemetry, setStringsTelemetry] = useState<TelemetryRow[]>([]);
  
  // Timer state to trigger 1-second ticks for countdowns
  const [now, setNow] = useState(Date.now());

  // Form State
  const [controller, setController] = useState<"ems" | "bms">("ems");
  const [arrayNumber, setArrayNumber] = useState(1);
  const [stringNumber, setStringNumber] = useState(1);
  const [fanSpeedPercent, setFanSpeedPercent] = useState(50);
  const [durationPreset, setDurationPreset] = useState<string>("300"); // '300' is 5 min, 'custom' for custom input
  const [customDuration, setCustomDuration] = useState(300);
  const [repeatIntervalSeconds, setRepeatIntervalSeconds] = useState(30);
  const [sendStopAtEnd, setSendStopAtEnd] = useState(true);
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  
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

  // Fetch active holds
  const fetchHolds = useCallback(async () => {
    setLoadingHolds(true);
    try {
      const res = await fetch("/api/local/fan-control/hold/status");
      const data = await res.json();
      if (data && Array.isArray(data.activeHolds)) {
        setActiveHolds(data.activeHolds);
      }
    } catch (err) {
      console.error("Failed to fetch active fan holds:", err);
    } finally {
      setLoadingHolds(false);
    }
  }, []);

  // Fetch strings telemetry for fan feedback
  const fetchStringsTelemetry = useCallback(async () => {
    try {
      const res = await fetch("/api/local/strings");
      const data = await res.json();
      if (data && Array.isArray(data.data)) {
        setStringsTelemetry(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch strings telemetry for fan feedback:", err);
    }
  }, []);

  // Initial load and fast polling loop
  useEffect(() => {
    if (!active) return;
    fetchHolds();
    fetchStringsTelemetry();

    // Poll holds and telemetry every 3 seconds
    const interval = setInterval(() => {
      fetchHolds();
      fetchStringsTelemetry();
    }, 3000);

    return () => clearInterval(interval);
  }, [active, fetchHolds, fetchStringsTelemetry]);

  // Fast countdown timer loop (runs every 1 second)
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);

  // Helper to resolve current duration value
  const getSelectedDuration = (): number => {
    if (durationPreset === "custom") {
      return customDuration;
    }
    return Number(durationPreset);
  };

  // Handle Deploy Trigger
  const handleStartHold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmationPhrase !== "HOLD FAN SPEED") return;

    setSubmitting(true);
    setActionResult(null);

    const duration = getSelectedDuration();

    try {
      const res = await fetch("/api/local/fan-control/hold/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controller,
          arrayNumber,
          stringNumber,
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
          message: data.message || `Fan hold successfully scheduled on Array ${arrayNumber} String ${stringNumber}!`,
          holdId: data.holdId,
          auditId: data.auditId
        });
        setConfirmationPhrase("");
        await fetchHolds();
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

  // Handle Stop Trigger
  const handleStopHold = async (holdId: string, sendStop: boolean) => {
    try {
      const res = await fetch("/api/local/fan-control/hold/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdId,
          sendStopCommand: sendStop,
          operator: "PRIZM Dashboard Operator"
        })
      });
      if (res.ok) {
        await fetchHolds();
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
      // Just send immediate stop 0% to the selected string as an overrides helper
      try {
        const res = await fetch("/api/local/fan-control/hold/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            controller,
            arrayNumber,
            stringNumber,
            sendStopCommand: true,
            operator: "EMERGENCY OVERRIDE 0%"
          })
        });
        const data = await res.json();
        alert(`Dispatched single manual stop command (fanSpeed: 0%) directly to Array ${arrayNumber} String ${stringNumber}.`);
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
    await fetchHolds();
  };

  // Helper to find observed telemetry for an array and string indices
  const getObservedTelemetry = (arr: number, str: number) => {
    const row = stringsTelemetry.find((t) => t.arrayIndex === arr && t.stringIndex === str);
    if (!row) return null;
    return {
      statusPercent: row.fanStatusPercent,
      avgRpm: row.fanStatusAvgRpm,
      lastCommand: row.lastFanCommand
    };
  };

  return (
    <div className="space-y-4">
      {/* 1. Header & Configuration Status */}
      <div className="bg-prizm-surface p-4 rounded-md border border-prizm-border flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-prizm-text uppercase font-sans">
            String Fan Command Hold Tool
          </h2>
          <p className="text-[11px] text-prizm-text-muted font-mono mt-0.5">
            Command rack extraction/stack fan speeds for an exact duration and safely bypass slower telemetry polling.
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
            This tool will repeatedly command the selected string fans to the target speed until the selected duration expires or the hold is manually stopped. 
            Ensure cell temperatures and rack pressure locks are verified before forcing custom fan duty cycles.
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
                    className={`p-1.5 font-mono text-xs uppercase rounded border transition-all ${
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
                    className={`p-1.5 font-mono text-xs uppercase rounded border transition-all ${
                      controller === "bms"
                        ? "bg-prizm-primary/10 text-prizm-primary-strong border-prizm-primary/30 font-bold"
                        : "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border hover:bg-prizm-border/40"
                    }`}
                  >
                    BMS Controller
                  </button>
                </div>
              </div>

              {/* Grid Array & String selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-prizm-text-muted mb-1">
                    Array Number
                  </label>
                  <select
                    value={arrayNumber}
                    onChange={(e) => setArrayNumber(Number(e.target.value))}
                    className="w-full text-xs font-mono p-1.5 rounded border border-prizm-border bg-prizm-surface text-prizm-text focus:outline-none focus:border-prizm-primary"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((arr) => (
                      <option key={arr} value={arr}>
                        A{arr} (Array {arr})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-prizm-text-muted mb-1">
                    String Number
                  </label>
                  <select
                    value={stringNumber}
                    onChange={(e) => setStringNumber(Number(e.target.value))}
                    className="w-full text-xs font-mono p-1.5 rounded border border-prizm-border bg-prizm-surface text-prizm-text focus:outline-none focus:border-prizm-primary"
                  >
                    {Array.from({ length: 40 }, (_, i) => i + 1).map((str) => (
                      <option key={str} value={str}>
                        S{str} (String {str})
                      </option>
                    ))}
                  </select>
                </div>
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
                      className={`p-1.5 font-mono text-[10px] rounded border transition-all ${
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
                    className={`col-span-3 p-1.5 font-mono text-[10px] rounded border transition-all ${
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
                  <option value={5}>Every 5 Seconds (Extremely Slower Polling Bypass)</option>
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
                <label className="block text-[10px] font-mono uppercase tracking-wider text-prizm-danger font-bold mb-1">
                  Confirmation Authorization Phrase
                </label>
                <input
                  type="text"
                  placeholder='Type "HOLD FAN SPEED" to unlock'
                  value={confirmationPhrase}
                  onChange={(e) => setConfirmationPhrase(e.target.value)}
                  className="w-full text-xs font-mono p-2 rounded border border-prizm-border bg-prizm-surface text-prizm-text placeholder:text-prizm-text-muted/30 focus:outline-none focus:border-prizm-primary"
                />
              </div>

              {/* Trigger buttons */}
              <div className="space-y-2 pt-1.5">
                <button
                  type="submit"
                  disabled={confirmationPhrase !== "HOLD FAN SPEED" || submitting}
                  className={`w-full font-mono text-xs font-extrabold py-2 px-4 rounded transition-all flex items-center justify-center gap-2 border uppercase cursor-pointer ${
                    confirmationPhrase === "HOLD FAN SPEED" && !submitting
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
                      Start Fan Speed Hold
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
                Active Hold Loops ({activeHolds.filter(h => h.state === "RUNNING").length})
              </span>
              <button
                type="button"
                onClick={fetchHolds}
                disabled={loadingHolds}
                className="p-1 rounded hover:bg-prizm-border/40 text-prizm-text-muted hover:text-prizm-text transition-all"
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
                  const telemetry = getObservedTelemetry(hold.arrayNumber, hold.stringNumber);
                  
                  // Calculate remaining seconds
                  const expiresTime = new Date(hold.expiresAt).getTime();
                  const remainingSec = Math.max(0, Math.round((expiresTime - now) / 1000));
                  
                  // Calculate next tick seconds
                  let nextTickSec = 0;
                  if (hold.nextCommandAt) {
                    nextTickSec = Math.max(0, Math.round((new Date(hold.nextCommandAt).getTime() - now) / 1000));
                  }

                  // Progress percent
                  const durationTotal = Math.round((expiresTime - new Date(hold.startedAt).getTime()) / 1000);
                  const progressPct = durationTotal > 0 ? Math.min(100, Math.max(0, ((durationTotal - remainingSec) / durationTotal) * 100)) : 100;

                  return (
                    <div key={hold.holdId} className="p-4 space-y-3 hover:bg-prizm-surface-strong/30 transition-all">
                      {/* Title & Badge */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-xs font-bold text-prizm-text bg-prizm-surface-strong px-2 py-0.5 rounded border border-prizm-border/40">
                            {hold.controller.toUpperCase()} RACK A{hold.arrayNumber}-S{hold.stringNumber}
                          </span>
                          <span className="text-[9px] text-prizm-text-muted uppercase">ID: {hold.holdId.substring(0, 8)}</span>
                        </div>
                        <span className={`text-[9px] uppercase font-mono px-2 py-0.5 rounded border font-extrabold ${
                          hold.state === "RUNNING"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse"
                            : hold.state === "FAILED"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border"
                        }`}>
                          {hold.state}
                        </span>
                      </div>

                      {/* Speed Metrics Grid */}
                      <div className="grid grid-cols-2 gap-3 bg-prizm-surface border border-prizm-border/40 p-2.5 rounded">
                        <div className="space-y-1">
                          <div className="text-[9px] font-mono uppercase text-prizm-text-muted flex items-center gap-1">
                            <Gauge size={11} className="text-prizm-primary" />
                            Command Target
                          </div>
                          <div className="font-mono text-sm font-black text-prizm-text">
                            {hold.fanSpeedPercent}% <span className="text-[9px] font-normal text-prizm-text-muted">duty</span>
                          </div>
                        </div>

                        <div className="space-y-1 border-l border-prizm-border/40 pl-3">
                          <div className="text-[9px] font-mono uppercase text-prizm-text-muted flex items-center gap-1">
                            <Activity size={11} className="text-prizm-info" />
                            Observed Telemetry
                          </div>
                          <div className="font-mono text-sm font-black text-prizm-text">
                            {telemetry ? (
                              <>
                                {telemetry.statusPercent !== null ? `${telemetry.statusPercent}%` : "0%"}
                                {telemetry.avgRpm !== null && (
                                  <span className="text-[9px] font-bold text-prizm-info ml-1.5">
                                    ({telemetry.avgRpm} RPM)
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-[9px] font-normal text-amber-600 block leading-tight">
                                Telemetry not available from current source.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Countdown & Next Command Row */}
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
                          {/* Duration Progress bar */}
                          <div className="w-full bg-prizm-surface-strong h-1.5 rounded-full overflow-hidden border border-prizm-border/30">
                            <div
                              className="bg-prizm-primary h-full transition-all duration-1000"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Stats & Command Status */}
                      <div className="grid grid-cols-3 gap-2 font-mono text-[9px] text-prizm-text-muted">
                        <div>
                          <span className="font-semibold text-prizm-text">Pulses Sent:</span> {hold.commandCount}
                        </div>
                        <div>
                          <span className="font-semibold text-prizm-text">Errors:</span> {hold.errorCount}
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-prizm-text">Last HTTP:</span>{" "}
                          <span className={hold.lastCommandOk ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                            {hold.lastCommandStatus ? `${hold.lastCommandStatus}` : "--"}
                          </span>
                        </div>
                      </div>

                      {hold.lastCommandResponse && (
                        <div className="p-1.5 bg-prizm-surface-strong border border-prizm-border/30 rounded font-mono text-[8px] text-prizm-text-muted overflow-x-auto whitespace-pre truncate">
                          Response: {hold.lastCommandResponse}
                        </div>
                      )}

                      {/* Row Action Trigger */}
                      {hold.state === "RUNNING" && (
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleStopHold(hold.holdId, false)}
                            className="px-2 py-1 font-mono text-[9px] uppercase border border-prizm-border bg-prizm-surface text-prizm-text hover:bg-prizm-surface-strong rounded cursor-pointer"
                          >
                            Stop Loop Only
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStopHold(hold.holdId, true)}
                            className="px-2.5 py-1 font-mono text-[9px] uppercase bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 font-bold rounded flex items-center gap-1 cursor-pointer"
                          >
                            <StopCircle size={10} />
                            Stop & Reset Fans to 0%
                          </button>
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
    </div>
  );
}
