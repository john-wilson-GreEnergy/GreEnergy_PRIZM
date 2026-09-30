type JsonResponse = { status: number; etag: string | null; data: any };
type SnapshotResult = JsonResponse & { key: string; generation: number };
type TopologyResult = { profile: any | null; error: Error | null };

/** Independent read-only HTTP lanes. No device acquisition or commands. */
export class SiteDataRequests {
  private snapshotController?: AbortController;
  private topologyController?: AbortController;
  private generation = 0;
  private topologyGeneration = 0;
  private pendingSnapshot?: { key: string; promise: Promise<SnapshotResult | null> };
  private pendingTopology?: Promise<TopologyResult | null>;
  private accepted?: { key: string; etag: string | null };
  private topologyLoaded = false;
  constructor(private readonly request: typeof fetch = (input, init) => fetch(input, init), private readonly timeoutMs = 10000) {}

  private async json(url: string, controller: AbortController, etag?: string | null): Promise<JsonResponse> {
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.request(url, {signal:controller.signal, headers:etag ? {'If-None-Match':etag} : undefined});
      if (response.status === 304) {
        if (!etag) throw new Error('Unchanged response without an accepted snapshot.');
        return {status:304,etag,data:null};
      }
      if (!response.ok) throw new Error(`Data request failed: HTTP ${response.status}`);
      if (response.headers.get('content-type')?.includes('text/html')) throw new Error('Server is restarting or unreachable');
      const data = await response.json();
      if (controller.signal.aborted) throw new Error('Data request timed out or was cancelled.');
      return {status:response.status,etag:response.headers.get('etag'),data};
    } finally { clearTimeout(timer); }
  }

  snapshot(view: string, force = false, compactStrings = true): Promise<SnapshotResult | null> {
    const qs = new URLSearchParams({view});
    if (view === 'arrays-strings' && compactStrings) qs.set('shape','list');
    const key = qs.toString();
    if (!force && this.pendingSnapshot?.key === key) return this.pendingSnapshot.promise;
    this.snapshotController?.abort();
    const controller = new AbortController(); this.snapshotController = controller;
    const generation = ++this.generation;
    if (force) qs.set('refresh','true');
    const etag = !force && this.accepted?.key === key ? this.accepted.etag : null;
    const promise = this.json(`/api/local/site-data/snapshot?${qs}`,controller,etag)
      .then(result => generation === this.generation ? {...result,key,generation} : null)
      .catch(error => {if(generation !== this.generation)return null;throw error;})
      .finally(()=>{if(generation === this.generation)this.pendingSnapshot=undefined;});
    this.pendingSnapshot = {key,promise};
    return promise;
  }

  /** Commit ETags only after the UI's existing quality checks accept the reading. */
  accept(result: SnapshotResult) {
    if (result.generation === this.generation) this.accepted={key:result.key,etag:result.etag};
  }

  topology(force = false): Promise<TopologyResult | null> {
    if (!force && this.pendingTopology) return this.pendingTopology;
    if (!force && this.topologyLoaded) return Promise.resolve(null);
    this.topologyController?.abort();
    const controller = new AbortController(); this.topologyController = controller;
    const generation = ++this.topologyGeneration;
    const promise = this.json('/api/local/topology/active',controller).then(({data})=>{
      if(generation !== this.topologyGeneration)return null;
      if(!data?.success)throw new Error('Topology response could not be verified.');
      // A warming server may have no active profile yet; retry on later polls.
      this.topologyLoaded=Boolean(data.profile);
      return {profile:data.profile ?? null,error:null};
    }).catch(error=>{
      if(generation !== this.topologyGeneration)return null;
      this.topologyLoaded=false;
      return {profile:null,error:error instanceof Error ? error : new Error(String(error))};
    }).finally(()=>{if(generation === this.topologyGeneration)this.pendingTopology=undefined;});
    this.pendingTopology=promise;
    return promise;
  }

  cancel() {
    this.generation++;this.topologyGeneration++;
    this.snapshotController?.abort();this.topologyController?.abort();
    this.pendingSnapshot=undefined;this.pendingTopology=undefined;
  }
}
