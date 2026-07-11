import { createHash } from 'node:crypto';
import { CanonicalSerializer } from './CanonicalSerializer';
import { FingerprintError } from './FingerprintError';
import type { FingerprintInput, FingerprintOptions, FingerprintResult, FingerprintValue } from './types';

export class FingerprintService {
  public static fingerprint(input: FingerprintInput, options: FingerprintOptions = {}): FingerprintResult {
    const algorithm = options.algorithm ?? 'sha256';
    const encoding = options.encoding ?? 'hex';

    if (algorithm !== 'sha256') {
      throw new FingerprintError('INVALID_INPUT', 'Unsupported algorithm');
    }
    if (encoding !== 'hex') {
      throw new FingerprintError('INVALID_INPUT', 'Unsupported encoding');
    }

    if (typeof input === 'string') {
      return this.hashBytes(Buffer.from(input, 'utf8'), algorithm, encoding, 'string', false);
    }

    if (input instanceof Uint8Array) {
      return this.hashBytes(Buffer.from(input), algorithm, encoding, 'bytes', false);
    }

    if (input instanceof ArrayBuffer) {
      return this.hashBytes(Buffer.from(input), algorithm, encoding, 'bytes', false);
    }

    if (this.isFingerprintValue(input)) {
      const canonical = CanonicalSerializer.serialize(input as FingerprintValue);
      return this.hashBytes(Buffer.from(canonical, 'utf8'), algorithm, encoding, 'json', true);
    }

    throw new FingerprintError('INVALID_INPUT', 'Unsupported input');
  }

  private static hashBytes(bytes: Buffer, algorithm: 'sha256', encoding: 'hex', inputType: 'string' | 'bytes' | 'json', canonicalized: boolean): FingerprintResult {
    const digest = createHash(algorithm).update(bytes).digest(encoding);
    return {
      digest,
      algorithm,
      encoding,
      inputType,
      canonicalized,
    };
  }

  private static isFingerprintValue(value: unknown): value is FingerprintValue {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') {
      return true;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value);
    }

    if (Array.isArray(value)) {
      return value.every((item) => this.isFingerprintValue(item));
    }

    if (typeof value === 'object') {
      if (value instanceof Date || value instanceof Map || value instanceof Set || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        return false;
      }
      if (value === null) {
        return true;
      }
      return Object.values(value as Record<string, unknown>).every((entry) => this.isFingerprintValue(entry));
    }

    return false;
  }
}
