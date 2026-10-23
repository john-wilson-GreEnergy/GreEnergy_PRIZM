import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzip, gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import type {CellFrame, CellHistorySite, CellMetric, CellOverview, CellHistoryResult, CellHistoryPoint} from '../../core/cellHistory';
import {CellQueryWorkerClient} from './CellQueryWorkerClient';
import {decodeCellReport} from './decodeCellReport';
import {historyPoint, projectCells, arrayCellSnapshot} from './cellProjection';
import {selectSnapshotIndex,validateSnapshotIndexQuery,type SnapshotIndexQuery} from './snapshotIndex';

const compress = promisify(gzip), decompress = promisify(gunzip);
const DAY = 86_400_000, FRAME_LIMIT = 16 * 1024 * 1024;
const siteKey = (site: CellHistorySite) => createHash('sha256').update(JSON.stringify([site.stationCode, site.blockIndex, site.emsBaseUrl])).digest('hex');
function validateStoredFrame(frame: CellFrame): void {
  let count = 0;
  const ids = new Set<string>();
  for (const row of frame.strings) {
    const n = row.bpcCount * row.groupsPerBpc, id = `${row.array}:${row.string}`;
    if (![row.array, row.string, row.bpcCount, row.groupsPerBpc].every(v => Number.isInteger(v) && v > 0) ||
        row.array > 64 || row.string > 256 || row.bpcCount > 64 || row.groupsPerBpc > 128 || ids.has(id) ||
        (count += n) > 250_000 || ![row.millivolts, row.temperatureF, row.observedAt].every(values => Array.isArray(values) && values.length === n && values.every(v => v === null || typeof v === 'number' && Number.isFinite(v))) ||
        !Array.isArray(row.ignoredTemperatures) || row.ignoredTemperatures.some(i => !Number.isInteger(i) || i < 0 || i >= n)) throw new Error('Invalid stored cell columns');
    ids.add(id);
  }
}
export interface CellHistoryOptions {
  directory: string; enabled: boolean; intervalMs?: number; retentionDays?: number; maxBytes?: number; reserveBytes?: number;
  currentSite?: () => CellHistorySite | null;
  workerQueries?: boolean;
  cacheQueries?: boolean;
  workerFile?: string;
}
/** One active write, no raw-report backlog, atomic frames, bounded disk queries. */
export class CellHistory {
  readonly intervalMs: number;
  readonly retentionDays: number;
  readonly maxBytes: number;
  private latest: CellFrame | null = null;
  private scope: CellHistorySite | null = null;
  private active: Promise<void> | null = null;
  private stopped = false;
  private lastAttempt = -Infinity;
  private lastSignature = '';
  private querying = false;
  private snapshotReading = false;
  private queryFinished: Promise<void> = Promise.resolve();
  private waitingQuery = false;
  private generation = 0;
  private reader: CellQueryWorkerClient | null = null;
  private pointCache = new Map<string, CellHistoryPoint>();
  private counters = {saved: 0, dropped: 0, failures: 0, lastError: null as string | null, lastSavedAt: null as number | null};
  constructor(readonly options: CellHistoryOptions) {
    this.intervalMs = Math.max(60_000, options.intervalMs ?? 60_000);
    this.retentionDays = Math.min(30, Math.max(1, options.retentionDays ?? 7));
    this.maxBytes = Math.max(1024 * 1024, options.maxBytes ?? 8 * 1024 ** 3);
  }
  private selectSite(site: CellHistorySite | null): void {
    if ((this.scope ? siteKey(this.scope) : null) === (site ? siteKey(site) : null)) return;
    this.generation++; this.scope = site ? {...site} : null; this.latest = null;
    this.pointCache.clear();
    this.lastAttempt = -Infinity; this.lastSignature = ''; this.counters.lastSavedAt = null;
  }
  private synchronizeSite(): void { if (this.options.currentSite) this.selectSite(this.options.currentSite()); }
  /** Called only with an already acquired EMS report and its captured connection identity. */
  offer(raw: unknown, site: CellHistorySite, acquiredAt: number, stillCurrent: () => boolean = () => true): void {
    if (!this.options.enabled || this.stopped) return;
    this.synchronizeSite();
    if (this.options.currentSite && (!this.scope || siteKey(site) !== siteKey(this.scope))) return;
    this.selectSite(site);
    if (this.active) { this.counters.dropped++; return; }
    if (acquiredAt >= this.lastAttempt && acquiredAt - this.lastAttempt < this.intervalMs) return;
    this.lastAttempt = acquiredAt;
    const key = siteKey(site), generation = this.generation;
    this.active = (async () => {
      const frame = await decodeCellReport(raw, site, acquiredAt);
      this.synchronizeSite();
      if (!stillCurrent() || generation !== this.generation || this.stopped) return;
      // Preserve known channel coverage when a later report omits a string.
      // Missing channels become gaps, never copies of last-known values.
      const incoming = new Set(frame.strings.map(row => `${row.array}:${row.string}`));
      for (const previous of this.latest?.strings ?? []) {
        if (incoming.has(`${previous.array}:${previous.string}`)) continue;
        const n = previous.bpcCount * previous.groupsPerBpc;
        frame.strings.push({...previous, observedAt: Array(n).fill(null), millivolts: Array(n).fill(null), temperatureF: Array(n).fill(null), ignoredTemperatures: []});
        if (frame.issues.length < 32) frame.issues.push(`Array ${previous.array} string ${previous.string}: missing from current report`);
      }
      validateStoredFrame(frame);
      this.latest = frame;
      const body = JSON.stringify(frame.strings);
      const signature = createHash('sha256').update(body).digest('hex');
      if (signature === this.lastSignature) return;
      const encoded = JSON.stringify(frame);
      if (Buffer.byteLength(encoded) > FRAME_LIMIT) throw new Error('Canonical cell frame exceeds storage limit');
      const compressed = await compress(encoded, {level: 1});
      const directory = path.join(this.options.directory, key);
      await fs.mkdir(directory, {recursive: true, mode: 0o700});
      await this.prune(acquiredAt, compressed.length);
      const capacity = await fs.statfs(directory);
      if (capacity.bavail * capacity.bsize < (this.options.reserveBytes ?? 2 * 1024 ** 3) + compressed.length) throw new Error('Cell recorder paused: disk reserve reached');
      this.synchronizeSite();
      if (!stillCurrent() || generation !== this.generation || this.stopped) return;
      const filename = path.join(directory, `${acquiredAt}.cells.json.gz`);
      const temporary = `${filename}.tmp`;
      try {
        await fs.writeFile(temporary, compressed, {flag: 'wx', mode: 0o600});
        await fs.rename(temporary, filename);
      } finally { await fs.unlink(temporary).catch(() => {}); }
      this.lastSignature = signature;
      this.counters.saved++; this.counters.lastSavedAt = acquiredAt; this.counters.lastError = null;
    })().catch(error => { this.counters.failures++; this.counters.lastError = error instanceof Error ? error.message : 'Cell recorder failed'; })
      .finally(() => { this.active = null; });
  }
  private async files() {
    const files: {file: string; at: number; bytes: number}[] = [];
    const directories = await fs.readdir(this.options.directory, {withFileTypes: true}).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const directory of directories) {
      if (!directory.isDirectory() || !/^[a-f0-9]{64}$/.test(directory.name)) continue;
      for (const entry of await fs.readdir(path.join(this.options.directory, directory.name), {withFileTypes: true})) {
        if (entry.isFile() && /^\d{13}\.cells\.json\.gz\.tmp$/.test(entry.name)) {
          const temporary = path.join(this.options.directory, directory.name, entry.name);
          if ((await fs.stat(temporary)).mtimeMs < Date.now() - 300_000) await fs.unlink(temporary);
          continue;
        }
        const match = /^(\d{13})\.cells\.json\.gz$/.exec(entry.name);
        if (!entry.isFile() || !match) continue;
        const file = path.join(this.options.directory, directory.name, entry.name), stat = await fs.stat(file);
        files.push({file, at: Number(match[1]), bytes: stat.size});
      }
    }
    return files.sort((a, b) => a.at - b.at);
  }
  private async prune(now: number, incoming: number): Promise<void> {
    const files = await this.files();
    let bytes = files.reduce((sum, file) => sum + file.bytes, 0);
    for (const file of files) {
      if (file.at >= now - this.retentionDays * DAY && bytes + incoming <= this.maxBytes) break;
      await fs.unlink(file.file); bytes -= file.bytes;
    }
    if (bytes + incoming > this.maxBytes) throw new Error('Cell frame cannot fit within configured disk cap');
  }
  view(metric: CellMetric, now = Date.now(), array?: number): CellOverview {
    this.synchronizeSite();
    return {
      site: this.scope ? `${this.scope.stationCode} / Block ${this.scope.blockIndex}` : null,
      acquiredAt: this.latest?.acquiredAt ?? null, metric, ...projectCells(this.latest, metric, now, array),
      targets: (this.latest?.strings ?? []).map(({array, string, bpcCount, groupsPerBpc}) => ({array, string, bpcCount, groupsPerBpc})),
      issues: this.latest?.issues ?? [],
      storage: {enabled: this.options.enabled, intervalMs: this.intervalMs, retentionDays: this.retentionDays, maxBytes: this.maxBytes, ...this.counters},
    };
  }
  async index(input:SnapshotIndexQuery = {}) {
    validateSnapshotIndexQuery(input); this.synchronizeSite();
    const scope=this.scope?{...this.scope}:null,generation=this.generation;
    const label=scope?`${scope.stationCode} / Block ${scope.blockIndex}`:null;
    if(!scope||!this.options.enabled||this.stopped)return selectSnapshotIndex([],label,input);
    const entries=await fs.readdir(path.join(this.options.directory,siteKey(scope)),{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
    this.synchronizeSite();
    if(generation!==this.generation)throw new Error('Active site changed; reload snapshot list');
    const timestamps=entries.filter(e=>e.isFile()&&/^\d{13}\.cells\.json\.gz$/.test(e.name)).map(e=>Number(e.name.split('.')[0]));
    return selectSnapshotIndex(timestamps,label,input);
  }
  async snapshot(input: {array: number; metric: CellMetric; at?: number}, signal?: AbortSignal) {
    this.synchronizeSite(); signal?.throwIfAborted();
    const {array, metric, at} = input;
    if (!Number.isInteger(array) || array < 1 || array > 64 || !['millivolts', 'temperatureF'].includes(metric) ||
      (at !== undefined && (!Number.isSafeInteger(at) || !/^\d{13}$/.test(String(at))))) throw new Error('Invalid array snapshot selection');
    if (!this.options.enabled || !this.scope) throw new Error('Cell recording is not enabled or no site is available');
    if (at === undefined) {
      if (!this.latest) throw new Error('No cell snapshot recorded yet');
      return arrayCellSnapshot(this.latest, metric, array, Date.now(), false);
    }
    if (this.snapshotReading) throw new Error('Another cell snapshot is loading; try again shortly');
    this.snapshotReading = true;
    const generation = this.generation, key = siteKey(this.scope);
    try {
      const file = path.join(this.options.directory, key, `${at}.cells.json.gz`);
      if ((await fs.lstat(file)).isSymbolicLink() || (await fs.stat(file)).size > FRAME_LIMIT) throw new Error('Invalid frame file');
      const frame = JSON.parse((await decompress(await fs.readFile(file), {maxOutputLength: FRAME_LIMIT})).toString()) as CellFrame;
      this.synchronizeSite(); signal?.throwIfAborted();
      if (generation !== this.generation) throw new Error('Active site changed; reload snapshot');
      if (frame.schema !== 1 || siteKey(frame.site) !== key || frame.acquiredAt !== at || !Array.isArray(frame.strings)) throw new Error('Invalid frame identity');
      validateStoredFrame(frame);
      return arrayCellSnapshot(frame, metric, array, at, true);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Recorded snapshot is unavailable or has expired');
      throw error;
    } finally { this.snapshotReading = false; }
  }
  async query(input: {from: number; to: number; metric: CellMetric; ids: string[]; array?: number}, signal?: AbortSignal): Promise<CellHistoryResult> {
    const started = performance.now();
    signal?.throwIfAborted();
    this.synchronizeSite();
    const {from, to, metric, ids, array} = input;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to - from > 7 * DAY ||
        !['millivolts', 'temperatureF'].includes(metric) || ids.length > 8 || new Set(ids).size !== ids.length ||
        ids.some(id => !/^A[1-9]\d{0,2}-S[1-9]\d{0,2}-B[1-9]\d?-C[1-9]\d{0,2}$/.test(id)) ||
        (array !== undefined && (!Number.isInteger(array) || array < 1 || array > 64))) throw new Error('Select a valid window up to seven days and at most eight cell groups');
    // One query plus one waiting request. A changing UI can cancel the first
    // request without racing the disk reader's next cooperative checkpoint.
    if (this.querying) {
      const beforeWait = this.generation;
      if (this.waitingQuery) throw new Error('Another cell history query is running; try again shortly');
      this.waitingQuery = true;
      try { await this.queryFinished; } finally { this.waitingQuery = false; }
      signal?.throwIfAborted();
      this.synchronizeSite();
      if (beforeWait !== this.generation) throw new Error('Active site changed; reload history');
    }
    const result: CellHistoryResult = {points: [], matchedFrames: 0, sampledFrames: 0, unreadableFrames: 0, intervalMs: this.intervalMs, sampled: false};
    if (!this.scope || !this.options.enabled || this.stopped) return result;
    this.querying = true;
    let finish!: () => void;
    this.queryFinished = new Promise(resolve => { finish = resolve; });
    const scope = {...this.scope}, key = siteKey(scope), generation = this.generation;
    try {
      if (this.options.workerQueries) {
        this.reader ??= new CellQueryWorkerClient(this.options.workerFile);
        const output = await this.reader.run(this.options.directory, scope, this.intervalMs, input, signal);
        this.synchronizeSite(); signal?.throwIfAborted();
        if (this.stopped || generation !== this.generation) throw new Error('Active site changed or history reader stopped; reload history');
        return output;
      }
      result.diagnostics = {elapsedMs:0, framesRead:0, cacheHits:0};
      const directory = path.join(this.options.directory, key);
      const names = await fs.readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      const frames = names.filter(name => /^\d{13}\.cells\.json\.gz$/.test(name)).map(name => ({name, at: Number(name.split('.')[0])}))
        .filter(frame => frame.at >= from && frame.at <= to).sort((a, b) => a.at - b.at);
      result.matchedFrames = frames.length;
      const selected = frames.length <= 180 ? frames : Array.from({length: 180}, (_, i) => frames[Math.round(i * (frames.length - 1) / 179)]);
      result.sampled = selected.length < frames.length;
      const nominalStep = Math.max(this.intervalMs, selected.length > 1 ? (selected[selected.length - 1].at - selected[0].at) / (selected.length - 1) : this.intervalMs);
      result.intervalMs = Math.round(nominalStep);
      const deadline = performance.now() + 30_000;
      for (const entry of selected) {
        signal?.throwIfAborted();
        if (performance.now() > deadline) throw new Error('History query exceeded its time budget; select a shorter window');
        this.synchronizeSite();
        if (generation !== this.generation) throw new Error('Active site changed; reload history');
        try {
          const file = path.join(directory, entry.name);
          const stat = await fs.lstat(file);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > FRAME_LIMIT) throw new Error('Invalid frame file');
          const cacheKey = JSON.stringify([key,entry.at,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs,metric,array,ids]);
          let point = this.options.cacheQueries ? this.pointCache.get(cacheKey) : undefined;
          if (point) {
            result.diagnostics.cacheHits++;
            this.pointCache.delete(cacheKey); this.pointCache.set(cacheKey, point);
          } else {
            const frame = JSON.parse((await decompress(await fs.readFile(file), {maxOutputLength: FRAME_LIMIT})).toString()) as CellFrame;
            if (frame.schema !== 1 || siteKey(frame.site) !== key || frame.acquiredAt !== entry.at || !Array.isArray(frame.strings)) throw new Error('Invalid frame identity');
            validateStoredFrame(frame);
            point = historyPoint(frame, metric, ids, array);
            result.diagnostics.framesRead++;
            if (this.options.cacheQueries) {
              this.pointCache.set(cacheKey, point);
              if (this.pointCache.size > 2048) this.pointCache.delete(this.pointCache.keys().next().value!);
            }
          }
          const previous = result.points.at(-1);
          if (previous && point.at - previous.at > nominalStep * 2.5) result.points.push({at: previous.at + nominalStep, min: null, average: null, max: null, valid: 0, total: 0, values: Object.fromEntries(ids.map(id => [id, null])), sourceTimes: {}, arrays: []});
          result.points.push(point); result.sampledFrames++;
        } catch { result.unreadableFrames++; result.points.push({at: entry.at, min: null, average: null, max: null, valid: 0, total: 0, values: Object.fromEntries(ids.map(id => [id, null])), sourceTimes: {}, arrays: []}); }
        await yieldTurn();
      }
      this.synchronizeSite();
      if (generation !== this.generation) throw new Error('Active site changed; reload history');
      result.diagnostics.elapsedMs = Math.round(performance.now() - started);
      return result;
    } finally { this.querying = false; finish(); }
  }
  async drain(): Promise<void> { await this.active; }
  async close(): Promise<void> { this.stopped = true; await this.reader?.close(); this.pointCache.clear(); await this.drain(); }
}
