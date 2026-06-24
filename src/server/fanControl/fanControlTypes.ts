export interface FanControlCapabilities {
  turtleFanEndpointSupported: boolean;
  nativeDurationSupported: boolean;
  holdSchedulerSupported: boolean;
  controllers: string[];
  message: string;
}

export interface FanControlHoldRequest {
  controller: "ems" | "bms";
  arrayNumber: number;
  stringNumber: number;
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
}

export interface FanControlStopRequest {
  holdId?: string;
  controller?: "ems" | "bms";
  arrayNumber?: number;
  stringNumber?: number;
  sendStopCommand?: boolean;
  operator?: string;
}

export interface FanControlHoldStatus {
  holdId: string;
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
}

export interface FanControlAuditRecord {
  timestamp: string;
  action: "START" | "COMMAND" | "STOP" | "COMPLETE" | "FAILED";
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
}
