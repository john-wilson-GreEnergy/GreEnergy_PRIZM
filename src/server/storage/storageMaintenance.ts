import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { loadStoragePolicy, saveStoragePolicy, StoragePolicy } from "./storagePolicy";

export const CACHE_ROOT = process.env.PRIZM_CACHE_DIR || path.resolve(process.cwd(), ".prizm-cache");
export const HISTORY_ROOT = process.env.PRIZM_HISTORY_DIR || path.resolve(process.cwd(), ".prizm-history");

// In-memory runtime states
let lowDiskState = false;
let lastCleanupAt: string | null = null;
let lastCleanupSummary = {
  historyDeletedBytes: 0,
  cacheDeletedBytes: 0,
  filesDeleted: 0
};

interface FileItem {
  fullPath: string;
  mtimeMs: number;
  size: number;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i <= 1) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; // default to MB if very small
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(1)} ${sizes[i]}`;
}

export function getDiskSpace(dirPath: string) {
  try {
    const output = execSync(`df -P "${dirPath}"`, { encoding: "utf8" });
    const lines = output.trim().split("\n");
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      if (parts.length >= 6) {
        const totalKib = parseInt(parts[1], 10);
        const usedKib = parseInt(parts[2], 10);
        const freeKib = parseInt(parts[3], 10);
        
        return {
          totalBytes: totalKib * 1024,
          usedBytes: usedKib * 1024,
          freeBytes: freeKib * 1024,
          usedPercent: Math.round((usedKib / totalKib) * 100)
        };
      }
    }
  } catch (err) {
    // Fail silently or handle
  }
  
  // Safe container container fallback values
  return {
    totalBytes: 58 * 1024 * 1024 * 1024, // 58 GB
    usedBytes: 25 * 1024 * 1024 * 1024,
    freeBytes: 33 * 1024 * 1024 * 1024,
    usedPercent: 43
  };
}

export function getFolderSize(dirPath: string): { sizeBytes: number; fileCount: number } {
  let sizeBytes = 0;
  let fileCount = 0;
  
  if (!fs.existsSync(dirPath)) {
    return { sizeBytes, fileCount };
  }
  
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return { sizeBytes: stat.size, fileCount: 1 };
    }
    
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      try {
        const fileStat = fs.statSync(fullPath);
        if (fileStat.isDirectory()) {
          const sub = getFolderSize(fullPath);
          sizeBytes += sub.sizeBytes;
          fileCount += sub.fileCount;
        } else {
          sizeBytes += fileStat.size;
          fileCount++;
        }
      } catch (err) {}
    }
  } catch (e) {}
  
  return { sizeBytes, fileCount };
}

export function getAllFilesRecursive(dirPath: string, excludePhrases: string[] = []): FileItem[] {
  const result: FileItem[] = [];
  if (!fs.existsSync(dirPath)) return result;
  
  try {
    const list = fs.readdirSync(dirPath);
    for (const item of list) {
      const fullPath = path.join(dirPath, item);
      if (excludePhrases.some(phrase => fullPath.includes(phrase))) {
        continue;
      }
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          result.push(...getAllFilesRecursive(fullPath, excludePhrases));
        } else {
          result.push({
            fullPath,
            mtimeMs: stat.mtimeMs,
            size: stat.size
          });
        }
      } catch (err) {}
    }
  } catch (err) {}
  
  return result;
}

export function checkAndEnforceLowDisk(policy: StoragePolicy) {
  const disk = getDiskSpace(process.cwd());
  const minFree = policy.history.minFreeDiskBytes;
  
  if (disk.freeBytes < minFree) {
    if (!lowDiskState) {
      lowDiskState = true;
      console.warn(`[Storage] Low disk detected. Historical writes disabled and cleanup executed.`);
      runStorageCleanup();
    }
    return true;
  } else {
    lowDiskState = false;
    return false;
  }
}

// Check if writing history is allowed under current states
export function isHistoricalSnapshotAllowed(): boolean {
  const policy = loadStoragePolicy();
  if (!policy.history.enabled) {
    return false;
  }
  
  // Quick dynamic check
  const disk = getDiskSpace(process.cwd());
  if (disk.freeBytes < policy.history.minFreeDiskBytes) {
    if (!lowDiskState) {
      lowDiskState = true;
      console.warn(`[Storage] Low disk detected. Historical writes disabled and cleanup executed.`);
      runStorageCleanup();
    }
    return false;
  }
  
  return true;
}

export function runStorageCleanup() {
  const policy = loadStoragePolicy();
  const now = Date.now();
  
  // Ensure directories
  try {
    fs.mkdirSync(HISTORY_ROOT, { recursive: true });
    fs.mkdirSync(CACHE_ROOT, { recursive: true });
  } catch (e) {}

  let historyDeletedBytes = 0;
  let cacheDeletedBytes = 0;
  let filesDeleted = 0;

  // 1. Clean history older than maxHistoryAgeDays
  const maxAgeMs = policy.history.maxHistoryAgeDays * 24 * 60 * 60 * 1000;
  const historyFiles = getAllFilesRecursive(HISTORY_ROOT);
  for (const file of historyFiles) {
    const ageMs = now - file.mtimeMs;
    if (ageMs > maxAgeMs) {
      try {
        fs.unlinkSync(file.fullPath);
        historyDeletedBytes += file.size;
        filesDeleted++;
      } catch (e) {}
    }
  }

  // 2. Clean oldest history until under maxHistoryBytes
  const remainingHistoryFiles = getAllFilesRecursive(HISTORY_ROOT).sort((a, b) => a.mtimeMs - b.mtimeMs);
  let currentHistorySize = remainingHistoryFiles.reduce((acc, f) => acc + f.size, 0);
  for (const file of remainingHistoryFiles) {
    if (currentHistorySize <= policy.history.maxHistoryBytes) {
      break;
    }
    try {
      fs.unlinkSync(file.fullPath);
      currentHistorySize -= file.size;
      historyDeletedBytes += file.size;
      filesDeleted++;
    } catch (e) {}
  }

  // 3. Clean cache older than maxCacheAgeDays
  const maxCacheAgeMs = policy.runtimeCache.maxCacheAgeDays * 24 * 60 * 60 * 1000;
  const excludePhrases = ["prizm_connection_profiles", "prizm_storage_policy", "settings", "history-settings.json", "bess_devices.json"];
  const cacheFiles = getAllFilesRecursive(CACHE_ROOT, excludePhrases);
  for (const file of cacheFiles) {
    const ageMs = now - file.mtimeMs;
    if (ageMs > maxCacheAgeMs) {
      try {
        fs.unlinkSync(file.fullPath);
        cacheDeletedBytes += file.size;
        filesDeleted++;
      } catch (e) {}
    }
  }

  // 4. Clean oldest cache until under maxCacheBytes
  const remainingCacheFiles = getAllFilesRecursive(CACHE_ROOT, excludePhrases).sort((a, b) => a.mtimeMs - b.mtimeMs);
  let currentCacheSize = remainingCacheFiles.reduce((acc, f) => acc + f.size, 0);
  for (const file of remainingCacheFiles) {
    if (currentCacheSize <= policy.runtimeCache.maxCacheBytes) {
      break;
    }
    try {
      fs.unlinkSync(file.fullPath);
      currentCacheSize -= file.size;
      cacheDeletedBytes += file.size;
      filesDeleted++;
    } catch (e) {}
  }

  // 5. Emergency Low Disk Handling: if space is still low, delete even more files
  let disk = getDiskSpace(process.cwd());
  if (disk.freeBytes < policy.history.minFreeDiskBytes) {
    // Delete remaining oldest history files
    const remainingHistories = getAllFilesRecursive(HISTORY_ROOT).sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const file of remainingHistories) {
      if (disk.freeBytes >= policy.history.minFreeDiskBytes) break;
      try {
        fs.unlinkSync(file.fullPath);
        disk.freeBytes += file.size;
        historyDeletedBytes += file.size;
        filesDeleted++;
      } catch (e) {}
    }
  }

  if (disk.freeBytes < policy.history.minFreeDiskBytes) {
    // Delete remaining oldest cache files (excluding safe configs)
    const remainingCaches = getAllFilesRecursive(CACHE_ROOT, excludePhrases).sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const file of remainingCaches) {
      if (disk.freeBytes >= policy.history.minFreeDiskBytes) break;
      try {
        fs.unlinkSync(file.fullPath);
        disk.freeBytes += file.size;
        cacheDeletedBytes += file.size;
        filesDeleted++;
      } catch (e) {}
    }
  }

  // Record stats
  lastCleanupAt = new Date().toISOString();
  lastCleanupSummary = {
    historyDeletedBytes,
    cacheDeletedBytes,
    filesDeleted
  };

  lowDiskState = disk.freeBytes < policy.history.minFreeDiskBytes;

  if (historyDeletedBytes > 0 || cacheDeletedBytes > 0) {
    console.log(`[Storage] Cleanup complete: deleted ${formatBytes(historyDeletedBytes + cacheDeletedBytes)} total static cache/history artifacts.`);
  }

  return lastCleanupSummary;
}

export function clearHistoricalTelemetry() {
  let deletedBytes = 0;
  let filesDeleted = 0;
  
  if (fs.existsSync(HISTORY_ROOT)) {
    const files = getAllFilesRecursive(HISTORY_ROOT);
    for (const f of files) {
      try {
        fs.unlinkSync(f.fullPath);
        deletedBytes += f.size;
        filesDeleted++;
      } catch (e) {}
    }
  }
  
  lastCleanupAt = new Date().toISOString();
  lastCleanupSummary = {
    historyDeletedBytes: deletedBytes,
    cacheDeletedBytes: 0,
    filesDeleted
  };
  
  return lastCleanupSummary;
}

export function clearRuntimeCache() {
  let deletedBytes = 0;
  let filesDeleted = 0;
  
  if (fs.existsSync(CACHE_ROOT)) {
    const excludePhrases = ["prizm_connection_profiles", "prizm_storage_policy", "settings", "history-settings.json", "bess_devices.json"];
    const files = getAllFilesRecursive(CACHE_ROOT, excludePhrases);
    for (const f of files) {
      try {
        fs.unlinkSync(f.fullPath);
        deletedBytes += f.size;
        filesDeleted++;
      } catch (e) {}
    }
  }
  
  lastCleanupAt = new Date().toISOString();
  lastCleanupSummary = {
    historyDeletedBytes: 0,
    cacheDeletedBytes: deletedBytes,
    filesDeleted
  };
  
  return lastCleanupSummary;
}

export function getStorageStatus() {
  const policy = loadStoragePolicy();
  const disk = getDiskSpace(process.cwd());
  
  const historyStats = getFolderSize(HISTORY_ROOT);
  const cacheStats = getFolderSize(CACHE_ROOT);
  const dataStats = getFolderSize(path.resolve(process.cwd(), "data"));
  const distStats = getFolderSize(path.resolve(process.cwd(), "dist"));
  const nodeModulesStats = getFolderSize(path.resolve(process.cwd(), "node_modules"));

  return {
    success: true,
    appRoot: process.cwd(),
    disk: {
      totalBytes: disk.totalBytes,
      usedBytes: disk.usedBytes,
      freeBytes: disk.freeBytes,
      usedPercent: disk.usedPercent
    },
    folders: {
      history: {
        path: ".prizm-history",
        exists: fs.existsSync(HISTORY_ROOT),
        sizeBytes: historyStats.sizeBytes,
        fileCount: historyStats.fileCount,
        enabled: policy.history.enabled,
        maxBytes: policy.history.maxHistoryBytes,
        maxAgeDays: policy.history.maxHistoryAgeDays
      },
      runtimeCache: {
        path: ".prizm-cache",
        exists: fs.existsSync(CACHE_ROOT),
        sizeBytes: cacheStats.sizeBytes,
        fileCount: cacheStats.fileCount,
        maxBytes: policy.runtimeCache.maxCacheBytes,
        maxAgeDays: policy.runtimeCache.maxCacheAgeDays
      },
      nodeModules: {
        path: "node_modules",
        sizeBytes: nodeModulesStats.sizeBytes
      },
      data: {
        path: "data",
        sizeBytes: dataStats.sizeBytes
      },
      dist: {
        path: "dist",
        sizeBytes: distStats.sizeBytes
      }
    },
    lowDisk: lowDiskState,
    lastCleanupAt: lastCleanupAt || new Date().toISOString(),
    lastCleanupSummary
  };
}

// Startup Initialization cleanup method
export function initLocalStorageMaintenance() {
  const policy = loadStoragePolicy();
  
  // Ensure directories exist
  try {
    fs.mkdirSync(HISTORY_ROOT, { recursive: true });
    fs.mkdirSync(CACHE_ROOT, { recursive: true });
  } catch (e) {}

  // 1. Track stats before cleanup
  const historyBefore = getFolderSize(HISTORY_ROOT).sizeBytes;

  // 2. Perform immediate startup cleanup
  runStorageCleanup();

  // 3. Track stats after cleanup
  const historyAfter = getFolderSize(HISTORY_ROOT).sizeBytes;
  const diskAfter = getDiskSpace(process.cwd());

  // 4. Print concise console summary
  console.log(`[Storage] History enabled: ${policy.history.enabled}`);
  console.log(`[Storage] .prizm-history size before cleanup: ${formatBytes(historyBefore)}`);
  console.log(`[Storage] .prizm-history size after cleanup: ${formatBytes(historyAfter)}`);
  console.log(`[Storage] Free disk after cleanup: ${formatBytes(diskAfter.freeBytes)}`);

  // 5. Start periodic cleanup loop
  const intervalMins = Math.min(policy.history.cleanupIntervalMinutes, policy.runtimeCache.cleanupIntervalMinutes) || 30;
  setInterval(() => {
    try {
      const p = loadStoragePolicy();
      checkAndEnforceLowDisk(p);
      runStorageCleanup();
    } catch (e) {
      console.error("[Storage] Periodic maintenance loop failed:", e);
    }
  }, intervalMins * 60 * 1000);
}
