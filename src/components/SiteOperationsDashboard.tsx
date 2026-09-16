import React, { useState, useEffect } from "react";
import { formatTemperatureF, celsiusToFahrenheit } from "../utils/temperatureScale";
import { getDashboardConnectionStatus } from "../utils/statusDisplay";
import {
  Activity,
  Battery,
  TriangleAlert,
  ServerOff,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Hash,
  XOctagon,
  Flame,
  Zap,
  Thermometer,
  Wind,
  ShieldAlert,
  Network,
  Cpu,
  RadioTower,
  ServerCrash,
  BoxSelect,
  PanelTop,
  Rows4,
  Lock,
  Unlock,
  Play,
  Pause,
} from "lucide-react";
import { formatPrizmUtcTimestamp } from "../lib/timeFormat";
import { normalizeVoltage, normalizeDeltaVoltage } from "../lib/voltageNormalizer";
import { filterAndNormalizeArraySummary } from "../lib/arraySummaryFilters";
import { getSystemSocAndSource } from "../lib/socUtils";
import RotationModal, { RotationTarget } from "./RotationModal";
import { stringNumberToEnergySegment, formatStringEsLabel } from "../lib/stringToEsMapper";
import HvacQuickReference from "./HvacQuickReference";
import { getHvacFeedbackProfile, supportsFanSpeedFeedback } from "../lib/hvacFeedbackProfile";


function compactNumberRangesForCorrectivePdf(values: any[]): string {
  const nums = Array.from(new Set((values || []).map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v)))).sort((a, b) => a - b);
  if (!nums.length) return "--";
  const ranges: string[] = [];
  let start = nums[0];
  let prev = nums[0];

  for (let i = 1; i <= nums.length; i += 1) {
    const current = nums[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    ranges.push(start === prev ? String(start) : `${start}-${prev}`);
    start = current;
    prev = current;
  }

  return ranges.join(", ");
}

function pickCorrectivePdfTargetPart(target: any, keys: string[], fallback: any = null): any {
  for (const key of keys) {
    const value = target?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function condenseCorrectivePdfTargets(targets: any[]): any[] {
  const groups = new Map<string, any>();

  for (const target of targets || []) {
    const block = pickCorrectivePdfTargetPart(target, ["blockIndex", "block", "blockNumber"], 1);
    const array = pickCorrectivePdfTargetPart(target, ["arrayIndex", "arrayNumber", "array"], null);
    const es = pickCorrectivePdfTargetPart(target, ["energySegmentIndex", "energySegmentNumber", "energySegment", "es"], null);
    const string = pickCorrectivePdfTargetPart(target, ["stringIndex", "stringNumber", "string"], null);
    const side = pickCorrectivePdfTargetPart(target, ["side"], null);
    const bpc = pickCorrectivePdfTargetPart(target, ["batteryPackIndex", "bpcIndex", "bpc", "batteryPack"], null);
    const key = [block, array, es, string, side, bpc].join("|");

    if (!groups.has(key)) {
      groups.set(key, { block, array, es, string, side, bpc, cgs: [], rawTargets: [], representative: target });
    }

    const group = groups.get(key);
    group.rawTargets.push(target);

    const cg = pickCorrectivePdfTargetPart(target, ["cellGroupIndex", "cellGroupNumber", "cell", "cg"], null);
    if (cg !== null && cg !== undefined) group.cgs.push(cg);
  }

  return Array.from(groups.values()).map((group) => {
    const parts = [
      group.block !== null && group.block !== undefined ? `Block ${group.block}` : null,
      group.array !== null && group.array !== undefined ? `Array ${group.array}` : null,
      group.es !== null && group.es !== undefined ? `ES${group.es}` : null,
      group.string !== null && group.string !== undefined ? `String ${group.string}` : null,
      group.side ? `${group.side}` : null,
      group.bpc !== null && group.bpc !== undefined ? `BPC ${group.bpc}` : null,
      group.cgs.length ? `CG ${compactNumberRangesForCorrectivePdf(group.cgs)}` : null
    ].filter(Boolean);

    return {
      ...group.representative,
      condensedLabel: parts.join(" / "),
      condensedCount: group.rawTargets.length,
      condensedRawTargets: group.rawTargets
    };
  });
}


function formatAffectedTargetForDisplay(target: any, system?: string, detailView?: string): string {
  const block = target.blockIndex ?? 1;
  const array = target.arrayIndex ?? 1;
  
  const sys = (system || target.system || "").toLowerCase();
  const dView = (detailView || target.detailView || "").toLowerCase();
  const epType = (target.endpointType || "").toLowerCase();

  let showIp = false;
  if (
    sys === "string" ||
    sys === "bpc" ||
    sys === "cell-group" ||
    sys === "balancing" ||
    sys === "contactor" ||
    epType === "string" ||
    epType === "bpc" ||
    epType === "cell_group" ||
    dView === "string"
  ) {
    showIp = false;
  } else if (
    dView === "feather" ||
    dView === "pcs" ||
    dView === "site" ||
    dView === "network" ||
    sys === "hvac" ||
    sys === "feather" ||
    sys === "team-box" ||
    sys === "ups" ||
    sys === "network" ||
    sys === "pcs" ||
    sys === "meter" ||
    sys === "fire" ||
    sys === "sensor"
  ) {
    showIp = true;
  }

  const isStringRelated = !showIp;
  
  if (isStringRelated) {
    const stringNum = target.stringIndex;
    let esStr = "";
    let sideStr = "";
    if (stringNum !== undefined && stringNum !== null) {
      const es = Math.ceil(Number(stringNum) / 2);
      esStr = ` / ES${es} / String ${stringNum}`;
      sideStr = Number(stringNum) % 2 === 1 ? " / A-Side" : " / B-Side";
    } else if (target.energySegmentIndex !== undefined && target.energySegmentIndex !== null) {
      esStr = ` / ES${target.energySegmentIndex}`;
    }
    
    let bpcStr = "";
    if (target.batteryPackIndex !== undefined && target.batteryPackIndex !== null) {
      bpcStr = ` / BPC ${target.batteryPackIndex}`;
    }
    let cgStr = "";
    if (target.cellGroupIndex !== undefined && target.cellGroupIndex !== null) {
      cgStr = ` / CG ${target.cellGroupIndex}`;
    }
    
    return `Block ${block} / Array ${array}${esStr}${sideStr}${bpcStr}${cgStr}`;
  } else {
    const parts = [`Block ${block}`, `Array ${array}`];
    
    const isHvac = sys === "hvac" || String(target.callout || "").toLowerCase().includes("hvac");
    const isFeather = sys === "feather" || String(target.callout || "").toLowerCase().includes("feather");
    
    if (isFeather) {
      parts.push("Feather");
    } else if (isHvac) {
      parts.push("Feather");
      if (String(target.callout || "").toLowerCase().includes("hvac 1")) {
        parts.push("HVAC 1");
      } else if (String(target.callout || "").toLowerCase().includes("hvac 2")) {
        parts.push("HVAC 2");
      } else {
        parts.push("HVAC Device");
      }
    } else {
      const compLabel = target.component || target.endpointType || "Controller";
      parts.push(compLabel);
    }
    
    const ipVal = target.deviceIp || target.ip;
    if (ipVal) {
      parts.push(`IP ${ipVal}`);
    }
    
    return parts.join(" / ");
  }
}

function CollapsibleSection({
  title,
  icon: Icon,
  defaultExpanded = true,
  children,
  badge = null,
  className = "",
  onExpandedChange,
}: {
  title: string;
  icon?: any;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div
      className={`bg-prizm-surface-strong border border-prizm-border rounded-lg overflow-hidden flex flex-col ${className}`}
    >
      <button
        onClick={() => {
          const nextExpanded = !expanded;
          setExpanded(nextExpanded);
          onExpandedChange?.(nextExpanded);
        }}
        className="flex items-center justify-between p-3 bg-black/20 hover:bg-white border border-slate-200 text-slate-900 transition-colors border-b border-prizm-border w-full text-left"
      >
        <h3 className="text-xs font-bold text-prizm-text uppercase tracking-widest font-mono flex items-center gap-2">
          {Icon && <Icon size={14} className="text-emerald-700" />} {title}
        </h3>
        <div className="flex items-center gap-2 text-prizm-text-muted">
          {badge}
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>
      {expanded && (
        <div className="p-0 overflow-x-auto no-scrollbar">{children}</div>
      )}
    </div>
  );
}

type DashboardState = {
  loading: boolean;
  cacheStatus: any;
  stringsDashboard: any;
  featherDevices: any;
  safetyFaults: any;
  overviewDiscovery: any;
  siteSummary: any;
  historyEvents: any;
};

export async function fetchJsonWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
) {
  const { timeoutMs = 5000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(id);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}


function compactNumberRanges(values: any[]): string {
  const nums = Array.from(
    new Set(
      values
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v))
    )
  ).sort((a, b) => a - b);

  if (!nums.length) return "--";

  const ranges: string[] = [];
  let start = nums[0];
  let prev = nums[0];

  for (let i = 1; i <= nums.length; i += 1) {
    const current = nums[i];

    if (current === prev + 1) {
      prev = current;
      continue;
    }

    ranges.push(start === prev ? String(start) : `${start}–${prev}`);
    start = current;
    prev = current;
  }

  return ranges.join(", ");
}

function getTargetPart(target: any, keys: string[], fallback: any = null): any {
  for (const key of keys) {
    const value = target?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function condenseAffectedTargetsForDisplay(targets: any[]): any[] {
  const groups = new Map<string, any>();

  for (const target of targets || []) {
    const block = getTargetPart(target, ["blockIndex", "block", "blockNumber"], 1);
    const array = getTargetPart(target, ["arrayIndex", "arrayNumber", "array"], null);
    const es = getTargetPart(target, ["energySegmentIndex", "energySegmentNumber", "energySegment", "es"], null);
    const string = getTargetPart(target, ["stringIndex", "stringNumber", "string"], null);
    const side = getTargetPart(target, ["side"], null);
    const bpc = getTargetPart(target, ["batteryPackIndex", "bpcIndex", "bpc", "batteryPack"], null);

    const key = [block, array, es, string, side, bpc].join("|");

    if (!groups.has(key)) {
      groups.set(key, {
        block,
        array,
        es,
        string,
        side,
        bpc,
        source: target?.source || "EMS",
        rawTargets: [],
        cellGroups: [],
        representative: target
      });
    }

    const group = groups.get(key);
    group.rawTargets.push(target);

    const cg = getTargetPart(target, ["cellGroupIndex", "cellGroupNumber", "cell", "cg"], null);
    if (cg !== null && cg !== undefined) group.cellGroups.push(cg);
  }

  return Array.from(groups.values()).map((group) => {
    const parts = [
      group.block !== null && group.block !== undefined ? `Block ${group.block}` : null,
      group.array !== null && group.array !== undefined ? `Array ${group.array}` : null,
      group.es !== null && group.es !== undefined ? `ES${group.es}` : null,
      group.string !== null && group.string !== undefined ? `String ${group.string}` : null,
      group.side ? `${group.side}` : null,
      group.bpc !== null && group.bpc !== undefined ? `BPC ${group.bpc}` : null,
      group.cellGroups.length ? `CG ${compactNumberRanges(group.cellGroups)}` : null
    ].filter(Boolean);

    return {
      ...group.representative,
      condensedLabel: parts.join(" / "),
      condensedCount: group.rawTargets.length,
      condensedCellGroupSummary: group.cellGroups.length ? compactNumberRanges(group.cellGroups) : "--",
      condensedRawTargets: group.rawTargets,
      source: group.source
    };
  });

function correctiveCategoryLabel(category?: string): string {
  switch (category) {
    case "string_battery":
      return "String / Battery";
    case "environmental":
      return "Environmental";
    case "controls_comms":
      return "Controls / Comms";
    case "pcs_array":
      return "PCS / Array";
    case "site_system":
      return "Site Level";
    default:
      return "Corrective";
  }
}

function formatRuntimeCorrectiveLocation(finding: any): string {
  const parts = [];

  if (finding?.arrayNumber !== undefined && finding?.arrayNumber !== null) {
    parts.push(`Array ${finding.arrayNumber}`);
  }

  if (finding?.stringNumber !== undefined && finding?.stringNumber !== null) {
    parts.push(`String ${finding.stringNumber}`);
  }

  if (finding?.stringKey && !parts.length) {
    parts.push(String(finding.stringKey));
  }

  if (finding?.evidence?.deviceIp) {
    parts.push(String(finding.evidence.deviceIp));
  }

  return parts.length ? parts.join(" / ") : correctiveCategoryLabel(finding?.category);
}

function mapRuntimeCorrectiveFindingToLegacyIssue(finding: any): any {
  const categoryLabel = correctiveCategoryLabel(finding?.category);
  const location = formatRuntimeCorrectiveLocation(finding);
  const target = {
    source: finding?.subsystem || finding?.category || "corrective-actions",
    system: finding?.category,
    detailView: finding?.subsystem,
    arrayNumber: finding?.arrayNumber,
    arrayIndex: finding?.arrayNumber,
    stringNumber: finding?.stringNumber,
    stringIndex: finding?.stringNumber,
    deviceIp: finding?.evidence?.deviceIp,
    ip: finding?.evidence?.deviceIp,
    object: location,
    title: finding?.title
  };

  return {
    ...finding,
    code: displayFaultCode,
    level: String(finding?.severity || "warning").toUpperCase(),
    severity: String(finding?.severity || "warning").toUpperCase(),
    fault: finding?.title,
    faultName: finding?.title,
    faultId: finding?.id,
    affected: [target],
    occurrences: [target],
    affectedSummary: location,
    object: location,
    suggestedAction:
      finding?.remediation?.technicianSteps?.[0] ||
      finding?.recommendedActions?.[0] ||
      "Review corrective action details and source evidence.",
    resolved: {
      resolvedTroubleshooting: {
        issueName: finding?.title,
        managerSummary:
          finding?.detectedCondition ||
          finding?.remediation?.overview ||
          "PRIZM detected an actionable condition from normalized live data.",
        summaryAction:
          finding?.remediation?.technicianSteps?.[0] ||
          finding?.recommendedActions?.[0] ||
          "Review finding evidence and recommended remediation steps."
      }
    },
    runtimeCorrectiveAction: true,
    categoryLabel,
    remediationTitle: finding?.remediation?.title
  };
}

}




function getCorrectiveIssueCode(issue: any): string {
  return String(
    issue?.faultCode ||
    issue?.correctiveActionCode ||
    issue?.code ||
    issue?.faultId ||
    ""
  ).trim();
}

function getCorrectiveIssueName(issue: any): string {
  return String(
    issue?.faultName ||
    issue?.fault ||
    issue?.title ||
    issue?.resolved?.resolvedTroubleshooting?.issueName ||
    ""
  ).trim();
}

function getCorrectiveIssueTargets(issue: any): any[] {
  const targets =
    Array.isArray(issue?.affected) && issue.affected.length ? issue.affected :
    Array.isArray(issue?.occurrences) && issue.occurrences.length ? issue.occurrences :
    [];

  if (targets.length) return targets;

  return [{
    arrayNumber: issue?.arrayNumber,
    arrayIndex: issue?.arrayIndex,
    stringNumber: issue?.stringNumber,
    stringIndex: issue?.stringIndex,
    energySegmentNumber: issue?.energySegmentNumber,
    energySegmentIndex: issue?.energySegmentIndex,
    bpc: issue?.bpc,
    bpcIndex: issue?.bpcIndex,
    cellGroupIndex: issue?.cellGroupIndex,
    deviceIp: issue?.deviceIp || issue?.ip,
    object: issue?.object || issue?.affectedSummary
  }];
}

function getCorrectiveTargetSignature(issue: any): string {
  const targets = getCorrectiveIssueTargets(issue);
  const first = targets[0] || {};

  const array =
    first.arrayNumber ?? first.arrayIndex ??
    issue.arrayNumber ?? issue.arrayIndex ?? "";

  const string =
    first.stringNumber ?? first.stringIndex ??
    issue.stringNumber ?? issue.stringIndex ?? "";

  const es =
    first.energySegmentNumber ?? first.energySegmentIndex ??
    first.energySegment ?? first.es ??
    issue.energySegmentNumber ?? issue.energySegmentIndex ?? "";

  const bpc =
    first.bpc ?? first.bpcIndex ?? first.batteryPackIndex ??
    issue.bpc ?? issue.bpcIndex ?? "";

  const cg =
    first.cellGroupIndex ?? first.cellGroupNumber ?? first.cell ??
    issue.cellGroupIndex ?? "";

  const device =
    first.deviceIp ?? first.ip ?? issue.deviceIp ?? issue.ip ?? "";

  const object =
    first.object ?? issue.object ?? issue.affectedSummary ?? "";

  return [
    array || "A?",
    string || "S?",
    es || "ES?",
    bpc || "BPC?",
    cg || "CG?",
    device || "",
    object || ""
  ].join("|").toLowerCase();
}

function isGenericStringCorrectiveIssue(issue: any): boolean {
  const name = getCorrectiveIssueName(issue).toLowerCase();
  const code = getCorrectiveIssueCode(issue);

  return (
    name === "string fault" ||
    name === "string faults" ||
    name.includes("generic string") ||
    name.includes("string fault") ||
    code === "STRING" ||
    code === "STRING"
  );
}

function isCorrectiveRollupIssue(issue: any): boolean {
  const id = String(issue?.id || issue?.faultId || "").toLowerCase();
  const name = getCorrectiveIssueName(issue).toLowerCase();

  return (
    issue?.scope === "array" ||
    id.includes("rollup") ||
    name.includes("array has") ||
    name.includes("array-wide")
  );
}

function correctiveSpecificityRank(issue: any): number {
  const code = getCorrectiveIssueCode(issue);
  const name = getCorrectiveIssueName(issue).toLowerCase();
  const severity = String(issue?.severity || issue?.level || "").toLowerCase();

  let rank = 0;

  if (severity === "critical") rank += 1000;
  else if (severity === "alarm" || severity === "fault") rank += 800;
  else if (severity === "warning") rank += 500;
  else rank += 100;

  if (/^\d+$/.test(code)) rank += 250;
  if (code && code !== "PRIZM") rank += 200;

  if (name.includes("cgc") || name.includes("disconnect")) rank += 250;
  if (name.includes("bpc")) rank += 220;
  if (name.includes("cell group") || name.includes("cell-group")) rank += 200;
  if (name.includes("contactor")) rank += 190;
  if (name.includes("hvac")) rank += 180;

  if (isCorrectiveRollupIssue(issue)) rank -= 120;
  if (isGenericStringCorrectiveIssue(issue)) rank -= 300;

  return rank;
}

function shouldConsolidateCorrectiveIssues(primary: any, candidate: any): boolean {
  const primarySig = getCorrectiveTargetSignature(primary);
  const candidateSig = getCorrectiveTargetSignature(candidate);

  if (primarySig !== candidateSig) return false;

  if (isGenericStringCorrectiveIssue(candidate)) return true;
  if (isGenericStringCorrectiveIssue(primary)) return true;

  const pName = getCorrectiveIssueName(primary).toLowerCase();
  const cName = getCorrectiveIssueName(candidate).toLowerCase();

  if ((pName.includes("cgc") || cName.includes("cgc")) && (pName.includes("string fault") || cName.includes("string fault"))) {
    return true;
  }

  if ((pName.includes("bpc") || cName.includes("bpc")) && (pName.includes("string fault") || cName.includes("string fault"))) {
    return true;
  }

  return false;
}

function consolidateCorrectiveActionsForTechnician(issues: any[]): any[] {
  const sorted = [...(issues || [])].sort((a, b) => correctiveSpecificityRank(b) - correctiveSpecificityRank(a));
  const primaries: any[] = [];

  for (const issue of sorted) {
    const existing = primaries.find((primary) => shouldConsolidateCorrectiveIssues(primary, issue));

    if (!existing) {
      primaries.push({
        ...issue,
        relatedIssues: Array.isArray(issue.relatedIssues) ? issue.relatedIssues : [],
        suppressedDuplicateCount: issue.suppressedDuplicateCount || 0
      });
      continue;
    }

    const existingRank = correctiveSpecificityRank(existing);
    const candidateRank = correctiveSpecificityRank(issue);

    if (candidateRank > existingRank) {
      const replacement = {
        ...issue,
        relatedIssues: [
          ...(Array.isArray(issue.relatedIssues) ? issue.relatedIssues : []),
          existing,
          ...(Array.isArray(existing.relatedIssues) ? existing.relatedIssues : [])
        ],
        suppressedDuplicateCount:
          1 +
          (issue.suppressedDuplicateCount || 0) +
          (existing.suppressedDuplicateCount || 0)
      };

      const index = primaries.indexOf(existing);
      primaries[index] = replacement;
    } else {
      existing.relatedIssues = [
        ...(Array.isArray(existing.relatedIssues) ? existing.relatedIssues : []),
        issue
      ];
      existing.suppressedDuplicateCount =
        (existing.suppressedDuplicateCount || 0) +
        1 +
        (issue.suppressedDuplicateCount || 0);
    }
  }

  return primaries;
}


function isRuntimeHvacCorrectiveFinding(finding: any): boolean {
  const haystack = [
    finding?.subsystem,
    finding?.category,
    finding?.title,
    finding?.displayName,
    finding?.fault,
    finding?.faultName,
    finding?.code,
    finding?.faultCode,
    finding?.nativeFaultCode,
    finding?.normalizedFaultCode,
    finding?.correctiveActionCode,
    finding?.remediationStrategyId,
    finding?.evidence?.hvacUnit,
    finding?.evidence?.hvac,
    finding?.evidence?.mismatchType,
    finding?.evidence?.description,
    finding?.evidence?.detectedCondition,
    finding?.detectedCondition,
    finding?.recommendedAction,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes("hvac") ||
    haystack.includes("fan") ||
    haystack.includes("compressor") ||
    haystack.includes("current detected") ||
    haystack.includes("no current") ||
    haystack.includes("commanded") ||
    haystack.includes("freeze") ||
    haystack.includes("reversing valve") ||
    haystack.includes("reverse valve") ||
    haystack.includes("electric heat") ||
    haystack.includes("env-hvac") ||
    haystack.includes("environmental") && (
      haystack.includes("mismatch") ||
      haystack.includes("current") ||
      haystack.includes("command")
    )
  );
}

function getRuntimeCorrectiveFindingLatchKey(finding: any): string {
  const category = finding?.category || "unknown";
  const subsystem = finding?.subsystem || "unknown";
  const strategy = finding?.remediationStrategyId || finding?.normalizedFaultCode || finding?.code || finding?.title || "finding";
  const arrayNumber = finding?.arrayNumber ?? finding?.evidence?.arrayNumber ?? "A?";
  const stringNumber = finding?.stringNumber ?? finding?.evidence?.stringNumber ?? "S?";
  const hvacUnit =
    finding?.evidence?.hvacUnit ||
    finding?.evidence?.hvac ||
    finding?.hvacUnit ||
    (String(finding?.title || "").includes("HVAC 1") ? "HVAC1" :
     String(finding?.title || "").includes("HVAC 2") ? "HVAC2" :
     "HVAC?");
  const deviceIp = finding?.evidence?.deviceIp || finding?.deviceIp || finding?.ip || "";
  return [category, subsystem, strategy, arrayNumber, stringNumber, hvacUnit, deviceIp].join("|");
}

function applyRuntimeHvacCorrectiveLatch(previousFindings: any[], currentFindings: any[]): any[] {
  const now = Date.now();
  const maxMissedPolls = 3;
  const maxAgeMs = 90_000;

  const currentByKey = new Map<string, any>();
  const output: any[] = [];

  for (const finding of currentFindings || []) {
    if (isRuntimeHvacCorrectiveFinding(finding)) {
      const key = getRuntimeCorrectiveFindingLatchKey(finding);
      currentByKey.set(key, finding);
      output.push({
        ...finding,
        _prizmHvacLatch: {
          key,
          latched: true,
          firstSeenMs: finding?._prizmHvacLatch?.firstSeenMs || now,
          lastSeenMs: now,
          missedPolls: 0
        },
        evidence: {
          ...(finding?.evidence || {}),
          hvacLatchStatus: "active",
          hvacLatchLastSeenAt: new Date(now).toISOString()
        }
      });
    } else {
      output.push(finding);
    }
  }

  for (const previous of previousFindings || []) {
    if (!isRuntimeHvacCorrectiveFinding(previous)) continue;

    const previousLatch = previous?._prizmHvacLatch || {};
    const key = previousLatch.key || getRuntimeCorrectiveFindingLatchKey(previous);

    if (currentByKey.has(key)) continue;

    const lastSeenMs = Number(previousLatch.lastSeenMs || now);
    const firstSeenMs = Number(previousLatch.firstSeenMs || lastSeenMs);
    const missedPolls = Number(previousLatch.missedPolls || 0) + 1;

    if (missedPolls >= maxMissedPolls) continue;
    if (now - lastSeenMs > maxAgeMs) continue;

    output.push({
      ...previous,
      _prizmHvacLatch: {
        key,
        latched: true,
        firstSeenMs,
        lastSeenMs,
        missedPolls
      },
      evidence: {
        ...(previous?.evidence || {}),
        hvacLatchStatus: `retained after ${missedPolls} missed poll${missedPolls === 1 ? "" : "s"}`,
        hvacLatchFirstSeenAt: new Date(firstSeenMs).toISOString(),
        hvacLatchLastSeenAt: new Date(lastSeenMs).toISOString(),
        hvacLatchMissedPolls: missedPolls
      }
    });
  }

  return output;
}



function getHvacUnitNumberFromFinding(finding: any): 1 | 2 | null {
  const raw = [
    finding?.evidence?.hvacUnit,
    finding?.evidence?.hvac,
    finding?.hvacUnit,
    finding?.title,
    finding?.displayName,
    finding?.fault,
    finding?.faultName,
    finding?.remediationStrategyId,
    finding?.normalizedFaultCode,
    finding?.code,
  ].filter(Boolean).join(" ").toLowerCase();

  if (raw.includes("hvac 1") || raw.includes("hvac1") || raw.includes("unit 1")) return 1;
  if (raw.includes("hvac 2") || raw.includes("hvac2") || raw.includes("unit 2")) return 2;
  return null;
}

function resolveHvacRpmSupport(hvacType: unknown, fallbackUseRpm = false): boolean {
  return getHvacFeedbackProfile(hvacType) === "unknown"
    ? fallbackUseRpm
    : supportsFanSpeedFeedback(hvacType);
}

function getHvacRuntimeState(hvac: any, useFanRpmAsFaultIndicator = false, hvacType?: unknown) {
  const unit = hvac || {};
  const commanded = !!(
    unit.fanLowOn ||
    unit.fanHighOn ||
    unit.compressorOn ||
    unit.electricHeatOn ||
    unit.reversingValveOn
  );

  const currentA = Number(unit.currentA || 0);
  const fanSpeedRpm = Number(unit.fanSpeedRpm || 0);

  const rpmSupported = resolveHvacRpmSupport(hvacType, useFanRpmAsFaultIndicator);
  const active = !!(
    currentA > 0.2 ||
    (rpmSupported && fanSpeedRpm > 0)
  );

  return {
    commanded,
    active,
    currentA,
    fanSpeedRpm,
    useFanRpmAsFaultIndicator: rpmSupported,
    isNormalExpectedActual: commanded === active
  };
}

function getHvacFindingMismatchType(finding: any): "commanded_not_active" | "active_not_commanded" | "generic_mismatch" {
  const raw = [
    finding?.evidence?.mismatchType,
    finding?.evidence?.detectedCondition,
    finding?.evidence?.description,
    finding?.detectedCondition,
    finding?.title,
    finding?.displayName,
    finding?.fault,
    finding?.faultName,
    finding?.remediationStrategyId,
    finding?.normalizedFaultCode,
    finding?.code,
  ].filter(Boolean).join(" ").toLowerCase();

  if (
    raw.includes("commanded_not_active") ||
    raw.includes("commanded-no-current") ||
    raw.includes("commanded no current") ||
    raw.includes("commanded on but no current") ||
    raw.includes("commanded but no active")
  ) {
    return "commanded_not_active";
  }

  if (
    raw.includes("active_not_commanded") ||
    raw.includes("current-without-command") ||
    raw.includes("current without command") ||
    raw.includes("active feedback detected without") ||
    raw.includes("current detected without command")
  ) {
    return "active_not_commanded";
  }

  return "generic_mismatch";
}

function findMatchingFeatherDeviceForHvacFinding(finding: any, featherDevices: any[]): any | null {
  const findingArray = Number(finding?.arrayNumber ?? finding?.evidence?.arrayNumber);
  const findingString = Number(finding?.stringNumber ?? finding?.evidence?.stringNumber);
  const findingIp = finding?.evidence?.deviceIp || finding?.deviceIp || finding?.ip;

  if (findingIp) {
    const byIp = featherDevices.find((d: any) => d?.ip === findingIp || d?.deviceIp === findingIp);
    if (byIp) return byIp;
  }

  if (Number.isFinite(findingArray) && Number.isFinite(findingString)) {
    const byString = featherDevices.find((d: any) => {
      const arr = Number(d?.arrayIndex ?? d?.arrayNumber);
      const str = Number(d?.stringIndex ?? d?.stringNumber);
      return arr === findingArray && str === findingString;
    });
    if (byString) return byString;
  }

  return null;
}

function isLatchedHvacFindingClearedByNormalReport(
  finding: any,
  featherDevices: any[],
  useFanRpmAsFaultIndicator = false
): boolean {
  const device = findMatchingFeatherDeviceForHvacFinding(finding, featherDevices || []);
  if (!device) return false;

  const hvacUnit = getHvacUnitNumberFromFinding(finding);
  const mismatchType = getHvacFindingMismatchType(finding);

  const unitNumbers: Array<1 | 2> = hvacUnit ? [hvacUnit] : [1, 2];

  for (const unitNumber of unitNumbers) {
    const hvac = unitNumber === 1 ? device?.hvac1 : device?.hvac2;
    if (!hvac) continue;

    const state = getHvacRuntimeState(hvac, useFanRpmAsFaultIndicator, device?.hvacType);

    if (mismatchType === "commanded_not_active") {
      // Clear only when that HVAC is still commanded AND now has current/RPM feedback.
      if (state.commanded && state.active) return true;
      continue;
    }

    if (mismatchType === "active_not_commanded") {
      // Clear only when that HVAC is no longer active while not commanded.
      if (!state.commanded && !state.active) return true;
      continue;
    }

    // Generic HVAC mismatch clears only when expected and actual agree.
    if (state.isNormalExpectedActual) return true;
  }

  return false;
}



function getArrayNumberFromFeatherDevice(device: any): number | undefined {
  const direct = Number(device?.arrayIndex ?? device?.arrayNumber ?? device?.topology?.arrayIndex ?? device?.topology?.arrayNumber);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const ip = String(device?.ip || device?.deviceIp || "");
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && Number.isFinite(parts[2]) && parts[2] > 0) return parts[2];

  return undefined;
}

function getSegmentDescriptorFromFeatherDevice(device: any): {
  segmentType: "energy" | "collection" | "unknown";
  segmentNumber?: number;
  label: string;
} {
  const rawLabel = String(
    device?.segmentLabel ||
    device?.topology?.segmentLabel ||
    device?.displayName ||
    device?.entityDescription ||
    ""
  );

  if (/\bCS\b|collection/i.test(rawLabel)) {
    return {
      segmentType: "collection",
      label: "Collection Segment"
    };
  }

  const labelMatch = rawLabel.match(/\bES\s*([0-9]+)/i);
  if (labelMatch) {
    const parsed = Number(labelMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        segmentType: "energy",
        segmentNumber: parsed,
        label: `Energy Segment ${parsed}`
      };
    }
  }

  const direct = Number(
    device?.energySegmentIndex ??
    device?.segmentIndex ??
    device?.topology?.segmentIndex ??
    device?.topology?.energySegmentIndex
  );

  if (Number.isFinite(direct) && direct > 0) {
    return {
      segmentType: "energy",
      segmentNumber: direct,
      label: `Energy Segment ${direct}`
    };
  }

  const ip = String(device?.ip || device?.deviceIp || "");
  const host = Number(ip.split(".")[3]);

  // Feather collection segment commonly appears at host .3.
  if (host === 3) {
    return {
      segmentType: "collection",
      label: "Collection Segment"
    };
  }

  // Feather ES IPs commonly appear in 5-step host spacing: .10 = ES1, .15 = ES2, .20 = ES3, etc.
  if (Number.isFinite(host) && host > 0) {
    const inferred = Math.round((host - 5) / 5);
    if (Number.isInteger(inferred) && inferred > 0) {
      return {
        segmentType: "energy",
        segmentNumber: inferred,
        label: `Energy Segment ${inferred}`
      };
    }
  }

  return {
    segmentType: "unknown",
    label: "Segment ?"
  };
}

