import assert from "node:assert/strict";
import {backgroundJsonExport} from "./backgroundJsonExport";
import {formatJsonExport} from "./jsonExportFormat";

class FakeWorker {
  onmessage:Worker["onmessage"]=null;
  onerror:Worker["onerror"]=null;
  onmessageerror:Worker["onmessageerror"]=null;
  stopped=false;
  value:unknown;
  postMessage(value:unknown){this.value=structuredClone(value);}
  terminate(){this.stopped=true;}
  complete(){this.onmessage!.call(this as unknown as Worker,{data:{blob:new Blob([formatJsonExport(this.value)],{type:"application/json"})}} as MessageEvent);}
}
const payload={metric:"current",points:[{id:"test",point:{current:0,cell:null,quality:"Unavailable"}}],label:"°F"};
const worker=new FakeWorker(),controller=new AbortController();
const result=backgroundJsonExport(payload,controller.signal,{createWorker:()=>worker});
payload.points[0].point.current=123;
worker.complete();
const text=await (await result).text();assert.equal(JSON.parse(text).points[0].point.current,0,"Captured revision is stable");assert(worker.stopped);
assert.equal(await (await backgroundJsonExport(payload,new AbortController().signal,{legacy:true})).text(),formatJsonExport(payload));
const cancel=new AbortController(),cancelWorker=new FakeWorker();const cancelled=backgroundJsonExport(payload,cancel.signal,{createWorker:()=>cancelWorker});cancel.abort();
await assert.rejects(cancelled,{name:"AbortError"});assert(cancelWorker.stopped);
await assert.rejects(backgroundJsonExport(payload,cancel.signal),{name:"AbortError"});
const timed=new FakeWorker();await assert.rejects(backgroundJsonExport(payload,new AbortController().signal,{createWorker:()=>timed,timeoutMs:1}),/timed out/);assert(timed.stopped);
await assert.rejects(backgroundJsonExport(payload,new AbortController().signal,{createWorker:()=>{throw new Error("CSP rejected");}}),/CSP rejected/);
const broken=new FakeWorker();const failure=backgroundJsonExport(payload,new AbortController().signal,{createWorker:()=>broken});broken.onerror!.call(broken as unknown as Worker,{} as ErrorEvent);await assert.rejects(failure,/could not prepare/);assert(broken.stopped);
console.log("Background export: parity, revision capture, cancellation, timeout and failure passed");
