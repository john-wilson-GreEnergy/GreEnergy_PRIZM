# Canonical Observation Layer

Observations are immutable, cycle-scoped metric records derived only from immutable telemetry bindings. They do not poll devices, refresh caches, change authority, derive new engineering values, or mutate graph/binding objects.

Quality and confidence are deterministic:

- `GOOD`: present, valid, fresh, authoritative, non-fallback value; confidence `1.0`.
- `DEGRADED`: fallback, unhealthy, or already reduced-confidence binding; confidence is the lesser of binding confidence and `0.75`.
- `STALE`: stale binding; confidence is the lesser of binding confidence and `0.50`.
- `RETAINED`: last-known-good binding or observation; confidence is the lesser of prior confidence and `0.60`.
- `MISSING`: absent or `undefined` value; confidence `0`.
- `INVALID`: non-finite number or unsupported runtime value type; confidence `0`.

An explicit `MISSING` record satisfies metric-record coverage while preserving the distinction between an absent field, `undefined`, and `null`. It remains counted in snapshot health and can prevent route parity when the public route supplies a value.

Required string and controller-health metrics have stable canonical names and units. Additional normalized public binding fields receive deterministic passthrough observations so reconstruction never drops existing data. Publication timestamps are excluded from deterministic observation identity.

String compatibility routes are reconstructed by `StringRouteObservationAdapter` from one observation snapshot. Its field registry records source aliases, canonical metric, output type, unit, missing-value behavior, conversion, and applicable route variants. Canonical `objectId`/`canonicalKey` are never rewritten; raw Turtle keys, display keys, Energy Segment labels, and controller-IP presentation exist only in compatibility output. Hybrid mode compares strictly and falls back on any row, identity, field-presence, type, null/undefined/missing, or value mismatch. Observation mode returns reconstructed output only after the same strict proof passes.
