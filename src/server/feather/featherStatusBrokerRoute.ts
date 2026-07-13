import { getFeatherCache, queryFeatherDevice, queryFeatherInternalDiagnostics } from "./featherClient";
import { buildFeatherDeviceStatusResponse } from "./featherStatusResponse";
import { getLatestTelemetrySnapshot, getTelemetryBroker } from "../telemetry/TelemetryRuntime";

type FeatherStatusRouteArgs = {
  deviceIp: string;
  sourceMethod: "string-ip-map" | "ip-map" | "blockviewer" | "manual" | "topology-profile";
  includeDiagnostics: boolean;
  timeoutMs: number;
  snapshot: any;
  lastEnrichedCache: any;
  forceLegacy?: boolean;
  disableBroker?: boolean;
  brokerSnapshot?: any;
  collectBrokerSnapshotFn?: () => Promise<any>;
  queryDeviceFn?: typeof queryFeatherDevice;
  queryDiagnosticsFn?: typeof queryFeatherInternalDiagnostics;
  cacheOnly?: boolean;
  scheduledDevice?: any;
};

type FeatherStatusParity = {
  routeStatusEqual: boolean;
  topLevelKeysEqual: boolean;
  deviceKeysEqual: boolean;
  reachableEqual: boolean;
  deviceIpEqual: boolean;
  hvacTypeEqual: boolean;
  segmentTypeEqual: boolean;
  thermostatStageEqual: boolean;
  setpointsEqual: boolean;
  environmentalEqual: boolean;
  alarmsEqual: boolean;
  diagnosticsPresenceEqual: boolean;
  doorStatesEqual: boolean;
  controllerStatisticsEqual: boolean;
  staleOfflineEqual: boolean;
  nullMissingBehaviorEqual: boolean;
  sourceProvenanceEqual: boolean;
};

function findLegacyExisting(snapshot: any, lastEnrichedCache: any, deviceIp: string): any {
  return (
    snapshot?.normalized?.feather?.find((d: any) => d.ip === deviceIp || d.deviceIp === deviceIp) ||
    lastEnrichedCache?.devices?.find((d: any) => d.ip === deviceIp || d.deviceIp === deviceIp) ||
    null
  );
}

function computeFeatherParity(brokerResponse: any, legacyResponse: any, includeDiagnostics: boolean): FeatherStatusParity {
  const b = brokerResponse?.device || {};
  const l = legacyResponse?.device || {};

  const bRaw = b?.raw || {};
  const lRaw = l?.raw || {};

  const bEnv = {
    spaceTemperature: b.spaceTemperature ?? b.temperature,
    avgCellTemperature: b.avgCellTemperature,
    supplyAirTemp: b.supplyAirTemp,
  };
  const lEnv = {
    spaceTemperature: l.spaceTemperature ?? l.temperature,
    avgCellTemperature: l.avgCellTemperature,
    supplyAirTemp: l.supplyAirTemp,
  };
  const equalNumberOrMissing = (left: unknown, right: unknown): boolean => {
    if (left == null || right == null) return left == null && right == null;
    return Number(left) === Number(right);
  };

  return {
    routeStatusEqual: Boolean(brokerResponse?.success) === Boolean(legacyResponse?.success),
    topLevelKeysEqual: JSON.stringify(Object.keys(brokerResponse || {}).sort()) === JSON.stringify(Object.keys(legacyResponse || {}).sort()),
    deviceKeysEqual: JSON.stringify(Object.keys(b).sort()) === JSON.stringify(Object.keys(l).sort()),
    reachableEqual: Boolean(b.reachable) === Boolean(l.reachable),
    deviceIpEqual: String(b.deviceIp || b.ip || "") === String(l.deviceIp || l.ip || ""),
    hvacTypeEqual: String(b.hvacType || b.segmentLabel || "") === String(l.hvacType || l.segmentLabel || ""),
    segmentTypeEqual: String(bRaw.segmentType || b.segmentType || "") === String(lRaw.segmentType || l.segmentType || ""),
    thermostatStageEqual: String(b.thermostatStage ?? "") === String(l.thermostatStage ?? ""),
    setpointsEqual:
      equalNumberOrMissing(b.coolingSetpoint, l.coolingSetpoint) &&
      equalNumberOrMissing(b.heatingSetpoint, l.heatingSetpoint),
    environmentalEqual:
      equalNumberOrMissing(bEnv.spaceTemperature, lEnv.spaceTemperature) &&
      equalNumberOrMissing(bEnv.avgCellTemperature, lEnv.avgCellTemperature) &&
      equalNumberOrMissing(bEnv.supplyAirTemp, lEnv.supplyAirTemp),
    alarmsEqual:
      Number(b.alarmCount ?? 0) === Number(l.alarmCount ?? 0) &&
      JSON.stringify(b.activeAlarms || []) === JSON.stringify(l.activeAlarms || []),
    diagnosticsPresenceEqual: includeDiagnostics
      ? Boolean(b.diagnostics) === Boolean(l.diagnostics)
      : !Object.prototype.hasOwnProperty.call(b, "diagnostics") && !Object.prototype.hasOwnProperty.call(l, "diagnostics"),
    doorStatesEqual: JSON.stringify(b.doors ?? bRaw.doors ?? null) === JSON.stringify(l.doors ?? lRaw.doors ?? null),
    controllerStatisticsEqual: JSON.stringify(b.controllerStatistics ?? bRaw.fromFeatherControllerStatistcsReport ?? null) === JSON.stringify(l.controllerStatistics ?? lRaw.fromFeatherControllerStatistcsReport ?? null),
    staleOfflineEqual: Boolean(b.stale ?? !b.reachable) === Boolean(l.stale ?? !l.reachable),
    nullMissingBehaviorEqual: ["spaceTemperature", "outsideTemperatureC", "spaceHumidityPct", "supplyAirTemp", "cellCoolingSetpointC", "cellHeatingSetpointC"].every((key) => (Object.prototype.hasOwnProperty.call(b, key) === Object.prototype.hasOwnProperty.call(l, key)) && ((b[key] == null) === (l[key] == null))),
    sourceProvenanceEqual: String(b.source || brokerResponse?.source || "") === String(l.source || legacyResponse?.source || ""),
  };
}

