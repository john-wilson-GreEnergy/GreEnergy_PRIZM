# AGENTS.md
# GreEnergy PRIZM Engineering Constitution
Version: 1.0
Owner: GreEnergy Resources LLC

---

# PROJECT MISSION

GreEnergy PRIZM exists to become the definitive local engineering platform for utility-scale Battery Energy Storage Systems (BESS).

PRIZM is NOT intended to replicate a cloud dashboard.

PRIZM is intended to exceed cloud functionality while remaining completely local, deterministic, secure, and operator-focused.

The application must continue functioning without internet connectivity.

No feature should ever require cloud connectivity.

---

# PRIMARY DESIGN GOALS

Every engineering decision should improve one or more of:

• Reliability
• Determinism
• Maintainability
• Operator Efficiency
• Safety
• Data Accuracy
• Offline Capability

Never optimize for novelty.

Optimize for field usability.

---

# PROJECT PHILOSOPHY

PRIZM is a platform.

Not a dashboard.

Not a collection of scripts.

Not a React application.

Not an EMS replacement.

PRIZM is the operational intelligence layer sitting above EMS.

---

# CORE ARCHITECTURE

Telemetry Sources

    EMS Turtle
    Feather Controllers
    First Responder
    Modbus
    Future devices

↓

Telemetry Providers

↓

Telemetry Broker

↓

Authority Resolution

↓

Canonical Models

↓

API Routes

↓

UI

Every UI component should consume canonical telemetry.

Never raw device payloads.

---

# GOLDEN RULE

There must be ONE canonical source for every type of information.

Never allow:

UI A reading Turtle

while

UI B reads Feather

for the same data.

Authority is always explicit.

---

# TELEMETRY AUTHORITY

Current preferred sources:

Controller Health
    Turtle

String Telemetry
    Turtle

HVAC
    Feather

Notifications
    Turtle

Safety
    First Responder

Modbus Registers
    Modbus

Future providers may exist.

Authority determines which one wins.

---

# PROVIDER RULES

Providers ONLY:

Acquire data

Normalize data

Report health

Report freshness

Never perform business logic.

Never modify UI models.

---

# TELEMETRY BROKER

The Broker is responsible for:

Provider registration

Snapshot collection

Freshness

Fallback

Authority selection

Health

No route should implement telemetry selection itself.

---

# ROUTE RULES

Routes should only:

Request canonical snapshot

Return API response

Nothing more.

Never perform:

polling

device acquisition

authority decisions

large normalization

business rules

---

# UI RULES

UI never:

talks to Turtle

talks to Feather

talks to Modbus

parses raw payloads

implements calculations

Everything comes from server APIs.

---

# OFFLINE FIRST

PRIZM must operate:

without internet

without cloud APIs

without external authentication

inside secured utility networks

inside NERC environments

Everything should remain functional locally.

---

# SECURITY

Never introduce:

automatic writes

configuration changes

firmware updates

controller commands

unless explicitly requested.

Default behavior is READ ONLY.

Diagnostics are read-only.

Verification is read-only.

---

# FEATURE FLAGS

Every migration should include rollback.

Preferred methods:

Environment variable

Query parameter

Authority fallback

Never remove legacy code until parity has been proven.

---

# MIGRATION STRATEGY

Every migration follows:

Legacy

↓

Hybrid

↓

Parity

↓

Validation

↓

Production

↓

Legacy Removal

Never skip Hybrid.

---

# VALIDATION REQUIREMENTS

Every migration requires:

Unit tests

Build success

Fresh server restart

Live endpoint verification

Parity report

Rollback verification

No exceptions.

---

# LIVE VALIDATION

Whenever hardware is available:

Verify against live controllers.

Never assume payload structure.

Never trust documentation over actual devices.

Live devices are authoritative.

---

# TESTING

Every new module requires:

Focused tests

Regression tests

Build verification

Live verification when possible

No feature is complete until validated.

---

# ERROR HANDLING

Always degrade gracefully.

If provider unavailable:

fallback

mark stale

preserve previous snapshot

never crash UI

---

# LOGGING

Prefer structured logging.

Every acquisition should expose:

source

endpoint

latency

status

freshness

errors

---

# FILE ORGANIZATION

Preferred architecture:

src/

    core/

    telemetry/

        providers/

        broker/

        authority/

    server/

    routes/

    ui/

Avoid dumping unrelated utilities into root folders.

---

# CODE STYLE

Prefer:

small files

small functions

explicit typing

pure functions

composition

Avoid:

deep inheritance

giant switch statements

duplicated logic

---

# TYPESCRIPT

Strict typing.

Avoid:

any

implicit coercion

duplicated interfaces

Prefer shared canonical models.

---

# PERFORMANCE

Polling should be centralized.

Never poll inside UI.

Never poll inside components.

Never duplicate polling.

Cache intelligently.

---

# DATA OWNERSHIP

Raw payloads remain available for debugging.

Canonical models power the application.

Never expose raw payloads to UI by default.

---

# DEVICE SUPPORT

Current:

Powin EMS

Feather

First Responder

Modbus

Future:

PCS

HVAC vendors

Fire systems

UPS

Weather

Historian

SCADA

Design for extension.

---

# UI PRINCIPLES

Daylight readable.

Operator friendly.

Minimal clicks.

Fast.

Dense information.

Never sacrifice usability for appearance.

---

# SAFETY

Never hide:

faults

alarms

critical warnings

Safety information always takes priority.

---

# FUTURE MODULES

Fleet Management

Predictive Maintenance

Battery Analytics

Thermal Analytics

Trending

Commissioning

Capacity Testing

Network Diagnostics

Asset Health

Cybersecurity

Work Orders

Digital Twin

Historical Replay

Machine Learning

Everything should fit existing architecture.

---

# DOCUMENTATION

Every major subsystem should include documentation.

Architecture first.

Implementation second.

---

# GIT

Small commits.

Clear commit messages.

Feature branches preferred.

Never commit generated artifacts.

Never commit runtime caches.

Never commit profile history.

---

# ENGINEERING PRINCIPLE

If two implementations exist:

choose the one that is

more deterministic,

more maintainable,

more testable,

and easier for the next engineer to understand.

---

# FINAL RULE

Every line of code should make PRIZM a better engineering platform.

Not merely a larger codebase.