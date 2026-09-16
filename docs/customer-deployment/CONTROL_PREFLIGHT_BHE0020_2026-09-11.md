# PRIZM control acceptance preflight — BHE0020 Block 1

Date: 2026-09-11  
Test stage: Read-only baseline; no equipment commands issued

## Result

**HOLD — live control acceptance testing is not yet authorized by the application commissioning state.**

PRIZM is connected to the live EMS and its telemetry is current, but automatic commissioning reports `controlsPermitted: false`. The control routes do not currently enforce that flag consistently, so the absence of a route-level rejection must not be treated as authorization.

## Verified baseline

- EMS: `http://10.0.0.3:8080/turtle`
- Station / block: `BHE0020 / 1`
- PRIZM mode: live production; no demo fallback
- Boot state: ready; EMS reachable
- Topology: 8 arrays, 20 energy segments per array, 40 strings per array
- String inventory: 320 live rows
- String communications: 315 nearline, 5 offline
- String rotation: 320 reported out of rotation
- String contactors: Kobold reports the site contactors open. PRIZM incorrectly reported all 320 closed because its fast string-route normalizer allowed stale individual feedback booleans to override the explicit aggregate contactor state. This discrepancy was confirmed and corrected after the initial baseline capture.
- PCS inventory: 8 communicating PCS; all report `Stop`, ready, and out of rotation
- EMS application inventory: 9 applications; ADB0001, CTC0001, and SSPC001 are mapped for enable/disable
- Feather inventory: 167 of 168 reachable during the latest boot scan
- Automated regression suite: passed in full on this host
- EMS application serializer deployment check: failed safely because the required Powin Turtle command classes are not installed at the configured `/home/john/turtle/WEB-INF/lib/*` path

## Control-family preflight

| Control family | Dispatch path present | Fresh state available | Verification assessment | Status |
|---|---:|---:|---|---|
| PCS rotation | Yes | Yes, per-PCS report | Service checks cached block data after only 600 ms and does not force a live refresh | HOLD |
| String rotation | Yes | Yes, strings feed | Service checks cached raw strings after only 600 ms and does not force a live refresh | HOLD |
| String contactors | Yes | Yes, normalized strings | Three forced-poll attempts exist, but a failed Phoenix request falls back to localhost and may be counted as accepted | HOLD |
| String balancing | Yes | Partial | Read-only preflight could not determine ADB0001 status even though the live app inventory reports it enabled; execution has no balancing-state readback | HOLD |
| EMS app enable/disable | Yes for three mapped apps | Yes | The command serializer failed safely on this host because the configured Turtle Java libraries are absent; live command testing is unavailable | HOLD |

## Safe initial candidates after blockers are corrected

The following candidates were selected because fresh telemetry is present and their initial state is explicit. Final selection still requires an approved test record and field coordination.

| Test | Proposed target | Initial state | Test action | Required rollback |
|---|---|---|---|---|
| String rotation | Array 1 / String 1 | Out of rotation; nearline; no active alarm | Set in rotation | Set out of rotation and verify fresh readback |
| PCS rotation | Array 1 / PCS 1 | Stop; ready; out of rotation | Set in rotation | Set out of rotation and verify fresh per-PCS report |
| Contactor | Array 1 / String 1 | Both contactors closed; no mismatch | Open | Close and verify both contactors closed |
| Balancing | Array 1 / String 1 | Out of rotation; ADB reported enabled by app inventory | Use approved short-duration balancing test parameters | Stop balancing; restore ADB state if changed |
| EMS app | Not selected | ADB and CTC enabled; SSPC disabled | Select only through an approved site procedure | Restore the exact captured initial enabled state |

## Required corrections before command testing

1. Enforce the commissioning control-permission gate in every live control route.
2. Add a deliberate commissioning approval action with operator, timestamp, site identity, topology revision, and audit record.
3. Replace cached rotation readback with a forced live poll and bounded retry window.
4. Remove the contactor localhost fallback from production execution; a target connection failure must remain a failure.
5. Make contactor addressing derive from the commissioned topology/IP map rather than a fixed `10.0.<array>.1` formula and fixed 1–8 / 1–40 limits.
6. Correct balancing preflight to read ADB state from the same live application source used by the UI.
7. Add balancing-state readback, including mode, target voltage, charge deadband, discharge deadband, and a verified stop state.
8. Prove the EMS-app command serializer dependencies exist in the deployment image before exposing the control.
9. Store immutable before/command/after evidence for every acceptance step, including source timestamps and rollback result.

## Acceptance rule

A test passes only when all four conditions are true:

1. The requested target and baseline state were captured from fresh telemetry.
2. The exact command endpoint returned a valid acknowledgement.
3. A subsequent independent live readback reached the requested state within the approved timeout.
4. The rollback command was independently read back in the original state.

An HTTP 200 response or body containing `OK` alone is **not** a passing control test.
