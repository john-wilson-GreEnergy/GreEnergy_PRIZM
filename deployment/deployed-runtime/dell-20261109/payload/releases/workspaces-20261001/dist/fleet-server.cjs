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
var import_node_path4 = __toESM(require("node:path"), 1);
var import_node_http = require("node:http");
var import_node_https2 = require("node:https");

// src/server/fleet/collectorTls.ts
var import_node_fs = require("node:fs");
var import_promises = require("node:fs/promises");
var import_node_path = __toESM(require("node:path"), 1);
var import_express = __toESM(require("express"), 1);
async function readPrivatePem(file) {
  if (!import_node_path.default.isAbsolute(file)) throw new Error("Absolute TLS path required");
  const parent = await (0, import_promises.lstat)(import_node_path.default.dirname(file));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 18) !== 0) throw new Error("TLS directory must be private");
  const handle = await (0, import_promises.open)(file, import_node_fs.constants.O_RDONLY | import_node_fs.constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 65536 || (stat.mode & 63) !== 0 || stat.uid !== process.getuid?.() && stat.uid !== 0) throw new Error("TLS file must be private and owned by service account or root");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

// src/server/security/localAccounts.ts
var import_node_crypto = require("node:crypto");
var import_node_fs2 = require("node:fs");
var import_promises2 = require("node:fs/promises");
var import_node_path2 = __toESM(require("node:path"), 1);

