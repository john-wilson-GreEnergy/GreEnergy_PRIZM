/** Coalesce automatic updates without cancelling useful work. Dispose only on
 * selection/site changes. Retaining the previous result is the caller's choice. */
export class CellHistoryRefresh<T> {
  private disposed = false;
  private running = false;
  private pending: string | null = null;
  private requested: string | null = null;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private load:(signal:AbortSignal)=>Promise<T>, private receive:(value:T)=>void,
    private fail:(message:string)=>void, private loading:(value:boolean)=>void,
    private delayMs=250, private timeoutMs=45_000) {}
  refresh(version:string):void {
    if (this.disposed || version === this.requested || version === this.pending) return;
    this.pending = version;
    if (!this.running) {
      clearTimeout(this.timer);
      this.timer = setTimeout(()=>void this.run(), this.delayMs);
    }
  }
  private async run() {
    if (this.disposed || this.pending === null) return;
    this.requested = this.pending; this.pending = null; this.running = true;
    const controller = this.controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), this.timeoutMs);
    this.loading(true);
    try {const value = await this.load(controller.signal); if (!this.disposed) this.receive(value);}
    catch (error) {if (!this.disposed) this.fail(controller.signal.aborted ? 'History request timed out. Retry or select a shorter window.' : error instanceof Error ? error.message : 'Unable to read cell history');}
    finally {
      clearTimeout(timeout); this.running = false;
      if (!this.disposed) {this.loading(false); if (this.pending !== null) this.timer = setTimeout(()=>void this.run(), this.delayMs);}
    }
  }
  dispose():void {this.disposed = true; clearTimeout(this.timer); this.controller?.abort();}
}
