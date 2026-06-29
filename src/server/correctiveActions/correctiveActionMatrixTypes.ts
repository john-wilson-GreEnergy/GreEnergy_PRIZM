export type CorrectiveActionMatrixEntry = {
  id: string;
  platform: "stack-750" | "stack-800" | "stack-750-800" | "generic";
  system:
    | "string"
    | "bpc"
    | "cell-group"
    | "balancing"
    | "hvac"
    | "fire"
    | "ups"
    | "pcs"
    | "meter"
    | "transformer"
    | "contactor"
    | "enclosure"
    | "network"
    | "unknown";
  component:
    | "String Controller"
    | "BPC"
    | "Cell Group"
    | "HVAC"
    | "Fire Panel"
    | "UPS"
    | "PCS"
    | "Meter"
    | "Transformer"
    | "Contactor"
    | "Door"
    | "Unknown";
  issueName: string;
  faultCodes?: number[];
  warningCodes?: number[];
  infoCodes?: number[];
  matchTerms: string[];
  severityHint: "info" | "warning" | "alarm" | "critical" | "unknown";
  recommendedActions: string[];
  validationChecks?: string[];
  clearingCriteria?: string[];
  replacementGuidance?: string[];
  escalationGuidance?: string[];
  source: {
    label: string;
    sourceFile?: string;
    sourceSection?: string;
  };
};

export type ResolvedCorrectiveAction = {
  matched: boolean;
  confidence: "exact-code" | "name-match" | "term-match" | "fallback";
  matrixEntryId?: string;
  system: string;
  component: string;
  recommendedActions: string[];
  validationChecks: string[];
  clearingCriteria: string[];
  replacementGuidance: string[];
  escalationGuidance: string[];
  sourceLabel?: string;
};
