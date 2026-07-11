import { ProviderHealthReport } from "./TelemetryHealth";
import { TelemetryDomain, TelemetryUnifiedData } from "./TelemetryModels";

export interface TelemetryProviderSnapshot {
  providerId: string;
  capturedAt: string;
  domains: Partial<Record<TelemetryDomain, any>>;
  health: ProviderHealthReport;
  provenance: {
    source: string;
    metadata?: any;
  };
}

export interface TelemetryProvider {
  readonly id: string;
  readonly domains: TelemetryDomain[];
  captureSnapshot(): Promise<TelemetryProviderSnapshot>;
}

export interface UnifiedTelemetrySnapshot {
  capturedAt: string;
  authorities: Record<TelemetryDomain, any>;
  health: Record<string, ProviderHealthReport>;
  providers: Record<string, TelemetryProviderSnapshot>;
  unified: TelemetryUnifiedData;
}
