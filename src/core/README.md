# PRIZM Core

PRIZM Core provides the shared architectural foundation for the PRIZM system.

## Purpose

This layer is intended to host platform-neutral abstractions, shared contracts, and foundational services that other PRIZM layers can depend on.

## Dependency Rule

The intended dependency direction is:

- UI -> Runtime -> Intelligence -> Knowledge -> Acquisition -> Core

In other words, higher-level layers may depend on lower-level foundational layers, while Core remains the most general and stable foundation.

## Design Constraints

Core must remain domain agnostic and must not import BESS-specific modules. It should only define abstractions and infrastructure that are reusable across domains.
