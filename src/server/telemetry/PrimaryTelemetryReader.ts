export interface PrimarySample<T> {
  readonly sequence: number;
  readonly scope: string;
  readonly startedAt: number;
  readonly acquiredAt: number;
  readonly success: boolean;
  readonly data: T | null;
  readonly error: string | null;
}
interface ReaderClock {
  now(): number;
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}
const clock: ReaderClock = {
  now: Date.now,
  schedule: (callback, delayMs) => {const timer=setTimeout(callback,delayMs);timer.unref();return timer;},
  cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** One leased primary acquisition owner. No device commands, fallback or timestamp rewriting. */
export class PrimaryTelemetryReader<T> {
  private scope: string | null = null;
  private latest: PrimarySample<T> | null = null;
  private inFlight: Promise<void> | null = null;
  private timer: unknown = null;
  private sequence = 0;
  private leaseUntil = 0;
  private dueAt = 0;
  private stopped = false;
  private failures = 0;
  private attempts = 0;
  private completed = 0;
  private scopeRevision = 0;
  private readonly history: Array<{sequence:number;startedAt:number;acquiredAt:number;success:boolean}> = [];

  constructor(
    private readonly currentScope: () => string | null,
    private readonly acquire: (scope: string) => Promise<T>,
    private readonly publish: (sample: PrimarySample<T>) => void,
    private readonly time: ReaderClock = clock,
  ) {}

  async read(scope: string): Promise<PrimarySample<T>> {
    if (this.stopped) throw new Error('Primary reader stopped');
    if (!scope || scope !== this.currentScope()) throw new Error('Primary reader site changed');
    this.leaseUntil = this.time.now()+60000;
    if (scope !== this.scope) {
      this.clearTimer();this.scope=scope;this.scopeRevision++;this.latest=null;this.failures=0;this.dueAt=0;
    }
    const revision=this.scopeRevision;
    // A source switch still drains the previous request: never overlap destinations.
    if (this.inFlight && !this.latest) await this.inFlight;
    this.assertScope(scope,revision);
    if (!this.inFlight && this.time.now() >= this.dueAt) this.acquireNext();
    if (this.inFlight && (!this.latest || this.time.now()-this.latest.acquiredAt >= 15000)) await this.inFlight;
    this.assertScope(scope,revision);
    this.schedule();
    const sample=this.latest;
    if (!sample || sample.scope !== scope || !sample.success || this.time.now()-sample.acquiredAt >= 15000)
      throw new Error(sample?.error || 'Fresh primary EMS data unavailable');
    // Full-cycle normalization may annotate raw reports. It must not mutate this owner.
    return structuredClone(sample);
  }

  private assertScope(scope: string, revision: number): void {
    if (this.stopped || revision !== this.scopeRevision || this.scope !== scope || this.currentScope() !== scope) throw new Error('Primary reader stopped or site changed');
  }

  private acquireNext(): void {
    const scope=this.scope;
    if (this.stopped || this.inFlight || !scope || this.currentScope() !== scope || this.time.now() >= this.leaseUntil) return;
    this.clearTimer();
    const startedAt=this.time.now(), sequence=++this.sequence, revision=this.scopeRevision;
    this.attempts++;
    this.inFlight=Promise.resolve().then(()=>this.acquire(scope)).then(
      data=>this.accept({sequence,scope,startedAt,acquiredAt:this.time.now(),success:true,data,error:null},revision),
      error=>this.accept({sequence,scope,startedAt,acquiredAt:this.time.now(),success:false,data:null,error:error instanceof Error?error.message:'Primary acquisition failed'},revision),
    ).finally(()=>{this.inFlight=null;this.schedule();});
  }

  private accept(sample: PrimarySample<T>, revision: number): void {
    this.completed++;
    this.history.push({sequence:sample.sequence,startedAt:sample.startedAt,acquiredAt:sample.acquiredAt,success:sample.success});
    if(this.history.length>20)this.history.shift();
    if (this.stopped || revision !== this.scopeRevision || sample.scope !== this.scope || sample.scope !== this.currentScope()) return;
    this.failures=sample.success?0:this.failures+1;
    const delay=sample.success?1000:Math.min(30000,8000*2**Math.min(this.failures-1,2));
    this.dueAt=Math.max(sample.startedAt+4000,sample.acquiredAt+delay);
    this.latest=sample;
    // Publication errors must fail closed and must not create an unhandled timer rejection.
    try {this.publish(sample);} catch {
      this.latest={...sample,success:false,data:null,error:'Primary publication failed'};
      this.failures++;this.dueAt=Math.max(this.dueAt,this.time.now()+8000);
    }
  }

  private schedule(): void {
    this.clearTimer();
    if (this.stopped || this.inFlight || !this.scope || this.scope !== this.currentScope() || this.dueAt >= this.leaseUntil || this.time.now() >= this.leaseUntil) return;
    this.timer=this.time.schedule(()=>{this.timer=null;this.acquireNext();},Math.max(0,this.dueAt-this.time.now()));
  }
  private clearTimer(): void {if(this.timer!==null){this.time.cancel(this.timer);this.timer=null;}}
  start(): void {this.stopped=false;}
  stop(): void {this.stopped=true;this.scopeRevision++;this.latest=null;this.scope=null;this.clearTimer();}
  async drain(): Promise<void> {await this.inFlight;}
  diagnostics() {
    const current=this.scope===this.currentScope()?this.latest:null;
    return {running:!!this.inFlight,stopped:this.stopped,attempts:this.attempts,completed:this.completed,
      failures:this.failures,sequence:current?.sequence??null,lastError:current?.error??null,
      durationMs:current?current.acquiredAt-current.startedAt:null,
      publicationAgeMs:current?this.time.now()-current.acquiredAt:null,
      nextAttemptAt:this.timer!==null?this.dueAt:null,history:this.history.map(row=>({...row}))};
  }
}
