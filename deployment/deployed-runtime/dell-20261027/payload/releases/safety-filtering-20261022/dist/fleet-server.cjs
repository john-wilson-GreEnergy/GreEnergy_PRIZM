var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// src/server/fleet/main.ts
var import_node_path9 = __toESM(require("node:path"), 1);
var import_express8 = __toESM(require("express"), 1);

// src/server/fleet/mobileApp.ts
var import_express3 = __toESM(require("express"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);
var import_promises3 = require("node:fs/promises");

// src/server/fleet/fleetApp.ts
var import_express2 = __toESM(require("express"), 1);

// src/core/fleet/pollingCadence.ts
function fleetRefreshMs(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1e3 && parsed <= 4e3 ? parsed : 4e3;
}

// src/server/fleet/fleetApp.ts
var import_node_path3 = __toESM(require("node:path"), 1);

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
      const p = row(value2), array = count(p.array), number = count(p.number);
      if (!array || !number || p.id !== `A${array}-PCS${number}`) throw new Error("Invalid PCS identity");
      return {
        id: text(p.id, 80),
        array,
        number,
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
    finding.consolidatedTargets = [...grouped.values()].map(({ row: row3, evidence: e }) => ({ ...row3, cells: cellRanges(e.cells, e.unspecified), reportedTargets: e.ids.size })).sort(compare);
    finding.bpcCounts = { all: 0 };
    for (const { row: row3 } of grouped.values()) if (row3.isBpc) {
      finding.bpcCounts.all++;
      const a = String(row3.array);
      finding.bpcCounts[a] = (finding.bpcCounts[a] ?? 0) + 1;
    }
  }
  const rank2 = { alarm: 0, warning: 1, unknown: 2, info: 3 };
  const rows = [...devices.values()].map(({ device, evidence: e, issues: groups }) => {
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
  for (const array of [null, ...arrays]) for (const category of [null, ...Object.keys(issueCategories)]) {
    const selected = rows.filter((d) => (array === null || d.array === array) && (category === null || d.categories.includes(category)));
    const unmapped2 = /* @__PURE__ */ new Set();
    for (const f of equipment) if (category === null || f.category === category) {
      for (const t of f.targetRows ?? []) if ((array === null || t.array === array) && !key(t)) unmapped2.add(t.id);
    }
    scopes[`${array ?? "all"}:${category ?? "all"}`] = { uniqueBpcs: selected.length, multipleIssues: selected.filter((d) => d.issueCount > 1).length, unmappedTargets: unmapped2.size, partial };
  }
  const balancing = equipment.filter((f) => f.code === "2073" || f.code === "2074");
  const quantities = /* @__PURE__ */ new Map();
  for (const device of rows) {
    const charge = device.issues.some((i) => i.code === "2074"), discharge = device.issues.some((i) => i.code === "2073");
    if (!charge && !discharge) continue;
    const row3 = quantities.get(device.bpc) ?? { bpc: device.bpc, chargeOnly: 0, dischargeOnly: 0, both: 0, quantity: 0 };
    row3.quantity++;
    if (charge && discharge) row3.both++;
    else if (charge) row3.chargeOnly++;
    else row3.dischargeOnly++;
    quantities.set(device.bpc, row3);
  }
  const unmapped = new Set(balancing.flatMap((f) => f.targetRows ?? []).filter((t) => !key(t)).map((t) => t.id));
  const inventoryRows = [...quantities.values()].sort((a, b) => a.bpc - b.bpc);
  const inventoryPartial = issues.quality === "unknown" || issues.omittedGroups > 0 || unmapped.size > 0 || balancing.some((f) => f.targetCount > (f.targetRows?.length ?? 0));
  issues.bpcReview = { devices: rows, scopes, balancerInventory: { rows: inventoryRows, total: inventoryRows.reduce((sum, row3) => sum + row3.quantity, 0), unmappedTargets: unmapped.size, partial: inventoryPartial } };
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
  const stamp2 = (x) => {
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
    return { at, observedAt: stamp2(p.observedAt), expected, reporting, ...values };
  });
  const identities = /* @__PURE__ */ new Set();
  const distribution = bounded(v.distribution, operatingChartLimits.strings).map((value) => {
    const d = row2(value), array = integer(d.array, 64), string = integer(d.string, 9999), id = `${array}:${string}`;
    if (!array || !string || identities.has(id) || typeof d.label !== "string" || d.label.length > 80) fail();
    identities.add(id);
    return { array, string, label: d.label, observedAt: stamp2(d.observedAt), voltageMv: nullable(d.voltageMv), temperatureF: nullable(d.temperatureF), currentA: nullable(d.currentA), powerKw: nullable(d.powerKw), socPct: nullable(d.socPct), stringVoltageV: nullable(d.stringVoltageV), busVoltageV: nullable(d.busVoltageV), energyKwh: nullable(d.energyKwh) };
  });
  if (v.recordingError !== null && (typeof v.recordingError !== "string" || v.recordingError.length > 160)) fail();
  return { version: 1, site: v.site, capturedAt: v.capturedAt, intervalMs: operatingChartLimits.intervalMs, retentionMs: operatingChartLimits.retentionMs, power, distribution, recordingError: v.recordingError };
}

// src/server/fleet/powerFlow.ts
var labels = { charging: "Charging", discharging: "Discharging", idle: "Idle", unknown: "Direction unavailable", stale: "Stale \xB7 flow withheld" };
var ttl = 15e3;
function projectSitePowerFlow(site, now) {return require("./soc-strings-runtime.cjs").projectSitePowerFlow(...arguments);}

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
function observationAge(stamp2, now) {
  if (!stamp2) return null;
  const time2 = Date.parse(stamp2);
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

// src/server/fleet/CollectorPoller.ts
var LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
function parseCollector(value, allowLoopbackHttp = false) {
  const site = parseEnrollment(value), row3 = value;
  if (typeof row3.url !== "string" || typeof row3.token !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(row3.token)) throw new Error("Invalid collector credentials");
  const url = new URL(row3.url);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/api/fleet/site-summary" || url.protocol !== "https:" && !(allowLoopbackHttp && url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname))) throw new Error("Enrolled collector requires HTTPS and the fixed summary path");
  return { ...site, url: url.href, token: row3.token };
}
async function fetchCollector(collector, signal, fetcher = fetch) {
  const response = await fetcher(collector.url, { method: "GET", redirect: "error", signal, headers: { Accept: "application/json", Authorization: "Bearer " + collector.token } });
  if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
    await response.body?.cancel();
    throw new Error("Collector response unavailable");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Collector response empty");
  const limit = fleetDetailLimits.summaryBytes, chunks = [];
  let total = 0;
  try {
    for (; ; ) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > limit) throw new Error("Collector response too large");
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {
    });
    reader.releaseLock();
  }
}
var CollectorPoller = class {
  constructor(broker, collectors, read = fetchCollector, intervalMs = fleetRefreshMs(process.env.PRIZM_FLEET_REFRESH_MS)) {
    this.broker = broker;
    this.collectors = collectors;
    this.read = read;
    this.intervalMs = intervalMs;
    this.running = false;
    this.timers = /* @__PURE__ */ new Set();
    this.active = /* @__PURE__ */ new Map();
    this.work = /* @__PURE__ */ new Set();
  }
  start() {
    if (this.running) return;
    this.running = true;
    for (const collector of this.collectors) this.enqueue(collector, 0);
  }
  enqueue(collector, delay) {
    if (!this.running) return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      const task = this.poll(collector);
      this.work.add(task);
      void task.finally(() => this.work.delete(task));
    }, delay);
    timer.unref();
    this.timers.add(timer);
  }
  async poll(collector) {
    if (!this.running || this.active.has(collector.siteId)) return;
    const controller = new AbortController();
    this.active.set(collector.siteId, controller);
    const timeout = setTimeout(() => controller.abort(), 5e3);
    timeout.unref();
    try {
      const payload = await this.read(collector, controller.signal);
      if (this.running) this.broker.accept(collector.siteId, payload);
    } catch (error) {
      if (this.running) this.broker.fail(collector.siteId, error instanceof IdentityConflict ? "identity-conflict" : "unavailable");
    } finally {
      clearTimeout(timeout);
      this.active.delete(collector.siteId);
      this.enqueue(collector, fleetRefreshMs(this.intervalMs));
    }
  }
  async stop() {
    this.running = false;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    for (const controller of this.active.values()) controller.abort();
    await Promise.all(this.work);
  }
};

// src/server/security/localSessions.ts
var import_node_crypto2 = require("node:crypto");

// src/server/security/localAccounts.ts
var import_node_crypto = require("node:crypto");
var import_node_fs = require("node:fs");
var import_promises = require("node:fs/promises");
var import_node_path = __toESM(require("node:path"), 1);

