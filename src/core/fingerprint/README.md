# Fingerprint Service

The Fingerprint Service is a minimal, stateless Core utility for producing deterministic hashes from strings, raw bytes, and structured JSON-like values.

## Goals

- Deterministic hashing
- No persistence or filesystem access
- No domain-specific logic
- No runtime or framework coupling

## Supported inputs

- string
- Uint8Array
- ArrayBuffer
- structured JSON-like values

## Notes

- Object keys are sorted lexicographically before hashing.
- Arrays preserve order.
- Unsupported values are rejected with typed errors.
