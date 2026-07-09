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
}: {
  title: string;
  icon?: any;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div
      className={`bg-prizm-surface-strong border border-prizm-border rounded-lg overflow-hidden flex flex-col ${className}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
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

function getHvacRuntimeState(hvac: any, useFanRpmAsFaultIndicator = false) {
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

  const active = !!(
    currentA > 0.2 ||
    (useFanRpmAsFaultIndicator && fanSpeedRpm > 0)
  );

  return {
    commanded,
    active,
    currentA,
    fanSpeedRpm,
    useFanRpmAsFaultIndicator,
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

    const state = getHvacRuntimeState(hvac, useFanRpmAsFaultIndicator);

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
    if (inferred > 0 && inferred <= 40) {
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

  return raw
    .replace(/^Array\s+[^—]+—\s*/i, "")
    .replace(/^Block\s+[^—]+—\s*/i, "")
    .replace(/^HVAC\s+—\s*/i, "HVAC — ")
    .trim();
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
      const text = String(value).trim();
      if (!text) return;
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

    const affectedTargets = Array.from(targets);

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
        recommendedAction:
          mismatchType === "commanded_not_active"
            ? "Review affected targets by Array, Segment, and HVAC number. Confirm HVAC command state in PRIZM and local controller, then verify HVAC power, relay/contactor output, current feedback, RPM feedback, and local HVAC controller alarms."
            : mismatchType === "active_not_commanded"
              ? "Confirm no HVAC command is active in PRIZM or the local controller. Verify relay/contactor state, feedback wiring, current sensor scaling, and whether the HVAC is running locally without command."
              : "Compare HVAC command state against current/RPM feedback and local controller status. Verify wiring, feedback scaling, relay state, and local HVAC alarms."
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

  const getState = (hvac: any) => {
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

    const active = !!(
      currentA > 0.2 ||
      (useFanRpmAsFaultIndicator && fanSpeedRpm > 0)
    );

    return {
      commanded,
      active,
      currentA,
      fanSpeedRpm,
      useFanRpmAsFaultIndicator
    };
  };

  for (const device of featherDevices || []) {
    const arrayNumber = getArrayNumberFromFeatherDevice(device);
    const energySegmentNumber = getEnergySegmentNumberFromFeatherDevice(device);
    const deviceIp = device?.ip || device?.deviceIp || "";

    for (const hvacUnit of [1, 2] as const) {
      const hvac = hvacUnit === 1 ? device?.hvac1 : device?.hvac2;
      if (!hvac) continue;

      const state = getState(hvac);
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
          hvacEquipmentProfile: useFanRpmAsFaultIndicator ? "Bergstrom / RPM feedback enabled" : "Dometic / RPM feedback ignored",
          fanRpmUsedAsFaultIndicator: useFanRpmAsFaultIndicator,
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
    Record<number, boolean>
  >({});
  const [showCorrectiveExportOptions, setShowCorrectiveExportOptions] = useState(false);
  const [correctiveExportingFormat, setCorrectiveExportingFormat] = useState<string | null>(null);
  const [runtimeCorrectiveActions, setRuntimeCorrectiveActions] = useState<any[]>([]);
  const runtimeHvacCorrectiveLatchRef = React.useRef<Map<string, any>>(new Map());
  const [hvacUseFanRpmForFaults, setHvacUseFanRpmForFaults] = useState<boolean>(() => {
    return localStorage.getItem("prizm_hvac_use_fan_rpm_fault_indicator") === "true";
  });

  useEffect(() => {
    localStorage.setItem(
      "prizm_hvac_use_fan_rpm_fault_indicator",
      hvacUseFanRpmForFaults ? "true" : "false"
    );
  }, [hvacUseFanRpmForFaults]);
  const runtimeFeatherDevicesRef = React.useRef<any[]>([]);
const [runtimeCorrectiveSummary, setRuntimeCorrectiveSummary] = useState<any>(null);
  const [runtimeCorrectiveLoading, setRuntimeCorrectiveLoading] = useState(false);
  const toggleCorrectiveAction = (idx: number) => {
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

          setRuntimeCorrectiveActions(
            compactRuntimeCorrectiveActionsForTile(
              applyRuntimeHvacCorrectiveLatchStore(
              runtimeHvacCorrectiveLatchRef.current,
              [
                ...(Array.isArray(json?.findings) ? json.findings : []),
                ...synthesizeRuntimeHvacCorrectiveFindingsFromFeather(liveFeatherDevices, hvacUseFanRpmForFaults)
              ],
              liveFeatherDevices,
              hvacUseFanRpmForFaults
            )
            )
          );
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
  const [emsAppConfText, setEmsAppConfText] = useState("");
  const [emsAppLoading, setEmsAppLoading] = useState(false);
  const [emsAppResult, setEmsAppResult] = useState<any>(null);

  const executeEmsAppAction = async () => {
    if (!emsAppCandidate) return;
    const expectedText = `${emsAppTargetState ? "ENABLE" : "DISABLE"} ${emsAppCandidate.appCode}`;
    if (emsAppConfText !== expectedText) {
      setEmsAppResult({
        success: false,
        message: "Confirmation text does not match",
      });
      return;
    }

    setEmsAppLoading(true);
    setEmsAppResult(null);

    try {
      const res = await fetch("/api/local/ems-apps/enabled-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationCode: state.siteSummary?.site?.stationCode || "BHE0020",
          blockIndex: state.siteSummary?.site?.blockIndex || 1,
          appCode: emsAppCandidate.appCode,
          priority: emsAppCandidate.priority,
          enabled: emsAppTargetState,
          confirmationText: emsAppConfText,
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

  // Provide a callback to execute clearing
  const executeClear = async () => {
    if (!clearCandidate || clearConfRef !== clearCandidate.entityKeyToken) {
      setClearResult({ error: "Confirmation text does not match" });
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
          entityKeyToken: clearCandidate.entityKeyToken,
          confirmationText: clearConfRef,
          operatorUsername,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Execute failed");
      setClearResult(j);
    } catch (e: any) {
      setClearResult({ error: e.message });
    } finally {
      setClearLoading(false);
    }
  };

  const triggerRefresh = (sectionRefresh = false) => {
    let url = "/api/local/site-data/block-summary";
    if (sectionRefresh || state.cacheStatus?.policy === "live-only") {
      url += "?refresh=true";
    }
    fetchJsonWithTimeout(url, { timeoutMs: sectionRefresh ? 20000 : 5000 })
      .then((summaryRes) => {
        setState((prev) => ({
          ...prev,
          siteSummary: summaryRes,
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
        const summaryRes = await fetchJsonWithTimeout(url, {
          timeoutMs: isFirst ? 25000 : 5000,
        });
        if (!unmounted)
          setState((prev) => ({
            ...prev,
            siteSummary: summaryRes,
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
      if (unmounted || !active) return;
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
          const summaryRes = await fetchJsonWithTimeout(url, {
            timeoutMs: 5000,
          });
          if (!unmounted && active) {
            // Only clear error if we succeeded
            setState((prev) => ({ ...prev, siteSummary: summaryRes }));
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
  );

  const runtimeCorrectiveCategorySummary = runtimeCorrectiveSummary?.byCategory || {};

  const clearableFaults = sum?.safetySummary?.clearableFaults || [];
  const safetyEligible = sum?.safetySummary?.clearableCount || 0;
  const safetyNotEligible = 0; // Not eligible faults no longer primarily tracked here

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

    const finalMinVolt = minCellVoltage !== Infinity ? minCellVoltage : null;
    const finalMaxVolt = maxCellVoltage !== -Infinity ? maxCellVoltage : null;
    const finalAvgVolt = countVolt > 0 ? totalVolt / countVolt : (sum?.bessFleetSummary?.avgCellVoltageMv ?? null);
    const finalMaxVoltDelta = maxCellVoltageDelta !== -Infinity ? maxCellVoltageDelta : (sum?.bessFleetSummary?.maxCellVoltageDeltaMv ?? null);

    const finalLowTemp = lowCellTempC !== Infinity ? lowCellTempC : null;
    const finalHighTemp = highCellTempC !== -Infinity ? highCellTempC : (sum?.bessFleetSummary?.maxCellTempC ?? null);
    const finalAvgTemp = countTemp > 0 ? totalTemp / countTemp : (sum?.bessFleetSummary?.avgCellTempC ?? null);
    const finalMaxTempDelta = maxCellTempDelta !== -Infinity ? maxCellTempDelta : (sum?.bessFleetSummary?.maxCellTempDeltaC ?? null);

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
                    <span className="text-prizm-warning uppercase">Strings Warn</span>
                    <span className="font-bold text-prizm-warning">
                      {sum?.topologyStatus?.warningCount ?? "--"}
                    </span>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-prizm-border/50">
                    <span className="text-prizm-danger uppercase">Strings Alarm</span>
                    <span className="font-bold text-prizm-danger">
                      {sum?.topologyStatus?.alarmCount ?? "--"}
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
            {runtimeCorrectiveLoading ? "Loading live findings..." : `Live ${runtimeCorrectiveActions.length} • HVAC latch ${runtimeHvacCorrectiveLatchRef.current.size} • String/Battery ${runtimeCorrectiveCategorySummary.string_battery || 0} • Environmental ${runtimeCorrectiveCategorySummary.environmental || 0}`}
            {" "}• Click row to expand • Click target to drill-down
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
        <div className="max-h-[450px] overflow-y-auto no-scrollbar">
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
                {displayedCorrectiveActions
                  .filter((issue: any) => {
                    const name = (issue.faultName || issue.fault || "").toLowerCase();
                    const code = String(issue.code || issue.faultId || "");
                    if (code === "2534" || code === "2561" || name.includes("2534") || name.includes("2561")) {
                      return false;
                    }
                    return true;
                  })
                  .map((issue: any, i: number) => {
                  const hasOccurrences =
                    (Array.isArray(issue.occurrences) &&
                      issue.occurrences.length > 0) ||
                    (Array.isArray(issue.affected) &&
                      issue.affected.length > 0);
                  const isExpanded = !!expandedCorrectiveActions[i];
                  const kb = issue.resolved?.resolvedTroubleshooting;

                  return (
                    <React.Fragment key={i}>
                      <tr
                        className={`${hasOccurrences ? "cursor-pointer hover:bg-prizm-surface-strong/70" : "hover:bg-prizm-surface"} transition-colors`}
                        onClick={() =>
                          hasOccurrences && toggleCorrectiveAction(i)
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
                          {issue.affected?.length || issue.occurrences?.length || 0}
                        </td>
                        <td className="py-2.5 px-3 text-prizm-text font-semibold max-w-[150px] truncate" title={issue.affectedSummary || issue.object}>
                          {issue.affectedSummary || issue.object}
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
                                  Affected Targets ({issue.affected ? issue.affected.length : issue.occurrences.length}):
                                </div>
                                {issue.affected && issue.affected.length > 0 ? (
                                  <div className="border border-prizm-border/40 rounded overflow-hidden max-h-[180px] overflow-y-auto no-scrollbar bg-white border border-slate-200 text-slate-900 divide-y divide-prizm-border/10">
                                    {(() => {
                                      const rawTargets = issue.affected || [];
                                      const condensedTargets = condenseAffectedTargetsForDisplay(rawTargets);
                                      const displayLimit = 25;
                                      const toShow = condensedTargets.length <= displayLimit
                                        ? condensedTargets
                                        : condensedTargets.slice(0, displayLimit);

                                      const listElems = toShow.map((aff: any, affIdx: number) => (
                                        <div
                                          key={affIdx}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleActionClick(aff);
                                          }}
                                          className="py-1.5 px-2.5 hover:bg-prizm-primary/10 cursor-pointer transition-colors flex justify-between items-center gap-3"
                                          title={`${aff.condensedLabel || formatAffectedTargetForDisplay(aff, issue.resolved?.system, kb?.detailView)} (${aff.condensedCount || 1} target${(aff.condensedCount || 1) === 1 ? "" : "s"})`}
                                        >
                                          <span className="text-prizm-text font-bold truncate">
                                            {aff.condensedLabel || formatAffectedTargetForDisplay(aff, issue.resolved?.system, kb?.detailView)}
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
                                      ));

                                      if (condensedTargets.length > displayLimit) {
                                        listElems.push(
                                          <div key="condensed-indicator" className="py-1.5 px-2.5 bg-white border border-slate-200 text-slate-900 text-slate-600 italic text-[9px]">
                                            ... and {condensedTargets.length - displayLimit} more condensed target groups
                                          </div>
                                        );
                                      }

                                      if (rawTargets.length !== condensedTargets.length) {
                                        listElems.unshift(
                                          
                                        );
                                      }

                                      return listElems;
                                    })()}
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-1.5 max-h-[140px] overflow-y-auto no-scrollbar">
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
                                    <div className="text-[9.5px] uppercase font-bold text-emerald-400 tracking-wider mb-1.5">
                                      • Recommended Actions
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
                        <button
                          onClick={() => {
                            setEmsAppCandidate(app);
                            setEmsAppTargetState(!app.enabled);
                            setEmsAppConfText("");
                            setEmsAppResult(null);
                          }}
                          className={`px-2 py-1 flex items-center justify-center gap-1 rounded font-bold uppercase transition-colors w-full border ${
                            app.enabled
                              ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                          }`}
                        >
                          {app.enabled ? (
                            <>
                              <Pause size={10} /> Disable
                            </>
                          ) : (
                            <>
                              <Play size={10} /> Enable
                            </>
                          )}
                        </button>
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
                        : app.appStatus || "--"
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
                          onClick={() => setClearCandidate(f)}
                          className="px-2 py-1 bg-prizm-danger/10 text-prizm-danger rounded hover:bg-prizm-danger hover:text-white transition-colors"
                        >
                          Clear
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
            {clearableFaults.length === 0
              ? "Safety Faults API Unavailable"
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

              {!clearResult && (
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
              {!clearResult && (
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
      {emsAppCandidate && (
        <div className="fixed inset-0 bg-white border border-slate-200 text-slate-900 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 text-slate-900 border border-prizm-border rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="flex items-center gap-2 p-4 bg-prizm-surface border-b border-prizm-border">
              <BoxSelect
                className="text-emerald-700 animate-pulse"
                size={18}
              />
              <h3 className="font-bold text-prizm-text font-mono uppercase tracking-widest text-sm">
                Review EMS App Control
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
                You are about to{" "}
                <span className="font-bold uppercase">
                  {emsAppTargetState ? "ENABLE" : "DISABLE"}
                </span>{" "}
                a Dragon Application. This can immediately change the
                operational behavior of the system.
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

              <div className="pt-2">
                <label className="text-[10px] text-prizm-text-muted uppercase mb-1 block">
                  Type exactly '
                  <span className="text-prizm-text">
                    {emsAppTargetState ? "ENABLE" : "DISABLE"}{" "}
                    {emsAppCandidate.appCode}
                  </span>
                  '
                </label>
                <input
                  type="text"
                  value={emsAppConfText}
                  onChange={(e) => setEmsAppConfText(e.target.value)}
                  placeholder={`${emsAppTargetState ? "ENABLE" : "DISABLE"} ${emsAppCandidate.appCode}`}
                  disabled={emsAppLoading}
                  autoComplete="off"
                  className="w-full bg-white border border-slate-200 text-slate-900 border border-prizm-border p-2 focus:outline-none focus:border-prizm-primary text-slate-900 tracking-widest uppercase disabled:opacity-50"
                />
              </div>

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
                {emsAppResult ? "Close" : "Cancel"}
              </button>
              {!emsAppResult && (
                <button
                  onClick={executeEmsAppAction}
                  disabled={
                    emsAppLoading ||
                    emsAppConfText !==
                      `${emsAppTargetState ? "ENABLE" : "DISABLE"} ${emsAppCandidate.appCode}`
                  }
                  className={`flex-1 py-3 text-xs font-bold transition-colors uppercase tracking-widest flex items-center justify-center gap-2 ${
                    emsAppTargetState
                      ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 disabled:bg-prizm-surface disabled:text-prizm-text-muted"
                      : "bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:bg-prizm-surface disabled:text-prizm-text-muted"
                  }`}
                >
                  {emsAppLoading ? "Processing..." : "Confirm Action"}
                </button>
              )}
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
