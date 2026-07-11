export class FingerprintError extends Error {
  public readonly code: 'INVALID_INPUT' | 'UNSUPPORTED_VALUE' | 'SERIALIZATION_ERROR';

  constructor(code: 'INVALID_INPUT' | 'UNSUPPORTED_VALUE' | 'SERIALIZATION_ERROR', message: string) {
    super(message);
    this.name = 'FingerprintError';
    this.code = code;
  }
}
