import { STACK750_FAULT_MATRIX } from "./correctiveActionMatrix";
import { CorrectiveActionMatrixEntry, ResolvedCorrectiveAction } from "./correctiveActionMatrixTypes";

/**
 * Resolves a raw fault, warning, or corrective action item to its enriched actions
 * and troubleshooting guidelines using the Stack 750 Troubleshooting Matrix.
 * 
 * It matches in the following strict order of precedence:
 * 1. Exact fault/warning/info code match.
 * 2. Normalized issue name match.
 * 3. Term match against issue title/details/component/source.
 * 4. Fallback based on detected system/component class.
 */
export function resolveCorrectiveAction(issue: any): ResolvedCorrectiveAction {
  if (!issue) {
    return getFallbackResult();
  }

  // 1. Extract possible codes (e.g. 2018, 2074, 1559, etc.)
  const rawId = String(issue.code || issue.faultId || issue.id || issue.rawFaultId || "");
  const numId = parseInt(rawId.replace(/\D/g, ""), 10);

  const faultLabel = String(issue.faultName || issue.fault || issue.title || "").trim();
  const lowerLabel = faultLabel.toLowerCase();
  
  // Try to find code in label if not found in issue code (e.g. "Warning Code 2018: CellGroup...")
  let parsedCode: number | null = null;
  if (!isNaN(numId) && numId > 0) {
    parsedCode = numId;
  } else {
    const codeMatch = faultLabel.match(/\b(10\d{2}|15\d{2}|20\d{2}|25\d{2}|30\d{2}|35\d{2}|80\d{2}|90\d{2})\b/);
    if (codeMatch) {
      parsedCode = parseInt(codeMatch[1], 10);
    }
  }

  // PRECEDENCE 1: Exact Code Match
  if (parsedCode !== null) {
    const codeMatchEntry = STACK750_FAULT_MATRIX.find(entry => {
      const fc = entry.faultCodes || [];
      const wc = entry.warningCodes || [];
      const ic = entry.infoCodes || [];
      return fc.includes(parsedCode!) || wc.includes(parsedCode!) || ic.includes(parsedCode!);
    });

    if (codeMatchEntry) {
      return buildResolvedResult(codeMatchEntry, "exact-code");
    }
  }

  // PRECEDENCE 2: Exact/Normalized Issue Name Match
  const exactNameMatch = STACK750_FAULT_MATRIX.find(entry => {
    return entry.issueName.toLowerCase() === lowerLabel ||
           entry.id.toLowerCase() === rawId.toLowerCase();
  });
  if (exactNameMatch) {
    return buildResolvedResult(exactNameMatch, "name-match");
  }

  // PRECEDENCE 3: Term Match (checking matchTerms array against label, details, source, component)
  const detailsStr = String(issue.details || issue.description || "").toLowerCase();
  const sourceStr = String(issue.source || "").toLowerCase();
  const componentStr = String(issue.component || issue.object || "").toLowerCase();

  const termMatchEntry = STACK750_FAULT_MATRIX.find(entry => {
    return entry.matchTerms.some(term => {
      const lowerTerm = term.toLowerCase();
      return lowerLabel.includes(lowerTerm) || 
             detailsStr.includes(lowerTerm) ||
             sourceStr.includes(lowerTerm) ||
             componentStr.includes(lowerTerm);
    });
  });

  if (termMatchEntry) {
    return buildResolvedResult(termMatchEntry, "term-match");
  }

  // PRECEDENCE 4: Fallback based on component class or system words
  // Let's do a smart fallback heuristic
  let fallbackEntry: CorrectiveActionMatrixEntry | undefined;

  if (lowerLabel.includes("hvac") || sourceStr.includes("feather") || componentStr.includes("hvac")) {
    fallbackEntry = STACK750_FAULT_MATRIX.find(e => e.id === "hvac-1-not-cooling" || e.system === "hvac");
  } else if (lowerLabel.includes("balancer") || lowerLabel.includes("balancing")) {
    fallbackEntry = STACK750_FAULT_MATRIX.find(e => e.id === "bpc-not-balancing" || e.system === "balancing");
  } else if (lowerLabel.includes("bpc") || componentStr.includes("bpc")) {
    fallbackEntry = STACK750_FAULT_MATRIX.find(e => e.id === "bpc-disconnect-partial" || e.system === "bpc");
  } else if (lowerLabel.includes("cell") || lowerLabel.includes("cgc") || lowerLabel.includes("cg")) {
    fallbackEntry = STACK750_FAULT_MATRIX.find(e => e.id === "cgc-disconnect" || e.system === "cell-group");
  } else if (lowerLabel.includes("fire") || lowerLabel.includes("smoke")) {
    fallbackEntry = STACK750_FAULT_MATRIX.find(e => e.id === "fire-alarm" || e.system === "fire");
  } else if (lowerLabel.includes("ups")) {
    fallbackEntry = STACK750_FAULT_MATRIX.find(e => e.id === "ups-offline" || e.system === "ups");
  } else if (lowerLabel.includes("pcs") || componentStr.includes("pcs")) {
    fallbackEntry = STACK750_FAULT_MATRIX.find(e => e.id === "pcs-internal-error" || e.system === "pcs");
  } else if (lowerLabel.includes("meter")) {
    fallbackEntry = STACK750_FAULT_MATRIX.find(e => e.id === "meter-internal-error" || e.system === "meter");
  } else if (lowerLabel.includes("contactor")) {
    fallbackEntry = STACK750_FAULT_MATRIX.find(e => e.id === "string-contactor-mismatch" || e.system === "contactor");
  } else if (lowerLabel.includes("door") || lowerLabel.includes("enclosure")) {
    fallbackEntry = STACK750_FAULT_MATRIX.find(e => e.id === "enclosure-door-open" || e.system === "enclosure");
  }

  if (fallbackEntry) {
    return buildResolvedResult(fallbackEntry, "fallback");
  }

  // Absolute fallback if everything fails
  return getFallbackResult();
}

