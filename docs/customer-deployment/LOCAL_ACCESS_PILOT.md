# Local offline identity and owned jobs

Status: **restricted, opt-in access pilot; not activated or approved for production**. September 24, 2026.

## Unified workspace and sign-in design

Next integration slice: an authenticated, read-only site workspace at the pilot root. One explicit `GET /api/access/telemetry` requires a block-scoped `telemetry.view` grant, checks enrolled profile/station/block/EMS identity against the cached canonical snapshot, and rechecks authorization/site after reading. The read service never starts acquisition or invokes equipment controls. Its response is an explicit allowlist of display fields, not raw payloads, configuration, credentials, job records or arbitrary source metadata. Background refreshes do not extend server idle expiry. The client clears data on sign-out, session expiry, permission loss or site conflict, and marks retained data stale on transient unavailability. This slice does not enable legacy operational routes or command panels.

Technician and operator are no longer separate screen selections. The common workspace retains navigation preferences and palettes; merging presentation does not merge or expand server grants. Old browser-stored names are not authentication and are discarded. Legacy operation is explicitly labeled as having sign-in disabled.

The pilot serves a dedicated email/password screen followed by a read-only-by-default workspace: string status, source timestamp/quality, warning/alarm counts and corrective actions. The separately enabled single-string control adapter adds an explicit row-level review/confirmation panel only for an account with matching-site control grants. The legacy operational workspace and its polling providers remain unmounted while route review is incomplete. Only the sign-in document and compiled assets are public; all legacy APIs, control aliases and documents remain denied. Vite builds both entries. Pilot UI requires a production build, including for an isolated loopback test.

The session-scoped client data store refreshes the cached view every four seconds with no overlap. Hidden tabs skip refreshes; data older than 15 seconds is marked stale. Permission/site errors clear telemetry rather than retaining it; transient service failure retains explicitly stale data. Unmount aborts requests and rejects late responses. The page signs out locally at the server-reported idle or absolute deadline. For now, interacting with this read-only page does not renew idle time; sign-in/page reload authenticates again. An explicit user-activity renewal flow is future work, not an automatic polling keepalive.

Email is a local account identifier, not cloud authentication: trim surrounding whitespace, lowercase, reject invalid/overlong ASCII addresses, and enforce uniqueness. Provisioning and login share the same normalization. No email verification or internet connection is implied. Immutable account IDs continue to own jobs. Old username-only pilot stores must be explicitly migrated by an administrator to an `email` field, retaining IDs, password hashes and grants; they are not accepted silently.

Passwords are never decrypted. The server derives a salted scrypt hash from the submitted password and compares it with the stored hash. PRIZM does not persist plaintext passwords, password hashes, or session tokens in browser storage; password fields are cleared after submission. Browser password-manager behavior is controlled by the user. Sessions remain HttpOnly cookies, and CSRF values remain in memory. LAN deployments require reviewed TLS before credentials are entered.

## Boundary and architecture

Private account file → password verification → opaque server session → exact route/capability check → site/owner check → bounded service adapter.

The browser's portal, role, username, requestedBy and owner fields never establish authority. Administrators provision named accounts on the host. Grants use explicit enrolled site/block IDs. Telemetry/history/recording require block scope; the separately opted-in single-string contactor adapter supports target-scoped `controls.contactors` grants. No authority is inferred from technician/admin role names or a client-supplied principal.

The global pilot gate is installed before legacy API handlers and their large body parser. It consumes every `/api` request without falling through. A second gate serves only `/`, `/signin`, `/signin.html` (the dedicated sign-in page), the logo and compiled JS/CSS assets. It denies all other paths, including `/tools`, `/turtle`, source maps, server bundles, private files and the normal operational entry. Unset `PRIZM_ACCESS_MODE` retains legacy backend behavior and the unified workspace; **that legacy mode remains unauthenticated** and visibly says sign-in is not enabled. Unknown mode values refuse startup. Missing/malformed pilot files return unavailable, never legacy access.

