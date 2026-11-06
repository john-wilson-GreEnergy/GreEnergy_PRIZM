# Dell production runtime — 2026-11-05

This directory is the authoritative, byte-exact application reference for the
PRIZM runtime observed on the Solar Star Dell on November 6, 2026. The running
services identify the deployment as **Mobile Admin 2026-11-05**.

The archive was captured read-only from the three effective release directories
on the Dell and compared back to the live files using SHA-256. All 4,441 files
matched. No service was restarted and no site configuration, account, credential,
certificate, telemetry, history, log, cache or equipment data was copied.

## Production label

- Git tag: `dell-production-20261105-mobile-admin`
- SS3 and SS4 collector: `mobile-admin-collector-20261105`
- Fleet service: `mobile-admin-20261105`
- LAN presentation: `mobile-admin-lan-20261105`
- Deployment completed: `2026-11-05T21:42:34.159Z`
- Read-only recapture: see `manifest.json`

## Active entries

| Role | Archived entry |
| --- | --- |
| SS3 and SS4 collectors | `payload/releases/mobile-admin-collector-20261105/dist/server.cjs` |
| Fleet | `payload/releases/mobile-admin-20261105/dist/fleet-server.cjs` |
| LAN UI | `payload/releases/mobile-admin-lan-20261105/dist/index.html` |

Systemd reported all three services active and enabled with zero automatic
restarts. SS3 and SS4 used the same collector entry. The Fleet service used the
Fleet entry above. The LAN public directory was the archived LAN release.

## Verify offline

From the repository root:

```sh
node scripts/verify-deployed-runtime.mjs
```

The verifier hashes every archived application file, rejects extra or missing
files and symlinks, and does not import or execute the archived application.

## Source provenance and limitation

The live executable is **not** the build in `/home/ebc/GreEnergy_PRIZM/dist`.
The Dell checkout remained at commit `983b824bdbf2ca29d2ad6db40dae9ef9fb2de80b`,
while systemd selected the release directories archived here through layered
drop-ins.

The November 5 package was built from an original Mac checkout at
`/Volumes/Dock_Storage/Projects/PRIZM_Utility/GreEnergy_PRIZM`. That volume was
not mounted during this reconciliation. The package contains compiled artifacts,
a build recipe and cryptographic proof records, but no complete source snapshot
or embedded source commit. A check against repository `main` at
`7fd60c0990ed859c719b4257dad846f1ad013518` showed that its editable source does
not reproduce the three transplanted server-function hashes in the deployment
manifest.

Therefore this commit makes Git authoritative for the **exact deployed runtime**,
but it does not claim complete editable-source/build equivalence. Do not rebuild
and overwrite this archive. Recovering and reviewing the original Mac checkout,
then producing a reproducible clean build, remains separate work.

## Provenance evidence

`provenance/` retains the reviewed November 5 deployment description, build
recipe, before/after hash manifest, offline test result and live deployment
result. These files contain no account secrets or private keys. They document
that account data and learned site state were preserved and no equipment command
was sent during the rollout.
