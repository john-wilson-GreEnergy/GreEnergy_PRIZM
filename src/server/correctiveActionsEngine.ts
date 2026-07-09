import type { CorrectiveActionCategory, CorrectiveActionSubsystem } from "./correctiveActions/remediationLibrary";
import { getRemediationStrategy } from "./correctiveActions/remediationLibrary";
import type { NormalizedContactorState } from "./contactorStateEngine";

export type CorrectiveActionSeverity = "info" | "warning" | "alarm" | "critical";
export type CorrectiveActionScope = "site" | "array" | "string" | "bpc" | "pcs" | "feather";

export type CorrectiveActionFinding = {
  id: string;
  category: CorrectiveActionCategory;
  subsystem: CorrectiveActionSubsystem;
  remediationStrategyId?: string;
  remediation?: ReturnType<typeof getRemediationStrategy>;
  scope: CorrectiveActionScope;
  arrayNumber?: number;
  stringNumber?: number;
  stringKey?: string;
  severity: CorrectiveActionSeverity;
  title: string;
  detectedCondition: string;
  evidence: Record<string, any>;
  likelyCauses: string[];
  recommendedActions: string[];
  safetyNotes?: string[];
  confidence: "low" | "medium" | "high";
  source: "contactor-engine" | "string-list-engine" | "notification-engine";
  createdAt: string;
};

function finding(input: Omit<CorrectiveActionFinding, "createdAt">): CorrectiveActionFinding {
  return {
    ...input,
    remediation: getRemediationStrategy(input.remediationStrategyId),
    createdAt: new Date().toISOString()
  };
}

