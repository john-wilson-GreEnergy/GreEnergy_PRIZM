import { TROUBLESHOOTING_KB, TroubleshootingEntry } from "./troubleshootingKnowledgeBase";

/**
 * Resolves a raw fault, warning, or corrective action item to its curated troubleshooting entry
 * from the PRIZM Troubleshooting Knowledge Base.
 * 
 * Precedence Order:
 * 1. Exact fault/warning/info code match.
 * 2. Alarm/warning/info family code match (matching code % 1000).
 * 3. Exact/Alias Name Match.
 * 4. Component or System Fallback heuristic.
 */
export function resolveTroubleshooting(issue: any): TroubleshootingEntry {
  if (!issue) {
    return getFallbackEntry();
  }

  const rawCode = issue.code || issue.faultId || issue.id || issue.rawFaultId || "";
  const codeNum = typeof rawCode === "number" ? rawCode : parseInt(String(rawCode).replace(/\D/g, ""), 10);
  
  const faultLabel = String(issue.faultName || issue.fault || issue.title || "").trim();
  const lowerLabel = faultLabel.toLowerCase();

  // Try to parse code from label if not directly available
  let parsedCode: number | null = null;
  if (!isNaN(codeNum) && codeNum > 0) {
    parsedCode = codeNum;
  } else {
    const codeMatch = faultLabel.match(/\b(10\d{2}|15\d{2}|20\d{2}|25\d{2}|30\d{2}|35\d{2}|80\d{2}|90\d{2})\b/);
    if (codeMatch) {
      parsedCode = parseInt(codeMatch[1], 10);
    }
  }

  // 1. Exact Code Match
  if (parsedCode !== null) {
    const exactMatch = TROUBLESHOOTING_KB.find(entry => {
      return (entry.faultCodes || []).includes(parsedCode!) ||
             (entry.warningCodes || []).includes(parsedCode!) ||
             (entry.infoCodes || []).includes(parsedCode!) ||
             (entry.warrantyCodes || []).includes(parsedCode!);
    });
    if (exactMatch) {
      return exactMatch;
    }
  }

  // 2. Alarm/Warning/Info Family Match (e.g. 1024, 2024, 3024 all map to BPC Disconnect)
  if (parsedCode !== null) {
    const familyBase = parsedCode % 1000;
    const familyMatch = TROUBLESHOOTING_KB.find(entry => {
      const codes = [
        ...(entry.faultCodes || []),
        ...(entry.warningCodes || []),
        ...(entry.infoCodes || []),
        ...(entry.warrantyCodes || [])
      ];
      return codes.some(c => c % 1000 === familyBase);
    });
    if (familyMatch) {
      return familyMatch;
    }
  }

  // 3. Exact/Alias Name Match
  const nameMatch = TROUBLESHOOTING_KB.find(entry => {
    const matchesName = entry.issueName.toLowerCase() === lowerLabel || entry.id.toLowerCase() === String(rawCode).toLowerCase();
    const matchesAlias = (entry.aliases || []).some(alias => alias.toLowerCase() === lowerLabel);
    return matchesName || matchesAlias;
  });
  if (nameMatch) {
    return nameMatch;
  }

  // Term substring match on name or aliases
  const termMatch = TROUBLESHOOTING_KB.find(entry => {
    const nameSub = lowerLabel.includes(entry.issueName.toLowerCase());
    const aliasSub = (entry.aliases || []).some(alias => lowerLabel.includes(alias.toLowerCase()));
    return nameSub || aliasSub;
  });
  if (termMatch) {
    return termMatch;
  }

  // 4. Component or System Fallback
  let fallbackEntry: TroubleshootingEntry | undefined;

  if (lowerLabel.includes("hvac") || lowerLabel.includes("cooling")) {
    if (lowerLabel.includes("hvac 1") || lowerLabel.includes("hvac1")) {
      fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "hvac-1-not-cooling");
    } else if (lowerLabel.includes("hvac 2") || lowerLabel.includes("hvac2")) {
      fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "hvac-2-not-cooling");
    } else if (lowerLabel.includes("both") || lowerLabel.includes("total")) {
      fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "both-hvacs-not-cooling");
    } else {
      fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "hvac-1-not-cooling");
    }
  } else if (lowerLabel.includes("balancer") || lowerLabel.includes("balancing")) {
    fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "bpc-not-balancing");
  } else if (lowerLabel.includes("bpc")) {
    fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "bpc-disconnect");
  } else if (lowerLabel.includes("cell") && (lowerLabel.includes("volts") || lowerLabel.includes("voltage"))) {
    fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "abnormal-cell-voltage");
  } else if (lowerLabel.includes("cell") && (lowerLabel.includes("temp") || lowerLabel.includes("temperature"))) {
    fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "abnormal-cell-temp");
  } else if (lowerLabel.includes("cgc") || lowerLabel.includes("cell group")) {
    fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "cgc-disconnect");
  } else if (lowerLabel.includes("fire") || lowerLabel.includes("smoke")) {
    if (lowerLabel.includes("trouble")) {
      fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "fire-trouble");
    } else {
      fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "fire-alarm");
    }
  } else if (lowerLabel.includes("ups")) {
    if (lowerLabel.includes("ups 1") || lowerLabel.includes("ups1")) {
      fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "ups-1-offline");
    } else if (lowerLabel.includes("ups 2") || lowerLabel.includes("ups2")) {
      fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "ups-2-offline");
    } else if (lowerLabel.includes("ups 3") || lowerLabel.includes("ups3")) {
      fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "ups-3-offline");
    } else if (lowerLabel.includes("ups 4") || lowerLabel.includes("ups4")) {
      fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "ups-4-offline");
    } else {
      fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "ups-offline");
    }
  } else if (lowerLabel.includes("contactor")) {
    if (lowerLabel.includes("won't close") || lowerLabel.includes("wont close")) {
      fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "string-contactors-wont-close");
    } else {
      fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "string-contactor-mismatch");
    }
  } else if (lowerLabel.includes("lineup") && lowerLabel.includes("disconnect")) {
    fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "lineup-disconnected");
  } else if (lowerLabel.includes("booster") || lowerLabel.includes("fan")) {
    fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "booster-fans-fault");
  } else if (lowerLabel.includes("senva")) {
    fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "senva-not-communicating");
  } else if (lowerLabel.includes("feather")) {
    fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "feather-unavailable");
  } else if (lowerLabel.includes("door")) {
    fallbackEntry = TROUBLESHOOTING_KB.find(e => e.id === "door-sensors-tripped-closed");
  }

  if (fallbackEntry) {
    return fallbackEntry;
  }

  return getFallbackEntry(issue);
}

