# Engineering Workflow

This workflow governs how PRIZM changes are proposed, reviewed, and accepted.

## 1. Start from the architecture

Before implementation, confirm that the proposed work aligns with:

- the Constitution
- relevant ADRs
- the current roadmap and vision

If the work introduces a new Core subsystem, an architectural review is required before implementation begins.

## 2. Keep scope narrow

Prefer changes that:

- solve one problem clearly
- stay within one subsystem when possible
- remain small enough for review

Avoid broad rewrites or mixed-purpose changes.

## 3. Implement with discipline

Follow the standards in this engineering package. Keep the implementation:

- deterministic where appropriate
- stateless unless state is necessary
- domain-agnostic in Core
- explainable in behavior and structure

## 4. Verify before completion

Before considering work complete, verify:

- diagnostics are clean for the touched files
- the relevant build or test command succeeds
- the change behaves as intended
- the change does not introduce avoidable coupling

## 5. Prepare for review

A change is review-ready when it includes:

- a clear summary of intent
- a concise explanation of architecture impact
- any relevant risks or tradeoffs
- evidence of verification

## 6. Review and merge

Reviews should focus on:

- correctness
- architectural fit
- maintainability
- clarity
- evidence and traceability

Changes that affect architecture, Core, or knowledge semantics should be reviewed especially carefully.
