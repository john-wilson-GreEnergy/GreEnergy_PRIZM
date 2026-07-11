export type FeatherDiagnosticsResponse = {
  success: boolean;
  deviceIp: string;
  endpoint: string;
  responseDurationMs: number;
  diagnostics: any | null;
  error: string | null;
};

type BuildFeatherDeviceStatusResponseInput = {
  deviceIp: string;
  direct: any;
  existing: any;
  includeDiagnostics: boolean;
  diagnostics: FeatherDiagnosticsResponse | null;
  mergedFromSnapshot: boolean;
};

export function buildFeatherDeviceStatusResponse({
  deviceIp,
  direct,
  existing,
  includeDiagnostics,
  diagnostics,
  mergedFromSnapshot,
}: BuildFeatherDeviceStatusResponseInput) {
  const merged: any = {
    ...(existing || {}),
    ...(direct || {}),

    ip: direct?.ip || existing?.ip || deviceIp,
    deviceIp: direct?.deviceIp || existing?.deviceIp || deviceIp,

    arrayIndex: direct?.arrayIndex !== undefined && direct?.arrayIndex !== null ? direct.arrayIndex : existing?.arrayIndex,
    stringIndex: direct?.stringIndex !== undefined && direct?.stringIndex !== null ? direct.stringIndex : existing?.stringIndex,
    segmentLabel: direct?.segmentLabel !== undefined && direct?.segmentLabel !== null ? direct.segmentLabel : existing?.segmentLabel,
    entityDescription: direct?.entityDescription !== undefined && direct?.entityDescription !== null ? direct.entityDescription : existing?.entityDescription,
    entityKey: direct?.entityKey !== undefined && direct?.entityKey !== null ? direct.entityKey : existing?.entityKey,
    entityKeyToken: direct?.entityKeyToken !== undefined && direct?.entityKeyToken !== null ? direct.entityKeyToken : existing?.entityKeyToken,
    displayKey: direct?.displayKey !== undefined && direct?.displayKey !== null ? direct.displayKey : existing?.displayKey,

    firmwareVersion: direct?.firmwareVersion !== undefined && direct?.firmwareVersion !== null ? direct.firmwareVersion : existing?.firmwareVersion,
    softwareVersion: direct?.softwareVersion !== undefined && direct?.softwareVersion !== null ? direct.softwareVersion : existing?.softwareVersion,

    thermostatStage: direct?.thermostatStage !== undefined && direct?.thermostatStage !== null ? direct.thermostatStage : existing?.thermostatStage,
    hvacRuntimeState: direct?.hvacRuntimeState !== undefined && direct?.hvacRuntimeState !== null ? direct.hvacRuntimeState : existing?.hvacRuntimeState,
    hvacMode: direct?.hvacMode !== undefined && direct?.hvacMode !== null ? direct.hvacMode : existing?.hvacMode,
    hvacStatus: direct?.hvacStatus !== undefined && direct?.hvacStatus !== null ? direct.hvacStatus : existing?.hvacStatus,

    hvac1: (direct?.hvac1 !== undefined && direct?.hvac1 !== null) ? direct.hvac1 : existing?.hvac1,
    hvac2: (direct?.hvac2 !== undefined && direct?.hvac2 !== null) ? direct.hvac2 : existing?.hvac2,
    doors: (direct?.doors !== undefined && direct?.doors !== null) ? direct.doors : existing?.doors,
    fssSignals: (direct?.fssSignals !== undefined && direct?.fssSignals !== null) ? direct.fssSignals : existing?.fssSignals,

    sourceCoverage: {
      ...(existing?.sourceCoverage || {}),
      ...(direct?.sourceCoverage || {}),
      directFeather: true,
    },

    doorApplicability: {
      ...(existing?.doorApplicability || {}),
      ...(direct?.doorApplicability || {}),
    },

    raw: {
      ...(existing?.raw || {}),
      directPoll: direct?.raw || direct,
      ...(includeDiagnostics && diagnostics?.success ? { directDiagnostics: diagnostics.diagnostics } : {}),
    },
  };

  if (includeDiagnostics) {
    merged.diagnostics = diagnostics;
  }

  return {
    success: true,
    device: merged,
    directStatusMerged: !!existing,
    mergedFromSnapshot,
    source: "direct-feather-status",
  };
}
