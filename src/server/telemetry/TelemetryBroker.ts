import { TelemetryAuthorityRegistry } from "./TelemetryAuthority";
import { cloneValue } from "./TelemetryHealth";
import { TelemetryDomain, TelemetrySourceMetadata, TelemetryUnifiedData } from "./TelemetryModels";
import { TelemetryProvider, TelemetryProviderSnapshot, UnifiedTelemetrySnapshot } from "./TelemetryProvider";
import { telemetryMetrics } from "./metrics";
import { getTelemetryCycleId } from "./TelemetryCycleContext";

function toUnifiedKey(domain: TelemetryDomain): keyof TelemetryUnifiedData {
  switch (domain) {
    case "controller-health":
      return "controllerHealth";
    case "string-telemetry":
      return "stringTelemetry";
    case "feather-hvac-telemetry":
      return "featherTelemetry";
    case "notifications":
      return "notifications";
    case "first-responder-safety":
      return "firstResponderSafety";
    default:
      return "controllerHealth";
  }
}

export class TelemetryBroker {
  private readonly providers = new Map<string, TelemetryProvider>();
  private readonly authority: TelemetryAuthorityRegistry;

  constructor(authority = new TelemetryAuthorityRegistry()) {
    this.authority = authority;
  }

  registerProvider(provider: TelemetryProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProviderIds(): string[] {
    return [...this.providers.keys()];
  }

  async collectSnapshot(): Promise<UnifiedTelemetrySnapshot> {
    const cycleId = getTelemetryCycleId();
    const brokerMetric = telemetryMetrics.registry.beginBrokerCollection();
    const capturedAt = new Date().toISOString();
    const providerSnapshots: Record<string, TelemetryProviderSnapshot> = {};
    const providerHealth: Record<string, any> = {};

    const jobs = [...this.providers.values()].map(async (provider) => {
      let snapshot: TelemetryProviderSnapshot;
      const startedAt = Date.now();
      const providerMetric = telemetryMetrics.registry.beginProvider(provider.id);
      try {
        snapshot = await provider.captureSnapshot();
      } catch (error: unknown) {
        snapshot = {
          cycleId,
          providerId: provider.id,
          capturedAt: new Date().toISOString(),
          domains: {},
          health: {
            providerId: provider.id,
            healthy: false,
            stale: true,
            latencyMs: Date.now() - startedAt,
            lastSuccessAt: null,
            lastError: error instanceof Error ? error.message : String(error),
            consecutiveFailures: 1,
          },
          provenance: {
            source: provider.id,
            metadata: { captureRejected: true },
          },
        };
      }
      snapshot.cycleId = snapshot.cycleId ?? cycleId;
      providerSnapshots[provider.id] = cloneValue(snapshot);
      providerHealth[provider.id] = cloneValue(snapshot.health);
      providerMetric.finish(!!snapshot.health?.healthy, !!snapshot.health?.stale);
    });

    await Promise.all(jobs);

    const authorities: Record<TelemetryDomain, any> = {
      "controller-health": null,
      "string-telemetry": null,
      "feather-hvac-telemetry": null,
      notifications: null,
      "first-responder-safety": null,
    };

    const unified: TelemetryUnifiedData = {
      controllerHealth: null,
      stringTelemetry: null,
      featherTelemetry: null,
      notifications: null,
      firstResponderSafety: null,
    };

    (Object.keys(authorities) as TelemetryDomain[]).forEach((domain) => {
      const resolution = this.authority.resolve(domain, providerHealth);
      authorities[domain] = resolution;
      telemetryMetrics.registry.recordAuthority(domain, resolution.chosenProviderId);

      const chosen = resolution.chosenProviderId ? providerSnapshots[resolution.chosenProviderId] : null;
      const unifiedKey = toUnifiedKey(domain);
      if (chosen?.domains && chosen.domains[domain] !== undefined) {
        unified[unifiedKey] = cloneValue(chosen.domains[domain]);
      }
    });

    const result = {
      cycleId,
      capturedAt,
      authorities,
      health: cloneValue(providerHealth),
      providers: cloneValue(providerSnapshots),
      unified: cloneValue(unified),
    };
    brokerMetric.finish(true);
    return result;
  }

  getAuthorityRegistry(): TelemetryAuthorityRegistry {
    return this.authority;
  }

  buildSourceMetadata(args: {
    providerId: string;
    source: string;
    stale: boolean;
    confidence: number;
    preferred: boolean;
    fallbackUsed: boolean;
    lastUpdatedAt: string | null;
    authorityDomain: TelemetryDomain;
  }): TelemetrySourceMetadata {
    return { ...args };
  }
}
