import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench
} from "lucide-react";

type CorrectiveFinding = Record<string, any>;



function getLegacyTileFindingsFromBlockSummary(payload: any): CorrectiveFinding[] {
  const candidates = [
    payload?.correctiveActions,
    payload?.summary?.correctiveActions,
    payload?.data?.correctiveActions,
    payload?.blockSummary?.correctiveActions
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((item: any, idx: number) => ({
        ...item,
        id: item?.id || item?.key || `legacy-tile-corrective-${idx}`,
        evidence: {
          ...(item?.evidence || {}),
          source: item?.evidence?.source || "block-summary-corrective-actions"
        }
      }));
    }
  }

  return [];
}

function formatLegacyAffectedTarget(target: any): string {
  if (target === null || target === undefined) return "";

  if (typeof target === "string" || typeof target === "number") {
    return String(target).trim();
  }

  const direct =
    target?.targetLabel ||
    target?.condensedLabel ||
    target?.label ||
    target?.displayLabel ||
    target?.name ||
    target?.entityName ||
    target?.entityKeyToken ||
    target?.stringKey ||
    target?.endpoint ||
    target?.ip ||
    target?.deviceIp;

  if (direct) return String(direct).trim();

  const block = target?.blockIndex ?? target?.blockNumber;
  const array = target?.arrayIndex ?? target?.arrayNumber;
  const string = target?.stringIndex ?? target?.stringNumber;
  const segment =
    target?.energySegmentNumber ??
    target?.energySegmentIndex ??
    target?.segmentIndex ??
    target?.segmentNumber;
  const hvacUnit = target?.hvacUnit ?? target?.hvac;
  const source = target?.source;

  const parts: string[] = [];

  if (block !== undefined && block !== null) parts.push(`Block ${block}`);
  if (array !== undefined && array !== null) parts.push(`Array ${array}`);
  if (segment !== undefined && segment !== null) parts.push(`Energy Segment ${segment}`);
  if (string !== undefined && string !== null) parts.push(`String ${string}`);
  if (hvacUnit !== undefined && hvacUnit !== null) parts.push(`HVAC ${hvacUnit}`);
  if (source) parts.push(String(source).toUpperCase());

  return parts.join(", ");
}

