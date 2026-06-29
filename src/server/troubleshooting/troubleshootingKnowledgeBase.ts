export interface TroubleshootingEntry {
  id: string;
  sourceDocument: string;
  sourcePage: number | string;
  section: string;
  system:
    | "string"
    | "bpc"
    | "cell-group"
    | "balancing"
    | "hvac"
    | "fire"
    | "ups"
    | "pcs"
    | "meter"
    | "transformer"
    | "contactor"
    | "enclosure"
    | "network"
    | "feather"
    | "team-box"
    | "unknown";
  component:
    | "String Controller"
    | "BPC"
    | "Cell Group"
    | "HVAC"
    | "Fire Panel"
    | "UPS"
    | "PCS"
    | "Meter"
    | "Transformer"
    | "Contactor"
    | "Door"
    | "Sensor"
    | "Network"
    | "Feather"
    | "Unknown";
  issueName: string;
  aliases?: string[];
  faultCodes?: number[];
  warningCodes?: number[];
  infoCodes?: number[];
  warrantyCodes?: number[];
  summaryAction: string;
  recommendedActions: string[];
  validationChecks: string[];
  clearingCriteria: string[];
  detailView: "string" | "feather" | "pcs" | "site" | "network";
  managerSummary: string;
  technicianDetail: string;
  safetyNote?: string;
  fieldCorrections?: string;
}

