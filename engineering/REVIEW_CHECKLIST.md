# Review Checklist

Use this checklist when reviewing PRIZM changes.

## Architecture

- Does the change align with the Constitution and relevant ADRs?
- Does it preserve the intended architectural boundaries?
- Does it avoid unnecessary coupling or domain leakage?
- If it touches Core, does it remain domain-agnostic?

## Correctness

- Does the implementation satisfy the stated requirement?
- Are edge cases handled explicitly?
- Are failures and invalid states handled clearly?

## Maintainability

- Is the change small and reviewable?
- Is the logic understandable without hidden context?
- Are abstractions justified and minimal?

## Knowledge and explainability

- If the change affects knowledge representation, is provenance preserved?
- If confidence is involved, is it computed and explained clearly?
- Are assertions and evidence kept distinct from raw observations?

## Verification

- Has the change been verified with relevant diagnostics or build steps?
- Are there tests or checks where appropriate?
- Are risks and tradeoffs documented clearly?
