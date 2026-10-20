import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {operatingChartLimits as limits,type OperatingCharts,type PowerSample} from '../../core/operatingCharts';
import {operatingSiteKey,parseOperatingCharts,projectDistribution,projectPower} from './operatingCharts';

/** One bounded recorder on accepted canonical publications; no timer or equipment reads. */
export class OperatingChartsStore {
  private key:string|null=null;
  private charts:OperatingCharts|undefined;
  private pending:Promise<void>=Promise.resolve();
  private lastSample=0;
  private saveQueued=false;
  constructor(private directory?:string){}
  ingest(input:unknown,now=Date.now()) {
    const key=operatingSiteKey(input);
    if(!key){this.key=null;this.charts=undefined;this.lastSample=0;return;}
    if(key!==this.key){
      this.key=key;this.lastSample=0;
      const [site,block]=JSON.parse(key);
      this.charts={version:1,site:`${site} / Block ${block}`,capturedAt:now,power:[],distribution:[],intervalMs:limits.intervalMs,retentionMs:limits.retentionMs,recordingError:null};
      if(this.directory)this.pending=this.pending.then(()=>this.restore(key,now));
    }
    const charts=this.charts!;
    charts.capturedAt=now;charts.distribution=projectDistribution(input,now);
    charts.power=charts.power.filter(p=>p.at>=now-limits.retentionMs);
    if(now-this.lastSample<limits.intervalMs)return;
    const sample=projectPower(input,now);
    // Repeated publication of the same old measurements must not make a new flat trace.
    const previous=charts.power.at(-1);
    if(previous?.observedAt===sample.observedAt){for(const k of ['commandKw','actualKw','commandKvar','actualKvar'] as const)sample[k]=null;}
    charts.power=this.withGaps([...charts.power,sample]);this.lastSample=now;
    if(this.directory&&!this.saveQueued){this.saveQueued=true;this.pending=this.pending.then(async()=>{this.saveQueued=false;await this.save(this.key);});}
  }
  view(input:unknown,now=Date.now()):OperatingCharts|undefined {
    if(operatingSiteKey(input)!==this.key||!this.charts)return undefined;
    const result=structuredClone(this.charts);
    if(now-result.capturedAt>30000){result.distribution=result.distribution.map(d=>({...d,voltageMv:null,temperatureF:null,currentA:null,powerKw:null,socPct:null,stringVoltageV:null,busVoltageV:null,energyKwh:null}));}
    return result;
  }
  private file(key:string){return path.join(this.directory!,createHash('sha256').update(key).digest('hex')+'.json');}
  private withGaps(samples:PowerSample[]){
    const result:PowerSample[]=[];
    for(const sample of samples){
      const previous=result.at(-1);
      if(previous&&sample.at-previous.at>limits.intervalMs*2)result.push({...previous,at:previous.at+limits.intervalMs,observedAt:null,commandKw:null,actualKw:null,commandKvar:null,actualKvar:null,reporting:{commandKw:0,actualKw:0,commandKvar:0,actualKvar:0}});
      result.push(sample);
    }
    return result.slice(-limits.points);
  }
  private async restore(key:string,now:number){
    try{
      const file=this.file(key),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)throw Error('Invalid archive');
      const data=JSON.parse(await fs.readFile(file,'utf8'));if(data.key!==key)throw Error('Archive identity');
      const saved=parseOperatingCharts(data.charts);const [station,block]=JSON.parse(key);
      if(!saved||saved.site!==`${station} / Block ${block}`)throw Error('Archive identity');
      if(this.key!==key||!this.charts)return;
      const merged=new Map<number,PowerSample>([...saved.power,...this.charts.power].filter(p=>p.at>=now-limits.retentionMs&&p.at<=now).map(p=>[p.at,p]));
      this.charts.power=this.withGaps([...merged.values()].sort((a,b)=>a.at-b.at));
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'&&this.key===key&&this.charts)this.charts.recordingError='Saved power history could not be restored; new samples remain available.';}
  }
  private async save(key:string|null){
    if(!key||this.key!==key||!this.charts)return;
    try{
      await fs.mkdir(this.directory!,{recursive:true,mode:0o700});
      const file=this.file(key),tmp=file+'.tmp',body=JSON.stringify({key,charts:{...this.charts,distribution:[]}});
      await fs.writeFile(tmp,body,{mode:0o600});await fs.rename(tmp,file);
    }catch{if(this.key===key&&this.charts)this.charts.recordingError='Power history could not be saved; current samples are memory-only.';}
  }
  async flush(){await this.pending;}
}