// src/core/security/localEmail.ts
function normalizeLocalEmail(value) {
  if (typeof value !== "string" || value.length > 320) return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [name, domain] = parts;
  if (!name || name.length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(name) || name.startsWith(".") || name.endsWith(".") || name.includes("..")) return null;
  const labels2 = domain.split(".");
  if (labels2.length < 2 || labels2.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return email;
}

// src/server/security/localAccounts.ts
var capabilities = /* @__PURE__ */ new Set([
  "telemetry.view",
  "history.view",
  "diagnostics.acquire",
  "diagnostics.record",
  "storage.manage",
  "controls.balancing",
  "controls.rotation",
  "controls.contactors",
  "controls.ems-apps",
  "controls.power",
  "workspace.full"
]);
var object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var identifier2 = (v) => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/.test(v);
function parseAccounts(...args){return __profileControls().parseAccounts(...args);}
async function derive(password, salt) {
  return new Promise((resolve, reject) => (0, import_node_crypto.scrypt)(
    password,
    Buffer.from(salt, "hex"),
    64,
    { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)
  ));
}
async function hashLocalPassword(password, minimumLength = 15) {
  if ([...password].length < minimumLength || password.length > 256) throw new Error(`Use a password of at least ${minimumLength} characters and no more than 256 UTF-16 code units`);
  const salt = (0, import_node_crypto.randomBytes)(16).toString("hex");
  return { algorithm: "scrypt-v1", salt, digest: (await derive(password, salt)).toString("hex") };
}
async function verifyLocalPassword(password, record3) {
  if (typeof password !== "string" || password.length > 256) return false;
  return (0, import_node_crypto.timingSafeEqual)(await derive(password, record3.salt), Buffer.from(record3.digest, "hex"));
}
async function readPrivateJson(file) {
  if (!import_node_path.default.isAbsolute(file)) throw new Error("Security file path must be absolute");
  const parent = await (0, import_promises.lstat)(import_node_path.default.dirname(file));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 18) !== 0) throw new Error("Security directory must not be writable by other accounts");
  const handle = await (0, import_promises.open)(file, import_node_fs.constants.O_RDONLY | import_node_fs.constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 1024 * 1024 || (stat.mode & 63) !== 0 || stat.uid !== process.getuid?.() && stat.uid !== 0) throw new Error("Security file must be private (0600) and owned by this service account or root");
    return JSON.parse(await handle.readFile("utf8"));
  } finally {
    await handle.close();
  }
}
var readAccounts = async (file) => parseAccounts(await readPrivateJson(file));

// src/server/security/localSessions.ts
var digest = (text2) => (0, import_node_crypto2.createHash)("sha256").update(text2).digest("hex");
var fingerprint = (account) => digest(JSON.stringify(account));
var secret = () => (0, import_node_crypto2.randomBytes)(32).toString("base64url");
var AccessError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var LocalSessions = class {
  constructor(accounts, clock = Date.now, shiftMonitoring = false, fullShiftAccess = true) {
    this.accounts = accounts;
    this.clock = clock;
    this.shiftMonitoring = shiftMonitoring;
    this.fullShiftAccess = fullShiftAccess;
    this.sessions = /* @__PURE__ */ new Map();
    this.attempts = /* @__PURE__ */ new Map();
    this.hashing = 0;
    this.dummy = { algorithm: "scrypt-v1", salt: (0, import_node_crypto2.randomBytes)(16).toString("hex"), digest: (0, import_node_crypto2.randomBytes)(64).toString("hex") };
  }
  get continuousControlAccess() {
    return this.shiftMonitoring && this.fullShiftAccess;
  }
  get maximumAgeMs() {
    return (this.shiftMonitoring ? this.continuousControlAccess ? 24 : 12 : 8) * 36e5;
  }
  get idleTimeoutMs() {
    return this.continuousControlAccess ? this.maximumAgeMs : 15 * 6e4;
  }
  get controlTimeoutMs() {
    return this.continuousControlAccess ? this.maximumAgeMs : 15 * 6e4;
  }
  throttle(key, limit) {
    const now = this.clock();
    for (const [id, bucket2] of this.attempts) if (now - bucket2.at >= 6e4) this.attempts.delete(id);
    const bucket = this.attempts.get(key) ?? { at: now, count: 0 };
    if (++bucket.count > limit) throw new AccessError(429, "Sign-in temporarily limited; try again later");
    this.attempts.set(key, bucket);
  }
  async login(inputEmail, password, peer) {
    this.throttle("global", 20);
    this.throttle("peer:" + digest(peer), 8);
    const email = normalizeLocalEmail(inputEmail);
    if (!email || typeof password !== "string" || password.length > 256) throw new AccessError(401, "Invalid credentials");
    this.throttle("account:" + digest(email), 5);
    if (this.hashing >= 2) throw new AccessError(429, "Sign-in temporarily busy");
    this.hashing++;
    try {
      const account = (await this.accounts()).find((row3) => row3.email === email);
      const valid = await verifyLocalPassword(password, account?.password ?? this.dummy);
      if (!valid || !account || account.disabled || account.passwordSetup) throw new AccessError(401, "Invalid credentials");
      const current = (await this.accounts()).find((row3) => row3.id === account.id);
      if (!current || current.disabled || fingerprint(current) !== fingerprint(account)) throw new AccessError(401, "Invalid credentials");
      const now = this.clock();
      for (const [key, value] of this.sessions) if (value.expiresAt <= now || now - value.touchedAt >= this.idleTimeoutMs) this.sessions.delete(key);
      if (this.sessions.size >= 128) throw new AccessError(503, "Session capacity reached");
      const token = secret(), csrf = secret();
      this.sessions.set(digest(token), { subject: account.id, sessionId: (0, import_node_crypto2.randomUUID)(), fingerprint: fingerprint(account), csrf, issuedAt: now, expiresAt: now + this.maximumAgeMs, touchedAt: now, controlTouchedAt: now });
      return { token, csrf };
    } finally {
      this.hashing--;
    }
  }
  async authenticate(token, touch = true) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AccessError(401, "Sign-in required");
    const key = digest(token), session = this.sessions.get(key), now = this.clock();
    if (!session || session.issuedAt > now || session.expiresAt <= now || now - session.touchedAt >= this.idleTimeoutMs) {
      this.sessions.delete(key);
      throw new AccessError(401, "Sign-in required");
    }
    const account = (await this.accounts()).find((row3) => row3.id === session.subject);
    const checkedAt = this.clock();
    if (this.sessions.get(key) !== session || session.expiresAt <= checkedAt || checkedAt - session.touchedAt >= this.idleTimeoutMs) {
      this.sessions.delete(key);
      throw new AccessError(401, "Sign-in required");
    }
    if (!account || account.disabled || fingerprint(account) !== session.fingerprint) {
      this.sessions.delete(key);
      throw new AccessError(401, "Session revoked");
    }
    if (touch) {
      session.touchedAt = checkedAt;
      if (checkedAt - session.controlTouchedAt < this.controlTimeoutMs) session.controlTouchedAt = checkedAt;
    }
    return { email: account.email, administrator: account.fleetAdmin === true, accountVersion: account.version, idleExpiresAt: Math.min(session.expiresAt, session.touchedAt + this.idleTimeoutMs), csrf: session.csrf, principal: { subject: session.subject, sessionId: session.sessionId, state: "active", issuedAt: session.issuedAt, expiresAt: session.expiresAt, grants: structuredClone(account.grants) } };
  }
  async monitoring(token) {
    const auth = await this.authenticate(token, false);
    if (this.shiftMonitoring) this.sessions.get(digest(token)).touchedAt = this.clock();
    return this.status(token);
  }
  async status(token) {
    const auth = await this.authenticate(token, false), session = this.sessions.get(digest(token));
    return {
      shiftMonitoring: this.shiftMonitoring,
      continuousControlAccess: this.continuousControlAccess,
      maximumAgeMs: this.maximumAgeMs,
      expiresAt: auth.principal.expiresAt,
      idleExpiresAt: auth.idleExpiresAt,
      controlExpiresAt: Math.min(session.expiresAt, session.controlTouchedAt + this.controlTimeoutMs),
      serverTime: this.clock()
    };
  }
  async requireControl(token) {
    const auth = await this.authenticate(token, false);
    if (this.shiftMonitoring && this.clock() - this.sessions.get(digest(token)).controlTouchedAt >= this.controlTimeoutMs)
      throw new AccessError(423, "Controls locked. Confirm your password, then review and submit the action again. Nothing was dispatched.");
    return auth;
  }
  async unlockControls(token, password, audit) {
    await this.confirmPassword(token, password);
    await audit();
    await this.authenticate(token, false);
    const session = this.sessions.get(digest(token));
    session.controlTouchedAt = session.touchedAt = this.clock();
    return this.status(token);
  }
  async confirmPassword(token, password) {
    const auth = await this.authenticate(token, false);
    this.throttle("confirm:" + auth.principal.subject, 5);
    this.throttle("confirm-global", 10);
    if (typeof password !== "string" || password.length > 256) throw new AccessError(400, "Your current password is required");
    if (this.hashing >= 2) throw new AccessError(429, "Password verification temporarily busy");
    this.hashing++;
    try {
      const account = (await this.accounts()).find((a) => a.id === auth.principal.subject);
      if (!account || !await verifyLocalPassword(password, account.password)) throw new AccessError(403, "Password confirmation failed");
      return await this.authenticate(token, false);
    } finally {
      this.hashing--;
    }
  }
  checkCsrf(expected, supplied) {
    if (typeof supplied !== "string" || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !(0, import_node_crypto2.timingSafeEqual)(Buffer.from(supplied), Buffer.from(expected))) throw new AccessError(403, "Request token required");
  }
  logout(token) {
    this.sessions.delete(digest(token));
  }
};

