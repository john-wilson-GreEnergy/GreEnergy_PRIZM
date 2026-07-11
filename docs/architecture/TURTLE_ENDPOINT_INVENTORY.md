# PR-0015 Turtle Endpoint Inventory

This document is the human-readable companion to:
- docs/architecture/turtle-endpoints.csv
- docs/architecture/turtle-endpoints.json

It captures high-confidence Turtle WAR endpoints relevant to PRIZM data acquisition and safety governance.

## Scope
- Source: Turtle WAR investigation (controllers, JSP URL templates, and monitor/report client assets).
- Included: high-confidence endpoints or endpoint families relevant to PRIZM telemetry, diagnostics, and endpoint safety controls.
- Excluded: low-confidence strings with no route context.

## Field Schema
Each record includes:
- method
- route
- category
- sourceClassOrFile
- responseType
- requiredParameters
- readOnly
- riskClass
- currentStatus
- usedByPrizm
- recommendedUse
- migrationPriority
- confidence
- notes

## Risk Class Definitions
- safe-read: Read-only route suitable for automatic polling, subject to normal rate and timeout controls.
- diagnostic-read: Read-only route intended for targeted diagnostics, not continuous high-rate polling.
- control-write: Route family capable of mutating runtime state (controls, reset, balancing, contactors, fan/lightbar, command injection).
- configuration-write: Route family capable of changing persistent or semi-persistent configuration (firmware/version pushes, addressing changes).
- unknown: Insufficient confidence on mutability from static evidence.

## Unsafe Auto-Polling Rule
The following must never be auto-called by PRIZM polling jobs:
- /tools/controls/ems/*
- /tools/controls/bms/*
- /tools/control/bms/stringxfer/*
- /tools/controls/*/string/firmware/*
- /tools/report/ems/balancertest/*
- /tools/controls/ems/command

These endpoints include control, reset, firmware, contactor, fan, balancing, and command operations.

## Recommended Migration Order
1. Priority 1: Add read-only notifications endpoints.
- /tools/report/ems/array/{arrayIndex}/notifications.json
- /tools/report/ems/array/{arrayIndex}/string/{stringIndex}/notifications.json

2. Priority 2: Add targeted stringviewer enrichment route.
- /tools/monitor/ems/stringviewer/array/{arrayIndex}/{stringIndex}/data

3. Priority 3: Optional detail/coverage routes for specific features.
- /tools/report/ems/array/{arrayIndex}/string/{stringIndex}/report.json
- /tools/report/ems/acbattery/{acBatteryIndex}/availability.json

4. Priority 4: Keep current core polling backbone as-is.
- status, blockviewer, strings.csv, lastCall, controllerStatistics, IP maps, modbus maps, firstresponder data.

5. Priority 5: Manual-only or unsafe namespaces.
- Modbus ad-hoc poll tools, balancer tests, control and configuration namespaces.

## Current PRIZM Usage Notes
The artifacts explicitly flag usedByPrizm=true for routes already present in current acquisition/polling flow, including status, blockviewer, strings, maps, responder, and modbus map routes.

## Validation
CSV and JSON are intended to be parse-clean and machine-ingestible for planning, scripting, and downstream governance checks.
