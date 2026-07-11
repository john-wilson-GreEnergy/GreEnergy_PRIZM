export type TelemetryDomain =
  | "controller-health"
  | "string-telemetry"
  | "feather-hvac-telemetry"
  | "notifications"
  | "first-responder-safety";

export type TelemetryContinuityMode = "continuous" | "on-demand";

export interface TelemetrySourceMetadata {
  providerId: string;
  source: string;
  stale: boolean;
  confidence: number;
  preferred: boolean;
  fallbackUsed: boolean;
  lastUpdatedAt: string | null;
  authorityDomain: TelemetryDomain;
}

export interface ControllerHealthTelemetry {
  connectionState: string;
  sourceMode: string;
  stationCode: string | null;
  activeProfileId: string | null;
  activeProfileName: string | null;
  lastUpdatedAt: string | null;
  stale: boolean;
  lastError: string | null;
  raw?: any;
}

export interface StringTelemetryRow {
  arrayIndex: number | null;
  stringIndex: number | null;
  stringKey: string | null;
  connectionState: string | null;
  socPct: number | null;
  voltageV: number | null;
  currentA: number | null;
  raw?: any;
}

export interface StringTelemetry {
  rows: StringTelemetryRow[];
  totalRows: number;
  raw?: any;
}

export interface FeatherTelemetryDevice {
  deviceIp: string;
  reachable: boolean;
  arrayIndex: number | null;
  stringIndex: number | null;
  operationalState: string | null;
  warningCount: number;
  alarmCount: number;
  lastUpdatedAt: string | null;
  raw?: any;
}

export interface FeatherTelemetry {
  devices: FeatherTelemetryDevice[];
  totalDevices: number;
  reachableDevices: number;
  stale: boolean;
  raw?: any;
}

export interface CanonicalNotification {
  severity: string;
  notificationId: string;
  sourceType: string;
  arrayIndex: number | null;
  stringIndex: number | null;
  batteryPackIndex: number | null;
  cellGroupIndex: number | null;
  identity: string;
  raw?: any;
}

export interface NotificationsTelemetry {
  canonicalIdentityVersion: string;
  arrayNotifications: CanonicalNotification[];
  stringNotifications: CanonicalNotification[];
  hybridComparison?: any;
  raw?: any;
}

export interface FirstResponderTelemetry {
  v1: any;
  v2: any;
  stale: boolean;
  lastUpdatedAt: string | null;
  raw?: any;
}

export interface TelemetryUnifiedData {
  controllerHealth: ControllerHealthTelemetry | null;
  stringTelemetry: StringTelemetry | null;
  featherTelemetry: FeatherTelemetry | null;
  notifications: NotificationsTelemetry | null;
  firstResponderSafety: FirstResponderTelemetry | null;
}
