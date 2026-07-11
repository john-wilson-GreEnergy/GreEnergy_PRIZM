# Agent Instructions

This file defines how contributors and AI coding agents should work within PRIZM.

## Operating principles

- Follow the Constitution and ADRs before implementing new architecture.
- Keep changes scoped, reviewable, and explainable.
- Preserve a domain-agnostic Core.
- Treat knowledge as evidence-backed and traceable.
- Prefer small, clear changes over broad rewrites.

## Before implementation

- Confirm the architectural intent.
- Check whether the work affects Core or architecture boundaries.
- If a new Core subsystem is involved, seek architecture approval first.

## During implementation

- Keep the solution aligned with the existing architecture.
- Avoid introducing domain-specific logic into Core.
- Preserve determinism, clarity, and local-first behavior where appropriate.
- Keep interfaces and responsibilities explicit.

## Before completion

- Verify the relevant diagnostics or build steps.
- Review the change for architectural fit and maintainability.
- Ensure the work is ready for human review.

## Preferred collaboration style

- Prefer concise, concrete changes.
- Document significant architectural choices.
- Do not hide complexity behind unnecessary abstraction.
- Make reasoning and evidence visible.
