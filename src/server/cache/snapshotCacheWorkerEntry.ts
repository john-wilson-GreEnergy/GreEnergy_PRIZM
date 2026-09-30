import {parentPort} from 'node:worker_threads';
import {deserialize} from 'node:v8';
import {createHash} from 'node:crypto';
import {writeAtomicCache} from './AsyncCacheWriter';
import {serializeTelemetryCache} from './serializeTelemetryCache';
import type {SnapshotTransfer} from './snapshotTransfer';

// No telemetry client, controller command, route, or network dependency.
parentPort!.on('message', async (job: SnapshotTransfer & {id: number; file: string}) => {
  try {
    const start = performance.now();
    const json = serializeTelemetryCache(deserialize(job.bytes), job.compact ? 'true' : 'false');
    if (job.expectedHash && createHash('sha256').update(json).digest('hex') !== job.expectedHash) {
      throw new Error('Snapshot worker JSON parity failed; previous disk cache retained');
    }
    const encodeMs = performance.now() - start;
    await writeAtomicCache(job.file, json);
    parentPort!.postMessage({id: job.id, ok: true, encodeMs});
  } catch (error) {
    parentPort!.postMessage({id: job.id, ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});
