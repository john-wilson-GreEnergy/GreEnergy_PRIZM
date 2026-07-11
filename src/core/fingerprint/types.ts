export type FingerprintAlgorithm = 'sha256';
export type FingerprintEncoding = 'hex';

export type FingerprintValue = null | boolean | number | string | readonly FingerprintValue[] | Readonly<Record<string, FingerprintValue>>;
export type FingerprintInput = string | Uint8Array | ArrayBuffer | FingerprintValue;

export interface FingerprintOptions {
  readonly algorithm?: FingerprintAlgorithm;
  readonly encoding?: FingerprintEncoding;
}

export interface FingerprintResult {
  readonly digest: string;
  readonly algorithm: FingerprintAlgorithm;
  readonly encoding: FingerprintEncoding;
  readonly inputType: 'string' | 'bytes' | 'json';
  readonly canonicalized: boolean;
}
