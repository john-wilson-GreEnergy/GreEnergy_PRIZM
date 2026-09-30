/** Hand-reviewed handler-effect ledger. NOT runtime policy or deployment approval. */
export interface RouteClassification {
  method: string;
  path: string;
  capabilities: readonly string[];
  effect: string;
}
export interface FamilyClassification {
  file: string;
  sha256: string;
  caveat: string;
  routes: readonly RouteClassification[];
}
const route = (method: string, path: string, capabilities: readonly string[], effect: string): RouteClassification => ({ method, path, capabilities, effect });
const thermal = '/api/local/site-data/thermal';

export const routeClassifications: readonly FamilyClassification[] = [
  {
    file: 'src/server/balancingRoutes.ts', sha256: '0aa7248ee1b5c1391a4dbf75980298a4bd9fc600d4bbdebe707e70f1abf3b1c3',
    caveat: 'Execution includes conditional EMS-app/rotation writes; job IDs need site/owner binding. Service review is incomplete; this hash covers the route file only.',
    routes: [
      route('GET', '/api/local/balancing/verification/:id', ['telemetry.view'], 'Read process-local verification job; resolve job ownership/site before returning it.'),
      route('GET', '/api/local/balancing/capabilities', ['telemetry.view'], 'Read implementation capability flags; not a fresh device interrogation.'),
      route('POST', '/api/local/balancing/preflight', ['diagnostics.acquire'], 'Read EMS BlockViewer app state and cached rotation; no intentional equipment write.'),
      route('POST', '/api/local/balancing/execute', ['controls.balancing'], 'Live balancing/stop; optional controls.ems-apps for block-wide ADB disable or controls.rotation for selected strings. Logs, timeline, background readback jobs.'),
    ],
  },
  {
    file: 'src/server/rotationRoutes.ts', sha256: '2beda348cbf6f4e9f791938f1b6a3e78c842dc7e8000ca516824442c1946b036',
    caveat: 'Local hardening uses profile-bound commands and two new PCS readbacks, with all-target aggregate verification. EMS-listed PCS coverage is not independently enrolled inventory; deployed acceptance and authenticated scope remain open.',
    routes: [
      route('GET', '/api/local/capabilities', ['telemetry.view'], 'Static declared capabilities, not authorization or field acceptance evidence.'),
      route('GET', '/api/local/rotation/capabilities', ['telemetry.view'], 'Alias for static declared capabilities.'),
      route('POST', '/api/local/strings/rotation', ['controls.rotation'], 'Live EMS string/array rotation GET downstream; verification reads and local history.'),
      route('POST', '/api/local/pcs/rotation', ['controls.rotation'], 'Live EMS PCS/array rotation GET downstream; fresh inventory/readback acquisitions and local history.'),
    ],
  },
  {
    file: 'src/server/contactorControlRoutes.ts', sha256: '2ef84a1ccf5f536c942abe8f0e3b61ae8b2e449667b7f64e3d8fb3f22b675411',
    caveat: 'Local executor rejects protection overrides; builder alone is not a safety boundary. Keep pilot adapters deny-by-default for bypasses. Authenticated scope and end-to-end deployment acceptance remain open.',
    routes: [route('POST', '/api/local/strings/contactors', ['controls.contactors'], 'Live EMS string/array open/close, target locks, readback and broker/history updates.')],
  },
  {
    file: 'src/server/ems/emsAppRoutes.ts', sha256: 'e8b0049f3e80c08f7a047e9d184a06e04687480948868f65b025c88227e2a817',
    caveat: 'Client actor strings are not identity. Power service validation/readback time bounds and configuration defaults require further hardening; no enforcement installed.',
    routes: [
      route('GET', '/api/local/ems-apps/control-capabilities', ['telemetry.view'], 'Fast app-state service read; refresh/live cache-policy variants also require diagnostics.acquire and can request coordinator refresh.'),
      route('POST', '/api/local/ems-apps/power-control', ['controls.power'], 'Block-level power configuration protobuf, HTTP readback, timeline and audit-file writes.'),
      route('POST', '/api/local/ems-apps/enabled-status', ['controls.ems-apps'], 'Block-level EMS app enable/disable via service; audit and verification must remain separately attributed.'),
    ],
  },
  {
    file: 'src/server/thermal/thermalRoutes.ts', sha256: '516eb1b560cb72a5b58c3b669d5ef9e1c9fd670f249e12b6432633c551bee0d6',
    caveat: 'Lazy thermal service initialization can create local directories/load history even on a GET. No equipment-control service is invoked by these handlers. SiteHistory internals, ownership and job limits still need full review.',
    routes: [
      route('GET', thermal, ['telemetry.view'], 'Prepared thermal readings plus storage, sessions and review status.'),
      route('POST', `${thermal}/morning-review`, ['diagnostics.record'], 'Starts local historical analysis job; not a live scan or equipment command.'),
      route('GET', `${thermal}/morning-review`, ['history.view'], 'Read current local analysis status/results; scope result data to site.'),
      route('POST', `${thermal}/morning-review/cancel`, ['diagnostics.record'], 'Cancel local review job; require job ownership or explicit administrative authority.'),
      route('POST', `${thermal}/targets/query`, ['telemetry.view', 'history.view'], 'Query/rank cached readings plus recorded device catalogue; POST is a read.'),
      route('GET', `${thermal}/history`, ['history.view'], 'Read memory or selected recording, filter/normalize/compress results.'),
      route('POST', `${thermal}/recordings`, ['diagnostics.record'], 'Persist local session and subsequently record ingested telemetry.'),
      route('POST', `${thermal}/recordings/:id/stop`, ['diagnostics.record'], 'Persist stopped session; does not stop equipment. Scope to job/site/owner.'),
      route('GET', `${thermal}/storage`, ['history.view'], 'Read recorder status/storage metadata.'),
      route('POST', `${thermal}/storage`, ['storage.manage'], 'Change recorder enabled state, retention and disk policy; potential subsequent pruning.'),
      route('GET', `${thermal}/site-history`, ['history.view'], 'Read scoped history with bounded query and disconnect cancellation.'),
      route('GET', `${thermal}/history-devices`, ['history.view'], 'Read historical device catalogue, including site network metadata.'),
      route('POST', `${thermal}/site-history/query`, ['history.view'], 'Read selected history using a request body; not a write permission solely because POST.'),
    ],
  },
];
