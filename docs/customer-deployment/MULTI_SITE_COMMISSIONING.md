# Multi-Site Commissioning

PRIZM now treats the connected site as discovered evidence rather than a fixed BHE0020/10.0.0.3 assumption.

## Startup workflow

1. Enumerate the active and saved EMS profiles.
2. Add administrator-supplied `PRIZM_EMS_CANDIDATES` endpoints.
3. From directly attached private IPv4 interfaces, probe only the conventional EMS host `.3` on port 8080. PRIZM does not sweep an entire subnet.
4. Validate `/turtle/tools/report/ems/status.json` and require an EMS station identity.
5. Accept automatic selection only when exactly one identity-confirmed EMS responds. Multiple EMS responses require manual selection.
6. Persist the selected EMS host, port, Turtle path, station code, block index, and Modbus host in the active profile.
7. Let the normal telemetry coordinator acquire EMS data and IP maps.
8. Reconcile arrays, energy segments, strings, Feather endpoints, and device counts into a versioned site-profile draft.
9. Automatically apply geometry only when all lineups are confirmed and there are no conflicts or unresolved identities.
10. Keep controls uncommissioned until the customer acceptance workflow approves them.

## Configuration

- `PRIZM_AUTO_COMMISSION=false` disables automatic startup discovery.
- `PRIZM_EMS_CANDIDATES=http://10.0.0.3:8080/turtle,http://10.20.0.3:8080/turtle` adds bounded candidate endpoints.
- `PRIZM_COMMISSION_RECONCILE_DELAY_MS=15000` changes the delay allowed for the first telemetry acquisition before topology reconciliation.

## Status and manual rerun

- `GET /api/local/system/commissioning` returns candidates, probe evidence, selected identity, topology draft, and current state.
- `POST /api/local/system/commissioning/discover` reruns bounded EMS discovery.
- `POST /api/local/system/commissioning/reconcile` rebuilds topology from the current EMS caches and IP maps.

## Safety behavior

- Reachability alone never identifies an EMS.
- An HTML page or unrelated service on port 8080 is rejected unless the status payload contains station identity.
- Zero matches fail offline; multiple matches fail ambiguous.
- Conflicting device identities or uneven site geometry produce a review draft instead of silently changing the active topology.
- Discovery does not grant equipment-control permission.
