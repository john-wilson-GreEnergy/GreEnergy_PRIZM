# ADR-0004: Immutable Assertions Supported by Evidence

## Status

Accepted

## Context

Many systems blur the line between observation, interpretation, and belief. When facts are mutable without provenance, the platform loses trustworthiness and becomes difficult to audit. This is especially problematic in engineering contexts where evidence and interpretation must remain traceable over time.

The architecture needs a durable representation of what the system believes and why.

## Decision

PRIZM shall represent knowledge through immutable assertions supported by evidence. An assertion shall capture a belief as a durable claim, while evidence shall explain why that claim exists. Assertions shall not be treated as ephemeral convenience values; they shall be versioned, traceable, and auditable.

This decision establishes that knowledge is expressed as evidence-backed assertions rather than mutable relationship records.

## Rationale

This approach was selected because engineering knowledge must remain trustworthy, explainable, and auditable over time. Immutable assertions provide a durable way to represent beliefs while preserving the evidence and provenance that justify them. This makes the system more robust to change and more suitable for long-lived knowledge management.

## Consequences

Positive impacts:

- Improves explainability and traceability.
- Supports stronger auditing and historical review.
- Makes the knowledge model more robust over time.

Tradeoffs:

- Requires explicit versioning and lifecycle handling.
- May introduce more structure than simple mutable relationships.

Future considerations:

- Define how assertions are superseded or invalidated.
- Clarify how conflicting assertions are represented and resolved.
