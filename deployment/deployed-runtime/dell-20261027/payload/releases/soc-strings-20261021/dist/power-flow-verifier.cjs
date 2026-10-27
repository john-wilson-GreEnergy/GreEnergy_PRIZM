var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/corrective-deployment-verifier.ts
var corrective_deployment_verifier_exports = {};
__export(corrective_deployment_verifier_exports, {
  FleetBroker: () => FleetBroker,
  buildBlockPowerFlow: () => buildBlockPowerFlow,
  parseSummary: () => parseSummary,
  verifyCorrectiveReview: () => verifyCorrectiveReview,
  verifyHvacReview: () => verifyHvacReview
});
module.exports = __toCommonJS(corrective_deployment_verifier_exports);
var import_strict2 = __toESM(require("node:assert/strict"), 1);

// src/lib/correctiveWorklist.ts
function targetMatches(t, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const coordinate = /^(array|string|bpc|cell)\s*(\d+)$/i.exec(q);
  if (coordinate) {
    const key = coordinate[1].toLowerCase();
    return (key === "array" ? t.array : t.location?.[key]) === Number(coordinate[2]);
  }
  return t.label.toLowerCase().includes(q);
}
function selectedTargets(group, array, query) {
  return group.targets.filter((t) => (array === "all" || String(t.array) === array) && targetMatches(t, query));
}

// src/core/correctiveGuidance.ts
var correctiveDisplayCategory = (group) => group.displayCategory || (group.section === "availability" ? "Contactors & rotation" : group.category);

// src/lib/correctiveSelection.ts
var exportTargetKey = (groupId, targetId) => JSON.stringify([groupId, targetId]);
var exportTargetKeys = (groups) => groups.flatMap((g) => g.targets.map((t) => exportTargetKey(g.id, t.id)));