function getEnergySegmentNumberFromFeatherDevice(device: any): number | undefined {
  const segment = getSegmentDescriptorFromFeatherDevice(device);
  return segment.segmentType === "energy" ? segment.segmentNumber : undefined;
}

function getTopologyConvertedLocation(entity: any, energySegmentsPerLineup: number): {
  label: string;
  detail: string;
} | null {
  const segmentsPerLineup = Math.max(1, Math.floor(energySegmentsPerLineup)) + 1;
  const displayKey = String(entity?.displayKey || "");
  const entityKey = String(entity?.entityKey || "");
  const entityType = String(entity?.entityType || "");
  const numericToken = displayKey.match(/:(\d+)\s*$/)?.[1] || entityKey.match(/_(\d+)\s*$/)?.[1];
  const rawValue = Number(numericToken);
  if (/AcBatteryBlock/i.test(entityType)) {
    return { label: "Block-level device", detail: "Not assigned to one enclosure" };
  }
  if (/BlockMeter/i.test(entityType) && Number.isFinite(rawValue)) {
    return { label: `Block-level meter · Unit ${rawValue}`, detail: "Not assigned to one enclosure" };
  }
  if (!Number.isFinite(rawValue) || rawValue < 1) return null;

  let globalSegmentIndex: number | null = null;
  let devicePosition: number | null = null;

  if (/feather/i.test(entityType)) {
    const lineup = Math.floor(rawValue / 100);
    const localPosition = rawValue % 100;
    if (lineup > 0 && localPosition >= 1 && localPosition <= segmentsPerLineup) {
      globalSegmentIndex = (lineup - 1) * segmentsPerLineup + localPosition;
    }
  } else if (/\bups\b/i.test(entityType)) {
    globalSegmentIndex = Math.floor(rawValue / 100);
    devicePosition = rawValue % 100;
  } else if (/Humidity Temperature Sensor|OpenClosedDetector/i.test(entityType) && rawValue >= 100) {
    globalSegmentIndex = Math.floor(rawValue / 100);
    devicePosition = rawValue % 100;
  } else if (/FirePanelAddr|^FirePanel$|BlockEnclosure|CentipedeTeamDataDispatcher/i.test(entityType)) {
    globalSegmentIndex = rawValue;
  } else if (/ACBattery|^Battery$/i.test(entityType)) {
    return { label: `Lineup ${rawValue} · Lineup-level device`, detail: "Associated with the full lineup" };
  } else if (/^PCS$/i.test(entityType)) {
    const pcsLineup = Number(displayKey.match(/:(\d+):\d+\s*$/)?.[1]);
    const lineup = Number.isFinite(pcsLineup) && pcsLineup > 0 ? pcsLineup : rawValue;
    return { label: `Lineup ${lineup} · PCS`, detail: "Lineup-level power conversion equipment" };
  } else if (/OpenClosedDetector/i.test(entityType)) {
    return { label: "Block-level detector", detail: `Detector ${rawValue} · not assigned to one enclosure` };
  }

  if (!globalSegmentIndex || globalSegmentIndex < 1) return null;
  const lineup = Math.floor((globalSegmentIndex - 1) / segmentsPerLineup) + 1;
  const localPosition = ((globalSegmentIndex - 1) % segmentsPerLineup) + 1;
  const segmentLabel = localPosition === 1 ? "Collection Segment" : `Energy Segment ${localPosition - 1}`;
  return {
    label: `Lineup ${lineup} · ${segmentLabel}${devicePosition ? ` · ${/Humidity Temperature Sensor/i.test(entityType) ? "Sensor" : /OpenClosedDetector/i.test(entityType) ? "Detector" : "Unit"} ${devicePosition}` : ""}`,
    detail: `Segment index ${globalSegmentIndex}`,
  };
}

function inferEnergySegmentsPerLineupFromTopology(topology: any[]): number | null {
  const collectionIndices = Array.from(new Set((topology || []).flatMap((entity: any) => {
    const entityType = String(entity?.entityType || "");
    const entitySubType = String(entity?.entitySubType || "");
    const isCollectionAnchor =
      /^FirePanel$/i.test(entityType) ||
      /^FirePanelAddrCS$/i.test(entityType) ||
      (/^BlockEnclosure$/i.test(entityType) && /collection/i.test(entitySubType));
    if (!isCollectionAnchor) return [];
    const displayKey = String(entity?.displayKey || "");
    const entityKey = String(entity?.entityKey || "");
    const value = Number(displayKey.match(/:(\d+)\s*$/)?.[1] || entityKey.match(/_(\d+)\s*$/)?.[1]);
    return Number.isFinite(value) && value > 0 ? [value] : [];
  }))).sort((a, b) => a - b);

  if (collectionIndices.length < 2) return null;
  const gapCounts = new Map<number, number>();
  for (let index = 1; index < collectionIndices.length; index += 1) {
    const gap = collectionIndices[index] - collectionIndices[index - 1];
    if (gap > 1 && gap <= 100) gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1);
  }
  const bestGap = Array.from(gapCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (!bestGap || bestGap[1] < 2) return null;
  return bestGap[0] - 1;
}

function getHvacTargetLabelFromFeatherDevice(device: any, hvacUnit: 1 | 2, faultLabel?: string): string {
  const arrayNumber = getArrayNumberFromFeatherDevice(device);
  const segment = getSegmentDescriptorFromFeatherDevice(device);

  const base = [
    arrayNumber ? `Array ${arrayNumber}` : "Array ?",
    segment.label,
    `HVAC ${hvacUnit}`
  ].join(", ");

  return faultLabel ? `${base} — ${faultLabel}` : base;
}

function getHvacIssueNameFromMismatchType(mismatchType: string): string {
  if (mismatchType === "commanded_not_active") {
    return "Commanded ON, current/RPM below expected range";
  }

  if (mismatchType === "active_not_commanded") {
    return "Current/RPM present without HVAC command";
  }

  return "HVAC command/feedback mismatch";
}

function getHvacGroupedCodeFromMismatchType(mismatchType: string): string {
  if (mismatchType === "commanded_not_active") return "ENV-HVAC-COMMANDED-NO-CURRENT";
  if (mismatchType === "active_not_commanded") return "ENV-HVAC-CURRENT-WITHOUT-COMMAND";
  return "ENV-HVAC-FEEDBACK-MISMATCH";
}


function getHvacTargetLabelFromFinding(finding: any): string {
  const ev = finding?.evidence || {};

  const rawArray =
    finding?.arrayNumber ??
    ev?.arrayNumber ??
    ev?.arrayIndex ??
    finding?.target?.arrayNumber ??
    finding?.target?.arrayIndex;

  const arrayNumber = Number(rawArray);

  const rawSegment =
    finding?.energySegmentNumber ??
    ev?.energySegmentNumber ??
    ev?.segmentNumber ??
    ev?.segmentIndex ??
    finding?.target?.energySegmentNumber ??
    finding?.target?.segmentNumber;

  const segmentNumber = Number(rawSegment);

  const rawSegmentText = String(
    ev?.segmentLabel ||
    finding?.segmentLabel ||
    finding?.target?.segmentLabel ||
    finding?.displayName ||
    finding?.title ||
    ""
  );

  let segmentLabel = "Segment ?";
  if (/collection|\\bCS\\b/i.test(rawSegmentText)) {
    segmentLabel = "Collection Segment";
  } else if (Number.isFinite(segmentNumber) && segmentNumber > 0) {
    segmentLabel = `Energy Segment ${segmentNumber}`;
  }

  const rawHvac = String(
    ev?.hvacUnit ||
    ev?.hvac ||
    finding?.hvacUnit ||
    finding?.title ||
    finding?.displayName ||
    finding?.fault ||
    finding?.faultName ||
    ""
  );

  let hvacLabel = "HVAC ?";
  if (/hvac\\s*1|hvac1|unit\\s*1/i.test(rawHvac)) hvacLabel = "HVAC 1";
  else if (/hvac\\s*2|hvac2|unit\\s*2/i.test(rawHvac)) hvacLabel = "HVAC 2";

  const faultLabel =
    ev?.groupedIssueName ||
    ev?.detectedCondition ||
    finding?.issueName ||
    finding?.faultName ||
    finding?.fault ||
    finding?.title ||
    "HVAC command/feedback mismatch";

  const base = [
    Number.isFinite(arrayNumber) && arrayNumber > 0 ? `Array ${arrayNumber}` : "Array ?",
    segmentLabel,
    hvacLabel
  ].join(", ");

  return `${base} — ${String(faultLabel).replace(/^HVAC\\s+—\\s+/i, "")}`;
}




function getCorrectiveExpandedPanelClass(): string {
  return "bg-white border border-slate-200 text-slate-900 shadow-sm";
}

function getCorrectiveExpandedSubpanelClass(): string {
  return "bg-slate-50 border border-slate-200 text-slate-900";
}

function getCorrectiveExpandedHeaderClass(): string {
  return "text-emerald-700 font-black uppercase tracking-wider";
}

function getCorrectiveExpandedBodyClass(): string {
  return "text-slate-800 font-semibold";
}

function getCorrectiveExpandedMutedClass(): string {
  return "text-slate-600";
}

function getCorrectiveIssuePrimaryCode(issue: any): string {
  return String(
    issue?.nativeFaultCode ||
    issue?.faultCode ||
    issue?.normalizedFaultCode ||
    issue?.correctiveActionCode ||
    issue?.code ||
    issue?.faultId ||
    "—"
  );
}

function isIgnoredOperationalNotification(issue: any): boolean {
  const codes = [
    issue?.nativeFaultCode,
    issue?.faultCode,
    issue?.normalizedFaultCode,
    issue?.correctiveActionCode,
    issue?.code,
    issue?.faultId,
    issue?.id
  ].map((value) => String(value ?? "").trim());
  return codes.includes("2534") || codes.includes("2561");
}

function getCorrectiveIssueTitleForTile(issue: any): string {
  const raw = String(
    issue?.issueName ||
    issue?.displayName ||
    issue?.faultName ||
    issue?.fault ||
    issue?.title ||
    issue?.name ||
    "Corrective action"
  );

  const primaryCode = String(
    issue?.code || issue?.faultCode || issue?.normalizedFaultCode || ""
  ).trim();

  const withoutRepeatedCode = primaryCode && raw.toUpperCase().startsWith(primaryCode.toUpperCase())
    ? raw.slice(primaryCode.length).replace(/^\s*[-—:]?\s*/, "")
    : raw;

  return withoutRepeatedCode
    .replace(/^Array\s+[^—]+—\s*/i, "")
    .replace(/^Block\s+[^—]+—\s*/i, "")
    .replace(/^HVAC\s+—\s*/i, "HVAC — ")
    .trim();
}

type CorrectiveHvacTargetRow = {
  key: string;
  arrayNumber: number | null;
  segmentNumber: number | null;
  hvacUnit: number | null;
  deviceIp: string | null;
  commanded: boolean | null;
  active: boolean | null;
  currentA: number | null;
  hvac1Commanded: boolean | null;
  hvac1CurrentA: number | null;
  hvac2Commanded: boolean | null;
  hvac2CurrentA: number | null;
  crossUnitMismatch: string | null;
  label: string;
};

function getCorrectiveHvacTargetRows(issue: any): CorrectiveHvacTargetRow[] {
  const labels = getCorrectiveExpandedTargetLabels(issue);
  const related = [
    issue,
    ...(Array.isArray(issue?.relatedIssues) ? issue.relatedIssues : []),
    ...(Array.isArray(issue?.related) ? issue.related : []),
    ...(Array.isArray(issue?.children) ? issue.children : [])
  ];

  const finite = (value: any): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const bool = (value: any): boolean | null => {
    if (value === true || value === false) return value;
    if (value === null || value === undefined || value === "") return null;
    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    return null;
  };
  const coordinates = (label: string) => ({
    arrayNumber: finite(label.match(/array\s*(\d+)/i)?.[1]),
    segmentNumber: finite(label.match(/(?:energy\s*)?segment\s*(\d+)/i)?.[1]),
    hvacUnit: finite(label.match(/hvac\s*([12])/i)?.[1]),
    deviceIp: label.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0] || null
  });

  const rows = labels.map((label) => {
    const parsed = coordinates(label);
    const matching = related.find((candidate: any) => {
      const evidence = candidate?.evidence || {};
      const candidateLabel = String(evidence?.targetLabel || candidate?.targetLabel || candidate?.stringKey || "");
      const candidateCoordinates = coordinates(candidateLabel);
      const candidateArray = finite(candidate?.arrayNumber ?? evidence?.arrayNumber) ?? candidateCoordinates.arrayNumber;
      const candidateSegment = finite(candidate?.energySegmentNumber ?? evidence?.energySegmentNumber) ?? candidateCoordinates.segmentNumber;
      const candidateUnit = finite(evidence?.hvacUnit ?? candidate?.hvacUnit) ?? candidateCoordinates.hvacUnit;
      const candidateIp = String(evidence?.deviceIp || candidate?.deviceIp || candidateCoordinates.deviceIp || "");
      return candidateArray === parsed.arrayNumber
        && candidateSegment === parsed.segmentNumber
        && candidateUnit === parsed.hvacUnit
        && (!parsed.deviceIp || !candidateIp || candidateIp === parsed.deviceIp);
    });
    const evidence = matching?.evidence || {};
    const paired = evidence?.pairedHvac || {};
    const hvac1Commanded = bool(paired?.hvac1?.commanded);
    const hvac1CurrentA = finite(paired?.hvac1?.currentA);
    const hvac2Commanded = bool(paired?.hvac2?.commanded);
    const hvac2CurrentA = finite(paired?.hvac2?.currentA);
    const h1HasCurrent = (hvac1CurrentA ?? 0) > 0.2;
    const h2HasCurrent = (hvac2CurrentA ?? 0) > 0.2;
    const crossUnitMismatch = hvac1Commanded === true && !h1HasCurrent && h2HasCurrent
      ? "H1 commanded · H2 has current"
      : hvac2Commanded === true && !h2HasCurrent && h1HasCurrent
        ? "H2 commanded · H1 has current"
        : null;
    return {
      key: `${parsed.arrayNumber ?? "?"}-${parsed.segmentNumber ?? "?"}-${parsed.hvacUnit ?? "?"}`,
      ...parsed,
      commanded: bool(evidence?.commanded),
      active: bool(evidence?.active),
      currentA: finite(evidence?.currentA ?? evidence?.measuredCurrentA),
      hvac1Commanded,
      hvac1CurrentA,
      hvac2Commanded,
      hvac2CurrentA,
      crossUnitMismatch,
      label
    };
  });

  return rows.sort((a, b) =>
    (a.arrayNumber ?? 9999) - (b.arrayNumber ?? 9999)
    || (a.segmentNumber ?? 9999) - (b.segmentNumber ?? 9999)
    || (a.hvacUnit ?? 9999) - (b.hvacUnit ?? 9999)
  );
}






function getCorrectiveExpandedTargetLabels(issue: any): string[] {
  const items = [
    issue,
    ...(Array.isArray(issue?.relatedIssues) ? issue.relatedIssues : []),
    ...(Array.isArray(issue?.related) ? issue.related : []),
    ...(Array.isArray(issue?.children) ? issue.children : []),
    ...(Array.isArray(issue?.occurrences) ? issue.occurrences : [])
  ];

  const rawLabels: string[] = [];

  const addLabel = (value: any) => {
    const label = String(value || "").trim();
    if (!label) return;
    if (/^block\s+\d+$/i.test(label)) return;
    if (/target group/i.test(label)) return;
    if (!rawLabels.includes(label)) rawLabels.push(label);
  };

  for (const item of items) {
    addLabel(item?.evidence?.targetLabel);
    addLabel(item?.targetLabel);
    addLabel(item?.stringKey);

    const affectedTargets =
      item?.evidence?.affectedTargets ||
      item?.affectedTargets ||
      item?.targets;

    if (Array.isArray(affectedTargets)) {
      for (const target of affectedTargets) addLabel(target);
    }
  }

  const locationUnits = new Map<string, Set<string>>();
  const coordinates = (label: string) => {
    const reportedIp = label.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0];
    const ipParts = reportedIp?.split(".").map(Number) || [];
    const ipArray = ipParts.length === 4 && ipParts[0] === 10 && ipParts[1] === 0 && ipParts[2] > 0
      ? ipParts[2]
      : undefined;
    const ipSegment = ipParts.length === 4 && ipParts[3] >= 10 && (ipParts[3] - 5) % 5 === 0
      ? (ipParts[3] - 5) / 5
      : undefined;
    const array = label.match(/array\s*(\d+)/i)?.[1] || (ipArray ? String(ipArray) : undefined);
    const segment = label.match(/(?:energy\s*)?segment\s*(\d+)/i)?.[1] || (ipSegment ? String(ipSegment) : undefined);
    const unit = Array.from(label.matchAll(/HVAC\s*([12])\b/gi)).map((match) => match[1])[0];
    const derivedHost = segment ? 5 + (Number(segment) * 5) : undefined;
    const derivedIp = array && derivedHost && derivedHost <= 255 ? `10.0.${Number(array)}.${derivedHost}` : undefined;
    const ip = reportedIp || derivedIp;
    return { array, segment, unit, ip, locationKey: `${array || "?"}|${segment || "?"}` };
  };

  rawLabels.forEach((label) => {
    const target = coordinates(label);
    if (!target.unit) return;
    const units = locationUnits.get(target.locationKey) || new Set<string>();
    units.add(target.unit);
    locationUnits.set(target.locationKey, units);
  });

  const canonical = new Map<string, string>();
  rawLabels.forEach((label) => {
    const target = coordinates(label);
    if (!target.array && !target.segment && !target.unit && !target.ip) return;
    const knownUnits = locationUnits.get(target.locationKey);
    const inferredUnit = target.unit || (knownUnits?.size === 1 ? Array.from(knownUnits)[0] : undefined);

    // An unidentified raw duplicate adds no information when the same location
    // already has one or more unit-specific targets.
    if (!inferredUnit && knownUnits && knownUnits.size > 0) return;

    const base = [
      target.array ? `Array ${target.array}` : "Array not identified",
      target.segment ? `Energy Segment ${target.segment}` : "Segment not identified",
      inferredUnit ? `HVAC ${inferredUnit}` : "HVAC unit not identified",
      target.ip ? `IP ${target.ip}` : null
    ].filter(Boolean).join(", ");
    // IP is enrichment, not device identity: the same Feather unit is commonly
    // reported once with an IP and once without it.
    const key = `${target.locationKey}|${inferredUnit || "unknown"}`;
    const existing = canonical.get(key);
    // Prefer a label with an IP address when two sources describe the same unit.
    if (!existing || (target.ip && !/\bIP\s+/i.test(existing))) canonical.set(key, base);
  });

  return Array.from(canonical.values())
    .sort((a, b) => compareCorrectiveLocation({ targetLabel: a }, { targetLabel: b }));
}

