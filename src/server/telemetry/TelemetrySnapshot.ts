import { TelemetrySourceMetadata, TelemetryUnifiedData } from "./TelemetryModels";

export interface UnifiedFieldWithSource<T> {
  data: T | null;
  source: TelemetrySourceMetadata | null;
}

export interface TelemetryUnifiedSnapshot {
  controllerHealth: UnifiedFieldWithSource<TelemetryUnifiedData["controllerHealth"]>;
  stringTelemetry: UnifiedFieldWithSource<TelemetryUnifiedData["stringTelemetry"]>;
  featherTelemetry: UnifiedFieldWithSource<TelemetryUnifiedData["featherTelemetry"]>;
  notifications: UnifiedFieldWithSource<TelemetryUnifiedData["notifications"]>;
  firstResponderSafety: UnifiedFieldWithSource<TelemetryUnifiedData["firstResponderSafety"]>;
}
