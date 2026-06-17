import fs from "fs";
import path from "path";
import { getEmsConnectionStatus } from "../emsTurtleClient";
import { isHistoricalSnapshotAllowed, runStorageCleanup } from "../storage/storageMaintenance";

export const CACHE_ROOT = process.env.PRIZM_CACHE_DIR || path.resolve(process.cwd(), ".prizm-cache");
export const HISTORY_ROOT = process.env.PRIZM_HISTORY_DIR || path.resolve(process.cwd(), ".prizm-history");

// Ensure cache directories exist
try {
  fs.mkdirSync(CACHE_ROOT, { recursive: true });
  fs.mkdirSync(path.join(CACHE_ROOT, "sites"), { recursive: true });
  fs.mkdirSync(HISTORY_ROOT, { recursive: true });
} catch (e) {}

export type CachePolicy = "live-first" | "cache-first" | "live-only" | "cache-only";

let currentCachePolicy: CachePolicy = "live-first";

export function getCachePolicy(): CachePolicy {
  return currentCachePolicy;
}

export function setCachePolicy(policy: CachePolicy) {
  currentCachePolicy = policy;
}

export function getEffectiveCachePolicy(reqCacheQuery?: any, reqNoCache?: any, reqRefresh?: any): CachePolicy {
  if (reqRefresh === "true" || reqRefresh === true) return "live-first"; // Or maybe live-first and bypass cache read
  if (reqNoCache === "true" || reqNoCache === true) return "live-only";
  if (reqCacheQuery && ["live-first", "cache-first", "live-only", "cache-only"].includes(reqCacheQuery)) {
    return reqCacheQuery as CachePolicy;
  }
  return currentCachePolicy;
}

export function shouldFetchLive(policy: CachePolicy): boolean {
  return policy === "live-first" || policy === "live-only";
}

export function shouldReadCache(policy: CachePolicy): boolean {
  return policy === "live-first" || policy === "cache-first" || policy === "cache-only";
}

export type CacheMetadataEntryLike = Partial<PrizmCacheEntry<any>> & {
  sourceUrl?: string;
  updatedAt?: string;
  ageMs?: number;
  isStale?: boolean;
  dataClass?: PrizmDataClass;
  createdFromLiveSession?: boolean;
  profileId?: string | null;
  emsBaseUrl?: string | null;
};

export type PrizmLiveSource =
  | "live-ems"
  | "live-modbus"
  | "current-session-cache"
  | "cache"
  | "last-known"
  | "mock"
  | "unavailable";

export function buildCacheMetadata(policy: CachePolicy, wasCacheUsed: boolean, wasLiveAttempted: boolean, wasLiveSucceeded: boolean, entry?: CacheMetadataEntryLike | null, activeIdentity?: any, sourceOverride?: PrizmLiveSource) {
  const isMem = !!entry?.createdFromLiveSession && wasCacheUsed;
  const isDisk = !entry?.createdFromLiveSession && wasCacheUsed;

  let source = "unavailable";
  if (sourceOverride) {
      source = sourceOverride;
  } else if (wasLiveSucceeded) {
      if (entry?.sourceUrl?.includes("turtle") || entry?.sourceUrl?.includes("lastCall")) source = "live-ems";
      else source = "live-modbus";
  } else if (isMem) {
      source = "current-session-cache";
  } else if (wasCacheUsed) {
      source = "cache";
  }

  return {
    source,
    dataClass: entry?.dataClass || "last-known",
    cacheUsed: wasCacheUsed,
    diskCacheUsed: isDisk,
    memoryCacheUsed: isMem,
    liveAttempted: wasLiveAttempted,
    liveSucceeded: wasLiveSucceeded,
    stale: entry?.isStale ?? false,
    activeProfileId: activeIdentity?.activeProfileId || entry?.profileId,
    activeEmsBaseUrl: activeIdentity?.emsBaseUrl || entry?.emsBaseUrl,
    stationCode: activeIdentity?.stationCode,
    blockIndex: activeIdentity?.blockIndex || 1,
    timestamp: entry?.updatedAt || new Date().toISOString(),
    ageMs: entry?.ageMs || 0,
    cachePolicy: policy
  };
}

export type PrizmDataClass =
  | "live-telemetry"
  | "live-status"
  | "live-control-state"
  | "topology-structure"
  | "modbus-map"
  | "modbus-profile"
  | "static-dictionary"
  | "offline-history"
  | "last-known";

