# PRIZM product and OT integration readiness

Date: 2026-09-23  
Status: proposed engineering acceptance baseline, not certification or deployment authorization.

## Product objective

Deliver a coherent, local-first engineering utility: technicians can identify the site and target, understand data quality, diagnose a condition, execute only authorized actions, and verify the result without navigating inconsistent modules. Security and evidence must be enforced by the service, not implied by a polished interface. PRIZM remains subordinate to EMS authority and equipment protection systems.

This plan supplements the existing readiness matrix, remote-access architecture and control acceptance plan. It does not close their findings or assume that September 11 findings still describe every current control path. Every finding needs revalidation against a named release.

## Current evidence and limits

| Item | Evidence as of this review | Disposition |
|---|---|---|
| Server access boundary | `server.ts` listens on `0.0.0.0`; reviewed control mounts have no central authentication/authorization middleware. `balancingRoutes.ts` checks demo mode, not authenticated permission. | Confirmed release blocker for untrusted/remote access; complete route audit pending. No claim that host firewall exposure was audited. |
| Request sizing | Global JSON parser permits 50 MB. | Replace with justified per-route limits and test uploads separately. |
| Recorder reliability | Local queue tests and two-minute read-only restart verification passed; see `../operational-timeline.md`. | Partial operational evidence, not an endurance or security certification. |
| Audit evidence | Operational timeline is bounded, best-effort, seven-day history with process-local loss counters. | Not a substitute for a protected security/command audit system. |
| Technician experience | Previous iterations retain valuable overhead views and canonical telemetry. No comprehensive usability assessment performed for this plan. | Establish shared UI standards and measure representative tasks before redesign. |
| Customer applicability/identity | Customer categorization, identity provider and approved remote-access platform not supplied. | Decisions required before security activation or external connectivity. |

## Track A — polished technician experience

1. Consistent shell: persistent site/block identity, EMS identity, displayed physical alias alongside standard array naming, authenticated user, access mode, connection state and per-stream freshness. A single green badge must not hide an unavailable source.
2. Coherent navigation: group existing pages into monitoring, diagnostics, authorized controls, history/reports and administration. Preserve direct links and the thermal overhead view. Do not hide urgent faults behind role navigation or collapse state.
3. Shared presentation components: tables, units, timestamps, empty/loading/stale/error states, tooltips, target selectors and command results. Use readable typography, keyboard access and text/icon state cues rather than color alone. Reserve alarm colors for meaningful conditions.
4. Stable rendering: preserve rows, selections, expansion and scroll position across background updates. Show retained values with their age; never substitute zero or green for missing data. No optimistic equipment-state updates.
5. One target context per workflow: selections and bulk counts are explicit; changing an array invalidates incompatible target selections. Physical labels never replace canonical command identifiers.
6. Common action flow: target and parameters, authoritative preconditions, authorization, dispatch, acceptance, verification and final result. A pending result is not success; an uncertain delivery is not safely retryable by default. Show partial-target outcomes. Avoid typed confirmation phrases where policy permits a click, but retain risk-based approvals where required.

Pilot the shared components on String List and PCS before migrating every module. Screenshot comparison, keyboard checks and representative technician tasks must pass. Proposed performance budgets are targets, not present measurements: p95 visible selection feedback under 200 ms and a prepared local view under 1 second on agreed reference hardware. Measure source age separately from HTTP/render latency; do not hide stale acquisition behind a fast UI. Establish controller-safe polling budgets before optimizing cadence.

## Track B — enforceable OT security

1. Enumerate every HTTP route, event stream, upload/download, background task and administrative path, including side effects on nominally read-only requests. Record permission, site scope, data classification and audit requirements. Unclassified routes fail release review.
2. Integrate an established identity mechanism; derive permissions on the server. Define view, diagnose, operate, maintain and administer capabilities, scoped to approved sites/targets. Portal selectors, client flags and local network location do not grant privileges.
3. Protect sessions, request origins, CSRF-sensitive actions, payload sizes and rate limits. Test logout, revocation, expiry, privilege changes and direct API bypass. Production must not fall back to anonymous access when identity fails. Define a customer-approved offline access procedure without shared universal bypass credentials; background telemetry must not depend on an interactive login.
4. Add a distinct durable audit path: authenticated actor, session, site, target, exact permitted parameters, policy decision, transaction ID, dispatch/delivery/readback and configuration changes. Protect records from tampering; define off-host retention, clock integrity, loss alerts and the policy for commands when audit storage fails.
5. Separate telemetry/export credentials from command/maintenance privileges. Validate device certificates/host keys where supported; document narrowly scoped legacy exceptions and compensating network controls. No blanket trust bypass as a deployment default. Protect secrets outside source and browser responses.
6. Harden the host and service: least-privilege account, restricted writable paths, approved ports/destinations, supervised service, disk/CPU/memory limits, certificate lifecycle, protected backups and tested restore. Bind behind the approved HTTPS boundary; no public exposure of port 3000 or equipment protocols.

