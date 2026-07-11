# Feather WAR Endpoint and Capability Inventory

Companion artifacts:
- docs/architecture/feather-endpoints.csv
- docs/architecture/feather-endpoints.json

## WAR Files Inventoried
- Path: /Users/johnwilson/Desktop/hatchery/feather.war
  - Size: 34554129 bytes
  - Modified: 2026-02-27T07:53:32
  - SHA-256: ca1a364243c80d3c367d847e6688b73ca8b0616e78b3eb284769bf1e8b9acf83
  - Likely identity: Manifest-Version: 1.0 | Build-Jdk-Spec: 21 | Specification-Version: 2.73 | Implementation-Version: 2.73.18 | Implementation-Build: 2.73.18
- Path: /Users/johnwilson/Downloads/EMS tools/tools/hatchery/feather.war
  - Size: 42040167 bytes
  - Modified: 2024-06-10T06:04:08
  - SHA-256: 2ed9fa698ac374f0c753a9f79f4783305fc78049ea97a87686fcccc4540af693
  - Likely identity: Manifest-Version: 1.0 | Archiver-Version: Plexus Archiver | Build-Jdk: 1.8.0_342 | Implementation-Version: 2.63.19 | Implementation-Build: 2.63.19
- Path: /Users/johnwilson/Downloads/FileTransfer/powin/fw/feather/feather.war
  - Size: 34552081 bytes
  - Modified: 2025-12-17T10:41:00
  - SHA-256: 1786f1477d1ce6befd0f3c76584350838fd1cb5cc70a98df2d50d9f218d924f0
  - Likely identity: Manifest-Version: 1.0 | Build-Jdk-Spec: 21 | Specification-Version: 2.73 | Implementation-Version: 2.73.18 | Implementation-Build: 2.73.18
- Path: /Users/johnwilson/Downloads/FileTransfer/powin/hatchery/feather.war
  - Size: 34466017 bytes
  - Modified: 2025-12-17T10:40:52
  - SHA-256: eb570c46a60e57d47c4d52175a3c4a8e4787edffafc1fd5d1b43d4aeb4a5fc13
  - Likely identity: Manifest-Version: 1.0 | Build-Jdk-Spec: 21 | Specification-Version: 2.72 | Implementation-Version: 2.72.7 | Implementation-Build: 2.72.7
- Path: /Users/johnwilson/Downloads/feather.war
  - Size: 31837998 bytes
  - Modified: 2025-07-12T06:16:46.408755
  - SHA-256: 646b0a7a6a7593e3d86cff8fb088ca58a49610802f58a8772a735d55b9a796e8
  - Likely identity: Manifest-Version: 1.0 | Archiver-Version: Plexus Archiver | Build-Jdk: 1.8.0_342 | Implementation-Version: 2.61.18 | Implementation-Build: 2.61.18

## Scope and Method
- Read-only WAR inspection only; no application code modified.
- Sources analyzed: web.xml, controller class strings, mapping annotation strings, JSP/JSPX, static JavaScript, default.properties, and manifest metadata.
- Architectures found:
  - Spring MVC Feather (2.61.18 and 2.63.19): rich controller surface.
  - Spark-based Feather (2.72.7 and 2.73.18): minimal servlet stubs in WAR, runtime routes likely registered from bundled libraries.

## Deliverable A: Complete Endpoint Inventory
- Full machine-readable inventory is in docs/architecture/feather-endpoints.csv and docs/architecture/feather-endpoints.json.
- Includes required fields and risk classification for safe-read, diagnostic-read, control-write, configuration-write, unknown.

## Deliverable B: High-Value Read-Only Endpoint Shortlist
1. GET /feather/status/report.json
- Best continuous polling endpoint; already used by PRIZM and verified live.
2. GET /feather/main/data
- Rich consolidated payload for doors, HVAC controls, setpoints, and environmental metrics.
3. GET /feather/status/internal.json
- High-value diagnostics for lead/lag state, timers, and segment behavior.
4. RESOURCE default.properties
- Provides capability and configuration hints (mio slave ID, HVAC slave IDs, polling cadence, mode defaults).

## Deliverable C: Current PRIZM Comparison
Current PRIZM Feather data and simulation paths found in code:
- Read polling:
  - http://{ip}:8080/feather/status/report.json
