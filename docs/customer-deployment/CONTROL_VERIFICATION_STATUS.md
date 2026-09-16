# PRIZM Control Verification Status

**Assessment date:** 2026-09-11  
**Overall disposition:** NOT READY FOR CUSTOMER REMOTE CONTROL DEPLOYMENT

This document records engineering evidence. It is not authorization to operate equipment and does not replace the customer's commissioning, cybersecurity, safety, or compliance processes.

## Status vocabulary

- **Implemented:** A control path exists in the application.
- **Unit-tested:** Focused automated tests passed in the development environment.
- **Integration-tested:** The request, target service, response, and telemetry readback were tested together.
- **Site-accepted:** An authorized customer witnessed the test against isolated or otherwise approved equipment and signed the result.

No control listed below is site-accepted as part of this assessment.

## Control status

| Control family | Implemented | Automated evidence | Fresh authoritative readback | Current disposition |
|---|---:|---|---:|---|
| String balancing | Yes | Balancing command URL tests passed | Requires supervised target validation | CONDITIONAL / NOT SITE-ACCEPTED |
| EMS application enable/disable | Yes | Guardrail tests passed; unsafe dummy-payload fallback is rejected | Target Java command libraries were unavailable on the development Mac | NOT INTEGRATION-VERIFIED |
| PCS rotation | Yes | No focused command/readback test located | Existing workflow reads cached EMS state after a fixed delay | NOT VERIFIED |
| String rotation | Yes | No focused command/readback test located | Existing workflow reads cached EMS state after a fixed delay | NOT VERIFIED |
| String contactor open/close | Yes | No focused command/readback test located | Poll-triggered readback exists, but the localhost mock fallback is a production blocker | NOT VERIFIED |

## Evidence collected

### String balancing

Command URL construction tests completed successfully using `npx tsx src/server/balancingControlService.test.ts`.

Result: **PASS**. This proves the tested request construction and validation behavior. It does not prove that a live string accepted or applied a balancing command.

### EMS application control

Guardrail tests completed using `npx tsx src/server/ems/dragonAppControl.test.ts`.

Result: **PASS WITH ENVIRONMENT LIMITATION**. The test confirmed that PRIZM fails closed when the required Powin Java command libraries are unavailable. The development Mac did not contain the target Turtle Java libraries, so a real enable/disable payload was not generated or sent.

Target integration testing must run where the required Java classes are available and must capture request, response, fresh EMS state, and audit records.

## Blocking engineering findings

1. The reviewed control API routes do not yet demonstrate authenticated user sessions, role enforcement, CSRF protection, or per-user command identity.
2. Rotation verification relies on cached EMS state after a short fixed delay. A stale value can be mistaken for command verification.
3. Contactor control can fall back to a localhost mock target when the Phoenix endpoint is unavailable. Production builds must fail closed instead.
4. Rotation and contactor controls do not have focused automated command/readback tests in the reviewed test set.
5. Some audit events use a generic local operator identity instead of a verified individual identity.
6. A successful HTTP response currently carries more weight than confirmed equipment state. Remote operations require an explicit requested, dispatched, accepted, verified, mismatch, or unknown transaction state.

## Required acceptance evidence

For every control family, preserve:

- authenticated individual and assigned role;
- UTC request time and unique command ID;
- selected targets and pre-command values;
- exact intended change and reason;
- destination endpoint and transport result;
- parsed application acknowledgement;
- fresh telemetry source and timestamps;
- post-command values for targets and sampled non-targets;
- timeout, mismatch, rollback, or recovery result;
- witness and customer approval record.

## Release decision

Remote read-only evaluation can proceed only through the hardened architecture in the deployment pack. Remote control should remain disabled until the security gates, focused automated tests, target integration tests, and supervised site acceptance tests are complete.
