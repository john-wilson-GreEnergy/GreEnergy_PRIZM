# PRIZM Overview Dashboard - Data Discovery

This document details the local endpoints available from the EMS Turtle API used to discover the source data required to construct a comprehensive "Overview Dashboard", mirroring the structural areas available in the GreEnergy Cloud Summary pages.

## Goal
To locate local references to subcomponents and entities dynamically via available REST outputs (`blockviewer`, `status.json`, `lastCall.json`, `strings.csv`, etc.).

## Endpoints Scanned
- `/tools/monitor/ems/blockviewer/data`
- `/tools/report/ems/status.json`
- `/tools/report/ems/lastCall.json`
- `/tools/report/ems/controllerStatistics.json`
- `/tools/report/ems/bessStatusCodes.json`
- `/tools/report/ems/strings.csv`
- `/tools/report/ems/ipMap.json`
- `/tools/report/ems/stringIPMap.json`
- `/firstresponder/data`
- `/v2/firstresponder/data`

## Expected Overview Sections

| Section | Target Source Endpoints | Observations / Discoveries |
| :--- | :--- | :--- |
| **EMS Apps** | `status.json`, `lastCall.json` | Look for keys: `application`, `appCode`, `priority` |
| **Block Topology** | `blockviewer/data` | Hierarchical JSON indicating `entityType` and subtypes (e.g. `PCS`, `Battery`, `HVAC`). Includes state indices. |
| **PCS** | `blockviewer/data`, `lastCall.json` | Subcomponent records where `entitySubType` = `PCS`. Look for variables like `dcVoltage`, `acRealPower` etc. |
| **HVAC / Centipede** | `blockviewer/data` | Devices matching `entitySubType` = `CentipedeTeamDataDispatcher`, `DometicFeather` or simply keys with `hvacIndex` / `CTC`. |
| **Humidity Temp Sensors** | `blockviewer/data` | Matching records mapping `htsIndex` and `temperature`. |
| **UPS Summary** | `blockviewer/data` | Matches any entities containing `upsIndex` or literal `UPS`. |
| **Array Summary** | `blockviewer/data` | Contains aggregation records identifying Arrays (by `arrayIndex`) and child topology stats. |
| **String Summary** | `strings.csv` | Parses CSV rows from `/tools/report/ems/strings.csv` into aggregated count dictionaries (`ONLINE`, `FAULTED`, averages). |
| **Safety Reset Entities** | `blockviewer/data` | Subcomponents marked with `allowFaultReset: true` flags. |

## Action Discovery Findings
- **EMS Applications** Command interfaces exist locally but payload formats and permissions are completely unknown out-of-the-box.
- **Topology Resets**: Endpoint `/tools/command/ems/ManualClearDeviceFault` exists and powers standard `Safety Fault Clear` route.

**WARNING:** Do not wire, test, or display operational command buttons targeting EMS Applications or unknown device endpoints directly through the future Overview Dashboard without deep verification of payload expectations on the specific active firmware. Mistaken commands may trigger unintended EMS state resets or protective shutdowns. Safety clear logic remains intentionally segmented to separate specialized pages.