## Track C — integration and remote capability

Keep telemetry export and remote operation separate. A read-only exporter consumes canonical published observations, not new independent device polls. Define versioned schemas, site identity, units, source timestamps, quality, sequence IDs, bounded buffering, deduplication and receiver authentication. Export only approved fields to approved destinations. A remote portal serves replicated data and clearly indicates disconnected/stale sites. Enforce tenant/site isolation and use per-site credentials.

Route external telemetry through the approved industrial DMZ design. Outbound-established TLS is not physically one-way communication. Assess a unidirectional gateway where the customer requires it. Remote operation requires a separately approved MFA-protected access gateway/intermediate tier, restricted PRIZM access, session revocation and a customer-controlled disconnect. Do not provide portal users general control-subnet routing. Never queue stale equipment commands for replay after reconnect; validate authorization and current preconditions at execution time.

## Release sequence and evidence gates

| Phase | Deliverable | Acceptance gate | Proposed accountable role |
|---|---|---|---|
| 1. Baseline | Complete route/side-effect inventory, permission matrix, threat model, UI task inventory | Every reachable surface classified; assumptions and owners recorded | Product/security engineering |
| 2. Protected local prototype | Identity adapter, default-deny authorization, durable audit and shared status/action components | Isolated tests prove unauthorized requests cannot dispatch; no live controller connectivity | Product/security engineering |
| 3. Supervised local cutover | Hardened service, administrator bootstrap, recovery path and rollback package | Operator access verified before activation; approved restart; read-only parity and separately approved control tests | Site operations + security |
| 4. Read-only remote pilot | Export relay and remote portal | Outage/replay/tenant isolation/certificate tests; local operation unaffected; customer export approval | Customer network/security |
| 5. Remote controls | Restricted control access and acceptance records | Exact targets/limits approved; supervised verification, session kill and audit-failure tests | Site operations + compliance |
| 6. Supported release | Signed release, SBOM, vulnerability/patch process, restore results, manuals and ownership | Independent security assessment, documented exceptions and customer acceptance | Release owner + customer approvers |

Each requirement should have a stable ID, applicability, implementation reference, test result, owner and disposition. Capture release hash and configuration with results. Security exceptions require named approval, compensating controls, expiry and a review date. Keep raw runtime caches, credentials and customer telemetry out of release commits. Use simulated controllers and explicit network guards for routine tests; do not populate evidence by sending live commands without separate authorization.

Begin with Phase 1. Identity-provider selection, production access changes, network exposure, customer exports, live command tests, Git pushes and deployment are not authorized by this planning document. Preserve the operating installation until its cutover is separately approved.

## Standards and claim boundaries

- [NIST SP 800-82 Rev. 3](https://csrc.nist.gov/pubs/sp/800/82/r3/final) is the OT security engineering baseline; its page identifies Revision 4 as a draft, not the replacement final baseline at this review date.
- [ISA/IEC 62443](https://www.isa.org/standards-and-publications/isa-iec-62443-series-of-standards) provides relevant lifecycle and component/system security requirements. Select applicable parts and assessment scope with a qualified assessor; this plan does not assert certification or a security level.
- [NERC CIP standards](https://www.nerc.com/standards/reliability-standards/cip) require customer-specific applicability and effective-version review. A polished application or conformance to another framework does not establish NERC compliance.

Customer cybersecurity/compliance owners must approve their deployment obligations and evidence. Documentation, governance, physical protection, training, incident response and ongoing maintenance are part of readiness, not software features that PRIZM alone can satisfy.
