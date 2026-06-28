export const DRAGON_APP_CODE_NAME_MAP: Record<string, string> = {
  ES00001: "E-Stop Response v1.0",
  BSF0001: "Battery Safety v1.0",
  BP00001: "Block Power",
  HCP0001: "High Current Protection App v1.0",
  CAL001: "CAL001",
  CAL0001: "Critical Aux Load v1.0",
  PC00001: "Power Control v1.0",
  SSPC001: "Sunspec Power Command v1.0",
  BOP0001: "Basic Op v1.0",
  SCHED001: "Scheduler v1.0",
  FD00001: "Frequency Droop v1.0",
  AVR0001: "Automatic Voltage Regulation v1.0",
  ETC0001: "Enclosure Control v1.0",
  PCOMP001: "Power Compensator v1.0",
  ADB0001: "Auto Discharge Balancer v1.0",
  SLOW001: "Slow Charge v1.0",
  CTC0001: "Centipede Thermal Control v1.0",
  BS00001: "Backstop v1.0"
};

export const EMS_APP_INTERACTION_REGISTRY: Record<string, any> = {
  CAL001: {
    interaction: "enableDisable",
    supportedLocally: true,
    safetyLevel: "locked",
    confirmationEnable: "ENABLE CAL001",
    confirmationDisable: "DISABLE CAL001",
    externalEquivalent: "enable/{appCode}/{priority}/{on|off}"
  },
  SSPC001: {
    interaction: "enableDisable",
    supportedLocally: true,
    safetyLevel: "critical",
    confirmationEnable: "ENABLE SSPC001",
    confirmationDisable: "DISABLE SSPC001",
    externalEquivalent: "enable/{appCode}/{priority}/{on|off}"
  },
  ADB0001: {
    interaction: "enableDisable",
    supportedLocally: true,
    safetyLevel: "locked",
    confirmationEnable: "ENABLE ADB0001",
    confirmationDisable: "DISABLE ADB0001",
    externalEquivalent: "enable/{appCode}/{priority}/{on|off}"
  },
  SLOW001: {
    interaction: "enableDisable",
    supportedLocally: true,
    safetyLevel: "locked",
    confirmationEnable: "ENABLE SLOW001",
    confirmationDisable: "DISABLE SLOW001",
    externalEquivalent: "enable/{appCode}/{priority}/{on|off}"
  },
  CTC0001: {
    interaction: "enableDisable",
    supportedLocally: true,
    safetyLevel: "locked",
    confirmationEnable: "ENABLE CTC0001",
    confirmationDisable: "DISABLE CTC0001",
    externalEquivalent: "enable/{appCode}/{priority}/{on|off}"
  },
  PC00001: {
    interaction: "powerControl",
    supportedLocally: false,
    safetyLevel: "critical",
    fields: ["enabled", "kW", "kVAr"],
    reason: "External endpoint mapped; local SetEMSApplicationConfiguration serialization not implemented yet",
    externalEquivalent: "power?priority={priority}&enabled={on|off}&kW={kW}&kVAr={kVAr}"
  },
  BOP0001: {
    interaction: "basicOp",
    supportedLocally: false,
    safetyLevel: "critical",
    fields: ["enabled", "startUpDelay", "basicOpPriority", "targetP", "targetSOC"],
    reason: "External endpoint mapped; local BasicOp config serialization not implemented yet",
    externalEquivalent: "basicOp"
  },
  SCHED001: {
    interaction: "scheduler",
    supportedLocally: false,
    safetyLevel: "critical",
    fields: ["enabled", "filename", "rules", "timeZoneCode"],
    reason: "External scheduler endpoints mapped; local scheduler write/apply implementation not implemented yet",
    externalEquivalent: "setSchedule?priority={priority}&enabled={on|off}&filename={filename}"
  },
  HCP0001: {
    interaction: "readOnly",
    supportedLocally: false,
    safetyLevel: "readOnly",
    reason: "No external interaction point observed"
  },
  BS00001: {
    interaction: "readOnly",
    supportedLocally: false,
    safetyLevel: "readOnly",
    reason: "No external interaction point observed"
  }
};

export function getAppInteraction(appCode: string | null | undefined) {
  if (!appCode) {
    return {
      interaction: "readOnly",
      supportedLocally: false,
      safetyLevel: "readOnly",
      reason: "Missing app code"
    };
  }
  return EMS_APP_INTERACTION_REGISTRY[appCode] ?? {
    interaction: "readOnly",
    supportedLocally: false,
    safetyLevel: "readOnly",
    reason: "No mapped interaction"
  };
}
