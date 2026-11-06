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

// scripts/clss-deployed-server.ts
var clss_deployed_server_exports = {};
__export(clss_deployed_server_exports, {
  CLSS_TARGETS: () => CLSS_TARGETS,
  clssMonitor: () => clssMonitor,
  clssRouter: () => clssRoutes_default,
  discoverClssPanel: () => discoverClssPanel,
  readClssPanelReading: () => readClssPanelReading,
  readClssPanelStatus: () => readClssPanelStatus
});
module.exports = __toCommonJS(clss_deployed_server_exports);

// src/shared/clssDevices.ts
var clssEventIsFire = (code) => code !== null && [16, 234, 237].includes(code);
var CLSS_EVENT_NAMES = Object.freeze({ 0: "No active status", 5: "Mass notification alarm (high priority)", 16: "Fire alarm", 17: "Security alarm (life)", 18: "Critical process alarm (life)", 19: "Medical emergency", 20: "CO alarm", 21: "Mass notification alarm (low priority)", 32: "Security alarm (property)", 33: "Critical process (property)", 37: "Mass notification supervisory (high priority)", 48: "Supervisory signal (guard tour)", 64: "Supervisory signal (equipment)", 69: "Mass notification supervisory (low priority)", 82: "Disabled alarm", 85: "Disabled active", 113: "Non-fire activation", 114: "Non-fire activation (no acknowledgment required)", 234: "CO alarm and fire alarm", 235: "CO supervisory", 236: "CO supervisory and photo supervisory", 237: "CO supervisory and fire alarm", 238: "CO alarm and photo supervisory" });

