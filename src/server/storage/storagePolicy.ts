import fs from "fs";
import path from "path";

export interface StoragePolicy {
  history: {
    enabled: boolean;
    maxHistoryBytes: number;
    maxHistoryAgeDays: number;
    cleanupIntervalMinutes: number;
    minFreeDiskBytes: number;
  };
  runtimeCache: {
    maxCacheBytes: number;
    maxCacheAgeDays: number;
    cleanupIntervalMinutes: number;
    minFreeDiskBytes: number;
  };
}

export const DEFAULT_HISTORY_RETENTION = {
  enabled: false,
  maxHistoryBytes: 500 * 1024 * 1024, // 500 MB
  maxHistoryAgeDays: 7,
  cleanupIntervalMinutes: 30,
  minFreeDiskBytes: 2 * 1024 * 1024 * 1024, // 2 GB
  deleteOldestFirst: true
};

export const DEFAULT_RUNTIME_CACHE_RETENTION = {
  maxCacheBytes: 750 * 1024 * 1024, // 750 MB
  maxCacheAgeDays: 3,
  cleanupIntervalMinutes: 30,
  minFreeDiskBytes: 2 * 1024 * 1024 * 1024
};

const POLICY_FILE = path.resolve(process.cwd(), "data", "prizm_storage_policy.json");

export function loadStoragePolicy(): StoragePolicy {
  try {
    if (fs.existsSync(POLICY_FILE)) {
      const data = JSON.parse(fs.readFileSync(POLICY_FILE, "utf8"));
      // Validate
      return validateAndSanitizePolicy(data);
    }
  } catch (e) {
    // Read failed or invalid JSON -> recreate
  }
  
  const defaults: StoragePolicy = {
    history: { ...DEFAULT_HISTORY_RETENTION },
    runtimeCache: { ...DEFAULT_RUNTIME_CACHE_RETENTION }
  };
  saveStoragePolicy(defaults);
  return defaults;
}

export function saveStoragePolicy(policy: StoragePolicy): void {
  try {
    fs.mkdirSync(path.dirname(POLICY_FILE), { recursive: true });
    fs.writeFileSync(POLICY_FILE, JSON.stringify(policy, null, 2), "utf8");
  } catch (e) {
    console.error(`[Storage] Failed to save storage policy:`, e);
  }
}

export function validateAndSanitizePolicy(input: any): StoragePolicy {
  const defaults = {
    history: {
      enabled: false,
      maxHistoryBytes: 500 * 1024 * 1024, // 500 MB
      maxHistoryAgeDays: 7,
      cleanupIntervalMinutes: 30,
      minFreeDiskBytes: 2 * 1024 * 1024 * 1024,
    },
    runtimeCache: {
      maxCacheBytes: 750 * 1024 * 1024, // 750 MB
      maxCacheAgeDays: 3,
      cleanupIntervalMinutes: 30,
      minFreeDiskBytes: 2 * 1024 * 1024 * 1024,
    }
  };

  if (!input || typeof input !== "object") {
    return defaults;
  }

  const result: StoragePolicy = {
    history: { ...defaults.history },
    runtimeCache: { ...defaults.runtimeCache }
  };

  if (input.history && typeof input.history === "object") {
    const h = input.history;
    if (typeof h.enabled === "boolean") {
      result.history.enabled = h.enabled;
    }
    
    if (typeof h.maxHistoryBytes === "number" && h.maxHistoryBytes >= 0) {
      const limit = 5 * 1024 * 1024 * 1024; // 5 GB
      if (h.maxHistoryBytes > limit && !input.allowLargeHistory) {
        result.history.maxHistoryBytes = limit;
      } else {
        result.history.maxHistoryBytes = h.maxHistoryBytes;
      }
    }
    
    if (typeof h.maxHistoryAgeDays === "number" && h.maxHistoryAgeDays >= 0) {
      result.history.maxHistoryAgeDays = h.maxHistoryAgeDays;
    }
    
    if (typeof h.cleanupIntervalMinutes === "number" && h.cleanupIntervalMinutes >= 1) {
      result.history.cleanupIntervalMinutes = h.cleanupIntervalMinutes;
    }
    
    if (typeof h.minFreeDiskBytes === "number" && h.minFreeDiskBytes >= 0) {
      result.history.minFreeDiskBytes = h.minFreeDiskBytes;
    }
  }

  if (input.runtimeCache && typeof input.runtimeCache === "object") {
    const c = input.runtimeCache;
    if (typeof c.maxCacheBytes === "number" && c.maxCacheBytes >= 0) {
      const limit = 5 * 1024 * 1024 * 1024; // 5 GB
      if (c.maxCacheBytes > limit && !input.allowLargeHistory) {
        result.runtimeCache.maxCacheBytes = limit;
      } else {
        result.runtimeCache.maxCacheBytes = c.maxCacheBytes;
      }
    }
    
    if (typeof c.maxCacheAgeDays === "number" && c.maxCacheAgeDays >= 0) {
      result.runtimeCache.maxCacheAgeDays = c.maxCacheAgeDays;
    }
    
    if (typeof c.cleanupIntervalMinutes === "number" && c.cleanupIntervalMinutes >= 1) {
      result.runtimeCache.cleanupIntervalMinutes = c.cleanupIntervalMinutes;
    }
    
    if (typeof c.minFreeDiskBytes === "number" && c.minFreeDiskBytes >= 0) {
      result.runtimeCache.minFreeDiskBytes = c.minFreeDiskBytes;
    }
  }

  return result;
}
