import { getEmsCachedFirstResponder } from "../../emsTurtleClient";
import { cloneValue } from "../TelemetryHealth";
import { FirstResponderTelemetry, TelemetryDomain } from "../TelemetryModels";
import { TelemetryProvider, TelemetryProviderSnapshot } from "../TelemetryProvider";

export class FirstResponderTelemetryProvider implements TelemetryProvider {
  readonly id = "first-responder";
  readonly domains: TelemetryDomain[] = ["first-responder-safety"];

  async captureSnapshot(): Promise<TelemetryProviderSnapshot> {
    const startedAt = Date.now();
    try {
      const wrapped = getEmsCachedFirstResponder();
      const data = wrapped?.data || {};
      const stale = !!wrapped?.staleData;

      const telemetry: FirstResponderTelemetry = {
        v1: cloneValue(data?.v1 ?? {}),
        v2: cloneValue(data?.v2 ?? {}),
        stale,
        lastUpdatedAt: wrapped?.lastUpdated || null,
        raw: cloneValue(wrapped),
      };

      return {
        providerId: this.id,
        capturedAt: new Date().toISOString(),
        domains: {
          "first-responder-safety": telemetry,
        },
        health: {
          providerId: this.id,
          healthy: !stale,
          stale,
          latencyMs: Date.now() - startedAt,
          lastSuccessAt: wrapped?.lastUpdated || null,
          lastError: wrapped?.lastError || null,
          consecutiveFailures: stale ? 1 : 0,
          details: {
            source: wrapped?.source,
          },
        },
        provenance: {
          source: "ems-first-responder-cache",
          metadata: {
            wrappedClients: ["getEmsCachedFirstResponder"],
          },
        },
      };
    } catch (err: any) {
      return {
        providerId: this.id,
        capturedAt: new Date().toISOString(),
        domains: {},
        health: {
          providerId: this.id,
          healthy: false,
          stale: true,
          latencyMs: Date.now() - startedAt,
          lastSuccessAt: null,
          lastError: err?.message || String(err),
          consecutiveFailures: 1,
        },
        provenance: {
          source: "ems-first-responder-cache",
        },
      };
    }
  }
}