export interface PrizmCacheEntry<T = unknown> {
  key: string;
  data: T;
  sourceUrl?: string;
  fetchedAt: string;
  updatedAt: string;
  ageMs: number;
  ttlMs: number;
  sourceOk: boolean;
  isLive: boolean;
  isStale: boolean;
  error?: string | null;
  profileId?: string | null;
  emsBaseUrl?: string | null;
  wasFetched?: boolean;
  dataClass?: PrizmDataClass;
  createdFromLiveSession?: boolean;
}

export interface SetCacheOptions {
  ttlMs?: number;
  sourceUrl?: string;
  profileId?: string | null;
  emsBaseUrl?: string | null;
  isRaw?: boolean;
  rawExt?: string;
  dataClass?: PrizmDataClass;
}

export interface GetOrFetchOptions extends SetCacheOptions {
  forceRefresh?: boolean;
  persist?: boolean;
  policy?: CachePolicy;
}

const inFlightFetchers = new Map<string, Promise<any>>();

export async function getOrFetch<T>(key: string, fetcher: () => Promise<T>, options?: GetOrFetchOptions): Promise<PrizmCacheEntry<T>> {
  const policy = options?.policy || getCachePolicy();
  const allowLive = shouldFetchLive(policy) || options?.forceRefresh;
  const allowCache = shouldReadCache(policy);
  
  const isLiveDataClass = options?.dataClass === "live-telemetry" || options?.dataClass === "live-status" || options?.dataClass === "live-control-state";
  const blockDiskCacheForLive = isLiveDataClass && allowLive && policy === "live-first";
  
  if (allowCache && !options?.forceRefresh) {
    const existing = get<T>(key);
    if (existing) {
       // block returning disk-backed existing cache if we should try live first and this is live telemetry
       const allowServingCache = !(blockDiskCacheForLive && !existing.createdFromLiveSession);
       
       if (allowServingCache && (!existing.isStale || policy === "cache-only" || !allowLive)) {
           existing.wasFetched = false;
           return existing;
       }
    }
  }

  if (allowLive) {
      try {
        let fetchPromise = inFlightFetchers.get(key);
        if (!fetchPromise) {
            fetchPromise = fetcher().finally(() => {
                inFlightFetchers.delete(key);
            });
            inFlightFetchers.set(key, fetchPromise);
        }
        const data = await fetchPromise;
        const entry = set<T>(key, data, options);
        entry.wasFetched = true;
        return entry;
      } catch (err: any) {
        const existing = get<T>(key);
        updateManifest(key, false, options?.sourceUrl || '', options?.ttlMs ?? 5000, err.message);
        if (allowCache && existing && existing.data) {
          existing.sourceOk = false;
          existing.isLive = false;
          existing.wasFetched = false;
          existing.error = err.message;
          return existing;
        }
        const failedEntry: PrizmCacheEntry<T> = {
          key,
          data: null as any,
          fetchedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ageMs: 0,
          ttlMs: options?.ttlMs ?? 5000,
          sourceOk: false,
          isLive: false,
          isStale: true,
          error: err.message,
          profileId: options?.profileId,
          emsBaseUrl: options?.emsBaseUrl,
          wasFetched: false,
          dataClass: options?.dataClass,
          createdFromLiveSession: true
        };
        return failedEntry;
      }
  } else {
     // Not allowed to fetch live, and either no cache or allowCache is false.
     return {
        key,
        data: null as any,
        fetchedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ageMs: 0,
        ttlMs: options?.ttlMs ?? 5000,
        sourceOk: false,
        isLive: false,
        isStale: true,
        error: "Cache miss and live fetch not allowed.",
        profileId: options?.profileId,
        emsBaseUrl: options?.emsBaseUrl,
        wasFetched: false,
        dataClass: options?.dataClass,
        createdFromLiveSession: false
      };
  }
}

export function buildSiteCacheKey(input: {
  stationCode?: string | null;
  blockIndex?: number | string | null;
  emsBaseUrl?: string | null;
  profileId?: string | null;
}): string {
  const station = (input.stationCode || "UNKNOWN").toUpperCase();
  const block = input.blockIndex || 1;
  const ems = input.emsBaseUrl || "http://10.0.0.3:8080/turtle";
  const profileId = input.profileId || "";
  let hostPort = "unknown";
  try {
    const urlObj = new URL(ems);
    hostPort = `${urlObj.hostname}-${urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80')}`.replace(/[^a-zA-Z0-9-]/g, '-');
  } catch(e) {}
  
  const profPart = profileId ? `prof-${profileId}_` : "";
  let key = `${station}_block-${block}_${profPart}${hostPort}`;
  return key.replace(/[^a-zA-Z0-9-_]/g, '-');
}

