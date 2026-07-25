export const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
export const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
export const finite = (value: unknown): number | null => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : value == null ? null : String(value);
export const bool = (value: unknown): boolean => value === true || value === 'true';
export const count = (value: unknown): number => finite(value) ?? 0;
export const serializedBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');
export function deeplyImmutable<T>(value: T): T { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deeplyImmutable(child); return value; }
export function cycle(value: unknown): number | null { const candidate = finite(value); return candidate != null && Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null; }
export const stringCoordinate = (row: Record<string, any>) => ({ arrayIndex: Number(row.arrayIndex ?? row.arrayNumber), stringIndex: Number(row.stringIndex ?? row.stringNumber) });
