import {serialize} from 'node:v8';
import {createHash} from 'node:crypto';
import {serializeTelemetryCache} from './serializeTelemetryCache';

export type SnapshotTransfer = {bytes: Uint8Array; compact: boolean; expectedHash?: string};

/** Internal canonical snapshots only: JSON-derived records/arrays and primitives.
 * V8 transport freezes the graph now and preserves shared references. This is
 * never the persisted format: the worker writes the existing JSON schema.
 * Do not use for arbitrary class instances/custom toJSON implementations.
 */
export function prepareSnapshotTransfer(value: object): SnapshotTransfer {
  const bytes = serialize(value);
  // Small V8 buffers may share an allocation. Transfer only owned backing memory.
  const owned = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes : Uint8Array.from(bytes);
  return {bytes: owned, compact: process.env.PRIZM_COMPACT_TELEMETRY_CACHE !== 'false',
    // Validation-only mode intentionally pays the legacy encoding cost as well.
    expectedHash: process.env.PRIZM_SNAPSHOT_WORKER_VERIFY === 'true'
      ? createHash('sha256').update(serializeTelemetryCache(value)).digest('hex') : undefined};
}
