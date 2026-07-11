# PRIZM Constitution

## 1. Purpose

This Constitution defines the engineering philosophy and architectural rules of PRIZM. It establishes the standards by which the platform is designed, reviewed, and evolved. It exists to preserve clarity, trust, and long-term maintainability across all layers of the system.

PRIZM is not a collection of isolated features. It is a coherent engineering platform whose architecture must remain explainable, modular, and durable.

## 2. Vision

PRIZM shall be a local-first, explainable, and domain-agnostic engineering platform for observing, interpreting, and reasoning about complex systems.

Its architecture shall favor:

- clarity over cleverness
- traceability over opacity
- modularity over entanglement
- evidence over assumption
- long-term maintainability over short-term convenience

## 3. Core Principles

PRIZM is governed by the following principles:

1. Local-first architecture
   - The platform shall be designed to operate effectively with local responsibility, local reasoning, and local control before depending on remote orchestration.
   - Local execution and local state shall remain the default model unless there is a compelling architectural reason otherwise.

2. Domain-agnostic Core
   - The Core layer shall remain platform-neutral and reusable across domains.
   - Core shall not encode domain-specific behavior, workflows, or product assumptions.

3. Registry owns object creation
   - Object creation shall be governed by the Registry rather than dispersed across the system.
   - The Registry shall be the authoritative place where object identity and registration are established.

4. Identity resolves identity
   - Identity is a distinct concern from object creation.
   - The Identity subsystem shall resolve, normalize, and validate identity claims without owning the lifecycle of objects.

5. Communication is event-driven
   - Cross-cutting coordination shall rely on event-driven communication where it improves decoupling and traceability.
   - Events shall express facts, transitions, and state changes without becoming the sole mechanism of domain logic.

6. Observations become evidence
   - The platform shall treat observations as the raw material of knowledge.
   - Observations shall be captured, classified, and retained in ways that support explainability.

7. Evidence supports immutable assertions
   - Assertions shall represent what the system believes.
   - Assertions shall be supported by evidence and shall remain traceable to their origin.
   - Assertions shall be treated as durable claims, not ephemeral inferences.

8. Relationships are derived
   - Relationships are not the primary units of knowledge.
   - The system shall derive relationships from assertions and supporting evidence rather than storing them as independent first-class facts.

9. Confidence is computed
   - Confidence shall be derived from evidence and supporting context rather than attached arbitrarily to relationships.
   - Confidence shall be explainable and auditable.

10. Explainability over cleverness
    - Architectural choices shall favor understandable models over sophisticated abstractions that obscure intent.
    - If a system cannot explain why it believes something, it is not yet complete.

11. Small reviewable pull requests
    - Change sets shall remain small, focused, and reviewable.
    - Large, multi-purpose changes shall be decomposed into understandable increments.

12. Every Core subsystem requires architecture approval before implementation
    - Core changes shall not be introduced casually.
    - Any new Core subsystem, model, or architectural abstraction shall require explicit architectural review before implementation begins.

## 4. Architectural Layers

PRIZM shall be organized in layers that preserve separation of concerns and dependency direction.

1. Presentation Layer
   - User-facing interfaces and interaction surfaces.
   - Responsible for rendering and user experience.

2. Runtime Layer
   - Operational coordination and execution concerns.
   - Responsible for integrating services and orchestrating behavior.

3. Intelligence Layer
   - Interpretation, reasoning, and derived understanding.
   - Responsible for turning observations and evidence into actionable knowledge.

4. Knowledge Layer
   - Assertion, provenance, confidence, and derived understanding.
   - Responsible for representing what the system believes and why.

5. Acquisition Layer
   - Intake of external facts, observations, imports, and system signals.
   - Responsible for translating raw input into structured evidence and claims.

6. Core Layer
   - Shared abstractions, infrastructure, and platform-neutral services.
   - The Core layer shall remain the most stable and reusable foundation of the system.

The dependency direction shall remain outward from Core toward higher-level layers. Higher-level layers may depend on lower-level layers, but Core shall not depend on product-specific implementations.

## 5. Responsibilities of each Core subsystem

