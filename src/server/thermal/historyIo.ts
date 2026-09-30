import {createReadStream} from "node:fs";
import * as fs from "node:fs/promises";
import {createInterface} from "node:readline";
import type {SiteSample} from "./siteHistory";

export async function* readSiteSamples(file:string):AsyncGenerator<SiteSample>{
  const stat=await fs.lstat(file).catch(e=>{if(e.code==="ENOENT")return null;throw e;});
  if(!stat||!stat.isFile()||stat.isSymbolicLink())return;
  const input=createReadStream(file,{encoding:"utf8"});const lines=createInterface({input,crlfDelay:Infinity});
  try{for await(const line of lines){if(!line)continue;try{const sample=JSON.parse(line) as SiteSample;if(typeof sample.id==="string"&&Number.isFinite(sample.point?.at))yield sample;}catch{/* A torn final line is never a measurement. */}}}
  finally{lines.close();input.destroy();}
}

// Drain started work before rejecting, so callers can safely release locks/save state.
export async function boundedHistoryWork<T>(items:readonly T[],limit:number,work:(item:T)=>Promise<void>){
  let next=0,failed=false,error:unknown;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(!failed&&next<items.length){
      const item=items[next++];
      try{await work(item);}catch(e){failed=true;error=e;}
    }
  }));
  if(failed)throw error;
}

// Chunked reads avoid an async iterator/promise for every individual observation.
// Consumers run synchronously; yield regularly so telemetry and cancellation remain responsive.
export async function visitHistoryLines(file:string,consume:(value:unknown)=>void,check=()=>{}){
  const stat=await fs.lstat(file).catch(e=>{if(e.code==="ENOENT")return null;throw e;});
  if(!stat||!stat.isFile()||stat.isSymbolicLink())return;
  const input=createReadStream(file,{encoding:"utf8"});
  let pending="",count=0;
  const visit=(line:string)=>{
    if(!line)return;
    let value:unknown;
    try{value=JSON.parse(line);}catch{return;} // Interrupted tails are not observations.
    consume(value); // Do not swallow consumer errors or cancellation.
  };
  try{
    for await(const chunk of input){
      check();pending+=chunk;let start=0,end:number;
      while((end=pending.indexOf("\n",start))!==-1){
        visit(pending.slice(start,end));start=end+1;
        if(++count%256===0){await new Promise<void>(resolve=>setImmediate(resolve));check();}
      }
      pending=pending.slice(start);
    }
    check();visit(pending);
  }finally{input.destroy();}
}
