/** Presentation of the canonical /api/local/storage/status response. No I/O. */
export interface StorageStatus {
  disk?: { totalBytes?: number | null; freeBytes?: number | null };
  folders?: Partial<Record<'history' | 'runtimeCache' | 'nodeModules' | 'data' | 'dist', {
    sizeBytes?: number | null;
    exists?: boolean | null;
  }>>;
  lowDisk?: boolean;
  lastCleanupAt?: string | null;
}

export function formatStorageFolder(folder: { exists?: boolean | null; sizeBytes?: number | null } | undefined): string {
  if (folder?.exists === false) return 'Not present';
  if (!folder || folder.exists === null || (folder.sizeBytes === 0 && folder.exists !== true)) return 'Unavailable';
  return formatStorageBytes(folder.sizeBytes);
}

export function formatStorageBytes(bytes: unknown): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return 'Unavailable';
  if (bytes === 0) return '0 MB';
  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(units.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(1024))));
  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
}

export function storageUsedPercent(disk: StorageStatus['disk']): number | null {
  const total = disk?.totalBytes, free = disk?.freeBytes;
  if (typeof total !== 'number' || typeof free !== 'number' || !Number.isFinite(total) ||
      !Number.isFinite(free) || total <= 0 || free < 0 || free > total) return null;
  return Math.min(100, Math.max(0, (total - free) / total * 100));
}