function buildResolvedResult(
  entry: CorrectiveActionMatrixEntry,
  confidence: ResolvedCorrectiveAction["confidence"]
): ResolvedCorrectiveAction {
  return {
    matched: true,
    confidence,
    matrixEntryId: entry.id,
    system: entry.system,
    component: entry.component,
    recommendedActions: entry.recommendedActions,
    validationChecks: entry.validationChecks || [
      "Inspect affected component and verify connectivity.",
      "Review historical alarms for correlation."
    ],
    clearingCriteria: entry.clearingCriteria || [
      "Telemetry registers normal values without persistent errors."
    ],
    replacementGuidance: entry.replacementGuidance || [
      `Reference Powin standard SOP for ${entry.component} maintenance and replacement.`
    ],
    escalationGuidance: entry.escalationGuidance || [
      "If condition persists after local checks, capture full logs and escalate to GreEnergy Engineering."
    ],
    sourceLabel: entry.source.label
  };
}

function getFallbackResult(): ResolvedCorrectiveAction {
  return {
    matched: false,
    confidence: "fallback",
    system: "unknown",
    component: "Unknown",
    recommendedActions: [
      "Verify issue in PRIZM source view.",
      "Inspect affected component and communications.",
      "Check power, cabling, and network path.",
      "Capture notes/photos/logs.",
      "Escalate if condition persists."
    ],
    validationChecks: [
      "Inspect wiring and status LEDs on target device.",
      "Verify latest system poll completes successfully."
    ],
    clearingCriteria: [
      "Alert clears automatically or can be manually cleared on secondary confirmation."
    ],
    replacementGuidance: [
      "No direct replacement guidance; perform diagnostic audit first."
    ],
    escalationGuidance: [
      "Escalate to GreEnergy On-call Operations Engineer."
    ]
  };
}
