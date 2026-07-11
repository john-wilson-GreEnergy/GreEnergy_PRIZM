import { TelemetryAuthorityRegistry } from "./TelemetryAuthority";
import { cloneValue } from "./TelemetryHealth";
import { TelemetryDomain, TelemetrySourceMetadata, TelemetryUnifiedData } from "./TelemetryModels";
import { TelemetryProvider, TelemetryProviderSnapshot, UnifiedTelemetrySnapshot } from "./TelemetryProvider";

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
    const capturedAt = new Date().toISOString();
    const providerSnapshots: Record<string, TelemetryProviderSnapshot> = {};
    const providerHealth: Record<string, any> = {};

    const jobs = [...this.providers.values()].map(async (provider) => {
      const snapshot = await provider.captureSnapshot();
      providerSnapshots[provider.id] = cloneValue(snapshot);
      providerHealth[provider.id] = cloneValue(snapshot.health);
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

      const chosen = resolution.chosenProviderId ? providerSnapshots[resolution.chosenProviderId] : null;
      const unifiedKey = toUnifiedKey(domain);
      if (chosen?.domains && chosen.domains[domain] !== undefined) {
        unified[unifiedKey] = cloneValue(chosen.domains[domain]);
      }
    });

    return {
      capturedAt,
      authorities,
      health: cloneValue(providerHealth),
      providers: cloneValue(providerSnapshots),
      unified: cloneValue(unified),
    };
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
