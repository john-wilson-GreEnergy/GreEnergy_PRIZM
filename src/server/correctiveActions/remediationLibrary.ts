export type CorrectiveActionCategory =
  | "string_battery"
  | "environmental"
  | "controls_comms"
  | "pcs_array"
  | "site_system";

export type CorrectiveActionSubsystem =
  | "contactor"
  | "cell_group"
  | "balancing"
  | "bpc"
  | "hvac"
  | "hydrogen"
  | "smoke_fire"
  | "limit_switch"
  | "louver"
  | "estop"
  | "sensor"
  | "feather"
  | "moxa"
  | "modbus"
  | "pcs"
  | "array"
  | "site";

export type RemediationStrategy = {
  id: string;
  category: CorrectiveActionCategory;
  subsystem: CorrectiveActionSubsystem;
  title: string;
  overview: string;
  safetyLevel: "standard" | "electrical" | "high_voltage" | "critical_safety";
  likelyCauses: string[];
  technicianSteps: string[];
  escalationCriteria: string[];
  safetyNotes: string[];
};

export const remediationLibrary: Record<string, RemediationStrategy> = {
  "contactor-feedback-mismatch": {
    id: "contactor-feedback-mismatch",
    category: "string_battery",
    subsystem: "contactor",
    title: "Contactor feedback mismatch",
    overview:
      "Positive and negative contactor feedback do not agree. The string should be treated as abnormal until the actual electrical state is verified.",
    safetyLevel: "high_voltage",
    likelyCauses: [
      "One contactor failed to transition.",
      "Auxiliary contact feedback is stuck or wired incorrectly.",
      "Feedback input mapping is incorrect.",
      "Control command and feedback are temporarily out of sync.",
      "A safety interlock is preventing one side from following the requested state."
    ],
    technicianSteps: [
      "Confirm the requested contactor state in PRIZM and the local controller.",
      "Verify positive and negative contactor feedback directly from the source endpoint.",
      "Confirm string current is zero before assuming the string is isolated.",
      "Review active string/BMS/local notifications for the affected string.",
      "Inspect auxiliary feedback wiring, input mapping, and contactor state if safe and authorized.",
      "If mismatch persists, escalate for controls/electrical troubleshooting."
    ],
    escalationCriteria: [
      "Mismatch persists across multiple refresh cycles.",
      "String current is present while one contactor reports open.",
      "Open requested but one or both contactors remain closed.",
      "Multiple strings in the same array show similar mismatch behavior."
    ],
    safetyNotes: [
      "Do not assume a string is isolated when only one contactor indicates open.",
      "Follow site LOTO and arc-flash procedures before physical inspection."
    ]
  },

  "contactor-requested-closed-actual-open": {
    id: "contactor-requested-closed-actual-open",
    category: "string_battery",
    subsystem: "contactor",
    title: "String requested closed but contactors are open",
    overview:
      "The controls indicate the string should be closed, but both contactor feedback signals report open.",
    safetyLevel: "high_voltage",
    likelyCauses: [
      "Close command is not reaching the contactor circuit.",
      "BMS or string-level interlock is preventing close.",
      "Contactor coil power/control circuit issue.",
      "String fault is blocking close permissive.",
      "Feedback is reporting open incorrectly."
    ],
    technicianSteps: [
      "Check active string, BMS, and local controller faults.",
      "Verify close permissive and commanded state.",
      "Check contactor coil/control voltage when close is requested.",
      "Inspect relay, fuse, and control wiring if safe and authorized.",
      "Review recent transition history for failed close attempts."
    ],
    escalationCriteria: [
      "String is expected online but remains open.",
      "Multiple strings fail to close in the same array.",
      "Close permissive is present but contactors remain open."
    ],
    safetyNotes: [
      "Confirm voltage/current state before physical inspection.",
      "Follow site switching and LOTO procedures."
    ]
  },

  "contactor-requested-open-actual-closed": {
    id: "contactor-requested-open-actual-closed",
    category: "string_battery",
    subsystem: "contactor",
    title: "String requested open but contactors remain closed",
    overview:
      "The controls indicate the string should be open, but both contactor feedback signals report closed.",
    safetyLevel: "critical_safety",
    likelyCauses: [
      "Contactor failed to open.",
      "Open command is not reaching the contactor circuit.",
      "Contactor is mechanically stuck closed.",
      "Feedback circuit is incorrectly reporting closed.",
      "Control state is stale or command has not propagated."
    ],
    technicianSteps: [
      "Treat this as a high-priority abnormal state until verified.",
      "Confirm requested open state from the local controller.",
      "Verify string current and voltage before taking action.",
      "Check whether an open command is being issued.",
      "Escalate if the contactor remains closed while open is requested."
    ],
    escalationCriteria: [
      "Open requested but contactor remains closed after refresh/transition window.",
      "String current is present during requested open state.",
      "Multiple strings show requested-open/actual-closed behavior."
    ],
    safetyNotes: [
      "Do not assume the string is isolated.",
      "Follow LOTO and site switching procedures before physical inspection."
    ]
  },

  "array-wide-open-contactors": {
    id: "array-wide-open-contactors",
    category: "string_battery",
    subsystem: "array",
    title: "Array expected closed but contactors report open",
    overview:
      "One or more strings in an array are expected to be closed, but the contactor feedback reports open. This is only flagged when the requested state indicates the contactors should be closed.",
    safetyLevel: "electrical",
    likelyCauses: [
      "Close command or close permissive is not reaching the affected strings.",
      "Array-level interlock is preventing contactor close.",
      "BMS/string-level faults are blocking close permissive.",
      "Contactor control circuit, coil power, or feedback issue.",
      "Array-level controls or communications issue."
    ],
    technicianSteps: [
      "Confirm the array/string contactors are actually expected closed.",
      "Check array operating state and close permissive.",
      "Review active array and string notifications.",
      "Verify PCS/EMS command state for the affected array.",
      "Investigate common interlocks before troubleshooting individual strings."
    ],
    escalationCriteria: [
      "Array should be available but all strings remain open.",
      "Array-wide open condition appears unexpectedly.",
      "Related PCS or EMS command/state mismatch exists."
    ],
    safetyNotes: [
      "Validate array state before attempting close commands.",
      "Follow site switching procedure."
    ]
  },

  "hvac-commanded-no-current": {
    id: "hvac-commanded-no-current",
    category: "environmental",
    subsystem: "hvac",
    title: "HVAC commanded on but no current detected",
    overview:
      "The controller is commanding an HVAC unit to run, but measured current is below the configured running threshold.",
    safetyLevel: "electrical",
    likelyCauses: [
      "HVAC failed to start.",
      "Breaker, fuse, relay, or contactor issue.",
      "Command output is not reaching the HVAC unit.",
      "Current sensor is not reading correctly.",
      "Feather/Moxa output mapping is incorrect."
    ],
    technicianSteps: [
      "Confirm HVAC command state in PRIZM and local controller.",
      "Verify measured HVAC current directly.",
      "Check HVAC breaker, fuse, relay/contactor, and control wiring.",
      "Compare command output mapping against the physical HVAC circuit.",
      "Check for related HVAC or environmental faults."
    ],
    escalationCriteria: [
      "Command remains active with no current after local reset.",
      "Multiple HVAC units show commanded-on/no-current behavior.",
      "Command/current channels appear swapped."
    ],
    safetyNotes: [
      "Follow electrical safety procedures when inspecting HVAC power/control circuits."
    ]
  },

  "hvac-current-without-command": {
    id: "hvac-current-without-command",
    category: "environmental",
    subsystem: "hvac",
    title: "HVAC current detected without command",
    overview:
      "Measured HVAC current is present while no fan or compressor command is active for that HVAC.",
    safetyLevel: "electrical",
    likelyCauses: [
      "Relay or contactor stuck on.",
      "Manual override or bypass active.",
      "Command mapping is incorrect.",
      "Current sensor is mapped to the wrong HVAC.",
      "Control state is stale or not synchronized."
    ],
    technicianSteps: [
      "Verify command state and physical HVAC operation.",
      "Check for manual override or bypass.",
      "Inspect relay/contactor state.",
      "Validate current sensor mapping.",
      "Compare HVAC 1 and HVAC 2 command/current relationship."
    ],
    escalationCriteria: [
      "HVAC remains running with no command.",
      "Uncommanded current persists after controls reset.",
      "Current appears on the opposite HVAC from the command."
    ],
    safetyNotes: [
      "Follow electrical safety practices when inspecting HVAC circuits."
    ]
  },

  "hvac-command-current-crossmatch": {
    id: "hvac-command-current-crossmatch",
    category: "environmental",
    subsystem: "hvac",
    title: "HVAC command/current cross-match",
    overview:
      "One HVAC is commanded on with no current, while the opposite HVAC is not commanded and has current. This strongly suggests command wiring or current sensor mapping may be crossed.",
    safetyLevel: "electrical",
    likelyCauses: [
      "HVAC 1 and HVAC 2 command outputs are swapped.",
      "HVAC 1 and HVAC 2 current sensors are swapped.",
      "Feather netmap/header mapping is incorrect.",
      "Physical wiring is landed on the opposite HVAC circuit."
    ],
    technicianSteps: [
      "Command one HVAC at a time and observe which physical unit starts.",
      "Compare the measured current channel against the physical running unit.",
      "Validate Feather/Moxa output mapping and current input mapping.",
      "Correct mapping only after physical circuit verification.",
      "Document any wiring or netmap corrections."
    ],
    escalationCriteria: [
      "Cross-match condition is repeatable.",
      "Multiple segments show the same swapped pattern.",
      "Mapping correction is required in production controls."
    ],
    safetyNotes: [
      "Do not change software mapping until physical wiring has been verified."
    ]
  },

  "hvac-freeze-detected": {
    id: "hvac-freeze-detected",
    category: "environmental",
    subsystem: "hvac",
    title: "HVAC freeze protection detected",
    overview:
      "One or more HVAC units report freeze detection or freeze protection state.",
    safetyLevel: "standard",
    likelyCauses: [
      "Low evaporator temperature.",
      "Restricted airflow.",
      "Dirty filter or blocked coil.",
      "Low ambient cooling condition.",
      "Freeze sensor/circuit issue."
    ],
    technicianSteps: [
      "Inspect HVAC airflow path, filter, and coil condition.",
      "Check supply air and space temperature.",
      "Review fan/compressor command state.",
      "Check for repeated freeze detection history.",
      "Inspect freeze sensor if condition persists."
    ],
    escalationCriteria: [
      "Freeze detection repeats after reset.",
      "HVAC cannot maintain container temperature.",
      "Multiple HVAC units report freeze conditions."
    ],
    safetyNotes: [
      "Follow site procedure for HVAC inspection."
    ]
  }
};

export function getRemediationStrategy(id?: string | null): RemediationStrategy | null {
  if (!id) return null;
  return remediationLibrary[id] || null;
}

export function getCategoryLabel(category: CorrectiveActionCategory): string {
  switch (category) {
    case "string_battery": return "String / Battery";
    case "environmental": return "Environmental / Segment Devices";
    case "controls_comms": return "Controls / Communications";
    case "pcs_array": return "PCS / Array";
    case "site_system": return "Site Level";
    default: return category;
  }
}
