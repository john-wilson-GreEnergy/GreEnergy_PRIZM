# API access and side-effect baseline

Reviewed: 2026-09-24. Source: local working tree based on `1382108`, with substantial uncommitted changes. This is not evidence about the Dell server's deployed build.

Status: **initial static inventory and proposed policy; no access enforcement installed**. No application modules were executed by the inventory, no equipment was contacted, and no service settings were changed. Phase 1 remains open until every handler and background operation has an approved classification.

Follow-up: `AUTHORIZATION_PROTOTYPE.md` records 25 handler-effect classifications (395 literal registrations still unclassified), route-file drift checks, an isolated permission evaluator and additional open control findings. This does not activate authentication or close the full-route review gate. The raw inventory still labels every entry `review: required`; the separate classifier reports the narrower handler-effect review status.

## Reproduce without starting PRIZM

From the repository root, with existing development dependencies installed:

```sh
node --require ./scripts/test-network-guard.cjs --import tsx scripts/security/apiInventory.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx scripts/security/apiInventory.ts server.ts > /tmp/prizm-api-inventory.json
```

The inventory reads source through the TypeScript compiler, resolves imported/barrel-exported routers and nested/aliased mounts, and writes JSON to standard output. It does not import `server.ts`, initialize schedulers or contact controllers. It exits 1 when unresolved paths or syntax findings need review; this is expected for the current dynamic workspace registrations. Do not use `npm run verify` for this offline audit: its bundle verifier starts application runtime.

The observed baseline contains **420 literal method/path registrations** (258 GET, 147 POST, 5 PUT, 10 DELETE), seven middleware entries, and one unresolved dynamic registration. Counts include aliases, conditional demo routes and the SPA fallback; they are not a count of unique production operations. Each entry contains its source location, handler references, registration fingerprint and lexical registration context. All entries deliberately remain `review: required`. A fingerprint covers registration text, not transitively called services.

Manual expansion of `WorkspaceProjectionRoutes.ts`'s loop adds five GET paths under `/api/local/workspaces/engineering/`: `topology`, `performance`, `schedulers`, `modbus`, `parity`. These are not included in the 420. Do not silently ignore the scanner finding.

Limitations: not a runtime reachability or authentication proof. Middleware can serve additional paths; conditional code is not evaluated; computed paths, router factories, reassignment, registration through helper functions and runtime plugins require manual review. Default Express HEAD behavior for GET, automatic OPTIONS and wildcard matching are not expanded into additional entries. Review these when enforcing policy. Generated reports belong in temporary/release evidence storage, not source control. Capture the exact release and working-tree state when collecting release evidence.

## Confirmed findings

| ID | Evidence | Required disposition | Proposed owner |
|---|---|---|---|
| ACCESS-01 | `server.ts` mounts controls without a common authenticated authorization layer; reviewed balancing, contactor, rotation and EMS-app handlers dispatch service calls without an authenticated principal check. Demo/confirmation checks are not authentication. | Default-deny server permissions before untrusted or remote access. Test direct calls, not only buttons. | Security + backend |
| ACCESS-02 | `server.ts` listens on `0.0.0.0`; its global JSON body limit is 50 MB. Host firewall and actual outside reachability were not inspected. | Customer-approved bind/HTTPS boundary and per-operation payload/concurrency limits. No exposure changes during this audit. | Deployment owner |
| ACCESS-03 | `dragonAppControl.ts` and `powerControl.ts` take `requestedBy` from input for the protobuf username; Feather and balancing routes also accept caller attribution. | Derive actor from verified server session; retain user-entered reason separately. Never trust an attribution string as identity. | Backend |
| ACCESS-04 | `POST /api/devices/:id/diagnose` can pass device details/logs to `GoogleGenAI` if `GEMINI_API_KEY` is configured. Its prompt asks for write/bypass suggestions. Source inspection only; no request sent and no claim of historical export. | Remove unsafe diagnostic suggestions; isolate/disable external diagnostics by default and require explicit customer data-export policy. Diagnostics must remain read-only and local-first. | Product + security |
| ACCESS-05 | Storage cleanup/history-clear/cache-clear routes call destructive local maintenance services; thermal `/storage` changes recorder settings. | Separate data-deletion and retention permissions from ordinary viewing/diagnosis. Define protected audit retention outside operator-clearable history. | Backend + records owner |
| ACCESS-06 | Feather `/apply` accepts SSH/sudo credentials and confirmation; ioLogik routes import firmware, change golden configuration and apply to devices. | Separate scan, artifact import, configuration and firmware-deployment permissions; protect/redact secrets and enforce enrolled target identity. | Maintenance + security |
| ACCESS-07 | `GET /api/local/snapshot?refresh=true` requests coordinator refresh. Thermal POST `/targets/query` and `/site-history/query` perform reads. | Classify by actual effect, not GET versus POST. Give forced acquisition a bounded diagnostic permission distinct from cached viewing. | Backend |
| ACCESS-08 | Debug reset/rebuild routes can use `isLoopbackRequest`; an environment flag permits remote resets. | Loopback is not an authenticated role, especially behind a local reverse proxy. Require explicit admin permission and test the proxy trust boundary. | Security |
| ACCESS-09 | Provisioning bundle validation/select accepts a server-side `bundlePath`, reads expected files and can store validation history. | Review canonical path/symlink containment, approved import roots, file limits and sensitive-result redaction before granting remote use. This is not yet a confirmed traversal exploit. | Maintenance + backend |
| ACCESS-10 | Legacy successful-looking control mocks are conditional on `ENABLE_LEGACY_CONTROL_MOCKS`; external telemetry mocks are conditional on demo flags. | Release configuration must exclude command mocks. Test them as denied/unavailable, never accepted field actuation. Do not infer these are active on the running instance. | Release owner |