// src/core/security/localEmail.ts
function normalizeLocalEmail(value) {
  if (typeof value !== "string" || value.length > 320) return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [name, domain] = parts;
  if (!name || name.length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(name) || name.startsWith(".") || name.endsWith(".") || name.includes("..")) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
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
var identifier = (v) => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/.test(v);
function parseAccounts(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 256) throw new Error("Invalid local account store");
  const ids = /* @__PURE__ */ new Set(), names = /* @__PURE__ */ new Set();
  for (const row2 of raw) {
    if (!object(row2) || !identifier(row2.id) || typeof row2.email !== "string" || !normalizeLocalEmail(row2.email) || normalizeLocalEmail(row2.email) !== row2.email || typeof row2.disabled !== "boolean" || !Number.isSafeInteger(row2.version) || Number(row2.version) < 1 || !object(row2.password) || row2.password.algorithm !== "scrypt-v1" || typeof row2.password.salt !== "string" || !/^[a-f0-9]{32}$/.test(row2.password.salt) || typeof row2.password.digest !== "string" || !/^[a-f0-9]{128}$/.test(row2.password.digest) || !Array.isArray(row2.grants) || row2.grants.length > 100) throw new Error("Invalid local account");
    if (ids.has(row2.id) || names.has(row2.email)) throw new Error("Duplicate local identity");
    ids.add(row2.id);
    names.add(row2.email);
    for (const grant of row2.grants) {
      if (!object(grant) || !capabilities.has(String(grant.capability)) || !identifier(grant.siteId) || !identifier(grant.blockId) || !object(grant.scope) || grant.scope.kind !== "block" && (grant.scope.kind !== "targets" || !Array.isArray(grant.scope.ids) || !grant.scope.ids.length || grant.scope.ids.length > 5e3 || grant.scope.ids.some((id) => !identifier(id)))) throw new Error("Invalid local grant");
    }
  }
  return structuredClone(raw);
}
async function derive(password, salt) {
  return new Promise((resolve, reject) => (0, import_node_crypto.scrypt)(
    password,
    Buffer.from(salt, "hex"),
    64,
    { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)
  ));
}
async function verifyLocalPassword(password, record2) {
  if (typeof password !== "string" || password.length > 256) return false;
  return (0, import_node_crypto.timingSafeEqual)(await derive(password, record2.salt), Buffer.from(record2.digest, "hex"));
}
async function readPrivateJson(file) {
  if (!import_node_path2.default.isAbsolute(file)) throw new Error("Security file path must be absolute");
  const parent = await (0, import_promises2.lstat)(import_node_path2.default.dirname(file));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 18) !== 0) throw new Error("Security directory must not be writable by other accounts");
  const handle = await (0, import_promises2.open)(file, import_node_fs2.constants.O_RDONLY | import_node_fs2.constants.O_NOFOLLOW);
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
var import_node_crypto2 = require("node:crypto");
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
  constructor(accounts, clock = Date.now) {
    this.accounts = accounts;
    this.clock = clock;
    this.sessions = /* @__PURE__ */ new Map();
    this.attempts = /* @__PURE__ */ new Map();
    this.hashing = 0;
    this.dummy = { algorithm: "scrypt-v1", salt: (0, import_node_crypto2.randomBytes)(16).toString("hex"), digest: (0, import_node_crypto2.randomBytes)(64).toString("hex") };
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
      const account = (await this.accounts()).find((row2) => row2.email === email);
      const valid = await verifyLocalPassword(password, account?.password ?? this.dummy);
      if (!valid || !account || account.disabled) throw new AccessError(401, "Invalid credentials");
      const current = (await this.accounts()).find((row2) => row2.id === account.id);
      if (!current || current.disabled || fingerprint(current) !== fingerprint(account)) throw new AccessError(401, "Invalid credentials");
      const now = this.clock();
      for (const [key, value] of this.sessions) if (value.expiresAt <= now || now - value.touchedAt >= 15 * 6e4) this.sessions.delete(key);
      if (this.sessions.size >= 128) throw new AccessError(503, "Session capacity reached");
      const token = secret(), csrf = secret();
      this.sessions.set(digest(token), { subject: account.id, sessionId: (0, import_node_crypto2.randomUUID)(), fingerprint: fingerprint(account), csrf, issuedAt: now, expiresAt: now + 8 * 36e5, touchedAt: now });
      return { token, csrf };
    } finally {
      this.hashing--;
    }
  }
  async authenticate(token, touch = true) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AccessError(401, "Sign-in required");
    const key = digest(token), session = this.sessions.get(key), now = this.clock();
    if (!session || session.issuedAt > now || session.expiresAt <= now || now - session.touchedAt >= 15 * 6e4) {
      this.sessions.delete(key);
      throw new AccessError(401, "Sign-in required");
    }
    const account = (await this.accounts()).find((row2) => row2.id === session.subject);
    const checkedAt = this.clock();
    if (this.sessions.get(key) !== session || session.expiresAt <= checkedAt || checkedAt - session.touchedAt >= 15 * 6e4) {
      this.sessions.delete(key);
      throw new AccessError(401, "Sign-in required");
    }
    if (!account || account.disabled || fingerprint(account) !== session.fingerprint) {
      this.sessions.delete(key);
      throw new AccessError(401, "Session revoked");
    }
    if (touch) session.touchedAt = checkedAt;
    return { email: account.email, idleExpiresAt: Math.min(session.expiresAt, session.touchedAt + 15 * 6e4), csrf: session.csrf, principal: { subject: session.subject, sessionId: session.sessionId, state: "active", issuedAt: session.issuedAt, expiresAt: session.expiresAt, grants: structuredClone(account.grants) } };
  }
  checkCsrf(expected, supplied) {
    if (typeof supplied !== "string" || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !(0, import_node_crypto2.timingSafeEqual)(Buffer.from(supplied), Buffer.from(expected))) throw new AccessError(403, "Request token required");
  }
  logout(token) {
    this.sessions.delete(digest(token));
  }
};

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
      return { id: text(t.id, 24), label: text(t.label), array: coordinate(t.array), string: coordinate(t.string), bpc: coordinate(t.bpc), cell: coordinate(t.cell), pcs: coordinate(t.pcs), segment: coordinate(t.segment) };
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
  const age = (q, time) => q === "unknown" ? "unknown" : !current || !time || Date.parse(time) > now || now - Date.parse(time) >= 15e3 ? "stale" : q;
  result.quality = age(result.quality, result.observedAt);
  result.issues.quality = age(result.issues.quality, result.issues.observedAt);
  result.sensors.quality = age(result.sensors.quality, result.sensors.observedAt);
  for (const array of result.arrays) {
    array.quality = age(array.quality, array.observedAt);
    array.pcsQuality = age(array.pcsQuality, array.pcsObservedAt);
  }
  for (const pcs of result.pcs ?? []) for (const key of ["status", "rotation", "acContactor", "dc1", "dc2", "dc3", "insulationKohm", "maxIgbtF"]) {
    const reading = pcs[key], limit = key === "insulationKohm" || key === "maxIgbtF" ? 12e4 : reading.source === "EMS" ? 15e3 : 2e4;
    if (reading.quality !== "unknown" && (!current || !reading.observedAt || Date.parse(reading.observedAt) > now + 3e4 || now - Date.parse(reading.observedAt) >= limit)) reading.quality = "stale";
  }
  return result;
}

