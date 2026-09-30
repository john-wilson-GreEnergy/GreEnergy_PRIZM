import {StringStreamState, type StringStreamView} from './stringStreamState';

/** Uses PRIZM's existing canonical GET/SSE feeds, not a device poller. */
export function subscribeStringList(onView: (view: StringStreamView) => void, onRecovery: (recovering: boolean) => void): () => void {
  const state = new StringStreamState();
  let stopped = false, connected = false, inFlight = false, generation = 0;
  let controller: AbortController | null = null;
  let requestTimeout: number | null = null;
  const publish = () => {
    if (stopped) return;
    if (state.view) onView(state.view);
    onRecovery(!connected || state.recovering);
  };
  const load = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    const requestGeneration = ++generation;
    const requestController = new AbortController();
    controller = requestController;
    const timeout = window.setTimeout(() => requestController.abort(), 10_000);
    requestTimeout = timeout;
    try {
      const response = await fetch('/api/local/site-data/strings-fast?shape=list', {cache: 'no-store', signal: requestController.signal});
      if (!response.ok) throw new Error('String snapshot unavailable');
      const snapshot: unknown = await response.json();
      if (stopped || requestGeneration !== generation) return;
      if (!state.snapshot(snapshot)) state.disconnected();
      publish();
    } catch {
      if (!stopped && requestGeneration === generation) {
        state.disconnected();
        publish();
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestGeneration === generation) inFlight = false;
    }
  };
  const stream = new EventSource('/api/local/site-data/strings-stream?shape=list');
  stream.addEventListener('ready', event => {
    try {
      const ready = JSON.parse((event as MessageEvent).data);
      state.ready(ready.transportEpoch, ready.version);
      connected = true;
      // An earlier connection's response is no longer eligible, even after a restart.
      generation++;
      controller?.abort();
      if (requestTimeout !== null) window.clearTimeout(requestTimeout);
      inFlight = false;
      publish();
      void load();
    } catch { state.disconnected(); publish(); }
  });
  stream.addEventListener('strings', event => {
    try {
      const accepted = state.delta(JSON.parse((event as MessageEvent).data));
      publish();
      if (!accepted) void load();
    } catch { state.disconnected(); publish(); void load(); }
  });
  stream.addEventListener('error', () => {
    connected = false;
    state.disconnected();
    publish();
  });
  onRecovery(true);
  void load();
  const timer = window.setInterval(load, 10_000);
  return () => {
    stopped = true;
    generation++;
    controller?.abort();
    if (requestTimeout !== null) window.clearTimeout(requestTimeout);
    stream.close();
    window.clearInterval(timer);
  };
}
