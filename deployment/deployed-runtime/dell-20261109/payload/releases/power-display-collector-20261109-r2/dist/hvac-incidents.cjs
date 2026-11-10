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

// src/server/thermal/hvacMonitor.ts
var hvacMonitor_exports = {};
__export(hvacMonitor_exports, {
  HvacMonitor: () => HvacMonitor
});
module.exports = __toCommonJS(hvacMonitor_exports);

// src/server/thermal/hvacDiagnostics.ts
var import_node_crypto = require("node:crypto");

// src/server/thermal/hvacIncidentModel.ts
var HVAC_LIMITS = {
  maxPairs: 512,
  maxActive: 8,
  maxFiles: 2048,
  maxSamples: 2048,
  maxEvents: 128,
  maxBytes: 64 * 1024 ** 2,
  maxFileBytes: 1024 ** 2,
  reserveBytes: 5 * 1024 ** 3,
  maxGapMs: 3e4,
  settleMs: 3e4,
  holdMs: 15e3,
  zeroMs: 3e4,
  preMs: 18e4,
  preSamples: 180,
  windowMs: 18e5,
  postMs: 12e4
};
function incidentSummary(incident) {
  const { samples, ...rest } = incident;
  return { ...rest, sampleCount: samples.length };
}
function fanKey(p) {
  const c = p.commands;
  return c && typeof c.fanLow === "boolean" && typeof c.fanHigh === "boolean" ? `${Number(c.fanLow)}${Number(c.fanHigh)}` : null;
}

