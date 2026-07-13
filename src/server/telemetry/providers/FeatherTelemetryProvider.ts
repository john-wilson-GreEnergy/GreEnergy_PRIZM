import { getFeatherCache } from "../../feather/featherClient";
import { cloneValue } from "../TelemetryHealth";
import { FeatherTelemetry, FeatherTelemetryDevice, TelemetryDomain } from "../TelemetryModels";
import { TelemetryProvider, TelemetryProviderSnapshot } from "../TelemetryProvider";
import { featherScheduler } from "../feather/FeatherScheduler";

export class FeatherTelemetryProvider implements TelemetryProvider {
  readonly id = "feather";
  readonly domains: TelemetryDomain[] = ["feather-hvac-telemetry"];

  async captureSnapshot(): Promise<TelemetryProviderSnapshot> {
    const startedAt = Date.now();
    try {
      const cache = getFeatherCache();
      const scheduled = featherScheduler.config.mode === "scheduled";
      const schedulerSnapshots = scheduled ? featherScheduler.getAllControllerSnapshots() : [];
      const sourceDevices = scheduled ? schedulerSnapshots.map((snapshot) => snapshot.normalized) : (cache.devices || []);
      const schedulerState = scheduled ? featherScheduler.getSchedulerState() : null;
      const devices: FeatherTelemetryDevice[] = sourceDevices.map((d: any) => ({
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

      const expectedUnavailable = schedulerState?.topologyClassification["expected-but-unavailable"].length ?? 0;
      const expectedSnapshotStale = scheduled && schedulerSnapshots.some((snapshot) => {
        const classification = schedulerState?.topologyClassification["expected-and-reachable"] ?? [];
        return classification.includes(snapshot.deviceIp) && snapshot.stale;
      });
      const schedulerStale = scheduled && Boolean(schedulerState && (expectedUnavailable > 0 || expectedSnapshotStale));
      const featherTelemetry: FeatherTelemetry = {
        devices,
        totalDevices: devices.length,
        reachableDevices: devices.filter((d) => d.reachable).length,
        stale: scheduled ? schedulerStale : !!cache.isStale,
        raw: scheduled ? cloneValue({ mode: "scheduled", scheduler: schedulerState }) : cloneValue(cache),
      };

      return {
        providerId: this.id,
        capturedAt: new Date().toISOString(),
        domains: {
          "feather-hvac-telemetry": featherTelemetry,
        },
        health: {
          providerId: this.id,
          healthy: scheduled ? schedulerSnapshots.length > 0 && !schedulerStale : !cache.isStale,
          stale: scheduled ? schedulerStale : !!cache.isStale,
          latencyMs: Date.now() - startedAt,
          lastSuccessAt: scheduled ? (schedulerSnapshots.map((snapshot) => snapshot.parsedAt).sort().at(-1) ?? null) : (cache.lastUpdatedAt || null),
          lastError: (scheduled ? schedulerStale : cache.isStale) ? "Feather cache stale or unavailable" : null,
          consecutiveFailures: (scheduled ? schedulerStale : cache.isStale) ? 1 : 0,
          details: {
            activeProfileId: cache.activeProfileId,
            activeEmsBaseUrl: cache.activeEmsBaseUrl,
            mode: scheduled ? "scheduled" : "legacy",
          },
        },
        provenance: {
          source: scheduled ? "feather-scheduler" : "feather-cache",
          metadata: {
            wrappedClients: scheduled ? ["FeatherScheduler"] : ["getFeatherCache"],
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
