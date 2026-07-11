import { getFeatherCache } from "../../feather/featherClient";
import { cloneValue } from "../TelemetryHealth";
import { FeatherTelemetry, FeatherTelemetryDevice, TelemetryDomain } from "../TelemetryModels";
import { TelemetryProvider, TelemetryProviderSnapshot } from "../TelemetryProvider";

export class FeatherTelemetryProvider implements TelemetryProvider {
  readonly id = "feather";
  readonly domains: TelemetryDomain[] = ["feather-hvac-telemetry"];

  async captureSnapshot(): Promise<TelemetryProviderSnapshot> {
    const startedAt = Date.now();
    try {
      const cache = getFeatherCache();
      const devices: FeatherTelemetryDevice[] = (cache.devices || []).map((d: any) => ({
        deviceIp: d.deviceIp || d.ip || "unknown",
        reachable: !!d.reachable,
        arrayIndex: Number.isFinite(Number(d.arrayIndex)) ? Number(d.arrayIndex) : null,
        stringIndex: Number.isFinite(Number(d.stringIndex)) ? Number(d.stringIndex) : null,
        operationalState: d.operationalState || d.deviceState || null,
        warningCount: Number.isFinite(Number(d.warningCount)) ? Number(d.warningCount) : 0,
        alarmCount: Number.isFinite(Number(d.alarmCount)) ? Number(d.alarmCount) : 0,
        lastUpdatedAt: d.lastUpdatedAt || cache.lastUpdatedAt || null,
        raw: cloneValue(d),
      }));

      const featherTelemetry: FeatherTelemetry = {
        devices,
        totalDevices: devices.length,
        reachableDevices: devices.filter((d) => d.reachable).length,
        stale: !!cache.isStale,
        raw: cloneValue(cache),
      };

      return {
        providerId: this.id,
        capturedAt: new Date().toISOString(),
        domains: {
          "feather-hvac-telemetry": featherTelemetry,
        },
        health: {
          providerId: this.id,
          healthy: !cache.isStale,
          stale: !!cache.isStale,
          latencyMs: Date.now() - startedAt,
          lastSuccessAt: cache.lastUpdatedAt || null,
          lastError: cache.isStale ? "Feather cache stale or unavailable" : null,
          consecutiveFailures: cache.isStale ? 1 : 0,
          details: {
            activeProfileId: cache.activeProfileId,
            activeEmsBaseUrl: cache.activeEmsBaseUrl,
          },
        },
        provenance: {
          source: "feather-cache",
          metadata: {
            wrappedClients: ["getFeatherCache"],
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
          source: "feather-cache",
        },
      };
    }
  }
}