function isCorrectiveHvacIssue(issue: any): boolean {
  const text = [
    issue?.subsystem,
    issue?.resolved?.system,
    issue?.code,
    issue?.faultCode,
    issue?.nativeFaultCode,
    issue?.evidence?.faultCode,
    issue?.evidence?.normalizedFaultCode,
    issue?.title,
    issue?.issueName,
    issue?.resolved?.issueName
  ].map((v) => String(v || "").toLowerCase()).join(" ");

  return text.includes("hvac") || text.includes("env-hvac");
}

type CorrectiveCategory = {
  id: "hvac" | "string-cell" | "other";
  label: string;
  description: string;
  issues: any[];
};

function correctiveLocationTuple(value: any): number[] {
  const text = [
    value?.targetLabel,
    value?.affectedSummary,
    value?.object,
    value?.title,
    value?.faultName,
    ...(Array.isArray(value?.affectedTargets) ? value.affectedTargets : []),
    ...(Array.isArray(value?.affected) ? value.affected : [])
  ].map(String).join(" ");
  const pick = (pattern: RegExp) => Number(text.match(pattern)?.[1] || 9999);
  return [
    Number(value?.arrayNumber ?? value?.arrayIndex ?? value?.evidence?.arrayNumber ?? pick(/array\s*(\d+)/i)) || 9999,
    Number(value?.energySegmentNumber ?? value?.segmentNumber ?? value?.evidence?.energySegmentNumber ?? pick(/(?:energy\s*)?segment\s*(\d+)/i)) || 9999,
    pick(/hvac\s*(\d+)/i),
    Number(value?.stringNumber ?? value?.stringIndex ?? value?.evidence?.stringNumber ?? pick(/string\s*(\d+)/i)) || 9999,
    pick(/(?:bpc|pack)\s*(\d+)/i),
    pick(/(?:cell(?:\s*group)?|cg)\s*(\d+)/i)
  ];
}

function compareCorrectiveLocation(a: any, b: any): number {
  const av = correctiveLocationTuple(a);
  const bv = correctiveLocationTuple(b);
  for (let i = 0; i < av.length; i += 1) {
    if (av[i] !== bv[i]) return av[i] - bv[i];
  }
  return getCorrectiveIssueTitleForTile(a).localeCompare(getCorrectiveIssueTitleForTile(b));
}

function getCorrectiveCategories(issues: any[]): CorrectiveCategory[] {
  const visible = (issues || []).filter((issue: any) => {
    return !!issue;
  });
  const isStringCell = (issue: any) => {
    const text = [issue?.subsystem, issue?.resolved?.system, issue?.code, issue?.title, issue?.faultName, issue?.issueName]
      .map((v) => String(v || "").toLowerCase()).join(" ");
    return /string|cell|battery|bpc|contactor|balanc/.test(text);
  };
  const definitions: Omit<CorrectiveCategory, "issues">[] = [
    { id: "hvac", label: "HVAC / Environmental", description: "Alarms and warnings ordered by array, segment, and HVAC unit" },
    { id: "string-cell", label: "String / Cell", description: "String, BPC, cell, contactor, and balancing issues in equipment order" },
    { id: "other", label: "Other Site Issues", description: "PCS, communications, controls, and remaining site findings" }
  ];
  return definitions.map((category) => ({
    ...category,
    issues: visible.filter((issue) => category.id === "hvac"
      ? isCorrectiveHvacIssue(issue)
      : category.id === "string-cell"
        ? !isCorrectiveHvacIssue(issue) && isStringCell(issue)
        : !isCorrectiveHvacIssue(issue) && !isStringCell(issue)).sort(compareCorrectiveLocation)
  })).filter((category) => category.issues.length > 0);
}

function getExpandedCorrectiveTargetsForDisplay(issue: any): string[] {
  const targets = getCorrectiveAffectedTargets(issue);

  const cleaned = targets
    .map((target: any) => String(target || "").trim())
    .filter(Boolean)
    .filter((target: string) => {
      const lower = target.toLowerCase();
      if (lower.includes("grouped") && lower.includes("target group")) return false;
      if (lower.includes("condensed") && lower.includes("target")) return false;
      if (lower === "block 1") return false;
      if (lower === "block") return false;
      return true;
    });

  const unique = Array.from(new Set(cleaned));

  if (unique.length > 0) return unique;

  // Fallback for grouped HVAC rows whose target list was stored only in evidence.
  const evidenceTargets = issue?.evidence?.affectedTargets;
  if (Array.isArray(evidenceTargets)) {
    return Array.from(
      new Set(
        evidenceTargets
          .map((target: any) => String(target || "").trim())
          .filter(Boolean)
          .filter((target: string) => !target.toLowerCase().includes("target group"))
      )
    );
  }

  return [];
}

function getCorrectiveAffectedTargets(issue: any): string[] {
  const out = new Set<string>();

  const add = (value: any) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }

    const text = String(value).trim();
    if (!text || text === "—") return;
    out.add(text);
  };

  add(issue?.affectedTargets);
  add(issue?.affected);
  add(issue?.occurrences);
  add(issue?.evidence?.affectedTargets);
  add(issue?.evidence?.targetLabel);
  add(issue?.targetLabel);

  if (String(issue?.subsystem || "").toLowerCase() === "hvac") {
    try {
      const generated = getHvacTargetLabelFromFinding(issue);
      if (generated && !generated.includes("Array ?")) add(generated);
    } catch {}
  }

  const related =
    issue?.relatedIssues ||
    issue?.suppressedDuplicates ||
    issue?.duplicates ||
    [];

  if (Array.isArray(related)) {
    related.forEach((relatedIssue: any) => {
      add(relatedIssue?.affectedTargets);
      add(relatedIssue?.affected);
      add(relatedIssue?.occurrences);
      add(relatedIssue?.evidence?.affectedTargets);
      add(relatedIssue?.evidence?.targetLabel);
      add(relatedIssue?.targetLabel);

      if (String(relatedIssue?.subsystem || "").toLowerCase() === "hvac") {
        try {
          const generated = getHvacTargetLabelFromFinding(relatedIssue);
          if (generated && !generated.includes("Array ?")) add(generated);
        } catch {}
      }
    });
  }

  return Array.from(out);
}

function getCorrectiveAffectedSummaryForTile(issue: any): string {
  const targets = getCorrectiveAffectedTargets(issue);
  const count = Number(issue?.count || issue?.affectedCount || targets.length || 0);

  if (targets.length > 1 || count > 1) {
    return `${Math.max(count, targets.length)} targets affected`;
  }

  if (targets.length === 1) return targets[0];

  return String(issue?.affectedSummary || issue?.managerSummary || "Target details unavailable");
}

function getCorrectiveManagerSummaryForTile(issue: any): string {
  const targets = getCorrectiveAffectedTargets(issue);
  const title = getCorrectiveIssueTitleForTile(issue);

  if (targets.length > 1) {
    return `${targets.length} locations report ${title}. Expand row to review affected targets.`;
  }

  return String(
    issue?.managerSummary ||
    issue?.summary ||
    issue?.detectedCondition ||
    issue?.evidence?.detectedCondition ||
    title
  );
}

function expandConsolidatedHvacRelatedTargets(issues: any[]): any[] {
  return (issues || []).map((issue: any) => {
    const isHvac =
      String(issue?.subsystem || "").toLowerCase() === "hvac" ||
      String(issue?.code || issue?.faultCode || issue?.normalizedFaultCode || "").startsWith("ENV-HVAC") ||
      String(issue?.title || issue?.fault || issue?.faultName || issue?.issueName || "").toLowerCase().includes("hvac");

    if (!isHvac) return issue;

    const targets = new Set<string>();

    const addTarget = (value: any) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(addTarget);
        return;
      }
      let text = String(value).trim();
      if (!text) return;
      if (/HVAC\s*\?/i.test(text)) {
        const afterPlaceholder = text.split(/HVAC\s*\?/i).slice(1).join(" ");
        const reportedUnit = afterPlaceholder.match(/HVAC\s*([12])\b/i)?.[1];
        if (reportedUnit) text = text.replace(/HVAC\s*\?/i, `HVAC ${reportedUnit}`);
      }
      targets.add(text);
    };

    const addFindingTargets = (finding: any) => {
      if (!finding) return;

      addTarget(finding?.affectedTargets);
      addTarget(finding?.affected);
      addTarget(finding?.occurrences);
      addTarget(finding?.evidence?.affectedTargets);
      addTarget(finding?.evidence?.targetLabel);
      addTarget(finding?.targetLabel);

      try {
        const generated = getHvacTargetLabelFromFinding(finding);
        if (generated && !generated.includes("Array ?")) addTarget(generated);
      } catch {}
    };

    addFindingTargets(issue);

    const related =
      issue?.relatedIssues ||
      issue?.suppressedDuplicates ||
      issue?.duplicates ||
      [];

    if (Array.isArray(related)) {
      related.forEach(addFindingTargets);
    }

    const allTargets = Array.from(targets);
    const knownHvacLocations = new Set(
      allTargets
        .filter((target) => /HVAC\s*[12]\b/i.test(target))
        .map((target) => target.replace(/HVAC\s*[12]\b.*$/i, "").trim().toLowerCase())
    );
    const affectedTargets = allTargets
      .filter((target) => {
        if (!/HVAC\s*\?/i.test(target)) return true;
        const location = target.replace(/HVAC\s*\?.*$/i, "").trim().toLowerCase();
        return !knownHvacLocations.has(location);
      })
      .sort((a, b) => compareCorrectiveLocation({ targetLabel: a }, { targetLabel: b }));

    if (affectedTargets.length === 0) return issue;

    return {
      ...issue,
      count: affectedTargets.length,
      affectedCount: affectedTargets.length,
      suppressedDuplicateCount: Math.max(0, affectedTargets.length - 1),
      affectedTargets,
      affected: affectedTargets,
      occurrences: affectedTargets,
      evidence: {
        ...(issue?.evidence || {}),
        grouped: true,
        affectedTargets
      }
    };
  });
}

function compactRuntimeCorrectiveActionsForTile(findings: any[]): any[] {
  const groups = new Map<string, any>();
  const passthrough: any[] = [];

  for (const finding of findings || []) {
    const isHvac =
      String(finding?.subsystem || "").toLowerCase() === "hvac" ||
      String(finding?.normalizedFaultCode || finding?.code || "").startsWith("ENV-HVAC") ||
      String(finding?.title || "").toLowerCase().includes("hvac");

    if (!isHvac) {
      passthrough.push(finding);
      continue;
    }

    const mismatchType =
      finding?.evidence?.mismatchType ||
      (String(finding?.normalizedFaultCode || finding?.code || "").includes("CURRENT-WITHOUT-COMMAND")
        ? "active_not_commanded"
        : String(finding?.normalizedFaultCode || finding?.code || "").includes("COMMANDED-NO-CURRENT")
          ? "commanded_not_active"
          : "generic_mismatch");

    const groupedCode = getHvacGroupedCodeFromMismatchType(mismatchType);
    const issueName = getHvacIssueNameFromMismatchType(mismatchType);
    const key = `hvac|${groupedCode}|${mismatchType}`;

    const targetLabel = getHvacTargetLabelFromFinding(finding);

    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        ...finding,
        id: `grouped-${key}`,
        code: groupedCode,
        normalizedFaultCode: groupedCode,
        faultCode: groupedCode,
        correctiveActionCode: groupedCode,
        title: `HVAC — ${issueName}`,
        displayName: `HVAC — ${issueName}`,
        fault: `HVAC — ${issueName}`,
        faultName: `HVAC — ${issueName}`,
        issueName: `HVAC — ${issueName}`,
        count: 1,
        affectedCount: 1,
        suppressedDuplicateCount: 0,
        affectedTargets: targetLabel ? [targetLabel] : [],
        affected: targetLabel ? [targetLabel] : [],
        occurrences: targetLabel ? [targetLabel] : [],
        evidence: {
          ...(finding?.evidence || {}),
          grouped: true,
          groupedCode,
          groupedIssueName: issueName,
          affectedTargets: targetLabel ? [targetLabel] : []
        },
        relatedIssues: [],
        recommendedAction:
          mismatchType === "commanded_not_active"
            ? "Review affected targets by Array, Segment, and HVAC number. Confirm HVAC command state in PRIZM and the local controller, then verify power, relay/contactor output, unit amperage, and local HVAC alarms."
            : mismatchType === "active_not_commanded"
              ? "Confirm no HVAC command is active in PRIZM or the local controller. Verify relay/contactor state, feedback wiring, current sensor scaling, and whether the HVAC is running locally without command."
              : "Compare each HVAC command against its matching unit amperage and local controller status. Verify wiring, feedback scaling, relay state, and local HVAC alarms."
      });
    } else {
      const targets = new Set<string>(existing.affectedTargets || []);
      if (targetLabel) targets.add(targetLabel);

      const affectedTargets = Array.from(targets);

      groups.set(key, {
        ...existing,
        count: affectedTargets.length,
        affectedCount: affectedTargets.length,
        suppressedDuplicateCount: Math.max(0, affectedTargets.length - 1),
        affectedTargets,
        affected: affectedTargets,
        occurrences: affectedTargets,
        relatedIssues: [
          ...(Array.isArray(existing?.relatedIssues) ? existing.relatedIssues : []),
          finding
        ],
        evidence: {
          ...(existing?.evidence || {}),
          affectedTargets
        }
      });
    }
  }

  return [
    ...Array.from(groups.values()),
    ...passthrough
  ];
}

function synthesizeRuntimeHvacCorrectiveFindingsFromFeather(
  featherDevices: any[],
  useFanRpmAsFaultIndicator = false
): any[] {
  const findings: any[] = [];

  const getState = (hvac: any, hvacType: unknown) => {
    const unit = hvac || {};
    const commanded = !!(
      unit.fanLowOn ||
      unit.fanHighOn ||
      unit.compressorOn ||
      unit.electricHeatOn ||
      unit.reversingValveOn
    );

    const currentA = Number(unit.currentA || 0);
    const fanSpeedRpm = Number(unit.fanSpeedRpm || 0);

    const rpmSupported = resolveHvacRpmSupport(hvacType, useFanRpmAsFaultIndicator);
    const active = !!(
      currentA > 0.2 ||
      (rpmSupported && fanSpeedRpm > 0)
    );

    return {
      commanded,
      active,
      currentA,
      fanSpeedRpm,
      useFanRpmAsFaultIndicator: rpmSupported
    };
  };

  for (const device of featherDevices || []) {
    const arrayNumber = getArrayNumberFromFeatherDevice(device);
    const energySegmentNumber = getEnergySegmentNumberFromFeatherDevice(device);
    const deviceIp = device?.ip || device?.deviceIp || "";
    const unitStates = {
      1: getState(device?.hvac1, device?.hvacType),
      2: getState(device?.hvac2, device?.hvacType)
    };

    for (const hvacUnit of [1, 2] as const) {
      const hvac = hvacUnit === 1 ? device?.hvac1 : device?.hvac2;
      if (!hvac) continue;

      const state = unitStates[hvacUnit];
      let mismatchType: "commanded_not_active" | "active_not_commanded" | null = null;

      if (state.commanded && !state.active) mismatchType = "commanded_not_active";
      else if (!state.commanded && state.active) mismatchType = "active_not_commanded";

      if (!mismatchType) continue;

      const issueName = getHvacIssueNameFromMismatchType(mismatchType);
      const normalizedFaultCode = getHvacGroupedCodeFromMismatchType(mismatchType);
      const targetLabel = getHvacTargetLabelFromFeatherDevice(device, hvacUnit, issueName);

      findings.push({
        id: `runtime-feather-hvac-${arrayNumber || "x"}-${energySegmentNumber || deviceIp || "x"}-${hvacUnit}-${mismatchType}`,
        title: `HVAC — ${issueName}`,
        displayName: `HVAC — ${issueName}`,
        fault: `HVAC — ${issueName}`,
        faultName: `HVAC — ${issueName}`,
        issueName: `HVAC — ${issueName}`,
        category: "environmental",
        subsystem: "hvac",
        severity: mismatchType === "active_not_commanded" ? "alarm" : "warning",
        arrayNumber,
        energySegmentNumber,
        deviceIp,
        targetLabel,
        code: normalizedFaultCode,
        normalizedFaultCode,
        faultCode: normalizedFaultCode,
        correctiveActionCode: normalizedFaultCode,
        remediationStrategyId:
          mismatchType === "commanded_not_active"
            ? "hvac-commanded-no-current"
            : "hvac-current-without-command",
        affected: [targetLabel],
        occurrences: [targetLabel],
        evidence: {
          source: "feather-runtime-synthesized",
          deviceIp,
          targetLabel,
          arrayNumber,
          energySegmentNumber,
          hvacUnit: `HVAC ${hvacUnit}`,
          mismatchType,
          commanded: state.commanded,
          active: state.active,
          currentA: state.currentA,
          fanSpeedRpm: state.fanSpeedRpm,
          reportedHvacType: device?.hvacType || null,
          hvacEquipmentProfile: state.useFanRpmAsFaultIndicator ? "Bergstrom / RPM feedback enabled" : "Dometic / RPM feedback ignored",
          hvacProfileSource: getHvacFeedbackProfile(device?.hvacType) === "unknown" ? "fallback" : "feather",
          fanRpmUsedAsFaultIndicator: state.useFanRpmAsFaultIndicator,
          pairedHvac: {
            hvac1: {
              commanded: unitStates[1].commanded,
              active: unitStates[1].active,
              currentA: unitStates[1].currentA,
              fanSpeedRpm: unitStates[1].fanSpeedRpm
            },
            hvac2: {
              commanded: unitStates[2].commanded,
              active: unitStates[2].active,
              currentA: unitStates[2].currentA,
              fanSpeedRpm: unitStates[2].fanSpeedRpm
            }
          },
          detectedCondition: issueName
        },
        recommendedAction:
          mismatchType === "commanded_not_active"
            ? "Review affected targets by Array, Segment, and HVAC number. Confirm HVAC command state in PRIZM and local controller, then verify HVAC power, relay/contactor output, current feedback, RPM feedback, and local HVAC controller alarms."
            : "Confirm no HVAC command is active in PRIZM or local controller. Verify relay/contactor state, feedback wiring, current sensor scaling, and whether the HVAC is running locally without command."
      });
    }
  }

  return findings;
}

function applyRuntimeHvacCorrectiveLatchStore(
  latchStore: Map<string, any>,
  currentFindings: any[],
  featherDevices: any[] = [],
  useFanRpmAsFaultIndicator = false
): any[] {
  const now = Date.now();
  const output: any[] = [];
  const seenThisPoll = new Set<string>();

  for (const finding of currentFindings || []) {
    if (!isRuntimeHvacCorrectiveFinding(finding)) {
      output.push(finding);
      continue;
    }

    const key = getRuntimeCorrectiveFindingLatchKey(finding);
    const existing = latchStore.get(key);

    const latchedFinding = {
      ...(existing?.finding || {}),
      ...finding,
      _prizmHvacLatch: {
        key,
        latched: true,
        firstSeenMs: existing?.firstSeenMs || now,
        lastSeenMs: now,
        clearMode: "normal_expected_actual_report_required"
      },
      evidence: {
        ...(existing?.finding?.evidence || {}),
        ...(finding?.evidence || {}),
        hvacLatchStatus: "active",
        hvacLatchClearMode: "Clears only after matching HVAC report shows normal expected/actual values",
        hvacLatchFirstSeenAt: new Date(existing?.firstSeenMs || now).toISOString(),
        hvacLatchLastSeenAt: new Date(now).toISOString()
      }
    };

    latchStore.set(key, {
      finding: latchedFinding,
      firstSeenMs: existing?.firstSeenMs || now,
      lastSeenMs: now
    });

    seenThisPoll.add(key);
    output.push(latchedFinding);
  }

  for (const [key, entry] of Array.from(latchStore.entries())) {
    if (seenThisPoll.has(key)) continue;

    const retainedFinding = entry?.finding;
    if (!retainedFinding) {
      latchStore.delete(key);
      continue;
    }

    if (isLatchedHvacFindingClearedByNormalReport(retainedFinding, featherDevices, useFanRpmAsFaultIndicator)) {
      latchStore.delete(key);
      continue;
    }

    const firstSeenMs = Number(entry?.firstSeenMs || now);
    const lastSeenMs = Number(entry?.lastSeenMs || firstSeenMs);

    const retained = {
      ...retainedFinding,
      _prizmHvacLatch: {
        key,
        latched: true,
        firstSeenMs,
        lastSeenMs,
        clearMode: "normal_expected_actual_report_required"
      },
      evidence: {
        ...(retainedFinding?.evidence || {}),
        hvacLatchStatus: "retained until normal expected/actual HVAC report",
        hvacLatchClearMode: "Clears only after matching HVAC report shows normal expected/actual values",
        hvacLatchFirstSeenAt: new Date(firstSeenMs).toISOString(),
        hvacLatchLastSeenAt: new Date(lastSeenMs).toISOString()
      }
    };

    latchStore.set(key, {
      finding: retained,
      firstSeenMs,
      lastSeenMs
    });

    output.push(retained);
  }

  return output;
}


