import type {HistoryDevice} from "./historyReview";
import {applicableThermalPoint, thermalSegmentType, type ThermalPoint} from "./thermalModel";

const MINUTE = 60000;
export const REVIEW_GAP_MS = 2 * MINUTE;
export type ThermalReviewRow = {
  device: HistoryDevice; samples: number; liveSamples: number;
  coveragePct: number; coveredMs: number; longestGapMs: number;
  commandCoveragePct: number; commandedMs: number; starts: number; shortCycles: number;
  weakCoolingMs: number; coolingAssessedMs: number;
  faultObservations: string[]; faultAppeared: number; faultCleared: number;
  peakCurrentA: number|null; peakSpaceC: number|null; peakCellC: number|null;
  notes: string[];
  coverageGap: boolean; performanceCandidate: boolean;
  display: {coverage:string;commandCoverage:string;commanded:string;gap:string;weakCooling:string;peakCurrent:string;peakSpace:string;peakCell:string};
};
export type ThermalMorningReport = {
  version: 1; siteKey: string; siteLabel: string; from: number; to: number; builtAt: number;
  rows: ThermalReviewRow[];
  summary: {units: number; noData: number; partialCoverage: number; faultTargets: number; shortCycleTargets: number; weakCoolingTargets: number; coveragePct: number};
  limitations: string[];
};
export type ThermalReviewJob = {
  state: "idle"|"building"|"ready"|"failed"|"cancelled"|"disabled";
  completed: number; total: number; error?: string; report?: ThermalMorningReport;
};
const maximum = (a: number|null, b: number|null|undefined) => typeof b === "number" && Number.isFinite(b) ? Math.max(a ?? b, b) : a;