Source review does not prove that every underlying service is safe or that every route lacks all safeguards. Target bounds, delivery behavior, downstream authority, secrets, filesystem effects and called services still require per-operation review.

## Proposed capability matrix

These are **proposed capability IDs, not implemented roles or permissions**. Each grant needs site/block scope and, where applicable, canonical array/string/PCS scope. Customer-approved roles are sets of explicit grants; administrator does not automatically imply equipment operator. Portal selectors and physical aliases never grant access.

| Capability | Representative surfaces | Effect / scope | Required audit and limits |
|---|---|---|---|
| `telemetry.view` | Prepared site-data snapshots, PCS/string views, workspace projections, SSE | Read authorized site's published observations | Access/session evidence; per-source freshness; cap stream count; revoke active streams when access expires |
| `history.view` | Thermal queries, operational timeline, notifications/history | Read scoped retained telemetry; includes read-only POST queries | Bound time range, target count, points and query concurrency |
| `diagnostics.read` | Raw source/Modbus maps, device reports, topology evidence | More sensitive topology/raw observations | Redact secrets; scope targets and report fields |
| `diagnostics.acquire` | Forced refresh, Modbus live probes, Feather/ioLogik scans, diagnostic capture | Device network reads; may update caches/local records | Audit requester, enrolled destination and query bounds; shared scheduler budget; no arbitrary network proxy |
| `diagnostics.record` | Diagnostic sessions, thermal recordings, morning review jobs | Local jobs/files, not equipment operation | Bound jobs/disk, ownership and cancellation; audit start/stop |
| `reports.export` | Report generation/download and profile exports | Data leaves service to the requesting client | Explicit site/field scope, redaction, export attribution and retention |
| `controls.contactors` | `/api/local/strings/contactors` | Live string/array equipment command | Exact target expansion, fresh preconditions, transaction ID, per-target readback |
| `controls.rotation` | `/api/local/strings/rotation`, `/pcs/rotation` | Live string/PCS rotation | Canonical targets and array-level optimization only after scope validation |
| `controls.balancing` | `/api/local/balancing/execute` | Live balancing with requested deadbands | Record mode, units, requested versus confirmed values; independent verification |
| `controls.ems-apps` | EMS app `/enabled-status` | Block-level app enable/disable | Display block-wide consequence; recheck current app ownership/state |
| `controls.power` | EMS app `/power-control` | Site/block real/reactive power requests | Explicit units/sign convention, site-approved limits, enabled state separate from setpoints |
| `controls.thermal` | Fan holds and HVAC simulation command paths | Potential repeating equipment writes | Approved duration, ownership, stop/revocation/restart semantics; preview separately classified |
| `controls.indication` | Lightbar dispatch/live visualizer | Physical indications/repeating writes | Never conceal safety alarms; bounded scope and expiry |
| `controls.test` | Balancer-test start/stop | Live equipment test, not a read-only diagnostic | Approved test target, limits, termination and independent outcome |
| `controls.safety-clear` | Safety fault clear | Safety-related equipment command | Separate explicit grant and site procedure; never a bypass permission |
| `maintenance.configure` | Feather serial apply, ioLogik configuration apply | Device changes and service restarts | Exact target list, backup, artifact/version evidence, verified recovery |
| `maintenance.firmware` | ioLogik firmware apply | Device firmware update/reboot | Approved artifact hash/model/version, maintenance window, recovery plan |
| `artifacts.import` | Firmware import, provisioning bundles, map uploads | Server files/configuration inputs | Size/type/hash/path validation; uploading must not imply permission to deploy |
| `configuration.manage` | Profiles/topology activate/import, thresholds, ioLogik golden rule, sensor overrides | Changes future authority, targets or interpretation | Before/after values, actor/reason; invalidate incompatible selections/jobs |
| `storage.manage` | Retention changes, cleanup, history/cache deletion | Local record deletion and collection policy | Exact data scope, recoverability, protected audit trail; no silent reset of evidence |
| `runtime.admin` | Reinitialize, scheduler/cache/debug reset, demo toggles | Application acquisition/runtime behavior | Not a grant to control equipment; deny production demo controls; audit configuration changes |
| `external.export` | Optional external diagnostics and future remote telemetry | Off-LAN data transfer | Default disabled, approved fields/destination/credentials, loss and retry policy |

