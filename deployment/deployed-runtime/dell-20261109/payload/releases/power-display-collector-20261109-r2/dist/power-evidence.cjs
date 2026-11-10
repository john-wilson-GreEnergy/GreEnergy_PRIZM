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

// <stdin>
var stdin_exports = {};
__export(stdin_exports, {
  buildPowerEvidence: () => buildPowerEvidence,
  parsePowerEvidence: () => parsePowerEvidence,
  parseSunspecRequest: () => parseSunspecRequest,
  projectSunspecRequest: () => projectSunspecRequest,
  stampSunspecResponse: () => stampSunspecResponse
});
module.exports = __toCommonJS(stdin_exports);

// src/core/telemetryNumber.ts
function finiteNumber(v) {
  if (typeof v !== "number" && (typeof v !== "string" || !/^-?\d+(\.\d+)?$/.test(v))) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// src/server/telemetry/powerEvidence.ts
var object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var timestamp = (v) => {
  const n = typeof v === "string" && !/^\d+$/.test(v) ? Date.parse(v) : finiteNumber(v);
  return n !== null && Number.isFinite(n) && n > 1e11 && n < 864e13 ? n : null;
};
var iso = (v) => v === null ? null : new Date(v).toISOString();
function buildPowerEvidence(input) {
  const now = input.now ?? Date.now();
  const fresh = (at2) => at2 !== null && now - at2 >= -5e3 && now - at2 <= 6e4;
  const expected = Number.isInteger(input.expectedPcs) && input.expectedPcs > 0 ? input.expectedPcs : 0;
  const rows = Object.values(object(input.pcsReports)).flatMap((group) => Object.values(object(group))).map(object);
  const aggregate = (field) => {
    const samples = rows.map((row) => {
      const data = object(row.data);
      return { value: finiteNumber(object(data.arrayPcsData)[field]), at: timestamp(data.timeStamp), received: timestamp(row.fetchedAt), ok: row.ok === true };
    });
    const valid = samples.filter((s) => s.ok && s.value !== null);
    const complete = expected > 0 && rows.length === expected && valid.length === expected;
    const times = valid.flatMap((s) => s.at === null ? [] : [s.at]);
    const receipts2 = valid.flatMap((s) => s.received === null ? [] : [s.received]);
    const live = complete && input.siteLive && samples.every((s) => fresh(s.at) && fresh(s.received));
    const total = complete ? valid.reduce((sum, s) => sum + s.value, 0) : null;
    const valueKw = total !== null && Number.isFinite(total) ? total : null;
    return {
      valueKw,
      source: "EMS PCS reports \xB7 " + field,
      observedFrom: times.length ? iso(Math.min(...times)) : null,
      observedAt: times.length ? iso(Math.max(...times)) : null,
      receivedAt: receipts2.length ? iso(Math.min(...receipts2)) : null,
      quality: valueKw === null ? "unavailable" : live ? "live" : "stale",
      reporting: valid.length,
      expected,
      reason: !complete ? "Complete PCS coverage is required; partial readings are not presented as a site total." : !live ? "One or more source timestamps, receipt times, or site freshness checks are unavailable or stale." : "Sum of all enrolled PCS reports. Source timestamps may differ."
    };
  };
  const m = input.modbus, watts = finiteNumber(m.block.BasicOpTargetPower), at = timestamp(m.capturedAt);
  const apps = Array.isArray(input.emsApps) ? input.emsApps.map(object).filter((app) => app.appCode === "SSPC001") : [];
  const request = apps.length === 1 ? apps[0].sunspecRequest : void 0;
  const sunspec = request ? { ...request, quality: request.valueKw === null ? "unavailable" : !input.siteLive || !fresh(timestamp(request.observedAt)) || !fresh(timestamp(request.receivedAt)) ? "stale" : request.quality } : {
    valueKw: null,
    source: "EMS SunSpec app \xB7 SSPC001",
    observedFrom: null,
    observedAt: null,
    receivedAt: null,
    quality: "unavailable",
    reporting: 0,
    expected: 1,
    reason: "No unique verified SunSpec request is published. Basic-operation and PCS commands are not substituted."
  };
  return { site: input.site, readings: {
    sunspecRequested: sunspec,
    pcsCommanded: aggregate("acCmdRealPowerKW"),
    pcsMeasured: aggregate("acRealPowerKW"),
    basicOperationTarget: {
      valueKw: m.available && watts !== null ? watts / 1e3 : null,
      source: "EMS Modbus \xB7 BasicOpTargetPower",
      observedFrom: null,
      observedAt: null,
      receivedAt: iso(at),
      reporting: m.available && watts !== null ? 1 : 0,
      expected: 1,
      quality: !m.available || watts === null ? "unavailable" : m.stale || !input.siteLive || !fresh(at) ? "stale" : "live",
      reason: "Basic-operation register, not the SunSpec request. Timestamp is collection time; command issue time is not supplied."
    }
  } };
}

// src/server/ems/sunspecRequest.ts
var object2 = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var evidenceTime = (v) => {
  const n = typeof v === "string" && !/^\d+$/.test(v) ? Date.parse(v) : finiteNumber(v);
  return n !== null && Number.isFinite(n) && n > 1e11 && n < 864e13 ? n : null;
};
var iso2 = (v) => {
  const n = evidenceTime(v);
  return n === null ? null : new Date(n).toISOString();
};
var freshPowerEvidence = (v, now) => {
  const n = evidenceTime(v);
  return n !== null && now - n >= -5e3 && now - n <= 6e4;
};
function parseSunspecRequest(value) {
  if (typeof value !== "string" || value.length > 512) return null;
  const match = value.trim().match(/^Recent AC Power Command received\s*:\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*kW\s*\/\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*kVAr\s*$/i);
  if (!match) return null;
  const realKw = finiteNumber(match[1]), reactiveKvar = finiteNumber(match[2]);
  return realKw === null || reactiveKvar === null ? null : { realKw, reactiveKvar };
}
function reportParts(payload) {
  const root = object2(payload), report = object2(root.dragonAppReport), block = object2(root.blockReport);
  const slots = object2(report.dragonAppData).dragonAppSlotData;
  const apps = Array.isArray(slots) ? slots.map(object2).filter((a) => a.appCode === "SSPC001") : [];
  return { block, report, apps };
}
function fingerprint(payload) {
  const { block, report, apps } = reportParts(payload);
  return JSON.stringify([block.stationCode, block.blockIndex, report.timestamp, apps]);
}
var receipts = /* @__PURE__ */ new WeakMap();
function stampSunspecResponse(payload, receivedAt, live) {
  if (payload && typeof payload === "object") receipts.set(payload, { at: receivedAt, live, signature: fingerprint(payload) });
}
function projectSunspecRequest(payload, station, blockIndex, now = Date.now()) {
  const { block, report, apps } = reportParts(payload);
  const receipt = payload && typeof payload === "object" ? receipts.get(payload) : void 0;
  const identity = block.stationCode === station && finiteNumber(block.blockIndex) === blockIndex;
  const app = apps.length === 1 ? apps[0] : null;
  const parsed = identity && app ? parseSunspecRequest(app.appStatus) : null;
  const at = iso2(report.timestamp), receivedAt = receipt?.at ?? null;
  const live = !!parsed && app?.enabled === true && receipt?.live === true && receipt.signature === fingerprint(payload) && freshPowerEvidence(at, now) && freshPowerEvidence(receivedAt, now);
  return {
    valueKw: parsed?.realKw ?? null,
    source: "EMS SunSpec app \xB7 SSPC001 \xB7 lastCall status",
    observedFrom: at,
    observedAt: at,
    receivedAt,
    quality: !parsed ? "unavailable" : live ? "live" : "stale",
    reporting: parsed ? 1 : 0,
    expected: 1,
    reason: !identity ? "SunSpec report does not match this site and block." : apps.length !== 1 ? "A unique SunSpec app report is required." : !parsed ? "The SunSpec report has no recognized numeric request in kW." : app?.enabled !== true ? "SunSpec app is not confirmed enabled; retained request is not an active target." : !live ? "SunSpec report is stale or its live acquisition cannot be verified." : "Latest request reported by EMS from PPC. Source time is the app report time; PPC command issue time is not supplied."
  };
}

// src/core/powerEvidence.ts
var powerEvidenceLabels = {
  sunspecRequested: "SunSpec requested power",
  pcsCommanded: "PCS commanded power",
  pcsMeasured: "PCS measured power",
  basicOperationTarget: "Basic-operation target"
};
function parsePowerEvidence(value) {
  if (value == null) return void 0;
  const obj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const stamp = (v) => v === null || typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v));
  if (!obj(value) || typeof value.site !== "string" || value.site.length > 120 || !obj(value.readings)) throw new Error("Invalid power evidence");
  const readings = {};
  for (const key of Object.keys(powerEvidenceLabels)) {
    const r = value.readings[key];
    if (!obj(r) || !(r.valueKw === null || typeof r.valueKw === "number" && Number.isFinite(r.valueKw) && Math.abs(r.valueKw) <= 1e12) || !stamp(r.observedFrom) || !stamp(r.observedAt) || !stamp(r.receivedAt) || typeof r.source !== "string" || r.source.length > 160 || typeof r.reason !== "string" || r.reason.length > 600 || !["live", "stale", "unavailable"].includes(String(r.quality)) || !Number.isSafeInteger(r.reporting) || Number(r.reporting) < 0 || Number(r.reporting) > 1e4 || !Number.isSafeInteger(r.expected) || Number(r.expected) < 0 || Number(r.expected) > 1e4) throw new Error("Invalid power reading");
    readings[key] = {
      valueKw: r.valueKw,
      source: r.source,
      reason: r.reason,
      quality: r.valueKw === null ? "unavailable" : r.quality,
      observedFrom: r.observedFrom,
      observedAt: r.observedAt,
      receivedAt: r.receivedAt,
      reporting: Number(r.reporting),
      expected: Number(r.expected)
    };
  }
  return { site: value.site, readings };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildPowerEvidence,
  parsePowerEvidence,
  parseSunspecRequest,
  projectSunspecRequest,
  stampSunspecResponse
});