function normalizeFeatherRuntimeFindings(devices: any[]): CorrectiveFinding[] {
  const findings: CorrectiveFinding[] = [];
  const createdAt = new Date().toISOString();

  const n = (value: any) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const b = (value: any) => {
    if (value === true) return true;
    if (value === false) return false;
    if (value === null || value === undefined || value === "") return false;
    return ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase());
  };

  const segmentLabel = (device: any) => {
    const raw =
      device?.segmentLabel ||
      device?.topology?.segmentLabel ||
      device?.entityKeyToken ||
      device?.entityDescription ||
      device?.displayKey ||
      "";

    const es = String(raw).match(/\bES\s*([0-9]+)\b/i);
    if (es) return `Energy Segment ${Number(es[1])}`;

    const cs = String(raw).match(/\bCS\s*([0-9]*)\b/i);
    if (cs) return cs[1] ? `Collection Segment ${Number(cs[1])}` : "Collection Segment";

    return String(raw || "Segment Unknown");
  };

  const unitState = (device: any, unitNumber: 1 | 2) => {
    const hvac = unitNumber === 1 ? (device?.hvac1 || {}) : (device?.hvac2 || {});

    const commanded = !!(
      b(hvac?.fanLowOn) ||
      b(hvac?.fanHighOn) ||
      b(hvac?.compressorOn) ||
      b(hvac?.electricHeatOn) ||
      b(hvac?.reversingValveOn)
    );

    const currentA = n(hvac?.currentA);
    const fanSpeedRpm = n(hvac?.fanSpeedRpm);

    // Site default is Dometic: RPM is debug only, current is the feedback.
    const active = currentA > 0.2;

    let mismatchType = "none";
    if (commanded && !active) mismatchType = "commanded_not_active";
    else if (!commanded && active) mismatchType = "active_not_commanded";

    return { commanded, active, currentA, fanSpeedRpm, mismatchType };
  };

  for (const device of devices || []) {
    const arrayNumber = device?.arrayIndex ?? device?.arrayNumber ?? device?.topology?.arrayIndex;
    const ip = device?.ip || device?.deviceIp || device?.endpoint;
    const seg = segmentLabel(device);

    for (const unitNumber of [1, 2] as const) {
      const state = unitState(device, unitNumber);
      if (state.mismatchType === "none") continue;

      const faultCode = state.mismatchType === "active_not_commanded"
        ? "ENV-HVAC-CURRENT-WITHOUT-COMMAND"
        : "ENV-HVAC-COMMANDED-NO-CURRENT";

      const issueName = state.mismatchType === "active_not_commanded"
        ? "HVAC Current Present Without Command"
        : "HVAC Commanded ON, Current Below Expected Range";

      const targetLabel = [
        arrayNumber ? `Array ${arrayNumber}` : "Array Unknown",
        seg,
        `HVAC ${unitNumber}`,
        ip ? `IP ${ip}` : null
      ].filter(Boolean).join(", ");

      findings.push({
        id: `runtime-feather-${faultCode}-${targetLabel}`,
        category: "environmental",
        subsystem: "hvac",
        scope: "feather",
        severity: state.mismatchType === "active_not_commanded" ? "alarm" : "warning",
        title: unitNumber ? `HVAC ${unitNumber} ${issueName}` : issueName,
        detectedCondition: state.mismatchType === "active_not_commanded"
          ? `HVAC ${unitNumber} is drawing current while no command is active.`
          : `HVAC ${unitNumber} has an active command, but measured current is below the expected running range.`,
        evidence: {
          source: "runtime-feather-page-source",
          faultCode,
          normalizedFaultCode: faultCode,
          issueName,
          targetLabel,
          affectedTargets: [targetLabel],
          arrayNumber,
          segmentLabel: seg,
          hvacUnit: unitNumber,
          deviceIp: ip,
          hvacProfile: "dometic",
          mismatchType: state.mismatchType,
          commanded: state.commanded,
          active: state.active,
          currentA: state.currentA,
          fanSpeedRpm: state.fanSpeedRpm
        },
        stringKey: targetLabel,
        recommendedActions: state.mismatchType === "active_not_commanded"
          ? [
              `Verify HVAC ${unitNumber} command state and physical operation at ${targetLabel}.`,
              "Check for manual override or bypass.",
              `Inspect HVAC ${unitNumber} relay/contactor state.`,
              "Validate current sensor mapping."
            ]
          : [
              `Verify HVAC ${unitNumber} command state at ${targetLabel}.`,
              `Confirm HVAC ${unitNumber} measured current directly.`,
              `Check HVAC ${unitNumber} power, breaker/fuse, relay/contactor, and control wiring.`,
              "Validate Feather/Moxa output mapping and current input mapping."
            ],
        safetyNotes: [
          "Follow site electrical safety procedures before inspecting HVAC power or controls."
        ],
        source: "notification-engine",
        createdAt
      });
    }
  }

  return findings;
}

function mergeCorrectiveFindings(...groups: CorrectiveFinding[][]): CorrectiveFinding[] {
  const map = new Map<string, CorrectiveFinding>();

  const keyFor = (finding: CorrectiveFinding) => {
    const code = getFaultCode(finding);
    const target = finding?.evidence?.targetLabel || finding?.stringKey || getPrimaryTarget(finding);

    // Do not include source here. The same fault/target can come from the backend
    // corrective route and the runtime Feather source. Those should collapse into
    // one detailed row, with evidence merged.
    return `${code}|${target}`;
  };

  for (const group of groups) {
    for (const finding of group || []) {
      const key = keyFor(finding);
      const existing = map.get(key);

      if (!existing) {
        map.set(key, finding);
        continue;
      }

      // Prefer the richer finding, but preserve evidence from both.
      map.set(key, mergeRichFinding(existing, finding));
    }
  }

  return Array.from(map.values());
}

