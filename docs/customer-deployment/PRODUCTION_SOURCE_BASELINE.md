# Dell production / offline development baseline

Latest status: [October 27 reconciliation](RECONCILIATION_20261027.md). The Dell
was recaptured read-only; identified undeployed features are now preserved on a
separate archive branch and removed from the production source line. Complete
source-to-runtime equivalence remains unverified. The following is historical.

This is the historical artifact-capture record. For the later reviewed-source
Git handoff, start with [Home development](HOME_DEVELOPMENT.md). References below
to uncommitted work and no push describe the original capture, not later commits.

Verified on 2026-10-22 at 18:28 UTC. Production was only read; no service restarts, equipment commands, data cleanup or latency changes were performed.

Update — 2026-10-23: the [reconciliation audit](RECONCILIATION_20261023.md)
records passing clean builds, TypeScript checks and scoped parity tests, plus
known undeployed changes. The owner chose to retain one working tree and document
those differences. The editable checkout is intentionally not an exact production
baseline; no separate branch was created. The archive described below predates
the audit's new helpers and documentation.

## What is proven

SS3 and SS4 are running `safety-filtering-collector-20261022`. Fleet serves `safety-filtering-20261022`. The entry gateways still execute the `workspaces-20261001` entry bundle. SS3's working-directory `dist` link resolves to `soc-strings-20261021`, which is retained for worker/static dependencies.

The service entry paths were checked against each running process, and all copied release files were compared by SHA-256 before and after capture. The exact four release trees are preserved locally under `deployment/production-baselines/dell-20261022/production/`. A machine-readable `production-lock.json` records hashes, service paths, dependency manifests and verification limitations. Generated baselines are ignored by Git, not committed.

SS4's working-directory link could not be independently read without administrator privileges. The filtering deployment reported that worker links were preserved, but that does not replace a fresh direct read. Installed dependency trees are not copied; production dependency manifests are included separately. Matching files on disk cannot prove which bytes Node loaded earlier if a file was modified in place; PID and entry-path stability were verified.

## What is not proven

**The editable source checkout is not yet a reproducible source equivalent of production.**

The local branch is `main`, with numerous uncommitted changes. Several deployments overlaid selected functions and compiled UI modules onto existing bundles rather than rebuilding the entire project. A normal build of the current source must not be treated as the exact deployed program. Copying the Dell's old source checkout would not solve this: systemd runs versioned bundles, not that checkout's current source.

The handoff includes 1,204 source/build files from the current working tree, each hashed. This is the latest local editable source, not a claim that every pending change is live. Its snapshot omits operational data, captured site fixtures, live configuration, credentials, generated builds, dependency installations, hidden scratch folders and Git history. No GitHub commit or push was performed. Cloning the existing remote alone will not obtain these uncommitted updates.

## On another computer

1. Transfer the `prizm-home-handoff-20261022.tar.gz` archive securely and extract it into a new directory. Do not overwrite another checkout. Use `python3 -m tarfile -e prizm-home-handoff-20261022.tar.gz prizm-home` (`py` on Windows if needed), then enter `prizm-home/dell-20261022`. macOS's archive tools can consume original `._` files as metadata instead of preserving them, so use Python's archive reader for exact-file integrity.
2. Run `node verify-offline.mjs` from the extracted handoff before editing. This checks the captured source and production artifacts without network access. After editing, source hash differences are expected; the production reference should stay unchanged.
3. Open `source/` in the editor. Use its `package.json` and `package-lock.json` for development dependencies. The captured Dell ran Node 24; dependency installation may need internet access, but not access to the Dell network. Linux production native modules are not portable to another operating system.
4. Keep `production/` as a reference only. Do not start those bundles or copy live production configuration into a home preview. Test equipment interactions with mocks. The focused `npm run test:safety-candidates` suite includes a network guard after development dependencies are installed; captured-site fixture tests are intentionally not included.
5. Do not deploy a generic full build until source-to-release reconciliation is completed.

## Remaining source reconciliation

- Continue the release-overlay/source mapping recorded in the reconciliation audit; preserve pending work in the single working tree and explicitly track which differences are not deployed.
- Build from a clean, versioned source snapshot with a locked toolchain and dependency set.
- Compare canonical telemetry, permissions, operational command safeguards and UI behavior against the preserved production reference using offline fixtures. Review every intentional difference.
- Record the source commit, build tool versions and full artifact manifest together for the next deployment. Run live read-only acceptance after activation.

The new helper scripts capture and verify artifacts; they do not claim to automate this source reconciliation or authorize deployment. Do not mark source parity complete solely because artifact hashes match.