// src/server/fleet/workspaceAccess.ts
function parseWorkspaceEnrollments(value, collectors, fleetOrigin) {
  if (value === void 0) return [];
  if (!Array.isArray(value) || value.length > 16) throw Error("Invalid workspace enrollment");
  const fleet = new URL(fleetOrigin), seenSites = /* @__PURE__ */ new Set(), seenOrigins = /* @__PURE__ */ new Set();
  return value.map((input) => {
    const w = input;
    if (!w || Object.keys(w).sort().join(",") !== "origin,siteId,token" || typeof w.siteId !== "string" || typeof w.origin !== "string" || typeof w.token !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(w.token)) throw Error("Invalid workspace enrollment");
    const collector = collectors.find((c) => c.siteId === w.siteId), url = new URL(w.origin);
    if (!collector || w.token === collector.token || url.origin !== w.origin || url.protocol !== "https:" || url.hostname !== fleet.hostname || !["3444", "3445"].includes(url.port) || url.origin === fleet.origin || seenSites.has(w.siteId) || seenOrigins.has(w.origin)) throw Error("Workspace requires a distinct fixed HTTPS origin and credential");
    seenSites.add(w.siteId);
    seenOrigins.add(w.origin);
    return { siteId: w.siteId, origin: w.origin, token: w.token };
  });
}
function requireFullWorkspace(principal, site) {
  if (principal.state !== "active" || principal.expiresAt <= Date.now() || !["telemetry.view", "workspace.full"].every((capability) => principal.grants.some((g) => g.capability === capability && g.siteId === site.siteId && g.blockId === site.blockId && g.scope.kind === "block")))
    throw new AccessError(403, "Full workspace access is not assigned for this site");
}
function fleetSessionToken(req) {
  const tokens = String(req.headers.cookie ?? "").split(";").map((s) => s.trim()).filter((s) => s.startsWith("prizm_fleet_session="));
  return tokens.length === 1 ? tokens[0].slice("prizm_fleet_session=".length) : void 0;
}
function workspacePath(raw) {
  const path10 = raw.split("?")[0];
  if (!path10.startsWith("/") || path10.startsWith("//") || /[%\\\x00-\x20#]/.test(path10) || path10.split("/").some((s) => s === "." || s === "..") || path10.includes("//")) throw new AccessError(400, "Invalid workspace path");
  return path10;
}
function workspaceRouteAllowed(method, path10) {
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;
  path10 = path10.toLowerCase();
  if (path10.startsWith("/api/fleet") || path10.startsWith("/api/access")) return false;
  if (method !== "GET" && (path10.startsWith("/api/settings/profiles") || path10 === "/api/settings/test-connection" || path10 === "/api/local/demo-toggle")) return false;
  if (path10.startsWith("/api/") || path10.startsWith("/turtle/") || path10.startsWith("/tools/")) return true;
  return method === "GET" && (path10 === "/" || /^\/assets\/[A-Za-z0-9_.-]+\.(js|css|woff2?|ttf|png|svg)$/.test(path10) || /^\/(logo-transparent\.svg|favicon\.ico)$/.test(path10));
}
function passiveWorkspaceGet(path10) {
  return path10 === "/" || path10.startsWith("/assets/") || path10 === "/logo-transparent.svg" || path10 === "/favicon.ico" || path10 === "/api/local/site-data/strings-stream" || path10 === "/api/settings/profiles/export" || /^\/api\/local\/diagnostic-session\/[A-Za-z0-9_-]+\/export\/(json|csv)$/.test(path10) || /^\/api\/local\/reports\/download\/[A-Za-z0-9_.-]+(?:\/report\.(pdf|json))?$/.test(path10) || /^\/turtle\/tools\/report\/ems\/(ip_modbus_associations|stringIPMap|ipMap)\.csv$/.test(path10);
}
function monitoringWorkspaceGet(path10) {
  return path10 === "/api/local/corrective-guidance" || passiveWorkspaceGet(path10) || /^\/api\/local\/site-data(?:\/|$)/.test(path10) || [
    "/api/local/snapshot",
    "/api/local/snapshot/site-operations-summary",
    "/api/local/pcs/dashboard",
    "/api/local/feather/devices",
    "/api/local/corrective-actions",
    "/api/local/corrective-actions/matrix",
    "/api/local/system/boot-status",
    "/api/local/system/commissioning",
    "/api/local/connection",
    "/api/local/ems/connection-status",
    "/api/local/ems/mode",
    "/api/local/ems/sources",
    "/api/local/site-metrics",
    "/api/local/site-metrics/history",
    "/api/local/status",
    "/api/local/block",
    "/api/local/arrays",
    "/api/local/strings",
    "/api/local/snapshot/pcses",
    "/api/local/pcses",
    "/api/local/snapshot/topology",
    "/api/local/topology",
    "/api/local/topology/active",
    "/api/local/first-responder",
    "/api/local/status-codes",
    "/api/local/modbus-map",
    "/api/local/ip-map",
    "/api/local/string-ip-map",
    "/api/local/mode",
    "/api/local/controller-statistics",
    "/api/local/last-call",
    "/api/settings/profiles",
    "/api/settings/active-profile",
    "/api/settings/site-health-visual-thresholds",
    "/api/local/strings/dashboard",
    "/api/local/strings/dashboard/",
    "/api/local/strings/dashboard/corrective-actions",
    "/api/local/strings/dashboard/contactors/state",
    "/api/local/overview/discovery",
    "/api/local/workspaces/operator",
    "/api/local/workspaces/technician",
    "/api/local/workspaces/engineering",
    "/api/local/site-operations/summary"
  ].includes(path10) || /^\/api\/local\/strings\/(?:dashboard\/)?\d+\/\d+\/detail$/.test(path10) || /^\/api\/local\/workspaces\/technician\/strings\/\d+\/\d+$/.test(path10);
}
function monitoringWorkspaceRequest(method, path10) {
  return method === "GET" && monitoringWorkspaceGet(path10) || method === "POST" && [
    "/api/local/site-data/thermal/targets/query",
    "/api/local/site-data/thermal/site-history/query"
  ].includes(path10);
}

// src/server/fleet/adminRoutes.ts
var import_express = require("express");

// src/server/fleet/accountManagement.ts
var import_promises2 = require("node:fs/promises");
var import_node_crypto3 = require("node:crypto");
var import_node_path2 = __toESM(require("node:path"), 1);

// src/core/security/fleetPasswordPolicy.ts
var FLEET_MIN_PASSWORD_LENGTH = 6;

// src/server/fleet/accountManagement.ts
function manageFleetAccount(...args){return __profileControls().manageFleetAccount(...args);}
function listFleetAccounts(...args){return __profileControls().listFleetAccounts(...args);}

// src/server/fleet/adminRoutes.ts
function parseAdminAction(...args){return __profileControls().parseAdminAction(...args);}
function fleetAdminRouter(...args){return __remoteAdmin().fleetAdminRouter(...args);}

// src/server/fleet/fleetApp.ts
var cookieName = "prizm_fleet_session";
function tokenFrom(req) {
  const entries = String(req.headers.cookie ?? "").split(";").map((v) => v.trim()).filter((v) => v.startsWith(cookieName + "="));
  return entries.length === 1 ? entries[0].slice(cookieName.length + 1) : void 0;
}
function validateFleetOrigin(value, allowLoopbackHttp = false) {
  const origin = new URL(value);
  if (origin.origin !== value || origin.username || origin.password || origin.protocol !== "https:" && !(allowLoopbackHttp && origin.protocol === "http:" && LOOPBACK_HOSTS.includes(origin.hostname))) throw new Error("Fleet requires an exact HTTPS origin, or explicit loopback HTTP");
  return origin;
}
function allowedSiteIds(broker, principal) {
  if (principal.state !== "active" || principal.expiresAt <= Date.now()) return /* @__PURE__ */ new Set();
  return new Set(broker.enrollments().filter((site) => principal.grants.some((g) => g.capability === "telemetry.view" && g.siteId === site.siteId && g.blockId === site.blockId && g.scope.kind === "block")).map((site) => site.siteId));
}
function createFleetApp(broker, sessions, options) {
  const origin = validateFleetOrigin(options.origin, options.allowLoopbackHttp), app = (0, import_express2.default)();
  app.disable("x-powered-by");
  app.set("case sensitive routing", true);
  app.set("strict routing", true);
  app.set("trust proxy", false);
  app.use((req, res, next) => {
    if(options.workspaceUi)res.set("X-Prizm-UI-Release",options.workspaceUi.releaseId);
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
    });
    const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
    if (req.headers.host !== origin.host || req.headers.origin && req.headers.origin !== origin.origin || !req.secure && !(options.allowLoopbackHttp && origin.protocol === "http:" && loopback)) return res.status(403).json({ error: "Trusted transport and origin required" });
    if (!["GET", "POST"].includes(req.method) || Object.keys(req.query).length) return res.status(403).json({ error: "Route not enabled in the read-only fleet pilot" });
    next();
  });
  app.use(import_express2.default.json({ limit: "4kb", strict: true }));
  const cookieOptions = { httpOnly: true, secure: origin.protocol === "https:", sameSite: "strict", path: "/", maxAge: sessions.maximumAgeMs };
  const guarded = (fn) => (req, res) => {
    void (async () => {
      const token = tokenFrom(req), auth = await sessions.authenticate(token, false);
      const result = await fn(req, token, auth.principal);
      await sessions.authenticate(token, false);
      res.json(result);
    })().catch((error) => res.status(error instanceof AccessError ? error.status : 503).json({ error: error instanceof AccessError ? error.message : "Fleet service unavailable" }));
  };
  app.post("/api/fleet/login", (req, res) => {
    void (async () => {
      if (req.headers.origin !== origin.origin) throw new AccessError(403, "Same-origin request required");
      if (!req.body || Object.keys(req.body).sort().join(",") !== "email,password") throw new AccessError(400, "Email and password required");
      const result = await sessions.login(req.body.email, req.body.password, req.socket.remoteAddress ?? "unknown");
      try {
        await options.audit({ action: "fleet.login", outcome: "accepted" });
      } catch (error) {
        sessions.logout(result.token);
        throw error;
      }
      const old = tokenFrom(req);
      if (old) sessions.logout(old);
      res.cookie(cookieName, result.token, cookieOptions).json({ authenticated: true });
    })().catch(async (error) => {
      await options.audit({ action: "fleet.login", outcome: "rejected" }).catch(() => {
      });
      res.status(error instanceof AccessError ? error.status : 503).json({ error: error instanceof AccessError ? error.message : "Sign-in unavailable" });
    });
  });
  app.get("/api/fleet/session", guarded(async (_req, token) => {
    const auth = await sessions.authenticate(token, false);
    const workspaces = (options.workspaces ?? []).filter((w) => {
      const site = broker.enrollments().find((s) => s.siteId === w.siteId);
      if (!site) return false;
      try {
        requireFullWorkspace(auth.principal, site);
        return true;
      } catch {
        return false;
      }
    });
    return { email: auth.email, csrf: auth.csrf, ...await sessions.status(token), readOnly: true, simulated: options.simulated === true, administrator: !!options.accountsFile && auth.administrator, workspaces, refreshIntervalMs: fleetRefreshMs(process.env.PRIZM_FLEET_REFRESH_MS) };
  }));
  app.get("/api/fleet/summary", guarded(async (_req, _token, principal) => broker.view(allowedSiteIds(broker, principal))));
  if (options.accountsFile) app.use("/api/fleet/admin", fleetAdminRouter({ sessions, accountsFile: options.accountsFile, sites: broker.enrollments(), workspaceSites: new Set((options.workspaces ?? []).map((w) => w.siteId)), origin: origin.origin, audit: options.audit }));
  app.post("/api/fleet/touch", guarded(async (req, token) => {
    const auth = await sessions.authenticate(token, false);
    if (req.headers.origin !== origin.origin) throw new AccessError(403, "Same-origin request required");
    sessions.checkCsrf(auth.csrf, req.headers["x-prizm-csrf"]);
    await sessions.authenticate(token, true);
    return { active: true };
  }));
  for (const action of ["monitor", "reauthenticate"]) app.post("/api/fleet/" + action, guarded(async (req, token) => {
    const auth = await sessions.authenticate(token, false);
    if (req.headers.origin !== origin.origin) throw new AccessError(403, "Same-origin request required");
    sessions.checkCsrf(auth.csrf, req.headers["x-prizm-csrf"]);
    if (action === "monitor") return sessions.monitoring(token);
    if (!req.body || Object.keys(req.body).join(",") !== "password") throw new AccessError(400, "Password required");
    return sessions.unlockControls(token, req.body.password, () => options.audit({ action: "fleet.controls.unlock", subject: auth.principal.subject, outcome: "authorized" }));
  }));
  app.post("/api/fleet/logout", (req, res) => {
    void (async () => {
      const token = tokenFrom(req), auth = await sessions.authenticate(token, false);
      if (req.headers.origin !== origin.origin) throw new AccessError(403, "Same-origin request required");
      sessions.checkCsrf(auth.csrf, req.headers["x-prizm-csrf"]);
      sessions.logout(token);
      await options.audit({ action: "fleet.logout", subject: auth.principal.subject, outcome: "accepted" });
      const { maxAge: _, ...clear } = cookieOptions;
      res.clearCookie(cookieName, clear).json({ authenticated: false });
    })().catch((error) => res.status(error instanceof AccessError ? error.status : 503).json({ error: "Session ended or unavailable" }));
  });
  const send = (file) => (_req, res) => res.sendFile(import_node_path3.default.resolve(options.publicDirectory, file), { dotfiles: "deny" }, (error) => {
    if (error && !res.headersSent) res.status(503).json({ error: "Build the fleet UI before starting this service" });
  });
  app.get("/", send("fleet.html"));
  app.get("/logo-transparent.svg", send("logo-transparent.svg"));
  app.get(/^\/assets\/([A-Za-z0-9_-]+\.(?:js|css))$/, (req, res, next) => send("assets/" + req.params[0])(req, res, next));
  app.use((_req, res) => res.status(403).json({ error: "Route not enabled in the read-only fleet pilot" }));
  const errors = (_error, _req, res, _next) => {
    res.status(400).json({ error: "Invalid request" });
  };
  app.use(errors);
  return app;
}