// src/server/clss/ClssDeviceDetails.ts
function decodeClssPointFlags(word) {
  const enabled = !!(word & 1024), disabled = !!(word & 512), code = word & 2048 ? word & 255 : null;
  return {
    statusWord: word,
    trouble: !!(word & 8192),
    inactive: !!(word & 4096),
    prealarm: !!(word & 16384),
    nonFireAcknowledged: !!(word & 32768),
    fireAcknowledged: !!(word & 256),
    enableState: enabled && disabled ? "conflicting" : enabled ? "enabled" : disabled ? "disabled" : "unknown",
    activeEventCode: code,
    activeEvent: code === null ? "No active event reported" : CLSS_EVENT_NAMES[code] ?? `Unknown active event 0x${code.toString(16).padStart(2, "0").toUpperCase()}`
  };
}
var emptyDeviceGroup = (kind) => ({ kind, points: [], notProgrammedAddresses: [], unavailableAddresses: [], lastSuccessAt: null, stale: true, lastError: null });
var emptyCheck = () => ({ before: null, after: null, identified: 0, verification: "scan-unavailable", message: "Device scan not available" });
var emptyDeviceDetails = () => ({ scope: "loop-1-detectors-and-modules", detectors: emptyDeviceGroup("detector"), modules: emptyDeviceGroup("module"), checks: { detectorAlarms: emptyCheck(), moduleAlarms: emptyCheck(), detectorTroubles: emptyCheck(), moduleTroubles: emptyCheck() }, typeCoverage: 0, typeLastError: null });
var detectorTypes = { 256: "Heat detector", 257: "Rate-of-rise heat detector", 258: "Fixed-temperature heat detector", 259: "High-heat detector", 512: "Ion smoke detector (latching)", 513: "Ion smoke detector (tracking)", 768: "Photo smoke detector (latching)", 769: "Photo smoke detector (tracking)", 770: "Duct photo smoke detector (latching)", 771: "Duct photo smoke detector (tracking)", 1280: "Harsh-environment smoke detector", 1281: "Beam smoke detector", 1536: "Multi-sensor smoke detector", 1537: "Acclimate smoke detector", 1792: "CO detector", 1793: "Fire/CO detector", 1794: "Photo/CO detector" };
var moduleTypes = { 16: "Monitor input", 18: "Pull station", 20: "Monitor tracking input", 22: "Normally closed monitor input", 32: "Waterflow input", 52: "Equipment monitor input", 56: "Tamper input", 80: "Fire control", 113: "Power supply", 4098: "Relay output", 4100: "Non-reset control output", 4112: "Bell circuit", 4113: "Strobe circuit", 4114: "Horn circuit", 4160: "Relay feedback" };
function deviceTypeName(kind, code) {
  if (code === null || code === 65535) return "Device type unavailable";
  if (code === 0) return "Device type not identified";
  return (kind === "detector" ? detectorTypes : moduleTypes)[code] ?? `Unmapped ${kind} type 0x${code.toString(16).padStart(4, "0").toUpperCase()}`;
}
function normalizeDeviceGroup(kind, scan, previous = emptyDeviceGroup(kind)) {
  const part = kind === "detector" ? scan.detectors : scan.modules;
  if (part.error || !part.words || part.words.length !== 300 || part.words.some((w) => !Number.isInteger(w) || w < 0 || w > 65535)) {
    if (part.partialWords?.length === 300 && part.partialWords.some((w) => w !== null)) {
      const words = Array(300).fill(65535), prefix2 = kind === "detector" ? "L1D" : "L1M";
      for (const p of previous.points) words[p.point - 1] = p.statusWord;
      for (const a of previous.notProgrammedAddresses) words[Number(a.slice(prefix2.length)) - 1] = 255;
      part.partialWords.forEach((w, i) => {
        if (w !== null && Number.isInteger(w) && w >= 0 && w <= 65535) words[i] = w;
      });
      const merged = normalizeDeviceGroup(kind, { ...scan, [kind === "detector" ? "detectors" : "modules"]: { ...part, words, error: null, partialWords: void 0 } }, previous);
      merged.points.forEach((p) => {
        if (part.partialWords[p.point - 1] === null) p.observedAt = previous.points.find((old) => old.point === p.point)?.observedAt ?? previous.lastSuccessAt;
      });
      return { ...merged, lastSuccessAt: previous.lastSuccessAt, stale: true, lastError: part.error ?? "Incomplete device scan; successful blocks retained, remaining points historical or unknown" };
    }
    return { ...previous, stale: true, lastError: part.error ?? "Incomplete device-status scan" };
  }
  const prefix = kind === "detector" ? "L1D" : "L1M", offset = kind === "detector" ? 0 : 300;
  const points = [], notProgrammedAddresses = [], unavailableAddresses = [];
  part.words.forEach((word, index) => {
    const address = prefix + (index + 1);
    const old = previous.points.find((p) => p.address === address);
    const unavailable = () => {
      unavailableAddresses.push(address);
      if (old) points.push({ ...old, statusStale: true });
    };
    if (word === 255) {
      const type2 = scan.types.words[offset + index];
      if (type2 !== null && type2 !== void 0 && type2 !== 65535 && type2 !== 0 || old && (old.activeEventCode !== null || old.trouble || old.prealarm)) unavailable();
      else notProgrammedAddresses.push(address);
      return;
    }
    if (word === 65535) {
      unavailable();
      return;
    }
    const type = scan.types.words[offset + index] ?? null, at = scan.types.at[offset + index] ?? null;
    points.push({ kind, point: index + 1, statusStale: false, observedAt: new Date(part.pointObservedAt?.[index] ?? part.at).toISOString(), address, loop: 1, ...decodeClssPointFlags(word), deviceTypeCode: type, deviceTypeName: deviceTypeName(kind, type), typeObservedAt: at === null ? null : new Date(at).toISOString() });
  });
  return { kind, points, notProgrammedAddresses, unavailableAddresses, lastSuccessAt: new Date(part.at).toISOString(), stale: false, lastError: points.length === 0 ? "No programmed status points visible; node monitoring/synchronization remains unverified" : unavailableAddresses.length ? "Some status points unavailable" : null };
}
function normalizeDeviceScan(scan, previous = emptyDeviceDetails()) {
  const detectors = normalizeDeviceGroup("detector", scan, previous.detectors), modules = normalizeDeviceGroup("module", scan, previous.modules);
  const check = (group, index, alarm) => {
    const before = scan.before?.[index] ?? null, after = scan.after?.[index] ?? null, identified = group.points.filter((p) => !p.statusStale && (alarm ? clssEventIsFire(p.activeEventCode) : p.trouble)).length;
    const unavailable = group.stale || group.points.length === 0 || group.unavailableAddresses.length > 0 || ![before, after].every((n) => n !== null && Number.isInteger(n) && n >= 0 && n <= 300);
    const verification = unavailable ? "scan-unavailable" : before === after && after === identified ? "matched" : "mismatch";
    return { before, after, identified, verification, message: verification === "matched" ? null : `${group.kind} ${alarm ? "fire alarm" : "trouble"} count unverified: summary ${before ?? "unknown"} before / ${after ?? "unknown"} after; ${identified} point flags. ${unavailable ? "Incomplete or unverified point visibility." : "Discrepancy unresolved; readings may have changed."}` };
  };
  return { scope: "loop-1-detectors-and-modules", detectors, modules, checks: { detectorAlarms: check(detectors, 0, true), moduleAlarms: check(modules, 5, true), detectorTroubles: check(detectors, 1, false), moduleTroubles: check(modules, 6, false) }, typeCoverage: scan.types.words.filter((w) => w !== null).length, typeLastError: scan.types.error };
}

