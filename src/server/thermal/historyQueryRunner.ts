import {Worker} from "node:worker_threads";
import path from "node:path";
import {projectHistoryQuery, type HistoryQueryInput, type HistoryQueryResult} from "./historyQueryProjection";

type Reply = {result:HistoryQueryResult; error?:never} | {error:string; result?:never};

// Two readers at most, no unbounded queue. Each job owns a worker so cancellation
// stops disk reads and parsing immediately, without affecting the recorder.
export class HistoryQueryRunner {
  private active=new Map<Worker,()=>void>();
  private closed=false;
  constructor(private file=path.resolve("dist/history-query-worker.cjs"),private timeoutMs=120_000){}

  async run(input:HistoryQueryInput,signal?:AbortSignal):Promise<HistoryQueryResult>{
    if(this.closed)throw new Error("History reader is closed");
    if(signal?.aborted)throw new Error("History request cancelled");
    if(process.env.PRIZM_HISTORY_WORKERS==="false")return projectHistoryQuery(input,()=>{
      if(this.closed||signal?.aborted)throw new Error("History request cancelled");
    });
    if(this.active.size>=2)throw new Error("History reader busy; retry when the current query finishes");
    const worker=new Worker(this.file,{workerData:input,execArgv:[],resourceLimits:{maxOldGenerationSizeMb:128}});
    let cancel=()=>{};
    try{return await new Promise<HistoryQueryResult>((resolve,reject)=>{
      let settled=false;
      const finish=(error?:Error,result?:HistoryQueryResult)=>{
        if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener("abort",cancel);
        if(error)reject(error);else resolve(result!);
      };
      cancel=()=>finish(new Error("History request cancelled"));
      const timer=setTimeout(()=>finish(new Error("History query exceeded two minutes; choose fewer targets or a shorter range")),this.timeoutMs);
      this.active.set(worker,cancel);
      signal?.addEventListener("abort",cancel,{once:true});
      worker.once("message",(reply:Reply)=>reply.error?finish(new Error(reply.error)):finish(undefined,reply.result));
      worker.once("error",error=>finish(new Error(`History worker failed: ${error.message}. Rebuild PRIZM or use PRIZM_HISTORY_WORKERS=false for rollback.`)));
      worker.once("exit",code=>finish(new Error(`History worker exited before returning a result (${code})`)));
      if(signal?.aborted)cancel();
    });}finally{
      await worker.terminate();this.active.delete(worker);
    }
  }

  async close(){
    this.closed=true;
    await Promise.all([...this.active].map(async([worker,cancel])=>{cancel();await worker.terminate();}));
  }
}
