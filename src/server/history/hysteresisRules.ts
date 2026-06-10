export interface HysteresisRuleResult {
  id: string;
  entityKey: string;
  severity: "info" | "warning" | "alarm";
  title: string;
  message: string;
  startedAt?: string;
  endedAt?: string;
  evidence: any[];
}

export async function evaluateRules(params: any): Promise<HysteresisRuleResult[]> {
    // Read-only stub for future hysteresis execution
    return [];
}
