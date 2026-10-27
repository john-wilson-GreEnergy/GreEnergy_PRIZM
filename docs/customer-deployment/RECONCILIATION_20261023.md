# Dell source reconciliation audit — 2026-10-23

Historical report. The owner's later Dell-authoritative decision and the
subsequent source changes are recorded in the
[October 27 report](RECONCILIATION_20261027.md). The undeployed features described
below are no longer retained in the main source line.

## Status

For the subsequent source-publication handoff, see
[Home development](HOME_DEVELOPMENT.md). The no-commit/no-push statements below
describe the audit at the time it was performed, not later publication activity.

Clean dependency installation, TypeScript checking and two complete builds passed.
All 124 build artifacts were byte-identical across the two builds in the same
isolated directory. **The entire working tree is not yet production-equivalent.**
Do not deploy this full build as a substitute for the scoped Dell release.

No application-source changes were needed for the deployed safety-filtering
functions: their editable equivalents are already present. On 2026-10-23 the
owner chose to keep one working tree and document differences, rather than create
a separate production-baseline branch. Unpublished work remains in place; this
report and the captured release artifacts distinguish it from the deployed code.
Full interface/server parity remains unverified. The existing working tree was
not reset, stashed, cleaned, committed or pushed.

## Live release reference

Read-only SSH inspection found SS3 and SS4 active on
`safety-filtering-collector-20261022/dist/server.cjs`, SHA-256
`2db7595091fc7738abc7e85e8ca6b83cb2c3399b10b76d1e0f1dff400ef4fb33`.
Fleet was active on `safety-filtering-20261022/dist/fleet-server.cjs`, SHA-256
`97d3507cdbf5ad9524488b96d540257d38eec78f66cce677d2b030dc3614157e`.
PIDs remained 1523328, 1523527 and 1523723 respectively at the inspection.

The captured release reference is the ignored directory
`deployment/production-baselines/dell-20261022`. Its original limitations still
apply: SS4's worker symlink requires an administrator read for independent
verification, installed dependency trees were not copied, and file hashes do not
prove which bytes an already-running Node process loaded earlier.

## Source/release reconciliation evidence

| Deployed change | Editable source | Evidence |
| --- | --- | --- |
| Safety discovery/filtering, duplicate and identity safeguards | `src/server/safetyFaultClear.ts`, `src/server/safetyFaultIdentity.ts` | Eight function definitions match deployed code after lexical binding/format normalization; synthetic regression tests pass |
| Summary panel and selection workflow | `src/components/SafetyFaultCandidatesPanel.tsx`, `src/components/SafetyFaultClearView.tsx`, `src/lib/safetyFaultSelection.ts`, `src/components/SiteOperationsDashboard.tsx` | Deployment builder maps to these sources; rendering, selection and mocked execute-route tests pass |
| SOC units, string deltas, source freshness, per-array power projection | `scripts/soc-strings-runtime.ts` and its source imports | Rebuilt sidecar is byte-identical; 320-row synthetic stream and power-flow tests pass |
| Persistent animation values | `src/components/SitePowerFlow.tsx`, `src/components/powerFlowPresentation.ts` | Retention tests preserve source timestamps/deadlines, handle zero, stale/missing/future readings and remove missing topology |
| Storage display/presence | `src/lib/storagePresentation.ts`, `src/components/ConnectionSettings.tsx`, `src/server/storage/storageMaintenance.ts` | Missing/empty/unavailable, invalid sizes, permission errors and symlink tests pass |
| Profile controls and remote administration | `src/server/fleet/*`, `src/fleet/AdminUsers.tsx` | Synthetic account and Unix-socket tests pass: password, CSRF/origin, grant/revoke, session invalidation, audit failure and rollback |
| Snapshot retention | `src/server/telemetry/SnapshotRetentionWorker.ts` | Runtime sidecar byte-identical; worker executable text identical except source-map trailer; worker tests pass |
| Entry relay/history/cache workers | `src/server/fleet/entryMain.ts`, history/cache worker sources | Four rebuilt bundles byte-identical to the captured runtime reference |

The AST comparison is deliberately scoped. It does not execute production
bundles, ignore arbitrary numeric suffixes, or treat matching functions as proof
of matching routes, imports, initialization, UI or all permission behavior.

## Known working-tree differences from production