export function getActiveSiteMetadata() {
  const status = getEmsConnectionStatus();
  return {
    stationCode: status.discoveredStationCode || status.stationCode,
    discoveredStationCode: status.discoveredStationCode,
    blockIndex: status.blockIndex,
    emsBaseUrl: status.activeEmsBaseUrl,
    profileId: status.activeProfileId,
    profileName: status.activeProfileName,
  };
}

export function getSiteCacheKey(): string {
  const meta = getActiveSiteMetadata();
  return buildSiteCacheKey(meta);
}

export function getActiveSiteCachePath(): string {
  return path.join(CACHE_ROOT, "sites", getSiteCacheKey());
}

export function getActiveSiteManifestPath(): string {
  return path.join(getActiveSiteCachePath(), "cache-manifest.json");
}

export function getActiveSiteCacheKey(): string {
  return getSiteCacheKey();
}

export function writeSiteArtifact(name: string, data: any): void {
  const p = getActiveSiteCachePath();
  if (!fs.existsSync(p)) {
      try { fs.mkdirSync(p, { recursive: true }); } catch (e) {}
  }
  let outData = data;
  if (typeof data !== 'string') outData = JSON.stringify(data, null, 2);
  try {
      fs.writeFileSync(path.join(p, name), outData);
  } catch(e) {}
}

export function readSiteArtifact(name: string): any {
  const p = path.join(getActiveSiteCachePath(), name);
  if (!fs.existsSync(p)) return null;
  try {
      const text = fs.readFileSync(p, 'utf8');
      if (name.endsWith('.json')) {
         return JSON.parse(text);
      }
      return text;
  } catch(e) {
      return null;
  }
}

let memoryCache = new Map<string, PrizmCacheEntry<any>>();