export function analyzeContactorStates(
  states: NormalizedContactorState[]
): CorrectiveActionFinding[] {
  const findings: CorrectiveActionFinding[] = [];

  for (const state of states) {
    const base = {
      scope: "string" as const,
      arrayNumber: state.arrayNumber,
      stringNumber: state.stringNumber,
      stringKey: state.stringKey,
      source: "contactor-engine" as const
    };

    if (state.actualState === "partial") {
      findings.push(finding({
        ...base,
        id: `contactor-mismatch-${state.stringKey}`,
        category: "string_battery",
        subsystem: "contactor",
        remediationStrategyId: "contactor-feedback-mismatch",
        severity: "warning",
        title: "Contactor feedback mismatch",
        detectedCondition: "Positive and negative contactor feedback do not agree.",
        evidence: {
          requestedState: state.requestedState,
          actualState: state.actualState,
          positiveContactorClosed: state.positiveContactorClosed,
          negativeContactorClosed: state.negativeContactorClosed,
          contactorsCloseExpected: state.contactorsCloseExpected,
          quality: state.quality,
          sourceUrl: state.sourceUrl
        },
        likelyCauses: [
          "One contactor failed to transition.",
          "Auxiliary feedback contact is stuck or wired incorrectly.",
          "One contactor feedback input is stale or intermittent.",
          "BMS/Feather command and feedback are temporarily out of sync.",
          "A safety interlock may be preventing one side from following the requested state."
        ],
        recommendedActions: [
          "Verify the requested contactor state before taking action.",
          "Confirm string current is zero before inspecting or commanding contactors.",
          "Compare positive and negative contactor feedback at the source endpoint.",
          "Check active string/BMS faults and local notifications for the same string.",
          "Inspect contactor auxiliary feedback wiring and input mapping if mismatch persists.",
          "If the string is expected to be closed, review interlocks preventing close permissive."
        ],
        safetyNotes: [
          "Do not assume the string is electrically isolated when only one contactor indicates open.",
          "Follow site LOTO and arc-flash procedures before physical inspection."
        ],
        confidence: "high"
      }));
    }

    if (state.requestedState === "closed" && state.actualState === "open") {
      findings.push(finding({
        ...base,
        id: `requested-closed-actual-open-${state.stringKey}`,
        category: "string_battery",
        subsystem: "contactor",
        remediationStrategyId: "contactor-requested-closed-actual-open",
        severity: "alarm",
        title: "String requested closed but contactors are open",
        detectedCondition: "The control state expects closed contactors, but both contactor feedbacks indicate open.",
        evidence: {
          requestedState: state.requestedState,
          actualState: state.actualState,
          positiveContactorClosed: state.positiveContactorClosed,
          negativeContactorClosed: state.negativeContactorClosed,
          contactorsCloseExpected: state.contactorsCloseExpected,
          quality: state.quality,
          sourceUrl: state.sourceUrl
        },
        likelyCauses: [
          "Close command not reaching contactors.",
          "BMS interlock preventing contactor close.",
          "String-level fault blocking close permissive.",
          "Contactor coil supply or control circuit issue.",
          "Feedback circuit is reporting open even though command is closed."
        ],
        recommendedActions: [
          "Check active faults and interlocks for this string.",
          "Verify close permissive and contactor command status.",
          "Confirm coil/control voltage is present when close is requested.",
          "Inspect contactor feedback and command wiring if command is present.",
          "Review recent transition history to determine if this is a failed close event."
        ],
        safetyNotes: [
          "Confirm voltage and current state before performing any physical inspection."
        ],
        confidence: "high"
      }));
    }

    if (state.requestedState === "open" && state.actualState === "closed") {
      findings.push(finding({
        ...base,
        id: `requested-open-actual-closed-${state.stringKey}`,
        category: "string_battery",
        subsystem: "contactor",
        remediationStrategyId: "contactor-requested-open-actual-closed",
        severity: "critical",
        title: "String requested open but contactors remain closed",
        detectedCondition: "The control state expects open contactors, but both contactor feedbacks indicate closed.",
        evidence: {
          requestedState: state.requestedState,
          actualState: state.actualState,
          positiveContactorClosed: state.positiveContactorClosed,
          negativeContactorClosed: state.negativeContactorClosed,
          contactorsCloseExpected: state.contactorsCloseExpected,
          quality: state.quality,
          sourceUrl: state.sourceUrl
        },
        likelyCauses: [
          "One or more contactors failed to open.",
          "Open command not reaching contactor control circuit.",
          "Contactor mechanically stuck closed.",
          "Feedback circuit incorrectly reporting closed.",
          "Control state is stale or command has not propagated."
        ],
        recommendedActions: [
          "Treat this as a high-priority abnormal state until verified.",
          "Confirm requested open state from the control endpoint.",
          "Verify string current and voltage before any action.",
          "Check whether an open command is being issued to the contactor control circuit.",
          "Inspect contactor auxiliary feedback and mechanical state if safe and authorized.",
          "Escalate if contactors remain closed while open is requested."
        ],
        safetyNotes: [
          "Do not assume the string is isolated.",
          "Follow LOTO and site switching procedures before physical inspection."
        ],
        confidence: "high"
      }));
    }

    if (state.actualState === "unknown" || state.quality === "failed") {
      findings.push(finding({
        ...base,
        id: `contactor-state-unknown-${state.stringKey}`,
        category: "controls_comms",
        subsystem: "feather",
        remediationStrategyId: undefined,
        severity: "info",
        title: "Contactor state unavailable",
        detectedCondition: "The contactor engine could not determine a reliable contactor state.",
        evidence: {
          requestedState: state.requestedState,
          actualState: state.actualState,
          positiveContactorClosed: state.positiveContactorClosed,
          negativeContactorClosed: state.negativeContactorClosed,
          quality: state.quality,
          error: state.error,
          sourceUrl: state.sourceUrl
        },
        likelyCauses: [
          "Stringviewer endpoint timeout.",
          "EMS endpoint temporarily unavailable.",
          "String data model missing contactor feedback fields.",
          "Network latency or dropped request."
        ],
        recommendedActions: [
          "Refresh the contactor engine snapshot.",
          "Verify the stringviewer endpoint responds directly.",
          "Check EMS network reachability if multiple strings are unknown.",
          "Increase timeout or reduce contactor polling concurrency if failures persist."
        ],
        confidence: "medium"
      }));
    }
  }

  const byArray = new Map<number, NormalizedContactorState[]>();
  for (const state of states) {
    const existing = byArray.get(state.arrayNumber) || [];
    existing.push(state);
    byArray.set(state.arrayNumber, existing);
  }

  for (const [arrayNumber, arrayStates] of byArray.entries()) {
    const openCount = arrayStates.filter((state) => state.actualState === "open").length;
    const partialCount = arrayStates.filter((state) => state.actualState === "partial").length;
    const total = arrayStates.length;

    const expectedClosedStates = arrayStates.filter((state) => state.requestedState === "closed");
    const expectedClosedButOpenCount = expectedClosedStates.filter((state) => state.actualState === "open").length;

    // Do not create a corrective-action fault just because an array is open.
    // This is only actionable when the array/string contactors are expected closed.
    if (expectedClosedStates.length > 0 && expectedClosedButOpenCount === expectedClosedStates.length) {
      findings.push(finding({
        id: `array-wide-open-contactors-A${arrayNumber}`,
        scope: "array",
        arrayNumber,
        category: "string_battery",
        subsystem: "array",
        remediationStrategyId: "array-wide-open-contactors",
        severity: "warning",
        title: "Array expected closed but contactors report open",
        detectedCondition: `All ${expectedClosedStates.length} string(s) in Array ${arrayNumber} expected closed report open contactors.`,
        evidence: {
          arrayNumber,
          totalStrings: total,
          expectedClosedStringCount: expectedClosedStates.length,
          expectedClosedButOpenCount,
          openCount,
          partialCount
        },
        likelyCauses: [
          "Array intentionally offline or inhibited.",
          "Array-level command requesting open contactors.",
          "Shared permissive/interlock preventing contactor close.",
          "Array communication/control state issue."
        ],
        recommendedActions: [
          "Confirm whether the array is intentionally offline.",
          "Check array-level operating state and close permissive.",
          "Review active array and string notifications.",
          "Verify PCS/EMS command state for the affected array.",
          "If unplanned, investigate common interlocks before troubleshooting individual strings."
        ],
        confidence: "high",
        source: "contactor-engine"
      }));
    } else if (partialCount > 0) {
      findings.push(finding({
        id: `array-contactor-mismatch-rollup-A${arrayNumber}`,
        scope: "array",
        arrayNumber,
        category: "string_battery",
        subsystem: "contactor",
        remediationStrategyId: "contactor-feedback-mismatch",
        severity: "warning",
        title: "Array has contactor mismatch conditions",
        detectedCondition: `${partialCount} string(s) in Array ${arrayNumber} have mismatched contactor feedback.`,
        evidence: {
          arrayNumber,
          totalStrings: total,
          expectedClosedStringCount: expectedClosedStates.length,
          expectedClosedButOpenCount,
          openCount,
          partialCount,
          affectedStrings: arrayStates
            .filter((state) => state.actualState === "partial")
            .map((state) => state.stringKey)
        },
        likelyCauses: [
          "One or more string contactors failed to follow requested state.",
          "Feedback wiring issue on affected strings.",
          "Intermittent auxiliary contact feedback.",
          "Control-state transition in progress or not fully settled."
        ],
        recommendedActions: [
          "Review each affected string finding.",
          "Compare requested state against positive/negative contactor feedback.",
          "Check local notifications for affected strings.",
          "Prioritize strings with mismatch plus non-zero current, alarms, or failed transitions."
        ],
        confidence: "high",
        source: "contactor-engine"
      }));
    }
  }

  return findings.sort((a, b) => {
    const rank = { critical: 4, alarm: 3, warning: 2, info: 1 };
    return rank[b.severity] - rank[a.severity];
  });
}

