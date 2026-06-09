# PRIZM Script Logic Audit & Native Tool Mapping
## Document ID: PRIZM-LAN-MAPPING-001

This document provides a highly detailed, professional engineering audit of GreEnergy Resources' battery storage lineup technician tools, mapping the existing legacy shell scripts to native, low-risk PRIZM operational dashboard modules.

---

## 1. Classification Categories Guide

For every script and menu item audited, we apply the following rigid categorization framework to direct safe software design constraints:

| Code | Category Descriptor | Architectural Target | Safety & Testing Stance |
| :---: | :--- | :--- | :--- |
| **A** | **Already covered by confirmed EMS endpoints** | Integrated into local database cache | Read-Only. Direct dashboard display. No live testing required. |
| **B** | **Covered by endpoints but needs parsing/normalization** | Web-based JSON filters / data formatters | Read-Only. High availability. Normalization occurs in backend memory. |
| **C** | **Requires a Turtle endpoint seen but not live-tested** | Optional auxiliary diagnostics tab | Safe Read-Only. Requires isolated live validation when hardware link restores. |
| **D** | **Requires direct Feather/device endpoint polling** | Direct diagnostic ping utility / table grid | Low-Risk Read-Only. Requires routing and connection checks to localized IPs. |
| **E** | **Requires direct Modbus polling** | Interactive developer-only testing console | Medium-Risk. Restricts poll frequency to protect microcontroller memory. |
| **F** | **Performs live writes/control actions (LOCKED)** | Left blockaded; not implemented in PRIZM UI | Critical Operational Write. Disabled to prevent thermal/electrical damage. |
| **G** | **Device provisioning/deployment script** | Lab-only CLI setups; excluded from site UI | Non-Dashboard. Direct SSH/Tar operations on remote devices. |
| **H** | **Obsolete/Replaced by PRIZM polling** | Deprecated / sunset script | Legacy reference only. |

---

## 2. Comprehensive Script-to-Native-Tool Audit

The table below maps each legacy bash script and main menu option from `terminal_ui.sh` to its native target.

