# PRIZM fleet pilot architecture and rollout

The target is one authenticated fleet workspace accessible from either Solar
Star equipment network. Both networks use 10.0.0.0/16 and have EMS at 10.0.0.3.
Device addresses alone therefore cannot identify a site. This first slice is
read only and is not approval to deploy cross-site controls.

## Isolation and ownership

Run one existing PRIZM collector per isolated site environment, each with its
own profile, working directory, credentials, caches and history. A separate
fleet process receives allowlisted summaries, never raw controller payloads.
It does not switch the existing process-global active profile or poll equipment.
Collector identity must match configured site ID, block ID, station and block.
The summary export also checks the collector's enrolled profile and EMS URL.

The approved Dell candidate now uses two Linux network namespaces rather than
two VMs, because RAM cannot be expanded beyond the installed 8 GB. Each site
gets one physical port, one restricted service account, its own PRIZM process
and private data directory. Both site namespaces may use 10.0.0.15/16 and reach
their own EMS at 10.0.0.3. They must never share a layer 2 bridge or routing table.
Network namespaces isolate network stacks, not the kernel or filesystems;
service permissions and hardening are therefore separate requirements. This is
not equivalent to VM isolation or an air gap.

Restricted internal virtual links connect the site services to Fleet. HTTPS
entry points on each equipment network expose only the fleet application. No
generic HTTP proxy, forwarding, NAT between sites, or device URL supplied by a
browser is permitted. Interface mapping, firewall policy, TLS, identity, memory
load testing and a tested recovery console must pass review before cutover.
The existing host address and physical interfaces remain untouched during lab
validation. The approved candidate is not a completed deployment.

Read-only measurements on September 30 found 7.6 GiB usable RAM. One PRIZM
service had approximately 1.9 GiB anonymous memory, 0.74 GiB file cache and
0.10 GiB kernel accounting. The earlier service-total measurement around 3 GiB
was not an application-only requirement. These observations justify testing a
lighter design; they do not establish capacity for two real collectors.

## First software slice

Keep the existing standalone workspace unchanged. Provide an independently
started read-only fleet service and an opt-in collector summary export. Reuse
the existing salted password hashing and opaque sessions. Fleet authorization
requires a block-scoped telemetry.view grant for each displayed site; hidden
sites must not leak through totals or counts. All control routes are denied.

Poll enrolled collector endpoints centrally with bounded response size and
timeout, no overlapping fetch per site and no redirects. Routes serve prepared
memory state only. HTTPS verifies server certificates; HTTP is permitted only
for explicit loopback tests. Enrollment and service tokens are private files,
not browser configuration. There are no built-in production accounts.

## Metric semantics

The detailed fleet projection adds a schematic site bus with one branch per
array, PCS rotation context, separate HVAC, battery, PCS and availability issue
counts, reported sensor trips, and array-wide cell ranges. It reuses the
canonical snapshot, notification review and array-cell metric builder; no new
device polls are introduced. The one-line is a topology diagram, not proof of
electrical isolation or energized conductors. Rotation is not switch feedback.
Cell extrema span the whole array; averages are means of reporting string
averages, with coverage displayed. Collection-segment placeholders are excluded.
Trip totals require explicit communicating sensor states; missing or unhealthy
sources are unknown, never inferred clear from an empty resettable-fault list.
Sensor coverage is the fraction of reported sensor states that can be classified,
not a claim that every installed enclosure was observed. Its timestamp is the
canonical snapshot report time, not a device-origin event timestamp.
Sensor condition rows preserve the canonical status, enclosure findings, source
and source path, and supplied trip timestamp. Physical trips, communication
failures, high-temperature reports and other reported statuses stay distinct.
Only confirmed communicating TRIPPED states enter the physical-trip count;
NOT_INSTALLED does not generate a communication fault. Missing detail from older
collectors is explicitly identified. The bounded list prioritizes physical trips.
Fleet temperature readings and deltas display in Fahrenheit. Canonical Celsius
measurements are unchanged; supplied system findings retain their original text.
Category counts deduplicate target identities within each severity, and may
overlap between severities/categories. Older collectors without details remain
usable and show detailed coverage as unavailable. Detailed data is bounded and
inherits the same authorization, identity, freshness and rollback protections.

