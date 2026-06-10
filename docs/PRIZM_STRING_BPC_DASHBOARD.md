# PRIZM String / BPC Dashboard

## Local Endpoints Used
The dashboard aggregates data strictly from the local EMS (usually `http://10.0.0.3:8080/turtle`) using the active EMS Target Profile. The priority and usage of these endpoints are:

1. **`GET /tools/report/ems/strings.csv`**: Primary source for the fleet-wide string list. Provides highly parsed summary metrics and status overviews.
2. **`GET /tools/report/ems/lastCall.json`**: Primary source for detailed cell/BPC telemetry, alarms, warnings, and firmware info. Parsed deeply when selected.
3. **`GET /tools/monitor/ems/blockviewer/data`**: Fallback strategy for string-level connectivity metrics or basic status.
4. **`GET /tools/report/ems/stringIPMap.json`** & **`GET /tools/report/ems/ipMap.json`**: Augments strings and BPCs with their assigned IP addresses dynamically.
5. **`GET /tools/monitor/ems/stringviewer/array/{arrayIndex}/string/{stringIndex}/data`**: Actively attempted on the String Detail View to pull granular cell-group voltage and temperature matrices.

## Normalized Data Model
Data from these varying endpoints are coerced into two normalized models on the local backend (`StringDashboardRow` & `BpcDashboardRow`) ensuring the frontend receives a single source of truth regardless of which tools populated it. 

### String List Field Mapping
- **Status/State**: Interpreted from `.connectionstate` or `.communicating` and derived `.alarmcount` / `.warningcount`.
- **Voltages & Temperatures**: Mapped through `cellgroupvoltagemin`, `mincelltemperature`, etc., preferring `lastCall.json` if granular, falling back to CSV.
- **Hardware/Location**: Container location mapped to `container` / `location` column.

### String Detail Field Mapping
- Detail views rely on passing `arrayNumber` and `stringNumber` to the `:array/:string/detail` backend route.
- Firmware mappings iterate through specific BPCs to present "Mixed" or uniform firmware state.

### Matrix Derivation
- **Voltage & Temperature**: Matrices are constructed via nested iteration over BPCs and cell groups (e.g., `voltageMap.batteryPacks["1"].cellGroups["1"].value`). 
- **Limitations**: When BPC/cell-group granular data is missing (e.g. `stringviewer/data` returns 404 or `lastCall.json` is summary-only), the detail component falls back safely with a clear "Granular BPC/cell-group matrix data not available" UI placeholder rather than fabricating data.

## Safety Fault Clear
Manual safety fault clear functionality has been preserved and validated. Eligible `OpenClosedDetector` (`FirePanelAddrES` and `FirePanelAddrCS`) instances can be successfully queried and cleared using `lastCall.json` candidates and the `ManualClearDeviceFault` command payload via the protobuf protocol. No mock endpoints or arbitrary tokens are used.
