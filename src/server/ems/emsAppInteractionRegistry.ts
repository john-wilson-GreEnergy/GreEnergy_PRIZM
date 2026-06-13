export const EMS_APP_INTERACTION_REGISTRY: Record<string, any> = {
  CAL001: {
    interaction: "enableDisable",
    supportedLocally: true,
    safetyLevel: "locked",
    confirmationEnable: "ENABLE CAL001",
    confirmationDisable: "DISABLE CAL001",
    cloudEquivalent: "enable/{appCode}/{priority}/{on|off}"
  },
  SSPC001: {
    interaction: "enableDisable",
    supportedLocally: true,
    safetyLevel: "critical",
    confirmationEnable: "ENABLE SSPC001",
    confirmationDisable: "DISABLE SSPC001",
    cloudEquivalent: "enable/{appCode}/{priority}/{on|off}"
  },
  ADB0001: {
    interaction: "enableDisable",
    supportedLocally: true,
    safetyLevel: "locked",
    confirmationEnable: "ENABLE ADB0001",
    confirmationDisable: "DISABLE ADB0001",
    cloudEquivalent: "enable/{appCode}/{priority}/{on|off}"
  },
  SLOW001: {
    interaction: "enableDisable",
    supportedLocally: true,
    safetyLevel: "locked",
    confirmationEnable: "ENABLE SLOW001",
    confirmationDisable: "DISABLE SLOW001",
    cloudEquivalent: "enable/{appCode}/{priority}/{on|off}"
  },
  CTC0001: {
    interaction: "enableDisable",
    supportedLocally: true,
    safetyLevel: "locked",
    confirmationEnable: "ENABLE CTC0001",
    confirmationDisable: "DISABLE CTC0001",
    cloudEquivalent: "enable/{appCode}/{priority}/{on|off}"
  },
  PC00001: {
    interaction: "powerControl",
    supportedLocally: false,
    safetyLevel: "critical",
    fields: ["enabled", "kW", "kVAr"],
    reason: "Cloud endpoint mapped; local SetEMSApplicationConfiguration serialization not implemented yet",
    cloudEquivalent: "power?priority={priority}&enabled={on|off}&kW={kW}&kVAr={kVAr}"
  },
  BOP0001: {
    interaction: "basicOp",
    supportedLocally: false,
    safetyLevel: "critical",
    fields: ["enabled", "startUpDelay", "basicOpPriority", "targetP", "targetSOC"],
    reason: "Cloud endpoint mapped; local BasicOp config serialization not implemented yet",
    cloudEquivalent: "basicOp"
  },
  SCHED001: {
    interaction: "scheduler",
    supportedLocally: false,
    safetyLevel: "critical",
    fields: ["enabled", "filename", "rules", "timeZoneCode"],
    reason: "Cloud scheduler endpoints mapped; local scheduler write/apply implementation not implemented yet",
    cloudEquivalent: "setSchedule?priority={priority}&enabled={on|off}&filename={filename}"
  },
  HCP0001: {
    interaction: "readOnly",
    supportedLocally: false,
    safetyLevel: "readOnly",
    reason: "No cloud interaction point observed"
  },
  BS00001: {
    interaction: "readOnly",
    supportedLocally: false,
    safetyLevel: "readOnly",
    reason: "No cloud interaction point observed"
  }
};