1. **Shared corrective guidance is unpublished.** Current source adds shared
   catalogs, configuration, trusted headers and editor scope/revision fields.
   Deployment builders explicitly omit this work. Affected files include
   `src/server/notifications/correctiveGuidance.ts`, `prizmDataCoordinator.ts`,
   Fleet `main.ts`, `workspaceGateway.ts`, `workspaceCollector.ts`, and the
   corrective-guidance/editor/review components. In particular the current editor
   sends a `scope` field, while the deployed local-only guidance route accepts
   only its older request shape. These cannot safely be mixed arbitrarily.
2. **String startup preloading is unpublished in the UI server sidecar.**
   `src/server/fleet/workspaceUi.ts` imports `stringStartupPreloads.ts` and can
   generate specialized HTML; the deployed `workspace-ui.cjs` does not contain
   that path. Current rebuilt sidecar hash:
   `c522d33b752bd2999582bd7595c274390cd712ceda533a9a985ee5f88d047158`;
   deployed hash:
   `877ab5734c3753dc31fdee0cc02b848dce0ccb41b07671c8bf1146a0a965d83c`.
   No latency-related source or setting was modified during this audit.
3. Collector account parsing also includes newer remote-control-field validation;
   the deployed Fleet has that validation via its profile-controls factory, but
   the older collector bundle does not. This needs role-specific review, not
   blanket removal of account validation.
4. The current source build and incremental production build have different
   frontend graphs, bundling and entry initialization. Whole-program parity and
   live acceptance of a full rebuild remain unverified.

## Validation performed

- Fresh locked install: `npm ci --ignore-scripts --no-audit --no-fund` in an
  isolated source copy. The initial offline install could not complete because
  the cache lacked a package; the subsequent approved registry install passed.
- `npm run lint` (`tsc --noEmit`): passed.
- `NODE_OPTIONS='--require ./scripts/test-network-guard.cjs' npm run build`:
  passed twice, 124 matching artifact hashes.
- `npm run test:safety-candidates`, `npm run test:collector-processing`:
  passed with inherited network guard.
- Power-flow presentation/projection, storage presentation/presence, account
  management, SOC/string regression and snapshot-retention worker tests passed.
- Workspace gateway current/rollback permission tests passed over temporary
  Unix sockets with TCP/TLS blocked.
- Remote administration integration test passed using synthetic accounts in a
  private temporary directory, with only fixture Unix sockets permitted.
- Local toolchain: Node 24.14.0, npm 11.9.0, Vite 6.4.2. Captured Dell runtime:
  Node 24.21.0. Cross-platform/toolchain reproducibility is not asserted.

Re-run scoped parity after a build:

```sh
node --require ./scripts/test-network-guard.cjs scripts/dell-source-parity-lib.test.mjs
node --require ./scripts/test-network-guard.cjs scripts/check-dell-source-parity.mjs deployment/production-baselines/dell-20261022
```

The second command currently exits **2**, reporting the real UI-sidecar
difference. That is intentional: a green subset must not be reported as a green
production-equivalence gate. Captured baselines are not in Git; securely transfer
the previous baseline archive when working on another computer.

## Preservation and safety

The 1,204 original allowlisted source/build files were re-hashed against the
pre-audit snapshot and all remained byte-for-byte unchanged. New verification
helpers and this report are additive. No equipment commands, service restarts,
server writes, data cleanup, latency settings changes or GitHub push occurred.
Temporary test cleanup affected only synthetic fixture directories.

## Single-working-tree workflow

Keep the current working tree, including unfinished shared corrective guidance
and startup preloading. Do not remove those changes or treat them as deployed.
No separate production-baseline branch is planned under the owner's decision.

Before another deployment, explicitly select and review the intended changes,
repeat the relevant offline parity/build tests, and verify the artifact manifest,
rollback plan and acceptance checks. A successful full build does not authorize
deploying all pending work or prove that it matches the Dell.

For the next release, record the source commit, an exact source snapshot if the
tree is dirty, build environment and release hashes together. Update this list
of differences as changes are deployed or reviewed.

At audit completion, no commit or push had been performed, so cloning the remote
did not include these updates. The subsequent publication workflow is documented
in HOME_DEVELOPMENT.md. The previous handoff archive predates this audit's new
verification helpers and documentation.
