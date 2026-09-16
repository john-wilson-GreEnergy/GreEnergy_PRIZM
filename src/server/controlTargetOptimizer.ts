export type StringControlTarget = {
  array: number;
  string?: number;
  allStrings?: boolean;
  [key: string]: any;
};

/** Convert complete per-string selections to one native array target. */
export function compactFullArrayStringTargets<T extends StringControlTarget>(targets: T[], stringsPerArray: number): StringControlTarget[] {
  const expected = Number(stringsPerArray);
  if (!Array.isArray(targets) || !Number.isInteger(expected) || expected < 1) return targets || [];
  const grouped = new Map<number, T[]>();
  for (const target of targets) {
    const array = Number(target?.array);
    if (!Number.isInteger(array) || array < 1) continue;
    const rows = grouped.get(array) || [];
    rows.push(target);
    grouped.set(array, rows);
  }
  const optimized: StringControlTarget[] = [];
  for (const [array, rows] of grouped) {
    if (rows.some((row) => row.allStrings === true)) {
      optimized.push({ array, allStrings: true });
      continue;
    }
    const selected = new Set(rows.map((row) => Number(row.string)).filter((value) => Number.isInteger(value) && value >= 1 && value <= expected));
    const complete = selected.size === expected && Array.from({ length: expected }, (_, index) => index + 1).every((value) => selected.has(value));
    if (complete) optimized.push({ array, allStrings: true });
    else for (const string of [...selected].sort((left, right) => left - right)) optimized.push({ array, string });
  }
  return optimized;
}
