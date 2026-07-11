import { queryFeatherDevice, queryFeatherInternalDiagnostics } from "./featherClient";
import { buildFeatherDeviceStatusResponse } from "./featherStatusResponse";
import { collectTelemetrySnapshot, getTelemetryBroker } from "../telemetry/TelemetryRuntime";

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
};

type FeatherStatusParity = {
  reachableEqual: boolean;
  deviceIpEqual: boolean;
  hvacTypeEqual: boolean;
  segmentTypeEqual: boolean;
  thermostatStageEqual: boolean;
  setpointsEqual: boolean;
  environmentalEqual: boolean;
  alarmsEqual: boolean;
  diagnosticsPresenceEqual: boolean;
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

  return {
    reachableEqual: Boolean(b.reachable) === Boolean(l.reachable),
    deviceIpEqual: String(b.deviceIp || b.ip || "") === String(l.deviceIp || l.ip || ""),
    hvacTypeEqual: String(b.hvacType || b.segmentLabel || "") === String(l.hvacType || l.segmentLabel || ""),
    segmentTypeEqual: String(bRaw.segmentType || b.segmentType || "") === String(lRaw.segmentType || l.segmentType || ""),
    thermostatStageEqual: String(b.thermostatStage ?? "") === String(l.thermostatStage ?? ""),
    setpointsEqual:
      Number(b.coolingSetpoint ?? NaN) === Number(l.coolingSetpoint ?? NaN) &&
      Number(b.heatingSetpoint ?? NaN) === Number(l.heatingSetpoint ?? NaN),
    environmentalEqual:
      Number(bEnv.spaceTemperature ?? NaN) === Number(lEnv.spaceTemperature ?? NaN) &&
      Number(bEnv.avgCellTemperature ?? NaN) === Number(lEnv.avgCellTemperature ?? NaN) &&
      Number(bEnv.supplyAirTemp ?? NaN) === Number(lEnv.supplyAirTemp ?? NaN),
    alarmsEqual:
      Number(b.alarmCount ?? 0) === Number(l.alarmCount ?? 0) &&
      JSON.stringify(b.activeAlarms || []) === JSON.stringify(l.activeAlarms || []),
    diagnosticsPresenceEqual: includeDiagnostics
      ? Boolean(b.diagnostics) === Boolean(l.diagnostics)
      : !Object.prototype.hasOwnProperty.call(b, "diagnostics") && !Object.prototype.hasOwnProperty.call(l, "diagnostics"),
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
  } = args;

  const direct = (await queryDeviceFn(deviceIp, sourceMethod, timeoutMs)) as any;
  const diagnostics = includeDiagnostics ? await queryDiagnosticsFn(deviceIp, timeoutMs) : null;

  const legacyExisting = findLegacyExisting(snapshot, lastEnrichedCache, deviceIp);

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
    };
  }

  try {
    const bSnapshot = brokerSnapshot ?? await (collectBrokerSnapshotFn ? collectBrokerSnapshotFn() : collectTelemetrySnapshot());
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
    };
  } catch {
    return {
      response: legacyResponse,
      parity: computeFeatherParity(legacyResponse, legacyResponse, includeDiagnostics),
      usingBroker: false,
      fallbackUsed: true,
    };
  }
}
