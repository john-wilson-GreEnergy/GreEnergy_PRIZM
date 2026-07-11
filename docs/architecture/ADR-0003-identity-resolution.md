# ADR-0003: Identity Resolution as a Dedicated Concern

## Status

Accepted

## Context

Identity is often conflated with object creation or with domain-specific business logic. This creates ambiguity when the same object is observed through different names, aliases, or representations. Without a dedicated identity mechanism, the system becomes vulnerable to inconsistent resolution and duplicated interpretation.

The architecture needs a clear boundary for understanding what an identity refers to.

## Decision

Identity resolution shall be treated as a distinct architectural concern. The Identity subsystem shall normalize, compare, and resolve identity-like values without owning the lifecycle of objects or embedding domain-specific behavior.

This decision separates identity from creation, ensuring that identity is a reusable service concern rather than an incidental side effect of other subsystems.

## Rationale

This approach was selected because identity is a cross-cutting concern that should be governed by explicit rules rather than distributed assumptions. By giving identity resolution a dedicated architectural home, the platform can handle aliases, normalization, and matching consistently across subsystems without overloading object lifecycle or domain logic.

## Consequences

Positive impacts:

- Improves consistency in record matching and reference interpretation.
- Keeps identity logic reusable across multiple subsystems.
- Reduces ambiguity when objects are represented by different labels or forms.

Tradeoffs:

- Requires careful definition of canonical identity behavior.
- May need refinement as new forms of identity are introduced.

Future considerations:

- Define how identity resolution interacts with provenance and evidence.
- Establish policies for ambiguous or conflicting matches.