// src/server/thermal/thermalMetrics.ts
var thermalMetrics = {
  space: { label: "Enclosure temperature", unit: "\xB0F", min: 14, max: 104 },
  supply: { label: "Supply-air temperature", unit: "\xB0F", min: 14, max: 104 },
  cell: { label: "Average cell temperature", unit: "\xB0F", min: 14, max: 104 },
  control: { label: "Control temperature", unit: "\xB0F", min: 14, max: 104 },
  outside: { label: "Outside temperature", unit: "\xB0F", min: 14, max: 104 },
  current: { label: "HVAC amperage", unit: "A", min: 0, max: 20 },
  rpm: { label: "Fan speed", unit: "RPM", min: 0, max: 3e3 },
  cooling: { label: "Cooling setpoint", unit: "\xB0F", min: 14, max: 104 },
  heating: { label: "Heating setpoint", unit: "\xB0F", min: 14, max: 104 },
  humidity: { label: "Enclosure humidity", unit: "%", min: 0, max: 100 },
  cellRate: { label: "Cell temperature rate", unit: "\xB0F/min", min: -1.8, max: 1.8 }
};
function thermalDisplayValues(point) {
  return Object.fromEntries(Object.entries(thermalMetrics).map(([key, definition]) => {
    const raw = point.segmentType === "CS" && (key === "cell" || key === "cellRate") ? null : point[key];
    const value = typeof raw !== "number" || !Number.isFinite(raw) ? null : definition.unit === "\xB0F" ? raw * 9 / 5 + 32 : definition.unit === "\xB0F/min" ? raw * 9 / 5 : raw;
    return [key, value];
  }));
}
function thermalReadings(point) {
  const values = thermalDisplayValues(point);
  return Object.fromEntries(Object.entries(thermalMetrics).map(([key, definition]) => {
    const value = values[key];
    const notApplicable = point.segmentType === "CS" && (key === "cell" || key === "cellRate");
    const state = notApplicable ? "Not applicable" : point.quality !== "Live" ? point.quality : value === null ? "Not reported" : "Live";
    let color = "#f1f5f9";
    if (state === "Live" && value !== null) {
      if (key === "space") {
        const bands = [70, 75, 80, 85, 90];
        const colors = ["#9dc9ec", "#8fd4cc", "#a8d99b", "#f0dc7d", "#efaa68", "#e77b72"];
        const index = bands.findIndex((limit) => value < limit);
        color = colors[index < 0 ? 5 : index];
      } else {
        const fraction = Math.max(0, Math.min(1, (value - definition.min) / (definition.max - definition.min)));
        color = `hsl(${145 - fraction * 105} 52% ${92 - fraction * 28}%)`;
      }
    }
    return [key, { value, state, color, text: notApplicable ? "N/A \u2014 no cells" : state === "Live" ? `${value.toFixed(key === "cellRate" ? 2 : 1)} ${definition.unit}` : state }];
  }));
}

// src/server/fleet/mobileHvacProjection.ts
var record2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var unavailableHvac = (error = "HVAC snapshot unavailable. No current state is inferred.") => ({ units: [], error, capturedAt: null });
function projectMobileHvac(data, now = Date.now()) {
  if (!record2(data) || !Array.isArray(data.units) || data.units.length > 2048) throw Error("Invalid thermal view");
  const seen = /* @__PURE__ */ new Set();
  const units = data.units.map((raw) => {
    if (!record2(raw) || typeof raw.id !== "string" || raw.id.length > 200 || seen.has(raw.id) || !Number.isInteger(raw.array) || Number(raw.array) < 1 || Number(raw.array) > 128 || ![1, 2].includes(Number(raw.unit)) || typeof raw.segment !== "string" || raw.segment.length > 80 || typeof raw.label !== "string" || !record2(raw.point)) throw Error("Invalid thermal unit");
    seen.add(raw.id);
    const p = raw.point;
    if (!["Heating", "Cooling", "Idle", "Unknown"].includes(String(p.mode)) || !["Live", "Stale", "Unavailable"].includes(String(p.quality)) || typeof p.at !== "number" || !Number.isFinite(p.at) || !Array.isArray(raw.faults) || raw.faults.length > 128 || raw.faults.some((f) => typeof f !== "string" || f.length > 2e3)) throw Error("Invalid thermal state");
    const quality2 = p.quality === "Live" && (now - p.at > 12e4 || p.at > now + 3e4) ? "Stale" : p.quality;
    const point = { ...p, quality: quality2 };
    const faults = raw.faults;
    return {
      id: raw.id,
      array: Number(raw.array),
      segment: raw.segment,
      unit: Number(raw.unit),
      label: raw.label.slice(0, 200),
      mode: point.mode,
      quality: quality2,
      at: p.at,
      faults: [...new Set(faults.filter((f) => !f.startsWith("Controller: ")))],
      controllerAlerts: [...new Set(faults.filter((f) => f.startsWith("Controller: ")).map((f) => f.slice(12)))],
      readings: thermalReadings(point)
    };
  }).sort((a, b) => a.array - b.array || a.segment.localeCompare(b.segment, void 0, { numeric: true }) || a.unit - b.unit);
  return { units, error: typeof data.error === "string" && data.error ? "Collector reported a thermal service warning." : null, capturedAt: now };
}

