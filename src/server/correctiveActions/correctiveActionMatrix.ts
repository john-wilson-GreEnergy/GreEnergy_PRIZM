import { CorrectiveActionMatrixEntry } from "./correctiveActionMatrixTypes";

export const MATRIX_METADATA = {
  matrixVersion: "stack750-v1",
  source: "Stack750 Troubleshooting Cheat Sheet V2",
  lastUpdated: "2024-07-16"
};

export const STACK750_FAULT_MATRIX: CorrectiveActionMatrixEntry[] = [
  // --- STRING LEVEL ---
  {
    id: "sc-disconnected",
    platform: "stack-750-800",
    system: "string",
    component: "String Controller",
    issueName: "String Controller Disconnected",
    matchTerms: ["string controller disconnected", "sc disconnect", "sc offline", "controller offline", "string controller offline"],
    severityHint: "alarm",
    recommendedActions: [
      "Check AC power switch.",
      "Check ethernet connection from SC to TEAM switch.",
      "Check ethernet connection from TEAM switch to ES switch.",
      "Perform PTC (Power-to-Control / Power cycle).",
      "Replace SC only after power and network checks fail."
    ],
    validationChecks: [
      "Verify SC indicator lights are active.",
      "Ping SC IP from TEAM switch.",
      "Verify TEAM switch port link light is solid green."
    ],
    clearingCriteria: ["SC establishes active communications with EMS and ping returns successful."],
    replacementGuidance: ["If replacing SC, follow Powin standard SC commissioning procedure."],
    escalationGuidance: ["If communications cannot be restored, escalate to Network and Comms Support."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "bpc-disconnect-all",
    platform: "stack-750-800",
    system: "bpc",
    component: "BPC",
    issueName: "BPC Disconnect - All BPC",
    matchTerms: ["bpc disconnect (all bpc)", "bpc disconnect all", "all bpc disconnected", "all bpcs offline"],
    severityHint: "alarm",
    recommendedActions: [
      "Check AC power switch.",
      "Check SC CAN cable integrity and connection.",
      "Check BPC 1 connections (12V/24V harness, comms cable).",
      "Perform PTC (Power cycle).",
      "Replace BPC only if individual units fail to power on."
    ],
    validationChecks: [
      "Verify SC and BPC 1 CAN interface LEDs.",
      "Check balancing power supply outputs."
    ],
    clearingCriteria: ["All BPCs register online on String Controller view."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "bpc-disconnect-partial",
    platform: "stack-750-800",
    system: "bpc",
    component: "BPC",
    issueName: "BPC Disconnect - Not All BPC",
    matchTerms: ["bpc disconnect (not all bpc)", "bpc disconnect partial", "bpc offline", "bpc disconnect"],
    faultCodes: [1024],
    warningCodes: [2024],
    infoCodes: [3024],
    severityHint: "warning",
    recommendedActions: [
      "Check first affected BPC connections (12V/24V harness, comms cable).",
      "Perform PTC (Power cycle) on the string/BPC.",
      "Replace affected BPC if diagnostics indicate internal card failure."
    ],
    validationChecks: [
      "Confirm power harness pins on the first disconnected BPC are securely locked."
    ],
    clearingCriteria: ["BPC status changes to active and data streams resume."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "cgc-disconnect",
    platform: "stack-750-800",
    system: "cell-group",
    component: "Cell Group",
    issueName: "CGC Disconnect",
    matchTerms: ["cgc disconnect", "cgc disconnected", "cgc offline"],
    faultCodes: [1023],
    warningCodes: [2023],
    infoCodes: [3023],
    severityHint: "warning",
    recommendedActions: [
      "Check balancing harness is well-seated.",
      "Check temperature harness is well-seated.",
      "Check harness sockets on BPC and module.",
      "Check harness fastener on the cell.",
      "Replace BPC only after physical harness inspection fails."
    ],
    validationChecks: [
      "Measure continuity across BPC harness connections.",
      "Verify connector pins are not pushed out."
    ],
    clearingCriteria: ["CGC status returns to OK on BPC telemetry."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "abnormal-cell-voltage",
    platform: "stack-750-800",
    system: "cell-group",
    component: "Cell Group",
    issueName: "Abnormal Cell Voltage",
    matchTerms: ["abnormal cell voltage", "cell group high voltage", "cell group low voltage", "cell voltage fault", "cell voltage warning"],
    faultCodes: [1001, 1004, 8001, 8004],
    warningCodes: [2001, 2004, 9001, 9004],
    infoCodes: [3001, 3004],
    severityHint: "alarm",
    recommendedActions: [
      "Verify harness voltage matches the String Viewer voltage readings.",
      "Check balancing harness is well-seated.",
      "Check harness sockets for corrosion or physical damage.",
      "Check harness fastener on the cell.",
      "Replace BPC only after harness and cell voltage confirmation checks fail."
    ],
    validationChecks: [
      "Use high-accuracy multimeter to measure physical cell voltage directly at terminal.",
      "Compare with BPC reports."
    ],
    clearingCriteria: ["All cell group voltages return to normal operating boundaries."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "abnormal-cell-temp",
    platform: "stack-750-800",
    system: "cell-group",
    component: "Cell Group",
    issueName: "Abnormal Cell Temperature",
    matchTerms: ["abnormal cell temperature", "cell group high temperature", "cell group low temperature", "cell temp delta alarm", "cell temp delta warning"],
    faultCodes: [1010, 1014, 1018, 1057, 8010, 8014, 8042, 8043, 8044, 8045],
    warningCodes: [2010, 2014, 2018, 2057, 9010, 9014, 9042, 9043, 9044, 9045],
    infoCodes: [3010, 3014, 3018, 3057],
    severityHint: "warning",
    recommendedActions: [
      "Check temperature harness is well-seated.",
      "Check harness sockets.",
      "Check harness fastener on the cell.",
      "Replace BPC only if sensor/card diagnostics indicate failure."
    ],
    validationChecks: [
      "Verify cell temperatures are realistic (no wild spikes like 150C or -40C).",
      "Check thermistor harness resistance."
    ],
    clearingCriteria: ["All temperature channels report within normal limits (e.g., 15C to 45C)."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "string-measured-voltage-zero",
    platform: "stack-750-800",
    system: "string",
    component: "String Controller",
    issueName: "String Measured Voltage 0",
    matchTerms: ["string measured voltage 0", "string measured voltage zero", "measured voltage 0v"],
    severityHint: "critical",
    recommendedActions: [
      "Check that MSDs (Manual Service Disconnects) are fully closed.",
      "Check DC Amphenol connector seating.",
      "Inspect vertical and horizontal BUS bars for damage or isolation.",
      "Check DC fuses.",
      "Replace SC if internal voltage sense circuitry is blown."
    ],
    validationChecks: [
      "Verify string isolation resistance before closing contactors.",
      "Confirm fuse continuity with a digital multimeter."
    ],
    clearingCriteria: ["Measured voltage reports non-zero value matches bus expectation."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "string-calculated-voltage-zero",
    platform: "stack-750-800",
    system: "string",
    component: "String Controller",
    issueName: "String Calculated Voltage 0",
    matchTerms: ["string calculated voltage 0", "string calculated voltage zero", "calculated voltage 0v"],
    severityHint: "alarm",
    recommendedActions: [
      "Check CAN cable between SC and BPC 1.",
      "Check End-of-Line Resistor in BPC 14.",
      "Perform PTC (Power Cycle)."
    ],
    validationChecks: [
      "Measure CAN high to CAN low resistance (should be ~60 ohms when terminated).",
      "Check if any BPCs are reporting voltage at all."
    ],
    clearingCriteria: ["Calculated voltage shows cumulative BPC voltage sum."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "string-voltage-mismatch",
    platform: "stack-750-800",
    system: "string",
    component: "String Controller",
    issueName: "String Voltage Mismatch",
    matchTerms: ["string voltage mismatch", "voltage mismatch alarm", "voltage mismatch warning", "measured calculated voltage mismatch"],
    faultCodes: [1022],
    warningCodes: [2022],
    infoCodes: [3022],
    severityHint: "alarm",
    recommendedActions: [
      "Check DC Amphenol connectors.",
      "Check MSD seating.",
      "Inspect vertical and horizontal BUS bars.",
      "Check CAN cable between SC and BPC 1.",
      "Check End-of-Line resistor on BPC.",
      "Check CAN cable between BPCs.",
      "Check DC fuses.",
      "Check SC voltage sensors.",
      "Check all BPCs are communicating.",
      "Confirm SC VT calibration settings."
    ],
    validationChecks: [
      "Compare calculated string voltage (BPC sum) with measured string voltage directly.",
      "Recalibrate SC VT if divergence is small but constant."
    ],
    clearingCriteria: ["Measured and calculated voltages align within specified tolerance (e.g. 5V)."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "string-not-balancing",
    platform: "stack-750-800",
    system: "balancing",
    component: "String Controller",
    issueName: "String Not Balancing",
    matchTerms: ["string not balancing", "string balancing disabled", "string fail balancing"],
    severityHint: "warning",
    recommendedActions: [
      "Check balancing breaker in AC panel is ON.",
      "Check balancing switch on SC is ON.",
      "Confirm balancing power is actively delivered to BPCs."
    ],
    validationChecks: [
      "Measure AC voltage on balancing breaker output.",
      "Verify balancing control state in EMS configuration."
    ],
    clearingCriteria: ["String balancing status changes to 'Active'."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "bpc-not-balancing",
    platform: "stack-750-800",
    system: "balancing",
    component: "BPC",
    issueName: "BPC Not Balancing",
    matchTerms: ["bpc not balancing", "bpc balancing warning", "bpc balancing fault", "balancer warning", "balancer warning code"],
    faultCodes: [1073, 1074],
    warningCodes: [2073, 2074],
    severityHint: "warning",
    recommendedActions: [
      "Confirm balancing power is present (24V circuit).",
      "Check for loose bottom AC cable on the BPC.",
      "Replace BPC only if AC connections and power are verified correct."
    ],
    validationChecks: [
      "Confirm 24V DC auxiliary power supply status.",
      "Check plug connection at the bottom of the BPC enclosure."
    ],
    clearingCriteria: ["BPC resumes balancing when cell imbalance is present."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "module-not-balancing",
    platform: "stack-750-800",
    system: "balancing",
    component: "Cell Group",
    issueName: "Module / Cell Not Balancing",
    matchTerms: ["module not balancing", "cell not balancing", "cell group balancer warning", "module balancing fault"],
    severityHint: "warning",
    recommendedActions: [
      "Check balancing harness is well-seated.",
      "Check harness sockets for pins that are bent or pushed out.",
      "Check harness fastener on the cells.",
      "Replace balancing harness if physical damage is found.",
      "Check BPC harness ports.",
      "Replace BPC only after harness checks fail."
    ],
    validationChecks: [
      "Measure cell connector terminal voltages.",
      "Verify cell group telemetry updating."
    ],
    clearingCriteria: ["Affected module or cell groups begin balancing correctly."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "bpc-high-temp",
    platform: "stack-750-800",
    system: "bpc",
    component: "BPC",
    issueName: "BPC High Temperature",
    matchTerms: ["bpc high temperature", "bpc high temp", "bpc overtemp"],
    severityHint: "alarm",
    recommendedActions: [
      "Reset BPC.",
      "Power cycle BPC.",
      "Replace BPC if thermal error persists after a power cycle and cooling period."
    ],
    validationChecks: [
      "Inspect BPC cooling heatsink for debris or blockage.",
      "Check localized air flow from the enclosure fan."
    ],
    clearingCriteria: ["BPC internal temperature reports within bounds (< 65C)."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "string-bus-voltage-zero",
    platform: "stack-750-800",
    system: "string",
    component: "String Controller",
    issueName: "String Bus Voltage 0",
    matchTerms: ["string bus voltage 0", "string bus voltage zero", "bus voltage 0v"],
    severityHint: "critical",
    recommendedActions: [
      "Check DC Amphenol connector seating.",
      "Check ES MSDs are closed.",
      "Check DC fuses.",
      "Check SC voltage sensors.",
      "Replace SC if diagnostics indicate voltage measurement board fault."
    ],
    validationChecks: [
      "Physically measure bus bar voltage with an isolated probe.",
      "Confirm fuse resistances."
    ],
    clearingCriteria: ["Bus voltage reports live DC bus voltage of the array."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "string-contactor-mismatch",
    platform: "stack-750-800",
    system: "contactor",
    component: "Contactor",
    issueName: "String Contactor Status Mismatch",
    matchTerms: ["string contactor status mismatch", "contactor mismatch", "contactor status mismatch"],
    severityHint: "alarm",
    recommendedActions: [
      "Open and close contactors again through manual controls.",
      "Power cycle the SC.",
      "Check continuity for both contactors as they close and open.",
      "Replace contactors if stuck closed/open.",
      "Replace SC if feedback circuit is faulty."
    ],
    validationChecks: [
      "Verify auxiliary contact feedback loop continuity.",
      "Confirm contactor drive voltage (usually 24V) is active during commanded transitions."
    ],
    clearingCriteria: ["Contactor command aligns perfectly with physical and auxiliary feedback status."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "string-contactors-wont-close",
    platform: "stack-750-800",
    system: "contactor",
    component: "Contactor",
    issueName: "String Contactors Won't Close",
    matchTerms: ["string contactors won't close", "contactors won't close", "string contactor wont close", "contactor close warning"],
    faultCodes: [2534],
    warningCodes: [2534],
    severityHint: "alarm",
    recommendedActions: [
      "Check contactor switch position.",
      "Check SC E-stop circuit chain continuity.",
      "Replace SC if control outputs are defective."
    ],
    validationChecks: [
      "Verify E-stop button is released and circuit loop is closed.",
      "Check coil resistance on contactor."
    ],
    clearingCriteria: ["Contactors transition to closed status upon remote/local command."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },
  {
    id: "molex-connector-abnormal-voltage",
    platform: "stack-750-800",
    system: "string",
    component: "BPC",
    issueName: "Molex Connector Abnormal Voltage",
    matchTerms: ["molex connector abnormal voltage", "molex connector voltage", "molex abnormal voltage"],
    severityHint: "alarm",
    recommendedActions: [
      "Check harness sockets for push-out or corroded pins.",
      "Check harness fastener on the cell terminal.",
      "Replace BPC."
    ],
    validationChecks: [
      "Probe Molex connector voltages to check for broken wiring inside insulation."
    ],
    clearingCriteria: ["Voltages across Molex connector align with individual cell groups."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - String Issues",
      sourceSection: "String Issues"
    }
  },

  // --- TEAM BOX / HVAC ISSUES ---
  {
    id: "hvac-1-not-cooling",
    platform: "generic",
    system: "hvac",
    component: "HVAC",
    issueName: "HVAC 1 not Cooling",
    matchTerms: ["hvac 1 not cooling", "hvac 1 cooling fault", "hvac 1 failure"],
    severityHint: "warning",
    recommendedActions: [
      "Check Breaker QA26 in CS Auxiliary Breaker Panel.",
      "Check Breaker QA1 & QA2 in Segment Breaker Box.",
      "Measure for Voltage Discrepancy to Breaker Box 208V Grid Power circuit."
    ],
    validationChecks: [
      "Verify HVAC 1 controller is powered.",
      "Measure supply/return temperature difference."
    ],
    clearingCriteria: ["HVAC 1 compressor engages and cold air delivery is detected."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - Team Box Issues",
      sourceSection: "Team Box Issues"
    }
  },
  {
    id: "hvac-2-not-cooling",
    platform: "generic",
    system: "hvac",
    component: "HVAC",
    issueName: "HVAC 2 not Cooling",
    matchTerms: ["hvac 2 not cooling", "hvac 2 cooling fault", "hvac 2 failure"],
    severityHint: "warning",
    recommendedActions: [
      "Check Breaker QA23 in CS Auxiliary Breaker Panel.",
      "Check Breaker QA14 & QA6 in Segment Breaker Box.",
      "Measure for Voltage Discrepancy to Breaker Box 208V Grid Power circuit."
    ],
    validationChecks: [
      "Verify HVAC 2 controller is powered.",
      "Measure supply/return temperature difference."
    ],
    clearingCriteria: ["HVAC 2 compressor engages and cold air delivery is detected."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - Team Box Issues",
      sourceSection: "Team Box Issues"
    }
  },
  {
    id: "both-hvacs-not-cooling",
    platform: "generic",
    system: "hvac",
    component: "HVAC",
    issueName: "Both HVACs not Cooling",
    matchTerms: ["both hvacs not cooling", "both hvac not cooling", "total hvac failure", "enclosure high temperature"],
    severityHint: "critical",
    recommendedActions: [
      "Check Breakers QA23 & QA26 in CS Auxiliary Breaker Panel.",
      "Measure for Voltage Discrepancy to Breaker Box 208V Grid Power circuit."
    ],
    validationChecks: [
      "Check primary distribution panel voltage.",
      "Check for high temperature interlock tripping."
    ],
    clearingCriteria: ["At least one HVAC returns to cooling state; container temperature stabilizes."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - Team Box Issues",
      sourceSection: "Team Box Issues"
    }
  },

  // --- FIRE ALARM / DETECTED ISSUES ---
  {
    id: "fire-alarm",
    platform: "generic",
    system: "fire",
    component: "Fire Panel",
    issueName: "Fire Alarm",
    matchTerms: ["fire alarm", "building fire alarm", "smoke alarm", "detected smoke", "fire alarm activated"],
    faultCodes: [1532, 1533],
    severityHint: "critical",
    recommendedActions: [
      "Confirm fire panel is powered and functional.",
      "Check for which zone is alarming. If Zone 4: Replace heat detector in CS.",
      "Directly confront and inspect panel alarm on physical display.",
      "Clear alarm manually only after source condition is resolved."
    ],
    validationChecks: [
      "Visually inspect container for smoke, fire, or thermal event.",
      "Inspect aerosol canisters/discharges if relevant."
    ],
    clearingCriteria: ["Fire panel registers zero active alarms; manual reset clears latch."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - Team Box Issues",
      sourceSection: "Team Box Issues"
    }
  },
  {
    id: "fire-trouble",
    platform: "generic",
    system: "fire",
    component: "Fire Panel",
    issueName: "Fire Trouble",
    matchTerms: ["fire trouble", "fire panel trouble", "fire system trouble"],
    severityHint: "warning",
    recommendedActions: [
      "Confirm Fire Panel is powered on.",
      "Confirm Fire Panel battery connection is secure and charged.",
      "Check sensor wiring on trouble circuit.",
      "Check wiring on supervised circuit."
    ],
    validationChecks: [
      "Check for open circuit or ground fault on supervised loops.",
      "Confirm backup battery terminal voltage is > 12.5V."
    ],
    clearingCriteria: ["Fire panel reports 'Normal' with no trouble conditions."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - Team Box Issues",
      sourceSection: "Team Box Issues"
    }
  },

  // --- UPS ISSUES ---
  {
    id: "ups-offline",
    platform: "generic",
    system: "ups",
    component: "UPS",
    issueName: "UPS Offline",
    matchTerms: ["ups offline", "ups offline alarm", "ups 1 offline", "ups 2 offline", "ups 3 offline", "ups 4 offline", "ups battery low"],
    severityHint: "warning",
    recommendedActions: [
      "Check UPS power input.",
      "Check UPS power output.",
      "Check UPS connection to CS switch or relevant device.",
      "Verify communications/network status.",
      "Replace UPS only after power and communications checks fail."
    ],
    validationChecks: [
      "Check breakers QA_UPS in AC panel.",
      "Confirm battery runtime remaining."
    ],
    clearingCriteria: ["UPS reports back online and active battery charging."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - Team Box Issues",
      sourceSection: "Team Box Issues"
    }
  },

  // --- PCS / METER / TRANSFORMER ---
  {
    id: "pcs-internal-error",
    platform: "generic",
    system: "pcs",
    component: "PCS",
    issueName: "Storage/PV PCS Internal Error Warning",
    matchTerms: ["storage pcs internal error", "pv pcs internal error", "pcs internal error", "pcs disconnect alarm", "pcs disconnect warning"],
    faultCodes: [1053, 1054, 1027],
    warningCodes: [2053, 2054, 2027],
    infoCodes: [3053, 3054, 3027],
    severityHint: "alarm",
    recommendedActions: [
      "Confirm communication path to PCS is solid.",
      "Inspect active alarm indicators on local PCS screen.",
      "Perform control board restart via local HMI if authorized.",
      "Clear alarm manually after verifying internal state."
    ],
    validationChecks: [
      "Check network cables to PCS communications card.",
      "Ping PCS modbus/IP address."
    ],
    clearingCriteria: ["PCS internal registers show no active fault status."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - Warnings, Alarms, & Info",
      sourceSection: "Warnings, Alarms, & Info"
    }
  },
  {
    id: "meter-internal-error",
    platform: "generic",
    system: "meter",
    component: "Meter",
    issueName: "Meter Internal Error Warning",
    matchTerms: ["meter internal error", "meter disconnect alarm", "meter disconnect warning"],
    faultCodes: [1055, 1028],
    warningCodes: [2055, 2028],
    infoCodes: [3055, 3028],
    severityHint: "warning",
    recommendedActions: [
      "Check EMS connection to meter.",
      "Confirm meter auxiliary power supply.",
      "Verify Modbus/TCP or RTU communication registers.",
      "Replace meter if communications board is fried."
    ],
    validationChecks: [
      "Verify physical display on the meter has power.",
      "Check terminal connections on current transformers (CT) and voltage taps."
    ],
    clearingCriteria: ["Meter establishes stable communication with EMS with zero error flags."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - Warnings, Alarms, & Info",
      sourceSection: "Warnings, Alarms, & Info"
    }
  },
  {
    id: "transformer-internal-error",
    platform: "generic",
    system: "transformer",
    component: "Transformer",
    issueName: "Transformer Internal Error Warning",
    matchTerms: ["transformer internal error", "transformer alarm", "transformer warning"],
    faultCodes: [1056],
    warningCodes: [2056],
    infoCodes: [3056],
    severityHint: "alarm",
    recommendedActions: [
      "Check oil level, oil temperature, and winding temperature gauges.",
      "Verify sudden pressure relay or pressure relief device status.",
      "Confirm alarm/trip wiring connections to TEAM box interface."
    ],
    validationChecks: [
      "Check relay contact signals at the terminal block.",
      "Visually inspect transformer radiator and tank for oil leaks."
    ],
    clearingCriteria: ["Transformer temperature/pressure returns to standard ranges and contacts reset."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - Warnings, Alarms, & Info",
      sourceSection: "Warnings, Alarms, & Info"
    }
  },

  // --- ENCLOSURE / DOOR ---
  {
    id: "enclosure-door-open",
    platform: "generic",
    system: "enclosure",
    component: "Door",
    issueName: "Container Door Open Warning",
    matchTerms: ["container door opened", "open door warning", "door sensors report", "door sensor tripped"],
    faultCodes: [2535],
    warningCodes: [2535],
    infoCodes: [3052],
    severityHint: "warning",
    recommendedActions: [
      "Check that door switches are adjusted to physically contact the door when closed.",
      "Check connections to the TEAM Box.",
      "Check Continuity Across Door Switch Circuit."
    ],
    validationChecks: [
      "Physically close all container doors and verify microswitch click.",
      "Measure switch terminal contact resistance (should be < 5 ohms when closed)."
    ],
    clearingCriteria: ["All door magnetic or plunger switches report closed status."],
    source: {
      label: "Stack 750 Troubleshooting Cheat Sheet - Team Box Issues",
      sourceSection: "Team Box Issues"
    }
  }
];
