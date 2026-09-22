import {matchesHistory,validateHistoryFilters,type HistoryFilters,type HistoryDevice} from "./historyReview";
import type {ThermalMetric} from "./thermalMetrics";
import {SiteHistory, type SiteIdentity} from "./siteHistory";
import * as fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { thermalUnits, supplyResponse, applicableThermalPoint, thermalSegmentType, type ThermalDevice, type ThermalUnit, type ThermalPoint } from "./thermalModel";
import { thermalReadings, thermalDisplayValues } from "./thermalMetrics";
import {selectThermalTargets,type TargetQuery} from "./thermalTargets";
import {reviewReading} from "./thermalReviewPresentation";

type Session = { id: string; targets: string[]; labels: string[]; startedAt: number; endsAt: number;
  state: "Recording" | "Waiting for data" | "Stopped" | "Complete" | "Paused"; samples: number; error?: string };
type StoredPoint = { id: string; point: ThermalPoint };
export class ThermalService {
  readonly siteHistory:SiteHistory;
  private units: ThermalUnit[] = [];
  private history = new Map<string, ThermalPoint[]>();
  private transitions = new Map<string, number>();
  private sessions: Session[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private lastStored = new Map<string, ThermalPoint>();
  private ready: Promise<void>;
  error: string | null = null;
  constructor(private directory: string, private reserveBytes = 5 * 1024 ** 3, private maxBytes = 64 * 1024 ** 2) {
    this.siteHistory=new SiteHistory(path.join(directory,"site-history"));
    this.ready = this.load().catch(e => { this.error = `History unavailable: ${e.message}`; });
  }
  private async load() {
    await fs.mkdir(this.directory, { recursive: true });
    for (const name of (await fs.readdir(this.directory)).filter(n => /^[a-f0-9-]+\.json$/.test(n)).slice(0, 200)) {
      const session = JSON.parse(await fs.readFile(path.join(this.directory, name), "utf8")) as Session;
      if (!/^[a-f0-9-]+$/.test(session.id) || !Array.isArray(session.targets)) continue;
      if (["Recording", "Waiting for data"].includes(session.state)) {
        session.state = session.endsAt <= Date.now() ? "Complete" : "Waiting for data";
        // Resume only the explicitly saved targets and original end time.
      }
      this.sessions.push(session);
    }
  }
  private queue<T>(operation: () => Promise<T>): Promise<T> {
    this.pending++;
    const result = this.tail.then(() => this.ready).then(operation);
    this.tail = result.catch(() => {}).finally(() => { this.pending--; });
    return result;
  }
  private async save(session: Session) {
    const file = path.join(this.directory, `${session.id}.json`);
    const handle = await fs.open(`${file}.tmp`, "w");
    try { await handle.writeFile(JSON.stringify(session)); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(`${file}.tmp`, file);
  }
  private async checkStorage() {
    const stat = await fs.statfs(this.directory);
    if (stat.bavail * stat.bsize < this.reserveBytes) throw new Error("Free-disk reserve reached; existing recordings preserved");
    let bytes = 0;
    for (const name of await fs.readdir(this.directory)) bytes += (await fs.stat(path.join(this.directory,name))).size;
    if (bytes > this.maxBytes - 256 * 1024) throw new Error("Thermal history storage limit reached; export/archive recordings before continuing");
  }
  ingest(devices: ThermalDevice[], now = Date.now(), site:SiteIdentity|null=null) {
    const units = thermalUnits(devices, now);
    const seen = new Set(units.map(u => u.id));
    // Missing devices must not silently retain a green/live state.
    for (const prior of this.units) if (!seen.has(prior.id)) units.push({...prior, point: {...prior.point, quality: "Unavailable"}});
    this.units = units;
    this.siteHistory.ingest(units,site,now);
    const incoming: StoredPoint[] = [];
    for (const unit of this.units) {
      const points = this.history.get(unit.id) ?? [];
      const previous = points.at(-1);
      const p = unit.point.quality === "Live" ? unit.point : {...unit.point, at: now};
      if (previous?.at === p.at && previous.quality === p.quality) continue;
      if (!previous || previous.mode !== p.mode || previous.quality !== "Live" || p.quality !== "Live") this.transitions.set(unit.id, p.at);
      points.push(p);
      this.history.set(unit.id, points.filter(p => p.at >= now - 3600000).slice(-720));
      incoming.push({id:unit.id, point:p});
    }
    if (this.pending > 2) { this.error = "Recording writer busy; samples skipped (gaps are not interpolated)"; return; }
    void this.queue(async () => {
      const session = this.sessions.find(s => ["Recording", "Waiting for data"].includes(s.state));
      if (!session) return;
      if (now >= session.endsAt) { session.state = "Complete"; await this.save(session); return; }
      const points = incoming.filter(p => session.targets.includes(p.id)).filter(({id,point:p}) => {
        const last = this.lastStored.get(id);
        if (!last || p.at-last.at >= 60000 || last.mode!==p.mode || last.quality!==p.quality) return true;
        return (["space","supply","current","rpm","cooling","heating","cell","control","outside","humidity","cellRate"] as const).some(k =>
          p[k] == null || last[k] == null ? p[k] !== last[k] : Math.abs(p[k]!-last[k]!) >= (k === "rpm" ? 1 : k === "cellRate" ? 0.01 : k === "cooling" || k === "heating" ? 0.001 : 0.1));
      });
      if (!points.length) return;
      try {
        await this.checkStorage();
        const file = await fs.open(path.join(this.directory, `${session.id}.jsonl`), "a");
        try { await file.writeFile(points.map(p=>JSON.stringify(p)).join("\n")+"\n"); await file.sync(); } finally { await file.close(); }
        points.forEach(p=>this.lastStored.set(p.id,p.point));
        session.samples += points.length; session.state="Recording";
        await this.save(session); this.error = null;
      } catch (e) { session.state="Paused"; session.error=String(e); this.error=String(e); await this.save(session).catch(()=>{}); }
    }).catch(e=>{this.error=String(e);});
  }
  async view() {
    await this.ready;
    return { reviewVersion:1, units: this.units.map(u=>{
        const point: ThermalPoint = u.point.quality === "Live" && Date.now()-u.point.at>120000 ? {...u.point,quality:"Stale"} : u.point;
        return {...u,point,readings:thermalReadings(point),response:supplyResponse(point,this.transitions.get(u.id)??null)};
      }),
      siteStorage:await this.siteHistory.status(),
      sessions:[...this.sessions].sort((a,b)=>b.startedAt-a.startedAt), error:this.error,
      limits:{maxTargets:8,maxHours:24,maxBytes:this.maxBytes,reserveBytes:this.reserveBytes},
      capturedAt:Date.now() };
  }
  start(targets: string[], hours: number) {
    return this.queue(async () => {
      if (this.error?.startsWith("History unavailable")) throw new Error(this.error);
      const unique=[...new Set(targets)];
      if (!unique.length || unique.length>8 || unique.some(id=>!this.units.some(u=>u.id===id))) throw new Error("Choose 1–8 available HVAC units");
      if (!Number.isFinite(hours)||hours<0.1||hours>24) throw new Error("Duration must be 0.1–24 hours");
      if (this.sessions.some(s=>["Recording","Waiting for data"].includes(s.state))) throw new Error("Stop the active recording before starting another");
      if (this.sessions.length>=200) throw new Error("Session limit reached; archive before creating more sessions");
      await this.checkStorage();
      const session:Session={id:randomUUID(),targets:unique,labels:unique.map(id=>this.units.find(u=>u.id===id)!.label),startedAt:Date.now(),endsAt:Date.now()+hours*3600000,state:"Waiting for data",samples:0};
      await this.save(session); this.sessions.push(session); this.lastStored.clear(); return session;
    });
  }
  async targets(query:TargetQuery) {
    const view=await this.view();
    let recorded:HistoryDevice[]=[],warning:string|undefined;
    try{recorded=await this.siteHistory.historyDevices();}catch(e){warning=`Recorded device catalogue unavailable: ${String(e)}`;}
    const devices=[...new Map([...recorded,...view.units].map(({id,array,segment,unit,label,ip})=>[id,{id,array,segment,unit,label,ip}])).values()];
    return {...selectThermalTargets(devices,view.units,query),warning};
  }
  stop(id:string) {
    return this.queue(async()=>{const s=this.sessions.find(s=>s.id===id);if(!s)throw new Error("Unknown recording");s.state="Stopped";await this.save(s);return s;});
  }
  async points(ids:string[], from:number, sessionId?:string) {
    await this.ready;
    if(ids.length>8 || !Number.isFinite(from))throw new Error("Invalid graph selection");
    if (!sessionId) return ids.flatMap(id=>(this.history.get(id)??[]).filter(p=>p.at>=from).map(point=>({id,point})));
    if(!this.sessions.some(s=>s.id===sessionId))throw new Error("Unknown recording");
    const text=await fs.readFile(path.join(this.directory,`${sessionId}.jsonl`),"utf8").catch((e)=>{if(e.code==="ENOENT")return "";throw e;});
    const output:StoredPoint[]=[];
    for(const line of text.split("\n")) {if(!line)continue;try{const p=JSON.parse(line) as StoredPoint;if(ids.includes(p.id)&&p.point.at>=from)output.push(p);}catch{/* Incomplete final write is not a measurement. */}}
    return output;
  }
  async displayPoints(ids:string[], from:number, sessionId?:string,metric:ThermalMetric="space",filters:HistoryFilters={}) {
    validateHistoryFilters(filters);
    const samples=await this.points(ids,from,sessionId);
    const session=this.sessions.find(s=>s.id===sessionId);
    return samples.filter(s=>filters.to===undefined||s.point.at<=filters.to).map(sample=>{
      const unit=this.units.find(u=>u.id===sample.id);
      const label=unit?.segment ?? session?.labels[session.targets.indexOf(sample.id)] ?? "";
      const point=applicableThermalPoint(sample.point,thermalSegmentType(label,sample.point.segmentType));
      const excluded=!matchesHistory(point,metric,filters);
      return {...sample,point,displayValues:thermalDisplayValues(point),excluded,review:reviewReading(point,metric,excluded)};
    });
  }
  async flush() { await this.tail; }
}
// Lazy singleton: disabled installs do not create history files.
let instance: ThermalService | undefined;
export const thermalService = () => instance ??= new ThermalService(path.resolve(process.env.PRIZM_THERMAL_DIR || ".prizm-data/thermal"));