Each Core subsystem shall have a clearly bounded responsibility.

### Models
   - Define shared types and semantic contracts.
   - Remain structural and minimal.
   - Avoid carrying business logic.

### Registry
   - Own object registration and lifecycle coordination for known objects.
   - Provide a stable authoritative registration boundary.
   - Avoid becoming a general-purpose knowledge store.

### Identity
   - Resolve, normalize, and compare identity-like values.
   - Remain stateless and deterministic.
   - Do not own object creation.

### Events
   - Provide a generic event transport and dispatch mechanism.
   - Enable decoupled communication without embedding domain semantics.
   - Remain independent of runtime-specific concerns.

### Fingerprint
   - Provide deterministic hashing and canonicalization for arbitrary values.
   - Serve as a utility for identity, comparison, provenance, and content analysis.
   - Remain stateless and domain-agnostic.

### Graph and Assertion Engine
   - Represent knowledge through assertions, evidence, confidence, and provenance.
   - Preserve explainability and traceability.
   - Derive relationships from stored knowledge rather than treating relationships as primary facts.

### Persistence and Versioning
   - Provide storage and versioning abstractions without enforcing product-specific semantics.
   - Preserve compatibility and traceability across evolution.

## 6. Engineering Rules

The following rules shall govern implementation decisions:

1. Favor simplicity
   - Prefer explicit, understandable designs over abstract or over-generalized ones.

2. Keep boundaries clean
   - Each subsystem shall have a narrow and well-defined purpose.
   - Cross-subsystem coupling shall be deliberate and minimal.

3. Preserve determinism where possible
   - Services that compute identity, fingerprints, or derived state shall behave deterministically.

4. Keep Core domain-agnostic
   - Core shall not import or encode product-specific modules, platform-specific assumptions, or domain workflows.

5. Make knowledge explainable
   - Every important claim shall be traceable to evidence and provenance.

6. Avoid hidden state
   - Stateless services shall be preferred for pure computation and normalization.
   - Stateful behavior shall be explicit and encapsulated.

7. Use events for coordination, not for hiding structure
   - Events shall communicate changes and transitions, but they shall not replace well-defined interfaces and responsibilities.

8. Prefer reversible and reviewable changes
   - Design changes shall be easy to understand, reason about, and revert if necessary.

9. Do not overfit the architecture to one product domain
   - The system shall remain suitable for future adaptation and reuse.

## 7. Definition of Done

A change is complete only when all of the following conditions are met:

1. The change satisfies the stated requirement.
2. The change aligns with the architectural principles set forth in this Constitution.
3. The change preserves separation of concerns.
4. The change is understandable to a reviewer without hidden assumptions.
5. The change is testable or otherwise verifiable.
6. The change does not introduce unnecessary coupling to a specific domain.
7. The change is documented where architecture or behavior would otherwise be unclear.

## 8. Code Review Requirements

All changes shall be reviewed with the standards of this Constitution in mind.

Reviewers shall verify that:

- the change is small and reviewable
- the intent is clear
- the design is consistent with Core principles
- the change does not violate architectural boundaries
- the change is explainable and traceable
- the change does not introduce hidden complexity

Pull requests shall be structured so that reviewers can understand the rationale, scope, and impact with reasonable effort.

## 9. ADR Process

Significant architectural decisions shall be recorded through an Architecture Decision Record (ADR) process.

Each ADR shall:

1. Describe the decision to be made.
2. State the context and constraints.
3. Present the options considered.
4. Explain the chosen approach.
5. Identify consequences, tradeoffs, and risks.
6. Note any future reconsideration points.

Architecture approval is required before implementation of new Core subsystems or materially new architectural abstractions.

## 10. Future Evolution

PRIZM shall evolve through disciplined architectural growth.

Future changes shall preserve the following commitments:

- maintain a domain-agnostic Core
- preserve explainability and traceability
- keep knowledge representation evidence-based
- avoid over-centralizing logic in one subsystem
- continue refining clarity over complexity

The Constitution shall be revised when the platform’s architecture materially changes, when new subsystems are introduced, or when the principles above cease to serve the platform’s long-term intent.