Every value carries source quality and observation time. Failed, stale, future,
missing or identity-conflicting observations cannot enter current totals.
Retained readings remain visible as last known, never silently as current.
Per-metric coverage reports exactly which authorized sites contributed. No
contributors means unknown, not zero. SOC is weighted by compatible installed
capacity and includes only sites with both current values. Warning and alarm
counts are affected-target counts, not unique fault-type counts. Site power
sign conventions and capacity definitions must be verified before deployment.

## Validation and deployment gates

Test duplicate addresses with distinct identities, wrong-site replies, unknown
and zero values, stale sources, partial coverage, weighted SOC, permission
filtering, account revocation, bounded transport, disconnect/recovery and denied
writes. Then typecheck, build, browser-check a clearly labeled loopback fixture,
and verify a real site export against the existing canonical view read only.

No physical-port reassignment or production fleet exposure occurs in this
slice. Production requires trusted HTTPS from both entry points, site identity
confirmation, isolation tests in both directions, resource/load tests, reboot
recovery, and rollback. Cross-site command adapters are a subsequent separately
validated slice; the fleet pilot has no control execution capability.

## Implemented pilot entry points

`npm run build` builds the existing standalone service, sign-in pilot and the
independent `dist/fleet-server.cjs`. Start only the new service with
`npm run start:fleet` after setting `PRIZM_FLEET_CONFIG` to an absolute path to
a private JSON file outside served directories. This does not start equipment
collectors. Existing local account provisioning is reused; passwords are salted
scrypt hashes, never reversible encryption. Fleet cookies and sessions are
separate from standalone sessions. Background refresh does not extend idle
sign-in; user interaction does, with origin and request-token checks.

Configuration fields:

| Field | Requirement |
| --- | --- |
| `origin` | One exact trusted HTTPS browser origin |
| `bindAddress` | Specific private listener address; defaults to loopback |
| `accountsFile` | Absolute private local-account JSON path |
| `tlsKeyFile`, `tlsCertFile` | Absolute TLS file paths for direct HTTPS |
| `collectors` | 1–16 enrolled collectors, no duplicate site IDs or station/block pairs |
| `allowLoopbackHttp` | Test-only opt-in, never permits plaintext LAN traffic |

Each collector has `siteId`, `blockId`, `stationCode`, positive `blockIndex`,
`name`, `url`, and `token`. The URL is fixed to `/api/fleet/site-summary`.
The service token is a separately generated 32-byte or stronger base64url
secret, shared only with that collector. Tokens, account stores and TLS private
keys must stay outside Git and browser assets. The existing private-file loader
requires private POSIX permissions; Windows ACL validation remains a deployment
gate, not a tested Windows security guarantee.

An account sees a site only with an exact `telemetry.view` grant for its
`siteId` and `blockId`, with `scope: {"kind":"block"}`. Target-only grants do
not expose block totals. Disabled or changed accounts invalidate sessions on
the next request. Unknown routes, query overrides and control methods are denied.
Audit metadata goes to the service output; production log collection, retention
and tamper protection still need deployment configuration.

The optional standalone collector export is enabled only by
`PRIZM_FLEET_EXPORT_CONFIG`, an absolute private JSON path. Its fields are
`identity` (enrollment plus exact `profileId` and `emsBaseUrl`), `origin`,
`token`, `tls`, and optional test-only `allowLoopbackHttp`. It prepares the existing
block summary every four seconds. A live identity check rejects a cached
summary after an active-profile change. Missing or invalid export configuration
does not fall through to legacy handlers. Unset the flag and restart to remove
the export entirely.

The secure collector transport uses a separate opt-in HTTPS listener in
the existing collector process, serving only the prepared summary and never
mounting legacy routes. Its configuration requires an explicit private
IPv4 bind address and private certificate/key files. HTTPS origin, service token and
active-site identity checks remain mandatory; forwarded HTTPS headers are not
trusted. Invalid TLS configuration disables the export without changing the
standalone service. Removing the export flag and restarting removes its listener.
There is no fallback on the legacy HTTP port. TLS 1.2 is the minimum; connection,
header and request limits bound the listener. Loopback fixture mode cannot also
specify TLS configuration.

