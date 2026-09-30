import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {once} from "node:events";
import http from "node:http";
import express from "express";
import {RuntimeShutdown, isRuntimeStopping} from "./runtimeShutdown";
import {SiteHistory} from "./thermal/siteHistory";
import {ThermalService} from "./thermal/thermalService";
import {thermalUnits} from "./thermal/thermalModel";
import {OperationalTimeline} from "./history/operationalTimeline";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const site = {id:"shutdown-test",label:"Shutdown test"};
const devices = (at: number) => [{ip:"10.0.1.10",arrayIndex:1,segmentLabel:"ES1",lastSuccessUtc:new Date(at).toISOString(),spaceTemperatureC:30,hvac1:{currentA:2,compressorOn:true},hvac2:{currentA:0,compressorOn:false}}];

if (process.argv[2] === "child") {
  const root = process.argv[3], mode = process.argv[4];
  const at = Date.now();
  const history = new SiteHistory(path.join(root,"history"),0,Date.now,false);
  const thermal = new ThermalService(path.join(root,"sessions"),0);
  const timeline = new OperationalTimeline(path.join(root,"timeline"),{maxBytes:1_000_000,reserveBytes:0});
  await history.status();
  history.ingest(thermalUnits(devices(at),at),site);
  await history.configure({enabled:true,retentionDays:7,maxGiB:1});
  thermal.ingest(devices(at),at,site);
  await thermal.flush();
  if (!(await thermal.view()).sessions.length) await thermal.start([thermalUnits(devices(at),at)[0].id],1);
  // These observations remain queued when shutdown begins.
  history.ingest(thermalUnits(devices(at+1),at+1),site);
  thermal.ingest(devices(at+1),at+1,site);
  timeline.ingest({site,observations:[{array:1,entity:"1:1",label:"PCS 1",stream:"electrical",source:"fixture",sourceAt:at,observedAt:at,quality:"live",values:{kw:5}}]});
  // The rollback case tests recovery of an established writer, not termination
  // halfway through lock creation (which correctly fails closed on restart).
  // Normal shutdown cases deliberately retain their queued observations.
  if (process.env.PRIZM_GRACEFUL_SHUTDOWN === "false") {
    await timeline.flush();
    assert.equal(timeline.status().error, null);
  }
  let closeCount = 0;
  const lifecycle = new RuntimeShutdown({
    stop: () => {
      assert(isRuntimeStopping());
      if (mode === "stop-error") throw new Error("fixture stop error");
    },
    drain: async () => { if (mode === "drain-timeout") await new Promise(()=>{}); else await delay(120); },
    close: async () => {
      closeCount++;
      if (mode === "deadline") await new Promise(()=>{});
      await Promise.all([history.close(),history.close(),thermal.close(),thermal.close(),timeline.close(),timeline.close()]);
      const before = (await history.status()).usedBytes;
      history.ingest(thermalUnits(devices(at+5000),at+5000),site);
      thermal.ingest(devices(at+5000),at+5000,site);
      timeline.ingest({site,observations:[]});
      await Promise.all([history.flush(),thermal.flush(),timeline.flush()]);
      assert.equal((await history.status()).usedBytes,before);
      await assert.rejects(history.configure({enabled:true,retentionDays:7,maxGiB:1}),/shutting down/);
      await assert.rejects(thermal.start([thermalUnits(devices(at),at)[0].id],1),/shutting down/);
      if (mode === "close-error") throw new Error("fixture close error");
      console.log(`CLOSED:${closeCount}`);
    },
  },console.log,mode === "drain-timeout" ? 100 : 1500);
  const app = express();
  app.use(lifecycle.middleware);
  app.get("/events",(_req,res)=>{res.setHeader("Content-Type","text/event-stream");res.write("data: ready\n\n");});
  app.get("/slow",async(_req,res)=>{console.log("REQUEST_STARTED");await delay(200);res.json({finished:true});});
  const server = app.listen(0,"127.0.0.1");
  await once(server,"listening");
  lifecycle.install(server,mode === "deadline" ? 300 : 3000);
  // A second in-process request sees 503 once shutdown starts.
  process.on("SIGTERM",()=>{
    if (!isRuntimeStopping()) return;
    const response = {setHeader(){},status(code:number){assert.equal(code,503);return this;},json(){console.log("GATE_OK");}};
    lifecycle.middleware({} as never,response as never,()=>assert.fail("Request admitted during shutdown"));
  });
  console.log(`READY:${(server.address() as {port:number}).port}`);
} else {
  const root = await fs.mkdtemp("/tmp/prizm-shutdown-test-");
  const start = async (directory:string,mode="normal",rollback=false) => {
    const child=spawn(process.execPath,["--import","tsx",fileURLToPath(import.meta.url),"child",directory,mode],{
      env:{...process.env,PRIZM_GRACEFUL_SHUTDOWN:rollback?"false":"true"},stdio:["ignore","pipe","pipe"],
    });
    let output="";
    child.stdout.on("data",chunk=>{output+=chunk.toString();});child.stderr.on("data",chunk=>{output+=chunk.toString();});
    const exit=once(child,"exit");
    const deadline=setTimeout(()=>child.kill("SIGKILL"),10000);
    void exit.then(()=>clearTimeout(deadline));
    for(let i=0;i<300&&!output.includes("READY:")&&child.exitCode===null;i++)await delay(20);
    assert.match(output,/READY:\d+/,output);
    return {child,exit,port:Number(/READY:(\d+)/.exec(output)![1]),output:()=>output};
  };
  const locks = async (directory:string,expected:boolean) => {
    for(const file of ["history/writer-lock.json","timeline/writer.json"]){
      const exists=await fs.stat(path.join(directory,file)).then(()=>true,()=>false);
      assert.equal(exists,expected,`${file} lock`);
    }
  };
  const normal=path.join(root,"normal");
  for(const signal of ["SIGTERM","SIGINT"] as const){
    const run=await start(normal);
    const events=http.get(`http://127.0.0.1:${run.port}/events`);
    const [response]=await once(events,"response");response.resume();
    const pending=fetch(`http://127.0.0.1:${run.port}/slow`).then(r=>r.json());
    while(!run.output().includes("REQUEST_STARTED"))await delay(5);
    run.child.kill(signal);await delay(20);run.child.kill(signal);
    assert.deepEqual(await pending,{finished:true});
    assert.deepEqual(await run.exit,[0,null],run.output());
    assert.match(run.output(),/CLOSED:1/);assert.match(run.output(),/shutdown complete/);
    if(signal==="SIGTERM")assert.match(run.output(),/GATE_OK/);
    await locks(normal,false);
  }
  const persisted=await fs.readdir(path.join(normal,"history"));
  const lines=(await Promise.all(persisted.filter(n=>n.endsWith(".jsonl")).map(n=>fs.readFile(path.join(normal,"history",n),"utf8")))).join("").trim().split("\n");
  assert(lines.length>=4,"Queued thermal observations survived both restarts");
  lines.forEach(line=>JSON.parse(line));
  const sessions=await fs.readdir(path.join(normal,"sessions"));
  assert(sessions.some(n=>n.endsWith(".jsonl")),"Targeted recording flushed too");
  for(const mode of ["stop-error","drain-timeout","close-error","deadline"]){
    const directory=path.join(root,mode),run=await start(directory,mode);
    run.child.kill("SIGTERM");assert.deepEqual(await run.exit,[1,null],run.output());
    await locks(directory,mode==="deadline");
  }
  const rollback=path.join(root,"rollback"),old=await start(rollback,"normal",true);
  // SIGINT has no test-only handler and retains Node's default signal behavior.
  old.child.kill("SIGINT");assert.deepEqual(await old.exit,[null,"SIGINT"]);
  const recovered=await start(rollback);recovered.child.kill("SIGTERM");
  assert.deepEqual(await recovered.exit,[0,null],recovered.output());await locks(rollback,false);
  console.log(JSON.stringify({passed:true,checks:["SIGTERM","SIGINT","duplicate signals","request drain","SSE close","503 gate","history flush/resume","late-ingest rejection","stop/drain/close failure","bounded deadline","rollback/crash recovery"],fixture:root}));
}
