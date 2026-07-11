# ADR-0002: Registry Ownership of Object Creation

## Status

Accepted

## Context

Without a clear ownership boundary, object creation can become scattered across subsystems. This weakens identity consistency, complicates lifecycle management, and makes it harder to reason about what is authoritative in the system.

The platform needs a single architectural responsibility for establishing the existence of known objects.

## Decision

The Registry shall own object creation. The Registry is the authoritative boundary for registering canonical objects and establishing their presence within the platform.

Other subsystems may observe, reference, or enrich objects, but they shall not independently claim ownership of object creation. This keeps object lifecycle management centralized and understandable.

## Rationale

This approach was selected because a single ownership boundary for object creation reduces ambiguity and prevents lifecycle logic from spreading across the platform. Centralizing registration makes the system easier to reason about, easier to audit, and more consistent when identity, events, and knowledge services operate on the same objects.

## Consequences

Positive impacts:

- Creates a clear ownership model for object lifecycle.
- Improves consistency across identity, eventing, and downstream reasoning.
- Reduces duplicated or conflicting object registration logic.

Tradeoffs:

- Requires discipline so other subsystems do not bypass the Registry.
- May introduce coordination overhead when new object types are introduced.

Future considerations:

- Define how the Registry interacts with event subscriptions and external ingestion paths.
- Clarify how object updates and supersession are represented over time.