export default function SiteOperationsDashboard({
  setActiveTab,
  active = true,
}: {
  setActiveTab?: (tab: string) => void;
  active?: boolean;
}) {
  const hasVal = (val: any) =>
    val !== null &&
    val !== undefined &&
    val !== "" &&
    val !== "NaN" &&
    !(typeof val === "number" && Number.isNaN(val));

  const [state, setState] = useState<DashboardState>({
    loading: true,
    cacheStatus: null,
    stringsDashboard: null,
    featherDevices: null,
    safetyFaults: null,
    overviewDiscovery: null,
    siteSummary: null,
    historyEvents: null,
  });

  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [expandedCorrectiveActions, setExpandedCorrectiveActions] = useState<
    Record<string, boolean>
  >({});
  const [expandedCorrectiveCategories, setExpandedCorrectiveCategories] = useState<Record<string, boolean>>({
    hvac: true,
    "string-cell": true,
    other: true
  });
  const [expandedCorrectiveTarget, setExpandedCorrectiveTarget] = useState<string | null>(null);
  const [showCorrectiveExportOptions, setShowCorrectiveExportOptions] = useState(false);
  const [correctiveExportingFormat, setCorrectiveExportingFormat] = useState<string | null>(null);
  const [topologySearch, setTopologySearch] = useState("");
  const [topologyTypeFilter, setTopologyTypeFilter] = useState("all");
  const [topologyHealthFilter, setTopologyHealthFilter] = useState("all");
  const [topologyRowLimit, setTopologyRowLimit] = useState(150);
  const [topologyView, setTopologyView] = useState<"table" | "oneline">("table");
  const [selectedTopologyArray, setSelectedTopologyArray] = useState<number | null>(null);
  const [topologyRequested, setTopologyRequested] = useState(false);
  const [topologyEnergySegmentsPerLineup, setTopologyEnergySegmentsPerLineup] = useState(() => {
    const saved = Number(localStorage.getItem("prizm_topology_energy_segments_per_lineup"));
    return Number.isFinite(saved) && saved >= 1 ? Math.floor(saved) : 20;
  });
  const [topologySegmentSizingMode, setTopologySegmentSizingMode] = useState<"auto" | "manual">(() =>
    localStorage.getItem("prizm_topology_segment_sizing_mode") === "manual" ? "manual" : "auto"
  );
  const inferredTopologyEnergySegments = React.useMemo(
    () => inferEnergySegmentsPerLineupFromTopology(state.siteSummary?.topology || []),
    [state.siteSummary?.topology]
  );
  const [runtimeCorrectiveActions, setRuntimeCorrectiveActions] = useState<any[]>([]);
  const runtimeHvacCorrectiveLatchRef = React.useRef<Map<string, any>>(new Map());
  const [hvacUseFanRpmForFaults, setHvacUseFanRpmForFaults] = useState<boolean>(() => {
    return localStorage.getItem("prizm_hvac_use_fan_rpm_fault_indicator") === "true";
  });

  useEffect(() => {
    localStorage.setItem("prizm_topology_energy_segments_per_lineup", String(topologyEnergySegmentsPerLineup));
  }, [topologyEnergySegmentsPerLineup]);

  useEffect(() => {
    localStorage.setItem("prizm_topology_segment_sizing_mode", topologySegmentSizingMode);
  }, [topologySegmentSizingMode]);

  useEffect(() => {
    if (topologySegmentSizingMode === "auto" && inferredTopologyEnergySegments && inferredTopologyEnergySegments !== topologyEnergySegmentsPerLineup) {
      setTopologyEnergySegmentsPerLineup(inferredTopologyEnergySegments);
    }
  }, [topologySegmentSizingMode, inferredTopologyEnergySegments, topologyEnergySegmentsPerLineup]);

  useEffect(() => {
    localStorage.setItem(
      "prizm_hvac_use_fan_rpm_fault_indicator",
      hvacUseFanRpmForFaults ? "true" : "false"
    );
  }, [hvacUseFanRpmForFaults]);
  const runtimeFeatherDevicesRef = React.useRef<any[]>([]);
const [runtimeCorrectiveSummary, setRuntimeCorrectiveSummary] = useState<any>(null);
  const [runtimeCorrectiveLoading, setRuntimeCorrectiveLoading] = useState(false);
  const toggleCorrectiveAction = (idx: string) => {
    setExpandedCorrectiveActions((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    const loadRuntimeCorrectiveActions = async () => {
      setRuntimeCorrectiveLoading(true);
      try {
        const res = await fetch("/api/local/strings/dashboard/corrective-actions");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();

          let liveFeatherDevices = runtimeFeatherDevicesRef.current;

          try {
            const featherRes = await fetch("/api/feather/devices?cache=cache-first&maxAgeMs=60000");
            if (featherRes.ok) {
              const featherJson = await featherRes.json();
              liveFeatherDevices =
                Array.isArray(featherJson?.devices) ? featherJson.devices :
                Array.isArray(featherJson?.data?.devices) ? featherJson.data.devices :
                runtimeFeatherDevicesRef.current;

              runtimeFeatherDevicesRef.current = liveFeatherDevices;
            }
          } catch (featherErr) {
            console.warn("Corrective HVAC synthesis could not load Feather devices", featherErr);
          }

          const compactedFindings = compactRuntimeCorrectiveActionsForTile(
              applyRuntimeHvacCorrectiveLatchStore(
              runtimeHvacCorrectiveLatchRef.current,
              [
                ...(Array.isArray(json?.findings) ? json.findings : []),
                ...synthesizeRuntimeHvacCorrectiveFindingsFromFeather(liveFeatherDevices, hvacUseFanRpmForFaults)
              ],
              liveFeatherDevices,
              hvacUseFanRpmForFaults
            ));

          let enrichedFindings = compactedFindings;
          try {
            const resolveRes = await fetch("/api/local/corrective-actions/resolve", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: compactedFindings })
            });
            if (resolveRes.ok) {
              const resolveJson = await resolveRes.json();
              const resolved = Array.isArray(resolveJson?.resolved) ? resolveJson.resolved : [];
              enrichedFindings = compactedFindings.map((finding: any, index: number) => ({
                ...finding,
                resolved: resolved[index] || finding.resolved
              }));
            }
          } catch (resolveErr) {
            console.warn("Corrective guidance resolution unavailable", resolveErr);
          }

          setRuntimeCorrectiveActions(enrichedFindings);
          setRuntimeCorrectiveSummary(json?.summary || null);
      } catch (err) {
        console.warn("[SiteOperationsDashboard] corrective-actions fetch failed", err);
        if (!cancelled) {
          setRuntimeCorrectiveActions([]);
          setRuntimeCorrectiveSummary(null);
        }
      } finally {
        if (!cancelled) setRuntimeCorrectiveLoading(false);
      }
    };

    loadRuntimeCorrectiveActions();
    const timer = window.setInterval(loadRuntimeCorrectiveActions, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, hvacUseFanRpmForFaults]);

  const exportCorrectiveActionsPdf = async (
    pdfFormat: "field-work-order" | "field-handoff" | "checklist-report"
  ) => {
    setCorrectiveExportingFormat(pdfFormat);
    try {
      const response = await fetch("/api/local/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: "corrective-actions",
          format: "pdf",
          pdfFormat,
          runtimeCorrectiveActions,
          runtimeCorrectiveSummary,
          displayedCorrectiveActions,
          rawDisplayedCorrectiveActions,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Corrective action PDF export failed");
      }

      if (result.downloadUrl) {
        window.open(result.downloadUrl, "_blank");
      }
    } catch (err) {
      console.error("[CorrectiveActionsExport] PDF export failed", err);
      alert(err instanceof Error ? err.message : "Corrective action PDF export failed");
    } finally {
      setCorrectiveExportingFormat(null);
      setShowCorrectiveExportOptions(false);
    }
  };
  const [rotationCapabilities, setRotationCapabilities] = useState<any>(null);
  const [pcsModalOpen, setPcsModalOpen] = useState(false);
  const [pcsModalTargets, setPcsModalTargets] = useState<RotationTarget[]>([]);
  const [pcsModalAction, setPcsModalAction] = useState<"in" | "out">("in");
  const [pcsActionPending, setPcsActionPending] = useState(false);
  useEffect(() => {
    let unmounted = false;
    fetchJsonWithTimeout("/api/local/capabilities", { timeoutMs: 1500 })
      .then((v) => {
        if (!unmounted) setRotationCapabilities(v);
      })
      .catch(() => {});
    return () => {
      unmounted = true;
    };
  }, []);
  const handlePcsConfirm = async (req: any) => {
    await fetch("/api/local/pcs/rotation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    setPcsModalOpen(false);
    triggerRefresh(true);
  };

  // EMS App control states
  const [emsAppCandidate, setEmsAppCandidate] = useState<any>(null);
  const [emsAppTargetState, setEmsAppTargetState] = useState<boolean>(false);
  const [emsAppLoading, setEmsAppLoading] = useState(false);
  const [emsAppResult, setEmsAppResult] = useState<any>(null);
  const [powerControlCandidate, setPowerControlCandidate] = useState<any>(null);
  const [powerControlKw, setPowerControlKw] = useState(0);
  const [powerControlKvar, setPowerControlKvar] = useState(0);
  const [powerControlLoading, setPowerControlLoading] = useState(false);
  const [powerControlResult, setPowerControlResult] = useState<any>(null);

  const openPowerControl = (app: any) => {
    const text = String(app.appStatus || "");
    setPowerControlKw(Number(text.match(/Real Power:\s*(-?[\d.]+)/i)?.[1] || 0));
    setPowerControlKvar(Number(text.match(/Reactive Power:\s*(-?[\d.]+)/i)?.[1] || 0));
    setPowerControlResult(null);
    setPowerControlCandidate(app);
  };

  const executePowerControl = async () => {
    if (!powerControlCandidate) return;
    setPowerControlLoading(true); setPowerControlResult(null);
    try {
      const response = await fetch("/api/local/ems-apps/power-control", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationCode: state.siteSummary?.site?.stationCode || "BHE0020",
          blockIndex: state.siteSummary?.site?.blockIndex || 1,
          priority: powerControlCandidate.priority,
          realPowerkW: powerControlKw,
          reactivePowerkVAr: powerControlKvar,
          requestedBy: "local-overview",
        }),
      });
      const data = await response.json(); setPowerControlResult(data);
      if (data.success) triggerRefresh(true);
    } catch (error: any) { setPowerControlResult({ success: false, message: error.message }); }
    finally { setPowerControlLoading(false); }
  };

  const executeEmsAppAction = async (candidate = emsAppCandidate, targetState = emsAppTargetState) => {
    if (!candidate) return;
    const expectedText = `${targetState ? "ENABLE" : "DISABLE"} ${candidate.appCode}`;

    setEmsAppCandidate(candidate);
    setEmsAppTargetState(targetState);

    setEmsAppLoading(true);
    setEmsAppResult(null);

    try {
      const res = await fetch("/api/local/ems-apps/enabled-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationCode: state.siteSummary?.site?.stationCode || "BHE0020",
          blockIndex: state.siteSummary?.site?.blockIndex || 1,
          appCode: candidate.appCode,
          priority: candidate.priority,
          enabled: targetState,
          // The server still validates a command-specific token. The UI creates it
          // from the deliberate action click so operators never have to type it.
          confirmationText: expectedText,
          requestedBy: "local-overview",
        }),
      });
      const data = await res.json();
      setEmsAppResult(data);
      if (data.success || data.queued) {
        // Refresh data
        triggerRefresh(true);
      }
    } catch (err: any) {
      setEmsAppResult({ success: false, message: err.message });
    } finally {
      setEmsAppLoading(false);
    }
  };

  const [clearCandidate, setClearCandidate] = useState<any>(null);
  const [clearConfRef, setClearConfRef] = useState("");
  const [clearLoading, setClearLoading] = useState(false);
  const [clearResult, setClearResult] = useState<any>(null);

  const [debugExpanded, setDebugExpanded] = useState(false);

  const dispatchSafetyClear = async (candidate: any, confirmationText: string) => {
    if (!candidate?.allowFaultReset || !candidate?.entityKeyToken) {
      setClearResult({ error: "This device is not currently eligible for a safety fault reset." });
      return;
    }
    setClearLoading(true);
    setClearResult(null);
    try {
      const profileId =
        state.siteSummary?.site?.profileId || state.stringsDashboard?.profileId;
      const operatorUsername = "local-overview";
      const res = await fetch("/api/local/safety-fault-clear/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          entityKeyToken: candidate.entityKeyToken,
          confirmationText,
          operatorUsername,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Execute failed");
      setClearResult(j);
      if (j.ok || j.queued) triggerRefresh(true);
    } catch (e: any) {
      setClearResult({ error: e.message });
    } finally {
      setClearLoading(false);
    }
  };

  // Typed confirmation path retained for the full Safety Clear workflow.
  const executeClear = async () => {
    if (!clearCandidate || clearConfRef !== clearCandidate.entityKeyToken) {
      setClearResult({ error: "Confirmation text does not match" });
      return;
    }
    await dispatchSafetyClear(clearCandidate, clearConfRef);
  };

  // Summary-page fast action: one deliberate click on an EMS-eligible row.
  const executeOneClickClear = async (candidate: any) => {
    setClearCandidate(candidate);
    setClearConfRef("");
    setClearResult(null);
    await dispatchSafetyClear(candidate, "CLEAR FAULT");
  };

  const fetchSummaryWithTopology = async (url: string, timeoutMs: number) => {
    return fetchJsonWithTimeout(url, { timeoutMs });
  };

  useEffect(() => {
    if (!active || !topologyRequested || (state.siteSummary?.topology || []).length > 0) return;
    let cancelled = false;
    fetchJsonWithTimeout("/api/local/snapshot/topology", { timeoutMs: 10000 })
      .then((topologyRes) => {
        if (cancelled) return;
        const topologyData = topologyRes?.data;
        const topology = Array.isArray(topologyData)
          ? topologyData
          : Array.isArray(topologyData?.entities)
            ? topologyData.entities
            : Array.isArray(topologyData?.topology)
              ? topologyData.topology
              : [];
        setState((prev) => ({ ...prev, siteSummary: { ...(prev.siteSummary || {}), topology } }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active, topologyRequested, state.siteSummary?.topology]);

  const triggerRefresh = (sectionRefresh = false) => {
    let url = "/api/local/site-data/block-summary";
    if (sectionRefresh || state.cacheStatus?.policy === "live-only") {
      url += "?refresh=true";
    }
    fetchSummaryWithTopology(url, sectionRefresh ? 20000 : 5000)
      .then((summaryRes) => {
        setState((prev) => ({
          ...prev,
          siteSummary: { ...summaryRes, topology: prev.siteSummary?.topology || [] },
          loading: false,
        }));
      })
      .catch((err) => {
        setState((prev) => ({
          ...prev,
          siteSummary: { error: err.message },
          loading: false,
        }));
      });
  };

  useEffect(() => {
    let unmounted = false;

    const fetchSummary = async (isFirst = false, cachePol: string | null = null) => {
      let url = "/api/local/site-data/block-summary";
      if (cachePol === "live-only") {
        url += "?refresh=true";
      }
      try {
        const summaryRes = await fetchSummaryWithTopology(url, isFirst ? 25000 : 5000);
        if (!unmounted)
          setState((prev) => ({
            ...prev,
            siteSummary: { ...summaryRes, topology: prev.siteSummary?.topology || [] },
            loading: false,
          }));
      } catch (err: any) {
        if (!unmounted)
          setState((prev) => ({
            ...prev,
            siteSummary: { error: err.message },
            loading: false,
          }));
      }
    };

    const fetchData = async () => {
      let currentPol = state.cacheStatus?.policy;
      if (!currentPol) {
        const status = await fetchJsonWithTimeout("/api/local/cache/status", {
          timeoutMs: 1500,
        }).catch(() => {});
        if (!unmounted && status) {
          setState((p) => ({ ...p, cacheStatus: status }));
          currentPol = status.policy;
        }
      }

      await fetchSummary(true, currentPol);

      // Side fetches
      if (!unmounted) {
        fetchJsonWithTimeout("/api/local/history/events?range=24h", {
          timeoutMs: 1500,
        })
          .then((v) => {
            if (!unmounted) setState((p) => ({ ...p, historyEvents: v }));
          })
          .catch(() => {});
      }
    };

    fetchData();
    const interval = setInterval(async () => {
      if (unmounted || !active || document.hidden) return;
      const status = await fetchJsonWithTimeout("/api/local/cache/status", {
        timeoutMs: 1500,
      }).catch(() => {});
      if (!unmounted && status && active) {
        setState((p) => ({ ...p, cacheStatus: status }));
        let url = "/api/local/site-data/block-summary";
        if (status.policy === "live-only") {
          url += "?refresh=true";
        }
        try {
          const summaryRes = await fetchSummaryWithTopology(url, 5000);
          if (!unmounted && active) {
            // Only clear error if we succeeded
            setState((prev) => ({ ...prev, siteSummary: { ...summaryRes, topology: prev.siteSummary?.topology || [] } }));
          }
        } catch (err) {
          // Do not overwrite with error on background polling failure, just let it ride
        }
      }
    }, 15000);
    return () => {
      unmounted = true;
      clearInterval(interval);
    };
  }, [active]);

  const sum = state.siteSummary;

  // Since SiteDataContext delays rendering SiteOperationsDashboard until the first snapshot is ready,
  // we can use a very brief ghost state while the local fetch connects, without showing a slow loading text.
  if (state.loading && !sum) {
     return <div className="p-6 text-prizm-text-muted font-mono text-xs animate-pulse opacity-50">Syncing operations...</div>;
  }

  if (sum?.error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 mt-10">
        <div className="bg-white border border-slate-200 text-slate-900 border border-prizm-danger shadow-xl p-6 rounded-lg text-center max-w-md">
          <TriangleAlert
            size={48}
            className="text-prizm-danger mx-auto mb-4 opacity-80"
          />
          <h2 className="text-xl font-bold text-white mb-2 uppercase tracking-wide">
            Summary Unavailable
          </h2>
          <p className="text-prizm-text-muted mb-6 font-mono text-[11px]">
            {sum.error}
          </p>
          <button
            onClick={() => triggerRefresh(true)}
            className="px-6 py-2 bg-prizm-primary/20 text-emerald-700 border border-prizm-primary/50 hover:bg-prizm-primary/30 rounded uppercase tracking-wider font-bold transition-colors"
          >
            Retry Live Refresh
          </button>
        </div>
      </div>
    );
  }

  let siteState = "UNAVAILABLE";
  if (
    sum?.site?.connectionState === "disconnected" ||
    sum?.source === "offline"
  ) {
    siteState = "OFFLINE";
  } else if (sum?.site?.source === "partial" || sum?.stale) {
    siteState = "PARTIAL";
  } else if (
    sum?.site?.connectionState ||
    sum?.source ||
    sum?.cacheUsed !== undefined
  ) {
    siteState = "LIVE";
  }

  const stationCode = sum?.site?.stationCode || "UNKNOWN";
  const emsBaseUrl = sum?.site?.emsBaseUrl || "--";
  const blockIndex = sum?.site?.blockIndex || "--";
  const profileId = sum?.site?.profileId || "--";

  const emsAppsData = sum?.emsApps || [];
  const pcsData = sum?.pcsSummary || [];
  const htsData = sum?.humidityTemperatureSensors || [];
  const featherSummary = sum?.featherSummary || {};

  const stringBuckets = sum?.stringSummary?.buckets || {
    online: 0,
    nearline: 0,
    offline: 0,
    notCommunicating: 0,
  };
  const onlineStats = sum?.stringSummary?.rollups?.online || {
    count: sum?.stringSummary?.buckets?.online || 0,
  };
  const nearlineStats = sum?.stringSummary?.rollups?.nearline || {
    count: sum?.stringSummary?.buckets?.nearline || 0,
  };
  const offlineStats = sum?.stringSummary?.rollups?.offline || {
    count: sum?.stringSummary?.buckets?.offline || 0,
  };
  const notCommStats = sum?.stringSummary?.rollups?.notCommunicating || {
    count: sum?.stringSummary?.buckets?.notCommunicating || 0,
  };
  const rollups = sum?.stringSummary?.rollups ||
    state.stringsDashboard?.rollups || {
      totalStrings:
        stringBuckets.online +
          stringBuckets.nearline +
          stringBuckets.offline +
          stringBuckets.notCommunicating || 0,
    };

  // Voltage Normalization Helpers moved to lib/voltageNormalizer.ts
  const { soc: systemSoc, source: socSource } = getSystemSocAndSource(sum, rollups);

  // Filter and normalize array summary data
  const arraySummaryData = filterAndNormalizeArraySummary(sum?.arraySummary || []);

  const activeIssues = sum?.activeIssueGroups ? [...sum.activeIssueGroups] : [];
  activeIssues.sort((a: any, b: any) => {
    const severityRank: Record<string, number> = {
      ALARM: 1,
      WARNING: 2,
      STALE: 3,
      INFO: 4,
    };
    return (severityRank[a.severity] || 5) - (severityRank[b.severity] || 5);
  });

  const legacyCorrectiveActions = Array.isArray(sum?.correctiveActions) ? sum.correctiveActions : [];

  const runtimeCorrectiveIssues = runtimeCorrectiveActions.map((finding: any) => {
    const categoryLabel =
      finding?.category === "string_battery" ? "String / Battery" :
      finding?.category === "environmental" ? "Environmental" :
      finding?.category === "controls_comms" ? "Controls / Comms" :
      finding?.category === "pcs_array" ? "PCS / Array" :
      finding?.category === "site_system" ? "Site Level" :
      "Corrective";

    const nativeFaultCode =
      finding?.nativeFaultCode ||
      finding?.faultCode ||
      finding?.evidence?.nativeFaultCode ||
      finding?.evidence?.faultCode ||
      finding?.evidence?.code ||
      null;

    const normalizedFaultCode =
      finding?.normalizedFaultCode ||
      finding?.code ||
      (
        finding?.remediationStrategyId === "contactor-feedback-mismatch" ? "STR-CON-MISMATCH" :
        finding?.remediationStrategyId === "contactor-requested-closed-actual-open" ? "STR-CON-EXPECTED-CLOSED-ACTUAL-OPEN" :
        finding?.remediationStrategyId === "contactor-requested-open-actual-closed" ? "STR-CON-EXPECTED-OPEN-ACTUAL-CLOSED" :
        finding?.remediationStrategyId === "array-wide-open-contactors" ? "ARR-CON-EXPECTED-CLOSED-ACTUAL-OPEN" :
        finding?.remediationStrategyId === "hvac-commanded-no-current" ? "ENV-HVAC-COMMANDED-NO-CURRENT" :
        finding?.remediationStrategyId === "hvac-current-without-command" ? "ENV-HVAC-CURRENT-WITHOUT-COMMAND" :
        finding?.remediationStrategyId === "hvac-command-current-crossmatch" ? "ENV-HVAC-CROSSMATCH" :
        finding?.remediationStrategyId === "hvac-freeze-detected" ? "ENV-HVAC-FREEZE-DETECTED" :
        finding?.subsystem ? `${String(finding.subsystem).toUpperCase()}-FAULT` :
        "PRIZM-NORMALIZED-FAULT"
      );

    const displayFaultCode = nativeFaultCode || normalizedFaultCode;

    const locationParts = [];

    const arrayNumber =
      finding?.arrayNumber !== undefined && finding?.arrayNumber !== null
        ? Number(finding.arrayNumber)
        : null;

    const stringNumber =
      finding?.stringNumber !== undefined && finding?.stringNumber !== null
        ? Number(finding.stringNumber)
        : null;

    const explicitEnergySegment =
      finding?.energySegmentNumber ??
      finding?.energySegmentIndex ??
      finding?.evidence?.energySegmentNumber ??
      finding?.evidence?.energySegmentIndex ??
      null;

    const derivedEnergySegment =
      stringNumber !== null && Number.isFinite(stringNumber)
        ? stringNumberToEnergySegment(stringNumber)
        : null;

    const energySegmentNumber = explicitEnergySegment ?? derivedEnergySegment;

    const side =
      finding?.side ||
      finding?.evidence?.side ||
      (
        stringNumber !== null && Number.isFinite(stringNumber)
          ? (stringNumber % 2 === 1 ? "Side A" : "Side B")
          : null
      );

    if (arrayNumber !== null && Number.isFinite(arrayNumber)) {
      locationParts.push(`Array ${arrayNumber}`);
    }

    if (energySegmentNumber !== null && energySegmentNumber !== undefined) {
      locationParts.push(`ES${energySegmentNumber}`);
    }

    if (side) {
      locationParts.push(String(side));
    }

    if (stringNumber !== null && Number.isFinite(stringNumber)) {
      locationParts.push(`String ${stringNumber}`);
    }

    if (!locationParts.length && finding?.stringKey) {
      locationParts.push(String(finding.stringKey));
    }

    if (finding?.evidence?.deviceIp) {
      locationParts.push(String(finding.evidence.deviceIp));
    }

    const location = locationParts.length ? locationParts.join(" / ") : categoryLabel;

    const target = {
      source: finding?.subsystem || finding?.category || "corrective-actions",
      system: finding?.category,
      detailView: finding?.subsystem,
      arrayNumber: finding?.arrayNumber,
      arrayIndex: finding?.arrayNumber,
      stringNumber: finding?.stringNumber,
      stringIndex: finding?.stringNumber,
      energySegmentNumber,
      energySegmentIndex: energySegmentNumber,
      side,
      deviceIp: finding?.evidence?.deviceIp,
      ip: finding?.evidence?.deviceIp,
      object: location,
      title: finding?.title
    };

    return {
      ...finding,
      code: displayFaultCode,
      nativeFaultCode,
      normalizedFaultCode,
      level: String(finding?.severity || "warning").toUpperCase(),
      severity: String(finding?.severity || "warning").toUpperCase(),
      fault: finding?.title,
      faultName: finding?.title,
      displayName: `${location} — ${finding?.title || "Corrective Action"}`,
      faultId: finding?.id,
      faultCode: displayFaultCode,
      affected: [target],
      occurrences: [target],
      affectedSummary: location,
      object: location,
      suggestedAction:
        finding?.remediation?.technicianSteps?.[0] ||
        finding?.recommendedActions?.[0] ||
        (
          finding?.subsystem === "hvac"
            ? "Compare HVAC command state against measured current and verify output/current sensor mapping."
            : finding?.subsystem === "contactor"
              ? "Compare requested contactor state against positive/negative feedback and verify the affected string is safe before inspection."
              : "Review corrective action details, source evidence, and remediation guidance."
        ),
      resolved: finding?.resolved?.resolvedTroubleshooting ? finding.resolved : {
        resolvedTroubleshooting: {
          issueName: finding?.title,
          managerSummary:
            finding?.detectedCondition ||
            finding?.remediation?.overview ||
            "PRIZM detected an actionable condition from normalized live data.",
          summaryAction:
            finding?.remediation?.technicianSteps?.[0] ||
            finding?.recommendedActions?.[0] ||
            (
              finding?.subsystem === "hvac"
                ? "Verify HVAC command/current relationship and check for swapped outputs, stuck relay, or current sensor mapping issue."
                : finding?.subsystem === "contactor"
                  ? "Verify requested state, positive/negative feedback, and safe electrical condition before physical inspection."
                  : "Review finding evidence and recommended remediation steps."
            )
        }
      },
      runtimeCorrectiveAction: true,
      categoryLabel,
      remediationTitle: finding?.remediation?.title
    };
  });

  const rawDisplayedCorrectiveActions = [
    ...runtimeCorrectiveIssues,
    ...legacyCorrectiveActions
  ];

  const displayedCorrectiveActions = expandConsolidatedHvacRelatedTargets(
    consolidateCorrectiveActionsForTechnician(rawDisplayedCorrectiveActions)
  ).filter((issue: any) => !isIgnoredOperationalNotification(issue));

  const correctiveAffectedCount = (action: any) => {
    const explicit = Number(action?.affectedCount ?? action?.count);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    if (Array.isArray(action?.affected) && action.affected.length > 0) return action.affected.length;
    if (Array.isArray(action?.affectedTargets) && action.affectedTargets.length > 0) return action.affectedTargets.length;
    return 1;
  };
  const displayedCorrectiveAffectedCount = displayedCorrectiveActions.reduce(
    (total: number, action: any) => total + correctiveAffectedCount(action),
    0
  );
  const displayedCorrectiveWarningCount = displayedCorrectiveActions.reduce((total: number, action: any) => {
    const severity = String(action?.severity || action?.level || "").toUpperCase();
    return severity.includes("WARN") ? total + correctiveAffectedCount(action) : total;
  }, 0);
  const displayedCorrectiveAlarmCount = displayedCorrectiveActions.reduce((total: number, action: any) => {
    const severity = String(action?.severity || action?.level || "").toUpperCase();
    return severity.includes("ALARM") || severity.includes("CRIT")
      ? total + correctiveAffectedCount(action)
      : total;
  }, 0);
  const correctiveCategories = getCorrectiveCategories(displayedCorrectiveActions);
  const categorizedCorrectiveRows = correctiveCategories.flatMap((category) => [
    { __category: category },
    ...(expandedCorrectiveCategories[category.id] ? category.issues : [])
  ]);

  const runtimeCorrectiveCategorySummary = runtimeCorrectiveSummary?.byCategory || {};

  const clearableFaults = sum?.safetySummary?.clearableFaults || [];
  const safetyEligible = sum?.safetySummary?.clearableCount || 0;
  const safetyNotEligible = 0; // Not eligible faults no longer primarily tracked here
  const topologyEntities = Array.isArray(sum?.topology) ? sum.topology : [];
  const topologyTypes = Array.from(new Set(topologyEntities.map((entity: any) => String(entity?.entityType || "Unknown")))).sort();
  const filteredTopologyEntities = topologyEntities.filter((entity: any) => {
    const healthy = entity?.enabled !== false && entity?.ready !== false && entity?.communicating !== false;
    if (topologyTypeFilter !== "all" && String(entity?.entityType || "Unknown") !== topologyTypeFilter) return false;
    if (topologyHealthFilter === "healthy" && !healthy) return false;
    if (topologyHealthFilter === "attention" && healthy) return false;
    const query = topologySearch.trim().toLowerCase();
    if (!query) return true;
    return [entity?.displayKey, entity?.entityKey, entity?.entityType, entity?.entitySubType, entity?.statusMessageText, entity?.statusMessage]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });

  const finiteNumber = (...values: any[]) => {
    for (const value of values) {
      const parsed = Number(value);
      if (value !== null && value !== undefined && value !== "" && Number.isFinite(parsed)) return parsed;
    }
    return null;
  };
  const sumPcsMetric = (...keys: string[]) => {
    let found = false;
    const total = pcsData.reduce((sumValue: number, pcs: any) => {
      const value = finiteNumber(...keys.map((key) => pcs?.[key]));
      if (value === null) return sumValue;
      found = true;
      return sumValue + value;
    }, 0);
    return found ? total : null;
  };
  const formatPower = (value: number | null, unit = "kW") =>
    value === null ? "--" : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
  const formatEnergy = (value: any) => {
    const numeric = finiteNumber(value);
    return numeric === null ? "--" : `${(numeric / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} MWh`;
  };
  const blockOperatingSummary = {
    realMeasured: finiteNumber(sum?.blockOperatingSummary?.modbus?.measuredKW, sum?.blockOperatingSummary?.realMeasured, sumPcsMetric("acRealPowerKW", "acRealPowerKw")),
    realCommanded: finiteNumber(sum?.blockOperatingSummary?.realCommanded, sumPcsMetric("acCmdRealPowerKW", "acRealPowerSettingKW", "acRealPowerSettingKw")),
    reactiveMeasured: finiteNumber(sum?.blockOperatingSummary?.modbus?.measuredKVAR, sum?.blockOperatingSummary?.reactiveMeasured, sumPcsMetric("acReactivePowerKVAR", "acReactivePowerKvar")),
    reactiveCommanded: finiteNumber(sum?.blockOperatingSummary?.reactiveCommanded, sumPcsMetric("acCmdReactivePowerKVAR", "acReactivePowerSettingKVAR", "acReactivePowerSettingKvar")),
    onlineEnergy: finiteNumber(sum?.fleetCapacity?.onlineStoredKWh, onlineStats?.storedKWhTotal),
    nearlineEnergy: finiteNumber(sum?.fleetCapacity?.nearlineStoredKWh, nearlineStats?.storedKWhTotal),
    offlineEnergy: finiteNumber(sum?.fleetCapacity?.offlineStoredKWh, offlineStats?.storedKWhTotal),
    targetPower: finiteNumber(sum?.blockOperatingSummary?.modbus?.targetKW),
    stateOfCharge: finiteNumber(sum?.blockOperatingSummary?.modbus?.stateOfChargePct),
    availableCharge: finiteNumber(sum?.blockOperatingSummary?.modbus?.availableChargeKW),
    availableDischarge: finiteNumber(sum?.blockOperatingSummary?.modbus?.availableDischargeKW),
  };
  const installedCapacityKWh = finiteNumber(sum?.fleetCapacity?.installedCapacityKWh);
  const totalStringCount = finiteNumber(rollups?.totalStrings, sum?.topologyStatus?.stringCount);
  const capacityPerStringKWh = installedCapacityKWh !== null && totalStringCount
    ? installedCapacityKWh / totalStringCount
    : null;
  const onlineCapacityKWh = finiteNumber(
    sum?.fleetCapacity?.onlineInstalledKWh,
    capacityPerStringKWh === null ? null : capacityPerStringKWh * Number(onlineStats?.count || 0)
  );
  const nearlineCapacityKWh = finiteNumber(
    sum?.fleetCapacity?.nearlineInstalledKWh,
    capacityPerStringKWh === null ? null : capacityPerStringKWh * Number(nearlineStats?.count || 0)
  );
  const topologyFamilySummary = topologyTypes.map((type) => {
    const entities = topologyEntities.filter((entity: any) => String(entity?.entityType || "Unknown") === type);
    const attention = entities.filter((entity: any) => entity?.enabled === false || entity?.ready === false || entity?.communicating === false).length;
    return { type, total: entities.length, attention };
  });
  const selectedArraySummary = selectedTopologyArray === null
    ? null
    : arraySummaryData.find((array: any) => Number(array?.arrayNumber ?? array?.arrayIndex ?? array?.array) === selectedTopologyArray) || null;
  const selectedArrayPcs = selectedTopologyArray === null
    ? null
    : pcsData.find((pcs: any) => Number(pcs?.arrayNumber ?? pcs?.arrayIndex) === selectedTopologyArray) || null;
  const selectedArrayStoredKWh = selectedArraySummary && Array.isArray(selectedArraySummary?.raw?.strings)
    ? selectedArraySummary.raw.strings.reduce((total: number, stringRow: any) => total + (finiteNumber(stringRow?.kwh) || 0), 0)
    : finiteNumber(selectedArraySummary?.storedEnergyKWh);

  const combinedSources = sum?.sourceHealth || [];
  let featherTotal: any = sum?.featherSummary?.totalDevices;
  if (featherTotal === null || featherTotal === undefined) featherTotal = "--";
  let featherLostComms: any = sum?.featherSummary?.lostCommsCount;
  if (featherLostComms === null || featherLostComms === undefined)
    featherLostComms = "--";
  let featherFssInvalid: any = sum?.featherSummary?.fssInvalidCount;
  if (featherFssInvalid === null || featherFssInvalid === undefined)
    featherFssInvalid = "--";
  let featherDoorsInvalid: any = sum?.featherSummary?.doorsInvalidCount;
  if (featherDoorsInvalid === null || featherDoorsInvalid === undefined)
    featherDoorsInvalid = "--";

  const navigate = (tab: string) => {
    if (setActiveTab) setActiveTab(tab);
  };

  const getCellMetrics = () => {
    const rows = sum?.stringSummary?.tableRows || [];
    const modbusArrays = Array.isArray(sum?.modbusArraySummary) ? sum.modbusArraySummary : [];
    const modbusValues = (key: string) => modbusArrays
      .map((row: any) => finiteNumber(row?.[key]))
      .filter((value: number | null): value is number => value !== null);
    const modbusMin = (key: string) => {
      const values = modbusValues(key);
      return values.length ? Math.min(...values) : null;
    };
    const modbusMax = (key: string) => {
      const values = modbusValues(key);
      return values.length ? Math.max(...values) : null;
    };
    const modbusAverage = (key: string) => {
      const values = modbusValues(key);
      return values.length ? values.reduce((total: number, value: number) => total + value, 0) / values.length : null;
    };
    
    let minCellVoltage = Infinity;
    let maxCellVoltage = -Infinity;
    let maxCellVoltageDelta = -Infinity;
    let lowCellTempC = Infinity;
    let highCellTempC = -Infinity;
    let maxCellTempDelta = -Infinity;
    
    let totalVolt = 0;
    let countVolt = 0;
    let totalTemp = 0;
    let countTemp = 0;

    for (const r of rows) {
      const vMin = r.minCellVoltageMv ?? r.minCellVoltage;
      const vAvg = r.avgCellVoltageMv ?? r.avgCellVoltage;
      const vMax = r.maxCellVoltageMv ?? r.maxCellVoltage;
      const vDelta = r.maxCellVoltageDeltaMv ?? r.cellVoltageDelta;
      
      const tMin = r.lowCellTempC ?? r.minCellTemperature;
      const tAvg = r.avgCellTempC ?? r.avgCellTemperature;
      const tMax = r.highCellTempC ?? r.maxCellTemperature;
      const tDelta = r.maxCellTempDeltaC ?? r.cellTemperatureDelta;

      if (vMin !== null && vMin !== undefined) minCellVoltage = Math.min(minCellVoltage, vMin);
      if (vMax !== null && vMax !== undefined) maxCellVoltage = Math.max(maxCellVoltage, vMax);
      if (vDelta !== null && vDelta !== undefined) maxCellVoltageDelta = Math.max(maxCellVoltageDelta, vDelta);
      if (vAvg !== null && vAvg !== undefined) {
        totalVolt += vAvg;
        countVolt++;
      }

      if (tMin !== null && tMin !== undefined) lowCellTempC = Math.min(lowCellTempC, tMin);
      if (tMax !== null && tMax !== undefined) highCellTempC = Math.max(highCellTempC, tMax);
      if (tDelta !== null && tDelta !== undefined) maxCellTempDelta = Math.max(maxCellTempDelta, tDelta);
      if (tAvg !== null && tAvg !== undefined) {
        totalTemp += tAvg;
        countTemp++;
      }
    }

    const finalMinVolt = minCellVoltage !== Infinity ? minCellVoltage : (modbusMin("CellVoltageMin") === null ? (sum?.cellMetrics?.minVoltage ?? null) : Number(modbusMin("CellVoltageMin")) * 1000);
    const finalMaxVolt = maxCellVoltage !== -Infinity ? maxCellVoltage : (modbusMax("CellVoltageMax") === null ? (sum?.cellMetrics?.maxVoltage ?? null) : Number(modbusMax("CellVoltageMax")) * 1000);
    const finalAvgVolt = countVolt > 0 ? totalVolt / countVolt : (modbusAverage("CellVoltageAvg") === null ? (sum?.cellMetrics?.avgVoltage ?? sum?.bessFleetSummary?.avgCellVoltageMv ?? null) : Number(modbusAverage("CellVoltageAvg")) * 1000);
    const finalMaxVoltDelta = maxCellVoltageDelta !== -Infinity ? maxCellVoltageDelta : (sum?.cellMetrics?.deltaVoltage ?? sum?.bessFleetSummary?.maxCellVoltageDeltaMv ?? null);

    const finalLowTemp = lowCellTempC !== Infinity ? lowCellTempC : (modbusMin("CellTmpMin") ?? sum?.cellMetrics?.minTemp ?? null);
    const finalHighTemp = highCellTempC !== -Infinity ? highCellTempC : (modbusMax("CellTmpMax") ?? sum?.cellMetrics?.maxTemp ?? sum?.bessFleetSummary?.maxCellTempC ?? null);
    const finalAvgTemp = countTemp > 0 ? totalTemp / countTemp : (modbusAverage("CellTmpAvg") ?? sum?.cellMetrics?.avgTemp ?? sum?.bessFleetSummary?.avgCellTempC ?? null);
    const finalMaxTempDelta = maxCellTempDelta !== -Infinity ? maxCellTempDelta : (sum?.cellMetrics?.deltaTemp ?? sum?.bessFleetSummary?.maxCellTempDeltaC ?? null);

    return {
      minCellVoltage: finalMinVolt,
      avgCellVoltage: finalAvgVolt,
      maxCellVoltage: finalMaxVolt,
      maxCellVoltageDelta: finalMaxVoltDelta,
      lowCellTemp: finalLowTemp,
      avgCellTemp: finalAvgTemp,
      highCellTemp: finalHighTemp,
      maxCellTempDelta: finalMaxTempDelta
    };
  };

  const metrics = getCellMetrics();

  const handleActionClick = (target: any) => {
    const arrayNum = target.arrayIndex ?? target.arrayNumber;
    const stringNum = target.stringIndex ?? target.stringNumber;
    const deviceIp = target.ip ?? target.deviceIp;
    const source = (target.source ?? "").toLowerCase();

    if (source.includes("pcs") || target.faultName?.toLowerCase().includes("pcs") || target.suggestedAction?.toLowerCase().includes("pcs")) {
      localStorage.setItem("prizm_selected_pcs_id", "pcs-" + (target.pcsIndex ?? target.arrayIndex ?? 1));
      navigate("pcs-dashboard");
      return true;
    }

    if (source.includes("feather") || source.includes("hvac") || deviceIp) {
      if (deviceIp) {
        localStorage.setItem("prizm_selected_feather_ip", deviceIp);
      }
      if (arrayNum != null) {
        localStorage.setItem("prizm_selected_feather_array", String(arrayNum));
      }
      if (stringNum != null) {
        localStorage.setItem("prizm_selected_feather_string", String(stringNum));
      }
      navigate("feather-hvac");
      return true;
    }

    if (arrayNum != null || stringNum != null || source.includes("ems") || source.includes("string")) {
      if (arrayNum != null) {
        localStorage.setItem("prizm_selected_array", String(arrayNum));
      }
      if (stringNum != null) {
        localStorage.setItem("prizm_selected_string", String(stringNum));
      }
      navigate("arrays-strings");
      return true;
    }

    return false;
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-y-auto no-scrollbar font-sans space-y-6">
      {/* Global Site Status Banner Removed (Moved to Global Header) */}

      <section className="rounded-lg border border-prizm-border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-prizm-border px-4 py-3">
          <div>
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-slate-900">Block Operating Snapshot</h2>
            <p className="mt-0.5 text-[9px] text-prizm-text-muted">Live AC-battery power plus native DC-battery capacity and stored-energy totals.</p>
          </div>
          <div className="flex items-center gap-2">
            {sum?.modbusTelemetry?.available && <span className={`rounded px-2 py-1 text-[9px] font-bold uppercase ${sum.modbusTelemetry.stale ? "bg-amber-50 text-amber-700" : "bg-cyan-50 text-cyan-700"}`}>Modbus {sum.modbusTelemetry.stale ? "stale" : `${sum.modbusTelemetry.durationMs ?? "--"} ms`}</span>}
            <span className={`rounded px-2 py-1 text-[9px] font-bold uppercase ${siteState === "LIVE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{siteState}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-prizm-border md:grid-cols-4 xl:grid-cols-6">
          {[
            ["Real Power", formatPower(blockOperatingSummary.realMeasured), `Cmd ${formatPower(blockOperatingSummary.realCommanded)}`],
            ["Reactive Power", formatPower(blockOperatingSummary.reactiveMeasured, "kVAR"), `Cmd ${formatPower(blockOperatingSummary.reactiveCommanded, "kVAR")}`],
            ["Power Target", formatPower(blockOperatingSummary.targetPower), "EMS Modbus operating target"],
            ["Block SOC", blockOperatingSummary.stateOfCharge === null ? "--" : `${blockOperatingSummary.stateOfCharge.toFixed(1)}%`, "EMS Modbus block total"],
            ["Available Charge", formatPower(blockOperatingSummary.availableCharge), "EMS Modbus capacity"],
            ["Available Discharge", formatPower(blockOperatingSummary.availableDischarge), "EMS Modbus capacity"],
            ["Online DC Capacity", formatEnergy(onlineCapacityKWh), `${onlineStats?.count ?? 0} strings · live array total`],
            ["Nearline DC Capacity", formatEnergy(nearlineCapacityKWh), `${nearlineStats?.count ?? 0} strings · live array total`],
            ["Online Stored DC", formatEnergy(blockOperatingSummary.onlineEnergy), "live DC-battery total"],
            ["Nearline Stored DC", formatEnergy(blockOperatingSummary.nearlineEnergy), "live DC-battery total"],
            ["Offline Stored DC", formatEnergy(blockOperatingSummary.offlineEnergy), `${offlineStats?.count ?? 0} strings · live DC-battery total`],
          ].map(([label, value, detail]) => (
            <div key={label} className="min-w-0 bg-white px-3 py-3">
              <div className="text-[8px] font-bold uppercase tracking-wider text-prizm-text-muted">{label}</div>
              <div className="mt-1 truncate font-mono text-[14px] font-bold text-slate-900" title={value}>{value}</div>
              {detail && <div className="mt-0.5 truncate font-mono text-[8px] text-slate-500">{detail}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* NEW TOP LAYOUT GRID: KPI BLOCKS + STRING SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* KPI BLOCKS */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
            {/* 1. Topology / Status */}
            <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border flex flex-col justify-between">
              <div>
                <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-prizm-border pb-2">
                  <BoxSelect size={14} className="text-emerald-700" /> Topology / Status
                </h3>
                <div className="flex flex-col gap-1 text-[11px] font-mono mt-3">
                  <div className="flex justify-between pb-1 border-b border-prizm-border/50">
                    <span className="text-prizm-text-muted uppercase">Arrays</span>
                    <span className="font-bold text-prizm-text">
                      {sum?.topologyStatus?.arrayCount ?? sum?.topologyCounts?.arrayCount ?? "--"}
                    </span>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-prizm-border/50">
                    <span className="text-prizm-text-muted uppercase">Strings (Total)</span>
                    <span className="font-bold text-prizm-text">
                      {sum?.topologyStatus?.stringCount ?? sum?.bessFleetSummary?.totalStrings ?? "--"}
                    </span>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-prizm-border/50">
                    <span className="text-prizm-text-muted uppercase">Energy Segments</span>
                    <span className="font-bold text-prizm-text">
                      {sum?.topologyStatus?.energySegmentCount ?? "--"}
                    </span>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-prizm-border/50">
                    <span className="text-prizm-warning uppercase">Fault Warnings</span>
                    <span className="font-bold text-prizm-warning">
                      {displayedCorrectiveWarningCount}
                    </span>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-prizm-border/50">
                    <span className="text-prizm-danger uppercase">Fault Alarms</span>
                    <span className="font-bold text-prizm-danger">
                      {displayedCorrectiveAlarmCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-prizm-text-muted uppercase">PCS Units</span>
                    <span className="font-bold text-prizm-text">
                      {sum?.topologyStatus?.pcsCount ?? sum?.topologyCounts?.pcsCount ?? "--"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Fleet Capacity */}
            <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border flex flex-col justify-between group relative">
              <div>
                <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center justify-between border-b border-prizm-border pb-2">
                  <span className="flex items-center gap-2">
                    <Zap size={14} className="text-emerald-700" /> Fleet Capacity
                  </span>
                  <span className="text-prizm-text-muted group-hover:text-prizm-text cursor-help font-mono text-[9px] border border-prizm-border px-1 rounded transition-colors">
                    HOVER BREAKDOWN
                  </span>
                </h3>

                {/* Hover Tooltip Popup panel */}
                {(() => {
                  const stringRollups = sum?.stringSummary?.rollups;
                  const derivedFleetCapacity = stringRollups ? {
                    ...(sum?.fleetCapacity || {}),
                    availableStoredKWh:
                      Number(stringRollups?.online?.storedKWhTotal ?? 0) +
                      Number(stringRollups?.nearline?.storedKWhTotal ?? 0) +
                      Number(stringRollups?.offline?.storedKWhTotal ?? 0) +
                      Number(stringRollups?.notCommunicating?.storedKWhTotal ?? 0),
                    onlineStoredKWh: Number(stringRollups?.online?.storedKWhTotal ?? 0),
                    nearlineStoredKWh: Number(stringRollups?.nearline?.storedKWhTotal ?? 0),
                    offlineStoredKWh: Number(stringRollups?.offline?.storedKWhTotal ?? 0),
                    notCommunicatingStoredKWh: Number(stringRollups?.notCommunicating?.storedKWhTotal ?? 0)
                  } : null;
                  const fc = derivedFleetCapacity || sum?.fleetCapacity || sum?.stringSummary?.rollups?.fleetCapacity;
                  const formatVal = (v: number | null | undefined) => v != null ? (v / 1000).toFixed(2) : "Unavailable";
                  const formatMWhOrDash = (v: number | null | undefined) => v != null ? (v / 1000).toFixed(2) : "--";

                  return (
                    <div className="absolute hidden group-hover:block top-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-80 max-w-[min(90vw,24rem)] bg-white border border-slate-200 text-slate-900 border border-slate-700 text-slate-200 rounded-lg p-3 shadow-2xl z-[9999] text-[11px] font-mono space-y-2 pointer-events-none whitespace-normal">
                      <div className="font-bold border-b border-slate-700 pb-1 text-[11px] text-white uppercase tracking-wider text-center mb-2">
                        Fleet Capacity Breakdown
                      </div>
                      <div className="font-bold border-b border-slate-700 pt-1 pb-1 text-[10px] text-slate-400 uppercase tracking-wider">
                        Installed Capacity
                      </div>
                      <div className="grid grid-cols-2 gap-y-1 pb-1 border-b border-slate-800">
                        <span>Total Installed:</span>
                        <span className="text-right font-bold">{formatVal(fc?.installedCapacityKWh ?? 118800)} MWh</span>
                      </div>
                      <div className="font-bold pt-1 pb-1 text-[10px] text-slate-400 uppercase tracking-wider">
                        Stored Energy
                      </div>
                      <div className="grid grid-cols-2 gap-y-1">
                        <span>Available Stored:</span>
                        <span className="text-right font-bold">{formatMWhOrDash(fc?.availableStoredKWh)} MWh</span>
                        <span className="text-emerald-400">Online Stored:</span>
                        <span className="text-right">{formatMWhOrDash(fc?.onlineStoredKWh)} MWh ({sum?.topologyStatus?.onlineCount ?? 0} strings online)</span>
                        <span className="text-blue-400">Nearline Stored:</span>
                        <span className="text-right">{formatMWhOrDash(fc?.nearlineStoredKWh)} MWh ({sum?.topologyStatus?.nearlineCount ?? 0} strings nearline)</span>
                        <span className="text-amber-400">Offline Stored:</span>
                        <span className="text-right">{formatMWhOrDash(fc?.offlineStoredKWh)} MWh ({sum?.topologyStatus?.offlineCount ?? 0} strings offline)</span>
                        <span className="text-rose-400">No Comm Stored:</span>
                        <span className="text-right">{formatMWhOrDash(fc?.notCommunicatingStoredKWh)} MWh ({sum?.topologyStatus?.notCommunicatingCount ?? 0} strings no comm)</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex flex-col mt-4">
                  {(() => {
                    const stringRollups = sum?.stringSummary?.rollups;
                  const derivedFleetCapacity = stringRollups ? {
                    ...(sum?.fleetCapacity || {}),
                    availableStoredKWh:
                      Number(stringRollups?.online?.storedKWhTotal ?? 0) +
                      Number(stringRollups?.nearline?.storedKWhTotal ?? 0) +
                      Number(stringRollups?.offline?.storedKWhTotal ?? 0) +
                      Number(stringRollups?.notCommunicating?.storedKWhTotal ?? 0),
                    onlineStoredKWh: Number(stringRollups?.online?.storedKWhTotal ?? 0),
                    nearlineStoredKWh: Number(stringRollups?.nearline?.storedKWhTotal ?? 0),
                    offlineStoredKWh: Number(stringRollups?.offline?.storedKWhTotal ?? 0),
                    notCommunicatingStoredKWh: Number(stringRollups?.notCommunicating?.storedKWhTotal ?? 0)
                  } : null;
                  const fc = derivedFleetCapacity || sum?.fleetCapacity || sum?.stringSummary?.rollups?.fleetCapacity;
                    const formatMWhStr = (v: number | null | undefined): string => {
                      if (v == null) return "Unavailable";
                      return (v / 1000).toFixed(2);
                    };

                    const hasInstalledCapacity = fc?.installedCapacityKWh != null;
                    const hasStoredEnergy = fc?.availableStoredKWh != null;
                    const hasSoc = systemSoc !== null;

                    const primaryValue = hasInstalledCapacity
                      ? (
                        <div className="text-2xl font-bold text-prizm-text font-mono">
                          {formatMWhStr(fc.installedCapacityKWh)}
                          <span className="text-sm text-prizm-text-muted ml-1">MWh</span>
                        </div>
                      )
                      : hasStoredEnergy
                        ? (
                          <div className="text-2xl font-bold text-prizm-text font-mono">
                            {formatMWhStr(fc.availableStoredKWh)}
                            <span className="text-sm text-prizm-text-muted ml-1">MWh</span>
                          </div>
                        )
                        : hasSoc
                          ? (
                            <div className="text-2xl font-bold text-prizm-text font-mono">
                              {systemSoc.toFixed(1)}
                              <span className="text-sm text-prizm-text-muted ml-1">%</span>
                            </div>
                          )
                          : (
                            <div className="text-xl font-bold text-amber-500 font-mono">
                              Unavailable
                            </div>
                          );

                    const primaryLabel = hasInstalledCapacity
                      ? "Installed Capacity"
                      : "Fleet Capacity";

                    return (
                      <>
                        {primaryValue}
                        <div className="text-[10px] text-prizm-text-muted mt-0.5 mb-2 font-mono uppercase tracking-wider">{primaryLabel}</div>

                        <div className="mt-2 space-y-1 text-[10px] font-sans">
                          <div className="flex justify-between items-center">
                            <span className="text-prizm-text-muted">SOC Status:</span>
                            <span className={`font-mono font-bold ${hasSoc ? 'text-prizm-data-green' : 'text-prizm-text-muted'}`}>
                              {hasSoc ? `${systemSoc!.toFixed(1)}%` : "Unavailable"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center border-t border-prizm-border pt-1 mt-1">
                            <span className="text-prizm-text-muted font-bold">Stored Energy:</span>
                            <span className="font-mono font-bold text-white">
                              {fc?.availableStoredKWh != null ? `${(fc.availableStoredKWh / 1000).toFixed(2)} MWh` : "Unavailable"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pl-2">
                            <span className="text-prizm-text-muted">Online Stored:</span>
                            <span className="font-mono text-emerald-400">
                              {fc?.onlineStoredKWh != null && fc.onlineStoredKWh > 0 ? `${(fc.onlineStoredKWh / 1000).toFixed(2)} MWh` : "0.00 MWh"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pl-2">
                            <span className="text-prizm-text-muted">Nearline Stored:</span>
                            <span className="font-mono text-blue-400">
                              {fc?.nearlineStoredKWh != null ? `${(fc.nearlineStoredKWh / 1000).toFixed(2)} MWh` : "0.00 MWh"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pl-2">
                            <span className="text-prizm-text-muted">Offline Stored:</span>
                            <span className="font-mono text-amber-400">
                              {fc?.offlineStoredKWh != null && fc.offlineStoredKWh > 0 ? `${(fc.offlineStoredKWh / 1000).toFixed(2)} MWh` : "0.00 MWh"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pl-2 border-b border-prizm-border pb-1 mb-1">
                            <span className="text-prizm-text-muted">Not Comm Stored:</span>
                            <span className="font-mono text-rose-400">
                              {fc?.notCommunicatingStoredKWh != null && fc.notCommunicatingStoredKWh > 0 ? `${(fc.notCommunicatingStoredKWh / 1000).toFixed(2)} MWh` : "0.00 MWh"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-prizm-text-muted">Limits Charge:</span>
                            <span className="font-mono font-bold text-prizm-text-muted">
                              {fc?.availableChargeKW != null ? `${(fc.availableChargeKW / 1000).toFixed(1)} MW` : "--"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-prizm-text-muted">Discharge Limit:</span>
                            <span className="font-mono font-bold text-prizm-text-muted">
                              {fc?.availableDischargeKW != null ? `${(fc.availableDischargeKW / 1000).toFixed(1)} MW` : "--"}
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* 3. Cell Metrics (Consolidated) */}
            <div className="bg-prizm-surface p-4 rounded-lg border border-prizm-border flex flex-col justify-between">
              <div>
                <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2 border-b border-prizm-border pb-2">
                  <Activity size={14} className="text-emerald-700" /> Cell Metrics
                </h3>
                <div className="space-y-2 mt-4 font-mono text-[10px]">
                  <div className="flex justify-between items-center">
                    <span className="text-prizm-text-muted uppercase font-bold tracking-wider">
                      Avg Voltage
                    </span>
                    <div className="font-bold text-prizm-text">
                      {metrics.avgCellVoltage != null && normalizeVoltage(metrics.avgCellVoltage) !== null
                        ? `${normalizeVoltage(metrics.avgCellVoltage)!.toFixed(1)} mV`
                        : "--"}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-prizm-text-muted uppercase font-bold tracking-wider">
                      Volt Max Δ
                    </span>
                    <div className="font-bold text-prizm-text">
                      {metrics.maxCellVoltageDelta != null && normalizeDeltaVoltage(metrics.maxCellVoltageDelta) !== null
                        ? `Δ ${normalizeDeltaVoltage(metrics.maxCellVoltageDelta)!.toFixed(0)} mV`
                        : "--"}
                    </div>
                  </div>
                  <div className="flex justify-between items-center border-t border-prizm-border/40 pt-1.5 mt-1.5">
                    <span className="text-prizm-text-muted uppercase font-bold tracking-wider">
                      Avg Temp
                    </span>
                    <div className="font-bold text-prizm-text">
                      {metrics.avgCellTemp != null
                        ? formatTemperatureF(metrics.avgCellTemp, { decimals: 1, showUnit: true, sourceUnit: "C" })
                        : "--"}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-prizm-text-muted uppercase font-bold tracking-wider">
                      Temp Max Δ
                    </span>
                    <div className="font-bold text-prizm-text">
                      {metrics.maxCellTempDelta != null
                        ? `Δ ${(metrics.maxCellTempDelta * 1.8).toFixed(1)}°F`
                        : "--"}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-prizm-text-muted uppercase font-bold tracking-wider">
                      Max Temp
                    </span>
                    <div className="font-bold text-prizm-danger">
                      {metrics.highCellTemp != null
                        ? formatTemperatureF(metrics.highCellTemp, { decimals: 1, showUnit: true, sourceUnit: "C" })
                        : "--"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* STRING SUMMARY TABLE */}
      <div className="lg:col-span-6 flex flex-col">
        <div className="bg-prizm-surface border border-prizm-border rounded-lg flex flex-col h-full">
          <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider p-3 flex items-center justify-between border-b border-prizm-border">
            <span className="flex items-center gap-2">
              <Rows4 size={14} className="text-prizm-text" /> STRING SUMMARY
            </span>
            <button
              onClick={() => navigate("arrays-strings")}
              className="text-[9px] px-2 py-0.5 uppercase tracking-widest text-emerald-700 hover:bg-prizm-primary/10 rounded border border-prizm-primary/30 transition-colors"
            >
              Detailed View
            </button>
          </h3>
          <div className="overflow-x-auto no-scrollbar flex-1">
            {(sum?.stringSummary?.tableRows && sum.stringSummary.tableRows.length > 0) ||
            (sum?.stringSummary?.buckets &&
              Object.values(sum.stringSummary.buckets).some((v) => Number(v) > 0)) ? (
              <div className="overflow-x-auto overflow-y-auto max-h-[350px] w-full no-scrollbar">
                <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                  <thead className="bg-white border border-slate-200 text-slate-900 text-slate-600 uppercase tracking-widest border-b border-prizm-border sticky top-0 z-10">
                    <tr>
                      <th className="py-1 px-2 font-bold min-w-[200px]">
                        Parameter
                      </th>
                      <th className="py-1 px-2 font-bold text-center border-l border-prizm-border text-prizm-data-green">
                        Online
                      </th>
                      <th className="py-1 px-2 font-bold text-center border-l border-prizm-border text-[#166534]">
                        Nearline
                      </th>
                      <th className="py-1 px-2 font-bold text-center border-l border-prizm-border text-prizm-text-muted">
                        Offline
                      </th>
                      <th className="py-1 px-2 font-bold text-center border-l border-prizm-border text-prizm-danger">
                        Not Comm
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-prizm-border">
                    {(() => {
                      const formatVal = (
                        v: any,
                        suffix = "",
                        toFixed = 1,
                      ) => {
                        if (v === null || v === undefined) return "--";
                        const num = Number(v);
                        if (isNaN(num)) return "--";
                        return (
                          num.toFixed(toFixed).replace(/\.0+$/, "") +
                          (suffix ? " " + suffix : "")
                        );
                      };
                      const buckets = [
                        "online",
                        "nearline",
                        "offline",
                        "notCommunicating",
                      ];
                      const renderRow = (
                        label: string,
                        field: string,
                        suffix = "",
                        toFixed = 1,
                      ) => {
                        const isTemp = field.endsWith("TempC") || field.endsWith("TemperatureC");
                        const isTempDelta = field.endsWith("TempDeltaC") || field.endsWith("TemperatureDeltaC");
                        const isVoltage = field.toLowerCase().includes("voltage") || field.toLowerCase().includes("volt");
                        const isVoltageDelta = isVoltage && field.toLowerCase().includes("delta");
                        const displaySuffix = (isTemp || isTempDelta) ? "°F" : suffix;

                        return (
                          <tr className="hover:bg-prizm-surface transition-colors">
                            <td className="py-1 px-2 text-prizm-text-muted">
                              {label}
                            </td>
                            {buckets.map((b, i) => {
                              const bCount = sum.stringSummary.buckets?.[b] ?? sum.stringSummary.rollups?.[b]?.count ?? 0;
                              let val = bCount === 0 ? null : sum.stringSummary.rollups?.[b]?.[field];
                              if (val !== null && val !== undefined && !isNaN(Number(val))) {
                                if (isTemp) {
                                  val = Number(val) * 1.8 + 32;
                                } else if (isTempDelta) {
                                  val = Number(val) * 1.8;
                                } else if (isVoltageDelta) {
                                  val = normalizeDeltaVoltage(Number(val));
                                } else if (isVoltage) {
                                  val = normalizeVoltage(Number(val));
                                }
                              }
                              return (
                                <td
                                  key={i}
                                  className={`py-1 px-2 text-center border-l border-prizm-border ${b === "online" ? "text-prizm-data-green font-bold" : b === "nearline" ? "text-[#166534] font-medium" : b === "notCommunicating" ? "text-prizm-danger font-bold" : "text-prizm-text-muted"}`}
                                >
                                  {formatVal(val, displaySuffix, toFixed)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      };

                      const renderSocRow = () => (
                        <tr className="hover:bg-prizm-surface transition-colors">
                          <td className="py-1 px-2 text-prizm-text-muted">
                            SOC (kWh)
                          </td>
                          {buckets.map((b, i) => {
                            const bCount = sum.stringSummary.buckets?.[b] ?? sum.stringSummary.rollups?.[b]?.count ?? 0;
                            let soc = bCount === 0 ? null : sum.stringSummary.rollups?.[b]?.socPctAvg;
                            
                            let kwh = null;
                            if (bCount > 0 && sum.stringSummary.rollups?.[b]) {
                              const r = sum.stringSummary.rollups[b];
                              if (r.storedKWhTotal !== undefined && r.storedKWhTotal !== null) {
                                kwh = r.storedKWhTotal;
                              } else if (r.socKwhTotal !== undefined && r.socKwhTotal !== null) {
                                kwh = r.socKwhTotal;
                              } else if (r.socKwhAvg !== undefined && r.socKwhAvg !== null) {
                                kwh = r.socKwhAvg;
                              } else if (r.kWhAvg !== undefined && r.kWhAvg !== null) {
                                kwh = r.kWhAvg * bCount;
                              }
                            }

                            if (kwh !== null && kwh !== undefined) {
                              kwh = Math.round(kwh);
                            }

                            let txt = "--";
                            if (soc !== null && soc !== undefined)
                              txt = formatVal(soc, "%");
                            if (kwh !== null && kwh !== undefined)
                              txt += " (" + formatVal(kwh, "kWh") + ")";
                            const finalTxt =
                              txt === "--"
                                ? "--"
                                : txt
                                    .replace(/^-- \((.*?)\)$/, "$1")
                                    .replace(/^(.*?) \(--\)$/, "$1");
                            return (
                              <td
                                key={i}
                                className={`py-1 px-2 text-center border-l border-prizm-border ${b === "online" ? "text-prizm-data-green font-bold" : b === "nearline" ? "text-[#166534] font-medium" : b === "notCommunicating" ? "text-prizm-danger font-bold" : "text-prizm-text-muted"}`}
                              >
                                {finalTxt}
                              </td>
                            );
                          })}
                        </tr>
                      );

                      return (
                        <>
                          <tr className="hover:bg-prizm-surface transition-colors">
                            <td className="py-1 px-2 text-prizm-text-muted">
                              Strings
                            </td>
                            {buckets.map((b, i) => {
                              const bCount = sum.stringSummary.buckets?.[b] ?? sum.stringSummary.rollups?.[b]?.count ?? 0;
                              return (
                                <td
                                  key={i}
                                  className={`py-1 px-2 text-center border-l border-prizm-border ${b === "online" ? "text-prizm-data-green font-bold" : b === "nearline" ? "text-[#166534] font-medium" : b === "notCommunicating" ? "text-prizm-danger font-bold" : "text-prizm-text-muted"}`}
                                >
                                  {bCount === 0 ? "--" : bCount}
                                </td>
                              );
                            })}
                          </tr>
                          <tr className="hover:bg-prizm-surface transition-colors">
                            <td className="py-1 px-2 text-prizm-text-muted">
                              Connection Permitted
                            </td>
                            {buckets.map((b, i) => {
                              const bCount = sum.stringSummary.buckets?.[b] ?? sum.stringSummary.rollups?.[b]?.count ?? 0;
                              const r = sum.stringSummary.rollups?.[b];
                              let displayVal: any = "--";
                              
                              if (r && r.connectionPermittedCount !== undefined && r.connectionPermittedCount !== null) {
                                displayVal = r.connectionPermittedCount;
                              } else if (bCount > 0) {
                                displayVal = 0;
                              }
                              
                              return (
                                <td
                                  key={i}
                                  className={`py-1 px-2 text-center border-l border-prizm-border ${b === "online" ? "text-prizm-data-green font-bold" : b === "nearline" ? "text-[#166534] font-medium" : b === "notCommunicating" ? "text-prizm-danger font-bold" : "text-prizm-text-muted"}`}
                                >
                                  {displayVal}
                                </td>
                              );
                            })}
                          </tr>
                          {renderSocRow()}
                          {renderRow(
                            "Max Current (A)",
                            "maxCurrentA",
                            "A",
                            1,
                          )}
                          {renderRow(
                            "Min Current (A)",
                            "minCurrentA",
                            "A",
                            1,
                          )}
                          {renderRow(
                            "Max Cell Voltage (mV)",
                            "maxCellVoltageMv",
                            "mV",
                            0,
                          )}
                          {renderRow(
                            "Average Cell Voltage (mV)",
                            "avgCellVoltageMv",
                            "mV",
                            0,
                          )}
                          {renderRow(
                            "Min Cell Voltage (mV)",
                            "minCellVoltageMv",
                            "mV",
                            0,
                          )}
                          {renderRow(
                            "Max Cell Voltage Delta (mV)",
                            "maxCellVoltageDeltaMv",
                            "mV",
                            0,
                          )}
                          {renderRow(
                            "High Cell Temp (°F)",
                            "highCellTempC",
                            "°F",
                            1,
                          )}
                          {renderRow(
                            "Average Cell Temp (°F)",
                            "avgCellTempC",
                            "°F",
                            1,
                          )}
                          {renderRow(
                            "Low Cell Temp (°F)",
                            "lowCellTempC",
                            "°F",
                            1,
                          )}
                          {renderRow(
                            "Max Cell Temp Delta (°F)",
                            "maxCellTempDeltaC",
                            "°F",
                            1,
                          )}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">
                No String Summary available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* FULL-WIDTH CORRECTIVE ACTIONS CARD */}
    <div className="bg-prizm-surface border border-prizm-border rounded-lg flex flex-col w-full">
      <h3 className="text-prizm-text-muted text-[10px] font-bold uppercase tracking-wider p-3 flex items-center justify-between border-b border-prizm-border">
        <span className="flex items-center gap-2">
          <TriangleAlert size={14} className="text-prizm-danger" />{" "}
          CORRECTIVE ACTIONS (DATA-BASED FAULTS)
        </span>
        <span className="flex items-center gap-3">
          <span className="text-[9px] text-prizm-text-muted tracking-wider uppercase font-mono">
            {runtimeCorrectiveLoading ? "Loading live findings..." : `Groups ${displayedCorrectiveActions.length} • Affected ${displayedCorrectiveAffectedCount} • HVAC tracked ${runtimeHvacCorrectiveLatchRef.current.size}`}
            {" "}• Expand a category, fault, then device for inline detail
          </span>
                        <button
                type="button"
                onClick={() => setHvacUseFanRpmForFaults(v => !v)}
                title={hvacUseFanRpmForFaults
                  ? "Bergstrom mode: fan RPM is used as an HVAC feedback indicator"
                  : "Dometic mode: fan RPM is ignored; current/amperage is used as the HVAC feedback indicator"}
                className={`rounded border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
                  hvacUseFanRpmForFaults
                    ? "border-prizm-warning/40 bg-prizm-warning/10 text-prizm-warning"
                    : "border-prizm-primary/30 bg-prizm-primary/10 text-emerald-700"
                }`}
              >
                HVAC Profile: {hvacUseFanRpmForFaults ? "Bergstrom / RPM ON" : "Dometic / RPM OFF"}
              </button>
<button
            type="button"
            onClick={() => setShowCorrectiveExportOptions((v) => !v)}
            className="px-2 py-1 rounded border border-prizm-primary/40 bg-prizm-primary/10 text-emerald-700 hover:bg-prizm-primary/20 transition-colors text-[9px] uppercase tracking-widest font-bold"
          >
            Export PDF
          </button>
        </span>
      </h3>
      {showCorrectiveExportOptions ? (
        <div className="border-b border-prizm-border bg-white border border-slate-200 text-slate-900 p-3 flex flex-wrap items-center gap-2 text-[10px] font-mono">
          <span className="text-prizm-text-muted uppercase tracking-wider mr-2">
            Select corrective-action export format:
          </span>
          {[
            ["field-work-order", "Field Work Order"],
            ["field-handoff", "Field Handoff"],
            ["checklist-report", "Checklist Report"],
          ].map(([formatId, label]) => (
            <button
              key={formatId}
              type="button"
              disabled={!!correctiveExportingFormat}
              onClick={() => exportCorrectiveActionsPdf(formatId as "field-work-order" | "field-handoff" | "checklist-report")}
              className="px-3 py-1.5 rounded border border-prizm-border bg-prizm-surface hover:bg-white border border-slate-200 text-slate-900 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors uppercase tracking-wider font-bold"
            >
              {correctiveExportingFormat === formatId ? "Generating..." : label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="overflow-x-auto no-scrollbar flex-1">
        <div>
          {displayedCorrectiveActions.length > 0 ? (
            <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
              <thead className="bg-white border border-slate-200 text-slate-900 text-[10px] text-slate-600 uppercase tracking-widest border-b border-prizm-border sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 font-bold">Level</th>
                  <th className="py-2 px-3 font-bold">Code</th>
                  <th className="py-2 px-3 font-bold">Issue Name</th>
                  <th className="py-2 px-3 font-bold text-center">Count</th>
                  <th className="py-2 px-3 font-bold">Affected Summary</th>
                  <th className="py-2 px-3 font-bold">Manager Summary</th>
                  <th className="py-2 px-3 font-bold">Suggested Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-prizm-border">
                {categorizedCorrectiveRows.map((issue: any, i: number) => {
                  if (issue.__category) {
                    const category = issue.__category as CorrectiveCategory;
                    const isOpen = !!expandedCorrectiveCategories[category.id];
                    const affected = category.issues.reduce((count, item) => count + Math.max(1, Number(item?.count || item?.affectedCount) || 1), 0);
                    return (
                      <tr key={`category-${category.id}`} className="bg-slate-100 border-y border-slate-300">
                        <td colSpan={7} className="p-0">
                          <button
                            type="button"
                            onClick={() => setExpandedCorrectiveCategories((prev) => ({ ...prev, [category.id]: !prev[category.id] }))}
                            className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-slate-200 transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <span className="font-black text-slate-900 uppercase tracking-wider">{category.label}</span>
                              <span className="text-[9px] text-slate-600 normal-case tracking-normal">{category.description}</span>
                            </span>
                            <span className="text-[9px] font-bold text-slate-700">{category.issues.length} groups • {affected} affected</span>
                          </button>
                        </td>
                      </tr>
                    );
                  }
                  const issueKey = `${issue.__category?.id || "issue"}-${getCorrectiveIssuePrimaryCode(issue)}-${correctiveLocationTuple(issue).join("-")}-${i}`;
                  const hasOccurrences =
                    (Array.isArray(issue.occurrences) &&
                      issue.occurrences.length > 0) ||
                    (Array.isArray(issue.affected) &&
                      issue.affected.length > 0);
                  const isExpanded = !!expandedCorrectiveActions[issueKey];
                  const kb = issue.resolved?.resolvedTroubleshooting;

                  return (
                    <React.Fragment key={issueKey}>
                      <tr
                        className={`${hasOccurrences ? "cursor-pointer hover:bg-prizm-surface-strong/70" : "hover:bg-prizm-surface"} transition-colors`}
                        onClick={() =>
                          hasOccurrences && toggleCorrectiveAction(issueKey)
                        }
                      >
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-[2px] rounded font-bold uppercase text-[9px] ${
                              String(issue.level || issue.severity || "").toUpperCase() === "FAULT" || String(issue.level || issue.severity || "").toUpperCase() === "ALARM"
                                ? "bg-prizm-danger/10 text-prizm-danger border border-prizm-danger/20"
                                : "bg-prizm-warning/10 text-prizm-warning border border-prizm-warning/20"
                            }`}
                          >
                            {issue.level || issue.severity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-emerald-700 font-bold">
                          {issue.code || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-white font-bold">
                          <div className="flex items-center gap-1.5">
                            {hasOccurrences && (
                              <span className="inline-flex items-center">
                                {isExpanded ? (
                                  <ChevronDown
                                    size={12}
                                    className="text-prizm-text-muted"
                                  />
                                ) : (
                                  <ChevronRight
                                    size={12}
                                    className="text-prizm-text-muted"
                                  />
                                )}
                              </span>
                            )}
                            <span>
                              <div className="flex flex-col gap-0.5 min-w-0">
                                      <span className="font-black text-emerald-700 whitespace-nowrap">
                                        {getCorrectiveIssuePrimaryCode(issue)}
                                      </span>
                                      <span className="text-[10px] text-prizm-text font-bold leading-tight">
                                        {getCorrectiveIssueTitleForTile(issue)}
                                      </span>
                                    </div>
                              {issue.suppressedDuplicateCount > 0 ? (
                                <span className="ml-2 text-[8px] text-prizm-text-muted">
                                  +{issue.suppressedDuplicateCount} related
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center text-emerald-700 font-extrabold">
                          {isCorrectiveHvacIssue(issue)
                            ? getCorrectiveExpandedTargetLabels(issue).length
                            : (issue.affected?.length || issue.occurrences?.length || 0)}
                        </td>
                        <td className="py-2.5 px-3 text-prizm-text font-semibold max-w-[220px] truncate" title={isCorrectiveHvacIssue(issue) ? getCorrectiveExpandedTargetLabels(issue).join(" • ") : (issue.affectedSummary || issue.object)}>
                          {isCorrectiveHvacIssue(issue)
                            ? getCorrectiveAffectedSummaryForTile(issue)
                            : (issue.affectedSummary || issue.object)}
                        </td>
                        <td className="py-2.5 px-3 text-prizm-text-muted max-w-[220px] whitespace-normal leading-tight text-[9px]">
                          {kb?.managerSummary || "Local diagnostic review is recommended for this alarm pattern."}
                        </td>
                        <td className="py-2.5 px-3 text-prizm-text flex items-center justify-between gap-4">
                          <span className="font-semibold text-emerald-400">{kb?.summaryAction || issue.suggestedAction}</span>
                          {(kb?.summaryAction || issue.suggestedAction)
                            ?.toLowerCase()
                            .includes("balance") ||
                          (kb?.summaryAction || issue.suggestedAction)
                            ?.toLowerCase()
                            .includes("balancing") ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleActionClick(issue);
                              }}
                              className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded uppercase tracking-widest text-[9px] hover:bg-blue-500/20 transition-colors cursor-pointer"
                            >
                              Inspect Strings
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {hasOccurrences && isExpanded && (
                        <tr className="bg-white border border-slate-200 text-slate-900">
                          <td
                            colSpan={7}
                            className="py-4 px-4 border-l-2 border-prizm-primary"
                          >
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-[10px]">
                              {/* Left Panel: Affected Targets */}
                              <div className="lg:col-span-5 flex flex-col gap-2">
                                <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-prizm-primary animate-pulse"></span>
                                  Affected Targets ({isCorrectiveHvacIssue(issue)
                                    ? getCorrectiveExpandedTargetLabels(issue).length
                                    : (issue.affected ? issue.affected.length : issue.occurrences.length)}):
                                </div>
                                {issue.affected && issue.affected.length > 0 ? (
                                  <div className="border border-prizm-border/40 rounded overflow-x-auto bg-white border border-slate-200 text-slate-900 divide-y divide-prizm-border/10">
                                    {isCorrectiveHvacIssue(issue) ? (
                                      <div className="min-w-[720px]">
                                        <div className="sticky top-0 z-[1] grid grid-cols-[88px_56px_105px_105px_1fr_110px] gap-2 bg-slate-100 border-b border-slate-300 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-slate-600">
                                          <span>Location</span>
                                          <span>Fault</span>
                                          <span>HVAC 1 · Cmd / A</span>
                                          <span>HVAC 2 · Cmd / A</span>
                                          <span>Mismatch</span>
                                          <span>Controller IP</span>
                                        </div>
                                        {getCorrectiveHvacTargetRows(issue).map((target) => {
                                          const feedbackMismatch = target.commanded !== null && target.active !== null
                                            ? target.commanded !== target.active
                                            : true;
                                          const stateLabel = target.commanded === true && target.active === false
                                            ? "ON → NO RUN"
                                            : target.commanded === false && target.active === true
                                              ? "OFF → RUNNING"
                                              : target.commanded === target.active && target.commanded !== null
                                                ? "MATCHED"
                                                : "CHECK";
                                          return (
                                            <div
                                              key={target.key}
                                              className="grid grid-cols-[88px_56px_105px_105px_1fr_110px] gap-2 items-center px-2.5 py-2 border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                                              title={target.label}
                                            >
                                              <span className="font-black text-slate-900 whitespace-nowrap">
                                                Array {target.arrayNumber ?? "?"} · {target.segmentNumber === 0 ? "CS" : `ES${target.segmentNumber ?? "?"}`}
                                              </span>
                                              <span className="font-black text-slate-900">H{target.hvacUnit ?? "?"}</span>
                                              <span className={`inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-[8px] font-black ${target.hvac1Commanded ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                                                {target.hvac1Commanded === null ? "—" : target.hvac1Commanded ? "ON" : "OFF"} · {target.hvac1CurrentA === null ? "—" : `${target.hvac1CurrentA.toFixed(1)} A`}
                                              </span>
                                              <span className={`inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-[8px] font-black ${target.hvac2Commanded ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                                                {target.hvac2Commanded === null ? "—" : target.hvac2Commanded ? "ON" : "OFF"} · {target.hvac2CurrentA === null ? "—" : `${target.hvac2CurrentA.toFixed(1)} A`}
                                              </span>
                                              <span className={`inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-[8px] font-black ${target.crossUnitMismatch || feedbackMismatch ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}>
                                                {target.crossUnitMismatch || stateLabel}
                                              </span>
                                              <span className="font-bold text-slate-700 whitespace-nowrap">{target.deviceIp || "Not reported"}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (() => {
                                      const hvacTargetLabels = isCorrectiveHvacIssue(issue)
                                        ? getCorrectiveExpandedTargetLabels(issue)
                                        : [];

                                      const rawTargets = hvacTargetLabels.length > 0
                                        ? hvacTargetLabels.map((label: string) => ({
                                            condensedLabel: label,
                                            condensedCount: 1,
                                            source: "FEATHER",
                                            targetLabel: label
                                          }))
                                        : (issue.affected || []);

                                      const condensedTargets = hvacTargetLabels.length > 0
                                        ? rawTargets
                                        : condenseAffectedTargetsForDisplay(rawTargets);

                                      const displayLimit = 60;
                                      const toShow = condensedTargets.length <= displayLimit
                                        ? condensedTargets
                                        : condensedTargets.slice(0, displayLimit);

                                      const listElems = toShow.map((aff: any, affIdx: number) => {
                                        const label = aff.condensedLabel || aff.targetLabel || formatAffectedTargetForDisplay(aff, issue.resolved?.system, kb?.detailView);
                                        const targetKey = `${issueKey}-target-${label}`;
                                        const targetOpen = expandedCorrectiveTarget === targetKey;
                                        return <React.Fragment key={targetKey}>
                                        <div
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedCorrectiveTarget(targetOpen ? null : targetKey);
                                          }}
                                          className="py-1.5 px-2.5 hover:bg-prizm-primary/10 cursor-pointer transition-colors flex justify-between items-center gap-3"
                                          title={`${label} (${aff.condensedCount || 1} target${(aff.condensedCount || 1) === 1 ? "" : "s"}) — expand details here`}
                                        >
                                          <span className="text-prizm-text font-bold truncate">
                                            {targetOpen ? <ChevronDown size={11} className="inline mr-1" /> : <ChevronRight size={11} className="inline mr-1" />}
                                            {label}
                                          </span>
                                          <span className="flex items-center gap-1 shrink-0">
                                            {(aff.condensedCount || 1) > 1 ? (
                                              <span className="text-[8px] bg-prizm-primary/15 border border-prizm-primary/30 px-1 rounded text-emerald-700 font-bold">
                                                ×{aff.condensedCount}
                                              </span>
                                            ) : null}
                                            <span className="text-[8px] bg-white border border-slate-200 text-slate-900 px-1 rounded text-slate-600">
                                              {aff.source || "EMS"}
                                            </span>
                                          </span>
                                        </div>
                                        {targetOpen ? (
                                          <div className="px-3 py-2 bg-slate-100 border-t border-slate-200 whitespace-normal text-[9px] leading-relaxed">
                                            <div className="font-black text-slate-900 mb-1">Device fault detail</div>
                                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-700">
                                              <span>Location</span><span className="font-bold">{label}</span>
                                              <span>Severity</span><span className="font-bold">{String(issue.level || issue.severity || "Warning")}</span>
                                              <span>Fault</span><span className="font-bold">{getCorrectiveIssueTitleForTile(issue)}</span>
                                              <span>Source</span><span className="font-bold">{aff.source || issue.source || "FEATHER / EMS"}</span>
                                              {issue?.evidence?.detectedCondition ? <><span>Detected condition</span><span className="font-bold">{String(issue.evidence.detectedCondition)}</span></> : null}
                                            </div>
                                          </div>
                                        ) : null}
                                        </React.Fragment>;
                                      });

                                      if (condensedTargets.length > displayLimit) {
                                        listElems.push(
                                          <div key="condensed-indicator" className="py-1.5 px-2.5 bg-white border border-slate-200 text-slate-900 text-slate-600 italic text-[9px]">
                                            ... and {condensedTargets.length - displayLimit} more condensed target groups
                                          </div>
                                        );
                                      }

                                      if (!hvacTargetLabels.length && rawTargets.length !== condensedTargets.length) {
                                        // Legacy non-HVAC condensation only.
                                      }

                                      return listElems;
                                    })()}
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {(() => {
                                      const occCount = (issue.occurrences || []).length;
                                      const displayLimit = 15;
                                      const toShow = occCount <= displayLimit ? (issue.occurrences || []) : (issue.occurrences || []).slice(0, displayLimit);
                                      const listElems = toShow.map((occ: any, oIdx: number) => {
                                        const label = occ.enclosureLabel || occ.deviceIp || occ.endpoint || "Unknown Unit";
                                        return (
                                          <div
                                            key={oIdx}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleActionClick({
                                                ...occ,
                                                ip: occ.deviceIp || occ.endpoint,
                                                source: issue.source || (occ.deviceIp ? "hvac" : "ems")
                                              });
                                            }}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-900/40 rounded border border-prizm-border/30 hover:bg-prizm-primary/15 hover:border-prizm-primary/60 cursor-pointer transition-all truncate"
                                          >
                                            <span className="w-1 h-1 rounded-full bg-prizm-warning animate-pulse"></span>
                                            <span className="truncate text-prizm-text" title={label}>{label}</span>
                                          </div>
                                        );
                                      });
                                      if (occCount > displayLimit) {
                                        listElems.push(
                                          <div key="condensed-occ-indicator" className="col-span-2 py-1 px-2.5 bg-white border border-slate-200 text-slate-900 text-slate-600 italic text-[9px] rounded border border-prizm-border/20">
                                            ... and {occCount - displayLimit} more affected targets
                                          </div>
                                        );
                                      }

                                      return listElems;
                                    })()}
                                  </div>
                                )}
                              </div>

                              <div className="lg:col-span-7 flex flex-col gap-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Recommended Actions */}
                                  <div>
                                    <div className="text-[9.5px] uppercase font-bold text-emerald-400 tracking-wider mb-1.5 flex items-center justify-between gap-2">
                                      <span>• Recommended Actions</span>
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          const matrixId = issue?.resolved?.matrixEntryId || kb?.id;
                                          if (matrixId) localStorage.setItem("prizm_troubleshooting_selected_entry", String(matrixId));
                                          localStorage.setItem("prizm_troubleshooting_open_matrix", "true");
                                          navigate("troubleshooting-library");
                                        }}
                                        className="rounded border border-prizm-primary/40 bg-prizm-primary/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-emerald-700 hover:bg-prizm-primary/20"
                                      >
                                        Edit Guidance
                                      </button>
                                    </div>
                                    <ul className="list-none space-y-1 pl-1">
                                      {(kb?.recommendedActions || issue.resolved?.recommendedActions || ["Perform local site audit."]).map((act: string, aIdx: number) => (
                                        <li key={aIdx} className="text-prizm-text text-[9.5px] leading-tight flex items-start gap-1">
                                          <span className="text-emerald-400 font-bold shrink-0">›</span>
                                          <span>{act}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>

                                  {/* Validation Checks */}
                                  <div>
                                    <div className="text-[9.5px] uppercase font-bold text-prizm-text-muted tracking-wider mb-1.5">
                                      • Validation Checks
                                    </div>
                                    <ul className="list-none space-y-1 pl-1">
                                      {(kb?.validationChecks || issue.resolved?.validationChecks || ["Review telemetry charts."]).map((chk: string, cIdx: number) => (
                                        <li key={cIdx} className="text-prizm-text-muted text-[9.5px] leading-tight flex items-start gap-1">
                                          <span className="text-prizm-text-muted shrink-0">›</span>
                                          <span>{chk}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>

                                {/* Clearing Criteria & Metadata footer */}
                                <div className="border-t border-prizm-border/20 pt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[9px]">
                                  {/* Clearing */}
                                  <div className="flex-1">
                                    <span className="font-bold text-blue-400 block mb-0.5 uppercase tracking-wide">• Clearing Criteria</span>
                                    <span className="text-prizm-text-muted italic leading-tight block">
                                      {(kb?.clearingCriteria || issue.resolved?.clearingCriteria || ["Alert clear register evaluates to OK."]).join(" • ")}
                                    </span>
                                  </div>

                                  {/* Source documentation page */}
                                  <div className="shrink-0 bg-white border border-slate-200 text-slate-900 px-2 py-1 rounded border border-prizm-border/40 text-slate-600 font-sans text-right uppercase">
                                    <span className="font-bold text-emerald-700 block text-[8px]">Resolution Source</span>
                                    {kb ? `${kb.sourceDocument} - Page ${kb.sourcePage}` : (issue.resolved?.sourceLabel || "Stack750 Troubleshooting Guide")}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-[10px] text-prizm-text-muted uppercase font-mono">
              No active corrective actions detected.
            </div>
          )}
        </div>
      </div>
    </div>

      <HvacQuickReference
        devices={runtimeFeatherDevicesRef.current}
        fallbackUseRpm={hvacUseFanRpmForFaults}
      />

      {/* EMS Apps */}
      <div className="bg-prizm-surface border border-prizm-border rounded-lg flex flex-col mt-4">
        <div className="flex items-center justify-between p-3 border-b border-prizm-border">
          <div className="flex items-center gap-2">
            <BoxSelect size={14} className="text-emerald-700" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-prizm-text">
              EMS APPS
            </span>
          </div>
          <button
            onClick={() => setIsAdvancedMode(!isAdvancedMode)}
            className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded border transition-colors ${
              isAdvancedMode
                ? "bg-amber-500/10 border-amber-500/50 text-amber-500 hover:bg-amber-500/20"
                : "bg-prizm-surface-strong border-prizm-border text-prizm-text hover:bg-white/5"
            }`}
          >
            {isAdvancedMode ? <Unlock size={12} /> : <Lock size={12} />}
            {isAdvancedMode
              ? "Advanced Controls Unlocked"
              : "Unlock Advanced Controls"}
          </button>
        </div>
        {emsAppsData.length > 0 ? (
          <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
            <thead className="bg-white border border-slate-200 text-slate-900 text-slate-600 uppercase tracking-widest border-b border-prizm-border">
              <tr>
                <th className="py-1 px-2 font-bold text-center">Pri</th>
                <th className="py-1 px-2 font-bold">App Code</th>
                <th className="py-1 px-2 font-bold">App Name</th>
                {isAdvancedMode && (
                  <th className="py-1 px-2 font-bold text-center">Action</th>
                )}
                <th className="py-1 px-2 font-bold">Configuration</th>
                <th className="py-1 px-2 font-bold text-center">Status</th>
                <th className="py-1 px-2 font-bold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-prizm-border">
              {emsAppsData.map((app: any, idx: number) => {
                let displayStatus =
                  app.status || (app.enabled ? "Enabled" : "Not Enabled");
                let statusColor = "bg-slate-500/10 text-slate-400";

                const h = String(
                  app.healthRaw || app.health || displayStatus || "",
                ).toUpperCase();
                if (h.includes("FAULT")) {
                  displayStatus = "Faulted";
                  statusColor = "bg-prizm-danger/10 text-prizm-danger";
                } else if (h.includes("WARN")) {
                  displayStatus = "Warning";
                  statusColor = "bg-prizm-warning/10 text-prizm-warning";
                } else if (
                  h.includes("HEALTHY") ||
                  displayStatus.toUpperCase() === "ENABLED"
                ) {
                  displayStatus = "Enabled";
                  statusColor = "bg-emerald-500/10 text-emerald-500";
                } else if (h.includes("UNAVAIL") || h.includes("OFFLINE")) {
                  displayStatus = "Unavailable";
                  statusColor = "bg-prizm-danger/10 text-prizm-danger";
                }

                return (
                  <tr
                    key={idx}
                    className="hover:bg-prizm-surface transition-colors"
                  >
                    <td className="py-1 px-2 text-center text-prizm-text-muted">
                      {app.priority !== undefined && app.priority !== null
                        ? app.priority
                        : "--"}
                    </td>
                    <td className="py-1 px-2 text-prizm-text font-bold">
                      {app.appCode || "--"}
                    </td>
                    <td className="py-1 px-2 text-emerald-700 font-bold">
                      {app.appName || "--"}
                    </td>
                    {isAdvancedMode && (
                      <td className="py-1 px-2 text-center w-[100px]">
                        {app.supportedLocally && app.interaction === "enableDisable" ? (
                          <button
                            onClick={() => {
                              void executeEmsAppAction(app, !app.enabled);
                            }}
                            className={`px-2 py-1 flex items-center justify-center gap-1 rounded font-bold uppercase transition-colors w-full border ${
                              app.enabled
                                ? "bg-red-500/10 border-red-500/30 text-red-600 hover:bg-red-500/20"
                                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/20"
                            }`}
                          >
                            {app.enabled ? <><Pause size={10} /> Disable</> : <><Play size={10} /> Enable</>}
                          </button>
                        ) : app.supportedLocally && app.interaction === "powerControl" ? (
                          <div className="flex gap-1">
                            <button onClick={() => void executeEmsAppAction(app, !app.enabled)} className={`flex-1 rounded border px-2 py-1 font-bold uppercase ${app.enabled ? "border-red-500/30 bg-red-500/10 text-red-600" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"}`}>{app.enabled ? "Disable" : "Enable"}</button>
                            <button onClick={() => openPowerControl(app)} className="flex-1 rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1 font-bold uppercase text-blue-700 hover:bg-blue-500/20">Set Power</button>
                          </div>
                        ) : (
                          <span className="block px-2 py-1 rounded border border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase" title={app.reason || "No verified local control mapping"}>
                            Read only
                          </span>
                        )}
                      </td>
                    )}
                    <td className="py-1 px-2 text-prizm-text-muted text-xs">
                      {app.configName || "--"}{" "}
                      {app.configVersionId ? `(v${app.configVersionId})` : ""}
                    </td>
                    <td className="py-1 px-2 text-center">
                      <span
                        className={`px-2 py-[2px] rounded font-bold ${statusColor}`}
                      >
                        {displayStatus}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-prizm-text whitespace-pre-wrap leading-tight">
                      {(app.hasShortAppStatus && app.shortAppStatus
                        ? app.shortAppStatus
                        : app.appStatus || app.reason || "--"
                      ).replace(/<br\s*\/?>/gi, "\n")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted">
            No EMS Apps data discovered
          </div>
        )}
      </div>

      <CollapsibleSection
        title={`Block Topology (${filteredTopologyEntities.length}/${topologyEntities.length})`}
        icon={Network}
        defaultExpanded={false}
        onExpandedChange={(expanded) => { if (expanded) setTopologyRequested(true); }}
      >
        <div className="border-b border-prizm-border bg-prizm-surface p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="mr-auto flex flex-wrap gap-1.5">
              {topologyFamilySummary.map(({ type, total, attention }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setTopologyTypeFilter(type); setTopologyView("table"); setTopologyRowLimit(150); }}
                  className={`rounded border px-2 py-1.5 text-[8px] font-bold uppercase transition-colors ${topologyTypeFilter === type ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-prizm-border bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {type} <span className="font-mono">{total}</span>{attention > 0 && <span className="ml-1 text-red-600">· {attention}</span>}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded border border-prizm-border bg-white p-0.5">
              <button type="button" onClick={() => setTopologyView("table")} className={`rounded px-3 py-1 text-[8px] font-bold uppercase ${topologyView === "table" ? "bg-slate-900 text-white" : "text-slate-600"}`}>Tabular</button>
              <button type="button" onClick={() => setTopologyView("oneline")} className={`rounded px-3 py-1 text-[8px] font-bold uppercase ${topologyView === "oneline" ? "bg-slate-900 text-white" : "text-slate-600"}`}>One-line</button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(220px,1fr)_190px_170px_180px_auto]">
            <input
              value={topologySearch}
              onChange={(event) => { setTopologySearch(event.target.value); setTopologyRowLimit(150); }}
              placeholder="Search device, entity key, type, subtype, or status…"
              className="rounded border border-prizm-border bg-white px-3 py-2 text-[10px] text-slate-900 outline-none focus:border-prizm-primary"
            />
            <select value={topologyTypeFilter} onChange={(event) => { setTopologyTypeFilter(event.target.value); setTopologyRowLimit(150); }} className="rounded border border-prizm-border bg-white px-3 py-2 text-[10px] text-slate-900">
              <option value="all">All device types</option>
              {topologyTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select value={topologyHealthFilter} onChange={(event) => { setTopologyHealthFilter(event.target.value); setTopologyRowLimit(150); }} className="rounded border border-prizm-border bg-white px-3 py-2 text-[10px] text-slate-900">
              <option value="all">All health states</option>
              <option value="healthy">Healthy</option>
              <option value="attention">Needs attention</option>
            </select>
            <label className="flex items-center gap-2 rounded border border-prizm-border bg-white px-2 py-2 text-[9px] font-bold uppercase text-prizm-text-muted">
              <select value={topologySegmentSizingMode} onChange={(event) => setTopologySegmentSizingMode(event.target.value as "auto" | "manual")} className="min-w-0 border-0 bg-transparent text-[9px] font-bold uppercase text-slate-600 outline-none">
                <option value="auto">Auto verified</option>
                <option value="manual">Manual override</option>
              </select>
              <input aria-label="Energy segments per lineup" type="number" min="1" max="99" disabled={topologySegmentSizingMode === "auto"} value={topologyEnergySegmentsPerLineup} onChange={(event) => setTopologyEnergySegmentsPerLineup(Math.max(1, Math.floor(Number(event.target.value) || 1)))} className="w-10 border-0 bg-transparent text-right text-[11px] font-mono text-slate-900 outline-none disabled:text-emerald-700" />
            </label>
            <button type="button" onClick={() => { setTopologySearch(""); setTopologyTypeFilter("all"); setTopologyHealthFilter("all"); setTopologyRowLimit(150); }} className="rounded border border-prizm-border bg-white px-3 py-2 text-[10px] font-bold uppercase text-prizm-text-muted hover:bg-slate-50">Clear filters</button>
          </div>
          <p className="mt-2 text-[9px] text-prizm-text-muted">Read-only topology from the current Site Operations snapshot. {topologySegmentSizingMode === "auto" ? (inferredTopologyEnergySegments ? `Segment sizing verified from Collection Segment anchors: ${inferredTopologyEnergySegments} ES per lineup.` : "Waiting for enough Collection Segment anchors to verify segment sizing.") : `Manual segment sizing override active${inferredTopologyEnergySegments ? `; topology currently indicates ${inferredTopologyEnergySegments} ES per lineup` : ""}.`} Fault reset remains protected under Safety / Advanced.</p>
        </div>
        {topologyView === "oneline" ? (
          <div className="grid grid-cols-1 gap-3 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {arraySummaryData.map((array: any, index: number) => {
              const arrayNumber = finiteNumber(array?.arrayNumber, array?.arrayIndex, array?.array, index + 1) ?? index + 1;
              const online = finiteNumber(array?.onlineStringCount, array?.onlineStrings, array?.onlineCount, array?.buckets?.online);
              const nearline = finiteNumber(array?.nearlineStringCount, array?.nearlineStrings, array?.nearlineCount, array?.buckets?.nearline);
              const offline = finiteNumber(array?.offlineStringCount, array?.offlineStrings, array?.offlineCount, array?.buckets?.offline);
              const soc = finiteNumber(
                array?.socPct,
                array?.soc,
                array?.averageSocPct,
                array?.avgSocPct,
                online && online > 0 ? array?.onlineSOC : null,
                nearline && nearline > 0 ? array?.nearlineSOC : null,
                array?.onlineSOC,
                array?.nearlineSOC,
                array?.offlineSOC
              );
              const arrayPcs = pcsData.find((pcs: any) => Number(pcs?.arrayNumber ?? pcs?.arrayIndex) === Number(arrayNumber));
              const ready = array?.communicating !== false && arrayPcs?.communicating !== false && arrayPcs?.isReady !== false;
              return (
                <button key={`array-oneline-${arrayNumber}`} type="button" onClick={() => setSelectedTopologyArray(Number(arrayNumber))} className={`rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-emerald-400 hover:shadow-md ${selectedTopologyArray === Number(arrayNumber) ? "border-emerald-500 ring-2 ring-emerald-100" : "border-prizm-border"}`}>
                  <div className="flex items-center justify-between border-b border-prizm-border pb-2">
                    <strong className="text-[11px] uppercase tracking-wider text-slate-900">Array {arrayNumber}</strong>
                    <span className={`rounded px-2 py-0.5 text-[8px] font-bold uppercase ${ready ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{ready ? "Ready" : "Attention"}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 font-mono">
                    <div><span className="block text-[8px] uppercase text-slate-400">State of charge</span><strong className="text-[16px] text-slate-900">{soc === null ? "--" : `${soc.toFixed(1)}%`}</strong></div>
                    <div><span className="block text-[8px] uppercase text-slate-400">PCS</span><strong className="text-[11px] text-slate-700">{arrayPcs?.state || array?.pcsState || array?.state || (ready ? "Ready" : "Check")}</strong></div>
                  </div>
                  <div className="mt-3 flex gap-3 border-t border-prizm-border pt-2 text-[8px] font-bold uppercase">
                    <span className="text-emerald-700">Online {online ?? "--"}</span><span className="text-amber-600">Near {nearline ?? "--"}</span><span className="text-red-600">Off {offline ?? "--"}</span>
                  </div>
                </button>
              );
            })}
            {arraySummaryData.length === 0 && <div className="col-span-full rounded border border-dashed border-prizm-border bg-white p-8 text-center text-[10px] uppercase text-prizm-text-muted">No array summary is available in the current snapshot.</div>}
            {selectedArraySummary && selectedTopologyArray !== null && (
              <div className="col-span-full overflow-hidden rounded-lg border border-emerald-300 bg-white shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-prizm-border bg-emerald-50 px-4 py-3">
                  <div>
                    <strong className="block text-[12px] uppercase tracking-wider text-emerald-900">Array {selectedTopologyArray} System Details</strong>
                    <span className="text-[8px] uppercase text-emerald-700">Select another array above to compare without leaving this view</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setTopologyView("table"); setTopologySearch(`Array ${selectedTopologyArray}`); setTopologyRowLimit(150); }} className="rounded border border-emerald-300 bg-white px-3 py-1.5 text-[8px] font-bold uppercase text-emerald-800 hover:bg-emerald-100">View devices</button>
                    <button type="button" onClick={() => setActiveTab?.("arrays-strings")} className="rounded bg-emerald-700 px-3 py-1.5 text-[8px] font-bold uppercase text-white hover:bg-emerald-800">Open strings</button>
                    <button type="button" aria-label="Close array details" onClick={() => setSelectedTopologyArray(null)} className="rounded border border-prizm-border bg-white px-2 py-1.5 text-[10px] text-slate-500 hover:bg-slate-50">×</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-px bg-prizm-border md:grid-cols-4 xl:grid-cols-8">
                  {[
                    ["PCS State", selectedArrayPcs?.state || "--"],
                    ["PCS Ready", selectedArrayPcs?.isReady === true ? "Yes" : selectedArrayPcs?.isReady === false ? "No" : "--"],
                    ["Online SOC", finiteNumber(selectedArraySummary?.onlineSOC) === null ? "--" : `${finiteNumber(selectedArraySummary?.onlineSOC)?.toFixed(1)}%`],
                    ["Online Strings", String(selectedArraySummary?.onlineStringCount ?? "--")],
                    ["Nearline Strings", String(selectedArraySummary?.nearlineStringCount ?? "--")],
                    ["Offline Strings", String(selectedArraySummary?.offlineStringCount ?? "--")],
                    ["Real Power", formatPower(finiteNumber(selectedArrayPcs?.acRealPowerKW, selectedArraySummary?.measuredkW))],
                    ["Commanded", formatPower(finiteNumber(selectedArrayPcs?.acCmdRealPowerKW, selectedArraySummary?.commandedkW))],
                    ["DC Voltage", finiteNumber(selectedArrayPcs?.dcVoltageVolt) === null ? "--" : `${finiteNumber(selectedArrayPcs?.dcVoltageVolt)?.toLocaleString()} V`],
                    ["DC Current", finiteNumber(selectedArrayPcs?.dcCurrentAmp) === null ? "--" : `${finiteNumber(selectedArrayPcs?.dcCurrentAmp)?.toLocaleString()} A`],
                    ["AC Voltage", finiteNumber(selectedArrayPcs?.acVoltageAB) === null ? "--" : `${finiteNumber(selectedArrayPcs?.acVoltageAB)?.toLocaleString()} V`],
                    ["Frequency", finiteNumber(selectedArrayPcs?.frequencyHz, selectedArrayPcs?.acFrequencyHz) === null ? "--" : `${finiteNumber(selectedArrayPcs?.frequencyHz, selectedArrayPcs?.acFrequencyHz)?.toFixed(2)} Hz`],
                    ["In Rotation", String(selectedArraySummary?.inRotationCount ?? "--")],
                    ["Out Rotation", String(selectedArraySummary?.outOfRotationCount ?? "--")],
                    ["Stored DC", formatEnergy(selectedArrayStoredKWh)],
                    ["Source", selectedArraySummary?.sourcePath || "normalized array"],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0 bg-white px-3 py-3">
                      <span className="block text-[8px] font-bold uppercase text-slate-400">{label}</span>
                      <strong className="mt-1 block truncate font-mono text-[11px] text-slate-800" title={value}>{value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
        <>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[900px] text-left text-[10px] font-mono">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 uppercase tracking-wider shadow-sm">
              <tr>
                <th className="px-3 py-2">Device</th>
                <th className="px-3 py-2 text-center">Health</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">SubType</th>
                <th className="px-3 py-2">Converted Location</th>
                <th className="px-3 py-2">Status Message</th>
                <th className="px-3 py-2 text-center">Fault Reset</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-prizm-border">
              {filteredTopologyEntities.slice(0, topologyRowLimit).map((entity: any, index: number) => {
                const healthy = entity?.enabled !== false && entity?.ready !== false && entity?.communicating !== false;
                const convertedLocation = getTopologyConvertedLocation(entity, topologyEnergySegmentsPerLineup);
                const statusMessage = entity?.statusMessageText || entity?.statusMessage || (healthy ? "Operational / reporting normally" : [entity?.enabled === false ? "Disabled" : null, entity?.ready === false ? "Not ready" : null, entity?.communicating === false ? "Not communicating" : null].filter(Boolean).join(" · "));
                return (
                  <tr key={`${entity?.entityKey || entity?.displayKey || "topology"}-${index}`} className="bg-white hover:bg-slate-50">
                    <td className="px-3 py-2"><strong className="block text-slate-900">{entity?.displayKey || entity?.entityKey || "Unnamed device"}</strong><span className="block max-w-[300px] truncate text-[8px] text-slate-400" title={entity?.entityKey}>{entity?.entityKey || "--"}</span></td>
                    <td className="px-3 py-2 text-center"><span className={`inline-flex rounded px-2 py-0.5 text-[8px] font-bold uppercase ${healthy ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{healthy ? "Healthy" : "Attention"}</span></td>
                    <td className="px-3 py-2 font-bold text-slate-700">{entity?.entityType || "Unknown"}</td>
                    <td className="px-3 py-2 text-slate-600">{entity?.entitySubType || "--"}</td>
                    <td className="px-3 py-2"><strong className="block text-slate-800">{convertedLocation?.label || "Not segment-addressed"}</strong>{convertedLocation && <span className="block text-[8px] text-slate-400">{convertedLocation.detail}</span>}</td>
                    <td className="px-3 py-2 text-slate-700">{statusMessage || "--"}</td>
                    <td className="px-3 py-2 text-center">{entity?.allowFaultReset === true ? <button type="button" onClick={() => navigate("safety-fault")} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[8px] font-bold uppercase text-red-700 hover:bg-red-100">Eligible · Open Safety</button> : <span className="text-slate-400">No</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredTopologyEntities.length > topologyRowLimit && <div className="flex justify-center border-t border-prizm-border bg-prizm-surface p-3"><button type="button" onClick={() => setTopologyRowLimit((current) => current + 250)} className="rounded border border-prizm-border bg-white px-4 py-2 text-[9px] font-bold uppercase text-prizm-text hover:bg-slate-50">Load 250 more ({filteredTopologyEntities.length - topologyRowLimit} remaining)</button></div>}
        </>
        )}
      </CollapsibleSection>

      {/* Safety & Source Health */}
      <CollapsibleSection
        title="Safety Fault Candidates"
        icon={ShieldAlert}
        defaultExpanded={false}
      >
        {safetyEligible > 0 ? (
          <div>
            <div className="bg-prizm-surface p-4 flex flex-col justify-center items-center border-b border-prizm-border">
              <div className="text-[10px] text-prizm-text-muted uppercase font-bold tracking-wider mb-1">
                Clearable Faults
              </div>
              <div className="text-2xl font-bold font-mono text-prizm-danger animate-pulse">
                {safetyEligible}
              </div>
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
                <thead className="bg-white border border-slate-200 text-slate-900 text-slate-600 uppercase tracking-widest border-b border-prizm-border">
                  <tr>
                    <th className="py-1 px-2 font-bold">Entity</th>
                    <th className="py-1 px-2 font-bold min-w-[200px]">
                      Status Message
                    </th>
                    <th className="py-1 px-2 font-bold text-center">Enabled</th>
                    <th className="py-1 px-2 font-bold text-center">Source</th>
                    <th className="py-1 px-2 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-prizm-border">
                  {clearableFaults.map((f: any, idx: number) => (
                    <tr
                      key={idx}
                      className="hover:bg-prizm-surface transition-colors"
                    >
                      <td className="py-1 px-2 font-bold text-emerald-700">
                        {f.displayKey || f.entityKey}
                      </td>
                      <td className="py-1 px-2 text-prizm-text whitespace-pre-wrap max-w-sm">
                        {f.statusMessageText || f.statusMessage}
                      </td>
                      <td className="py-1 px-2 text-center text-prizm-text-muted">
                        {f.enabled ? "Yes" : "No"}
                      </td>
                      <td className="py-1 px-2 text-center text-prizm-text-muted uppercase">
                        {f.source}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <button
                          onClick={() => executeOneClickClear(f)}
                          disabled={clearLoading || f.allowFaultReset !== true || !f.entityKeyToken}
                          title="Immediately send a manual fault reset for this EMS-eligible device"
                          className="px-2 py-1 bg-prizm-danger/10 text-prizm-danger rounded hover:bg-prizm-danger hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {clearLoading && clearCandidate?.entityKeyToken === f.entityKeyToken ? "Resetting…" : "Reset Fault"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-4 text-[10px] font-mono uppercase text-prizm-text-muted border-b border-prizm-border">
            {sum?.safetySummary?.sourceOk === false
              ? "Safety fault data is unavailable."
              : "No clearable safety faults detected."}
          </div>
        )}
        <div className="bg-prizm-surface p-3 flex justify-end border-t border-prizm-border">
          <button
            onClick={() => navigate("safety-fault")}
            className="text-[10px] font-bold uppercase tracking-widest font-mono bg-prizm-danger/10 text-prizm-danger px-4 py-2 hover:bg-prizm-danger/20 transition-colors border border-prizm-danger/30 rounded"
          >
            Open Safety Fault Clear
          </button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Source / Cache Health"
        icon={Network}
        defaultExpanded={false}
      >
        <div className="overflow-y-auto no-scrollbar max-h-[250px]">
          {combinedSources.length > 0 ? (
            <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
              <thead className="bg-white border border-slate-200 text-slate-900 text-slate-600 uppercase tracking-widest border-b border-prizm-border">
                <tr>
                  <th className="py-1 px-2 font-bold w-1/4">Source</th>
                  <th className="py-1 px-2 font-bold w-1/4">Module</th>
                  <th className="py-1 px-2 font-bold w-1/2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-prizm-border">
                {combinedSources.map((src, i) => (
                  <tr
                    key={i}
                    className="hover:bg-prizm-surface transition-colors"
                  >
                    <td className="py-1 px-2 font-bold text-prizm-text">
                      {src.name}
                    </td>
                    <td className="py-1 px-2 text-prizm-text-muted">
                      {src.type}
                    </td>
                    <td className="py-1 px-2">
                      <span
                        className={
                          src.ok
                            ? "text-emerald-400 font-bold flex items-center gap-1"
                            : "text-prizm-danger font-bold flex items-center gap-1"
                        }
                        title={src.error || ""}
                      >
                        {src.ok ? (
                          <>
                            <CheckCircle2 size={12} /> OK
                          </>
                        ) : (
                          <>
                            <ServerOff size={12} /> FAILED
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-[10px] text-prizm-text-muted uppercase font-mono py-4">
              No localized source data found.
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Recent Event Timeline */}
      <CollapsibleSection
        title="Recent Event Timeline"
        icon={Activity}
        defaultExpanded={false}
      >
        <div className="overflow-y-auto no-scrollbar max-h-[300px]">
          {state.historyEvents?.events?.length > 0 ? (
            <table className="w-full text-[10px] font-mono text-left whitespace-nowrap">
              <thead className="bg-white border border-slate-200 text-slate-900 text-slate-600 uppercase tracking-widest border-b border-prizm-border">
                <tr>
                  <th className="py-1 px-2 font-bold">Timestamp</th>
                  <th className="py-1 px-2 font-bold">Severity</th>
                  <th className="py-1 px-2 font-bold">Source</th>
                  <th className="py-1 px-2 font-bold">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-prizm-border">
                {state.historyEvents.events.map((e: any, i: number) => (
                  <tr
                    key={i}
                    className="hover:bg-prizm-surface transition-colors"
                  >
                    <td className="py-1 px-2 text-prizm-text-muted">
                      {formatPrizmUtcTimestamp(e.timestamp)}
                    </td>
                    <td className="py-1 px-2">
                      <span
                        className={`px-2 py-[2px] rounded font-bold ${e.severity === "ALARM" ? "bg-prizm-danger/10 text-prizm-danger" : e.severity === "WARNING" ? "bg-prizm-warning/10 text-prizm-warning" : "bg-slate-500/10 text-slate-400"}`}
                      >
                        {e.severity}
                      </span>
                    </td>
                    <td className="py-1 px-2 font-bold text-prizm-text">
                      {e.source}
                    </td>
                    <td className="py-1 px-2 text-prizm-text whitespace-normal min-w-[200px]">
                      {e.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-[10px] text-prizm-text-muted uppercase font-mono">
              <div className="mb-1">
                No recent historical events recorded yet.
              </div>
              <div>Current active issues are shown above.</div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* PRIZM Cache Orchestration Telemetry Footer */}
      <div className="mt-6 mb-2 p-3 bg-white border border-slate-200 text-slate-900 border border-prizm-border rounded-lg flex flex-col sm:flex-row flex-wrap sm:items-center justify-between gap-3 text-[10px] font-mono tracking-wide">
        <div className="flex items-center gap-2">
          <span className="text-prizm-text-muted">CACHE:</span>
          <span className="text-cyan-500 font-bold truncate max-w-[300px]">
            {state.cacheStatus?.activeSiteCachePath
              ? state.cacheStatus.activeSiteCachePath.replace(
                  /.*\\.prizm-cache/,
                  ".prizm-cache",
                )
              : "NOT DETERMINED"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-prizm-text-muted">CACHE STATE:</span>
            {(() => {
              const st = getDashboardConnectionStatus(
                state.siteSummary,
                state.loading,
              );
              return (
                <span
                  className={`font-bold px-1.5 py-0.5 rounded flex items-center gap-1.5 ${st.bgClass} ${st.colorClass}`}
                >
                  {st.pulse && (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${st.bgClass.replace("/10", "")} animate-pulse`}
                    />
                  )}
                  {st.text}
                </span>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-prizm-text-muted">LAST FETCHED:</span>
            <span className="text-prizm-text font-bold">
              {state.cacheStatus?.activeManifest?.lastUpdatedAt
                ? new Date(
                    state.cacheStatus.activeManifest.lastUpdatedAt,
                  ).toLocaleString()
                : "N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Navigation Panel */}
      <div className="mt-4 pt-4 border-t border-prizm-border flex flex-wrap gap-4 items-center">
        <span className="text-[10px] uppercase font-bold text-prizm-text-muted font-mono mr-2">
          Quick Navigation:
        </span>
        <button
          onClick={() => navigate("arrays-strings")}
          className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-white border border-slate-200 text-slate-900 border border-prizm-border rounded transition-colors text-slate-900"
        >
          STRINGS / BPC
        </button>
        <button
          onClick={() => navigate("feather-hvac")}
          className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-white border border-slate-200 text-slate-900 border border-prizm-border rounded transition-colors text-slate-900"
        >
          FEATHER / HVAC
        </button>
        <button
          onClick={() => navigate("safety-fault")}
          className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-white border border-slate-200 text-slate-900 border border-prizm-border rounded transition-colors text-slate-900"
        >
          SAFETY FAULT CLEAR
        </button>
        <button
          onClick={() => navigate("reports")}
          className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-white border border-slate-200 text-slate-900 border border-prizm-border rounded transition-colors text-slate-900"
        >
          REPORTS / EXPORTS
        </button>
        <button
          onClick={() => navigate("settings")}
          className="text-[10px] font-bold font-mono px-3 py-1.5 bg-prizm-surface hover:bg-white border border-slate-200 text-slate-900 border border-prizm-border rounded transition-colors text-slate-900"
        >
          CONNECTION SETTINGS
        </button>
      </div>

      {/* Clear Safety Fault Modal */}
      {clearCandidate && (
        <div className="fixed inset-0 bg-white border border-slate-200 text-slate-900 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 text-slate-900 border border-prizm-border rounded-lg p-6 max-w-lg w-full">
            <div className="flex items-center gap-3 mb-6 relative">
              <ShieldAlert className="text-prizm-danger" size={24} />
              <div>
                <h2 className="text-lg font-bold text-prizm-danger uppercase tracking-widest font-mono">
                  Confirm Safety Fault Clear
                </h2>
                <p className="text-xs text-prizm-text-muted mt-1 font-mono">
                  Manual intervention command
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-white border border-slate-200 text-slate-900 p-4 border border-prizm-border rounded font-mono text-sm">
                <div className="grid grid-cols-[1fr_2fr] gap-2 mb-2 border-b border-prizm-border pb-2">
                  <span className="text-prizm-text-muted">Entity:</span>
                  <span className="text-emerald-700 font-bold">
                    {clearCandidate.displayKey || clearCandidate.entityKey}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_2fr] gap-2 mb-2 border-b border-prizm-border pb-2">
                  <span className="text-prizm-text-muted">Status:</span>
                  <span className="text-prizm-text break-words whitespace-pre-wrap">
                    {clearCandidate.statusMessageText ||
                      clearCandidate.statusMessage}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_2fr] gap-2 mb-2 border-b border-prizm-border pb-2">
                  <span className="text-prizm-text-muted">Source:</span>
                  <span className="text-prizm-text-muted">
                    {clearCandidate.source}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_2fr] gap-2">
                  <span className="text-prizm-text-muted">Reset Key:</span>
                  <span className="text-prizm-text-muted select-all">
                    {clearCandidate.resetEntityKey}
                  </span>
                </div>
              </div>

              <div className="bg-prizm-warning/10 border border-prizm-warning/30 p-3 rounded">
                <p className="text-prizm-warning text-xs font-bold leading-relaxed">
                  WARNING: This will send a manual clear command to the EMS on
                  behalf of `local-overview`.
                </p>
              </div>

              {!clearResult && !clearLoading && (
                <div>
                  <label className="block text-xs font-bold text-prizm-text mb-2 uppercase tracking-widest font-mono">
                    Type confirmation text:{" "}
                    <span className="text-emerald-700 select-all">
                      {clearCandidate.entityKeyToken}
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder="Paste confirmation text here"
                    value={clearConfRef}
                    onChange={(e) => setClearConfRef(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-slate-900 border border-prizm-border rounded p-2 text-slate-900 font-mono focus:border-prizm-primary outline-none focus:ring-1 focus:ring-prizm-primary"
                  />
                </div>
              )}

              {clearLoading && (
                <div className="flex items-center gap-3 rounded border border-prizm-warning/30 bg-prizm-warning/10 p-4 text-xs font-bold text-prizm-warning">
                  <Activity size={16} className="animate-spin" />
                  Sending reset command and waiting for EMS response…
                </div>
              )}

              {clearResult && (
                <div
                  className={`p-4 border rounded ${clearResult.error || clearResult.verification?.appearsCleared === false ? "bg-prizm-danger/10 border-prizm-danger/30" : "bg-emerald-500/10 border-emerald-500/30"}`}
                >
                  <div className="font-bold mb-1 uppercase text-xs tracking-widest font-mono flex items-center gap-2">
                    {clearResult.error ? (
                      <>
                        <TriangleAlert
                          size={14}
                          className="text-prizm-danger"
                        />{" "}
                        <span className="text-prizm-danger">
                          FAULT CLEAR FAILED
                        </span>
                      </>
                    ) : clearResult.verification?.appearsCleared === false ? (
                      <>
                        <TriangleAlert
                          size={14}
                          className="text-prizm-warning"
                        />{" "}
                        <span className="text-prizm-warning">
                          FAULT CLEARED BUT STILL PRESENT
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} className="text-emerald-400" />{" "}
                        <span className="text-emerald-400">
                          FAULT CLEARED SUCCESSFULLY
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-xs font-mono text-prizm-text-muted mt-2">
                    {clearResult.error ||
                      "The fault reset completed successfully."}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 font-mono">
              <button
                onClick={() => {
                  setClearCandidate(null);
                  setClearConfRef("");
                  setClearResult(null);
                }}
                className="px-4 py-2 border border-prizm-border rounded text-prizm-text-muted hover:bg-prizm-surface transition-colors uppercase tracking-widest text-[10px] font-bold"
              >
                {clearResult ? "Close" : "Cancel"}
              </button>
              {!clearResult && !clearLoading && (
                <button
                  onClick={executeClear}
                  disabled={
                    clearConfRef !== clearCandidate.entityKeyToken ||
                    clearLoading
                  }
                  className="px-4 py-2 bg-prizm-danger text-white rounded font-bold hover:bg-prizm-danger/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-[10px] flex items-center gap-2"
                >
                  {clearLoading ? (
                    <Activity size={14} className="animate-spin" />
                  ) : null}
                  {clearLoading ? "Executing..." : "Confirm Clear"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EMS App Control Modal */}
      {powerControlCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-prizm-border bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-prizm-border bg-prizm-surface p-4">
              <div><h3 className="font-mono text-sm font-bold uppercase tracking-widest">Power Control</h3><p className="mt-1 text-[10px] text-slate-500">PC00001 · Priority {powerControlCandidate.priority}</p></div>
              <button onClick={() => setPowerControlCandidate(null)} disabled={powerControlLoading} className="text-xl text-slate-500">×</button>
            </div>
            <div className="space-y-4 p-6 font-mono text-xs">
              <div className="rounded border border-blue-200 bg-blue-50 p-3 text-blue-900">Positive kW commands discharge; negative kW commands charge. Applying setpoints does not change the app’s enabled state.</div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1"><span className="font-bold uppercase text-slate-600">Real Power (kW)</span><input type="number" value={powerControlKw} onChange={e => setPowerControlKw(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900" /></label>
                <label className="space-y-1"><span className="font-bold uppercase text-slate-600">Reactive Power (kVAr)</span><input type="number" value={powerControlKvar} onChange={e => setPowerControlKvar(Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-slate-900" /></label>
              </div>
              <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 p-3"><span>Application state</span><span className={`font-bold uppercase ${powerControlCandidate.enabled ? "text-emerald-700" : "text-red-600"}`}>{powerControlCandidate.enabled ? "Enabled" : "Disabled"}</span></div>
              {powerControlResult && <div className={`rounded border p-3 ${powerControlResult.success ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-700"}`}>{powerControlResult.message || powerControlResult.error}</div>}
            </div>
            <div className="flex gap-2 border-t border-prizm-border bg-prizm-surface p-4">
              <button onClick={() => setPowerControlCandidate(null)} disabled={powerControlLoading} className="flex-1 rounded border border-slate-300 bg-white px-4 py-2 font-mono text-[10px] font-bold uppercase">Cancel</button>
              <button onClick={() => void executePowerControl()} disabled={powerControlLoading || !Number.isFinite(powerControlKw) || !Number.isFinite(powerControlKvar)} className="flex-1 rounded bg-blue-600 px-4 py-2 font-mono text-[10px] font-bold uppercase text-white disabled:opacity-50">{powerControlLoading ? "Verifying…" : "Apply Setpoints"}</button>
            </div>
          </div>
        </div>
      )}

      {emsAppCandidate && (
        <div className="fixed inset-0 bg-white border border-slate-200 text-slate-900 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 text-slate-900 border border-prizm-border rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="flex items-center gap-2 p-4 bg-prizm-surface border-b border-prizm-border">
              <BoxSelect
                className="text-emerald-700 animate-pulse"
                size={18}
              />
              <h3 className="font-bold text-prizm-text font-mono uppercase tracking-widest text-sm">
                EMS App Control
              </h3>
            </div>
            <div className="p-6 space-y-4 font-mono text-xs">
              <div
                className={`border p-3 rounded text-center ${
                  emsAppTargetState
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-500"
                }`}
              >
                PRIZM is requesting{" "}
                <span className="font-bold uppercase">
                  {emsAppTargetState ? "ENABLE" : "DISABLE"}
                </span>{" "}
                this EMS application and verifying the result against fresh
                EMS telemetry.
              </div>

              <table className="w-full text-left">
                <tbody className="divide-y divide-prizm-border/50">
                  <tr>
                    <th className="py-2 text-prizm-text-muted">Station</th>
                    <td className="py-2 text-prizm-text text-right font-bold">
                      {state.siteSummary?.site?.stationCode || "BHE0020"}
                    </td>
                  </tr>
                  <tr>
                    <th className="py-2 text-prizm-text-muted">Block</th>
                    <td className="py-2 text-prizm-text text-right font-bold">
                      {state.siteSummary?.site?.blockIndex || 1}
                    </td>
                  </tr>
                  <tr>
                    <th className="py-2 text-prizm-text-muted">App Name</th>
                    <td className="py-2 text-prizm-text text-right font-bold text-emerald-700">
                      {emsAppCandidate.appName}
                    </td>
                  </tr>
                  <tr>
                    <th className="py-2 text-prizm-text-muted">App Code</th>
                    <td className="py-2 text-prizm-text text-right font-bold">
                      {emsAppCandidate.appCode}
                    </td>
                  </tr>
                  <tr>
                    <th className="py-2 text-prizm-text-muted">Priority</th>
                    <td className="py-2 text-prizm-text text-right font-bold">
                      {emsAppCandidate.priority}
                    </td>
                  </tr>
                  <tr>
                    <th className="py-2 text-prizm-text-muted">
                      Current State
                    </th>
                    <td className="py-2 text-right">
                      <span
                        className={`px-2 py-0.5 rounded font-bold uppercase ${emsAppCandidate.enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}
                      >
                        {emsAppCandidate.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th className="py-2 text-prizm-text-muted">
                      Requested State
                    </th>
                    <td className="py-2 text-right">
                      <span
                        className={`px-2 py-0.5 rounded font-bold uppercase ${emsAppTargetState ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}
                      >
                        {emsAppTargetState ? "ENABLE" : "DISABLE"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>

              {emsAppLoading && (
                <div className="flex items-center justify-center gap-2 rounded border border-blue-300 bg-blue-50 p-3 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                  <Activity size={14} className="animate-spin" />
                  Command sent — waiting for EMS readback
                </div>
              )}

              {emsAppResult && (
                <div
                  className={`p-3 border rounded text-[10px] ${
                    emsAppResult.success || emsAppResult.queued
                      ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500"
                      : "bg-prizm-danger/10 border-prizm-danger text-prizm-danger"
                  }`}
                >
                  <div className="font-bold uppercase tracking-wider mb-1">
                    {emsAppResult.success
                      ? "Success"
                      : emsAppResult.queued
                        ? "Accepted/Queued"
                        : "Action Failed"}
                  </div>
                  <div className="whitespace-pre-wrap font-mono uppercase text-[9px] text-prizm-text">
                    {emsAppResult.message || emsAppResult.error}
                  </div>
                </div>
              )}
            </div>

            <div className="flex bg-prizm-surface border-t border-prizm-border">
              <button
                onClick={() => setEmsAppCandidate(null)}
                disabled={emsAppLoading}
                className="flex-1 py-3 text-xs font-bold text-prizm-text-muted hover:text-white transition-colors uppercase tracking-widest disabled:opacity-50"
              >
                {emsAppLoading ? "Verifying..." : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Source Panel */}
      <div className="mt-8 border border-prizm-border rounded-lg bg-prizm-surface p-4">
        <button
          onClick={() => setDebugExpanded(!debugExpanded)}
          className="flex items-center gap-2 text-xs font-bold font-mono text-prizm-text-muted hover:text-prizm-text uppercase tracking-widest w-full text-left"
        >
          {debugExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Data Source Debug Panel
        </button>
        {debugExpanded && (
          <div className="mt-4 text-[10px] font-mono grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 text-slate-900 p-3 rounded border border-prizm-border/50">
              <h4 className="text-emerald-700 font-bold uppercase mb-2 border-b border-prizm-border/50 pb-1">Sources</h4>
              <div className="flex justify-between py-0.5"><span className="text-prizm-text-muted">SOC Source:</span><span className="text-prizm-data-blue">{socSource || "unknown"}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-prizm-text-muted">Array Summary Source:</span><span className="text-prizm-data-blue">{sum?.debug?.arraySummarySource || "native"}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-prizm-text-muted">String Summary Source:</span><span className="text-prizm-data-blue">{sum?.debug?.stringSummarySource || "unknown"}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-prizm-text-muted">Voltage Input:</span><span className="text-emerald-400">normalized to mV</span></div>
            </div>
            
            <div className="bg-white border border-slate-200 text-slate-900 p-3 rounded border border-prizm-border/50">
              <h4 className="text-emerald-700 font-bold uppercase mb-2 border-b border-prizm-border/50 pb-1">Rollup Keys</h4>
              <div className="text-prizm-text-muted h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {Object.keys(sum?.stringSummary?.rollups || {}).join(", ") || "None"}
              </div>
            </div>

            <div className="bg-white border border-slate-200 text-slate-900 p-3 rounded border border-prizm-border/50">
              <h4 className="text-emerald-700 font-bold uppercase mb-2 border-b border-prizm-border/50 pb-1">First Array Row Keys</h4>
              <div className="text-prizm-text-muted h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {Object.keys(sum?.arraySummary?.[0] || {}).join(", ") || "None"}
              </div>
            </div>

            <div className="bg-white border border-slate-200 text-slate-900 p-3 rounded border border-prizm-border/50 lg:col-span-3">
              <h4 className="text-emerald-700 font-bold uppercase mb-2 border-b border-prizm-border/50 pb-1">First String Metric Keys</h4>
              <div className="text-prizm-text-muted h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {Object.keys(sum?.stringSummary?.rawStrings?.[0] || sum?.stringSummary?.strings?.[0] || {}).join(", ") || "None"}
              </div>
            </div>
          </div>
        )}
      </div>

      <RotationModal
        isOpen={pcsModalOpen}
        onClose={() => setPcsModalOpen(false)}
        onConfirm={handlePcsConfirm}
        targets={pcsModalTargets}
        action={pcsModalAction}
        targetType="pcs"
      />
    </div>
  );
}
