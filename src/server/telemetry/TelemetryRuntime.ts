import { TelemetryBroker } from "./TelemetryBroker";
import { cloneValue, ProviderHealthReport } from "./TelemetryHealth";
import { TelemetryDomain, TelemetryUnifiedData } from "./TelemetryModels";
import { UnifiedTelemetrySnapshot } from "./TelemetryProvider";
import { FeatherTelemetryProvider } from "./providers/FeatherTelemetryProvider";
import { FirstResponderTelemetryProvider } from "./providers/FirstResponderTelemetryProvider";
import { TurtleTelemetryProvider } from "./providers/TurtleTelemetryProvider";
import { telemetryMetrics } from "./metrics";
import { getTelemetryCycleId } from "./TelemetryCycleContext";

const DOMAINS: TelemetryDomain[] = [
  "controller-health",
  "string-telemetry",
  "feather-hvac-telemetry",
  "notifications",
  "first-responder-safety",
];

const UNIFIED_KEYS: Record<TelemetryDomain, keyof TelemetryUnifiedData> = {
  "controller-health": "controllerHealth",
  "string-telemetry": "stringTelemetry",
  "feather-hvac-telemetry": "featherTelemetry",
  notifications: "notifications",
  "first-responder-safety": "firstResponderSafety",
};

type SnapshotCollector = Pick<TelemetryBroker, "collectSnapshot">;

function mergeHealth(
  current: Record<string, ProviderHealthReport>,
  previous: Record<string, ProviderHealthReport> | undefined,
): Record<string, ProviderHealthReport> {
  const merged = cloneValue(current);
  for (const [providerId, health] of Object.entries(merged)) {
    const prior = previous?.[providerId];
    if (!health.healthy && prior) {
      health.lastSuccessAt = health.lastSuccessAt ?? prior.lastSuccessAt;
      health.consecutiveFailures = Math.max(health.consecutiveFailures, prior.consecutiveFailures + 1);
    }
  }
  return merged;
}

export class TelemetryRuntime {
  private latestSnapshot: UnifiedTelemetrySnapshot | null = null;
  private collectionInFlight: Promise<UnifiedTelemetrySnapshot> | null = null;

  constructor(private readonly broker: SnapshotCollector) {}

  collectSnapshot(): Promise<UnifiedTelemetrySnapshot> {
    if (this.collectionInFlight) {
      telemetryMetrics.registry.brokerCollectionReused();
      telemetryMetrics.registry.recordEndpointCoalesced("telemetry-runtime", "collectSnapshot");
      return this.collectionInFlight;
    }

    const metric = telemetryMetrics.registry.beginEndpoint("telemetry-runtime", "collectSnapshot");
    this.collectionInFlight = this.collectAndRetain().then((snapshot) => {
      metric.finish({ success: true, acquisitionTimestamp: snapshot.capturedAt, stale: Object.values(snapshot.authorities).some((authority: any) => !!authority?.stale) });
      return snapshot;
    }, (error) => {
      metric.finish({ success: false, acquisitionTimestamp: new Date(), stale: true });
      throw error;
    }).finally(() => {
      this.collectionInFlight = null;
    });
    return this.collectionInFlight;
  }

  getLatestSnapshot(): UnifiedTelemetrySnapshot | null {
    return cloneValue(this.latestSnapshot);
  }

  getProviderHealth(): Record<string, ProviderHealthReport> {
    return cloneValue(this.latestSnapshot?.health ?? {});
  }

  getLatestSummary(): Pick<UnifiedTelemetrySnapshot, "cycleId" | "capturedAt" | "authorities" | "health"> | null {
    const snapshot = this.latestSnapshot;
    return snapshot ? cloneValue({ cycleId: snapshot.cycleId, capturedAt: snapshot.capturedAt, authorities: snapshot.authorities, health: snapshot.health }) : null;
  }

  private async collectAndRetain(): Promise<UnifiedTelemetrySnapshot> {
    const current = cloneValue(await this.broker.collectSnapshot());
    current.cycleId = current.cycleId ?? getTelemetryCycleId();
    const previous = this.latestSnapshot;

    current.health = mergeHealth(current.health, previous?.health);

    if (previous) {
      for (const domain of DOMAINS) {
        const unifiedKey = UNIFIED_KEYS[domain];
        const currentAuthority = current.authorities[domain];
        const currentData = current.unified[unifiedKey];
        const previousData = previous.unified[unifiedKey];
        const currentUsable = currentAuthority && !currentAuthority.stale && currentData !== null;

        if (!currentUsable && previousData !== null) {
          (current.unified as Record<keyof TelemetryUnifiedData, TelemetryUnifiedData[keyof TelemetryUnifiedData]>)[unifiedKey] = cloneValue(previousData);
          telemetryMetrics.registry.recordRetainedLastKnownGood();
          telemetryMetrics.registry.recordStaleDomainRetention();
        }
      }
    }

    this.latestSnapshot = cloneValue(current);
    return cloneValue(current);
  }
}

const telemetryBroker = new TelemetryBroker();
telemetryBroker.registerProvider(new TurtleTelemetryProvider());
telemetryBroker.registerProvider(new FeatherTelemetryProvider());
telemetryBroker.registerProvider(new FirstResponderTelemetryProvider());

const telemetryRuntime = new TelemetryRuntime(telemetryBroker);

export function getTelemetryBroker(): TelemetryBroker {
  return telemetryBroker;
}

export function collectTelemetrySnapshot(): Promise<UnifiedTelemetrySnapshot> {
  return telemetryRuntime.collectSnapshot();
}

export function getLatestTelemetrySnapshot(): UnifiedTelemetrySnapshot | null {
  return telemetryRuntime.getLatestSnapshot();
}

export function getTelemetryProviderHealth(): Record<string, ProviderHealthReport> {
  return telemetryRuntime.getProviderHealth();
}

export function getLatestTelemetrySummary(): Pick<UnifiedTelemetrySnapshot, "cycleId" | "capturedAt" | "authorities" | "health"> | null {
  return telemetryRuntime.getLatestSummary();
}
