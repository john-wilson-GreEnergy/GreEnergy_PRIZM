/** Limits restart-checkpoint capture, never memory publication or history writes.
 * Keys are absolute site-qualified paths. No telemetry objects are retained.
 */
export class CheckpointGate {
  private acceptedAt = new Map<string,number>();
  private skipped = 0;
  constructor(readonly intervalMs = 0) {
    if (!Number.isFinite(intervalMs) || intervalMs < 0 || intervalMs > 300_000) throw Error('Invalid checkpoint interval');
  }
  shouldCapture(file:string,clear=false,now=Date.now()) {
    const last=this.acceptedAt.get(file);
    if(!clear && this.intervalMs>0 && last!==undefined && now>=last && now-last<this.intervalMs){this.skipped++;return false;}
    return true;
  }
  accepted(file:string,now=Date.now()) {
    this.acceptedAt.delete(file);this.acceptedAt.set(file,now);
    if(this.acceptedAt.size>32)this.acceptedAt.delete(this.acceptedAt.keys().next().value!);
  }
  status(){return {intervalMs:this.intervalMs,skippedCaptures:this.skipped,trackedPaths:this.acceptedAt.size};}
}
