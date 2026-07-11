import { FingerprintError } from './FingerprintError';
import type { FingerprintValue } from './types';

export class CanonicalSerializer {
  public static serialize(value: FingerprintValue): string {
    return this.serializeValue(value, new Set<string>());
  }

  private static serializeValue(value: FingerprintValue, seen: Set<string>): string {
    if (value === null) {
      return 'null';
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new FingerprintError('UNSUPPORTED_VALUE', 'Only finite numbers are supported');
      }
      return JSON.stringify(value);
    }

    if (typeof value === 'string') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      const parts = value.map((item) => this.serializeValue(item, seen));
      return `[${parts.join(',')}]`;
    }

    if (typeof value === 'object') {
      if (value instanceof Date) {
        throw new FingerprintError('UNSUPPORTED_VALUE', 'Date values are not supported');
      }
      if (value instanceof Map || value instanceof Set) {
        throw new FingerprintError('UNSUPPORTED_VALUE', 'Map and Set values are not supported');
      }
      if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
        throw new FingerprintError('UNSUPPORTED_VALUE', 'Byte values must be passed as bytes, not object values');
      }

      const objectKey = this.getObjectKey(value);
      if (seen.has(objectKey)) {
        throw new FingerprintError('SERIALIZATION_ERROR', 'Circular references are not supported');
      }
      seen.add(objectKey);

      const entries = Object.entries(value as Record<string, FingerprintValue>).sort(([left], [right]) => left.localeCompare(right));
      const parts = entries.map(([key, child]) => `${JSON.stringify(key)}:${this.serializeValue(child, seen)}`);
      seen.delete(objectKey);
      return `{${parts.join(',')}}`;
    }

    throw new FingerprintError('UNSUPPORTED_VALUE', 'Unsupported value type');
  }

  private static getObjectKey(value: object): string {
    if (typeof (value as { [Symbol.toStringTag]?: string })[Symbol.toStringTag] === 'string') {
      return `${value.constructor?.name ?? 'Object'}:${Object.prototype.toString.call(value)}`;
    }
    return `${value.constructor?.name ?? 'Object'}:${Object.prototype.toString.call(value)}`;
  }
}
