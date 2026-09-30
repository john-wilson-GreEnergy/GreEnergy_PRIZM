import {build} from "esbuild";
import path from "node:path";
const outdir=process.argv[2]||"dist";
await build({entryPoints:["src/server/thermal/historyQueryWorker.ts"],bundle:true,platform:"node",format:"cjs",packages:"external",sourcemap:true,outfile:path.join(outdir,"history-query-worker.cjs")});
await build({entryPoints:["src/server/cache/snapshotCacheWorkerEntry.ts"],bundle:true,platform:"node",format:"cjs",packages:"external",sourcemap:true,outfile:path.join(outdir,"snapshot-cache-worker.cjs")});
