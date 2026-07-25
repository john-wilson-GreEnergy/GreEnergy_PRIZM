# Canonical publication

The existing data coordinator is the sole recurring owner of canonical publication. After acquisition, legacy normalization, cache publication, and telemetry sampling, each successful coordinator attempt evaluates these stages serially:

`topology → telemetry → binding → observations → workspace projections → validation → publish`

Publication does not add a timer or perform device I/O. The telemetry stage collects the broker snapshot from the coordinator-populated caches; downstream stages consume the latest upstream runtime snapshot. Workspace and canonical debug GET routes are readers only.

## Alignment strategy

PRIZM uses explicit per-stage provenance (strategy B). `publicationCycleId` is the coordinator cycle evaluating the chain. Every stage records both `evaluatedCycleId` and `producingCycleId`. An unchanged topology may retain an older producing cycle while still being evaluated in the current publication; its unchanged source fingerprint makes that retention explicit. A healthy telemetry, binding, observation, and projection chain must use the current cycle and matching dependency fingerprints. Otherwise the aggregate is degraded and reports the exact mismatch.

Failures never clear last-known-good runtime state. The failed stage records `failureCycleId`; dependent stages are blocked from authoritative reconstruction and report any retained producing cycle. A later aligned coordinator cycle recovers automatically.