The `tls` object contains:

| Field | Requirement |
| --- | --- |
| `bindAddress` | Exact RFC1918 IPv4 interface address or loopback; no wildcard, hostname or public address |
| `keyFile` | Absolute path to the provisioned PEM private key |
| `certFile` | Absolute path to the PEM certificate chain |

The listener port comes from `origin` (443 when omitted); port zero is rejected.
Use a reviewed internal-link address, not a placeholder or physical-site address
copied from a lab. Certificate names/IP subject alternatives must match the
enrolled collector URL. On POSIX, key and certificate files must be regular,
non-symlink files with owner-only permissions (for example 0600), owned by the
service user or root, in a directory not writable by group or others. Each file
is limited to 64 KiB. Provision credentials separately; startup does not generate
certificates or log secrets.

For a private CA, set `NODE_EXTRA_CA_CERTS` to its trusted CA bundle when starting
the Fleet process. Restart Fleet when changing that trust bundle; Node reads it
at launch. Do not use `NODE_TLS_REJECT_UNAUTHORIZED=0`; collector startup rejects
that setting. See [Node's certificate-trust documentation](https://nodejs.org/api/cli.html#node_extra_ca_certsfile).
Trusted site certificates and firewall allowlists remain deployment work. Do
not enable plaintext LAN export or use a generic device proxy as a workaround.
Likewise, access from both equipment networks
still requires the reviewed namespace/entry-point design; the pilot's one-origin
listener is not itself that network deployment.

`npm run test:fleet-tls` tests two synthetic collectors using temporary
loopback-only HTTPS listeners and a one-day test certificate. It requires Node,
OpenSSL and permission to bind local sockets. It is separate from the guarded
offline suite because it intentionally exercises actual loopback TLS; it does
not contact equipment. Its temporary credentials are test-only, not suitable for
deployment.

## Validation status — 2026-09-30

- Dedicated collector HTTPS tests passed locally on macOS/Node 24: distinct
  site identities, verified certificates through the real Fleet fetch transport,
  cross-site token rejection, wrong-host and untrusted-certificate rejection,
  denied writes/routes, spoofed-forwarded-header denial on the legacy HTTP port,
  private-key permission checks, address collision, shutdown and restart, early
  cancellation, and missing-TLS fail-closed behavior. This is synthetic transport
  validation, not live two-site telemetry or Windows/Linux security validation.
- Focused offline tests cover null versus zero, freshness, clock skew, weighted
  SOC, partial totals, permission filtering, wrong-site replies, source-field
  parity, response bounds, route denial, account revocation and profile changes.
- TypeScript and production build passed; the existing offline regression suite
  passed. No dependencies were added.
- Browser sign-in, fleet totals, site selection, quality detail and return to
  fleet overview were checked against two loopback-only simulated collectors.
  A native browser fetch binding fault found during validation was corrected.
- The localhost service was unavailable on port 3000. A read-only request to the
  existing Dell PRIZM service succeeded: BHE0020 / Block 1, fresh EMS Modbus and
  canonical data at 2026-09-30T18:22:50Z. Projection parity passed for measured
  power, target, installed capacity and warning-target count. This verifies
  adapter semantics, not a deployed authenticated collector connection.
  Stored energy is intentionally unknown until a complete authoritative rollup
  is validated.
- The compiled fleet runtime started against private fixture enrollment and two
  simulated collector endpoints; authenticated totals matched 1,970 kW and
  55.3% weighted SOC. A control request returned 403. Graceful shutdown passed.
- Dell networking, namespace provisioning, site identities, certificates, resource sizing,
  cross-network isolation, Windows/Linux runtime validation and real collector
  fleet export parity remain production gates. No remote server or equipment was changed.

### Detailed dashboard validation

The expanded dashboard uses prepared details with no component-owned acquisition.
The fixture contains eight arrays and 320 strings per site, separate HVAC/battery/
availability findings, and a reported heat-sensor trip. The UI offers independent
site focus, clickable array branches, station reset, Fahrenheit display,
and category filtering without changing collectors or equipment state.

Detailed tests cover cross-site snapshot rejection, sensor identity and unknown
states, array-wide extrema, collection placeholders, stale ranges, deduplicated
issue targets, multiple-PCS ambiguity, older collectors, payload bounds, and
rendering without invalid numeric values. Captured canonical data from BHE0020
produced eight arrays; Array 1 yielded 20/23.235/28 °C and 3340/3474.35/3502 mV
(min/mean/max), with 40 of 40 strings. Its older notification review was absent
and remained unknown. Only four sensor states were present in that captured
snapshot; those cannot establish full-site sensor coverage.

Fleet tests, the complete guarded PRIZM regression suite, TypeScript and the
production build passed. Browser checks verified both site panels, isolated site
focus and return, array selection/station reset, temperature-unit conversion,
and HVAC-only notification filtering. Selection persisted through background
refresh, and the final preview had no browser console errors. The documentation
records these boundaries so a polished preview is not mistaken for a completed
two-network deployment.

The read-only pilot and export remain opt-in. No PCS switch state is inferred
from rotation, no controls are exposed, and this dashboard does not change the
pending network isolation or production deployment gates above.

For a disposable browser fixture, run `node --import tsx scripts/fleet-preview.ts`
from the repository. It binds only 127.0.0.1 ports 3191–3193 and reports the
private temporary file containing its random, test-only login. Every page is
marked simulated. Stop that process to remove all fixture listeners and erase
in-memory sessions. This script cannot issue equipment commands.

Rollback for the fleet slice is simply stopping the separate fleet service and
leaving the collector export flag unset. It does not replace or migrate
standalone profiles, data stores, authentication or control paths.

## Namespace validation on the Dell

On September 30 the user approved testing network namespaces instead of VMs.
The disposable test in `scripts/test-fleet-namespaces.sh` passed on the Dell's
Ubuntu host. It created five temporary namespaces using only virtual links:
two synthetic site collectors, two synthetic EMS devices and a Fleet test
network. Both collectors used 10.0.0.15/16; both EMS fixtures used 10.0.0.3/16.
All interfaces were created inside the lab. No physical ports were moved.

Verified outcomes:

- Each collector read its own correctly identified synthetic EMS.
- The Fleet test network received distinct summaries from both collectors.
- Each simulated site network reached its own 10.0.0.15 listener.
- Cross-site access failed in both directions, even with explicit test routes.
- The Fleet test network could not directly reach either equipment network.
- Enabling forwarding only inside the Fleet lab still failed to cross sites;
  the namespace firewall's drop counter confirmed packets were blocked.
- Normal cleanup preserved host IPv4/IPv6 routes, addresses, forwarding settings
  and firewall rules. No lab namespace remained.
- An interrupted second run returned the expected timeout status 124. A fresh
  inspection found no remaining lab namespaces or fixture processes. The
  existing PRIZM service remained active with its original PID 1148 and the
  physical interface addresses were unchanged.

The test uses unauthenticated synthetic HTTP only inside disconnected virtual
networks. It does not validate production TLS, browser access to the combined
Fleet workspace from each real LAN, service-account/filesystem isolation,
actual controller telemetry, memory capacity, startup ordering or reboot
recovery. The fixtures are not production PRIZM processes. Successful results
must not be presented as a completed two-site deployment or a security audit.

To repeat on an approved Linux host, keep the two lab scripts together and run
`sudo timeout --signal=TERM --kill-after=10s 60s bash scripts/test-fleet-namespaces.sh --run-isolated-lab`.
The required tools are Bash, iproute2, nftables, Node, curl, timeout and sysctl.
The script changes only namespaces that it successfully creates and removes
them on normal exit or handled interruption. Forced process termination or host
failure still requires inspection for leftover namespaces before rerunning.

The private TLS collector listener is implemented and locally tested; it has not
been provisioned on the Dell. Next gates are restricted site-facing Fleet entry
points, per-service certificates, accounts and data directories, bounded memory/cache
configuration, and a representative two-collector load test. Do not reduce
polling correctness or disguise stale readings to fit a memory budget. Record
RSS/anonymous memory, file cache, swap activity, memory pressure, cycle latency
and source freshness during the load test. A tested iDRAC or local console and
a reviewed rollback procedure are still required before physical-port cutover.