- Simulation and test tooling:
  - http://{ip}:8080/feather/simulate
  - /feather/simulate/clearall
  - /feather/simulate/commands (via POST in PRIZM service)

Not currently used by PRIZM but recommended:
- /feather/main/data (consolidation candidate)
- /feather/status/internal.json (diagnostic enrichment)

## Deliverable D: Profile/Configuration Artifact Inventory
1. WEB-INF/classes/default.properties
- Modbus IDs: bergstrom HVAC1/HVAC2, mio, space/outside datanab, senva.
- Network defaults: teamModbusIpAddress=192.168.127.254, teamModbusPort=502.
- Polling cadence and timeout controls.
- Thermostat and poller mode toggles.
- Firmware trigger directory and maxRetries/pageSize.
- Configuration package directory hints.

2. META-INF/MANIFEST.MF
- Implementation-Version and build identity suitable for compatibility gating.

3. Class capability evidence (Spring builds)
- ioLogik device classes, Bergstrom and Dometic thermostat contexts, Modbus device factories, history and statistics classes.

## Deliverable E: Recommended Integration Improvements
1. Keep /feather/status/report.json as baseline poll endpoint.
2. Add optional /feather/main/data poll path for richer consolidated fields and schema cross-checking.
3. Add on-demand /feather/status/internal.json diagnostics for troubleshooting and validation explainability.
4. Parse and persist default.properties-derived capability hints per profile:
- HVAC vendor mode hints (Bergstrom vs Dometic)
- sensor/modbus presence expectations
- poll timeout tuning and stale thresholds
5. For Spark-era WARs, add route-capability detection by version and conservative fallback to known safe endpoints until route introspection is expanded.

## Deliverable F: Recommended Migration Order
1. Priority 1
- Keep /feather/status/report.json as required baseline and enforce schema-health checks.
2. Priority 2
- Add /feather/main/data and /feather/status/internal.json as read-only enrichment and diagnostics.
3. Priority 3
- Ingest default.properties capability hints into profile-aware validation.
4. Priority 4
- Add version-aware compatibility matrix using manifest identities and Spark-vs-Spring architecture detection.
5. Priority 5
- Keep all control/test namespaces manual-only.

## Deliverable G: Unsafe Endpoint List
Never auto-call in polling loops:
- /feather/bergstrom/restartThermostat
- /feather/eol/bypoint
- /feather/eol/bergstrom/* (start/stop/power/opmode/setpoint)
- /feather/simulate/clearall
- /feather/simulate/set/*
- /feather/simulate/clear/*
- /feather/simulate/use/*
- /feather/fw/trigger
- /feather/protocol/command
- /feather/protocol/thermostat/control
- /feather/team/configuration
- /feather/d2f/remotecommand

## Deliverable H: Evidence and Source Locations
Primary evidence locations for Spring Feather WAR inventory:
- WEB-INF/web.xml
- WEB-INF/applicationContext.xml
- WEB-INF/classes/default.properties
- WEB-INF/classes/com/powin/feather/controller/StatusController.class
- WEB-INF/classes/com/powin/feather/controller/MainController.class
- WEB-INF/classes/com/powin/feather/controller/EolTesterController.class
- WEB-INF/classes/com/powin/feather/controller/BergstromValuesController.class
- WEB-INF/classes/com/powin/feather/controller/FeatherFirmwareController.class
- WEB-INF/classes/com/powin/feather/controller/FeatherProtocolController.class
- WEB-INF/classes/com/powin/feather/controller/FromDragonToFeatherController.class
- static/js/feather-EOLFAT.js
- static/js/feather-PreEOLFAT.js
- static/js/feather-bergstromValues.js
- static/js/feather-simulated.js
- WEB-INF/classes/WEB-INF/jsp/main.jspx
- WEB-INF/classes/WEB-INF/jsp/PreEOLFAT.jspx
- WEB-INF/classes/WEB-INF/jsp/EOLFAT.jspx

Live read-only verification performed:
- GET /feather/status/report.json on 10.0.1.3 and 10.0.1.10
- GET /feather/status/internal.json on 10.0.1.3 and 10.0.1.10
- GET /feather/main/data on 10.0.1.3 and 10.0.1.10

Safety rule used during verification:
- Only GET endpoints classified as read-only status/report/model routes were called.
- No POST/PUT/DELETE/test-start/reset/firmware/configuration/control endpoints were invoked.