// src/server/clss/ClssDeviceSchedule.ts
function drawingReferenceForModule(module2) {
  if (!Number.isInteger(module2)) return null;
  const source = {
    drawing: "E-D-00069",
    revision: "22",
    sheet: 4,
    verification: "drawing-reference-unverified"
  };
  if (module2 === 142) return {
    ...source,
    deviceTag: "FMM-101 / EAS-1",
    deviceType: "Mini-monitor module \xB7 manual exhaust actuation switch",
    location: "Collection segment / control container",
    addressGroup: "L1M142"
  };
  if (module2 < 1 || module2 > 126) return null;
  const segment = Math.floor((module2 - 1) / 6) + 1;
  const slot = (module2 - 1) % 6;
  const start = (segment - 1) * 6 + (slot < 4 ? 1 : 5);
  return {
    ...source,
    deviceTag: `${slot < 4 ? "FDRM" : "FDM"}-1-${segment}`,
    deviceType: slot < 4 ? "Dual monitor / dual relay module address group" : "Dual monitor module address group",
    location: `Energy Segment ${segment} \xB7 TC-1 terminal cabinet`,
    addressGroup: `L1M${start}\u2013L1M${start + (slot < 4 ? 3 : 1)}`
  };
}

// src/server/clss/ClssModuleDetails.ts
function emptyModuleDetails() {
  return {
    points: [],
    presentCount: null,
    notProgrammedAddresses: [],
    unavailableAddresses: [],
    modules: [],
    identifiedCount: null,
    summaryBefore: null,
    summaryAfter: null,
    reconciliation: "unknown",
    lastSuccessAt: null,
    stale: true,
    lastError: null
  };
}
function moduleDetailArrays(value) {
  if (!value) return [];
  const fields = value.split(",");
  if (fields.some((field) => !/^[1-8]$/.test(field)) || new Set(fields).size !== fields.length) {
    throw new Error("PRIZM_CLSS_MODULE_DETAILS_ARRAYS must be unique array numbers 1\u20138");
  }
  return fields.map(Number);
}
function normalizeModuleScan(scan, previous = emptyModuleDetails()) {
  if (scan.error || !scan.words || scan.words.length !== 159 || scan.words.some((word) => !Number.isInteger(word) || word < 0 || word > 65535)) {
    return { ...previous, stale: true, lastError: scan.error ?? "Incomplete module-status scan" };
  }
  const points = [];
  const notProgrammedAddresses = [], unavailableAddresses = [];
  scan.words.forEach((word, index) => {
    if (word === 255) {
      notProgrammedAddresses.push(`L1M${index + 1}`);
      return;
    }
    if (word === 65535) {
      unavailableAddresses.push(`L1M${index + 1}`);
      return;
    }
    const enabled = !!(word & 1024), disabled = !!(word & 512);
    const active = !!(word & 2048);
    points.push({
      address: `L1M${index + 1}`,
      loop: 1,
      module: index + 1,
      trouble: !!(word & 8192),
      inactive: !!(word & 4096),
      statusWord: word,
      drawingReference: drawingReferenceForModule(index + 1),
      enableState: enabled && disabled ? "conflicting" : enabled ? "enabled" : disabled ? "disabled" : "unknown",
      nonFireAcknowledged: !!(word & 32768),
      prealarm: !!(word & 16384),
      activeEventCode: active ? word & 255 : null,
      activeEvent: active ? (word & 255) === 16 ? "Fire alarm" : `Active event 0x${(word & 255).toString(16).padStart(2, "0").toUpperCase()}` : "No active event reported"
    });
  });
  const modules = points.filter((point) => point.trouble);
  const valid = (value) => value !== null && Number.isInteger(value) && value >= 0 && value <= 300;
  const reconciliation = !valid(scan.summaryBefore) || !valid(scan.summaryAfter) ? "unknown" : unavailableAddresses.length === 0 && scan.summaryBefore === scan.summaryAfter && scan.summaryAfter === modules.length ? "matched" : "mismatch";
  return {
    points,
    presentCount: points.length,
    notProgrammedAddresses,
    unavailableAddresses,
    modules,
    identifiedCount: modules.length,
    summaryBefore: scan.summaryBefore,
    summaryAfter: scan.summaryAfter,
    reconciliation,
    lastSuccessAt: new Date(scan.observedAt).toISOString(),
    stale: false,
    lastError: reconciliation === "matched" ? null : "Module list does not reconcile with the before/after summary counts; readings may have changed or coverage may differ"
  };
}

