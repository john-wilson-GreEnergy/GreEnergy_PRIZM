import fs from 'fs';
import path from 'path';

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
}

export interface SetCacheOptions {
  ttlMs?: number;
  sourceUrl?: string;
  profileId?: string | null;
  emsBaseUrl?: string | null;
}

export interface GetOrFetchOptions extends SetCacheOptions {
  forceRefresh?: boolean;
  persist?: boolean;
}

export interface CacheStatus {
  enabled: boolean;
  cacheDir: string;
  entries: any[];
}

const CACHE_DIR = path.join(process.cwd(), ".prizm-cache", "current");
let memoryCache = new Map<string, PrizmCacheEntry<any>>();

export function get<T>(key: string): PrizmCacheEntry<T> | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  const now = Date.now();
  const fetchedAtMs = new Date(entry.fetchedAt).getTime();
  entry.ageMs = Math.max(0, now - fetchedAtMs);
  entry.isStale = entry.ageMs > entry.ttlMs;
  entry.isLive = !entry.isStale;
  return entry as PrizmCacheEntry<T>;
}

export function set<T>(key: string, data: T, options?: SetCacheOptions): PrizmCacheEntry<T> {
  const now = new Date().toISOString();
  const entry: PrizmCacheEntry<T> = {
    key,
    data,
    sourceUrl: options?.sourceUrl,
    fetchedAt: now,
    updatedAt: now,
    ageMs: 0,
    ttlMs: options?.ttlMs ?? 5000,
    sourceOk: true,
    isLive: true,
    isStale: false,
    profileId: options?.profileId,
    emsBaseUrl: options?.emsBaseUrl,
  };
  memoryCache.set(key, entry);
  return entry;
}

export async function getOrFetch<T>(key: string, fetcher: () => Promise<T>, options?: GetOrFetchOptions): Promise<PrizmCacheEntry<T>> {
  if (!options?.forceRefresh) {
    const existing = get<T>(key);
    if (existing && !existing.isStale) {
      if (options?.profileId && existing.profileId !== options.profileId) {
         // Profile mismatch, continue to fetch
      } else {
         return existing;
      }
    }
  }

  try {
    const data = await fetcher();
    const entry = set<T>(key, data, options);
    if (options?.persist) {
      persistEntry(key);
    }
    return entry;
  } catch (err: any) {
    const existing = get<T>(key);
    if (existing && existing.data) {
      existing.sourceOk = false;
      existing.isLive = false;
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
    };
    return failedEntry;
  }
}

export function clear(key?: string): void {
  if (key) {
    memoryCache.delete(key);
  } else {
    memoryCache.clear();
  }
}

export function getStatus(): CacheStatus {
  const entries = Array.from(memoryCache.values()).map(e => {
     const current = get(e.key);
     return {
       key: e.key,
       fetchedAt: e.fetchedAt,
       ageMs: current?.ageMs || 0,
       ttlMs: e.ttlMs,
       isLive: current?.isLive || false,
       isStale: current?.isStale || false,
       sourceOk: e.sourceOk,
       profileId: e.profileId,
       emsBaseUrl: e.emsBaseUrl
     };
  });
  return {
    enabled: true,
    cacheDir: ".prizm-cache",
    entries
  };
}

export function loadDiskCache(): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    const files = fs.readdirSync(CACHE_DIR);
    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const content = fs.readFileSync(path.join(CACHE_DIR, file), "utf-8");
          const entry = JSON.parse(content) as PrizmCacheEntry;
          memoryCache.set(entry.key, entry);
        } catch(e) {}
      }
    }
  } catch (e: any) {
    console.error("Failed to load disk cache:", e.message);
  }
}

export function persistEntry(key: string): void {
  try {
    const entry = memoryCache.get(key);
    if (!entry) return;
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const safeKey = key.replace(/[^a-z0-9-]/gi, '_');
    fs.writeFileSync(path.join(CACHE_DIR, `${safeKey}.json`), JSON.stringify(entry, null, 2));
  } catch (e: any) {
    console.error(`Failed to persist cache entry ${key}:`, e.message);
  }
}

loadDiskCache();