No prefix-wide permit should be generated from this table. Mixed-purpose families need **method + matched route + parameter-sensitive** policy. In particular a balancing workflow that disables ADB requires both balancing and EMS-app permissions; moving targets out of rotation additionally requires rotation permission. Preflight must explain every side effect, and execution must independently reauthorize every step. A stopped or rejected workflow must not quietly undo a separate operator's changes.

## Default-deny acceptance contract (not yet active)

1. Every operation maps to a reviewed capability and canonical site/target scope before calling any side-effecting service. Unknown route/action/parameter combinations deny by default; public health responses expose no telemetry, network map or secrets.
2. Reject missing/expired/revoked identity, wrong site/target, insufficient capability and stale preflight before dispatch. Audit denials without logging passwords/tokens. Existing EMS safety interlocks remain authoritative.
3. UI hiding is convenience only. Repeat tests by direct HTTP, alternate mount aliases, trailing slash/HEAD/OPTIONS behavior, nested routes and malformed targets. SPA fallback must not turn missing API routes into apparent success.
4. Browser writes need approved session/origin/CSRF protections. Cap bodies, active streams, scans and exports per actor/site. Do not authorize based on the client-provided operator string, source LAN address or a query parameter.
5. Test session loss midstream, long-running job revocation, restart and partial command delivery. Never replay uncertain commands automatically. Distinguish accepted, independently verified, pending, partial, expired and failed outcomes.
6. Use simulated dispatchers and the network guard. Authorization tests must assert **zero calls** to device transports on rejection. Deployment and supervised live acceptance require separate approval.

## Remaining inventory work

- Review all 420 entries, the five dynamic paths and seven middleware registrations, including static/dev serving and aliases (`modbus`/`telemetry`, `site-distribution`/`site-health`). No route is cleared merely because this tool found it.
- Trace deeper services for the unreviewed topology, cache, history, report, knowledge, diagnostic, sensor, HVAC and device-acquisition operations. Identify file writes, indirect dispatch, CPU/memory amplification, raw credentials and request-selected destinations.
- Inventory non-HTTP entry points: startup commissioning, polling, scheduled firmware inventory, storage maintenance, recorders, fan-hold timers, lightbar visualizer, installer/updater/uninstaller, SSH/scripts and service configuration. Separate read acquisition, local persistence and periodic equipment writes.
- For each operation record owner, source/version, capability, accepted parameters, target scope, data classification, network/filesystem effect, audit evidence, rate/body limits, authorization test and review disposition.
- Customer decisions before enforcement: approved local/offline identity, roles/site ownership, command-audit failure policy, retention/export policy, emergency access and recovery. Do not implement a universal fallback password or require cloud availability for local telemetry.

The next implementation gate is an isolated authorization prototype using fake controllers, not activation on this operating site. This baseline does not establish regulatory compliance or authorize remote deployment.

## Validation record

September 24 local checks: inventory fixture tests passed (nested mounts, aliases/barrels, method chains, duplicate registrations, conditional context, unresolved route/mount paths, unmounted routers and deterministic output). Fixtures deliberately throw if executed; the scan reads them without execution under the network guard. `npm run lint` passed. The inventory tool bundled successfully to a temporary directory; production `dist` was not rebuilt. Repository `git diff --check` passed. The real-source scan returned the expected nonzero review status for the dynamic workspace loop, not a clean/approved security result. No authentication activation, application restart, live command, commit, push or deployment was performed.