// src/server/fleet/FleetBroker.ts
var FLEET_TTL_MS = 15e3;
var record = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var identifier2 = (v) => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(v);
var IdentityConflict = class extends Error {
};
function parseEnrollment(value) {
  if (!record(value) || !identifier2(value.siteId) || !identifier2(value.blockId) || !identifier2(value.stationCode) || !Number.isSafeInteger(value.blockIndex) || Number(value.blockIndex) < 1 || typeof value.name !== "string" || !value.name.trim() || value.name.length > 120) throw new Error("Invalid fleet site enrollment");
  return { siteId: value.siteId, blockId: value.blockId, stationCode: value.stationCode, blockIndex: Number(value.blockIndex), name: value.name };
}
function observationAge(stamp2, now) {
  if (!stamp2) return null;
  const time = Date.parse(stamp2);
  return Number.isFinite(time) && time <= now ? now - time : null;
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
  return {
    schema: "prizm-site-summary-v1",
    siteId: site.siteId,
    blockId: site.blockId,
    stationCode: site.stationCode,
    blockIndex: site.blockIndex,
    stale: value.stale,
    observedAt: value.observedAt,
    metrics,
    details: parseFleetDetails(value.details)
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
      return { ...site, status, observedAt: summary?.observedAt ?? null, ageMs, lastReceivedAt: entry?.receivedAt ?? null, metrics, details: ageFleetDetails(summary?.details, now, status === "current") };
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
  const site = parseEnrollment(value), row2 = value;
  if (typeof row2.url !== "string" || typeof row2.token !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(row2.token)) throw new Error("Invalid collector credentials");
  const url = new URL(row2.url);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/api/fleet/site-summary" || url.protocol !== "https:" && !(allowLoopbackHttp && url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname))) throw new Error("Enrolled collector requires HTTPS and the fixed summary path");
  return { ...site, url: url.href, token: row2.token };
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
  constructor(broker, collectors, read = fetchCollector) {
    this.broker = broker;
    this.collectors = collectors;
    this.read = read;
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
      this.enqueue(collector, 4e3);
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

// src/server/fleet/fleetApp.ts
var import_express2 = __toESM(require("express"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);

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
  const path5 = raw.split("?")[0];
  if (!path5.startsWith("/") || path5.startsWith("//") || /[%\\\x00-\x20#]/.test(path5) || path5.split("/").some((s) => s === "." || s === "..") || path5.includes("//")) throw new AccessError(400, "Invalid workspace path");
  return path5;
}
function workspaceRouteAllowed(method, path5) {
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;
  path5 = path5.toLowerCase();
  if (path5.startsWith("/api/fleet") || path5.startsWith("/api/access")) return false;
  if (method !== "GET" && (path5.startsWith("/api/settings/profiles") || path5 === "/api/settings/test-connection" || path5 === "/api/local/demo-toggle")) return false;
  if (path5.startsWith("/api/") || path5.startsWith("/turtle/") || path5.startsWith("/tools/")) return true;
  return method === "GET" && (path5 === "/" || /^\/assets\/[A-Za-z0-9_.-]+\.(js|css|woff2?|ttf|png|svg)$/.test(path5) || /^\/(logo-transparent\.svg|favicon\.ico)$/.test(path5));
}
function passiveWorkspaceGet(path5) {
  return path5 === "/" || path5.startsWith("/assets/") || path5 === "/logo-transparent.svg" || path5 === "/favicon.ico" || path5 === "/api/local/site-data/strings-stream" || path5 === "/api/settings/profiles/export" || /^\/api\/local\/diagnostic-session\/[A-Za-z0-9_-]+\/export\/(json|csv)$/.test(path5) || /^\/api\/local\/reports\/download\/[A-Za-z0-9_.-]+(?:\/report\.(pdf|json))?$/.test(path5) || /^\/turtle\/tools\/report\/ems\/(ip_modbus_associations|stringIPMap|ipMap)\.csv$/.test(path5);
}

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
  const cookieOptions = { httpOnly: true, secure: origin.protocol === "https:", sameSite: "strict", path: "/", maxAge: 8 * 36e5 };
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
    return { email: auth.email, csrf: auth.csrf, idleExpiresAt: auth.idleExpiresAt, readOnly: true, simulated: options.simulated === true, workspaces };
  }));
  app.get("/api/fleet/summary", guarded(async (_req, _token, principal) => broker.view(allowedSiteIds(broker, principal))));
  app.post("/api/fleet/touch", guarded(async (req, token) => {
    const auth = await sessions.authenticate(token, false);
    if (req.headers.origin !== origin.origin) throw new AccessError(403, "Same-origin request required");
    sessions.checkCsrf(auth.csrf, req.headers["x-prizm-csrf"]);
    await sessions.authenticate(token, true);
    return { active: true };
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

// src/server/fleet/workspaceGateway.ts
var import_express3 = __toESM(require("express"), 1);
var import_node_https = __toESM(require("node:https"), 1);
var import_node_stream = require("node:stream");
function workspaceForwarder(collector, enrollment, ca) {
  const target = new URL(collector.url);
  if (target.protocol !== "https:") throw Error("Workspace upstream must use verified TLS");
  const agent = new import_node_https.default.Agent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 2, ...ca ? { ca } : {} });
  let active = 0;
  return async (req, res, recheck) => {
    if (active >= 24) throw new AccessError(503, "Site workspace is busy; request was not dispatched");
    active++;
    return new Promise((resolve) => {
      let settled = false, received = 0;
      const headers = { Authorization: "Bearer " + enrollment.token, Accept: String(req.headers.accept ?? "*/*") };
      for (const key of ["content-type", "content-length"]) if (typeof req.headers[key] === "string") headers[key] = req.headers[key];
      const upstream = import_node_https.default.request({
        hostname: target.hostname,
        port: Number(target.port || 443),
        method: req.method,
        path: "/api/fleet/workspace" + req.url,
        headers,
        agent,
        rejectUnauthorized: true
      }, (response) => {
        void recheck().then(() => {
          if (settled) return;
          const status = response.statusCode ?? 502;
          if (status >= 300 && status < 400) {
            response.destroy();
            fail("Collector redirect refused");
            return;
          }
          for (const key of ["content-type", "content-disposition", "content-length", "x-prizm-cycle-id"]) {
            const value = response.headers[key];
            if (typeof value === "string") res.setHeader(key, value);
          }
          res.status(status);
          response.on("data", (chunk) => {
            received += chunk.length;
            if (received > 64 * 1024 * 1024 && !response.headers["content-type"]?.startsWith("text/event-stream")) fail("Response limit exceeded");
          });
          response.on("error", () => fail("Collector response interrupted"));
          response.pipe(res);
        }).catch(() => {
          response.destroy();
          fail("Workspace access ended", 401);
        });
      });
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
      function finish() {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        clearInterval(accessTimer);
        active--;
        upstream.destroy();
        req.unpipe(limit);
        limit.unpipe(upstream);
        limit.destroy();
        resolve();
      }
      function fail(message, status = 502) {
        if (settled) return;
        if (!res.headersSent) res.status(status).json({ error: message + ". If a command was submitted, verify its outcome before retrying." });
        else res.destroy();
        finish();
      }
      upstream.on("error", () => fail("Collector connection unavailable"));
      limit.on("error", () => fail("Request body too large", 413));
      req.once("aborted", finish);
      res.once("close", finish);
      res.once("finish", finish);
      req.pipe(limit).pipe(upstream);
    });
  };
}
function createWorkspaceGateway(sessions, collector, enrollment, fleetOrigin, audit, forward, allowLoopbackHttp = false) {
  const origin = validateFleetOrigin(enrollment.origin, allowLoopbackHttp), fleet = validateFleetOrigin(fleetOrigin, allowLoopbackHttp), app = (0, import_express3.default)();
  if (origin.hostname !== fleet.hostname || origin.origin === fleet.origin) throw Error("Distinct workspace origin on the Fleet host required");
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.set("case sensitive routing", true);
  app.set("strict routing", true);
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
      const path5 = workspacePath(req.url), token = fleetSessionToken(req);
      const recheck = async () => {
        const auth2 = await sessions.authenticate(token, false);
        requireFullWorkspace(auth2.principal, collector);
        return auth2;
      };
      const auth = await recheck();
      if (path5 === "/api/fleet/workspace-context" && req.method === "GET" && !req.url.includes("?")) {
        res.json({
          siteId: collector.siteId,
          siteName: collector.name,
          stationCode: collector.stationCode,
          blockIndex: collector.blockIndex,
          fleetUrl: fleet.origin + "/#site=" + encodeURIComponent(collector.siteId),
          email: auth.email,
          csrf: auth.csrf,
          fullControl: true
        });
        return;
      }
      if (req.method !== "GET" || !passiveWorkspaceGet(path5)) {
        if (req.headers.origin && req.headers.origin !== origin.origin) throw new AccessError(403, "Same-origin request required");
        if (req.method !== "GET" && req.headers.origin !== origin.origin) throw new AccessError(403, "Same-origin request required");
        sessions.checkCsrf(auth.csrf, req.headers["x-prizm-csrf"]);
      }
      if (path5 === "/api/fleet/workspace-touch" && req.method === "POST" && !req.url.includes("?")) {
        await sessions.authenticate(token, true);
        res.json({ active: true });
        return;
      }
      if (!workspaceRouteAllowed(req.method, path5)) throw new AccessError(403, "Connection enrollment and this route are not editable from the site workspace");
      if (Number(req.headers["content-length"] ?? 0) > 50 * 1024 * 1024) throw new AccessError(413, "Request body too large");
      if (req.method !== "GET" || path5.startsWith("/tools/controls/")) {
        await audit({ action: "workspace.dispatch", outcome: "authorized", subject: auth.principal.subject, siteId: collector.siteId, method: req.method, path: path5 });
      } else if (path5 === "/") await audit({ action: "workspace.open", outcome: "authorized", subject: auth.principal.subject, siteId: collector.siteId });
      await recheck();
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
  if (!config || typeof config.origin !== "string" || typeof config.accountsFile !== "string" || !import_node_path4.default.isAbsolute(config.accountsFile) || !Array.isArray(config.collectors)) throw new Error("Invalid fleet configuration");
  const origin = validateFleetOrigin(config.origin, config.allowLoopbackHttp === true);
  const collectors = config.collectors.map((value) => parseCollector(value, config.allowLoopbackHttp === true));
  const broker = new FleetBroker(collectors), poller = new CollectorPoller(broker, collectors);
  const accountsFile = config.accountsFile;
  await readAccounts(accountsFile);
  const sessions = new LocalSessions(() => readAccounts(accountsFile));
  const workspaces = parseWorkspaceEnrollments(config.workspaces, collectors, config.origin);
  const audit = async (event) => {
    process.stdout.write(JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), ...event }) + "\n");
  };
  const app = createFleetApp(broker, sessions, {
    origin: config.origin,
    allowLoopbackHttp: config.allowLoopbackHttp === true,
    publicDirectory: import_node_path4.default.resolve("dist"),
    audit,
    workspaces: workspaces.map(({ siteId, origin: origin2 }) => ({ siteId, origin: origin2 }))
  });
  const tls = origin.protocol === "https:";
  if (tls && (typeof config.tlsKeyFile !== "string" || typeof config.tlsCertFile !== "string" || !import_node_path4.default.isAbsolute(config.tlsKeyFile) || !import_node_path4.default.isAbsolute(config.tlsCertFile))) throw new Error("TLS key and certificate paths required");
  const server = tls ? (0, import_node_https2.createServer)({ key: await readPrivatePem(config.tlsKeyFile), cert: await readPrivatePem(config.tlsCertFile), minVersion: "TLSv1.2", handshakeTimeout: 5e3, maxHeaderSize: 8192 }, app) : (0, import_node_http.createServer)(app);
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
      const gateway = createWorkspaceGateway(sessions, collector, workspace, config.origin, audit, workspaceForwarder(collector, workspace));
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
  process.stdout.write(JSON.stringify({ event: "fleet.started", origin: origin.origin, readOnly: true }) + "\n");
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 1e4);
    deadline.unref();
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
