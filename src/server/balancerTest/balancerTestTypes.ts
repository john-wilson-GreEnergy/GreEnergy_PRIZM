export interface BalancerTestStatus {
  id: number;
  block: string;
  arrays: string[];
  direction: string;
  state: "PENDING" | "RUNNING" | "FINISHED" | "FAILED";
  progress: number;
  statusMessage: string;
  rawTargets: string;
  started: boolean;
  finished: boolean;
  raw: any;
}

export interface BalancerTestResultRow {
  durationSec: number;
  site: string;
  block: string;
  array: number | null;
  stringNumber: number | null;
  energySegmentNumber: number | null;
  bpc: number | null;
  cell: number | null;
  balanceConfirmedOn: boolean;
  warning: boolean;
  warningTriggerMessage?: string | null;
  warningTriggeredAfterBalance?: boolean;
  warningTriggeredTime?: string | null;
  cellGroupKey: string;
  balanceStart?: string;
  balanceEnd?: string;
  raw: any;
}

export interface BalancerTestCorrelatedWarning {
  source: "balancer-report" | "live-notification" | "corrective-action";
  confidence: "high" | "medium" | "low";
  code?: number | string;
  severity: "WARNING" | "ALARM" | "INFO";
  title: string;
  rawMessage?: string;
  block?: string | number | null;
  arrayNumber?: number | null;
  stringNumber?: number | null;
  energySegmentNumber?: number | null;
  bpc?: number | null;
  cell?: number | null;
  label: string;
  reason: string;
  testIds: number[];
  detectedAt?: string | null;
  raw?: unknown;
}

export interface BalancerTestAnalysis {
  source: {
    testIds: number[];
    fetchedAt: string;
    endpointBase: string;
  };
  summary: {
    totalCellGroups: number;
    confirmedBalances: number;
    warningCount: number;
    reportWarningCount: number;
    correlatedWarningCount: number;
    balancerCodeWarningCount: number;
    relatedBpcIssueCount: number;
    minDurationSec: number | null;
    avgDurationSec: number | null;
    p95DurationSec: number | null;
    maxDurationSec: number | null;
  };
  arrayAverageDurations: Array<{
    array: number;
    avgDurationSec: number;
    count: number;
  }>;
  cellWarningCounts: Array<{
    array: number;
    stringNumber: number;
    energySegmentNumber: number;
    bpc: number;
    cell: number;
    warningCount: number;
  }>;
  bpcWarningSummary: Array<{
    site: string;
    block: string;
    array: number;
    stringNumber: number;
    energySegmentNumber: number;
    bpc: number;
    warningCount: number;
    label: string;
  }>;
  warningRows: BalancerTestResultRow[];
  correlatedWarnings: BalancerTestCorrelatedWarning[];
  combinedWarningRows?: any[];
  rows: BalancerTestResultRow[];
}

export interface BalancerTestDeployRequest {
  block?: number;
  arrays: number[];
  direction: "charge" | "discharge";
  totalCellGroups?: number;
  operator?: string;
  confirmationToken?: string;
}

export interface BalancerTestDeployResponse {
  accepted: boolean;
  supportedLocally: boolean;
  testId?: number | null;
  message: string;
  request: BalancerTestDeployRequest;
  emsEndpoint?: string;
  emsHttpStatus?: number | null;
  emsResponseText?: string | null;
  parsedStatus?: BalancerTestStatus | null;
  auditId: string;
}

export interface BalancerTestCapabilities {
  statusSupported: boolean;
  analysisSupported: boolean;
  deploySupported: boolean;
  deployEndpointConfigured: boolean;
  message: string;
}
