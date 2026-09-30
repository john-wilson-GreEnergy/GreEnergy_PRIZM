import {parentPort,workerData} from "node:worker_threads";
import {projectHistoryQuery, type HistoryQueryInput} from "./historyQueryProjection";

// This entry has no telemetry clients, recorder, device commands, or network IO.
void projectHistoryQuery(workerData as HistoryQueryInput).then(
  result=>parentPort!.postMessage({result}),
  error=>parentPort!.postMessage({error:String(error)}),
);
