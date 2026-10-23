import {StringStreamState, type StringStreamView} from './stringStreamState';
import {workspaceReadUrl} from './fleetWorkspace';
import {stringStreamHealth, releaseStringStream, STRING_STREAM_SILENCE_MS} from './stringStreamHealth';

/** Uses PRIZM's existing canonical GET/SSE feeds, not a device poller. */
export function subscribeStringList(onView: (view: StringStreamView) => void, onRecovery: (recovering: boolean) => void): () => void {
  const state = new StringStreamState();
  let stopped = false, connected = false, inFlight = false, generation = 0;
  let controller: AbortController | null = null;
  let requestTimeout: number | null = null;
  const owner = {};
  const optimized = new URLSearchParams(window.location.search).get('stringRefresh') !== 'legacy';
  let lastEvent = Date.now();
  let published: StringStreamView | null = null;
  let readySeen = false;
  let metadataSupported = false, lastLoadAt = 0;
  const startedAt = Date.now();
  let established = false, failed = false;
  let reconcileFirstReady = false;
  const publish = () => {
    if (stopped) return;
    if (state.view && state.view !== published) { published = state.view; onView(state.view); }
    stringStreamHealth(owner, optimized && metadataSupported && connected && !state.recovering, lastEvent);
    const silent = Date.now() - lastEvent >= STRING_STREAM_SILENCE_MS;
    if (connected && !state.recovering && !silent) { established = true; failed = false; }
    // Waiting for ready + the first snapshot is normal, not a lost stream.
    // Never renew this startup budget on ready/reconnect; explicit failures and
    // post-startup gaps still warn immediately, even with cached rows available.
    onRecovery(failed || silent || ((established || Date.now() - startedAt >= STRING_STREAM_SILENCE_MS) && (!connected || state.recovering)));
  };
  const load = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    lastLoadAt = Date.now();
    const requestGeneration = ++generation;
    const requestController = new AbortController();
    controller = requestController;
    const timeout = window.setTimeout(() => requestController.abort(), 10_000);
    requestTimeout = timeout;
    try {
      const response = await fetch(workspaceReadUrl('/api/local/site-data/strings-fast?shape=list'), {cache: 'no-store', signal: requestController.signal});
      if (!response.ok) throw new Error('String snapshot unavailable');
      const snapshot: unknown = await response.json();
      if (stopped || requestGeneration !== generation) return;
      if (!state.snapshot(snapshot)) {
        // First ready can overtake the bootstrap GET. Reject an old epoch or
        // version, then reconcile once immediately instead of waiting 4 seconds.
        if(reconcileFirstReady){
          reconcileFirstReady=false;inFlight=false;void load();return;
        }
        failed = true; state.disconnected();
      }else reconcileFirstReady=false;
      publish();
    } catch {
      if (!stopped && requestGeneration === generation) {
        failed = true;
        state.disconnected();
        publish();
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestGeneration === generation) {inFlight = false;reconcileFirstReady=false;}
    }
  };
  const stream = new EventSource(workspaceReadUrl('/api/local/site-data/strings-stream?shape=list-v2'));
  stream.addEventListener('ready', event => {
    try {
      const ready = JSON.parse((event as MessageEvent).data);
      const firstReady=optimized && !readySeen;
      state.ready(ready.transportEpoch, ready.version);
      connected = true;
      metadataSupported = ready.stringRefreshVersion === 1;
      readySeen = true;
      lastEvent = Date.now();
      if(firstReady){
        // Start HTTP and SSE together. The first ready must not cancel useful
        // bootstrap work; epoch/version checks still gate every accepted row.
        if(state.view && state.snapshot(state.view)){publish();return;}
        reconcileFirstReady=inFlight;
        publish();if(!inFlight)void load();return;
      }
      // An earlier connection's response is no longer eligible, even after a restart.
      generation++;
      controller?.abort();
      if (requestTimeout !== null) window.clearTimeout(requestTimeout);
      inFlight = false;
      publish();
      void load();
    } catch { failed = true; state.disconnected(); publish(); }
  });
  stream.addEventListener('strings', event => {
    try {
      const accepted = state.delta(JSON.parse((event as MessageEvent).data));
      if (accepted) lastEvent = Date.now();
      publish();
      if (!accepted) void load();
    } catch { failed = true; state.disconnected(); publish(); void load(); }
  });
  stream.addEventListener('error', () => {
    connected = false;
    failed = true;
    state.disconnected();
    publish();
  });
  onRecovery(false);
  // Do not put the first visible rows behind the stream handshake/watchdog.
  // Only reconnects (not initial ready) cancel an earlier connection's GET.
  void load();
  const watchdog = () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!optimized) { void load(); return; }
    if (Date.now() - lastEvent >= STRING_STREAM_SILENCE_MS) {
      state.disconnected(); publish();
    }
    // A late ready event must not extend the first-snapshot startup budget.
    if (!established && Date.now() - startedAt >= STRING_STREAM_SILENCE_MS) publish();
    if (!readySeen || !connected || state.recovering || (!metadataSupported && Date.now()-lastLoadAt >= 10_000)) void load();
  };
  const timer = window.setInterval(watchdog, optimized ? 4_000 : 10_000);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', watchdog);
  return () => {
    stopped = true;
    generation++;
    controller?.abort();
    if (requestTimeout !== null) window.clearTimeout(requestTimeout);
    stream.close();
    window.clearInterval(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', watchdog);
    releaseStringStream(owner);
  };
}
