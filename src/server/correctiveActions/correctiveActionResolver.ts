import { resolveTroubleshooting } from "../troubleshooting/troubleshootingResolver";
import { ResolvedCorrectiveAction } from "./correctiveActionMatrixTypes";

/**
 * Backward-compatible wrapper delegating to the curated PRIZM troubleshooting knowledge base.
 */
export function resolveCorrectiveAction(issue: any): ResolvedCorrectiveAction {
  const entry = resolveTroubleshooting(issue);
  const matched = entry.id !== "unknown-issue";

  // Determine confidence mapped from resolving heuristics
  let confidence: ResolvedCorrectiveAction["confidence"] = "fallback";
  if (matched) {
    confidence = "exact-code"; // Default matched confidence
  }

  return {
    matched,
    confidence,
    matrixEntryId: entry.id,
    system: entry.system,
    component: entry.component,
    recommendedActions: entry.recommendedActions,
    validationChecks: entry.validationChecks,
    clearingCriteria: entry.clearingCriteria,
    replacementGuidance: [entry.fieldCorrections || entry.summaryAction],
    escalationGuidance: [entry.technicianDetail],
    sourceLabel: `${entry.sourceDocument} - Page ${entry.sourcePage}`,
    // Add full curated object as resolvedTroubleshooting as requested
    resolvedTroubleshooting: entry
  } as any;
}
