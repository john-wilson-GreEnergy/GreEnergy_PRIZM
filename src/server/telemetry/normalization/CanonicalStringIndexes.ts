export interface CanonicalStringIndexes<T = any> {
  byStringKey: ReadonlyMap<string, T>;
  byArrayIndex: ReadonlyMap<number, readonly T[]>;
  byArrayAndString: ReadonlyMap<string, T>;
  byEnergySegment: ReadonlyMap<string, readonly T[]>;
  byIpAddress: ReadonlyMap<string, T>;
}

const indexesByResult = new WeakMap<object, CanonicalStringIndexes>();

export function buildCanonicalStringIndexes<T extends Record<string, any>>(strings: readonly T[]): CanonicalStringIndexes<T> {
  const byStringKey = new Map<string, T>();
  const byArrayIndex = new Map<number, T[]>();
  const byArrayAndString = new Map<string, T>();
  const byEnergySegment = new Map<string, T[]>();
  const byIpAddress = new Map<string, T>();
  for (const row of strings) {
    const arrayIndex = Number(row.arrayIndex ?? row.arrayNumber);
    const stringIndex = Number(row.stringIndex ?? row.stringNumber);
    const stringKey = String(row.stringKey ?? `A${arrayIndex}-S${stringIndex}`);
    const energySegment = Number(row.energySegmentNumber ?? row.containerNumber);
    const ip = row.stringControllerIp == null ? "" : String(row.stringControllerIp);
    byStringKey.set(stringKey, row);
    if (Number.isFinite(arrayIndex)) {
      const arrayRows = byArrayIndex.get(arrayIndex) ?? [];
      arrayRows.push(row);
      byArrayIndex.set(arrayIndex, arrayRows);
    }
    if (Number.isFinite(arrayIndex) && Number.isFinite(stringIndex)) byArrayAndString.set(`${arrayIndex}:${stringIndex}`, row);
    if (Number.isFinite(arrayIndex) && Number.isFinite(energySegment)) {
      const key = `${arrayIndex}:${energySegment}`;
      const segmentRows = byEnergySegment.get(key) ?? [];
      segmentRows.push(row);
      byEnergySegment.set(key, segmentRows);
    }
    if (ip) byIpAddress.set(ip, row);
  }
  for (const rows of byArrayIndex.values()) Object.freeze(rows);
  for (const rows of byEnergySegment.values()) Object.freeze(rows);
  return Object.freeze({ byStringKey, byArrayIndex, byArrayAndString, byEnergySegment, byIpAddress });
}

export function registerCanonicalStringIndexes(result: object, indexes: CanonicalStringIndexes): void { indexesByResult.set(result, indexes); }
export function getCanonicalStringIndexes(result: object): CanonicalStringIndexes | null { return indexesByResult.get(result) ?? null; }
