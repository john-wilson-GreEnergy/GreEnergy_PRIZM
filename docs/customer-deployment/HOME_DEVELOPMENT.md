# Home development — reviewed source handoff

## Source is not the production release

The owner chose one working tree and authorized publishing reviewed source to
the existing public repository on 2026-10-23. This is a development snapshot,
not a release or authorization to deploy it. Read the
[reconciliation audit](RECONCILIATION_20261023.md) before making changes.

Known differences from the Dell remain preserved:

- Shared corrective-guidance catalogs, headers and editor fields are not deployed.
- String startup preloading in the UI-server sidecar is not deployed.
- Collector account parsing differs from the older deployed collector; do not
  remove security validation merely to match it.
- Complete frontend/server equivalence remains unverified, despite passing
  scoped parity tests and two matching clean builds.

## Get the code

```sh
git clone https://github.com/john-wilson-GreEnergy/GreEnergy_PRIZM.git
cd GreEnergy_PRIZM
git log -3 --oneline
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
node --require ./scripts/test-network-guard.cjs scripts/dell-source-parity-lib.test.mjs
```

Do not start the normal server, live preview, enrollment, deployment or verifier
scripts against real equipment just to check a build. Some scripts contain fixed
deployment targets. Use explicitly synthetic fixtures and mocked transports.
Do not copy production accounts, keys, tokens, connection profiles or telemetry
into a home preview. Windows shell syntax differs; this is not a Windows runtime
qualification.

## Publication boundary

This handoff includes editable application code, tests with synthetic values,
build/release tooling and the reconciliation notes. No new runtime-data changes,
captured site fixtures, credentials, generated release artifacts or private
production-baseline archive are selected for these commits.

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

The ignored production baseline is required by check-dell-source-parity.mjs and
is not available from a Git clone. Without it, use the report as scoped evidence,
not a fresh parity result. With the baseline, the parity checker intentionally
reports the known UI-sidecar difference rather than declaring full equivalence.

No Dell service, equipment command, startup cleanup, latency setting or live
configuration is changed by this Git handoff. Future releases must record their
source revision, build environment, artifact hashes and acceptance results.
