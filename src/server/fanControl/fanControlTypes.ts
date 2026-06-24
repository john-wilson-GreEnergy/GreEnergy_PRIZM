export interface FanControlCapabilities {
  turtleFanEndpointSupported: boolean;
  nativeDurationSupported: boolean;
  holdSchedulerSupported: boolean;
  controllers: string[];
  message: string;
}

export interface FanCommandTarget {
  controller: "ems" | "bms";
  arrayNumber: number;
  stringNumber: number;
  energySegmentNumber?: number;
}

export interface FanControlHoldRequest {
  targets?: FanCommandTarget[]; // List of multiple targets
  // Backward compatibility singular fields:
  controller?: "ems" | "bms";
  arrayNumber?: number;
  stringNumber?: number;

  fanSpeedPercent: number;
  durationSeconds: number;
  repeatIntervalSeconds: number;
  sendStopAtEnd: boolean;
  confirmationPhrase: string;
  operator?: string;
  totalCellGroups?: number; // Optional custom parameter
}

export interface FanControlHoldResponse {
  accepted: boolean;
  holdId?: string;
  controller: "ems" | "bms";
  arrayNumber: number;
  stringNumber: number;
  fanSpeedPercent: number;
  durationSeconds: number;
  repeatIntervalSeconds: number;
  sendStopAtEnd: boolean;
  startedAt?: string;
  expiresAt?: string;
  nextCommandAt?: string | null;
  auditId: string;
  message?: string;
  targets?: FanCommandTarget[];
}

export interface FanControlStopRequest {
  holdId?: string;
  controller?: "ems" | "bms";
  arrayNumber?: number;
  stringNumber?: number;
  sendStopCommand?: boolean;
  operator?: string;
  targetId?: string; // Optional target-specific stop
}

export interface FanCommandTargetStatus {
  targetId: string;
  controller: "ems" | "bms";
  arrayNumber: number;
  stringNumber: number;
  energySegmentNumber: number | null;
  label: string;
  lastCommandAt: string | null;
  lastCommandOk: boolean;
  lastCommandStatus: number | null;
  lastCommandResponse: string | null;
  errorCount: number;
  consecutiveErrorCount?: number;
  state: "RUNNING" | "STOPPED" | "FAILED";
}

export interface FanControlHoldStatus {
  holdId: string;
  // singular properties mapped from the first target (for backward compatibility)
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
  
  targets: FanCommandTargetStatus[];
}

export interface FanCommandVerificationRow {
  holdId: string;
  targetId: string;
  controller: "ems" | "bms";
  arrayNumber: number;
  stringNumber: number;
  energySegmentNumber: number | null;
  label: string;
  commandedSpeedPercent: number;
  commandedState: "OFF" | "ON";
  actualFanState?: "OFF" | "ON" | "UNKNOWN";
  actualFanSpeedPercent?: number | null;
  actualFanRpm?: number | null;
  actualFanRpmByFan?: number[] | null;
  feedbackTimestamp?: string | null;
  telemetryAgeMs?: number | null;
  result: "PASS" | "WARN_ZERO_RPM" | "FAIL_NO_RESPONSE" | "WARN_UNDER_COMMAND" | "WARN_OVER_COMMAND" | "FAIL_STALE_TELEMETRY" | "UNKNOWN_NO_TELEMETRY";
  notes: string[];
}

export interface FanControlAuditRecord {
  timestamp: string;
  action: "START" | "COMMAND" | "STOP" | "COMPLETE" | "FAILED" | "VERIFY";
  holdId: string;
  controller: "ems" | "bms";
  arrayNumber: number;
  stringNumber: number;
  fanSpeedPercent: number;
  durationSeconds: number;
  repeatIntervalSeconds: number;
  sendStopAtEnd: boolean;
  commandUrl?: string;
  httpStatus?: number | null;
  responseText?: string | null;
  accepted: boolean;
  error?: string | null;
  rejectionReason?: string | null;
  operator?: string;
  auditId: string;
  targetId?: string;
}