## Implemented safeguards

- Salted scrypt password hashes, N=131072/r=8/p=1; no plaintext/default password. Provisioner requires a hidden terminal prompt and at least 15 characters. No passwords in command arguments, environment variables or audit events.
- Random 256-bit session tokens in HttpOnly/SameSite=Strict cookies; Secure on HTTPS. Only token hashes are stored in session memory. No browser-storage token. Login rotates the browser's previous session; duplicate session cookies are rejected.
- Eight-hour absolute lifetime and 15-minute idle expiry. Restart invalidates sessions. Every authenticated request reloads account state: disable, deletion, password/grant/revision edits revoke old sessions; re-enabling does not revive them.
- Same-origin and session-CSRF-token checks for state-changing requests, including logout. Login requires the enrolled Origin. Host/transport checks reject unsolicited hostnames; forwarded headers are not trusted.
- Bounded global/account/peer login attempts, two concurrent password hashes, 128 sessions, 16 KiB request bodies. These are pilot limits, not a distributed DoS defense.
- Private ownership ledger binds kind/job ID to site, block, immutable account ID and originating session ID. Same owner may reconnect with a new valid session and current grants. Other accounts receive a generic unavailable result, not job metadata. Unknown legacy jobs are never adopted automatically.
- Site-bound thermal recordings persist their canonical site identity and pause before appending data from a different or unavailable site. In-memory thermal targets/history are cleared on site changes.

Password/session design references: [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). These safeguards do not establish NERC applicability, OT compliance or authorization for remote control.

## Enabled pilot routes

| Method/path | Requirement |
|---|---|
| GET `/api/access/config` | Trusted transport/Host in pilot; returns only mode. Legacy mode returns `disabled`. |
| POST `/api/access/login` | Email and correct local password, trusted transport/Origin, rate limits |
| GET `/api/access/session` | Active server session |
| GET `/api/access/telemetry` | Active session plus explicit block-scoped `telemetry.view`; cached snapshot matches enrollment; no query overrides; does not renew idle expiry |
| POST `/api/access/logout` | Active session, Origin and CSRF |
| GET `/api/access/jobs/:kind/:id` | `history.view` for enrolled block **and** matching job owner/site |
| POST `/api/access/recordings` | `diagnostics.record` for enrolled block, Origin/CSRF, valid current targets/duration; binds returned job to caller |
| POST `/api/access/recordings/:id/stop` | Same recording capability and owner/site, Origin/CSRF |
| POST `/api/access/controls/contactors` | Disabled by default; private enrollment opt-in, current session/CSRF, enrolled fresh topology and `controls.contactors` covering the single string, rechecked immediately before dispatch |
| GET `/api/access/controls/contactors/:array/:string` | Read-only target review; same adapter opt-in and target capability; fresh enrolled topology; returns expiring reviewed revision; no dispatch |
| GET `/api/access/controls/receipts/:id` | Read-only historical receipt; enabled adapter, current session, originating account and enrolled block-scoped `history.view`; never dispatches or declares current equipment state |
| GET `/api/access/recovery` | Owner/site-filtered saved-command list; requires `history.view`; no telemetry acquisition or idle renewal |
| GET `/api/access/recovery/:id` | Compare an owned command to fresh canonical contactor feedback; requires history, telemetry and matching target-control permission; no equipment command |
| POST `/api/access/recovery` | CSRF-protected explicit review record; repeats authorization/freshness/revision checks before private persistence; never releases target, retries or changes equipment |

All other routes/methods—including HEAD/OPTIONS, legacy control aliases and other equipment commands—are denied in pilot mode even to a privileged account. The [single-string contactor adapter](CONTACTOR_ACCESS_ADAPTER.md) requires explicit `allowSingleStringContactors: true` enrollment. The signed-in UI shows row-level review only when the session advertises the adapter and a matching-site control grant; the server still checks the exact target independently. Reviews expire and submissions bind their topology revision. All other command panels remain unavailable. Provisioning presets never grant equipment permissions. The job port currently reads site-bound recording metadata; balancing results need an owner-bound creation adapter before they can be visible. Legacy singleton morning reviews remain denied because their stable owned-job lifecycle has not yet been integrated. The new generic ledger is not retroactive proof of their ownership.

