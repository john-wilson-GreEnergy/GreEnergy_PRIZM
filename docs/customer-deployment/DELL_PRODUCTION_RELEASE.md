# Dell production release

## Current verified label

As of the read-only reconciliation on November 6, 2026, the Solar Star Dell runs
the release labeled **Mobile Admin 2026-11-05**.

| Runtime role | Effective release |
| --- | --- |
| Solar Star 3 collector | `mobile-admin-collector-20261105` |
| Solar Star 4 collector | `mobile-admin-collector-20261105` |
| Fleet service | `mobile-admin-20261105` |
| LAN UI | `mobile-admin-lan-20261105` |

The immutable application reference and SHA-256 manifest are stored at
`deployment/deployed-runtime/dell-20261105/` and labeled with Git tag
`dell-production-20261105-mobile-admin`.

The archived runtime is byte-exact, but full source-build reproducibility is not
yet established. See the snapshot README for the source-provenance boundary.