// src/lib/correctivePacket.ts
function correctivePacket(review, groups, array, query, site, stale, filters = {}, selection) {
  const selected = groups.map((g) => ({ ...g, displayCategory: correctiveDisplayCategory(g), targets: selectedTargets(g, array, query).filter((t) => !selection || selection.keys.has(exportTargetKey(g.id, t.id))) })).filter((g) => g.targets.length);
  const ids = new Set(selected.flatMap((g) => g.targets.map((t) => t.id)));
  const bpcs = review.bpcReview?.devices.filter((d) => review.bpcReview.targetIdsByDevice[d.id]?.some((id) => ids.has(id)));
  const bpcChecklist = (bpcs ?? []).map((d) => {
    const targetIds = (review.bpcReview.targetIdsByDevice[d.id] ?? []).filter((id) => ids.has(id));
    const deviceIds = new Set(targetIds);
    return {
      id: d.id,
      array: d.array,
      string: d.string,
      bpc: d.bpc,
      targetIds,
      codes: [...new Set(selected.filter((g) => g.targets.some((t) => deviceIds.has(t.id))).map((g) => g.code))].sort()
    };
  }).sort((a, b) => a.array - b.array || a.string - b.string || a.bpc - b.bpc);
  const textFor = (g, key, id) => {
    const ids2 = new Set(g.targets.map((t) => t.id));
    return (g.troubleshooting?.[key] ?? []).filter((i) => id ? i.targetIds.includes(id) : i.targetIds.some((t) => ids2.has(t))).map((i) => (i.advisory ? "General advisory: " : "") + i.text);
  };
  const targets = selected.flatMap((g) => g.targets.map((t) => ({
    category: g.displayCategory || (g.section === "availability" ? "Contactors & rotation" : g.category),
    code: g.code,
    title: g.title,
    severity: g.severity,
    target: t.label,
    block: t.location?.block ?? null,
    array: t.array,
    string: t.location?.string ?? null,
    bpc: t.location?.bpc ?? null,
    cell: t.location?.cell ?? null,
    observed: [...new Set(t.observations.map((o) => o.at || "Not supplied"))].join("; "),
    actions: textFor(g, "actions", t.id).join("\n") || "Not supplied",
    validation: textFor(g, "validation", t.id).join("\n") || "Not supplied",
    clearing: textFor(g, "clearing", t.id).join("\n") || "Not supplied",
    safety: textFor(g, "safety", t.id).join("\n") || "Not supplied",
    documentedClearing: g.documentedClearing || "Not supplied",
    guidanceSource: (g.troubleshooting?.sources ?? []).filter((s) => s.targetIds.includes(t.id)).map((s) => s.label + (s.advisory ? " (general advisory)" : "")).join("; ") || "Not supplied",
    telemetrySource: t.source.join("; ")
  })));
  return {
    site,
    capturedAt: review.capturedAt,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: review.guidanceRevision ?? 0,
    sharedRevision: review.guidanceSharedRevision ?? 0,
    stale,
    warnings: review.sourceWarnings ?? [],
    filters: { ...filters, array, target: query || "all", ...selection ? { selection: "Operator-selected fault / target subset; not a complete site fault list" } : {} },
    selected,
    targets,
    bpcs,
    bpcChecklist,
    partialBpcs: review.bpcReview?.scopes["all:all"]?.partial ?? true,
    inventory: selection && !selection.includeSiteInventory ? void 0 : review.bpcReview?.balancerInventory,
    textFor
  };
}
var exportColumns = ["Site", "Snapshot (UTC)", "Freshness / coverage", "Category", "Severity", "Code", "Fault", "Target", "Block", "Array", "String", "BPC", "Cell group", "Observed at", "Recommended actions", "Validation checks", "Clear conditions", "Safety / prerequisites", "Documented clearing behavior", "Guidance source", "Telemetry source", "Guidance revision", "Shared guidance revision"];
function packetRows(p) {
  return p.targets.map((t) => [p.site, p.capturedAt, [p.stale ? "RETAINED - VERIFY FRESHNESS" : "Published snapshot - verify before field work", ...p.warnings].join("; "), t.category, t.severity, t.code, t.title, t.target, t.block, t.array, t.string, t.bpc, t.cell, t.observed, t.actions, t.validation, t.clearing, t.safety, t.documentedClearing, t.guidanceSource, t.telemetrySource, p.revision, p.sharedRevision]);
}
function packetCsv(p) {
  const safe = (v) => {
    const s = v == null ? "" : String(v);
    return '"' + (/^[\s]*[=+\-@]|^[\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"';
  };
  return [exportColumns, ...packetRows(p)].map((row4) => row4.map(safe).join(",")).join("\r\n");
}

// scripts/hvac-review-deployment-verifier.ts
var import_strict = __toESM(require("node:assert/strict"), 1);

// src/server/notifications/stringControllerFaultCatalog.ts
var definitions = [];
var add = (suffix, name, component, description, clears) => definitions.push({ suffix, name, component, description, clears });
var threshold = "the configured threshold";
for (const [suffix, name, component, subject, quantity, high] of [
  [1, "CellGroup High Voltage", "Cell Group", "A cell group", "voltage", true],
  [2, "Battery Pack High Voltage", "BPC", "A battery pack", "voltage", true],
  [3, "String High Voltage", "String", "A string", "voltage", true],
  [4, "CellGroup Low Voltage", "Cell Group", "A cell group", "voltage", false],
  [5, "Battery Pack Low Voltage", "BPC", "A battery pack", "voltage", false],
  [6, "String Low Voltage", "String", "A string", "voltage", false],
  [10, "CellGroup High Temperature", "Cell Group", "A cell group", "temperature", true],
  [11, "Battery Pack High Temperature", "BPC", "A battery pack", "temperature", true],
  [12, "String High Temperature", "String", "A string", "temperature", true],
  [13, "Enclosure High Temperature", "Enclosure", "An enclosure", "temperature", true],
  [14, "CellGroup Low Temperature", "Cell Group", "A cell group", "temperature", false],
  [15, "Battery Pack Low Temperature", "BPC", "A battery pack", "temperature", false],
  [16, "String Low Temperature", "String", "A string", "temperature", false],
  [17, "Enclosure Low Temperature", "Enclosure", "An enclosure", "temperature", false]
]) add(
  suffix,
  name,
  component,
  `${subject} reported ${quantity} at or ${high ? "above" : "below"} ${threshold}.`,
  `The reported ${quantity} ${high ? "falls below" : "rises above"} ${threshold}.`
);
for (const [suffix, name, component, subject, quantity] of [
  [7, "CellGroup Voltage Delta", "Cell Group", "cell group", "voltage"],
  [8, "Battery Pack Voltage Delta", "BPC", "battery pack", "voltage"],
  [9, "String Voltage Delta", "String", "string", "voltage"],
  [18, "CellGroup Temperature Delta", "Cell Group", "cell group", "temperature"],
  [57, "Battery Pack Temperature Delta", "BPC", "battery pack", "temperature"]
]) add(
  suffix,
  name,
  component,
  `The difference between the highest and lowest ${subject} ${quantity} is at or above ${threshold}.`,
  `The ${quantity} difference falls below ${threshold}.`
);
for (const [suffix, name, current] of [
  [19, "String High Charge Rate", "charge"],
  [20, "String High Discharge Rate", "discharge"],
  [21, "High Ground Current Leakage", "ground"]
]) add(suffix, name, "String", `Detected ${current} current is at or above ${threshold}.`, `${current[0].toUpperCase() + current.slice(1)} current falls below ${threshold}.`);
add(22, "Measured Calculated Voltage Mismatch", "BPC", "Calculated battery pack voltages differ from voltage sensor measurements by more than the configured threshold.", `The calculated / measured voltage difference falls below ${threshold}.`);
for (const [suffix, name, component, receiver, sender] of [
  [23, "CGC Disconnect", "Cell Group", "BPC", "CGC"],
  [24, "BPC Disconnect", "BPC", "string controller", "BPC"],
  [25, "String Disconnect", "String", "BMS", "string controller"],
  [26, "BMS Disconnect", "BMS", "EMS", "BMS"],
  [29, "Relay Disconnect", "Relay", "EMS", "relay"]
]) add(suffix, name, component, `The ${receiver} did not receive ${sender} communication before the configured timeout.`, `The ${receiver} receives ${sender} communication again.`);
for (const [suffix, name, component] of [[27, "PCS Disconnect", "PCS"], [28, "Meter Disconnect", "Meter"]])
  add(suffix, name, component, `EMS failed to connect to the ${component}.`, `EMS successfully connects to the ${component}.`);
add(30, "Low Connected String Count", "String", "Too few strings are connected.", "A sufficient number of strings are connected.");
add(46, "Abnormal String Current", "String", "The PCS is off and showing no current, but abnormal string current is reported.", `String current falls below ${threshold}.`);
add(47, "String Current Delta", "String", "String current differs from average string current by a percentage greater than the configured threshold.", `The string current deviation falls below ${threshold}.`);
for (const [suffix, name, component] of [
  [48, "CGC", "Cell Group"],
  [49, "BPC", "BPC"],
  [50, "SC", "String"],
  [51, "BMS/Phoenix", "BMS"],
  [52, "EMS/Dragon", "EMS"],
  [53, "Storage PCS", "PCS"],
  [54, "PV PCS", "PCS"],
  [55, "Meter", "Meter"],
  [56, "Transformer", "Transformer"]
]) add(suffix, `${name} Internal Error`, component, `${name} reported an internal error of the indicated severity.`, "The error is no longer reported.");
var source = (page) => ({ document: "String Controller Fault Codes.pdf", section: "Software User Interface Operation Manual \xB7 Table of Notifications", page });
function pageFor(code) {
  if (code <= 1006) return 41;
  if (code <= 1020) return 42;
  if (code <= 1050) return 43;
  if (code <= 2005) return 44;
  if (code <= 2019) return 45;
  if (code <= 2051) return 46;
  if (code <= 3009) return 47;
  if (code <= 3024) return 48;
  return 49;
}
var manualAlarmSuffixes = /* @__PURE__ */ new Set([3, 6, 19, 20, 21, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56]);
var slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
var STRING_CONTROLLER_FAULT_CATALOG = {};
for (const definition of definitions) {
  for (const [prefix, severity, label] of [[1e3, "alarm", "Alarm"], [2e3, "warning", "Warning"], [3e3, "info", "Info"]]) {
    const code = String(prefix + definition.suffix);
    const manual = severity === "alarm" && manualAlarmSuffixes.has(definition.suffix);
    const notes = [];
    if (severity === "warning" && (definition.suffix <= 26 || definition.suffix === 29 || definition.suffix === 46 || definition.suffix === 47 || definition.suffix === 57))
      notes.push("The manual labels this a Warning but refers to an alarm setting/timeout in its prose. Verify the configured value and hysteresis on the controller; no numeric threshold is inferred.");
    if (code === "3003") notes.push("The manual specifies an info threshold for detection but an alarm threshold for clearing. Verify controller behavior.");
    STRING_CONTROLLER_FAULT_CATALOG[code] = {
      code,
      name: `${definition.name} ${label}`,
      family: slug(definition.name),
      component: definition.component,
      description: definition.description + (code === "1050" ? " The manual identifies trigger message 5 as a mismatch between the two DC bus current sensors." : ""),
      defaultSeverity: severity,
      clearBehavior: manual ? "manual" : "condition",
      clearingDescription: manual ? `The manual specifies manual clearing${code === "1047" ? ", even if the string goes offline" : ""}.` : definition.clears + (code === "3046" ? " The manual also lists the PCS turning on as a clearing condition." : ""),
      source: source(pageFor(Number(code))),
      sourceNotes: notes.length ? notes : void 0,
      summaryVisibility: "show",
      exportVisibility: "include"
    };
  }
}
var extras = [
  [1531, "Duplicate Battery Pack Alarm", "BPC", "Two or more battery packs share an index or unique ID.", "Duplicate battery pack IDs or indices are no longer detected.", "alarm", "condition"],
  [1532, "Smoke Alarm", "Safety", "EMS detected an activated smoke alarm on site.", "The manual specifies manual clearing.", "alarm", "manual"],
  [1533, "Building Fire Alarm", "Safety", "EMS detected an activated building fire alarm on site.", "The manual specifies manual clearing.", "alarm", "manual"],
  [1558, "Multiple Closed CGC Relays Alarm", "BPC", "More than one CGC relay is closed on a single battery pack.", "The manual associates clearing with the AC battery E-Stop signal clearing. This is documentation, not an instruction to reset an E-Stop; verify the approved site procedure.", "alarm", "condition"],
  [1559, "String Fuse Open Alarm", "String", "A string fuse has opened.", "The manual specifies manual clearing.", "alarm", "manual"],
  [1560, "E-Stop Signal Received Alarm", "Safety", "An E-Stop signal associated with an AC battery has been detected.", "The manual specifies manual clearing.", "alarm", "manual"],
  [2534, "Contactor Open Warning", "String", "The string controller detected that a contactor has opened.", "Both contactors close.", "warning", "condition"],
  [2535, "Open Door Warning", "Enclosure", "A container door is open.", "The door is closed.", "warning", "condition"],
  [3536, "Contactor Error", "String", "The string controller detected that a contactor has opened.", "Both contactors close.", "info", "condition"]
];
for (const [code, name, component] of [[3537, "BPC", "BPC"], [3538, "CGC", "Cell Group"], [3539, "String Controller", "String"], [3540, "Phoenix", "BMS"], [3541, "Dragon", "EMS"]])
  extras.push([code, `${name} Booter Mode`, component, `${name} is stuck in Booter Mode.`, "The device leaves Booter Mode.", "info", "condition"]);
for (const [id, name, component, description, clearingDescription, defaultSeverity, clearBehavior] of extras) {
  const code = String(id);
  STRING_CONTROLLER_FAULT_CATALOG[code] = {
    code,
    name,
    component,
    description,
    clearingDescription,
    defaultSeverity,
    clearBehavior,
    family: slug(name.replace(/ (Alarm|Warning)$/, "")),
    source: source(id < 2e3 ? 44 : id < 3e3 ? 47 : 50),
    summaryVisibility: "show",
    exportVisibility: "include"
  };
}
var warrantyDefinitions = definitions.filter((d) => [1, 4, 10, 14, 19, 20].includes(d.suffix));
for (const [suffix, high, mode] of [[42, true, "Charging"], [43, true, "Discharging"], [44, false, "Charging"], [45, false, "Discharging"]])
  warrantyDefinitions.push({
    suffix,
    name: `CellGroup ${high ? "High" : "Low"} ${mode} Temperature`,
    component: "Cell Group",
    description: `During ${mode.toLowerCase()}, a cell group reported temperature at or ${high ? "above" : "below"} ${threshold}.`,
    clears: `Cell group temperature ${high ? "falls below" : "rises above"} ${threshold}.`
  });
for (const definition of warrantyDefinitions) {
  for (const [prefix, defaultSeverity, label] of [[8e3, "alarm", "Alarm"], [9e3, "warning", "Warning"]]) {
    const code = String(prefix + definition.suffix);
    STRING_CONTROLLER_FAULT_CATALOG[code] = {
      code,
      name: `${definition.name} Warranty ${label}`,
      family: `warranty-${slug(definition.name)}`,
      component: definition.component,
      description: definition.description,
      defaultSeverity,
      warranty: true,
      clearBehavior: prefix === 8e3 ? "permanent-record" : "condition",
      clearingDescription: prefix === 8e3 ? "Warranty alarms are permanently recorded." : definition.clears,
      source: source(prefix === 8e3 ? 50 : 51),
      summaryVisibility: "show",
      exportVisibility: "include"
    };
  }
}

// src/server/notifications/notificationCatalog.ts
var EXISTING_CATALOG = {
  "1003": {
    code: "1003",
    name: "String High Voltage Alarm",
    family: "string-high-voltage",
    component: "String",
    summaryVisibility: "show",
    exportVisibility: "include",
    description: "The source reports string voltage above its configured alarm threshold."
  },
  "2003": {
    code: "2003",
    name: "String High Voltage Warning",
    family: "string-high-voltage",
    component: "String",
    summaryVisibility: "show",
    exportVisibility: "include",
    description: "The source reports string voltage above its configured warning threshold."
  },
  "1008": {
    code: "1008",
    name: "Battery Pack Voltage Delta Alarm",
    family: "battery-pack-voltage-delta",
    component: "BPC",
    summaryVisibility: "show",
    exportVisibility: "include",
    description: "The source reports battery pack voltage delta above its configured alarm threshold."
  },
  "2008": {
    code: "2008",
    name: "Battery Pack Voltage Delta Warning",
    family: "battery-pack-voltage-delta",
    component: "BPC",
    summaryVisibility: "show",
    exportVisibility: "include",
    description: "The source reports battery pack voltage delta above its configured warning threshold."
  },
  "1023": {
    code: "1023",
    name: "CGC Disconnect Alarm",
    family: "cgc-disconnect",
    component: "Cell Group",
    summaryVisibility: "show",
    exportVisibility: "include"
  },
  "2023": {
    code: "2023",
    name: "CGC Disconnect Warning",
    family: "cgc-disconnect",
    component: "Cell Group",
    summaryVisibility: "show",
    exportVisibility: "include"
  },
  "3023": {
    code: "3023",
    name: "CGC Disconnect Info",
    family: "cgc-disconnect",
    component: "Cell Group",
    summaryVisibility: "rollupOnly",
    exportVisibility: "exclude"
  },
  "1024": {
    code: "1024",
    name: "BPC Disconnect Alarm",
    family: "bpc-disconnect",
    component: "BPC",
    summaryVisibility: "show",
    exportVisibility: "include"
  },
  "2024": {
    code: "2024",
    name: "BPC Disconnect Warning",
    family: "bpc-disconnect",
    component: "BPC",
    summaryVisibility: "show",
    exportVisibility: "include"
  },
  "3024": {
    code: "3024",
    name: "BPC Disconnect Info",
    family: "bpc-disconnect",
    component: "BPC",
    summaryVisibility: "rollupOnly",
    exportVisibility: "exclude"
  },
  "2014": {
    code: "2014",
    name: "CellGroup Low Temperature Warning",
    family: "abnormal-cell-temperature",
    component: "Cell Group",
    summaryVisibility: "show",
    exportVisibility: "include"
  },
  "2018": {
    code: "2018",
    name: "CellGroup Temperature Delta Warning",
    family: "abnormal-cell-temperature",
    component: "Cell Group",
    summaryVisibility: "show",
    exportVisibility: "include"
  },
  "2073": {
    code: "2073",
    name: "CellGroup Discharge Balancer Warning",
    family: "bpc-not-balancing",
    component: "BPC",
    summaryVisibility: "show",
    exportVisibility: "include"
  },
  "2074": {
    code: "2074",
    name: "CellGroup Charge Balancer Warning",
    family: "bpc-not-balancing",
    component: "BPC",
    summaryVisibility: "show",
    exportVisibility: "include"
  },
  "2534": {
    code: "2534",
    name: "Contactor Open Warning",
    family: "contactor-open",
    component: "String",
    summaryVisibility: "show",
    exportVisibility: "include"
  },
  "2561": {
    code: "2561",
    name: "String out of rotation warning",
    family: "string-out-of-rotation",
    component: "String",
    summaryVisibility: "rollupOnly",
    exportVisibility: "exclude"
  }
};
var NOTIFICATION_CATALOG = { ...EXISTING_CATALOG };
for (const [code, documented] of Object.entries(STRING_CONTROLLER_FAULT_CATALOG)) {
  const existing = EXISTING_CATALOG[code];
  NOTIFICATION_CATALOG[code] = {
    ...documented,
    ...existing ? { family: existing.family, summaryVisibility: existing.summaryVisibility, exportVisibility: existing.exportVisibility } : {}
  };
}

// src/lib/bessStatusCodes.ts
var LEGACY_STATUS_CODE_MAP = {
  "2534": "Contactors Open Warning",
  "2561": "String OOR Warning",
  "1004": "CellGroup Low Voltage Alarm",
  "1006": "String Low Voltage Alarm",
  "1014": "Cell Group Low Temp Alarm",
  "1020": "String High Discharge Rate Alarm",
  "1022": "Measured vs Calculated Mismatch Alarm",
  "1023": "CGC Disconnect Alarm",
  "1024": "BPC Disconnect Alarm",
  "1032": "DC Bus Calculated Mismatch Alarm",
  "1071": "String High Discharge Rate Alarm",
  "2004": "CellGroup Low Voltage Warning",
  "2006": "String Low Voltage Warning",
  "2007": "CellGroup Voltage Delta Warning",
  "2008": "BatteryPack Voltage Delta Warning",
  "2014": "CellGroup Low Temp Warning",
  "2018": "CellGroup Temp Delta Warning",
  "2020": "String High Discharge Rate Warning",
  "2022": "Measured vs Calculated Mismatch Warning",
  "2023": "CGC Disconnect Warning",
  "2024": "BPC Disconnect Warning",
  "2032": "DC Bus Calculated Voltage Mismatch Warning",
  "2071": "String High Discharge Rate Warning",
  "2073": "CellGroup Discharge Balancer Warning",
  "2074": "CellGroup Charge Balancer Warning",
  "2921": "Cell Temp Loss Warning"
};
var BESS_STATUS_CODE_MAP = {
  ...LEGACY_STATUS_CODE_MAP,
  ...Object.fromEntries(Object.values(NOTIFICATION_CATALOG).map((entry) => [entry.code, entry.name]))
};

// src/server/notifications/hvacIssueReview.ts
var rank = { critical: 0, alarm: 1, warning: 2, unknown: 3, info: 4 };
var genericTitle = (title, code) => !title.trim() || /^(?:unclassified|unknown|unmapped)\b/i.test(title.trim()) || /^(?:(?:alarm|warning|info)\s+)?(?:notification|fault|alarm|warning|code)\b[\s:#\d_-]*$/i.test(title.trim()) || title.trim() === code.trim();
function project(groups, incomplete = false) {
  const devices = /* @__PURE__ */ new Map(), unassigned = /* @__PURE__ */ new Map();
  let partial = incomplete;
  for (const g of groups) {
    partial ||= g.targetCount > g.targets.length;
    for (const t of g.targets) {
      const isUnit = Number.isSafeInteger(t.unit) && t.unit > 0 && Number.isSafeInteger(t.array) && t.array > 0 && !/\b(FSS|fire suppression|smoke|gas sensor)\b/i.test(`${g.code} ${g.title}`);
      const map = isUnit ? devices : unassigned;
      const entry = map.get(t.id) ?? { ...t, unit: isUnit ? t.unit : null, issues: [], severity: g.severity };
      if (!entry.issues.some((i) => i.key === g.key)) entry.issues.push({ key: g.key, code: g.code, title: g.title, severity: g.severity });
      if (rank[g.severity] < rank[entry.severity]) entry.severity = g.severity;
      map.set(t.id, entry);
    }
  }
  const ordered = (map) => [...map.values()].sort((a, b) => rank[a.severity] - rank[b.severity] || (a.array ?? Infinity) - (b.array ?? Infinity) || a.label.localeCompare(b.label, void 0, { numeric: true }));
  return {
    devices: ordered(devices),
    unassigned: ordered(unassigned),
    partial,
    issueTypes: groups.map(({ key, code, title, severity }) => ({ key, code, title, severity }))
  };
}
function projectNotificationHvacs(review) {
  if (process.env.PRIZM_HVAC_ISSUE_REVIEW === "false") return void 0;
  return project(review.groups.filter((g) => g.category === "HVAC / Environmental").map((g) => ({
    key: g.id,
    code: g.code,
    title: g.title,
    severity: g.severity,
    targetCount: g.targetCount,
    targets: g.targets.map((t) => ({ id: t.id, label: t.label, array: t.array, unit: t.location?.unit ?? null }))
  })), !!review.sourceWarnings?.length);
}
function attachFleetHvacs(issues) {
  if (process.env.PRIZM_HVAC_ISSUE_REVIEW === "false") {
    delete issues.hvacReview;
    return;
  }
  issues.hvacReview = project(issues.findings.filter((g) => g.category === "hvac").map((g) => ({
    key: JSON.stringify([g.category, g.severity, g.code, g.title]),
    code: g.code,
    title: g.title,
    severity: g.severity,
    targetCount: g.targetCount,
    targets: (g.targetRows ?? []).map((t) => ({ id: t.id, label: t.label, array: t.array, unit: t.hvacUnit ?? null }))
  })), issues.omittedGroups > 0 || issues.quality !== "live");
}
function auditNotificationGuidance(review) {
  return review.groups.flatMap((g) => {
    const missing = [];
    if (genericTitle(g.title, g.code)) missing.push("Plain-language title");
    if (g.sourceNotes?.some((n) => n.startsWith("Legacy code label:"))) missing.push("Code meaning / source verification");
    if (g.code !== "2561" && !g.code.startsWith("PRIZM-")) {
      for (const [key, label] of [["actions", "Fault-specific actions"], ["validation", "Validation checks"], ["clearing", "Clearing criteria"]]) {
        if (key === "clearing" && g.documentedClearing?.trim()) continue;
        const supplied = new Set((g.troubleshooting?.[key] ?? []).filter((i) => !i.advisory && i.text.trim()).flatMap((i) => i.targetIds));
        if (!g.targets.length || g.targets.some((t) => !supplied.has(t.id))) missing.push(label);
      }
    }
    return missing.length ? [{ groupId: g.id, code: g.code, title: g.title, severity: g.severity, missing, targetCount: g.targetCount }] : [];
  });
}

// src/core/fleet/model.ts
var fleetMetrics = {
  powerKw: { label: "Real power", unit: "kW" },
  reactiveKvar: { label: "Reactive power", unit: "kVAR" },
  targetKw: { label: "Power target", unit: "kW" },
  chargeKw: { label: "Available charge", unit: "kW" },
  dischargeKw: { label: "Available discharge", unit: "kW" },
  capacityKwh: { label: "Installed capacity", unit: "kWh" },
  storedKwh: { label: "Stored energy", unit: "kWh" },
  socPct: { label: "Capacity-weighted SOC", unit: "%" },
  strings: { label: "Strings", unit: "" },
  warnings: { label: "Warning targets", unit: "" },
  alarms: { label: "Alarm targets", unit: "" }
};
var metricKeys = Object.keys(fleetMetrics);
var emptyMetrics = () => Object.fromEntries(metricKeys.map((key) => [key, { value: null, observedAt: null, quality: "unknown", source: "Unavailable" }]));

// src/core/fleet/details.ts
var fleetDetailLimits = { groups: 128, targets: 8192, summaryBytes: 4 * 1024 * 1024 };
var issueCategories = { battery: "Cell / String", hvac: "HVAC / Environmental", pcs: "PCS", availability: "Contactors / Rotation", other: "Other site issues" };
var emptyRange = () => ({ minimum: null, average: null, maximum: null, delta: null, reportingStrings: 0, expectedStrings: 0, partial: true });
var emptyDetails = () => ({
  version: 1,
  observedAt: null,
  quality: "unknown",
  arrays: [],
  omittedArrays: 0,
  issues: { observedAt: null, quality: "unknown", categories: Object.fromEntries(Object.keys(issueCategories).map((k) => [k, { alarms: null, warnings: null, info: null, unknown: null, targets: null }])), findings: [], omittedGroups: 0, notes: [] },
  sensors: { observedAt: null, quality: "unknown", trips: null, known: 0, total: 0, active: [], omittedTrips: 0 }
});

// src/server/fleet/detailValidation.ts
var row = (v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Invalid fleet detail");
  return v;
};
var num = (v, min = -1e12, max = 1e12) => {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error("Invalid detail number");
  return v;
};
var count = (v) => {
  const n = num(v, 0);
  if (n === null || !Number.isSafeInteger(n)) throw new Error("Invalid detail count");
  return n;
};
var text = (v, limit = 160) => {
  if (typeof v !== "string" || v.length > limit) throw new Error("Invalid detail text");
  return v;
};
var stamp = (v) => {
  if (v === null) return null;
  const s = text(v, 40);
  if (!Number.isFinite(Date.parse(s))) throw new Error("Invalid detail time");
  return s;
};
var quality = (v) => {
  if (v !== "live" && v !== "stale" && v !== "unknown") throw new Error("Invalid detail quality");
  return v;
};
var list = (v, max) => {
  if (!Array.isArray(v) || v.length > max) throw new Error("Invalid detail list");
  return v;
};
function range(value) {
  const r = row(value), minimum = num(r.minimum), average = num(r.average), maximum = num(r.maximum), delta = num(r.delta, 0);
  const reportingStrings = count(r.reportingStrings), expectedStrings = count(r.expectedStrings);
  if (typeof r.partial !== "boolean" || reportingStrings > expectedStrings || expectedStrings > 0 && r.partial !== reportingStrings < expectedStrings) throw new Error("Invalid range coverage");
  if ([minimum, average, maximum, delta].some((v) => v === null) && [minimum, average, maximum, delta].some((v) => v !== null)) throw new Error("Incomplete range");
  if (minimum !== null && average !== null && maximum !== null && (minimum > average || average > maximum || Math.abs(maximum - minimum - delta) > 1e-6)) throw new Error("Invalid range extrema");
  return { minimum, average, maximum, delta, reportingStrings, expectedStrings, partial: r.partial };
}
function parseFleetDetails(value) {
  if (value === void 0) return emptyDetails();
  const r = row(value), i = row(r.issues), s = row(r.sensors), result = emptyDetails();
  if (r.version !== 1) throw new Error("Unsupported fleet detail version");
  result.observedAt = stamp(r.observedAt);
  result.quality = quality(r.quality);
  result.omittedArrays = count(r.omittedArrays);
  result.arrays = list(r.arrays, 64).map((value2) => {
    const a = row(value2), rotation = a.rotation;
    if (typeof rotation !== "string" || !["IN", "OUT", "UNKNOWN"].includes(rotation)) throw new Error("Invalid rotation");
    const id = count(a.number);
    if (id === 0) throw new Error("Invalid array");
    return {
      number: id,
      observedAt: stamp(a.observedAt),
      quality: quality(a.quality),
      stringCount: a.stringCount === null ? null : count(a.stringCount),
      onlineStrings: a.onlineStrings === null ? null : count(a.onlineStrings),
      outOfRotation: a.outOfRotation === null ? null : count(a.outOfRotation),
      powerKw: num(a.powerKw),
      socPct: num(a.socPct, 0, 100),
      busVoltage: num(a.busVoltage, 0),
      pcsState: text(a.pcsState, 80),
      rotation,
      socObservedAt: a.socObservedAt === void 0 ? null : stamp(a.socObservedAt),
      socQuality: a.socQuality === void 0 ? "unknown" : quality(a.socQuality),
      pcsQuality: quality(a.pcsQuality),
      pcsObservedAt: stamp(a.pcsObservedAt),
      temperatureC: range(a.temperatureC),
      voltageMv: range(a.voltageMv)
    };
  });
  if (new Set(result.arrays.map((a) => a.number)).size !== result.arrays.length) throw new Error("Duplicate array detail");
  if (r.pcs !== void 0) {
    const reading = (v, parse) => {
      const p = row(v), q = quality(p.quality), at = stamp(p.observedAt), value2 = parse(p.value);
      if (!["EMS", "SMA HTTP", "SMA stream", "PCS Modbus", "Unknown"].includes(String(p.source))) throw new Error("Invalid PCS source");
      if (q === "live" && (value2 === null || !at || p.source === "Unknown")) throw new Error("Invalid live PCS reading");
      return { value: value2, quality: q, observedAt: at, source: p.source, ...p.source === "SMA stream" ? { deviceObservedAt: stamp(p.deviceObservedAt ?? null), clockSkew: p.clockSkew === true } : {} };
    };
    const enumeration = (values) => (v) => {
      if (v === null) return null;
      const s2 = text(v, 80);
      if (!values.includes(s2)) throw new Error("Invalid PCS state");
      return s2;
    };
    result.pcs = list(r.pcs, 64).map((value2) => {
      const p = row(value2), array = count(p.array), number2 = count(p.number);
      if (!array || !number2 || p.id !== `A${array}-PCS${number2}`) throw new Error("Invalid PCS identity");
      return {
        id: text(p.id, 80),
        array,
        number: number2,
        status: reading(p.status, (v) => v === null ? null : text(v, 80)),
        rotation: reading(p.rotation, enumeration(["IN", "OUT"])),
        acContactor: reading(p.acContactor, enumeration(["OPEN", "CLOSED"])),
        dc1: reading(p.dc1, enumeration(["OPEN", "CLOSED"])),
        dc2: reading(p.dc2, enumeration(["OPEN", "CLOSED"])),
        dc3: reading(p.dc3, enumeration(["OPEN", "CLOSED"])),
        insulationKohm: reading(p.insulationKohm, (v) => num(v, 0)),
        maxIgbtF: reading(p.maxIgbtF, (v) => num(v, -459.67))
      };
    });
    if (new Set(result.pcs.map((p) => p.id)).size !== result.pcs.length) throw new Error("Duplicate PCS identity");
  }
  result.issues.observedAt = stamp(i.observedAt);
  result.issues.quality = quality(i.quality);
  result.issues.omittedGroups = count(i.omittedGroups);
  const categories = row(i.categories);
  for (const key of Object.keys(issueCategories)) {
    const c = row(categories[key]);
    for (const name of ["alarms", "warnings", "info", "unknown", "targets"]) result.issues.categories[key][name] = c[name] === null ? null : count(c[name]);
  }
  result.issues.notes = list(i.notes, 8).map((v) => text(v, 240));
  let targetTotal = 0;
  result.issues.findings = list(i.findings, fleetDetailLimits.groups).map((value2) => {
    const f = row(value2);
    if (typeof f.category !== "string" || !Object.hasOwn(issueCategories, f.category) || typeof f.severity !== "string" || !["alarm", "warning", "info", "unknown"].includes(f.severity)) throw new Error("Invalid finding");
    const targetRows = f.targetRows === void 0 ? void 0 : list(f.targetRows, fleetDetailLimits.targets).map((value3) => {
      const t = row(value3), coordinate = (v) => v === null ? null : count(v);
      return { id: text(t.id, 24), label: text(t.label), array: coordinate(t.array), string: coordinate(t.string), bpc: coordinate(t.bpc), cell: coordinate(t.cell), pcs: coordinate(t.pcs), segment: coordinate(t.segment), ...t.hvacUnit === void 0 ? {} : { hvacUnit: coordinate(t.hvacUnit) }, ...t.block === void 0 ? {} : { block: coordinate(t.block) } };
    });
    targetTotal += targetRows?.length ?? 0;
    if (targetTotal > fleetDetailLimits.targets || targetRows && (targetRows.length > count(f.targetCount) || new Set(targetRows.map((t) => t.id)).size !== targetRows.length)) throw new Error("Invalid target coverage");
    return { code: text(f.code, 80), title: text(f.title), category: f.category, severity: f.severity, targetCount: count(f.targetCount), targets: list(f.targets, 6).map((v) => text(v)), ...targetRows === void 0 ? {} : { targetRows } };
  });
  result.sensors = {
    observedAt: stamp(s.observedAt),
    quality: quality(s.quality),
    trips: s.trips === null ? null : count(s.trips),
    known: count(s.known),
    total: count(s.total),
    omittedTrips: count(s.omittedTrips),
    active: list(s.active, 50).map((value2) => {
      const t = row(value2);
      if (t.condition === void 0) return { id: text(t.id, 200), label: text(t.label), kind: text(t.kind, 80) };
      if (typeof t.condition !== "string" || !["trip", "communication", "temperature", "reported-status"].includes(t.condition)) throw new Error("Invalid sensor condition");
      return {
        id: text(t.id, 200),
        label: text(t.label),
        kind: text(t.kind, 80),
        condition: t.condition,
        status: text(t.status, 80),
        message: text(t.message, 240),
        occurredAt: stamp(t.occurredAt),
        source: text(t.source, 80),
        sourcePath: text(t.sourcePath, 240),
        findings: list(t.findings, 8).map((v) => text(v, 240))
      };
    })
  };
  const visibleTrips = result.sensors.active.filter((t) => !t.condition || t.condition === "trip").length;
  if (result.sensors.known > result.sensors.total || result.sensors.trips !== null && (result.sensors.trips > result.sensors.known || result.sensors.trips < visibleTrips || result.sensors.trips > visibleTrips + result.sensors.omittedTrips)) throw new Error("Invalid sensor coverage");
  return result;
}
function ageFleetDetails(value, now, current) {
  const result = structuredClone(value ?? emptyDetails());
  const age = (q, time2) => q === "unknown" ? "unknown" : !current || !time2 || Date.parse(time2) > now || now - Date.parse(time2) >= 15e3 ? "stale" : q;
  result.quality = age(result.quality, result.observedAt);
  result.issues.quality = age(result.issues.quality, result.issues.observedAt);
  result.sensors.quality = age(result.sensors.quality, result.sensors.observedAt);
  for (const array of result.arrays) {
    array.quality = age(array.quality, array.observedAt);
    array.pcsQuality = age(array.pcsQuality, array.pcsObservedAt);
    array.socQuality = age(array.socQuality ?? "unknown", array.socObservedAt ?? null);
  }
  for (const pcs of result.pcs ?? []) for (const key of ["status", "rotation", "acContactor", "dc1", "dc2", "dc3", "insulationKohm", "maxIgbtF"]) {
    const reading = pcs[key], limit = key === "insulationKohm" || key === "maxIgbtF" ? 12e4 : reading.source === "EMS" ? 15e3 : 2e4;
    if (reading.quality !== "unknown" && (!current || !reading.observedAt || Date.parse(reading.observedAt) > now + 3e4 || now - Date.parse(reading.observedAt) >= limit)) reading.quality = "stale";
  }
  return result;
}

// src/server/fleet/bpcIssueReview.ts
var positive = (n) => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
var compare = (a, b) => (a.array ?? Infinity) - (b.array ?? Infinity) || (a.string ?? Infinity) - (b.string ?? Infinity) || (a.bpc ?? Infinity) - (b.bpc ?? Infinity) || a.id.localeCompare(b.id);
function cellRanges(cells, unspecified = false) {
  const sorted = [...new Set(cells)].sort((a, b) => a - b), parts = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) end = sorted[++i];
    parts.push(start === end ? String(start) : `${start}\u2013${end}`);
  }
  if (unspecified) parts.push("BPC-level / cell not specified");
  return parts.join(", ") || "Not specified";
}
function attachBpcIssueReview(issues, site, arrayNumbers = []) {
  const key = (t) => positive(t.array) && positive(t.string) && positive(t.bpc) && t.pcs === null && (t.block === void 0 || t.block === site.blockIndex) ? JSON.stringify([site.siteId, site.blockId, site.stationCode, site.blockIndex, t.array, t.string, t.bpc]) : null;
  const evidence = () => ({ cells: /* @__PURE__ */ new Set(), unspecified: false, ids: /* @__PURE__ */ new Set() });
  const add2 = (e, t) => {
    e.ids.add(t.id);
    if (t.cell === null) e.unspecified = true;
    else e.cells.add(t.cell);
  };
  const devices = /* @__PURE__ */ new Map();
  const equipment = issues.findings.filter((f) => f.category !== "availability");
  for (const finding of equipment) {
    const grouped = /* @__PURE__ */ new Map();
    const issueKey = JSON.stringify([finding.category, finding.severity, finding.code || finding.title.toLowerCase()]);
    for (const target of finding.targetRows ?? []) {
      const bpcKey = key(target), id = bpcKey ?? `unmapped:${target.id}`;
      let group = grouped.get(id);
      if (!group) {
        group = { row: { ...target, id, cell: bpcKey ? null : target.cell, label: bpcKey ? `Array ${target.array} / String ${target.string} / BPC ${target.bpc}` : target.label, cells: "", reportedTargets: 0, isBpc: !!bpcKey }, evidence: evidence() };
        grouped.set(id, group);
      }
      add2(group.evidence, target);
      if (!bpcKey) continue;
      let device = devices.get(bpcKey);
      if (!device) {
        device = { device: { id: bpcKey, array: target.array, string: target.string, bpc: target.bpc, issues: [], issueCount: 0, severity: "unknown", cells: "", categories: [] }, evidence: evidence(), issues: /* @__PURE__ */ new Map() };
        devices.set(bpcKey, device);
      }
      add2(device.evidence, target);
      let issue = device.issues.get(issueKey);
      if (!issue) {
        issue = { issue: { key: issueKey, code: finding.code, title: finding.title, category: finding.category, severity: finding.severity, cells: "", reportedTargets: 0 }, evidence: evidence() };
        device.issues.set(issueKey, issue);
      }
      add2(issue.evidence, target);
    }
    finding.consolidatedTargets = [...grouped.values()].map(({ row: row4, evidence: e }) => ({ ...row4, cells: cellRanges(e.cells, e.unspecified), reportedTargets: e.ids.size })).sort(compare);
    finding.bpcCounts = { all: 0 };
    for (const { row: row4 } of grouped.values()) if (row4.isBpc) {
      finding.bpcCounts.all++;
      const a = String(row4.array);
      finding.bpcCounts[a] = (finding.bpcCounts[a] ?? 0) + 1;
    }
  }
  const rank2 = { alarm: 0, warning: 1, unknown: 2, info: 3 };
  const rows3 = [...devices.values()].map(({ device, evidence: e, issues: groups }) => {
    device.issues = [...groups.values()].map(({ issue, evidence: e2 }) => ({ ...issue, cells: cellRanges(e2.cells, e2.unspecified), reportedTargets: e2.ids.size })).sort((a, b) => rank2[a.severity] - rank2[b.severity] || a.code.localeCompare(b.code));
    device.issueCount = device.issues.length;
    device.severity = device.issues[0].severity;
    device.cells = cellRanges(e.cells, e.unspecified);
    device.categories = [...new Set(device.issues.map((i) => i.category))];
    return device;
  }).sort((a, b) => a.array - b.array || a.string - b.string || a.bpc - b.bpc);
  const scopes = {};
  const arrays = [...new Set([...arrayNumbers, ...issues.findings.flatMap((f) => f.targetRows ?? []).map((t) => t.array)].filter(positive))];
  const partial = issues.quality === "unknown" || issues.omittedGroups > 0 || equipment.some((f) => f.targetCount > (f.targetRows?.length ?? 0) || f.targetRows?.some((t) => !positive(t.array)));
  for (const array of [null, ...arrays]) for (const category2 of [null, ...Object.keys(issueCategories)]) {
    const selected = rows3.filter((d) => (array === null || d.array === array) && (category2 === null || d.categories.includes(category2)));
    const unmapped2 = /* @__PURE__ */ new Set();
    for (const f of equipment) if (category2 === null || f.category === category2) {
      for (const t of f.targetRows ?? []) if ((array === null || t.array === array) && !key(t)) unmapped2.add(t.id);
    }
    scopes[`${array ?? "all"}:${category2 ?? "all"}`] = { uniqueBpcs: selected.length, multipleIssues: selected.filter((d) => d.issueCount > 1).length, unmappedTargets: unmapped2.size, partial };
  }
  const balancing = equipment.filter((f) => f.code === "2073" || f.code === "2074");
  const quantities = /* @__PURE__ */ new Map();
  for (const device of rows3) {
    const charge = device.issues.some((i) => i.code === "2074"), discharge = device.issues.some((i) => i.code === "2073");
    if (!charge && !discharge) continue;
    const row4 = quantities.get(device.bpc) ?? { bpc: device.bpc, chargeOnly: 0, dischargeOnly: 0, both: 0, quantity: 0 };
    row4.quantity++;
    if (charge && discharge) row4.both++;
    else if (charge) row4.chargeOnly++;
    else row4.dischargeOnly++;
    quantities.set(device.bpc, row4);
  }
  const unmapped = new Set(balancing.flatMap((f) => f.targetRows ?? []).filter((t) => !key(t)).map((t) => t.id));
  const inventoryRows = [...quantities.values()].sort((a, b) => a.bpc - b.bpc);
  const inventoryPartial = issues.quality === "unknown" || issues.omittedGroups > 0 || unmapped.size > 0 || balancing.some((f) => f.targetCount > (f.targetRows?.length ?? 0));
  issues.bpcReview = { devices: rows3, scopes, balancerInventory: { rows: inventoryRows, total: inventoryRows.reduce((sum, row4) => sum + row4.quantity, 0), unmappedTargets: unmapped.size, partial: inventoryPartial } };
}

// src/core/operatingCharts.ts
var powerKeys = ["commandKw", "actualKw", "commandKvar", "actualKvar"];
var operatingChartLimits = { points: 2880, strings: 2560, intervalMs: 3e4, retentionMs: 864e5 };

// src/server/analytics/operatingCharts.ts
var row2 = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var num2 = (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e12 ? v : null;
var time = (v) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? /^\d+$/.test(v) ? Number(v) : Date.parse(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
function parseOperatingCharts(input) {
  if (input === void 0) return void 0;
  const v = row2(input), fail = () => {
    throw Error("Invalid operating charts");
  };
  if (v.version !== 1 || typeof v.site !== "string" || v.site.length > 160 || typeof v.capturedAt !== "number" || !time(v.capturedAt) || v.intervalMs !== operatingChartLimits.intervalMs || v.retentionMs !== operatingChartLimits.retentionMs) fail();
  const bounded = (x, max) => {
    if (!Array.isArray(x) || x.length > max) fail();
    return x;
  };
  const nullable = (x) => {
    if (x === null) return null;
    const n = num2(x);
    if (n === null) fail();
    return n;
  };
  const integer = (x, max) => {
    const n = num2(x);
    if (n === null || !Number.isInteger(n) || n < 0 || n > max) fail();
    return n;
  };
  const stamp4 = (x) => {
    if (x === null) return null;
    const t = time(x);
    if (t === null) fail();
    return t;
  };
  let last = 0;
  const power = bounded(v.power, operatingChartLimits.points).map((value) => {
    const p = row2(value), at = time(p.at);
    if (!at || at <= last || at > Number(v.capturedAt) + 5e3) fail();
    last = at;
    const expected = integer(p.expected, 256), report = row2(p.reporting), reporting = {}, values = {};
    for (const k of powerKeys) {
      reporting[k] = integer(report[k], 256);
      values[k] = nullable(p[k]);
      if (reporting[k] > expected || values[k] !== null && (!expected || reporting[k] !== expected)) fail();
    }
    return { at, observedAt: stamp4(p.observedAt), expected, reporting, ...values };
  });
  const identities = /* @__PURE__ */ new Set();
  const distribution = bounded(v.distribution, operatingChartLimits.strings).map((value) => {
    const d = row2(value), array = integer(d.array, 64), string = integer(d.string, 9999), id = `${array}:${string}`;
    if (!array || !string || identities.has(id) || typeof d.label !== "string" || d.label.length > 80) fail();
    identities.add(id);
    return { array, string, label: d.label, observedAt: stamp4(d.observedAt), voltageMv: nullable(d.voltageMv), temperatureF: nullable(d.temperatureF), currentA: nullable(d.currentA), powerKw: nullable(d.powerKw), socPct: nullable(d.socPct), stringVoltageV: nullable(d.stringVoltageV), busVoltageV: nullable(d.busVoltageV), energyKwh: nullable(d.energyKwh) };
  });
  if (v.recordingError !== null && (typeof v.recordingError !== "string" || v.recordingError.length > 160)) fail();
  return { version: 1, site: v.site, capturedAt: v.capturedAt, intervalMs: operatingChartLimits.intervalMs, retentionMs: operatingChartLimits.retentionMs, power, distribution, recordingError: v.recordingError };
}

// src/server/fleet/powerFlow.ts
var labels = { charging: "Charging", discharging: "Discharging", idle: "Idle", unknown: "Direction unavailable", stale: "Stale \xB7 flow withheld" };
var ttl = 15e3;
var POWER_FLOW_IDLE_KW = 15;
function projectSitePowerFlow(site, now) {
  const supported = ["BHE0020", "BHE0021"].includes(site.stationCode);
  const reading = (power, stamp4, quality3) => {
    const at = stamp4 ? Date.parse(stamp4) : NaN;
    const known = supported && power !== null && Number.isFinite(power) && Number.isFinite(at) && at <= now;
    const fresh = known && site.status === "current" && quality3 === "live" && now - at < ttl;
    const direction = !known || quality3 === "unknown" ? "unknown" : !fresh ? "stale" : power < -POWER_FLOW_IDLE_KW ? "charging" : power > POWER_FLOW_IDLE_KW ? "discharging" : "idle";
    return { direction, powerKw: known ? power : null, observedAt: stamp4, label: labels[direction], validUntil: fresh ? at + ttl : null };
  };
  const r = site.metrics?.powerKw ?? { value: null, observedAt: null, quality: "unknown", source: "Unavailable" };
  const net = reading(r.value, r.observedAt, r.source === "EMS Modbus" ? r.quality : "unknown");
  const arrays = (site.details?.arrays ?? []).map((a) => {
    const percent = a.socPct, stamp4 = a.socObservedAt ?? null, at = stamp4 ? Date.parse(stamp4) : NaN;
    const known = typeof percent === "number" && Number.isFinite(percent) && percent >= 0 && percent <= 100 && Number.isFinite(at) && at <= now && a.socQuality !== void 0 && a.socQuality !== "unknown";
    const fresh = known && site.status === "current" && a.socQuality === "live" && now - at < ttl;
    const connected = a.onlineStrings, total = a.stringCount;
    const countsValid = typeof connected === "number" && Number.isSafeInteger(connected) && connected >= 0 && typeof total === "number" && Number.isSafeInteger(total) && total > 0 && connected <= total;
    const coverage = known && countsValid ? { connected, total, label: `${connected}/${total} strings connected`, partial: connected < total } : null;
    const soc = { percent: known ? percent : null, quality: !known ? "unknown" : fresh ? "live" : "stale", observedAt: stamp4, validUntil: fresh ? at + ttl : null, source: "EMS array online SOC", coverage };
    return { array: a.number, ...reading(a.powerKw, a.pcsObservedAt, a.pcsQuality), soc };
  });
  const mixed = arrays.some((a) => a.direction === "charging") && arrays.some((a) => a.direction === "discharging");
  return {
    version: 1,
    net,
    arrays,
    mixed,
    partial: !arrays.length || !!site.details?.omittedArrays || arrays.some((a) => ["unknown", "stale"].includes(a.direction)),
    source: "EMS Modbus net real power \xB7 Canonical PCS AC power by array",
    note: "Power-flow schematic, not switch-position or DC-current telemetry. Net site flow may differ from individual arrays. \xB115 kW is shown as idle; animation speed does not represent power magnitude."
  };
}

// src/server/fleet/FleetBroker.ts
var FLEET_TTL_MS = 15e3;
var record = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var identifier = (v) => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(v);
var IdentityConflict = class extends Error {
};
function parseEnrollment(value) {
  if (!record(value) || !identifier(value.siteId) || !identifier(value.blockId) || !identifier(value.stationCode) || !Number.isSafeInteger(value.blockIndex) || Number(value.blockIndex) < 1 || typeof value.name !== "string" || !value.name.trim() || value.name.length > 120) throw new Error("Invalid fleet site enrollment");
  return { siteId: value.siteId, blockId: value.blockId, stationCode: value.stationCode, blockIndex: Number(value.blockIndex), name: value.name };
}
function observationAge(stamp4, now) {
  if (!stamp4) return null;
  const time2 = Date.parse(stamp4);
  return Number.isFinite(time2) && time2 <= now ? now - time2 : null;
}
var validStamp = (value) => value === null || typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
function parseSummary(value, site) {
  if (!record(value)) throw new Error("Invalid site summary");
  for (const key of ["siteId", "blockId", "stationCode", "blockIndex"]) if (value[key] !== site[key]) throw new IdentityConflict("Collector identity conflict");
  if (value.schema !== "prizm-site-summary-v1" || typeof value.stale !== "boolean" || !validStamp(value.observedAt) || !record(value.metrics)) throw new Error("Invalid site summary");
  const metrics = emptyMetrics();
  for (const key of metricKeys) {
    const r = value.metrics[key];
    if (!record(r) || !(r.value === null || typeof r.value === "number" && Number.isFinite(r.value)) || !validStamp(r.observedAt) || typeof r.quality !== "string" || !["live", "stale", "unknown"].includes(r.quality) || typeof r.source !== "string" || r.source.length > 120) throw new Error("Invalid metric");
    const v = r.value;
    if (v !== null && (Math.abs(v) > 1e12 || key === "socPct" && (v < 0 || v > 100) || ["chargeKw", "dischargeKw", "capacityKwh", "storedKwh", "strings", "warnings", "alarms"].includes(key) && v < 0 || ["strings", "warnings", "alarms"].includes(key) && !Number.isSafeInteger(v))) throw new Error("Invalid metric range");
    metrics[key] = { value: v, observedAt: r.observedAt, quality: r.quality, source: r.source };
  }
  const details = parseFleetDetails(value.details);
  const operatingCharts = parseOperatingCharts(value.operatingCharts);
  if (operatingCharts && operatingCharts.site !== `${site.stationCode} / Block ${site.blockIndex}`) throw new IdentityConflict("Chart site identity conflict");
  if (process.env.PRIZM_FLEET_BPC_REVIEW !== "false") attachBpcIssueReview(details.issues, site, details.arrays.map((a) => a.number));
  return {
    schema: "prizm-site-summary-v1",
    siteId: site.siteId,
    blockId: site.blockId,
    stationCode: site.stationCode,
    blockIndex: site.blockIndex,
    stale: value.stale,
    observedAt: value.observedAt,
    metrics,
    details,
    ...operatingCharts ? { operatingCharts } : {}
  };
}
var FleetBroker = class {
  constructor(sites, now = Date.now) {
    this.now = now;
    this.entries = /* @__PURE__ */ new Map();
    if (!sites.length || sites.length > 16) throw new Error("Enroll between 1 and 16 sites");
    this.sites = sites.map(parseEnrollment);
    if (new Set(this.sites.map((s) => s.siteId)).size !== sites.length) throw new Error("Duplicate site ID");
    if (new Set(this.sites.map((s) => JSON.stringify([s.stationCode, s.blockIndex]))).size !== sites.length) throw new Error("Duplicate station/block enrollment");
  }
  enrollments() {
    return structuredClone(this.sites);
  }
  accept(siteId, payload) {
    const site = this.sites.find((s) => s.siteId === siteId);
    if (!site) throw new Error("Unknown collector");
    try {
      const summary = parseSummary(payload, site), previous = this.entries.get(siteId);
      if (summary.observedAt && observationAge(summary.observedAt, this.now()) === null) throw new Error("Future observation");
      if (previous?.summary?.observedAt && summary.observedAt && Date.parse(summary.observedAt) < Date.parse(previous.summary.observedAt)) throw new Error("Out-of-order summary");
      this.entries.set(siteId, { summary, receivedAt: new Date(this.now()).toISOString(), failure: null });
    } catch (error) {
      this.fail(siteId, error instanceof IdentityConflict ? "identity-conflict" : "unavailable");
      throw error;
    }
  }
  fail(siteId, failure = "unavailable") {
    if (!this.sites.some((s) => s.siteId === siteId)) throw new Error("Unknown collector");
    const previous = this.entries.get(siteId);
    this.entries.set(siteId, { summary: previous?.summary ?? null, receivedAt: previous?.receivedAt ?? null, failure });
  }
  view(allowedIds) {
    const now = this.now();
    const sites = this.sites.filter((s) => allowedIds.has(s.siteId)).map((site) => {
      const entry = this.entries.get(site.siteId), summary = entry?.summary, ageMs = observationAge(summary?.observedAt ?? null, now);
      const status = entry?.failure ?? (!summary ? "unavailable" : summary.stale || ageMs === null || ageMs >= FLEET_TTL_MS ? "stale" : "current");
      const metrics = structuredClone(summary?.metrics ?? emptyMetrics());
      for (const key of metricKeys) {
        const r = metrics[key], age = observationAge(r.observedAt, now);
        if (status !== "current" || age === null || age >= FLEET_TTL_MS) r.quality = r.value === null ? "unknown" : "stale";
      }
      const view = { ...site, status, observedAt: summary?.observedAt ?? null, ageMs, lastReceivedAt: entry?.receivedAt ?? null, metrics, details: ageFleetDetails(summary?.details, now, status === "current"), operatingCharts: status === "identity-conflict" ? void 0 : structuredClone(summary?.operatingCharts) };
      if (process.env.PRIZM_FLEET_POWER_FLOW !== "false") view.powerFlow = projectSitePowerFlow(view, now);
      attachFleetHvacs(view.details.issues);
      return view;
    });
    const totals = Object.fromEntries(metricKeys.map((key) => {
      const eligible = sites.filter((s) => s.status === "current" && s.metrics[key].quality === "live" && s.metrics[key].value !== null && (key !== "socPct" || s.metrics.capacityKwh.quality === "live" && (s.metrics.capacityKwh.value ?? 0) > 0));
      const contributors = eligible.map((s) => s.siteId), excluded = sites.filter((s) => !contributors.includes(s.siteId)).map((s) => s.siteId);
      const value = !eligible.length ? null : key === "socPct" ? eligible.reduce((n, s) => n + s.metrics.socPct.value * s.metrics.capacityKwh.value, 0) / eligible.reduce((n, s) => n + s.metrics.capacityKwh.value, 0) : eligible.reduce((n, s) => n + s.metrics[key].value, 0);
      return [key, { value, contributors, excluded, complete: sites.length > 0 && !excluded.length }];
    }));
    return { schema: "prizm-fleet-v1", generatedAt: new Date(now).toISOString(), readOnly: true, sites, totals };
  }
};

// src/server/fleet/detailProjection.ts
var import_node_crypto = require("node:crypto");

// src/server/fleet/pcsProjection.ts
var row3 = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var stamp2 = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
var positive2 = (v) => typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null;
var text2 = (v) => typeof v === "string" && v.trim() ? v.slice(0, 80) : null;
var numeric = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
function sameFleetSite(a, b) {
  const left = row3(a), right = row3(b);
  return typeof left.stationCode === "string" && ["stationCode", "blockIndex", "activeProfileId", "emsBaseUrl"].every((k) => left[k] === right[k]);
}
function projectFleetPcs(view, identity2) {
  const data = row3(view);
  if (!sameFleetSite(identity2, data.siteIdentity) || !Array.isArray(data.pcs)) return [];
  const entries = data.pcs.map(row3);
  return entries.slice(0, 64).flatMap((p) => {
    const array = positive2(p.arrayNumber ?? p.arrayIndex), number2 = positive2(p.pcsNumber ?? p.pcsIndex);
    if (array === null || number2 === null) return [];
    const unambiguous = entries.filter((other) => (other.arrayNumber ?? other.arrayIndex) === array).length === 1;
    const sw = unambiguous ? row3(p.pcsSwitches) : {}, points = row3(sw.smaProcessData);
    const source2 = sw.source === "SMA_MQTT" ? "SMA stream" : sw.source === "SMA_WEB_PROCESS_DATA" ? "SMA HTTP" : sw.source === "SMA_MODBUS" ? "PCS Modbus" : "Unknown";
    const emsAt = stamp2(p.fetchedAt), switchAt = stamp2(sw.capturedAt);
    const emsQuality = !emsAt ? "unknown" : p.stale === true || p.sourceOk !== true || p.communicating !== true ? "stale" : "live";
    const switchQuality = !switchAt || source2 === "Unknown" ? "unknown" : sw.stale !== false || sw.error ? "stale" : "live";
    const reading = (value, quality3, observedAt, source3) => ({ value, quality: value === null ? "unknown" : quality3, observedAt, source: source3 });
    const contact = (key) => reading(["OPEN", "CLOSED"].includes(String(sw[key])) ? String(sw[key]) : null, switchQuality, switchAt, source2);
    const process2 = (key, fahrenheit = false) => {
      const point = row3(points[key]), at = stamp2(point.freshnessBasis === "stream-progression" ? point.freshnessAt : point.observedAt), valid = (point.readingState === "live" || point.readingState === "stale") && at !== null && source2 !== "Unknown";
      const rawValue = valid ? numeric(point.value) : null, value = rawValue !== null && rawValue >= (fahrenheit ? -273.15 : 0) ? rawValue : null;
      const pointSource = point.source === "SMA_WEB_PROCESS_DATA" ? "SMA HTTP" : point.source === "SMA_MODBUS" ? "PCS Modbus" : source2;
      return {
        ...reading(value === null ? null : fahrenheit ? value * 1.8 + 32 : value, point.readingState === "live" ? "live" : "stale", at, pointSource),
        ...point.freshnessBasis === "stream-progression" ? { deviceObservedAt: stamp2(point.observedAt), clockSkew: point.clockSkew === true } : {}
      };
    };
    const directStatus = text2(sw.inverterOperatingState);
    return [{
      id: `A${array}-PCS${number2}`,
      array,
      number: number2,
      status: directStatus && switchQuality === "live" ? reading(directStatus, switchQuality, switchAt, source2) : reading(text2(p.state), emsQuality, emsAt, "EMS"),
      rotation: reading(["IN", "OUT"].includes(String(p.rotationStatus)) ? String(p.rotationStatus) : null, emsQuality, emsAt, "EMS"),
      acContactor: contact("acSwitch"),
      dc1: contact("dcSwitch1"),
      dc2: contact("dcSwitch2"),
      dc3: contact("dcSwitch3"),
      insulationKohm: process2("insulationResistanceKOhm"),
      maxIgbtF: process2("maxIgbtTemperatureC", true)
    }];
  });
}

// src/server/telemetry/arrayCellMetrics.ts
var numeric2 = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
var identity = (...values) => values.map(numeric2).find((n) => n !== null && Number.isInteger(n) && n > 0);
var rows = (value) => Array.isArray(value) ? value.filter((r) => r && typeof r === "object") : [];
function buildArrayCellMetrics(strings, summaries) {
  const groups = /* @__PURE__ */ new Map();
  const expected = /* @__PURE__ */ new Map();
  for (const row4 of rows(summaries)) {
    const id = identity(row4.arrayNumber, row4.arrayIndex, row4.array);
    if (id === void 0) continue;
    groups.set(id, /* @__PURE__ */ new Map());
    expected.set(id, Math.max(0, numeric2(row4.stringCount) ?? 0));
  }
  for (const row4 of rows(strings)) {
    const id = identity(row4.arrayNumber, row4.arrayIndex, row4.array);
    const string = identity(row4.stringNumber, row4.stringIndex);
    if (id === void 0 || string === void 0) continue;
    if (!groups.has(id)) groups.set(id, /* @__PURE__ */ new Map());
    if (!groups.get(id).has(string)) groups.get(id).set(string, row4);
  }
  return [...groups].sort(([a], [b]) => a - b).map(([arrayNumber, group]) => {
    const expectedStrings = Math.max(expected.get(arrayNumber) ?? 0, group.size);
    const eligible = [...group.values()].filter((r) => r.communicating !== false && r.badReport !== true && r.stalePreserved !== true && r.stale !== true);
    const range2 = (minKey, avgKey, maxKey) => {
      const values = eligible.flatMap((r) => {
        const minimum2 = numeric2(r[minKey]), average = numeric2(r[avgKey]), maximum2 = numeric2(r[maxKey]);
        if (minimum2 === null || average === null || maximum2 === null || minimum2 > average || average > maximum2) return [];
        return [{ minimum: minimum2, average, maximum: maximum2 }];
      });
      const minimum = values.length ? Math.min(...values.map((v) => v.minimum)) : null;
      const maximum = values.length ? Math.max(...values.map((v) => v.maximum)) : null;
      return {
        average: values.length ? values.reduce((sum, v) => sum + v.average, 0) / values.length : null,
        minimum,
        maximum,
        delta: minimum !== null && maximum !== null ? maximum - minimum : null,
        reportingStrings: values.length,
        expectedStrings,
        partial: values.length < expectedStrings
      };
    };
    return {
      arrayNumber,
      averageBasis: "mean-of-string-averages",
      temperatureC: range2("minCellTempC", "avgCellTempC", "maxCellTempC"),
      voltageMv: range2("minCellVoltageMv", "avgCellVoltageMv", "maxCellVoltageMv")
    };
  });
}

// src/server/fleet/detailProjection.ts
var object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var rows2 = (v) => Array.isArray(v) ? v.map(object) : [];
var number = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
var text3 = (v, max = 160) => typeof v === "string" ? v.slice(0, max) : "";
var stamp3 = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
var index = (r) => number(r.arrayNumber) ?? number(r.arrayIndex);
var collection = (r) => r.isCollectionSegment === true || /collection/i.test(text3(r.segmentType)) || r.hasCells === false;
var quality2 = (r) => r.stale === true || r.communicating === false || r.sourceOk === false ? "stale" : "live";
var category = (group) => group.section === "availability" ? "availability" : group.category === "HVAC / Environmental" ? "hvac" : group.category === "String / Cell" ? "battery" : group.category === "PCS" ? "pcs" : "other";
function buildFleetDetails(view, snapshot) {
  const data = object(view), snap = object(snapshot), identity2 = object(data.siteIdentity), snapshotIdentity = object(snap.siteIdentity);
  const sameSite = typeof identity2.stationCode === "string" && identity2.stationCode === snapshotIdentity.stationCode && identity2.blockIndex === snapshotIdentity.blockIndex && ["activeProfileId", "emsBaseUrl"].every((key) => identity2[key] === snapshotIdentity[key]);
  const normalized = sameSite ? object(snap.normalized) : {}, live = object(data.liveStatus), result = emptyDetails();
  result.observedAt = stamp3(live.lastUpdated);
  result.quality = live.stale === false && live.liveSucceeded === true && live.cacheUsed !== true ? "live" : "stale";
  result.pcs = projectFleetPcs(data.fleetPcsView, identity2);
  const strings = rows2(normalized.strings).filter((r) => !collection(r));
  const summaries = rows2(data.arraySummary), pcs = rows2(data.pcsSummary), health = rows2(data.sourceHealth);
  const metrics = buildArrayCellMetrics(strings, summaries);
  const ids = [...new Set([...summaries, ...pcs].map(index).filter((n) => n !== null && Number.isSafeInteger(n) && n > 0))].sort((a, b) => a - b);
  result.omittedArrays = Math.max(0, ids.length - 64);
  result.arrays = ids.slice(0, 64).map((id) => {
    const summary = summaries.find((r) => index(r) === id) ?? {}, inverters = pcs.filter((r) => index(r) === id), inverter = inverters.length === 1 ? inverters[0] : {};
    const cells = metrics.find((m) => m.arrayNumber === id), stringSource = health.find((h) => h.name === `array-${id}-report`) ?? health.find((h) => h.name === "strings");
    const rotation = text3(inverter.rotationStatus).toUpperCase();
    const reportAt = stamp3(stringSource?.lastUpdated);
    const cellQuality = !reportAt || !cells || !cells.temperatureC.reportingStrings && !cells.voltageMv.reportingStrings ? "unknown" : stringSource?.stale === true || stringSource?.ok !== true || result.quality !== "live" ? "stale" : "live";
    return {
      number: id,
      observedAt: reportAt,
      quality: cellQuality,
      stringCount: number(summary.stringCount),
      onlineStrings: number(summary.onlineStringCount),
      outOfRotation: number(summary.outOfRotationCount),
      socPct: number(summary.onlineSOC),
      powerKw: number(inverter.acRealPowerKW),
      busVoltage: number(summary.voltageVolt),
      socObservedAt: reportAt,
      socQuality: !reportAt || number(summary.onlineSOC) === null ? "unknown" : stringSource?.stale === true || stringSource?.ok !== true || result.quality !== "live" ? "stale" : "live",
      pcsState: text3(inverter.state, 80) || (inverters.length > 1 ? "Multiple PCS units" : "Not reported"),
      rotation: rotation === "IN" ? "IN" : rotation === "OUT" ? "OUT" : "UNKNOWN",
      pcsQuality: inverters.length === 1 ? quality2(inverter) : "unknown",
      pcsObservedAt: stamp3(inverter.fetchedAt),
      temperatureC: cells?.temperatureC ?? emptyRange(),
      voltageMv: cells?.voltageMv ?? emptyRange()
    };
  });
  const review = object(data.notificationReview ?? normalized.notificationReview);
  if (review.version === 1 && Array.isArray(review.groups)) {
    const groups = rows2(review.groups);
    result.issues.observedAt = stamp3(review.capturedAt);
    result.issues.quality = result.quality;
    result.issues.notes = (Array.isArray(review.sourceWarnings) ? review.sourceWarnings : []).filter((v) => typeof v === "string").slice(0, 8).map((v) => v.slice(0, 240));
    for (const key of Object.keys(issueCategories)) {
      const members = groups.filter((g) => category(g) === key), sets = { alarms: /* @__PURE__ */ new Set(), warnings: /* @__PURE__ */ new Set(), info: /* @__PURE__ */ new Set(), unknown: /* @__PURE__ */ new Set(), targets: /* @__PURE__ */ new Set() };
      for (const group of members) {
        const severity = ["alarm", "critical"].includes(text3(group.severity)) ? "alarms" : group.severity === "warning" ? "warnings" : group.severity === "info" ? "info" : "unknown";
        for (const target of rows2(group.targets)) {
          const id = text3(target.id, 600);
          if (id) {
            sets[severity].add(id);
            sets.targets.add(id);
          }
        }
      }
      result.issues.categories[key] = Object.fromEntries(Object.entries(sets).map(([name, set]) => [name, set.size]));
    }
    const rank2 = { critical: 0, alarm: 0, warning: 1, unknown: 2, info: 3 };
    const ordered = [...groups].sort((a, b) => (rank2[text3(a.severity)] ?? 2) - (rank2[text3(b.severity)] ?? 2));
    let targetBudget = fleetDetailLimits.targets, byteBudget = Math.max(0, 3 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(data.operatingCharts ?? {}), "utf8"));
    result.issues.findings = ordered.slice(0, fleetDetailLimits.groups).map((group) => {
      const uniqueTargets = [...new Map(rows2(group.targets).filter((t) => text3(t.id, 600)).map((t) => [text3(t.id, 600), t])).values()];
      const targetRows = uniqueTargets.map((target) => {
        const location = object(target.location);
        const coordinate = (v) => {
          const n = number(v);
          return n !== null && Number.isSafeInteger(n) && n >= 0 ? n : null;
        };
        return {
          id: (0, import_node_crypto.createHash)("sha256").update(text3(target.id, 600)).digest("hex").slice(0, 24),
          label: text3(target.label),
          array: coordinate(target.array ?? location.array),
          string: coordinate(location.string),
          bpc: coordinate(location.bpc),
          cell: coordinate(location.cell),
          pcs: coordinate(location.pcs),
          segment: coordinate(location.segment),
          hvacUnit: coordinate(location.unit),
          ...location.block === void 0 ? {} : { block: coordinate(location.block) }
        };
      }).sort((a, b) => (a.array ?? Infinity) - (b.array ?? Infinity) || (a.string ?? Infinity) - (b.string ?? Infinity) || (a.segment ?? Infinity) - (b.segment ?? Infinity) || (a.pcs ?? Infinity) - (b.pcs ?? Infinity) || (a.bpc ?? Infinity) - (b.bpc ?? Infinity) || (a.cell ?? Infinity) - (b.cell ?? Infinity) || a.label.localeCompare(b.label)).slice(0, targetBudget).filter((target) => {
        const bytes = Buffer.byteLength(JSON.stringify(target), "utf8");
        if (bytes > byteBudget) return false;
        byteBudget -= bytes;
        return true;
      });
      targetBudget -= targetRows.length;
      return {
        code: text3(group.code, 80),
        title: text3(group.title),
        category: category(group),
        severity: ["alarm", "critical"].includes(text3(group.severity)) ? "alarm" : group.severity === "warning" ? "warning" : group.severity === "info" ? "info" : "unknown",
        targetCount: uniqueTargets.length,
        targetRows,
        targets: targetRows.slice(0, 6).map((t) => t.label)
      };
    });
    result.issues.omittedGroups = Math.max(0, ordered.length - fleetDetailLimits.groups);
  } else result.issues.notes = ["Detailed notification review is not available from this collector. Site totals remain separate."];
  const sensors = rows2(normalized.sensors), unique = /* @__PURE__ */ new Map();
  for (const sensor of sensors) {
    const id = text3(sensor.id);
    if (id && sensor.stationCode === identity2.stationCode && sensor.blockIndex === identity2.blockIndex) unique.set(id, sensor);
  }
  const active = [];
  let known = 0, total = 0, trips = 0;
  for (const [id, sensor] of unique) {
    const add2 = (key, kind, condition, status, message) => {
      active.push({
        id: `${id}:${key}`,
        label: text3(sensor.displayLabel) || id,
        kind,
        condition,
        status,
        message,
        occurredAt: stamp3(sensor[key + "TrippedTimestamp"]),
        source: text3(sensor.source, 80),
        sourcePath: text3(object(object(sensor.sensors)[key]).sourcePath || sensor.sourcePath, 240),
        findings: (Array.isArray(sensor.findings) ? sensor.findings : []).filter((v) => typeof v === "string").slice(0, 8).map((v) => text3(v, 240))
      });
    };
    if (sensor.segmentCommunicating === false) add2("segmentCommunications", "Enclosure communications", "communication", "OFFLINE", "Enclosure communications link offline; sensor states cannot be confirmed.");
    for (const [key, label] of [["heat", "Heat detector"], ["gas", "Gas detector"], ["smoke", "Smoke detector"], ["fireSuppression", "Fire suppression"]]) {
      total++;
      const state = text3(sensor[key + "Status"], 80), communicating = sensor.segmentCommunicating === true && sensor[key + "Communicating"] === true;
      if (state === "NOT_INSTALLED") continue;
      if (communicating && (state === "TRIPPED" || state === "NOT_TRIPPED")) {
        known++;
        if (state === "TRIPPED") {
          trips++;
          add2(key, label, "trip", state, `${label} reports a physical trip.`);
        }
      } else if (sensor.segmentCommunicating === true && sensor[key + "Communicating"] === false) {
        add2(key, label, "communication", state || "NOT_REPORTED", `${label} communication lost; the reported state is not confirmed current.`);
      } else if (communicating && state && !["NOT_INSTALLED", "UNKNOWN", "UNAVAILABLE"].includes(state)) {
        add2(key, label, "reported-status", state, `${label} reports ${state}. This is not classified as a confirmed physical trip.`);
      }
    }
    if (sensor.segmentCommunicating === true && sensor.temperatureCommunicating === false) add2("temperature", "Temperature sensor", "communication", text3(sensor.temperatureStatus, 80) || "NOT_REPORTED", "Temperature sensor communication lost.");
    else if (sensor.segmentCommunicating === true && sensor.temperatureCommunicating === true && sensor.temperatureStatus === "HIGH") {
      const reading = number(sensor.temperatureValue), unit = text3(sensor.temperatureUnit).toUpperCase(), fahrenheit = reading === null ? null : unit === "F" ? reading : unit === "C" ? reading * 1.8 + 32 : null;
      add2("temperature", "Temperature sensor", "temperature", "HIGH", `High temperature reported${fahrenheit === null ? "" : `: ${Number(fahrenheit.toFixed(1))} \xB0F`}.`);
    }
  }
  const priority = { trip: 0, temperature: 1, "reported-status": 2, communication: 3 };
  active.sort((a, b) => priority[a.condition] - priority[b.condition]);
  result.sensors = { observedAt: total ? result.observedAt : null, quality: total ? result.quality : "unknown", trips: known ? trips : null, known, total, active: active.slice(0, 50), omittedTrips: Math.max(0, active.length - 50) };
  return result;
}

// src/server/fleet/siteSummary.ts
var obj = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
function parseCollectorIdentity(value) {
  const row4 = obj(value), site = parseEnrollment(value);
  if (typeof row4.profileId !== "string" || !row4.profileId || typeof row4.emsBaseUrl !== "string") throw new Error("Collector profile and EMS enrollment required");
  const url = new URL(row4.emsBaseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Invalid enrolled EMS URL");
  return { ...site, profileId: row4.profileId, emsBaseUrl: row4.emsBaseUrl };
}
function buildSiteSummary(view, enrolled) {
  const data = obj(view), identity2 = obj(data.siteIdentity), live = obj(data.liveStatus);
  if (identity2.activeProfileId !== enrolled.profileId || identity2.stationCode !== enrolled.stationCode || identity2.blockIndex !== enrolled.blockIndex || identity2.emsBaseUrl !== enrolled.emsBaseUrl) throw new IdentityConflict("Active collector profile does not match enrollment");
  const stamp4 = typeof live.lastUpdated === "string" ? live.lastUpdated : null;
  const stale = live.stale !== false || live.liveSucceeded !== true || live.cacheUsed === true || !["LIVE", "PARTIAL"].includes(String(live.state));
  const metrics = emptyMetrics();
  const put = (key, value, observedAt, valid, source2) => {
    if (typeof value === "number" && Number.isFinite(value)) metrics[key] = { value, observedAt, quality: valid ? "live" : "stale", source: source2 };
  };
  const modbus = obj(obj(data.blockOperatingSummary).modbus), health = obj(data.modbusTelemetry);
  const modbusStamp = typeof health.capturedAt === "string" ? health.capturedAt : null;
  for (const [key, field] of Object.entries({
    powerKw: "measuredKW",
    reactiveKvar: "measuredKVAR",
    targetKw: "targetKW",
    chargeKw: "availableChargeKW",
    dischargeKw: "availableDischargeKW",
    socPct: "stateOfChargePct"
  })) {
    put(key, modbus[field], modbusStamp, health.available === true && health.stale === false, "EMS Modbus");
  }
  put("capacityKwh", obj(data.fleetCapacity).installedCapacityKWh, stamp4, !stale, "Canonical installed capacity (may be profile-derived)");
  put("strings", obj(data.stringSummary).totalStrings, stamp4, !stale && obj(data.stringSummary).valid === true, "Canonical string inventory");
  const topology = obj(data.topologyStatus);
  put("warnings", topology.warningTargetCount, stamp4, !stale, "Canonical warning targets");
  put("alarms", topology.alarmTargetCount, stamp4, !stale, "Canonical alarm targets");
  return parseSummary({ schema: "prizm-site-summary-v1", ...enrolled, observedAt: stamp4, stale, metrics, details: buildFleetDetails(data, data.fleetDetailSnapshot), operatingCharts: data.operatingCharts }, enrolled);
}

// src/server/fleet/blockPowerFlow.ts
function buildBlockPowerFlow(view, now = Date.now()) {
  if (process.env.PRIZM_FLEET_POWER_FLOW === "false") return void 0;
  const data = object(view), identity2 = object(data.siteIdentity);
  try {
    const enrollment = parseCollectorIdentity({
      siteId: "block-power-flow",
      blockId: `b${identity2.blockIndex}`,
      name: String(identity2.stationCode),
      stationCode: identity2.stationCode,
      blockIndex: identity2.blockIndex,
      profileId: identity2.activeProfileId,
      emsBaseUrl: identity2.emsBaseUrl
    });
    const compact = {
      siteIdentity: data.siteIdentity,
      liveStatus: data.liveStatus,
      blockOperatingSummary: data.blockOperatingSummary,
      modbusTelemetry: data.modbusTelemetry,
      arraySummary: data.arraySummary,
      pcsSummary: data.pcsSummary,
      sourceHealth: data.sourceHealth
    };
    const broker = new FleetBroker([enrollment], () => now);
    broker.accept(enrollment.siteId, buildSiteSummary(compact, enrollment));
    return broker.view(/* @__PURE__ */ new Set([enrollment.siteId])).sites[0].powerFlow;
  } catch {
    return void 0;
  }
}

// scripts/hvac-review-deployment-verifier.ts
function verifyHvacReview(review, issues) {
  (0, import_strict.default)(review?.hvacReview, "Published HVAC review missing");
  (0, import_strict.default)(Array.isArray(review.guidanceGaps), "Published documentation audit missing");
  import_strict.default.deepEqual(review.hvacReview, projectNotificationHvacs(review));
  import_strict.default.deepEqual(review.guidanceGaps, auditNotificationGuidance(review));
  const expected = structuredClone(issues);
  attachFleetHvacs(expected);
  import_strict.default.deepEqual(issues.hvacReview, expected.hvacReview);
  for (const model of [review.hvacReview, issues.hvacReview]) {
    import_strict.default.equal(new Set(model.devices.map((t) => t.id)).size, model.devices.length);
    for (const target of model.devices) {
      (0, import_strict.default)(Number.isSafeInteger(target.unit) && target.unit > 0);
      (0, import_strict.default)(!target.issues.some((i) => /\b(FSS|fire suppression|smoke|gas sensor)\b/i.test(`${i.code} ${i.title}`)));
    }
  }
  return {
    canonicalMappedHvacTargets: review.hvacReview.devices.length,
    fleetMappedHvacTargets: issues.hvacReview.devices.length,
    unresolvedTargets: issues.hvacReview.unassigned.length,
    guidanceGaps: review.guidanceGaps.length,
    partial: issues.hvacReview.partial
  };
}

// scripts/corrective-deployment-verifier.ts
function verifyCorrectiveReview(review, revision, station) {
  (0, import_strict2.default)(Number.isSafeInteger(revision) && revision >= 0);
  import_strict2.default.equal(review.guidanceRevision, revision);
  (0, import_strict2.default)(review.bpcReview, "Canonical BPC review must remain available");
  const before = JSON.stringify(review);
  const all = correctivePacket(review, review.groups, "all", "", station, false);
  import_strict2.default.equal(all.targets.length, review.groups.reduce((n, g) => n + g.targets.length, 0));
  const balancing = review.groups.filter((g) => ["2073", "2074"].includes(g.code));
  const selected = correctivePacket(
    review,
    review.groups,
    "all",
    "",
    station,
    false,
    {},
    { keys: new Set(exportTargetKeys(balancing)), includeSiteInventory: false }
  );
  (0, import_strict2.default)(selected.selected.every((g) => ["2073", "2074"].includes(g.code)));
  import_strict2.default.equal(selected.targets.length, balancing.reduce((n, g) => n + g.targets.length, 0));
  import_strict2.default.equal(new Set(selected.bpcChecklist.map((d) => d.id)).size, selected.bpcChecklist.length);
  (0, import_strict2.default)(selected.bpcChecklist.every((d) => d.codes.every((c) => ["2073", "2074"].includes(c))));
  import_strict2.default.equal(selected.inventory, void 0);
  import_strict2.default.equal(correctivePacket(
    review,
    review.groups,
    "all",
    "",
    station,
    false,
    {},
    { keys: /* @__PURE__ */ new Set(), includeSiteInventory: false }
  ).targets.length, 0);
  (0, import_strict2.default)(packetCsv(selected).startsWith('"Site","Snapshot (UTC)"'));
  import_strict2.default.equal(JSON.stringify(review), before, "Export preparation must not modify the snapshot");
  return {
    revision,
    codeGroups: review.groups.length,
    targetRows: all.targets.length,
    balancingTargetRows: selected.targets.length,
    uniqueBalancingBpcs: selected.bpcChecklist.length,
    selectionAndCanonicalParity: true
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FleetBroker,
  buildBlockPowerFlow,
  parseSummary,
  verifyCorrectiveReview,
  verifyHvacReview
});