export const TROUBLESHOOTING_KB: TroubleshootingEntry[] = [
  {
    id: "bpc-not-balancing",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 2,
    section: "String Issues",
    system: "balancing",
    component: "BPC",
    issueName: "BPC Not Balancing",
    aliases: [
      "CellGroup Charge Balancer Warning",
      "CellGroup Discharge Balancer Warning",
      "Balancer Warning"
    ],
    warningCodes: [2073, 2074],
    summaryAction: "Verify 24V DC control/balancing power and BPC balancing circuit before replacing the BPC.",
    recommendedActions: [
      "Confirm 24V DC control/balancing power is present at the affected BPC.",
      "Inspect the BPC DC control/balancing power connector and related harness seating.",
      "Inspect BPC balancing harness ports and affected cell-group balancing harness connections.",
      "Verify the affected BPC is communicating and reporting valid cell-group telemetry.",
      "Replace the BPC only after DC power, harness seating, and telemetry checks fail."
    ],
    validationChecks: [
      "Confirm 24V DC supply is present and stable under load.",
      "Verify BPC communication is active in String Details.",
      "Verify affected BPC and CG indexes match the active warning target.",
      "Confirm balancing status changes after corrective action or after a new balancing command."
    ],
    clearingCriteria: [
      "The balancing warning clears from EMS notifications.",
      "The affected BPC resumes expected balancing behavior.",
      "Cell-group balancing state and target voltage display correctly in String Details."
    ],
    detailView: "string",
    managerSummary: "Active balancing circuits on this cell-group's BPC are inactive. Check 24V DC control/balancing power prior to hardware replacement.",
    technicianDetail: "Measure 24V DC power inputs under load on the BPC diagnostic terminals. Verify connection tightness and inspect balancing trace wires.",
    fieldCorrections: "Do not describe this as AC power to the BPC. Treat this as 24V DC control/balancing power for PRIZM corrective-action language."
  },
  {
    id: "cgc-disconnect",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 3,
    section: "String Issues",
    system: "cell-group",
    component: "Cell Group",
    issueName: "CGC Disconnect",
    aliases: ["Cell Group Controller Offline", "CGC Offline"],
    faultCodes: [1023],
    warningCodes: [2023],
    infoCodes: [3023],
    summaryAction: "Inspect Cell Group Controller/BPC harness connection and seating.",
    recommendedActions: [
      "Check balancing harness is well-seated on the module and BPC ports.",
      "Check temperature harness is well-seated.",
      "Check harness sockets on BPC and module for physical damage or corrosion.",
      "Verify CGC power inputs and harness connector lock levers.",
      "Replace BPC only after physical harness inspection fails."
    ],
    validationChecks: [
      "Measure continuity across balancing harness pins.",
      "Verify connector pins are not pushed out or bent.",
      "Verify BPC telemetry registers correct values for other cell groups in the loop."
    ],
    clearingCriteria: [
      "CGC status returns to OK or communication active on BPC telemetry."
    ],
    detailView: "string",
    managerSummary: "Cell Group Controller Disconnect indicates a failure to read group monitoring telemetry. Potential physical harness disconnection.",
    technicianDetail: "Check module side Molex connectors and BPC side quick-connect levers. Ensure tight seating of diagnostic channels."
  },
  {
    id: "bpc-disconnect",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 1,
    section: "String Issues",
    system: "bpc",
    component: "BPC",
    issueName: "BPC Disconnect",
    aliases: ["BPC Disconnected", "BPC Offline", "BPC Disconnect - Not All BPC"],
    faultCodes: [1024],
    warningCodes: [2024],
    infoCodes: [3024],
    summaryAction: "Inspect BPC power harness and SC CAN communication loop.",
    recommendedActions: [
      "Check BPC power connector seating (12V/24V harness).",
      "Verify BPC communications cabling and RJ45 connection locks.",
      "Inspect first affected BPC in the daisy chain.",
      "Perform Power-to-Control (PTC) cycle on the BPC string.",
      "Replace BPC if diagnostic LEDs indicate internal processor lock."
    ],
    validationChecks: [
      "Confirm DC supply voltage at the BPC input terminals is 24V (+/- 1V).",
      "Inspect CAN communication line continuity."
    ],
    clearingCriteria: [
      "BPC reports online and streams telemetry to String Controller."
    ],
    detailView: "string",
    managerSummary: "BPC Disconnect warning indicates loss of diagnostic telemetry from one or more BPC units. Investigate communication chain loop and 24V control power.",
    technicianDetail: "Locate target BPC and check green power and communication status LEDs. Verify daisy chain input and output RJ45 terminals."
  },
  {
    id: "abnormal-cell-voltage",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 1,
    section: "String Issues",
    system: "cell-group",
    component: "Cell Group",
    issueName: "Abnormal Cell Voltage",
    aliases: [
      "Cell Group High Voltage",
      "Cell Group Low Voltage",
      "Cell Voltage Alarm",
      "Cell Voltage Warning",
      "Cell Overvoltage",
      "Cell Undervoltage"
    ],
    faultCodes: [1001, 1004, 8001, 8004],
    warningCodes: [2001, 2004, 9001, 9004],
    infoCodes: [3001, 3004],
    summaryAction: "Measure physical cell group voltage and check balancing harness pins.",
    recommendedActions: [
      "Verify harness voltage matches the String Viewer voltage readings.",
      "Check balancing harness is well-seated on the module and BPC ports.",
      "Check harness sockets for corrosion, terminal backing out, or physical damage.",
      "Use high-accuracy multimeter to measure physical cell voltage directly at terminal.",
      "Replace BPC only after physical cell voltage is confirmed normal and harness is fully verified."
    ],
    validationChecks: [
      "Compare physical cell terminal voltage with value reported in BPC telemetry.",
      "Verify that surrounding cell groups show stable voltage readings."
    ],
    clearingCriteria: [
      "All cell group voltages return within standard operating boundaries, and alarm registers are reset."
    ],
    detailView: "string",
    managerSummary: "Abnormal Cell Voltage indicates a cell group has exceeded safety or warning limits. Measure physical terminal voltage to isolate sensor faults.",
    technicianDetail: "Measure voltage at module diagnostic harness pins. If physical voltage is normal, replace BPC. If physical cell voltage is out of spec, inspect physical module state."
  },
  {
    id: "abnormal-cell-temp",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 2,
    section: "String Issues",
    system: "cell-group",
    component: "Cell Group",
    issueName: "Abnormal Cell Temperature",
    aliases: [
      "Cell Group High Temperature",
      "Cell Group Low Temperature",
      "Cell Temp Delta Alarm",
      "Cell Temp Delta Warning"
    ],
    faultCodes: [1010, 1014, 1018, 8010, 8014, 8042, 8043, 8044, 8045],
    warningCodes: [2010, 2014, 2018, 9010, 9014, 9042, 9043, 9044, 9045],
    infoCodes: [3010, 3014, 3018],
    summaryAction: "Verify thermistor harness seating and measure resistance values.",
    recommendedActions: [
      "Check temperature thermistor harness seating on both module and BPC ends.",
      "Verify temperature harness is free of pin-pin shorts and physical damage.",
      "Inspect BPC temperature sensor ports.",
      "If values read exactly -40C or 150C, replace the sensor harness or BPC (open/short circuit detection)."
    ],
    validationChecks: [
      "Measure resistance across thermistor pins (NTC standard curve).",
      "Confirm that surrounding cells do not show identical thermal spikes."
    ],
    clearingCriteria: [
      "All thermal readings return within valid operational boundaries (e.g., 15C to 45C)."
    ],
    detailView: "string",
    managerSummary: "Abnormal Cell Temperature alerts indicate a risk of cell thermal event, or a sensor network open/short fault.",
    technicianDetail: "Read telemetry temperature channels. An open circuit reads minimum scale (-40C); a short circuit reads full scale (150C). Use this to trace harness/connector integrity."
  },
  {
    id: "string-voltage-mismatch",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 3,
    section: "String Issues",
    system: "string",
    component: "String Controller",
    issueName: "String Voltage Mismatch",
    aliases: ["SC Voltage Discrepancy", "Contactor Voltage Mismatch"],
    faultCodes: [1022],
    warningCodes: [2022],
    infoCodes: [3022],
    summaryAction: "Compare physical string bus voltage with cumulative cell group sum.",
    recommendedActions: [
      "Verify that String Controller measured voltage matches cumulative sum of BPC cell group voltages.",
      "Check if any individual cell groups are disconnected or reporting stale/invalid telemetry.",
      "Inspect string contactors and check for voltage drops across them.",
      "Verify voltage sense fuse on the String Controller is intact."
    ],
    validationChecks: [
      "Measure physical string terminal voltage and compare to EMS reported voltage.",
      "Verify voltage sense wire integrity and connector seating."
    ],
    clearingCriteria: [
      "Voltage mismatch falls below 5V threshold between SC and cumulative cell-group registers."
    ],
    detailView: "string",
    managerSummary: "String Voltage Mismatch indicates a discrepancy between cumulative internal cell voltages and measured string terminal voltage.",
    technicianDetail: "Inspect physical contactor line/load voltage levels and check for main fuse resistance or voltage sense trace faults on the SC board."
  },
  {
    id: "string-measured-voltage-zero",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 2,
    section: "String Issues",
    system: "string",
    component: "String Controller",
    issueName: "String Measured Voltage 0",
    aliases: ["String Measured Voltage Zero", "Measured Voltage 0V"],
    summaryAction: "Check that MSDs are fully closed, verify Amphenol connector seating, and check fuses.",
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
    clearingCriteria: [
      "Measured voltage reports non-zero value matching bus expectation."
    ],
    detailView: "string",
    managerSummary: "Measured string voltage is reading 0V, suggesting open circuits, blown fuses, or open MSDs.",
    technicianDetail: "Isolate string, measure voltage across main positive and negative terminals using CAT III multimeter. Ensure MSDs are locked into place."
  },
  {
    id: "string-calculated-voltage-zero",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 2,
    section: "String Issues",
    system: "string",
    component: "String Controller",
    issueName: "String Calculated Voltage 0",
    aliases: ["String Calculated Voltage Zero", "Calculated Voltage 0V"],
    summaryAction: "Check BPC telemetry flow and communication daisy chains.",
    recommendedActions: [
      "Check that BPC communications loop is fully active.",
      "Verify SC CAN interface is reporting properly.",
      "Check BPC 24V control power supply status.",
      "Inspect SC to BPC RJ45 master communications cable."
    ],
    validationChecks: [
      "Ping SC from terminal and verify standard Modbus registers are accessible.",
      "Verify all cell group voltage data points in raw registers are greater than zero."
    ],
    clearingCriteria: [
      "Calculated voltage returns to expected physical string voltage (typically > 600V)."
    ],
    detailView: "string",
    managerSummary: "Calculated voltage is 0V, which implies that the SC is not receiving any cell voltage telemetry from the BPC loop.",
    technicianDetail: "Reboot SC or toggle string 24V control power. Inspect CAN terminator resistors on the last BPC of the daisy chain."
  },
  {
    id: "string-bus-voltage-zero",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 2,
    section: "String Issues",
    system: "string",
    component: "String Controller",
    issueName: "String Bus Voltage 0",
    aliases: ["String Bus Voltage Zero", "Bus Voltage 0V"],
    summaryAction: "Verify DC distribution bus fuses and DC contactor state.",
    recommendedActions: [
      "Confirm that main lineup DC bus switches and fuses are intact.",
      "Verify PCS DC side contactor state.",
      "Check for isolation ground faults which prevent contactors from closing."
    ],
    validationChecks: [
      "Measure physical voltage across main lineup DC bus.",
      "Verify PCS DC bus feedback registers."
    ],
    clearingCriteria: [
      "Main DC bus registers stable nominal bus voltage matching the active strings."
    ],
    detailView: "string",
    managerSummary: "DC Bus Voltage is reading 0V. Possible lineup-level open switch, main fuse failure, or major grounding fault.",
    technicianDetail: "Examine load-side voltage of contactors. Trace the voltage back to the main DC collector panel."
  },
  {
    id: "string-contactor-mismatch",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 3,
    section: "String Issues",
    system: "contactor",
    component: "Contactor",
    issueName: "String Contactor Status Mismatch",
    aliases: ["Contactor Status Mismatch", "Contactor Feedback Error"],
    summaryAction: "Check contactor auxiliary feedback switches and wiring terminal seating.",
    recommendedActions: [
      "Check auxiliary contacts feedback wiring seating.",
      "Inspect contactor control coil power terminals (typically 24V DC).",
      "Physically check contactor mechanical action for sticking or binding.",
      "Replace contactor if coil is open-circuit or mechanical binding is observed."
    ],
    validationChecks: [
      "Measure continuity across auxiliary feedback contacts in open and closed states.",
      "Verify coil voltage signal arrives at contactor terminal blocks upon command."
    ],
    clearingCriteria: [
      "Commanded state and feedback auxiliary switch state align without persistent latching errors."
    ],
    detailView: "string",
    managerSummary: "String Contactor Status Mismatch indicates the physical contactor auxiliary switch state does not match the command state sent by the String Controller.",
    technicianDetail: "Verify auxiliary switch block is securely mounted on top/side of the main contactor. Inspect contacts for carbon buildup or mechanical sticking."
  },
  {
    id: "string-contactors-wont-close",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 3,
    section: "String Issues",
    system: "contactor",
    component: "Contactor",
    issueName: "String Contactors Won't Close",
    aliases: ["SC Contactors Blocked", "Contactors Won't Latch"],
    summaryAction: "Investigate active safety interlocks, isolation faults, or 24V control power.",
    recommendedActions: [
      "Check for active hard interlocks (e.g. ESTOP, thermal alarm, major CGC disconnect).",
      "Verify that string isolation resistance is above the safety threshold (typically > 100k ohms).",
      "Check 24V DC auxiliary power supply voltage under contactor load.",
      "Verify contactor coils are intact and receiving activation signals."
    ],
    validationChecks: [
      "Measure string isolation resistance to ground using insulation tester.",
      "Confirm SC safety chain circuit is closed."
    ],
    clearingCriteria: [
      "Safety interlocks are resolved and contactors successfully latch closed on command."
    ],
    detailView: "string",
    managerSummary: "Contactor closing command was blocked or failed to execute. Review safety interlocks, isolation resistance, and control power.",
    technicianDetail: "Examine SC diagnostic registers for active interlock flags. Check ground fault detector indicators. Ensure safety loops are completed."
  },
  {
    id: "molex-connector-abnormal-voltage",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 3,
    section: "String Issues",
    system: "cell-group",
    component: "Cell Group",
    issueName: "Molex Connector Abnormal Voltage",
    aliases: ["Molex Voltage Drop", "Molex High Contact Resistance"],
    summaryAction: "Inspect Molex pin crimps, seating, and check for high contact resistance.",
    recommendedActions: [
      "Inspect physical Molex pins for loose crimps, pushouts, or thermal damage.",
      "Verify connector is fully seated and clicked into place.",
      "Check cell group terminal screws for tightness to prevent contact resistance voltage drops."
    ],
    validationChecks: [
      "Compare voltage directly at cell terminals to Molex connector pin voltages.",
      "Verify terminal connection torque specifications are met."
    ],
    clearingCriteria: [
      "Voltages across the Molex diagnostic harness pins align exactly with physical cell group potentials."
    ],
    detailView: "string",
    managerSummary: "Discrepancy or unstable readings detected at the diagnostic Molex interface. Physical connector seating and pin inspection recommended.",
    technicianDetail: "Inspect white Molex housings for cracks. Pull gently on individual harness wires to confirm terminal pin retention inside housing."
  },
  {
    id: "hvac-1-not-cooling",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 4,
    section: "Team Box Issues",
    system: "hvac",
    component: "HVAC",
    issueName: "HVAC 1 not Cooling",
    aliases: ["HVAC 1 Cooling Fault", "HVAC 1 Compressor Fault"],
    summaryAction: "Check Breaker QA26 in CS Panel and QA1/QA2 in Segment Box.",
    recommendedActions: [
      "Check Breaker QA26 in CS Auxiliary Breaker Panel.",
      "Check Breakers QA1 and QA2 in the Segment Breaker Box.",
      "Measure for Voltage Discrepancy on the 208V/480V Grid Power supply lines.",
      "Inspect HVAC 1 fan and compressor status LEDs."
    ],
    validationChecks: [
      "Verify HVAC 1 controller is powered on.",
      "Measure temperature differential between supply and return air vents."
    ],
    clearingCriteria: [
      "HVAC 1 compressor engages and cold air delivery is active."
    ],
    detailView: "feather",
    managerSummary: "HVAC Unit 1 has reported a cooling fault or compressor timeout. Check QA26 CS panel breakers.",
    technicianDetail: "Open HVAC 1 junction box and verify supply voltage. Check Modbus communication line from Feather to HVAC 1 controller board."
  },
  {
    id: "hvac-2-not-cooling",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 4,
    section: "Team Box Issues",
    system: "hvac",
    component: "HVAC",
    issueName: "HVAC 2 not Cooling",
    aliases: ["HVAC 2 Cooling Fault", "HVAC 2 Compressor Fault"],
    summaryAction: "Check Breaker QA23 in CS Panel and QA14/QA6 in Segment Box.",
    recommendedActions: [
      "Check Breaker QA23 in CS Auxiliary Breaker Panel.",
      "Check Breakers QA14 and QA6 in the Segment Breaker Box.",
      "Measure for Voltage Discrepancy on the 208V/480V Grid Power supply lines.",
      "Inspect HVAC 2 fan and compressor status LEDs."
    ],
    validationChecks: [
      "Verify HVAC 2 controller is powered on.",
      "Measure temperature differential between supply and return air vents."
    ],
    clearingCriteria: [
      "HVAC 2 compressor engages and cold air delivery is active."
    ],
    detailView: "feather",
    managerSummary: "HVAC Unit 2 has reported a cooling fault or compressor timeout. Check QA23 CS panel breakers.",
    technicianDetail: "Open HVAC 2 junction box and verify supply voltage. Check Modbus communication line from Feather to HVAC 2 controller board."
  },
  {
    id: "both-hvacs-not-cooling",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 4,
    section: "Team Box Issues",
    system: "hvac",
    component: "HVAC",
    issueName: "Both HVACs not Cooling",
    aliases: ["Total HVAC Cooling Failure", "High Enclosure Temperature"],
    summaryAction: "Inspect QA23 & QA26 in CS Panel, check primary distribution breakers.",
    recommendedActions: [
      "Check Breakers QA23 & QA26 in CS Auxiliary Breaker Panel.",
      "Verify primary utility AC breaker distribution panel state.",
      "Measure voltage on main auxiliary transformer bus.",
      "Trigger emergency ventilation backup fans if container temperature exceeds 50C."
    ],
    validationChecks: [
      "Verify supply voltage at both HVAC units.",
      "Check for thermal interlock status on main controller."
    ],
    clearingCriteria: [
      "At least one HVAC unit resumes cooling and container temperature stabilizes."
    ],
    detailView: "feather",
    managerSummary: "CRITICAL: Total HVAC cooling failure detected. Enclosure ambient temperature will rise rapidly. Investigate main AC distribution breakers immediately.",
    technicianDetail: "Prioritize ventilation backup. Ensure emergency fans are triggered. Verify utility transformer auxiliary side fuses."
  },
  {
    id: "fire-alarm",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 4,
    section: "Team Box Issues",
    system: "fire",
    component: "Fire Panel",
    issueName: "Fire Alarm",
    aliases: ["Building Fire Alarm", "FACP Active Alarm", "Smoke Alarm"],
    faultCodes: [1532, 1533],
    summaryAction: "Inspect Fire Panel active zone, replace Zone 4 CS heat detector if faulty.",
    recommendedActions: [
      "Confirm fire panel is powered and check active alarm zone indicators.",
      "Check for which zone is alarming. If Zone 4: Replace heat detector in CS.",
      "Directly inspect physical display on fire panel and trace active alarm loop.",
      "Clear alarm manually after confirming zero physical smoke/thermal conditions."
    ],
    validationChecks: [
      "Visually inspect container for smoke, fire, or thermal activity.",
      "Check aerosol fire suppression system pressure and discharge indicators."
    ],
    clearingCriteria: [
      "Fire panel registers zero active alarms; manual reset clears the latch."
    ],
    detailView: "site",
    managerSummary: "CRITICAL: Fire Panel has reported active alarm state. Verify site safety immediately. Do not enter container until safety is established.",
    technicianDetail: "Read active zone on FACP display. Check Zone 4 wiring. Perform standard visual walkthrough and heat sensor check."
  },
  {
    id: "fire-trouble",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 4,
    section: "Team Box Issues",
    system: "fire",
    component: "Fire Panel",
    issueName: "Fire Trouble",
    aliases: ["Fire Panel Fault", "FACP Trouble Loop"],
    summaryAction: "Confirm Fire Panel auxiliary battery voltage and check circuit wiring.",
    recommendedActions: [
      "Confirm Fire Panel is powered on.",
      "Confirm Fire Panel backup battery connection is secure and charged.",
      "Check sensor wiring on the active trouble circuit loop.",
      "Inspect supervised circuit wiring for open loops or ground faults."
    ],
    validationChecks: [
      "Check for open circuit or ground fault on supervised loops.",
      "Confirm backup battery terminal voltage is > 12.5V."
    ],
    clearingCriteria: [
      "Fire panel reports 'Normal' with no trouble conditions."
    ],
    detailView: "site",
    managerSummary: "Fire Trouble indicates a diagnostic fault in the FACP loop, such as a wire break, ground fault, or low battery.",
    technicianDetail: "Measure supervised loop impedance. Trace circuit wiring for loose terminal blocks or damaged sensor leads."
  },
  {
    id: "sat-sensor-not-reporting",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 4,
    section: "Team Box Issues",
    system: "hvac",
    component: "HVAC",
    issueName: "SAT Sensor is not reporting",
    aliases: ["Supply Air Temp Offline", "Duct Sensor Disconnected"],
    summaryAction: "Check Modbus RTU wiring from SAT sensor interface to ioLogik/Feather.",
    recommendedActions: [
      "Check 12V/24V power supply to the SAT sensor interface module.",
      "Confirm Modbus RTU RS485 communication line connections.",
      "Inspect SAT sensor physical installation inside the supply duct.",
      "Replace SAT probe if sensor resistance is open-circuit."
    ],
    validationChecks: [
      "Measure thermistor output voltage/resistance at the interface board.",
      "Verify Modbus device address setting switches on the sensor card."
    ],
    clearingCriteria: [
      "Feather successfully reads SAT (Supply Air Temperature) data register."
    ],
    detailView: "feather",
    managerSummary: "SAT (Supply Air Temperature) sensor is disconnected or failed. This prevents proper HVAC cooling loop modulation.",
    technicianDetail: "Locate SAT interface box. Verify power LED is solid. Trace RS485 cable to the ioLogik/Feather master interface."
  },
  {
    id: "iologik-disconnected",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 4,
    section: "Team Box Issues",
    system: "network",
    component: "Unknown",
    issueName: "ioLogik disconnected from network",
    aliases: ["ioLogik Offline", "ioLogik Disconnect"],
    summaryAction: "Check ethernet link and verify ioLogik DC power supply.",
    recommendedActions: [
      "Check ioLogik 24V DC auxiliary power supply switch and fuse.",
      "Check ethernet patch cable from ioLogik to the local TEAM box switch.",
      "Verify ioLogik network IP address settings and subnet mask.",
      "Perform power cycle (reboot) on the ioLogik unit."
    ],
    validationChecks: [
      "Ping ioLogik IP address from local terminal.",
      "Verify TEAM switch port link status LED is blinking green/amber."
    ],
    clearingCriteria: [
      "ioLogik responds to ping and registers communication on Feather monitor."
    ],
    detailView: "feather",
    managerSummary: "ioLogik ethernet module is disconnected. This drops all analog sensor and door status telemetry for the lineup.",
    technicianDetail: "Trace DC power to terminals V+ and V-. Ensure network cable has solid mechanical locking."
  },
  {
    id: "mio-disconnected",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 4,
    section: "Team Box Issues",
    system: "network",
    component: "Unknown",
    issueName: "MIO disconnected from Feather",
    aliases: ["MIO Offline", "MIO Disconnect"],
    summaryAction: "Check MIO power and RS485/ethernet communications line.",
    recommendedActions: [
      "Verify MIO controller 24V DC power input is stable.",
      "Check communication bus cable seating on the MIO board.",
      "Perform master Feather controller reboot.",
      "Replace MIO board if diagnostic power LEDs do not illuminate."
    ],
    validationChecks: [
      "Measure DC voltage at MIO power terminals.",
      "Check for communication activity using RS485 status LEDs."
    ],
    clearingCriteria: [
      "MIO establishes stable communications handshake with master Feather controller."
    ],
    detailView: "feather",
    managerSummary: "MIO expansion interface is disconnected, cutting communication to subsidiary sensor networks.",
    technicianDetail: "Verify RS485 polarization resistors. Inspect standard wiring loop from Feather serial port to MIO board."
  },
  {
    id: "door-sensors-tripped-closed",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "enclosure",
    component: "Door",
    issueName: "Door Sensors report tripped when door is closed",
    aliases: ["Door Switch Misalignment", "False Door Alarm"],
    summaryAction: "Verify alignment of magnetic or plunger door sensor contacts.",
    recommendedActions: [
      "Physically inspect door sensor alignment. Ensure gap is within tolerance (< 15mm for magnetic).",
      "Check magnetic switch target contact plate is present and clean.",
      "Inspect wiring terminals at the door sensor junction box.",
      "Measure continuity across the closed switch circuit to verify switch functionality."
    ],
    validationChecks: [
      "Measure terminal resistance when door is physically closed (should be < 5 ohms).",
      "Verify door frame is aligned and latch is secure."
    ],
    clearingCriteria: [
      "All door sensor loops report closed state on ioLogik digital inputs."
    ],
    detailView: "feather",
    managerSummary: "False door open alarm. Align door sensor contact magnetic switches.",
    technicianDetail: "Check magnetic switch proximity. If distance is too far due to door sag, adjust mounting bracket closer. Check ioLogik channel wire terminations."
  },
  {
    id: "phoenix-not-reporting",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "network",
    component: "Unknown",
    issueName: "Phoenix not reporting",
    aliases: ["Phoenix Contact Offline", "Phoenix Controller Disconnect"],
    summaryAction: "Verify Phoenix contactor controller power and RJ45 ethernet path.",
    recommendedActions: [
      "Check Phoenix 24V auxiliary power input switch.",
      "Inspect ethernet patch cable from Phoenix controller to the network switch.",
      "Confirm Modbus TCP register query completes.",
      "Reboot Phoenix controller board."
    ],
    validationChecks: [
      "Ping Phoenix controller IP address.",
      "Verify connection link light on network switch."
    ],
    clearingCriteria: [
      "Phoenix registers online with normal Modbus telemetry flow."
    ],
    detailView: "feather",
    managerSummary: "Phoenix system is not reporting telemetry. Verify network path and auxiliary power supply.",
    technicianDetail: "Trace cable connection from Phoenix module RJ45 to network. Verify IP subnet configurations."
  },
  {
    id: "ups-offline",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "ups",
    component: "UPS",
    issueName: "UPS offline",
    aliases: ["UPS Disconnect", "UPS Battery Low", "UPS Main Offline"],
    summaryAction: "Verify UPS grid input breaker and check battery connections.",
    recommendedActions: [
      "Check main UPS input grid AC breaker QA_UPS.",
      "Verify auxiliary battery bank wiring is securely connected to the UPS.",
      "Check for communication network patch cable breaks.",
      "Replace UPS if battery cannot hold charge under load."
    ],
    validationChecks: [
      "Confirm AC input voltage is within acceptable bounds (120V +/- 10%).",
      "Verify UPS internal state on local LCD panel."
    ],
    clearingCriteria: [
      "UPS reports back online, active battery charging, and no utility faults."
    ],
    detailView: "site",
    managerSummary: "UPS has lost primary grid power or communication. Check QA_UPS breakers immediately to prevent control system blackout.",
    technicianDetail: "Verify QA_UPS auxiliary panel breakers. Inspect backup lead-acid terminal connections for oxidation."
  },
  {
    id: "ups-1-offline",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "ups",
    component: "UPS",
    issueName: "UPS 1 Offline",
    aliases: ["Lineup UPS 1 offline"],
    summaryAction: "Check input breaker QA25 and communication wire for UPS 1.",
    recommendedActions: [
      "Check QA25 breaker in Auxiliary Power Panel.",
      "Verify UPS 1 DC terminal connection is tight.",
      "Check RJ45 network connection to UPS 1 SNMP card."
    ],
    validationChecks: [
      "Verify input voltage at UPS 1 is present.",
      "Verify battery backup health on UPS 1 display."
    ],
    clearingCriteria: ["UPS 1 reports normal battery standby charging."],
    detailView: "site",
    managerSummary: "UPS unit 1 is offline or reporting battery warning. Investigate auxiliary breaker QA25.",
    technicianDetail: "Measure input AC voltage. Pull SNMP logs for power diagnostic trace."
  },
  {
    id: "ups-2-offline",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "ups",
    component: "UPS",
    issueName: "UPS 2 Offline",
    aliases: ["Lineup UPS 2 offline"],
    summaryAction: "Check input breaker QA26 and communication wire for UPS 2.",
    recommendedActions: [
      "Check QA26 breaker in Auxiliary Power Panel.",
      "Verify UPS 2 DC terminal connection is tight.",
      "Check RJ45 network connection to UPS 2 SNMP card."
    ],
    validationChecks: [
      "Verify input voltage at UPS 2 is present.",
      "Verify battery backup health on UPS 2 display."
    ],
    clearingCriteria: ["UPS 2 reports normal battery standby charging."],
    detailView: "site",
    managerSummary: "UPS unit 2 is offline or reporting battery warning. Investigate auxiliary breaker QA26.",
    technicianDetail: "Measure input AC voltage. Pull SNMP logs for power diagnostic trace."
  },
  {
    id: "ups-3-offline",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "ups",
    component: "UPS",
    issueName: "UPS 3 Offline",
    aliases: ["Lineup UPS 3 offline"],
    summaryAction: "Check input breaker QA27 and communication wire for UPS 3.",
    recommendedActions: [
      "Check QA27 breaker in Auxiliary Power Panel.",
      "Verify UPS 3 DC terminal connection is tight.",
      "Check RJ45 network connection to UPS 3 SNMP card."
    ],
    validationChecks: [
      "Verify input voltage at UPS 3 is present.",
      "Verify battery backup health on UPS 3 display."
    ],
    clearingCriteria: ["UPS 3 reports normal battery standby charging."],
    detailView: "site",
    managerSummary: "UPS unit 3 is offline or reporting battery warning. Investigate auxiliary breaker QA27.",
    technicianDetail: "Measure input AC voltage. Pull SNMP logs for power diagnostic trace."
  },
  {
    id: "ups-4-offline",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "ups",
    component: "UPS",
    issueName: "UPS 4 Offline",
    aliases: ["Lineup UPS 4 offline"],
    summaryAction: "Check input breaker QA28 and communication wire for UPS 4.",
    recommendedActions: [
      "Check QA28 breaker in Auxiliary Power Panel.",
      "Verify UPS 4 DC terminal connection is tight.",
      "Check RJ45 network connection to UPS 4 SNMP card."
    ],
    validationChecks: [
      "Verify input voltage at UPS 4 is present.",
      "Verify battery backup health on UPS 4 display."
    ],
    clearingCriteria: ["UPS 4 reports normal battery standby charging."],
    detailView: "site",
    managerSummary: "UPS unit 4 is offline or reporting battery warning. Investigate auxiliary breaker QA28.",
    technicianDetail: "Measure input AC voltage. Pull SNMP logs for power diagnostic trace."
  },
  {
    id: "lineup-disconnected",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "network",
    component: "Unknown",
    issueName: "Lineup disconnected from Main Network",
    aliases: ["Lineup Offline", "Switch Uplink Disconnect"],
    summaryAction: "Verify fiber optic or ethernet uplink from lineup switch to CS switch.",
    recommendedActions: [
      "Check fiber media converter / SFP port LEDs on main switch.",
      "Confirm lineup main ethernet switch is powered and active.",
      "Verify fiber optic patch cords are not bent, damaged, or dirty.",
      "Ping lineup default gateway."
    ],
    validationChecks: [
      "Check link lights on central lineup uplink port.",
      "Clean fiber optic connectors with specialized cleaning pen."
    ],
    clearingCriteria: [
      "Lineup master switch ping succeeds and data packet stream resumes."
    ],
    detailView: "network",
    managerSummary: "CRITICAL: Lineup is entirely offline and disconnected from central SCADA network. Physical fiber uplink must be inspected immediately.",
    technicianDetail: "Verify SFP transceivers are locked. Clean fiber ends. Ensure switch power indicators are green."
  },
  {
    id: "booster-fans-fault",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "hvac",
    component: "HVAC",
    issueName: "Booster fans not operating",
    aliases: ["Booster Fan Fault", "Segment Fan Offline"],
    summaryAction: "Verify fan control contactor coil power and inspect duct blockage.",
    recommendedActions: [
      "Check booster fan power breaker QA_FAN.",
      "Verify fan motor contactor relay on the Feather/MIO output board.",
      "Inspect ventilation ducts for physical obstructions.",
      "Check fan belt and motor windings for continuity."
    ],
    validationChecks: [
      "Measure fan motor current consumption under load.",
      "Confirm fan control relay click on command."
    ],
    clearingCriteria: [
      "Booster fans report active speed feedback or telemetry confirms normal current."
    ],
    detailView: "feather",
    managerSummary: "Booster fan failure. Check QA_FAN breaker. High danger of local thermal build-up inside battery racks.",
    technicianDetail: "Trace 208V to booster fan terminal blocks. Ensure control contactor coils are energizing."
  },
  {
    id: "senva-not-communicating",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "network",
    component: "Unknown",
    issueName: "SENVA not communicating",
    aliases: ["SENVA Gas Sensor Disconnect", "SENVA offline"],
    summaryAction: "Check RS485 address dip-switches and Modbus wire polarity on SENVA sensor.",
    recommendedActions: [
      "Check SENVA sensor 24V power supply wires.",
      "Verify RS485 Modbus A and B wires are not swapped.",
      "Confirm Modbus device address match against Feather configurations.",
      "Check terminate resistors on the RS485 serial segment."
    ],
    validationChecks: [
      "Measure DC voltage on SENVA power ports (must be 24V +/- 2V).",
      "Verify dip-switches match Modbus protocol settings."
    ],
    clearingCriteria: [
      "SENVA data registers are read successfully with no timeout flags."
    ],
    detailView: "feather",
    managerSummary: "SENVA gas/environmental monitoring sensor is not communicating. Possible wire mismatch or serial addressing issue.",
    technicianDetail: "Check A/B line polarity. Confirm baud rate is set to 9600 (or specified value on diagram)."
  },
  {
    id: "feather-unavailable",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "feather",
    component: "Feather",
    issueName: "Feather is Unavailable",
    aliases: ["Feather Offline", "Feather Comm Timeout"],
    summaryAction: "Reboot Feather controller and inspect network patch cable.",
    recommendedActions: [
      "Check main power status of the Feather control board.",
      "Verify network patch cable is fully seated in the RJ45 port.",
      "Ping Feather default IP from the switch terminal.",
      "Perform power recycle of the Feather controller."
    ],
    validationChecks: [
      "Check that Feather power LED is solid green.",
      "Verify network port activity flashing."
    ],
    clearingCriteria: [
      "Feather responds to standard Modbus queries and registers active status."
    ],
    detailView: "feather",
    managerSummary: "Feather master controller is unavailable, disabling environmental monitoring and HVAC logic controls.",
    technicianDetail: "Ensure power supply module is supplying 24V. Cycle power on the main breaker if controller is locked."
  },
  {
    id: "heat-alarm",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "fire",
    component: "Fire Panel",
    issueName: "Heat Alarm",
    aliases: ["CS Heat Sensor Alarm", "Thermal Alarm Head"],
    summaryAction: "Isolate affected cabinet and check thermal telemetry on cell level.",
    recommendedActions: [
      "Verify cell temperature readings in String Details.",
      "Check for localized thermal issues near heat sensors.",
      "Replace heat alarm detector heads if verified faulty.",
      "Ensure emergency cooling is active."
    ],
    validationChecks: [
      "Inspect container with infrared thermal camera.",
      "Check backup thermostat indicators."
    ],
    clearingCriteria: [
      "Container temperature drops below alarm threshold and FACP is reset."
    ],
    detailView: "site",
    managerSummary: "Thermal/Heat alarm active. Monitor all cell telemetry closely. Prepare emergency ventilation.",
    technicianDetail: "Examine thermal sensors loop wiring. Match thermal camera outputs against cell sensor resistance maps."
  },
  {
    id: "env-controller-ventilation",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "hvac",
    component: "HVAC",
    issueName: "Env Controller Ventilation",
    aliases: ["Damper Control Fault", "Aux Ventilation Issue"],
    summaryAction: "Check ventilation damper actuator and relay control output.",
    recommendedActions: [
      "Inspect ventilation damper actuator alignment and physical binding.",
      "Verify damper activation relay command from the MIO board.",
      "Confirm ventilation fans are powered on.",
      "Check air filters for high dirt clog."
    ],
    validationChecks: [
      "Verify damper moves to open/closed position on digital command.",
      "Confirm actuator auxiliary feedback switch transitions."
    ],
    clearingCriteria: [
      "Ventilation loop feedback aligns with environmental controller setpoints."
    ],
    detailView: "feather",
    managerSummary: "Ventilation damper or auxiliary fan controller issue. Check actuator binding.",
    technicianDetail: "Measure 24V supply to actuator. Check actuator manual release lever to ensure free motion of damper vanes."
  },
  {
    id: "hydrogen-sensor-trouble",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: 5,
    section: "Team Box Issues",
    system: "fire",
    component: "Fire Panel",
    issueName: "Hydrogen Sensor Trouble",
    aliases: ["H2 Sensor Fault", "Hydrogen Detector Trouble"],
    summaryAction: "Recalibrate or replace hydrogen gas sensor probe and check power.",
    recommendedActions: [
      "Confirm 24V DC auxiliary power to the Hydrogen sensor head.",
      "Check sensor calibration date; perform manual calibration if required.",
      "Inspect sensor filters for dirt or moisture accumulation.",
      "Verify analog signaling connection to fire panel or ioLogik."
    ],
    validationChecks: [
      "Verify sensor output current matches nominal 4-20mA range.",
      "Check loop terminal block terminations."
    ],
    clearingCriteria: [
      "Hydrogen sensor trouble clears, reporting steady nominal background levels."
    ],
    detailView: "site",
    managerSummary: "Hydrogen monitoring probe is reporting diagnostic fault. Calibrate sensor or verify supply loops.",
    technicianDetail: "Measure voltage at sensor terminals. Check if gas cell is expired (sensor lifespan typically 2-3 years)."
  }
];
