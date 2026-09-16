# PRIZM Control Acceptance Test Plan

## Status

This plan is not permission to operate equipment. Testing requires the customer’s written procedure, identified site authority, safe equipment state, approved window, rollback method, and an independent observer. Begin in a simulator or physically isolated/locked-out environment, then progress to supervised site tests.

## Common pass criteria

For every test:

- Confirm station, block, array, device and expected pre-state from authoritative telemetry.
- Record firmware/EMS/PRIZM versions, topology profile, time source and participants.
- Use one unique transaction ID.
- Verify server-side authorization and stale-data inhibition.
- Dispatch exactly once and preserve the raw upstream response.
- Force a fresh authoritative post-command acquisition; do not verify from a pre-command cache.
- Confirm target state, non-target state, alarms/interlocks and recovery.
- Record Requested, Dispatched, Accepted and Verified/Mismatch/Timeout separately.
- Demonstrate abort, timeout, partial-failure and retry behavior.
- Export the audit record and reconcile it with EMS/controller logs.

## Current code findings to close before formal testing

| Control | Finding | Required correction |
|---|---|---|
| String/PCS rotation | Acceptance uses HTTP/body `OK`; readback may inspect cached strings/block after only 600 ms and does not force a new poll | Command ID, fresh-cycle barrier, bounded repeated authoritative readback, explicit unknown/mismatch |
| String contactors | Direct Phoenix command falls back to a localhost mock; generic successful HTTP responses can be accepted | Remove mock fallback in production, narrow accepted response schema, enforce site-profile target bounds |
| Balancing | Preflight/deadband logic exists, but end-to-end target and outcome parity must be proven against Kobold/EMS | Golden payload fixtures plus independent per-string state/deadband readback |
| EMS apps | Fresh readback retries exist, but routes lack authenticated role enforcement | Server authorization, app allowlist, transaction audit, firmware/version compatibility matrix |
| All reviewed controls | `confirmed: true` is request data, not authenticated human authorization | Authenticated session identity, permission check and anti-CSRF protection |

## Test suite A — PCS rotation

1. Single PCS IN from known OUT state.
2. Single PCS OUT from known IN state.
3. Whole-array PCS IN and OUT.
4. Already-in-requested-state behavior.
5. Stale/unavailable PCS telemetry inhibition.
6. Upstream rejection, timeout and malformed response.
7. Partial array actuation and explicit mismatch reporting.
8. Verify unrelated arrays and PCS units remain unchanged.
9. Compare PRIZM request and result with the established EMS/Kobold workflow.

## Test suite B — string rotation

Repeat the PCS sequence for a single string and an entire array. Verify the authoritative field and mapping for every affected string, including known out-of-rotation and not-communicating cases.

## Test suite C — string contactors

1. Single-string open and close.
2. Whole-array open and close only where the approved site procedure permits.
3. Low/high cell-group voltage alarm flag combinations.
4. Unsupported-flag response.
5. Verify both contactors independently when telemetry exposes both states.
6. Confirm a missing target, invalid array/string, unreachable Phoenix and ambiguous HTTP response cannot report success.
7. Confirm no simulator/local fallback is reachable in production mode.

## Test suite D — balancing

1. OFF and PROVIDED mode for one string.
2. Approved array/site selection behavior.
3. Charge and discharge deadband boundary values, zero, maximum approved value and invalid values.
4. Already-correct targets skipped without collateral commands.
5. Confirm exact payload/URL parity with the known-good EMS/Kobold command.
6. Fresh readback of balancing mode, configured value, charge deadband and discharge deadband.
7. Mixed success and not-communicating targets.
8. Confirm string identity, energy segment and side mapping.

## Test suite E — EMS applications

1. Enable and disable each explicitly supported application code.
2. Reject unknown/read-only applications.
3. Already-enabled/disabled idempotency.
4. Fresh EMS readback through multiple cycles.
5. Confirm application dependencies, priority/order and site operating impact with the customer.
6. Verify unrelated applications remain unchanged.

## Acceptance record

Each row must capture: test ID, requirement, build hash, site/asset, preconditions, target, command payload hash, dispatch time, upstream response, verification source and cycle, observed result, non-target check, audit record ID, evidence attachments, tester, witness, deviations, disposition and signatures.

No control family is released remotely until every required test passes on the customer-supported firmware/EMS combination and the customer approves the resulting operating procedure.

