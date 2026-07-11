# Coding Standards

These standards apply to PRIZM implementation work and are intended to keep the platform coherent and maintainable.

## General principles

- Prefer explicit code over clever abstractions.
- Favor small, focused modules with a single responsibility.
- Keep Core logic domain-agnostic and reusable.
- Preserve explainability in behavior and interfaces.
- Avoid hidden state unless it is necessary and well-contained.

## Structure

- Organize code by architectural responsibility.
- Keep related logic close to the subsystem that owns it.
- Avoid cross-cutting domain logic scattered across unrelated modules.

## Naming

- Use clear, descriptive names.
- Prefer names that reflect architectural meaning rather than implementation whim.
- Avoid abbreviations that reduce clarity.

## Types and interfaces

- Prefer explicit types over implicit any-style behavior.
- Keep interfaces narrow and purposeful.
- Model shared contracts carefully, especially in Core.

## Error handling

- Make failures explicit and typed where practical.
- Avoid silent fallback behavior for invalid inputs.
- Preserve traceability for important operations.

## Knowledge and evidence

- Do not treat derived conclusions as fact without provenance.
- Preserve evidence and lineage where the system reasons about beliefs or assertions.
- Keep confidence and reasoning explainable.

## Core boundaries

- Do not introduce domain-specific logic into Core.
- Do not import product-specific modules into Core abstractions.
- Do not let runtime concerns leak into foundational services.

## Review readiness

Code should be understandable in isolation and should not require hidden context to review.