export function getActiveManifest() {
    const p = getActiveSiteManifestPath();
    if (fs.existsSync(p)) {
        try {
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch(e) {}
    }
    const meta = getActiveSiteMetadata();
    
    let hostname = '10.0.0.3';
    let port = 8080;
    let turtlePath = '/turtle';
    try {
        const urlObj = new URL(meta.emsBaseUrl);
        hostname = urlObj.hostname;
        port = parseInt(urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80'), 10);
        turtlePath = urlObj.pathname;
    } catch(e) {}

    return {
        siteCacheKey: getSiteCacheKey(),
        stationCode: meta.stationCode,
        discoveredStationCode: meta.discoveredStationCode,
        blockIndex: meta.blockIndex,
        emsBaseUrl: meta.emsBaseUrl,
        emsHost: hostname,
        emsPort: port,
        turtlePath,
        profileId: meta.profileId,
        profileName: meta.profileName,
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        lastSuccessfulConnectionAt: null as string | null,
        sourceSummary: {} as Record<string, any>
    };
}

export function updateManifest(sourceKey: string, sourceOk: boolean, sourceUrl: string, ttlMs: number, error?: string) {
    const p = getActiveSiteCachePath();
    if (!fs.existsSync(p)) {
        try { fs.mkdirSync(p, { recursive: true }); } catch (e) {}
        try { fs.mkdirSync(path.join(p, 'raw'), { recursive: true }); } catch (e) {}
    }
    const manifest = getActiveManifest();
    manifest.lastUpdatedAt = new Date().toISOString();
    if (sourceOk) manifest.lastSuccessfulConnectionAt = manifest.lastUpdatedAt;
    manifest.sourceSummary[sourceKey] = {
        lastFetchedAt: new Date().toISOString(),
        sourceOk,
        sourceUrl,
        ttlMs,
        error: error || undefined
    };
    try {
        fs.writeFileSync(getActiveSiteManifestPath(), JSON.stringify(manifest, null, 2));
    } catch(e) {}
}


export function get<T>(key: string): PrizmCacheEntry<T> | null {
  const meta = getActiveSiteMetadata();
  
  const p = path.join(getActiveSiteCachePath(), `${key}.json`);
  if (!memoryCache.has(key) && fs.existsSync(p)) {
      try {
          const content = JSON.parse(fs.readFileSync(p, 'utf8'));
          const cacheMeta = content.cacheMeta;
          const urlMatches = cacheMeta.emsBaseUrl === meta.emsBaseUrl;
          const stationMatches = (meta.stationCode || meta.discoveredStationCode) && cacheMeta.stationCode === (meta.stationCode || meta.discoveredStationCode);
          if (urlMatches || stationMatches) {
               const entry: PrizmCacheEntry<T> = {
                  key,
                  data: content.data,
                  fetchedAt: cacheMeta.fetchedAt,
                  updatedAt: cacheMeta.fetchedAt,
                  ageMs: 0,
                  ttlMs: cacheMeta.ttlMs,
                  sourceOk: cacheMeta.sourceOk,
                  isLive: false,
                  isStale: true,
                  sourceUrl: cacheMeta.sourceUrl,
                  profileId: meta.profileId,
                  emsBaseUrl: cacheMeta.emsBaseUrl,
                  dataClass: cacheMeta.dataClass,
                  createdFromLiveSession: false
               };
               memoryCache.set(key, entry);
          }
      } catch(e) {}
  }
  
  const entry = memoryCache.get(key);
  if (!entry) return null;

  const urlMatches = entry.emsBaseUrl === meta.emsBaseUrl;
  if (!urlMatches && entry.emsBaseUrl) {
       return null;
  }
  
  const now = Date.now();
  const fetchedAtMs = new Date(entry.fetchedAt).getTime();
  entry.ageMs = Math.max(0, now - fetchedAtMs);
  entry.isStale = entry.ageMs > entry.ttlMs;
  entry.isLive = !entry.isStale;
  return entry as PrizmCacheEntry<T>;
}


export function set<T>(key: string, data: T, options?: SetCacheOptions): PrizmCacheEntry<T> {
  const now = new Date().toISOString();
  const meta = getActiveSiteMetadata();
  const ttlMs = options?.ttlMs ?? 5000;
  
  const entry: PrizmCacheEntry<T> = {
    key,
    data,
    sourceUrl: options?.sourceUrl,
    fetchedAt: now,
    updatedAt: now,
    ageMs: 0,
    ttlMs: ttlMs,
    sourceOk: true,
    isLive: true,
    isStale: false,
    profileId: meta.profileId,
    emsBaseUrl: meta.emsBaseUrl,
    dataClass: options?.dataClass,
    createdFromLiveSession: true
  };
  memoryCache.set(key, entry);

  const p = getActiveSiteCachePath();
  if (!fs.existsSync(p)) {
      try { fs.mkdirSync(p, { recursive: true }); } catch (e) {}
      try { fs.mkdirSync(path.join(p, 'raw'), { recursive: true }); } catch (e) {}
  }
  
  const diskEntry: any = {
      cacheMeta: {
          siteCacheKey: getSiteCacheKey(),
          stationCode: meta.stationCode,
          emsBaseUrl: meta.emsBaseUrl,
          sourceKey: key,
          sourceUrl: options?.sourceUrl || '',
          fetchedAt: now,
          ttlMs,
          sourceOk: true,
          isLiveAtWrite: true,
          schemaVersion: 1,
          dataClass: options?.dataClass
      },
      data
  };

  try {
      if (options?.isRaw) {
          let outData = data;
          if (options.rawExt === '.json' && typeof data !== 'string') (outData as any) = JSON.stringify(data, null, 2);
          fs.writeFileSync(path.join(p, 'raw', `${key}${options.rawExt || '.json'}`), outData as any);
          diskEntry.data = null as any; 
      }
      fs.writeFileSync(path.join(p, `${key}.json`), JSON.stringify(diskEntry, null, 2));
      updateManifest(key, true, options?.sourceUrl || '', ttlMs);
  } catch(e) {}
  
  return entry;
}

export function clear(key?: string): void {
  if (key) {
    memoryCache.delete(key);
  } else {
    memoryCache.clear();
  }
}

export function getAvailableSiteCaches() {
    const sitesDir = path.join(CACHE_ROOT, "sites");
    if (!fs.existsSync(sitesDir)) return [];
    
    const dirs = fs.readdirSync(sitesDir);
    const sites = [];
    for (const d of dirs) {
        const manifestPath = path.join(sitesDir, d, "cache-manifest.json");
        if (fs.existsSync(manifestPath)) {
            try {
                const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                sites.push({
                    siteCacheKey: m.siteCacheKey,
                    stationCode: m.stationCode,
                    emsBaseUrl: m.emsBaseUrl,
                    blockIndex: m.blockIndex,
                    profileName: m.profileName,
                    lastUpdatedAt: m.lastUpdatedAt,
                    lastSuccessfulConnectionAt: m.lastSuccessfulConnectionAt
                });
            } catch(e) {}
        }
    }
    return sites;
}

export function getStatus() {
  return {
    cacheRoot: CACHE_ROOT,
    historyRoot: HISTORY_ROOT,
    activeSiteCacheKey: getSiteCacheKey(),
    activeSiteCachePath: getActiveSiteCachePath(),
    activeManifest: getActiveManifest(),
    availableSiteCaches: getAvailableSiteCaches(),
    enabled: true,
    cacheDir: CACHE_ROOT,
    entries: Array.from(memoryCache.values()).map(e => ({
       key: e.key,
       fetchedAt: e.fetchedAt,
       ageMs: e.ageMs,
       ttlMs: e.ttlMs,
       isLive: e.isLive,
       isStale: e.isStale,
       sourceOk: e.sourceOk,
       profileId: e.profileId,
       emsBaseUrl: e.emsBaseUrl
    }))
  };
}

export interface HistoricalCacheSettings {
  historicalSnapshotLoggingEnabled: boolean;
  retentionPolicy: "1h" | "6h" | "24h" | "7d" | "manual";
  snapshotFrequency: "every-refresh" | "30s" | "1m" | "5m";
}

const SETTINGS_FILE = path.join(CACHE_ROOT, "settings", "history-settings.json");

export function getHistoricalCacheSettings(): HistoricalCacheSettings {
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {}
  }
  return {
    historicalSnapshotLoggingEnabled: false,
    retentionPolicy: "24h",
    snapshotFrequency: "1m"
  };
}

export function setHistoricalCacheSettings(settings: HistoricalCacheSettings) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (e) {}
}

