import * as fs from "node:fs/promises";
import {createReadStream} from "node:fs";
import {createInterface} from "node:readline";
import {createHash, randomUUID} from "node:crypto";
import path from "node:path";
import {BalancingProgressReview} from "./balancingProgress";
import {finiteReading, timelineChanges, type TimelineBatch, type TimelineObservation, type TimelineEvent, type TimelineReport} from "./operationalTimelineModel";

const HOUR = 3_600_000, RETENTION = 7 * 24 * HOUR;
const pattern = /^([a-f0-9]{64})-(\d{1,4})-(\d{13})\.jsonl$/;
const siteKey = (id: string) => createHash("sha256").update(id).digest("hex");
type Record = {observation: TimelineObservation; events: TimelineEvent[]};
type StorageOptions = {maxBytes: number; reserveBytes: number; maxPendingBatches?: number; maxPendingBytes?: number};
export class OperationalTimeline {
  private closed=false;
  private closing:Promise<void>|null=null;
  private tail: Promise<void> = Promise.resolve();
  private pendingBatches = 0;
  private pendingBytes = 0;
  private lastDropReason: string | null = null;
  private writeSite: string | null = null;
  private pendingCommands = 0;
  private droppedCommands = 0;
  private initialized = false;
  private token: string | null = null;
  private previous = new Map<string, TimelineObservation>();
  private files = new Map<string, number>();
  private site: TimelineBatch["site"] | null = null;
  private error: string | null = null;
  private dropped = 0;
  private lastSaved: number | null = null;
  private maintenanceAt = 0;
  private free = 0;
  private querying = false;
  private cached: {key: string; at: number; report: TimelineReport} | null = null;
  constructor(readonly directory: string, private options: StorageOptions = {maxBytes: 2 * 1024 ** 3, reserveBytes: 5 * 1024 ** 3}, private clock = Date.now) {}
  status() {
    return {enabled: process.env.PRIZM_OPERATIONAL_TIMELINE_ENABLED !== "false", site: this.site?.label ?? null, lastSaved: this.lastSaved,
      error: this.error, droppedBatches: this.dropped, droppedCommands: this.droppedCommands, retentionDays: 7, intervalSeconds: 10, stringIntervalSeconds: 60, usedBytes: this.used(), maxBytes: this.options.maxBytes,
      reserveBytes: this.options.reserveBytes, directory: this.directory,
      pendingBatches: this.pendingBatches, pendingBytes: this.pendingBytes, pendingCommands: this.pendingCommands,
      maxPendingBatches: this.options.maxPendingBatches ?? 32, maxPendingBytes: this.options.maxPendingBytes ?? 8 * 1024 ** 2,
      bufferingEnabled: process.env.PRIZM_TIMELINE_BUFFERING !== "false", lastDropReason: this.lastDropReason};
  }
  private used() { return [...this.files.values()].reduce((sum, n) => sum + n, 0); }
  private async init() {
    if (this.initialized) return;
    await fs.mkdir(this.directory, {recursive: true});
    const stat = await fs.lstat(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Invalid timeline directory");
    const marker = path.join(this.directory, "format.json");
    const names = await fs.readdir(this.directory);
    if (!names.includes("format.json")) {
      if (names.length) throw new Error("Refusing to adopt an unmarked timeline directory");
      await fs.writeFile(marker, JSON.stringify({format: "prizm-operational-timeline-v1"}), {flag: "wx"});
    }
    const markerStat = await fs.lstat(marker);
    if (!markerStat.isFile() || markerStat.isSymbolicLink() || JSON.parse(await fs.readFile(marker, "utf8")).format !== "prizm-operational-timeline-v1") throw new Error("Invalid timeline ownership marker");
    const lock = path.join(this.directory, "writer.json");
    const old = await fs.lstat(lock).catch(e => {if (e.code === "ENOENT") return null; throw e;});
    if (old) {
      if (!old.isFile() || old.isSymbolicLink()) throw new Error("Invalid timeline writer lock");
      const owner = JSON.parse(await fs.readFile(lock, "utf8"));
      if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error("Invalid timeline writer");
      let alive = true;
      try { process.kill(owner.pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ESRCH") alive = false; }
      if (alive) throw new Error("Timeline already has a writer");
      await fs.unlink(lock);
    }
    const token = randomUUID();
    await fs.writeFile(lock, JSON.stringify({pid: process.pid, token}), {flag: "wx"});
    this.token = token;
    for (const name of names) {
      if (!pattern.test(name)) continue;
      const s = await fs.lstat(path.join(this.directory, name));
      if (!s.isFile() || s.isSymbolicLink()) throw new Error("Invalid timeline shard");
      this.files.set(name, s.size);
    }
    this.initialized = true;
  }
  private async maintain(now: number) {
    for (const name of this.files.keys()) {
      const hour = Number(pattern.exec(name)![3]);
      if (hour + HOUR > now - RETENTION) continue;
      // Only expire owned shards. Never remove user files or unexpired evidence.
      const file = path.join(this.directory, name), stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid timeline shard");
      await fs.unlink(file); this.files.delete(name);
    }
    const disk = await fs.statfs(this.directory); this.free = disk.bavail * disk.bsize;
    this.maintenanceAt = now;
  }
  ingest(batch: TimelineBatch | null) {
    if(this.closed)return;
    if (!batch) return;
    if (this.site?.id !== batch.site.id) this.cached = null;
    this.site = {...batch.site};
    if (process.env.PRIZM_OPERATIONAL_TIMELINE_ENABLED === "false") return;
    // Fail visibly rather than repeatedly hammering a full or inaccessible disk.
    if (this.error) {this.dropBatch("Recorder paused after a write error"); return;}
    if (process.env.PRIZM_TIMELINE_BUFFERING === "false" && (this.pendingBatches || this.pendingCommands)) {
      this.dropBatch("Writer busy (buffering disabled)"); return;
    }
    if (this.pendingBatches >= (this.options.maxPendingBatches ?? 32)) {
      this.dropBatch("Telemetry queue batch limit reached"); return;
    }
    // Retain an immutable, byte-bounded snapshot, not references to mutable live telemetry.
    // No coalescing: an observed OPEN → CLOSED → OPEN must survive a short write burst.
    let snapshot: string;
    try { snapshot = JSON.stringify(batch); } catch {this.dropBatch("Telemetry snapshot could not be serialized"); return;}
    const bytes = Buffer.byteLength(snapshot);
    if (this.pendingBytes + bytes > (this.options.maxPendingBytes ?? 8 * 1024 ** 2)) {
      this.dropBatch("Telemetry queue byte limit reached"); return;
    }
    this.pendingBatches++; this.pendingBytes += bytes;
    // Share the command writer's promise chain; ingest never waits for filesystem IO.
    this.tail = this.tail.then(async () => {
      if (this.error) {this.dropBatch("Queued telemetry not saved after a write error"); return;}
      await this.write(JSON.parse(snapshot) as TimelineBatch);
    }).catch(e => {
      this.error = String(e); this.dropBatch("Telemetry write failed; batch may be partially saved");
    }).finally(() => {this.pendingBatches--; this.pendingBytes -= bytes;});
  }
  private dropBatch(reason: string) {this.dropped++; this.lastDropReason = reason;}
  captureSite(emsBaseUrl: string): TimelineBatch["site"] | null {
    if (!this.site) return null;
    try {
      const expected = JSON.parse(this.site.id)[2];
      if (typeof expected !== "string" || new URL(expected).href.replace(/\/$/, "") !== new URL(emsBaseUrl).href.replace(/\/$/, "")) return null;
      return {...this.site};
    } catch {return null;}
  }
  recordCommand(site: TimelineBatch["site"] | null, observation: TimelineObservation) {
    if(this.closed)return;
    if (process.env.PRIZM_OPERATIONAL_TIMELINE_ENABLED === "false") return;
    if (!site || this.error || this.pendingCommands >= 100) {this.droppedCommands++; return;}
    const batch = structuredClone({site, observations: [observation]});
    this.pendingCommands++;
    // Commands queue behind telemetry rather than being silently discarded by its busy guard.
    // Captured site identity is retained even if the active connection changes during readback.
    this.tail = this.tail.then(async () => {
      if (this.error) {this.droppedCommands++; return;}
      await this.write(batch);
    })
      .catch(e => {this.error = String(e); this.droppedCommands++;}).finally(() => {this.pendingCommands--;});
  }
  private async write(batch: TimelineBatch) {
    await this.init();
    // Reset baselines in writer order, not when a later site's batch is merely enqueued.
    if (this.writeSite !== batch.site.id) {this.previous.clear(); this.writeSite = batch.site.id;}
    const now = this.clock(), key = siteKey(batch.site.id);
    if (!this.maintenanceAt || now - this.maintenanceAt >= 60_000) await this.maintain(now);
    const groups = new Map<string, {records: Record[]; keys: string[]}>();
    for (const original of batch.observations) {
      const blockScoped = original.scope === "block" && original.array === 0 && original.string == null && ["command", "ems-app"].includes(original.stream);
      if ((!blockScoped && (!Number.isInteger(original.array) || original.array < 1 || original.array > 9999 || original.scope === "block")) || !Number.isFinite(original.observedAt)) continue;
      const observation = {...original, values: {...original.values}};
      const ageLimit = observation.stream === "electrical" ? 15_000 : 120_000;
      // Historical quality is assessed at observation time; a slow disk must not
      // turn a then-fresh reading into a fabricated telemetry outage.
      if (observation.stream !== "command" && (!Number.isFinite(observation.sourceAt) || observation.observedAt > now + 30_000 || observation.sourceAt! > observation.observedAt + 30_000 || observation.observedAt - observation.sourceAt! > ageLimit)) observation.quality = "unavailable";
      const identity = `${key}:${observation.entity}:${observation.stream}`, previous = this.previous.get(identity);
      if (previous?.sourceAt != null && observation.sourceAt != null && observation.sourceAt < previous.sourceAt) observation.quality = "unavailable";
      if (observation.quality !== "live") {
        observation.values = {};
        if (observation.balancing) observation.balancing = {...observation.balancing, spreadMv: null, minMv: null, maxMv: null, averageMv: null, currentA: null, activeBpcs: null, activity: "Telemetry unavailable", chargeDeadband: "Unknown", dischargeDeadband: "Unknown", target: "Unknown", activeCells: "Unknown"};
      }
      if (observation.stream !== "command" && previous && previous.sourceAt === observation.sourceAt && previous.quality === observation.quality && previous.source === observation.source) continue;
      const events = timelineChanges(previous, observation);
      const interval = ["string-state", "ems-app"].includes(observation.stream) ? 60_000 : 10_000;
      if (!events.length && previous && observation.observedAt - previous.observedAt < interval) continue;
      const name = `${key}-${observation.array}-${Math.floor(now / HOUR) * HOUR}.jsonl`;
      const group = groups.get(name) || {records: [], keys: []};
      group.records.push({observation, events}); group.keys.push(identity); groups.set(name, group);
    }
    for (const [name, group] of groups) {
      const data = "\n" + group.records.map(record => JSON.stringify(record)).join("\n") + "\n", bytes = Buffer.byteLength(data);
      if (this.used() + bytes > this.options.maxBytes) throw new Error("Timeline storage cap reached; unexpired records preserved");
      if (this.free - bytes < this.options.reserveBytes) throw new Error("Timeline free-disk reserve reached");
      const file = path.join(this.directory, name);
      const existing = await fs.lstat(file).catch(e => {if (e.code === "ENOENT") return null; throw e;});
      if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error("Invalid timeline shard");
      const handle = await fs.open(file, "a");
      try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
      this.files.set(name, (this.files.get(name) || 0) + bytes); this.free -= bytes;
      group.records.forEach((record, index) => {if (record.observation.stream !== "command") this.previous.set(group.keys[index], record.observation);});
      this.lastSaved = now;
    }
  }
  async flush() { await this.tail; }
  close():Promise<void> {
    if(this.closing)return this.closing;
    this.closed=true;
    this.closing=(async()=>{
    await this.flush();
    if (this.token) {
      const file = path.join(this.directory, "writer.json");
      if (JSON.parse(await fs.readFile(file, "utf8")).token === this.token) await fs.unlink(file);
      this.token = null;
    }
    })();return this.closing;
  }
  async query(array: number, hours: number, string: number | null = null): Promise<TimelineReport> {
    if (!Number.isInteger(array) || array < 1 || array > 9999 || ![1, 12, 24].includes(hours)) throw new Error("Choose an array and a 1, 12 or 24-hour window");
    if (string !== null && (!Number.isInteger(string) || string < 1 || string > 9999)) throw new Error("Invalid string target");
    if (process.env.PRIZM_OPERATIONAL_TIMELINE_ENABLED === "false") throw new Error("Operational timeline is disabled");
    if (!this.site) throw new Error("Waiting for site identity");
    const site = this.site, now = this.clock(), key = siteKey(site.id), cacheKey = `${key}:${array}:${hours}:${string ?? "all"}:${process.env.PRIZM_BALANCING_PROGRESS_ENABLED !== "false"}`;
    if (this.cached?.key === cacheKey && now - this.cached.at < 30_000) return this.cached.report;
    if (this.querying) throw new Error("A timeline review is already building; try again shortly");
    this.querying = true;
    try {
      await this.flush();
      const report: TimelineReport = {from: now - hours * HOUR, to: now, site: site.label, array, samples: 0, events: [], eventsTruncated: false, points: [], coverage: [], strings: [], selectedString: string};
      const observedStrings = new Set<number>();
      const balancing = process.env.PRIZM_BALANCING_PROGRESS_ENABLED === "false" ? null : new BalancingProgressReview(now, string);
      let scanned = 0;
      const minutes = new Map<string, TimelineReport["points"][number]>();
      const streams = new Map<string, {last?: TimelineObservation; covered: number; cursor: number; gap: number; label: string; stream: string}>();
      const names = [...this.files.keys()].filter(name => (name.startsWith(`${key}-${array}-`) || name.startsWith(`${key}-0-`)) && Number(pattern.exec(name)![3]) + HOUR >= report.from).sort();
      for (const name of names) {
        const file = path.join(this.directory, name), stat = await fs.lstat(file).catch(() => null);
        if (!stat || !stat.isFile() || stat.isSymbolicLink()) continue;
        const input = createReadStream(file, {encoding: "utf8"}), lines = createInterface({input, crlfDelay: Infinity});
        try { for await (const line of lines) {
          let record: Record; try {record = JSON.parse(line);} catch {continue;}
          const o = record.observation;
          if (!o || !Number.isFinite(o.observedAt) || o.observedAt < report.from || o.observedAt > now || (o.array !== array && !(o.scope === "block" && o.array === 0)) || !o.values) continue;
          if (++scanned > 200_000) throw new Error("Review exceeds the bounded read limit; choose a shorter window");
          if (scanned % 500 === 0) await new Promise<void>(resolve => setImmediate(resolve));
          if (o.string) observedStrings.add(o.string);
          // Retain array-level commands and PCS context in a single-string review.
          if (string !== null && o.string != null && o.string !== string) continue;
          report.samples++;
          balancing?.add(o);
          for (const event of record.events || []) report.events.push(event);
          // Block and array shards are separate. Keep the newest events by time, not file order.
          if (report.events.length > 300) {report.events.sort((a, b) => b.at - a.at); report.events.length = 300; report.eventsTruncated = true;}
          if (o.stream === "command") continue; // A command is not a telemetry sample or coverage evidence.
          const identity = `${o.entity}:${o.stream}`, item = streams.get(identity) || {covered: 0, cursor: report.from, gap: 0, label: o.label, stream: o.stream};
          const prev = item.last, maxGap = o.stream === "electrical" ? 25_000 : 120_000;
          const start = Math.max(report.from, prev?.sourceAt ?? report.from), end = Math.min(now, o.sourceAt ?? now);
          if (prev?.quality === "live" && o.quality === "live" && prev.source === o.source && end > start && end - start <= maxGap) {
            item.gap = Math.max(item.gap, start - item.cursor); item.covered += Math.max(0, end - Math.max(start, item.cursor)); item.cursor = Math.max(item.cursor, end);
          }
          item.last = o; streams.set(identity, item);
          if (o.stream === "electrical") {
            const at = o.observedAt, pointKey = `${o.entity}:${Math.floor(at / 60_000)}`;
            const live = o.quality === "live";
            minutes.set(pointKey, {at, label: o.label, kw: live ? finiteReading(o.values.kw) : null, kvar: live ? finiteReading(o.values.kvar) : null, dcV: live ? finiteReading(o.values.dcV) : null, dcA: live ? finiteReading(o.values.dcA) : null});
          }
        }} finally {lines.close(); input.destroy();}
      }
      report.events.sort((a, b) => b.at - a.at);
      report.strings = [...observedStrings].sort((a, b) => a - b);
      if (balancing) report.balancing = balancing.finish();
      report.points = [...minutes.values()].sort((a, b) => a.at - b.at);
      report.coverage = [...streams.values()].map(s => ({label: s.label, stream: s.stream, coverage: `${(100 * s.covered / (now - report.from)).toFixed(1)}%`, longestGap: `${(Math.max(s.gap, now - s.cursor) / 60_000).toFixed(1)} min`}));
      if (this.site?.id !== site.id) throw new Error("Site changed during review; reload for the current site");
      this.cached = {key: cacheKey, at: now, report}; return report;
    } finally {this.querying = false;}
  }
}
let instance: OperationalTimeline | undefined;
let serviceClosed = false;
export const operationalTimeline = () => {
  if (!instance && serviceClosed) throw new Error("Operational timeline is shut down");
  return instance ??= new OperationalTimeline(path.resolve(process.env.PRIZM_OPERATIONAL_TIMELINE_DIR || ".prizm-data/operational-timeline"));
};
export const closeOperationalTimeline = async () => { serviceClosed = true; await instance?.close(); };