| Script / Menu Command | Menu Item # | Classification | Current Purpose | Type | Endpoints / Sources Used | Available in `/api/local/*`? | Recommended PRIZM Native Module | Priority | Safety Notes & Live Testing |
|:---|:---:|:---:|:---|:---|:---|:---:|:---|:---|:---|
| **terminal_ui.sh** | *Wrapper* | **A** | Interactive terminal dashboard main selection portal. | Read-Only UI | Terminal menu selection | Yes | Main Layout / Sidebar | High | System central entry point. Safe wrapper. |
| `terminal_ui.sh` | Item 1 | **F** | Toggle battery string contactors (open / close). | Operational Write | `tools/controls/ems/array/{a}/string/{s}/contactors/{act}` | No | *Blocked / Disabled in UI* | None | **Hazardous.** Direct high-voltage write command. Locked inside UI block. |
| `terminal_ui.sh` | Item 2 | **F** | Disconnect or connect entire array contactors. | Operational Write | `tools/controls/ems/array/{a}/contactors/{act}` | No | *Blocked / Disabled in UI* | None | **Hazardous.** Breaks DC backup connection path under potential load. Locked. |
| `terminal_ui.sh` | Item 3 | **F** | Rotate individual string in/out of runtime bus operations. | Operational Write | `tools/controls/ems/array/{a}/string/{s}/rotate/strings/{act}` | No | *Blocked / Disabled in UI* | None | **Critical.** Heavy inductive switching risks if done under active generation currents. Locked. |
| `terminal_ui.sh` | Item 4 | **F** | Rotate all strings under a selected array indexes range. | Operational Write | `tools/controls/ems/array/{a}/rotate/strings/{act}` | No | *Blocked / Disabled in UI* | None | **Critical.** High physical equipment risk. Locked. |
| `terminal_ui.sh` | Item 5 | **F** | Disconnect or reconnect array Power Conversion System (PCS). | Operational Write | `tools/controls/ems/array/{a}/rotate/arrayPcses/{act}` | No | *Blocked / Disabled in UI* | None | **Critical.** Grid generator disconnect risk. Locked. |
| `terminal_ui.sh` | Item 6 | **F** | Trigger active battery string cell-balancing. | Operational Write | `tools/controls/ems/array/{a}/string/{s}/balance/{act}` | No | *Blocked / Disabled in UI* | None | **Balanced Write.** Alters charge level of cell groups. Locked. |
| `terminal_ui.sh` | Item 7 | **F** | Balance battery cells to a user-provided absolute mV spec. | Operational Write | `tools/controls/ems/array/{a}/string/{s}/balance/provided/{target}` | No | *Blocked / Disabled in UI* | None | **Balanced Write.** Blocked to prevent cell swelling or battery over-depletion. |
| `terminal_ui.sh` | Item 8 | **F** | Balance strings with custom patterns and custom TTL timeouts. | Operational Write | `tools/controls/ems/array/{a}/string/{s}/balance?balanceString={pat}` | No | *Blocked / Disabled in UI* | None | **Balanced Write.** Blocked from dashboard scope. |
| `terminal_ui.sh` | Item 9 | **F** | Trigger average balancing across all strings of an array. | Operational Write | `tools/controls/ems/array/{a}/balance/avg` | No | *Blocked / Disabled in UI* | None | **Balanced Write.** Array-wide balancing risk. Locked. |
| `terminal_ui.sh` | Item 10 | **F** | Balance an entire array to a target voltage level. | Operational Write | `tools/controls/ems/array/{a}/balance/provided/{target}` | No | *Blocked / Disabled in UI* | None | **Balanced Write.** Locked. |
| `terminal_ui.sh` | Item 11 | **F** | Halts balancing operations on the target battery string. | Operational Write | `tools/controls/ems/array/{a}/string/{s}/balance/stop` | No | *Blocked / Disabled in UI* | None | Standard safety write; locked to fully eliminate control plane vectors. |
| `terminal_ui.sh` | Item 12 | **F** | Halts balancing operations across an entire array lineup. | Operational Write | `tools/controls/ems/array/{a}/balance/stop` | No | *Blocked / Disabled in UI* | None | Control Plane safety stop; locked from UI dashboard. |
| `terminal_ui.sh` | Item 13 | **B**| Full String cell voltage / temperature overview report. | Read-Only | `/tools/report/ems/strings.csv` | Yes | BMS Array Diagnostics (Cell Imbalance Grid) | High | **Safe Read-Only.** Already live and cached under `/api/local/strings`. No live testing required. |
| `manual_setup.sh` | Item 14 | **G** | Installs setup baselines and deploys Hatchery jars on MOXA gates. | System Setup | Direct SSH commands, `scp` of deploy-redux.tar | No | *Excluded / Exclusively Lab CLI* | None | Out of dashboard scope. Dangerous if run on online systems. No live testing. |
| **new_feather_comms.sh**| Item 15 | **D** | Checks stability and firmware of Feather microcontrollers. | Read-Only Diagnostics | `/feather/status/report.json` (on direct module IPs) | Yes (Derived) | Network Interfaces / Comms Stability Tab | Medium | Direct diagnostic ping check. Safe tool. Live testing required on active line subnet configurations. |
| **new_local_notif.sh** | Item 16 | **B** | Lists and aggregates active warnings & faults. | Read-Only Diagnostics | `/tools/report/ems/array/{id}/notifications.json` | Yes | Warnings & Critical Faults Center | High | Safe Read-Only diagnostics. No live hardware testing required as the emsBlock cache holds standard fault arrays. |
| **new_mio_test.sh** | Item 17 | **D** | Inspects HVAC enclosure states, fans, stages, and MIO inputs. | Read-Only Diagnostics | `/feather/status/report.json` | Yes (Derived) | Enclosure Monitor / MIO Test Grid | Medium | Safe Read-Only environmental status interface. Live testing required to poll direct Feather IPs. |
| **new_simulate.sh** | Item 18 | **F** | Simulates digital and analog signals, testing thermal states. | Test Write | `/feather/simulate/commands` (on Feather IPs) | No | *Blocked / Disabled in UI* | None | **Simulated Input.** Excluded from client-facing UI to avoid corrupting telemetry logs. |
| **new_string_viewer.sh**| Item 19 | **B** | Complex visual metric table displaying delta voltages and temps. | Read-Only | `/tools/monitor/ems/stringviewer/array/{a}/{s}/data` | Yes (Derived) | String Viewer grid | High | **Safe Read-Only.** Reconstructed via `/api/local/strings` and `/api/local/arrays` cell blocks. No testing required.|
| `terminal_ui.sh` | Item 20 | **F** | Writes command registers setting EMS string fan speeds. | Operational Write | `tools/controls/ems/array/{a}/string/{s}/fanCtlAll/{speed}` | No | *Blocked / Disabled in UI* | None | **Thermal Control Write.** Blocked to prevent overheating damage. |
| `terminal_ui.sh` | Item 21-24 | **F** | Trigger and manage comprehensive EMS balancer sweeps. | Operational Write | `tools/report/ems/balancertest/trigger/...` | No | *Blocked / Disabled in UI* | None | **Control Write.** Blocked on client dashboard. |
| `new_bal_status.sh` | Item 25 | **C** | Diagnostic observer showing cell balancer sweep progress. | Read-Only | `/tools/report/ems/balancertest/status.json` | No | Auxiliary Diagnostics Tab (Read-Only Status Only) | Medium-Low | Safe Read-Only telemetry. Live validation of the balancertest endpoint will be performed when test link is operational. |
| `new_bal_analysis.sh`| Item 26 | **C** | Renders voltage summaries from previous balancer CSV test files. | Read-Only | `/tools/report/ems/balancertest/report.json?testID={id}`| No | Completed Balancer Run Report Viewer | Medium-Low | Safe analysis of completed balancer runs. Safe Read-Only. Live test required to parse raw report JSON returns. |
| `terminal_ui.sh` | Item 27-30 | **F** | Start/stop direct BMS balancer tests (high voltage). | Operational Write | `/tools/report/bms/balancertest/trigger/...` | No | *Blocked / Disabled in UI* | None | **Hazardous Write.** Directly fires high voltage BMS registers. Strict block. |
| `terminal_ui.sh` | Item 31-32 | **C**| Query BMS balancer logs and download CSV files. | Read-Only | `/tools/report/bms/balancertest/report.csv` | No | Historical Operations Tab | Medium-Low | Safe Read-Only telemetry. Requires isolated live validation when hardware link stabilizes. |
| `terminal_ui.sh` | Item 33-34 | **F** | Begin thermal heat soak test on specific segments. | Operational Write | `/tools/controls/ems/heatsoak/start/...` | No | *Blocked / Disabled in UI* | None | **Thermal Hazards.** Forced heat soak can cook enclosure electronics/cells. Strictly Locked. |
| `terminal_ui.sh` | Item 35 | **A** | Read general controller status JSON envelope.| Read-Only | `tools/report/ems/status.json` | Yes | Real-time Operations Center | High | Safe Read-Only. Live-tested & active. |
| `terminal_ui.sh` | Item 36 | **A** | Maps fault codes to human-readable strings. | Read-Only | `tools/report/ems/bessStatusCodes.json` | Yes | Alarm Event Decoder | High | Safe reference file registry. Live-tested and active. |
| `terminal_ui.sh` | Item 37 | **A** | Diagnostics metadata regarding LAN performance and drop ratios. | Read-Only | `tools/report/ems/controllerStatistics.json`| Yes | Diagnostic Stats Panel | High | Safe performance tracking file. Operational. |
| `terminal_ui.sh` | Item 38 | **A** | Displays timestamp records of last communications. | Read-Only | `tools/report/ems/lastCall.json` | Yes | Watchdog / Heartbeat Panel | High | Safe communications watchdog metrics. Active. |
| `terminal_ui.sh` | Item 39-42 | **B** | Renders notifications and alarms sorted per isolated array indexes. | Read-Only | `/tools/report/ems/array/{id}/report.json` | Yes | Array Explorer & Alarm Lists | High | Safe localized diagnostic datasets. Active. |
| `terminal_ui.sh` | Item 43 | **E** | Direct arbitrary TCP modbus read on remote port. | Read-Only Developer | `/tools/report/modbus/poll/tcp/...` | Yes (Via local map fallback) | Developer Interface Modbus Map / Registers | Medium | Read-only register check. Safe, but restricted poll intervals protect device bandwidth. Live-tested with maps. |
| `terminal_ui.sh` | Item 44 | **C** | Statistics tracker for array PCS systems. | Read-Only | `tools/report/ems/array/{id}/pcs/{id}/report.json`| No | Aux PCS Telemetry Dialog | Medium-Low | Safe Read-Only status tracker. Needs live validation path test for formatting accuracy. |
| `terminal_ui.sh` | Item 45 | **C** | Tracks AC Battery availability coefficients. | Read-Only | `tools/report/ems/acbattery/{id}/availability.json` | No | Availability Analytics Card | Medium-Low | Safe Read-Only calculations. Needs live validation once hardware link returns active. |
| `terminal_ui.sh` | Item 46 | **A** | Displays CSV matching battery string names with hardware IPs. | Read-Only | `tools/report/ems/stringIPMap.csv` | Yes | IP Routing Registry (Diagnostics Grid) | High | Static CSV reference sheet. Integrated. |
| `terminal_ui.sh` | Item 47 | **A** | Displays global controller hardware IP allocations. | Read-Only | `tools/report/ems/ipMap.csv` | Yes | Network Map / Topology | High | Static CSV reference sheet. Integrated. |
| `terminal_ui.sh` | Item 48 | **A** | Standard Modbus Register reference schema mapping. | Read-Only | `tools/report/ems/modbus_map.csv` | Yes | Register Schema Lookup | High | Static CSV reference sheet. Integrated. |
| `terminal_ui.sh` | Item 49 | **A** | Legacy static output listing strings data points. | Read-Only | `tools/report/ems/strings.csv` | Yes | Historical Data Explorer | High | CSV dump sheet. Integrated. |
| `new_url_builder.sh`| *N/A* | **H** | Command-line builder tool for constructing URL queries. | Read-Only Developer | Developer CLI | Yes (Via Native endpoints) | Main API Query Page | Medium-Low | Replaced by clean web-based filters and tables. No live testing. |
| `new_lineup_cc.sh` | *N/A* | **F** | Custom USA/Alt4 color controls for physical lightbars. | Test Write | `/tools/controls/ems/array/{a}/string/{s}/lightbarcommand` | No | *Blocked / Disabled in UI* | None | **Visual Device Write.** Blocked on production hardware panels to prevent signaling distraction. |
| `dependency_check.sh`| *N/A*| **G** | Checks Linux local operating dependencies for scripts. | System Check | Ubuntu apt-get validations | No | *N/A (Excluded)* | None | Out of scope. Exclusively managed on CLI runtime level. |
| `batch_conf_layout.sh`| *N/A*| **G** | Configures script boundaries in mass setups. | Configuration | Static file replaces | No | *N/A (Excluded)* | None | Out of scope. |
| `v3_simulate.sh` | *N/A* | **H** | Old multi-threaded simulation scripting engine. | Test Write | `/feather/simulate/commands` | No | *Blocked / Replaced* | None | Obsolete. Replaced by high-fidelity state simulation controls. Locked. |

---

## 3. Safety Architectural Guidelines

To maintain absolute software safety and hardware protection, the PRIZM web dashboard architecture adheres strictly to the following parameters:

1. **Exclusively Read-Only Control Plane**: Under no circumstances does the web application expose any forms, buttons, or custom requests to trigger write operations listed under **Classification Category F** (such as contactor triggers, rotate triggers, custom balancing patterns, speed overrides, or heat soaks). 
2. **Graceful Fail-Safe Offline Protection (Amber-Cache)**: In the event of primary hardware packet drops or routing network issues (e.g., EMS site controller `10.0.0.3` becoming offline/standby), the client dashboard automatically falls back from the production `live` telemetry line to the non-blocking `cached` offline buffer. This prevents system freezes, ensuring a non-disruptive, highly informative visual experience.
3. **No Terminal-Style Command Execution**: Technician panels are clean, modern, and high-fidelity, consisting of responsive grid cards, structured alarms, and cellular state views. No raw terminal overlays or interactive command shell emulators are exposed to client users.