function parseRetentionMs(policy: string): number | null {
  if (policy === "1h") return 60 * 60 * 1000;
  if (policy === "6h") return 6 * 60 * 60 * 1000;
  if (policy === "24h") return 24 * 60 * 60 * 1000;
  if (policy === "7d") return 7 * 24 * 60 * 60 * 1000;
  return null;
}

export function pruneHistoricalCache(policy: string) {
  if (policy === "manual") return;
  const maxAgeMs = parseRetentionMs(policy);
  if (!maxAgeMs) return;

  const sitesDir = path.join(HISTORY_ROOT, "sites");
  if (!fs.existsSync(sitesDir)) return;

  const now = Date.now();
  const dirs = fs.readdirSync(sitesDir);
  for (const siteFolder of dirs) {
    const p = path.join(sitesDir, siteFolder);
    if (!fs.statSync(p).isDirectory()) continue;
    const files = fs.readdirSync(p);
    for (const f of files) {
      if (f.endsWith('.jsonl')) {
        const fp = path.join(p, f);
        try {
          const content = fs.readFileSync(fp, 'utf8');
          const lines = content.split('\n').filter(l => l.trim().length > 0);
          const keep = lines.filter(l => {
            try {
              const obj = JSON.parse(l);
              if (obj.timestampUtc) {
                 const age = now - new Date(obj.timestampUtc).getTime();
                 return age <= maxAgeMs;
              }
            } catch(e) {}
            return false;
          });
          if (keep.length !== lines.length) {
            fs.writeFileSync(fp, keep.join('\n') + '\n');
          }
        } catch(e) {}
      }
    }
  }
}

export function writeHistory(sourceKey: string, data: any) {
    if (!isHistoricalSnapshotAllowed()) {
        return;
    }
    const siteKey = getSiteCacheKey();
    const activeMeta = getActiveSiteMetadata();
    const p = path.join(HISTORY_ROOT, "sites", siteKey);
    if (!fs.existsSync(p)) {
        try { fs.mkdirSync(p, { recursive: true }); } catch (e) {}
    }
    const record = {
        timestampUtc: new Date().toISOString(),
        siteCacheKey: siteKey,
        stationCode: activeMeta.stationCode,
        emsBaseUrl: activeMeta.emsBaseUrl,
        data
    };
    try {
        fs.appendFileSync(path.join(p, `${sourceKey}.jsonl`), JSON.stringify(record) + "\n");
        // Limit history size to maxHistoryBytes +/- one batch
        runStorageCleanup();
    } catch(e) {}
}

export function writeTelemetryHistoryIfEnabled(sourceKey: string, data: any) {
   if (!isHistoricalSnapshotAllowed()) return;
   
   const settings = getHistoricalCacheSettings();
   if (!settings.historicalSnapshotLoggingEnabled) return;
   
   writeHistory(sourceKey, data);
   pruneHistoricalCache(settings.retentionPolicy);
}
