# Home development — source and exact deployed-file reference

## Current production reconciliation status

The owner chose Dell-authoritative source on 2026-10-27. Read the
[current reconciliation report](RECONCILIATION_20261027.md) before making changes.
Known undeployed additions have been removed from this source line and preserved
on `archive/pre-dell-sync-20261027`. The owner subsequently approved committing
the [exact deployed application files](../../deployment/deployed-runtime/dell-20261027/README.md)
alongside editable source. This reference matches the included Dell application
files byte-for-byte, verified read-only on October 27. A full source rebuild is
still not proven equivalent; this is not authorization to replace the Dell release.

Reconciliation completed for the known differences:

- Shared corrective-guidance catalogs, headers and editor fields are removed
  together; source now uses the deployed site-local contract.
- Undeployed string startup preloading is removed; the UI-serving sidecar now
  rebuilds byte-identically to the Dell reference.
- Collector and Fleet account parsers are separated to match their respective
  deployed behavior without weakening Fleet controls-permission validation.
- Complete frontend/server equivalence remains unverified despite passing
  scoped parity tests and a fresh isolated build. See the report's remaining work.

## Get the code

```sh
git clone https://github.com/john-wilson-GreEnergy/GreEnergy_PRIZM.git
cd GreEnergy_PRIZM
git log -3 --oneline
node scripts/verify-deployed-runtime.mjs
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
```

The audit used Node 24.14.0 and npm 11.9.0; the captured Dell used Node 24.21.0.
Use the committed lockfile. Do not copy the Mac's node_modules to another machine.
Dependency installation needs registry access, but no connection to the Dell.

For a network-blocked build and synthetic safety regression tests on macOS/Linux:

```sh
NODE_OPTIONS='--require ./scripts/test-network-guard.cjs' npm run build
npm run test:safety-candidates
npm run test:account-roles
node --require ./scripts/test-network-guard.cjs scripts/dell-source-parity-lib.test.mjs
node --require ./scripts/test-network-guard.cjs scripts/deployed-runtime.test.mjs
node --require ./scripts/test-network-guard.cjs scripts/check-dell-source-parity.mjs
```

Do not start the normal server, live preview, enrollment, deployment or verifier
scripts against real equipment just to check a build. Some scripts contain fixed
deployment targets. Use explicitly synthetic fixtures and mocked transports.
Do not copy production accounts, keys, tokens, connection profiles or telemetry
into a home preview. Windows shell syntax differs; this is not a Windows runtime
qualification.

## Publication boundary

This handoff includes editable application code, tests with synthetic values,
build/release tooling, reconciliation notes, and the explicitly approved exact
deployed-code reference. No new runtime-data changes, captured site fixtures,
credentials or raw private baseline archive are selected for these commits.
The committed runtime directory is an immutable reference: do not run or edit it.
It deliberately omits site configuration, installed dependencies, source maps
and filesystem metadata. It is not a complete Dell machine backup.

The following pending work is deliberately retained locally, not published:

- Changes under data/, including profiles, caches and audit logs.
- Other customer-deployment notes and docs/safety-candidate-filtering.md, which
  mix implementation notes with live readings, fault counts or operational evidence.
- The site-specific deployment/linux/ravenswood package and its settings/report.
- Hidden temporary test output under scripts/.

The public repository already contains historical site fixtures and runtime
files from earlier commits. This handoff does not sanitize existing history or
claim that a clone is free of historical site data. The owner elected to keep
the repository public after that limitation was disclosed. History cleanup is
a separate task; no force-push or history rewrite is included here.

The committed runtime reference is now the default for check-dell-source-parity.mjs;
the ignored private capture is no longer required at home. The checker passes its
scoped checks but explicitly reports whole-program parity as NOT_VERIFIED.
The exact-byte verifier is separate and does not need npm dependencies. It verifies
3,495 archived files against the manifest without executing any application code.
SS4's worker-folder link remains an administrator-read verification limitation;
both collectors' running entry paths and the captured release files were verified.

No Dell service, equipment command, startup cleanup, latency setting or live
configuration is changed by this Git handoff. Future releases must record their
source revision, build environment, artifact hashes and acceptance results.
