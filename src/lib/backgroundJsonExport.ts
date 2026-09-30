import {formatJsonExport} from "./jsonExportFormat";

type ExportWorker=Pick<Worker,"postMessage"|"terminate"|"onmessage"|"onerror"|"onmessageerror">;
export function backgroundJsonExport(value:unknown,signal:AbortSignal,options:{legacy?:boolean;timeoutMs?:number;createWorker?:()=>ExportWorker}={}):Promise<Blob>{
  if(signal.aborted)return Promise.reject(new DOMException("Export cancelled","AbortError"));
  if(options.legacy)return Promise.resolve(new Blob([formatJsonExport(value)],{type:"application/json"}));
  return new Promise((resolve,reject)=>{
    let worker:ExportWorker|undefined;
    let settled=false;
    const finish=(error?:Error,blob?:Blob)=>{
      if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener("abort",cancel);
      worker?.terminate();if(error)reject(error);else resolve(blob!);
    };
    const cancel=()=>finish(new DOMException("Export cancelled","AbortError"));
    const timer=setTimeout(()=>finish(new Error("Export preparation timed out; try fewer targets")),options.timeoutMs??60_000);
    signal.addEventListener("abort",cancel,{once:true});
    try{
      worker=options.createWorker?options.createWorker():new Worker(new URL("./jsonExport.worker.ts",import.meta.url),{type:"module"});
      worker.onmessage=event=>{
        const reply=event.data as {blob?:Blob;error?:string};
        if(reply.error)finish(new Error(reply.error));
        else if(reply.blob instanceof Blob)finish(undefined,reply.blob);
        else finish(new Error("Export worker returned an invalid file"));
      };
      worker.onerror=()=>finish(new Error("Export worker could not prepare the file"));
      worker.onmessageerror=()=>finish(new Error("Export worker returned unreadable data"));
      worker.postMessage(value);
    }catch(error){finish(error instanceof Error?error:new Error(String(error)));}
  });
}