// src/server/thermal/hvacLoadProfiles.ts
var fs = __toESM(require("node:fs/promises"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var PROFILE_LIMITS = { maxEntries: 4096, maxBytes: 1024 * 1024, maxAgeMs: 7 * 864e5, checkpointMs: 6e4, minRunningA: 6, learnMs: 6e4, minSamples: 3 };
var HvacLoadProfiles = class {
  constructor() {
    this.values = /* @__PURE__ */ new Map();
    this.invalidated = /* @__PURE__ */ new Set();
    this.restorationBlocked = false;
    this.revision = 0;
  }
  get(key, now) {
    const p = this.values.get(key);
    return p && p.at <= now && now - p.at <= PROFILE_LIMITS.maxAgeMs ? p : null;
  }
  learn(key, amps, at) {
    if (key.length > 512 || !Number.isFinite(amps) || amps < PROFILE_LIMITS.minRunningA || !Number.isFinite(at)) return;
    const old = this.get(key, at);
    if (old && Math.abs(amps - old.amps) > Math.max(1.5, old.amps * 0.2)) return;
    if (old && at - old.at < PROFILE_LIMITS.checkpointMs) return;
    for (const [k, p] of this.values) if (at - p.at > PROFILE_LIMITS.maxAgeMs) this.values.delete(k);
    if (!this.values.has(key) && this.values.size >= PROFILE_LIMITS.maxEntries) return;
    this.values.set(key, { key, amps: old?.amps ?? amps, at });
    this.revision++;
  }
  removePrefix(prefix) {
    if (!this.invalidated.has(prefix)) {
      this.revision++;
      if (this.invalidated.size < PROFILE_LIMITS.maxEntries) this.invalidated.add(prefix);
      else this.restorationBlocked = true;
    }
    for (const k of this.values.keys()) if (k.startsWith(prefix)) {
      this.values.delete(k);
      this.revision++;
    }
  }
  restore(rows, now) {
    for (const p of rows) if (!this.restorationBlocked && ![...this.invalidated].some((prefix) => p.key.startsWith(prefix)) && !this.values.has(p.key) && this.values.size < PROFILE_LIMITS.maxEntries && p.at <= now && now - p.at <= PROFILE_LIMITS.maxAgeMs) this.values.set(p.key, p);
  }
  latest(prefix, now) {
    return ["00", "01", "10", "11"].flatMap((fan) => [false, true].map((reverse) => this.get(`${prefix}${fan}/${reverse}`, now))).filter((p) => p !== null).sort((a, b) => b.at - a.at)[0] ?? null;
  }
  snapshot(now) {
    return [...this.values.values()].filter((p) => p.at <= now && now - p.at <= PROFILE_LIMITS.maxAgeMs);
  }
};
var HvacProfileStore = class {
  constructor(directory, profiles, reserveBytes) {
    this.directory = directory;
    this.profiles = profiles;
    this.reserveBytes = reserveBytes;
    this.warning = null;
    this.blocked = false;
    this.tail = Promise.resolve();
    this.queued = false;
    this.savedRevision = 0;
    this.lastWrite = 0;
    this.ready = this.load().catch((e) => {
      this.blocked = true;
      this.warning = `Load baseline persistence unavailable: ${String(e)}. Existing files preserved.`;
    });
  }
  async load() {
    await fs.mkdir(this.directory, { recursive: true });
    const names = await fs.readdir(this.directory);
    if (names.some((n) => n !== "profiles.json")) throw new Error("Unexpected or interrupted profile file");
    if (!names.length) return;
    const file = import_node_path.default.join(this.directory, "profiles.json"), stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > PROFILE_LIMITS.maxBytes) throw new Error("Invalid profile file");
    const value = JSON.parse(await fs.readFile(file, "utf8"));
    if (value.version !== 1 || !Array.isArray(value.profiles) || value.profiles.length > PROFILE_LIMITS.maxEntries) throw new Error("Invalid profile schema");
    const rows = value.profiles;
    const keys = /* @__PURE__ */ new Set();
    for (const p of rows) {
      if (!p || typeof p.key !== "string" || p.key.length > 512 || !Number.isFinite(p.amps) || p.amps < PROFILE_LIMITS.minRunningA || !Number.isFinite(p.at) || p.at < 0 || keys.has(p.key)) throw new Error("Invalid profile entry");
      keys.add(p.key);
    }
    this.profiles.restore(rows, Date.now());
  }
  checkpoint(force = false) {
    if (this.blocked || this.queued) return;
    if (!force && (this.profiles.revision === this.savedRevision || Date.now() - this.lastWrite < PROFILE_LIMITS.checkpointMs)) return;
    this.queued = true;
    this.tail = (async () => {
      await this.ready;
      if (this.blocked || this.profiles.revision === this.savedRevision) return;
      const revision = this.profiles.revision, body = JSON.stringify({ version: 1, profiles: this.profiles.snapshot(Date.now()) });
      const bytes = Buffer.byteLength(body);
      if (bytes > PROFILE_LIMITS.maxBytes) throw new Error("Profile size cap reached");
      const stat = await fs.statfs(this.directory);
      if (stat.bavail * stat.bsize - bytes < this.reserveBytes) throw new Error("Free-disk reserve reached");
      const file = import_node_path.default.join(this.directory, "profiles.json"), temp = `${file}.tmp`;
      const handle = await fs.open(temp, "wx", 384);
      try {
        await handle.writeFile(body);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temp, file);
      this.savedRevision = revision;
      this.lastWrite = Date.now();
      this.warning = null;
    })().catch((e) => {
      this.blocked = true;
      this.warning = `Load baseline persistence paused: ${String(e)}. Existing files preserved.`;
    }).finally(() => {
      this.queued = false;
    });
  }
  async flush() {
    await this.ready;
    await this.tail;
    this.checkpoint(true);
    await this.tail;
  }
};

// src/server/thermal/hvacDiagnostics.ts
var unitState = () => ({ signature: "", since: 0, fan: /* @__PURE__ */ new Map(), running: null, lowSince: null, highSince: null, zeroSince: null, dropped: false, zeroReported: false, drops: [], elevatedSince: null, elevatedReported: false, learning: [] });
var pairState = () => ({ last: null, buffer: [], units: [unitState(), unitState()], offSince: null, offBase: null, trial: null, swaps: [[], []], swapEvidence: [], swapReported: false, active: null, lastAbnormal: 0, offFans: null, readiness: null, ctReason: "Waiting for a stable both-compressors-off reference" });
var resetEvidence = (s) => {
  s.units = [unitState(), unitState()];
  s.offSince = null;
  s.offBase = null;
  s.trial = null;
  s.swaps = [[], []];
  s.swapEvidence = [];
  s.swapReported = false;
  s.offFans = null;
  s.ctReason = "Evidence interrupted; fresh both-off reference required";
};
var known = (p) => p.quality === "Live" && Number.isFinite(p.current) && p.current >= 0 && typeof p.commands?.compressor === "boolean" && p.commands.electricHeat === false && fanKey(p) !== null && typeof p.commands.reversingValve === "boolean";
var HvacDiagnostics = class {
  constructor(publish, profiles = new HvacLoadProfiles()) {
    this.publish = publish;
    this.profiles = profiles;
    this.pairs = /* @__PURE__ */ new Map();
    this.siteId = null;
    this.siteLabel = "";
    this.warning = null;
    this.lastSourceAt = null;
  }
  prefix(key) {
    return JSON.stringify([this.siteId, key]) + "/";
  }
  profileKey(key, i, p) {
    return `${this.prefix(key)}${i}/${fanKey(p)}/${p.commands?.reversingValve}`;
  }
  ingest(units, site, now) {
    if (site?.id !== this.siteId) {
      this.finishAll("Site changed");
      this.pairs.clear();
      this.lastSourceAt = null;
      this.siteId = site?.id ?? null;
      this.siteLabel = site?.label ?? "";
    }
    if (!site) return;
    const grouped = /* @__PURE__ */ new Map();
    for (const u of units) {
      const key = `${u.array}/${u.segment}/${u.ip}`;
      const group = grouped.get(key) ?? [];
      group.push(u);
      grouped.set(key, group);
    }
    for (const [key, s] of this.pairs) if (!grouped.has(key)) {
      this.finish(s, "Controller no longer present");
      this.pairs.delete(key);
    }
    for (const [key, group] of grouped) {
      const a = group.find((u) => u.unit === 1), b = group.find((u) => u.unit === 2);
      if (!a || !b) continue;
      let s = this.pairs.get(key);
      if (!s) {
        if (this.pairs.size >= HVAC_LIMITS.maxPairs) {
          this.warning = "Controller tracking limit reached";
          continue;
        }
        s = pairState();
        this.pairs.set(key, s);
      }
      const at = a.point.at;
      const pairUnits = [a, b];
      const fresh = known(a.point) && known(b.point) && at === b.point.at && now - at <= HVAC_LIMITS.maxGapMs && at <= now && Number.isFinite(at);
      if (fresh && s.last?.quality === "Live" && at === s.last.at && JSON.stringify(this.sample(a, b, at)) === JSON.stringify(s.last)) continue;
      s.readiness = pairUnits.map((u, i) => {
        const profile = this.profiles.latest(`${this.prefix(key)}${i}/`, now);
        return { id: u.id, label: u.label, ready: false, reason: "Waiting for eligible paired data", baselineA: profile?.amps ?? null, baselineAt: profile?.at ?? null, sourceAt: u.point.at, ctReason: "Waiting for independent exclusive-command episodes" };
      });
      if (!fresh) {
        this.gap(s, now);
        for (const [i, u] of pairUnits.entries()) s.readiness[i].reason = this.ineligible(u.point, now) ?? (at !== b.point.at ? "Paired source timestamps do not align" : "Other HVAC channel is ineligible; paired diagnosis paused");
        continue;
      }
      if (s.last && at <= s.last.at) {
        const reversed = at < s.last.at;
        this.gap(s, now);
        for (const row of s.readiness) row.reason = reversed ? "Source timestamp reversed; waiting for new samples" : "Conflicting data at the same source timestamp; waiting for new samples";
        continue;
      }
      if (s.last && at - s.last.at > HVAC_LIMITS.maxGapMs) this.gap(s, s.last.at + 1);
      const sample = this.sample(a, b, at);
      this.lastSourceAt = Math.max(this.lastSourceAt ?? 0, at);
      const events = [];
      this.swap(s, sample, events);
      if (s.swapReported) this.profiles.removePrefix(this.prefix(key));
      for (const i of [0, 1]) {
        const p = pairUnits[i].point, profileKey = this.profileKey(key, i, p);
        this.unit(s.units[i], p, i, at, events, s.swapReported, profileKey);
        const profile = this.profiles.get(profileKey, at), row = s.readiness[i];
        const retained = profile ?? this.profiles.latest(`${this.prefix(key)}${i}/`, at);
        row.baselineA = retained?.amps ?? null;
        row.baselineAt = retained?.at ?? null;
        row.reason = s.swapReported ? "Suspected CT swap; load profiles invalidated" : !p.commands.compressor ? "Compressor off; baseline retained if available" : at - s.units[i].since < HVAC_LIMITS.settleMs ? "Command transition settling (30 seconds)" : profile ? "Ready for sustained dropout detection" : p.current < PROFILE_LIMITS.minRunningA ? "No validated load for this fan/mode; current below conservative 6 A learning floor" : "Learning stable commanded load for this fan/mode (60 seconds, at least 3 fresh samples)";
        row.ready = row.reason === "Ready for sustained dropout detection";
        row.ctReason = s.swapReported ? "Suspected swapped CTs; no automatic remapping" : `${s.ctReason}. CT evidence: ${s.swaps[0].length}/2 HVAC 1 starts, ${s.swaps[1].length}/2 HVAC 2 starts in one hour`;
      }
      s.buffer.push(sample);
      s.buffer = s.buffer.filter((p) => p.at >= at - HVAC_LIMITS.preMs).slice(-HVAC_LIMITS.preSamples);
      const abnormal = events.some((e) => e.kind !== "recovery") || s.units.some((u) => u.dropped || u.zeroReported);
      if (abnormal) s.lastAbnormal = at;
      if (events.length && !s.active) {
        if ([...this.pairs.values()].filter((p) => p.active).length >= HVAC_LIMITS.maxActive) this.warning = "Active incident limit reached; additional incidents not recorded";
        else s.active = {
          version: 1,
          id: (0, import_node_crypto.randomUUID)(),
          siteId: site.id,
          siteLabel: site.label,
          controller: a.ip,
          labels: [a.label, b.label],
          startedAt: at,
          updatedAt: at,
          events: [],
          samples: s.buffer.slice(),
          truncated: false
        };
      } else if (s.active) this.append(s.active, sample);
      if (s.active) {
        s.active.updatedAt = at;
        if (events.some((e) => e.kind === "ct-swap" || e.kind === "command-current-mismatch")) s.active.ctEvidence = s.swapEvidence.slice();
        for (const event of events) {
          if (s.active.events.length < HVAC_LIMITS.maxEvents) s.active.events.push(event);
          else s.active.truncated = true;
        }
        this.publish(s.active, false);
        if (at - s.active.startedAt >= HVAC_LIMITS.windowMs) this.finish(s, "Maximum incident window reached");
        else if (at - s.lastAbnormal >= HVAC_LIMITS.postMs) this.finish(s, "Post-event observation complete");
      }
      s.last = sample;
    }
  }
  ineligible(p, now) {
    if (!Number.isFinite(p.at) || p.at > now || now - p.at > HVAC_LIMITS.maxGapMs || p.quality !== "Live") return "Source stale, unavailable or invalid timestamp; baseline retained";
    if (p.current === null || !Number.isFinite(p.current) || p.current < 0) return "Current measurement missing or invalid";
    if (p.commands?.electricHeat === true) return "Electric heat active; compressor-only diagnosis unsupported";
    if (!known(p)) return "Compressor, fan, heater or reversing-valve command unknown";
    return null;
  }
  sample(a, b, at) {
    const points = [a.point, b.point];
    const command = (key) => points.map((p) => p.commands?.[key] ?? null);
    return { at, current: [a.point.current, b.point.current], compressor: command("compressor"), fanLow: command("fanLow"), fanHigh: command("fanHigh"), heat: command("electricHeat"), reverse: command("reversingValve"), space: a.point.space, supply: a.point.supply, quality: "Live" };
  }
  append(incident, sample) {
    if (incident.samples.at(-1)?.at === sample.at) return;
    if (incident.samples.length < HVAC_LIMITS.maxSamples) incident.samples.push(sample);
    else incident.truncated = true;
  }
  gap(s, at) {
    if (s.last?.quality === "Gap") return;
    if (s.last) {
      const gap = { ...s.last, at: Math.max(at, s.last.at + 1), current: [null, null], compressor: [null, null], fanLow: [null, null], fanHigh: [null, null], heat: [null, null], reverse: [null, null], space: null, supply: null, quality: "Gap" };
      s.buffer.push(gap);
      s.buffer = s.buffer.slice(-HVAC_LIMITS.preSamples);
      if (s.active) {
        this.append(s.active, gap);
        s.active.updatedAt = gap.at;
        this.finish(s, "Evidence interrupted: stale, missing, unsupported or misaligned data");
      }
      s.last = gap;
    }
    resetEvidence(s);
  }
  unit(s, p, i, at, events, mappingSuspect, profileKey) {
    const c = p.commands, key = fanKey(p);
    const signature = `${key}/${c.compressor}/${c.reversingValve}`;
    if (signature !== s.signature) {
      s.signature = signature;
      s.since = at;
      s.lowSince = null;
      s.highSince = null;
      s.zeroSince = null;
      s.running = null;
      s.dropped = false;
      s.zeroReported = false;
      s.drops = [];
      s.elevatedSince = null;
      s.elevatedReported = false;
      s.learning = [];
    }
    if (at - s.since < HVAC_LIMITS.settleMs || mappingSuspect) return;
    const amps = p.current;
    const emit = (kind) => events.push({ at, unit: i + 1, kind });
    if (!c.compressor) {
      if (amps < PROFILE_LIMITS.minRunningA) s.fan.set(key, amps);
      s.running = null;
      return;
    }
    if (amps <= 0.25) {
      s.zeroSince ??= at;
      if (at - s.zeroSince >= HVAC_LIMITS.zeroMs && !s.zeroReported) {
        emit("loss-of-load");
        s.zeroReported = true;
      }
    } else {
      if (s.zeroReported && !s.dropped) emit("recovery");
      s.zeroSince = null;
      s.zeroReported = false;
    }
    if (amps >= PROFILE_LIMITS.minRunningA) {
      if (s.learning.some((v) => Math.abs(v.amps - amps) > Math.max(1, amps * 0.1))) {
        s.learning = [];
        s.highSince = null;
      }
      s.learning.push({ at, amps });
      s.learning = s.learning.slice(-128);
      if (s.learning.length >= PROFILE_LIMITS.minSamples && at - s.learning[0].at >= PROFILE_LIMITS.learnMs) {
        const sorted = s.learning.map((v) => v.amps).sort((a, b) => a - b);
        this.profiles.learn(profileKey, sorted[Math.floor(sorted.length / 2)], at);
      }
    } else s.learning = [];
    const profile = this.profiles.get(profileKey, at);
    const fan = s.fan.get(key);
    if (!profile && fan !== void 0 && amps >= Math.max(PROFILE_LIMITS.minRunningA, fan + 3)) {
      s.highSince ??= at;
      if (at - s.highSince >= HVAC_LIMITS.holdMs && s.learning.length >= PROFILE_LIMITS.minSamples) this.profiles.learn(profileKey, amps, at);
    } else if (!profile) s.highSince = null;
    s.running = this.profiles.get(profileKey, at)?.amps ?? null;
    if (s.running === null) return;
    const low = Math.min(s.running * 0.45, fan === void 0 ? s.running * 0.35 : fan + Math.max(0.75, fan * 0.25));
    const high = s.running * 0.75;
    if (s.running !== null && amps > Math.max(s.running * 1.35, s.running + 3)) {
      s.elevatedSince ??= at;
      if (at - s.elevatedSince >= 5e3 && !s.elevatedReported) {
        emit("elevated-load");
        s.elevatedReported = true;
      }
    } else {
      s.elevatedSince = null;
      s.elevatedReported = false;
    }
    if (amps >= high) {
      s.highSince ??= at;
      s.lowSince = null;
      if (at - s.highSince >= HVAC_LIMITS.holdMs) {
        if (s.dropped) emit("recovery");
        s.dropped = false;
        if (s.running === null) s.running = amps;
      }
    } else if (amps <= low && s.running !== null) {
      s.lowSince ??= at;
      s.highSince = null;
      if (at - s.lowSince >= HVAC_LIMITS.holdMs && !s.dropped) {
        s.dropped = true;
        s.drops = s.drops.filter((t) => at - t <= 9e5);
        s.drops.push(at);
        emit("dropout");
        if (s.drops.length >= 2) emit("cycling");
      }
    } else {
      s.lowSince = null;
      s.highSince = null;
    }
  }
  swap(s, p, events) {
    const last = s.last;
    if (!last || last.quality !== "Live") return;
    s.swaps = s.swaps.map((times) => times.filter((t) => p.at - t <= 36e5));
    s.swapEvidence = s.swapEvidence.filter((e) => p.at - e.at <= 36e5);
    const fans = JSON.stringify([p.fanLow, p.fanHigh, p.reverse]);
    const sameFans = JSON.stringify([last.fanLow, last.fanHigh, last.reverse]) === fans;
    const off = p.compressor.every((v) => v === false);
    if (off) {
      if (!sameFans) {
        s.offSince = null;
        s.offBase = null;
      }
      s.trial = null;
      s.offSince ??= p.at;
      if (p.at - s.offSince >= HVAC_LIMITS.settleMs) {
        s.offBase = p.current;
        s.offFans = fans;
      }
      s.ctReason = s.offBase ? "Both-off reference available; waiting for an exclusive compressor start" : "Settling both-off reference (30 seconds)";
      return;
    }
    const exclusive = p.compressor[0] !== p.compressor[1];
    if (!exclusive) {
      s.offSince = null;
      s.offBase = null;
      s.trial = null;
      s.ctReason = "Both compressors commanded on; mapping is ambiguous";
      return;
    }
    const direction = p.compressor[0] ? 0 : 1;
    const other = direction === 0 ? 1 : 0;
    if (last.compressor.every((v) => v === false) && s.offBase) {
      const baseFans = JSON.parse(s.offFans);
      const otherStable = baseFans[0][other] === p.fanLow[other] && baseFans[1][other] === p.fanHigh[other] && baseFans[2][other] === p.reverse[other];
      s.trial = otherStable ? { direction, at: p.at, stableSince: p.at, base: s.offBase, evidenceSince: null } : null;
      s.ctReason = otherStable ? "Exclusive start settling; checking paired current response" : "Other unit fan/mode changed at start; mapping is ambiguous";
    }
    s.offSince = null;
    s.offBase = null;
    if (!s.trial || s.trial.direction !== direction) {
      s.trial = null;
      return;
    }
    if (!sameFans && p.at !== s.trial.at) {
      s.trial = null;
      s.ctReason = "Fan/mode changed during CT trial; new exclusive start required";
      return;
    }
    if (p.at - s.trial.stableSince < HVAC_LIMITS.settleMs) return;
    const trial = s.trial;
    if (p.current[direction] <= Math.max(3, trial.base[direction] + 1.5) && p.current[other] - trial.base[other] >= PROFILE_LIMITS.minRunningA) {
      trial.evidenceSince ??= p.at;
      s.ctReason = "Crossed command/current response observed; checking persistence";
      if (p.at - trial.evidenceSince < HVAC_LIMITS.holdMs) return;
      s.swaps[direction].push(p.at);
      s.swapEvidence.push({ at: p.at, commandedUnit: direction + 1, baseline: [...trial.base], observed: [...p.current] });
      if (s.swaps[0].length + s.swaps[1].length === 1) events.push({ at: p.at, unit: direction + 1, kind: "command-current-mismatch" });
      s.ctReason = "Mismatch episode recorded; reciprocal independent episodes required";
    } else {
      trial.evidenceSince = null;
      if (p.at - trial.at < 9e4) return;
      s.swaps = [[], []];
      s.swapEvidence = [];
      s.ctReason = "Episode did not support crossed CTs; previous votes cleared";
    }
    s.trial = null;
    s.swaps = s.swaps.map((times) => times.filter((t) => p.at - t <= 36e5).slice(-4));
    s.swapEvidence = s.swapEvidence.filter((e) => p.at - e.at <= 36e5).slice(-8);
    if (!s.swapReported && s.swaps.every((times) => times.length >= 2)) {
      s.swapReported = true;
      s.units = [unitState(), unitState()];
      events.push({ at: p.at, unit: null, kind: "ct-swap" });
    }
  }
  finish(s, reason) {
    if (s.active) {
      s.active.endedAt = s.active.updatedAt;
      s.active.endReason = reason;
      this.publish(s.active, true);
      s.active = null;
    }
  }
  finishAll(reason = "Monitor stopped") {
    for (const s of this.pairs.values()) this.finish(s, reason);
  }
  status(now) {
    const readiness = [...this.pairs.values()].flatMap((p) => p.readiness ?? []).map((row) => {
      let result = { ...row };
      if (now !== void 0 && row.baselineAt !== null && (now - row.baselineAt > PROFILE_LIMITS.maxAgeMs || row.baselineAt > now)) result = { ...result, baselineA: null, baselineAt: null, ready: false, reason: "Running profile expired; fresh stable load required" };
      if (now !== void 0 && (row.sourceAt === null || now - row.sourceAt > HVAC_LIMITS.maxGapMs || row.sourceAt > now)) result = { ...result, ready: false, reason: "Source stale; retained baseline is not current evidence", ctReason: "CT analysis paused until fresh aligned data returns" };
      return result;
    });
    return {
      siteId: this.siteId,
      siteLabel: this.siteLabel,
      trackedPairs: this.pairs.size,
      readiness,
      readyUnits: readiness.filter((r) => r.ready).length,
      learnedUnits: readiness.filter((r) => r.baselineA !== null).length,
      lastSourceAt: this.lastSourceAt,
      warning: this.warning
    };
  }
};

// src/server/thermal/hvacIncidentStore.ts
var fs2 = __toESM(require("node:fs/promises"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var validId = (id) => /^[a-f0-9-]{36}$/.test(id);
var HvacIncidentStore = class {
  constructor(directory, maxBytes = HVAC_LIMITS.maxBytes, reserveBytes = HVAC_LIMITS.reserveBytes) {
    this.directory = directory;
    this.maxBytes = maxBytes;
    this.reserveBytes = reserveBytes;
    this.index = /* @__PURE__ */ new Map();
    this.sizes = /* @__PURE__ */ new Map();
    this.pending = /* @__PURE__ */ new Map();
    this.lastQueued = /* @__PURE__ */ new Map();
    this.tail = Promise.resolve();
    this.running = false;
    this.loadFailed = false;
    this.warning = null;
    this.usedBytes = 0;
    this.ready = this.load().catch((e) => {
      this.loadFailed = true;
      this.warning = `Incident history unavailable: ${String(e)}`;
    });
  }
  async load() {
    await fs2.mkdir(this.directory, { recursive: true });
    const names = await fs2.readdir(this.directory);
    for (const name of names) {
      const file = import_node_path2.default.join(this.directory, name), stat = await fs2.lstat(file);
      this.usedBytes += stat.size;
      if (!stat.isFile() || stat.isSymbolicLink() || !name.endsWith(".json") || !validId(name.slice(0, -5))) continue;
      if (this.index.size >= HVAC_LIMITS.maxFiles) throw new Error("Incident file count limit reached");
      if (stat.size > HVAC_LIMITS.maxFileBytes) throw new Error("Oversized incident file; existing data preserved");
      const incident = JSON.parse(await fs2.readFile(file, "utf8"));
      if (incident.version !== 1 || incident.id !== name.slice(0, -5) || typeof incident.siteId !== "string" || !Array.isArray(incident.samples) || !Array.isArray(incident.events)) throw new Error("Invalid incident file; existing data preserved");
      if (!incident.endedAt) {
        incident.endedAt = incident.updatedAt;
        incident.endReason = "Recording interrupted by restart";
      }
      this.index.set(incident.id, incidentSummary(incident));
      this.sizes.set(incident.id, stat.size);
    }
  }
  offer(incident, final) {
    const last = this.lastQueued.get(incident.id);
    if (!final && last !== void 0 && incident.updatedAt - last < 3e4) return;
    if (this.pending.size >= HVAC_LIMITS.maxActive && !this.pending.has(incident.id)) {
      this.warning = "Incident writer busy; checkpoint skipped";
      return;
    }
    this.pending.set(incident.id, structuredClone(incident));
    this.lastQueued.set(incident.id, incident.updatedAt);
    if (final) this.lastQueued.delete(incident.id);
    if (this.running) return;
    this.running = true;
    this.tail = (async () => {
      await this.ready;
      while (this.pending.size) {
        const [id, value] = this.pending.entries().next().value;
        this.pending.delete(id);
        if (this.loadFailed) continue;
        try {
          await this.save(value);
        } catch (e) {
          this.warning = `Incident recording paused: ${String(e)}`;
        }
      }
    })().finally(() => {
      this.running = false;
    });
  }
  async save(incident) {
    if (!validId(incident.id)) throw new Error("Invalid incident identifier");
    if (!this.index.has(incident.id) && this.index.size >= HVAC_LIMITS.maxFiles) throw new Error(`${HVAC_LIMITS.maxFiles}-incident limit reached; saved data preserved`);
    const body = JSON.stringify(incident), bytes = Buffer.byteLength(body), previous = this.sizes.get(incident.id) ?? 0;
    if (bytes > HVAC_LIMITS.maxFileBytes) throw new Error("Incident size limit reached");
    if (this.usedBytes + bytes > this.maxBytes) throw new Error("Incident storage cap reached; saved data preserved");
    const stat = await fs2.statfs(this.directory);
    if (stat.bavail * stat.bsize - bytes < this.reserveBytes) throw new Error("Free-disk reserve reached");
    const file = import_node_path2.default.join(this.directory, `${incident.id}.json`), temporary = `${file}.tmp`;
    const handle = await fs2.open(temporary, "wx", 384);
    this.usedBytes += bytes;
    try {
      await handle.writeFile(body);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs2.rename(temporary, file);
    this.usedBytes -= previous;
    this.sizes.set(incident.id, bytes);
    this.index.set(incident.id, incidentSummary(incident));
  }
  async list(siteId) {
    await this.ready;
    return [...this.index.values()].filter((i) => i.siteId === siteId).sort((a, b) => b.startedAt - a.startedAt);
  }
  async get(id, siteId) {
    await this.ready;
    const summary = this.index.get(id);
    if (!validId(id) || !summary || summary.siteId !== siteId) throw new Error("Incident not found for this site");
    const file = import_node_path2.default.join(this.directory, `${id}.json`), stat = await fs2.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > HVAC_LIMITS.maxFileBytes) throw new Error("Invalid incident file");
    const incident = JSON.parse(await fs2.readFile(file, "utf8"));
    return { ...incident, endedAt: summary.endedAt, endReason: summary.endReason };
  }
  async flush() {
    await this.ready;
    await this.tail;
  }
};

// src/server/thermal/hvacIncidentGraph.ts
function hvacIncidentGraph(incident) {
  const rows = incident.samples.map((s) => {
    const value = (field, i) => s[field][i] === null ? null : Number(s[field][i]);
    return {
      at: s.at,
      current1: s.current[0],
      current2: s.current[1],
      space: s.space,
      supply: s.supply,
      compressor1: value("compressor", 0),
      compressor2: value("compressor", 1),
      fanLow1: value("fanLow", 0),
      fanLow2: value("fanLow", 1),
      fanHigh1: value("fanHigh", 0),
      fanHigh2: value("fanHigh", 1),
      heat1: value("heat", 0),
      heat2: value("heat", 1),
      reverse1: value("reverse", 0),
      reverse2: value("reverse", 1)
    };
  });
  const currents = incident.samples.flatMap((s) => s.current).filter((v) => v !== null);
  const intervals = incident.samples.slice(1).flatMap((s, i) => s.quality === "Live" && incident.samples[i].quality === "Live" ? [s.at - incident.samples[i].at] : []);
  return {
    incident,
    rows,
    observedPeak: currents.length ? Math.max(...currents) : null,
    maxObservedIntervalMs: intervals.length ? Math.max(...intervals) : null,
    dropoutCount: incident.events.filter((e) => e.kind === "dropout").length
  };
}

// src/server/thermal/hvacMonitor.ts
var HvacMonitor = class {
  constructor(directory, enabled = process.env.PRIZM_HVAC_INCIDENTS_ENABLED !== "false", reserveBytes = HVAC_LIMITS.reserveBytes) {
    this.enabled = enabled;
    this.store = enabled ? new HvacIncidentStore(directory, HVAC_LIMITS.maxBytes, reserveBytes) : null;
    this.engine = new HvacDiagnostics((incident, final) => this.store?.offer(incident, final));
    this.profileStore = enabled ? new HvacProfileStore(`${directory}-baselines`, this.engine.profiles, reserveBytes) : null;
  }
  ingest(units, site, now) {
    if (this.enabled) {
      this.engine.ingest(units, site, now);
      this.profileStore?.checkpoint();
    }
  }
  async status() {
    await this.profileStore?.ready;
    const state = this.engine.status(Date.now());
    const incidents = await this.store?.list(state.siteId) ?? [];
    const fresh = state.lastSourceAt !== null && Date.now() - state.lastSourceAt <= HVAC_LIMITS.maxGapMs;
    return {
      ...state,
      readyUnits: fresh ? state.readyUnits : 0,
      enabled: this.enabled,
      incidents,
      warning: [this.store?.warning, this.profileStore?.warning, state.warning, this.enabled && !fresh ? "No recent eligible source samples. Current equipment condition is unknown; saved incidents remain available." : null].filter(Boolean).join(" ") || null,
      usedBytes: this.store?.usedBytes ?? 0,
      limits: { maxBytes: HVAC_LIMITS.maxBytes, maxFiles: HVAC_LIMITS.maxFiles, maxSamples: HVAC_LIMITS.maxSamples, maxGapMs: HVAC_LIMITS.maxGapMs }
    };
  }
  async incident(id) {
    if (!this.store) throw new Error("HVAC incident monitoring disabled");
    const siteId = this.engine.status().siteId, incident = await this.store.get(id, siteId);
    if (siteId !== this.engine.status().siteId) throw new Error("Site changed during incident read");
    return hvacIncidentGraph(incident);
  }
  async flush() {
    await this.store?.flush();
    await this.profileStore?.flush();
  }
  async close() {
    this.engine.finishAll();
    await this.flush();
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HvacMonitor
});