// src/server/fleet/navigationPolicy.ts
function allowedFetchSite(req, entryDocument) {
  const site = req.headers["sec-fetch-site"];
  if (!site || site === "same-origin" || site === "none") return true;
  return entryDocument && req.method === "GET" && req.headers["sec-fetch-mode"] === "navigate" && req.headers["sec-fetch-dest"] === "document";
}

// src/server/fleet/mobileApp.ts
var cookieName2 = "prizm_mobile_session";
var mobileSessionToken = (req) => {
  const all = String(req.headers.cookie ?? "").split(";").map((s) => s.trim()).filter((s) => s.startsWith(cookieName2 + "="));
  return all.length === 1 ? all[0].slice(cookieName2.length + 1) : void 0;
};
var tokenOf = mobileSessionToken;
function createMobileApp(...args){return __remoteAdmin().createMobileApp(...args);}

// src/server/fleet/mobileHvacCache.ts
var MobileHvacCache = class {
  constructor(collectors, workspaces, fetcher = fetch, clock = Date.now) {
    this.collectors = collectors;
    this.workspaces = workspaces;
    this.fetcher = fetcher;
    this.clock = clock;
    this.records = /* @__PURE__ */ new Map();
    this.timers = /* @__PURE__ */ new Set();
    this.active = /* @__PURE__ */ new Set();
    this.running = false;
  }
  view(siteId) {
    const value = this.records.get(siteId);
    return value && this.clock() - value.received <= 15e3 ? projectMobileHvac(value.data, this.clock()) : unavailableHvac();
  }
  async refresh(collector, workspace) {
    const controller = new AbortController();
    this.active.add(controller);
    const timeout = setTimeout(() => controller.abort(), 3e3);
    timeout.unref();
    try {
      const url = new URL("/api/fleet/workspace/api/local/site-data/thermal", collector.url);
      if (url.protocol !== "https:" || collector.siteId !== workspace.siteId) throw Error("Invalid enrollment");
      const response = await this.fetcher(url, { method: "GET", redirect: "error", signal: controller.signal, headers: { Accept: "application/json", Authorization: "Bearer " + workspace.token } });
      if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
        await response.body?.cancel();
        throw Error("Unavailable");
      }
      const reader = response.body?.getReader();
      if (!reader) throw Error("Unavailable");
      const chunks = [];
      let size = 0;
      let data;
      try {
        for (; ; ) {
          const p = await reader.read();
          if (p.done) break;
          size += p.value.byteLength;
          if (size > 3 * 1024 * 1024) throw Error("Oversize");
          chunks.push(p.value);
        }
        data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } finally {
        await reader.cancel().catch(() => {
        });
        reader.releaseLock();
      }
      projectMobileHvac(data, this.clock());
      if (!controller.signal.aborted) this.records.set(collector.siteId, { data, received: this.clock() });
    } catch {
      this.records.delete(collector.siteId);
    } finally {
      clearTimeout(timeout);
      this.active.delete(controller);
    }
  }
  start() {
    if (this.running) return;
    this.running = true;
    for (const w of this.workspaces) {
      const c = this.collectors.find((c2) => c2.siteId === w.siteId);
      if (c) this.schedule(c, w, 0);
    }
  }
  schedule(c, w, delay) {
    if (!this.running) return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void this.refresh(c, w).finally(() => this.schedule(c, w, 5e3));
    }, delay);
    timer.unref();
    this.timers.add(timer);
  }
  stop() {
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const c of this.active) c.abort();
    this.records.clear();
  }
};

// src/server/fleet/passwordSetup.ts
function passwordSetup(file, sites, audit) {
  let windowAt = 0, attempts = 0, busy = false;
  return async (body, verifiedEmail) => {
    const now = Date.now();
    if (now - windowAt >= 6e4) {
      windowAt = now;
      attempts = 0;
    }
    if (++attempts > 12 || busy) throw new AccessError(429, "Setup temporarily limited; try again later");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AccessError(400, "Invalid setup request");
    const b = body, email = normalizeLocalEmail(b.email);
    if (Object.keys(b).sort().join(",") !== "email,password,token" || !email || typeof b.password !== "string" || typeof b.token !== "string" || b.password.length > 256 || b.token.length !== 43 || verifiedEmail && email !== verifiedEmail) throw new AccessError(400, "Invalid setup request");
    busy = true;
    try {
      await audit({ action: "mobile.password-setup", outcome: "attempt" });
      try {
        await manageFleetAccount(file, sites, { kind: "redeem", email, token: b.token, password: b.password });
      } catch {
        throw new AccessError(400, "Setup could not complete. Check the code, expiry and password requirements.");
      }
      await audit({ action: "mobile.password-setup", outcome: "saved" }).catch(() => {
      });
      return { saved: true };
    } finally {
      busy = false;
    }
  };
}

// src/server/fleet/remoteMobile.ts
var import_express5 = __toESM(require("express"), 1);
var import_node_http = require("node:http");
var import_promises5 = require("node:fs/promises");
var import_node_path7 = __toESM(require("node:path"), 1);

// src/server/fleet/remoteIdentity.ts
var import_node_crypto4 = require("node:crypto");
var import_node_fs2 = require("node:fs");
var import_promises4 = require("node:fs/promises");
var import_node_path5 = __toESM(require("node:path"), 1);
async function readPublicKeys(config) {
  if (!import_node_path5.default.isAbsolute(config.keysFile) || !Number.isSafeInteger(config.keysOwnerUid) || config.keysOwnerUid < 0) throw Error("Pinned public-key owner required");
  const dir = await (0, import_promises4.lstat)(import_node_path5.default.dirname(config.keysFile));
  if (!dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 18) !== 0 || dir.uid !== config.keysOwnerUid) throw Error("Untrusted public-key directory");
  const file = await (0, import_promises4.open)(config.keysFile, import_node_fs2.constants.O_RDONLY | import_node_fs2.constants.O_NOFOLLOW);
  try {
    const s = await file.stat();
    if (!s.isFile() || s.size > 65536 || (s.mode & 18) !== 0 || s.uid !== config.keysOwnerUid) throw Error("Untrusted public-key file");
    return JSON.parse(await file.readFile("utf8"));
  } finally {
    await file.close();
  }
}
function verifyRemoteToken(token, config, keys, now = Date.now()) {
  if (typeof token !== "string" || token.length > 16384 || !/^([A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+$/.test(token)) throw Error("Remote identity required");
  const [h, p, s] = token.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")), claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  if (!header || header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length > 256 || header.crit !== void 0) throw Error("Unsupported remote signature");
  const matches = keys.filter((k) => k.kid === header.kid && k.kty === "RSA");
  if (matches.length !== 1) throw Error("Unknown remote signing key");
  const key = (0, import_node_crypto4.createPublicKey)({ key: matches[0], format: "jwk" });
  if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 || !(0, import_node_crypto4.verify)("RSA-SHA256", Buffer.from(h + "." + p), key, Buffer.from(s, "base64url"))) throw Error("Invalid remote signature");
  const sec = Math.floor(now / 1e3), email = normalizeLocalEmail(claims?.email);
  if (!claims || claims.iss !== config.issuer || !Array.isArray(claims.aud) || !claims.aud.includes(config.audience) || claims.type !== "app" || !email || !Number.isSafeInteger(claims.exp) || claims.exp <= sec || !Number.isSafeInteger(claims.iat) || claims.iat > sec + 30 || claims.exp <= claims.iat || claims.nbf !== void 0 && (!Number.isSafeInteger(claims.nbf) || claims.nbf > sec + 30)) throw Error("Expired or invalid remote identity");
  return email;
}
function remoteVerifier(config) {
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(config.issuer) || !/^[a-f0-9]{64}$/.test(config.audience)) throw Error("Exact Cloudflare issuer and application audience required");
  return async (token) => {
    const raw = await readPublicKeys(config);
    if (!raw || !Number.isSafeInteger(raw.fetchedAt) || raw.fetchedAt > Date.now() + 3e4 || Date.now() - raw.fetchedAt > 6 * 36e5 || !Array.isArray(raw.keys) || raw.keys.length < 1 || raw.keys.length > 16) throw Error("Remote verification keys unavailable or expired");
    return verifyRemoteToken(token, config, raw.keys);
  };
}

