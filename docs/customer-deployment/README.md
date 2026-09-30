# PRIZM Customer Deployment Readiness Pack

Document status: **working baseline — not an authorization to deploy remote control**  
Baseline date: 2026-09-11

This directory defines the minimum evidence required before PRIZM is installed for a customer or given remote control capability.

## Release decision

PRIZM is currently suitable for controlled development and supervised site validation. It is **not yet approved for unattended customer remote control**. Production authorization requires every release gate below to be closed by named owners.

## Documents

- `LOCAL_ACCESS_PILOT.md` — opt-in offline accounts, sessions and owned recording access; restricted API pilot blocks legacy routes/UI and is not activated.
- `CONTROL_HARDENING.md` — September 24 local corrections for preparation validation, profile-bound dispatch, fresh PCS readback, bounded requests and protection overrides; offline evidence and remaining identity/deployment gates.
- `API_ACCESS_BASELINE.md` — September 24 offline route inventory, confirmed access/data-export findings, proposed capabilities and remaining review gates; no enforcement activated.
- `AUTHORIZATION_PROTOTYPE.md` — offline permission evaluator, 25-route effect ledger/drift checks, additional open control findings and integration boundaries; not wired to live routes.
- `UI_STANDARDS.md` — shared target, freshness, layout and control-result acceptance rules for the String List/PCS pilot; no redesign deployed.
- `PRODUCT_READINESS_PLAN.md` — September 23 product-polish, security and OT-integration workstreams, evidence gaps and phased acceptance gates; not a deployment approval.
- `SYSTEM_DESCRIPTION.md` — program boundary, components, data paths, trust boundaries, records, and operating modes.
- `REMOTE_ACCESS_SECURITY_ARCHITECTURE.md` — required remote-access design and security acceptance criteria.
- `NERC_FERC_READINESS_MATRIX.md` — applicability questions, current gaps, evidence requirements, and responsible parties.
- `CONTROL_ACCEPTANCE_TEST_PLAN.md` — hardware acceptance tests for PCS rotation, string rotation/contactors, EMS apps, and balancing.
- `CONTROL_VERIFICATION_STATUS.md` — current evidence, limitations, blockers, and release disposition for each control family.
- `MULTI_SITE_COMMISSIONING.md` — bounded LAN EMS discovery, persistent site profiling, topology reconciliation, and fail-closed behavior.
- `CURRENT_NETWORK_VERIFICATION_2026-09-11.md` — read-only commissioning evidence and open findings from the present BHE0020 network.

## Mandatory release gates

1. Customer and compliance counsel document whether the site, responsible entity, assets, and PRIZM host fall within applicable NERC Reliability Standard scope.
2. PRIZM listens on localhost or a dedicated management interface and is not directly exposed to the public internet.
3. Remote access uses customer-controlled identity, phishing-resistant MFA, approved devices, least-privilege policy, encrypted transport, and rapid session revocation.
4. Server-side authorization protects every write/control route. Changing a portal query parameter must never change authorization.
5. Production mode contains no simulated/local-mock fallback for equipment commands.
6. Every command has a unique transaction ID and separately records requested, dispatched, accepted, independently verified, timed-out, and failed states.
7. All control families pass the hardware acceptance plan against the exact customer EMS/firmware versions.
8. Configuration baseline, software bill of materials, vulnerability process, backup, restoration test, incident response, log retention, time synchronization, and change approval are documented.
9. Remote control is initially deployed disabled; read-only remote access is proven before controlled write access is enabled.
10. Customer, site operator, cybersecurity owner, compliance owner, and PRIZM release owner sign the production authorization record.

## Evidence rule

Unit tests and HTTP `OK` responses are not proof of field actuation. A control passes only when the intended target changes, independent authoritative telemetry confirms the requested state within the approved window, non-targets remain unchanged, and the audit record is complete.
