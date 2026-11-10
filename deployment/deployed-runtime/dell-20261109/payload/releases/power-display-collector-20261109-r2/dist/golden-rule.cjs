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

// src/server/iologik/goldenRuleEditor.ts
var goldenRuleEditor_exports = {};
__export(goldenRuleEditor_exports, {
  GoldenRuleStore: () => GoldenRuleStore,
  applyGoldenPolicy: () => applyGoldenPolicy,
  editGoldenPolicy: () => editGoldenPolicy,
  normalizeEditorTemplate: () => normalizeEditorTemplate,
  parseGoldenFields: () => parseGoldenFields,
  policyFromTemplate: () => policyFromTemplate,
  policyReadback: () => policyReadback,
  presentPolicy: () => presentPolicy,
  ruleHash: () => ruleHash,
  validatePolicy: () => validatePolicy
});
module.exports = __toCommonJS(goldenRuleEditor_exports);
var import_node_crypto = require("node:crypto");
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var safe = /^(?:DO0[012]_SAFE|Peer_DO_SM_STATUS0[012])$/;
var identity = /^(?:Firmware|FW_Ver|eCOS|MOD_TYPE|NET_MAC)$/i;
var protectedKey = /^(?:NET_|IP_FILTER$|IP_EN\d|IP_ADD\d|IP_MSK\d|COMMUNITY_|TRAP_CMUTY$|MIN_PWD|PWD_|DIGIT_|MIXED_CASE_|SPECIAL_CHAR_|LOCKOUT_|MAX_RETRY|LOGIN_MSG$|FAIL_MSG$|.*PASSWORD|.*TOKEN|.*SECRET)/i;
var networkAddressKey = /(?:IP|PORT)\d*$|(?:^|_)(?:DNS|GATEWAY|NETMASK|SUBNET|HOSTNAME)(?:_|\d|$)/i;
var sensitiveKey = /COMMUNITY|CMUTY|PASSWORD|TOKEN|SECRET/i;
var labels = { CONNECTION_WATCHDOG: "Communication watchdog (seconds)", SNMP_ENABLE: "SNMP agent", REST_ENABLE: "REST service", EIP_ENABLE: "EtherNet/IP service", MOD_NAME: "Device name", MOD_LOC: "Device location", AUTOCLEAR_SAFEMODE: "Automatically clear safe mode", WD_SOURCE: "Watchdog source" };
var choices = [{ value: "0,(Off)", label: "Off" }, { value: "1,(On)", label: "On" }, { value: "2,(Hold Last)", label: "Hold last" }];
var ioSafe = /^(?:DO\d{2}_SAFE|Peer_DO_SM_STATUS\d{2})$/;
var enabledChoices = [{ value: "0", label: "Disabled" }, { value: "1", label: "Enabled" }];
var canonical = (v) => v.trim().replace(/\s*,\s*/g, ",");
var ruleHash = (value) => (0, import_node_crypto.createHash)("sha256").update(JSON.stringify(value)).digest("hex");
function parseGoldenFields(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > 1024 * 1024 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw Error("Invalid or oversized configuration.");
  const fields = [];
  const occurrences = /* @__PURE__ */ new Map();
  let section = "System information", offset = 0;
  for (const line of text.split(/(?<=\n)/)) {
    const heading = line.trim().match(/^\[(.+)\]$/);
    if (heading) section = heading[1].replace(/^\d+\.\s*/, "");
    const matches = [...line.matchAll(/(?:^|[\t ,]+)([A-Za-z][A-Za-z0-9_]*)[ \t]*=[ \t]*/g)];
    matches.forEach((m, index) => {
      const key = m[1], start = offset + m.index + m[0].length;
      let end = index + 1 < matches.length ? offset + matches[index + 1].index : offset + line.replace(/[\r\n]+$/, "").length;
      while (end > start && /[\t ,]/.test(text[end - 1])) end--;
      const value = canonical(text.slice(start, end));
      const stem = `${section}/${key}`, occurrence = occurrences.get(stem) || 0;
      occurrences.set(stem, occurrence + 1);
      const id = `${stem}/${occurrence}`;
      const required = safe.test(key) || key === "CONNECTION_WATCHDOG";
      const editable = !identity.test(key), deployable = editable && !protectedKey.test(key) && !networkAddressKey.test(key) && !/^Security Settings$/i.test(section);
      const io = section === "I/O Configurations";
      const options = ioSafe.test(key) ? choices : io && /^DO\d{2}_PWN$/.test(key) && /^[01],\((?:Off|On)\)$/.test(value) ? choices.slice(0, 2) : io && /^AI\d{2}$/.test(key) && /^(?:0,\(0-10V\)|1,\(4-20mA\))$/.test(value) ? [{ value: "0,(0-10V)", label: "0\u201310 V" }, { value: "1,(4-20mA)", label: "4\u201320 mA" }] : /^(SNMP_ENABLE|REST_ENABLE|EIP_ENABLE)$/.test(key) || io && /^AI\d{2}_EN$/.test(key) ? enabledChoices : void 0;
      const numeric = key === "CONNECTION_WATCHDOG" ? { min: 30, max: 3600, step: 1, unit: "seconds", format: "seconds" } : io && /^DI\d{2}_FILTER$/.test(key) && /^\d+,\(\d+ms\)$/.test(value) ? { min: 1, max: 65535, step: 1, unit: "milliseconds", format: "milliseconds" } : void 0;
      const channel = key.match(/^(AI|DI|DO|DIO)(\d{2})(.*)$/);
      const channelLabel = io && channel ? `${channel[1]}-${channel[2]} ${channel[3] === "_SAFE" ? "safe state" : channel[3] === "_PWN" ? "power-on state" : channel[3] === "_FILTER" ? "input filter" : channel[3] === "_EN" ? "enabled" : channel[3] === "" ? channel[1] === "AI" ? "input range" : "mode" : channel[3].slice(1).replace(/_/g, " ")}` : void 0;
      fields.push({
        id,
        section,
        key,
        start,
        end,
        value,
        editable,
        deployable,
        required,
        sensitive: sensitiveKey.test(key),
        options,
        numeric,
        label: labels[key] || channelLabel || (ioSafe.test(key) ? `${key.includes("Peer_") ? "Companion " : ""}DO-${key.match(/\d{2}/)?.[0]} safe state` : key.replace(/_/g, " ")),
        hint: !editable ? "Device identity \u2014 retained from the original export." : !deployable ? "Save/export only. Fleet deployment preserves each device\u2019s network and access settings." : numeric ? `Enter ${numeric.min}\u2013${numeric.max} ${numeric.unit}.` : options ? "" : "Native configuration value. Preserve units and format shown in the imported export."
      });
    });
    offset += line.length;
  }
  if (!fields.some((f) => f.key === "MOD_TYPE" && /\bE1242\b/.test(f.value)) || !/<END>[\r\n]*$/.test(text)) throw Error("Import a complete E1242 export ending in <END>.");
  return fields;
}
var defaultField = (f) => f.required;
function normalizeEditorTemplate(text) {
  const fields = parseGoldenFields(text);
  return replaceValues(text, fields.filter((f) => safe.test(f.key)).map((f) => ({ ...f, value: "0,(Off)" })));
}
function replaceValues(text, fields) {
  for (const f of [...fields].sort((a, b) => b.start - a.start)) text = text.slice(0, f.start) + f.value + text.slice(f.end);
  return text;
}
function validateValue(f, value) {
  if (typeof value !== "string" || value.length > 4096 || /[\r\n\x00-\x1f=<>]/.test(value)) throw Error(`Invalid value for ${f.label}.`);
  const normalized = canonical(value);
  if (f.numeric) {
    const number = Number(normalized.split(",")[0]);
    const expected = f.numeric.format === "seconds" ? `${number},(sec)` : `${number},(${number}ms)`;
    if (!Number.isInteger(number) || number < f.numeric.min || number > f.numeric.max || normalized !== expected) throw Error(`${f.label} must be ${f.numeric.min}\u2013${f.numeric.max} ${f.numeric.unit}.`);
  }
  if (f.options && !f.options.some((o) => o.value === normalized)) throw Error(`Choose a valid option for ${f.label}.`);
  if (f.key === "CONNECTION_WATCHDOG" && !/^(?:[3-9]\d|[1-9]\d{2}|[12]\d{3}|3[0-5]\d{2}|3600),\(sec\)$/.test(normalized)) throw Error("Watchdog must be 30\u20133600 seconds, followed by ,(sec).");
  if (!f.options && /^[-+]?\d+(?:\.\d+)?(?:,|$)/.test(f.value) && !/^[-+]?\d+(?:\.\d+)?(?:,\([^\r\n]*\))?$/.test(normalized)) throw Error(`Preserve the numeric value and units for ${f.label}.`);
  return normalized;
}
function validatePolicy(policy) {
  const fields = parseGoldenFields(policy.text), ids = new Set(policy.managedIds);
  if (!Array.isArray(policy.managedIds) || ids.size !== policy.managedIds.length) throw Error("Invalid deployment settings.");
  if (policy.managedIds.some((id) => !fields.some((f) => f.id === id && f.deployable))) throw Error("Network, access and identity settings cannot be deployed to a fleet.");
  for (const f of fields) {
    if (f.required && !ids.has(f.id)) throw Error("Safe states and watchdog must remain in the deployment policy.");
    if (ids.has(f.id)) validateValue(f, f.value);
  }
  for (const channel of ["00", "01", "02"]) {
    const a = fields.filter((f) => f.key === `DO${channel}_SAFE`), b = fields.filter((f) => f.key === `Peer_DO_SM_STATUS${channel}`);
    if (a.length !== 1 || b.length !== 1 || a[0].value !== b[0].value) throw Error(`DO-${channel} and its companion safe state must agree.`);
  }
  for (const f of fields.filter((f2) => /^DO\d{2}_SAFE$/.test(f2.key) && !safe.test(f2.key))) {
    const companion = fields.find((peer) => peer.key === `Peer_DO_SM_STATUS${f.key.slice(2, 4)}`);
    if (companion && (ids.has(f.id) || ids.has(companion.id)) && (!ids.has(f.id) || !ids.has(companion.id) || f.value !== companion.value)) throw Error(`${f.label} and its companion safe state must agree and be selected together.`);
  }
  if (fields.filter((f) => f.key === "CONNECTION_WATCHDOG").length !== 1) throw Error("Exactly one watchdog setting is required.");
}
function policyFromTemplate(text) {
  text = normalizeEditorTemplate(text);
  const policy = { text, managedIds: parseGoldenFields(text).filter(defaultField).map((f) => f.id) };
  validatePolicy(policy);
  return policy;
}
function editGoldenPolicy(policy, edit) {
  if (edit.revision !== ruleHash(policy)) throw Error("Golden Rule changed. Reload the editor before saving.");
  if (!Array.isArray(edit.changes) || edit.changes.length > 4096 || !Array.isArray(edit.managedIds)) throw Error("Invalid editor changes.");
  const fields = parseGoldenFields(policy.text), seen = /* @__PURE__ */ new Set();
  const changes = edit.changes.map((change) => {
    const f = fields.find((f2) => f2.id === change.id);
    if (!f || !f.editable || seen.has(change.id)) throw Error("Unknown, duplicate or read-only setting.");
    seen.add(change.id);
    return { ...f, value: validateValue(f, change.value) };
  });
  const next = { text: replaceValues(policy.text, changes), managedIds: [...edit.managedIds].sort() };
  validatePolicy(next);
  return next;
}
function presentPolicy(policy, hasPrevious = false) {
  validatePolicy(policy);
  return {
    revision: ruleHash(policy),
    managedIds: policy.managedIds,
    hasPrevious,
    fields: parseGoldenFields(policy.text).map(({ start: _s, end: _e, ...field }) => field)
  };
}
function applyGoldenPolicy(policy, current) {
  validatePolicy(policy);
  const target = parseGoldenFields(current), source = parseGoldenFields(policy.text);
  const changes = source.filter((f) => policy.managedIds.includes(f.id)).map((f) => {
    const other = target.find((t) => t.id === f.id);
    if (!other || !other.deployable) throw Error(`Unsupported device field: ${f.label}. No configuration sent.`);
    if (target.filter((t) => t.section === f.section && t.key === f.key).length !== source.filter((t) => t.section === f.section && t.key === f.key).length) throw Error(`Ambiguous device field: ${f.label}.`);
    const output = f.section === "I/O Configurations" && f.key.match(/^DO(\d{2})_(?:SAFE|PWN)$/);
    if (output) {
      const mode = target.find((t) => t.section === f.section && t.key === `DO${output[1]}`);
      if (mode?.value !== "0,(DO)") throw Error(`DO-${output[1]} must already be in digital output mode. No configuration sent.`);
    }
    if (!f.options && other.value.replace(/\([^)]*\)/g, "(label)").replace(/[-+]?\d+(?:\.\d+)?/g, "#") !== f.value.replace(/\([^)]*\)/g, "(label)").replace(/[-+]?\d+(?:\.\d+)?/g, "#") && /\(/.test(other.value + f.value)) throw Error(`Device format differs for ${f.label}.`);
    return { ...other, value: f.value };
  });
  return replaceValues(current, changes);
}
function policyReadback(policy, current) {
  try {
    validatePolicy(policy);
    const actual = parseGoldenFields(current), source = parseGoldenFields(policy.text), expected = source.filter((f) => policy.managedIds.includes(f.id));
    const missing = expected.filter((f) => !actual.some((a) => a.id === f.id));
    if (missing.length) return { status: "unknown", detail: `${missing.length} selected settings not reported` };
    const differences = expected.filter((f) => actual.find((a) => a.id === f.id).value !== f.value || actual.filter((a) => a.section === f.section && a.key === f.key).length !== source.filter((a) => a.section === f.section && a.key === f.key).length);
    return { status: differences.length ? "mismatch" : "ok", detail: differences.length ? `Golden Rule differs: ${differences.map((f) => f.label).join(", ")}` : "All selected Golden Rule settings verified" };
  } catch {
    return { status: "unknown", detail: "Device configuration format could not be verified" };
  }
}
var GoldenRuleStore = class {
  constructor(file, fallback) {
    this.file = file;
    this.fallback = fallback;
  }
  exists() {
    return import_node_fs.default.existsSync(this.file);
  }
  record() {
    if (!this.exists()) return { version: 1, policy: policyFromTemplate(this.fallback()) };
    const record = JSON.parse(import_node_fs.default.readFileSync(this.file, "utf8"));
    if (record.version !== 1) throw Error("Unsupported Golden Rule version.");
    validatePolicy(record.policy);
    return record;
  }
  policy() {
    return this.record().policy;
  }
  document() {
    const r = this.record();
    return presentPolicy(r.policy, !!r.previous);
  }
  save(edit) {
    const old = this.record();
    this.write({ version: 1, policy: editGoldenPolicy(old.policy, edit), previous: old.policy });
    return this.document();
  }
  import(text) {
    let previous;
    try {
      previous = this.policy();
    } catch {
    }
    this.write({ version: 1, policy: policyFromTemplate(text), previous });
  }
  restore(revision) {
    const old = this.record();
    if (ruleHash(old.policy) !== revision) throw Error("Golden Rule changed. Reload before restoring.");
    if (!old.previous) throw Error("No previous saved rule.");
    validatePolicy(old.previous);
    this.write({ version: 1, policy: old.previous, previous: old.policy });
    return this.document();
  }
  write(record) {
    import_node_fs.default.mkdirSync(import_node_path.default.dirname(this.file), { recursive: true, mode: 448 });
    const tmp = this.file + ".tmp";
    import_node_fs.default.writeFileSync(tmp, JSON.stringify(record), { mode: 384 });
    import_node_fs.default.renameSync(tmp, this.file);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GoldenRuleStore,
  applyGoldenPolicy,
  editGoldenPolicy,
  normalizeEditorTemplate,
  parseGoldenFields,
  policyFromTemplate,
  policyReadback,
  presentPolicy,
  ruleHash,
  validatePolicy
});