// src/server/fleet/remoteDesktop.ts
var import_express4 = __toESM(require("express"), 1);
var import_node_path6 = __toESM(require("node:path"), 1);

// scripts/operations-review-policy.ts
var reads = new Map([
  ...["snapshot", "block-summary", "strings", "strings-fast", "pcs", "feather", "arrays", "source-health", "sensors", "status", "corrective-actions", "notifications/rollups"].map((path10) => [`/api/local/site-data/${path10}`, path10 === "snapshot" ? ["view", "shape"] : path10 === "strings-fast" ? ["shape"] : []]),
  ...["topology/active", "snapshot/topology", "system/boot-status", "ems/connection-status", "diagnostic-session/status", "capabilities", "cache/status", "corrective-actions/matrix", "settings/site-health-visual-thresholds"].map((path10) => [`/api/local/${path10}`, []]),
  ["/api/local/topology/active", ["view"]],
  ["/api/local/troubleshooting/library", []],
  ["/api/local/corrective-guidance", []],
  ["/api/local/history/events", ["range"]],
  ["/api/local/site-data/cells", ["metric", "array"]],
  ["/api/local/site-data/cells/snapshot", ["metric", "array", "at"]],
  ["/api/local/site-data/cells/history", ["metric", "array", "from", "to", "ids"]],
  ["/api/local/site-data/cells/index", ["from", "to", "after", "limit"]],
  ["/api/local/site-data/analytics", []]
]);
var reviewOrigin = "http://127.0.0.1:3205";
function reviewReadPath(method, raw) {
  if (method !== "GET" || !raw.startsWith("/api/") || raw.includes("\\") || raw.includes("#")) return null;
  const url = new URL(raw, reviewOrigin);
  if (url.origin !== reviewOrigin || raw.split("?")[0] !== url.pathname || /%|\/\//.test(url.pathname)) return null;
  const keys = reads.get(url.pathname);
  if (!keys) return null;
  for (const [key, value] of url.searchParams) {
    if (!keys.includes(key) || url.searchParams.getAll(key).length !== 1) return null;
    if(url.pathname === "/api/local/topology/active" && value !== "profile")return null;
    if (url.pathname.startsWith("/api/local/site-data/cells")) {
      if (key === "metric" && !["millivolts", "temperatureF"].includes(value)) return null;
      if (key === "array" && (!/^\d{1,2}$/.test(value) || Number(value) < 1 || Number(value) > 64)) return null;
      if (["from", "to", "at", "after"].includes(key) && !/^\d{13}$/.test(value)) return null;
      if (key === "limit" && (!/^\d{1,4}$/.test(value) || Number(value) < 1 || Number(value) > 1e3)) return null;
      if (key === "ids" && value !== "" && !/^(A\d{1,2}-S\d{1,3}-B\d{1,2}-C\d{1,3})(,A\d{1,2}-S\d{1,3}-B\d{1,2}-C\d{1,3}){0,7}$/.test(value)) return null;
    } else if (!/^[-a-z0-9]{1,64}$/.test(value)) return null;
  }
  if (url.pathname.endsWith("/cells/history")) {
    const from = Number(url.searchParams.get("from")), to = Number(url.searchParams.get("to"));
    if (!from || !to || to < from || to - from > 7 * 864e5) return null;
  }
  return url.pathname + (url.searchParams.size ? "?" + url.searchParams.toString() : "");
}

// src/server/fleet/remoteDesktop.ts
function remoteDesktopRead(method, raw) {
  if (raw.length > 4096) return null;
  const basic = reviewReadPath(method, raw);
  if (basic) return basic;
  if (method === "GET" && raw === "/api/settings/site-health-visual-thresholds") return raw;
  if (method !== "GET" || !raw.startsWith("/api/local/") || /[\\#]/.test(raw)) return null;
  const u = new URL(raw, "https://read.invalid");
  if (u.pathname !== raw.split("?")[0] || /[%]|\/\//.test(u.pathname)) return null;
  if (/^\/api\/local\/site-data\/(strings-canonical|notifications\/string)\/[1-8]\/([1-9]|[1-3][0-9]|40)$/.test(u.pathname) && !u.search) return u.pathname;
  const rules = {
    "/api/local/site-data/strings-stream": { shape: /^list(?:-v2)?$/ },
    "/api/local/site-distribution/strings": {},
    "/api/local/site-health/graph": Object.fromEntries(["lowVolt", "lowAlarmVolt", "warningVolt", "alarmVolt", "lowTemp", "lowAlarmTemp", "warningTemp", "alarmTemp"].map((k) => [k, /^-?\d{1,5}(\.\d{1,3})?$/])),
    "/api/local/site-data/operational-timeline": {},
    "/api/local/site-data/operational-timeline/review": { array: /^[1-8]$/, hours: /^(1|6|12|24|48|72|168)$/, string: /^([1-9]|[1-3][0-9]|40)$/ }
  };
  const rule = rules[u.pathname];
  if (!rule) return null;
  for (const [k, v] of u.searchParams) if (!rule[k]?.test(v) || u.searchParams.getAll(k).length !== 1) return null;
  return u.pathname + (u.searchParams.size ? "?" + u.searchParams.toString() : "");
}
function createRemoteDesktop(...args){return __profileControls().createRemoteDesktop(...args);}

// src/server/fleet/remoteMobile.ts
function createRemoteMobileApp(...args){return __profileControls().createRemoteMobileApp(...args);}
async function startRemoteMobile(broker, options, config) {
  const app = await createRemoteMobileApp(broker, options, config);
  const directory = await (0, import_promises5.lstat)(import_node_path7.default.dirname(config.socketPath));
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 511) !== 456 || directory.uid !== process.getuid?.() || directory.gid !== process.getgid?.()) throw Error("Service-owned remote directory with dedicated tunnel group (0710) required");
  try {
    await (0, import_promises5.lstat)(config.socketPath);
    throw Error("Remote socket already exists; inspect before removing");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const server = (0, import_node_http.createServer)({ maxHeaderSize: 32768 }, app);
  server.requestTimeout = 15e3;
  server.headersTimeout = 1e4;
  server.maxConnections = 64;
  server.keepAliveTimeout = 5e3;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.socketPath, resolve);
  });
  await (0, import_promises5.chmod)(config.socketPath, 432);
  return { close: async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(() => r()));
    await (0, import_promises5.unlink)(config.socketPath).catch(() => {
    });
  } };
}

// src/server/fleet/main.ts
var import_node_http2 = require("node:http");
var import_node_https2 = require("node:https");

// src/server/fleet/collectorTls.ts
var import_node_fs3 = require("node:fs");
var import_promises6 = require("node:fs/promises");
var import_node_path8 = __toESM(require("node:path"), 1);
var import_express6 = __toESM(require("express"), 1);
async function readPrivatePem(file) {
  if (!import_node_path8.default.isAbsolute(file)) throw new Error("Absolute TLS path required");
  const parent = await (0, import_promises6.lstat)(import_node_path8.default.dirname(file));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 18) !== 0) throw new Error("TLS directory must be private");
  const handle = await (0, import_promises6.open)(file, import_node_fs3.constants.O_RDONLY | import_node_fs3.constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 65536 || (stat.mode & 63) !== 0 || stat.uid !== process.getuid?.() && stat.uid !== 0) throw new Error("TLS file must be private and owned by service account or root");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

