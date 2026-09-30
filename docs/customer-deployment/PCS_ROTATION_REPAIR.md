# PCS rotation repair — 2026-09-26

Two recorded Array 2 / PCS 1 IN attempts were rejected before dispatch because the live EMS inventory uses `arrays[].pcses`, which the command inventory parser did not recognize. The PCS page also ignored unsuccessful result bodies when HTTP returned 200.

Changes:

- Inventory recognizes `pcses` while preserving legacy `pcs`, `arrayPcs`, and flat `arrayPcsList` shapes. Missing/ambiguous target checks remain enforced.
- Verification reads `/tools/report/ems/array/{array}/pcs/{pcs}/report.json`, the existing PCS telemetry source. It uses explicit `arrayPcsData.outRotation`, not operating state or string rotation.
- The report's epoch-millisecond `timeStamp` is normalized. Missing, stale, conflicting target, and future timestamps cannot confirm a command. Two matching reports must both be newer than dispatch and have advancing timestamps for every target.
- Reads remain bounded, at most four concurrent target reads and a ten-second verification window. Commands are not automatically retried. Accepted but unconfirmed remains distinct from verified success.
- The PCS dialog only closes after verified success. Per-target rejection/readback details are surfaced for HTTP-200 failure bodies.

Validation: offline control-hardening regression and UI result tests passed, TypeScript and production builds passed. Read-only live inspection recognized eight PCS units and parsed Array 2 / PCS 1 as IN using its report. No live control was sent; end-to-end actuation remains a separate authorized test.

Local deployment rollback entry files (including unchanged history worker) are in `/tmp/prizm-before-pcs-rotation-hl8VEH`; previous hashed UI assets are retained. Restore saved entry files during an idle runtime restart if needed. Legacy inventory shapes remain covered by regression tests.

```sh
node --require ./scripts/test-network-guard.cjs --import tsx src/server/controls/controlHardening.test.ts
node --require ./scripts/test-network-guard.cjs --import tsx src/lib/rotationCommandResult.test.ts
```
