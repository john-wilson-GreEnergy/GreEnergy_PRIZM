import {
  getEmsCachedArrayNotifications,
  getEmsCachedRawStrings,
  getEmsConnectionStatus,
  getNotificationHybridTelemetry,
} from "../../emsTurtleClient";
import { cloneValue } from "../TelemetryHealth";
import { CanonicalNotification, NotificationsTelemetry, StringTelemetry, StringTelemetryRow, TelemetryDomain } from "../TelemetryModels";
import { TelemetryProvider, TelemetryProviderSnapshot } from "../TelemetryProvider";

function normalizeNotificationIdentity(row: any): string {
  const source = row?.notificationSource || {};
  const sevRaw = String(row?.notificationType?.notificationCategory || "").toUpperCase();
  const sev = sevRaw === "ALARM" || sevRaw === "CRITICAL" ? "ALARM" : (sevRaw === "WARNING" ? "WARNING" : "UNKNOWN");
  const code = String(row?.notificationType?.notificationId ?? "").trim() || "NA";
  const sourceType = String(source.endpointType ?? source.type ?? "").trim().toUpperCase() || "NA";
  const n = (v: any) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? String(Math.trunc(x)) : "NA";
  };
  return ["v2", `sev:${sev}`, `id:${code.toUpperCase()}`, `src:${sourceType}`, `a:${n(source.arrayIndex)}`, `s:${n(source.stringIndex)}`, `bp:${n(source.batteryPackIndex)}`, `cg:${n(source.cellGroupIndex)}`].join("|");
}

function toCanonicalNotification(row: any): CanonicalNotification {
  const source = row?.notificationSource || {};
  const severity = String(row?.notificationType?.notificationCategory || "UNKNOWN").toUpperCase();
  return {
    severity,
    notificationId: String(row?.notificationType?.notificationId ?? "NA"),
    sourceType: String(source.endpointType ?? source.type ?? "NA"),
    arrayIndex: Number.isFinite(Number(source.arrayIndex)) ? Number(source.arrayIndex) : null,
    stringIndex: Number.isFinite(Number(source.stringIndex)) ? Number(source.stringIndex) : null,
    batteryPackIndex: Number.isFinite(Number(source.batteryPackIndex)) ? Number(source.batteryPackIndex) : null,
    cellGroupIndex: Number.isFinite(Number(source.cellGroupIndex)) ? Number(source.cellGroupIndex) : null,
    identity: normalizeNotificationIdentity(row),
    raw: cloneValue(row),
  };
}

export class TurtleTelemetryProvider implements TelemetryProvider {
  readonly id = "turtle";
  readonly domains: TelemetryDomain[] = ["controller-health", "string-telemetry", "notifications"];

  async captureSnapshot(): Promise<TelemetryProviderSnapshot> {
    const startedAt = Date.now();
    try {
      const conn = getEmsConnectionStatus();
      const rawStrings = getEmsCachedRawStrings();
      const arrayNotifications = getEmsCachedArrayNotifications();
      const hybrid = getNotificationHybridTelemetry();

      const rows: StringTelemetryRow[] = (rawStrings?.data || []).map((row: any) => ({
        arrayIndex: Number.isFinite(Number(row.arrayIndex ?? row.ArrayIndex)) ? Number(row.arrayIndex ?? row.ArrayIndex) : null,
        stringIndex: Number.isFinite(Number(row.stringIndex ?? row.StringIndex)) ? Number(row.stringIndex ?? row.StringIndex) : null,
        stringKey: row.stringKey || row.StringKey || null,
        connectionState: row.connectionState || row.StringConnectionState || null,
        socPct: Number.isFinite(Number(row.soc ?? row.Soc ?? row.SoC)) ? Number(row.soc ?? row.Soc ?? row.SoC) : null,
        voltageV: Number.isFinite(Number(row.voltageMeasured ?? row.MeasuredStringVoltage)) ? Number(row.voltageMeasured ?? row.MeasuredStringVoltage) : null,
        currentA: Number.isFinite(Number(row.stringCurrent ?? row.StringCurrent)) ? Number(row.stringCurrent ?? row.StringCurrent) : null,
        raw: cloneValue(row),
      }));

      const stringTelemetry: StringTelemetry = {
        rows,
        totalRows: rows.length,
        raw: cloneValue(rawStrings),
      };

      const notifRows = Object.values(arrayNotifications)
        .flatMap((entry: any) => (entry?.data?.notification || []))
        .map(toCanonicalNotification);

      const notifications: NotificationsTelemetry = {
        canonicalIdentityVersion: "notification-identity-v2",
        arrayNotifications: notifRows,
        stringNotifications: [],
        hybridComparison: cloneValue(hybrid),
        raw: cloneValue(arrayNotifications),
      };

      const stale = !!conn?.staleData;
      return {
        providerId: this.id,
        capturedAt: new Date().toISOString(),
        domains: {
          "controller-health": {
            connectionState: conn?.connectionState || conn?.source || "unknown",
            sourceMode: conn?.activeMode || conn?.source || "unknown",
            stationCode: conn?.stationCode || null,
            activeProfileId: conn?.activeProfileId || null,
            activeProfileName: conn?.activeProfileName || null,
            lastUpdatedAt: conn?.lastUpdated || null,
            stale,
            lastError: conn?.lastError || null,
            raw: cloneValue(conn),
          },
          "string-telemetry": stringTelemetry,
          notifications,
        },
        health: {
          providerId: this.id,
          healthy: !stale,
          stale,
          latencyMs: Date.now() - startedAt,
          lastSuccessAt: conn?.lastUpdated || new Date().toISOString(),
          lastError: conn?.lastError || null,
          consecutiveFailures: stale ? 1 : 0,
          details: {
            source: conn?.source,
            activeEmsBaseUrl: conn?.activeEmsBaseUrl,
          },
        },
        provenance: {
          source: "ems-cache",
          metadata: {
            wrappedClients: [
              "getEmsConnectionStatus",
              "getEmsCachedRawStrings",
              "getEmsCachedArrayNotifications",
              "getNotificationHybridTelemetry",
            ],
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
          source: "ems-cache",
        },
      };
    }
  }
}