// src/server/fleet/workspaceGateway.ts
var import_express7 = __toESM(require("express"), 1);
var import_node_https = __toESM(require("node:https"), 1);
var import_node_stream = require("node:stream");
function workspaceForwarder(collector, enrollment, ca) {
  const target = new URL(collector.url);
  if (target.protocol !== "https:") throw Error("Workspace upstream must use verified TLS");
  const agent = new import_node_https.default.Agent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 2, ...ca ? { ca } : {} });
  const optimized = process.env.PRIZM_WORKSPACE_TRANSPORT !== "false";
  if (optimized) {
    const idle = /* @__PURE__ */ new WeakMap();
    const keep = agent.keepSocketAlive, reuse = agent.reuseSocket;
    agent.keepSocketAlive = function(socket) {
      const retained = keep.call(this, socket);
      if (retained) {
        const old = idle.get(socket);
        if (old) clearTimeout(old);
        const timer = setTimeout(() => {
          if (idle.get(socket) === timer) {
            idle.delete(socket);
            socket.destroy();
          }
        }, 1e3);
        timer.unref();
        idle.set(socket, timer);
      }
      return retained;
    };
    agent.reuseSocket = function(socket, request) {
      const timer = idle.get(socket);
      if (timer) clearTimeout(timer);
      idle.delete(socket);
      reuse.call(this, socket, request);
    };
  }
  const streamAgent = optimized ? new import_node_https.default.Agent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 0, ...ca ? { ca } : {} }) : agent;
  let active = 0, activeStreams = 0;
  return async (req, res, recheck) => {
    const streamRequest = req.method === "GET" && (String(req.headers.accept).includes("text/event-stream") || /\/(?:strings-stream|stream)(?:\?|$)/.test(req.url));
    if (optimized && streamRequest && activeStreams >= 8) throw new AccessError(503, "Site stream capacity reached; retry later");
    if (active >= 24) throw new AccessError(503, "Site workspace is busy; request was not dispatched");
    active++;
    if (streamRequest) activeStreams++;
    return new Promise((resolve) => {
      let settled = false, received = 0, attempts = 0, responseEnded = false;
      const started = performance.now(), requestId = require("node:crypto").randomUUID();
      res.setHeader("X-Prizm-Request-Id", requestId);
      const requestPath = req.url.split("?")[0];
      const safeRetry = optimized && process.env.PRIZM_WORKSPACE_READ_RETRY !== "false" && req.method === "GET" && !streamRequest && [
        "/api/local/site-data/snapshot",
        "/api/local/site-data/strings-fast",
        "/api/local/system/boot-status",
        "/api/local/capabilities"
      ].includes(requestPath) && !new URLSearchParams(req.url.split("?")[1] || "").has("refresh") && !req.headers["transfer-encoding"] && Number(req.headers["content-length"] || 0) === 0;
      let headerMs = null;
      const diagnostic = (outcome, code, status) => {
        if (process.env.PRIZM_WORKSPACE_DIAGNOSTICS === "false") return;
        const log = outcome === "client-disconnected" ? console.info : console.warn;
        log("[Workspace transport]", JSON.stringify({
          requestId,
          siteId: collector.siteId,
          method: req.method,
          path: requestPath,
          stream: streamRequest,
          outcome,
          code: code && /^[A-Z0-9_]{1,48}$/.test(code) ? code : void 0,
          status,
          durationMs: Math.round(performance.now() - started),
          headerMs,
          bytes: received,
          attempts,
          reusedSocket: upstream?.reusedSocket === true
        }));
      };
      const headers = { Authorization: "Bearer " + enrollment.token, Accept: String(req.headers.accept ?? "*/*") };
      if (typeof res.locals.prizmGuidanceActor === "string") headers["x-prizm-guidance-actor"] = res.locals.prizmGuidanceActor;
      for (const key of ["content-type", "content-length"]) if (typeof req.headers[key] === "string") headers[key] = req.headers[key];
      if (optimized && req.method === "GET" && !streamRequest) {
        for (const key of ["accept-encoding", "if-none-match"]) if (typeof req.headers[key] === "string") headers[key] = req.headers[key];
      }
      let upstream;
      const dispatch = () => {
        attempts++;
        upstream = import_node_https.default.request({
          hostname: target.hostname,
          port: Number(target.port || 443),
          method: req.method,
          path: "/api/fleet/workspace" + req.url,
          headers,
          agent: attempts > 1 ? false : streamRequest ? streamAgent : agent,
          ...ca ? { ca } : {},
          rejectUnauthorized: true
        }, (response) => {
          headerMs = Math.round(performance.now() - started);
          response.once("end", () => {
            responseEnded = true;
          });
          void recheck().then(() => {
            if (settled) return;
            const status = response.statusCode ?? 502;
            if (status >= 500) diagnostic("upstream-status", void 0, status);
            const unchanged = optimized && status === 304 && req.method === "GET" && Boolean(headers["if-none-match"]);
            if (status >= 300 && status < 400 && !unchanged) {
              response.destroy();
              fail("Collector redirect refused");
              return;
            }
            const responseHeaders = ["content-type", "content-disposition", "content-length", "x-prizm-cycle-id"];
            if (optimized) responseHeaders.push("content-encoding", "etag", "vary", "x-prizm-snapshot-bytes", "x-prizm-snapshot-view", "x-prizm-published-at");
            for (const key of responseHeaders) {
              const value = response.headers[key];
              if (typeof value === "string") res.setHeader(key, value);
            }
            if (optimized && streamRequest && response.headers["content-type"]?.startsWith("text/event-stream")) {
              clearTimeout(deadline);
              upstream.setTimeout(45e3, () => fail("Collector stream inactive"));
            }
            res.status(status);
            response.on("data", (chunk) => {
              received += chunk.length;
              if (received > 64 * 1024 * 1024 && !response.headers["content-type"]?.startsWith("text/event-stream")) fail("Response limit exceeded");
            });
            response.on("error", (error) => fail("Collector response interrupted", 502, error.code));
            response.pipe(res);
          }).catch(() => {
            response.destroy();
            fail("Workspace access ended", 401);
          });
        });
        upstream.on("error", (error) => {
          if (settled) return;
          if (safeRetry && attempts === 1 && upstream.reusedSocket && error.code === "ECONNRESET" && headerMs === null && !res.headersSent) {
            diagnostic("retry-stale-socket", error.code);
            req.unpipe(limit);
            limit.unpipe(upstream);
            upstream.destroy();
            void recheck().then(() => {
              if (!settled) {
                dispatch();
                upstream.end();
              }
            }).catch(() => fail("Workspace access ended", 401));
            return;
          }
          fail("Collector connection unavailable", 502, error.code);
        });
      };
      const deadline = setTimeout(() => fail("Collector request deadline exceeded"), 12e4);
      deadline.unref();
      let checking = false;
      const accessTimer = setInterval(() => {
        if (checking) return;
        checking = true;
        void recheck().catch(() => fail("Workspace access ended", 401)).finally(() => {
          checking = false;
        });
      }, 1e4);
      accessTimer.unref();
      let uploaded = 0;
      const limit = new import_node_stream.Transform({ transform(chunk, _encoding, done) {
        uploaded += chunk.length;
        done(uploaded > 50 * 1024 * 1024 ? new Error("Upload limit exceeded") : null, chunk);
      } });
      function finish(complete = false) {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        clearInterval(accessTimer);
        active--;
        if (streamRequest) activeStreams--;
        if (!complete) upstream.destroy();
        req.unpipe(limit);
        limit.unpipe(upstream);
        limit.destroy();
        req.off("aborted", clientEnded);
        res.off("close", clientEnded);
        res.off("finish", completed);
        resolve();
      }
      function fail(message, status = 502, code) {
        if (settled) return;
        diagnostic(message, code, status);
        if (!res.headersSent) res.status(status).json({ error: message + ". If a command was submitted, verify its outcome before retrying." });
        else res.destroy();
        finish();
      }
      limit.on("error", () => fail("Request body too large", 413));
      function clientEnded() {
        if (!settled) diagnostic("client-disconnected");
        finish();
      }
      function completed() {
        if (!streamRequest && performance.now() - started > 2e3) diagnostic("slow-response", void 0, res.statusCode);
        finish(responseEnded);
      }
      req.once("aborted", clientEnded);
      res.once("close", clientEnded);
      res.once("finish", completed);
      dispatch();
      req.pipe(limit).pipe(upstream);
    });
  };
}
function createWorkspaceGateway(sessions, collector, enrollment, fleetOrigin, audit, forward, allowLoopbackHttp = false, _reservedSharedSites = [], workspaceUi) {
  const origin = validateFleetOrigin(enrollment.origin, allowLoopbackHttp), fleet = validateFleetOrigin(fleetOrigin, allowLoopbackHttp), app = (0, import_express7.default)();
  if (origin.hostname !== fleet.hostname || origin.origin === fleet.origin) throw Error("Distinct workspace origin on the Fleet host required");
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.set("case sensitive routing", true);
  app.set("strict routing", true);
  app.use("/api/fleet/workspace-reauthenticate", import_express7.default.json({ limit: "4kb", strict: true }));
  app.use((req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
    });
    void (async () => {
      const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
      if (req.headers.host !== origin.host || req.headers.origin && req.headers.origin !== origin.origin || !req.secure && !(allowLoopbackHttp && origin.protocol === "http:" && loopback)) throw new AccessError(403, "Trusted workspace origin required");
      const path10 = workspacePath(req.url), token = fleetSessionToken(req);
      const recheck = async () => {
        const auth2 = await sessions.authenticate(token, false);
        requireFullWorkspace(auth2.principal, collector);
        return auth2;
      };
      const auth = await recheck();
      if (req.method !== "GET" && path10.startsWith("/api/local/troubleshooting/overrides") && !auth.administrator) throw new AccessError(403, "Local administrator access required");
      if (path10 === "/api/local/corrective-guidance") {
        if (req.method !== "GET" && !auth.administrator) throw new AccessError(403, "Local administrator access required");
        if (auth.administrator) res.locals.prizmGuidanceActor = auth.principal.subject;
      }
      if (path10 === "/api/fleet/workspace-context" && req.method === "GET" && !req.url.includes("?")) {
        res.json({
          siteId: collector.siteId,
          siteName: collector.name,
          stationCode: collector.stationCode,
          blockIndex: collector.blockIndex,
          fleetUrl: fleet.origin + "/#site=" + encodeURIComponent(collector.siteId),
          email: auth.email,
          csrf: auth.csrf,
          fullControl: true,
          ...(workspaceUi ? {uiRelease:workspaceUi.releaseId} : {}),
          ...await sessions.status(token)
        });
        return;
      }
      if (req.method !== "GET" || !passiveWorkspaceGet(path10)) {
        if (req.headers.origin && req.headers.origin !== origin.origin) throw new AccessError(403, "Same-origin request required");
        if (req.method !== "GET" && req.headers.origin !== origin.origin) throw new AccessError(403, "Same-origin request required");
        sessions.checkCsrf(auth.csrf, req.headers["x-prizm-csrf"]);
      }
      if (path10 === "/api/fleet/workspace-touch" && req.method === "POST" && !req.url.includes("?")) {
        await sessions.authenticate(token, true);
        res.json({ active: true });
        return;
      }
      if (path10 === "/api/fleet/workspace-monitor" && req.method === "POST" && !req.url.includes("?")) {
        res.json(await sessions.monitoring(token));
        return;
      }
      if (path10 === "/api/fleet/workspace-reauthenticate" && req.method === "POST" && !req.url.includes("?")) {
        if (!req.body || Object.keys(req.body).join(",") !== "password") throw new AccessError(400, "Password required");
        res.json(await sessions.unlockControls(token, req.body.password, () => audit({ action: "workspace.controls.unlock", outcome: "authorized", subject: auth.principal.subject, siteId: collector.siteId })));
        return;
      }
      if (!workspaceRouteAllowed(req.method, path10)) throw new AccessError(403, "Connection enrollment and this route are not editable from the site workspace");
      const controlRequired = !monitoringWorkspaceRequest(req.method, path10);
      if (controlRequired) await sessions.requireControl(token);
      if (Number(req.headers["content-length"] ?? 0) > 50 * 1024 * 1024) throw new AccessError(413, "Request body too large");
      if (req.method !== "GET" || path10.startsWith("/tools/controls/")) {
        await audit({ action: "workspace.dispatch", outcome: "authorized", subject: auth.principal.subject, siteId: collector.siteId, method: req.method, path: path10 });
      } else if (path10 === "/") await audit({ action: "workspace.open", outcome: "authorized", subject: auth.principal.subject, siteId: collector.siteId });
      await recheck();
      if (controlRequired) await sessions.requireControl(token);
      if(req.method === "GET" && workspaceUi?.send(path10,res))return;
      await forward(req, res, async () => {
        await recheck();
      });
    })().catch((error) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status = error instanceof AccessError ? error.status : 503;
      if (status === 401 && req.url === "/" && req.method === "GET") {
        res.redirect(303, fleet.origin + "/");
        return;
      }
      res.status(status).json({ error: error instanceof AccessError ? error.message : "Site workspace unavailable" });
    });
  });
  return app;
}