// src/server/clss/ClssModbusReader.ts
var import_node_net = __toESM(require("node:net"), 1);
var import_node_crypto = require("node:crypto");
var BLOCKS = Object.freeze({ status: [2e4, 1], nac1: [6e3, 1], loop1: [14100, 7], troubles: [59999, 1], modules1: [300, 100], modules2: [400, 59], detectors1: [0, 100], detectors2: [100, 100], detectors3: [200, 100], allModules2: [400, 100], modules3: [500, 100], typesD1: [0, 100], typesD2: [100, 100], typesD3: [200, 100], typesM1: [300, 100], typesM2: [400, 100], typesM3: [500, 100] });
function conditionReadRequest(block, unitId, transactionId) {
  if (!Object.hasOwn(BLOCKS, block)) throw new Error("Unsupported CLSS read block");
  const [address, quantity] = BLOCKS[block];
  if (!Number.isInteger(unitId) || unitId < 1 || unitId > 240) throw new Error("Invalid CLSS Unit ID");
  const frame = Buffer.alloc(12);
  frame.writeUInt16BE(transactionId, 0);
  frame.writeUInt16BE(0, 2);
  frame.writeUInt16BE(6, 4);
  frame[6] = unitId;
  frame[7] = block.startsWith("types") ? 4 : 3;
  frame.writeUInt16BE(address, 8);
  frame.writeUInt16BE(quantity, 10);
  return frame;
}
var exceptions = {
  1: "Illegal function",
  2: "Illegal register address",
  3: "Illegal data value",
  10: "Unit ID not configured for monitoring",
  11: "Panel offline or panel/network communication failed"
};
var ClssModbusException = class extends Error {
  constructor(code, nonstandardLength = false) {
    super(`CLSS Modbus exception ${code}: ${exceptions[code] ?? "Unknown exception"}${nonstandardLength ? " (nonstandard exception length)" : ""}`);
    this.code = code;
    this.nonstandardLength = nonstandardLength;
  }
};
function decodeConditionRead(frame, transactionId, unitId, block) {
  if (!Object.hasOwn(BLOCKS, block)) throw new Error("Unsupported CLSS read block");
  const quantity = BLOCKS[block][1], fc = block.startsWith("types") ? 4 : 3;
  if (frame.length < 7) return null;
  if (frame.readUInt16BE(0) !== transactionId || frame.readUInt16BE(2) !== 0 || frame[6] !== unitId) {
    throw new Error("Mismatched CLSS Modbus response");
  }
  const length = frame.readUInt16BE(4);
  if (length < 2 || length > 254) throw new Error("Invalid CLSS Modbus response length");
  if (frame.length < 6 + length) return null;
  if (frame[7] === (fc | 128)) {
    if (length === 2 && frame.length === 8) return null;
    if (![2, 3].includes(length) || frame.length !== 9) throw new Error("Malformed CLSS exception response length");
    throw new ClssModbusException(frame[8], length === 2);
  }
  if (length !== 3 + quantity * 2 || frame.length !== 9 + quantity * 2 || frame[7] !== fc || frame[8] !== quantity * 2) {
    throw new Error("Invalid CLSS panel-status response");
  }
  return Array.from({ length: quantity }, (_, index) => frame.readUInt16BE(9 + index * 2));
}
var ClssReadSession = class {
  constructor(target) {
    this.target = target;
    this.socket = new import_node_net.default.Socket();
    this.connected = false;
    this.terminal = null;
    this.pending = null;
    this.socket.on("error", (error) => this.fail(error));
    this.socket.on("close", () => this.fail(new Error("CLSS session closed")));
    this.socket.on("data", (chunk) => {
      const p = this.pending;
      if (!p) {
        this.fail(new Error("Unsolicited CLSS response"));
        return;
      }
      try {
        p.data = Buffer.concat([p.data, chunk]);
        if (p.data.length > 260) throw Error("Oversized CLSS response");
        const values = decodeConditionRead(p.data, p.transactionId, this.target.unitId, p.block);
        if (values !== null) p.finish(null, values);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        p.finish(error);
        if (!(error instanceof ClssModbusException)) this.fail(error);
      }
    });
  }
  fail(error) {
    this.terminal = error;
    this.pending?.finish(error);
    this.socket.destroy();
  }
  close() {
    this.socket.destroy();
  }
  read(block, timeoutMs) {
    if (this.terminal) return Promise.reject(this.terminal);
    if (this.pending) return Promise.reject(new Error("Overlapping CLSS read prohibited"));
    const id = (0, import_node_crypto.randomInt)(65536), request = conditionReadRequest(block, this.target.unitId, id);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error("CLSS read timed out")), timeoutMs);
      this.pending = { transactionId: id, block, data: Buffer.alloc(0), finish: (error, values) => {
        clearTimeout(timer);
        this.pending = null;
        error ? reject(error) : resolve(values);
      } };
      if (!this.connected) {
        this.connected = true;
        this.socket.connect(this.target.port, this.target.host, () => this.socket.write(request));
      } else this.socket.write(request);
    });
  }
};
function readBlock(target, block, timeoutMs = 5e3, session) {
  if (session) return session.read(block, timeoutMs);
  if (target.unitId === null) return Promise.reject(new Error("Panel Unit ID has not been discovered"));
  const transactionId = (0, import_node_crypto.randomInt)(65536);
  const unitId = target.unitId;
  const request = conditionReadRequest(block, unitId, transactionId);
  return new Promise((resolve, reject) => {
    const socket = new import_node_net.default.Socket();
    let chunks = Buffer.alloc(0);
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    const deadline = setTimeout(() => finish(new Error("CLSS read timed out")), timeoutMs);
    socket.on("error", (error) => finish(error));
    socket.on("close", () => {
      if (!settled) finish(new Error("CLSS connection closed before complete response"));
    });
    socket.on("data", (chunk) => {
      try {
        chunks = Buffer.concat([chunks, chunk]);
        if (chunks.length > 260) throw new Error("Oversized CLSS response");
        const value = decodeConditionRead(chunks, transactionId, unitId, block);
        if (value !== null) finish(null, value);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.connect(target.port, target.host, () => socket.write(request));
  });
}
async function readClssPanelStatus(target, timeoutMs = 5e3) {
  return (await readBlock(target, "status", timeoutMs))[0];
}
async function readClssPanelReading(target, timeoutMs = 5e3, includeModuleDetails = false, includeDeviceDetails = false, includeNac1 = false) {
  const session = includeDeviceDetails ? new ClssReadSession(target) : void 0;
  try {
    const panelStatusWord = (await readBlock(target, "status", timeoutMs, session))[0];
    const statusReadAt = Date.now();
    if (panelStatusWord === 65535) throw new Error("Unavailable CLSS panel-status word");
    const read = async (block) => {
      try {
        return { values: await readBlock(target, block, timeoutMs, session), error: null };
      } catch (cause) {
        return { values: null, error: cause instanceof Error ? cause.message : String(cause) };
      }
    };
    const loop1 = await read("loop1");
    const loop1ReadAt = Date.now();
    const troubles = await read("troubles");
    const troublesReadAt = Date.now();
    let moduleScan;
    if (includeModuleDetails && !includeDeviceDetails) {
      const summaryBefore = loop1.values?.[6] ?? null;
      moduleScan = { words: null, summaryBefore, summaryAfter: null, observedAt: Date.now(), error: null };
      try {
        if (summaryBefore === null || summaryBefore > 300) throw new Error("Module trouble summary unavailable");
        const words = [];
        for (const block of ["modules1", "modules2"]) {
          words.push(...await readBlock(target, block, Math.min(timeoutMs, 2e3)));
        }
        const after = await readBlock(target, "loop1", Math.min(timeoutMs, 2e3));
        moduleScan = { words, summaryBefore, summaryAfter: after[6], observedAt: Date.now(), error: null };
      } catch (cause) {
        moduleScan.error = cause instanceof Error ? cause.message : String(cause);
      }
    }
    const deviceScan = includeDeviceDetails ? await readDeviceScan(target, loop1.values, timeoutMs, session) : void 0;
    let nac1;
    if (includeNac1) {
      try {
        const values = await readBlock(target, "nac1", Math.min(timeoutMs, 1500), session);
        nac1 = { values, observedAt: Date.now(), error: null };
      } catch (error) {
        nac1 = { values: null, observedAt: Date.now(), error: error instanceof Error ? error.message : String(error) };
      }
    }
    return { panelStatusWord, statusReadAt, loop1, loop1ReadAt, troubles, troublesReadAt, moduleScan, deviceScan, nac1 };
  } finally {
    session?.close();
  }
}
var typeCache = /* @__PURE__ */ new Map();
async function readDeviceScan(target, before, timeoutMs, session) {
  const key = `${target.host}:${target.port}/${target.unitId}`;
  let types = typeCache.get(key);
  if (!types) {
    types = { words: Array(600).fill(null), at: Array(600).fill(null), next: 0, error: null };
    typeCache.set(key, types);
  }
  const end = Date.now() + 15e3;
  const bounded = async (block) => {
    if (Date.now() + 250 >= end) throw Error("Device scan budget exceeded; retained readings are historical");
    await new Promise((resolve) => setTimeout(resolve, 150));
    return readBlock(target, block, Math.min(timeoutMs, 5e3, end - Date.now()), session);
  };
  const group = async (blocks2) => {
    const words = [], partialWords = Array(300).fill(null), pointObservedAt = Array(300).fill(null);
    try {
      for (const b of blocks2) {
        const values = await bounded(b), at2 = Date.now(), offset = words.length;
        words.push(...values);
        values.forEach((v, i) => {
          partialWords[offset + i] = v;
          pointObservedAt[offset + i] = at2;
        });
      }
      return { words, pointObservedAt, at: Date.now(), error: null };
    } catch (e) {
      return { words: null, partialWords, pointObservedAt, at: Date.now(), error: e instanceof Error ? e.message : String(e) };
    }
  };
  const detectors = await group(["detectors1", "detectors2", "detectors3"]);
  const modules = await group(["modules1", "allModules2", "modules3"]);
  let after = null;
  try {
    after = await bounded("loop1");
  } catch {
  }
  const blocks = ["typesD1", "typesD2", "typesD3", "typesM1", "typesM2", "typesM3"];
  const index = types.next, at = types.at[index * 100];
  if (at === null || Date.now() - at > 15 * 60 * 1e3) {
    try {
      const words = await bounded(blocks[index]), now = Date.now();
      for (let n = 0; n < 100; n++) {
        types.words[index * 100 + n] = words[n];
        types.at[index * 100 + n] = now;
      }
      types.error = null;
    } catch (e) {
      types.error = e instanceof Error ? e.message : String(e);
    }
  }
  types.next = (index + 1) % blocks.length;
  return { detectors, modules, before, after, types: { words: [...types.words], at: [...types.at], error: types.error } };
}

// src/server/clss/ClssMonitor.ts
var CLSS_TARGETS = Object.freeze([
  { array: 1, host: "10.0.1.115", port: 502, unitId: 10 },
  { array: 2, host: "10.0.2.115", port: 502, unitId: 11 },
  { array: 3, host: "10.0.3.115", port: 502, unitId: 12 },
  { array: 4, host: "10.0.4.115", port: 502, unitId: 14 },
  { array: 5, host: "10.0.5.115", port: 502, unitId: null },
  { array: 6, host: "10.0.6.115", port: 502, unitId: 15 },
  { array: 7, host: "10.0.7.115", port: 502, unitId: 16 },
  { array: 8, host: "10.0.8.115", port: 502, unitId: null }
].map((target) => Object.freeze(target)));
var CLSS_POLL_MS = 15e3;
var CLSS_FRESH_MS = 45e3;
function clssTargetsForSite(unitIds) {
  if (unitIds === void 0) return CLSS_TARGETS;
  const values = unitIds.split(",");
  if (values.length !== CLSS_TARGETS.length || values.some((value) => value !== "-" && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 240))) {
    throw new Error("PRIZM_CLSS_UNIT_IDS must contain eight entries ordered by arrays 1\u20138: Unit ID 1\u2013240, or - when undiscovered");
  }
  return CLSS_TARGETS.map((target, index) => ({ ...target, unitId: values[index] === "-" ? null : Number(values[index]) }));
}
var copyPoint = (point) => ({ ...point, drawingReference: point.drawingReference ? { ...point.drawingReference } : null });
var emptyCondition = () => ({
  state: "unknown",
  count: null,
  detectorCount: null,
  moduleCount: null,
  lastSuccessAt: null,
  stale: true,
  lastError: null
});
function updateCondition(previous, values, error, now, loop = false) {
  if (!values || values.length !== (loop ? 2 : 1) || values.some((value) => !Number.isInteger(value) || value < 0 || value > (loop ? 300 : 1600))) {
    return { ...previous, stale: true, lastError: error ?? "Invalid or unavailable condition counter" };
  }
  const count = values.reduce((sum, value) => sum + value, 0);
  return {
    state: count > 0 ? "active" : "none-reported",
    count,
    detectorCount: loop ? values[0] : null,
    moduleCount: loop ? values[1] : null,
    lastSuccessAt: new Date(now).toISOString(),
    stale: false,
    lastError: null
  };
}
function updateNac1(previous, read) {
  const word = read.values?.[0];
  if (read.values?.length !== 1 || word === void 0 || !Number.isInteger(word) || word < 0 || word >= 65535 || word === 255) {
    const notProgrammed = word === 255;
    return {
      state: notProgrammed ? "not-programmed" : "unavailable",
      point: previous?.point ?? null,
      lastSuccessAt: previous?.lastSuccessAt ?? null,
      stale: true,
      lastError: read.error ?? (notProgrammed ? "Gateway reports no programmed bell circuit 1" : "Bell circuit status unavailable")
    };
  }
  return {
    state: "reported",
    point: { address: "NAC1", ...decodeClssPointFlags(word) },
    lastSuccessAt: new Date(read.observedAt).toISOString(),
    stale: false,
    lastError: null
  };
}
var ClssMonitor = class {
  constructor(enabled, reader = readClssPanelReading, now = Date.now, targets = CLSS_TARGETS, detailArrays2 = [], deviceArrays2 = []) {
    this.enabled = enabled;
    this.reader = reader;
    this.now = now;
    this.inFlight = null;
    this.timer = null;
    this.running = false;
    this.generation = 0;
    this.rows = targets.map((target) => ({
      ...target,
      source: "clss-modbus",
      status: enabled ? "pending" : "disabled",
      stale: true,
      lastAttemptAt: null,
      lastSuccessAt: null,
      latencyMs: null,
      consecutiveFailures: 0,
      lastError: null,
      panelSilenced: null,
      panelStatusWord: null,
      loop1Alarms: emptyCondition(),
      loop1Troubles: emptyCondition(),
      panelTroubles: emptyCondition(),
      moduleTroubleDetails: !deviceArrays2.includes(target.array) && detailArrays2.includes(target.array) ? emptyModuleDetails() : null,
      deviceDetails: deviceArrays2.includes(target.array) ? emptyDeviceDetails() : null,
      identityVerified: false
    }));
  }
  getSnapshot() {
    const now = this.now();
    return {
      enabled: this.enabled,
      readOnly: true,
      scope: "panel-conditions",
      pollIntervalMs: CLSS_POLL_MS,
      freshnessTargetMs: CLSS_FRESH_MS,
      capturedAt: new Date(now).toISOString(),
      panels: this.rows.map((row) => {
        const stale = row.stale || !row.lastSuccessAt || now - Date.parse(row.lastSuccessAt) > CLSS_FRESH_MS;
        const condition = (value) => ({ ...value, stale: value.stale || stale || !value.lastSuccessAt || now - Date.parse(value.lastSuccessAt) > CLSS_FRESH_MS });
        const devices = row.deviceDetails ? structuredClone(row.deviceDetails) : null;
        if (devices) for (const group of [devices.detectors, devices.modules]) {
          group.stale = group.stale || stale || !group.lastSuccessAt || now - Date.parse(group.lastSuccessAt) > CLSS_FRESH_MS;
          for (const point of group.points) point.statusStale = point.statusStale || !point.observedAt || now - Date.parse(point.observedAt) > CLSS_FRESH_MS || Date.parse(point.observedAt) > now + 5e3;
        }
        const nac1 = row.nac1 ? {
          ...row.nac1,
          point: row.nac1.point ? { ...row.nac1.point } : null,
          stale: row.nac1.stale || stale || !row.nac1.lastSuccessAt || now - Date.parse(row.nac1.lastSuccessAt) > CLSS_FRESH_MS
        } : null;
        return {
          ...row,
          nac1,
          deviceDetails: devices,
          loop1Alarms: condition(row.loop1Alarms),
          loop1Troubles: condition(row.loop1Troubles),
          panelTroubles: condition(row.panelTroubles),
          moduleTroubleDetails: row.moduleTroubleDetails ? {
            ...row.moduleTroubleDetails,
            modules: row.moduleTroubleDetails.modules.map(copyPoint),
            points: row.moduleTroubleDetails.points.map(copyPoint),
            notProgrammedAddresses: [...row.moduleTroubleDetails.notProgrammedAddresses],
            unavailableAddresses: [...row.moduleTroubleDetails.unavailableAddresses],
            stale: row.moduleTroubleDetails.stale || stale || !row.moduleTroubleDetails.lastSuccessAt || now - Date.parse(row.moduleTroubleDetails.lastSuccessAt) > CLSS_FRESH_MS
          } : null,
          stale,
          status: row.status === "connected" && stale ? "stale" : row.status
        };
      })
    };
  }
  poll() {
    if (!this.enabled) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    this.inFlight = Promise.all(this.rows.map(async (row) => {
      const started = this.now();
      row.lastAttemptAt = new Date(started).toISOString();
      try {
        if (row.unitId === null) throw new Error("Panel Unit ID has not been discovered; no register data available");
        const reading = await this.reader({ array: row.array, host: row.host, port: row.port, unitId: row.unitId });
        const word = typeof reading === "number" ? reading : reading.panelStatusWord;
        if (!Number.isInteger(word) || word < 0 || word > 65535 || word === 65535) {
          throw new Error("Invalid or unavailable CLSS panel-status word");
        }
        const loop = typeof reading === "number" ? null : reading.loop1.values;
        const loopError = typeof reading === "number" ? "Condition counters not read" : reading.loop1.error;
        const trouble = typeof reading === "number" ? null : reading.troubles.values;
        const troubleError = typeof reading === "number" ? "Condition counters not read" : reading.troubles.error;
        const loopReadAt = typeof reading === "number" ? this.now() : reading.loop1ReadAt ?? this.now();
        const troubleReadAt = typeof reading === "number" ? this.now() : reading.troublesReadAt ?? this.now();
        if (typeof reading !== "number" && reading.moduleScan && row.moduleTroubleDetails) row.moduleTroubleDetails = normalizeModuleScan(reading.moduleScan, row.moduleTroubleDetails ?? void 0);
        row.loop1Alarms = updateCondition(row.loop1Alarms, loop?.length === 7 ? [loop[0], loop[5]] : null, loopError, loopReadAt, true);
        row.loop1Troubles = updateCondition(row.loop1Troubles, loop?.length === 7 ? [loop[1], loop[6]] : null, loopError, loopReadAt, true);
        if (row.moduleTroubleDetails) {
          const detail = row.moduleTroubleDetails;
          row.loop1Troubles.verification = detail.stale ? "scan-unavailable" : detail.reconciliation === "matched" ? "matched" : "mismatch";
          row.loop1Troubles.verificationMessage = detail.stale ? "Module scan unavailable; counter readings are not verified against module flags." : detail.reconciliation === "matched" ? null : `Counter reports ${detail.summaryBefore ?? "unknown"} before and ${detail.summaryAfter ?? "unknown"} after; module scan has ${detail.identifiedCount ?? "unknown"} trouble flags. Discrepancy unresolved.`;
        }
        if (typeof reading !== "number" && reading.deviceScan && row.deviceDetails) row.deviceDetails = normalizeDeviceScan(reading.deviceScan, row.deviceDetails);
        if (row.deviceDetails) {
          for (const [condition, checks] of [[row.loop1Alarms, [row.deviceDetails.checks.detectorAlarms, row.deviceDetails.checks.moduleAlarms]], [row.loop1Troubles, [row.deviceDetails.checks.detectorTroubles, row.deviceDetails.checks.moduleTroubles]]]) {
            condition.verification = checks.some((c) => c.verification === "scan-unavailable") ? "scan-unavailable" : checks.some((c) => c.verification === "mismatch") ? "mismatch" : "matched";
            condition.verificationMessage = checks.map((c) => c.message).filter(Boolean).join(" ") || null;
          }
        }
        if (typeof reading !== "number" && reading.nac1) row.nac1 = updateNac1(row.nac1, reading.nac1);
        row.panelTroubles = updateCondition(row.panelTroubles, trouble, troubleError, troubleReadAt);
        row.panelStatusWord = word;
        row.panelSilenced = !!(word & 2);
        row.lastSuccessAt = new Date(typeof reading === "number" ? this.now() : reading.statusReadAt ?? this.now()).toISOString();
        row.consecutiveFailures = 0;
        row.lastError = null;
        row.stale = false;
        row.status = "connected";
      } catch (error) {
        row.consecutiveFailures += 1;
        row.lastError = error instanceof Error ? error.message : String(error);
        row.stale = true;
        row.status = row.lastSuccessAt ? "stale" : "unavailable";
      } finally {
        row.latencyMs = Math.max(0, this.now() - started);
      }
    })).then(() => void 0).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
  start() {
    if (!this.enabled || this.running) return;
    this.running = true;
    const generation = ++this.generation;
    const cycle = async () => {
      await this.poll();
      if (this.running && generation === this.generation) {
        this.timer = setTimeout(cycle, CLSS_POLL_MS);
        this.timer.unref?.();
      }
    };
    void cycle();
  }
  stop() {
    this.running = false;
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
};
var deviceArrays = moduleDetailArrays(process.env.PRIZM_CLSS_DEVICE_DETAILS_ARRAYS);
var detailArrays = moduleDetailArrays(process.env.PRIZM_CLSS_MODULE_DETAILS_ARRAYS);
var clssMonitor = new ClssMonitor(
  process.env.PRIZM_CLSS_ENABLED === "true",
  (target) => readClssPanelReading(target, 5e3, detailArrays.includes(target.array), deviceArrays.includes(target.array), true),
  Date.now,
  clssTargetsForSite(process.env.PRIZM_CLSS_UNIT_IDS),
  detailArrays,
  deviceArrays
);

// src/server/clss/clssRoutes.ts
var import_express = require("express");
var router = (0, import_express.Router)();
router.get("/status", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(clssMonitor.getSnapshot());
});
var clssRoutes_default = router;

// src/server/clss/ClssDiscovery.ts
async function discoverClssPanel(target, options = {}) {
  const read = options.read ?? ((candidate) => readClssPanelStatus(candidate, 2500));
  const pause = options.pause ?? (() => new Promise((resolve) => setTimeout(resolve, 500)));
  let transportFailures = 0;
  const retryIds = /* @__PURE__ */ new Set();
  const probe = async (unitId) => {
    const candidate = { ...target, unitId };
    let confirmations = 0;
    let word = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        word = await read(candidate);
        transportFailures = 0;
        if (!Number.isInteger(word) || word < 0 || word >= 65535) return null;
        confirmations++;
        if (confirmations === 2) return { ...candidate, panelStatusWord: word, confirmations: 2 };
      } catch (error) {
        if (error instanceof ClssModbusException) {
          transportFailures = 0;
          if (error.code === 11) throw new Error(`Array ${target.array}, Unit ${unitId}: panel offline or network communication failed`);
          return null;
        }
        transportFailures++;
        retryIds.add(unitId);
        if (transportFailures >= 3) throw new Error(`Array ${target.array} at ${target.host}: three consecutive connection/protocol failures; discovery stopped`);
        if (confirmations === 0) return null;
      }
      await pause();
    }
    return null;
  };
  if (target.unitId !== null) {
    options.progress?.(`Array ${target.array}: checking preferred Unit ID ${target.unitId}`);
    const preferred = await probe(target.unitId);
    if (preferred) return preferred;
  } else options.progress?.(`Array ${target.array}: discovering Unit ID`);
  for (let unit = 1; unit <= 240; unit++) {
    if (unit === target.unitId) continue;
    await pause();
    const found = await probe(unit);
    if (found) return found;
    if (unit % 40 === 0) options.progress?.(`Array ${target.array}: checked through Unit ID ${unit}`);
  }
  for (const unit of retryIds) {
    await pause();
    const found = await probe(unit);
    if (found) return found;
  }
  throw new Error(`Array ${target.array} at ${target.host}: no Unit ID confirmed by two successful status reads`);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CLSS_TARGETS,
  clssMonitor,
  clssRouter,
  discoverClssPanel,
  readClssPanelReading,
  readClssPanelStatus
});
