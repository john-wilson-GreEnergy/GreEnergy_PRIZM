import {monitorEventLoopDelay} from 'node:perf_hooks';
import type {RestTiming} from '../../acquisition/providers/RestProvider';

interface Finish {success:boolean;parseMs:number;bytes:number|null;fallback:boolean;}
interface RuntimeSample {cpuMs:number;eventLoopMaxMs:number|null;eventLoopMeanMs:number|null;}
interface StageRecord extends Finish,RuntimeSample {
  cycleId:number|null;startedAt:string;completedAt:string;
  attempts:RestTiming[];
}
const startRuntimeSample=():()=>RuntimeSample=>{
  const cpu=process.cpuUsage(),monitor=monitorEventLoopDelay({resolution:20});monitor.enable();
  return ()=>{
    monitor.disable();const used=process.cpuUsage(cpu);
    return {cpuMs:(used.user+used.system)/1000,eventLoopMaxMs:monitor.count?monitor.max/1e6:null,
      eventLoopMeanMs:monitor.count?monitor.mean/1e6:null};
  };
};

/** Bounded passive diagnostics only; no transport, payload retention or new polling. */
export class EmsStageTiming {
  private readonly records:StageRecord[]=[];
  constructor(private readonly runtimeSample=startRuntimeSample,private readonly now=()=>new Date().toISOString()) {}
  begin(cycleId:number|null,enabled=process.env.PRIZM_EMS_STAGE_TIMING!=='false') {
    if(!enabled)return null;
    let finishRuntime:()=>RuntimeSample;
    try {finishRuntime=this.runtimeSample();} catch {return null;}
    const startedAt=this.now(),attempts:RestTiming[]=[];
    let finished=false;
    return {
      observe:(timing:RestTiming)=>{if(!finished&&attempts.length<2)attempts.push({...timing});},
      finish:(result:Finish)=>{
        if(finished)return;finished=true;
        try {
          const runtime=finishRuntime();
          this.records.push({...result,...runtime,cycleId,startedAt,completedAt:this.now(),attempts});
          if(this.records.length>30)this.records.shift();
        } catch { /* Observation must not affect the provider's result. */ }
      },
    };
  }
  snapshot() {return structuredClone(this.records);}
}
export const emsStageTiming=new EmsStageTiming();
