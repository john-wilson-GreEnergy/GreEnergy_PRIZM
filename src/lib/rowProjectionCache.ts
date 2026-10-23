/** JSON publication equality, independent of object insertion order. All
 * fields, including source times, nulls, faults and freshness, participate. */
export function samePublication(left: unknown, right: unknown): boolean {
  if (Object.is(left,right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left)!==Array.isArray(right)) return false;
  const a=left as Record<string,unknown>,b=right as Record<string,unknown>;
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length && keys.every(key=>Object.prototype.hasOwnProperty.call(b,key) && samePublication(a[key],b[key]));
}
/** Bounded to the latest list. Inputs must be immutable publication objects. */
export class RowProjectionCache<T> {
  private rows = new Map<string, {inputs: readonly unknown[]; value: T}>();
  constructor(private readonly equal?: (left: T, right: T) => boolean) {}
  project(entries: {key: string; inputs: readonly unknown[]; build: () => T}[]): T[] {
    const next = new Map<string, {inputs: readonly unknown[]; value: T}>();
    const result = entries.map(entry => {
      const old = this.rows.get(entry.key);
      const same = old && old.inputs.length === entry.inputs.length &&
        old.inputs.every((input, i) => Object.is(input, entry.inputs[i]));
      const built = same ? old.value : entry.build();
      const value = !same && old && this.equal?.(old.value, built) ? old.value : built;
      const cached = same ? old : {inputs: entry.inputs, value};
      next.set(entry.key, cached);
      return cached.value;
    });
    this.rows = next;
    return result;
  }
}
