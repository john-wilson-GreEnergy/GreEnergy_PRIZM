import type { CorrectiveActionFinding } from "../correctiveActionsEngine";

export type FeatherHvacProfile = "dometic" | "bergstrom";

type HvacUnitState = {
  unitNumber: 1 | 2;
  commanded: boolean;
  active: boolean;
  currentA: number;
  fanSpeedRpm: number;
  mismatchType: "none" | "commanded_not_active" | "active_not_commanded";
  code: "ENV-HVAC-COMMANDED-NO-CURRENT" | "ENV-HVAC-CURRENT-WITHOUT-COMMAND" | null;
  issueName: string | null;
};

function numberValue(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function boolValue(value: any): boolean {
  if (value === true) return true;
  if (value === false) return false;
  if (value === null || value === undefined || value === "") return false;

  const text = String(value).trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(text);
}

function resolveArrayNumber(device: any): number | undefined {
  const raw =
    device?.arrayIndex ??
    device?.arrayNumber ??
    device?.topology?.arrayIndex ??
    device?.topology?.arrayNumber;

  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function resolveSegmentLabel(device: any): string {
  return (
    device?.segmentLabel ||
    device?.topology?.segmentLabel ||
    device?.entityKeyToken ||
    device?.entityDescription ||
    device?.displayKey ||
    device?.displayName ||
    ""
  );
}

function normalizeSegmentLabel(label: string): string {
  const trimmed = String(label || "").trim();
  if (!trimmed) return "Segment Unknown";

  const esMatch = trimmed.match(/\bES\s*([0-9]+)\b/i);
  if (esMatch) return `Energy Segment ${Number(esMatch[1])}`;

  const csMatch = trimmed.match(/\bCS\s*([0-9]*)\b/i);
  if (csMatch) return csMatch[1] ? `Collection Segment ${Number(csMatch[1])}` : "Collection Segment";

  return trimmed;
}

function resolveEnergySegmentNumber(device: any, segmentLabel: string): number | undefined {
  const direct =
    device?.energySegmentIndex ??
    device?.energySegmentNumber ??
    device?.segmentIndex ??
    device?.topology?.energySegmentIndex ??
    device?.topology?.segmentIndex;

  const directNum = Number(direct);
  if (Number.isFinite(directNum) && directNum > 0) return directNum;

  const match = String(segmentLabel || "").match(/\bES\s*([0-9]+)\b/i);
  if (match) return Number(match[1]);

  return undefined;
}

function getHvacObject(device: any, unitNumber: 1 | 2): any {
  return unitNumber === 1 ? (device?.hvac1 || {}) : (device?.hvac2 || {});
}

function getFlatField(device: any, base: string, unitNumber: 1 | 2): any {
  return device?.[`${base}${unitNumber}`];
}

function getUnitState(device: any, unitNumber: 1 | 2, profile: FeatherHvacProfile): HvacUnitState {
  const hvac = getHvacObject(device, unitNumber);

  const fanLowOn = boolValue(hvac?.fanLowOn ?? getFlatField(device, "fanLowOn", unitNumber));
  const fanHighOn = boolValue(hvac?.fanHighOn ?? getFlatField(device, "fanHighOn", unitNumber));
  const compressorOn = boolValue(
    hvac?.compressorOn ??
    hvac?.YCompressorOn ??
    getFlatField(device, "YCompressorOn", unitNumber) ??
    getFlatField(device, "compressorOn", unitNumber)
  );
  const electricHeatOn = boolValue(hvac?.electricHeatOn ?? getFlatField(device, "electricHeatOn", unitNumber));
  const reversingValveOn = boolValue(hvac?.reversingValveOn ?? getFlatField(device, "reversingValveOn", unitNumber));

  const currentA = numberValue(hvac?.currentA ?? getFlatField(device, "hvacCurrent", unitNumber));
  const fanSpeedRpm = numberValue(hvac?.fanSpeedRpm ?? getFlatField(device, "fanSpeedRpm", unitNumber));

  const commanded = fanLowOn || fanHighOn || compressorOn || electricHeatOn || reversingValveOn;

  // Dometic units do not provide meaningful RPM feedback at this site.
  // Bergstrom can use current or RPM as running feedback.
  const active = profile === "bergstrom"
    ? currentA > 0.2 || fanSpeedRpm > 0
    : currentA > 0.2;

  let mismatchType: HvacUnitState["mismatchType"] = "none";
  let code: HvacUnitState["code"] = null;
  let issueName: string | null = null;

  if (commanded && !active) {
    mismatchType = "commanded_not_active";
    code = "ENV-HVAC-COMMANDED-NO-CURRENT";
    issueName = profile === "bergstrom"
      ? "HVAC Commanded ON, Current/RPM Below Expected Range"
      : "HVAC Commanded ON, Current Below Expected Range";
  } else if (!commanded && active) {
    mismatchType = "active_not_commanded";
    code = "ENV-HVAC-CURRENT-WITHOUT-COMMAND";
    issueName = profile === "bergstrom"
      ? "HVAC Current/RPM Present Without Command"
      : "HVAC Current Present Without Command";
  }

  return {
    unitNumber,
    commanded,
    active,
    currentA,
    fanSpeedRpm,
    mismatchType,
    code,
    issueName
  };
}

function findingSeverity(state: HvacUnitState): "warning" | "alarm" {
  return state.mismatchType === "active_not_commanded" ? "alarm" : "warning";
}

function findingTitle(state: HvacUnitState): string {
  if (state.mismatchType === "active_not_commanded") {
    return `HVAC ${state.unitNumber} current detected without command`;
  }

  return `HVAC ${state.unitNumber} commanded on but no current detected`;
}

function detectedCondition(state: HvacUnitState, profile: FeatherHvacProfile): string {
  if (state.mismatchType === "active_not_commanded") {
    return profile === "bergstrom"
      ? `HVAC ${state.unitNumber} has current/RPM feedback while no command is active.`
      : `HVAC ${state.unitNumber} is drawing current while no command is active.`;
  }

  return profile === "bergstrom"
    ? `HVAC ${state.unitNumber} has an active command, but current/RPM feedback is below the expected running range.`
    : `HVAC ${state.unitNumber} has an active command, but measured current is below the expected running range.`;
}

export function normalizeFeatherHvacCorrectiveFindings(
  devices: any[],
  options: { profile?: FeatherHvacProfile } = {}
): CorrectiveActionFinding[] {
  const profile = options.profile || "dometic";
  const findings: CorrectiveActionFinding[] = [];
  const createdAt = new Date().toISOString();

  for (const device of devices || []) {
    const arrayNumber = resolveArrayNumber(device);
    const segmentLabelRaw = resolveSegmentLabel(device);
    const segmentLabel = normalizeSegmentLabel(segmentLabelRaw);
    const energySegmentNumber = resolveEnergySegmentNumber(device, segmentLabelRaw);
    const deviceIp = device?.ip || device?.deviceIp || device?.endpoint || undefined;

    for (const unitNumber of [1, 2] as const) {
      const state = getUnitState(device, unitNumber, profile);
      if (state.mismatchType === "none" || !state.code || !state.issueName) continue;

      const targetLabel = [
        arrayNumber ? `Array ${arrayNumber}` : "Array Unknown",
        segmentLabel,
        `HVAC ${unitNumber}`,
        deviceIp ? `IP ${deviceIp}` : null
      ].filter(Boolean).join(", ");

      findings.push({
        id: `feather-hvac-${state.mismatchType}-A${arrayNumber ?? "unknown"}-ES${energySegmentNumber ?? "unknown"}-H${unitNumber}-${deviceIp || "unknown"}`,
        category: "environmental",
        subsystem: "hvac",
        remediationStrategyId:
          state.mismatchType === "active_not_commanded"
            ? "hvac-current-without-command"
            : "hvac-commanded-no-current",
        scope: "feather",
        arrayNumber,
        stringNumber: undefined,
        stringKey: targetLabel,
        severity: findingSeverity(state),
        title: findingTitle(state),
        detectedCondition: detectedCondition(state, profile),
        evidence: {
          source: "feather-hvac-normalizer",
          normalizedFaultCode: state.code,
          faultCode: state.code,
          hvacUnit: unitNumber,
          hvacProfile: profile,
          mismatchType: state.mismatchType,
          issueName: state.issueName,
          arrayNumber,
          energySegmentNumber,
          segmentLabel,
          deviceIp,
          targetLabel,
          affectedTargets: [targetLabel],
          commanded: state.commanded,
          active: state.active,
          currentA: state.currentA,
          fanSpeedRpm: state.fanSpeedRpm
        },
        likelyCauses: state.mismatchType === "active_not_commanded"
          ? [
              `HVAC ${unitNumber} relay/contactor may be stuck on.`,
              "Manual override or bypass may be active.",
              "Command mapping or current sensor mapping may be incorrect.",
              "Control state may be stale or not synchronized."
            ]
          : [
              `HVAC ${unitNumber} failed to start.`,
              `HVAC ${unitNumber} command output may not be reaching the unit.`,
              `HVAC ${unitNumber} breaker, fuse, relay, contactor, or control wiring may need inspection.`,
              "Current sensor may be mapped or reading incorrectly."
            ],
        recommendedActions: state.mismatchType === "active_not_commanded"
          ? [
              `Verify HVAC ${unitNumber} command state and physical operation at ${targetLabel}.`,
              "Check for manual override or bypass.",
              `Inspect HVAC ${unitNumber} relay/contactor state.`,
              "Validate current sensor mapping.",
              "Compare HVAC command/current relationship with the paired unit."
            ]
          : [
              `Verify HVAC ${unitNumber} command state at ${targetLabel}.`,
              `Confirm HVAC ${unitNumber} measured current directly.`,
              `Check HVAC ${unitNumber} power, breaker/fuse, relay/contactor, and control wiring.`,
              "Validate Feather/Moxa output mapping and current input mapping.",
              "Check for related environmental faults."
            ],
        safetyNotes: [
          "Follow site electrical safety procedures before inspecting HVAC power or controls.",
          "Verify command state and local physical state before cycling equipment."
        ],
        confidence: "high",
        source: "notification-engine",
        createdAt
      } as CorrectiveActionFinding);
    }
  }

  return findings;
}