/** Streaming raw-history analysis. Never infer continuity across missing/stale observations. */
export class ThermalReviewAccumulator {
  private previous?: ThermalPoint;
  private modeSince = 0;
  private cycleStart: number|null = null;
  private lastCovered: number;
  private commandMs = 0;
  private faults = new Set<string>();
  readonly row: ThermalReviewRow;
  constructor(device: HistoryDevice, private from: number, private to: number) {
    this.lastCovered = from;
    this.row = {device, samples:0, liveSamples:0, coveragePct:0, coveredMs:0, longestGapMs:0,
      commandCoveragePct:0, commandedMs:0, starts:0, shortCycles:0, weakCoolingMs:0, coolingAssessedMs:0,
      faultObservations:[], faultAppeared:0, faultCleared:0, peakCurrentA:null, peakSpaceC:null, peakCellC:null, notes:[],coverageGap:true,performanceCandidate:false,
      display:{coverage:"",commandCoverage:"",commanded:"",gap:"",weakCooling:"",peakCurrent:"",peakSpace:"",peakCell:""}};
  }
  consume(input: ThermalPoint) {
    const p = applicableThermalPoint(input, thermalSegmentType(this.row.device.segment, input.segmentType));
    if (!Number.isFinite(p.at) || p.at > this.to || p.at < this.from-REVIEW_GAP_MS) return;
    const previous = this.previous;
    // Equal timestamps can carry a quality transition. Invalidate continuity but do not double-count.
    if (previous && p.at <= previous.at) {
      if (p.at === previous.at && p.quality !== "Live") {this.previous=p; this.cycleStart=null;}
      return;
    }
    const inWindow = p.at >= this.from;
    if (inWindow) this.row.samples++;
    if (inWindow && p.quality === "Live") {
      this.row.liveSamples++;
      this.row.peakCurrentA=maximum(this.row.peakCurrentA,p.current);
      this.row.peakSpaceC=maximum(this.row.peakSpaceC,p.space);
      this.row.peakCellC=maximum(this.row.peakCellC,p.cell);
      for (const fault of p.faults ?? []) if (this.faults.size < 64) this.faults.add(fault);
    }
    const continuous = previous && previous.quality === "Live" && p.quality === "Live" && p.at-previous.at <= REVIEW_GAP_MS;
    if (!continuous || previous.mode !== p.mode) this.modeSince=p.at;
    if (continuous) {
      const start=Math.max(this.from,previous.at), duration=Math.max(0,p.at-start);
      this.row.longestGapMs=Math.max(this.row.longestGapMs,start-this.lastCovered);
      this.row.coveredMs+=duration;
      this.lastCovered=Math.max(this.lastCovered,p.at);
      const before=previous.commands?.compressor, after=p.commands?.compressor;
      if (typeof before === "boolean" && typeof after === "boolean") {
        this.commandMs+=duration;
        if (before) this.row.commandedMs+=duration;
        if (!before && after) {this.cycleStart=p.at; if(inWindow)this.row.starts++;}
        if (before && !after) {
          if (inWindow && this.cycleStart!==null && this.cycleStart>=this.from && p.at-this.cycleStart<3*MINUTE) this.row.shortCycles++;
          this.cycleStart=null;
        }
      } else this.cycleStart=null;
      // Temperature-response assessment is an investigation aid, not a vendor alarm or efficiency measurement.
      if (previous.mode === "Cooling" && p.mode === "Cooling" && previous.space!==null && previous.supply!==null &&
          Number.isFinite(previous.space) && Number.isFinite(previous.supply)) {
        const assessed=Math.max(0,p.at-Math.max(start,this.modeSince+3*MINUTE));
        this.row.coolingAssessedMs+=assessed;
        if (previous.space-previous.supply<2.8) this.row.weakCoolingMs+=assessed;
      }
      if (inWindow && Array.isArray(previous.faults) && Array.isArray(p.faults)) {
        const old=new Set(previous.faults), next=new Set(p.faults);
        this.row.faultAppeared += [...next].filter(f=>!old.has(f)).length;
        this.row.faultCleared += [...old].filter(f=>!next.has(f)).length;
      }
    } else this.cycleStart=null;
    this.previous=p;
  }
  finish(): ThermalReviewRow {
    const span=this.to-this.from;
    this.row.longestGapMs=Math.max(this.row.longestGapMs,this.to-this.lastCovered);
    this.row.coveragePct=span>0?100*this.row.coveredMs/span:0;
    this.row.commandCoveragePct=span>0?100*this.commandMs/span:0;
    this.row.faultObservations=[...this.faults];
    this.row.coverageGap=this.row.coveragePct<95;
    this.row.performanceCandidate=!!(this.faults.size||this.row.shortCycles||this.row.weakCoolingMs>=10*MINUTE);
    this.row.notes=[];
    if (!this.row.liveSamples) this.row.notes.push("No live saved observations");
    else if(this.row.coveragePct<95)this.row.notes.push("Partial coverage — counts and durations are incomplete");
    if(this.row.shortCycles)this.row.notes.push("Observed complete commanded-on cycles shorter than 3 minutes; investigate against vendor limits");
    if(this.row.weakCoolingMs>=10*MINUTE)this.row.notes.push("At least 10 observed minutes with cooling supply/space difference below 2.8°C after stabilization");
    if(this.faults.size)this.row.notes.push("Faults reported during this window; not necessarily active now");
    const duration=(ms:number)=>`${(ms/MINUTE).toFixed(1)} min`;
    const temp=(v:number|null)=>v===null?"Not available":`${(v*9/5+32).toFixed(1)} °F`;
    this.row.display={coverage:`${this.row.coveragePct.toFixed(1)}%`,commandCoverage:`${this.row.commandCoveragePct.toFixed(1)}%`,
      commanded:this.commandMs?duration(this.row.commandedMs):"Unknown",gap:duration(this.row.longestGapMs),
      weakCooling:this.row.coolingAssessedMs?duration(this.row.weakCoolingMs):"Not assessed",
      peakCurrent:this.row.peakCurrentA===null?"Not available":`${this.row.peakCurrentA.toFixed(1)} A`,
      peakSpace:temp(this.row.peakSpaceC),peakCell:thermalSegmentType(this.row.device.segment)==="CS"?"N/A · collection segment":temp(this.row.peakCellC)};
    return this.row;
  }
}

export function finishThermalReview(rows: ThermalReviewRow[], siteKey:string, siteLabel:string, from:number,to:number,builtAt:number): ThermalMorningReport {
  return {version:1,siteKey,siteLabel,from,to,builtAt,rows,summary:{units:rows.length,
    noData:rows.filter(r=>!r.liveSamples).length,partialCoverage:rows.filter(r=>r.coveragePct<95).length,
    faultTargets:rows.filter(r=>r.faultObservations.length).length,shortCycleTargets:rows.filter(r=>r.shortCycles>0).length,
    weakCoolingTargets:rows.filter(r=>r.weakCoolingMs>=10*MINUTE).length,
    coveragePct:rows.length?rows.reduce((sum,r)=>sum+r.coveragePct,0)/rows.length:0},
    limitations:["Thermal observations only; not a site-wide electrical or safety incident report.",
      "Coverage uses adjacent live observations no more than 2 minutes apart. Missing time is not counted as healthy, off, or fault-free.",
      "Runtime and starts describe compressor commands, not measured mechanical operation. Transitions between samples can be missed.",
      "Short-cycle and weak-response thresholds are review heuristics, not equipment alarms. Shared segment temperatures may appear on both HVAC rows.",
      "Fault transitions require consecutive known fault lists. Initial faults are not counted as new; collection-segment cell temperatures are excluded."]};
}
