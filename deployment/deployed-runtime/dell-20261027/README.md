# Dell deployed application reference — 2026-10-27

This is the authoritative **deployed application-file reference**, alongside the
editable source at the repository root. The owner explicitly approved committing
these generated artifacts. Do not rebuild into, edit, or run this snapshot.

All included application files are byte-for-byte copies from the Dell's four
release folders. Their SHA-256 inventories were recaptured read-only on October
27 and compared again at **2026-10-27T16:24:13.297Z**. All nine application services
were active and their running entry paths matched the capture. No application
service, equipment command, data store, cleanup policy or latency setting changed.

## Verify from any clone, offline

From the repository root, with Node installed:

```sh
node scripts/verify-deployed-runtime.mjs
```

No npm install, Dell connection, application startup or credentials are needed.
The verifier checks every included file, rejects extra/missing/changed files and
symlinks, and never imports the archived program. Git attributes disable newline
conversion for the payload, including on Windows.

## Layout and role boundaries

| Role | Folder under `payload/releases/` | Active entry |
| --- | --- | --- |
| SS3 and SS4 collectors | safety-filtering-collector-20261022/dist | server.cjs |
| Shared Fleet / LAN and remote UI | safety-filtering-20261022/dist | fleet-server.cjs |
| Entry gateways | workspaces-20261001/dist | fleet-entry.cjs |
| Preserved worker/static reference | soc-strings-20261021/dist | Worker files, not an independently active server |

Keep these folders separate: a `server.cjs` or UI asset retained in an older
folder is not necessarily an active entry. Historical assets inside these release
folders are retained as deployed, not promoted to the active frontend. The
manifest identifies the active application entries. Do not flatten the folders.

The manifest covers **3,495 files**, including the Dell's original dependency
declarations and lockfile under `payload/dependency-manifests/`. Those are archival
inputs, not instructions to start the application. Installed `node_modules`,
Linux native modules, Node itself and external helper scripts are not archived
here. This is not a complete machine backup or a ready-to-run deployment package.

## Exclusions and verification limits

- No live accounts/password hashes, keys, certificates, tunnel tokens, environment
  files, site configuration, telemetry, caches, history or logs were imported.
- Only explicitly allowlisted application filenames and two dependency manifests
  were copied. Source maps and macOS AppleDouble metadata are omitted and listed
  per release in `manifest.json`; no included file was redacted or rewritten.
- The compiled code retains its existing program defaults and validation strings;
  removing code constants would break exact-byte equivalence. Credential-pattern
  review found UI labels, credential-detection signatures, and built-in device
  password fallbacks. The latter match `src/server/iologik/iologikFleetService.ts`
  in the already-published source at `ea4744511a036a9761a332bebe7a8530315236ff`;
  they were not obtained from site configuration or an account store. Whether any
  equipment still uses a built-in default was not tested. No authentication or
  equipment command was attempted. Exact-byte preservation retains this existing
  code behavior; it is not an endorsement of default passwords.
- SS3's worker link was directly observed. SS4's worker-folder link still requires
  administrator read access (`ADMIN_READ_REQUIRED`); its collector entry is verified.
- Hashes prove deployed files on disk, not the bytes loaded earlier into a running
  process. They are point-in-time evidence, not an ongoing synchronization service.
- A clean build of the editable source is **not proven equivalent to the complete
  deployed application**. Known source discrepancies have been reconciled and scoped
  tests pass, but full source-to-build reproducibility remains separate work.
- This addition does not erase site files already present in older Git history.

## Development and Ravenswood

Edit source at the repository root; preserve this directory as the comparison
baseline. Read [Home development](../../../docs/customer-deployment/HOME_DEVELOPMENT.md)
and the [reconciliation report](../../../docs/customer-deployment/RECONCILIATION_20261027.md).
The normal build writes to root `dist/`, never into this reference.

Ravenswood's installer, two-block configuration and candidate package are excluded
and remain separately preserved. Any future Ravenswood branch/package must consume
this immutable baseline and document its own changes. It must not replace this
reference or be presented as Dell production.