function getFindingsFromPayload(payload: any): CorrectiveFinding[] {
  const candidates = [
    payload?.findings,
    payload?.correctiveActions,
    payload?.actions,
    payload?.data?.findings,
    payload?.data?.correctiveActions
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}


function asArray(value: any): any[] {
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function uniqueStrings(values: any[]): string[] {
  const out: string[] = [];

  for (const value of values.flatMap(asArray)) {
    const text = String(value || "").trim();
    if (!text) continue;
    if (!out.includes(text)) out.push(text);
  }

  return out;
}

function getRichRecommendedActions(finding: CorrectiveFinding): string[] {
  return uniqueStrings([
    finding?.recommendedActions,
    finding?.resolved?.recommendedActions,
    finding?.remediation?.recommendedActions,
    finding?.remediation?.actions,
    finding?.evidence?.recommendedActions,
    finding?.action,
    finding?.suggestedAction,
    finding?.managerAction
  ]);
}

function getRichLikelyCauses(finding: CorrectiveFinding): string[] {
  return uniqueStrings([
    finding?.likelyCauses,
    finding?.resolved?.likelyCauses,
    finding?.remediation?.likelyCauses,
    finding?.evidence?.likelyCauses
  ]);
}

function getRichSafetyNotes(finding: CorrectiveFinding): string[] {
  return uniqueStrings([
    finding?.safetyNotes,
    finding?.resolved?.safetyNotes,
    finding?.remediation?.safetyNotes,
    finding?.evidence?.safetyNotes
  ]);
}

function getRichValidationChecks(finding: CorrectiveFinding): string[] {
  return uniqueStrings([
    finding?.validationChecks,
    finding?.resolved?.validationChecks,
    finding?.remediation?.validationChecks,
    finding?.evidence?.validationChecks
  ]);
}

function getRichClearingCriteria(finding: CorrectiveFinding): string[] {
  return uniqueStrings([
    finding?.clearingCriteria,
    finding?.resolved?.clearingCriteria,
    finding?.remediation?.clearingCriteria,
    finding?.evidence?.clearingCriteria
  ]);
}

function getManagerSummary(finding: CorrectiveFinding): string {
  return String(
    finding?.managerSummary ||
    finding?.resolved?.managerSummary ||
    finding?.evidence?.managerSummary ||
    finding?.detectedCondition ||
    finding?.resolved?.detectedCondition ||
    "Review active finding details and validate locally."
  );
}

function getFaultFamily(finding: CorrectiveFinding): "string_battery" | "environmental" | "controls" | "other" {
  const category = String(finding?.category || finding?.resolved?.category || "").toLowerCase();
  const subsystem = getSubsystem(finding);
  const code = getFaultCode(finding).toLowerCase();
  const title = getIssueName(finding).toLowerCase();

  if (
    category.includes("string") ||
    category.includes("battery") ||
    subsystem.includes("bpc") ||
    subsystem.includes("contactor") ||
    subsystem.includes("cell") ||
    subsystem.includes("balanc") ||
    code.match(/^\d+$/) ||
    title.includes("cellgroup") ||
    title.includes("cell group") ||
    title.includes("bpc") ||
    title.includes("contactor") ||
    title.includes("string")
  ) {
    return "string_battery";
  }

  if (
    category.includes("environment") ||
    subsystem.includes("hvac") ||
    subsystem.includes("feather") ||
    subsystem.includes("hydrogen") ||
    subsystem.includes("smoke") ||
    subsystem.includes("fire") ||
    subsystem.includes("louver") ||
    subsystem.includes("sensor") ||
    code.includes("env-") ||
    title.includes("hvac")
  ) {
    return "environmental";
  }

  if (
    category.includes("control") ||
    subsystem.includes("modbus") ||
    subsystem.includes("network") ||
    subsystem.includes("moxa")
  ) {
    return "controls";
  }

  return "other";
}

function familyRank(finding: CorrectiveFinding): number {
  const family = getFaultFamily(finding);

  // String controller / BPC / string-battery first, environmental after.
  if (family === "string_battery") return 0;
  if (family === "controls") return 1;
  if (family === "environmental") return 2;
  return 3;
}

function parseSideRank(text: string): number {
  const lower = text.toLowerCase();
  if (lower.includes("a-side") || lower.includes("side a") || lower.match(/\b\/\s*a\b/)) return 0;
  if (lower.includes("b-side") || lower.includes("side b") || lower.match(/\b\/\s*b\b/)) return 1;
  return 9;
}

function firstNumberMatch(text: string, patterns: RegExp[]): number {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return 999999;
}

function getLocationSortParts(finding: CorrectiveFinding) {
  const target = getPrimaryTarget(finding);
  const allText = [
    target,
    finding?.stringKey,
    finding?.evidence?.targetLabel,
    finding?.evidence?.segmentLabel,
    finding?.evidence?.deviceIp,
    getIssueName(finding)
  ].map((v) => String(v || "")).join(" ");

  const explicitArray = Number(finding?.arrayNumber ?? finding?.evidence?.arrayNumber);
  const arrayNumber = Number.isFinite(explicitArray)
    ? explicitArray
    : firstNumberMatch(allText, [
        /\bArray\s*([0-9]+)\b/i,
        /\bA\s*([0-9]+)\b/i
      ]);

  const isCollectionSegment =
    /\bCollection Segment\b/i.test(allText) ||
    /\bCS\b/i.test(allText);

  const segmentNumber = firstNumberMatch(allText, [
    /\bEnergy Segment\s*([0-9]+)\b/i,
    /\bES\s*([0-9]+)\b/i,
    /\bSegment\s*([0-9]+)\b/i
  ]);

  const stringNumber = firstNumberMatch(allText, [
    /\bString\s*([0-9]+)\b/i,
    /\bS\s*([0-9]+)\b/i
  ]);

  const hvacNumber = firstNumberMatch(allText, [
    /\bHVAC\s*([0-9]+)\b/i
  ]);

  return {
    arrayNumber,
    segmentClass: isCollectionSegment ? 0 : 1,
    segmentNumber,
    stringNumber,
    sideRank: parseSideRank(allText),
    hvacNumber
  };
}

function compareCorrectiveFindings(a: CorrectiveFinding, b: CorrectiveFinding): number {
  const familyDelta = familyRank(a) - familyRank(b);
  if (familyDelta !== 0) return familyDelta;

  const la = getLocationSortParts(a);
  const lb = getLocationSortParts(b);

  const checks = [
    la.arrayNumber - lb.arrayNumber,
    la.segmentClass - lb.segmentClass,
    la.segmentNumber - lb.segmentNumber,
    la.stringNumber - lb.stringNumber,
    la.sideRank - lb.sideRank,
    la.hvacNumber - lb.hvacNumber,
    severityRank(getSeverity(b)) - severityRank(getSeverity(a)),
    getFaultCode(a).localeCompare(getFaultCode(b))
  ];

  for (const check of checks) {
    if (check !== 0) return check;
  }

  return getPrimaryTarget(a).localeCompare(getPrimaryTarget(b));
}

function findingRichnessScore(finding: CorrectiveFinding): number {
  return [
    getRichRecommendedActions(finding).length * 10,
    getRichLikelyCauses(finding).length * 6,
    getRichValidationChecks(finding).length * 5,
    getRichClearingCriteria(finding).length * 5,
    getRichSafetyNotes(finding).length * 4,
    getManagerSummary(finding) ? 3 : 0,
    finding?.resolved ? 8 : 0,
    finding?.remediation ? 8 : 0,
    finding?.evidence ? Object.keys(finding.evidence || {}).length : 0
  ].reduce((a, b) => a + b, 0);
}

function mergeRichFinding(existing: CorrectiveFinding, incoming: CorrectiveFinding): CorrectiveFinding {
  const existingScore = findingRichnessScore(existing);
  const incomingScore = findingRichnessScore(incoming);

  const base = incomingScore > existingScore ? incoming : existing;
  const other = incomingScore > existingScore ? existing : incoming;

  return {
    ...other,
    ...base,
    evidence: {
      ...(other?.evidence || {}),
      ...(base?.evidence || {})
    },
    resolved: {
      ...(other?.resolved || {}),
      ...(base?.resolved || {})
    },
    remediation: {
      ...(other?.remediation || {}),
      ...(base?.remediation || {})
    },
    recommendedActions: uniqueStrings([
      other?.recommendedActions,
      other?.resolved?.recommendedActions,
      other?.remediation?.recommendedActions,
      base?.recommendedActions,
      base?.resolved?.recommendedActions,
      base?.remediation?.recommendedActions
    ]),
    likelyCauses: uniqueStrings([
      other?.likelyCauses,
      other?.resolved?.likelyCauses,
      other?.remediation?.likelyCauses,
      base?.likelyCauses,
      base?.resolved?.likelyCauses,
      base?.remediation?.likelyCauses
    ]),
    safetyNotes: uniqueStrings([
      other?.safetyNotes,
      other?.resolved?.safetyNotes,
      other?.remediation?.safetyNotes,
      base?.safetyNotes,
      base?.resolved?.safetyNotes,
      base?.remediation?.safetyNotes
    ])
  };
}

function getSeverity(finding: CorrectiveFinding): string {
  return String(finding?.severity || finding?.resolved?.severity || "info").toLowerCase();
}

function severityRank(severity: string): number {
  if (severity === "critical") return 5;
  if (severity === "alarm") return 4;
  if (severity === "warning") return 3;
  if (severity === "info") return 2;
  return 1;
}

function getFaultCode(finding: CorrectiveFinding): string {
  return String(
    finding?.evidence?.faultCode ||
    finding?.evidence?.normalizedFaultCode ||
    finding?.nativeFaultCode ||
    finding?.faultCode ||
    finding?.normalizedFaultCode ||
    finding?.code ||
    finding?.remediationStrategyId ||
    "UNMAPPED"
  );
}

function getIssueName(finding: CorrectiveFinding): string {
  return String(
    finding?.evidence?.issueName ||
    finding?.issueName ||
    finding?.resolved?.issueName ||
    finding?.title ||
    finding?.detectedCondition ||
    "Corrective Action"
  );
}

function getSubsystem(finding: CorrectiveFinding): string {
  return String(finding?.subsystem || finding?.resolved?.system || "unknown").toLowerCase();
}

function getTargetLabels(finding: CorrectiveFinding): string[] {
  const labels: string[] = [];

  const add = (value: any) => {
    const text = String(value || "").trim();
    if (!text) return;
    if (/^block\s+\d+$/i.test(text)) return;
    if (text.toLowerCase().includes("target group")) return;
    if (!labels.includes(text)) labels.push(text);
  };

  add(finding?.evidence?.targetLabel);
  add(finding?.targetLabel);
  add(finding?.stringKey);

  const arrays = [
    finding?.evidence?.affectedTargets,
    finding?.affectedTargets,
    finding?.targets,
    finding?.affected,
    finding?.occurrences,
    finding?.relatedIssues,
    finding?.related,
    finding?.children
  ];

  for (const arr of arrays) {
    if (Array.isArray(arr)) {
      for (const item of arr) {
        add(formatLegacyAffectedTarget(item));
        add(item?.evidence?.targetLabel);
        add(item?.targetLabel);
        add(item?.stringKey);
      }
    }
  }

  if (labels.length === 0) {
    const arrayNumber = finding?.arrayNumber ?? finding?.evidence?.arrayNumber;
    const stringNumber = finding?.stringNumber ?? finding?.evidence?.stringNumber;
    const deviceIp = finding?.evidence?.deviceIp || finding?.deviceIp;

    const parts = [
      arrayNumber ? `Array ${arrayNumber}` : null,
      stringNumber ? `String ${stringNumber}` : null,
      deviceIp ? `IP ${deviceIp}` : null
    ].filter(Boolean);

    if (parts.length) add(parts.join(", "));
  }

  return labels.length ? labels : ["Target location unavailable"];
}

function getPrimaryTarget(finding: CorrectiveFinding): string {
  return getTargetLabels(finding)[0] || "Target location unavailable";
}

function getSuggestedAction(finding: CorrectiveFinding): string {
  const actions = getRichRecommendedActions(finding);
  if (actions.length > 0) return actions[0];

  return "Review finding evidence and validate the affected equipment locally.";
}

function getArrayLabel(finding: CorrectiveFinding): string {
  const value = finding?.arrayNumber ?? finding?.evidence?.arrayNumber;
  return value !== undefined && value !== null ? `A${value}` : "—";
}

function getEquipmentLabel(finding: CorrectiveFinding): string {
  const hvacUnit = finding?.evidence?.hvacUnit;
  if (hvacUnit) return `HVAC ${hvacUnit}`;

  const subsystem = getSubsystem(finding);
  if (subsystem === "contactor") return "Contactor";
  if (subsystem === "bpc") return "BPC";
  if (subsystem === "hvac") return "HVAC";

  return subsystem.toUpperCase();
}

function getSeverityClass(severity: string): string {
  if (severity === "critical") return "bg-rose-50 text-rose-700 border-rose-200";
  if (severity === "alarm") return "bg-red-50 text-red-700 border-red-200";
  if (severity === "warning") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function openFeatherTarget(finding: CorrectiveFinding) {
  const ip = finding?.evidence?.deviceIp || finding?.deviceIp;
  const arrayNumber = finding?.arrayNumber ?? finding?.evidence?.arrayNumber;

  if (ip) localStorage.setItem("prizm_selected_feather_ip", String(ip));
  if (arrayNumber) localStorage.setItem("prizm_selected_feather_array", String(arrayNumber));

  window.dispatchEvent(new CustomEvent("navigate-tab", { detail: "feather-hvac" }));
}

export default function CorrectiveActionsDashboard({ active = true }: { active?: boolean }) {
  const [findings, setFindings] = useState<CorrectiveFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [severityFilter, setSeverityFilter] = useState("all");
  const [subsystemFilter, setSubsystemFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    try {
      setError(null);
      const [correctiveRes, featherRes, blockSummaryRes] = await Promise.all([
        fetch("/api/local/strings/dashboard/corrective-actions", { cache: "no-store" }),
        fetch("/api/feather/devices?cache=cache-first&maxAgeMs=60000", { cache: "no-store" }).catch(() => null),
        fetch("/api/local/site-data/block-summary", { cache: "no-store" }).catch(() => null)
      ]);

      const correctivePayload = await correctiveRes.json().catch(() => null);
      if (!correctiveRes.ok) throw new Error(correctivePayload?.error || `HTTP ${correctiveRes.status}`);

      const backendFindings = getFindingsFromPayload(correctivePayload);

      let legacyTileFindings: CorrectiveFinding[] = [];
      if (blockSummaryRes && blockSummaryRes.ok) {
        const blockSummaryPayload = await blockSummaryRes.json().catch(() => null);
        legacyTileFindings = getLegacyTileFindingsFromBlockSummary(blockSummaryPayload);
      }

      let runtimeFeatherFindings: CorrectiveFinding[] = [];
      if (featherRes && featherRes.ok) {
        const featherPayload = await featherRes.json().catch(() => null);
        const featherDevices = Array.isArray(featherPayload)
          ? featherPayload
          : (featherPayload?.devices || featherPayload?.normalized?.feather || []);
        runtimeFeatherFindings = normalizeFeatherRuntimeFindings(featherDevices);
      }

      const nextFindings = mergeCorrectiveFindings(backendFindings, legacyTileFindings, runtimeFeatherFindings)
        .slice()
        .sort(compareCorrectiveFindings);

      setFindings(nextFindings);
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;

    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [active]);

  const subsystemOptions = useMemo(() => {
    return Array.from(new Set(findings.map(getSubsystem))).sort();
  }, [findings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return findings.filter((finding) => {
      const severity = getSeverity(finding);
      const subsystem = getSubsystem(finding);

      if (severityFilter !== "all" && severity !== severityFilter) return false;
      if (subsystemFilter !== "all" && subsystem !== subsystemFilter) return false;

      if (!q) return true;

      const haystack = [
        getFaultCode(finding),
        getIssueName(finding),
        getPrimaryTarget(finding),
        getSubsystem(finding),
        getEquipmentLabel(finding),
        finding?.detectedCondition,
        finding?.evidence?.deviceIp
      ].map((v) => String(v || "").toLowerCase()).join(" ");

      return haystack.includes(q);
    });
  }, [findings, severityFilter, subsystemFilter, search]);

  const stats = useMemo(() => {
    return {
      total: findings.length,
      critical: findings.filter((f) => getSeverity(f) === "critical").length,
      alarm: findings.filter((f) => getSeverity(f) === "alarm").length,
      warning: findings.filter((f) => getSeverity(f) === "warning").length,
      hvac: findings.filter((f) => getSubsystem(f) === "hvac").length
    };
  }, [findings]);

  return (
    <div className="space-y-4 font-sans">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Wrench size={18} className="text-emerald-700" />
              <h1 className="font-mono text-sm font-black uppercase tracking-widest text-slate-900">
                Corrective Actions
              </h1>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Detailed active fault list with normalized targets, command/feedback evidence, and technician actions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-[10px] font-mono text-slate-500">
                Updated {new Date(lastUpdated).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded border border-slate-300 bg-slate-50 hover:bg-white text-slate-800 text-[10px] font-mono font-black uppercase tracking-widest disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-slate-50 border-b border-slate-200">
          {[
            ["Total", stats.total, "text-slate-900"],
            ["Critical", stats.critical, "text-rose-700"],
            ["Alarm", stats.alarm, "text-red-700"],
            ["Warning", stats.warning, "text-amber-700"],
            ["HVAC", stats.hvac, "text-emerald-700"]
          ].map(([label, value, cls]) => (
            <div key={String(label)} className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="text-[9px] font-mono uppercase tracking-widest text-slate-500">{label}</div>
              <div className={`text-2xl font-black font-mono ${cls}`}>{value}</div>
            </div>
          ))}
        </div>

        <div className="p-4 flex flex-col xl:flex-row gap-3 border-b border-slate-200">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fault code, issue, array, segment, HVAC, IP..."
              className="w-full pl-9 pr-3 py-2 rounded border border-slate-300 bg-white text-sm text-slate-900 outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-500" />
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-2 rounded border border-slate-300 bg-white text-xs font-mono text-slate-900"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="alarm">Alarm</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>

            <select
              value={subsystemFilter}
              onChange={(e) => setSubsystemFilter(e.target.value)}
              className="px-3 py-2 rounded border border-slate-300 bg-white text-xs font-mono text-slate-900"
            >
              <option value="all">All Subsystems</option>
              {subsystemOptions.map((subsystem) => (
                <option key={subsystem} value={subsystem}>{subsystem.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="m-4 p-3 rounded border border-rose-200 bg-rose-50 text-rose-700 text-xs font-mono">
            Corrective action load failed: {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-[10px] font-mono uppercase tracking-widest text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Fault Code</th>
                <th className="px-3 py-2">Issue Name</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Equipment</th>
                <th className="px-3 py-2">Suggested Action</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {filtered.map((finding, idx) => {
                const key = finding?.id || `${getFaultCode(finding)}-${idx}`;
                const isOpen = !!expanded[key];
                const severity = getSeverity(finding);
                const targetLabels = getTargetLabels(finding);

                return (
                  <React.Fragment key={key}>
                    <tr
                      className="hover:bg-emerald-50/50 cursor-pointer"
                      onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                    >
                      <td className="px-3 py-3 text-slate-500">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>

                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[9px] font-mono font-black uppercase ${getSeverityClass(severity)}`}>
                          {severity === "critical" || severity === "alarm" ? <ShieldAlert size={11} /> : <AlertTriangle size={11} />}
                          {severity}
                        </span>
                      </td>

                      <td className="px-3 py-3 font-mono font-black text-slate-900 whitespace-nowrap">
                        {getFaultCode(finding)}
                      </td>

                      <td className="px-3 py-3 min-w-[260px]">
                        <div className="font-bold text-slate-900">{getIssueName(finding)}</div>
                        <div className="text-[10px] text-slate-500 font-mono uppercase">
                          {getSubsystem(finding)}
                        </div>
                      </td>

                      <td className="px-3 py-3 min-w-[320px]">
                        <div className="font-semibold text-slate-900">{getPrimaryTarget(finding)}</div>
                        {targetLabels.length > 1 && (
                          <div className="text-[10px] text-emerald-700 font-mono font-bold">
                            +{targetLabels.length - 1} related target{targetLabels.length - 1 === 1 ? "" : "s"}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                        {getArrayLabel(finding)} / {getEquipmentLabel(finding)}
                      </td>

                      <td className="px-3 py-3 min-w-[320px] text-slate-700">
                        {getSuggestedAction(finding)}
                      </td>

                      <td className="px-3 py-3">
                        {finding?.evidence?.latched ? (
                          <span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[9px] font-mono font-black uppercase text-blue-700">
                            Latched
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-mono font-black uppercase text-emerald-700">
                            <CheckCircle2 size={10} />
                            Active
                          </span>
                        )}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50 px-4 py-4">
                          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                            <div className="bg-white border border-slate-200 rounded-lg p-3">
                              <div className="text-[10px] font-mono font-black uppercase tracking-widest text-emerald-700 mb-2">
                                Affected Targets ({targetLabels.length})
                              </div>
                              <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                                {targetLabels.map((label, labelIdx) => (
                                  <div
                                    key={`${label}-${labelIdx}`}
                                    className="rounded border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-900"
                                  >
                                    {label}
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="bg-white border border-slate-200 rounded-lg p-3">
                              <div className="text-[10px] font-mono font-black uppercase tracking-widest text-emerald-700 mb-2">
                                Evidence
                              </div>

                              <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-2">
                                <div className="text-[9px] font-mono uppercase text-slate-500">Manager Summary</div>
                                <div className="text-[11px] font-semibold text-slate-900 leading-snug">{getManagerSummary(finding)}</div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[11px]">
                                {[
                                  ["Commanded", finding?.evidence?.commanded],
                                  ["Active", finding?.evidence?.active],
                                  ["Current A", finding?.evidence?.currentA],
                                  ["Fan RPM", finding?.evidence?.fanSpeedRpm],
                                  ["HVAC Profile", finding?.evidence?.hvacProfile],
                                  ["Device IP", finding?.evidence?.deviceIp]
                                ].map(([label, value]) => (
                                  <div key={label} className="rounded border border-slate-200 bg-slate-50 p-2">
                                    <div className="text-[9px] font-mono uppercase text-slate-500">{label}</div>
                                    <div className="font-bold text-slate-900">{value === undefined || value === null ? "—" : String(value)}</div>
                                  </div>
                                ))}
                              </div>

                              {finding?.evidence?.deviceIp && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openFeatherTarget(finding);
                                  }}
                                  className="mt-3 inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-mono font-black uppercase text-emerald-700 hover:bg-emerald-100"
                                >
                                  <ExternalLink size={12} />
                                  Open Feather Target
                                </button>
                              )}
                            </div>

                            <div className="bg-white border border-slate-200 rounded-lg p-3">
                              <div className="text-[10px] font-mono font-black uppercase tracking-widest text-emerald-700 mb-2">
                                Recommended Actions
                              </div>

                              <ul className="space-y-2">
                                {(getRichRecommendedActions(finding).length ? getRichRecommendedActions(finding) : [getSuggestedAction(finding)]).map((action: string, actionIdx: number) => (
                                  <li key={actionIdx} className="flex items-start gap-2 text-[11px] text-slate-800">
                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0"></span>
                                    <span>{action}</span>
                                  </li>
                                ))}
                              </ul>

                              {getRichValidationChecks(finding).length > 0 && (
                                <div className="mt-3 rounded border border-sky-200 bg-sky-50 p-2">
                                  <div className="text-[9px] font-mono font-black uppercase text-sky-700 mb-1">
                                    Validation Checks
                                  </div>
                                  {getRichValidationChecks(finding).map((check: string, checkIdx: number) => (
                                    <div key={checkIdx} className="text-[10px] text-sky-800">
                                      • {check}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {getRichClearingCriteria(finding).length > 0 && (
                                <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2">
                                  <div className="text-[9px] font-mono font-black uppercase text-emerald-700 mb-1">
                                    Clearing Criteria
                                  </div>
                                  {getRichClearingCriteria(finding).map((criterion: string, criterionIdx: number) => (
                                    <div key={criterionIdx} className="text-[10px] text-emerald-800">
                                      • {criterion}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {getRichSafetyNotes(finding).length > 0 && (
                                <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2">
                                  <div className="text-[9px] font-mono font-black uppercase text-amber-700 mb-1">
                                    Safety Notes
                                  </div>
                                  {getRichSafetyNotes(finding).map((note: string, noteIdx: number) => (
                                    <div key={noteIdx} className="text-[10px] text-amber-800">
                                      • {note}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500 font-mono text-xs uppercase tracking-widest">
                    No corrective actions match the current filters.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500 font-mono text-xs uppercase tracking-widest">
                    Loading corrective actions...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
