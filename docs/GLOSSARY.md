# PRIZM Glossary

This glossary defines the core vocabulary of PRIZM as an engineering knowledge platform. These terms are intended to be used consistently across architecture, implementation, and documentation.

## Observation

An observation is a recorded fact, signal, or perception that enters the system. It is the most basic unit of input and may come from a sensor, import, report, user entry, or other source. Observations are not yet conclusions; they are raw material for knowledge.

## Evidence

Evidence is the support that explains why a claim is believed. Evidence may be structured, contextual, or traceable and is attached to assertions to provide justification. Evidence is what makes a belief explainable.

## Assertion

An assertion is a durable claim about the world that the system believes to be true, pending review or revision. Assertions are supported by evidence, carry provenance, and may later be superseded or challenged. They are the core representation of knowledge in PRIZM.

## Relationship

A relationship is a semantic connection between entities that is derived from one or more assertions. Relationships are not treated as primary facts in the architecture; they are interpreted views of the underlying knowledge model.

## Entity

An entity is a canonical object known to the platform. Entities may represent physical, logical, or informational things such as equipment, documents, controllers, sites, or people. Entities are the subjects and objects referenced by assertions.

## Identity

Identity is the resolved recognition of an entity or value as a specific thing within the system. Identity is a distinct concern from object creation and is used to determine whether two references refer to the same underlying entity.

## Registry

The Registry is the authoritative boundary for object registration. It owns the creation and lifecycle responsibility for known objects so that object identity remains consistent across the platform.

## Fingerprint

A fingerprint is a deterministic digest of data, content, or structure. It is used to compare, hash, and identify information in a stable and repeatable way. Fingerprints are not substitutes for identity, but they can support identity-related and content-related workflows.

## Provenance

Provenance is the lineage of a claim or artifact. It answers the question: where did this knowledge come from, and how did it arrive here? Provenance preserves the chain of origin that supports trust and explainability.

## Confidence

Confidence is the degree of support assigned to a belief based on evidence, context, and consistency. Confidence is computed from evidence rather than attached arbitrarily to a relationship. It is part of the system’s reasoning model, not a decorative label.

## Site Profile

A Site Profile is a structured representation of a site’s relevant characteristics, context, and known entities. It is used to ground local understanding of a site without collapsing that understanding into a single static record.

## Engineering Passport

An Engineering Passport is a traceable, structured representation of an entity’s known engineering context, history, and supporting evidence. It is a knowledge-oriented view designed to make claims and provenance understandable over time.

## Knowledge

Knowledge is the organized understanding that emerges when observations, evidence, assertions, and provenance are combined into a coherent model. Knowledge is not merely stored information; it is interpreted and explainable understanding.

## Acquisition

Acquisition is the process of bringing raw input into the platform. It includes ingestion, normalization, interpretation, and transformation into evidence and knowledge. Acquisition is how the system learns from the outside world.

## Query

A query is a structured request for information, interpretation, or evidence from the knowledge system. Queries are how users and subsystems ask the platform to retrieve or reason about what is known.

## Projection

A projection is a derived view of the knowledge graph or system state. It presents information in a form suited to a specific purpose, such as a dashboard, analysis, or workflow, without changing the underlying knowledge model itself.