export function summarizeCorrectiveActions(findings: CorrectiveActionFinding[]) {
  return {
    total: findings.length,
    critical: findings.filter((f) => f.severity === "critical").length,
    alarm: findings.filter((f) => f.severity === "alarm").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
    byScope: {
      site: findings.filter((f) => f.scope === "site").length,
      array: findings.filter((f) => f.scope === "array").length,
      string: findings.filter((f) => f.scope === "string").length,
      bpc: findings.filter((f) => f.scope === "bpc").length,
      pcs: findings.filter((f) => f.scope === "pcs").length,
      feather: findings.filter((f) => f.scope === "feather").length
    },
    byCategory: {
      string_battery: findings.filter((f) => f.category === "string_battery").length,
      environmental: findings.filter((f) => f.category === "environmental").length,
      controls_comms: findings.filter((f) => f.category === "controls_comms").length,
      pcs_array: findings.filter((f) => f.category === "pcs_array").length,
      site_system: findings.filter((f) => f.category === "site_system").length
    },
    bySubsystem: findings.reduce((acc: Record<string, number>, finding) => {
      const key = finding.subsystem || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    exportReady: true,
    generatedAt: new Date().toISOString()
  };
}

export type NormalizedHvacDeviceLike = {
  deviceIp?: string;
  arrayIndex?: number;
  stringIndex?: number;
  entityName?: string;
  entityKeyToken?: string;

  hvacCurrent1?: number | null;
  fanLowOn1?: boolean | null;
  fanHighOn1?: boolean | null;
  YCompressorOn1?: boolean | null;
  freezeDetected1?: boolean | null;

  hvacCurrent2?: number | null;
  fanLowOn2?: boolean | null;
  fanHighOn2?: boolean | null;
  YCompressorOn2?: boolean | null;
  freezeDetected2?: boolean | null;
};

const HVAC_RUNNING_AMP_THRESHOLD = 0.5;

function boolValue(value: any): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  if (value === null || value === undefined || value === "") return null;

  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(text)) return true;
  if (["false", "0", "no", "off"].includes(text)) return false;

  return null;
}

