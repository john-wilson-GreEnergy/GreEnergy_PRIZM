import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const compress = promisify(gzip);
export interface EncodedJson {
  readonly json: string;
  readonly gzip: Buffer;
  readonly bytes: number;
}
/** One latest revision retained. Pending readers share lossless encoding work. */
export class EncodedJsonCache {
  private current: { source: object; version: number; promise: Promise<EncodedJson> } | null = null;
  constructor(private readonly encode: (json: string) => Promise<Buffer> = json => compress(json, { level: 1 })) {}

  read(source: object, version: number, build: () => unknown): Promise<EncodedJson> {
    if (this.current?.source === source && this.current.version === version) return this.current.promise;
    // Capture synchronously before any await: source and broker version must match.
    const json = JSON.stringify(build());
    if (json === undefined) throw new Error('Cannot encode an undefined telemetry response');
    const entry = { source, version, promise: this.encode(json).then(gzip => ({ json, gzip, bytes: Buffer.byteLength(json) })) };
    entry.promise = entry.promise.catch(error => {
      if (this.current === entry) this.current = null;
      throw error;
    });
    this.current = entry;
    return entry.promise;
  }
}