function getFallbackEntry(issue?: any): TroubleshootingEntry {
  const faultLabel = issue ? String(issue.faultName || issue.fault || issue.title || "Unknown Issue") : "Unknown Issue";
  return {
    id: "unknown-issue",
    sourceDocument: "Stack750 Troubleshooting Cheat Sheet V2",
    sourcePage: "Advisory Fallback",
    section: "Warnings, Alarms, & Info",
    system: "unknown",
    component: "Unknown",
    issueName: faultLabel,
    summaryAction: "Perform general diagnostics, check power, and verify local network connectivity.",
    recommendedActions: [
      "Verify issue details in the live PRIZM station viewer.",
      "Check power supply and communication harness seating on the affected device.",
      "Inspect nearby physical components for loose cables, status LEDs, or physical damage.",
      "Perform Power-to-Control (PTC) power cycle of target control loop if safe."
    ],
    validationChecks: [
      "Confirm supply voltage is normal and stable.",
      "Ping target IP address from central network switch."
    ],
    clearingCriteria: [
      "Error registers return to zero and data updates successfully without timeout warnings."
    ],
    detailView: "site",
    managerSummary: `No exact troubleshooting matrix entry found for this warning: "${faultLabel}". Recommended default telemetry diagnostics.`,
    technicianDetail: `Trace wiring diagrams for affected device. Ensure correct termination resistance is in place on RS485 loop.`
  };
}