function numberValue(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hvacCommandedOn(device: NormalizedHvacDeviceLike, index: 1 | 2): boolean | null {
  const fanLow = boolValue((device as any)[`fanLowOn${index}`]);
  const fanHigh = boolValue((device as any)[`fanHighOn${index}`]);
  const compressor = boolValue((device as any)[`YCompressorOn${index}`]);

  if (fanLow === null && fanHigh === null && compressor === null) return null;

  return fanLow === true || fanHigh === true || compressor === true;
}

function hvacRunning(device: NormalizedHvacDeviceLike, index: 1 | 2): boolean | null {
  const amps = numberValue((device as any)[`hvacCurrent${index}`]);
  if (amps === null) return null;
  return amps >= HVAC_RUNNING_AMP_THRESHOLD;
}

function hvacLabel(device: NormalizedHvacDeviceLike): string {
  if (device.entityName) return device.entityName;
  if (device.entityKeyToken) return device.entityKeyToken;
  if (device.arrayIndex && device.stringIndex) return `A${device.arrayIndex}-S${device.stringIndex}`;
  if (device.deviceIp) return device.deviceIp;
  return "Unknown Feather";
}

export function analyzeHvacDevices(
  devices: NormalizedHvacDeviceLike[]
): CorrectiveActionFinding[] {
  const findings: CorrectiveActionFinding[] = [];

  for (const device of devices) {
    const label = hvacLabel(device);
    const arrayNumber = numberValue(device.arrayIndex) ?? undefined;
    const stringNumber = numberValue(device.stringIndex) ?? undefined;

    const hvac1Commanded = hvacCommandedOn(device, 1);
    const hvac2Commanded = hvacCommandedOn(device, 2);

    const hvac1Running = hvacRunning(device, 1);
    const hvac2Running = hvacRunning(device, 2);

    const hvac1Amps = numberValue(device.hvacCurrent1);
    const hvac2Amps = numberValue(device.hvacCurrent2);

    const freeze1 = boolValue(device.freezeDetected1);
    const freeze2 = boolValue(device.freezeDetected2);

    const base = {
      scope: "string" as const,
      arrayNumber,
      stringNumber,
      stringKey: label,
      source: "string-list-engine" as const
    };

    const evidence = {
      deviceIp: device.deviceIp,
      entityName: device.entityName,
      entityKeyToken: device.entityKeyToken,
      hvacRunningAmpThreshold: HVAC_RUNNING_AMP_THRESHOLD,
      hvac1: {
        commandedOn: hvac1Commanded,
        running: hvac1Running,
        amps: hvac1Amps,
        fanLowOn: device.fanLowOn1,
        fanHighOn: device.fanHighOn1,
        compressorOn: device.YCompressorOn1,
        freezeDetected: device.freezeDetected1
      },
      hvac2: {
        commandedOn: hvac2Commanded,
        running: hvac2Running,
        amps: hvac2Amps,
        fanLowOn: device.fanLowOn2,
        fanHighOn: device.fanHighOn2,
        compressorOn: device.YCompressorOn2,
        freezeDetected: device.freezeDetected2
      }
    };

    // HVAC 1 commanded but no current.
    if (hvac1Commanded === true && hvac1Running === false) {
      findings.push(finding({
        ...base,
        id: `hvac1-commanded-no-current-${label}`,
        category: "environmental",
        subsystem: "hvac",
        remediationStrategyId: "hvac-commanded-no-current",
        severity: "warning",
        title: "HVAC 1 commanded on but no current detected",
        detectedCondition: "HVAC 1 has an active fan/compressor command, but measured current is below the running threshold.",
        evidence,
        likelyCauses: [
          "HVAC 1 failed to start.",
          "HVAC 1 command output is not reaching the unit.",
          "HVAC 1 breaker, fuse, relay, or contactor issue.",
          "HVAC 1 current sensor is not reading correctly.",
          "Feather/Moxa output mapping is incorrect."
        ],
        recommendedActions: [
          "Confirm HVAC 1 command state at the Feather/local controls.",
          "Verify HVAC 1 measured current directly.",
          "Check HVAC 1 power, breaker/fuse, relay/contactor, and control wiring.",
          "Compare the command output mapping against the HVAC 1 physical circuit.",
          "Check for related HVAC or environmental faults."
        ],
        confidence: "high"
      }));
    }

    // HVAC 2 commanded but no current.
    if (hvac2Commanded === true && hvac2Running === false) {
      findings.push(finding({
        ...base,
        id: `hvac2-commanded-no-current-${label}`,
        category: "environmental",
        subsystem: "hvac",
        remediationStrategyId: "hvac-commanded-no-current",
        severity: "warning",
        title: "HVAC 2 commanded on but no current detected",
        detectedCondition: "HVAC 2 has an active fan/compressor command, but measured current is below the running threshold.",
        evidence,
        likelyCauses: [
          "HVAC 2 failed to start.",
          "HVAC 2 command output is not reaching the unit.",
          "HVAC 2 breaker, fuse, relay, or contactor issue.",
          "HVAC 2 current sensor is not reading correctly.",
          "Feather/Moxa output mapping is incorrect."
        ],
        recommendedActions: [
          "Confirm HVAC 2 command state at the Feather/local controls.",
          "Verify HVAC 2 measured current directly.",
          "Check HVAC 2 power, breaker/fuse, relay/contactor, and control wiring.",
          "Compare the command output mapping against the HVAC 2 physical circuit.",
          "Check for related HVAC or environmental faults."
        ],
        confidence: "high"
      }));
    }

    // HVAC current without command.
    if (hvac1Commanded === false && hvac1Running === true) {
      findings.push(finding({
        ...base,
        id: `hvac1-current-without-command-${label}`,
        category: "environmental",
        subsystem: "hvac",
        remediationStrategyId: "hvac-current-without-command",
        severity: "alarm",
        title: "HVAC 1 current detected without command",
        detectedCondition: "HVAC 1 is drawing current while no HVAC 1 fan/compressor command is active.",
        evidence,
        likelyCauses: [
          "HVAC 1 relay/contactor stuck on.",
          "Manual override or bypass active.",
          "Command mapping is incorrect.",
          "Current sensor is mapped to the wrong HVAC.",
          "Control state is stale or not synchronized."
        ],
        recommendedActions: [
          "Verify HVAC 1 command state and physical operation.",
          "Check for manual override or bypass.",
          "Inspect HVAC 1 relay/contactor state.",
          "Validate current sensor mapping.",
          "Compare HVAC 1 and HVAC 2 command/current relationship."
        ],
        confidence: "high"
      }));
    }

    if (hvac2Commanded === false && hvac2Running === true) {
      findings.push(finding({
        ...base,
        id: `hvac2-current-without-command-${label}`,
        category: "environmental",
        subsystem: "hvac",
        remediationStrategyId: "hvac-current-without-command",
        severity: "alarm",
        title: "HVAC 2 current detected without command",
        detectedCondition: "HVAC 2 is drawing current while no HVAC 2 fan/compressor command is active.",
        evidence,
        likelyCauses: [
          "HVAC 2 relay/contactor stuck on.",
          "Manual override or bypass active.",
          "Command mapping is incorrect.",
          "Current sensor is mapped to the wrong HVAC.",
          "Control state is stale or not synchronized."
        ],
        recommendedActions: [
          "Verify HVAC 2 command state and physical operation.",
          "Check for manual override or bypass.",
          "Inspect HVAC 2 relay/contactor state.",
          "Validate current sensor mapping.",
          "Compare HVAC 1 and HVAC 2 command/current relationship."
        ],
        confidence: "high"
      }));
    }

    // Cross-match / likely swapped mapping.
    if (
      hvac1Commanded === true &&
      hvac1Running === false &&
      hvac2Commanded === false &&
      hvac2Running === true
    ) {
      findings.push(finding({
        ...base,
        id: `hvac1-command-hvac2-current-crossmatch-${label}`,
        category: "environmental",
        subsystem: "hvac",
        remediationStrategyId: "hvac-command-current-crossmatch",
        severity: "alarm",
        title: "HVAC 1 command appears to match HVAC 2 current",
        detectedCondition: "HVAC 1 is commanded on with no HVAC 1 current, while HVAC 2 is not commanded and has current.",
        evidence,
        likelyCauses: [
          "HVAC 1 and HVAC 2 command outputs may be swapped.",
          "HVAC 1 and HVAC 2 current sensors may be swapped.",
          "Feather netmap/header mapping may be incorrect.",
          "Physical wiring may be landed on the opposite HVAC circuit."
        ],
        recommendedActions: [
          "Compare HVAC 1 command output against the physical HVAC that starts.",
          "Compare HVAC 2 current sensor wiring against the physical HVAC circuit.",
          "Validate Feather/Moxa output mapping and current input mapping.",
          "Correct mapping only after physical circuit verification."
        ],
        confidence: "high"
      }));
    }

    if (
      hvac2Commanded === true &&
      hvac2Running === false &&
      hvac1Commanded === false &&
      hvac1Running === true
    ) {
      findings.push(finding({
        ...base,
        id: `hvac2-command-hvac1-current-crossmatch-${label}`,
        category: "environmental",
        subsystem: "hvac",
        remediationStrategyId: "hvac-command-current-crossmatch",
        severity: "alarm",
        title: "HVAC 2 command appears to match HVAC 1 current",
        detectedCondition: "HVAC 2 is commanded on with no HVAC 2 current, while HVAC 1 is not commanded and has current.",
        evidence,
        likelyCauses: [
          "HVAC 2 and HVAC 1 command outputs may be swapped.",
          "HVAC 2 and HVAC 1 current sensors may be swapped.",
          "Feather netmap/header mapping may be incorrect.",
          "Physical wiring may be landed on the opposite HVAC circuit."
        ],
        recommendedActions: [
          "Compare HVAC 2 command output against the physical HVAC that starts.",
          "Compare HVAC 1 current sensor wiring against the physical HVAC circuit.",
          "Validate Feather/Moxa output mapping and current input mapping.",
          "Correct mapping only after physical circuit verification."
        ],
        confidence: "high"
      }));
    }

    if ((freeze1 === true) || (freeze2 === true)) {
      findings.push(finding({
        ...base,
        id: `hvac-freeze-detected-${label}`,
        category: "environmental",
        subsystem: "hvac",
        remediationStrategyId: "hvac-freeze-detected",
        severity: "warning",
        title: "HVAC freeze protection detected",
        detectedCondition: "One or more HVAC units report freeze detection.",
        evidence,
        likelyCauses: [
          "Low evaporator temperature or restricted airflow.",
          "Dirty filter or blocked coil.",
          "Low ambient condition or cooling control issue.",
          "HVAC sensor or freeze detection circuit issue."
        ],
        recommendedActions: [
          "Inspect HVAC airflow path, filter, and coil condition.",
          "Check supply air temperature and space temperature.",
          "Review HVAC run command and compressor state.",
          "Check for repeated freeze detections in history."
        ],
        confidence: "medium"
      }));
    }
  }

  return findings.sort((a, b) => {
    const rank = { critical: 4, alarm: 3, warning: 2, info: 1 };
    return rank[b.severity] - rank[a.severity];
  });
}
