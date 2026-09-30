# Independent page loading and selective subscriptions

## Scope — 2026-09-25

This first application-wide optimization separates topology loading from the
canonical telemetry request and reduces unrelated React work. It does not change
EMS/Modbus acquisition intervals, device controls, source authority, historian
retention or command verification. No Java rewrite or additional broker process
is required for this step.

## Architecture

- `SiteDataRequests` owns separate cancellable HTTP lanes for snapshot and topology
  reads. Both timeouts cover response-body consumption, not just response headers.
- Topology failure is reported separately and retains the previously loaded layout;
  it does not increment telemetry polling failure counts or block useful telemetry.
- Topology reads share a pending request and are reused after success. Explicit
  refresh starts a fresh request; failures remain retryable on later shared polls.
- A new page supersedes an older snapshot request. Delayed older responses are
  ignored even if a transport ignores cancellation. Overlapping requests for the
  same view share work. Conditional-response tokens are scoped to view/payload
  shape and committed only after existing quality checks accept the snapshot.
- Existing source freshness, data-loss rejection, alarms and connection indicators
  remain authoritative. An unchanged HTTP response is a transport heartbeat, not
  evidence that previously degraded telemetry has recovered.
- A stable `SelectedStore` powers page subscriptions. Pages subscribe to the fields
  they use; poll-start timestamps and other bookkeeping do not notify snapshot-only
  consumers. The full and optional hooks remain available for unmigrated consumers.
- Memoized page boundaries prevent the shell's one-second clock from redrawing
  unchanged Overview, Strings, Site Health, PCS, Feather, ioLogik, One-Line and
  Thermal pages. Their own state and subscribed telemetry still update normally.
- The application shell can display a page once telemetry loading finishes rather
  than waiting for boot/connection/diagnostic metadata. Page-specific loading and
  unavailable states still apply.

## Validation and measured comparison

`npm run test:site-loading` covers independent loading, topology failure/retry,
single-flight reads, delayed obsolete responses, view/shape-specific tokens,
quality-rejected revisions, cancellation, body timeout and selected subscriptions.
The existing compact/full snapshot quality regression also passes.

In a deterministic store test, 100 heartbeat-only publications generated 100 broad
notifications and zero snapshot-only notifications. A changed snapshot still
generated its notification. This is a subscription measurement, not a claim of
100% end-to-end CPU savings.

The separately compiled `SiteDataContext.fixture.tsx` was exercised in the in-app
browser with all HTTP acquisition mocked (no equipment access):

- Telemetry appeared while topology was deliberately held pending.
- The loading rollback waited until topology was released.
- Releasing topology and refreshing unchanged telemetry increased heavy-page render
  count from 2 to 5 under broad subscriptions; selective subscriptions stayed at 2.
- A shell tick caused no additional heavy-page render; publishing changed telemetry
  immediately changed its value and increased the render count from 2 to 3.

The production build was installed and the idle local runtime restarted. Browser
checks confirmed rendering and navigation for Overview, PCS, Strings (320 targets),
Thermal (including the overhead view), Feather and One-Line (8 arrays). The final
frontend was reloaded and One-Line showed live context. Snapshot and topology
read APIs returned HTTP 200. These are functional smoke checks, not a fleet-wide
latency benchmark. No equipment commands or firmware/configuration uploads were
sent during this optimization pass.

TypeScript checking, full `npm test` including pretests, Vite production build and
esbuild server build passed locally on macOS. No Windows/Linux runtime execution
was performed; implementation uses browser APIs and portable TypeScript/Node tooling.
The existing large Site Health bundle warning remains; chunking/history worker
isolation and further per-device subscriptions are later optimization stages.

## Rollback

`?siteLoading=legacy` restores coupled waiting for comparison. It retains the new
cancellation and error protections. `?siteSubscriptions=legacy` restores broad
context-field subscriptions for comparison; memoized page boundaries remain.

For a full runtime rollback, previous `index.html`, `signin.html`, `server.cjs` and
`server.cjs.map` were byte-verified in `/tmp/prizm-before-independent-PJWsFZ`.
Restore those entry files to `dist` and restart the idle local PRIZM runtime.
Previous hashed assets remain available; no saved device data is changed or deleted.
