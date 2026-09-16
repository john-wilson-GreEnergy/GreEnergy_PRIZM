# PRIZM System Description

## Purpose and boundary

PRIZM is a local operational intelligence and maintenance interface above the site EMS. It acquires EMS Turtle, Feather, First Responder, and Modbus information; normalizes it into canonical models; presents technician/operator workspaces; and exposes explicitly enabled control workflows. PRIZM is not the EMS, a protection system, or an independent safety interlock.

The deployment boundary includes the PRIZM application, Node.js runtime, operating system, CL250 host, persistent configuration/audit data, reverse proxy, remote-access agent, and all credentials or keys used by those components.

## Principal runtime components

| Component | Responsibility | Production security consequence |
|---|---|---|
| Acquisition/providers | Read approved site sources | Permit only required destination IPs and ports |
| Telemetry coordinator/broker | Establish freshness and canonical authority | One owner per acquisition cycle; preserve last-known-good with provenance |
| Express API | Read endpoints and equipment/configuration commands | Authentication and authorization must be enforced here |
| React portal | Technician/operator presentation | UI visibility is not authorization |
| History/audit storage | Operational and command evidence | Integrity, retention, time synchronization, export and backup required |
| Thermal/history storage | Optional diagnostic recording | Capacity limits and information classification required |
| Feather SSH workflow | Reads/changes `feather.xml`, restarts Tomcat 8 | Privileged credentials, allowlisted targets and complete audit required |

## Current control families

| Control | API family | Upstream path |
|---|---|---|
| String rotation | `/api/local/strings/rotation` | EMS Turtle control URL |
| PCS rotation | `/api/local/pcs/rotation` | EMS Turtle control URL |
| String contactors | `/api/local/strings/contactors` | Array/Phoenix Turtle control URL |
| String balancing | `/api/local/balancing` | EMS command/control workflow |
| EMS app state | `/api/local/ems-apps/enabled-status` | `SetEMSApplicationEnabledStatus` command |
| Safety fault clear | `/api/local/safety-faults` routes | EMS manual-clear command |
| Feather serial mode | `/api/local/feather-serial` | Password SSH + sudo on allowlisted Feather targets |

## Data and command state model

Every customer release must use these distinct states:

1. **Requested** — authorized user submitted a validated command.
2. **Dispatched** — PRIZM sent the upstream request.
3. **Accepted** — upstream endpoint acknowledged receipt.
4. **Verified** — a fresh authoritative observation confirms the intended state.
5. **Mismatch** — fresh observation confirms a different state.
6. **Unknown/timeout** — authoritative verification was unavailable before the deadline.

Accepted must never be displayed or recorded as verified.

## Operating modes

- Local read-only diagnostics
- Local supervised controls
- Remote read-only support
- Remote supervised controls

Remote supervised controls are a separately approved mode and must be disabled by default. Demo/simulation behavior must be impossible on production control routes.

## Documentation still required for a customer release

- Supported OS/Node/browser and CL250 resource baseline
- Exact network ports, protocols, sources and destinations
- Installation, upgrade, rollback and uninstall procedures
- Configuration dictionary and secret inventory
- Complete API and control catalog
- User administration and role matrix
- Backup/restore and disaster recovery procedure
- Incident response and evidence export procedure
- Software bill of materials and third-party license inventory
- Vulnerability intake, assessment, patching and customer notification policy
- Release notes, signed artifacts, checksums and provenance
- Operator manual, technician manual and administrator manual
- Site acceptance report and customer sign-off

