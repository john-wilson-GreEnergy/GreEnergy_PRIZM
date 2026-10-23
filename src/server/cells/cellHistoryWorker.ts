import {parentPort} from 'node:worker_threads';
import {CellHistory} from './CellHistory';
import type {CellHistorySite} from '../../core/cellHistory';
import type {CellQueryInput} from './CellQueryWorkerClient';

let reader: CellHistory | undefined, identity = '';
// Read-only archive queries. No profiles, telemetry acquisition or credentials.
parentPort!.on('message', async (request: {directory:string; site:CellHistorySite; intervalMs:number; input:CellQueryInput}) => {
  try {
    const key = JSON.stringify([request.directory, request.site, request.intervalMs]);
    if (key !== identity) {
      await reader?.close(); identity = key;
      reader = new CellHistory({directory:request.directory, enabled:true, intervalMs:request.intervalMs,
        currentSite:()=>request.site, cacheQueries:true});
    }
    parentPort!.postMessage({result:await reader!.query(request.input)});
  } catch (error) {parentPort!.postMessage({error:error instanceof Error ? error.message : 'Cell history reader failed'});}
});
