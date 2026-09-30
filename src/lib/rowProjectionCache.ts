/** Bounded to the latest list. Inputs must be immutable publication objects. */
export class RowProjectionCache<T> {
  private rows = new Map<string, {inputs: readonly unknown[]; value: T}>();
  project(entries: {key: string; inputs: readonly unknown[]; build: () => T}[]): T[] {
    const next = new Map<string, {inputs: readonly unknown[]; value: T}>();
    const result = entries.map(entry => {
      const old = this.rows.get(entry.key);
      const same = old && old.inputs.length === entry.inputs.length &&
        old.inputs.every((input, i) => Object.is(input, entry.inputs[i]));
      const cached = same ? old : {inputs: entry.inputs, value: entry.build()};
      next.set(entry.key, cached);
      return cached.value;
    });
    this.rows = next;
    return result;
  }
}
