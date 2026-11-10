# Dell production runtime — 2026-11-09

This directory is the authoritative, byte-exact application reference for the
PRIZM runtime captured read-only from the Solar Star Dell on November 10, 2026.
The running deployment is labeled **Power Display 2026-11-09 r2**.

## Verified live state

- Solar Star 3 and Solar Star 4 use the same collector entry:
  `power-display-collector-20261109-r2/dist/server.cjs`.
- Fleet uses `power-display-20261109-r2/dist/fleet-server.cjs`.
- The LAN presentation link resolves to `workspaces-20261001`.
- All three inspected services were active, enabled and running with zero
  automatic restarts.
- The read-only capture compared every copied file to its live SHA-256 digest.
  No service was stopped or restarted.

The captured archive itself was verified after transfer from the Dell with
SHA-256 `c85841415f7f6393063d800589a6aa39ee04a52e4c96aba892a9ae5258d77feb`.

## Included application reference

`payload/releases/` contains the complete application-file inventory selected
by the active collector, Fleet and LAN paths. Source maps and AppleDouble files
are listed as omitted metadata in `manifest.json`; they are not application
runtime inputs.

`provenance/` preserves the reviewed November 9 permission-parity, cell
analysis, cell summary, data export and power-display recipes, tests and
acceptance notes that culminated in this release. It deliberately excludes
screenshots, private fixtures, downloaded reports, live data and installer
recovery state.

## Verify offline

From the repository root:

```sh
node scripts/verify-deployed-runtime.mjs deployment/deployed-runtime/dell-20261109
```

The verifier hashes all archived application files, rejects missing, extra or
linked files, and does not import or execute the captured application.

## Boundaries

This snapshot establishes exact deployed-byte identity and retains the reviewed
rollout recipes. It does not claim that a fresh ordinary repository build is
byte-identical to every deployed file: the November 9 packages were layered
onto the previously reviewed Dell baseline. Credentials, account stores, site
configuration, telemetry, logs, caches, learned equipment state, profile
history and operational audit records are excluded.

The original laptop checkout remains unchanged and retains its local runtime
audit/profile files. Those files are operational state, not product source, and
are intentionally absent from this commit.