// src/server/fleet/main.ts
async function main() {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new Error("Fleet requires certificate verification");
  const config = await readPrivateJson(process.env.PRIZM_FLEET_CONFIG ?? "");
  if (!config || typeof config.origin !== "string" || typeof config.accountsFile !== "string" || !import_node_path9.default.isAbsolute(config.accountsFile) || !Array.isArray(config.collectors)) throw new Error("Invalid fleet configuration");
  const origin = validateFleetOrigin(config.origin, config.allowLoopbackHttp === true);
  const collectors = config.collectors.map((value) => parseCollector(value, config.allowLoopbackHttp === true));
  const broker = new FleetBroker(collectors), poller = new CollectorPoller(broker, collectors);
  const accountsFile = config.accountsFile;
  await readAccounts(accountsFile);
  const sessions = new LocalSessions(() => readAccounts(accountsFile), Date.now, process.env.PRIZM_SHIFT_MONITORING !== "false", process.env.PRIZM_SHIFT_24H_ACCESS !== "false");
  const workspaces = parseWorkspaceEnrollments(config.workspaces, collectors, config.origin);
  const workspaceUi=process.env.PRIZM_UNIFIED_WORKSPACE_UI === "false" ? undefined : require("./workspace-ui.cjs").createWorkspaceUi(import_node_path9.default.resolve("dist"));
  const audit = async (event) => {
    process.stdout.write(JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), ...event }) + "\n");
  };
  const fleetApp = createFleetApp(broker, sessions, {
    origin: config.origin,
    allowLoopbackHttp: config.allowLoopbackHttp === true,
    publicDirectory: import_node_path9.default.resolve("dist"), workspaceUi,
    audit,
    accountsFile,
    workspaces: workspaces.map(({ siteId, origin: origin2 }) => ({ siteId, origin: origin2 }))
  });
  const mobileHvac = new MobileHvacCache(collectors, workspaces);
  const app = (0, import_express8.default)();
  app.disable("x-powered-by");
  app.use("/mobile", createMobileApp(broker, { origin: config.origin, allowLoopbackHttp: config.allowLoopbackHttp === true, publicDirectory: import_node_path9.default.resolve("dist"), workspaceUi, accounts: () => readAccounts(accountsFile), hvac: (id) => mobileHvac.view(id), audit, setup: passwordSetup(accountsFile, collectors, audit) }));
  app.use(fleetApp);
  const tls = origin.protocol === "https:";
  if (tls && (typeof config.tlsKeyFile !== "string" || typeof config.tlsCertFile !== "string" || !import_node_path9.default.isAbsolute(config.tlsKeyFile) || !import_node_path9.default.isAbsolute(config.tlsCertFile))) throw new Error("TLS key and certificate paths required");
  const server = tls ? (0, import_node_https2.createServer)({ key: await readPrivatePem(config.tlsKeyFile), cert: await readPrivatePem(config.tlsCertFile), minVersion: "TLSv1.2", handshakeTimeout: 5e3, maxHeaderSize: 8192 }, app) : (0, import_node_http2.createServer)(app);
  server.requestTimeout = 1e4;
  server.headersTimeout = 1e4;
  server.maxRequestsPerSocket = 100;
  server.keepAliveTimeout = 5e3;
  server.maxConnections = 128;
  const bind = tls ? typeof config.bindAddress === "string" ? config.bindAddress : "127.0.0.1" : "127.0.0.1";
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(origin.port || (tls ? 443 : 80)), bind, resolve);
  });
  const workspaceServers = [];
  try {
    for (const workspace of workspaces) {
      const collector = collectors.find((c) => c.siteId === workspace.siteId);
      const gateway = createWorkspaceGateway(sessions, collector, workspace, config.origin, audit, workspaceForwarder(collector, workspace), false, [], workspaceUi);
      const listener = (0, import_node_https2.createServer)({ key: await readPrivatePem(config.tlsKeyFile), cert: await readPrivatePem(config.tlsCertFile), minVersion: "TLSv1.2", handshakeTimeout: 5e3, maxHeaderSize: 8192 }, gateway);
      listener.requestTimeout = 6e4;
      listener.headersTimeout = 1e4;
      listener.maxConnections = 64;
      listener.keepAliveTimeout = 5e3;
      workspaceServers.push(listener);
      await new Promise((resolve, reject) => {
        listener.once("error", reject);
        listener.listen(Number(new URL(workspace.origin).port), bind, resolve);
      });
    }
  } catch (error) {
    for (const s of workspaceServers) {
      s.closeAllConnections();
      s.close();
    }
    server.closeAllConnections();
    server.close();
    throw error;
  }
  poller.start();
  mobileHvac.start();
  process.stdout.write(JSON.stringify({ event: "fleet.started", origin: origin.origin, readOnly: true }) + "\n");
  let remote;
  if (process.env.PRIZM_REMOTE_CONFIG) {
    try {
      const remoteConfig = await readPrivateJson(process.env.PRIZM_REMOTE_CONFIG);
      remote = await startRemoteMobile(broker, { publicDirectory: import_node_path9.default.resolve("dist"), workspaceUi, adminAccountsFile: process.env.PRIZM_REMOTE_ADMIN === "false" ? undefined : accountsFile, accounts: () => readAccounts(accountsFile), hvac: (id) => mobileHvac.view(id), audit, setup: passwordSetup(accountsFile, collectors, audit), desktop: workspaces.map((w) => {
        const collector = collectors.find((c) => c.siteId === w.siteId);
        return { collector, forward: workspaceForwarder(collector, w) };
      }) }, remoteConfig);
      process.stdout.write(JSON.stringify({ event: "mobile.remote-listener.ready", controls: remoteConfig.controls === "profile" ? "profile" : "disabled" }) + "\n");
    } catch {
      console.error("Remote mobile listener disabled: private configuration or socket unavailable. Local Fleet remains running.");
    }
  }
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    mobileHvac.stop();
    const deadline = setTimeout(() => process.exit(1), 1e4);
    deadline.unref();
    await remote?.close();
    await poller.stop();
    for (const s of workspaceServers) {
      s.closeAllConnections();
      s.close();
    }
    server.close(() => {
      clearTimeout(deadline);
      process.exit(0);
    });
  };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());
}
void main().catch(() => {
  console.error("Fleet startup failed. Check private enrollment, account and TLS configuration.");
  process.exitCode = 1;
});
//# sourceMappingURL=fleet-server.cjs.map

var __profileControlsInstance;function __profileControls(){return __profileControlsInstance??=(require('./profile-controls.cjs')({object,identifier:identifier2,capabilities,normalizeLocalEmail,hashLocalPassword,readAccounts,parseEnrollment,FLEET_MIN_PASSWORD_LENGTH,AccessError,LocalSessions,allowedSiteIds,mobileSessionToken,remoteDesktopRead,requireFullWorkspace,workspacePath,workspaceRouteAllowed,monitoringWorkspaceRequest,passiveWorkspaceGet,remoteVerifier,allowedFetchSite,createMobileApp}));}

var __remoteAdminInstance;function __remoteAdmin(){return __remoteAdminInstance??=(require('./remote-admin.cjs')({validateFleetOrigin,LocalSessions,AccessError,allowedFetchSite,allowedSiteIds,unavailableHvac,normalizeLocalEmail,mobileSessionToken,fleetSessionToken,manageFleetAccount,listFleetAccounts,parseAdminAction}));}
