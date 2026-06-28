# PRIZM Local Data Discovery

This document records the discovery process for additional local EMS and Turtle data features available on the PRIZM Local Network.

## Objective
To add a discovery and mapping layer for features available on local EMS endpoints, helping to build dashboards for:
- PCS (Power Conversion System) / Inverter data
- UPS (Uninterruptible Power Supply) data
- Array-level data summary
- Site-wide voltage distribution graphs
- Site-wide temperature distribution graphs

## Discovery Endpoints Scanned
The backend discovery service recursively scans the following local endpoints:
- `GET /tools/monitor/ems/blockviewer/data` (JSON)
- `GET /tools/report/ems/lastCall.json` (JSON)
- `GET /tools/report/ems/status.json` (JSON)
- `GET /tools/report/ems/controllerStatistics.json` (JSON)
- `GET /tools/report/ems/bessStatusCodes.json` (JSON)
- `GET /tools/report/ems/strings.csv` (CSV)
- `GET /tools/report/ems/ipMap.json` (JSON)
- `GET /tools/report/ems/stringIPMap.json` (JSON)
- `GET /firstresponder/data` (JSON)
- `GET /v2/firstresponder/data` (JSON)
- `GET /modbus_map.csv` (CSV)

## Discovered Field Categories
The backend parses nested JSON responses and CSV columns against predefined keyword taxonomies. The taxonomies extracted include:

1. **PCS / Inverter**
   - *Keywords*: "pcs", "inverter", "powerconversion", "acpower", "dcpower", "realpower", "voltageab", "currenta", "frequency"
2. **UPS**
   - *Keywords*: "ups", "batteryvoltage", "inputvoltage", "loadpercent", "runtime", "bypass"
3. **Arrays (Summaries)**
   - *Keywords*: "array", "soc", "soh", "kwh", "chargelimit", "dischargelimit", "ready"
4. **Voltage Distribution**
   - *Keywords*: "cellvoltage", "cellgroupvoltage", "mincellvoltage", "avgcellvoltage", "calculatedstringvoltage", "measuredstringvoltage"
5. **Temperature Distribution**
   - *Keywords*: "celltemperature", "cellgrouptemperature", "mincelltemperature", "avgcelltemperature", "spacetemperature"

## Suggested Next Iteration Mappings

Based on our payload heuristic matching rules:
1. **Voltage Distribution**
   - Prefer finding granular variables under `lastCall.json` if Cell-Group (CG) data is present.
   - Fall back to `strings.csv` columns (e.g. `CalculatedStringVoltage`, `AvgCellGroupVoltage`, `MeasuredStringVoltage`).
2. **Temperature Distribution**
   - Prefer granular variables under `lastCall.json` (per CG).
   - Fall back to `strings.csv` (e.g. `AvgCellGroupTemperature`, `MaxCellGroupTemperature`).
   - Alternatively, HVAC average unit temperatures (`avgCellTemperatureC`).
3. **PCS Dashboard**
   - Prioritize extracting structured inverter groups from `/tools/monitor/ems/blockviewer/data` or `/tools/report/ems/lastCall.json`. Look for attributes such as operating state, grid ready, KW/KVAR generation, and DC bus voltage.
4. **UPS Dashboard**
   - Prioritize `/firstresponder/data` or `/tools/report/ems/controllerStatistics.json` sections that hold facility UPS system capacity and offline triggers.
5. **Array Summaries**
   - Read from `/tools/monitor/ems/blockviewer/data` where Arrays are nested within the blocks, or iterate `strings.csv` and group by the `ArrayIndex` column to dynamically calculate SOC / KW outputs.

## Validation Strategy
The new `/api/local/data-discovery/site-equipment` API validates that these variables can be found purely on the local appliance network. Once these mappings are confirmed via the Data Discovery Dashboard tool, the subsequent iteration can safely implement these visual dashboards without relying on mock data or the upstream site-monitor Cloud.
