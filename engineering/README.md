# Engineering Guide

This folder defines how PRIZM itself is engineered. It exists to keep the platform coherent, reviewable, and aligned with the architecture principles established in the Constitution and ADRs.

## Scope

These documents describe:

- how work is planned and executed
- how code and architecture changes are reviewed
- how contributors and AI agents should operate
- how architectural decisions are captured and approved

## Core expectations

- Prefer clarity over cleverness.
- Keep changes small and reviewable.
- Preserve a domain-agnostic Core.
- Treat knowledge as evidence-backed and explainable.
- Require architecture approval for new Core subsystems.

## Working principles

- Local-first where possible.
- Event-driven for coordination.
- Deterministic and explainable for shared services.
- Evidence-based for knowledge representation.
- Minimal, maintainable abstractions over broad, opaque ones.

## Document map

- [WORKFLOW.md](WORKFLOW.md) — how work moves from request to merge
- [CODING_STANDARDS.md](CODING_STANDARDS.md) — coding expectations and style
- [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md) — what reviewers must verify
- [PR_TEMPLATE.md](PR_TEMPLATE.md) — pull request structure
- [RFC_TEMPLATE.md](RFC_TEMPLATE.md) — request for comments template
- [ADR_TEMPLATE.md](ADR_TEMPLATE.md) — architecture decision record template
- [AGENTS.md](AGENTS.md) — instructions for contributors and AI agents
