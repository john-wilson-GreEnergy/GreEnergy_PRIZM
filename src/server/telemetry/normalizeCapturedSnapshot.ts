/** JSON-equivalent values for a V8-captured canonical graph. Unlike a JSON text
 * roundtrip this keeps repeated subgraphs shared INSIDE the private publication.
 * All public runtime reads still JSON-copy their result. This mutates ONLY the
 * worker-owned deserialized capture, never the collector's source graph. Only
 * canonical data types are accepted; unsupported input fails closed.
 */
export function normalizeCapturedSnapshot<T>(input: T): T {
  const copied = new WeakMap<object, any>();
  const active = new WeakSet<object>();
  function visit(value: any): any {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || value === undefined) return value;
    if (typeof value === 'number') return Number.isFinite(value) ? (value === 0 ? 0 : value) : null;
    if (typeof value !== 'object') throw new Error('Unsupported canonical snapshot value');
    if (active.has(value)) throw new Error('Circular canonical snapshot');
    if (copied.has(value)) return copied.get(value);
    if (value instanceof Date) return value.toJSON();
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new Error('Unsupported canonical snapshot object');
    active.add(value);
    const result: any = value;
    copied.set(value, result);
    if (array) {
      for (const key of Object.keys(value)) if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) delete result[key];
      for (let i = 0; i < value.length; i++) result[i] = visit(value[i]) ?? null;
    } else {
      for (const key of Object.keys(value)) {
        const child = visit(value[key]);
        if (child === undefined) delete result[key];
        else {
          if (key === '__proto__') Object.defineProperty(result, key, {value: child, enumerable: true, writable: true, configurable: true});
          else result[key] = child;
        }
      }
    }
    active.delete(value);
    return result;
  }
  return visit(input);
}
