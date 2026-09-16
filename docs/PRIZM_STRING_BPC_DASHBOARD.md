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

## Site-wide balance-test analysis scalability (2026-09-04)

EMS test ID 5 exposed 134,400 result rows. The analysis service previously appended
the report with `Array.push(...rows)`, exceeding V8's argument/call-stack limit and
returning `Maximum call stack size exceeded`. Rows are now appended iteratively.
The dashboard never consumed the complete normalized row array, so analysis responses
omit it while retaining aggregates, warning rows, hotspots, and correlated warnings.
This reduced the verified test-5 response from about 86.6 MB to about 37.8 KB.

Live-warning correlation now replaces a less-specific string-level copy with the
notification-engine record when that record adds BPC/cell coordinates. Test ID 5
therefore reports one active code 2074 warning at Array 3, String 14 (ES7), BPC 8,
cell 10 instead of counting the same warning twice. The native completed report has
zero report warnings. A 134,400-row regression, existing BPC tests, production build,
and the live analysis endpoint passed. The thermal recorder was flushed before each
restart and resumed with its existing one-day/32 GiB settings.

## EMS balance-test targets and URL catalog audit (2026-09-04)

The live EMS URL catalog at `/turtle/tools/urls` documents selected-target tests as
`tools/report/ems/balancertest/trigger/{charge|discharge}.json?arrayIndexes=...&stringIndexes=...`.
The live status for test ID 6 reports `String BHE0020:1:3:14`.

PRIZM previously recognized only `Array ...` and `Block ...` target strings, so that
valid String form fell through to the block-level display. The parser now returns an
explicit scope plus paired array/string coordinates. Live verification reports ID 6
as Array 3 / String 14 / running. The status table displays that target directly.

The deploy form now offers Array(s) or Individual string. Individual string requires
exactly one array and a string index within the active profile's configured range
(currently 1-40), and sends both documented query parameters. Validation and audit
records preserve the scope and strings. No test was triggered during verification.

The EMS URL catalog was compared with PRIZM's mapped endpoints. Existing Turtle status,
BESS codes, controller statistics, last-call, strings extract, IP maps, array/string/
PCS reports and notifications, rotation, lightbar, EMS command, and balance-test status/
report paths match the catalog. The balance-test selected-target parameters were the
clear functional gap corrected here. PTC, firmware, simulation injection, heat-soak,
and direct fan-control catalog entries are separate capabilities, not substitutes for
current PRIZM read paths; they were not enabled or changed during this audit.

## Individual Feather detail layout cleanup (2026-09-04)

The individual Feather screen now keeps a compact identity/online/sample summary and
a sticky five-section navigator: Overview, Paired strings, Live trends, Signal
analysis, and Source data. Overview contains device identity, monitored safety
sensors, source coverage, and both HVAC controller cards. Each remaining dense tool
is isolated in its own section, so paired-string tables and charts no longer create
one continuous page. Selecting another Feather returns to Overview and closes debug/
payload disclosures. Existing polling, charts, notification expansion, validation,
and raw payload tools remain available.

Unverified UI claims were removed: the page no longer assumes a static IP mode,
substitutes firmware `2.73.18` when firmware is absent, labels the dual HVAC channels
as a simulation model, or calls the screen a special active mode. Missing firmware is
shown as Not reported. Production build passed and the running server's split Feather
bundle contains all five sections. Thermal history resumed with its existing one-day,
32 GiB settings and advancing samples.