export function getFeatherStatusTelemetryBroker() {
  return getTelemetryBroker();
}

export async function buildFeatherDeviceStatusRouteResponse(args: FeatherStatusRouteArgs): Promise<{
  response: any;
  parity: FeatherStatusParity;
  usingBroker: boolean;
  fallbackUsed: boolean;
  routeTriggeredNetworkCalls: number;
}> {
  const {
    deviceIp,
    sourceMethod,
    includeDiagnostics,
    timeoutMs,
    snapshot,
    lastEnrichedCache,
    forceLegacy = false,
    disableBroker = false,
    brokerSnapshot,
    collectBrokerSnapshotFn,
    queryDeviceFn = queryFeatherDevice,
    queryDiagnosticsFn = queryFeatherInternalDiagnostics,
    cacheOnly = false,
    scheduledDevice = null,
  } = args;

  let routeTriggeredNetworkCalls = 0;
  const legacyExisting = findLegacyExisting(snapshot, lastEnrichedCache, deviceIp);
  const cachedDevice = getFeatherCache().devices.find((device) => device.deviceIp === deviceIp) || null;
  const direct = cacheOnly
    ? (scheduledDevice || legacyExisting || cachedDevice || { deviceIp, ip: deviceIp, reachable: false, lastError: "Cached Feather status unavailable" })
    : (await queryDeviceFn(deviceIp, sourceMethod, timeoutMs, undefined, () => { routeTriggeredNetworkCalls += 1; })) as any;
  if (includeDiagnostics) routeTriggeredNetworkCalls += 1;
  const diagnostics = includeDiagnostics ? await queryDiagnosticsFn(deviceIp, timeoutMs) : null;

  const legacyResponse = buildFeatherDeviceStatusResponse({
    deviceIp,
    direct,
    existing: legacyExisting,
    includeDiagnostics,
    diagnostics,
    mergedFromSnapshot: !!snapshot?.normalized?.feather,
  });

  if (forceLegacy || disableBroker) {
    return {
      response: legacyResponse,
      parity: computeFeatherParity(legacyResponse, legacyResponse, includeDiagnostics),
      usingBroker: false,
      fallbackUsed: false,
      routeTriggeredNetworkCalls,
    };
  }

  try {
    const bSnapshot = brokerSnapshot ?? (collectBrokerSnapshotFn ? await collectBrokerSnapshotFn() : getLatestTelemetrySnapshot());
    if (!bSnapshot) throw new Error("Telemetry broker snapshot is warming");
    const authority = bSnapshot?.authorities?.["feather-hvac-telemetry"];
    const providerId = authority?.chosenProviderId;
    const providerHealth = providerId ? bSnapshot?.health?.[providerId] : null;
    const authorityHealthy = !!providerHealth?.healthy;
    const authorityFresh = !authority?.stale;

    if (!authorityHealthy || !authorityFresh) {
      return {
        response: legacyResponse,
        parity: computeFeatherParity(legacyResponse, legacyResponse, includeDiagnostics),
        usingBroker: false,
        fallbackUsed: true,
        routeTriggeredNetworkCalls,
      };
    }

    const brokerResponse = buildFeatherDeviceStatusResponse({
      deviceIp,
      direct,
      // Preserve legacy merge semantics and shape exactly; broker authority gates route selection.
      existing: legacyExisting,
      includeDiagnostics,
      diagnostics,
      mergedFromSnapshot: !!snapshot?.normalized?.feather,
    });

    return {
      response: brokerResponse,
      parity: computeFeatherParity(brokerResponse, legacyResponse, includeDiagnostics),
      usingBroker: true,
      fallbackUsed: false,
      routeTriggeredNetworkCalls,
    };
  } catch {
    return {
      response: legacyResponse,
      parity: computeFeatherParity(legacyResponse, legacyResponse, includeDiagnostics),
      usingBroker: false,
      fallbackUsed: true,
      routeTriggeredNetworkCalls,
    };
  }
}