Recording creation and ledger commit cannot be atomic across the legacy recorder and ownership file. If ownership persistence fails after creation, the recording is inaccessible through this API and requires supervised host-side reconciliation; it is never exposed anonymously or automatically retried. Existing queued/background jobs are not revoked or cancelled by the incoming HTTP gate.

## Provisioning and activation — staged, not performed

1. Choose a private directory **outside the repository, web root and exported report directories**, owned by the service account. Only that account/root should have access. Do not commit or upload security files.
2. Run the host-side provisioner as that account:

   ```sh
   node --import tsx scripts/security/addLocalAccount.ts /absolute/private-directory tech@example.com enrolled-site-id enrolled-block-id recorder
   ```

   Both presets create explicit `telemetry.view` and `history.view` grants. `recorder` additionally grants `diagnostics.record`; `viewer` cannot start/stop recordings. Existing accounts are not automatically changed or given new grants. This creates `accounts.json` and an initially empty `owners.json` with private permissions; it never grants equipment controls. It refuses duplicate accounts and concurrent edits. Only a temporary provisioning lock created by that invocation is removed. A process crash may leave its lock or temporary file; inspect before manual cleanup.

3. Create private `pilot.json` (0600) in that directory, using **verified existing profile values**, not guesses:

   ```json
   {
     "origin": "https://approved-hostname",
     "siteId": "enrolled-site-id",
     "blockId": "enrolled-block-id",
     "profileId": "existing-profile-id",
     "stationCode": "verified-station-code",
     "blockIndex": 1,
     "emsBaseUrl": "http://verified-ems-host:8080/turtle",
     "allowLoopbackHttp": false
   }
   ```

   The current app serves HTTP; HTTPS termination and trusted-proxy handling are **not provisioned by this change**. HTTPS pilot access requires a separately reviewed TLS deployment. For isolated host-only testing, `origin: "http://localhost:3000"` plus `allowLoopbackHttp: true` permits only a directly connected loopback peer; it does not permit the Dell LAN HTTP address or trust `X-Forwarded-Proto`.

4. If separately authorized to opt into the contactor adapter, initialize its receipt ledger only for a new pilot after verifying no unresolved commands exist. Run as the private directory owner:

   ```sh
   node --import tsx scripts/security/initializeContactorReceipts.ts /absolute/private-directory --new-pilot-no-unresolved-commands
   ```

   This refuses existing storage and does not grant controls or enable the adapter. Never use it to replace missing/lost history. Missing or invalid storage with the adapter enabled blocks pilot startup. Unresolved commands persist across restarts/accounts; a crash-held lock requires supervised host-side recovery. The command recovery panel can save owner-bound review evidence (up to 20 reviews per command); it cannot unlock, prune or establish that an earlier EMS request has drained. Target release remains unimplemented pending a verified site reconciliation procedure.

5. Only after maintenance approval and a production build, stage `PRIZM_ACCESS_MODE=pilot` and `PRIZM_ACCESS_DIRECTORY=/absolute/private-directory` in a separate test deployment. The root shows sign-in, then the read-only pilot workspace. Without a `telemetry.view` grant, telemetry is denied. Complete reviewed route adapters are still required before enabling the full operational UI. No real accounts, mode flags, TLS configuration, operational restart or deployment have been applied by this task.
5. Emergency account recovery is host-admin controlled: disable an account or increment its version to revoke sessions. Provision a different named account if needed. Do not transfer job ownership, add control grants, or remove access enforcement as an automatic recovery action. Private audit rotation/retention and a reviewed ownership-recovery tool remain deployment work.

