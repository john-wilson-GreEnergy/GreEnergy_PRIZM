# Current Network Commissioning Verification

**Date:** 2026-09-11  
**Mode:** Read-only; no equipment commands issued

## Result

The bounded commissioning discovery found one identity-confirmed EMS and correctly rejected unrelated local-network candidates.

| Item | Observed result |
|---|---|
| Selected EMS | `http://10.0.0.3:8080/turtle` |
| Station | `BHE0020` |
| Block | `1` |
| EMS identity latency | 85 ms |
| Other candidates | `192.168.127.3` and `192.168.3.3`; neither responded as an EMS |
| Profile mutation | None; discovery was run with profile updates disabled |
| Equipment commands | None |

The Turtle status endpoint was reachable and identified Turtle version 2.73.42, but did not itself contain the station code. The commissioning service therefore corroborated site identity from the canonical `strings.csv` StringKey (`ST:BHE0020,B:1`). This fallback was added to support this deployed Turtle behavior without accepting reachability alone as identity.

## Topology evidence

| Measure | Observed result |
|---|---:|
| Arrays | 8 (indices 1-8) |
| Strings | 320 across arrays 1-8 |
| PCS units | 8 |
| Feather devices | 168 expected and 168 reachable after the completed polling cycle |
| Modbus points | 15,158 |
| General IP-map entries reported by topology | 40 |
| String IP-map entries reported by topology | 40 |

Reported healthy source families: blockviewer, strings CSV, IP map, string IP map, lastCall, Modbus map, and Feather.

## Open findings

1. The server was rebuilt and restarted; the commissioning routes are now active.
2. Boot/coordinator health publication was corrected and now reports `ready`, EMS reachable, station BHE0020, and a current successful-poll timestamp.
3. The boot Feather counter previously included cached candidates outside the active topology. It is now scoped to unique, non-rejected active-profile endpoints and reports 168 of 168.
4. The eight lineup segment-identity findings were resolved using the active profile's configurable CS/ES IP formula and corroborated against 168 reachable Feather endpoints.
5. Turtle's concatenated `]Phoenix n:` map sections are now parsed correctly. Both general and string IP maps report 320 unique string endpoints across arrays 1-8.
6. Commissioning generated and activated topology draft `bhe0020-block-1-r3`: 8 lineups, 20 energy segments per lineup, and 40 strings per lineup.
7. Commissioning remains `ready-for-review`; `controlsPermitted` remains false pending explicit control acceptance.
8. This test proves discovery and read-only topology acquisition only. It does not qualify PCS rotation, string rotation, contactors, balancing, or EMS application controls.

## Disposition

**PASS** for bounded EMS discovery and topology completeness on the current BHE0020 network.  
**NOT PASSED** for control commissioning.
