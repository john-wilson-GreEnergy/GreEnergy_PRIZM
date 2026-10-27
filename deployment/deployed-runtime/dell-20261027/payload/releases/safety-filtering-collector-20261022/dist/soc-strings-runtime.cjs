var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/soc-strings-runtime.ts
var soc_strings_runtime_exports = {};
__export(soc_strings_runtime_exports, {
  StringFieldDeltas: () => StringFieldDeltas,
  mergeMonitorFields: () => mergeMonitorFields,
  normalizeSocPercent: () => normalizeSocPercent,
  projectSitePowerFlow: () => projectSitePowerFlow
});
module.exports = __toCommonJS(soc_strings_runtime_exports);

// src/core/socPercent.ts
function normalizeSocPercent(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

// src/server/telemetry/stringviewer/mergeMonitorFields.ts
var time = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
var present = (value) => value !== null && value !== void 0 && value !== "";
function mergeMonitorFields(row, sv, entry) {
  const baselineAt = time(row.sourceTimestampUtc ?? row.timestampUtc);
  const detailAt = time(sv.reportTimestamp);
  const legacy = process.env.PRIZM_STRING_FRESHNESS_AUTHORITY === "false";
  const authoritative = legacy || (!entry || entry.success && !entry.stale) && detailAt !== null && (baselineAt === null || detailAt >= baselineAt);
  const values = {
    busVoltage: sv.dcBusVoltage,
    outRotation: sv.outRotation,
    positiveContactorClosed: sv.positiveContactorClosed,
    negativeContactorClosed: sv.negativeContactorClosed,
    contactorsCloseExpected: sv.contactorsCloseExpected,
    recloseCount: sv.recloseCount,
    badReport: sv.badReport,
    fanRequested: sv.lastFanCommand ?? sv.fanCommand ?? sv.requestedFanCommand ?? sv.stringFanRequested,
    fanActual: sv.fanActual ?? sv.fanState ?? sv.fanStatus ?? sv.fanSpeed ?? sv.fanSpeedRpm ?? sv.stringFanActual,
    socPct: normalizeSocPercent(sv.soc),
    measuredVoltage: sv.measuredStringVoltage,
    calculatedVoltage: sv.calculatedStringVoltage,
    minCellVoltage: sv.minCellGroupVoltage,
    maxCellVoltage: sv.maxCellGroupVoltage,
    avgCellVoltage: sv.avgCellGroupVoltage,
    minCellTemperature: sv.minCellGroupTemp,
    maxCellTemperature: sv.maxCellGroupTemp,
    avgCellTemperature: sv.avgCellGroupTemp,
    amps: sv.stringCurrent,
    bpcCount: sv.batteryPackCount,
    cellGroupCount: sv.cellGroupCount,
    operationalState: sv.stringConnectionState
  };
  const fallbackFields = [];
  for (const [key, value] of Object.entries(values)) {
    if (!present(value)) continue;
    if (authoritative) row[key] = value;
    else if (key !== "socPct" && !present(row[key])) {
      row[key] = value;
      fallbackFields.push(key);
    }
  }
  if (authoritative && detailAt !== null) row.timestampUtc = sv.reportTimestamp;
  row.stringViewerFreshness = {
    sourceTimestamp: typeof sv.reportTimestamp === "string" ? sv.reportTimestamp : null,
    stale: entry?.stale === true || !authoritative,
    authority: authoritative ? "newer-detail" : "baseline-preserved",
    fallbackFields
  };
}

// src/server/telemetry/compactStringList.ts
var import_node_crypto = require("node:crypto");
var stringTransportEpoch = (0, import_node_crypto.randomUUID)();
var object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
var balanceKeys = [
  "bpIndex",
  "bpcNumber",
  "mode",
  "displayState",
  "state",
  "missingFromSource",
  "balancingCellGroup",
  "isActive",
  "balanceTelemetryPresent"
];
function compactStringRow(row) {
  const { raw, balancing, sourceDebug, balanceDetails, ...result } = row;
  const reason = object(object(sourceDebug).canonicalStringSnapshot).reason;
  if (reason !== void 0) result.sourceDebug = { canonicalStringSnapshot: { reason } };
  if (Array.isArray(balanceDetails)) result.balanceDetails = balanceDetails.map((value) => {
    const source = object(value);
    return Object.fromEntries(balanceKeys.filter((key) => key in source).map((key) => [key, source[key]]));
  });
  else if (balanceDetails !== void 0) result.balanceDetails = balanceDetails;
  return result;
}

// src/server/telemetry/stringFieldDeltas.ts
var StringFieldDeltas = class {
  constructor(epoch = stringTransportEpoch) {
    this.epoch = epoch;
    this.rows = /* @__PURE__ */ new Map();
  }
  seed(rows) {
    for (const row of rows) this.rows.set(`${Number(row.arrayNumber ?? row.arrayIndex)}:${Number(row.stringNumber ?? row.stringIndex)}`, compactStringRow(row));
  }
  project(publication) {
    const changes = publication.changes.map((change) => {
      const next = compactStringRow(change.row), before = this.rows.get(change.key);
      this.rows.set(change.key, next);
      if (!before) return { key: change.key, row: next };
      const row = { arrayNumber: next.arrayNumber ?? next.arrayIndex, stringNumber: next.stringNumber ?? next.stringIndex };
      for (const [key, value] of Object.entries(next)) if (JSON.stringify(value) !== JSON.stringify(before[key])) row[key] = value;
      return { key: change.key, row, patch: true, removed: Object.keys(before).filter((key) => !(key in next)) };
    });
    return { ...publication, transportEpoch: this.epoch, changes };
  }
};

// src/server/fleet/powerFlow.ts
var labels = { charging: "Charging", discharging: "Discharging", idle: "Idle", unknown: "Direction unavailable", stale: "Stale \xB7 flow withheld" };
var ttl = 15e3;
var POWER_FLOW_IDLE_KW = 15;
function projectSitePowerFlow(site, now) {
  const supported = ["BHE0020", "BHE0021"].includes(site.stationCode);
  const reading = (power, stamp, quality) => {
    const at = stamp ? Date.parse(stamp) : NaN;
    const known = supported && power !== null && Number.isFinite(power) && Number.isFinite(at) && at <= now;
    const fresh = known && site.status === "current" && quality === "live" && now - at < ttl;
    const direction = !known || quality === "unknown" ? "unknown" : !fresh ? "stale" : power < -POWER_FLOW_IDLE_KW ? "charging" : power > POWER_FLOW_IDLE_KW ? "discharging" : "idle";
    return { direction, powerKw: known ? power : null, observedAt: stamp, label: labels[direction], validUntil: fresh ? at + ttl : null };
  };
  const r = site.metrics?.powerKw ?? { value: null, observedAt: null, quality: "unknown", source: "Unavailable" };
  const net = reading(r.value, r.observedAt, r.source === "EMS Modbus" ? r.quality : "unknown");
  const arrays = (site.details?.arrays ?? []).map((a) => {
    const percent = a.socPct, stamp = a.socObservedAt ?? null, at = stamp ? Date.parse(stamp) : NaN;
    const known = typeof percent === "number" && Number.isFinite(percent) && percent >= 0 && percent <= 100 && Number.isFinite(at) && at <= now && a.socQuality !== void 0 && a.socQuality !== "unknown";
    const fresh = known && site.status === "current" && a.socQuality === "live" && now - at < ttl;
    const connected = a.onlineStrings, total = a.stringCount;
    const countsValid = typeof connected === "number" && Number.isSafeInteger(connected) && connected >= 0 && typeof total === "number" && Number.isSafeInteger(total) && total > 0 && connected <= total;
    const coverage = known && countsValid ? { connected, total, label: `${connected}/${total} strings connected`, partial: connected < total } : null;
    const soc = { percent: known ? percent : null, quality: !known ? "unknown" : fresh ? "live" : "stale", observedAt: stamp, validUntil: fresh ? at + ttl : null, source: "EMS array online SOC", coverage };
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  StringFieldDeltas,
  mergeMonitorFields,
  normalizeSocPercent,
  projectSitePowerFlow
});
