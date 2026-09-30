export interface RenderSample { phase: string; ms: number }
export class RenderMeasurements {
  private samples = new Map<string, RenderSample[]>();
  private dropped = new Map<string, number>();
  constructor(private readonly limit = 2000) {}
  record(id: string, phase: string, ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    const rows = this.samples.get(id) || [];
    if (rows.length >= this.limit) { rows.shift(); this.dropped.set(id, (this.dropped.get(id) || 0) + 1); }
    rows.push({phase, ms}); this.samples.set(id, rows);
  }
  reset() { this.samples.clear(); this.dropped.clear(); }
  report() {
    return [...this.samples].map(([id, rows]) => {
      const updates = rows.filter(row => row.phase !== 'mount').map(row => row.ms).sort((a,b)=>a-b);
      return {id, samples:rows.length, dropped:this.dropped.get(id)||0,
        mountMs:rows.find(row=>row.phase==='mount')?.ms ?? null,
        updates:updates.length,
        medianMs:updates.length ? updates[Math.floor(updates.length/2)] : null,
        p95Ms:updates.length ? updates[Math.ceil(updates.length*.95)-1] : null,
        maxMs:updates.length ? updates[updates.length-1] : null,
        over50ms:updates.filter(ms=>ms>50).length};
    });
  }
}