Rollback: the pilot is inactive by default. Returning an isolated test process to the legacy build/config is possible but **removes authentication**; do not use that as a remote production fallback. Leave the running installation unchanged until a complete release and rollback checkpoint is approved.

## Tests and remaining gates

```sh
node --require ./scripts/test-network-guard.cjs --import tsx src/server/security/localAccessPilot.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx src/server/security/recordingSiteBinding.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx src/access/SignInPage.test.tsx
node --require ./scripts/test-network-guard.cjs --import tsx src/access/AccessTelemetryStore.test.tsx
node --require ./scripts/test-network-guard.cjs --import tsx src/server/security/readOnlyTelemetryService.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx src/server/security/contactorAccess.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx src/server/security/contactorReceipts.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx src/server/security/contactorRestart.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx src/server/security/commandRecovery.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx src/server/security/recoveryLifecycle.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx src/access/RecoveryWorkflow.test.tsx
node --require ./scripts/test-network-guard.cjs --import tsx src/access/recoveryClient.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx scripts/security/initializeContactorReceipts.test.ts
npm run lint
```

HTTP tests use a temporary Unix-domain socket and fake services; the network preload still blocks HTTP clients/TCP/TLS/UDP equipment access. The sandbox may require permission for the local socket. Tests use temporary private account/owner files and fixture passwords only. No real accounts or equipment are involved.

Still required: operational-workspace login integration with a complete reviewed route allowlist, trusted enrollment and finer target scope, control adapters with reauthorization before every compound side effect, owned balancing/morning-review creation and cancellation, audit retention/tamper protection and ownership recovery, revocation of long-running streams/tasks, TLS and deployment validation. Do not describe this pilot as whole-application access control or a completed compliance release.

Validation record (September 24): guarded Unix-socket HTTP tests, site-bound recording tests, existing thermal recorder regressions, prior control-hardening/policy/classification regressions, repository type checking, strict standalone checks for the new account/session/ownership/router and provisioner modules, and whitespace checks passed. Client/server bundles built in `/tmp/prizm-local-access-build.OsBarb`; the existing large-client-chunk warning remains. The deliberate missing-enrollment test logs that access is blocked. No application server was started, no real account was provisioned, no production files were generated, and no equipment command was sent. The Unix-socket fixture server is test-only and closes when the suite finishes.

Email/unified-UI follow-up validation (September 24): updated guarded HTTP tests passed, including email normalization, username-only rejection, private-file protection and the public sign-in asset allowlist. Sign-in rendering checks, authorization/control-hardening regressions, site-bound recording regression, classification regression, full type checking, strict new-module checking and isolated client/server builds passed. Build location: `/tmp/prizm-email-access-build.ZQafWg`; existing large-chunk warning unchanged. In-app browser validation used a loopback-only fixture with no production services: wrong-password rejection, cleared password field, mixed-case email login, session restoration after refresh and sign-out were verified. No real accounts, operational server restart or equipment writes. Full operational UI integration and deployment parity remain pending; do not deploy this as completed application-wide authentication.

Read-only workspace validation (September 24): guarded access tests passed for denied/unauthenticated reads, wrong-site scope, changes during reads, revocation, logout during account lookup, query-override rejection, denied writes and passive-refresh idle expiry. Model tests cover snapshot identity, missing-vs-zero values, stale/future timestamps, duplicate identities and exclusion of raw/private fields. Client-store tests cover request coalescing, stale retention, permission loss, hidden tabs, freshness expiry and late responses after logout. Existing control-hardening, recording binding and route-classification regressions passed. Type checks and isolated client/server build passed in `/tmp/prizm-readonly-access-build.tzhaXD` (existing chunk-size warning remains). Browser tests with an explicitly labeled fixture verified sign-in, four-second updates, array filtering, corrective actions and sign-out. The fixture server was stopped afterward. Production runtime, accounts and equipment were untouched; deployment/live parity still requires a separately approved test.