/**
 * Policy checks to determine whether to display target's IP address.
 */
export function shouldShowTargetIp(target: any, system?: string, detailView?: string): boolean {
  const sys = (system || target?.system || "").toLowerCase();
  const dView = (detailView || target?.detailView || "").toLowerCase();
  const epType = (target?.endpointType || "").toLowerCase();

  // Do not display Energy Segment IP addresses for string-level, BPC-level, cell-group-level, balancing, voltage, temperature, contactor, or string-controller corrective actions.
  if (
    sys === "string" ||
    sys === "bpc" ||
    sys === "cell-group" ||
    sys === "balancing" ||
    sys === "contactor" ||
    epType === "string" ||
    epType === "bpc" ||
    epType === "cell_group" ||
    dView === "string"
  ) {
    return false;
  }

  // IP addresses should only be displayed for device/network-controller faults where the IP identifies the actual troubleshootable device
  if (
    dView === "feather" ||
    dView === "pcs" ||
    dView === "site" ||
    dView === "network" ||
    sys === "hvac" ||
    sys === "feather" ||
    sys === "team-box" ||
    sys === "ups" ||
    sys === "network" ||
    sys === "pcs" ||
    sys === "meter" ||
    sys === "fire" ||
    sys === "sensor"
  ) {
    return true;
  }

  return false;
}

/**
 * Formats a physical target object according to the layout requirements.
 */
export function formatAffectedTargetForDisplay(target: any, system?: string, detailView?: string): string {
  const block = target.blockIndex ?? 1;
  const array = target.arrayIndex ?? 1;
  
  const isStringRelated = !shouldShowTargetIp(target, system, detailView);
  
  if (isStringRelated) {
    const stringNum = target.stringIndex;
    let esStr = "";
    let sideStr = "";
    if (stringNum !== undefined && stringNum !== null) {
      const es = Math.ceil(Number(stringNum) / 2);
      esStr = ` / ES${es} / String ${stringNum}`;
      sideStr = Number(stringNum) % 2 === 1 ? " / A-Side" : " / B-Side";
    } else if (target.energySegmentIndex !== undefined && target.energySegmentIndex !== null) {
      esStr = ` / ES${target.energySegmentIndex}`;
    }
    
    let bpcStr = "";
    if (target.batteryPackIndex !== undefined && target.batteryPackIndex !== null) {
      bpcStr = ` / BPC ${target.batteryPackIndex}`;
    }
    let cgStr = "";
    if (target.cellGroupIndex !== undefined && target.cellGroupIndex !== null) {
      cgStr = ` / CG ${target.cellGroupIndex}`;
    }
    
    return `Block ${block} / Array ${array}${esStr}${sideStr}${bpcStr}${cgStr}`;
  } else {
    const parts = [`Block ${block}`, `Array ${array}`];
    
    const sys = (system || target.system || "").toLowerCase();
    const isHvac = sys === "hvac" || String(target.callout || "").toLowerCase().includes("hvac");
    const isFeather = sys === "feather" || String(target.callout || "").toLowerCase().includes("feather");
    
    if (isFeather) {
      parts.push("Feather");
    } else if (isHvac) {
      parts.push("Feather");
      if (String(target.callout || "").toLowerCase().includes("hvac 1")) {
        parts.push("HVAC 1");
      } else if (String(target.callout || "").toLowerCase().includes("hvac 2")) {
        parts.push("HVAC 2");
      } else {
        parts.push("HVAC Device");
      }
    } else {
      const compLabel = target.component || target.endpointType || "Controller";
      parts.push(compLabel);
    }
    
    const ipVal = target.deviceIp || target.ip;
    if (ipVal) {
      parts.push(`IP ${ipVal}`);
    }
    
    return parts.join(" / ");
  }
}
