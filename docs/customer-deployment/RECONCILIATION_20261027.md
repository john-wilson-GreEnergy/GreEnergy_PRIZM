# Dell-authoritative source reconciliation — 2026-10-27

## Status and publication boundary

The owner now wants the Dell deployment to be authoritative, superseding the
October 23 decision to leave known development-only features in the production
checkout. This update removes the identified undeployed additions from source.
It is **not yet a claim of whole-program equivalence or a deployable replacement
for the Dell's incremental release**. Do not deploy an ordinary full build on
the strength of the scoped tests below.

The previous committed source remains at `23de78e81216026020bfa0534de52987a7685c6e`
on `archive/pre-dell-sync-20261027`. Original uncommitted files were copied into
a private local preservation directory before editing, with a verified Git
bundle and a file-hash manifest. No runtime data or private capture is selected
for publication. Historical site files already in Git are not sanitized by this
commit; a visibility change would not remove them from existing clones.

## Fresh production reference

A read-only capture at `2026-10-27T14:42:40.386Z` verified the active release entry
paths and stable before/after hashes. The deployed releases remain:

| Role | Release | Entry SHA-256 |
| --- | --- | --- |
| Collectors | safety-filtering-collector-20261022 | `2db7595091fc7738abc7e85e8ca6b83cb2c3399b10b76d1e0f1dff400ef4fb33` |
| Fleet | safety-filtering-20261022 | `97d3507cdbf5ad9524488b96d540257d38eec78f66cce677d2b030dc3614157e` |

The entry gateways retain `workspaces-20261001`; the readable worker link retains
`soc-strings-20261021`. The SS4 worker link still requires an administrator read
because capture encountered EACCES. Installed dependency trees were not copied.
The captured dependency declarations and lockfile match this repository. The
capture contains application artifacts, not live account stores, secrets or
telemetry. A disk hash does not prove the bytes loaded earlier by a process.

## Source changes

- Restore deployed, site-local corrective guidance: remove shared catalogs,
  cross-site permissions/headers and editor scope/revision extensions together.
  This also restores the deployed single-site store's temporary-file behavior;
  the unpublished shared writer lock and exclusive temporary-file creation
  remain on the preservation branch. This records the existing production
  contract, not a recommendation to deploy a security downgrade elsewhere.
- Restore the deployed UI-serving sidecar's unchanged HTML delivery. Remove the
  unpublished startup-preload feature and its tests from this production line.
  The rebuilt `workspace-ui.cjs` is now byte-identical to the captured Dell file.
- Separate collector account parsing from Fleet parsing. The collector matches
  its deployed parser; Fleet retains strict `remoteControlSites` validation and
  remains responsible for controls grants. Synthetic tests cover the distinction.
- Update offline parity checks to test local guidance and collector parsing,
  without treating a passing subset as a whole-program production gate.

These source edits do not alter any running service, cleanup policy, polling
interval, latency setting, live account or equipment state. No equipment command
was sent. Only synthetic fixture writes were used in tests.

## Verification

- Fresh locked dependency installation in an isolated 1,200-file source copy;
  install scripts disabled. Missing npm cache entries required registry downloads.
- TypeScript check and full build passed in that isolated copy, with networking
  blocked during the build. Local Node 24.14.0 / npm 11.9.0 / Vite 6.4.2; Dell
  reports Node 24.21.0. Toolchain/platform equivalence is not asserted.
- Notification/corrective guidance, safety candidate discovery/selection,
  Fleet account management and role-specific account parser tests passed.
- Power-flow persistence/per-array threshold and storage presence/display tests
  passed. No latency parameters were edited.
- Unified LAN/remote UI and remote administration tests passed on private Unix
  sockets with external networking blocked. They cover authorization, password
  confirmation, grant/revoke and session invalidation using synthetic accounts.
- The older TCP-based workspace proxy integration test was blocked by the
  offline guard and is **not counted as passed** in this run.
- Twelve selected deployed function definitions match after lexical binding and
  formatting normalization. Seven rebuilt sidecar/worker artifacts match exactly;
  the retention worker matches executable text apart from its source-map trailer.

## Remaining work before calling the repository an exact production clone

The Dell uses incremental compiled overlays and sidecar factories rather than a
single clean build of this source tree. The full frontend module graph, server
entry initialization and factory wiring still need end-to-end reconciliation.
The normal build's principal collector, Fleet and frontend files are not
byte-identical to the captured release. Matching selected functions and passing
tests do not close that gap. No complete source-to-runtime equivalence certificate
or live acceptance of a full rebuild is claimed here.

Keep the Ravenswood package outside this production line until that gap is
closed. It remains preserved locally and can then be placed on its own branch,
with its two-block configuration and reviewed differences from this baseline.

Credentials, account/password files, keys, tunnel tokens, telemetry, caches and
private capture archives must remain outside published source, whether the
repository stays public or becomes private. No repository visibility change,
history rewrite or Dell deployment is part of this reconciliation commit.
