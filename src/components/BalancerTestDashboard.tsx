import React, { useState, useEffect, useCallback } from "react";
import {
  Gauge,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Activity,
  Sliders,
  FileText,
  AlertOctagon,
  TrendingUp,
  Clock,
  MapPin,
  ChevronRight,
  Info,
  Calendar,
  Layers,
  ArrowRight
} from "lucide-react";
import { BalancerTestStatus, BalancerTestAnalysis, BalancerTestResultRow } from "../server/balancerTest/balancerTestTypes";

interface BalancerTestDashboardProps {
  active: boolean;
}

export default function BalancerTestDashboard({ active }: BalancerTestDashboardProps) {
  const [statuses, setStatuses] = useState<BalancerTestStatus[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [analysis, setAnalysis] = useState<BalancerTestAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [searchWarningText, setSearchWarningText] = useState("");
  const [lastPolled, setLastPolled] = useState<string | null>(null);

  // Deployment form & capabilities state
  const [capabilities, setCapabilities] = useState<{
    statusSupported: boolean;
    analysisSupported: boolean;
    deploySupported: boolean;
    deployEndpointConfigured: boolean;
    message: string;
  } | null>(null);
  const [deployBlock, setDeployBlock] = useState(1);
  const [deployArrays, setDeployArrays] = useState<number[]>([]);
  const [deployDirection, setDeployDirection] = useState<"charge" | "discharge">("charge");
  const [deployTotalCellGroups, setDeployTotalCellGroups] = useState(30);
  const [deployConfirmation, setDeployConfirmation] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<{
    accepted: boolean;
    supportedLocally: boolean;
    testId?: number | null;
    message: string;
    auditId: string;
  } | null>(null);

  // Load capabilities on mount
  useEffect(() => {
    fetch("/api/local/balancer-test/capabilities")
      .then((res) => res.json())
      .then((data) => setCapabilities(data))
      .catch((err) => console.error("Failed to fetch balancer capabilities:", err));
  }, []);

  // Load active statuses
  const fetchStatuses = useCallback(async (refresh = false) => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const res = await fetch(`/api/local/balancer-test/status?refresh=${refresh}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setStatuses(data);
      setLastPolled(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error("Failed to fetch balancer statuses:", err);
      setStatusError(err.message || "Failed to load active balancer test status from EMS.");
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // Poll active statuses while tab is active - 2 seconds if active runs, 5 seconds otherwise
  useEffect(() => {
    if (!active) return;
    fetchStatuses();
    const hasActiveRuns = statuses.some(s => s.state === "RUNNING" || s.state === "PENDING");
    const intervalTime = hasActiveRuns ? 2000 : 5000;
    const interval = setInterval(() => {
      fetchStatuses();
    }, intervalTime);
    return () => clearInterval(interval);
  }, [active, fetchStatuses, statuses]);

  // Handle deploying a new balancer test
  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capabilities?.deploySupported) return;
    if (deployArrays.length === 0) return;
    if (deployConfirmation !== "START BALANCER TEST") return;

    setDeploying(true);
    setDeployResult(null);

    try {
      const res = await fetch("/api/local/balancer-test/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          block: deployBlock,
          arrays: deployArrays,
          direction: deployDirection,
          totalCellGroups: deployTotalCellGroups,
          confirmationToken: deployConfirmation,
          operator: "PRIZM Dashboard Operator"
        })
      });

      const data = await res.json();
      setDeployResult(data);

      if (data.accepted) {
        if (data.testId) {
          setSelectedIds((prev) => [...new Set([...prev, data.testId])]);
        }
        await fetchStatuses(true);
        setDeployConfirmation("");
      }
    } catch (err: any) {
      console.error("Failed to deploy balancer test:", err);
      setDeployResult({
        accepted: false,
        supportedLocally: true,
        message: err.message || "Failed to trigger balancer test deployment",
        auditId: "local-error-" + Date.now()
      });
    } finally {
      setDeploying(false);
    }
  };

  // Load analysis for selected test IDs
  const runAnalysis = async (testIds: number[]) => {
    if (testIds.length === 0) return;
    setLoadingAnalysis(true);
    setAnalysisError(null);
    try {
      const res = await fetch(`/api/local/balancer-test/analysis?testIds=${testIds.join(",")}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setAnalysis(data);
    } catch (err: any) {
      console.error("Failed to run analysis:", err);
      setAnalysisError(err.message || "Failed to analyze completed balancer tests.");
      setAnalysis(null);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const toggleSelectTest = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === statuses.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(statuses.map(s => s.id).filter(id => id !== -1));
    }
  };

  const handleAnalyzeSelected = () => {
    if (selectedIds.length === 0) return;
    runAnalysis(selectedIds);
  };

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null || isNaN(seconds)) return "--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Filter warnings based on text
  const filteredWarningRows = analysis?.warningRows.filter(row => {
    if (!searchWarningText) return true;
    const txt = searchWarningText.toLowerCase();
    const keyMatch = row.cellGroupKey?.toLowerCase().includes(txt);
    const msgMatch = row.warningTriggerMessage?.toLowerCase().includes(txt);
    const timeMatch = row.warningTriggeredTime?.toLowerCase().includes(txt);
    const esMatch = `es${row.energySegmentNumber}`.includes(txt) || `s${row.stringNumber}`.includes(txt);
    return keyMatch || msgMatch || timeMatch || esMatch;
  }) || [];

  return (
    <div className="space-y-6">
      {/* 1. Header Information Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border border-prizm-border bg-prizm-surface p-4 rounded-md gap-4 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-prizm-info/10 text-prizm-primary rounded-md">
            <Gauge size={22} />
          </div>
          <div>
            <h1 className="text-sm font-bold uppercase tracking-wider text-prizm-text">
              BPC Balance Circuit Tests
            </h1>
            <p className="text-xs text-prizm-text-muted mt-0.5">
              Live field technician dashboard for monitoring active balancer runs and analyzing completed cell-balancing sweeps.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 self-stretch md:self-auto font-mono">
          <span className="text-[10px] text-prizm-text-muted uppercase">
            {lastPolled ? `Polled: ${lastPolled}` : "Loading..."}
          </span>
          <button
            onClick={() => fetchStatuses(true)}
            disabled={loadingStatus}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-prizm-border bg-prizm-surface-strong hover:bg-prizm-border text-prizm-primary text-[10px] uppercase font-bold tracking-widest transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={11} className={loadingStatus ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Deploy New Balance Test Card */}
      <div className="border border-amber-500/30 bg-prizm-surface rounded-md shadow-sm overflow-hidden">
        <div className="bg-amber-500/5 px-4 py-3 border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders size={14} className="text-amber-500" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-prizm-text">
              Deploy New Balance Circuit Test
            </span>
          </div>
          {capabilities && (
            <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${
              capabilities.deploySupported 
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
            }`}>
              {capabilities.deploySupported ? "Deployment Active" : "Deployment Locked"}
            </span>
          )}
        </div>

        <div className="p-4 space-y-4">
          {/* Warn message if unconfigured or generic */}
          {capabilities && !capabilities.deploySupported && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-md flex items-start gap-2.5 text-rose-400 font-mono text-xs">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">DEPLOYMENT LOCKED:</span> {capabilities.message}
              </div>
            </div>
          )}

          {capabilities && capabilities.deploySupported && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md flex items-start gap-2.5 text-amber-500 font-mono text-xs">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">CRITICAL WARNING:</span> Initiating a balance circuit test starts high-power grid balancing operations. Ensure block parameters, safety locks, and targeted arrays are fully verified before proceeding.
              </div>
            </div>
          )}

          <form onSubmit={handleDeploy} className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Column 1: Block & Direction & Total Cell Groups (Left side) */}
            <div className="md:col-span-4 space-y-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-prizm-text-muted mb-1">
                  Target Block (Read-only)
                </label>
                <input
                  type="number"
                  value={deployBlock}
                  disabled
                  className="w-full font-mono text-xs p-2 rounded border border-prizm-border bg-prizm-surface-strong text-prizm-text-muted cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-prizm-text mb-1">
                  Test Direction
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!capabilities?.deploySupported || deploying}
                    onClick={() => setDeployDirection("charge")}
                    className={`p-2 rounded border font-mono text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                      deployDirection === "charge"
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                        : "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border hover:border-prizm-primary/40"
                    }`}
                  >
                    Charge
                  </button>
                  <button
                    type="button"
                    disabled={!capabilities?.deploySupported || deploying}
                    onClick={() => setDeployDirection("discharge")}
                    className={`p-2 rounded border font-mono text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                      deployDirection === "discharge"
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                        : "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border hover:border-prizm-primary/40"
                    }`}
                  >
                    Discharge
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-prizm-text mb-1">
                  Total Cell Groups (Advanced)
                </label>
                <input
                  type="number"
                  value={deployTotalCellGroups}
                  disabled={!capabilities?.deploySupported || deploying}
                  onChange={(e) => setDeployTotalCellGroups(Math.max(1, Number(e.target.value)))}
                  className="w-full font-mono text-xs p-2 rounded border border-prizm-border bg-prizm-surface text-prizm-text focus:outline-none focus:border-prizm-primary"
                />
              </div>
            </div>

            {/* Column 2: Arrays Targeted (Center side) */}
            <div className="md:col-span-5 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-mono text-[10px] uppercase tracking-wider text-prizm-text">
                    Target Arrays (Select at least one)
                  </label>
                  <span className="font-mono text-[10px] text-prizm-primary font-bold">
                    {deployArrays.length} selected
                  </span>
                </div>

                {/* Grid of Array Checkboxes */}
                <div className="grid grid-cols-4 gap-1.5 border border-prizm-border p-2 bg-prizm-surface-strong rounded">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((arr) => {
                    const isChecked = deployArrays.includes(arr);
                    return (
                      <button
                        type="button"
                        key={arr}
                        disabled={!capabilities?.deploySupported || deploying}
                        onClick={() => {
                          setDeployArrays(prev =>
                            prev.includes(arr)
                              ? prev.filter(x => x !== arr)
                              : [...prev, arr].sort()
                          );
                        }}
                        className={`p-1.5 rounded font-mono text-xs border transition-all text-center ${
                          isChecked
                            ? "bg-prizm-primary/25 text-prizm-primary border-prizm-primary"
                            : "bg-prizm-surface text-prizm-text-muted border-prizm-border hover:border-prizm-text-muted"
                        }`}
                      >
                        A{arr}
                      </button>
                    );
                  })}
                </div>

                {/* Quick actions row */}
                <div className="grid grid-cols-4 gap-1 mt-1.5">
                  <button
                    type="button"
                    disabled={!capabilities?.deploySupported || deploying}
                    onClick={() => setDeployArrays([1, 2, 3, 4, 5, 6, 7, 8])}
                    className="p-1 rounded font-mono text-[9px] uppercase tracking-wider bg-prizm-surface border border-prizm-border hover:bg-prizm-border text-prizm-text cursor-pointer"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    disabled={!capabilities?.deploySupported || deploying}
                    onClick={() => setDeployArrays([1, 3, 5, 7])}
                    className="p-1 rounded font-mono text-[9px] uppercase tracking-wider bg-prizm-surface border border-prizm-border hover:bg-prizm-border text-prizm-text cursor-pointer"
                  >
                    Odd
                  </button>
                  <button
                    type="button"
                    disabled={!capabilities?.deploySupported || deploying}
                    onClick={() => setDeployArrays([2, 4, 6, 8])}
                    className="p-1 rounded font-mono text-[9px] uppercase tracking-wider bg-prizm-surface border border-prizm-border hover:bg-prizm-border text-prizm-text cursor-pointer"
                  >
                    Even
                  </button>
                  <button
                    type="button"
                    disabled={!capabilities?.deploySupported || deploying}
                    onClick={() => setDeployArrays([])}
                    className="p-1 rounded font-mono text-[9px] uppercase tracking-wider bg-prizm-surface border border-prizm-border hover:bg-prizm-border text-rose-400 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* Column 3: Confirmation and Submit (Right side) */}
            <div className="md:col-span-3 space-y-3 flex flex-col justify-between">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-prizm-text mb-1">
                  Phrase Authorization
                </label>
                <input
                  type="text"
                  placeholder='Type "START BALANCER TEST"'
                  value={deployConfirmation}
                  disabled={!capabilities?.deploySupported || deploying}
                  onChange={(e) => setDeployConfirmation(e.target.value)}
                  className="w-full font-mono text-xs p-2 rounded border border-prizm-border bg-prizm-surface text-prizm-text focus:outline-none focus:border-amber-500 placeholder:text-prizm-text-muted/50"
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={
                    !capabilities?.deploySupported ||
                    deployArrays.length === 0 ||
                    deployConfirmation !== "START BALANCER TEST" ||
                    deploying
                  }
                  className={`w-full font-mono text-xs py-2.5 px-4 uppercase font-bold tracking-wider rounded transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                    deploying
                      ? "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border cursor-wait"
                      : deployArrays.length > 0 && deployConfirmation === "START BALANCER TEST" && capabilities?.deploySupported
                        ? "bg-amber-500 text-black font-black hover:bg-amber-600 border-amber-500 hover:border-amber-600 shadow-md"
                        : "bg-prizm-surface-strong text-prizm-text-muted border-prizm-border opacity-50 cursor-not-allowed"
                  }`}
                >
                  {deploying ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Deploying...
                    </>
                  ) : (
                    <>
                      <Sliders size={12} />
                      Deploy Test
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Deploy Result Banner */}
          {deployResult && (
            <div className={`p-4 border rounded-md font-mono text-xs space-y-2 ${
              deployResult.accepted
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-rose-500/10 border-rose-500/30 text-rose-400"
            }`}>
              <div className="flex items-start gap-2">
                {deployResult.accepted ? (
                  <CheckCircle size={15} className="shrink-0 mt-0.5" />
                ) : (
                  <AlertOctagon size={15} className="shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold uppercase tracking-wider text-sm">
                    {deployResult.accepted ? "Deployment Accepted" : "Deployment Rejected / Failed"}
                  </div>
                  <div className="mt-1">{deployResult.message}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[10px] pt-2 border-t border-prizm-border/40 text-prizm-text-muted">
                <div>
                  <span className="font-semibold uppercase text-prizm-text">Audit ID:</span> {deployResult.auditId}
                </div>
                {deployResult.testId && (
                  <div>
                    <span className="font-semibold uppercase text-prizm-text">Assigned Test ID:</span> {deployResult.testId}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Active / Recent Tests Table */}
      <div className="border border-prizm-border bg-prizm-surface rounded-md shadow-sm overflow-hidden">
        <div className="bg-prizm-surface-strong px-4 py-3 border-b border-prizm-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-prizm-primary" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-prizm-text">
              Recent Balancer Run Statuses
            </span>
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <button
                onClick={handleAnalyzeSelected}
                disabled={loadingAnalysis}
                className="flex items-center gap-1.5 px-3 py-1 bg-prizm-primary hover:bg-prizm-primary/90 text-white font-mono text-[10px] uppercase font-black tracking-wider rounded transition-all cursor-pointer shadow-sm"
              >
                {loadingAnalysis ? "Analyzing..." : `Analyze Selected (${selectedIds.length})`}
                <ArrowRight size={10} />
              </button>
            )}
          </div>
        </div>

        {statusError && (
          <div className="p-4 bg-prizm-danger/10 border-b border-prizm-border flex items-start gap-2 text-prizm-danger text-xs font-mono">
            <AlertOctagon size={14} className="mt-0.5" />
            <div>
              <span className="font-bold">STATUS SYNC ERROR:</span> {statusError}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="bg-prizm-bg border-b border-prizm-border text-prizm-text-muted text-[10px] uppercase tracking-wider">
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={statuses.length > 0 && selectedIds.length === statuses.length}
                    onChange={handleSelectAll}
                    className="rounded border-prizm-border cursor-pointer"
                  />
                </th>
                <th className="p-3 w-16">ID</th>
                <th className="p-3 w-28">Block</th>
                <th className="p-3">Arrays Targeted</th>
                <th className="p-3 w-24">Direction</th>
                <th className="p-3 w-28">State</th>
                <th className="p-3 w-40">Progress</th>
                <th className="p-3">Latest Event / Status Message</th>
                <th className="p-3 w-24 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-prizm-border">
              {statuses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-prizm-text-muted italic">
                    {loadingStatus ? "Querying active cell balancer status..." : "No active or recent balancer runs detected on site."}
                  </td>
                </tr>
              ) : (
                statuses.map(s => {
                  const isSelected = selectedIds.includes(s.id);
                  let stateBadge = "bg-neutral-500/10 text-neutral-400 border border-neutral-500/20";
                  if (s.state === "RUNNING") stateBadge = "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse";
                  else if (s.state === "FINISHED") stateBadge = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                  else if (s.state === "FAILED") stateBadge = "bg-rose-500/10 text-rose-400 border border-rose-500/20 font-black";

                  const dirBadge = s.direction?.toLowerCase() === "charge" 
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                    : s.direction?.toLowerCase() === "discharge" 
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      : "bg-neutral-500/10 text-neutral-400";

                  return (
                    <tr key={s.id} className={`hover:bg-black/5 transition-colors ${isSelected ? "bg-prizm-info/5" : ""}`}>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={s.id === -1}
                          onChange={() => toggleSelectTest(s.id)}
                          className="rounded border-prizm-border cursor-pointer"
                        />
                      </td>
                      <td className="p-3 font-bold text-prizm-text">{s.id === -1 ? "--" : s.id}</td>
                      <td className="p-3">
                        {s.block ? (
                          <span className="flex items-center gap-1.5 text-prizm-text">
                            <MapPin size={10} className="text-prizm-text-muted" />
                            Block {s.block}
                          </span>
                        ) : (
                          <span className="text-prizm-text-muted italic">All Blocks</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {s.arrays.length > 0 ? (
                            s.arrays.map(arr => (
                              <span key={arr} className="px-1.5 py-0.5 bg-prizm-bg rounded border border-prizm-border text-[10px] text-prizm-text font-bold">
                                Array {arr}
                              </span>
                            ))
                          ) : (
                            <span className="text-prizm-text-muted italic">Block-Level Test</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${dirBadge}`}>
                          {s.direction}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${stateBadge}`}>
                          {s.state}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-prizm-bg h-2 rounded overflow-hidden border border-prizm-border">
                            <div 
                              className={`h-full rounded-r transition-all duration-500 ${s.state === 'FAILED' ? 'bg-prizm-danger' : s.state === 'FINISHED' ? 'bg-emerald-500' : 'bg-prizm-primary'}`} 
                              style={{ width: `${s.progress}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-prizm-text min-w-[30px] text-right">{s.progress}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-prizm-text truncate max-w-[280px]" title={s.statusMessage}>
                        {s.statusMessage || <span className="text-prizm-text-muted italic">No status events yet.</span>}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            setSelectedIds([s.id]);
                            runAnalysis([s.id]);
                          }}
                          disabled={s.id === -1 || loadingAnalysis}
                          className={`px-2 py-1 border rounded text-[10px] uppercase font-bold tracking-wider transition-all cursor-pointer ${
                            s.state === "FINISHED"
                              ? "bg-emerald-500 border-emerald-600 text-black hover:bg-emerald-600 hover:border-emerald-700 animate-pulse"
                              : "border-prizm-border hover:border-prizm-primary bg-prizm-surface-strong text-prizm-primary hover:bg-prizm-primary hover:text-white"
                          }`}
                        >
                          Analyze
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Analysis Dashboard Rendering */}
      {loadingAnalysis && (
        <div className="border border-prizm-border bg-prizm-surface p-12 rounded-md flex flex-col items-center justify-center space-y-4 shadow-sm font-mono">
          <RefreshCw size={28} className="animate-spin text-prizm-primary" />
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-prizm-text block">Loading completed test results...</span>
            <p className="text-[11px] text-prizm-text-muted mt-1">Retrieving CSV reports and assembling duration metrics</p>
          </div>
        </div>
      )}

      {analysisError && (
        <div className="border border-prizm-danger bg-prizm-danger/5 p-6 rounded-md flex items-start gap-3 shadow-sm font-mono">
          <AlertOctagon size={18} className="text-prizm-danger mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-prizm-danger uppercase tracking-wide">Analysis Engine Failure</h4>
            <p className="text-xs text-prizm-text mt-1">
              Could not compute balancing metrics for selected test runs:
            </p>
            <p className="text-xs text-prizm-danger font-bold mt-2 bg-prizm-bg p-2 rounded border border-prizm-danger/20">
              {analysisError}
            </p>
          </div>
        </div>
      )}

      {analysis && !loadingAnalysis && (
        <div className="space-y-6 animate-fade-in">
          {/* Metadata source block */}
          <div className="border border-prizm-border bg-prizm-surface-strong p-3 px-4 rounded-md flex flex-col sm:flex-row items-start sm:items-center justify-between font-mono text-[10px] text-prizm-text-muted gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5"><Calendar size={11} /> FETCHED AT: <span className="font-bold text-prizm-text">{new Date(analysis.source.fetchedAt).toLocaleString()}</span></span>
              <span>•</span>
              <span className="flex items-center gap-1.5"><Layers size={11} /> TARGET TESTS: <span className="font-bold text-prizm-primary">ID {analysis.source.testIds.join(", ")}</span></span>
            </div>
            <div className="truncate max-w-[350px]" title={analysis.source.endpointBase}>
              API SOURCE: <span className="font-bold text-prizm-text">{analysis.source.endpointBase}</span>
            </div>
          </div>

          {/* Partial Errors Warnings if any (e.g. some files missing or connection issues) */}
          {(analysis as any).partialErrors && (analysis as any).partialErrors.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-md flex items-start gap-2.5 font-mono text-xs text-amber-500">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <div>
                <span className="font-bold uppercase tracking-wider">Partial Analysis Warning:</span> Some report files were unreachable. The computations below are partial.
                <ul className="list-disc list-inside mt-2 space-y-1 text-[11px] text-prizm-text">
                  {(analysis as any).partialErrors.map((errStr: string, idx: number) => (
                    <li key={idx} className="truncate">{errStr}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Metric Grid Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border border-prizm-border bg-prizm-surface p-4 rounded-md shadow-sm font-mono">
              <span className="text-[10px] text-prizm-text-muted uppercase tracking-wider font-bold block">Total Cell Groups</span>
              <div className="text-2xl font-bold text-prizm-text mt-1 flex items-baseline gap-1.5">
                {analysis.summary.totalCellGroups}
                <span className="text-[10px] text-prizm-text-muted font-normal">circuits</span>
              </div>
            </div>

            <div className="border border-prizm-border bg-prizm-surface p-4 rounded-md shadow-sm font-mono">
              <span className="text-[10px] text-prizm-text-muted uppercase tracking-wider font-bold block">Confirmed Balances</span>
              <div className="text-2xl font-bold text-emerald-500 mt-1 flex items-baseline gap-1.5">
                {analysis.summary.confirmedBalances}
                <span className="text-[10px] text-prizm-text-muted font-normal">OK ({analysis.summary.totalCellGroups > 0 ? Math.round(analysis.summary.confirmedBalances * 100 / analysis.summary.totalCellGroups) : 0}%)</span>
              </div>
            </div>

            <div className="border border-prizm-border bg-prizm-surface p-4 rounded-md shadow-sm font-mono">
              <span className="text-[10px] text-prizm-text-muted uppercase tracking-wider font-bold block">Warnings Detected</span>
              <div className={`text-2xl font-bold mt-1 flex items-baseline gap-1.5 ${analysis.summary.warningCount > 0 ? "text-prizm-danger" : "text-prizm-text-muted"}`}>
                {analysis.summary.warningCount}
                <span className="text-[10px] text-prizm-text-muted font-normal">flagged</span>
              </div>
            </div>

            <div className="border border-prizm-border bg-prizm-surface p-4 rounded-md shadow-sm font-mono">
              <span className="text-[10px] text-prizm-text-muted uppercase tracking-wider font-bold block">Balancing Duration Span</span>
              <div className="mt-1 flex flex-col justify-between text-[11px] gap-0.5">
                <div className="flex justify-between"><span>Min:</span> <span className="font-bold text-prizm-text">{formatDuration(analysis.summary.minDurationSec)}</span></div>
                <div className="flex justify-between"><span>Average:</span> <span className="font-bold text-prizm-text">{formatDuration(analysis.summary.avgDurationSec)}</span></div>
                <div className="flex justify-between"><span>95th Percentile:</span> <span className="font-bold text-prizm-primary font-black">{formatDuration(analysis.summary.p95DurationSec)}</span></div>
                <div className="flex justify-between"><span>Max:</span> <span className="font-bold text-prizm-text">{formatDuration(analysis.summary.maxDurationSec)}</span></div>
              </div>
            </div>
          </div>

          {/* Double Column Chart / Table Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Array Average Durations Chart/List */}
            <div className="border border-prizm-border bg-prizm-surface rounded-md shadow-sm overflow-hidden flex flex-col">
              <div className="bg-prizm-surface-strong px-4 py-3 border-b border-prizm-border flex items-center gap-2">
                <TrendingUp size={14} className="text-prizm-primary" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-prizm-text font-mono">
                  Average Balancer Duration Per Array
                </span>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-center space-y-4 font-mono text-xs">
                {analysis.arrayAverageDurations.length === 0 ? (
                  <span className="text-prizm-text-muted italic text-center py-4">No array statistics available.</span>
                ) : (
                  analysis.arrayAverageDurations.map(arrItem => {
                    const maxAvg = Math.max(...analysis.arrayAverageDurations.map(a => a.avgDurationSec));
                    const percentage = maxAvg > 0 ? (arrItem.avgDurationSec * 100) / maxAvg : 0;
                    return (
                      <div key={arrItem.array} className="space-y-1.5">
                        <div className="flex justify-between text-[11px] font-bold">
                          <span className="text-prizm-text">Array {arrItem.array}</span>
                          <span className="text-prizm-text-muted font-normal">{arrItem.count} circuits · avg {formatDuration(arrItem.avgDurationSec)}</span>
                        </div>
                        <div className="bg-prizm-bg h-2 rounded border border-prizm-border overflow-hidden">
                          <div className="h-full bg-prizm-primary rounded-r" style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* BPC Warning Summary */}
            <div className="border border-prizm-border bg-prizm-surface rounded-md shadow-sm overflow-hidden flex flex-col">
              <div className="bg-prizm-surface-strong px-4 py-3 border-b border-prizm-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-prizm-warning" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-prizm-text font-mono">
                    BPC Warning Hotspots
                  </span>
                </div>
                <span className="text-[10px] font-bold bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/20 px-2 py-0.5 rounded font-mono">
                  {analysis.bpcWarningSummary.length} Hotspots
                </span>
              </div>
              
              <div className="overflow-y-auto max-h-[280px] flex-1">
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead>
                    <tr className="bg-prizm-bg border-b border-prizm-border text-prizm-text-muted text-[10px] uppercase">
                      <th className="p-3">Physical Label (Block/Array/ES/Str)</th>
                      <th className="p-3 w-20 text-center">BPC</th>
                      <th className="p-3 w-24 text-center">Flags</th>
                      <th className="p-3 w-16 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-prizm-border">
                    {analysis.bpcWarningSummary.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-prizm-text-muted italic">
                          No BPC balancer hotspots detected. Excellent balancing alignment!
                        </td>
                      </tr>
                    ) : (
                      analysis.bpcWarningSummary.map((bpcItem, idx) => {
                        const esLabel = `A${bpcItem.array}/ES${bpcItem.energySegmentNumber}/S${bpcItem.stringNumber}`;
                        return (
                          <tr key={idx} className="hover:bg-black/5">
                            <td className="p-3 font-bold text-prizm-text flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 bg-prizm-bg rounded border border-prizm-border text-[10px]">
                                {esLabel}
                              </span>
                              <span className="text-[10px] text-prizm-text-muted font-normal font-sans">({bpcItem.label})</span>
                            </td>
                            <td className="p-3 text-center font-bold text-prizm-text">BPC {bpcItem.bpc}</td>
                            <td className="p-3 text-center">
                              <span className="px-2 py-0.5 bg-prizm-danger/15 text-prizm-danger border border-prizm-danger/20 rounded font-black text-[10px]">
                                {bpcItem.warningCount} Warnings
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => {
                                  // Navigate to the correct String Details tab if possible, by dispatching an event
                                  const navEvent = new CustomEvent('navigate-tab', {
                                    detail: "arrays-strings"
                                  });
                                  window.dispatchEvent(navEvent);
                                }}
                                className="text-prizm-primary hover:text-prizm-primary/80 transition-colors cursor-pointer"
                                title="Open String Details"
                              >
                                <ChevronRight size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Full Warning Rows Table */}
          <div className="border border-prizm-border bg-prizm-surface rounded-md shadow-sm overflow-hidden">
            <div className="bg-prizm-surface-strong px-4 py-3 border-b border-prizm-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sliders size={14} className="text-prizm-danger" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-prizm-text font-mono">
                  Detailed Warning Event Log
                </span>
              </div>
              
              <div className="w-full sm:w-64 font-mono">
                <input
                  type="text"
                  placeholder="Filter warning logs (e.g. ES3)..."
                  value={searchWarningText}
                  onChange={e => setSearchWarningText(e.target.value)}
                  className="w-full px-2.5 py-1 text-xs rounded border border-prizm-border bg-prizm-bg text-prizm-text placeholder-prizm-text-muted focus:outline-none focus:border-prizm-primary"
                />
              </div>
            </div>

            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-prizm-bg border-b border-prizm-border text-prizm-text-muted text-[10px] uppercase">
                    <th className="p-3">Block</th>
                    <th className="p-3 w-20">Array</th>
                    <th className="p-3 w-32">Segment / String</th>
                    <th className="p-3 w-16">BPC</th>
                    <th className="p-3 w-16">Cell</th>
                    <th className="p-3 w-24">Duration</th>
                    <th className="p-3">Warning Reason</th>
                    <th className="p-3 w-40">Trigger Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-prizm-border">
                  {filteredWarningRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-prizm-text-muted italic">
                        {searchWarningText ? "No warnings matched the filter." : "No warning events found in the selected test logs."}
                      </td>
                    </tr>
                  ) : (
                    filteredWarningRows.map((row, idx) => {
                      return (
                        <tr key={idx} className="hover:bg-black/5">
                          <td className="p-3 font-bold text-prizm-text">B{row.block}</td>
                          <td className="p-3">A{row.array}</td>
                          <td className="p-3">
                            <span className="font-bold text-prizm-text">ES{row.energySegmentNumber}</span>
                            <span className="text-prizm-text-muted text-[10px] ml-1">/ S{row.stringNumber}</span>
                          </td>
                          <td className="p-3 font-bold text-prizm-text">BPC {row.bpc}</td>
                          <td className="p-3">C{row.cell}</td>
                          <td className="p-3 text-prizm-text">{formatDuration(row.durationSec)}</td>
                          <td className="p-3">
                            <div className="flex flex-col gap-0.5">
                              {row.warningTriggerMessage ? (
                                <span className="text-prizm-danger font-bold text-[11px]">{row.warningTriggerMessage}</span>
                              ) : row.warningTriggeredAfterBalance ? (
                                <span className="text-amber-500 font-bold text-[11px]">Warning Triggered After Balance</span>
                              ) : (
                                <span className="text-neutral-400 italic">No trigger code parsed</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-prizm-text-muted text-[10px] truncate" title={row.warningTriggeredTime || ""}>
                            {row.warningTriggeredTime ? new Date(row.warningTriggeredTime).toLocaleString() : "--"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
